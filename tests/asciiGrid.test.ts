import { describe, it, expect } from 'vitest';
import { parseAsciiGrid, toAsciiGrid, fillNodata } from '../src/core/asciiGrid';
import { generateTerrain } from '../src/core/testTerrain';
import { gridStats, zAt } from '../src/core/grid';

const SAMPLE = `ncols 3
nrows 2
xllcorner 100
yllcorner 200
cellsize 30
NODATA_value -9999
1 2 3
4 -9999 6
`;

describe('ASCII Grid 导入', () => {
  it('解析头部与数据，首行翻转为北侧', () => {
    const g = parseAsciiGrid(SAMPLE);
    expect(g.cols).toBe(3);
    expect(g.rows).toBe(2);
    expect(g.cellSize).toBe(30);
    expect(g.x0).toBe(100);
    expect(g.y0).toBe(200);
    // 文件首行 = 北侧 = 内部 j=1
    expect(zAt(g, 0, 1)).toBe(1);
    expect(zAt(g, 2, 1)).toBe(3);
    expect(zAt(g, 0, 0)).toBe(4);
    expect(zAt(g, 2, 0)).toBe(6);
  });

  it('NODATA 转为 NaN', () => {
    const g = parseAsciiGrid(SAMPLE);
    expect(Number.isNaN(zAt(g, 1, 0))).toBe(true);
    expect(gridStats(g).nodataCount).toBe(1);
  });

  it('xllcenter/yllcenter 变体', () => {
    const text = SAMPLE.replace('xllcorner 100', 'xllcenter 115').replace('yllcorner 200', 'yllcenter 215');
    const g = parseAsciiGrid(text);
    expect(g.x0).toBe(100);
    expect(g.y0).toBe(200);
  });

  it('缺头部字段时报错', () => {
    expect(() => parseAsciiGrid('ncols 2\nnrows 2\n1 2 3 4')).toThrow();
  });

  it('导出-导入往返一致', () => {
    const g0 = generateTerrain({
      cols: 20, rows: 15, cellSize: 25, x0: 500, y0: 600,
      peaks: [{ x: 700, y: 750, height: 300, sigma: 80 }],
    });
    g0.data[3 * 20 + 5] = NaN;
    const text = toAsciiGrid(g0);
    const g1 = parseAsciiGrid(text);
    expect(g1.cols).toBe(g0.cols);
    expect(g1.rows).toBe(g0.rows);
    expect(g1.x0).toBe(500);
    expect(g1.y0).toBe(600);
    for (let k = 0; k < g0.data.length; k++) {
      const a = g0.data[k], b = g1.data[k];
      if (Number.isNaN(a)) expect(Number.isNaN(b)).toBe(true);
      else expect(b).toBeCloseTo(a, 3);
    }
  });

  it('缺失值填充：填满且不改有效值', () => {
    const g = generateTerrain({ cols: 20, rows: 20, cellSize: 10, tiltX: 0.1, peaks: [] });
    const before = new Float32Array(g.data);
    g.data[5 * 20 + 5] = NaN; // 单个孤立空洞
    const n = fillNodata(g);
    expect(n).toBe(1);
    expect(gridStats(g).nodataCount).toBe(0);
    // 平面场上孤立空洞的邻域均值填充应恢复精确值（8 个邻居对称）
    expect(g.data[5 * 20 + 5]).toBeCloseTo(before[5 * 20 + 5], 4);
    for (let k = 0; k < g.data.length; k++) {
      if (k === 5 * 20 + 5) continue;
      expect(g.data[k]).toBe(before[k]);
    }
  });
});
