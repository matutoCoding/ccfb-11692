import { gridStats, gridToMap } from '../core/grid';
import { rampToLUT } from '../core/colorRamp';
import { TerrainRenderer, TerrainStyle } from './terrainRenderer';
import { getContours } from './mapView';
import { MapProject } from '../types';

export const PAPER_MM: Record<string, [number, number]> = {
  A3: [420, 297],
  A4: [297, 210],
  A5: [210, 148],
};

export interface ExportResult {
  blob: Blob;
  widthPx: number;
  heightPx: number;
  /** 实际采用的比例尺分母（纸张放不下整个范围时会放大） */
  usedScale: number;
}

/**
 * 按比例尺与纸张大小渲染整幅地图为 PNG。
 * 比例尺定义：纸上 1 单位 = 实地 scale 单位；1px = 25.4/dpi mm。
 */
export async function exportPng(project: MapProject): Promise<ExportResult> {
  const g = project.grid;
  if (!g) throw new Error('当前地图没有高程数据');
  const es = project.exportSettings;
  const [pw0, ph0] = PAPER_MM[es.paper];
  const [pw, ph] = es.orientation === 'landscape' ? [pw0, ph0] : [ph0, pw0];
  const widthPx = Math.round((pw / 25.4) * es.dpi);
  const heightPx = Math.round((ph / 25.4) * es.dpi);

  // 整个网格范围（米）
  const gw = (g.cols - 1) * g.cellSize;
  const gh = (g.rows - 1) * g.cellSize;
  // 目标比例尺下每像素对应米数
  let metersPerPx = (es.scale * 0.0254) / es.dpi;
  // 若整幅图按目标比例尺超出纸张，则自动调整比例尺以适配
  const needW = gw / metersPerPx;
  const needH = gh / metersPerPx;
  let usedScale = es.scale;
  if (needW > widthPx || needH > heightPx) {
    const fitMpp = Math.max(gw / widthPx, gh / heightPx);
    metersPerPx = fitMpp;
    usedScale = Math.round((fitMpp * es.dpi) / 0.0254);
  }
  const viewW = widthPx * metersPerPx;
  const viewH = heightPx * metersPerPx;
  const viewMinX = g.x0 + gw / 2 - viewW / 2;
  const viewMinY = g.y0 + gh / 2 - viewH / 2;

  // 1) WebGL 地形层（离屏）
  const glCanvas = document.createElement('canvas');
  glCanvas.width = widthPx;
  glCanvas.height = heightPx;
  glCanvas.style.width = `${widthPx}px`;
  glCanvas.style.height = `${heightPx}px`;
  const renderer = new TerrainRenderer(glCanvas);
  if (!renderer.supported) throw new Error('当前浏览器不支持 WebGL2，无法出图');
  const st = gridStats(g);
  renderer.setGrid(g);
  renderer.setRamp(rampToLUT(project.tint.stops, st.min, st.max));
  const style: TerrainStyle = {
    lights: project.shade.lights,
    ambient: project.shade.ambient,
    vertEx: project.shade.vertEx,
    shadeEnabled: project.shade.enabled,
    tintEnabled: project.tint.enabled,
    zMin: st.min,
    zMax: st.max,
  };
  renderer.render(style, [viewMinX, viewMinY], [viewW, viewH]);

  // 2) 合成到 2D 画布并绘制矢量要素
  const out = document.createElement('canvas');
  out.width = widthPx;
  out.height = heightPx;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.drawImage(glCanvas, 0, 0, widthPx, heightPx);

  const toPx = (mx: number, my: number): [number, number] => [
    (mx - viewMinX) / metersPerPx,
    heightPx - (my - viewMinY) / metersPerPx,
  ];
  // 线宽随 DPI 缩放（以 96dpi 屏幕为基准）
  const lwScale = es.dpi / 96;

  if (es.showContours && project.contours.enabled) {
    const lines = getContours(project);
    const idxEvery = Math.max(1, project.contours.indexEvery);
    for (const line of lines) {
      const isIndex = Math.round(line.level / project.contours.interval) % idxEvery === 0;
      ctx.beginPath();
      line.points.forEach(([gi, gj], k) => {
        const [mx, my] = gridToMap(g, gi, gj);
        const [px, py] = toPx(mx, my);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      if (line.closed) ctx.closePath();
      ctx.strokeStyle = isIndex ? project.contours.indexColor : project.contours.normalColor;
      ctx.lineWidth = (isIndex ? project.contours.indexWidth : project.contours.normalWidth) * lwScale;
      ctx.stroke();
    }
    // 计曲线注记
    if (project.contours.labelsEnabled) {
      const labelEveryPx = 260 * lwScale;
      ctx.font = `${project.contours.labelSize * lwScale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const line of lines) {
        const isIndex = Math.round(line.level / project.contours.interval) % idxEvery === 0;
        if (!isIndex) continue;
        const pts = line.points.map(([gi, gj]) => {
          const [mx, my] = gridToMap(g, gi, gj);
          return toPx(mx, my);
        });
        let acc = 0;
        let nextLabel = labelEveryPx / 2;
        for (let k = 0; k + 1 < pts.length; k++) {
          const [x0, y0] = pts[k];
          const [x1, y1] = pts[k + 1];
          const segLen = Math.hypot(x1 - x0, y1 - y0);
          while (acc + segLen >= nextLabel) {
            const t = (nextLabel - acc) / segLen;
            const lx = x0 + (x1 - x0) * t;
            const ly = y0 + (y1 - y0) * t;
            if (lx > 30 && ly > 30 && lx < widthPx - 30 && ly < heightPx - 30) {
              const ang = Math.atan2(y1 - y0, x1 - x0);
              ctx.save();
              ctx.translate(lx, ly);
              ctx.rotate(Math.abs(ang) > Math.PI / 2 ? ang + Math.PI : ang);
              ctx.lineWidth = 3 * lwScale;
              ctx.strokeStyle = 'rgba(255,255,255,0.85)';
              ctx.strokeText(String(Math.round(line.level)), 0, 0);
              ctx.fillStyle = project.contours.labelColor;
              ctx.fillText(String(Math.round(line.level)), 0, 0);
              ctx.restore();
            }
            nextLabel += labelEveryPx;
          }
          acc += segLen;
        }
      }
    }
  }

  if (es.showRoutes) {
    for (const r of project.routes) {
      if (r.points.length < 2) continue;
      ctx.beginPath();
      r.points.forEach(([mx, my], k) => {
        const [px, py] = toPx(mx, my);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.5 * lwScale;
      ctx.stroke();
    }
  }

  const margin = 24 * lwScale;

  if (es.showScaleBar) {
    const targetPx = 120 * lwScale;
    const meters = targetPx * metersPerPx;
    const pow = Math.pow(10, Math.floor(Math.log10(meters)));
    const nice = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= meters) ?? 10 * pow;
    const barPx = nice / metersPerPx;
    const x0 = margin;
    const y0 = heightPx - margin;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(x0 - 8 * lwScale, y0 - 22 * lwScale, barPx + 16 * lwScale, 34 * lwScale);
    ctx.fillStyle = '#111';
    ctx.fillRect(x0, y0, barPx, 5 * lwScale);
    ctx.clearRect(x0 + barPx / 2, y0, barPx / 2, 5 * lwScale);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = lwScale;
    ctx.strokeRect(x0, y0, barPx, 5 * lwScale);
    ctx.font = `${12 * lwScale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#111';
    ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, x0 + barPx / 2, y0 - 8 * lwScale);
    ctx.textAlign = 'left';
    ctx.fillText(`1:${usedScale}`, x0, y0 + 20 * lwScale);
  }

  if (es.showNorthArrow) {
    const nx = widthPx - margin - 10 * lwScale;
    const ny = margin + 20 * lwScale;
    ctx.save();
    ctx.translate(nx, ny);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(0, -16 * lwScale);
    ctx.lineTo(7 * lwScale, 10 * lwScale);
    ctx.lineTo(0, 4 * lwScale);
    ctx.lineTo(-7 * lwScale, 10 * lwScale);
    ctx.closePath();
    ctx.fill();
    ctx.font = `bold ${13 * lwScale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -22 * lwScale);
    ctx.restore();
  }

  const title = es.title || project.name;
  if (title) {
    ctx.font = `bold ${18 * lwScale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const tw = ctx.measureText(title).width;
    ctx.fillRect(widthPx / 2 - tw / 2 - 10 * lwScale, margin - 16 * lwScale, tw + 20 * lwScale, 28 * lwScale);
    ctx.fillStyle = '#111';
    ctx.fillText(title, widthPx / 2, margin + 4 * lwScale);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))), 'image/png');
  });
  return { blob, widthPx, heightPx, usedScale };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
