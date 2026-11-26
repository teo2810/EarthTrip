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

/**
 * Vista di default leggera (v25): globo con confini e capitali, atmosfera, e solo le orbite basse (ISS, Tiangong, Hubble,
 * i satelliti scientifici e qualche Starlink) con le tracce dei satelliti in evidenza. Il resto si accende dal pannello.
 * Le scelte salvate dall'utente (`earthtrip-flags`) hanno la precedenza.
 */
export const DEFAULT_FLAGS: Flags = {
  orbits: true,
  allOrbits: false,
  nightLights: false,
  atmosphere: true,
  clouds: false,
  satellites: true,
  moonLabels: false,
  moonSites: false,
  trueMoon: false,
  borders: true,
  capitals: true,
  leo: true,
  meo: false,
  geo: false,
  leoOrbits: true,
  meoOrbits: false,
  geoOrbits: false,
  astro: false,
};

export const FLAGS_KEY = "earthtrip-flags";

/** Preferenze salvate: solo chiavi note con valore booleano, sopra i default. */
export function loadFlags(): Flags {
  const out: Flags = { ...DEFAULT_FLAGS };
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(FLAGS_KEY);
    if (!raw) return out;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(DEFAULT_FLAGS) as (keyof Flags)[]) if (typeof saved[k] === "boolean") out[k] = saved[k] as boolean;
  } catch {
    /* preferenze illeggibili: restano i default */
  }
  return out;
}

/** Salva solo la scelta toccata: le altre seguono i default della versione. */
export function saveFlag<K extends keyof Flags>(key: K, value: boolean) {
  try {
    const saved = JSON.parse(localStorage.getItem(FLAGS_KEY) || "{}") as Record<string, unknown>;
    saved[key] = value;
    localStorage.setItem(FLAGS_KEY, JSON.stringify(saved));
  } catch {
    /* archivio pieno o bloccato */
  }
}

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
  setDefenseZoom: (t: number) => void;
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
  setDefenseZoom: (t: number) => void;
};
