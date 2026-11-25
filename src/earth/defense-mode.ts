import * as THREE from "three";

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

export type WeaponId = "base" | "mg" | "multi" | "homing";

export type MissileId = "cluster" | "limited" | "slow" | "homing";
export type MainGun = "singolo" | "raffica" | "mitra" | "rosa";
export type AutoMode = "singolo" | "doppio" | "bombe";
export type RunLog = { score: number; wave: number; at: number };

export type DefenseState = {
  active: boolean;
  wave: number;
  earthHP: number;
  exp: number;
  score: number;
  lunarEnergy: number;
  highscore: number;
  cannonCount: number;
  weaponType: WeaponId;
  levels: Record<WeaponId, number>;
  over: boolean;
  fireLevel: number;
  spread: number;
  pods: number;
  missile: MissileId | "none";
  ownedMissiles: Record<MissileId, boolean>;
  shield: number;
  freezeCharges: number;
  freezeLeft: number;
  mainGun: MainGun;
  autoMode: AutoMode;
  cleared: number;
  bestCleared: number;
  bestRun: RunLog | null;
  lastRun: RunLog | null;
  shop: boolean;
  shopKind: "wave" | "freeze" | null;
  guide: boolean;
  ownedGuns: Record<MainGun, boolean>;
  ownedAmmo: Record<AutoMode, boolean>;
};

type Enemy = {
  mesh: THREE.Mesh;
  speed: number;
  hp: number;
  maxHp: number;
  boss: boolean;
  radius: number;
  mode: "in" | "strafe" | "blink";
  modeT: number;
  strafe: number;
  shotT: number;
  slow: number;
};
type ShotKind = "bolt" | "bomb" | MissileId;
type Shot = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  kind: ShotKind;
  traveled: number;
  range: number;
  pierce: number;
};
type Spark = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number };
type Shard = { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3 };
type DropKind = "shield" | "freeze" | "repair";
type Drop = { mesh: THREE.Object3D; kind: DropKind };
type Hostile = { mesh: THREE.Mesh; vel: THREE.Vector3; hp: number };

const RIM = 1.1;
const MOON_ORBIT = 2.48;
const ZOOM_MIN = 0.62;
const ZOOM_MAX = 4.1;
const MISSILES: MissileId[] = ["cluster", "limited", "slow", "homing"];
const MISSILE_COST: Record<MissileId, number> = { cluster: 80, limited: 130, slow: 170, homing: 260 };
const GUN_COST: Record<Exclude<MainGun, "singolo">, number> = { raffica: 70, mitra: 120, rosa: 160 };
const AMMO_COST: Record<Exclude<AutoMode, "singolo">, number> = { doppio: 90, bombe: 140 };
const CONE_CANNON = (10 * Math.PI) / 180;
const CONE_MISSILE = (2 * Math.PI) / 180;
const MAX_TURRETS = 6;
const HIST_KEY = "earthtrip-defense-log";

function loadLog(): { best: RunLog | null; last: RunLog | null; bestCleared: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(HIST_KEY) || "null") as {
      best?: RunLog;
      last?: RunLog;
      bestCleared?: number;
    } | null;
    const hs = parseInt(localStorage.getItem("earthtrip-hs") || "0", 10) || 0;
    const best = raw?.best && typeof raw.best.score === "number" ? raw.best : hs > 0 ? { score: hs, wave: 1, at: 0 } : null;
    const last = raw?.last && typeof raw.last.score === "number" ? raw.last : null;
    const bestCleared = typeof raw?.bestCleared === "number" ? raw.bestCleared : 0;
    return { best, last, bestCleared };
  } catch {
    return { best: null, last: null, bestCleared: 0 };
  }
}

export function createDefenseMode(hooks: DefenseHooks) {
  const saved = loadLog();
  const state: DefenseState = {
    active: false,
    wave: 1,
    earthHP: 100,
    exp: 0,
    score: 0,
    lunarEnergy: 0,
    highscore: Math.max(parseInt(localStorage.getItem("earthtrip-hs") || "0", 10) || 0, saved.best?.score ?? 0),
    cannonCount: 1,
    weaponType: "base",
    levels: { base: 1, mg: 0, multi: 0, homing: 0 },
    over: false,
    fireLevel: 0,
    spread: 1,
    pods: 0,
    missile: "none",
    ownedMissiles: { cluster: false, limited: false, slow: false, homing: false },
    shield: 0,
    freezeCharges: 0,
    freezeLeft: 0,
    mainGun: "singolo",
    autoMode: "singolo",
    cleared: 0,
    bestCleared: saved.bestCleared,
    bestRun: saved.best,
    lastRun: saved.last,
    shop: false,
    shopKind: null,
    guide: true,
    ownedGuns: { singolo: true, raffica: false, mitra: false, rosa: false },
    ownedAmmo: { singolo: true, doppio: false, bombe: false },
  };

  const cannons: THREE.Group[] = [];
  const turrets: { angle: number; kind: "cannon" | "missile"; cd: number; mesh: THREE.Group }[] = [];
  let place: { kind: "cannon" | "missile"; angle: number } | null = null;
  let ghost: THREE.Group | null = null;
  let placeMsg = "";
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
  let burstLeft = 0;
  let autoCd = 0.4;
  let missileCd = 0;
  let missileCdMax = 2.15;
  let trashQuota = 5;
  let trashSpawned = 0;
  let bossSpawned = false;
  let waveTimer = 0;
  let camT = 1;
  let phase: "idle" | "enter" | "play" | "exit" | "boom" = "idle";
  let moonRing: THREE.Mesh | null = null;
  let moonArc: THREE.Mesh | null = null;
  let aimLine: THREE.Line | null = null;
  let cross: THREE.Group | null = null;
  let shieldMesh: THREE.Mesh | null = null;
  let crackGroup: THREE.Group | null = null;
  let arcProgress = -1;
  let zoom = 1;
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

  function frameDistance(cam: THREE.PerspectiveCamera) {
    const v = THREE.MathUtils.degToRad(cam.fov) * 0.5;
    const h = Math.atan(Math.tan(v) * Math.max(0.35, cam.aspect));
    const limit = Math.min(Math.tan(v), Math.tan(h));
    return THREE.MathUtils.clamp((MOON_ORBIT + 0.85) / Math.max(0.16, limit), 6.2, 22);
  }

  function viewZ(cam: THREE.PerspectiveCamera) {
    return THREE.MathUtils.clamp(frameDistance(cam) * zoom, 5.2, 120);
  }

  function visibleRadius() {
    const cam = hooks.getCamera() as THREE.PerspectiveCamera;
    const v = THREE.MathUtils.degToRad(cam.fov) * 0.5;
    const h = Math.atan(Math.tan(v) * Math.max(0.35, cam.aspect));
    const limit = Math.hypot(Math.tan(v), Math.tan(h));
    return Math.max(4.8, viewZ(cam) * limit);
  }

  function horizon() {
    return visibleRadius();
  }

  function setZoom01(t: number) {
    if (phase === "idle" || phase === "exit" || phase === "boom") return;
    const k = THREE.MathUtils.clamp(t, 0, 1);
    zoom = ZOOM_MIN + k * (ZOOM_MAX - ZOOM_MIN);
  }

  function zoom01() {
    return THREE.MathUtils.clamp((zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN), 0, 1);
  }

  function freshArcade() {
    state.fireLevel = 0;
    state.spread = 1;
    state.pods = 0;
    state.missile = "none";
    state.mainGun = "singolo";
    state.autoMode = "singolo";
    state.ownedMissiles = { cluster: false, limited: false, slow: false, homing: false };
    state.ownedGuns = { singolo: true, raffica: false, mitra: false, rosa: false };
    state.ownedAmmo = { singolo: true, doppio: false, bombe: false };
    state.shop = false;
    state.shopKind = null;
    state.guide = true;
    state.shield = 0;
    state.freezeCharges = 0;
    state.freezeLeft = 0;
    state.cannonCount = 1;
    state.weaponType = "base";
    state.levels = { base: 1, mg: 0, multi: 0, homing: 0 };
    state.cleared = 0;
    burstLeft = 0;
    missileCd = 0;
    missileCdMax = 1.2;
    place = null;
    placeMsg = "";
    clearGhost();
    for (const t of turrets) disposeObject(t.mesh);
    turrets.length = 0;
  }

  function missileBuyable(id: MissileId) {
    if (id === "homing") {
      return state.ownedMissiles.cluster && state.ownedMissiles.limited && state.ownedMissiles.slow && state.bestCleared >= 6;
    }
    if (id === "limited") return state.bestCleared >= 2;
    if (id === "slow") return state.bestCleared >= 4;
    return true;
  }

  function turretCost(kind: "cannon" | "missile") {
    const n = turrets.filter((t) => t.kind === kind).length;
    return kind === "cannon" ? 40 + n * 30 : 55 + n * 35;
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

  function writeLog() {
    localStorage.setItem(
      HIST_KEY,
      JSON.stringify({ best: state.bestRun, last: state.lastRun, bestCleared: state.bestCleared }),
    );
  }

  function persistRun(force: boolean) {
    const run = { score: Math.floor(state.score), wave: state.wave, at: Date.now() };
    previousRun = state.lastRun;
    if (!force && run.score <= 0 && state.wave <= 1 && state.cleared <= 0) return;
    state.lastRun = run;
    if (!state.bestRun || run.score > state.bestRun.score) state.bestRun = run;
    state.highscore = Math.max(state.highscore, run.score);
    localStorage.setItem("earthtrip-hs", String(state.highscore));
    if (state.cleared > state.bestCleared) state.bestCleared = state.cleared;
    writeLog();
  }

  function armWave() {
    trashQuota = 8 + state.wave * 2;
    trashSpawned = 0;
    bossSpawned = false;
    spawnTimer = 0.45;
  }

  type SlotAction = "buy" | "upgrade" | "select" | "max";
  function shopSlots() {
    const exp = state.exp;
    const fireCost = state.fireLevel === 0 ? 60 : state.fireLevel === 1 ? 120 : 0;
    const fireName = state.fireLevel === 0 ? "Singolo" : state.fireLevel === 1 ? "Rapido" : "Raffica";
    const roseCost = state.spread >= 8 ? 0 : 80 + (state.spread - 1) * 90;
    const podCost = state.pods >= 4 ? 0 : 110 + state.pods * 70;
    const slots: {
      id: string;
      level: number;
      cost: number;
      owned: boolean;
      selected: boolean;
      action: SlotAction;
      affordable: boolean;
      name: string;
    }[] = [
      {
        id: "fire",
        level: state.fireLevel + 1,
        cost: fireCost,
        owned: true,
        selected: true,
        action: state.fireLevel >= 2 ? "max" : "upgrade",
        affordable: fireCost > 0 && exp >= fireCost,
        name: fireName,
      },
      {
        id: "rose",
        level: state.spread,
        cost: roseCost,
        owned: true,
        selected: state.spread > 1,
        action: state.spread >= 8 ? "max" : "upgrade",
        affordable: roseCost > 0 && exp >= roseCost,
        name: state.spread >= 8 ? "Rosa" : `x${state.spread + 1}`,
      },
      {
        id: "pod",
        level: state.pods,
        cost: podCost,
        owned: state.pods > 0,
        selected: state.pods > 0,
        action: state.pods >= 4 ? "max" : "buy",
        affordable: podCost > 0 && exp >= podCost,
        name: "Lancio",
      },
    ];
    for (const id of MISSILES) {
      const owned = state.ownedMissiles[id];
      const cost = owned ? 0 : MISSILE_COST[id];
      const names: Record<MissileId, string> = {
        cluster: "Grappolo",
        limited: "Limite",
        slow: "Rada",
        homing: "Ricerca",
      };
      slots.push({
        id,
        level: owned ? 1 : 0,
        cost,
        owned,
        selected: state.missile === id,
        action: owned ? "select" : "buy",
        affordable: owned || exp >= cost,
        name: names[id],
      });
    }
    slots.push({
      id: "shield",
      level: state.shield,
      cost: state.shield > 0 ? 0 : 80,
      owned: state.shield > 0,
      selected: state.shield > 0,
      action: state.shield > 0 ? "max" : "buy",
      affordable: state.shield <= 0 && exp >= 80,
      name: "Scudo",
    });
    const freezeCost = state.freezeCharges > 0 ? 0 : 130;
    slots.push({
      id: "freeze",
      level: state.freezeCharges,
      cost: freezeCost,
      owned: state.freezeCharges > 0 || state.freezeLeft > 0,
      selected: state.freezeLeft > 0,
      action: state.freezeCharges > 0 ? "select" : "buy",
      affordable: state.freezeCharges > 0 || exp >= 130,
      name: "Gelo",
    });
    return slots;
  }

  function snapshot() {
    const bossE = enemies.find((e) => e.boss);
    const guns: MainGun[] = ["singolo", "raffica", "mitra", "rosa"];
    const gunName: Record<MainGun, string> = { singolo: "Singolo", raffica: "Raffica", mitra: "Mitra", rosa: "Rosa" };
    const cannonN = turrets.filter((t) => t.kind === "cannon").length;
    const missileN = turrets.filter((t) => t.kind === "missile").length;
    const bossHint = bossE && bossE.mesh.position.length() > visibleRadius() * 0.86
      ? { angle: Math.atan2(bossE.mesh.position.y, bossE.mesh.position.x) }
      : null;
    return {
      ...state,
      levels: { ...state.levels },
      ownedMissiles: { ...state.ownedMissiles },
      ownedGuns: { ...state.ownedGuns },
      ownedAmmo: { ...state.ownedAmmo },
      phase,
      flash,
      veil,
      finale,
      zoom: zoom01(),
      boss: Boolean(bossE),
      bossHp: bossE ? Math.max(0, bossE.hp) : 0,
      bossMax: bossE ? bossE.maxHp : 0,
      missileCd,
      missileCdMax,
      placing: place?.kind ?? null,
      placeMsg,
      shopKind: state.shopKind,
      guide: state.guide,
      bossHint,
      turrets: turrets.map((t) => ({ kind: t.kind, angle: t.angle })),
      cannonTurrets: cannonN,
      missileTurrets: missileN,
      costs: {
        raffica: GUN_COST.raffica,
        mitra: GUN_COST.mitra,
        rosa: GUN_COST.rosa,
        doppio: AMMO_COST.doppio,
        bombe: AMMO_COST.bombe,
        cannon: turretCost("cannon"),
        missile: turretCost("missile"),
        cluster: MISSILE_COST.cluster,
        limited: MISSILE_COST.limited,
        slow: MISSILE_COST.slow,
        homing: MISSILE_COST.homing,
      },
      guns: guns.map((id) => ({
        id: `gun-${id}`,
        name: gunName[id],
        owned: state.ownedGuns[id],
        selected: state.mainGun === id,
        cost: id === "singolo" ? 0 : GUN_COST[id],
      })),
      ammo: (["singolo", "doppio", "bombe"] as AutoMode[]).map((id) => ({
        id: `ammo-${id}`,
        name: id === "singolo" ? "1 colpo" : id === "doppio" ? "Doppio" : "Bombe",
        owned: state.ownedAmmo[id],
        selected: state.autoMode === id,
        cost: id === "singolo" ? 0 : AMMO_COST[id],
      })),
      missiles: [
        { id: "missile-basic", name: "Singolo", owned: true, selected: state.missile === "none", cost: 0, open: true },
        { id: "cluster", name: "Grappolo", owned: state.ownedMissiles.cluster, selected: state.missile === "cluster", cost: MISSILE_COST.cluster, open: missileBuyable("cluster") || state.ownedMissiles.cluster },
        { id: "limited", name: "Limite", owned: state.ownedMissiles.limited, selected: state.missile === "limited", cost: MISSILE_COST.limited, open: missileBuyable("limited") || state.ownedMissiles.limited },
        { id: "slow", name: "Rada", owned: state.ownedMissiles.slow, selected: state.missile === "slow", cost: MISSILE_COST.slow, open: missileBuyable("slow") || state.ownedMissiles.slow },
        { id: "homing", name: "Ricerca", owned: state.ownedMissiles.homing, selected: state.missile === "homing", cost: MISSILE_COST.homing, open: missileBuyable("homing") || state.ownedMissiles.homing },
      ],
      slots: shopSlots(),
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

  function disposeObject(obj: THREE.Object3D) {
    hooks.getScene().remove(obj);
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    });
  }

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
      ghost = place.kind === "cannon" ? makeCannon(false) : makeLauncher();
      ghost.userData.kind = place.kind;
      ghost.add(makeCone(place.kind === "cannon" ? 0x7dfff0 : 0xffb15a, 0.5, place.kind === "cannon" ? CONE_CANNON : CONE_MISSILE));
    }
    ghost.position.set(Math.cos(place.angle) * RIM, Math.sin(place.angle) * RIM, 0.08);
    ghost.rotation.set(0, 0, place.kind === "missile" ? missileFacing(place.angle) : place.angle);
    ghost.visible = true;
  }

  function addTurret(kind: "cannon" | "missile", angle: number) {
    const mesh = kind === "cannon" ? makeCannon(false) : makeLauncher();
    mesh.add(makeCone(kind === "cannon" ? 0x7dfff0 : 0xffb15a, 0.42, kind === "cannon" ? CONE_CANNON : CONE_MISSILE));
    const turret = { angle, kind, cd: 0.35, mesh };
    turrets.push(turret);
    state.pods = turrets.length;
    placeTurret(turret);
  }

  function missileFacing(base: number) {
    return base + Math.sin(performance.now() * 0.0021) * ((10 * Math.PI) / 180);
  }

  function placeTurret(t: { angle: number; kind?: "cannon" | "missile"; mesh: THREE.Group }) {
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
    if (state.shield <= 0 || state.freezeLeft > 0) {
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
    if (!aimLine) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
      const mat = new THREE.LineDashedMaterial({
        color: 0x9dffe8,
        dashSize: 0.16,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      });
      aimLine = new THREE.Line(geo, mat);
      aimLine.computeLineDistances();
      aimLine.renderOrder = 8;
      hooks.getScene().add(aimLine);
    }
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
    if (!aimLine || !cross || !cannons[0]) return;
    const a = cannons[0].rotation.z;
    const muzzle = new THREE.Vector3(
      cannons[0].position.x + Math.cos(a) * 0.38,
      cannons[0].position.y + Math.sin(a) * 0.38,
      0.06,
    );
    const tip = aimPoint.clone();
    tip.z = 0.06;
    const pos = aimLine.geometry.getAttribute("position") as THREE.BufferAttribute;
    pos.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
    pos.setXYZ(1, tip.x, tip.y, tip.z);
    pos.needsUpdate = true;
    aimLine.computeLineDistances();
    cross.position.copy(tip);
    aimLine.visible = phase === "play" && !state.shop;
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
      new THREE.RingGeometry(0.4, 0.5, 64, 1, Math.PI / 2, 0.02),
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
      moonArc.geometry.dispose();
      moonArc.geometry = new THREE.RingGeometry(0.4, 0.52, 72, 1, Math.PI / 2, Math.max(0.02, (state.lunarEnergy / 100) * Math.PI * 2));
    }
  }

  function burst(pos: THREE.Vector3, color: number, count: number) {
    for (let i = 0; i < count; i += 1) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 4, 4),
        new THREE.MeshBasicMaterial({ color }),
      );
      p.position.copy(pos);
      hooks.getScene().add(p);
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 0.25)
        .normalize()
        .multiplyScalar(0.7 + Math.random() * 0.8);
      particles.push({ mesh: p, vel, life: 0.45 + Math.random() * 0.25 });
    }
  }

  function spawnEnemy(boss = false) {
    const angle = Math.random() * Math.PI * 2;
    const edge = visibleRadius();
    const dist = edge + 0.9 + (boss ? 0.4 : Math.random() * 0.35);
    const radius = boss ? 0.34 + state.wave * 0.06 : 0.16;
    const hp = boss ? 22 + state.wave * 8 : 1.6 + state.wave * 0.45;
    const mesh = new THREE.Mesh(
      boss ? new THREE.IcosahedronGeometry(radius, 0) : new THREE.OctahedronGeometry(0.16, 0),
      new THREE.MeshStandardMaterial({
        color: boss ? 0xff8a1e : 0xff4d6d,
        emissive: boss ? 0x7a2c00 : 0x5a1020,
        emissiveIntensity: boss ? 0.9 : 0.7,
        metalness: 0.25,
        roughness: 0.38,
      }),
    );
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
      modeT: 1.6,
      strafe: Math.random() < 0.5 ? 1 : -1,
      shotT: 0.85,
      slow: 0,
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
    const chance = boss ? 0.34 : 0.05;
    if (Math.random() > chance) return null;
    const roll = Math.random();
    if (roll < 0.38) return "shield" as const;
    if (roll < 0.68) return "freeze" as const;
    return "repair" as const;
  }

  function killEnemy(index: number) {
    const e = enemies[index];
    if (!e) return;
    const wasBoss = e.boss;
    gain(wasBoss ? 60 + state.wave * 3 : 6 + state.wave, wasBoss ? 16 : 3);
    burst(e.mesh.position, wasBoss ? 0xffb15a : 0xff6688, wasBoss ? 26 : 10);
    const drop = rollDrop(wasBoss);
    if (drop) spawnDrop(e.mesh.position.clone(), drop);
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
  }

  function hurtEarth(dmg: number, pos: THREE.Vector3) {
    if (state.shield > 0 && state.freezeLeft <= 0) {
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

  function fireBolt(angle: number, kind: ShotKind, speed: number, damage: number, color: number, range: number, life: number, pierce = 1) {
    const rad = kind === "bolt" ? 0.04 : kind === "bomb" ? 0.075 : kind === "homing" ? 0.095 : 0.062;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(rad, 6, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
    mesh.position.set(Math.cos(angle) * (RIM + 0.28), Math.sin(angle) * (RIM + 0.28), 0.05);
    hooks.getScene().add(mesh);
    const reach = kind === "bomb" || kind === "cluster" ? life : Math.max(life, (visibleRadius() + 1.6) / Math.max(0.3, speed));
    projectiles.push({
      mesh,
      vel: new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(speed),
      life: reach,
      damage,
      kind,
      traveled: 0,
      range,
      pierce,
    });
  }

  function fireMainOnce() {
    if (state.mainGun === "rosa") {
      const n = 7;
      const span = 0.72;
      for (let i = 0; i < n; i += 1) {
        const a = aimAngle - span / 2 + (span * i) / (n - 1);
        fireBolt(a, "bolt", 6.3, 0.55, 0xfff1c2, 11, 1.35);
      }
      return;
    }
    const dmg = state.mainGun === "mitra" ? 0.38 : state.mainGun === "raffica" ? 0.85 : 1.15;
    const speed = state.mainGun === "mitra" ? 7.4 : 6.4;
    const color = state.mainGun === "mitra" ? 0xb8fff4 : 0x7dfff0;
    fireBolt(aimAngle, "bolt", speed, dmg, color, 18, 2.3);
  }

  function coneAim(facing: number, cone: number) {
    let best: number | null = null;
    let bestAbs = cone + 1e-6;
    const consider = (a: number) => {
      const d = angDelta(a, facing);
      const ad = Math.abs(d);
      if (ad <= cone && ad < bestAbs) {
        bestAbs = ad;
        best = facing + d;
      }
    };
    for (const e of enemies) consider(Math.atan2(e.mesh.position.y, e.mesh.position.x));
    for (const h of hostiles) consider(Math.atan2(h.mesh.position.y, h.mesh.position.x));
    return best;
  }

  function fireTurret(t: { angle: number; kind: "cannon" | "missile"; cd: number }) {
    const facing = t.kind === "missile" ? missileFacing(t.angle) : t.angle;
    const cone = t.kind === "cannon" ? CONE_CANNON : CONE_MISSILE;
    const aim = coneAim(facing, cone);
    if (aim == null) return false;
    if (t.kind === "missile") {
      const kind = state.missile;
      if (kind === "homing") {
        fireBolt(facing, "homing", 5.3, 7.4, 0xffc14d, 22, 3.5, 4);
        t.cd = 3.1;
      } else if (kind === "slow") {
        fireBolt(facing, "slow", 3.7, 1.3, 0xc9b6ff, 14, 2.8, 1);
        t.cd = 2.7;
      } else if (kind === "limited") {
        fireBolt(facing, "limited", 4.7, 3.6, 0xff9a6a, 12, 1.7, 1);
        t.cd = 2.2;
      } else if (kind === "cluster") {
        fireBolt(facing, "cluster", 3.6, 1.6, 0xffd27a, 4.35, 2.3, 1);
        t.cd = 1.9;
      } else {
        fireBolt(facing, "bolt", 5.4, 1.25, 0xffd27a, 16, 2.3);
        t.cd = 1.15;
      }
      return true;
    }
    if (state.autoMode === "doppio") {
      const s = (1 * Math.PI) / 180;
      fireBolt(t.angle - s, "bolt", 5.8, 0.48, 0xffd27a, 16, 2.1);
      fireBolt(t.angle + s, "bolt", 5.8, 0.48, 0xffd27a, 16, 2.1);
      t.cd = 0.74;
      return true;
    }
    if (state.autoMode === "bombe") {
      fireBolt(t.angle, "bomb", 3.25, 0.35, 0xff7a3a, 4.2, 2.5);
      t.cd = 1.28;
      return true;
    }
    fireBolt(t.angle, "bolt", 5.6, 0.7, 0xffb15a, 16, 2.2);
    t.cd = 0.55;
    return true;
  }

  function fireAuto() {
    for (const t of turrets) {
      if (t.cd > 0) continue;
      if (!fireTurret(t)) t.cd = 0.1;
    }
  }

  function launchMissile() {
    const kind = state.missile === "none" ? "cluster" : state.missile;
    if (kind === "homing") {
      fireBolt(aimAngle, "homing", 5.3, 7.4, 0xffc14d, 22, 3.5, 4);
      missileCdMax = 3.35;
    } else if (kind === "slow") {
      fireBolt(aimAngle, "slow", 3.7, 1.3, 0xc9b6ff, 14, 2.8, 1);
      missileCdMax = 3.05;
    } else if (kind === "limited") {
      fireBolt(aimAngle, "limited", 4.7, 3.6, 0xff9a6a, 12, 1.7, 1);
      missileCdMax = 2.45;
    } else {
      fireBolt(aimAngle, "cluster", 3.6, 1.6, 0xffd27a, 4.35, 2.3, 1);
      missileCdMax = 2.15;
    }
    missileCd = missileCdMax;
  }

  function spawnHostile(origin: THREE.Vector3, radius: number) {
    const dir = origin.clone().negate();
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    const ang = Math.atan2(dir.y, dir.x) + (Math.random() - 0.5) * 0.38;
    const d = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff5a3a }),
    );
    mesh.position.copy(origin).addScaledVector(d, radius + 0.7);
    hooks.getScene().add(mesh);
    hostiles.push({ mesh, vel: d.multiplyScalar(2.3 + state.wave * 0.07), hp: 1 });
  }

  function areaBlast(pos: THREE.Vector3, radius: number, dmg: number, color: number) {
    burst(pos, color, 14);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.28, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }),
    );
    ring.position.copy(pos);
    hooks.getScene().add(ring);
    const started = performance.now();
    const grow = () => {
      const k = (performance.now() - started) / 280;
      ring.scale.setScalar(1 + k * (3.2 + radius * 2.4));
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - k);
      if (k < 1) requestAnimationFrame(grow);
      else {
        hooks.getScene().remove(ring);
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      }
    };
    grow();
    for (let j = enemies.length - 1; j >= 0; j -= 1) {
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

  function applySlow(pos: THREE.Vector3) {
    for (const e of enemies) {
      if (e.mesh.position.distanceTo(pos) < 2.5) e.slow = Math.max(e.slow, 3.4);
    }
    areaBlast(pos, 2.15, 1.7, 0xc9b6ff);
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
    clearShield();
    if (aimLine) hooks.getScene().remove(aimLine);
    if (cross) hooks.getScene().remove(cross);
    if (moonRing) hooks.getScene().remove(moonRing);
    if (moonArc) hooks.getScene().remove(moonArc);
    aimLine = null;
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
        hooks.getScene().remove(p.mesh);
        particles.splice(i, 1);
      }
    }
  }

  function beginBoom() {
    if (phase === "boom" || phase === "exit" || phase === "idle") return;
    state.over = true;
    state.earthHP = 0;
    phase = "boom";
    boomT = 0;
    flash = 1;
    veil = 0;
    for (const e of enemies) disposeObject(e.mesh);
    for (const shot of projectiles) disposeObject(shot.mesh);
    for (const d of drops) disposeObject(d.mesh);
    enemies.length = 0;
    projectiles.length = 0;
    drops.length = 0;
    for (const h of hostiles) disposeObject(h.mesh);
    hostiles.length = 0;
    clearShield();
    if (aimLine) aimLine.visible = false;
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
    if (state.lunarEnergy < 100 || phase !== "play") return false;
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

    if (state.guide) return;

    if (state.freezeLeft > 0 && !state.shop) {
      state.freezeLeft = Math.max(0, state.freezeLeft - dt);
      if (state.freezeLeft === 0) syncShield();
    } else if (!state.shop && state.freezeLeft <= 0 && !bossSpawned) {
      const trashAlive = enemies.some((e) => !e.boss);
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
      } else if (!trashAlive && spawnTimer > 0.35) {
        spawnEnemy(true);
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
          const diving = e.hp <= e.maxHp * 0.25;
          const hold = 4.4;
          if (diving) {
            pos.addScaledVector(pos.clone().negate().normalize(), Math.min(0.62, pace + 0.18) * dt);
          } else if (dist < hold) {
            pos.addScaledVector(pos.clone().normalize(), 0.7 * dt);
          } else {
            const tang = new THREE.Vector3(-pos.y, pos.x, 0).normalize();
            pos.addScaledVector(tang, e.strafe * 0.38 * dt);
            if (dist > hold + 1.6) pos.addScaledVector(pos.clone().negate().normalize(), 0.22 * dt);
          }
          if (state.wave >= 3) {
            e.shotT -= dt;
            if (e.shotT <= 0) {
              const n = 1 + Math.floor((state.wave - 3) / 2);
              e.shotT = Math.max(0.82, 2.05 - state.wave * 0.05);
              for (let s = 0; s < n; s += 1) spawnHostile(e.mesh.position, e.radius);
            }
          }
        } else {
          const dir = e.mesh.position.clone().negate().normalize();
          e.mesh.position.addScaledVector(dir, pace * dt);
        }
        e.mesh.rotation.z += dt * (e.boss ? 0.8 : 2.2);
      }
      const moonHit = e.radius + 0.32;
      if (e.mesh.position.distanceTo(moonPos) < moonHit) {
        burst(e.mesh.position, 0x9ecbff, e.boss ? 16 : 12);
        killEnemy(i);
        continue;
      }
      if (frozen) continue;
      if (e.mesh.position.length() < 1.02 + e.radius) {
        const dmg = e.boss ? 12 + state.wave * 2 : 6 + state.wave;
        const pos = e.mesh.position.clone();
        if (e.boss) {
          const left = Math.max(1, e.hp);
          const away = Math.atan2(pos.y, pos.x) + Math.PI;
          const back = 4.6;
          e.mesh.position.set(Math.cos(away) * back, Math.sin(away) * back, 0);
          e.hp = left;
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
        const dir = d.mesh.position.clone().negate();
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

    fireCooldown -= dt;
    missileCd = Math.max(0, missileCd - dt);
    for (const t of turrets) t.cd = Math.max(0, t.cd - dt);
    const threats = enemies.length > 0 || hostiles.length > 0;
    if (!state.shop && threats && state.mainGun === "raffica") {
      if (burstLeft > 0) {
        if (fireCooldown <= 0) {
          fireMainOnce();
          burstLeft -= 1;
          fireCooldown = burstLeft > 0 ? 0.07 : 0.62;
        }
      } else if (fireCooldown <= 0) {
        burstLeft = 3;
        fireCooldown = 0;
      }
    } else if (!state.shop && threats && fireCooldown <= 0) {
      fireMainOnce();
      fireCooldown = state.mainGun === "mitra" ? 0.08 : state.mainGun === "rosa" ? 0.5 : 0.32;
    }
    if (!state.shop && !frozen && threats) fireAuto();

    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const p = projectiles[i];
      if (frozen && p.kind !== "bolt") continue;
      const homing = p.kind === "limited" || p.kind === "slow" || p.kind === "homing";
      if (homing && enemies.length) {
        let best = enemies[0];
        let bestD = Infinity;
        for (const e of enemies) {
          const d = e.mesh.position.distanceToSquared(p.mesh.position);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        const desired = best.mesh.position.clone().sub(p.mesh.position);
        desired.z = 0;
        if (desired.lengthSq() > 1e-6) {
          const speed = p.kind === "homing" ? 6.4 : p.kind === "slow" ? 3.8 : 4.6;
          const turn = p.kind === "homing" ? 7.2 : p.kind === "limited" ? 2.5 : 4.2;
          desired.normalize().multiplyScalar(speed);
          p.vel.lerp(desired, 1 - Math.exp(-dt * turn));
        }
      }
      const step = p.vel.clone().multiplyScalar(dt);
      p.mesh.position.add(step);
      p.traveled += step.length();
      p.life -= dt;
      const ranged = (p.kind === "cluster" || p.kind === "bomb") && p.traveled >= p.range;
      let spent = p.life <= 0 || ranged;
      if (!spent) {
        for (let h = hostiles.length - 1; h >= 0; h -= 1) {
          if (p.mesh.position.distanceTo(hostiles[h].mesh.position) > 0.3) continue;
          hostiles[h].hp -= p.kind === "bolt" || p.kind === "bomb" ? 1 : 2;
          burst(p.mesh.position, 0xffb199, 4);
          if (hostiles[h].hp <= 0) {
            disposeObject(hostiles[h].mesh);
            hostiles.splice(h, 1);
            gain(3, 1);
          }
          if (p.pierce > 1) {
            p.pierce -= 1;
            const n = p.vel.clone();
            if (n.lengthSq() > 1e-8) p.mesh.position.addScaledVector(n.normalize(), 0.45);
          } else spent = true;
          break;
        }
      }
      if (!spent) {
        for (let j = enemies.length - 1; j >= 0; j -= 1) {
          const reach = enemies[j].radius + (p.kind === "bolt" ? 0.16 : 0.26);
          if (p.mesh.position.distanceTo(enemies[j].mesh.position) > reach) continue;
          enemies[j].hp -= p.damage;
          burst(p.mesh.position, 0xffd27a, 4);
          if (enemies[j].hp <= 0) killEnemy(j);
          if (p.pierce > 1) {
            p.pierce -= 1;
            const n = p.vel.clone();
            if (n.lengthSq() > 1e-8) p.mesh.position.addScaledVector(n.normalize(), 0.5);
          } else spent = true;
          break;
        }
      }
      if (!spent) continue;
      const pos = p.mesh.position.clone();
      if (p.kind === "cluster") areaBlast(pos, 1.35, 2.8, 0xffe29a);
      else if (p.kind === "bomb") areaBlast(pos, 1.5, 2.5, 0xff7a3a);
      else if (p.kind === "homing") areaBlast(pos, 1.7, 5.6, 0xffc14d);
      else if (p.kind === "slow") applySlow(pos);
      else if (p.kind === "limited") burst(pos, 0xff9a6a, 4);
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
    if (phase !== "play" || state.over) return;
    if (!readPointer(e)) return;
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    if (hit.length() < 0.45) return;
    const a = Math.atan2(hit.y, hit.x);
    if (place) {
      place.angle = a;
      placeMsg = tooClose(a) ? "Troppo vicina" : "";
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
    finale = null;
    pendingFinale = false;
    flash = 0;
    veil = 0;
    zoom = 1;
    spawnTimer = 0.4;
    fireCooldown = 0.2;
    autoCd = 0.4;
    missileCd = 0;
    hitShake = 0;
    waveTimer = 0;
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

  function retry() {
    if (phase !== "play") return;
    for (const e of enemies) hooks.getScene().remove(e.mesh);
    for (const p of projectiles) hooks.getScene().remove(p.mesh);
    for (const h of hostiles) hooks.getScene().remove(h.mesh);
    for (const d of drops) hooks.getScene().remove(d.mesh);
    enemies.length = 0;
    projectiles.length = 0;
    hostiles.length = 0;
    drops.length = 0;
    state.over = false;
    state.earthHP = 100;
    state.wave = 1;
    state.exp = 0;
    state.score = 0;
    state.lunarEnergy = 0;
    freshArcade();
    armWave();
    spawnTimer = 0.6;
    waveTimer = 0;
    arcProgress = -1;
    syncCannons();
  }

  function buyUpgrade(type: string) {
    if (phase === "idle" || phase === "exit" || phase === "boom" || state.over) return false;
    if (type === "guide-ok") {
      state.guide = false;
      return true;
    }
    if (phase !== "play") return false;
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
      if (turrets.length >= MAX_TURRETS) {
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
    if (type === "gun-singolo" || type === "gun-raffica" || type === "gun-mitra" || type === "gun-rosa") {
      const id = type.slice(4) as MainGun;
      if (state.ownedGuns[id]) {
        state.mainGun = id;
        burstLeft = 0;
        fireCooldown = 0;
        return true;
      }
      if (!state.shop) return false;
      const cost = id === "singolo" ? 0 : GUN_COST[id];
      if (state.exp < cost) return false;
      state.exp -= cost;
      state.ownedGuns[id] = true;
      state.mainGun = id;
      burstLeft = 0;
      fireCooldown = 0;
      return true;
    }
    if (!state.shop) return false;
    if (type === "arm-cannon" || type === "arm-missile") {
      const kind = type === "arm-cannon" ? "cannon" : "missile";
      if (turrets.length >= MAX_TURRETS) return false;
      if (state.exp < turretCost(kind)) return false;
      place = { kind, angle: aimAngle };
      placeMsg = tooClose(aimAngle) ? "Troppo vicina" : kind === "cannon" ? "Cono ±10°, non ruota" : "±2° che oscilla su ±10°";
      syncGhost();
      return true;
    }
    if (type === "ammo-singolo" || type === "ammo-doppio" || type === "ammo-bombe") {
      if (!turrets.some((t) => t.kind === "cannon")) return false;
      const id = type.slice(5) as AutoMode;
      if (!state.ownedAmmo[id]) {
        const cost = id === "singolo" ? 0 : AMMO_COST[id];
        if (state.exp < cost) return false;
        state.exp -= cost;
        state.ownedAmmo[id] = true;
      }
      state.autoMode = id;
      return true;
    }
    if (type === "missile-basic") {
      if (!turrets.some((t) => t.kind === "missile")) return false;
      state.missile = "none";
      return true;
    }
    if (type === "cluster" || type === "limited" || type === "slow" || type === "homing") {
      if (!turrets.some((t) => t.kind === "missile")) return false;
      const id = type as MissileId;
      if (!state.ownedMissiles[id]) {
        if (!missileBuyable(id)) return false;
        const cost = MISSILE_COST[id];
        if (state.exp < cost) return false;
        state.exp -= cost;
        state.ownedMissiles[id] = true;
      }
      state.missile = id;
      return true;
    }
    return false;
  }

  return {
    state,
    enter,
    exit,
    update,
    onPointer,
    onPointerUp,
    setZoom01,
    lunarShockwave,
    buyUpgrade,
    retry,
    holdsCamera,
    hidesPlanet,
    snapshot,
  };
}
