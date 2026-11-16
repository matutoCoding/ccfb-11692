import { describe, it, expect } from 'vitest';
import { runSelfTest } from '../src/core/selfTest';
import { demoTerrain, analyticZ, demoValleyZ } from '../src/core/testTerrain';
import { gridStats } from '../src/core/grid';

describe('精度自检（与浏览器设置页同一套逻辑）', () => {
  it('全部通过', () => {
    const report = runSelfTest();
    if (!report.pass) console.error(report.lines.join('\n'));
    expect(report.pass).toBe(true);
  });
});

describe('测试地形生成器', () => {
  it('峰顶格网值与解析高程一致（< 0.01m）', () => {
    const { grid, peaks } = demoTerrain();
    for (const pk of peaks) {
      const i = Math.round(pk.x / grid.cellSize);
      const j = Math.round(pk.y / grid.cellSize);
      const gridZ = grid.data[j * grid.cols + i];
      // 峰顶恰在节点上，格网值 = 解析值 + 山谷修正
      const analytic = analyticZ(
        { cols: grid.cols, rows: grid.rows, cellSize: grid.cellSize, base: 320, tiltX: 0.004, tiltY: 0.002, peaks },
        pk.x, pk.y,
      ) + demoValleyZ(pk.x, pk.y);
      expect(Math.abs(gridZ - analytic)).toBeLessThan(0.01);
      // 且接近标称峰高（其它峰拖尾贡献 < 1m）
      expect(Math.abs(gridZ - (320 + 0.004 * pk.x + 0.002 * pk.y + pk.height))).toBeLessThan(1.0);
    }
  });

  it('统计范围合理', () => {
    const { grid } = demoTerrain();
    const st = gridStats(grid);
    expect(st.nodataCount).toBe(0);
    expect(st.max).toBeGreaterThan(1500);
    expect(st.min).toBeGreaterThan(100);
  });
});
