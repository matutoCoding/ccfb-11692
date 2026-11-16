/**
 * 高程栅格。行主序存储，第 0 行 = 最南（y 最小）一行。
 * 缺失值一律用 NaN 表示（导入时由 NODATA 哨兵值转换而来）。
 */
export interface ElevationGrid {
  cols: number;
  rows: number;
  /** 格网边长，单位米 */
  cellSize: number;
  /** 西南角（第 0 列、第 0 行节点）的地图坐标，单位米 */
  x0: number;
  y0: number;
  data: Float32Array;
}

export function makeGrid(cols: number, rows: number, cellSize: number, x0 = 0, y0 = 0): ElevationGrid {
  return { cols, rows, cellSize, x0, y0, data: new Float32Array(cols * rows).fill(NaN) };
}

export function cloneGrid(g: ElevationGrid): ElevationGrid {
  return { ...g, data: new Float32Array(g.data) };
}

/** 节点取值；越界返回 NaN */
export function zAt(g: ElevationGrid, i: number, j: number): number {
  if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return NaN;
  return g.data[j * g.cols + i];
}

/** 格网索引（可为小数）→ 地图米坐标 */
export function gridToMap(g: ElevationGrid, i: number, j: number): [number, number] {
  return [g.x0 + i * g.cellSize, g.y0 + j * g.cellSize];
}

/** 地图米坐标 → 格网索引（小数） */
export function mapToGrid(g: ElevationGrid, x: number, y: number): [number, number] {
  return [(x - g.x0) / g.cellSize, (y - g.y0) / g.cellSize];
}

/**
 * 双线性插值采样。任一相邻节点缺失或采样点在网格外时返回 NaN。
 * 平面场上数学精确（对平面 z=ax+by+c 无误差）。
 */
export function bilinear(g: ElevationGrid, x: number, y: number): number {
  const fx = (x - g.x0) / g.cellSize;
  const fy = (y - g.y0) / g.cellSize;
  if (fx < 0 || fy < 0 || fx > g.cols - 1 || fy > g.rows - 1) return NaN;
  const i0 = Math.min(Math.floor(fx), g.cols - 2);
  const j0 = Math.min(Math.floor(fy), g.rows - 2);
  const tx = fx - i0;
  const ty = fy - j0;
  const z00 = g.data[j0 * g.cols + i0];
  const z10 = g.data[j0 * g.cols + i0 + 1];
  const z01 = g.data[(j0 + 1) * g.cols + i0];
  const z11 = g.data[(j0 + 1) * g.cols + i0 + 1];
  if (Number.isNaN(z00) || Number.isNaN(z10) || Number.isNaN(z01) || Number.isNaN(z11)) return NaN;
  const a = z00 + (z10 - z00) * tx;
  const b = z01 + (z11 - z01) * tx;
  return a + (b - a) * ty;
}

export interface GridStats {
  min: number;
  max: number;
  validCount: number;
  nodataCount: number;
}

export function gridStats(g: ElevationGrid): GridStats {
  let min = Infinity, max = -Infinity, valid = 0, nodata = 0;
  for (let k = 0; k < g.data.length; k++) {
    const v = g.data[k];
    if (Number.isNaN(v)) { nodata++; continue; }
    valid++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (valid === 0) { min = 0; max = 0; }
  return { min, max, validCount: valid, nodataCount: nodata };
}

/** 地图米坐标下的范围 */
export function gridBounds(g: ElevationGrid): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: g.x0,
    minY: g.y0,
    maxX: g.x0 + (g.cols - 1) * g.cellSize,
    maxY: g.y0 + (g.rows - 1) * g.cellSize,
  };
}
