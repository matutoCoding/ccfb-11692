import { describe, it, expect } from 'vitest';
import { generateTerrain, analyticZ, demoTerrain } from '../src/core/testTerrain';
import { routeStats, polylineLength } from '../src/core/profile';
import { bilinear } from '../src/core/grid';

describe('累计爬升精度', () => {
  it('平面场：与解析解误差为 0（< 1% 限差）', () => {
    const grid = generateTerrain({ cols: 81, rows: 61, cellSize: 25, tiltX: 0.05, tiltY: 0.03, peaks: [] });
    const stats = routeStats(grid, [[0, 0], [2000, 1500]]);
    const expected = 0.05 * 2000 + 0.03 * 1500; // 145m
    expect(Math.abs(stats.ascent - expected) / expected).toBeLessThan(0.01);
    expect(stats.distance).toBeCloseTo(2500, 6);
  });

  it('已知峰高的高斯峰：山脚→峰顶累计爬升 = 解析高差，误差 < 1%', () => {
    const opts = {
      cols: 161, rows: 161, cellSize: 20,
      peaks: [{ x: 1600, y: 1600, height: 1200, sigma: 400 }],
    };
    const grid = generateTerrain(opts);
    const start: [number, number] = [200, 300];
    const summit: [number, number] = [1600, 1600];
    const stats = routeStats(grid, [start, summit]);
    const expected = analyticZ(opts, summit[0], summit[1]) - analyticZ(opts, start[0], start[1]);
    expect(Math.abs(stats.ascent - expected) / expected).toBeLessThan(0.01);
  });

  it('往返路线：累计爬升 = 单程净高差（去程上坡、回程下坡）', () => {
    const opts = {
      cols: 161, rows: 161, cellSize: 20,
      peaks: [{ x: 1600, y: 1600, height: 1000, sigma: 350 }],
    };
    const grid = generateTerrain(opts);
    const a: [number, number] = [400, 400];
    const b: [number, number] = [1600, 1600];
    const stats = routeStats(grid, [a, b, a]);
    const single = analyticZ(opts, b[0], b[1]) - analyticZ(opts, a[0], a[1]);
    expect(Math.abs(stats.ascent - single) / single).toBeLessThan(0.01);
    expect(Math.abs(stats.descent - single) / single).toBeLessThan(0.01);
  });

  it('与 10 万步超精细采样参考值对比 < 1%（演示地形环线）', () => {
    const { grid } = demoTerrain();
    const pts: Array<[number, number]> = [[500, 600], [1500, 2500], [3500, 3400], [4200, 1100], [500, 600]];
    const coarse = routeStats(grid, pts);
    const fine = routeStats(grid, pts, 0.5); // 0.5m 步长 ≈ 12 万采样点
    expect(Math.abs(coarse.ascent - fine.ascent) / fine.ascent).toBeLessThan(0.01);
    expect(Math.abs(coarse.descent - fine.descent) / fine.descent).toBeLessThan(0.01);
  });

  it('距离为纯几何长度，与手算一致', () => {
    const pts: Array<[number, number]> = [[0, 0], [300, 400], [300, 900]];
    expect(polylineLength(pts)).toBeCloseTo(500 + 500, 9);
    const grid = generateTerrain({ cols: 50, rows: 50, cellSize: 25, peaks: [] });
    const stats = routeStats(grid, pts);
    expect(stats.distance).toBeCloseTo(1000, 9);
  });

  it('纯平地形爬升为 0；纯下坡爬升为 0', () => {
    const flat = generateTerrain({ cols: 30, rows: 30, cellSize: 10, base: 500, peaks: [] });
    expect(routeStats(flat, [[0, 0], [200, 200]]).ascent).toBe(0);
    const downhill = generateTerrain({ cols: 30, rows: 30, cellSize: 10, tiltX: -0.1, peaks: [] });
    const stats = routeStats(downhill, [[100, 100], [200, 100]]);
    expect(stats.ascent).toBe(0);
    expect(stats.descent).toBeCloseTo(10, 6);
  });

  it('双线性插值：平面上精确，节点处等于节点值', () => {
    const grid = generateTerrain({ cols: 20, rows: 20, cellSize: 10, tiltX: 0.3, tiltY: -0.2, base: 100, peaks: [] });
    expect(bilinear(grid, 50, 50)).toBeCloseTo(100 + 0.3 * 50 - 0.2 * 50, 6);
    expect(bilinear(grid, 33, 47)).toBeCloseTo(100 + 0.3 * 33 - 0.2 * 47, 6);
  });
});
