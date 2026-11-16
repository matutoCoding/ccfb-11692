import './style.css';
import { store } from './store';
import { renderMapsPage } from './pages/mapsPage';
import { renderImportPage } from './pages/importPage';
import { renderHillshadePage } from './pages/hillshadePage';
import { renderContoursPage } from './pages/contoursPage';
import { renderRoutesPage } from './pages/routesPage';
import { renderExportPage } from './pages/exportPage';
import { renderSettingsPage } from './pages/settingsPage';
import { el } from './ui/dom';

const routes: Array<[string, string, (root: HTMLElement) => void]> = [
  ['#/maps', '地图', renderMapsPage],
  ['#/import', '高程导入', renderImportPage],
  ['#/hillshade', '晕渲样式', renderHillshadePage],
  ['#/contours', '等高线', renderContoursPage],
  ['#/routes', '路线标注', renderRoutesPage],
  ['#/export', '出图', renderExportPage],
  ['#/settings', '设置', renderSettingsPage],
];

function render() {
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  const hash = location.hash || '#/maps';
  const route = routes.find(([h]) => hash.startsWith(h)) ?? routes[0];

  const nav = el('nav', { class: 'sidebar' }, [
    el('div', { class: 'brand' }, ['⛰ 徒步地形制图']),
    ...routes.map(([h, label]) =>
      el('a', { href: h, class: h === route[0] ? 'active' : '' }, [label])),
  ]);

  const main = el('main', { class: 'content' });
  app.append(nav, main);
  route[2](main);
}

window.addEventListener('hashchange', render);
store.subscribe(() => {
  // 非编辑器页面的轻量刷新：仅地图列表页整体重绘
  if ((location.hash || '#/maps') === '#/maps') render();
});
render();
