import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Audio ────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let muted = false;

function initAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
function tone(freq, dur = 0.12, type = 'square', vol = 0.08) {
  if (muted || !audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + dur);
}
function explodeSound() { tone(80, 0.25, 'sawtooth', 0.12); tone(40, 0.4, 'triangle', 0.06); }
function laserSound() { tone(880, 0.06, 'square', 0.05); }
function lunarChargeSound() { tone(220, 0.3, 'sine', 0.07); }
function levelUpSound() { tone(523, 0.1); setTimeout(() => tone(659, 0.1), 80); setTimeout(() => tone(784, 0.15), 160); }

// ─── Scene ────────────────────────────────────────────
const canvas = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000510);
scene.fog = new THREE.FogExp2(0x000510, 0.012);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 4, 12);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 2.2;
controls.maxDistance = 40;

// Lights
const ambient = new THREE.AmbientLight(0x112244, 0.4);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(20, 8, 10);
scene.add(sun);

// Stars
const starsGeo = new THREE.BufferGeometry();
const starCount = 1800;
const positions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const r = 40 + Math.random() * 60;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  positions[i * 3 + 2] = r * Math.cos(phi);
}
starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xaaaaff, size: 0.08 })));

// Earth
const earthGroup = new THREE.Group();
scene.add(earthGroup);
const earthGeo = new THREE.SphereGeometry(1.5, 64, 64);
const earthMat = new THREE.MeshStandardMaterial({
  color: 0x1a4a8a,
  roughness: 0.8,
  metalness: 0.1,
  emissive: 0x001122,
  emissiveIntensity: 0.15
});
const earth = new THREE.Mesh(earthGeo, earthMat);
earthGroup.add(earth);

// Atmosphere glow
const atmGeo = new THREE.SphereGeometry(1.62, 64, 64);
const atmMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.18, side: THREE.BackSide });
earthGroup.add(new THREE.Mesh(atmGeo, atmMat));

// Moon
const moon = new THREE.Mesh(
  new THREE.SphereGeometry(0.4, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.9 })
);
moon.position.set(6, 0, 0);
scene.add(moon);
let moonAngle = 0;

// ─── Game State ────────────────────────────────────────
let gameMode = false;
let wave = 1;
let earthHP = 100;
let exp = 0;
let lunarEnergy = 0;
let highscore = parseInt(localStorage.getItem('earthtrip-hs') || '0');
let cannons = [];
let enemies = [];
let projectiles = [];
let particles = [];
let spawnTimer = 0;
let fireCooldown = 0;
let weaponType = 'base';
let fireRateMult = 1;
let damageMult = 1;
let cannonCount = 1;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let aimPoint = new THREE.Vector3();

// DOM
const gameToggle = document.getElementById('game-toggle');
const gameHud = document.getElementById('game-hud');
const waveEl = document.getElementById('wave');
const hpEl = document.getElementById('earth-hp');
const expEl = document.getElementById('exp');
const hsEl = document.getElementById('highscore');
const lunarFill = document.getElementById('lunar-fill');
const lunarPulse = document.getElementById('lunar-pulse');
const upgradeShop = document.getElementById('upgrade-shop');
const muteBtn = document.getElementById('mute-btn');
const timeDisplay = document.getElementById('time-display');

hsEl.textContent = highscore;

function updateHUD() {
  waveEl.textContent = wave;
  hpEl.textContent = Math.max(0, Math.round(earthHP));
  expEl.textContent = exp;
  lunarFill.style.width = lunarEnergy + '%';
  lunarPulse.classList.toggle('hidden', lunarEnergy < 100);
  upgradeShop.classList.toggle('hidden', !gameMode);
}

// ─── Cannons ───────────────────────────────────────────
function createCannon(angle) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x666688, metalness: 0.6 })
  );
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const pos = new THREE.Vector3(Math.cos(angle) * 1.7, 0.2, Math.sin(angle) * 1.7);
  group.position.copy(pos);
  earthGroup.add(group);
  return group;
}

function placeCannons() {
  cannons.forEach(c => earthGroup.remove(c));
  cannons = [];
  for (let i = 0; i < cannonCount; i++) {
    const a = (i / cannonCount) * Math.PI * 2;
    cannons.push(createCannon(a));
  }
}

// ─── Enemies & Projectiles ──────────────────────────────
function spawnEnemy() {
  const dir = new THREE.Vector3(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5
  ).normalize();
  const start = dir.clone().multiplyScalar(18 + Math.random() * 6);
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.4, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3366 })
  );
  mesh.position.copy(start);
  mesh.lookAt(0, 0, 0);
  scene.add(mesh);
  const speed = 0.8 + wave * 0.15;
  enemies.push({ mesh, dir, speed, hp: 2 + Math.floor(wave / 3) });
}

function fireProjectile(origin, targetDir) {
  laserSound();
  const count = weaponType === 'multi' ? 3 : 1;
  for (let i = 0; i < count; i++) {
    const dir = targetDir.clone();
    if (count > 1) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - 1) * 0.25);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color: weaponType === 'homing' ? 0xffaa00 : 0x66ffff })
    );
    mesh.position.copy(origin);
    scene.add(mesh);
    projectiles.push({
      mesh,
      vel: dir.multiplyScalar(weaponType === 'mg' ? 0.9 : 0.55),
      life: 180,
      homing: weaponType === 'homing',
      damage: (weaponType === 'mg' ? 0.7 : 1.2) * damageMult
    });
  }
}

function spawnExplosion(pos, color = 0xffaa44, count = 12) {
  explodeSound();
  for (let i = 0; i < count; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 4, 4),
      new THREE.MeshBasicMaterial({ color })
    );
    p.position.copy(pos);
    scene.add(p);
    const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.15 + Math.random() * 0.1);
    particles.push({ mesh: p, vel, life: 40 + Math.random() * 20 });
  }
}

function lunarShockwave() {
  lunarChargeSound();
  levelUpSound();
  const ring = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0.7, side: THREE.BackSide })
  );
  scene.add(ring);
  let s = 1;
  const expand = () => {
    s += 0.35;
    ring.scale.setScalar(s);
    ring.material.opacity = Math.max(0, 0.7 - s * 0.04);
    if (s < 18) requestAnimationFrame(expand);
    else scene.remove(ring);
  };
  expand();
  enemies.forEach(e => {
    spawnExplosion(e.mesh.position, 0x88ccff, 8);
    scene.remove(e.mesh);
  });
  enemies = [];
  lunarEnergy = 0;
  const orig = camera.position.clone();
  let t = 0;
  const shake = () => {
    t++;
    camera.position.copy(orig).add(new THREE.Vector3((Math.random()-0.5)*0.15, (Math.random()-0.5)*0.15, 0));
    if (t < 12) requestAnimationFrame(shake);
    else camera.position.copy(orig);
  };
  shake();
}

// ─── Game Mode ────────────────────────────────────────
function enterGame() {
  gameMode = true;
  gameToggle.textContent = 'Esci dal Gioco';
  gameHud.classList.remove('hidden');
  controls.enabled = true;
  controls.target.set(0, 0, 0);
  camera.position.set(3, 5, 9);
  earthHP = 100;
  exp = 0;
  lunarEnergy = 0;
  wave = 1;
  cannonCount = 1;
  weaponType = 'base';
  fireRateMult = 1;
  damageMult = 1;
  placeCannons();
  updateHUD();
  initAudio();
}
function exitGame() {
  gameMode = false;
  gameToggle.textContent = '🎮 Difendi la Terra';
  gameHud.classList.add('hidden');
  lunarPulse.classList.add('hidden');
  enemies.forEach(e => scene.remove(e.mesh));
  projectiles.forEach(p => scene.remove(p.mesh));
  particles.forEach(p => scene.remove(p.mesh));
  cannons.forEach(c => earthGroup.remove(c));
  enemies = []; projectiles = []; particles = []; cannons = [];
  if (exp > highscore) {
    highscore = exp;
    localStorage.setItem('earthtrip-hs', highscore);
    hsEl.textContent = highscore;
  }
}

gameToggle.onclick = () => gameMode ? exitGame() : enterGame();
muteBtn.onclick = () => { muted = !muted; muteBtn.textContent = muted ? '🔇' : '🔊'; initAudio(); };
lunarPulse.onclick = () => { if (lunarEnergy >= 100) lunarShockwave(); };
document.addEventListener('keydown', e => { if (e.code === 'Space' && gameMode && lunarEnergy >= 100) lunarShockwave(); });

upgradeShop.querySelectorAll('button').forEach(btn => {
  btn.onclick = () => {
    const type = btn.dataset.upgrade;
    const costs = { cannon: 150, rate: 100, damage: 120, 'weapon-mg': 200, 'weapon-multi': 250, 'weapon-homing': 300 };
    if (exp < costs[type]) return;
    exp -= costs[type];
    if (type === 'cannon') { cannonCount = Math.min(8, cannonCount + 1); placeCannons(); }
    if (type === 'rate') fireRateMult *= 1.25;
    if (type === 'damage') damageMult *= 1.2;
    if (type === 'weapon-mg') weaponType = 'mg';
    if (type === 'weapon-multi') weaponType = 'multi';
    if (type === 'weapon-homing') weaponType = 'homing';
    levelUpSound();
    updateHUD();
  };
});

// Pointer aiming
function onPointerMove(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX || e.touches?.[0]?.clientX) - rect.left) / rect.width * 2 - 1;
  pointer.y = -((e.clientY || e.touches?.[0]?.clientY) - rect.top) / rect.height * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  raycaster.ray.intersectPlane(plane, aimPoint);
}
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('touchmove', onPointerMove, { passive: true });

// ─── Loop ─────────────────────────────────────────────
let last = 0;
function animate(t) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;

  if (!gameMode) {
    moonAngle += dt * 0.15;
    moon.position.set(Math.cos(moonAngle) * 6, Math.sin(moonAngle * 0.3) * 0.4, Math.sin(moonAngle) * 6);
    const utc = new Date();
    timeDisplay.textContent = 'UTC ' + utc.toISOString().slice(11, 19);
    const h = utc.getUTCHours() + utc.getUTCMinutes() / 60;
    sun.position.set(Math.cos((h / 24) * Math.PI * 2) * 20, 8, Math.sin((h / 24) * Math.PI * 2) * 20);
  }

  if (gameMode) {
    moonAngle += dt * 0.12;
    moon.position.set(Math.cos(moonAngle) * 6, 0.3, Math.sin(moonAngle) * 6);
    moon.material.emissive = new THREE.Color(0x4466aa).multiplyScalar(lunarEnergy / 100);
    moon.material.emissiveIntensity = lunarEnergy / 80;

    spawnTimer += dt;
    const interval = Math.max(0.4, 2.2 - wave * 0.12);
    if (spawnTimer > interval) { spawnTimer = 0; spawnEnemy(); }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.mesh.position.addScaledVector(e.dir, -e.speed * dt * 0.6);
      e.mesh.lookAt(0, 0, 0);
      if (e.mesh.position.length() < 1.65) {
        earthHP -= 8 + wave;
        spawnExplosion(e.mesh.position, 0xff4422, 20);
        scene.remove(e.mesh);
        enemies.splice(i, 1);
        if (earthHP <= 0) { earthHP = 0; exitGame(); }
      }
    }

    const aimDir = aimPoint.clone().sub(new THREE.Vector3(0, 0, 0)).normalize();
    cannons.forEach(c => {
      const worldPos = new THREE.Vector3();
      c.getWorldPosition(worldPos);
      const look = aimPoint.clone().sub(worldPos);
      c.lookAt(worldPos.clone().add(look));
    });

    fireCooldown -= dt * fireRateMult * (weaponType === 'mg' ? 4 : 1.6);
    if (fireCooldown <= 0 && enemies.length > 0) {
      fireCooldown = 1;
      const nearest = enemies.reduce((a, b) => a.mesh.position.length() < b.mesh.position.length() ? a : b);
      cannons.forEach(c => {
        const pos = new THREE.Vector3();
        c.getWorldPosition(pos);
        const dir = nearest.mesh.position.clone().sub(pos).normalize();
        fireProjectile(pos, dir);
      });
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (p.homing && enemies.length) {
        const target = enemies.reduce((a, b) => a.mesh.position.distanceTo(p.mesh.position) < b.mesh.position.distanceTo(p.mesh.position) ? a : b);
        const desired = target.mesh.position.clone().sub(p.mesh.position).normalize();
        p.vel.lerp(desired.multiplyScalar(0.6), 0.08);
      }
      p.mesh.position.add(p.vel);
      p.life--;
      if (p.life <= 0) { scene.remove(p.mesh); projectiles.splice(i, 1); continue; }
      for (let j = enemies.length - 1; j >= 0; j--) {
        if (p.mesh.position.distanceTo(enemies[j].mesh.position) < 0.35) {
          enemies[j].hp -= p.damage;
          spawnExplosion(p.mesh.position, 0xffcc66, 6);
          scene.remove(p.mesh);
          projectiles.splice(i, 1);
          if (enemies[j].hp <= 0) {
            exp += 10 + wave;
            lunarEnergy = Math.min(100, lunarEnergy + 4 + wave * 0.5);
            spawnExplosion(enemies[j].mesh.position, 0xff6688, 16);
            scene.remove(enemies[j].mesh);
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
      p.mesh.material.opacity = p.life / 40;
      if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
    }

    if (enemies.length === 0 && spawnTimer > 1.5) {
      wave++;
      updateHUD();
    }
    updateHUD();
  }

  controls.update();
  renderer.render(scene, camera);
}
animate(0);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
