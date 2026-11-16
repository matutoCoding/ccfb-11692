import { describe, it, expect } from 'vitest';
import { generateTerrain, demoTerrain } from '../src/core/testTerrain';
import { traceLevel, levelSequence } from '../src/core/marchingSquares';
import { segmentsForLevel } from '../src/core/marchingSquaresRef';
import { compareImplementations } from '../src/core/contourCheck';
import { gridStats } from '../src/core/grid';

describe('marching squares 双实现逐段核对', () => {
  it('演示地形：所有等值面逐段一致，偏差 < 0.01 格', () => {
    const { grid } = demoTerrain();
    const st = gridStats(grid);
    const levels = levelSequence(st.min, st.max, 50);
    expect(levels.length).toBeGreaterThan(10);
    let maxDev = 0;
    let segTotal = 0;
    for (const lv of levels) {
      const r = compareImplementations(grid, lv);
      expect(r.matched, `level=${lv} 段数不一致: 主 ${r.mainSegCount} vs 参考 ${r.refSegCount}`).toBe(true);
      maxDev = Math.max(maxDev, r.maxDeviation);
      segTotal += r.mainSegCount;
    }
    expect(segTotal).toBeGreaterThan(1000);
    expect(maxDev).toBeLessThan(0.01);
  });

  it('含噪声随机地形（鞍部多）：逐段一致，偏差 < 0.01 格', () => {
    const grid = generateTerrain({
      cols: 120, rows: 90, cellSize: 30,
      peaks: [
        { x: 1000, y: 1000, height: 800, sigma: 300 },
        { x: 2500, y: 1800, height: 600, sigma: 250 },
      ],
      noise: 40, seed: 7,
    });
    const st = gridStats(grid);
    for (const lv of levelSequence(st.min, st.max, 40)) {
      const r = compareImplementations(grid, lv);
      expect(r.matched, `level=${lv} 段数不一致`).toBe(true);
      expect(r.maxDeviation).toBeLessThan(0.01);
    }
  });

  it('缺失值（NaN）地形：两实现同样一致', () => {
    const grid = generateTerrain({
      cols: 60, rows: 50, cellSize: 20,
      peaks: [{ x: 600, y: 500, height: 500, sigma: 200 }],
    });
    // 挖两块缺失区
    for (let j = 10; j < 18; j++) for (let i = 10; i < 18; i++) grid.data[j * 60 + i] = NaN;
    for (let j = 30; j < 36; j++) for (let i = 40; i < 50; i++) grid.data[j * 60 + i] = NaN;
    const st = gridStats(grid);
    for (const lv of levelSequence(st.min, st.max, 50)) {
      const r = compareImplementations(grid, lv);
      expect(r.matched, `level=${lv} 段数不一致`).toBe(true);
      expect(r.maxDeviation).toBeLessThan(0.01);
    }
  });
});

describe('等高线位置精度（对解析真值）', () => {
  it('平面场等值线位置数学精确（受 Float32 存储精度限制）', () => {
    // z = 0.06x + 0.08y（x,y 为米）⇒ 格网坐标下 z = 0.6i + 0.8j
    const grid = generateTerrain({ cols: 60, rows: 50, cellSize: 10, tiltX: 0.06, tiltY: 0.08, peaks: [] });
    // z 范围 0 – 74.6
    for (const level of [10, 25, 37.5, 60]) {
      const lines = traceLevel(grid, level);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        for (const [i, j] of line.points) {
          const err = Math.abs(0.6 * i + 0.8 * j - level) / Math.hypot(0.6, 0.8);
          // 高程以 Float32 存储（相对误差 ~1e-7），位置误差限 1e-5 格
          expect(err).toBeLessThan(1e-5);
        }
      }
    }
  });

  it('孤立峰周围的等高线应闭合', () => {
    const grid = generateTerrain({
      cols: 100, rows: 100, cellSize: 10,
      peaks: [{ x: 500, y: 500, height: 500, sigma: 150 }],
    });
    const lines = traceLevel(grid, 250);
    expect(lines.length).toBeGreaterThan(0);
    // 250m 等值线只环绕主峰，应全部闭合
    expect(lines.every((l) => l.closed)).toBe(true);
    // 闭合环应大致是以 (50,50) 格为中心的环，半径约 sigma*sqrt(2*ln(500/250))/cell ≈ 17.6 格
    for (const line of lines) {
      for (const [i, j] of line.points) {
        const r = Math.hypot(i - 50, j - 50);
        expect(r).toBeGreaterThan(10);
        expect(r).toBeLessThan(26);
      }
    }
  });

  it('参考实现与主实现段端点坐标完全一致（浮点级）', () => {
    const grid = generateTerrain({
      cols: 40, rows: 30, cellSize: 15,
      peaks: [{ x: 300, y: 220, height: 300, sigma: 100 }],
    });
    const level = 120;
    const main = traceLevel(grid, level);
    const mainSegs: string[] = [];
    for (const line of main) {
      const pts = line.points;
      const n = pts.length;
      const count = line.closed ? n : n - 1; // 闭合环含首尾相连的一段
      for (let k = 0; k < count; k++) {
        const p0 = pts[k];
        const p1 = pts[(k + 1) % n];
        const a = `${p0[0].toPrecision(17)},${p0[1].toPrecision(17)}`;
        const b = `${p1[0].toPrecision(17)},${p1[1].toPrecision(17)}`;
        mainSegs.push(a < b ? `${a}|${b}` : `${b}|${a}`);
      }
    }
    const refSegs = segmentsForLevel(grid, level).map((s) => {
      const a = `${s.x1.toPrecision(17)},${s.y1.toPrecision(17)}`;
      const b = `${s.x2.toPrecision(17)},${s.y2.toPrecision(17)}`;
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    });
    expect(mainSegs.sort()).toEqual(refSegs.sort());
  });
});
