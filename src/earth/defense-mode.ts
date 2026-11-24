import * as THREE from "three";

export type DefenseHooks = {
  getEarth: () => THREE.Object3D;
  getMoon: () => THREE.Object3D;
  getCamera: () => THREE.Camera;
  getScene: () => THREE.Scene;
  getControls: () => { enabled: boolean; target: THREE.Vector3 };
  onExit: () => void;
};

export type DefenseState = {
  active: boolean;
  wave: number;
  earthHP: number;
  exp: number;
  lunarEnergy: number;
  highscore: number;
  cannonCount: number;
  weaponType: "base" | "mg" | "multi" | "homing";
  fireRateMult: number;
  damageMult: number;
};

export function createDefenseMode(hooks: DefenseHooks) {
  const state: DefenseState = {
    active: false,
    wave: 1,
    earthHP: 100,
    exp: 0,
    lunarEnergy: 0,
    highscore: parseInt(localStorage.getItem("earthtrip-hs") || "0"),
    cannonCount: 1,
    weaponType: "base",
    fireRateMult: 1,
    damageMult: 1,
  };

  let cannons: THREE.Group[] = [];
  let enemies: { mesh: THREE.Mesh; dir: THREE.Vector3; speed: number; hp: number }[] = [];
  let projectiles: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; homing: boolean; damage: number }[] = [];
  let particles: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  let spawnTimer = 0;
  let fireCooldown = 0;
  const aimPoint = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function placeCannons() {
    const earth = hooks.getEarth();
    cannons.forEach((c) => earth.remove(c));
    cannons = [];
    for (let i = 0; i < state.cannonCount; i++) {
      const a = (i / Math.max(1, state.cannonCount)) * Math.PI * 2;
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 0.3, 8),
        new THREE.MeshStandardMaterial({ color: 0x666688, metalness: 0.6 }),
      );
      body.rotation.x = Math.PI / 2;
      g.add(body);
      g.position.set(Math.cos(a) * 1.7, 0.2, Math.sin(a) * 1.7);
      earth.add(g);
      cannons.push(g);
    }
  }

  function spawnEnemy() {
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const start = dir.clone().multiplyScalar(18 + Math.random() * 6);
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.4, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3366 }),
    );
    mesh.position.copy(start);
    mesh.lookAt(0, 0, 0);
    hooks.getScene().add(mesh);
    enemies.push({ mesh, dir, speed: 0.8 + state.wave * 0.15, hp: 2 + Math.floor(state.wave / 3) });
  }

  function fireFrom(origin: THREE.Vector3, dir: THREE.Vector3, isManual = false) {
    const count = state.weaponType === "multi" ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const d = dir.clone();
      if (count > 1) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - 1) * 0.25);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 6),
        new THREE.MeshBasicMaterial({ color: state.weaponType === "homing" ? 0xffaa00 : 0x66ffff }),
      );
      mesh.position.copy(origin);
      hooks.getScene().add(mesh);
      projectiles.push({
        mesh,
        vel: d.multiplyScalar(state.weaponType === "mg" ? 0.9 : 0.55),
        life: 180,
        homing: state.weaponType === "homing",
        damage: (state.weaponType === "mg" ? 0.7 : 1.2) * state.damageMult,
      });
    }
  }

  function spawnExplosion(pos: THREE.Vector3, color = 0xffaa44, count = 12) {
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), new THREE.MeshBasicMaterial({ color }));
      p.position.copy(pos);
      hooks.getScene().add(p);
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(0.15 + Math.random() * 0.1);
      particles.push({ mesh: p, vel, life: 40 + Math.random() * 20 });
    }
  }

  function lunarShockwave() {
    const ring = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0.7, side: THREE.BackSide }),
    );
    hooks.getScene().add(ring);
    let s = 1;
    const expand = () => {
      s += 0.35;
      ring.scale.setScalar(s);
      ring.material.opacity = Math.max(0, 0.7 - s * 0.04);
      if (s < 18) requestAnimationFrame(expand);
      else hooks.getScene().remove(ring);
    };
    expand();
    enemies.forEach((e) => {
      spawnExplosion(e.mesh.position, 0x88ccff, 8);
      hooks.getScene().remove(e.mesh);
    });
    enemies = [];
    state.lunarEnergy = 0;
  }

  function update(dt: number) {
    if (!state.active) return;
    const earth = hooks.getEarth();
    const moon = hooks.getMoon();

    spawnTimer += dt;
    if (spawnTimer > Math.max(0.4, 2.2 - state.wave * 0.12)) {
      spawnTimer = 0;
      spawnEnemy();
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.mesh.position.addScaledVector(e.dir, -e.speed * dt * 0.6);
      e.mesh.lookAt(0, 0, 0);
      if (e.mesh.position.length() < 1.65) {
        state.earthHP -= 8 + state.wave;
        spawnExplosion(e.mesh.position, 0xff4422, 20);
        hooks.getScene().remove(e.mesh);
        enemies.splice(i, 1);
        if (state.earthHP <= 0) {
          state.earthHP = 0;
          exit();
        }
      }
    }

    // Manual main cannon (index 0) aims at pointer; others auto nearest
    cannons.forEach((c, idx) => {
      const worldPos = new THREE.Vector3();
      c.getWorldPosition(worldPos);
      if (idx === 0) {
        const look = aimPoint.clone().sub(worldPos);
        if (look.length() > 0.1) c.lookAt(worldPos.clone().add(look));
      } else if (enemies.length) {
        const nearest = enemies.reduce((a, b) =>
          a.mesh.position.distanceTo(worldPos) < b.mesh.position.distanceTo(worldPos) ? a : b,
        );
        c.lookAt(nearest.mesh.position);
      }
    });

    fireCooldown -= dt * state.fireRateMult * (state.weaponType === "mg" ? 4 : 1.6);
    if (fireCooldown <= 0 && enemies.length > 0) {
      fireCooldown = 1;
      // Manual cannon fires toward aim if user is pointing, else nearest
      const main = cannons[0];
      if (main) {
        const pos = new THREE.Vector3();
        main.getWorldPosition(pos);
        const dir = aimPoint.clone().sub(pos).normalize();
        if (dir.length() > 0.1) fireFrom(pos, dir, true);
      }
      // Auto cannons
      for (let i = 1; i < cannons.length; i++) {
        const c = cannons[i];
        const pos = new THREE.Vector3();
        c.getWorldPosition(pos);
        const nearest = enemies.reduce((a, b) =>
          a.mesh.position.distanceTo(pos) < b.mesh.position.distanceTo(pos) ? a : b,
        );
        const dir = nearest.mesh.position.clone().sub(pos).normalize();
        fireFrom(pos, dir);
      }
    }

    // Projectiles collision etc. (simplified for brevity; full logic mirrors previous)
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (p.homing && enemies.length) {
        const target = enemies.reduce((a, b) =>
          a.mesh.position.distanceTo(p.mesh.position) < b.mesh.position.distanceTo(p.mesh.position) ? a : b,
        );
        const desired = target.mesh.position.clone().sub(p.mesh.position).normalize();
        p.vel.lerp(desired.multiplyScalar(0.6), 0.08);
      }
      p.mesh.position.add(p.vel);
      p.life--;
      if (p.life <= 0) {
        hooks.getScene().remove(p.mesh);
        projectiles.splice(i, 1);
        continue;
      }
      for (let j = enemies.length - 1; j >= 0; j--) {
        if (p.mesh.position.distanceTo(enemies[j].mesh.position) < 0.35) {
          enemies[j].hp -= p.damage;
          spawnExplosion(p.mesh.position, 0xffcc66, 6);
          hooks.getScene().remove(p.mesh);
          projectiles.splice(i, 1);
          if (enemies[j].hp <= 0) {
            state.exp += 10 + state.wave;
            state.lunarEnergy = Math.min(100, state.lunarEnergy + 4 + state.wave * 0.5);
            spawnExplosion(enemies[j].mesh.position, 0xff6688, 16);
            hooks.getScene().remove(enemies[j].mesh);
            enemies.splice(j, 1);
          }
          break;
        }
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.mesh.position.add(p.vel);
      p.vel.multiplyScalar(0.96);
      p.life--;
      if (p.life <= 0) {
        hooks.getScene().remove(p.mesh);
        particles.splice(i, 1);
      }
    }

    if (enemies.length === 0 && spawnTimer > 1.5) state.wave++;
  }

  function enter() {
    state.active = true;
    state.earthHP = 100;
    state.exp = 0;
    state.lunarEnergy = 0;
    state.wave = 1;
    state.cannonCount = 1;
    state.weaponType = "base";
    placeCannons();
    hooks.getControls().enabled = true;
  }

  function exit() {
    state.active = false;
    enemies.forEach((e) => hooks.getScene().remove(e.mesh));
    projectiles.forEach((p) => hooks.getScene().remove(p.mesh));
    particles.forEach((p) => hooks.getScene().remove(p.mesh));
    cannons.forEach((c) => hooks.getEarth().remove(c));
    enemies = [];
    projectiles = [];
    particles = [];
    cannons = [];
    if (state.exp > state.highscore) {
      state.highscore = state.exp;
      localStorage.setItem("earthtrip-hs", String(state.highscore));
    }
    hooks.onExit();
  }

  function onPointer(e: PointerEvent | TouchEvent) {
    if (!state.active) return;
    const canvas = (e.target as HTMLElement).closest("canvas") || document.querySelector("canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY : e.clientY;
    if (clientX == null || clientY == null) return;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, hooks.getCamera());
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    raycaster.ray.intersectPlane(plane, aimPoint);
  }

  return {
    state,
    enter,
    exit,
    update,
    onPointer,
    lunarShockwave,
    buyUpgrade(type: string) {
      const costs: Record<string, number> = {
        cannon: 150,
        rate: 100,
        damage: 120,
        "weapon-mg": 200,
        "weapon-multi": 250,
        "weapon-homing": 300,
      };
      if (state.exp < (costs[type] || 9999)) return false;
      state.exp -= costs[type];
      if (type === "cannon") {
        state.cannonCount = Math.min(8, state.cannonCount + 1);
        placeCannons();
      }
      if (type === "rate") state.fireRateMult *= 1.25;
      if (type === "damage") state.damageMult *= 1.2;
      if (type.startsWith("weapon-")) state.weaponType = type.replace("weapon-", "") as any;
      return true;
    },
  };
}
