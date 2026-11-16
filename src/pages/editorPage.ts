import { store } from '../store';
import { MapView } from '../render/mapView';
import { el, button } from '../ui/dom';

/**
 * 编辑器页面骨架：左侧地图视图 + 右侧控制面板。
 * 返回 MapView 供页面配置交互。
 */
export function editorPage(
  root: HTMLElement,
  title: string,
  buildPanel: (panel: HTMLElement, mv: MapView, refresh: () => void) => void,
): MapView | null {
  root.innerHTML = '';
  const project = store.current;
  if (!project) {
    root.append(
      el('h2', {}, [title]),
      el('p', { class: 'muted' }, ['请先在「地图」页选择或新建一个地图。']),
      button('去地图列表', () => { location.hash = '#/maps'; }, 'primary'),
    );
    return null;
  }

  const layout = el('div', { class: 'editor' });
  const mapWrap = el('div', { class: 'editor-map' });
  const panel = el('div', { class: 'editor-panel' });
  layout.append(mapWrap, panel);
  root.append(layout);

  const mv = new MapView(mapWrap);
  mv.setProject(project, true);

  const refresh = () => {
    project.updatedAt = Date.now();
    store.touch(false); // 面板重建由下面行触发，避免递归
    store.save();
    mv.updateRamp();
    mv.redraw();
  };

  panel.append(el('h3', {}, [`${title} — ${project.name}`]));
  if (!project.grid) {
    panel.append(el('p', { class: 'muted' }, ['当前地图还没有高程数据，请先到「高程导入」页导入或生成。']));
    return mv;
  }
  buildPanel(panel, mv, refresh);
  return mv;
}
