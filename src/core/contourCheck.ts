import { ElevationGrid } from './grid';
import { traceLevel, ContourLine } from './marchingSquares';
import { segmentsForLevel, Segment } from './marchingSquaresRef';

/**
 * 主实现（连通多段线）与参考实现（逐单元线段）的逐段核对。
 * 两边线段集合规范化后排序逐一配对，报告最大端点偏差（单位：格）。
 */

function linesToSegments(lines: ContourLine[]): Segment[] {
  const segs: Segment[] = [];
  for (const line of lines) {
    const pts = line.points;
    for (let k = 0; k + 1 < pts.length; k++) {
      segs.push({ x1: pts[k][0], y1: pts[k][1], x2: pts[k + 1][0], y2: pts[k + 1][1] });
    }
    if (line.closed && pts.length > 1) {
      const a = pts[pts.length - 1], b = pts[0];
      segs.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
    }
  }
  return segs;
}

/** 规范化：端点按字典序排列，坐标保留全精度 */
function normKey(s: Segment): string {
  const a = `${s.x1.toPrecision(17)},${s.y1.toPrecision(17)}`;
  const b = `${s.x2.toPrecision(17)},${s.y2.toPrecision(17)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface CompareResult {
  level: number;
  mainSegCount: number;
  refSegCount: number;
  /** 配对线段端点的最大偏差（格） */
  maxDeviation: number;
  /** 数量不一致或存在无法配对的线段 */
  matched: boolean;
}

export function compareImplementations(g: ElevationGrid, level: number): CompareResult {
  const mainSegs = linesToSegments(traceLevel(g, level));
  const refSegs = segmentsForLevel(g, level);

  const mainKeys = mainSegs.map(normKey).sort();
  const refKeys = refSegs.map(normKey).sort();

  let matched = mainKeys.length === refKeys.length;
  let maxDeviation = 0;

  if (matched) {
    // 键完全相同 ⇒ 逐段一致；再算一次数值偏差（应≈0，仅受浮点求值顺序影响）
    for (let k = 0; k < mainKeys.length; k++) {
      if (mainKeys[k] !== refKeys[k]) { matched = false; break; }
    }
  }

  if (!matched) {
    // 用多重集合配对，尽量给出偏差估计
    const refPool = new Map<string, Segment[]>();
    for (const s of refSegs) {
      const k = normKey(s);
      const arr = refPool.get(k);
      if (arr) arr.push(s); else refPool.set(k, [s]);
    }
    let unmatched = 0;
    for (const s of mainSegs) {
      const k = normKey(s);
      const arr = refPool.get(k);
      if (arr && arr.length > 0) arr.pop();
      else unmatched++;
    }
    if (unmatched > 0) matched = false;
  }

  // 数值偏差：按键配对后比较端点距离
  if (matched) {
    const refByKey = new Map<string, Segment[]>();
    for (const s of refSegs) {
      const k = normKey(s);
      const arr = refByKey.get(k);
      if (arr) arr.push(s); else refByKey.set(k, [s]);
    }
    for (const s of mainSegs) {
      const arr = refByKey.get(normKey(s));
      if (!arr || arr.length === 0) continue;
      const r = arr.pop()!;
      const d1 = Math.hypot(s.x1 - r.x1, s.y1 - r.y1) + Math.hypot(s.x2 - r.x2, s.y2 - r.y2);
      const d2 = Math.hypot(s.x1 - r.x2, s.y1 - r.y2) + Math.hypot(s.x2 - r.x1, s.y2 - r.y1);
      maxDeviation = Math.max(maxDeviation, Math.min(d1, d2));
    }
  }

  return {
    level,
    mainSegCount: mainSegs.length,
    refSegCount: refSegs.length,
    maxDeviation,
    matched,
  };
}
