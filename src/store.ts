import { ElevationGrid } from './core/grid';
import { AppSettings, MapProject } from './types';
import { RAMP_PRESETS } from './core/colorRamp';

const STORAGE_KEY = 'terrain-map-studio-v1';

/* ---------- Float32Array <-> base64 ---------- */

export function f32ToBase64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToF32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/* ---------- 项目序列化（高程栅格单独编码） ---------- */

interface SerializedProject extends Omit<MapProject, 'grid'> {
  grid: null | {
    cols: number; rows: number; cellSize: number; x0: number; y0: number; b64: string;
  };
}

function serializeProject(p: MapProject): SerializedProject {
  return {
    ...p,
    grid: p.grid
      ? { cols: p.grid.cols, rows: p.grid.rows, cellSize: p.grid.cellSize, x0: p.grid.x0, y0: p.grid.y0, b64: f32ToBase64(p.grid.data) }
      : null,
  };
}

function deserializeProject(s: SerializedProject): MapProject {
  let grid: ElevationGrid | null = null;
  if (s.grid) {
    grid = {
      cols: s.grid.cols, rows: s.grid.rows, cellSize: s.grid.cellSize,
      x0: s.grid.x0, y0: s.grid.y0, data: base64ToF32(s.grid.b64),
    };
  }
  const p = { ...s, grid } as MapProject;
  if (!p.tint.stops || p.tint.stops.length === 0) {
    p.tint.stops = RAMP_PRESETS['经典地形'].map((s2) => ({ ...s2 }));
  }
  return p;
}

/* ---------- Store ---------- */

type Listener = () => void;

class Store {
  projects: MapProject[] = [];
  currentId: string | null = null;
  settings: AppSettings = { defaultContourInterval: 50, defaultVertEx: 1.5, selfTestResults: null };
  private listeners = new Set<Listener>();

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { projects: SerializedProject[]; currentId: string | null; settings: AppSettings };
      this.projects = (data.projects || []).map(deserializeProject);
      this.currentId = data.currentId ?? null;
      if (data.settings) this.settings = { ...this.settings, ...data.settings };
    } catch (e) {
      console.error('读取本地存储失败', e);
    }
  }

  save() {
    try {
      const data = {
        projects: this.projects.map(serializeProject),
        currentId: this.currentId,
        settings: this.settings,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('写入本地存储失败（可能超出配额）', e);
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 修改后调用：保存并通知界面刷新 */
  touch(save = true) {
    if (save) this.save();
    this.listeners.forEach((f) => f());
  }

  get current(): MapProject | null {
    return this.projects.find((p) => p.id === this.currentId) ?? null;
  }

  setCurrent(id: string | null) {
    this.currentId = id;
    this.touch();
  }

  addProject(p: MapProject) {
    this.projects.push(p);
    this.currentId = p.id;
    this.touch();
  }

  deleteProject(id: string) {
    this.projects = this.projects.filter((p) => p.id !== id);
    if (this.currentId === id) this.currentId = this.projects[0]?.id ?? null;
    this.touch();
  }

  duplicateProject(id: string): MapProject | null {
    const src = this.projects.find((p) => p.id === id);
    if (!src) return null;
    const copy = deserializeProject(serializeProject(src));
    copy.id = `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    copy.name = src.name + ' 副本';
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    this.projects.push(copy);
    this.touch();
    return copy;
  }

  exportProjectJson(id: string): string {
    const p = this.projects.find((x) => x.id === id);
    if (!p) throw new Error('项目不存在');
    return JSON.stringify(serializeProject(p), null, 2);
  }

  importProjectJson(text: string): MapProject {
    const s = JSON.parse(text) as SerializedProject;
    if (!s || typeof s.name !== 'string') throw new Error('文件格式不正确');
    const p = deserializeProject(s);
    p.id = `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    p.updatedAt = Date.now();
    this.projects.push(p);
    this.currentId = p.id;
    this.touch();
    return p;
  }

  storageBytes(): number {
    try {
      return (localStorage.getItem(STORAGE_KEY) ?? '').length * 2;
    } catch {
      return 0;
    }
  }

  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
    this.projects = [];
    this.currentId = null;
    this.touch(false);
  }
}

export const store = new Store();
