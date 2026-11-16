import { ElevationGrid } from './grid';

/**
 * Marching Squares 等高线追踪 —— 主实现。
 * 产出按连通性组织的多段线（开口线 + 闭合环）。
 *
 * 约定（与参考实现 marchingSquaresRef.ts 完全一致，见该文件开头的核对说明）：
 * - 单元角点：BL=(i,j) BR=(i+1,j) TR=(i+1,j+1) TL=(i,j+1)，角点值 >= 等值记为"高"。
 * - 边上交点用线性插值：t = (L - z0) / (z1 - z0)。
 * - 鞍部（case 5 / 10）用中心均值裁决：四角均值 >= L 时高区连通。
 * - 任一角点为 NaN（缺失）的单元整体跳过。
 * - 坐标为格网索引坐标（列, 行），可为小数；转地图米用 gridToMap。
 */

export interface ContourLine {
  level: number;
  /** 格网索引坐标序列 */
  points: Array<[number, number]>;
  closed: boolean;
}

/** 边编号：0=底 1=右 2=顶 3=左 */
const EDGE_BOTTOM = 0, EDGE_RIGHT = 1, EDGE_TOP = 2, EDGE_LEFT = 3;

/** 每个 case 的连线表：每段为 [边A, 边B]。鞍部在运行时按中心均值二选一。 */
function caseSegments(caseIdx: number, centerHigh: boolean): Array<[number, number]> {
  switch (caseIdx) {
    case 1: case 14: return [[EDGE_LEFT, EDGE_BOTTOM]];
    case 2: case 13: return [[EDGE_BOTTOM, EDGE_RIGHT]];
    case 3: case 12: return [[EDGE_LEFT, EDGE_RIGHT]];
    case 4: case 11: return [[EDGE_RIGHT, EDGE_TOP]];
    case 5: return centerHigh
      ? [[EDGE_BOTTOM, EDGE_RIGHT], [EDGE_TOP, EDGE_LEFT]]
      : [[EDGE_LEFT, EDGE_BOTTOM], [EDGE_RIGHT, EDGE_TOP]];
    case 6: case 9: return [[EDGE_BOTTOM, EDGE_TOP]];
    case 7: case 8: return [[EDGE_TOP, EDGE_LEFT]];
    case 10: return centerHigh
      ? [[EDGE_LEFT, EDGE_BOTTOM], [EDGE_RIGHT, EDGE_TOP]]
      : [[EDGE_BOTTOM, EDGE_RIGHT], [EDGE_TOP, EDGE_LEFT]];
    default: return [];
  }
}

interface Node {
  x: number;
  y: number;
  adj: number[]; // 相邻节点 id
}

export function traceLevel(g: ElevationGrid, level: number): ContourLine[] {
  const { cols, rows, data } = g;
  // 水平边 (i,j)-(i+1,j)：hid = j*(cols-1)+i，i∈[0,cols-2], j∈[0,rows-1]
  // 垂直边 (i,j)-(i,j+1)：vid = j*cols+i，    i∈[0,cols-1], j∈[0,rows-2]
  const hCount = (cols - 1) * rows;
  const vCount = cols * (rows - 1);
  // 交点坐标缓存，NaN 表示未计算/无交点
  const hX = new Float64Array(hCount).fill(NaN);
  const hY = new Float64Array(hCount).fill(NaN);
  const vX = new Float64Array(vCount).fill(NaN);
  const vY = new Float64Array(vCount).fill(NaN);
  const hHas = new Uint8Array(hCount); // 有交点
  const vHas = new Uint8Array(vCount);
  const hDone = new Uint8Array(hCount); // 已计算过（无论有无交点）
  const vDone = new Uint8Array(vCount);

  const crossH = (i: number, j: number): void => {
    const id = j * (cols - 1) + i;
    const z0 = data[j * cols + i], z1 = data[j * cols + i + 1];
    if ((z0 < level) !== (z1 < level)) {
      const t = (level - z0) / (z1 - z0);
      hX[id] = i + t; hY[id] = j;
      hHas[id] = 1;
    }
    hDone[id] = 1;
  };
  const crossV = (i: number, j: number): void => {
    const id = j * cols + i;
    const z0 = data[j * cols + i], z1 = data[(j + 1) * cols + i];
    if ((z0 < level) !== (z1 < level)) {
      const t = (level - z0) / (z1 - z0);
      vX[id] = i; vY[id] = j + t;
      vHas[id] = 1;
    }
    vDone[id] = 1;
  };

  // 节点表：key = 边标识。水平边 key = hid，垂直边 key = hCount + vid
  const nodes: Node[] = [];
  const nodeIdOf = new Int32Array(hCount + vCount).fill(-1);
  const getNode = (key: number, x: number, y: number): number => {
    let id = nodeIdOf[key];
    if (id < 0) {
      id = nodes.length;
      nodeIdOf[key] = id;
      nodes.push({ x, y, adj: [] });
    }
    return id;
  };
  const addSeg = (ka: number, xa: number, ya: number, kb: number, xb: number, yb: number) => {
    const a = getNode(ka, xa, ya);
    const b = getNode(kb, xb, yb);
    nodes[a].adj.push(b);
    nodes[b].adj.push(a);
  };

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const zBL = data[j * cols + i];
      const zBR = data[j * cols + i + 1];
      const zTR = data[(j + 1) * cols + i + 1];
      const zTL = data[(j + 1) * cols + i];
      if (Number.isNaN(zBL) || Number.isNaN(zBR) || Number.isNaN(zTR) || Number.isNaN(zTL)) continue;
      const caseIdx =
        (zBL >= level ? 1 : 0) | (zBR >= level ? 2 : 0) | (zTR >= level ? 4 : 0) | (zTL >= level ? 8 : 0);
      if (caseIdx === 0 || caseIdx === 15) continue;
      const centerHigh = (zBL + zBR + zTR + zTL) / 4 >= level;

      // 四条边的交点（按需计算并缓存，跨单元共享，保证连通性逐点一致）
      const edgeInfo = (edge: number): [number, number, number] | null => {
        if (edge === EDGE_BOTTOM || edge === EDGE_TOP) {
          const jj = edge === EDGE_BOTTOM ? j : j + 1;
          const id = jj * (cols - 1) + i;
          if (!hDone[id]) crossH(i, jj);
          if (!hHas[id]) return null;
          return [id, hX[id], hY[id]];
        } else {
          const ii = edge === EDGE_LEFT ? i : i + 1;
          const id = j * cols + ii;
          if (!vDone[id]) crossV(ii, j);
          if (!vHas[id]) return null;
          return [hCount + id, vX[id], vY[id]];
        }
      };

      for (const [eA, eB] of caseSegments(caseIdx, centerHigh)) {
        const a = edgeInfo(eA);
        const b = edgeInfo(eB);
        if (!a || !b) continue;
        addSeg(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    }
  }

  // 由邻接表走出多段线
  const lines: ContourLine[] = [];
  const visitedSeg = new Set<string>();
  const segKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

  const walk = (start: number): ContourLine | null => {
    const pts: Array<[number, number]> = [[nodes[start].x, nodes[start].y]];
    let prev = -1, cur = start;
    let closed = false;
    for (;;) {
      const n = nodes[cur];
      let next = -1;
      for (const nb of n.adj) {
        if (nb === prev) continue;
        if (visitedSeg.has(segKey(cur, nb))) continue;
        next = nb;
        break;
      }
      if (next < 0) break;
      visitedSeg.add(segKey(cur, next));
      prev = cur;
      cur = next;
      if (cur === start) { closed = true; break; }
      pts.push([nodes[cur].x, nodes[cur].y]);
    }
    if (pts.length < 2 && !closed) return null;
    return { level, points: pts, closed };
  };

  // 开口线：从度为 1 的节点出发
  for (let id = 0; id < nodes.length; id++) {
    if (nodes[id].adj.length === 1) {
      const line = walk(id);
      if (line) lines.push(line);
    }
  }
  // 闭合环：剩余未走的边
  for (let id = 0; id < nodes.length; id++) {
    if (nodes[id].adj.length === 0) continue;
    const unvisited = nodes[id].adj.some((nb) => !visitedSeg.has(segKey(id, nb)));
    if (unvisited) {
      const line = walk(id);
      if (line) lines.push(line);
    }
  }
  return lines;
}

/** 按间距生成等值面序列 */
export function levelSequence(zMin: number, zMax: number, interval: number): number[] {
  const levels: number[] = [];
  const start = Math.ceil(zMin / interval) * interval;
  for (let l = start; l <= zMax + 1e-9; l += interval) levels.push(Math.round(l * 1e6) / 1e6);
  return levels;
}

export function traceContours(g: ElevationGrid, levels: number[]): ContourLine[] {
  const out: ContourLine[] = [];
  for (const l of levels) out.push(...traceLevel(g, l));
  return out;
}
