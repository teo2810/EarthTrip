export type SatGroup = "station" | "nav" | "science" | "starlink";
export type Regime = "leo" | "meo" | "geo";
export type MissionKind = "crew" | "science";

export type Flags = {
  orbits: boolean;
  allOrbits: boolean;
  nightLights: boolean;
  atmosphere: boolean;
  clouds: boolean;
  satellites: boolean;
  moonLabels: boolean;
  moonSites: boolean;
  trueMoon: boolean;
  borders: boolean;
  capitals: boolean;
  leo: boolean;
  meo: boolean;
  geo: boolean;
  leoOrbits: boolean;
  meoOrbits: boolean;
  geoOrbits: boolean;
  astro: boolean;
};

export const DEFAULT_FLAGS: Flags = {
  orbits: true,
  allOrbits: false,
  nightLights: true,
  atmosphere: true,
  clouds: true,
  satellites: true,
  moonLabels: true,
  moonSites: true,
  trueMoon: false,
  borders: true,
  capitals: true,
  leo: true,
  meo: true,
  geo: true,
  leoOrbits: true,
  meoOrbits: false,
  geoOrbits: true,
  astro: false,
};

export type Selection =
  | {
      kind: "sat";
      name: string;
      norad: number;
      group: SatGroup;
      regime: Regime;
      mission: MissionKind | null;
      agency: string | null;
      altKm: number;
      speed: number;
      incDeg: number;
      periodMin: number;
      lat: number;
      lon: number;
    }
  | { kind: "moon"; name: string; blurb: string; lat: number; lon: number };

export type EarthApi = {
  goIss: () => void;
  goMoon: () => void;
  goGlobal: () => void;
  goSurface: () => void;
  exitSurface: () => void;
  setFlags: (f: Flags) => void;
  setTimeOffsetHours: (h: number) => void;
  focusSelection: () => void;
  clearSelection: () => void;
  dispose: () => void;
  enterDefense: () => void;
  exitDefense: () => void;
  isDefenseActive: () => boolean;
  getDefenseState: () => any;
  buyDefenseUpgrade: (type: string) => boolean;
  triggerLunarPulse: () => void;
};

export type Telemetry = {
  altKm: number | null;
  lat: number | null;
  lon: number | null;
  body: "earth" | "moon" | "space";
  subsolarLat: number;
  subsolarLon: number;
  moonDistKm: number;
  fps: number;
  tle: "cache" | "live";
  surfaceAlpha: number;
  surfaceLock: boolean;
  follow: boolean;
  view: "globe" | "moon" | "surface" | "iss";
  selection: Selection | null;
};

// Defense mode extensions
export type DefenseApi = {
  enterDefense: () => void;
  exitDefense: () => void;
  isDefenseActive: () => boolean;
  getDefenseState: () => {
    wave: number;
    earthHP: number;
    exp: number;
    lunarEnergy: number;
    highscore: number;
    cannonCount: number;
    weaponType: string;
  };
  buyDefenseUpgrade: (type: string) => boolean;
  triggerLunarPulse: () => void;
};
