import { ElevationGrid, gridToMap, gridStats } from '../core/grid';
import { traceContours, levelSequence, ContourLine } from '../core/marchingSquares';
import { rampToLUT } from '../core/colorRamp';
import { TerrainRenderer, TerrainStyle } from './terrainRenderer';
import { MapProject } from '../types';

export interface ViewState {
  /** 视图中心（地图米） */
  cx: number;
  cy: number;
  /** 像素/米 */
  scale: number;
}

/** 等高线计算缓存：按 项目id+间距+网格版本 缓存 */
const contourCache = new Map<string, ContourLine[]>();

export function invalidateContourCache(projectId?: string) {
  if (!projectId) { contourCache.clear(); return; }
  for (const k of contourCache.keys()) if (k.startsWith(projectId)) contourCache.delete(k);
}

export function getContours(project: MapProject): ContourLine[] {
  const g = project.grid;
  if (!g || !project.contours.enabled) return [];
  const key = `${project.id}|${project.contours.interval}|${project.updatedAt}`;
  let lines = contourCache.get(key);
  if (!lines) {
    const st = gridStats(g);
    const levels = levelSequence(st.min, st.max, project.contours.interval);
    lines = traceContours(g, levels);
    contourCache.set(key, lines);
    if (contourCache.size > 30) {
      const first = contourCache.keys().next().value;
      if (first) contourCache.delete(first);
    }
  }
  return lines;
}

/**
 * 地图视图：WebGL2 地形层 + 2D 叠加层（等高线、路线、比例尺）。
 * 多个页面复用。
 */
export class MapView {
  container: HTMLElement;
  glCanvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  renderer: TerrainRenderer;
  view: ViewState = { cx: 0, cy: 0, scale: 0.1 };
  project: MapProject | null = null;
  /** 路线编辑回调 */
  onMapClick: ((x: number, y: number) => void) | null = null;
  onViewChange: (() => void) | null = null;
  /** 正在编辑的路线预览点 */
  draftPoints: Array<[number, number]> = [];
  showContours = true;
  showRoutes = true;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private downX = 0;
  private downY = 0;
  private ro: ResizeObserver;

  constructor(container: HTMLElement) {
    this.container = container;
    container.classList.add('mapview');
    this.glCanvas = document.createElement('canvas');
    this.overlay = document.createElement('canvas');
    this.glCanvas.className = 'mapview-gl';
    this.overlay.className = 'mapview-overlay';
    container.appendChild(this.glCanvas);
    container.appendChild(this.overlay);
    this.renderer = new TerrainRenderer(this.glCanvas);

    this.overlay.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.downX = e.clientX;
      this.downY = e.clientY;
      this.overlay.setPointerCapture(e.pointerId);
    });
    this.overlay.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.view.cx -= dx / this.view.scale;
      this.view.cy += dy / this.view.scale;
      this.redraw();
      this.onViewChange?.();
    });
    this.overlay.addEventListener('pointerup', (e) => {
      this.dragging = false;
      // 单击（总位移很小）才触发编辑回调
      if (this.onMapClick) {
        const moved = Math.abs(e.clientX - this.downX) + Math.abs(e.clientY - this.downY);
        if (moved < 4) {
          const rect = this.overlay.getBoundingClientRect();
          const [x, y] = this.screenToMap(e.clientX - rect.left, e.clientY - rect.top);
          this.onMapClick(x, y);
        }
      }
    });
    this.overlay.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.overlay.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const [wx, wy] = this.screenToMap(mx, my);
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      this.view.scale = Math.min(50, Math.max(0.001, this.view.scale * factor));
      // 缩放以鼠标位置为锚点
      this.view.cx = wx - (mx - this.overlay.clientWidth / 2) / this.view.scale;
      this.view.cy = wy + (my - this.overlay.clientHeight / 2) / this.view.scale;
      this.redraw();
      this.onViewChange?.();
    }, { passive: false });

    this.ro = new ResizeObserver(() => this.redraw());
    this.ro.observe(container);
  }

  destroy() {
    this.ro.disconnect();
  }

  setProject(p: MapProject | null, fit = false) {
    this.project = p;
    this.renderer.setGrid(p?.grid ?? null);
    if (p) this.updateRamp();
    if (fit && p?.grid) this.fitToGrid();
    this.redraw();
  }

  updateRamp() {
    if (!this.project?.grid) return;
    const st = gridStats(this.project.grid);
    this.renderer.setRamp(rampToLUT(this.project.tint.stops, st.min, st.max));
  }

  fitToGrid() {
    const g = this.project?.grid;
    if (!g) return;
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    const gw = (g.cols - 1) * g.cellSize;
    const gh = (g.rows - 1) * g.cellSize;
    this.view.scale = Math.min(w / gw, h / gh) * 0.92;
    this.view.cx = g.x0 + gw / 2;
    this.view.cy = g.y0 + gh / 2;
  }

  screenToMap(px: number, py: number): [number, number] {
    const w = this.overlay.clientWidth;
    const h = this.overlay.clientHeight;
    return [
      this.view.cx + (px - w / 2) / this.view.scale,
      this.view.cy - (py - h / 2) / this.view.scale,
    ];
  }

  mapToScreen(x: number, y: number): [number, number] {
    const w = this.overlay.clientWidth;
    const h = this.overlay.clientHeight;
    return [
      (x - this.view.cx) * this.view.scale + w / 2,
      -(y - this.view.cy) * this.view.scale + h / 2,
    ];
  }

  private terrainStyle(): TerrainStyle | null {
    const p = this.project;
    if (!p?.grid) return null;
    const st = gridStats(p.grid);
    return {
      lights: p.shade.lights,
      ambient: p.shade.ambient,
      vertEx: p.shade.vertEx,
      shadeEnabled: p.shade.enabled,
      tintEnabled: p.tint.enabled,
      zMin: st.min,
      zMax: st.max,
    };
  }

  redraw() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (this.overlay.width !== Math.round(w * dpr) || this.overlay.height !== Math.round(h * dpr)) {
      this.overlay.width = Math.round(w * dpr);
      this.overlay.height = Math.round(h * dpr);
    }
    const style = this.terrainStyle();
    if (style) {
      const halfW = w / 2 / this.view.scale;
      const halfH = h / 2 / this.view.scale;
      this.renderer.render(
        style,
        [this.view.cx - halfW, this.view.cy - halfH],
        [halfW * 2, halfH * 2],
      );
    } else {
      const gl = this.glCanvas.getContext('webgl2');
      gl?.clearColor(0, 0, 0, 0);
      gl?.clear(gl.COLOR_BUFFER_BIT);
    }
    this.drawOverlay();
  }

  private drawOverlay() {
    const ctx = this.overlay.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.overlay.clientWidth, this.overlay.clientHeight);
    const p = this.project;
    if (!p?.grid) return;
    const g = p.grid;

    if (this.showContours && p.contours.enabled) this.drawContours(ctx, p, g);
    if (this.showRoutes) this.drawRoutes(ctx, p);
    this.drawScaleBar(ctx);
  }

  private drawContours(ctx: CanvasRenderingContext2D, p: MapProject, g: ElevationGrid) {
    const lines = getContours(p);
    const idxEvery = Math.max(1, p.contours.indexEvery);
    const s = this.view.scale;

    const drawLine = (line: ContourLine, isIndex: boolean) => {
      ctx.beginPath();
      let started = false;
      for (const [gi, gj] of line.points) {
        const [mx, my] = gridToMap(g, gi, gj);
        const [sx, sy] = this.mapToScreen(mx, my);
        if (!started) { ctx.moveTo(sx, sy); started = true; }
        else ctx.lineTo(sx, sy);
      }
      if (line.closed) ctx.closePath();
      ctx.strokeStyle = isIndex ? p.contours.indexColor : p.contours.normalColor;
      ctx.lineWidth = isIndex ? p.contours.indexWidth : p.contours.normalWidth;
      ctx.stroke();
    };

    for (const line of lines) {
      const isIndex = Math.round(line.level / p.contours.interval) % idxEvery === 0;
      drawLine(line, isIndex);
    }

    // 计曲线高程注记：沿走向每 ~260px 放置
    if (p.contours.labelsEnabled && s > 0.01) {
      ctx.font = `${p.contours.labelSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const line of lines) {
        const isIndex = Math.round(line.level / p.contours.interval) % idxEvery === 0;
        if (!isIndex) continue;
        const pts = line.points.map(([gi, gj]) => {
          const [mx, my] = gridToMap(g, gi, gj);
          return this.mapToScreen(mx, my);
        });
        let acc = 0;
        let nextLabel = 130;
        for (let k = 0; k + 1 < pts.length; k++) {
          const [x0, y0] = pts[k];
          const [x1, y1] = pts[k + 1];
          const segLen = Math.hypot(x1 - x0, y1 - y0);
          while (acc + segLen >= nextLabel) {
            const t = (nextLabel - acc) / segLen;
            const lx = x0 + (x1 - x0) * t;
            const ly = y0 + (y1 - y0) * t;
            if (lx > 20 && ly > 20 && lx < this.overlay.clientWidth - 20 && ly < this.overlay.clientHeight - 20) {
              const ang = Math.atan2(y1 - y0, x1 - x0);
              const label = String(Math.round(line.level));
              ctx.save();
              ctx.translate(lx, ly);
              ctx.rotate(Math.abs(ang) > Math.PI / 2 ? ang + Math.PI : ang);
              ctx.lineWidth = 3;
              ctx.strokeStyle = 'rgba(255,255,255,0.85)';
              ctx.strokeText(label, 0, 0);
              ctx.fillStyle = p.contours.labelColor;
              ctx.fillText(label, 0, 0);
              ctx.restore();
            }
            nextLabel += 260;
          }
          acc += segLen;
        }
      }
    }
  }

  private drawRoutes(ctx: CanvasRenderingContext2D, p: MapProject) {
    for (const r of p.routes) {
      if (r.points.length < 2) continue;
      ctx.beginPath();
      r.points.forEach(([x, y], k) => {
        const [sx, sy] = this.mapToScreen(x, y);
        if (k === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.stroke();
      // 节点
      for (const [x, y] of r.points) {
        const [sx, sy] = this.mapToScreen(x, y);
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fillStyle = r.color;
        ctx.fill();
      }
    }
    // 草稿线
    if (this.draftPoints.length > 0) {
      ctx.beginPath();
      this.draftPoints.forEach(([x, y], k) => {
        const [sx, sy] = this.mapToScreen(x, y);
        if (k === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.strokeStyle = '#e0245e';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [x, y] of this.draftPoints) {
        const [sx, sy] = this.mapToScreen(x, y);
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#e0245e';
        ctx.fill();
      }
    }
  }

  private drawScaleBar(ctx: CanvasRenderingContext2D) {
    const s = this.view.scale;
    const targetPx = 100;
    const meters = targetPx / s;
    const pow = Math.pow(10, Math.floor(Math.log10(meters)));
    const nice = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= meters) ?? 10 * pow;
    const px = nice * s;
    const x0 = 16;
    const y0 = this.overlay.clientHeight - 24;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(x0 - 6, y0 - 16, px + 12, 26);
    ctx.fillStyle = '#222';
    ctx.fillRect(x0, y0, px, 4);
    ctx.clearRect(x0 + px / 2, y0, px / 2, 4);
    ctx.strokeStyle = '#222';
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, px - 1, 3);
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#222';
    const label = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
    ctx.fillText(label, x0 + px / 2, y0 - 5);
  }
}
