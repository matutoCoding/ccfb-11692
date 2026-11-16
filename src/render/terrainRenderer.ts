import { ElevationGrid } from '../core/grid';

export interface LightSpec {
  /** 方位角，度，自北顺时针 */
  azimuth: number;
  /** 高度角，度 */
  altitude: number;
  /** 混合权重 */
  weight: number;
  enabled: boolean;
}

export interface TerrainStyle {
  lights: LightSpec[];
  /** 环境光 0..1 */
  ambient: number;
  /** 垂直夸张 */
  vertEx: number;
  shadeEnabled: boolean;
  tintEnabled: boolean;
  zMin: number;
  zMax: number;
}

const NODATA_SENTINEL = -1.0e38;

const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uElev;
uniform sampler2D uRamp;
uniform ivec2 uGridSize;
uniform vec2 uOrigin;      // 格网 (0,0) 节点的地图米坐标
uniform float uCell;
uniform vec2 uViewMin;     // 视口左下角地图米坐标
uniform vec2 uViewSize;    // 视口尺寸（米）
uniform float uVertEx;
uniform float uAmbient;
uniform float uZMin, uZMax;
uniform float uShadeOn, uTintOn;
uniform vec3 uLights[4];
uniform float uWeights[4];
uniform int uNumLights;
in vec2 vUv;
out vec4 outColor;

float zAt(ivec2 ij){
  ij = clamp(ij, ivec2(0), uGridSize - 1);
  return texelFetch(uElev, ij, 0).r;
}

void main(){
  vec2 m = uViewMin + vUv * uViewSize;
  vec2 g = (m - uOrigin) / uCell;
  if (g.x < -0.5 || g.y < -0.5 || g.x > float(uGridSize.x) - 0.5 || g.y > float(uGridSize.y) - 0.5) {
    outColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }
  ivec2 ij = ivec2(clamp(g + 0.5, vec2(0.0), vec2(uGridSize - 1)));
  float z = zAt(ij);
  if (z <= -1.0e30) { outColor = vec4(0.0, 0.0, 0.0, 0.0); return; }

  // 中央差分求梯度；缺失邻居回退为单侧/自身
  float zx1 = zAt(ij + ivec2(1,0));  if (zx1 <= -1.0e30) zx1 = z;
  float zx0 = zAt(ij + ivec2(-1,0)); if (zx0 <= -1.0e30) zx0 = z;
  float zy1 = zAt(ij + ivec2(0,1));  if (zy1 <= -1.0e30) zy1 = z;
  float zy0 = zAt(ij + ivec2(0,-1)); if (zy0 <= -1.0e30) zy0 = z;
  float dzdx = (zx1 - zx0) / (2.0 * uCell) * uVertEx;
  float dzdy = (zy1 - zy0) / (2.0 * uCell) * uVertEx;
  vec3 n = normalize(vec3(-dzdx, -dzdy, 1.0));

  float shade = 0.0;
  float wsum = 0.0;
  for (int k = 0; k < 4; k++) {
    if (k >= uNumLights) break;
    shade += uWeights[k] * max(dot(n, uLights[k]), 0.0);
    wsum += uWeights[k];
  }
  if (wsum > 0.0) shade /= wsum;
  shade = uAmbient + (1.0 - uAmbient) * clamp(shade, 0.0, 1.0);

  float t = clamp((z - uZMin) / max(uZMax - uZMin, 1e-6), 0.0, 1.0);
  vec3 tint = texture(uRamp, vec2(t, 0.5)).rgb;

  vec3 base = mix(vec3(0.92), tint, uTintOn);
  float s = mix(1.0, shade, uShadeOn);
  outColor = vec4(base * s, 1.0);
}`;

export function lightVector(azimuthDeg: number, altitudeDeg: number): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180;
  const alt = (altitudeDeg * Math.PI) / 180;
  // x 向东，y 向北，方位角自北顺时针
  return [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)];
}

export class TerrainRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private rampTex: WebGLTexture | null = null;
  private grid: ElevationGrid | null = null;
  private locs: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
    if (this.gl) this.init();
  }

  get supported(): boolean {
    return this.gl !== null;
  }

  private init() {
    const gl = this.gl!;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('着色器编译失败: ' + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('着色器链接失败: ' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (const name of ['uElev', 'uRamp', 'uGridSize', 'uOrigin', 'uCell', 'uViewMin', 'uViewSize',
      'uVertEx', 'uAmbient', 'uZMin', 'uZMax', 'uShadeOn', 'uTintOn', 'uNumLights',
      'uLights[0]', 'uWeights[0]']) {
      this.locs[name] = gl.getUniformLocation(prog, name);
    }
    this.tex = gl.createTexture();
    this.rampTex = gl.createTexture();
  }

  setGrid(grid: ElevationGrid | null) {
    this.grid = grid;
    if (!this.gl || !this.tex) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (grid) {
      // NaN → 哨兵值，着色器按 <= -1e30 判缺失
      const packed = new Float32Array(grid.data.length);
      for (let k = 0; k < grid.data.length; k++) {
        packed[k] = Number.isNaN(grid.data[k]) ? NODATA_SENTINEL : grid.data[k];
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, grid.cols, grid.rows, 0, gl.RED, gl.FLOAT, packed);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([NODATA_SENTINEL]));
    }
  }

  setRamp(lut: Uint8Array) {
    if (!this.gl || !this.rampTex) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.rampTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lut.length / 4, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut);
  }

  /** viewMin/viewSize：视口在地图米坐标下的范围 */
  render(style: TerrainStyle, viewMin: [number, number], viewSize: [number, number]) {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    // 离屏画布（未挂载）clientWidth 为 0，此时直接使用画布已有尺寸
    const attached = this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0;
    const dpr = attached ? window.devicePixelRatio || 1 : 1;
    const w = attached ? Math.max(1, Math.round(this.canvas.clientWidth * dpr)) : this.canvas.width;
    const h = attached ? Math.max(1, Math.round(this.canvas.clientHeight * dpr)) : this.canvas.height;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.grid) return;

    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.locs['uElev'], 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.rampTex);
    gl.uniform1i(this.locs['uRamp'], 1);

    gl.uniform2i(this.locs['uGridSize'], this.grid.cols, this.grid.rows);
    gl.uniform2f(this.locs['uOrigin'], this.grid.x0, this.grid.y0);
    gl.uniform1f(this.locs['uCell'], this.grid.cellSize);
    gl.uniform2f(this.locs['uViewMin'], viewMin[0], viewMin[1]);
    gl.uniform2f(this.locs['uViewSize'], viewSize[0], viewSize[1]);
    gl.uniform1f(this.locs['uVertEx'], style.vertEx);
    gl.uniform1f(this.locs['uAmbient'], style.ambient);
    gl.uniform1f(this.locs['uZMin'], style.zMin);
    gl.uniform1f(this.locs['uZMax'], style.zMax);
    gl.uniform1f(this.locs['uShadeOn'], style.shadeEnabled ? 1 : 0);
    gl.uniform1f(this.locs['uTintOn'], style.tintEnabled ? 1 : 0);

    const lights = style.lights.filter((l) => l.enabled && l.weight > 0).slice(0, 4);
    const lv = new Float32Array(12);
    const wv = new Float32Array(4);
    lights.forEach((l, k) => {
      const v = lightVector(l.azimuth, l.altitude);
      lv[k * 3] = v[0]; lv[k * 3 + 1] = v[1]; lv[k * 3 + 2] = v[2];
      wv[k] = l.weight;
    });
    gl.uniform3fv(this.locs['uLights[0]'], lv);
    gl.uniform1fv(this.locs['uWeights[0]'], wv);
    gl.uniform1i(this.locs['uNumLights'], lights.length);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
