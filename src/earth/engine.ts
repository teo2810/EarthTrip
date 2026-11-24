import { createDefenseMode } from "./defense-mode";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  degreesLat,
  degreesLong,
  eciToEcf,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
  type SatRec,
} from "satellite.js";
import { Body, GeoVector, RotateVector, Rotation_EQJ_EQD, SiderealTime } from "astronomy-engine";
import { map as createMap, tileLayer, type Map as LeafletMap } from "leaflet";
import { FALLBACK_SATS } from "@/earth/fallback-tle";
import { DEFAULT_FLAGS, type EarthApi, type Flags, type MissionKind, type Regime, type SatGroup, type Selection, type Telemetry } from "@/earth/types";

const EARTH_KM = 6371;
const MOON_R = 0.2727;
const AU_KM = 149_597_870.7;
const MOON_VISUAL = 16;
const ORBIT_STEPS = 72;

const TEX = {
  day: "https://cdn.jsdelivr.net/npm/three-globe@2.41.12/example/img/earth-blue-marble.jpg",
  night: "https://cdn.jsdelivr.net/npm/three-globe@2.41.12/example/img/earth-night.jpg",
  water: "https://cdn.jsdelivr.net/npm/three-globe@2.41.12/example/img/earth-water.png",
  clouds: "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_clouds_1024.png",
  moon: "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/moon_1024.jpg",
};

const TLE_URL = {
  stations: "https://cdn.jsdelivr.net/gh/satvisorcom/satvisor-data@master/celestrak/tle/stations.tle",
  gps: "https://cdn.jsdelivr.net/gh/satvisorcom/satvisor-data@master/celestrak/tle/gps-ops.tle",
  visual: "https://cdn.jsdelivr.net/gh/satvisorcom/satvisor-data@master/celestrak/tle/visual.tle",
  starlink: "https://cdn.jsdelivr.net/gh/satvisorcom/satvisor-data@master/celestrak/tle/starlink.tle",
  science: "https://cdn.jsdelivr.net/gh/satvisorcom/satvisor-data@master/celestrak/tle/science.tle",
  galileo: "https://cdn.jsdelivr.net/gh/satvisorcom/satvisor-data@master/celestrak/tle/galileo.tle",
  glonass: "https://cdn.jsdelivr.net/gh/satvisorcom/satvisor-data@master/celestrak/tle/glo-ops.tle",
  weather: "https://cdn.jsdelivr.net/gh/satvisorcom/satvisor-data@master/celestrak/tle/weather.tle",
};

const CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=";

const GEO_URL = {
  countries:
    "https://cdn.jsdelivr.net/gh/martynafford/natural-earth-geojson@master/110m/cultural/ne_110m_admin_0_countries.json",
  capitals:
    "https://cdn.jsdelivr.net/gh/martynafford/natural-earth-geojson@master/110m/cultural/ne_110m_populated_places_simple.json",
};

const ESRI =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const VISUAL_KEEP = new Set(["HST", "TERRA", "AQUA", "AURA", "NOAA 20", "LANDSAT 9", "SUOMI NPP", "SWIFT"]);

const GROUP_COLOR: Record<SatGroup, number> = {
  station: 0x3ee0a0,
  nav: 0xe7eef6,
  science: 0xd5deea,
  starlink: 0x8ea0b5,
};

type MoonKind = "mare" | "crater" | "landing";

const MOON_FEATURES: { name: string; lat: number; lon: number; kind: MoonKind; blurb: string }[] = [
  { name: "Oceanus Procellarum", lat: 18.4, lon: -57.4, kind: "mare", blurb: "Il più grande mare lunare, una distesa basaltica a ovest del disco." },
  { name: "Mare Imbrium", lat: 34.7, lon: -14.9, kind: "mare", blurb: "Bacino da impatto di circa 1100 km, il secondo mare lunare." },
  { name: "Mare Serenitatis", lat: 27.3, lon: 18.2, kind: "mare", blurb: "Mare circolare a nord della Tranquillitatis." },
  { name: "Mare Tranquillitatis", lat: 8.35, lon: 31.4, kind: "mare", blurb: "Mare basaltico. Qui atterrò Apollo 11 nel 1969." },
  { name: "Mare Crisium", lat: 17.0, lon: 59.1, kind: "mare", blurb: "Mare isolato verso il lembo est, visibile a occhio nudo." },
  { name: "Mare Fecunditatis", lat: -7.8, lon: 51.3, kind: "mare", blurb: "Mare a sud-est della Tranquillitatis, vicino al lembo." },
  { name: "Mare Nectaris", lat: -15.2, lon: 35.5, kind: "mare", blurb: "Piccolo bacino a sud della Tranquillitatis." },
  { name: "Mare Nubium", lat: -21.3, lon: -16.6, kind: "mare", blurb: "Mare meridionale, a est di Humorum." },
  { name: "Mare Humorum", lat: -24.4, lon: -38.6, kind: "mare", blurb: "Bacino circolare sul bordo sud-ovest del disco." },
  { name: "Mare Frigoris", lat: 56.0, lon: 1.4, kind: "mare", blurb: "Fascia lunga e stretta lungo il bordo nord." },
  { name: "Tycho", lat: -43.31, lon: -11.36, kind: "crater", blurb: "Cratere giovane con raggi chiari visibili su quasi tutto il disco." },
  { name: "Copernico", lat: 9.62, lon: -20.08, kind: "crater", blurb: "Cratere a terrazze di 93 km nell'Oceanus Procellarum." },
  { name: "Keplero", lat: 8.12, lon: -38.01, kind: "crater", blurb: "Cratere con sistema di raggi, a ovest di Copernico." },
  { name: "Aristarcho", lat: 23.73, lon: -47.49, kind: "crater", blurb: "Uno dei punti più luminosi della Luna, nell'Oceanus Procellarum." },
  { name: "Platone", lat: 51.62, lon: -9.38, kind: "crater", blurb: "Cratere dal fondo scuro sul bordo nord dell'Imbrium." },
  { name: "Clavius", lat: -58.4, lon: -14.4, kind: "crater", blurb: "Uno dei crateri più grandi, vicino al polo sud visibile." },
  { name: "Tsiolkovskiy", lat: -20.38, lon: 129.07, kind: "crater", blurb: "Grande cratere del lato nascosto, picco centrale luminoso." },
  { name: "Polo Sud", lat: -89.5, lon: 0, kind: "crater", blurb: "Crateri in ombra permanente, obiettivo del programma Artemis." },
  { name: "Apollo 11", lat: 0.674, lon: 23.473, kind: "landing", blurb: "Statio Tranquillitatis, allunaggio del 20 luglio 1969." },
  { name: "Apollo 12", lat: -3.012, lon: -23.421, kind: "landing", blurb: "Oceanus Procellarum, 19 novembre 1969." },
  { name: "Apollo 14", lat: -3.645, lon: -17.471, kind: "landing", blurb: "Formazione Fra Mauro, 5 febbraio 1971." },
  { name: "Apollo 15", lat: 26.132, lon: 3.633, kind: "landing", blurb: "Hadley-Apennine, ai margini del Mare Imbrium, 30 luglio 1971." },
  { name: "Apollo 16", lat: -8.973, lon: 15.501, kind: "landing", blurb: "Altipiani Descartes, 21 aprile 1972." },
  { name: "Apollo 17", lat: 20.191, lon: 30.772, kind: "landing", blurb: "Valle Taurus-Littrow, ultimo allunaggio, 11 dicembre 1972." },
];

type Hooks = {
  onTelemetry: (t: Telemetry) => void;
  onReady: () => void;
  onError: (message: string) => void;
};

type Mode = "globe" | "free" | "follow" | "moon" | "anim";

type RawSat = { name: string; norad: number; tle1: string; tle2: string; source: string };

type SatObj = {
  raw: RawSat;
  group: SatGroup;
  regime: Regime;
  mission: MissionKind | null;
  agency: string | null;
  featured: boolean;
  satrec: SatRec;
  root: THREE.Group;
  dot: THREE.Mesh;
  hit: THREE.Mesh;
  ring: THREE.Mesh | null;
  line: THREE.Line;
  pos: THREE.Vector3;
  altKm: number;
  speed: number;
  lat: number;
  lon: number;
  incDeg: number;
  periodMin: number;
};

type GeoLabel = {
  el: HTMLDivElement;
  lat: number;
  lon: number;
  kind: "state" | "capital";
  weight: number;
};

type Anim = {
  fromP: THREE.Vector3;
  fromT: THREE.Vector3;
  toP: THREE.Vector3;
  toT: THREE.Vector3;
  t: number;
  dur: number;
  done: () => void;
};

const noopApi: EarthApi = {
  goIss() {},
  goMoon() {},
  goGlobal() {},
  goSurface() {},
  exitSurface() {},
  setFlags() {},
  setTimeOffsetHours() {},
  focusSelection() {},
  clearSelection() {},
  dispose() {},
};

export function mountEarth(
  viewport: HTMLElement,
  hooks: Hooks,
  initial?: { flags?: Flags; timeOffsetHours?: number },
): EarthApi {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch {
    hooks.onError("WebGL non disponibile su questo dispositivo.");
    return noopApi;
  }
  if (!renderer.getContext()) {
    hooks.onError("WebGL non disponibile su questo dispositivo.");
    return noopApi;
  }

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const flags: Flags = { ...(initial?.flags ?? DEFAULT_FLAGS) };
  let timeOffsetH = initial?.timeOffsetHours ?? 0;
  let mode: Mode = "globe";
  let followNorad: number | null = null;
  let surfaceLock = false;
  let anim: Anim | null = null;
  let selectedNorad: number | null = null;
  let selectedMoon: number | null = null;
  let tleMode: Telemetry["tle"] = "cache";
  let disposed = false;
  let map: LeafletMap | null = null;
  let mapPinned = false;
  let readySent = false;
  let publishAt = 0;
  let orbitAt = 0;
  let orbitIdx = 0;
  let orbitStep = 0;
  let frameNo = 0;
  let mapSyncAt = 0;
  let mapPending = false;
  let view: Telemetry["view"] = "globe";
  let fps = 0;
  let frames = 0;
  let fpsStamp = performance.now();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.001, 2200);
  const clockStart = performance.now();
  let lastTick = clockStart;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const sunDir = new THREE.Vector3(1, 0, 0);
  const moonTrue = new THREE.Vector3();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.setClearColor(0x07090c, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const canvas = renderer.domElement;
  canvas.style.touchAction = "none";
  viewport.appendChild(canvas);

  const mapEl = document.createElement("div");
  mapEl.className = "et-map";
  const labelsEl = document.createElement("div");
  labelsEl.className = "et-labels";
  viewport.append(mapEl, labelsEl);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.zoomSpeed = 0.65;
  controls.rotateSpeed = 0.55;
  controls.minDistance = 1.02;
  controls.maxDistance = 42;
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 0.22;

  scene.add(new THREE.AmbientLight(0xb9c6d6, 0.045));
  const sunLight = new THREE.DirectionalLight(0xfff6e8, 3.6);
  scene.add(sunLight);
  const sunSprite = makeSunSprite();
  scene.add(sunSprite);
  scene.add(makeStars(viewport.clientWidth < 800 ? 1100 : 1800));

  const earthGeo = new THREE.SphereGeometry(1, viewport.clientWidth < 800 ? 64 : 96, 48);
  const nightUniform = { value: 1 };
  const sunUniform = { value: sunDir.clone() };
  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: solidTexture(0x1d4e89) },
      nightMap: { value: solidTexture(0x05070c) },
      specMap: { value: solidTexture(0x000000) },
      sunDir: sunUniform,
      nightLights: nightUniform,
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vPosW = w.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D specMap;
      uniform vec3 sunDir; uniform float nightLights;
      varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW;
      void main() {
        vec3 n = normalize(vNormalW), s = normalize(sunDir);
        vec3 v = normalize(cameraPosition - vPosW);
        float ndl = dot(n, s);
        vec3 dayC = texture2D(dayMap, vUv).rgb;
        vec3 nightC = texture2D(nightMap, vUv).rgb;
        float water = texture2D(specMap, vUv).r;

        float lit = smoothstep(-0.03, 0.18, ndl);
        float shade = pow(clamp(ndl, 0.0, 1.0), 0.4);
        vec3 day = dayC * mix(0.28, 1.0, shade);
        day = mix(vec3(dot(day, vec3(0.2126, 0.7152, 0.0722))), day, 1.15);

        float dusk = smoothstep(-0.21, -0.03, ndl) * (1.0 - smoothstep(-0.03, 0.14, ndl));
        vec3 twi = vec3(1.0, 0.45, 0.2) * dusk * 0.10;

        float lumN = max(nightC.r, max(nightC.g, nightC.b));
        float city = nightLights * smoothstep(0.025, 0.14, lumN) * (1.0 - smoothstep(-0.14, 0.0, ndl));

        vec3 col = day * lit + twi + nightC * city * 2.6 * (1.0 - lit) + dayC * 0.015 * (1.0 - lit);
        col += pow(max(dot(n, normalize(s + v)), 0.0), 64.0) * water * lit * vec3(0.8, 0.9, 1.0) * 0.6;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  scene.add(earth);

  const borderGeo = new THREE.BufferGeometry();
  borderGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
  const borderMat = new THREE.LineBasicMaterial({
    color: 0xb7c6d6,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const borders = new THREE.LineSegments(borderGeo, borderMat);
  borders.renderOrder = 2;
  borders.visible = flags.borders;
  scene.add(borders);
  const geoLabels: GeoLabel[] = [];

  const cloudOpacity = { value: 0 };
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: solidTexture(0x000000) },
      sunDir: sunUniform,
      opacity: cloudOpacity,
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D map;
      uniform vec3 sunDir;
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vNormalW;
      void main() {
        float a = texture2D(map, vUv).r;
        float ndl = dot(normalize(vNormalW), normalize(sunDir));
        float lit = smoothstep(-0.03, 0.18, ndl);
        float shade = mix(0.25, 1.0, pow(clamp(ndl, 0.0, 1.0), 0.4));
        gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * shade, a * opacity * lit);
        #include <colorspace_fragment>
      }
    `,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 40), cloudMat);
  scene.add(clouds);

  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: sunUniform },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vPosW = w.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      uniform vec3 sunDir;
      void main() {
        vec3 n = normalize(vNormalW);
        vec3 viewDir = normalize(cameraPosition - vPosW);
        float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.4);
        float ndl = dot(n, normalize(sunDir));
        float day = smoothstep(-0.02, 0.25, ndl);
        vec3 col = mix(vec3(0.08, 0.16, 0.4), vec3(0.32, 0.58, 1.0), day);
        gl_FragColor = vec4(col, fres * 0.55);
      }
    `,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.045, 64, 40), atmoMat);
  scene.add(atmo);

  const moonPivot = new THREE.Group();
  const moonMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: solidTexture(0x8a8a8a) }, sunDir: sunUniform },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vP;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vP = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D map;
      uniform vec3 sunDir;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vP;
      void main() {
        vec3 n = normalize(vN), s = normalize(sunDir), v = normalize(cameraPosition - vP);
        float ndl = dot(n, s);
        float m0 = max(ndl, 0.0);
        float m = max(dot(n, v), 0.0);
        float ls = m0 / (m0 + m + 0.02);
        vec3 alb = texture2D(map, vUv).rgb;
        float day = smoothstep(-0.04, 0.16, ndl);
        vec3 col = mix(alb * 0.14, alb * ls * 1.8, day);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 64, 64), moonMat);
  moonMesh.scale.set(1, 1, 1);
  moonPivot.add(moonMesh);
  const limbPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 96; i += 1) {
    const a = (i / 96) * Math.PI * 2;
    limbPts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
  }
  const moonLimb = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(limbPts),
    new THREE.LineBasicMaterial({ color: 0xd5dde6, transparent: true, opacity: 0.24, depthTest: false, depthWrite: false }),
  );
  moonLimb.visible = false;
  moonLimb.renderOrder = 4;
  const limbN = new THREE.Vector3();
  const limbQ = new THREE.Quaternion();
  const limbAxis = new THREE.Vector3(0, 0, 1);
  scene.add(moonLimb);
  const astroEarth = new THREE.Group();
  astroEarth.add(guideLine([new THREE.Vector3(0, -1.72, 0), new THREE.Vector3(0, 1.72, 0)], 0x9eb0c4, 0.42));
  astroEarth.add(equatorRing(1.035, 0x9eb0c4, 0.28));
  astroEarth.add(spinArc(1.1));
  astroEarth.visible = false;
  scene.add(astroEarth);
  const astroMoon = new THREE.Group();
  astroMoon.add(guideLine([new THREE.Vector3(0, -MOON_R * 2.15, 0), new THREE.Vector3(0, MOON_R * 2.15, 0)], 0xb7c3d1, 0.55));
  astroMoon.add(equatorRing(MOON_R * 1.05, 0xb7c3d1, 0.4));
  astroMoon.visible = false;
  moonPivot.add(astroMoon);
  const astroEls = ["Asse terrestre · 23,4°", "Verso est · 23 h 56 min", "Asse lunare", ""].map((text) => {
    const el = document.createElement("div");
    el.className = "et-label is-astro";
    el.textContent = text;
    el.style.display = "none";
    labelsEl.appendChild(el);
    return el;
  });
  const [northEl, spinEl, moonAxisEl, moonDataEl] = astroEls;
  scene.add(moonPivot);

  const markerGeo = new THREE.SphereGeometry(1, 10, 8);
  const moonKindMat: Record<MoonKind, THREE.MeshBasicMaterial> = {
    mare: new THREE.MeshBasicMaterial({ color: 0x9eb0c4 }),
    crater: new THREE.MeshBasicMaterial({ color: 0xf5c56b }),
    landing: new THREE.MeshBasicMaterial({ color: 0x3ee0a0 }),
  };
  const markers: THREE.Mesh[] = [];
  const labelNodes: HTMLDivElement[] = [];
  MOON_FEATURES.forEach((feature, index) => {
    const mesh = new THREE.Mesh(markerGeo, moonKindMat[feature.kind]);
    mesh.position.copy(latLonToThree(feature.lat, feature.lon, MOON_R * 1.02));
    mesh.userData = { kind: "moon", index };
    moonPivot.add(mesh);
    markers.push(mesh);
    const label = document.createElement("div");
    label.className = `et-label is-moon is-${feature.kind}`;
    label.textContent = feature.name;
    label.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedMoon = index;
      selectedNorad = null;
      publish(true);
    });
    labelsEl.appendChild(label);
    labelNodes.push(label);
  });

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const loadTex = (url: string, color: boolean, onLoad: (t: THREE.Texture) => void) => {
    loader.load(url, (tex) => {
      tex.anisotropy = maxAniso;
      tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      onLoad(tex);
    });
  };
  loadTex(TEX.day, true, (t) => {
    earthMat.uniforms.dayMap!.value = t;
  });
  loadTex(TEX.night, true, (t) => {
    earthMat.uniforms.nightMap!.value = t;
  });
  loadTex(TEX.water, false, (t) => {
    earthMat.uniforms.specMap!.value = t;
  });
  loadTex(TEX.clouds, false, (t) => {
    cloudMat.uniforms.map!.value = t;
    cloudOpacity.value = 0.4;
  });
  loadTex(TEX.moon, true, (t) => {
    moonMat.uniforms.map!.value = t;
  });

  const dotGeo = new THREE.SphereGeometry(1, 10, 8);
  const hitGeo = new THREE.SphereGeometry(1, 8, 6);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const groupMat: Record<SatGroup, THREE.MeshBasicMaterial> = {
    station: new THREE.MeshBasicMaterial({ color: GROUP_COLOR.station }),
    nav: new THREE.MeshBasicMaterial({ color: GROUP_COLOR.nav }),
    science: new THREE.MeshBasicMaterial({ color: GROUP_COLOR.science }),
    starlink: new THREE.MeshBasicMaterial({ color: GROUP_COLOR.starlink }),
  };
  const lineMat: Record<SatGroup, THREE.LineBasicMaterial> = {
    station: new THREE.LineBasicMaterial({ color: GROUP_COLOR.station, transparent: true, opacity: 0.55 }),
    nav: new THREE.LineBasicMaterial({ color: GROUP_COLOR.nav, transparent: true, opacity: 0.28 }),
    science: new THREE.LineBasicMaterial({ color: GROUP_COLOR.science, transparent: true, opacity: 0.4 }),
    starlink: new THREE.LineBasicMaterial({ color: GROUP_COLOR.starlink, transparent: true, opacity: 0.28 }),
  };
  const missionDot: Record<MissionKind, THREE.MeshBasicMaterial> = {
    crew: new THREE.MeshBasicMaterial({ color: 0xf5c56b }),
    science: new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
  };
  const missionLine: Record<MissionKind, THREE.LineBasicMaterial> = {
    crew: new THREE.LineBasicMaterial({ color: 0xf5c56b, transparent: true, opacity: 0.82 }),
    science: new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.62 }),
  };
  const ringGeo = new THREE.RingGeometry(1.25, 1.55, 28);
  const ringMat: Record<MissionKind, THREE.MeshBasicMaterial> = {
    crew: new THREE.MeshBasicMaterial({
      color: 0xf5c56b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
    science: new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  };

  let sats: SatObj[] = [];

  function clearSats() {
    for (const sat of sats) {
      scene.remove(sat.root);
      scene.remove(sat.line);
      sat.line.geometry.dispose();
    }
    sats = [];
  }

  function buildSats(records: RawSat[]) {
    const keepSelected = selectedNorad;
    clearSats();
    const accepted: THREE.Vector3[] = [];
    const seen = new Set<number>();
    const sorted = [...records].sort((a, b) => Number(!isFlagship(a.name)) - Number(!isFlagship(b.name)));
    for (const raw of sorted) {
      if (seen.has(raw.norad)) continue;
      const satrec = twoline2satrec(raw.tle1, raw.tle2);
      const probe = sampleSat(satrec, simDate());
      if (!probe) continue;
      if (accepted.some((p) => p.distanceTo(probe.pos) < 0.02)) continue;
      seen.add(raw.norad);
      accepted.push(probe.pos.clone());
      const group = groupOf(raw);
      const missionInfo = missionOf(raw.name);
      const regime = regimeOf(satrec);
      const root = new THREE.Group();
      const dot = new THREE.Mesh(dotGeo, missionInfo ? missionDot[missionInfo.kind] : groupMat[group]);
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.userData = { kind: "sat", norad: raw.norad };
      let ring: THREE.Mesh | null = null;
      if (missionInfo) {
        ring = new THREE.Mesh(ringGeo, ringMat[missionInfo.kind]);
        root.add(ring);
      }
      root.add(dot, hit);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((ORBIT_STEPS + 1) * 3), 3));
      const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
      const seed = posAttr.array as Float32Array;
      for (let i = 0; i <= ORBIT_STEPS; i += 1) {
        seed[i * 3] = probe.pos.x;
        seed[i * 3 + 1] = probe.pos.y;
        seed[i * 3 + 2] = probe.pos.z;
      }
      const line = new THREE.Line(geo, missionInfo ? missionLine[missionInfo.kind] : lineMat[group]);
      line.frustumCulled = false;
      scene.add(root, line);
      root.position.copy(probe.pos);
      const sat: SatObj = {
        raw,
        group,
        regime,
        mission: missionInfo?.kind ?? null,
        agency: missionInfo?.agency ?? null,
        featured: isFlagship(raw.name),
        satrec,
        root,
        dot,
        hit,
        ring,
        line,
        pos: probe.pos,
        altKm: probe.altKm,
        speed: probe.speed,
        lat: probe.lat,
        lon: probe.lon,
        incDeg: (satrec.inclo * 180) / Math.PI,
        periodMin: (2 * Math.PI) / satrec.no,
      };
      line.visible = traceOn(sat);
      root.visible = bandOn(sat);
      sats.push(sat);
    }
    if (keepSelected != null && !sats.some((s) => s.raw.norad === keepSelected)) selectedNorad = null;
    orbitIdx = 0;
    orbitStep = 0;
    orbitAt = 0;
  }

  buildSats(FALLBACK_SATS);
  void refreshTle();
  void loadGeography();

  camera.position.copy(latLonToThree(18, -32, 3.05));
  controls.target.set(0, 0, 0);
  controls.update();

  function resize() {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    if (w < 2 || h < 2) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 800 ? 1.15 : 1.35));
    renderer.setSize(w, h, false);
    map?.invalidateSize();
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(viewport);
  resize();

  let downX = 0;
  let downY = 0;
  const onDown = (e: PointerEvent) => {
    downX = e.clientX;
    downY = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (surfaceLock) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 7) return;
    pick(e);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    if (mode === "follow") {
      mode = "free";
      followNorad = null;
      view = "globe";
      publish(true);
    }
  });

  let raf = 0;
  const loop = () => {
    if (disposed) return;
    try {
      const nowTick = performance.now();
      const rawDt = (nowTick - lastTick) / 1000;
      lastTick = nowTick;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);
      if (defense.state.active) defense.update(dt);
      const animDt = Math.min(Math.max(rawDt, 0), 0.25);
      const date = simDate();
      updateSunMoon(date);
      updateSatPositions(date);
      if (orbitIdx >= sats.length && performance.now() - orbitAt > 2500) {
        orbitIdx = 0;
        orbitStep = 0;
        orbitAt = performance.now();
      }
      updateOrbits(date, 16);
      stepCamera(animDt);
      applyLimits();
      tuneControls(dt);
      controls.enabled = !surfaceLock;
      controls.update(dt);
      if (camera.position.length() < 1.012 && controls.target.length() < 0.5) camera.position.setLength(1.012);
      clouds.rotation.y += dt * 0.00005;
      updateScales();
      updateAstro();
      updateSurface();
      updateLabels();
      if ((frameNo++ & 1) === 0) updateGeoLabels();
      const dE = camera.position.length() - 1.02;
      const dM = camera.position.distanceTo(moonPivot.position) - MOON_R * 1.02;
      const nr = THREE.MathUtils.clamp(Math.min(dE, dM) * 0.4, 0.0005, 2);
      if (Number.isFinite(nr) && Math.abs(nr - camera.near) / camera.near > 0.05) {
        camera.near = nr;
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
      countFps();
      if (!readySent) {
        readySent = true;
        hooks.onReady();
      }
      publish(false);
    } catch (err) {
      console.error(err);
    }
    if (!disposed) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  function simDate() {
    return new Date(Date.now() + timeOffsetH * 3_600_000);
  }

  function updateSunMoon(date: Date) {
    const sun = bodyThree(Body.Sun, date);
    const moon = bodyThree(Body.Moon, date);
    sunDir.copy(sun).normalize();
    sunUniform.value.copy(sunDir);
    sunLight.position.copy(sunDir).multiplyScalar(40);
    sunSprite.position.copy(sunDir).multiplyScalar(55);
    moonTrue.copy(moon);
    const trueRadii = (moon.length() * AU_KM) / EARTH_KM;
    const dir = moon.clone().normalize();
    moonPivot.position.copy(dir.multiplyScalar(flags.trueMoon ? trueRadii : MOON_VISUAL));
    moonPivot.scale.set(1, 1, 1);
    orientMoon(moonPivot, moonPivot.position);
    nightUniform.value = flags.nightLights ? 1 : 0;
    atmo.visible = flags.atmosphere;
    clouds.visible = flags.clouds && cloudOpacity.value > 0;
  }

  function updateSatPositions(date: Date) {
    for (const sat of sats) {
      const sample = sampleSat(sat.satrec, date);
      if (!sample) {
        sat.root.visible = false;
        sat.line.visible = false;
        continue;
      }
      sat.pos.copy(sample.pos);
      sat.altKm = sample.altKm;
      sat.speed = sample.speed;
      sat.lat = sample.lat;
      sat.lon = sample.lon;
      sat.root.position.copy(sample.pos);
      sat.root.visible = flags.satellites && bandOn(sat);
      sat.line.visible = traceOn(sat);
    }
  }

  function bandOn(sat: SatObj) {
    const cam = camera.position.length();
    const pinned = sat.raw.norad === selectedNorad || sat.raw.norad === followNorad;
    if (!pinned && sat.regime === "leo" && cam > 8) return false;
    if (!pinned && sat.regime === "meo" && cam > 24) return false;
    if (sat.regime === "leo") return flags.leo;
    if (sat.regime === "meo") return flags.meo;
    return flags.geo;
  }

  function traceOn(sat: SatObj) {
    if (!flags.satellites || !flags.orbits || !bandOn(sat)) return false;
    const traces = sat.regime === "leo" ? flags.leoOrbits : sat.regime === "meo" ? flags.meoOrbits : flags.geoOrbits;
    if (!traces) return false;
    return flags.allOrbits || sat.featured;
  }

  const orbitWhen = new Date();
  function updateOrbits(date: Date, budget = 16) {
    if (!sats.length) return;
    const gmstNow = gstime(date);
    const t0 = date.getTime();
    let done = 0;
    while (done < budget && orbitIdx < sats.length) {
      const sat = sats[orbitIdx]!;
      if (!sat.line.visible || !Number.isFinite(sat.periodMin) || sat.periodMin <= 0) {
        orbitIdx += 1;
        orbitStep = 0;
        continue;
      }
      const attr = sat.line.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const span = Math.min(ORBIT_STEPS, orbitStep + (budget - done) - 1);
      for (let i = orbitStep; i <= span; i += 1) {
        orbitWhen.setTime(t0 + (i / ORBIT_STEPS) * sat.periodMin * 60_000);
        const pv = safePropagate(sat.satrec, orbitWhen);
        if (pv) {
          const e = eciToEcf(pv.position, gmstNow);
          arr[i * 3] = e.x / EARTH_KM;
          arr[i * 3 + 1] = e.z / EARTH_KM;
          arr[i * 3 + 2] = -e.y / EARTH_KM;
        } else if (i > 0) {
          arr[i * 3] = arr[(i - 1) * 3] ?? sat.pos.x;
          arr[i * 3 + 1] = arr[(i - 1) * 3 + 1] ?? sat.pos.y;
          arr[i * 3 + 2] = arr[(i - 1) * 3 + 2] ?? sat.pos.z;
        }
        done += 1;
      }
      attr.needsUpdate = true;
      orbitStep = span + 1;
      if (orbitStep > ORBIT_STEPS) {
        orbitIdx += 1;
        orbitStep = 0;
      }
    }
  }

  function stepCamera(dt: number) {
    if (mode === "anim" && anim) {
      anim.t += dt;
      const k = anim.dur <= 0 ? 1 : easeInOut(Math.min(1, anim.t / anim.dur));
      camera.position.lerpVectors(anim.fromP, anim.toP, k);
      controls.target.lerpVectors(anim.fromT, anim.toT, k);
      if (k >= 1) {
        const done = anim.done;
        anim = null;
        done();
      }
      return;
    }
    if (mode === "follow" && followNorad != null) {
      const sat = sats.find((s) => s.raw.norad === followNorad);
      if (!sat) return;
      controls.target.copy(sat.pos);
      const desired = sat.pos.clone().add(sat.pos.clone().normalize().multiplyScalar(0.42));
      camera.position.lerp(desired, 1 - 0.04 ** dt);
    } else if (mode === "moon") {
      controls.target.copy(moonPivot.position);
    }
  }

  function applyLimits() {
    const nearOrigin = controls.target.length() < 0.5;
    const targetMoon = controls.target.distanceTo(moonPivot.position) < 1.2;
    if (nearOrigin) {
      const reach = Math.max(moonPivot.position.length(), MOON_VISUAL);
      const half = THREE.MathUtils.degToRad(Math.max(12, camera.fov * 0.36));
      controls.minDistance = 1.018;
      controls.maxDistance = Math.max(36, reach / Math.tan(half) + reach * 0.12);
    } else if (targetMoon || mode === "moon") {
      controls.minDistance = MOON_R * 1.15;
      controls.maxDistance = flags.trueMoon ? Math.max(48, moonPivot.position.length() * 0.75) : 30;
    } else {
      controls.minDistance = 0.08;
      controls.maxDistance = 8;
    }
  }

  function tuneControls(dt: number) {
    const tgt = controls.target;
    const dist = camera.position.distanceTo(tgt);
    const onMoon = tgt.distanceTo(moonPivot.position) < 1.2 || mode === "moon";
    const onEarth = !onMoon && tgt.length() < 0.5;
    const R = onMoon ? MOON_R : onEarth ? 1 : 0.02;
    const alt = Math.max(dist - R * 1.018, 0.002);
    const grab = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.PI;
    const u = THREE.MathUtils.clamp(alt / R / 0.75, 0, 1);
    const track = (grab * alt) / R;
    controls.rotateSpeed = onEarth || onMoon ? THREE.MathUtils.clamp(track, 0.004, 0.72) : 0.3;
    controls.zoomSpeed = THREE.MathUtils.clamp(0.18 + 0.62 * u, 0.18, 0.85);
    const dampDt = Math.max(dt, 1 / 120);
    controls.dampingFactor = 1 - Math.exp(-dampDt * (80 - 70 * u * u));
    controls.autoRotateSpeed = reduce ? 0 : 0.015 + 0.2 * u * u;
    controls.enablePan = false;
  }

  function updateScales() {
    for (const sat of sats) {
      const dist = Math.max(0.4, camera.position.distanceTo(sat.pos));
      const base = sat.group === "station" ? 0.0042 : sat.group === "starlink" ? 0.0024 : 0.003;
      const selected = sat.raw.norad === selectedNorad ? 1.7 : 1;
      const missionBoost = sat.mission ? 1.25 : 1;
      const s = Math.max(base, dist * 0.0024) * selected * missionBoost;
      sat.dot.scale.setScalar(s);
      sat.hit.scale.setScalar(s * 2.4);
      if (sat.ring) {
        sat.ring.scale.setScalar(s);
        sat.ring.quaternion.copy(camera.quaternion);
      }
    }
    const moonDist = Math.max(0.05, camera.position.distanceTo(moonPivot.position));
    const d = moonDist;
    const r = MOON_R;
    const toward = (r * r) / d;
    const limbR = r * Math.sqrt(Math.max(1 - (r * r) / (d * d), 0));
    const halo = Math.max(limbR, 0.0001) * 1.12;
    const px = ((r / d) * Math.max(viewport.clientHeight, 1)) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    limbN.copy(camera.position).sub(moonPivot.position).normalize();
    limbQ.setFromUnitVectors(limbAxis, limbN);
    moonLimb.position.copy(moonPivot.position).addScaledVector(limbN, toward);
    moonLimb.quaternion.copy(limbQ);
    moonLimb.scale.setScalar(halo);
    const distant = camera.position.length() > 8 && d > 4 && px < 36;
    moonLimb.visible = !surfaceLock && mode !== "moon" && distant;
    const ms = Math.max(0.012, moonDist * 0.012);
    for (const marker of markers) marker.scale.setScalar(ms);
  }

  function placeAstro(el: HTMLDivElement, world: THREE.Vector3) {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    const ndc = world.clone().project(camera);
    const x = (ndc.x * 0.5 + 0.5) * w;
    const y = (-ndc.y * 0.5 + 0.5) * h;
    if (ndc.z < -1 || ndc.z > 1 || x < -30 || y < -30 || x > w + 30 || y > h + 30) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  function updateAstro() {
    const on = flags.astro && !surfaceLock;
    astroEarth.visible = on;
    astroMoon.visible = on;
    if (!on) {
      for (const el of astroEls) el.style.display = "none";
      return;
    }
    placeAstro(northEl, new THREE.Vector3(0, 1.88, 0));
    if (camera.position.length() > 28) spinEl.style.display = "none";
    else placeAstro(spinEl, new THREE.Vector3(Math.cos(0.45) * 1.18, 0.1, -Math.sin(0.45) * 1.18));
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(moonPivot.quaternion);
    const moonDist = camera.position.distanceTo(moonPivot.position);
    const px = ((MOON_R / Math.max(moonDist, 0.05)) * viewport.clientHeight) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const distKm = Math.round(moonTrue.length() * AU_KM);
    moonDataEl.textContent = `Raggio 1.737 km · ${distKm.toLocaleString("it-IT")} km · 27,3 giorni`;
    if (px < 11) {
      moonAxisEl.style.display = "none";
      placeAstro(moonDataEl, moonPivot.position);
    } else {
      placeAstro(moonAxisEl, moonPivot.position.clone().addScaledVector(up, MOON_R * 2.4));
      placeAstro(moonDataEl, moonPivot.position.clone().addScaledVector(up, -MOON_R * 2.6));
    }
  }

  function updateSurface() {
    const distMoon = camera.position.distanceTo(moonPivot.position);
    const nearMoon = distMoon + 0.2 < camera.position.length() && distMoon < 5;
    if (nearMoon && !surfaceLock) {
      mapEl.style.opacity = "0";
      mapEl.classList.remove("is-hot");
      return;
    }
    const altKm = (camera.position.length() - 1) * EARTH_KM;
    const onEarth = !nearMoon && controls.target.length() < 0.5 && mode !== "anim" && mode !== "follow" && mode !== "moon";
    if (onEarth && !surfaceLock && altKm < 180) {
      ensureMap();
      if (map) {
        surfaceLock = true;
        mapPinned = false;
        view = "surface";
        publish(true);
      }
    } else if (onEarth && surfaceLock && map && map.getZoom() <= 7) {
      const center = map.getCenter();
      const mapAlt = 36000 / 2 ** map.getZoom();
      const radius = 1 + Math.max(mapAlt, 280) / EARTH_KM;
      const prevDamp = controls.dampingFactor;
      controls.dampingFactor = 1;
      controls.update();
      surfaceLock = false;
      mapPinned = false;
      mapEl.classList.remove("is-hot");
      camera.position.copy(latLonToThree(center.lat, center.lng, radius));
      controls.target.set(0, 0, 0);
      controls.update();
      controls.dampingFactor = prevDamp;
      mode = "globe";
      view = "globe";
      publish(true);
      return;
    }
    const alpha = surfaceLock ? 1 : THREE.MathUtils.clamp((780 - altKm) / (780 - 150), 0, 1);
    mapEl.style.opacity = alpha.toFixed(3);
    if (alpha < 0.04 && !surfaceLock) {
      mapEl.classList.remove("is-hot");
      mapPinned = false;
      return;
    }
    ensureMap();
    if (!map) return;
    if (surfaceLock) {
      if (!mapPinned) {
        const look = lookAtEarth();
        map.setView([look.lat, look.lon], Math.max(8, Math.round(zoomFromAlt(Math.max(altKm, 40)))), { animate: false });
        map.invalidateSize();
        mapPinned = true;
      }
      mapEl.classList.add("is-hot");
    } else {
      mapPinned = false;
      mapEl.classList.remove("is-hot");
      const now = performance.now();
      if (now - mapSyncAt < 400) return;
      const look = lookAtEarth();
      const z = Math.round(zoomFromAlt(altKm));
      const c = map.getCenter();
      if (Math.abs(c.lat - look.lat) > 0.02 || Math.abs(c.lng - look.lon) > 0.02 || map.getZoom() !== z) {
        mapSyncAt = now;
        map.setView([look.lat, look.lon], z, { animate: false });
      }
    }
  }

  function updateLabels() {
    const dist = camera.position.distanceTo(moonPivot.position);
    const show = (mode === "moon" || dist < 7);
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    const moonCenter = moonPivot.position;
    const pending: { i: number; x: number; y: number; kind: MoonKind }[] = [];
    markers.forEach((marker, i) => {
      const node = labelNodes[i];
      const feature = MOON_FEATURES[i];
      if (!node || !feature) return;
      const layerOn = feature.kind === "mare" ? flags.moonLabels : flags.moonSites;
      const nearEnough = feature.kind === "mare" ? dist < 8 : feature.kind === "crater" ? dist < 3.5 : dist < 1.65;
      if (!show || !layerOn || !nearEnough) {
        marker.visible = false;
        node.style.display = "none";
        return;
      }
      const world = marker.getWorldPosition(new THREE.Vector3());
      const facing = world.clone().sub(moonCenter).normalize().dot(camera.position.clone().sub(world).normalize());
      const ndc = world.clone().project(camera);
      const x = (ndc.x * 0.5 + 0.5) * w;
      const y = (-ndc.y * 0.5 + 0.5) * h;
      const hide = facing < 0.12 || ndc.z > 1 || x < -40 || y < -40 || x > w + 40 || y > h + 40;
      marker.visible = !hide;
      node.style.display = "none";
      if (!hide) pending.push({ i, x, y, kind: feature.kind });
    });
    const rank = (kind: MoonKind) =>
      dist < 1.7 ? (kind === "landing" ? 0 : kind === "crater" ? 1 : 2) : kind === "mare" ? 0 : kind === "crater" ? 1 : 2;
    pending.sort((a, b) => rank(a.kind) - rank(b.kind));
    const kept: { x: number; y: number }[] = [];
    const cap = dist < 1.7 ? 16 : 9;
    for (const item of pending) {
      const gap = item.kind === "mare" ? 118 : item.kind === "crater" ? 64 : 46;
      const crowded = kept.some((p) => Math.hypot(p.x - item.x, p.y - item.y) < gap);
      const node = labelNodes[item.i];
      const marker = markers[item.i];
      if (!node || !marker) continue;
      if (crowded || kept.length >= cap) {
        marker.visible = false;
        continue;
      }
      kept.push(item);
      marker.visible = true;
      node.style.display = "block";
      node.style.left = `${item.x}px`;
      node.style.top = `${item.y}px`;
      node.classList.toggle("is-on", selectedMoon === item.i);
    }
  }

  function updateGeoLabels() {
    const dist = camera.position.length();
    const distMoon = camera.position.distanceTo(moonPivot.position);
    const nearMoon = distMoon + 0.2 < dist && distMoon < 6;
    const showBase = !surfaceLock && !nearMoon && dist > 1.16 && dist < 9;
    borders.visible = flags.borders && showBase;
    if (!showBase || (!flags.borders && !flags.capitals)) {
      for (const label of geoLabels) label.el.style.display = "none";
      return;
    }
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    const close = dist < 1.9;
    const mid = dist < 3.1;
    const stateMin = close ? 45_000_000 : mid ? 18_000_000 : 40_000_000;
    const capMin = close ? 0 : mid ? 900_000 : Number.POSITIVE_INFINITY;
    const maxState = close ? 10 : mid ? 16 : 12;
    const maxCap = close ? 22 : mid ? 10 : 0;
    const states: { label: GeoLabel; x: number; y: number }[] = [];
    const caps: { label: GeoLabel; x: number; y: number }[] = [];
    const camN = camera.position.clone().normalize();
    for (const label of geoLabels) {
      const min = label.kind === "state" ? stateMin : capMin;
      if ((label.kind === "state" && !flags.borders) || (label.kind === "capital" && !flags.capitals) || label.weight < min) {
        label.el.style.display = "none";
        continue;
      }
      const world = latLonToThree(label.lat, label.lon, 1.012);
      if (world.clone().normalize().dot(camN) < 0.22) {
        label.el.style.display = "none";
        continue;
      }
      const ndc = world.project(camera);
      const x = (ndc.x * 0.5 + 0.5) * w;
      const y = (-ndc.y * 0.5 + 0.5) * h;
      if (ndc.z > 1 || x < 8 || y < 8 || x > w - 8 || y > h - 8) {
        label.el.style.display = "none";
        continue;
      }
      (label.kind === "state" ? states : caps).push({ label, x, y });
    }
    const centerX = w * 0.5;
    const centerY = h * 0.46;
    const place = (list: { label: GeoLabel; x: number; y: number }[], max: number, gap: number) => {
      const kept: { x: number; y: number }[] = [];
      for (const item of list) {
        const crowded = kept.some((p) => Math.hypot(p.x - item.x, p.y - item.y) < gap);
        if (crowded || kept.length >= max) {
          item.label.el.style.display = "none";
          continue;
        }
        kept.push(item);
        item.label.el.style.display = "block";
        item.label.el.style.left = `${item.x}px`;
        item.label.el.style.top = `${item.y}px`;
      }
    };
    states.sort((a, b) => b.label.weight - a.label.weight);
    if (close) {
      caps.sort((a, b) => (a.x - centerX) ** 2 + (a.y - centerY) ** 2 - ((b.x - centerX) ** 2 + (b.y - centerY) ** 2));
    } else {
      caps.sort((a, b) => b.label.weight - a.label.weight);
    }
    place(states, maxState, 58);
    place(caps, maxCap, 34);
  }

  function lookAtEarth() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hit = raycaster.intersectObject(earth, false)[0];
    if (hit) return threeToLatLon(hit.point);
    return threeToLatLon(camera.position);
  }

  function ensureMap() {
    if (map || mapPending) return;
    mapPending = true;
    window.setTimeout(() => {
      mapPending = false;
      if (map || disposed) return;
      map = createMap(mapEl, {
        zoomControl: true,
        attributionControl: false,
        minZoom: 2,
        maxZoom: 18,
        worldCopyJump: true,
      });
      tileLayer(ESRI, { maxZoom: 19, maxNativeZoom: 19 }).addTo(map);
      window.setTimeout(() => map?.invalidateSize(), 50);
    }, 0);
  }

  function pick(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const objs: THREE.Object3D[] = [];
    if (flags.satellites) {
      for (const sat of sats) if (sat.root.visible) objs.push(sat.hit);
    }
    if (flags.moonLabels) for (const marker of markers) if (marker.visible) objs.push(marker);
    const hit = raycaster.intersectObjects(objs, false)[0];
    if (!hit) {
      selectedNorad = null;
      selectedMoon = null;
      publish(true);
      return;
    }
    const data = hit.object.userData as { kind?: string; norad?: number; index?: number };
    if (data.kind === "sat" && typeof data.norad === "number") {
      selectedNorad = data.norad;
      selectedMoon = null;
    } else if (data.kind === "moon" && typeof data.index === "number") {
      selectedMoon = data.index;
      selectedNorad = null;
    }
    publish(true);
  }

  function selectionNow(): Selection | null {
    if (selectedNorad != null) {
      const sat = sats.find((s) => s.raw.norad === selectedNorad);
      if (!sat) return null;
      return {
        kind: "sat",
        name: sat.raw.name,
        norad: sat.raw.norad,
        group: sat.group,
        regime: sat.regime,
        mission: sat.mission,
        agency: sat.agency,
        altKm: sat.altKm,
        speed: sat.speed,
        incDeg: sat.incDeg,
        periodMin: sat.periodMin,
        lat: sat.lat,
        lon: sat.lon,
      };
    }
    if (selectedMoon != null) {
      const feature = MOON_FEATURES[selectedMoon];
      if (!feature) return null;
      return { kind: "moon", name: feature.name, blurb: feature.blurb, lat: feature.lat, lon: feature.lon };
    }
    return null;
  }

  function countFps() {
    frames += 1;
    const now = performance.now();
    if (now - fpsStamp > 500) {
      fps = Math.round((frames * 1000) / (now - fpsStamp));
      frames = 0;
      fpsStamp = now;
    }
  }

  function publish(force: boolean) {
    const now = performance.now();
    if (!force && now - publishAt < 200) return;
    publishAt = now;
    const distMoon = camera.position.distanceTo(moonPivot.position);
    const nearMoon = distMoon + 0.2 < camera.position.length() && distMoon < 6;
    const sunLL = threeToLatLon(sunDir);
    let lat: number | null = null;
    let lon: number | null = null;
    let altKm: number | null = null;
    let body: Telemetry["body"] = "earth";
    if (surfaceLock && map) {
      const c = map.getCenter();
      lat = c.lat;
      lon = c.lng;
      altKm = 36000 / 2 ** map.getZoom();
    } else if (nearMoon) {
      altKm = (distMoon - MOON_R) * EARTH_KM;
      body = "moon";
      const local = moonPivot.worldToLocal(camera.position.clone());
      const ll = threeToLatLon(local);
      lat = ll.lat;
      lon = ll.lon;
    } else {
      const look = lookAtEarth();
      lat = look.lat;
      lon = look.lon;
      altKm = (camera.position.length() - 1) * EARTH_KM;
      body = camera.position.length() > 30 ? "space" : "earth";
    }
    const alpha = surfaceLock
      ? 1
      : nearMoon
        ? 0
        : THREE.MathUtils.clamp((780 - (camera.position.length() - 1) * EARTH_KM) / (780 - 150), 0, 1);
    hooks.onTelemetry({
      altKm,
      lat,
      lon,
      body,
      subsolarLat: sunLL.lat,
      subsolarLon: sunLL.lon,
      moonDistKm: moonTrue.length() * AU_KM,
      fps,
      tle: tleMode,
      surfaceAlpha: alpha,
      surfaceLock,
      follow: view === "iss",
      view,
      selection: selectionNow(),
    });
  }

  function startAnim(toP: THREE.Vector3, toT: THREE.Vector3, seconds: number, done: () => void) {
    surfaceLock = false;
    mapEl.classList.remove("is-hot");
    mapPinned = false;
    anim = {
      fromP: camera.position.clone(),
      fromT: controls.target.clone(),
      toP,
      toT,
      t: 0,
      dur: reduce ? 0.01 : seconds,
      done,
    };
    mode = "anim";
    controls.autoRotate = false;
  }

  function goIss() {
    const sat = sats.find((s) => s.raw.name.toUpperCase().includes("ZARYA")) ?? sats.find((s) => s.featured);
    if (!sat) return;
    followNorad = sat.raw.norad;
    selectedNorad = sat.raw.norad;
    selectedMoon = null;
    view = "iss";
    const cam = sat.pos.clone().add(sat.pos.clone().normalize().multiplyScalar(0.48));
    startAnim(cam, sat.pos.clone(), 1.15, () => {
      mode = "follow";
    });
    publish(true);
  }

  function goMoon() {
    followNorad = null;
    view = "moon";
    const pos = moonPivot.position.clone();
    const cam = pos.clone().add(pos.clone().normalize().multiplyScalar(1.7));
    startAnim(cam, pos, 1.35, () => {
      mode = "moon";
    });
    publish(true);
  }

  function goGlobal() {
    followNorad = null;
    view = "globe";
    startAnim(latLonToThree(18, -32, 3.05), new THREE.Vector3(), 1.15, () => {
      mode = "globe";
    });
    publish(true);
  }

  function goSurface() {
    followNorad = null;
    if (camera.position.distanceTo(moonPivot.position) < 4) {
      goMoon();
      return;
    }
    view = "surface";
    const look = lookAtEarth();
    const cam = latLonToThree(look.lat, look.lon, 1.02);
    startAnim(cam, new THREE.Vector3(), 1.05, () => {
      mode = "globe";
      surfaceLock = true;
      mapPinned = false;
    });
    publish(true);
  }

  function exitSurface() {
    surfaceLock = false;
    mapPinned = false;
    mapEl.classList.remove("is-hot");
    view = "globe";
    const dir = camera.position.clone().normalize();
    startAnim(dir.multiplyScalar(3.05), new THREE.Vector3(), 1, () => {
      mode = "globe";
    });
    publish(true);
  }

  function focusSelection() {
    if (selectedNorad != null) {
      const sat = sats.find((s) => s.raw.norad === selectedNorad);
      if (!sat) return;
      followNorad = sat.raw.norad;
      const cam = sat.pos.clone().add(sat.pos.clone().normalize().multiplyScalar(0.48));
      startAnim(cam, sat.pos.clone(), 1.05, () => {
        mode = "follow";
      });
      return;
    }
    if (selectedMoon == null) return;
    const feature = MOON_FEATURES[selectedMoon];
    if (!feature) return;
    moonPivot.updateWorldMatrix(true, false);
    const cam = moonPivot.localToWorld(latLonToThree(feature.lat, feature.lon, MOON_R * 3.1));
    const target = moonPivot.localToWorld(latLonToThree(feature.lat, feature.lon, MOON_R));
    followNorad = null;
    startAnim(cam, target, 1.1, () => {
      mode = "moon";
    });
  }

  async function refreshTle() {
    const [stations, gps, science, galileo, glonass, weather, visual] = await Promise.all([
      preferText(`${CELESTRAK}stations`, TLE_URL.stations),
      preferText(`${CELESTRAK}gps-ops`, TLE_URL.gps),
      preferText(`${CELESTRAK}science`, TLE_URL.science),
      preferText(`${CELESTRAK}galileo`, TLE_URL.galileo),
      preferText(`${CELESTRAK}glo-ops`, TLE_URL.glonass),
      preferText(`${CELESTRAK}weather`, TLE_URL.weather),
      preferText(`${CELESTRAK}visual`, TLE_URL.visual),
    ]);
    let star: RawSat[] = FALLBACK_SATS.filter((s) => s.source === "starlink");
    const starText = await preferText(`${CELESTRAK}starlink`, TLE_URL.starlink, 16000);
    if (starText) star = sampleEven(parseTle(starText, "starlink"), 10);
    if (disposed) return;
    const pack: RawSat[] = [
      ...(stations ? parseTle(stations, "stations").filter((s) => keepStation(s.name)) : FALLBACK_SATS.filter((s) => s.source === "stations")),
      ...(gps ? parseTle(gps, "gps") : FALLBACK_SATS.filter((s) => s.source === "gps")),
      ...(science ? pickScience(parseTle(science, "science")) : FALLBACK_SATS.filter((s) => s.source === "science")),
      ...(galileo ? sampleEven(parseTle(galileo, "galileo"), 12) : FALLBACK_SATS.filter((s) => s.source === "galileo")),
      ...(glonass ? sampleEven(parseTle(glonass, "glonass"), 8) : []),
      ...(weather ? parseTle(weather, "geo").filter((s) => keepGeoName(s.name)).slice(0, 12) : FALLBACK_SATS.filter((s) => s.source === "geo")),
      ...(visual ? parseTle(visual, "visual").filter((s) => VISUAL_KEEP.has(s.name.toUpperCase())) : FALLBACK_SATS.filter((s) => s.source === "visual")),
      ...star,
    ];
    const live = Boolean(stations || gps || science || galileo || weather || visual || starText);
    buildSats(pack);
    if (live) tleMode = "live";
    publish(true);
  }

  async function loadGeography() {
    try {
      const [countriesRes, placesRes] = await Promise.all([fetch(GEO_URL.countries), fetch(GEO_URL.capitals)]);
      if (!countriesRes.ok || !placesRes.ok) return;
      const countries = (await countriesRes.json()) as GeoCollection;
      const places = (await placesRes.json()) as GeoCollection;
      if (disposed) return;
      const positions: number[] = [];
      for (const feature of countries.features ?? []) {
        if (!feature.geometry) continue;
        forEachRing(feature.geometry, (ring) => pushRing(ring, 1.0048, positions));
        const name = String(feature.properties?.NAME ?? feature.properties?.ADMIN ?? "");
        if (!name || /antarctic/i.test(name)) continue;
        const anchor = largestCentroid(feature.geometry);
        const pop = Number(feature.properties?.POP_EST ?? 0);
        if (!anchor || pop < 800_000) continue;
        const el = document.createElement("div");
        el.className = "et-label is-state";
        el.textContent = IT_COUNTRY[name] ?? name;
        labelsEl.appendChild(el);
        geoLabels.push({ el, lat: anchor.lat, lon: anchor.lon, kind: "state", weight: pop });
      }
      for (const feature of places.features ?? []) {
        const props = feature.properties ?? {};
        if (props.featurecla !== "Admin-0 capital") continue;
        if (feature.geometry?.type !== "Point") continue;
        const coords = feature.geometry.coordinates as number[];
        const lon = coords[0];
        const lat = coords[1];
        const name = String(props.name ?? "");
        if (!name || lat == null || lon == null) continue;
        const el = document.createElement("div");
        el.className = "et-label is-capital";
        el.textContent = IT_CITY[name] ?? name;
        labelsEl.appendChild(el);
        geoLabels.push({ el, lat, lon, kind: "capital", weight: Math.max(Number(props.pop_max ?? 0), 1) });
      }
      borders.geometry.dispose();
      const nextGeo = new THREE.BufferGeometry();
      nextGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
      borders.geometry = nextGeo;
    } catch {
      /* dataset offline: la sfera resta senza confini */
    }
  }

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointerup", onUp);
    controls.dispose();
    map?.remove();
    clearSats();
    earthGeo.dispose();
    earthMat.dispose();
    clouds.geometry.dispose();
    cloudMat.dispose();
    atmo.geometry.dispose();
    atmoMat.dispose();
    moonMesh.geometry.dispose();
    moonMat.dispose();
    moonMesh.geometry.dispose();
    moonMat.dispose();
    moonLimb.geometry.dispose();
    (moonLimb.material as THREE.Material).dispose();
    for (const group of [astroEarth, astroMoon]) {
      group.traverse((child) => {
        const line = child as THREE.Line;
        line.geometry?.dispose();
        const material = line.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
    }
    for (const el of astroEls) el.remove();
    markerGeo.dispose();
    for (const material of Object.values(moonKindMat)) material.dispose();
    dotGeo.dispose();
    hitGeo.dispose();
    hitMat.dispose();
    for (const m of Object.values(groupMat)) m.dispose();
    for (const m of Object.values(lineMat)) m.dispose();
    for (const m of Object.values(missionDot)) m.dispose();
    for (const m of Object.values(missionLine)) m.dispose();
    for (const m of Object.values(ringMat)) m.dispose();
    ringGeo.dispose();
    borders.geometry.dispose();
    borderMat.dispose();
    for (const label of geoLabels) label.el.remove();
    renderer.dispose();
    canvas.remove();
    mapEl.remove();
    labelsEl.remove();
  }

  return {
    goIss,
    goMoon,
    goGlobal,
    goSurface,
    exitSurface,
    setFlags(next) {
      Object.assign(flags, next);
      orbitAt = 0;
    },
    setTimeOffsetHours(h) {
      timeOffsetH = h;
    },
    focusSelection,
    clearSelection() {
      selectedNorad = null;
      selectedMoon = null;
      publish(true);
    },
    dispose,
    enterDefense() { defense.enter(); },
    exitDefense() { defense.exit(); },
    isDefenseActive: () => defense.state.active,
    getDefenseState: () => ({ ...defense.state }),
    buyDefenseUpgrade: (type: string) => defense.buyUpgrade(type),
    triggerLunarPulse: () => defense.lunarShockwave(),
  };
}

function guideLine(points: THREE.Vector3[], color: number, opacity: number) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 6;
  return line;
}

function equatorRing(radius: number, color: number, opacity: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 80; i += 1) {
    const a = (i / 80) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return guideLine(pts, color, opacity);
}

function spinArc(radius: number) {
  const pts: THREE.Vector3[] = [];
  const span = 0.9;
  for (let i = 0; i <= 18; i += 1) {
    const lon = (i / 18) * span;
    pts.push(new THREE.Vector3(Math.cos(lon) * radius, 0.035, -Math.sin(lon) * radius));
  }
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dir = tip.clone().sub(prev).normalize();
  const side = new THREE.Vector3(0, 1, 0).cross(dir).normalize().multiplyScalar(0.055);
  const back = dir.clone().multiplyScalar(0.09);
  const group = new THREE.Group();
  group.add(guideLine(pts, 0x3ee0a0, 0.55));
  group.add(guideLine([tip.clone().add(side).sub(back), tip, tip.clone().sub(side).sub(back)], 0x3ee0a0, 0.55));
  return group;
}

function bodyThree(body: Body, date: Date) {
  const eqj = GeoVector(body, date, true);
  const eqd = RotateVector(Rotation_EQJ_EQD(date), eqj);
  const theta = SiderealTime(date) * (Math.PI / 12);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const x = eqd.x * c + eqd.y * s;
  const y = -eqd.x * s + eqd.y * c;
  return new THREE.Vector3(x, eqd.z, -y);
}

function ecfToThree(x: number, y: number, z: number) {
  return new THREE.Vector3(x / EARTH_KM, z / EARTH_KM, -y / EARTH_KM);
}

function latLonToThree(latDeg: number, lonDeg: number, radius: number) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const cl = Math.cos(lat);
  return new THREE.Vector3(radius * cl * Math.cos(lon), radius * Math.sin(lat), -radius * cl * Math.sin(lon));
}

function threeToLatLon(p: THREE.Vector3) {
  const n = p.clone().normalize();
  const lat = Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) * (180 / Math.PI);
  let lon = Math.atan2(-n.z, n.x) * (180 / Math.PI);
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

function orientMoon(pivot: THREE.Object3D, pos: THREE.Vector3) {
  const towardEarth = pos.clone().normalize().negate();
  const north = new THREE.Vector3(0, 1, 0);
  if (Math.abs(towardEarth.dot(north)) > 0.97) north.set(1, 0, 0);
  const z = new THREE.Vector3().crossVectors(north, towardEarth).normalize();
  const y = new THREE.Vector3().crossVectors(towardEarth, z).normalize();
  pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(towardEarth, y, z));
}

function isVec(v: { x: number; y: number; z: number } | boolean): v is { x: number; y: number; z: number } {
  return typeof v === "object" && v !== null && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function safePropagate(satrec: SatRec, date: Date) {
  try {
    const pv = propagate(satrec, date);
    if (!pv || satrec.error !== 0 || !isVec(pv.position) || !isVec(pv.velocity)) return null;
    return { position: pv.position, velocity: pv.velocity };
  } catch {
    return null;
  }
}

function sampleSat(satrec: SatRec, date: Date) {
  const pv = safePropagate(satrec, date);
  if (!pv) return null;
  const gmst = gstime(date);
  const ecf = eciToEcf(pv.position, gmst);
  const geo = eciToGeodetic(pv.position, gmst);
  const pos = ecfToThree(ecf.x, ecf.y, ecf.z);
  if (!Number.isFinite(pos.x) || pos.length() < 0.9) return null;
  return {
    pos,
    altKm: geo.height,
    speed: Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z),
    lat: degreesLat(geo.latitude),
    lon: degreesLong(geo.longitude),
  };
}

function groupOf(raw: RawSat): SatGroup {
  const n = raw.name.toUpperCase();
  if (raw.source === "starlink" || n.includes("STARLINK")) return "starlink";
  if (
    raw.source === "gps" ||
    raw.source === "galileo" ||
    raw.source === "glonass" ||
    n.includes("GPS") ||
    n.includes("GALILEO") ||
    n.includes("GLONASS") ||
    n.includes("NAVSTAR")
  ) {
    return "nav";
  }
  if (
    n.includes("ZARYA") ||
    n.includes("TIANHE") ||
    n.includes("TIANZHOU") ||
    n.includes("SHENZHOU") ||
    n.includes("PROGRESS") ||
    n.includes("ISS") ||
    n.includes("CSS")
  ) {
    return "station";
  }
  return "science";
}

function isFlagship(name: string) {
  const n = name.toUpperCase();
  return (
    n.includes("ZARYA") ||
    n.includes("TIANHE") ||
    n.includes("HST") ||
    n.includes("HUBBLE") ||
    n.includes("XMM") ||
    n.includes("IXPE") ||
    n.includes("METEOSAT") ||
    n.includes("HIMAWARI") ||
    n.includes("GOES 1") ||
    n.includes("GOES-1")
  );
}

function missionOf(name: string): { kind: MissionKind; agency: string } | null {
  const n = name.toUpperCase();
  if (n.includes("ZARYA")) return { kind: "crew", agency: "NASA · Roscosmos · ESA · JAXA · CSA" };
  if (n.includes("TIANHE")) return { kind: "crew", agency: "CNSA" };
  if (n.includes("SHENZHOU")) return { kind: "crew", agency: "CNSA" };
  if (n.includes("HST") || n.includes("HUBBLE")) return { kind: "science", agency: "NASA · ESA" };
  if (n.includes("XMM")) return { kind: "science", agency: "ESA" };
  if (n.includes("IXPE")) return { kind: "science", agency: "NASA" };
  if (n.includes("TESS")) return { kind: "science", agency: "NASA" };
  if (n.includes("SWIFT")) return { kind: "science", agency: "NASA" };
  if (n.includes("FERMI")) return { kind: "science", agency: "NASA" };
  if (n.includes("CHANDRA")) return { kind: "science", agency: "NASA" };
  if (n === "TERRA" || n.startsWith("TERRA ")) return { kind: "science", agency: "NASA" };
  if (n === "AQUA" || n.startsWith("AQUA ")) return { kind: "science", agency: "NASA" };
  if (n.includes("AURA")) return { kind: "science", agency: "NASA" };
  if (n.includes("LANDSAT")) return { kind: "science", agency: "NASA · USGS" };
  if (n.includes("SUOMI") || n.includes("NOAA 20") || n.includes("NOAA-20") || n.includes("NOAA 21") || n.includes("JPSS")) {
    return { kind: "science", agency: "NOAA · NASA" };
  }
  if (n.includes("HINODE") || n.includes("SOLAR-B")) return { kind: "science", agency: "JAXA · NASA · ESA" };
  if (n.includes("METEOSAT") || n.includes("MSG")) return { kind: "science", agency: "EUMETSAT" };
  if (n.includes("HIMAWARI")) return { kind: "science", agency: "JMA" };
  if (n.includes("GOES")) return { kind: "science", agency: "NOAA · NASA" };
  if (n.includes("GAIA")) return { kind: "science", agency: "ESA" };
  if (n.includes("INTEGRAL")) return { kind: "science", agency: "ESA" };
  return null;
}

const MU = 398600.4418;

function regimeOf(satrec: SatRec): Regime {
  const n = satrec.no / 60;
  if (!Number.isFinite(n) || n <= 1e-8) return "leo";
  const a = Math.cbrt(MU / (n * n));
  const e = Math.min(0.99, Math.max(0, satrec.ecco));
  const apogee = a * (1 + e) - EARTH_KM;
  const meanAlt = a - EARTH_KM;
  if (apogee >= 34000) return "geo";
  if (meanAlt < 2000) return "leo";
  return "meo";
}

function keepGeoName(name: string) {
  const n = name.toUpperCase();
  return (
    n.includes("METEOSAT") ||
    n.includes("HIMAWARI") ||
    n.includes("GOES 1") ||
    n.includes("GOES-1") ||
    n.includes("ELEKTRO-L") ||
    n.includes("FENGYUN 4")
  );
}

function keepStation(name: string) {
  const n = name.toUpperCase();
  if (n.includes("ISS") && !n.includes("ZARYA")) return false;
  if (n.includes("CSS") && !n.includes("TIANHE")) return false;
  if (n.includes("POISK") || n.includes("MODULE")) return false;
  return true;
}

function parseTle(text: string, source: string): RawSat[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/g, "")).filter((l) => l.trim().length > 0);
  const out: RawSat[] = [];
  for (let i = 0; i < lines.length; ) {
    if (i + 2 < lines.length && lines[i + 1]?.startsWith("1 ") && lines[i + 2]?.startsWith("2 ")) {
      const tle1 = lines[i + 1]!.trim();
      const tle2 = lines[i + 2]!.trim();
      const norad = Number.parseInt(tle1.slice(2, 7), 10);
      if (Number.isFinite(norad)) out.push({ name: lines[i]?.trim() || "SAT", norad, tle1, tle2, source });
      i += 3;
    } else i += 1;
  }
  return out;
}

function sampleEven<T>(list: T[], count: number) {
  if (list.length <= count) return list;
  const step = list.length / count;
  const out: T[] = [];
  for (let i = 0; i < count; i += 1) out.push(list[Math.floor(i * step)]!);
  return out;
}

function pickScience(list: RawSat[]) {
  const featured: RawSat[] = [];
  const rest: RawSat[] = [];
  for (const sat of list) {
    if (missionOf(sat.name) || isFlagship(sat.name)) featured.push(sat);
    else rest.push(sat);
  }
  return [...featured, ...sampleEven(rest, 12)];
}

async function fetchText(url: string, ms = 12000) {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.text();
  } finally {
    window.clearTimeout(timer);
  }
}

async function preferText(primary: string, fallback: string, ms = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    let pending = 2;
    let settled = false;
    const finish = (text: string | null) => {
      if (settled) return;
      if (text && text.includes("1 ") && text.includes("2 ")) {
        settled = true;
        resolve(text);
        return;
      }
      pending -= 1;
      if (pending <= 0) {
        settled = true;
        resolve(null);
      }
    };
    fetchText(primary, 6000).then(finish, () => finish(null));
    fetchText(fallback, ms).then(finish, () => finish(null));
  });
}

type GeoGeometry = { type: string; coordinates: number[] | number[][] | number[][][] | number[][][][] };
type GeoFeature = { properties?: Record<string, unknown>; geometry?: GeoGeometry | null };
type GeoCollection = { features?: GeoFeature[] };

function forEachRing(geom: GeoGeometry, fn: (ring: number[][]) => void) {
  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates as number[][][]) fn(ring);
  } else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates as number[][][][]) for (const ring of poly) fn(ring);
  }
}

function pushRing(ring: number[][], radius: number, out: number[]) {
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i];
    const b = ring[i + 1];
    if (!a || !b) continue;
    const lon1 = a[0] ?? 0;
    const lat1 = a[1] ?? 0;
    const lon2 = b[0] ?? 0;
    const lat2 = b[1] ?? 0;
    if (Math.abs(lon2 - lon1) > 180) continue;
    const p1 = latLonToThree(lat1, lon1, radius);
    const p2 = latLonToThree(lat2, lon2, radius);
    if (p1.distanceTo(p2) > 0.28) continue;
    out.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  }
}

function largestCentroid(geom: GeoGeometry): { lat: number; lon: number } | null {
  let best: number[][] | null = null;
  let bestLen = 0;
  forEachRing(geom, (ring) => {
    if (ring.length > bestLen) {
      best = ring;
      bestLen = ring.length;
    }
  });
  if (!best || bestLen < 3) return null;
  const ring: number[][] = best;
  const lon0 = ring[0]?.[0] ?? 0;
  let slat = 0;
  let slon = 0;
  let n = 0;
  for (const pair of ring) {
    let lon = pair[0] ?? 0;
    const lat = pair[1] ?? 0;
    while (lon - lon0 > 180) lon -= 360;
    while (lon0 - lon > 180) lon += 360;
    slat += lat;
    slon += lon;
    n += 1;
  }
  if (!n) return null;
  let lon = slon / n;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat: slat / n, lon };
}

const IT_COUNTRY: Record<string, string> = {
  Italy: "Italia",
  "United States of America": "Stati Uniti",
  Russia: "Russia",
  China: "Cina",
  France: "Francia",
  Germany: "Germania",
  Spain: "Spagna",
  "United Kingdom": "Regno Unito",
  Brazil: "Brasile",
  Canada: "Canada",
  Australia: "Australia",
  India: "India",
  Japan: "Giappone",
  Mexico: "Messico",
  Argentina: "Argentina",
  Egypt: "Egitto",
  "South Africa": "Sudafrica",
  "Saudi Arabia": "Arabia Saudita",
  Turkey: "Turchia",
  Iran: "Iran",
  Indonesia: "Indonesia",
  Nigeria: "Nigeria",
  Algeria: "Algeria",
  Kazakhstan: "Kazakistan",
  Ukraine: "Ucraina",
  Poland: "Polonia",
  Sweden: "Svezia",
  Norway: "Norvegia",
  Finland: "Finlandia",
  Greece: "Grecia",
  Portugal: "Portogallo",
  Netherlands: "Paesi Bassi",
  Belgium: "Belgio",
  Switzerland: "Svizzera",
  Austria: "Austria",
  "Dem. Rep. Congo": "RD Congo",
  Sudan: "Sudan",
  Libya: "Libia",
  Mongolia: "Mongolia",
  Greenland: "Groenlandia",
  "New Zealand": "Nuova Zelanda",
  Pakistan: "Pakistan",
  Afghanistan: "Afghanistan",
  Colombia: "Colombia",
  Peru: "Perù",
  Venezuela: "Venezuela",
  Chile: "Cile",
  Bolivia: "Bolivia",
  Morocco: "Marocco",
  Ethiopia: "Etiopia",
  Kenya: "Kenya",
  Tanzania: "Tanzania",
  Angola: "Angola",
  Mozambique: "Mozambico",
  Madagascar: "Madagascar",
  "South Korea": "Corea del Sud",
  "North Korea": "Corea del Nord",
  Thailand: "Thailandia",
  Vietnam: "Vietnam",
  Malaysia: "Malaysia",
  Philippines: "Filippine",
  Iraq: "Iraq",
  Israel: "Israele",
  Romania: "Romania",
  Hungary: "Ungheria",
  Czechia: "Cechia",
};

const IT_CITY: Record<string, string> = {
  Rome: "Roma",
  Moscow: "Mosca",
  Beijing: "Pechino",
  Athens: "Atene",
  Vienna: "Vienna",
  Warsaw: "Varsavia",
  Lisbon: "Lisbona",
  Brussels: "Bruxelles",
  Prague: "Praga",
  Bucharest: "Bucarest",
  Belgrade: "Belgrado",
  Copenhagen: "Copenaghen",
  Stockholm: "Stoccolma",
  Munich: "Monaco di Baviera",
  Milan: "Milano",
  Naples: "Napoli",
  Turin: "Torino",
  Florence: "Firenze",
  Cairo: "Il Cairo",
  "The Hague": "L'Aia",
};

function zoomFromAlt(altKm: number) {
  return Math.max(2, Math.min(17, Math.log2(36000 / Math.max(altKm, 0.4))));
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function solidTexture(hex: number) {
  const data = new Uint8Array([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStars(count: number) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = 980 + Math.random() * 280;
    const theta = 2 * Math.PI * Math.random();
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xc5d2e0, size: 1.35, sizeAttenuation: false }));
}

function makeSunSprite() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  if (!g) return sprite;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,250,236,1)");
  grd.addColorStop(0.25, "rgba(255,214,150,0.75)");
  grd.addColorStop(1, "rgba(255,180,60,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  (sprite.material as THREE.SpriteMaterial).map = tex;
  sprite.scale.set(7, 7, 1);
  return sprite;
}
