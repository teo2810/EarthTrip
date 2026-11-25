import * as THREE from "three";
import { BALANCE, cooldownMult, damageMult, levelCost, turretPrice, type GunId, type TurretKind, type WarheadId } from "./defense-balance";

export type DefenseHooks = {
  getEarth: () => THREE.Object3D;
  getMoon: () => THREE.Object3D;
  getMoonPivot: () => THREE.Object3D;
  getCamera: () => THREE.Camera;
  getScene: () => THREE.Scene;
  getControls: () => { enabled: boolean; target: THREE.Vector3; autoRotate: boolean };
  onExit: () => void;
  hideSim: () => void;
  restoreSim: () => void;
};

export type MainGun = GunId;
export type MissileId = WarheadId;
export type RunLog = { score: number; wave: number; at: number };

export type DefenseState = {
  active: boolean;
  wave: number;
  earthHP: number;
  exp: number;
  score: number;
  lunarEnergy: number;
  highscore: number;
  over: boolean;
  missile: MissileId;
  ownedMissiles: Record<MissileId, boolean>;
  shield: number;
  freezeCharges: number;
  freezeLeft: number;
  mainGun: MainGun;
  gunLevels: Record<MainGun, number>;
  turretRate: number;
  turretCalibre: number;
  missileReload: number;
  missileRadius: number;
  cleared: number;
  bestCleared: number;
  bestRun: RunLog | null;
  lastRun: RunLog | null;
  shop: boolean;
  shopKind: "wave" | "freeze" | null;
  guide: boolean;
};

/** Partita salvata a fine ondata, per riprendere dopo un ricarica. */
type RunSave = {
  wave: number;
  earthHP: number;
  exp: number;
  score: number;
  lunarEnergy: number;
  shield: number;
  cleared: number;
  mainGun: MainGun;
  gunLevels: Record<MainGun, number>;
  turrets: { kind: TurretKind; angle: number }[];
  turretRate: number;
  turretCalibre: number;
  missile: MissileId;
  ownedMissiles: Record<MissileId, boolean>;
  missileReload: number;
  missileRadius: number;
};

type SaveFile = {
  v: 2;
  highscore: number;
  best: RunLog | null;
  last: RunLog | null;
  bestCleared: number;
  run: RunSave | null;
};

type Enemy = {
  mesh: THREE.Mesh;
  speed: number;
  hp: number;
  maxHp: number;
  boss: boolean;
  radius: number;
  mode: "in" | "strafe" | "blink";
  /** Pausa tra due urti del boss contro la Luna. */
  modeT: number;
  strafe: number;
  shotT: number;
  slow: number;
  /** Il boss diventa colpibile solo dopo essere entrato del tutto nello schermo. */
  entering: number;
  /** Nave tesoro: attraversa lo schermo, non punta la Terra. */
  treasure: boolean;
  vel: THREE.Vector3 | null;
  seen: boolean;
  /** Secondi al teletrasporto del boss (0 = nessuno in corso). */
  tele: number;
  teleAngle: number;
};
type Coin = { mesh: THREE.Group; arc: THREE.Mesh; life: number; value: number; q: number };
type ShotKind = "bolt" | "bomb" | "msingle" | "rada" | "grappolo" | "ricerca" | "termobarica";
type Shot = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  kind: ShotKind;
  traveled: number;
  range: number;
  pierce: number;
  blast: number;
  blastDmg: number;
  color: number;
  /** Nemici già colpiti da questo proiettile (i perforanti non colpiscono due volte lo stesso). */
  hits: Set<Enemy> | null;
  /** Ultimo nemico colpito direttamente: l'esplosione non lo colpisce una seconda volta. */
  direct: Enemy | null;
  /** Posizione al frame precedente, per il test di collisione sul segmento percorso. */
  prev: THREE.Vector3;
};
type Spark = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number };
type Shard = { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3 };
type DropKind = "shield" | "freeze" | "repair";
type Drop = { mesh: THREE.Object3D; kind: DropKind };
type Hostile = { mesh: THREE.Mesh; vel: THREE.Vector3; hp: number };

const RIM = 1.1;
const MOON_ORBIT = 2.48;
const GUNS: MainGun[] = ["singolo", "doppio", "mitra", "rosa"];
const MISSILES: MissileId[] = ["singolo", "rada", "grappolo", "ricerca", "termobarica"];
const HIST_KEY = "earthtrip-defense-log";
const SAVE_KEY = "earthtrip-defense-save";
/** Metà del lato corto inquadrato, in unità di gioco: zoom vicino e zoom largo. */
const VIEW_NEAR = 3.05;
const VIEW_FAR = 8.6;
const BOSS_WARN = 1.6;
/** Segmenti degli archi di avanzamento (energia lunare, timer delle monete). */
const ARC_SEGS = 72;
const COIN_SEGS = 48;

const noMissiles = (): Record<MissileId, boolean> => ({ singolo: true, rada: false, grappolo: false, ricerca: false, termobarica: false });
const startGuns = (): Record<MainGun, number> => ({ singolo: 1, doppio: 0, mitra: 0, rosa: 0 });
const lvl = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(BALANCE.maxLevel, Math.floor(v))) : 0);
const isLog = (v: unknown): v is RunLog => !!v && typeof (v as RunLog).score === "number";

/** Vecchi nomi delle armi (fino alla v17) verso i nuovi. */
const OLD_GUN: Record<string, MainGun> = { singolo: "singolo", raffica: "doppio", doppio: "doppio", mitra: "mitra", rosa: "rosa" };
const OLD_MISSILE: Record<string, MissileId> = { none: "singolo", singolo: "singolo", limited: "singolo", slow: "rada", rada: "rada", cluster: "grappolo", grappolo: "grappolo", homing: "ricerca", ricerca: "ricerca", termobarica: "termobarica" };

function migrateRun(raw: unknown): RunSave | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.wave !== "number" || r.wave < 1) return null;
  const gunLevels = startGuns();
  const gl = (r.gunLevels ?? {}) as Record<string, unknown>;
  const og = (r.ownedGuns ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries({ ...og, ...gl })) {
    const id = OLD_GUN[k];
    if (!id) continue;
    gunLevels[id] = Math.max(gunLevels[id], v === true ? 1 : lvl(v));
  }
  gunLevels.singolo = Math.max(1, gunLevels.singolo);
  const ownedMissiles = noMissiles();
  for (const [k, v] of Object.entries((r.ownedMissiles ?? {}) as Record<string, unknown>)) {
    const id = OLD_MISSILE[k];
    if (id && v) ownedMissiles[id] = true;
  }
  const mg = OLD_GUN[String(r.mainGun)] ?? "singolo";
  const ms = OLD_MISSILE[String(r.missile)] ?? "singolo";
  const turrets = (Array.isArray(r.turrets) ? r.turrets : [])
    .filter((t): t is { kind: string; angle: number } => !!t && typeof t.angle === "number")
    .map((t) => ({ kind: (t.kind === "missile" || t.kind === "mortar" ? t.kind : "cannon") as TurretKind, angle: t.angle }))
    .slice(0, BALANCE.turrets.max);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    wave: Math.floor(r.wave),
    earthHP: Math.max(1, Math.min(100, num(r.earthHP, 100))),
    exp: Math.max(0, num(r.exp, 0)),
    score: Math.max(0, num(r.score, 0)),
    lunarEnergy: Math.max(0, Math.min(100, num(r.lunarEnergy, 0))),
    shield: Math.max(0, Math.min(3, num(r.shield, 0))),
    cleared: Math.max(0, num(r.cleared, 0)),
    mainGun: gunLevels[mg] > 0 ? mg : "singolo",
    gunLevels,
    turrets,
    turretRate: lvl(r.turretRate),
    turretCalibre: lvl(r.turretCalibre),
    missile: ownedMissiles[ms] ? ms : "singolo",
    ownedMissiles,
    missileReload: lvl(r.missileReload),
    missileRadius: lvl(r.missileRadius),
  };
}

/**
 * Legge il salvataggio. Se c'è solo il formato vecchio (record in "earthtrip-hs"
 * e storico in "earthtrip-defense-log"), lo converte senza perdere nulla.
 */
export function loadSave(): SaveFile {
  const read = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const hs = parseInt(read("earthtrip-hs") || "0", 10) || 0;
  let log: { best?: unknown; last?: unknown; bestCleared?: unknown } | null = null;
  try {
    log = JSON.parse(read(HIST_KEY) || "null");
  } catch {
    log = null;
  }
  let file: Partial<SaveFile> & { run?: unknown } = {};
  try {
    file = JSON.parse(read(SAVE_KEY) || "null") || {};
  } catch {
    file = {};
  }
  const pick = (a: unknown, b: unknown) => (isLog(a) && isLog(b) ? (a.score >= b.score ? a : b) : isLog(a) ? a : isLog(b) ? b : null);
  const best = pick(file.best, log?.best) ?? (hs > 0 ? { score: hs, wave: 1, at: 0 } : null);
  const last = isLog(file.last) ? file.last : isLog(log?.last) ? log.last : null;
  const bestCleared = Math.max(typeof file.bestCleared === "number" ? file.bestCleared : 0, typeof log?.bestCleared === "number" ? log.bestCleared : 0);
  const highscore = Math.max(hs, typeof file.highscore === "number" ? file.highscore : 0, best?.score ?? 0);
  return { v: 2, highscore, best, last, bestCleared, run: migrateRun(file.run) };
}

/** Distanza al quadrato tra il punto p e il segmento a→b, sul piano di gioco. */
function segDistSq(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len = abx * abx + aby * aby;
  let t = len > 1e-12 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + abx * t - p.x;
  const dy = a.y + aby * t - p.y;
  return dx * dx + dy * dy;
}

export function createDefenseMode(hooks: DefenseHooks) {
  const reduceMotion = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saved = loadSave();
  let savedRun: RunSave | null = saved.run;
  const state: DefenseState = {
    active: false,
    wave: 1,
    earthHP: 100,
    exp: 0,
    score: 0,
    lunarEnergy: 0,
    highscore: saved.highscore,
    over: false,
    missile: "singolo",
    ownedMissiles: noMissiles(),
    shield: 0,
    freezeCharges: 0,
    freezeLeft: 0,
    mainGun: "singolo",
    gunLevels: startGuns(),
    turretRate: 0,
    turretCalibre: 0,
    missileReload: 0,
    missileRadius: 0,
    cleared: 0,
    bestCleared: saved.bestCleared,
    bestRun: saved.best,
    lastRun: saved.last,
    shop: false,
    shopKind: null,
    guide: true,
  };

  const cannons: THREE.Group[] = [];
  type Turret = { angle: number; kind: TurretKind; cd: number; mesh: THREE.Group };
  const turrets: Turret[] = [];
  let place: { kind: TurretKind; angle: number } | null = null;
  let ghost: THREE.Group | null = null;
  let placeMsg = "";
  /** Descrizione del cono della torretta da piazzare, resta visibile mentre la si trascina. */
  let placeCone = "";
  const enemies: Enemy[] = [];
  const projectiles: Shot[] = [];
  const particles: Spark[] = [];
  const drops: Drop[] = [];
  const hostiles: Hostile[] = [];
  const aimPoint = new THREE.Vector3(0, 4, 0);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const savedCam = new THREE.Vector3();
  const savedTarget = new THREE.Vector3();
  const camFrom = new THREE.Vector3();
  const camTo = new THREE.Vector3();
  const targetFrom = new THREE.Vector3();
  const targetTo = new THREE.Vector3();

  let aimAngle = Math.PI / 2;
  let spawnTimer = 0;
  let fireCooldown = 0;
  let bossWarn = 0;
  let bossWarnAngle = 0;
  let treasureAt = -1;
  let teleGhost: THREE.Mesh | null = null;
  const coins: Coin[] = [];
  let trashQuota = 5;
  let trashSpawned = 0;
  let bossSpawned = false;
  let camT = 1;
  let phase: "idle" | "enter" | "play" | "exit" | "boom" = "idle";
  let moonRing: THREE.Mesh | null = null;
  let moonArc: THREE.Mesh | null = null;
  let cross: THREE.Group | null = null;
  let shieldMesh: THREE.Mesh | null = null;
  let crackGroup: THREE.Group | null = null;
  let arcProgress = -1;
  let zoom = 0.3;
  let zoomGoal = 0.3;
  let boomT = 0;
  let flash = 0;
  let veil = 0;
  let pendingFinale = false;
  let finale: {
    score: number;
    wave: number;
    highscore: number;
    lastScore: number | null;
    lastWave: number | null;
  } | null = null;
  let hitShake = 0;
  const shards: Shard[] = [];
  let boomRing: THREE.Mesh | null = null;
  let boomCore: THREE.Mesh | null = null;

  function holdsCamera() {
    return phase !== "idle";
  }

  function hidesPlanet() {
    return phase === "boom" || (phase === "exit" && veil > 0.28);
  }

  /** Tangenti dei semi-angoli di vista, verticale e orizzontale. */
  function viewTans(cam: THREE.PerspectiveCamera) {
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5);
    return { tv, th: tv * Math.max(0.35, cam.aspect) };
  }

  /**
   * Lo zoom (0 vicino, 1 largo) fissa quanto spazio si vede sul lato corto dello schermo,
   * così telefono verticale e desktop inquadrano sempre Terra, Luna e nemici in modo sensato.
   */
  function viewZ(cam: THREE.PerspectiveCamera) {
    const { tv, th } = viewTans(cam);
    const half = VIEW_NEAR * (VIEW_FAR / VIEW_NEAR) ** zoom;
    return THREE.MathUtils.clamp(half / Math.min(tv, th), 5.2, 60);
  }

  /** Metà larghezza e metà altezza visibili sul piano di gioco. */
  function viewHalf() {
    const cam = hooks.getCamera() as THREE.PerspectiveCamera;
    const { tv, th } = viewTans(cam);
    const z = Math.max(1, cam.position.z || viewZ(cam));
    return { w: z * th, h: z * tv };
  }

  function visibleRadius() {
    const v = viewHalf();
    return Math.max(4.8, Math.hypot(v.w, v.h));
  }

  /** Vero se il punto è dentro lo schermo, con un margine interno. */
  function onScreen(p: THREE.Vector3, margin = 0) {
    const v = viewHalf();
    return Math.abs(p.x) <= v.w - margin && Math.abs(p.y) <= v.h - margin;
  }

  /** Nemico colpibile: dentro lo schermo e, se boss, già entrato del tutto. */
  function targetable(e: Enemy) {
    return e.entering <= 0 && onScreen(e.mesh.position, e.boss ? e.radius : 0);
  }

  function horizon() {
    return visibleRadius();
  }

  function setZoom01(t: number) {
    if (phase === "idle" || phase === "exit" || phase === "boom") return;
    zoomGoal = THREE.MathUtils.clamp(t, 0, 1);
  }

  function zoom01() {
    return zoomGoal;
  }

  function freshArcade() {
    state.missile = "singolo";
    state.mainGun = "singolo";
    state.gunLevels = startGuns();
    state.ownedMissiles = noMissiles();
    state.turretRate = 0;
    state.turretCalibre = 0;
    state.missileReload = 0;
    state.missileRadius = 0;
    state.shop = false;
    state.shopKind = null;
    state.guide = true;
    state.shield = 0;
    state.freezeCharges = 0;
    state.freezeLeft = 0;
    state.cleared = 0;
    bossWarn = 0;
    place = null;
    placeMsg = "";
    clearGhost();
    for (const t of turrets) disposeObject(t.mesh);
    turrets.length = 0;
  }



  function gunStats(id: MainGun) {
    const g = BALANCE.gun[id];
    const l = Math.max(1, state.gunLevels[id]);
    return { damage: g.damage * damageMult(g.damagePerLevel, l), cooldown: g.cooldown * cooldownMult(g.ratePerLevel, l), pellets: g.pellets };
  }

  function turretDamage() {
    return 1 + BALANCE.turretUpgrades.calibre.perLevel * state.turretCalibre;
  }

  function turretRate() {
    return 1 / (1 + BALANCE.turretUpgrades.rate.perLevel * state.turretRate);
  }

  /** Ricarica effettiva di una testata, in secondi. */
  function warheadCooldown(id: MissileId) {
    return BALANCE.missiles[id].cooldown * turretRate() / (1 + BALANCE.missileUpgrades.reload.perLevel * state.missileReload);
  }

  function warheadRadius(id: MissileId) {
    return BALANCE.missiles[id].radius * (1 + BALANCE.missileUpgrades.radius.perLevel * state.missileRadius);
  }

  function turretCost(kind: TurretKind) {
    return turretPrice(kind, turrets.length);
  }

  function angDelta(a: number, b: number) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function tooClose(angle: number) {
    return turrets.some((t) => Math.abs(angDelta(t.angle, angle)) < 0.32);
  }

  let previousRun: RunLog | null = null;
  /** La partita in corso è già stata registrata nello storico (evita il doppio salvataggio). */
  let runPersisted = false;
  /** Pausa esplicita (pulsante Pausa o scheda in background). */
  let paused = false;

  function writeLog() {
    const file: SaveFile = {
      v: 2,
      highscore: state.highscore,
      best: state.bestRun,
      last: state.lastRun,
      bestCleared: state.bestCleared,
      run: savedRun,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(file));
      localStorage.setItem(HIST_KEY, JSON.stringify({ best: state.bestRun, last: state.lastRun, bestCleared: state.bestCleared }));
      localStorage.setItem("earthtrip-hs", String(state.highscore));
    } catch {
      /* memoria piena o bloccata: si gioca lo stesso */
    }
  }

  /** Salva la partita a fine ondata, con livelli, sblocchi e torrette. */
  function saveRun() {
    savedRun = {
      wave: state.wave,
      earthHP: state.earthHP,
      exp: state.exp,
      score: state.score,
      lunarEnergy: state.lunarEnergy,
      shield: state.shield,
      cleared: state.cleared,
      mainGun: state.mainGun,
      gunLevels: { ...state.gunLevels },
      turrets: turrets.map((t) => ({ kind: t.kind, angle: t.angle })),
      turretRate: state.turretRate,
      turretCalibre: state.turretCalibre,
      missile: state.missile,
      ownedMissiles: { ...state.ownedMissiles },
      missileReload: state.missileReload,
      missileRadius: state.missileRadius,
    };
    writeLog();
  }

  function dropRun() {
    savedRun = null;
    writeLog();
  }

  function resumeRun(run: RunSave) {
    freshArcade();
    state.wave = run.wave;
    state.earthHP = run.earthHP;
    state.exp = run.exp;
    state.score = run.score;
    state.lunarEnergy = run.lunarEnergy;
    state.shield = run.shield;
    state.cleared = run.cleared;
    state.gunLevels = { ...run.gunLevels };
    state.mainGun = run.mainGun;
    state.turretRate = run.turretRate;
    state.turretCalibre = run.turretCalibre;
    state.ownedMissiles = { ...run.ownedMissiles };
    state.missile = run.missile;
    state.missileReload = run.missileReload;
    state.missileRadius = run.missileRadius;
    for (const t of run.turrets) addTurret(t.kind, t.angle);
    bossSpawned = true;
    state.guide = false;
    state.shop = true;
    state.shopKind = "wave";
    syncShield();
  }

  function persistRun(force: boolean) {
    if (runPersisted) return;
    runPersisted = true;
    const run = { score: Math.floor(state.score), wave: state.wave, at: Date.now() };
    previousRun = state.lastRun;
    if (!force && run.score <= 0 && state.wave <= 1 && state.cleared <= 0) return;
    state.lastRun = run;
    if (!state.bestRun || run.score > state.bestRun.score) state.bestRun = run;
    state.highscore = Math.max(state.highscore, run.score);
    if (state.cleared > state.bestCleared) state.bestCleared = state.cleared;
    writeLog();
  }

  function armWave() {
    trashQuota = 8 + state.wave * 2;
    trashSpawned = 0;
    bossSpawned = false;
    spawnTimer = 0.45;
    const t = BALANCE.treasure;
    treasureAt = state.wave >= t.minWave && Math.random() < t.chancePerWave
      ? Math.floor(trashQuota * (0.3 + Math.random() * 0.5))
      : -1;
  }

  type ShopAction = { id: string; label: string; cost: number | null; disabled: boolean };
  type ShopCard = {
    key: string;
    name: string;
    icon: string;
    copy: string;
    stat: string;
    level: number | null;
    max: number;
    selected: boolean;
    main: ShopAction | null;
    side: ShopAction | null;
  };

  const GUN_NAME: Record<MainGun, string> = { singolo: "Singolo", doppio: "Doppio", mitra: "Mitra", rosa: "Rosa" };
  const TURRET_NAME: Record<TurretKind, string> = { cannon: "Cannone base", missile: "Lancia-missili", mortar: "Mortaio" };
  const WARHEAD_NAME: Record<MissileId, string> = { singolo: "Singolo", rada: "Rada", grappolo: "Grappolo", ricerca: "Ricerca", termobarica: "Termobarica" };
  const fmt = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1)).replace(".", ",");

  function upAction(id: string, base: number, level: number): ShopAction {
    const cost = levelCost(base, level);
    return { id, label: cost == null ? "Max" : level === 0 ? "Compra" : "Liv. +1", cost, disabled: cost == null || state.exp < cost };
  }

  /** Modello dello shop: ogni card sa già prezzo, livello e se si può comprare. */
  function shopModel() {
    const exp = state.exp;
    const shopOpen = state.shop;
    const guns: ShopCard[] = GUNS.map((id) => {
      const level = state.gunLevels[id];
      const st = gunStats(id);
      const base = BALANCE.gun[id].base;
      const owned = level > 0;
      return {
        key: `gun-${id}`,
        name: GUN_NAME[id],
        icon: `gun-${id}`,
        copy: "",
        stat: `Danno ${fmt(st.damage * st.pellets)} · ${fmt(1 / st.cooldown)} colpi/s`,
        level: owned ? level : 0,
        max: BALANCE.maxLevel,
        selected: state.mainGun === id,
        main: owned
          ? { id: `gun-${id}`, label: state.mainGun === id ? "In uso" : "Usa", cost: null, disabled: state.mainGun === id }
          : { id: `gun-${id}`, label: "Sblocca", cost: base, disabled: !shopOpen || exp < base },
        side: owned ? upAction(`up-gun-${id}`, base, level) : null,
      };
    });
    const full = turrets.length >= BALANCE.turrets.max;
    const kinds: TurretKind[] = ["cannon", "missile", "mortar"];
    const tc = BALANCE.turrets;
    const towerCopy: Record<TurretKind, string> = {
      cannon: `Spara in avanti, cono ±${tc.cannon.coneDeg}°, e non ruota.`,
      missile: `Lunga gittata, cono ±${tc.missile.coneDeg}° che oscilla di ±${tc.missile.sweepDeg}°. Spara la testata scelta nella scheda Missili.`,
      mortar: `Bomba ad area sui nemici vicini (gittata ${fmt(tc.mortar.reach)}), lenta.`,
    };
    const towers: ShopCard[] = kinds.map((kind) => {
      const cost = turretCost(kind);
      const n = turrets.filter((t) => t.kind === kind).length;
      return {
        key: `arm-${kind}`,
        name: TURRET_NAME[kind],
        icon: `arm-${kind}`,
        copy: towerCopy[kind],
        stat: n ? `Ne hai ${n}` : "",
        level: null,
        max: 0,
        selected: false,
        main: { id: `arm-${kind}`, label: full ? "Pieno" : "Piazza", cost: full ? null : cost, disabled: full || exp < cost },
        side: null,
      };
    });
    const tu = BALANCE.turretUpgrades;
    towers.push(
      {
        key: "up-rate", name: "Cadenza", icon: "up-rate", copy: "",
        stat: `Ricarica torrette −${Math.round((1 - turretRate()) * 100)}%`,
        level: state.turretRate, max: BALANCE.maxLevel, selected: false, main: null,
        side: upAction("up-rate", tu.rate.base, state.turretRate),
      },
      {
        key: "up-cal", name: "Calibro", icon: "up-cal", copy: "",
        stat: `${calibreTier().name} · danno torrette +${Math.round((turretDamage() - 1) * 100)}%`,
        level: state.turretCalibre, max: BALANCE.maxLevel, selected: false, main: null,
        side: upAction("up-cal", tu.calibre.base, state.turretCalibre),
      },
    );
    const mu = BALANCE.missileUpgrades;
    const warheads: ShopCard[] = MISSILES.map((id) => {
      const owned = state.ownedMissiles[id];
      const cost = BALANCE.missiles[id].cost;
      const r = warheadRadius(id);
      return {
        key: `wh-${id}`,
        name: WARHEAD_NAME[id],
        icon: `wh-${id}`,
        copy: "",
        stat: `Ricarica ${fmt(warheadCooldown(id))} s${r > 0 ? ` · raggio ${fmt(r)}` : ""}`,
        level: null,
        max: 0,
        selected: state.missile === id,
        main: owned
          ? { id: `wh-${id}`, label: state.missile === id ? "In uso" : "Usa", cost: null, disabled: state.missile === id }
          : { id: `wh-${id}`, label: "Sblocca", cost, disabled: exp < cost },
        side: null,
      };
    });
    warheads.push(
      {
        key: "up-reload", name: "Ricarica rapida", icon: "up-reload", copy: "",
        stat: `Ricarica missili −${Math.round((1 - 1 / (1 + mu.reload.perLevel * state.missileReload)) * 100)}%`,
        level: state.missileReload, max: BALANCE.maxLevel, selected: false, main: null,
        side: upAction("up-reload", mu.reload.base, state.missileReload),
      },
      {
        key: "up-radius", name: "Raggio esplosione", icon: "up-radius", copy: "",
        stat: `Raggio +${Math.round(mu.radius.perLevel * state.missileRadius * 100)}%`,
        level: state.missileRadius, max: BALANCE.maxLevel, selected: false, main: null,
        side: upAction("up-radius", mu.radius.base, state.missileRadius),
      },
    );
    const launchers = turrets.some((t) => t.kind === "missile");
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    const modes = guns.map((c) => ({ ...c, side: null, level: c.level ? c.level : null }));
    const powers = guns
      .filter((c) => (c.level ?? 0) > 0)
      .map((c) => {
        const g = BALANCE.gun[c.key.slice(4) as MainGun];
        return {
          ...c,
          key: `pow-${c.key}`,
          name: `Potenza ${c.name}`,
          copy: `Ogni livello: danno +${pct(g.damagePerLevel)}, cadenza +${pct(g.ratePerLevel)}, colpo più grosso.`,
          selected: false,
          main: null,
        };
      });
    type Group = { key: string; title: string; note: string; cards: ShopCard[] };
    const tab = (key: string, title: string, groups: Group[]) => ({
      key,
      title,
      groups,
      ready: groups.some((g) => g.cards.some((c) => [c.main, c.side].some((a) => a && a.cost != null && !a.disabled))),
    });
    return [
      tab("gun", "Cannone", [
        { key: "gun-modes", title: "Modalità", note: "Sblocca e scegli il colpo. Le cambi anche in partita.", cards: modes },
        { key: "gun-pow", title: "Potenziamenti", note: powers.length ? "" : "Sblocca una modalità per potenziarla.", cards: powers },
      ]),
      tab("tower", "Torrette", [
        { key: "tower-place", title: `Piazza · ${turrets.length}/${BALANCE.turrets.max}`, note: `Ogni torretta in più costa il ${Math.round((BALANCE.turrets.growth - 1) * 100)}% in più.`, cards: towers.slice(0, 3) },
        { key: "tower-pow", title: "Potenziamenti per tutte", note: "", cards: towers.slice(3) },
      ]),
      tab("missile", "Missili", launchers
        ? [
            { key: "wh", title: "Testate", note: "Più è potente, più tarda a ricaricare.", cards: warheads.slice(0, MISSILES.length) },
            { key: "wh-pow", title: "Potenziamenti", note: "", cards: warheads.slice(MISSILES.length) },
          ]
        : [{ key: "wh", title: "Testate", note: "Piazza un lancia-missili (scheda Torrette) per scegliere le testate.", cards: [] }]),
    ];
  }

  function snapshot() {
    const bossE = enemies.find((e) => e.boss);
    const ownedGuns = GUNS.filter((id) => state.gunLevels[id] > 0);
    const bossOff = bossE && !onScreen(bossE.mesh.position, 0);
    const bossHint = bossE && bossE.tele > 0
      ? { angle: bossE.teleAngle, warn: false, tele: true }
      : bossWarn > 0
      ? { angle: bossWarnAngle, warn: true }
      : bossOff
        ? { angle: Math.atan2(bossE.mesh.position.y, bossE.mesh.position.x), warn: false }
        : null;
    return {
      ...state,
      gunLevels: { ...state.gunLevels },
      ownedMissiles: { ...state.ownedMissiles },
      phase,
      flash,
      veil,
      finale,
      zoom: zoom01(),
      boss: Boolean(bossE),
      bossHp: bossE ? Math.max(0, bossE.hp) : 0,
      bossMax: bossE ? bossE.maxHp : 0,
      bossShielded: Boolean(bossE && bossE.entering > 0),
      placing: place?.kind ?? null,
      placeMsg,
      paused,
      bossHint,
      resume: state.guide && savedRun ? { wave: savedRun.wave, exp: Math.floor(savedRun.exp) } : null,
      turrets: turrets.map((t) => ({ kind: t.kind, angle: t.angle })),
      turretCount: turrets.length,
      turretMax: BALANCE.turrets.max,
      guns: ownedGuns.map((id) => ({ id: `gun-${id}`, name: GUN_NAME[id], level: state.gunLevels[id], selected: state.mainGun === id })),
      tabs: shopModel(),
      bossTele: bossE && bossE.tele > 0 ? { angle: bossE.teleAngle, left: bossE.tele / BALANCE.boss.teleportTelegraph } : null,
      treasure: enemies.some((e) => e.treasure),
      coins: coins.map((c) => ({ left: c.life, value: c.value })),
    };
  }

  function makeCannon(primary: boolean) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: primary ? 0xd5e7f5 : 0x8ea3b8,
      metalness: 0.72,
      roughness: 0.28,
      emissive: primary ? 0x123228 : 0x000000,
      emissiveIntensity: 0.4,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.07, 12), mat);
    base.rotation.x = Math.PI / 2;
    const barrel = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.055, 0.055),
      new THREE.MeshStandardMaterial({
        color: primary ? 0x3ee0a0 : 0xb7c6d6,
        metalness: 0.45,
        roughness: 0.35,
        emissive: primary ? 0x0d3b2c : 0x000000,
        emissiveIntensity: 0.55,
      }),
    );
    barrel.position.x = 0.22;
    g.add(base, barrel);
    hooks.getScene().add(g);
    return g;
  }

  function makeLauncher() {
    const g = new THREE.Group();
    const pod = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.16, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0xffb15a,
        emissive: 0x5a2a08,
        emissiveIntensity: 0.7,
        metalness: 0.4,
        roughness: 0.35,
      }),
    );
    pod.position.x = 0.08;
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xffe0a8,
      emissive: 0xff9a2a,
      emissiveIntensity: 0.45,
      metalness: 0.3,
      roughness: 0.4,
    });
    const left = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.28, 8), tubeMat);
    const right = left.clone();
    left.rotation.z = Math.PI / 2;
    right.rotation.z = Math.PI / 2;
    left.position.set(0.16, 0.045, 0);
    right.position.set(0.16, -0.045, 0);
    g.add(pod, left, right);
    hooks.getScene().add(g);
    return g;
  }

  function makeMortar() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xff7a3a, emissive: 0x5a1e08, emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.4 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.07, 12), mat);
    base.rotation.x = Math.PI / 2;
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.075, 0.2, 10),
      new THREE.MeshStandardMaterial({ color: 0xffc29a, emissive: 0xff6a22, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.4 }),
    );
    tube.rotation.z = Math.PI / 2;
    tube.position.x = 0.13;
    g.add(base, tube);
    hooks.getScene().add(g);
    return g;
  }

  function makeTurretMesh(kind: TurretKind) {
    return kind === "cannon" ? makeCannon(false) : kind === "missile" ? makeLauncher() : makeMortar();
  }

  function turretCone(kind: TurretKind) {
    const deg = kind === "cannon" ? BALANCE.turrets.cannon.coneDeg : kind === "mortar" ? BALANCE.turrets.mortar.coneDeg : BALANCE.turrets.missile.coneDeg;
    return (deg * Math.PI) / 180;
  }

  function turretColor(kind: TurretKind) {
    return kind === "cannon" ? 0x7dfff0 : kind === "missile" ? 0xffb15a : 0xff7a3a;
  }

  function disposeObject(obj: THREE.Object3D) {
    hooks.getScene().remove(obj);
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      if (Array.isArray(mat)) mat.forEach((m) => !m.userData.shared && m.dispose());
      else if (!mat.userData.shared) mat.dispose();
    });
  }

  /*
   * Geometrie e materiali condivisi per gli oggetti che nascono e muoiono a ogni frame
   * (scintille, proiettili, colpi ostili, nemici comuni, anelli delle esplosioni).
   * Sono marcati "shared": disposeObject li salta, così restano in GPU una volta sola.
   */
  function share<T extends THREE.BufferGeometry | THREE.Material>(x: T): T {
    x.userData.shared = true;
    return x;
  }
  const GEO = {
    spark: share(new THREE.SphereGeometry(0.035, 4, 4)),
    ball: share(new THREE.SphereGeometry(1, 6, 6)),
    trash: share(new THREE.OctahedronGeometry(0.16, 0)),
    blast: share(new THREE.RingGeometry(0.15, 0.28, 28)),
  };
  const basicMats = new Map<number, THREE.MeshBasicMaterial>();
  function basicMat(color: number) {
    let m = basicMats.get(color);
    if (!m) {
      m = share(new THREE.MeshBasicMaterial({ color }));
      basicMats.set(color, m);
    }
    return m;
  }
  const trashMat = share(new THREE.MeshStandardMaterial({ color: 0xff4d6d, emissive: 0x5a1020, emissiveIntensity: 0.7, metalness: 0.25, roughness: 0.38 }));
  /** Vettori di appoggio riusati nel ciclo di gioco, per non allocare a ogni frame. */
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  function clearShield() {
    if (shieldMesh) {
      disposeObject(shieldMesh);
      shieldMesh = null;
    }
    if (crackGroup) {
      disposeObject(crackGroup);
      crackGroup = null;
    }
  }
  function makeCone(color: number, opacity: number, half: number) {
    const len = 3.4;
    const shape = new THREE.Shape();
    shape.moveTo(0.22, 0);
    shape.lineTo(Math.cos(half) * len, Math.sin(half) * len);
    shape.lineTo(Math.cos(-half) * len, Math.sin(-half) * len);
    shape.closePath();
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.renderOrder = 4;
    return mesh;
  }

  function clearGhost() {
    if (!ghost) return;
    disposeObject(ghost);
    ghost = null;
  }

  function syncGhost() {
    if (!place || phase !== "play") {
      clearGhost();
      return;
    }
    if (!ghost || ghost.userData.kind !== place.kind) {
      clearGhost();
      ghost = makeTurretMesh(place.kind);
      ghost.userData.kind = place.kind;
      ghost.add(makeCone(turretColor(place.kind), 0.5, turretCone(place.kind)));
    }
    ghost.position.set(Math.cos(place.angle) * RIM, Math.sin(place.angle) * RIM, 0.08);
    ghost.rotation.set(0, 0, place.kind === "missile" ? missileFacing(place.angle) : place.angle);
    ghost.visible = true;
  }

  function addTurret(kind: TurretKind, angle: number) {
    const mesh = makeTurretMesh(kind);
    mesh.add(makeCone(turretColor(kind), kind === "mortar" ? 0.24 : 0.42, turretCone(kind)));
    const turret = { angle, kind, cd: 0.35, mesh };
    turrets.push(turret);
    placeTurret(turret);
  }

  function missileFacing(base: number) {
    return base + Math.sin(performance.now() * 0.0021) * ((BALANCE.turrets.missile.sweepDeg * Math.PI) / 180);
  }

  function placeTurret(t: { angle: number; kind?: TurretKind; mesh: THREE.Group }) {
    const show = phase === "play" || phase === "enter";
    const facing = t.kind === "missile" ? missileFacing(t.angle) : t.angle;
    t.mesh.position.set(Math.cos(t.angle) * RIM, Math.sin(t.angle) * RIM, 0.05);
    t.mesh.rotation.set(0, 0, facing);
    t.mesh.visible = show;
  }

  function syncCannons() {
    const show = phase === "play" || phase === "enter";
    while (cannons.length < 1) cannons.push(makeCannon(true));
    while (cannons.length > 1) {
      const extra = cannons.pop();
      if (extra) disposeObject(extra);
    }
    const gun = cannons[0];
    const wobble = state.mainGun === "mitra" ? Math.sin(performance.now() * 0.02) * 0.045 : 0;
    const aim = aimAngle + wobble;
    gun.position.set(Math.cos(aim) * RIM, Math.sin(aim) * RIM, 0.04);
    gun.rotation.set(0, 0, aim);
    gun.visible = show && !state.over;
    for (const t of turrets) placeTurret(t);
    syncGhost();
  }

  function syncShield() {
    const scene = hooks.getScene();
    if (state.shield <= 0) {
      clearShield();
      return;
    }
    if (!shieldMesh) {
      shieldMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.22, 28, 18),
        new THREE.MeshBasicMaterial({
          color: 0x9ad7ff,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
          side: THREE.BackSide,
        }),
      );
      shieldMesh.renderOrder = 3;
      scene.add(shieldMesh);
    }
    (shieldMesh.material as THREE.MeshBasicMaterial).opacity = 0.1 + state.shield * 0.07;
    if (crackGroup) {
      disposeObject(crackGroup);
      crackGroup = null;
    }
    crackGroup = new THREE.Group();
    const cracks = 3 - state.shield;
    for (let c = 0; c < cracks; c += 1) {
      const a = c * 2.1 + 0.4;
      const pts = [
        new THREE.Vector3(Math.cos(a) * 1.16, Math.sin(a) * 1.16, 0.04),
        new THREE.Vector3(Math.cos(a + 0.35) * 1.05, Math.sin(a + 0.22) * 1.02, 0.05),
        new THREE.Vector3(Math.cos(a + 0.7) * 1.18, Math.sin(a + 0.55) * 1.12, 0.04),
      ];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xd7f4ff, transparent: true, opacity: 0.85 }),
      );
      crackGroup.add(line);
    }
    scene.add(crackGroup);
  }

  function ensureAimGfx() {
    if (!cross) {
      cross = new THREE.Group();
      const mat = new THREE.LineBasicMaterial({ color: 0xe9fff8, transparent: true, opacity: 0.95, depthTest: false });
      const r = 0.16;
      const bits: [number, number, number, number][] = [
        [-r, 0, -r * 0.38, 0],
        [r * 0.38, 0, r, 0],
        [0, -r, 0, -r * 0.38],
        [0, r * 0.38, 0, r],
      ];
      for (const [x1, y1, x2, y2] of bits) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x1, y1, 0),
          new THREE.Vector3(x2, y2, 0),
        ]);
        const line = new THREE.Line(geo, mat);
        line.renderOrder = 9;
        cross.add(line);
      }
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.2, 0.228, 40),
        new THREE.MeshBasicMaterial({
          color: 0x7dfff0,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
          depthTest: false,
        }),
      );
      ring.renderOrder = 9;
      cross.add(ring);
      hooks.getScene().add(cross);
    }
  }

  function updateAimGfx() {
    if (!cross) return;
    cross.position.set(aimPoint.x, aimPoint.y, 0.06);
    cross.visible = phase === "play" && !state.shop;
  }

  function ensureMoonRing() {
    if (moonRing) return;
    moonRing = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.47, 64),
      new THREE.MeshBasicMaterial({
        color: 0x6f8cff,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    moonArc = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.52, ARC_SEGS, 1, Math.PI / 2, Math.PI * 2),
      new THREE.MeshBasicMaterial({
        color: 0x9fd0ff,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    moonRing.renderOrder = 6;
    moonArc.renderOrder = 7;
    hooks.getScene().add(moonRing, moonArc);
  }

  function updateMoonRing() {
    if (!moonRing || !moonArc) return;
    const p = hooks.getMoonPivot().position;
    moonRing.position.set(p.x, p.y, 0.08);
    moonArc.position.set(p.x, p.y, 0.09);
    const ready = state.lunarEnergy >= 100;
    (moonRing.material as THREE.MeshBasicMaterial).color.set(ready ? 0xffe29a : 0x6f8cff);
    (moonArc.material as THREE.MeshBasicMaterial).color.set(ready ? 0xfff1c2 : 0xb7dcff);
    const q = Math.round(state.lunarEnergy);
    if (q !== arcProgress) {
      arcProgress = q;
      // Anello completo creato una volta: si disegna solo la parte carica (6 indici per segmento).
      moonArc.geometry.setDrawRange(0, Math.max(1, Math.ceil((state.lunarEnergy / 100) * ARC_SEGS)) * 6);
    }
  }

  function burst(pos: THREE.Vector3, color: number, count: number) {
    for (let i = 0; i < count; i += 1) {
      const p = new THREE.Mesh(GEO.spark, basicMat(color));
      p.position.copy(pos);
      hooks.getScene().add(p);
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 0.25)
        .normalize()
        .multiplyScalar(0.7 + Math.random() * 0.8);
      particles.push({ mesh: p, vel, life: 0.45 + Math.random() * 0.25 });
    }
  }

  /** Distanza dal centro al bordo dello schermo lungo un angolo. */
  function edgeDist(angle: number) {
    const v = viewHalf();
    const c = Math.abs(Math.cos(angle));
    const sn = Math.abs(Math.sin(angle));
    return Math.min(c > 1e-3 ? v.w / c : Infinity, sn > 1e-3 ? v.h / sn : Infinity);
  }

  /** Distanza a cui il boss gira intorno alla Terra: sempre dentro lo schermo. */
  function bossHold(radius: number) {
    const v = viewHalf();
    // Mai dentro l'orbita della Luna: niente danni gratis dalla collisione lunare.
    const low = MOON_ORBIT + radius + 0.35;
    return THREE.MathUtils.clamp(Math.min(v.w, v.h) - radius * 1.9 - 0.25, low, Math.max(4.4, low));
  }

  /** Zoom minimo con un boss in campo, così la sua orbita (fuori da quella lunare) resta nello schermo. */
  function bossZoomMin() {
    const b = enemies.find((e) => e.boss);
    if (!b) return 0;
    const need = MOON_ORBIT + b.radius * 2.9 + 0.6;
    return THREE.MathUtils.clamp(Math.log(need / VIEW_NEAR) / Math.log(VIEW_FAR / VIEW_NEAR), 0, 1);
  }

  function spawnEnemy(boss = false, at?: number) {
    const angle = at ?? Math.random() * Math.PI * 2;
    const bb = BALANCE.boss;
    const radius0 = boss ? Math.min(bb.radiusMax, bb.radiusBase + state.wave * bb.radiusPerWave) : 0.16;
    const dist = edgeDist(angle) + (boss ? radius0 * 2 + 0.35 : 0.45 + Math.random() * 0.35);
    const radius = radius0;
    const hp = boss ? 22 + state.wave * 8 : 1.6 + state.wave * 0.45;
    const mesh = boss
      ? new THREE.Mesh(
          new THREE.IcosahedronGeometry(radius, 0),
          new THREE.MeshStandardMaterial({ color: 0xff8a1e, emissive: 0x7a2c00, emissiveIntensity: 0.9, metalness: 0.25, roughness: 0.38 }),
        )
      : new THREE.Mesh(GEO.trash, trashMat);
    mesh.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist, boss ? 0 : (Math.random() - 0.5) * 0.15);
    if (boss) {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 1.55, 0.04, 8, 28),
        new THREE.MeshBasicMaterial({ color: 0xffb15a, transparent: true, opacity: 0.95 }),
      );
      halo.rotation.x = Math.PI / 2;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 1.9, 0.018, 6, 32),
        new THREE.MeshBasicMaterial({ color: 0xfff1c2, transparent: true, opacity: 0.8 }),
      );
      mesh.add(halo, ring);
    }
    hooks.getScene().add(mesh);
    const speed = boss ? 0.34 + state.wave * 0.025 : 0.46 + state.wave * 0.04;
    enemies.push({
      mesh,
      speed,
      hp,
      maxHp: hp,
      boss,
      radius,
      mode: "in",
      modeT: 0,
      strafe: Math.random() < 0.5 ? 1 : -1,
      shotT: 0.85,
      slow: 0,
      entering: boss ? 1 : 0,
      treasure: false,
      vel: null,
      seen: false,
      tele: 0,
      teleAngle: 0,
    });
    if (boss) burst(mesh.position, 0xffb15a, 18);
  }

  function spawnDrop(pos: THREE.Vector3, kind: DropKind = "shield") {
    const color = kind === "shield" ? 0x7ecbff : kind === "freeze" ? 0xd7f6ff : 0x3ee0a0;
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.028, 8, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }),
    );
    ring.renderOrder = 6;
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.3, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthTest: false }),
    );
    glow.renderOrder = 5;
    const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
    if (kind === "repair") {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.04), markMat);
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.04), markMat);
      group.add(h, v);
    } else if (kind === "freeze") {
      for (let i = 0; i < 3; i += 1) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.045, 0.04), markMat);
        arm.rotation.z = (i * Math.PI) / 3;
        group.add(arm);
      }
    } else {
      const plate = new THREE.Mesh(new THREE.CircleGeometry(0.16, 6), markMat);
      group.add(plate);
    }
    group.add(ring, glow);
    group.position.copy(pos);
    hooks.getScene().add(group);
    drops.push({ mesh: group, kind });
  }

  function rollDrop(boss: boolean) {
    const d = BALANCE.drops;
    if (Math.random() > (boss ? d.chanceBoss : d.chanceTrash)) return null;
    const w = d.weights;
    let roll = Math.random() * (w.shield + w.freeze + w.repair);
    if ((roll -= w.shield) < 0) return "shield" as const;
    if ((roll -= w.freeze) < 0) return "freeze" as const;
    return "repair" as const;
  }

  function coinValue() {
    return Math.max(5, Math.round(turretPrice("cannon", turrets.length) / 5) * 5);
  }

  function spawnCoin(pos: THREE.Vector3) {
    const group = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, depthTest: false }),
    );
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.02), new THREE.MeshBasicMaterial({ color: 0x7a4a00, depthTest: false }));
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.27, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthTest: false }),
    );
    const arc = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.36, COIN_SEGS, 1, Math.PI / 2, Math.PI * 2),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false }),
    );
    for (const m of [glow, disc, mark, arc]) m.renderOrder = 10;
    group.add(glow, disc, mark, arc);
    // resta toccabile: lontano dalla barra in basso, dall'intestazione e dallo zoom
    const v = viewHalf();
    const px = (2 * v.h) / Math.max(1, window.innerHeight);
    const x = THREE.MathUtils.clamp(pos.x, -v.w + 40 * px, v.w - 70 * px);
    const y = THREE.MathUtils.clamp(pos.y, -v.h + 150 * px, v.h - 120 * px);
    group.position.set(x, y, 0.1);
    hooks.getScene().add(group);
    coins.push({ mesh: group, arc, life: BALANCE.treasure.pickupLife, value: coinValue(), q: -1 });
  }

  function tickCoins(dt: number) {
    const life = BALANCE.treasure.pickupLife;
    for (let i = coins.length - 1; i >= 0; i -= 1) {
      const c = coins[i];
      c.life -= dt;
      if (c.life <= 0) {
        burst(c.mesh.position, 0x8a7a50, 6);
        disposeObject(c.mesh);
        coins.splice(i, 1);
        continue;
      }
      const q = Math.ceil((c.life / life) * 60);
      if (q !== c.q) {
        c.q = q;
        c.arc.geometry.setDrawRange(0, Math.max(1, Math.ceil((c.life / life) * COIN_SEGS)) * 6);
      }
      const blink = c.life < 2 ? 0.5 + 0.5 * Math.sin(performance.now() * 0.025) : 1;
      c.mesh.scale.setScalar((1 + Math.sin(performance.now() * 0.006) * 0.06) * (0.75 + 0.25 * blink));
    }
  }

  function collectAt(p: THREE.Vector3) {
    const r = BALANCE.treasure.pickupTapRadius;
    for (let i = coins.length - 1; i >= 0; i -= 1) {
      const c = coins[i];
      if (Math.hypot(c.mesh.position.x - p.x, c.mesh.position.y - p.y) > r) continue;
      state.exp += c.value;
      state.score += c.value;
      burst(c.mesh.position, 0xffd24a, 18);
      disposeObject(c.mesh);
      coins.splice(i, 1);
      return true;
    }
    return false;
  }

  function spawnTreasure() {
    const t = BALANCE.treasure;
    const a = Math.random() * Math.PI * 2;
    const start = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(edgeDist(a) + t.radius * 2 + 0.3);
    const side = Math.random() < 0.5 ? 1 : -1;
    const pass = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0).multiplyScalar(side * (t.passMin + Math.random() * (t.passMax - t.passMin)));
    const vel = pass.clone().sub(start).normalize().multiplyScalar(t.speed);
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(t.radius, 0),
      new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0x6a4a00, emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3 }),
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(t.radius * 1.5, 0.025, 6, 28),
      new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.85 }),
    );
    mesh.add(ring);
    mesh.position.copy(start);
    hooks.getScene().add(mesh);
    const hp = t.hp + state.wave * t.hpPerWave;
    enemies.push({
      mesh, speed: t.speed, hp, maxHp: hp, boss: false, radius: t.radius, mode: "strafe", modeT: 0,
      strafe: side, shotT: 1.2, slow: 0, entering: 0, treasure: true, vel, seen: false, tele: 0, teleAngle: 0,
    });
  }

  function clearTeleGhost() {
    if (!teleGhost) return;
    disposeObject(teleGhost);
    teleGhost = null;
  }

  /** Sagoma tremolante del boss dove ricomparirà. */
  function syncTeleGhost(e: Enemy) {
    if (!teleGhost) {
      teleGhost = new THREE.Mesh(
        new THREE.IcosahedronGeometry(e.radius, 0),
        new THREE.MeshBasicMaterial({ color: 0x5dff9a, wireframe: true, transparent: true, opacity: 0.8, depthTest: false }),
      );
      teleGhost.renderOrder = 11;
      hooks.getScene().add(teleGhost);
    }
    const h = bossHold(e.radius);
    teleGhost.position.set(Math.cos(e.teleAngle) * h + (Math.random() - 0.5) * 0.12, Math.sin(e.teleAngle) * h, 0);
    teleGhost.visible = Math.random() > 0.35;
    teleGhost.rotation.z += 0.3;
    (teleGhost.material as THREE.MeshBasicMaterial).opacity = 0.35 + (1 - e.tele / BALANCE.boss.teleportTelegraph) * 0.6;
  }

  function killEnemy(index: number) {
    const e = enemies[index];
    if (!e) return;
    const wasBoss = e.boss;
    gain(wasBoss ? 60 + state.wave * 3 : e.treasure ? 10 + state.wave : 6 + state.wave, wasBoss ? 16 : 3);
    burst(e.mesh.position, wasBoss ? 0xffb15a : e.treasure ? 0xffd24a : 0xff6688, wasBoss || e.treasure ? 26 : 10);
    if (e.treasure) spawnCoin(e.mesh.position.clone());
    const drop = e.treasure ? null : rollDrop(wasBoss);
    if (drop) spawnDrop(e.mesh.position.clone(), drop);
    if (wasBoss) clearTeleGhost();
    disposeObject(e.mesh);
    enemies.splice(index, 1);
    if (!wasBoss) return;
    state.cleared += 1;
    if (state.cleared > state.bestCleared) {
      state.bestCleared = state.cleared;
      writeLog();
    }
    state.shop = true;
    state.shopKind = "wave";
    place = null;
    placeMsg = "";
    clearGhost();
    bossSpawned = true;
    saveRun();
  }

  function hurtEarth(dmg: number, pos: THREE.Vector3) {
    if (state.shield > 0) {
      state.shield -= 1;
      hitShake = Math.min(0.45, hitShake + 0.28);
      burst(pos, 0xbfe9ff, 12);
      if (state.shield <= 0) {
        burst(new THREE.Vector3(0, 0, 0), 0xe8f7ff, 20);
        state.shield = 0;
      }
      syncShield();
      return;
    }
    state.earthHP = Math.max(0, state.earthHP - dmg);
    hitShake = Math.min(1, hitShake + 0.75);
    burst(pos, 0xff5533, 16);
    if (state.earthHP <= 0) beginBoom();
  }

  function fireBolt(angle: number, kind: ShotKind, speed: number, damage: number, color: number, range: number, life: number, pierce = 1, blast = 0, blastDmg = 0, side = 0, size = 0) {
    const rad = size > 0 ? size : kind === "bolt" ? 0.04 : kind === "bomb" ? 0.075 : kind === "termobarica" ? 0.12 : kind === "ricerca" ? 0.095 : 0.062;
    const mesh = new THREE.Mesh(GEO.ball, basicMat(color));
    mesh.scale.setScalar(rad);
    const r0 = RIM + 0.28;
    mesh.position.set(Math.cos(angle) * r0 - Math.sin(angle) * side, Math.sin(angle) * r0 + Math.cos(angle) * side, 0.05);
    hooks.getScene().add(mesh);
    const ranged = kind === "bomb" || kind === "grappolo" || kind === "termobarica";
    const reach = ranged ? Math.max(life, range / Math.max(0.3, speed) + 0.2) : Math.max(life, (visibleRadius() + 1.6) / Math.max(0.3, speed));
    projectiles.push({
      mesh,
      vel: new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(speed),
      life: reach,
      damage,
      kind,
      traveled: 0,
      range,
      pierce,
      blast,
      blastDmg,
      color,
      hits: pierce > 1 ? new Set<Enemy>() : null,
      direct: null,
      prev: mesh.position.clone(),
    });
  }

  function fireMainOnce() {
    const id = state.mainGun;
    const g = BALANCE.gun[id];
    const st = gunStats(id);
    const size = g.size * (1 + BALANCE.gunSizePerLevel * (Math.max(1, state.gunLevels[id]) - 1));
    const life = g.range / g.speed + 0.2;
    const spread = (g.spreadDeg * Math.PI) / 180;
    if (id === "rosa") {
      for (let i = 0; i < st.pellets; i += 1) {
        const a = aimAngle - spread / 2 + (spread * i) / (st.pellets - 1);
        fireBolt(a, "bolt", g.speed, st.damage, g.color, g.range, life, g.pierce, 0, 0, 0, size);
      }
      return;
    }
    const a = aimAngle + (Math.random() - 0.5) * spread;
    if (id === "doppio") {
      fireBolt(a, "bolt", g.speed, st.damage, g.color, g.range, life, g.pierce, 0, 0, -0.07, size);
      fireBolt(a, "bolt", g.speed, st.damage, g.color, g.range, life, g.pierce, 0, 0, 0.07, size);
      return;
    }
    fireBolt(a, "bolt", g.speed, st.damage, g.color, g.range, life, g.pierce, 0, 0, 0, size);
  }

  function calibreTier() {
    const tiers = BALANCE.turretUpgrades.calibre.tiers;
    let t: (typeof tiers)[number] = tiers[0];
    for (const x of tiers) if (state.turretCalibre >= x.from) t = x;
    return t;
  }

  function coneAim(facing: number, cone: number, maxDist = Infinity) {
    let best: { angle: number; dist: number } | null = null;
    let bestAbs = cone + 1e-6;
    const consider = (p: THREE.Vector3) => {
      const dist = p.length();
      if (dist > maxDist) return;
      const d = angDelta(Math.atan2(p.y, p.x), facing);
      const ad = Math.abs(d);
      if (ad <= cone && ad < bestAbs) {
        bestAbs = ad;
        best = { angle: facing + d, dist };
      }
    };
    for (const e of enemies) if (targetable(e)) consider(e.mesh.position);
    for (const h of hostiles) if (onScreen(h.mesh.position)) consider(h.mesh.position);
    return best as { angle: number; dist: number } | null;
  }

  function fireWarhead(angle: number) {
    const id = state.missile;
    const w = BALANCE.missiles[id];
    const cal = turretDamage();
    const r = warheadRadius(id);
    if (id === "termobarica") fireBolt(angle, "termobarica", 2.7, 0, 0xff5a2a, 7.5, 3.5, 1, r, w.damage * cal);
    else if (id === "ricerca") fireBolt(angle, "ricerca", 5.3, w.damage * cal, 0xffc14d, 22, 3.5, 1, r, w.damage * cal * 0.4);
    else if (id === "grappolo") fireBolt(angle, "grappolo", 3.6, 0, 0xffd27a, 4.35, 2.3, 1, r, w.damage * cal);
    else if (id === "rada") fireBolt(angle, "rada", 3.7, 0, 0xc9b6ff, 14, 2.8, 1, r, w.damage * cal);
    else fireBolt(angle, "msingle", 5.6, w.damage * cal, 0xffd27a, 16, 2.3);
  }

  function fireTurret(t: Turret) {
    const facing = t.kind === "missile" ? missileFacing(t.angle) : t.angle;
    const cfg = BALANCE.turrets;
    const aim = coneAim(facing, turretCone(t.kind), t.kind === "mortar" ? cfg.mortar.reach : Infinity);
    if (aim == null) return false;
    const cal = turretDamage();
    if (t.kind === "missile") {
      fireWarhead(aim.angle);
      t.cd = warheadCooldown(state.missile);
      return true;
    }
    if (t.kind === "mortar") {
      const range = THREE.MathUtils.clamp(aim.dist - RIM - 0.28, 0.6, cfg.mortar.reach);
      const tier = calibreTier();
      fireBolt(aim.angle, "bomb", 3.25, 0, tier.color, range, 0.5, 1, cfg.mortar.radius, cfg.mortar.damage * cal, 0, tier.size * 1.7);
      t.cd = cfg.mortar.cooldown * turretRate();
      return true;
    }
    const tier = calibreTier();
    fireBolt(t.angle, "bolt", 5.6, cfg.cannon.damage * cal, tier.color, 16, 2.2, 1, 0, 0, 0, tier.size);
    t.cd = cfg.cannon.cooldown * turretRate();
    return true;
  }

  function fireAuto() {
    for (const t of turrets) {
      if (t.cd > 0) continue;
      if (!fireTurret(t)) t.cd = 0.1;
    }
  }



  function spawnHostile(origin: THREE.Vector3, radius: number) {
    const dir = origin.clone().negate();
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    const ang = Math.atan2(dir.y, dir.x) + (Math.random() - 0.5) * 0.38;
    const d = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0);
    const mesh = new THREE.Mesh(GEO.ball, basicMat(0xff5a3a));
    mesh.scale.setScalar(0.055);
    mesh.position.copy(origin).addScaledVector(d, radius + 0.7);
    hooks.getScene().add(mesh);
    hostiles.push({ mesh, vel: d.multiplyScalar(2.3 + Math.min(state.wave, BALANCE.boss.fireCapWave) * 0.07), hp: 1 });
  }

  /** Esplosione ad area. skip = nemico già colpito in pieno dallo stesso missile (niente doppio danno). */
  function areaBlast(pos: THREE.Vector3, radius: number, dmg: number, color: number, skip: Enemy | null = null) {
    burst(pos, color, 14);
    const ring = new THREE.Mesh(
      GEO.blast,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }),
    );
    ring.position.copy(pos);
    hooks.getScene().add(ring);
    const started = performance.now();
    const grow = () => {
      const k = (performance.now() - started) / 280;
      ring.scale.setScalar(1 + k * radius * 3.4);
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - k);
      if (k < 1) requestAnimationFrame(grow);
      else {
        hooks.getScene().remove(ring);
        (ring.material as THREE.Material).dispose();
      }
    };
    grow();
    for (let j = enemies.length - 1; j >= 0; j -= 1) {
      if (enemies[j] === skip || !targetable(enemies[j])) continue;
      if (enemies[j].mesh.position.distanceTo(pos) > radius + enemies[j].radius) continue;
      enemies[j].hp -= dmg;
      if (enemies[j].hp <= 0) killEnemy(j);
    }
    for (let j = hostiles.length - 1; j >= 0; j -= 1) {
      if (hostiles[j].mesh.position.distanceTo(pos) > radius) continue;
      disposeObject(hostiles[j].mesh);
      hostiles.splice(j, 1);
    }
  }

  function applySlow(pos: THREE.Vector3, radius: number, dmg: number) {
    const slowFor = BALANCE.missiles.rada.slowFor;
    for (const e of enemies) {
      if (targetable(e) && e.mesh.position.distanceTo(pos) < radius + e.radius) e.slow = Math.max(e.slow, slowFor);
    }
    areaBlast(pos, radius, dmg, 0xc9b6ff);
  }

  function clearActors() {
    for (const e of enemies) disposeObject(e.mesh);
    for (const p of projectiles) disposeObject(p.mesh);
    for (const p of particles) disposeObject(p.mesh);
    enemies.length = 0;
    projectiles.length = 0;
    particles.length = 0;
    for (const g of cannons) disposeObject(g);
    cannons.length = 0;
    for (const t of turrets) disposeObject(t.mesh);
    turrets.length = 0;
    clearGhost();
    for (const d of drops) disposeObject(d.mesh);
    drops.length = 0;
    for (const h of hostiles) disposeObject(h.mesh);
    hostiles.length = 0;
    for (const c of coins) disposeObject(c.mesh);
    coins.length = 0;
    clearTeleGhost();
    clearShield();
    if (cross) disposeObject(cross);
    if (moonRing) disposeObject(moonRing);
    if (moonArc) disposeObject(moonArc);
    cross = null;
    moonRing = null;
    moonArc = null;
    arcProgress = -1;
  }

  function clearBoom() {
    const scene = hooks.getScene();
    for (const shard of shards) {
      scene.remove(shard.mesh);
      shard.mesh.geometry.dispose();
      (shard.mesh.material as THREE.Material).dispose();
    }
    shards.length = 0;
    if (boomRing) {
      scene.remove(boomRing);
      boomRing.geometry.dispose();
      (boomRing.material as THREE.Material).dispose();
      boomRing = null;
    }
    if (boomCore) {
      scene.remove(boomCore);
      boomCore.geometry.dispose();
      (boomCore.material as THREE.Material).dispose();
      boomCore = null;
    }
  }

  function tickParticles(dt: number) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(0.96);
      p.life -= dt;
      if (p.life <= 0) {
        disposeObject(p.mesh);
        particles.splice(i, 1);
      }
    }
  }

  function beginBoom() {
    if (phase === "boom" || phase === "exit" || phase === "idle") return;
    state.over = true;
    state.earthHP = 0;
    phase = "boom";
    paused = false;
    savedRun = null;
    persistRun(true);
    boomT = 0;
    flash = reduceMotion ? 0.35 : 1;
    veil = 0;
    for (const e of enemies) disposeObject(e.mesh);
    for (const shot of projectiles) disposeObject(shot.mesh);
    for (const d of drops) disposeObject(d.mesh);
    enemies.length = 0;
    projectiles.length = 0;
    drops.length = 0;
    for (const h of hostiles) disposeObject(h.mesh);
    hostiles.length = 0;
    for (const c of coins) disposeObject(c.mesh);
    coins.length = 0;
    clearTeleGhost();
    clearShield();
    if (cross) cross.visible = false;
    for (const cannon of cannons) cannon.visible = false;
    for (const t of turrets) t.mesh.visible = false;
    if (ghost) ghost.visible = false;
    state.shop = false;
    place = null;
    const scene = hooks.getScene();
    for (let i = 0; i < 56; i += 1) {
      const hot = i % 4;
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.05 + Math.random() * 0.12, 0),
        new THREE.MeshStandardMaterial({
          color: hot === 0 ? 0xfff6d8 : hot === 1 ? 0xff5a1f : hot === 2 ? 0xffb15a : 0x163a66,
          emissive: hot === 3 ? 0x0b1c33 : 0xff6a22,
          emissiveIntensity: hot === 3 ? 0.2 : 1.6,
          roughness: 0.4,
          metalness: 0.18,
          transparent: true,
        }),
      );
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 0.55).normalize();
      mesh.position.copy(dir).multiplyScalar(0.12 + Math.random() * 0.4);
      scene.add(mesh);
      shards.push({
        mesh,
        vel: dir.clone().multiplyScalar(1.15 + Math.random() * 2.9),
        spin: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 5),
      });
    }
    boomRing = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.42, 80),
      new THREE.MeshBasicMaterial({
        color: 0xfff6e8,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    boomRing.renderOrder = 12;
    scene.add(boomRing);
    boomCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthTest: false }),
    );
    boomCore.renderOrder = 13;
    scene.add(boomCore);
    burst(new THREE.Vector3(0, 0, 0), 0xfff1d2, 18);
  }

  function updateBoom(dt: number, cam: THREE.PerspectiveCamera) {
    boomT += dt;
    flash = boomT < 0.18 ? 1 : Math.max(0, 1 - (boomT - 0.18) / 0.62);
    veil = boomT > 1.35 ? Math.min(0.78, (boomT - 1.35) / 0.5) : 0;
    cam.position.set(0, 0, viewZ(cam));
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    placeMoon(performance.now() * 0.00035, dt);
    for (const shard of shards) {
      shard.mesh.position.addScaledVector(shard.vel, dt);
      shard.mesh.rotation.x += shard.spin.x * dt;
      shard.mesh.rotation.y += shard.spin.y * dt;
      shard.vel.multiplyScalar(0.988);
      const mat = shard.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.max(0, 1 - Math.max(0, boomT - 0.35) / 1.35);
    }
    if (boomRing) {
      const k = Math.min(1, boomT / 1.2);
      boomRing.scale.setScalar(1 + k * 22);
      (boomRing.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - k));
    }
    if (boomCore) {
      const k = Math.min(1, boomT / 0.48);
      boomCore.scale.setScalar(1 + k * 8);
      (boomCore.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
    }
    tickParticles(dt);
    if (boomT >= 1.9) exit("boom");
  }

  function placeMoon(spin: number, dt: number) {
    const pivot = hooks.getMoonPivot();
    const moon = hooks.getMoon();
    pivot.position.set(Math.cos(spin) * MOON_ORBIT, Math.sin(spin) * MOON_ORBIT, 0);
    pivot.quaternion.identity();
    pivot.scale.set(1, 1, 1);
    moon.position.set(0, 0, 0);
    moon.rotation.y += dt * 0.25;
  }

  function lunarShockwave() {
    if (state.lunarEnergy < 100 || phase !== "play" || paused) return false;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.38, 64),
      new THREE.MeshBasicMaterial({
        color: 0xfff3c4,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    hooks.getScene().add(ring);
    const started = performance.now();
    const grow = () => {
      const k = (performance.now() - started) / 700;
      const s = 1 + k * 28;
      ring.scale.setScalar(s);
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - k);
      if (k < 1) requestAnimationFrame(grow);
      else {
        hooks.getScene().remove(ring);
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      }
    };
    grow();
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const e = enemies[i];
      if (e.boss) {
        burst(e.mesh.position, 0x9ecbff, 6);
        continue;
      }
      killEnemy(i);
    }
    for (let i = hostiles.length - 1; i >= 0; i -= 1) {
      burst(hostiles[i].mesh.position, 0xffe29a, 4);
      disposeObject(hostiles[i].mesh);
      hostiles.splice(i, 1);
    }
    state.lunarEnergy = 0;
    arcProgress = -1;
    return true;
  }

  function gain(exp: number, energy: number) {
    state.exp += exp;
    state.score += exp;
    state.lunarEnergy = Math.min(100, state.lunarEnergy + energy);
  }

  function update(dt: number) {
    if (phase === "idle") return;
    const cam = hooks.getCamera() as THREE.PerspectiveCamera;
    const controls = hooks.getControls();
    controls.enabled = false;
    controls.autoRotate = false;

    if (phase === "enter" || phase === "exit") {
      camT += dt;
      const k = Math.min(1, camT / 1);
      const e = k * k * (3 - 2 * k);
      if (phase === "enter") camTo.set(0, 0, viewZ(cam));
      if (phase === "exit") {
        flash = Math.max(0, flash - dt * 2.4);
        veil = Math.max(0, veil - dt * 0.72);
      }
      cam.position.lerpVectors(camFrom, camTo, e);
      controls.target.lerpVectors(targetFrom, targetTo, e);
      cam.up.set(0, 1, 0);
      cam.lookAt(controls.target);
      if (phase === "enter") {
        placeMoon(performance.now() * 0.00035, dt);
        syncCannons();
        updateMoonRing();
      }
      if (k >= 1) {
        if (phase === "enter") phase = "play";
        else {
          cam.position.copy(savedCam);
          controls.target.copy(savedTarget);
          controls.enabled = true;
          phase = "idle";
          state.active = false;
          if (pendingFinale) {
            finale = {
              score: Math.floor(state.score),
              wave: state.wave,
              highscore: state.highscore,
              lastScore: previousRun ? previousRun.score : null,
              lastWave: previousRun ? previousRun.wave : null,
            };
            pendingFinale = false;
          } else finale = null;
          flash = 0;
          veil = 0;
          hooks.onExit();
        }
      }
      return;
    }

    if (phase === "boom") {
      updateBoom(dt, cam);
      return;
    }

    const goal = Math.max(zoomGoal, bossZoomMin());
    zoom += (goal - zoom) * (1 - Math.exp(-dt * 7));
    if (Math.abs(goal - zoom) < 1e-4) zoom = goal;
    if (reduceMotion || paused) hitShake = 0;
    cam.position.set((Math.random() - 0.5) * hitShake * 0.22, (Math.random() - 0.5) * hitShake * 0.22, viewZ(cam));
    hitShake = Math.max(0, hitShake - dt * 1.8);
    cam.up.set(0, 1, 0);
    controls.target.set(0, 0, 0);
    cam.lookAt(0, 0, 0);

    hooks.getEarth().rotation.y += dt * 0.12;
    placeMoon(performance.now() * 0.00035, dt);
    updateMoonRing();
    syncCannons();
    updateAimGfx();

    if (state.over) return;

    if (state.guide || paused) return;

    if (state.freezeLeft > 0 && !state.shop) {
      state.freezeLeft = Math.max(0, state.freezeLeft - dt);
    } else if (!state.shop && state.freezeLeft <= 0 && !bossSpawned) {
      const trashAlive = enemies.some((e) => !e.boss && !e.treasure);
      if (treasureAt >= 0 && trashSpawned >= treasureAt) {
        treasureAt = -1;
        spawnTreasure();
      }
      spawnTimer += dt;
      if (trashSpawned < trashQuota) {
        const every = Math.max(0.28, 0.78 - state.wave * 0.04);
        if (spawnTimer > every) {
          spawnTimer = 0;
          spawnEnemy(false);
          trashSpawned += 1;
          if (state.wave > 4 && trashSpawned < trashQuota && Math.random() < 0.22) {
            spawnEnemy(false);
            trashSpawned += 1;
          }
        }
      } else if (!trashAlive && spawnTimer > 0.35 && bossWarn <= 0) {
        bossWarn = BOSS_WARN;
        bossWarnAngle = Math.random() * Math.PI * 2;
      }
    }
    if (bossWarn > 0 && !state.shop && state.freezeLeft <= 0) {
      bossWarn = Math.max(0, bossWarn - dt);
      if (bossWarn === 0) {
        spawnEnemy(true, bossWarnAngle);
        bossSpawned = true;
      }
    }

    const frozen = state.freezeLeft > 0;
    const moonPos = hooks.getMoonPivot().position;
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const e = enemies[i];
      if (!frozen) {
        if (e.slow > 0) e.slow = Math.max(0, e.slow - dt);
        const pace = e.speed * (e.slow > 0 ? 0.36 : 1);
        if (e.boss) {
          const mat = e.mesh.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.65 + Math.sin(performance.now() * 0.008) * 0.35;
          const halo = e.mesh.children[0];
          if (halo) halo.rotation.z += dt * 2.4;
          const ring = e.mesh.children[1];
          if (ring) ring.rotation.z -= dt * 1.5;
          const pos = e.mesh.position;
          const dist = Math.max(0.001, pos.length());
          const hold = bossHold(e.radius);
          if (e.entering > 0) {
            if (onScreen(pos, e.radius)) e.entering = 0;
            else pos.addScaledVector(tmpA.copy(pos).negate().normalize(), Math.max(0.9, pace * 2.2) * dt);
          }
          const diving = e.entering <= 0 && e.hp <= e.maxHp * 0.25;
          if (e.tele > 0) {
            e.tele = Math.max(0, e.tele - dt);
            const j = 0.07;
            e.mesh.position.x += (Math.random() - 0.5) * j;
            e.mesh.position.y += (Math.random() - 0.5) * j;
            e.mesh.visible = Math.random() > 0.3;
            e.mesh.scale.set(1 + (Math.random() - 0.5) * 0.5, 1 + (Math.random() - 0.5) * 0.5, 1);
            syncTeleGhost(e);
            if (e.tele === 0) {
              const h = bossHold(e.radius);
              burst(e.mesh.position, 0x5dff9a, 18);
              e.mesh.position.set(Math.cos(e.teleAngle) * h, Math.sin(e.teleAngle) * h, 0);
              e.mesh.visible = true;
              e.mesh.scale.set(1, 1, 1);
              burst(e.mesh.position, 0x5dff9a, 18);
              clearTeleGhost();
            }
          } else if (e.entering > 0) {
            /* entra nello schermo prima di tutto il resto */
          } else if (diving) {
            pos.addScaledVector(tmpA.copy(pos).negate().normalize(), Math.min(0.62, pace + 0.18) * dt);
          } else if (dist < hold) {
            pos.addScaledVector(tmpA.copy(pos).normalize(), 0.7 * dt);
          } else {
            const tang = tmpA.set(-pos.y, pos.x, 0).normalize();
            pos.addScaledVector(tang, e.strafe * 0.38 * dt);
            // Avvicinamento alla quota d'attesa uguale su lato lungo e lato corto dello schermo.
            if (dist > hold + 0.4) pos.addScaledVector(tmpA.copy(pos).negate().normalize(), Math.min(dist - hold, Math.max(0.6, pace * 1.6)) * dt);
          }
          if (state.wave >= 3 && e.entering <= 0) {
            e.shotT -= dt;
            if (e.shotT <= 0) {
              const bb = BALANCE.boss;
              const w = Math.min(state.wave, bb.fireCapWave);
              const n = Math.min(bb.shotsCap, 1 + Math.floor((w - 3) / 2));
              e.shotT = Math.max(0.82, 2.05 - w * 0.05);
              for (let s = 0; s < n; s += 1) spawnHostile(e.mesh.position, e.radius);
            }
          }
        } else if (e.treasure && e.vel) {
          e.mesh.position.addScaledVector(e.vel, (pace / e.speed) * dt);
          const ring = e.mesh.children[0];
          if (ring) ring.rotation.x += dt * 2;
          const vis = onScreen(e.mesh.position, 0);
          if (vis) e.seen = true;
          if (vis) {
            e.shotT -= dt;
            if (e.shotT <= 0) {
              e.shotT = BALANCE.treasure.shotEvery;
              spawnHostile(e.mesh.position, e.radius);
            }
          }
          if (e.seen && !vis) {
            disposeObject(e.mesh);
            enemies.splice(i, 1);
            continue;
          }
        } else {
          e.mesh.position.addScaledVector(tmpA.copy(e.mesh.position).negate().normalize(), pace * dt);
        }
        e.mesh.rotation.z += dt * (e.boss ? 0.8 : 2.2);
      }
      const moonHit = e.radius + 0.32;
      if (e.boss) e.modeT = Math.max(0, e.modeT - dt);
      if (!e.treasure && e.mesh.position.distanceTo(moonPos) < moonHit && targetable(e)) {
        burst(e.mesh.position, 0x9ecbff, e.boss ? 16 : 12);
        if (!e.boss) {
          killEnemy(i);
          continue;
        }
        if (e.modeT <= 0) {
          e.modeT = 1.2;
          e.hp -= e.maxHp * 0.12;
          if (e.hp <= 0) {
            killEnemy(i);
            continue;
          }
        }
      }
      if (frozen || e.tele > 0) continue;
      if (e.mesh.position.length() < 1.02 + e.radius) {
        const dmg = e.boss ? 12 + state.wave * 2 : 6 + state.wave;
        const pos = e.mesh.position.clone();
        if (e.boss) {
          const away = Math.atan2(pos.y, pos.x) + Math.PI;
          const jit = (BALANCE.boss.teleportJitterDeg * Math.PI) / 180;
          e.hp = Math.max(1, e.hp);
          e.tele = BALANCE.boss.teleportTelegraph;
          e.teleAngle = away + (Math.random() * 2 - 1) * jit;
          e.mesh.position.copy(pos.clone().normalize().multiplyScalar(1.08 + e.radius));
          burst(pos, 0xff8a1e, 14);
          hurtEarth(dmg, pos);
          if (phase !== "play") return;
          continue;
        }
        disposeObject(e.mesh);
        enemies.splice(i, 1);
        hurtEarth(dmg, pos);
        if (phase !== "play") return;
      }
    }
    if (!frozen) {
      for (let i = hostiles.length - 1; i >= 0; i -= 1) {
        const h = hostiles[i];
        h.mesh.position.addScaledVector(h.vel, dt);
        h.mesh.rotation.z += dt * 4;
        if (h.mesh.position.length() < 1.16) {
          const pos = h.mesh.position.clone();
          disposeObject(h.mesh);
          hostiles.splice(i, 1);
          hurtEarth(4 + state.wave * 0.45, pos);
          if (phase !== "play") return;
        }
      }
    }
    if (!frozen) {
      for (let i = drops.length - 1; i >= 0; i -= 1) {
        const d = drops[i];
        const dir = tmpB.copy(d.mesh.position).negate();
        const len = dir.length();
        d.mesh.scale.setScalar(1 + Math.sin(performance.now() * 0.008 + i) * 0.18);
        if (len < 1.35) {
          if (d.kind === "shield") {
            state.shield = 3;
            syncShield();
          } else if (d.kind === "freeze") {
            state.freezeLeft = Math.max(state.freezeLeft, 4.2);
          } else {
            state.earthHP = Math.min(100, state.earthHP + 22);
          }
          const color = d.kind === "repair" ? 0x3ee0a0 : d.kind === "freeze" ? 0xd7f4ff : 0x8ee7ff;
          burst(d.mesh.position, color, 8);
          disposeObject(d.mesh);
          drops.splice(i, 1);
          continue;
        }
        dir.multiplyScalar(1 / len);
        d.mesh.position.addScaledVector(dir, 0.72 * dt);
        d.mesh.rotation.z += dt * 2.4;
      }
    }

    if (!frozen && !state.shop) tickCoins(dt);
    fireCooldown -= dt;
    for (const t of turrets) t.cd = Math.max(0, t.cd - dt);
    const threats = enemies.length > 0 || hostiles.length > 0;
    if (!state.shop && threats) {
      // Il ritardo si somma invece di essere riassegnato: a 60 fps il Mitra non perde più colpi.
      const cd = gunStats(state.mainGun).cooldown;
      for (let n = 0; fireCooldown <= 0 && n < 4; n += 1) {
        fireMainOnce();
        fireCooldown += cd;
      }
      if (fireCooldown <= 0) fireCooldown = cd;
    } else if (fireCooldown < 0) fireCooldown = 0;
    // Gelo: i nemici sono fermi, ma torrette, missili e scudo continuano a lavorare.
    if (!state.shop && threats) fireAuto();

    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const p = projectiles[i];
      const homing = p.kind === "rada" || p.kind === "ricerca" || p.kind === "termobarica";
      if (homing && enemies.length) {
        let best: Enemy | null = null;
        let bestD = Infinity;
        for (const e of enemies) {
          if (!targetable(e)) continue;
          const d = e.mesh.position.distanceToSquared(p.mesh.position);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        const desired = best ? tmpA.copy(best.mesh.position).sub(p.mesh.position) : tmpA.set(0, 0, 0);
        desired.z = 0;
        if (best && desired.lengthSq() > 1e-6) {
          const speed = p.kind === "ricerca" ? 6.4 : p.kind === "rada" ? 3.8 : 2.7;
          const turn = p.kind === "ricerca" ? 7.2 : p.kind === "rada" ? 4.2 : 1.6;
          desired.normalize().multiplyScalar(speed);
          p.vel.lerp(desired, 1 - Math.exp(-dt * turn));
        }
      }
      p.prev.copy(p.mesh.position);
      p.mesh.position.addScaledVector(p.vel, dt);
      p.traveled += p.vel.length() * dt;
      p.life -= dt;
      const ranged = (p.kind === "grappolo" || p.kind === "bomb" || p.kind === "termobarica" || p.kind === "bolt") && p.traveled >= p.range;
      let spent = p.life <= 0 || ranged;
      // Collisioni sul segmento percorso in questo frame: i colpi veloci (Mitra) non attraversano più i bersagli.
      if (!spent) {
        for (let h = hostiles.length - 1; h >= 0; h -= 1) {
          if (segDistSq(p.prev, p.mesh.position, hostiles[h].mesh.position) > 0.09) continue;
          hostiles[h].hp -= p.kind === "bolt" || p.kind === "bomb" ? 1 : 2;
          burst(p.mesh.position, 0xffb199, 4);
          if (hostiles[h].hp <= 0) {
            disposeObject(hostiles[h].mesh);
            hostiles.splice(h, 1);
            gain(3, 1);
          }
          if (p.pierce > 1) p.pierce -= 1;
          else spent = true;
          break;
        }
      }
      if (!spent) {
        for (let j = enemies.length - 1; j >= 0; j -= 1) {
          const e = enemies[j];
          if (p.hits?.has(e) || !targetable(e)) continue;
          const reach = e.radius + (p.kind === "bolt" ? 0.16 : 0.26);
          if (segDistSq(p.prev, p.mesh.position, e.mesh.position) > reach * reach) continue;
          e.hp -= p.damage;
          p.direct = p.damage > 0 ? e : null;
          burst(p.mesh.position, p.color, Math.min(14, 3 + Math.round(p.damage * 3)));
          if (e.hp <= 0) killEnemy(j);
          if (p.pierce > 1) {
            p.pierce -= 1;
            p.hits?.add(e);
          } else {
            spent = true;
            break;
          }
        }
      }
      if (!spent) continue;
      const pos = p.mesh.position.clone();
      if (p.kind === "grappolo") {
        const n = BALANCE.missiles.grappolo.bomblets;
        for (let k = 0; k < n; k += 1) {
          const a = (k / n) * Math.PI * 2 + Math.random() * 0.6;
          const off = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(0.35 + Math.random() * 0.55);
          areaBlast(pos.clone().add(off), p.blast, p.blastDmg, 0xffe29a);
        }
      } else if (p.kind === "bomb") areaBlast(pos, p.blast, p.blastDmg, 0xff7a3a);
      else if (p.kind === "ricerca") areaBlast(pos, p.blast, p.blastDmg, 0xffc14d, p.direct);
      else if (p.kind === "termobarica") {
        areaBlast(pos, p.blast, p.blastDmg, 0xff5a2a);
        hitShake = Math.min(0.6, hitShake + 0.35);
      } else if (p.kind === "rada") applySlow(pos, p.blast, p.blastDmg);
      else if (p.kind === "msingle") burst(pos, 0xffd27a, 4);
      disposeObject(p.mesh);
      projectiles.splice(i, 1);
    }

    tickParticles(dt);
  }

  function readPointer(e: PointerEvent | TouchEvent) {
    const canvas = (e.target as HTMLElement | null)?.closest?.("canvas") || document.querySelector("canvas");
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY : e.clientY;
    if (clientX == null || clientY == null) return false;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, hooks.getCamera());
    return true;
  }

  function onPointer(e: PointerEvent | TouchEvent) {
    if (phase !== "play" || state.over || paused) return;
    if (!readPointer(e)) return;
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const down = e.type === "pointerdown" || e.type === "touchstart";
    if (down && !state.shop && !place && collectAt(hit)) return;
    if (hit.length() < 0.45) return;
    const a = Math.atan2(hit.y, hit.x);
    if (place) {
      place.angle = a;
      placeMsg = tooClose(a) ? "Troppo vicina" : placeCone;
      syncGhost();
      return;
    }
    if (state.shop) return;
    aimAngle = a;
    const dist = THREE.MathUtils.clamp(hit.length(), RIM + 0.55, Math.max(8.2, horizon()));
    aimPoint.set(Math.cos(aimAngle) * dist, Math.sin(aimAngle) * dist, 0);
  }

  function onPointerUp(e: PointerEvent) {
    if (phase !== "play" || state.lunarEnergy < 100) return;
    if (!readPointer(e)) return;
    const moon = hooks.getMoon();
    const hits = raycaster.intersectObject(moon, true);
    if (hits.length) lunarShockwave();
  }

  function enter() {
    if (phase !== "idle") return;
    phase = "enter";
    state.active = true;
    state.earthHP = 100;
    state.exp = 0;
    state.score = 0;
    state.lunarEnergy = 0;
    state.wave = 1;
    freshArcade();
    armWave();
    state.over = false;
    runPersisted = false;
    paused = false;
    finale = null;
    pendingFinale = false;
    flash = 0;
    veil = 0;
    zoom = 0.3;
    zoomGoal = 0.3;
    spawnTimer = 0.4;
    fireCooldown = 0.2;
    hitShake = 0;
    aimAngle = Math.PI / 2;
    aimPoint.set(0, 4.2, 0);
    const cam = hooks.getCamera();
    const controls = hooks.getControls();
    savedCam.copy(cam.position);
    savedTarget.copy(controls.target);
    camFrom.copy(cam.position);
    camTo.set(0, 0, viewZ(cam as THREE.PerspectiveCamera));
    targetFrom.copy(controls.target);
    targetTo.set(0, 0, 0);
    camT = 0;
    controls.enabled = false;
    controls.autoRotate = false;
    hooks.hideSim();
    ensureMoonRing();
    ensureAimGfx();
    syncCannons();
  }

  function exit(kind: "user" | "boom" = "user") {
    if (phase === "idle" || phase === "exit") return;
    pendingFinale = kind === "boom";
    paused = false;
    if (kind === "boom") savedRun = null;
    clearBoom();
    clearActors();
    persistRun(kind === "boom");
    const cam = hooks.getCamera();
    const controls = hooks.getControls();
    camFrom.copy(cam.position);
    camTo.copy(savedCam);
    targetFrom.copy(controls.target);
    targetTo.copy(savedTarget);
    camT = 0;
    phase = "exit";
    hooks.restoreSim();
  }

  /** Mette in pausa il combattimento (pulsante Pausa, scheda in background). */
  function pause() {
    if (phase !== "play" || state.over || state.guide || state.shop || paused) return false;
    paused = true;
    return true;
  }

  /** Paga un upgrade a livelli e restituisce il nuovo livello, o null se non si può. */
  function payLevel(base: number, level: number) {
    const cost = levelCost(base, level);
    if (cost == null || state.exp < cost) return null;
    state.exp -= cost;
    return level + 1;
  }

  function buyUpgrade(type: string) {
    const done = buyInner(type);
    if (done && state.shop && state.shopKind === "wave" && type !== "shop-next") saveRun();
    return done;
  }

  function buyInner(type: string) {
    if (phase === "idle" || phase === "exit" || phase === "boom" || state.over) return false;
    if (type === "guide-ok") {
      if (savedRun) dropRun();
      state.guide = false;
      return true;
    }
    if (type === "resume") {
      if (!state.guide || !savedRun) return false;
      resumeRun(savedRun);
      return true;
    }
    // Lo shop ripreso funziona già durante l'ingresso della camera: un tocco su Continua non va perso sui dispositivi lenti.
    if (phase !== "play" && phase !== "enter") return false;
    if (type === "pause") return pause();
    if (type === "unpause") {
      if (!paused) return false;
      paused = false;
      return true;
    }
    if (paused) return false;
    if (type === "freeze-shop") {
      if (state.guide || state.shop || state.freezeLeft <= 0) return false;
      state.shop = true;
      state.shopKind = "freeze";
      return true;
    }
    if (type === "shop-close") {
      if (!state.shop || state.shopKind !== "freeze") return false;
      state.shop = false;
      state.shopKind = null;
      place = null;
      placeMsg = "";
      clearGhost();
      return true;
    }
    if (type === "shop-next") {
      if (!state.shop || place || state.shopKind === "freeze") return false;
      state.shop = false;
      state.shopKind = null;
      placeMsg = "";
      clearGhost();
      state.wave += 1;
      armWave();
      return true;
    }
    if (type === "place-no") {
      place = null;
      placeMsg = "";
      clearGhost();
      return true;
    }
    if (type === "place-ok") {
      if (!place || !state.shop) return false;
      if (turrets.length >= BALANCE.turrets.max) {
        placeMsg = "Massimo raggiunto";
        return false;
      }
      if (tooClose(place.angle)) {
        placeMsg = "Troppo vicina";
        return false;
      }
      const cost = turretCost(place.kind);
      if (state.exp < cost) return false;
      state.exp -= cost;
      addTurret(place.kind, place.angle);
      place = null;
      placeMsg = "";
      clearGhost();
      return true;
    }
    if (type.startsWith("gun-")) {
      const id = type.slice(4) as MainGun;
      if (!(id in BALANCE.gun)) return false;
      if (state.gunLevels[id] > 0) {
        state.mainGun = id;
        fireCooldown = 0;
        return true;
      }
      if (!state.shop) return false;
      const next = payLevel(BALANCE.gun[id].base, 0);
      if (next == null) return false;
      state.gunLevels[id] = next;
      state.mainGun = id;
      fireCooldown = 0;
      return true;
    }
    if (!state.shop) return false;
    if (type.startsWith("up-gun-")) {
      const id = type.slice(7) as MainGun;
      if (!(id in BALANCE.gun) || state.gunLevels[id] <= 0) return false;
      const next = payLevel(BALANCE.gun[id].base, state.gunLevels[id]);
      if (next == null) return false;
      state.gunLevels[id] = next;
      return true;
    }
    if (type === "up-rate" || type === "up-cal") {
      const key = type === "up-rate" ? "turretRate" : "turretCalibre";
      const base = type === "up-rate" ? BALANCE.turretUpgrades.rate.base : BALANCE.turretUpgrades.calibre.base;
      const next = payLevel(base, state[key]);
      if (next == null) return false;
      state[key] = next;
      return true;
    }
    if (type === "up-reload" || type === "up-radius") {
      if (!turrets.some((t) => t.kind === "missile")) return false;
      const key = type === "up-reload" ? "missileReload" : "missileRadius";
      const base = type === "up-reload" ? BALANCE.missileUpgrades.reload.base : BALANCE.missileUpgrades.radius.base;
      const next = payLevel(base, state[key]);
      if (next == null) return false;
      state[key] = next;
      return true;
    }
    if (type === "arm-cannon" || type === "arm-missile" || type === "arm-mortar") {
      const kind = type.slice(4) as TurretKind;
      if (turrets.length >= BALANCE.turrets.max) return false;
      if (state.exp < turretCost(kind)) return false;
      place = { kind, angle: aimAngle };
      const cone = kind === "cannon" ? `Cono ±${BALANCE.turrets.cannon.coneDeg}°, non ruota` : kind === "missile" ? `±${BALANCE.turrets.missile.coneDeg}° che oscilla su ±${BALANCE.turrets.missile.sweepDeg}°` : `Cono ±${BALANCE.turrets.mortar.coneDeg}°, gittata corta`;
      placeCone = cone;
      placeMsg = tooClose(aimAngle) ? "Troppo vicina" : cone;
      syncGhost();
      return true;
    }
    if (type.startsWith("wh-")) {
      const id = type.slice(3) as MissileId;
      if (!(id in BALANCE.missiles) || !turrets.some((t) => t.kind === "missile")) return false;
      if (!state.ownedMissiles[id]) {
        const cost = BALANCE.missiles[id].cost;
        if (state.exp < cost) return false;
        state.exp -= cost;
        state.ownedMissiles[id] = true;
      }
      state.missile = id;
      return true;
    }
    return false;
  }

  /** Sonda per i test automatici (attiva solo con ?etdebug nell'indirizzo). */
  const debug = {
    probe: () => ({
      view: viewHalf(),
      zoom,
      zoomGoal,
      camZ: hooks.getCamera().position.z,
      bossWarn,
      coins: coins.length,
      hostiles: hostiles.length,
      enemies: enemies.map((e) => ({ treasure: e.treasure, tele: e.tele, teleAngle: e.teleAngle, boss: e.boss, entering: e.entering, hp: e.hp, maxHp: e.maxHp, x: e.mesh.position.x, y: e.mesh.position.y, radius: e.radius, onScreen: onScreen(e.mesh.position, e.boss ? e.radius : 0), targetable: targetable(e) })),
      turrets: turrets.map((t) => ({ kind: t.kind, cd: t.cd })),
      cooldowns: Object.fromEntries(MISSILES.map((id) => [id, warheadCooldown(id)])),
      gun: gunStats(state.mainGun),
    }),
    addExp: (n: number) => {
      state.exp += n;
    },
    rollDrop: (boss: boolean) => rollDrop(boss),
    spawnTreasure: () => spawnTreasure(),
    killTreasure: () => {
      const i = enemies.findIndex((e) => e.treasure);
      if (i >= 0) killEnemy(i);
      return i >= 0;
    },
    coinValue: () => coinValue(),
    coinScreen: () => {
      const cam = hooks.getCamera();
      const canvas = document.querySelector("canvas");
      if (!canvas) return [];
      const r = canvas.getBoundingClientRect();
      return coins.map((c) => {
        const v = c.mesh.position.clone().project(cam);
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, left: c.life, value: c.value };
      });
    },
    bossHurt: (frac: number) => {
      const b = enemies.find((e) => e.boss);
      if (b) b.hp = b.maxHp * frac;
      return Boolean(b);
    },
  };

  return {
    debug,
    state,
    enter,
    exit,
    update,
    onPointer,
    onPointerUp,
    setZoom01,
    lunarShockwave,
    buyUpgrade,
    pause,
    holdsCamera,
    hidesPlanet,
    snapshot,
  };
}
