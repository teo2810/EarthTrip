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
};

type Enemy = { mesh: THREE.Mesh; speed: number; hp: number };
type Shot = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; homing: boolean; damage: number };
type Spark = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number };

const RIM = 1.1;
const MOON_ORBIT = 2.48;
const UNLOCK: Record<WeaponId, number> = { base: 0, mg: 90, multi: 140, homing: 200 };

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
  };

  const cannons: THREE.Group[] = [];
  const enemies: Enemy[] = [];
  const projectiles: Shot[] = [];
  const particles: Spark[] = [];
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
  let waveTimer = 0;
  let camT = 1;
  let phase: "idle" | "enter" | "play" | "exit" = "idle";
  let moonRing: THREE.Mesh | null = null;
  let moonArc: THREE.Mesh | null = null;
  let aimLine: THREE.Line | null = null;
  let cross: THREE.Group | null = null;
  let arcProgress = -1;

  function holdsCamera() {
    return phase !== "idle";
  }

  function frameDistance(cam: THREE.PerspectiveCamera) {
    const v = THREE.MathUtils.degToRad(cam.fov) * 0.5;
    const h = Math.atan(Math.tan(v) * Math.max(0.35, cam.aspect));
    const limit = Math.min(Math.tan(v), Math.tan(h));
    return THREE.MathUtils.clamp((MOON_ORBIT + 0.85) / Math.max(0.16, limit), 6.2, 22);
  }

  function slotCost(id: WeaponId | "cannon") {
    if (id === "cannon") return state.cannonCount >= 6 ? 0 : 70 + (state.cannonCount - 1) * 45;
    const lv = state.levels[id];
    if (lv <= 0) return UNLOCK[id];
    if (state.weaponType === id && lv < 5) return 55 * lv;
    return 0;
  }

  function snapshot() {
    const ids: (WeaponId | "cannon")[] = ["base", "mg", "multi", "homing", "cannon"];
    return {
      ...state,
      levels: { ...state.levels },
      slots: ids.map((id) => ({
        id,
        level: id === "cannon" ? state.cannonCount : state.levels[id],
        cost: slotCost(id),
        owned: id === "cannon" || state.levels[id] > 0,
        selected: id !== "cannon" && state.weaponType === id,
      })),
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

  function syncCannons() {
    while (cannons.length < state.cannonCount) cannons.push(makeCannon(cannons.length === 0));
    while (cannons.length > state.cannonCount) {
      const g = cannons.pop();
      if (g) hooks.getScene().remove(g);
    }
    const n = cannons.length;
    const spread = 0.38;
    cannons.forEach((g, i) => {
      const offset = n === 1 ? 0 : (i - (n - 1) / 2) * spread;
      const a = aimAngle + offset;
      g.position.set(Math.cos(a) * RIM, Math.sin(a) * RIM, 0.04);
      g.rotation.set(0, 0, a);
      g.visible = phase === "play" || phase === "enter";
    });
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
    const muzzle = cannons[0].position.clone().add(new THREE.Vector3(Math.cos(aimAngle), Math.sin(aimAngle), 0).multiplyScalar(0.38));
    muzzle.z = 0.06;
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

  function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 7.2 + Math.random() * 2.4;
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      new THREE.MeshStandardMaterial({
        color: 0xff4d6d,
        emissive: 0x5a1020,
        emissiveIntensity: 0.7,
        metalness: 0.2,
        roughness: 0.4,
      }),
    );
    mesh.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist, (Math.random() - 0.5) * 0.15);
    hooks.getScene().add(mesh);
    enemies.push({ mesh, speed: 0.85 + state.wave * 0.11, hp: 1.6 + state.wave * 0.45 });
  }

  function fireOne(angle: number, homing: boolean, speed: number, damage: number, color: number) {
    const origin = new THREE.Vector3(Math.cos(angle) * (RIM + 0.28), Math.sin(angle) * (RIM + 0.28), 0.05);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(homing ? 0.055 : 0.04, 6, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
    mesh.position.copy(origin);
    hooks.getScene().add(mesh);
    projectiles.push({
      mesh,
      vel: new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(speed),
      life: 2.4,
      homing,
      damage,
    });
  }

  function fireAll() {
    const w = state.weaponType;
    const lv = Math.max(1, state.levels[w]);
    const dmg = (w === "mg" ? 0.5 : w === "homing" ? 1.35 : w === "multi" ? 0.85 : 1.2) * (0.75 + 0.28 * lv);
    const speed = w === "mg" ? 7.2 : w === "homing" ? 4.4 : 6.2;
    const color = w === "homing" ? 0xffc14d : w === "mg" ? 0xb8fff4 : 0x7dfff0;
    const fan = w === "multi" ? 2 + Math.min(2, lv - 1) : 1;
    const fanSpread = 0.16;
    const n = cannons.length;
    const turretSpread = 0.38;
    for (let i = 0; i < n; i += 1) {
      const offset = n === 1 ? 0 : (i - (n - 1) / 2) * turretSpread;
      for (let s = 0; s < fan; s += 1) {
        const extra = fan === 1 ? 0 : (s - (fan - 1) / 2) * fanSpread;
        fireOne(aimAngle + offset + extra, w === "homing", speed, dmg, color);
      }
    }
  }

  function clearActors() {
    for (const e of enemies) hooks.getScene().remove(e.mesh);
    for (const p of projectiles) hooks.getScene().remove(p.mesh);
    for (const p of particles) hooks.getScene().remove(p.mesh);
    enemies.length = 0;
    projectiles.length = 0;
    particles.length = 0;
    for (const g of cannons) hooks.getScene().remove(g);
    cannons.length = 0;
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
      if (phase === "enter") camTo.copy(new THREE.Vector3(0, 0, frameDistance(cam)));
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
          hooks.onExit();
        }
      }
      return;
    }

    cam.position.set(0, 0, frameDistance(cam));
    cam.up.set(0, 1, 0);
    controls.target.set(0, 0, 0);
    cam.lookAt(0, 0, 0);

    hooks.getEarth().rotation.y += dt * 0.12;
    placeMoon(performance.now() * 0.00035, dt);
    updateMoonRing();
    syncCannons();
    updateAimGfx();

    if (state.over) return;

    spawnTimer += dt;
    waveTimer += dt;
    if (waveTimer > 22) {
      waveTimer = 0;
      state.wave += 1;
    }
    const every = Math.max(0.42, 1.7 - state.wave * 0.08);
    if (spawnTimer > every) {
      spawnTimer = 0;
      spawnEnemy();
      if (state.wave > 3 && Math.random() < 0.35) spawnEnemy();
    }

    const moonPos = hooks.getMoonPivot().position;
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const e = enemies[i];
      const dir = e.mesh.position.clone().negate().normalize();
      e.mesh.position.addScaledVector(dir, e.speed * dt);
      e.mesh.rotation.z += dt * 2.2;
      if (e.mesh.position.distanceTo(moonPos) < 0.5) {
        burst(e.mesh.position, 0x9ecbff, 12);
        gain(10, 8);
        hooks.getScene().remove(e.mesh);
        enemies.splice(i, 1);
        continue;
      }
      if (e.mesh.position.length() < 1.2) {
        state.earthHP = Math.max(0, state.earthHP - (6 + state.wave));
        burst(e.mesh.position, 0xff5533, 16);
        hooks.getScene().remove(e.mesh);
        enemies.splice(i, 1);
        if (state.earthHP <= 0) {
          state.over = true;
          for (const left of enemies) hooks.getScene().remove(left.mesh);
          for (const shot of projectiles) hooks.getScene().remove(shot.mesh);
          enemies.length = 0;
          projectiles.length = 0;
          return;
        }
      }
    }

    const w = state.weaponType;
    const lv = Math.max(1, state.levels[w]);
    const interval = w === "mg" ? 0.1 / (1 + (lv - 1) * 0.12) : w === "multi" ? 0.42 : w === "homing" ? 0.5 : 0.36;
    fireCooldown -= dt;
    if (fireCooldown <= 0 && enemies.length > 0) {
      fireCooldown = interval;
      fireAll();
    }

    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const p = projectiles[i];
      if (p.homing && enemies.length) {
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
          desired.normalize().multiplyScalar(4.6);
          p.vel.lerp(desired, 1 - Math.exp(-dt * 4.5));
        }
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt;
      let spent = p.life <= 0;
      if (!spent) {
        for (let j = enemies.length - 1; j >= 0; j -= 1) {
          if (p.mesh.position.distanceTo(enemies[j].mesh.position) < 0.28) {
            enemies[j].hp -= p.damage;
            burst(p.mesh.position, 0xffd27a, 4);
            spent = true;
            if (enemies[j].hp <= 0) {
              gain(12 + state.wave, 5);
              burst(enemies[j].mesh.position, 0xff6688, 10);
              hooks.getScene().remove(enemies[j].mesh);
              enemies.splice(j, 1);
            }
            break;
          }
        }
      }
      if (spent) {
        hooks.getScene().remove(p.mesh);
        projectiles.splice(i, 1);
      }
    }

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
    if (phase !== "play") return;
    if (!readPointer(e)) return;
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    if (hit.length() < 0.45) return;
    aimAngle = Math.atan2(hit.y, hit.x);
    const dist = THREE.MathUtils.clamp(hit.length(), RIM + 0.55, 8.2);
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
    state.cannonCount = 1;
    state.weaponType = "base";
    state.levels = { base: 1, mg: 0, multi: 0, homing: 0 };
    state.over = false;
    spawnTimer = 0.4;
    fireCooldown = 0.2;
    waveTimer = 0;
    aimAngle = Math.PI / 2;
    aimPoint.set(0, 4.2, 0);
    const cam = hooks.getCamera();
    const controls = hooks.getControls();
    savedCam.copy(cam.position);
    savedTarget.copy(controls.target);
    camFrom.copy(cam.position);
    camTo.set(0, 0, frameDistance(cam as THREE.PerspectiveCamera));
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

  function exit() {
    if (phase === "idle" || phase === "exit") return;
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
    state.cannonCount = 1;
    state.weaponType = "base";
    state.levels = { base: 1, mg: 0, multi: 0, homing: 0 };
    spawnTimer = 0.6;
    waveTimer = 0;
    arcProgress = -1;
    syncCannons();
  }

  function buyUpgrade(type: string) {
    if (phase !== "play" || state.over) return false;
    if (type === "cannon") {
      const cost = slotCost("cannon");
      if (!cost || state.exp < cost) return false;
      state.exp -= cost;
      state.cannonCount += 1;
      syncCannons();
      return true;
    }
    if (!type.startsWith("weapon-")) return false;
    const id = type.slice(7) as WeaponId;
    if (!UNLOCK[id] && id !== "base") return false;
    if (!(id in state.levels)) return false;
    const lv = state.levels[id];
    if (lv <= 0) {
      const cost = UNLOCK[id];
      if (state.exp < cost) return false;
      state.exp -= cost;
      state.levels[id] = 1;
      state.weaponType = id;
      return true;
    }
    if (state.weaponType !== id) {
      state.weaponType = id;
      return true;
    }
    if (lv >= 5) return false;
    const cost = 55 * lv;
    if (state.exp < cost) return false;
    state.exp -= cost;
    state.levels[id] = lv + 1;
    return true;
  }

  return {
    state,
    enter,
    exit,
    update,
    onPointer,
    onPointerUp,
    lunarShockwave,
    buyUpgrade,
    retry,
    holdsCamera,
    snapshot,
  };
}
