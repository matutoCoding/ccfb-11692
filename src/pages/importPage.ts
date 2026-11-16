import { store } from '../store';
import { newProject } from '../types';
import { parseAsciiGrid, fillNodata, toAsciiGrid } from '../core/asciiGrid';
import { gridStats } from '../core/grid';
import { demoTerrain } from '../core/testTerrain';
import { el, button, checkbox, fmt } from '../ui/dom';
import { downloadBlob } from '../render/exporter';

/** 高程导入页：.asc 导入（含缺失值处理）、测试地形生成 */
export function renderImportPage(root: HTMLElement) {
  root.innerHTML = '';
  root.append(el('h2', {}, ['高程导入']));

  /* ---------- ASCII Grid 导入 ---------- */
  const status = el('p', { class: 'muted' }, ['支持 Esri ASCII Grid（.asc）。NODATA 值会自动识别为缺失。']);
  const fillChk = checkbox(true, () => {});
  const fillLabel = el('label', { class: 'inline' }, [fillChk, ' 导入时填充缺失值（邻域均值迭代）']);

  const handleFile = async (f: File) => {
    try {
      const text = await f.text();
      const grid = parseAsciiGrid(text);
      const st0 = gridStats(grid);
      let msg = `解析成功：${grid.cols}×${grid.rows}，格距 ${grid.cellSize}m，高程 ${fmt(st0.min)}–${fmt(st0.max)}m，缺失 ${st0.nodataCount} 格。`;
      if (fillChk.checked && st0.nodataCount > 0) {
        const n = fillNodata(grid);
        msg += ` 已填充 ${n} 格。`;
      }
      status.textContent = msg;
      const name = f.name.replace(/\.[^.]+$/, '');
      const p = newProject(name, store.settings);
      p.grid = grid;
      store.addProject(p);
      location.hash = '#/hillshade';
    } catch (e) {
      status.textContent = '导入失败: ' + (e as Error).message;
    }
  };

  const drop = el('div', { class: 'dropzone' }, [
    el('p', {}, ['拖入 .asc 文件，或']),
    button('选择文件', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.asc,.txt';
      inp.onchange = () => { const f = inp.files?.[0]; if (f) handleFile(f); };
      inp.click();
    }),
  ]);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  root.append(el('h3', {}, ['导入 ASCII Grid']), drop, fillLabel, status);

  /* ---------- 测试地形生成 ---------- */
  root.append(el('h3', {}, ['生成测试地形']));
  root.append(el('p', { class: 'muted' }, [
    '解析式合成地形（高斯峰 + 缓坡 + 山谷），峰顶高程精确已知，用于核对等高线位置与累计爬升。',
  ]));
  root.append(button('生成演示地形地图', () => {
    const p = newProject(`演示地形 ${store.projects.length + 1}`, store.settings);
    const { grid, peaks } = demoTerrain();
    p.grid = grid;
    p.peaks = peaks.map((pk) => ({ name: pk.name ?? '峰', x: pk.x, y: pk.y, height: pk.height }));
    store.addProject(p);
    location.hash = '#/hillshade';
  }, 'primary'));

  /* ---------- 当前地图信息 + 导出 .asc ---------- */
  const cur = store.current;
  if (cur?.grid) {
    const st = gridStats(cur.grid);
    root.append(el('h3', {}, ['当前地图高程']));
    root.append(el('p', {}, [
      `「${cur.name}」：${cur.grid.cols}×${cur.grid.rows}，格距 ${cur.grid.cellSize}m，` +
      `高程 ${fmt(st.min)}–${fmt(st.max)}m，缺失 ${st.nodataCount} 格。`,
    ]));
    const row = el('div', { class: 'toolbar' }, []);
    if (st.nodataCount > 0) {
      row.append(button('填充缺失值', () => {
        const n = fillNodata(cur.grid!);
        cur.updatedAt = Date.now();
        store.touch();
        alert(`已填充 ${n} 格`);
      }));
    }
    row.append(button('导出为 .asc', () => {
      const blob = new Blob([toAsciiGrid(cur.grid!)], { type: 'text/plain' });
      downloadBlob(blob, `${cur.name}.asc`);
    }));
    root.append(row);
    if (cur.peaks.length > 0) {
      root.append(el('h4', {}, ['已知峰顶（核对基准）']));
      const ul = el('ul', {});
      for (const pk of cur.peaks) {
        ul.append(el('li', {}, [`${pk.name}：(${fmt(pk.x, 0)}, ${fmt(pk.y, 0)})，高程 ${fmt(pk.height, 1)} m`]));
      }
      root.append(ul);
    }
  }
}
