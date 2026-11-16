export interface ColorStop {
  /** 高程（米） */
  z: number;
  /** #rrggbb */
  color: string;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** 按高程在色带上插值（RGB 线性），stops 需按 z 升序 */
export function sampleRamp(stops: ColorStop[], z: number): [number, number, number] {
  if (stops.length === 0) return [200, 200, 200];
  if (z <= stops[0].z) return hexToRgb(stops[0].color);
  const last = stops[stops.length - 1];
  if (z >= last.z) return hexToRgb(last.color);
  for (let k = 0; k + 1 < stops.length; k++) {
    const a = stops[k], b = stops[k + 1];
    if (z >= a.z && z <= b.z) {
      const t = (z - a.z) / (b.z - a.z || 1);
      const ca = hexToRgb(a.color), cb = hexToRgb(b.color);
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
    }
  }
  return hexToRgb(last.color);
}

/** 生成 256 级 LUT（RGBA），供 WebGL 纹理与导出共用 */
export function rampToLUT(stops: ColorStop[], zMin: number, zMax: number, n = 256): Uint8Array {
  const lut = new Uint8Array(n * 4);
  const span = zMax - zMin || 1;
  for (let k = 0; k < n; k++) {
    const z = zMin + (k / (n - 1)) * span;
    const [r, g, b] = sampleRamp(stops, z);
    lut[k * 4] = r; lut[k * 4 + 1] = g; lut[k * 4 + 2] = b; lut[k * 4 + 3] = 255;
  }
  return lut;
}

/** 经典分层设色预设 */
export const RAMP_PRESETS: Record<string, ColorStop[]> = {
  '经典地形': [
    { z: 0, color: '#2c7fb8' },
    { z: 200, color: '#41ab5d' },
    { z: 600, color: '#a1d76a' },
    { z: 1000, color: '#e9d44d' },
    { z: 1500, color: '#b5651d' },
    { z: 2000, color: '#8c6d5d' },
    { z: 2500, color: '#f7f7f7' },
  ],
  '绿-棕-雪': [
    { z: 0, color: '#1a9850' },
    { z: 500, color: '#91cf60' },
    { z: 1000, color: '#d9ef8b' },
    { z: 1600, color: '#a6611a' },
    { z: 2200, color: '#ffffff' },
  ],
  '灰度': [
    { z: 0, color: '#222222' },
    { z: 2500, color: '#f0f0f0' },
  ],
};
