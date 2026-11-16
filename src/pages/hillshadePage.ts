import { store } from '../store';
import { el, field, slider, checkbox, colorInput, numberInput, button, selectInput } from '../ui/dom';
import { RAMP_PRESETS } from '../core/colorRamp';
import { editorPage } from './editorPage';

/** 晕渲样式页：光源、多方向混合、分层设色 */
export function renderHillshadePage(root: HTMLElement) {
  editorPage(root, '晕渲样式', (panel, mv, refresh) => {
    const p = store.current!;
    const rebuild = () => renderHillshadePage(root); // 增删色标后重建面板

    /* ---- 晕渲开关与全局参数 ---- */
    panel.append(field('启用山体晕渲', checkbox(p.shade.enabled, (v) => { p.shade.enabled = v; refresh(); })));
    panel.append(field('启用分层设色', checkbox(p.tint.enabled, (v) => { p.tint.enabled = v; refresh(); })));

    const ambientVal = el('span', { class: 'val' }, [p.shade.ambient.toFixed(2)]);
    const f1 = field('环境光 ', slider(p.shade.ambient, 0, 1, 0.01, (v) => {
      p.shade.ambient = v; ambientVal.textContent = v.toFixed(2); refresh();
    }));
    f1.append(ambientVal);
    panel.append(f1);

    const veVal = el('span', { class: 'val' }, [p.shade.vertEx.toFixed(1)]);
    const f2 = field('垂直夸张 ', slider(p.shade.vertEx, 0.5, 4, 0.1, (v) => {
      p.shade.vertEx = v; veVal.textContent = v.toFixed(1); refresh();
    }));
    f2.append(veVal);
    panel.append(f2);

    /* ---- 多方向光源 ---- */
    panel.append(el('h4', {}, ['光源（多方向混合，权重归一化）']));
    p.shade.lights.forEach((light, k) => {
      const box = el('div', { class: 'light-box' });
      const azVal = el('span', { class: 'val' }, [`${light.azimuth}°`]);
      const altVal = el('span', { class: 'val' }, [`${light.altitude}°`]);
      const wVal = el('span', { class: 'val' }, [light.weight.toFixed(1)]);
      const fAz = field('方位角(°) ', slider(light.azimuth, 0, 360, 1, (v) => { light.azimuth = v; azVal.textContent = `${v}°`; refresh(); }));
      fAz.append(azVal);
      const fAlt = field('高度角(°) ', slider(light.altitude, 5, 90, 1, (v) => { light.altitude = v; altVal.textContent = `${v}°`; refresh(); }));
      fAlt.append(altVal);
      const fW = field('权重 ', slider(light.weight, 0, 2, 0.1, (v) => { light.weight = v; wVal.textContent = v.toFixed(1); refresh(); }));
      fW.append(wVal);
      box.append(
        field(`光源 ${k + 1}`, checkbox(light.enabled, (v) => { light.enabled = v; refresh(); })),
        fAz, fAlt, fW,
      );
      panel.append(box);
    });
    panel.append(el('p', { class: 'muted' }, ['方位角自正北顺时针，315° = 西北来光（制图惯例）。']));

    /* ---- 分层设色色带 ---- */
    panel.append(el('h4', {}, ['分层设色色带']));
    const presetSel = selectInput(
      Object.keys(RAMP_PRESETS).map((k) => [k, k] as [string, string]),
      Object.keys(RAMP_PRESETS)[0],
      (name) => {
        p.tint.stops = RAMP_PRESETS[name].map((s) => ({ ...s }));
        refresh();
        rebuild();
      },
    );
    panel.append(field('套用预设', presetSel));

    const stopsBox = el('div', { class: 'stops' });
    p.tint.stops.forEach((stop, idx) => {
      stopsBox.append(el('div', { class: 'stop-row' }, [
        numberInput(stop.z, (v) => { stop.z = v; refresh(); }, { step: 10 }),
        colorInput(stop.color, (v) => { stop.color = v; refresh(); }),
        button('✕', () => {
          p.tint.stops.splice(idx, 1);
          refresh();
          rebuild();
        }),
      ]));
    });
    panel.append(stopsBox);
    panel.append(button('＋ 添加色标', () => {
      const last = p.tint.stops[p.tint.stops.length - 1];
      p.tint.stops.push({ z: (last?.z ?? 0) + 200, color: last?.color ?? '#cccccc' });
      p.tint.stops.sort((a, b) => a.z - b.z);
      refresh();
      rebuild();
    }));
  });
}
