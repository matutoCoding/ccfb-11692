import { store } from '../store';
import { el, field, numberInput, button, fmt } from '../ui/dom';
import { runSelfTest } from '../core/selfTest';

/** 设置页：全局默认值、存储管理、精度自检 */
export function renderSettingsPage(root: HTMLElement) {
  root.innerHTML = '';
  root.append(el('h2', {}, ['设置']));
  const s = store.settings;

  root.append(el('h3', {}, ['默认值']));
  root.append(
    field('默认等高线间距 (m)', numberInput(s.defaultContourInterval, (v) => {
      if (v > 0) { s.defaultContourInterval = v; store.touch(); }
    }, { min: 1, step: 5 })),
    field('默认垂直夸张', numberInput(s.defaultVertEx, (v) => {
      if (v > 0) { s.defaultVertEx = v; store.touch(); }
    }, { min: 0.1, max: 10, step: 0.1 })),
  );

  root.append(el('h3', {}, ['精度自检']));
  root.append(el('p', { class: 'muted' }, [
    '在浏览器中运行与自动化测试相同的核对：等高线主实现与独立参考实现逐段比对（限差 0.01 格）、平面场等值线位置、累计爬升与解析解比对（限差 1%）。',
  ]));
  const out = el('pre', { class: 'selftest' }, [s.selfTestResults ?? '尚未运行']);
  root.append(button('▶ 运行精度自检', () => {
    out.textContent = '运行中…';
    setTimeout(() => {
      const report = runSelfTest();
      const text = report.lines.join('\n') + `\n\n总体：${report.pass ? '全部通过' : '存在失败项'}`;
      s.selfTestResults = text;
      store.touch(false);
      out.textContent = text;
    }, 30);
  }, 'primary'));
  root.append(out);

  root.append(el('h3', {}, ['存储']));
  root.append(el('p', { class: 'muted' }, [
    `所有地图保存在浏览器 localStorage，当前占用约 ${fmt(store.storageBytes() / 1024, 0)} KB。` +
    '换浏览器或清除站点数据会丢失，请定期用「地图」页的导出功能备份。',
  ]));
  root.append(button('清空全部数据', () => {
    if (confirm('确定删除所有地图和设置？此操作不可恢复。')) {
      store.clearAll();
      location.hash = '#/maps';
    }
  }, 'danger'));
}
