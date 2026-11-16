import { store } from '../store';
import { el, field, checkbox, numberInput, button, selectInput } from '../ui/dom';
import { exportPng, downloadBlob, PAPER_MM } from '../render/exporter';
import { editorPage } from './editorPage';

/** 出图页：比例尺、纸张、DPI、要素开关，导出 PNG */
export function renderExportPage(root: HTMLElement) {
  editorPage(root, '出图', (panel, mv, refresh) => {
    const p = store.current!;
    const es = p.exportSettings;

    panel.append(field('图名', (() => {
      const inp = el('input', { type: 'text', value: es.title || p.name });
      inp.addEventListener('change', () => { es.title = inp.value; refresh(); });
      return inp;
    })()));

    panel.append(field('纸张', selectInput(
      (Object.keys(PAPER_MM) as Array<keyof typeof PAPER_MM>).map((k) => [k, `${k}（${PAPER_MM[k].join('×')}mm）`] as [string, string]),
      es.paper,
      (v) => { es.paper = v as typeof es.paper; refresh(); updateEstimate(); },
    )));
    panel.append(field('方向', selectInput(
      [['landscape', '横向'], ['portrait', '纵向']] as Array<[string, string]>,
      es.orientation,
      (v) => { es.orientation = v as typeof es.orientation; refresh(); updateEstimate(); },
    )));
    panel.append(field('分辨率 (DPI)', selectInput(
      [['150', '150'], ['300', '300（印刷）'], ['600', '600']] as Array<[string, string]>,
      String(es.dpi),
      (v) => { es.dpi = Number(v); refresh(); updateEstimate(); },
    )));
    panel.append(field('比例尺 1:', numberInput(es.scale, (v) => {
      if (v >= 100) { es.scale = Math.round(v); refresh(); updateEstimate(); }
    }, { min: 100, step: 500 })));

    panel.append(el('h4', {}, ['图面要素']));
    panel.append(field('等高线', checkbox(es.showContours, (v) => { es.showContours = v; refresh(); })));
    panel.append(field('徒步路线', checkbox(es.showRoutes, (v) => { es.showRoutes = v; refresh(); })));
    panel.append(field('比例尺条', checkbox(es.showScaleBar, (v) => { es.showScaleBar = v; refresh(); })));
    panel.append(field('指北针', checkbox(es.showNorthArrow, (v) => { es.showNorthArrow = v; refresh(); })));

    const estimate = el('p', { class: 'muted' }, ['']);
    function updateEstimate() {
      const [pw0, ph0] = PAPER_MM[es.paper];
      const [pw, ph] = es.orientation === 'landscape' ? [pw0, ph0] : [ph0, pw0];
      const wPx = Math.round((pw / 25.4) * es.dpi);
      const hPx = Math.round((ph / 25.4) * es.dpi);
      estimate.textContent = `输出尺寸 ${wPx}×${hPx} px。若整幅地图按 1:${es.scale} 超出纸张，将自动调整比例尺适配。`;
    }
    updateEstimate();
    panel.append(estimate);

    const status = el('p', { class: 'muted' }, ['']);
    panel.append(button('🖨 导出 PNG', async () => {
      status.textContent = '渲染中…';
      try {
        const result = await exportPng(p);
        downloadBlob(result.blob, `${es.title || p.name}.png`);
        status.textContent = `已导出 ${result.widthPx}×${result.heightPx} px，实际比例尺 1:${result.usedScale}。`;
      } catch (e) {
        status.textContent = '导出失败: ' + (e as Error).message;
      }
    }, 'primary'));
    panel.append(status);
  });
}
