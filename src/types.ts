import { ElevationGrid } from './core/grid';
import { ColorStop, RAMP_PRESETS } from './core/colorRamp';
import { LightSpec } from './render/terrainRenderer';

export interface ContourStyle {
  enabled: boolean;
  /** 首曲线间距（米） */
  interval: number;
  /** 每 N 条一条计曲线 */
  indexEvery: number;
  normalColor: string;
  normalWidth: number;
  indexColor: string;
  indexWidth: number;
  labelsEnabled: boolean;
  labelColor: string;
  labelSize: number;
}

export interface TintStyle {
  enabled: boolean;
  stops: ColorStop[];
}

export interface ShadeStyle {
  enabled: boolean;
  lights: LightSpec[];
  ambient: number;
  vertEx: number;
}

export interface Route {
  id: string;
  name: string;
  color: string;
  /** 地图米坐标 */
  points: Array<[number, number]>;
}

export interface ExportSettings {
  paper: 'A4' | 'A3' | 'A5';
  orientation: 'landscape' | 'portrait';
  dpi: number;
  /** 比例尺分母，如 25000 表示 1:25000 */
  scale: number;
  title: string;
  showContours: boolean;
  showRoutes: boolean;
  showScaleBar: boolean;
  showNorthArrow: boolean;
}

export interface MapProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  grid: ElevationGrid | null;
  peaks: Array<{ name: string; x: number; y: number; height: number }>;
  shade: ShadeStyle;
  tint: TintStyle;
  contours: ContourStyle;
  routes: Route[];
  exportSettings: ExportSettings;
}

export interface AppSettings {
  defaultContourInterval: number;
  defaultVertEx: number;
  selfTestResults: string | null;
}

export function defaultShade(): ShadeStyle {
  return {
    enabled: true,
    lights: [
      { azimuth: 315, altitude: 45, weight: 1, enabled: true },
      { azimuth: 45, altitude: 45, weight: 0.5, enabled: false },
      { azimuth: 180, altitude: 30, weight: 0.3, enabled: false },
    ],
    ambient: 0.25,
    vertEx: 1.5,
  };
}

export function defaultContours(interval = 50): ContourStyle {
  return {
    enabled: true,
    interval,
    indexEvery: 5,
    normalColor: '#b5773a',
    normalWidth: 0.8,
    indexColor: '#8a4b1f',
    indexWidth: 1.6,
    labelsEnabled: true,
    labelColor: '#7a3d10',
    labelSize: 11,
  };
}

export function defaultExportSettings(): ExportSettings {
  return {
    paper: 'A4',
    orientation: 'landscape',
    dpi: 300,
    scale: 25000,
    title: '',
    showContours: true,
    showRoutes: true,
    showScaleBar: true,
    showNorthArrow: true,
  };
}

export function newProject(name: string, settings: AppSettings): MapProject {
  const now = Date.now();
  return {
    id: `m${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    name,
    createdAt: now,
    updatedAt: now,
    grid: null,
    peaks: [],
    shade: { ...defaultShade(), vertEx: settings.defaultVertEx },
    tint: { enabled: true, stops: RAMP_PRESETS['经典地形'].map((s) => ({ ...s })) },
    contours: defaultContours(settings.defaultContourInterval),
    routes: [],
    exportSettings: defaultExportSettings(),
  };
}
