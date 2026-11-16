import { store } from '../store';
import { el, field, checkbox, colorInput, numberInput } from '../ui/dom';
import { gridStats } from '../core/grid';
import { editorPage } from './editorPage';

/** 等高线页：间距、首曲线/计曲线样式、注记 */
export function renderContoursPage(root: HTMLElement) {
  editorPage(root, '等高线', (panel, mv, refresh) => {
    const p = store.current!;
    const c = p.contours;
    const st = gridStats(p.grid!);

    panel.append(el('p', { class: 'muted' }, [
      `高程范围 ${st.min.toFixed(1)} – ${st.max.toFixed(1)} m。` +
      `间距 ${c.interval}m 时约 ${Math.max(0, Math.floor(st.max / c.interval) - Math.ceil(st.min / c.interval) + 1)} 条首曲线。`,
    ]));

    panel.append(field('显示等高线', checkbox(c.enabled, (v) => { c.enabled = v; refresh(); })));
    panel.append(field('首曲线间距 (m)', numberInput(c.interval, (v) => {
      if (v > 0) { c.interval = v; refresh(); }
    }, { min: 1, step: 5 })));
    panel.append(field('每 N 条一条计曲线', numberInput(c.indexEvery, (v) => {
      if (v >= 1) { c.indexEvery = Math.round(v); refresh(); }
    }, { min: 1, max: 20, step: 1 })));

    panel.append(el('h4', {}, ['首曲线']));
    panel.append(field('颜色', colorInput(c.normalColor, (v) => { c.normalColor = v; refresh(); })));
    panel.append(field('线宽 (px)', numberInput(c.normalWidth, (v) => { c.normalWidth = v; refresh(); }, { min: 0.2, max: 6, step: 0.2 })));

    panel.append(el('h4', {}, ['计曲线']));
    panel.append(field('颜色', colorInput(c.indexColor, (v) => { c.indexColor = v; refresh(); })));
    panel.append(field('线宽 (px)', numberInput(c.indexWidth, (v) => { c.indexWidth = v; refresh(); }, { min: 0.2, max: 8, step: 0.2 })));

    panel.append(el('h4', {}, ['高程注记（计曲线）']));
    panel.append(field('显示注记', checkbox(c.labelsEnabled, (v) => { c.labelsEnabled = v; refresh(); })));
    panel.append(field('颜色', colorInput(c.labelColor, (v) => { c.labelColor = v; refresh(); })));
    panel.append(field('字号 (px)', numberInput(c.labelSize, (v) => { c.labelSize = v; refresh(); }, { min: 6, max: 32, step: 1 })));

    panel.append(el('p', { class: 'muted' }, [
      '等高线由 marching squares 自动追踪，与独立参考实现逐段核对（见「设置」页精度自检）。',
    ]));
  });
}
