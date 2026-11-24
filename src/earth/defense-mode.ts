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
};

type Enemy = {
  mesh: THREE.Mesh;
  speed: number;
  hp: number;
  boss: boolean;
  mode: "in" | "strafe" | "blink";
  modeT: number;
  strafe: number;
};
type ShotKind = "bolt" | MissileId;
type Shot = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  kind: ShotKind;
  traveled: number;
  range: number;
};
type Spark = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number };
type Shard = { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3 };
type Drop = { mesh: THREE.Mesh; kind: "shield" };

const RIM = 1.1;
const MOON_ORBIT = 2.48;
const ZOOM_MIN = 0.62;
const ZOOM_MAX = 4.1;
const LAUNCH_ANGLES = [-1.2, 2.15, -2.35, 0.45];
const MISSILES: MissileId[] = ["cluster", "limited", "slow", "homing"];
const MISSILE_COST: Record<MissileId, number> = { cluster: 90, limited: 150, slow: 190, homing: 260 };

export function createDefenseMode(hooks: DefenseHooks) {
  const state: DefenseState = {
    active: false,
    wave: 1,
    earthHP: 100,
    exp: 0,
    score: 0,
    lunarEnergy: 0,
    highscore: parseInt(localStorage.getItem("earthtrip-hs") || "0", 10) || 0,
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
  };

  const cannons: THREE.Group[] = [];
  const podsMesh: THREE.Group[] = [];
  const enemies: Enemy[] = [];
  const projectiles: Shot[] = [];
  const particles: Spark[] = [];
  const drops: Drop[] = [];
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
  let launcherCooldown = 1.75;
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
  let finale: { score: number; wave: number; highscore: number } | null = null;
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

  function horizon() {
    const cam = hooks.getCamera() as THREE.PerspectiveCamera;
    const v = THREE.MathUtils.degToRad(cam.fov) * 0.5;
    const limit = Math.min(Math.tan(v), Math.tan(v) * Math.max(0.35, cam.aspect));
    return Math.max(6.6, viewZ(cam) * limit * 0.9);
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
    state.ownedMissiles = { cluster: false, limited: false, slow: false, homing: false };
    state.shield = 0;
    state.freezeCharges = 0;
    state.freezeLeft = 0;
    state.cannonCount = 1;
    state.weaponType = "base";
    state.levels = { base: 1, mg: 0, multi: 0, homing: 0 };
    burstLeft = 0;
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
    const boss = enemies.some((e) => e.boss);
    return {
      ...state,
      levels: { ...state.levels },
      ownedMissiles: { ...state.ownedMissiles },
      phase,
      flash,
      veil,
      finale,
      zoom: zoom01(),
      boss,
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
  function barrelAngle(index: number, count: number) {
    const step = count <= 1 ? 0 : (index * Math.PI * 2) / count;
    const base = aimAngle + step;
    if (state.freezeLeft > 0 || state.fireLevel < 1) return base;
    const amp = 0.07 + state.fireLevel * 0.055;
    return base + Math.sin(performance.now() * 0.0016 + index * 1.7) * amp;
  }

  function syncCannons() {
    const frozen = state.freezeLeft > 0;
    const need = frozen ? 1 : state.spread;
    while (cannons.length < need) cannons.push(makeCannon(cannons.length === 0));
    while (cannons.length > need) {
      const g = cannons.pop();
      if (g) disposeObject(g);
    }
    const show = phase === "play" || phase === "enter";
    cannons.forEach((g, i) => {
      const a = frozen ? aimAngle : barrelAngle(i, need);
      g.position.set(Math.cos(a) * RIM, Math.sin(a) * RIM, 0.04);
      g.rotation.set(0, 0, a);
      g.visible = show;
    });
    const podNeed = frozen ? 0 : state.pods;
    while (podsMesh.length < podNeed) podsMesh.push(makeLauncher());
    while (podsMesh.length > podNeed) {
      const g = podsMesh.pop();
      if (g) disposeObject(g);
    }
    podsMesh.forEach((g, i) => {
      const a = LAUNCH_ANGLES[i] ?? -1.2;
      g.position.set(Math.cos(a) * RIM, Math.sin(a) * RIM, 0.05);
      g.rotation.set(0, 0, a);
      g.visible = show && !frozen;
    });
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
    aimLine.visible = phase === "play";
    cross.visible = phase === "play";
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
    const edge = horizon();
    const dist = boss ? Math.max(6.2, edge * 0.92) : Math.max(5.4, edge * (0.78 + Math.random() * 0.16));
    const mesh = new THREE.Mesh(
      boss ? new THREE.IcosahedronGeometry(0.42, 0) : new THREE.OctahedronGeometry(0.16, 0),
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
        new THREE.TorusGeometry(0.62, 0.035, 8, 28),
        new THREE.MeshBasicMaterial({ color: 0xffb15a, transparent: true, opacity: 0.9 }),
      );
      halo.rotation.x = Math.PI / 2;
      mesh.add(halo);
    }
    hooks.getScene().add(mesh);
    enemies.push({
      mesh,
      speed: boss ? 0.36 + state.wave * 0.02 : 0.85 + state.wave * 0.11,
      hp: boss ? 18 + state.wave * 4 : 1.6 + state.wave * 0.45,
      boss,
      mode: "in",
      modeT: 1.6,
      strafe: Math.random() < 0.5 ? 1 : -1,
    });
    if (boss) burst(mesh.position, 0xffb15a, 14);
  }

  function spawnDrop(pos: THREE.Vector3) {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshBasicMaterial({ color: 0x8ee7ff }),
    );
    mesh.position.copy(pos);
    hooks.getScene().add(mesh);
    drops.push({ mesh, kind: "shield" });
  }

  function killEnemy(index: number) {
    const e = enemies[index];
    if (!e) return;
    gain(e.boss ? 48 + state.wave * 2 : 12 + state.wave, e.boss ? 16 : 5);
    burst(e.mesh.position, e.boss ? 0xffb15a : 0xff6688, e.boss ? 22 : 10);
    if (Math.random() < (e.boss ? 0.5 : 0.14)) spawnDrop(e.mesh.position.clone());
    disposeObject(e.mesh);
    enemies.splice(index, 1);
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

  function fireBolt(angle: number, kind: ShotKind, speed: number, damage: number, color: number, range: number, life: number) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(kind === "bolt" ? 0.04 : 0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
    mesh.position.set(Math.cos(angle) * (RIM + 0.28), Math.sin(angle) * (RIM + 0.28), 0.05);
    hooks.getScene().add(mesh);
    projectiles.push({
      mesh,
      vel: new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(speed),
      life,
      damage,
      kind,
      traveled: 0,
      range,
    });
  }

  function fireRose() {
    const frozen = state.freezeLeft > 0;
    const n = frozen ? 1 : state.spread;
    const dmg = frozen ? 1.05 : state.fireLevel === 2 ? 0.62 : state.fireLevel === 1 ? 0.9 : 1.1;
    const speed = state.fireLevel === 1 && !frozen ? 7 : 6.2;
    const color = state.fireLevel === 2 && !frozen ? 0xb8fff4 : 0x7dfff0;
    for (let i = 0; i < n; i += 1) {
      const a = frozen ? aimAngle : barrelAngle(i, n);
      fireBolt(a, "bolt", speed, dmg, color, 18, 2.4);
    }
  }

  function firePods() {
    if (state.missile === "none" || state.pods <= 0 || state.freezeLeft > 0) return;
    const kind = state.missile;
    const color = kind === "cluster" ? 0xffd27a : kind === "limited" ? 0xff9a6a : kind === "slow" ? 0xc9b6ff : 0xffc14d;
    const speed = kind === "cluster" ? 3.5 : 4.5;
    const range = kind === "cluster" ? 4.4 : kind === "limited" ? 8 : 16;
    const life = kind === "limited" ? 1.35 : kind === "cluster" ? 2.2 : 3.2;
    const dmg = kind === "cluster" ? 1.4 : 1.35;
    for (let i = 0; i < state.pods; i += 1) {
      fireBolt(LAUNCH_ANGLES[i] ?? -1.2, kind, speed, dmg, color, range, life);
    }
  }

  function blastCluster(pos: THREE.Vector3) {
    burst(pos, 0xffe29a, 14);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.28, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe29a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }),
    );
    ring.position.copy(pos);
    hooks.getScene().add(ring);
    const started = performance.now();
    const grow = () => {
      const k = (performance.now() - started) / 280;
      ring.scale.setScalar(1 + k * 4.2);
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - k);
      if (k < 1) requestAnimationFrame(grow);
      else {
        hooks.getScene().remove(ring);
        ring.geometry.dispose();
      }
    };
    grow();
    for (let j = enemies.length - 1; j >= 0; j -= 1) {
      if (enemies[j].mesh.position.distanceTo(pos) > 1.25) continue;
      enemies[j].hp -= 2.4;
      if (enemies[j].hp <= 0) killEnemy(j);
    }
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
    for (const g of podsMesh) disposeObject(g);
    podsMesh.length = 0;
    for (const d of drops) disposeObject(d.mesh);
    drops.length = 0;
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
    clearShield();
    if (aimLine) aimLine.visible = false;
    if (cross) cross.visible = false;
    for (const cannon of cannons) cannon.visible = false;
    for (const pod of podsMesh) pod.visible = false;
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
    for (const e of enemies) burst(e.mesh.position, 0xffe29a, 8);
    for (const e of enemies) hooks.getScene().remove(e.mesh);
    enemies.length = 0;
    state.lunarEnergy = 0;
    state.exp += 25;
    state.score += 25;
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
            finale = { score: Math.floor(state.score), wave: state.wave, highscore: state.highscore };
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

    if (state.freezeLeft > 0) {
      state.freezeLeft = Math.max(0, state.freezeLeft - dt);
      if (state.freezeLeft === 0) syncShield();
    } else {
      spawnTimer += dt;
      waveTimer += dt;
      if (waveTimer > 22) {
        waveTimer = 0;
        state.wave += 1;
        if (state.wave % 3 === 0) {
          spawnEnemy(true);
          spawnTimer = -1.6;
        }
      }
      const every = Math.max(0.42, 1.7 - state.wave * 0.08);
      if (spawnTimer > every) {
        spawnTimer = 0;
        spawnEnemy(false);
        if (state.wave > 3 && Math.random() < 0.35) spawnEnemy(false);
      }
    }

    const frozen = state.freezeLeft > 0;
    const moonPos = hooks.getMoonPivot().position;
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const e = enemies[i];
      if (!frozen) {
        if (e.boss) {
          const mat = e.mesh.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.65 + Math.sin(performance.now() * 0.008) * 0.35;
          const halo = e.mesh.children[0];
          if (halo) halo.rotation.z += dt * 2.4;
          e.modeT -= dt;
          if (e.modeT <= 0) {
            const roll = Math.random();
            e.mode = roll < 0.34 ? "blink" : roll < 0.67 ? "strafe" : "in";
            e.modeT = 1.5 + Math.random() * 1.4;
            e.strafe = Math.random() < 0.5 ? 1 : -1;
            if (e.mode === "blink") {
              const a = Math.random() * Math.PI * 2;
              const r = Math.max(3.5, e.mesh.position.length() * (0.68 + Math.random() * 0.4));
              e.mesh.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
              burst(e.mesh.position, 0xffb15a, 10);
            }
          }
          if (e.mode === "strafe") {
            const p = e.mesh.position;
            const tang = new THREE.Vector3(-p.y, p.x, 0);
            if (tang.lengthSq() > 1e-6) tang.normalize();
            e.mesh.position.addScaledVector(tang, e.strafe * e.speed * 1.85 * dt);
          } else if (e.mode === "in") {
            const dir = e.mesh.position.clone().negate().normalize();
            e.mesh.position.addScaledVector(dir, e.speed * dt);
          }
        } else {
          const dir = e.mesh.position.clone().negate().normalize();
          e.mesh.position.addScaledVector(dir, e.speed * dt);
        }
        e.mesh.rotation.z += dt * (e.boss ? 0.8 : 2.2);
      }
      const moonHit = e.boss ? 0.72 : 0.5;
      if (e.mesh.position.distanceTo(moonPos) < moonHit) {
        burst(e.mesh.position, 0x9ecbff, e.boss ? 16 : 12);
        killEnemy(i);
        continue;
      }
      if (frozen) continue;
      const earthHit = e.boss ? 1.45 : 1.2;
      if (e.mesh.position.length() < earthHit) {
        const dmg = e.boss ? 16 + state.wave : 6 + state.wave;
        const pos = e.mesh.position.clone();
        disposeObject(e.mesh);
        enemies.splice(i, 1);
        hurtEarth(dmg, pos);
        if (phase !== "play") return;
      }
    }
    if (!frozen) {
      for (let i = drops.length - 1; i >= 0; i -= 1) {
        const d = drops[i];
        const dir = d.mesh.position.clone().negate();
        const len = dir.length();
        d.mesh.scale.setScalar(1 + Math.sin(performance.now() * 0.008 + i) * 0.18);
        if (len < 1.35) {
          state.shield = 3;
          syncShield();
          burst(d.mesh.position, 0x8ee7ff, 8);
          disposeObject(d.mesh);
          drops.splice(i, 1);
          continue;
        }
        dir.multiplyScalar(1 / len);
        d.mesh.position.addScaledVector(dir, 1.55 * dt);
        d.mesh.rotation.z += dt * 2.4;
      }
    }

    fireCooldown -= dt;
    launcherCooldown -= dt;
    if (enemies.length > 0) {
      if (frozen) {
        if (fireCooldown <= 0) {
          fireCooldown = 0.36;
          fireRose();
        }
      } else if (state.fireLevel >= 2) {
        if (burstLeft > 0) {
          if (fireCooldown <= 0) {
            fireRose();
            burstLeft -= 1;
            fireCooldown = burstLeft > 0 ? 0.07 : 0.62;
          }
        } else if (fireCooldown <= 0) {
          burstLeft = 3;
          fireCooldown = 0;
        }
      } else if (fireCooldown <= 0) {
        fireCooldown = state.fireLevel === 1 ? 0.2 : 0.44;
        fireRose();
      }
      if (!frozen && launcherCooldown <= 0 && state.pods > 0 && state.missile !== "none") {
        launcherCooldown = state.missile === "slow" ? 2.45 : 1.75;
        firePods();
      }
    }

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
          desired.normalize().multiplyScalar(4.5);
          p.vel.lerp(desired, 1 - Math.exp(-dt * (p.kind === "limited" ? 2.4 : 5.6)));
        }
      }
      const step = p.vel.clone().multiplyScalar(dt);
      p.mesh.position.add(step);
      p.traveled += step.length();
      p.life -= dt;
      let spent = p.life <= 0 || (p.kind === "cluster" && p.traveled >= p.range);
      if (p.kind === "limited" && p.life <= 0) {
        burst(p.mesh.position, 0xff9a6a, 4);
        disposeObject(p.mesh);
        projectiles.splice(i, 1);
        continue;
      }
      if (!spent) {
        const hitR = p.kind === "bolt" ? 0.28 : 0.34;
        for (let j = enemies.length - 1; j >= 0; j -= 1) {
          if (p.mesh.position.distanceTo(enemies[j].mesh.position) < (enemies[j].boss ? hitR + 0.22 : hitR)) {
            enemies[j].hp -= p.damage;
            burst(p.mesh.position, 0xffd27a, 4);
            spent = true;
            if (enemies[j].hp <= 0) killEnemy(j);
            break;
          }
        }
      }
      if (spent) {
        if (p.kind === "cluster") blastCluster(p.mesh.position.clone());
        disposeObject(p.mesh);
        projectiles.splice(i, 1);
      }
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
    aimAngle = Math.atan2(hit.y, hit.x);
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
    state.exp = 40;
    state.score = 0;
    state.lunarEnergy = 0;
    state.wave = 1;
    freshArcade();
    state.over = false;
    finale = null;
    pendingFinale = false;
    flash = 0;
    veil = 0;
    zoom = 1;
    spawnTimer = 0.4;
    fireCooldown = 0.2;
    launcherCooldown = 1.75;
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
    if (state.score > state.highscore) {
      state.highscore = state.score;
      localStorage.setItem("earthtrip-hs", String(state.highscore));
    }
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
    enemies.length = 0;
    projectiles.length = 0;
    state.over = false;
    state.earthHP = 100;
    state.wave = 1;
    state.exp = 40;
    state.score = 0;
    state.lunarEnergy = 0;
    freshArcade();
    spawnTimer = 0.6;
    waveTimer = 0;
    arcProgress = -1;
    syncCannons();
  }

  function buyUpgrade(type: string) {
    if (phase !== "play" || state.over || state.freezeLeft > 0) return false;
    if (type === "fire") {
      if (state.fireLevel >= 2) return false;
      const cost = state.fireLevel === 0 ? 60 : 120;
      if (state.exp < cost) return false;
      state.exp -= cost;
      state.fireLevel += 1;
      return true;
    }
    if (type === "rose") {
      if (state.spread >= 8) return false;
      const cost = 80 + (state.spread - 1) * 90;
      if (state.exp < cost) return false;
      state.exp -= cost;
      state.spread += 1;
      syncCannons();
      return true;
    }
    if (type === "pod") {
      if (state.pods >= 4) return false;
      const cost = 110 + state.pods * 70;
      if (state.exp < cost) return false;
      state.exp -= cost;
      state.pods += 1;
      syncCannons();
      return true;
    }
    if (type === "cluster" || type === "limited" || type === "slow" || type === "homing") {
      const id = type as MissileId;
      if (!state.ownedMissiles[id]) {
        const cost = MISSILE_COST[id];
        if (state.exp < cost) return false;
        state.exp -= cost;
        state.ownedMissiles[id] = true;
        if (state.pods <= 0) {
          state.pods = 1;
          syncCannons();
        }
      }
      state.missile = id;
      return true;
    }
    if (type === "shield") {
      if (state.shield > 0 || state.exp < 80) return false;
      state.exp -= 80;
      state.shield = 3;
      syncShield();
      return true;
    }
    if (type === "freeze") {
      if (state.freezeCharges > 0) {
        state.freezeCharges -= 1;
        state.freezeLeft = 4.2;
        syncShield();
        return true;
      }
      if (state.freezeCharges >= 2 || state.exp < 130) return false;
      state.exp -= 130;
      state.freezeCharges += 1;
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
