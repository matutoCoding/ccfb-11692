import { ElevationGrid, makeGrid } from './grid';

export interface PeakSpec {
  /** 地图米坐标 */
  x: number;
  y: number;
  /** 峰顶高程（米），精确已知，用于精度核对 */
  height: number;
  /** 高斯峰标准差（米） */
  sigma: number;
  name?: string;
}

export interface TerrainOptions {
  cols: number;
  rows: number;
  cellSize: number;
  x0?: number;
  y0?: number;
  base?: number;
  /** 每米 x/y 方向的抬升（米/米），制造缓坡 */
  tiltX?: number;
  tiltY?: number;
  peaks: PeakSpec[];
  /** 可选确定性噪声幅度（米），0 为关闭 */
  noise?: number;
  seed?: number;
}

/** 可复现的伪随机数（mulberry32） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 解析式合成地形：z = base + tilt + Σ 高斯峰 (+ 噪声)。
 * 峰值在数学上精确已知，供等高线位置与累计爬升核对。
 */
export function generateTerrain(opts: TerrainOptions): ElevationGrid {
  const { cols, rows, cellSize } = opts;
  const x0 = opts.x0 ?? 0;
  const y0 = opts.y0 ?? 0;
  const base = opts.base ?? 0;
  const tiltX = opts.tiltX ?? 0;
  const tiltY = opts.tiltY ?? 0;
  const g = makeGrid(cols, rows, cellSize, x0, y0);
  const rand = opts.noise ? mulberry32(opts.seed ?? 42) : null;
  for (let j = 0; j < rows; j++) {
    const y = y0 + j * cellSize;
    for (let i = 0; i < cols; i++) {
      const x = x0 + i * cellSize;
      let z = base + tiltX * x + tiltY * y;
      for (const p of opts.peaks) {
        const dx = x - p.x, dy = y - p.y;
        z += p.height * Math.exp(-(dx * dx + dy * dy) / (2 * p.sigma * p.sigma));
      }
      if (rand && opts.noise) z += (rand() * 2 - 1) * opts.noise;
      g.data[j * cols + i] = z;
    }
  }
  return g;
}

/** 峰位处的解析高程（含其它峰的拖尾贡献），用于精确核对 */
export function analyticZ(opts: TerrainOptions, x: number, y: number): number {
  let z = (opts.base ?? 0) + (opts.tiltX ?? 0) * x + (opts.tiltY ?? 0) * y;
  for (const p of opts.peaks) {
    const dx = x - p.x, dy = y - p.y;
    z += p.height * Math.exp(-(dx * dx + dy * dy) / (2 * p.sigma * p.sigma));
  }
  return z;
}

/** 演示地形的山谷修正项（负高斯），导出以便测试精确核对 */
export function demoValleyZ(x: number, y: number): number {
  const valleySigmaY = 180;
  const valleyDepth = 120;
  const dy = y - 1900;
  return -valleyDepth * Math.exp(-(dy * dy) / (2 * valleySigmaY * valleySigmaY)) * Math.exp(-x / 4000);
}

/**
 * 演示地形：三座已知高度的山峰 + 一条山谷。
 * 峰顶恰好落在网格节点上，峰顶格网值 = 解析高程（其它峰贡献 < 0.01 米）。
 */
export function demoTerrain(): { grid: ElevationGrid; peaks: PeakSpec[] } {
  const cellSize = 25;
  const cols = 241;
  const rows = 181;
  const peaks: PeakSpec[] = [
    { name: '主峰', x: 1500, y: 2500, height: 1523.5, sigma: 420 },
    { name: '北峰', x: 3500, y: 3400, height: 1187.0, sigma: 330 },
    { name: '南峰', x: 4200, y: 1100, height: 986.3, sigma: 260 },
  ];
  const grid = generateTerrain({
    cols, rows, cellSize, base: 320, tiltX: 0.004, tiltY: 0.002, peaks,
  });
  // 挖一条东西向山谷（负高斯），增加等高线形态多样性
  for (let j = 0; j < rows; j++) {
    const y = j * cellSize;
    for (let i = 0; i < cols; i++) {
      const x = i * cellSize;
      grid.data[j * cols + i] += demoValleyZ(x, y);
    }
  }
  return { grid, peaks };
}
