import { ElevationGrid, bilinear } from './grid';

export interface ProfilePoint {
  /** 距路线起点里程（米） */
  d: number;
  /** 高程（米），缺失为 NaN */
  z: number;
  x: number;
  y: number;
}

export interface RouteStats {
  distance: number;
  ascent: number;
  descent: number;
  minZ: number;
  maxZ: number;
  profile: ProfilePoint[];
}

/**
 * 沿折线等距采样（双线性插值），统计里程 / 累计爬升 / 累计下降。
 * 采样步长默认半格；缺失值区段不计入爬升（断开处理）。
 */
export function routeStats(g: ElevationGrid, pts: Array<[number, number]>, step?: number): RouteStats {
  const h = step ?? g.cellSize / 2;
  const profile: ProfilePoint[] = [];
  let distance = 0;

  for (let k = 0; k + 1 < pts.length; k++) {
    const [x0, y0] = pts[k];
    const [x1, y1] = pts[k + 1];
    const segLen = Math.hypot(x1 - x0, y1 - y0);
    if (segLen === 0) continue;
    const n = Math.max(1, Math.ceil(segLen / h));
    const startK = k === 0 ? 0 : 1; // 避免节点重复采样
    for (let s = startK; s <= n; s++) {
      const t = s / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      profile.push({ d: distance + segLen * t, z: bilinear(g, x, y), x, y });
    }
    distance += segLen;
  }
  if (pts.length === 1) {
    profile.push({ d: 0, z: bilinear(g, pts[0][0], pts[0][1]), x: pts[0][0], y: pts[0][1] });
  }

  let ascent = 0, descent = 0, minZ = Infinity, maxZ = -Infinity;
  let prevZ = NaN;
  for (const p of profile) {
    if (!Number.isNaN(p.z)) {
      if (!Number.isNaN(prevZ)) {
        const dz = p.z - prevZ;
        if (dz > 0) ascent += dz; else descent -= dz;
      }
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      prevZ = p.z;
    } else {
      prevZ = NaN; // 缺失区段断开，不跨段累计
    }
  }
  if (!Number.isFinite(minZ)) { minZ = 0; maxZ = 0; }
  return { distance, ascent, descent, minZ, maxZ, profile };
}

/** 折线总长的纯几何计算（不依赖高程），供测试独立核对 */
export function polylineLength(pts: Array<[number, number]>): number {
  let d = 0;
  for (let k = 0; k + 1 < pts.length; k++) d += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
  return d;
}
