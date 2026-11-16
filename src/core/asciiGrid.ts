import { ElevationGrid, makeGrid } from './grid';

/**
 * Esri ASCII Grid (.asc) 解析。
 * 支持 xllcorner/xllcenter、yllcorner/yllcenter、NODATA_value（大小写不敏感）。
 * 文件第 0 行是北侧行，内部存储第 0 行是南侧行，解析时翻转。
 */
export function parseAsciiGrid(text: string): ElevationGrid {
  // 容忍 \r\n、多余空白
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  let p = 0;
  const header: Record<string, number> = {};
  const keys = ['ncols', 'nrows', 'xllcorner', 'yllcorner', 'xllcenter', 'yllcenter', 'cellsize', 'nodata_value'];
  // 头部：连续的 "关键字 数值" 对
  while (p + 1 < tokens.length && keys.includes(tokens[p].toLowerCase())) {
    const key = tokens[p].toLowerCase();
    const val = Number(tokens[p + 1]);
    if (!Number.isFinite(val)) throw new Error(`头部字段 ${key} 的值无效: "${tokens[p + 1]}"`);
    header[key] = val;
    p += 2;
  }
  const ncols = header['ncols'];
  const nrows = header['nrows'];
  const cellsize = header['cellsize'];
  if (!ncols || !nrows || !cellsize || ncols < 2 || nrows < 2) {
    throw new Error('头部缺少 ncols/nrows/cellsize 或取值无效');
  }
  if (header['xllcorner'] === undefined && header['xllcenter'] === undefined) {
    throw new Error('头部缺少 xllcorner 或 xllcenter');
  }
  if (header['yllcorner'] === undefined && header['yllcenter'] === undefined) {
    throw new Error('头部缺少 yllcorner 或 yllcenter');
  }
  const nodata = header['nodata_value'];
  const xll = header['xllcorner'] !== undefined ? header['xllcorner'] : header['xllcenter'] - cellsize / 2;
  const yll = header['yllcorner'] !== undefined ? header['yllcorner'] : header['yllcenter'] - cellsize / 2;

  const expect = ncols * nrows;
  if (tokens.length - p < expect) {
    throw new Error(`数据不足: 需要 ${expect} 个高程值，实际 ${tokens.length - p} 个`);
  }
  const g = makeGrid(ncols, nrows, cellsize, xll, yll);
  for (let r = 0; r < nrows; r++) {
    const j = nrows - 1 - r; // 文件首行 = 北侧 = 内部最后一行
    for (let i = 0; i < ncols; i++) {
      const v = Number(tokens[p++]);
      const isNodata = !Number.isFinite(v) || (nodata !== undefined && v === nodata);
      g.data[j * ncols + i] = isNodata ? NaN : v;
    }
  }
  return g;
}

/** 导出为 Esri ASCII Grid（首行写北侧行） */
export function toAsciiGrid(g: ElevationGrid, nodataValue = -9999): string {
  const lines: string[] = [
    `ncols ${g.cols}`,
    `nrows ${g.rows}`,
    `xllcorner ${g.x0}`,
    `yllcorner ${g.y0}`,
    `cellsize ${g.cellSize}`,
    `NODATA_value ${nodataValue}`,
  ];
  for (let r = 0; r < g.rows; r++) {
    const j = g.rows - 1 - r;
    const parts: string[] = [];
    for (let i = 0; i < g.cols; i++) {
      const v = g.data[j * g.cols + i];
      parts.push(Number.isNaN(v) ? String(nodataValue) : String(Math.round(v * 1000) / 1000));
    }
    lines.push(parts.join(' '));
  }
  return lines.join('\n') + '\n';
}

/**
 * 缺失值填充：迭代地用有效邻居均值填空，直到填满或无可再填。
 * 返回填充的单元数。原有效值不变。
 */
export function fillNodata(g: ElevationGrid, maxPasses = 1000): number {
  let filled = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    const toFill: Array<[number, number, number]> = [];
    for (let j = 0; j < g.rows; j++) {
      for (let i = 0; i < g.cols; i++) {
        if (!Number.isNaN(g.data[j * g.cols + i])) continue;
        let sum = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (di === 0 && dj === 0) continue;
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= g.cols || jj >= g.rows) continue;
            const v = g.data[jj * g.cols + ii];
            if (!Number.isNaN(v)) { sum += v; n++; }
          }
        }
        if (n > 0) toFill.push([i, j, sum / n]);
      }
    }
    if (toFill.length === 0) break;
    for (const [i, j, v] of toFill) g.data[j * g.cols + i] = v;
    filled += toFill.length;
  }
  return filled;
}
