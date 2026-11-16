import { store } from '../store';
import { newProject } from '../types';
import { demoTerrain } from '../core/testTerrain';
import { el, button, fmt } from '../ui/dom';
import { downloadBlob } from '../render/exporter';

/** 地图列表页：增删改复制、导入导出 */
export function renderMapsPage(root: HTMLElement) {
  root.innerHTML = '';
  root.append(el('h2', {}, ['地图列表']));

  const bar = el('div', { class: 'toolbar' }, [
    button('＋ 新建空白地图', () => {
      const name = prompt('地图名称', `未命名地图 ${store.projects.length + 1}`);
      if (!name) return;
      store.addProject(newProject(name, store.settings));
    }),
    button('⛰ 新建演示地图（含测试地形）', () => {
      const p = newProject(`演示地形 ${store.projects.length + 1}`, store.settings);
      const { grid, peaks } = demoTerrain();
      p.grid = grid;
      p.peaks = peaks.map((pk) => ({ name: pk.name ?? '峰', x: pk.x, y: pk.y, height: pk.height }));
      store.addProject(p);
      location.hash = '#/hillshade';
    }),
    button('📥 导入地图 JSON', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) return;
        try {
          store.importProjectJson(await f.text());
        } catch (e) {
          alert('导入失败: ' + (e as Error).message);
        }
      };
      inp.click();
    }),
  ]);
  root.append(bar);

  if (store.projects.length === 0) {
    root.append(el('p', { class: 'muted' }, ['还没有地图。新建一个，或到「高程导入」页导入 .asc 高程数据。']));
    return;
  }

  const table = el('table', { class: 'table' });
  table.append(el('tr', {}, [
    el('th', {}, ['名称']), el('th', {}, ['高程数据']), el('th', {}, ['路线']),
    el('th', {}, ['修改时间']), el('th', {}, ['操作']),
  ]));
  for (const p of store.projects) {
    const openBtn = button('打开', () => {
      store.setCurrent(p.id);
      location.hash = '#/hillshade';
    }, 'primary');
    const renameBtn = button('重命名', () => {
      const name = prompt('新名称', p.name);
      if (name) { p.name = name; p.updatedAt = Date.now(); store.touch(); }
    });
    const dupBtn = button('复制', () => { store.duplicateProject(p.id); });
    const expBtn = button('导出', () => {
      const blob = new Blob([store.exportProjectJson(p.id)], { type: 'application/json' });
      downloadBlob(blob, `${p.name}.map.json`);
    });
    const delBtn = button('删除', () => {
      if (confirm(`确定删除「${p.name}」？此操作不可恢复。`)) store.deleteProject(p.id);
    }, 'danger');
    const tr = el('tr', { class: p.id === store.currentId ? 'current' : '' }, [
      el('td', {}, [p.name]),
      el('td', {}, [p.grid ? `${p.grid.cols}×${p.grid.rows} @ ${p.grid.cellSize}m` : '—']),
      el('td', {}, [String(p.routes.length)]),
      el('td', {}, [new Date(p.updatedAt).toLocaleString('zh-CN')]),
      el('td', { class: 'actions' }, [openBtn, renameBtn, dupBtn, expBtn, delBtn]),
    ]);
    table.append(tr);
  }
  root.append(table);
  root.append(el('p', { class: 'muted' }, [
    `本地存储占用约 ${fmt(store.storageBytes() / 1024, 0)} KB（浏览器 localStorage）。`,
  ]));
}
