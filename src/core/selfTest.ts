import { generateTerrain, analyticZ, demoTerrain } from './testTerrain';
import { compareImplementations } from './contourCheck';
import { levelSequence, traceLevel } from './marchingSquares';
import { gridStats } from './grid';
import { routeStats } from './profile';

export interface SelfTestReport {
  lines: string[];
  pass: boolean;
}

/**
 * 精度自检（浏览器「设置」页与 vitest 共用同一套逻辑）：
 * 1. 等高线：主实现 vs 独立参考实现，逐段核对，偏差须 < 0.01 格；
 * 2. 等高线位置：平面场上等值线位置应数学精确；
 * 3. 累计爬升：平面场解析解 + 已知峰高高斯场，误差须 < 1%。
 */
export function runSelfTest(): SelfTestReport {
  const lines: string[] = [];
  let pass = true;
  const ok = (cond: boolean, msg: string) => {
    lines.push(`${cond ? '✅' : '❌'} ${msg}`);
    if (!cond) pass = false;
  };

  /* ---- 1. 双实现逐段核对 ---- */
  {
    const { grid } = demoTerrain();
    const st = gridStats(grid);
    const levels = levelSequence(st.min, st.max, 50);
    let maxDev = 0;
    let segTotal = 0;
    let allMatched = true;
    for (const lv of levels) {
      const r = compareImplementations(grid, lv);
      if (!r.matched) allMatched = false;
      maxDev = Math.max(maxDev, r.maxDeviation);
      segTotal += r.mainSegCount;
    }
    ok(allMatched && maxDev < 0.01,
      `等高线双实现逐段核对（演示地形，${levels.length} 个等值面，共 ${segTotal} 段）：最大偏差 ${maxDev.toExponential(2)} 格（限差 0.01）`);
  }
  {
    // 含噪声的随机地形，鞍部更多
    const grid = generateTerrain({
      cols: 120, rows: 90, cellSize: 30,
      peaks: [
        { x: 1000, y: 1000, height: 800, sigma: 300 },
        { x: 2500, y: 1800, height: 600, sigma: 250 },
      ],
      noise: 40, seed: 7,
    });
    const st = gridStats(grid);
    const levels = levelSequence(st.min, st.max, 40);
    let maxDev = 0;
    let allMatched = true;
    let segTotal = 0;
    for (const lv of levels) {
      const r = compareImplementations(grid, lv);
      if (!r.matched) allMatched = false;
      maxDev = Math.max(maxDev, r.maxDeviation);
      segTotal += r.mainSegCount;
    }
    ok(allMatched && maxDev < 0.01,
      `等高线双实现逐段核对（含噪声地形，${levels.length} 个等值面，共 ${segTotal} 段）：最大偏差 ${maxDev.toExponential(2)} 格（限差 0.01）`);
  }

  /* ---- 2. 平面场等值线位置 ---- */
  {
    // z = 0.6i + 0.8j（格网坐标），等值线 L 应满足 0.6i + 0.8j = L；z 范围 0–74.6
    const grid = generateTerrain({ cols: 60, rows: 50, cellSize: 10, tiltX: 0.06, tiltY: 0.08, peaks: [] });
    const level = 50;
    const r = compareImplementations(grid, level);
    // 位置真值检查在主实现的输出上做
    const contourLines = traceLevel(grid, level);
    let maxPosErr = 0;
    let pointCount = 0;
    for (const line of contourLines) {
      for (const [i, j] of line.points) {
        // 格网坐标下 z = 0.06*(i*10) + 0.08*(j*10) = 0.6i + 0.8j
        maxPosErr = Math.max(maxPosErr, Math.abs(0.6 * i + 0.8 * j - level) / Math.hypot(0.6, 0.8));
        pointCount++;
      }
    }
    ok(r.matched && pointCount > 0 && maxPosErr < 1e-5,
      `平面场等值线位置（${pointCount} 个顶点）：最大位置误差 ${maxPosErr.toExponential(2)} 格（Float32 存储精度内，限差 1e-5）`);
  }

  /* ---- 3. 累计爬升 ---- */
  {
    // 平面场：z = 0.05x + 0.03y，沿 (0,0)→(2000,1500) 的爬升解析解
    const grid = generateTerrain({ cols: 81, rows: 61, cellSize: 25, tiltX: 0.05, tiltY: 0.03, peaks: [] });
    const stats = routeStats(grid, [[0, 0], [2000, 1500]]);
    const expected = 0.05 * 2000 + 0.03 * 1500;
    const err = Math.abs(stats.ascent - expected) / expected;
    ok(err < 0.01, `累计爬升（平面场）：实测 ${stats.ascent.toFixed(2)}m，解析 ${expected.toFixed(2)}m，误差 ${(err * 100).toFixed(4)}%（限差 1%）`);
  }
  {
    // 单高斯峰：山脚→峰顶单调爬升，累计爬升 = 峰顶解析高程 - 起点高程
    const opts = {
      cols: 161, rows: 161, cellSize: 20,
      peaks: [{ x: 1600, y: 1600, height: 1200, sigma: 400 }],
    };
    const grid = generateTerrain(opts);
    const start: [number, number] = [200, 300];
    const summit: [number, number] = [1600, 1600];
    const stats = routeStats(grid, [start, summit]);
    const expected = analyticZ(opts, summit[0], summit[1]) - analyticZ(opts, start[0], start[1]);
    const err = Math.abs(stats.ascent - expected) / expected;
    ok(err < 0.01, `累计爬升（高斯峰，峰高 1200m）：实测 ${stats.ascent.toFixed(2)}m，解析 ${expected.toFixed(2)}m，误差 ${(err * 100).toFixed(3)}%（限差 1%）`);
  }

  return { lines, pass };
}
