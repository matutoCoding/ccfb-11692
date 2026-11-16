import { store } from '../store';
import { el, button, fmt, fmtDistance, colorInput } from '../ui/dom';
import { routeStats, RouteStats } from '../core/profile';
import { Route } from '../types';
import { editorPage } from './editorPage';

/** 路线标注页：画线、距离/爬升统计、剖面图 */
export function renderRoutesPage(root: HTMLElement) {
  let drawing = false;
  let selectedId: string | null = null;

  editorPage(root, '路线标注', (panel, mv, refresh) => {
    const p = store.current!;

    const hint = el('p', { class: 'muted' }, ['']);
    const drawBtn = button('✏️ 开始画路线', () => {
      drawing = true;
      mv.draftPoints = [];
      hint.textContent = '在地图上单击加点，双击或按「完成」结束，Esc 取消。';
      drawBtn.disabled = true;
    }, 'primary');
    const finishBtn = button('完成路线', () => finishDrawing());
    const cancelBtn = button('取消', () => cancelDrawing());

    panel.append(el('div', { class: 'toolbar' }, [drawBtn, finishBtn, cancelBtn]), hint);

    function finishDrawing() {
      if (!drawing) return;
      drawing = false;
      drawBtn.disabled = false;
      if (mv.draftPoints.length >= 2) {
        const route: Route = {
          id: `r${Date.now().toString(36)}`,
          name: `路线 ${p.routes.length + 1}`,
          color: '#d61f2c',
          points: mv.draftPoints.slice(),
        };
        p.routes.push(route);
        selectedId = route.id;
      }
      mv.draftPoints = [];
      hint.textContent = '';
      refresh();
      renderRoutesPage(root);
    }

    function cancelDrawing() {
      drawing = false;
      drawBtn.disabled = false;
      mv.draftPoints = [];
      hint.textContent = '';
      mv.redraw();
    }

    mv.onMapClick = (x, y) => {
      if (!drawing) return;
      mv.draftPoints.push([x, y]);
      mv.redraw();
    };
    mv.overlay.addEventListener('dblclick', () => finishDrawing());
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cancelDrawing();
    });

    /* ---- 路线列表与统计 ---- */
    if (p.routes.length === 0) {
      panel.append(el('p', { class: 'muted' }, ['还没有路线。点「开始画路线」在地图上勾绘。']));
      return;
    }
    panel.append(el('h4', {}, ['路线']));
    for (const r of p.routes) {
      const stats: RouteStats | null = r.points.length >= 2 ? routeStats(p.grid!, r.points) : null;
      const box = el('div', { class: `route-box ${r.id === selectedId ? 'selected' : ''}` });
      const nameEl = el('span', { class: 'route-name' }, [r.name]);
      nameEl.addEventListener('dblclick', () => {
        const name = prompt('路线名称', r.name);
        if (name) { r.name = name; refresh(); renderRoutesPage(root); }
      });
      box.append(
        el('div', { class: 'route-head' }, [
          colorInput(r.color, (v) => { r.color = v; refresh(); }),
          nameEl,
          button('剖面', () => { selectedId = r.id; renderRoutesPage(root); }),
          button('删点', () => {
            if (r.points.length > 2) { r.points.pop(); refresh(); renderRoutesPage(root); }
          }),
          button('删除', () => {
            p.routes = p.routes.filter((x) => x.id !== r.id);
            if (selectedId === r.id) selectedId = null;
            refresh();
            renderRoutesPage(root);
          }, 'danger'),
        ]),
      );
      if (stats) {
        box.append(el('div', { class: 'route-stats' }, [
          `距离 ${fmtDistance(stats.distance)} ｜ 累计爬升 ${fmt(stats.ascent, 0)} m ｜ 累计下降 ${fmt(stats.descent, 0)} m ｜ 高程 ${fmt(stats.minZ, 0)}–${fmt(stats.maxZ, 0)} m`,
        ]));
      }
      panel.append(box);
    }

    /* ---- 剖面图 ---- */
    const sel = p.routes.find((r) => r.id === selectedId) ?? p.routes[p.routes.length - 1];
    if (sel && sel.points.length >= 2) {
      panel.append(el('h4', {}, [`剖面图 — ${sel.name}`]));
      const canvas = el('canvas', { class: 'profile' }) as HTMLCanvasElement;
      panel.append(canvas);
      drawProfile(canvas, routeStats(p.grid!, sel.points));
    }
  });
}

function drawProfile(canvas: HTMLCanvasElement, stats: RouteStats) {
  const W = 340, H = 180, padL = 44, padR = 8, padT = 10, padB = 26;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  const prof = stats.profile.filter((pt) => !Number.isNaN(pt.z));
  if (prof.length < 2) {
    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    ctx.fillText('路线大部分在高程数据之外', padL, H / 2);
    return;
  }
  const zPad = Math.max(5, (stats.maxZ - stats.minZ) * 0.08);
  const z0 = stats.minZ - zPad;
  const z1 = stats.maxZ + zPad;
  const X = (d: number) => padL + (d / stats.distance) * (W - padL - padR);
  const Y = (z: number) => padT + (1 - (z - z0) / (z1 - z0)) * (H - padT - padB);

  // 网格与坐标轴
  ctx.strokeStyle = '#ddd';
  ctx.fillStyle = '#666';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let k = 0; k <= 4; k++) {
    const z = z0 + ((z1 - z0) * k) / 4;
    const y = Y(z);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillText(`${fmt(z, 0)}`, padL - 4, y + 3);
  }
  ctx.textAlign = 'center';
  for (let k = 0; k <= 4; k++) {
    const d = (stats.distance * k) / 4;
    ctx.fillText(fmtDistance(d), X(d), H - 8);
  }

  // 剖面填充与线
  ctx.beginPath();
  ctx.moveTo(X(prof[0].d), Y(prof[0].z));
  for (const pt of prof) ctx.lineTo(X(pt.d), Y(pt.z));
  ctx.lineTo(X(prof[prof.length - 1].d), Y(z0));
  ctx.lineTo(X(prof[0].d), Y(z0));
  ctx.closePath();
  ctx.fillStyle = 'rgba(120, 85, 40, 0.25)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(X(prof[0].d), Y(prof[0].z));
  for (const pt of prof) ctx.lineTo(X(pt.d), Y(pt.z));
  ctx.strokeStyle = '#7a4d1d';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 最高/最低点标注
  let hi = prof[0], lo = prof[0];
  for (const pt of prof) {
    if (pt.z > hi.z) hi = pt;
    if (pt.z < lo.z) lo = pt;
  }
  ctx.fillStyle = '#b00';
  ctx.fillText(`▲ ${fmt(hi.z, 0)}m`, Math.min(Math.max(X(hi.d), padL + 20), W - 30), Y(hi.z) - 6);
  ctx.fillStyle = '#06a';
  ctx.fillText(`▼ ${fmt(lo.z, 0)}m`, Math.min(Math.max(X(lo.d), padL + 20), W - 30), Y(lo.z) + 12);
}
