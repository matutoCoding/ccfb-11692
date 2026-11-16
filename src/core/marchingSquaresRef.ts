import { ElevationGrid } from './grid';

/**
 * Marching Squares 参考实现 —— 独立编写，用于与主实现逐段核对。
 *
 * 与主实现（marchingSquares.ts）的差异：
 * - 不做连通性追踪，逐单元直接输出无序线段（segment soup）；
 * - 每条边交点在相邻两个单元中各自重算（不共享缓存）；
 * - 用 switch 全表而非函数式连线表。
 *
 * 与主实现必须保持一致的数学约定（否则比对必然失败，这正是核对的意义）：
 * - 角点值 >= 等值记为"高"，case 位序 BL|BR|TR|TL = 1|2|4|8；
 * - 交点线性插值 t = (L - z0)/(z1 - z0)；
 * - 鞍部 case 5/10 用四角均值裁决：均值 >= L 时高区连通；
 * - 含 NaN 角点的单元跳过；
 * - 输出坐标为格网索引坐标。
 */

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function segmentsForLevel(g: ElevationGrid, level: number): Segment[] {
  const { cols, rows, data } = g;
  const segs: Segment[] = [];

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const bl = data[j * cols + i];
      const br = data[j * cols + i + 1];
      const tr = data[(j + 1) * cols + i + 1];
      const tl = data[(j + 1) * cols + i];
      if (Number.isNaN(bl) || Number.isNaN(br) || Number.isNaN(tr) || Number.isNaN(tl)) continue;

      let idx = 0;
      if (bl >= level) idx |= 1;
      if (br >= level) idx |= 2;
      if (tr >= level) idx |= 4;
      if (tl >= level) idx |= 8;
      if (idx === 0 || idx === 15) continue;

      // 四条边交点（本单元内独立重算）
      // 底边: (i,j)-(i+1,j)；右边: (i+1,j)-(i+1,j+1)；顶边: (i,j+1)-(i+1,j+1)；左边: (i,j)-(i,j+1)
      const bottom: [number, number] = [i + (level - bl) / (br - bl), j];
      const right: [number, number] = [i + 1, j + (level - br) / (tr - br)];
      const top: [number, number] = [i + (level - tl) / (tr - tl), j + 1];
      const left: [number, number] = [i, j + (level - bl) / (tl - bl)];

      const push = (a: [number, number], b: [number, number]) => {
        segs.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
      };

      switch (idx) {
        case 1: case 14: push(left, bottom); break;
        case 2: case 13: push(bottom, right); break;
        case 3: case 12: push(left, right); break;
        case 4: case 11: push(right, top); break;
        case 6: case 9: push(bottom, top); break;
        case 7: case 8: push(top, left); break;
        case 5: {
          const centerHigh = (bl + br + tr + tl) / 4 >= level;
          if (centerHigh) { push(bottom, right); push(top, left); }
          else { push(left, bottom); push(right, top); }
          break;
        }
        case 10: {
          const centerHigh = (bl + br + tr + tl) / 4 >= level;
          if (centerHigh) { push(left, bottom); push(right, top); }
          else { push(bottom, right); push(top, left); }
          break;
        }
      }
    }
  }
  return segs;
}
