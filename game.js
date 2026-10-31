import * as THREE from 'three';
import { Net, MAX_PLAYERS } from './net.js';
import { TRACKS, buildTrack, N } from './tracks.js';
import * as sfx from './audio.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Blocca zoom, copia/incolla, menu contestuale ----------
for (const ev of ['gesturestart', 'gesturechange', 'contextmenu', 'selectstart', 'dblclick', 'copy', 'cut', 'paste'])
  document.addEventListener(ev, e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }, { passive: false });
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

// ---------- Impostazioni salvate ----------
const COLORS = ['#e8364f', '#2f80ed', '#27ae60', '#ffd23f', '#9b51e0', '#f2994a'];
// ---------- Personaggi (originali) ----------
// acc: accelerazione · top: velocità massima · weight: quanto spingono (e quanto si fanno spingere) negli urti
const CHARS = [
  { id: 'pip', name: 'Pip', icon: '🐤', cls: 'Leggero', acc: 1.22, top: 0.95, weight: 0.7, helmet: '#ffd23f', extra: 'beak' },
  { id: 'lulu', name: 'Lulù', icon: '🐰', cls: 'Leggero', acc: 1.18, top: 0.96, weight: 0.75, helmet: '#ffffff', extra: 'ears' },
  { id: 'rocco', name: 'Rocco', icon: '🦊', cls: 'Medio', acc: 1, top: 1, weight: 1, helmet: '#f2994a', extra: 'pointy' },
  { id: 'mira', name: 'Mira', icon: '🐱', cls: 'Medio', acc: 1.03, top: 0.99, weight: 0.95, helmet: '#9b9bb0', extra: 'cat' },
  { id: 'bruna', name: 'Bruna', icon: '🐻', cls: 'Pesante', acc: 0.85, top: 1.05, weight: 1.4, helmet: '#8d6e63', extra: 'round' },
  { id: 'gorgo', name: 'Gorgo', icon: '🦏', cls: 'Pesante', acc: 0.82, top: 1.06, weight: 1.5, helmet: '#7f8c8d', extra: 'horn' },
];
const charOf = id => CHARS.find(c => c.id === id) || CHARS[2];

let settings = { char: 'rocco', name: 'Pilota', color: COLORS[0], invert: false, sens: 6, view: 0, track: 'prato', laps: 3, muted: false, bots: 5, level: 'medio' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('tt-settings') || '{}')); } catch {}
const saveSettings = () => { try { localStorage.setItem('tt-settings', JSON.stringify(settings)); } catch {} };

// ---------- Renderer e scena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fd3ff');
scene.fog = new THREE.Fog('#8fd3ff', 120, 320);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 600);

const hemi = new THREE.HemisphereLight('#ffffff', '#4a7d3a', 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffffff', 1.6);
sun.position.set(60, 100, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 250 });
scene.add(sun, sun.target);

// Su telefono la barra del browser, la rotazione e lo schermo intero cambiano l'altezza
// anche dopo l'avvio: ricalcolo a ogni cambio e di nuovo poco dopo, quando lo schermo si è assestato
// Vetrina 3D per la scelta del pilota: scena a parte con il kart su una pedana che gira
const previewScene = new THREE.Scene();
previewScene.background = new THREE.Color('#241a5c');
previewScene.add(new THREE.HemisphereLight('#ffffff', '#3a2d75', 1.2));
const previewLight = new THREE.DirectionalLight('#ffffff', 1.4); previewLight.position.set(4, 8, 6); previewScene.add(previewLight);
const previewCam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
previewCam.position.set(0, 2.6, 8.5); previewCam.lookAt(0, 0.7, 0);
const turntable = new THREE.Group(); previewScene.add(turntable);
for (const [r1, r2, h, y, c] of [[2.6, 2.8, 0.3, -0.15, '#ffd23f'], [2.3, 2.3, 0.32, -0.13, '#e8364f']]) {
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 40), new THREE.MeshLambertMaterial({ color: c }));
  disc.position.y = y;
  turntable.add(disc);
}
let previewKart = null;

function resize() {
  const vv = window.visualViewport;
  const w = Math.round(vv?.width || innerWidth), h = Math.round(vv?.height || innerHeight);
  if (!w || !h) return;   // pagina non ancora visibile: aspetto il prossimo cambio
  document.documentElement.style.setProperty('--app-h', `${h}px`);
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  previewCam.aspect = w / h; previewCam.updateProjectionMatrix();
  window.scrollTo(0, 0);
}
function resizeSoon() { resize(); for (const ms of [100, 350, 800]) setTimeout(resize, ms); }
addEventListener('resize', resizeSoon);
addEventListener('orientationchange', resizeSoon);
addEventListener('pageshow', resizeSoon);
document.addEventListener('fullscreenchange', resizeSoon);
document.addEventListener('visibilitychange', () => { if (!document.hidden) resizeSoon(); });
window.visualViewport?.addEventListener('resize', resizeSoon);
screen.orientation?.addEventListener?.('change', resizeSoon);
resizeSoon();

// ---------- Pista ----------
let track, curve, samples, tangents, normals;
let laps = 3;

function loadTrack(id) {
  if (track?.def.id === id) return;
  if (track) {
    scene.remove(track.group);
    track.group.traverse(o => { o.geometry?.dispose(); });
  }
  track = buildTrack(TRACKS.find(t => t.id === id) || TRACKS[0]);
  ({ curve, samples, tangents, normals } = track);
  scene.add(track.group);
  const d = track.def;
  scene.background.set(d.sky);
  scene.fog.color.set(d.sky);
  [scene.fog.near, scene.fog.far] = d.fog;
  hemi.color.set(d.hemi[0]); hemi.groundColor.set(d.hemi[1]); hemi.intensity = d.hemi[2];
  sun.color.set(d.sun[0]); sun.intensity = d.sun[1];
  setupPickups();
}

// Punto della linea centrale più vicino (cerca attorno all'ultimo indice noto)
function nearest(p, from = -1, win = 40) {
  let best = -1, bd = Infinity;
  const start = from < 0 ? 0 : from - win, end = from < 0 ? N : from + win;
  for (let j = start; j < end; j++) {
    const k = (j + N) % N, s = samples[k];
    const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return { idx: best, dist: Math.sqrt(bd) };
}

// Altezza della strada sotto un punto: interpola tra il campione più vicino e quello accanto
function groundY(p, i) {
  const s = samples[i], t = tangents[i];
  const tl = Math.hypot(t.x, t.z) || 1;
  const along = ((p.x - s.x) * t.x + (p.z - s.z) * t.z) / tl;
  const j = along >= 0 ? (i + 1) % N : (i - 1 + N) % N;
  const seg = Math.hypot(samples[j].x - s.x, samples[j].z - s.z) || 1;
  return s.y + (samples[j].y - s.y) * Math.min(1, Math.abs(along) / seg);
}
// Altezza aggiuntiva del trampolino (0 fuori dalla rampa)
function rampAt(idx, dist) {
  if (track.jumpIdx < 0 || dist >= track.hw[idx]) return 0;
  const k = (idx - (track.jumpIdx - 6) + N) % N;
  return k <= 6 ? (k / 6) * 1.6 : 0;
}
// Inclinazione del kart in salita e in discesa
const slopePitch = i => -Math.asin(clamp(tangents[i].y, -0.5, 0.5));

// ---------- Kart ----------
function makeKart(color, charId) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.rotation.order = 'YXZ';   // prima la direzione, poi l'inclinazione in salita/discesa
  const paint = new THREE.MeshLambertMaterial({ color }), dark = new THREE.MeshLambertMaterial({ color: '#222' });
  const add = (geo, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  add(new THREE.BoxGeometry(1.6, 0.35, 2.6), paint, 0, 0.45, 0);              // telaio
  add(new THREE.BoxGeometry(1.2, 0.3, 0.9), paint, 0, 0.55, 1.35);             // muso
  add(new THREE.BoxGeometry(1.9, 0.15, 0.35), dark, 0, 0.6, 1.8);              // paraurti
  add(new THREE.BoxGeometry(1.7, 0.12, 0.4), paint, 0, 1.15, -1.2);            // alettone
  add(new THREE.BoxGeometry(0.1, 0.5, 0.3), dark, 0.6, 0.85, -1.2);
  add(new THREE.BoxGeometry(0.1, 0.5, 0.3), dark, -0.6, 0.85, -1.2);
  add(new THREE.BoxGeometry(0.9, 0.5, 0.7), dark, 0, 0.85, -0.5);              // sedile
  const helmet = add(new THREE.SphereGeometry(0.45, 12, 10), null, 0, 1.55, -0.3); // casco
  add(new THREE.BoxGeometry(0.6, 0.18, 0.1), new THREE.MeshLambertMaterial({ color: '#1b1446' }), 0, 1.58, 0.1); // visiera
  add(new THREE.BoxGeometry(0.7, 0.6, 0.5), paint, 0, 1.05, -0.25);            // busto
  add(new THREE.TorusGeometry(0.25, 0.05, 6, 12), dark, 0, 1.1, 0.45).rotation.x = -0.6; // volante
  g.add(body);
  const wheelG = new THREE.CylinderGeometry(0.42, 0.42, 0.4, 12); wheelG.rotateZ(Math.PI / 2);
  g.wheels = [];
  for (const [x, z] of [[0.95, 1.0], [-0.95, 1.0], [1.0, -0.95], [-1.0, -0.95]]) {
    const w = add(wheelG, dark, x, 0.42, z, g);
    g.wheels.push(w);
  }
  // Scintille del drift dietro le ruote posteriori
  g.sparks = [1, -1].map(s => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    m.position.set(s * 1.0, 0.2, -1.5); m.visible = false;
    g.add(m);
    return m;
  });
  // Casco del personaggio con orecchie, becco o corno
  const ch = charOf(charId), helmetM = new THREE.MeshLambertMaterial({ color: ch.helmet });
  helmet.material = helmetM;
  const hx = 0, hy = 1.55, hz = -0.3;
  if (ch.extra === 'ears') for (const s of [1, -1]) add(new THREE.CapsuleGeometry(0.1, 0.6, 4, 8), helmetM, s * 0.18, hy + 0.65, hz).rotation.z = -s * 0.15;
  if (ch.extra === 'pointy' || ch.extra === 'cat') for (const s of [1, -1]) add(new THREE.ConeGeometry(0.16, ch.extra === 'cat' ? 0.3 : 0.4, 4), helmetM, s * 0.26, hy + 0.45, hz);
  if (ch.extra === 'round') for (const s of [1, -1]) add(new THREE.SphereGeometry(0.14, 8, 6), helmetM, s * 0.32, hy + 0.35, hz);
  if (ch.extra === 'beak') add(new THREE.ConeGeometry(0.12, 0.3, 6), new THREE.MeshLambertMaterial({ color: '#f2994a' }), hx, hy - 0.08, hz + 0.5).rotation.x = Math.PI / 2;
  if (ch.extra === 'horn') add(new THREE.ConeGeometry(0.1, 0.45, 6), new THREE.MeshLambertMaterial({ color: '#f5f0e1' }), hx, hy + 0.15, hz + 0.45).rotation.x = 0.9;
  g.scale.setScalar(ch.weight > 1.2 ? 1.08 : ch.weight < 0.8 ? 0.94 : 1);
  // Bolla dello scudo
  g.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 12), new THREE.MeshBasicMaterial({ color: '#7fd6ff', transparent: true, opacity: 0.25, depthWrite: false }));
  g.shieldMesh.position.y = 0.9; g.shieldMesh.visible = false;
  g.add(g.shieldMesh);
  g.body = body;
  return g;
}

// ---------- Input ----------
const input = { gas: false, brake: false, steer: 0, tiltRaw: 0, tiltCenter: 0, hasTilt: false };
const keys = {};
addEventListener('keydown', e => {
  if (!e.repeat && (e.code === 'KeyT' || e.code === 'ArrowUp' || e.code === 'KeyW')) input.tap = true;
  if (!e.repeat && (e.code === 'KeyE' || e.code === 'ShiftLeft') && player && state === 'race') useItem(player, true);
  keys[e.code] = true; if (e.code === 'Escape' && state === 'race') pause();
});
addEventListener('keyup', e => { keys[e.code] = false; });

function updateTouches(e) {
  e.preventDefault();
  let gas = false, brake = false;
  for (const t of e.touches) (t.clientX > innerWidth / 2 ? (gas = true) : (brake = true));
  input.gas = gas; input.brake = brake;
  if (e.type === 'touchstart') input.tap = true;   // un tocco in aria = trick
}
for (const ev of ['touchstart', 'touchend', 'touchcancel'])
  for (const z of ['zone-gas', 'zone-brake']) $(z).addEventListener(ev, updateTouches, { passive: false });
// Mouse (desktop): metà destra/sinistra
for (const [z, k] of [['zone-gas', 'gas'], ['zone-brake', 'brake']]) {
  $(z).addEventListener('mousedown', () => (input[k] = true));
  $(z).addEventListener('mouseup', () => (input[k] = false));
  $(z).addEventListener('mouseleave', () => (input[k] = false));
}

addEventListener('deviceorientation', e => {
  if (e.beta == null) return;
  input.hasTilt = true;
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  // In orizzontale l'inclinazione "a volante" è beta; il segno dipende da quale lato è in alto
  input.tiltRaw = angle === 90 ? e.beta : (angle === 270 || angle === -90) ? -e.beta : e.gamma;
});

async function askSensors() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission)
      await DeviceOrientationEvent.requestPermission();
  } catch {}
}
async function goFullscreenLandscape() {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch {}
  try { await screen.orientation?.lock?.('landscape'); } catch {}
}

function readSteer() {
  let s = 0;
  if (keys.ArrowLeft || keys.KeyA) s -= 1;
  if (keys.ArrowRight || keys.KeyD) s += 1;
  if (!s && input.hasTilt) {
    let d = input.tiltRaw - input.tiltCenter;
    if (Math.abs(d) < 2) d = 0;
    // sens 1..10 → gradi d'inclinazione per sterzare al massimo (6 = 25°)
    s = clamp(d / (40 - settings.sens * 2.5), -1, 1);
  }
  return settings.invert ? -s : s;
}

// ---------- Stato di gioco ----------
let state = 'menu';   // menu | countdown | race | paused | finished
let player = null;
let raceTime = 0, countdownT = 0;

// Griglia di partenza: file da due, sfalsate
function gridSlot(slot) {
  const i = N - 10 - Math.floor(slot / 2) * 7;
  const lat = track.hw[i] * 0.43;
  return { i, pos: samples[i].clone().addScaledVector(normals[i], slot % 2 ? -lat : lat), heading: Math.atan2(tangents[i].x, tangents[i].z) };
}

function spawnPlayer(slot = 0) {
  if (player) scene.remove(player.mesh);
  const { i, pos, heading } = gridSlot(slot);
  const mesh = makeKart(settings.color, settings.char);
  scene.add(mesh);
  player = {
    id: mp ? net.myId : 'me', ...kartExtras(settings.char),
    mesh, pos, heading,
    speed: 0, idx: i, lap: 0, half: false, steerVis: 0, drift: 0, driftT: 0, driftVis: 0, boost: 0,
    moveH: heading, y: pos.y, floor: pos.y, vy: 0, rampH: 0,
  };
  mesh.position.copy(player.pos);
}

const MAX_SPEED = 32, OFFROAD_SPEED = 13, ACCEL = 18, BRAKE = 30, DRAG = 6, TURN = 2.1;
const fwd = new THREE.Vector3();

function updatePlayer(dt) {
  const p = player;
  const gas = input.gas || keys.ArrowUp || keys.KeyW;
  const brake = input.brake || keys.ArrowDown || keys.KeyS || keys.Space;
  const air = p.y > (p.floor ?? p.y) + 0.05;
  const steer = state === 'race' && !air && p.spin <= 0 ? readSteer() : 0;
  updateKartTimers(p, dt);
  // Partenza a razzo: conta da quando tieni premuto il gas durante il conto alla rovescia
  if (state === 'countdown') p.gasCD = gas ? (p.gasCD ?? countdownT) : null;
  // Trick: un tocco mentre sei in aria, mini-turbo all'atterraggio
  if (air && input.tap && !p.trick && p.vy > -4) { p.trick = true; p.trickT = 0; sfx.trick(); }
  input.tap = false;
  input.steer = steer;

  const near = nearest(p.pos, p.idx);
  const offroad = near.dist > track.hw[near.idx] + 1.2;

  // Drift: gas + freno insieme mentre sterzi. Più lo tieni, più forte il mini-turbo
  const wantDrift = state === 'race' && gas && brake && p.speed > 10 && !offroad;
  if (!p.drift && wantDrift && Math.abs(steer) > 0.3) { p.drift = Math.sign(steer); p.driftT = 0; }
  if (p.drift && !wantDrift) {
    if (p.driftT > 1.6) startBoost(p, 1.4);
    else if (p.driftT > 0.8) startBoost(p, 0.8);
    p.drift = 0;
  }
  if (p.drift) p.driftT += dt * (steer * p.drift > 0 ? 1.4 : 1);
  p.boost = Math.max(0, p.boost - dt);

  const top = topSpeed(p);
  const maxS = p.boost > 0 ? top * 1.3 : offroad ? OFFROAD_SPEED : top;

  if (state === 'race' && !air && p.spin <= 0 && p.stall <= 0) {
    if (p.boost > 0) p.speed += ACCEL * 2 * dt;
    else if (gas && (!brake || p.drift)) p.speed += ACCEL * p.stats.acc * dt;
    else if (brake) p.speed -= (p.speed > 0 ? BRAKE : ACCEL * 0.5) * dt;
  }
  if (!gas || state !== 'race') p.speed -= Math.sign(p.speed) * Math.min(Math.abs(p.speed), DRAG * dt);
  if (p.speed > maxS) p.speed = Math.max(maxS, p.speed - 40 * dt);
  p.speed = clamp(p.speed, -8, MAX_SPEED * 1.3);

  const grip = clamp(Math.abs(p.speed) / 8, 0, 1) * Math.sign(p.speed);
  // In drift curvi sempre verso il lato della derapata; lo sterzo la stringe o la allarga
  const turn = p.drift ? p.drift * 0.75 + steer * 0.55 : steer;
  p.heading -= turn * TURN * grip * dt * (1 - 0.35 * Math.min(1, Math.abs(p.speed) / MAX_SPEED));
  // Aderenza: la direzione di marcia insegue il muso del kart (sul ghiaccio molto lentamente)
  if (!air) {
    const dh = Math.atan2(Math.sin(p.heading - p.moveH), Math.cos(p.heading - p.moveH));
    p.moveH += dh * Math.min(1, 12 * track.def.grip * dt);
  }
  fwd.set(Math.sin(p.moveH), 0, Math.cos(p.moveH));
  p.pos.addScaledVector(fwd, p.speed * dt);

  // Bordo pista: ti respinge e rallenta
  const n2 = nearest(p.pos, near.idx);
  const wallD = track.wall[n2.idx];
  if (n2.dist > wallD) {
    const c = samples[n2.idx];
    const dir = new THREE.Vector3(p.pos.x - c.x, 0, p.pos.z - c.z).normalize();
    p.pos.set(c.x + dir.x * wallD, 0, c.z + dir.z * wallD);
    p.moveH = p.heading;
    if (Math.abs(p.speed) > 8) buzz(40, sfx.bump);
    p.speed *= 0.6;
    p.drift = 0;
  }

  // Giri: serve passare da metà pista prima di contare il traguardo
  const prev = p.idx; p.idx = n2.idx;
  if (p.idx > N * 0.4 && p.idx < N * 0.6) p.half = true;
  if (prev > N * 0.8 && p.idx < N * 0.2 && p.half) {
    p.half = false; p.lap++;
    if (p.lap < laps) sfx.lap();
    if (p.lap >= laps) finish();
  }

  // Terreno e trampolino: in cima alla rampa parte il salto, in discesa il kart resta incollato alla strada
  const rampH = rampAt(p.idx, n2.dist);
  const floor = groundY(p.pos, n2.idx) + rampH;
  if (p.rampH > 1.2 && rampH === 0 && p.speed > 8 && !air) { p.vy = 3 + p.speed * 0.22; sfx.jump(); }
  p.rampH = rampH;
  if (p.vy > 0 || p.y > floor + 0.6) {
    p.vy -= 22 * dt;
    p.y += p.vy * dt;
    if (p.y <= floor) {
      if (p.vy < -6) buzz(40, sfx.land);
      if (p.trick) { p.trick = false; startBoost(p, 0.8); toast('🤸 Trick!'); }
      p.y = floor; p.vy = 0;
    }
  } else { p.y = floor; p.vy = 0; }
  p.floor = floor;

  // Urti con gli altri kart: ognuno sposta solo sé stesso
  for (const r of [...remotes.values(), ...bots]) {
    if (!r.has) continue;
    const dx = p.pos.x - r.mesh.position.x, dz = p.pos.z - r.mesh.position.z, d = Math.hypot(dx, dz);
    // I kart pesanti spostano di più quelli leggeri
    const push = (2.4 - d) * clamp((r.stats?.weight ?? 1) / p.stats.weight, 0.5, 1.6);
    if (d > 0.01 && d < 2.4) { p.pos.x += dx / d * push; p.pos.z += dz / d * push; p.speed *= 0.97; buzz(25, sfx.bump); }
  }
  if (state === 'race' || state === 'finished') { kartPickups(p, true, dt); checkHazards(p, true); }

  // Grafica
  p.mesh.position.copy(p.pos).setY(p.y);
  p.mesh.rotation.y = p.heading;
  p.mesh.rotation.x = p.y > floor + 0.05 ? clamp(-p.vy * 0.03, -0.3, 0.3) : rampH > 0 ? -0.2 : slopePitch(p.idx);
  p.steerVis += (steer - p.steerVis) * Math.min(1, dt * 10);
  if (p.trick) p.trickT += dt;
  p.mesh.body.rotation.z = p.trick ? Math.min(1, p.trickT / 0.45) * Math.PI * 2 : p.steerVis * 0.08 * (p.speed / MAX_SPEED);
  p.mesh.body.position.y = offroad && Math.abs(p.speed) > 2 ? Math.sin(performance.now() / 40) * 0.05 : 0;
  p.mesh.wheels[0].rotation.y = p.mesh.wheels[1].rotation.y = -p.steerVis * 0.4;
  for (const w of p.mesh.wheels) w.rotation.x += p.speed * dt / 0.42;
  // Il kart si gira di traverso in drift; scintille bianche → blu → arancioni
  p.driftVis += (-p.drift * 0.4 - p.driftVis) * Math.min(1, dt * 8);
  p.mesh.body.rotation.y = p.driftVis + p.spinAng;
  const sparkColor = p.boost > 0 ? '#ff8a00' : p.driftT > 1.6 ? '#ff8a00' : p.driftT > 0.8 ? '#3ab0ff' : '#ffffff';
  for (const s of p.mesh.sparks) {
    s.visible = !!p.drift || p.boost > 0;
    s.material.color.set(sparkColor);
    s.scale.setScalar(0.6 + Math.random() * (p.boost > 0 ? 1.4 : 0.8));
    s.rotation.set(Math.random() * 6, Math.random() * 6, 0);
  }
}

function startBoost(p, t, isPlayer = p === player) {
  p.boost = Math.max(p.boost, t);
  p.speed = Math.max(p.speed, topSpeed(p) * 1.1);
  if (isPlayer) { sfx.boost(); buzz(20); }
}

// Vibrazione (Android; iPhone non la supporta dal browser)
let lastBuzz = 0;
function buzz(ms, sound) {
  const now = performance.now();
  if (now - lastBuzz < 250) return;
  lastBuzz = now;
  sound?.();
  try { navigator.vibrate?.(ms); } catch {}
}

// Avanzamento in gara (per la classifica live)
const progress = p => p.lap * N + (p.idx >= N * 0.8 && !p.half ? p.idx - N : p.idx);

// ---------- Avversari in rete ----------
const remotes = new Map();
const safeColor = c => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#888888');

function makeLabel(text) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 38px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(text, 128, 32);
  ctx.fillStyle = '#fff'; ctx.fillText(text, 128, 32);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
  s.scale.set(4, 1, 1); s.position.y = 2.7;
  return s;
}
function addRemote(p, slot) {
  const mesh = makeKart(safeColor(p.color), p.char);
  mesh.add(makeLabel(p.name));
  const g = gridSlot(slot);
  mesh.position.copy(g.pos); mesh.rotation.y = g.heading;
  scene.add(mesh);
  remotes.set(p.id, { mesh, name: p.name, x: g.pos.x, z: g.pos.z, h: g.heading, s: 0, prog: progress({ lap: 0, idx: g.i, half: false }), has: true });
}
function removeRemote(id) { const r = remotes.get(id); if (r) { scene.remove(r.mesh); remotes.delete(id); } }
function clearRemotes() { for (const id of [...remotes.keys()]) removeRemote(id); }
function updateRemotes(dt) {
  const k = 1 - Math.exp(-dt * 12);
  for (const r of remotes.values()) {
    const m = r.mesh;
    m.position.x += (r.x - m.position.x) * k;
    m.position.z += (r.z - m.position.z) * k;
    m.position.y += ((r.y || 0) - m.position.y) * k;
    let dh = r.h - m.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    m.rotation.y += dh * k;
    for (const w of m.wheels) w.rotation.x += r.s * dt / 0.42;
    m.shieldMesh.visible = !!r.sh;
    m.body.rotation.y = r.sp ? m.body.rotation.y + dt * 14 : 0;
  }
}

// Visuali: si cambiano col pulsante 🎥 in gara
const VIEWS = [
  { name: 'Vicina', back: -3.2, up: 1.75, ahead: 7, lookY: 1.0 },
  { name: 'Lontana', back: -5.2, up: 2.6, ahead: 6, lookY: 1.1 },
  { name: 'Prima persona', back: 0.2, up: 1.45, ahead: 10, lookY: 1.0, cockpit: true },
];

// ---------- Avversari del computer ----------
const BOT_NAMES = ['Saetta', 'Bolide', 'Scheggia', 'Fulmine', 'Nitro', 'Razzo', 'Cometa', 'Ruggine', 'Tornado'];
const BOT_COLORS = ['#2f80ed', '#27ae60', '#9b51e0', '#f2994a', '#00b8a9', '#ff6fb5', '#8d6e63', '#e8364f', '#ffd23f'];
// speed: frazione della velocità massima · turn: rapidità di sterzo · err: quanto sbandano dalla traiettoria · boost: probabilità di turbo in uscita di curva
const LEVELS = {
  facile: { speed: 0.8, turn: 0.9, err: 1.5, boost: 0 },
  medio: { speed: 0.91, turn: 1, err: 1, boost: 0.35 },
  difficile: { speed: 0.99, turn: 1.15, err: 0.5, boost: 0.7 },
};
let bots = [];

function makeBot(id, name, color, slot, level, charId = CHARS[slot % CHARS.length].id) {
  const g = gridSlot(slot), L = LEVELS[level] || LEVELS.medio;
  const mesh = makeKart(color, charId);
  mesh.add(makeLabel(name));
  mesh.position.copy(g.pos); mesh.rotation.y = g.heading;
  scene.add(mesh);
  return {
    ...kartExtras(charId),
    id, name, mesh, L, pos: g.pos, heading: g.heading, moveH: g.heading, speed: 0, idx: g.i,
    lap: 0, half: false, y: g.pos.y, floor: g.pos.y, vy: 0, rampH: 0, boost: 0, done: false, has: true,
    lane: slot % 2 ? -3 : 3, laneT: 1 + Math.random() * 2, prevCurv: 0, netT: Math.random() / 15,
    skill: L.speed * (0.96 + Math.random() * 0.06),
  };
}
function clearBots() { for (const b of bots) scene.remove(b.mesh); bots = []; }
// Lista dei bot della gara: in gara singola dalle impostazioni, in stanza scelti dall'host
function botEntries(count) {
  return Array.from({ length: count }, (_, k) => ({ id: `bot-${k}`, name: `🤖 ${BOT_NAMES[k % BOT_NAMES.length]}`, color: BOT_COLORS[k % BOT_COLORS.length], char: CHARS[(k + 1) % CHARS.length].id, bot: true }));
}

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function allKarts() {
  const list = bots.map(b => ({ id: b.id, pos: b.pos }));
  if (player) list.push({ id: 'me', pos: player.pos });
  for (const [id, r] of remotes) list.push({ id, pos: r.mesh.position });
  return list;
}

function updateBot(b, dt) {
  const near = nearest(b.pos, b.idx);
  const fx = Math.sin(b.heading), fz = Math.cos(b.heading);

  // Ogni tanto cambia traiettoria; se ha un kart davanti prova a superarlo di lato
  b.laneT -= dt;
  if (b.laneT <= 0) { b.lane = clamp((Math.random() * 2 - 1) * 3.5 * b.L.err * track.hw[b.idx] / 7, -(track.hw[b.idx] - 2), track.hw[b.idx] - 2); b.laneT = 2 + Math.random() * 3; }
  for (const o of allKarts()) {
    if (o.id === b.id) continue;
    const rx = o.pos.x - b.pos.x, rz = o.pos.z - b.pos.z;
    const ahead = rx * fx + rz * fz, side = rx * fz - rz * fx;
    if (ahead > 0 && ahead < 8 && Math.abs(side) < 2.4) { b.lane = clamp(b.lane + (side > 0 ? 3 : -3), -(track.hw[b.idx] - 2), track.hw[b.idx] - 2); b.laneT = 1.5; }
  }

  // Punta a un punto più avanti sulla pista, spostato sulla sua corsia
  const ti = (near.idx + Math.round(7 + b.speed * 0.35)) % N;
  const tx = samples[ti].x + normals[ti].x * b.lane, tz = samples[ti].z + normals[ti].z * b.lane;
  const maxTurn = TURN * 1.15 * b.L.turn * dt;
  updateKartTimers(b, dt);
  if (b.spin <= 0) b.heading += clamp(angleDiff(Math.atan2(tx - b.pos.x, tz - b.pos.z), b.heading), -maxTurn, maxTurn);

  // Rallenta prima delle curve (di più sul ghiaccio)
  const curv = 1 - tangents[(near.idx + 4) % N].dot(tangents[(near.idx + 22) % N]);
  let target = topSpeed(b) * b.skill * (1 - Math.min(0.42, curv * 0.9 * (2 - track.def.grip)));
  if (b.done) target *= 0.6;
  // Un po' di "elastico": se il giocatore è molto indietro aspettano, se è avanti spingono
  if (player && !mp) {
    const gap = progress(player) - progress(b);
    if (gap > 60) target *= 1.07; else if (gap < -120) target *= 0.93;
  }
  if (near.dist > track.hw[near.idx] + 1.2) target = Math.min(target, OFFROAD_SPEED);
  if (b.prevCurv > 0.2 && curv < 0.05 && !b.done && Math.random() < b.L.boost) b.boost = 0.8;
  b.prevCurv = curv;
  if (b.boost > 0) { b.boost -= dt; target = topSpeed(b) * 1.25; }
  if (b.spin > 0) target = 0;
  if (b.item && (b.itemT -= dt) <= 0) { useItem(b, false); b.itemT = 0.6; }
  b.speed += b.speed < target ? ACCEL * dt : -Math.min(b.speed - target, BRAKE * 0.6 * dt);

  if (b.y < (b.floor ?? b.y) + 0.05) b.moveH += angleDiff(b.heading, b.moveH) * Math.min(1, 12 * track.def.grip * dt);
  b.pos.x += Math.sin(b.moveH) * b.speed * dt;
  b.pos.z += Math.cos(b.moveH) * b.speed * dt;

  const n2 = nearest(b.pos, near.idx);
  if (n2.dist > track.wall[n2.idx]) {
    const c = samples[n2.idx], k = track.wall[n2.idx] / n2.dist;
    b.pos.set(c.x + (b.pos.x - c.x) * k, 0, c.z + (b.pos.z - c.z) * k);
    b.speed *= 0.6; b.moveH = b.heading;
  }

  // Giri e arrivo
  const prev = b.idx; b.idx = n2.idx;
  if (b.idx > N * 0.4 && b.idx < N * 0.6) b.half = true;
  if (prev > N * 0.8 && b.idx < N * 0.2 && b.half) {
    b.half = false; b.lap++;
    if (b.lap >= laps && !b.done) { b.done = true; kartFinished(b.id, b.name, raceTime); }
  }

  // Trampolino
  const rampH = rampAt(b.idx, n2.dist), floor = groundY(b.pos, n2.idx) + rampH;
  if (b.rampH > 1.2 && rampH === 0 && b.speed > 8) { b.vy = 3 + b.speed * 0.22; b.trick = Math.random() < b.L.boost + 0.2; }
  b.rampH = rampH;
  if (b.vy > 0 || b.y > floor + 0.6) { b.vy -= 22 * dt; b.y += b.vy * dt; if (b.y <= floor) { b.y = floor; b.vy = 0; if (b.trick) { b.trick = false; startBoost(b, 0.8); } } } else { b.y = floor; b.vy = 0; }
  b.floor = floor;
  kartPickups(b, false, dt);
  checkHazards(b, false);

  // Urti
  for (const o of allKarts()) {
    if (o.id === b.id) continue;
    const dx = b.pos.x - o.pos.x, dz = b.pos.z - o.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.01 && d < 2.4) { b.pos.x += dx / d * (2.4 - d) * 0.5; b.pos.z += dz / d * (2.4 - d) * 0.5; b.speed *= 0.98; }
  }

  const m = b.mesh;
  m.position.copy(b.pos).setY(b.y);
  m.rotation.y = b.heading;
  m.rotation.x = b.y > floor + 0.05 ? clamp(-b.vy * 0.03, -0.3, 0.3) : slopePitch(b.idx);
  for (const w of m.wheels) w.rotation.x += b.speed * dt / 0.42;
  m.body.rotation.y = b.spinAng;
  for (const s of m.sparks) { s.visible = b.boost > 0; s.material.color.set('#ff8a00'); s.scale.setScalar(0.6 + Math.random() * 1.4); }

  // In stanza l'host trasmette i bot agli altri come se fossero giocatori
  if (mp && net.isHost && (b.netT += dt) > 1 / 15) {
    b.netT = 0;
    net.sendAs(b.id, { t: 'st', x: +b.pos.x.toFixed(2), z: +b.pos.z.toFixed(2), h: +b.heading.toFixed(3), s: +b.speed.toFixed(1), p: progress(b), y: +b.y.toFixed(2), sh: b.shield > 0 ? 1 : 0, sp: b.spin > 0 ? 1 : 0 });
  }
}

// Arrivo di un kart: in stanza lo registra l'host, in gara singola la classifica è locale
function kartFinished(id, name, time) {
  if (mp) { net.finBot(id, name, time); return; }
  if (results.some(r => r.id === id)) return;
  results.push({ id, name, time });
  results.sort((a, b) => a.time - b.time);
  if (state === 'finished') renderResults();
}

// ---------- Gemme, pannelli turbo, cristalli sorpresa e oggetti ----------
// Posizioni fisse per pista (uguali per tutti i giocatori)
const ITEMS = {
  turbo: { icon: '⚡', name: 'Turbo' },
  turbo3: { icon: '⚡³', name: 'Triplo turbo' },
  shield: { icon: '🛡️', name: 'Scudo' },
  oil: { icon: '🛢️', name: 'Macchia d\'olio' },
  rocket: { icon: '🚀', name: 'Razzo' },
};
// Probabilità in base alla posizione: davanti oggetti difensivi, dietro quelli per rimontare
const ITEM_ODDS = [
  { turbo: 30, shield: 30, oil: 40 },
  { turbo: 30, shield: 20, oil: 20, rocket: 30 },
  { turbo: 20, turbo3: 40, rocket: 40 },
];
let pickGroup = null, gems = [], boxes = [], pads = [], traps = [], rockets = [], fxSeq = 0;

// Corsie in proporzione alla larghezza della strada in quel punto (le piste classiche sono larghe 7 per lato)
function lanePos(i, lane) { return samples[i].clone().addScaledVector(normals[i], lane * track.hw[i] / 7); }

function setupPickups() {
  if (pickGroup) scene.remove(pickGroup);
  pickGroup = new THREE.Group(); scene.add(pickGroup);
  gems = []; boxes = []; pads = [];
  const gemG = new THREE.IcosahedronGeometry(0.45, 0), gemM = new THREE.MeshLambertMaterial({ color: '#ffcc33', emissive: '#7a5200' });
  [0.1, 0.2, 0.36, 0.5, 0.62, 0.76, 0.9].forEach((f, k) => {
    const lane = [-4, 3, 0, -2, 4, 1, -3][k];
    for (let j = 0; j < 4; j++) {
      const i = (Math.round(f * N) + j * 4) % N;
      const m = new THREE.Mesh(gemG, gemM); m.position.copy(lanePos(i, lane)); m.position.y += 0.9;
      pickGroup.add(m);
      gems.push({ mesh: m, pos: m.position, on: true, t: 0 });
    }
  });
  // Cristalli sorpresa: file da 5 di traverso sulla strada
  const boxG = new THREE.OctahedronGeometry(0.9, 0);
  const boxM = new THREE.MeshLambertMaterial({ color: '#b48cff', emissive: '#4b2a9a', transparent: true, opacity: 0.85 });
  for (const f of [0.27, 0.57, 0.84]) {
    const i = Math.round(f * N);
    for (const lane of [-5, -2.5, 0, 2.5, 5]) {
      const m = new THREE.Mesh(boxG, boxM); m.position.copy(lanePos(i, lane)); m.position.y += 1.1;
      pickGroup.add(m);
      boxes.push({ mesh: m, pos: m.position, on: true, t: 0 });
    }
  }
  // Pannelli turbo con le frecce
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ff6a00'; ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#ffe14d';
  for (const y of [8, 48, 88]) { ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(60, y + 30); ctx.lineTo(44, y + 30); ctx.lineTo(32, y + 16); ctx.lineTo(20, y + 30); ctx.lineTo(4, y + 30); ctx.fill(); }
  const padM = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) });
  [0.15, 0.46, 0.72].forEach((f, k) => {
    const i = Math.round(f * N), lane = [-3, 2.5, 0][k];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5).rotateX(-Math.PI / 2), padM);
    m.position.copy(lanePos(i, lane)); m.position.y += 0.06;
    m.rotation.y = Math.atan2(tangents[i].x, tangents[i].z);
    pickGroup.add(m);
    pads.push({ pos: m.position });
  });
}
function resetPickups() {
  for (const g of [...gems, ...boxes]) { g.on = true; g.mesh.visible = true; }
  for (const t of traps) pickGroup.remove(t.mesh);
  for (const r of rockets) pickGroup.remove(r.mesh);
  traps = []; rockets = [];
}

// Tutti i kart in gara, con id e posizione (locali e in rete)
function kartList() {
  const list = [];
  if (player) list.push({ id: player.id, pos: player.pos, prog: progress(player), local: player });
  for (const b of bots) list.push({ id: b.id, pos: b.pos, prog: progress(b), local: b });
  for (const [id, r] of remotes) list.push({ id, pos: r.mesh.position, prog: r.prog });
  return list;
}
function rankFrac(k) {
  const all = kartList(); if (all.length < 2) return 0.5;
  const me = progress(k);
  return all.filter(o => o.id !== k.id && o.prog > me).length / (all.length - 1);
}
const topSpeed = k => MAX_SPEED * k.stats.top * (1 + Math.min(k.gems, 10) * 0.01);

function rollItem(k) {
  const odds = ITEM_ODDS[Math.min(2, Math.floor(rankFrac(k) * 3))];
  let r = Math.random() * Object.values(odds).reduce((a, b) => a + b, 0);
  for (const [id, w] of Object.entries(odds)) if ((r -= w) < 0) return id;
  return 'turbo';
}

// Raccolta di gemme, cristalli e pannelli per un kart guidato su questo telefono
function kartPickups(k, isPlayer, dt) {
  const near = (o, r) => (o.pos.x - k.pos.x) ** 2 + (o.pos.z - k.pos.z) ** 2 < r * r && k.y - (k.floor ?? 0) < 2;
  for (const g of gems) if (g.on && near(g, 1.8)) {
    g.on = false; g.mesh.visible = false; g.t = 8;
    if (k.gems < 10) k.gems++;
    if (isPlayer) sfx.gem();
  }
  for (const b of boxes) if (b.on && near(b, 2.1)) {
    b.on = false; b.mesh.visible = false; b.t = 3;
    if (!k.item && !k.roulette) { k.roulette = isPlayer ? 1.2 : 0.01; if (isPlayer) sfx.box(); }
  }
  k.padCD = Math.max(0, (k.padCD || 0) - dt);
  for (const p of pads) if (!k.padCD && near(p, 2.4)) { k.padCD = 1; startBoost(k, 0.9, isPlayer); }
  if (k.roulette > 0 && (k.roulette -= dt) <= 0) {
    k.roulette = 0; k.item = rollItem(k); k.itemUses = k.item === 'turbo3' ? 3 : 1;
    k.itemT = 1 + Math.random() * 3;   // i bot aspettano un po' prima di usarlo
    if (isPlayer) sfx.lap();
  }
}

function useItem(k, isPlayer) {
  if (!k.item || k.spin > 0) return;
  const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  switch (k.item) {
    case 'turbo': case 'turbo3': startBoost(k, 1.0, isPlayer); break;
    case 'shield': k.shield = 10; if (isPlayer) sfx.shield(); break;
    case 'oil': {
      const m = { k: 'trap', tid: `${k.id}-${++fxSeq}`, x: k.pos.x - fx * 3, z: k.pos.z - fz * 3, owner: k.id };
      addTrap(m); sendFx(m); if (isPlayer) sfx.drop();
      break;
    }
    case 'rocket': {
      // Punta al kart subito davanti in classifica
      const me = progress(k);
      const ahead = kartList().filter(o => o.id !== k.id && o.prog > me).sort((a, b) => a.prog - b.prog)[0];
      const m = { k: 'rocket', rid: `${k.id}-${++fxSeq}`, x: k.pos.x + fx * 2.5, z: k.pos.z + fz * 2.5, h: k.heading, target: ahead?.id || null, owner: k.id, idx: k.idx };
      addRocket(m); sendFx(m); sfx.rocket();
      break;
    }
  }
  if (--k.itemUses <= 0) k.item = null;
}

function addTrap(m) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1.6, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1a1a22', transparent: true, opacity: 0.85 }));
  const shine = new THREE.Mesh(new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#6b5cff', transparent: true, opacity: 0.6 }));
  shine.position.set(0.4, 0.01, 0.3); mesh.add(shine);
  const tp = new THREE.Vector3(+m.x, 0, +m.z);
  mesh.position.set(tp.x, groundY(tp, nearest(tp).idx) + 0.07, tp.z);
  pickGroup.add(mesh);
  traps.push({ id: m.tid, mesh, pos: mesh.position, owner: m.owner, age: 0 });
}
function addRocket(m) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 10).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#e8364f' }));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 10).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  nose.position.z = 1; 
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffb000' }));
  flame.position.z = -1.1;
  mesh.add(body, nose, flame);
  mesh.position.set(+m.x, 1, +m.z);
  pickGroup.add(mesh);
  rockets.push({ id: m.rid, mesh, pos: mesh.position, h: +m.h, target: m.target, owner: m.owner, idx: +m.idx || 0, age: 0 });
}
function removeFx(list, id) {
  const i = list.findIndex(o => o.id === id);
  if (i >= 0) { pickGroup.remove(list[i].mesh); list.splice(i, 1); }
}
function sendFx(m) { if (mp) net.send({ t: 'fx', ...m }); }
function onFx(m) {
  if (m.k === 'trap') addTrap(m);
  else if (m.k === 'rocket') addRocket(m);
  else if (m.k === 'tgone') removeFx(traps, m.tid);
  else if (m.k === 'rgone') removeFx(rockets, m.rid);
}

// Colpito da razzo o olio: testacoda e perde qualche gemma (lo scudo para il colpo)
function hitKart(k, isPlayer) {
  if (k.shield > 0) { k.shield = 0; if (isPlayer) sfx.shield(); return; }
  k.spin = 1.1; k.speed *= 0.25; k.boost = 0; k.drift = 0;
  k.gems = Math.max(0, k.gems - 3);
  if (isPlayer) { sfx.bump(); buzz(120); toast('💥 Colpito!'); }
}

// Pericoli per i kart guidati su questo telefono
function checkHazards(k, isPlayer) {
  for (const t of [...traps]) {
    if (t.owner === k.id && t.age < 1) continue;
    if ((t.pos.x - k.pos.x) ** 2 + (t.pos.z - k.pos.z) ** 2 < 3.2 && k.y - (k.floor ?? 0) < 1) {
      removeFx(traps, t.id); sendFx({ k: 'tgone', tid: t.id }); hitKart(k, isPlayer);
    }
  }
  for (const r of [...rockets]) {
    if (r.owner === k.id && r.age < 0.8) continue;
    if ((r.pos.x - k.pos.x) ** 2 + (r.pos.z - k.pos.z) ** 2 < 4.4) {
      removeFx(rockets, r.id); sendFx({ k: 'rgone', rid: r.id }); hitKart(k, isPlayer);
    }
  }
}

function findKartPos(id) { return kartList().find(o => o.id === id)?.pos; }

function updatePickups(dt) {
  if (!pickGroup) return;
  const now = performance.now() / 1000;
  for (const g of gems) { g.mesh.rotation.y = now * 2; if (!g.on && (g.t -= dt) <= 0) { g.on = true; g.mesh.visible = true; } }
  for (const b of boxes) { b.mesh.rotation.y = now * 1.5; b.baseY ??= b.mesh.position.y; b.mesh.position.y = b.baseY + Math.sin(now * 3 + b.pos.x) * 0.15; if (!b.on && (b.t -= dt) <= 0) { b.on = true; b.mesh.visible = true; } }
  for (const t of traps) t.age += dt;
  for (const r of [...rockets]) {
    r.age += dt;
    // Insegue il bersaglio; senza bersaglio segue la pista
    const tp = r.target && findKartPos(r.target);
    let tx, tz;
    if (tp) { tx = tp.x; tz = tp.z; }
    else { r.idx = nearest(r.pos, r.idx).idx; const s = samples[(r.idx + 12) % N]; tx = s.x; tz = s.z; }
    const want = Math.atan2(tx - r.pos.x, tz - r.pos.z);
    r.h += clamp(angleDiff(want, r.h), -3.2 * dt, 3.2 * dt);
    r.pos.x += Math.sin(r.h) * 44 * dt; r.pos.z += Math.cos(r.h) * 44 * dt;
    r.mesh.rotation.y = r.h;
    r.pos.y = groundY(r.pos, r.idx = nearest(r.pos, r.idx).idx) + 1;
    if (r.age > 6) removeFx(rockets, r.id);
  }
}

// Avvisi brevi al centro dello schermo
let toastT = 0;
function toast(text) { $('toast').textContent = text; toastT = 1.4; show('toast', true); }
function updateToast(dt) { if (toastT > 0 && (toastT -= dt) <= 0) show('toast', false); }

// Pulsante oggetto (in basso al centro)
function updateItemHUD() {
  const p = player, el = $('btn-item');
  if (p.roulette > 0) { const ids = Object.keys(ITEMS); el.textContent = ITEMS[ids[Math.floor(performance.now() / 80) % ids.length]].icon; el.classList.add('rolling'); }
  else { el.textContent = p.item ? (p.item === 'turbo3' ? `⚡×${p.itemUses}` : ITEMS[p.item].icon) : ''; el.classList.remove('rolling'); }
  el.classList.toggle('empty', !p.item && !p.roulette);
  $('hud-gems').textContent = `💎 ${p.gems}`;
}

// Stato comune a giocatore e bot
const kartExtras = charId => ({ stats: charOf(charId), gems: 0, item: null, itemUses: 0, itemT: 0, roulette: 0, shield: 0, spin: 0, spinAng: 0, stall: 0, trick: false, trickT: 0, gasCD: null, padCD: 0 });
function updateKartTimers(k, dt) {
  k.shield = Math.max(0, k.shield - dt);
  k.stall = Math.max(0, k.stall - dt);
  if (k.spin > 0) { k.spin -= dt; k.spinAng += dt * 14; k.speed *= Math.pow(0.3, dt); } else k.spinAng = 0;
  k.mesh.shieldMesh.visible = k.shield > 0;
}

const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateChaseCam(dt, snap = false) {
  const p = player;
  fwd.set(Math.sin(p.heading), 0, Math.cos(p.heading));
  const v = VIEWS[settings.view] || VIEWS[0];
  const target = p.pos.clone().addScaledVector(fwd, v.back).setY(p.y + v.up);
  const look = p.pos.clone().addScaledVector(fwd, v.ahead).setY(p.y + v.lookY);
  p.mesh.body.visible = !v.cockpit;   // in prima persona nascondo pilota e telaio
  const k = snap || v.cockpit ? 1 : 1 - Math.exp(-dt * 8);
  camPos.lerp(target, k); camLook.lerp(look, k);
  if (snap) { camPos.copy(target); camLook.copy(look); }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  camera.fov = 70 + 10 * clamp(p.speed / MAX_SPEED, 0, 1);
  camera.updateProjectionMatrix();
  sun.position.copy(p.pos).add(new THREE.Vector3(30, 60, 20));
  sun.target.position.copy(p.pos);
}

// ---------- HUD ----------
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
function updateHUD() {
  $('hud-lap').textContent = `GIRO ${Math.min(player.lap + 1, laps)}/${laps}`;
  $('hud-time').textContent = fmt(raceTime);
  $('hud-speed').textContent = Math.round(Math.abs(player.speed) * 3.6);
  $('steer-dot').style.left = `${50 + input.steer * 50}%`;
  if (raceSize > 1) {
    const me = progress(player);
    let pos = 1;
    for (const r of remotes.values()) if (r.prog > me) pos++;
    for (const b of bots) if (progress(b) > me) pos++;
    $('hud-pos').textContent = `${pos}°/${raceSize}`;
  }
}

// ---------- Flusso: menu, gara, pausa ----------
function show(id, on) { $(id).classList.toggle('hidden', !on); }

function startRace(slot = 0) {
  spawnPlayer(slot);
  resetPickups();
  raceTime = 0; countdownT = 3;
  state = 'countdown';
  input.tiltCenter = input.tiltRaw;   // calibra lo sterzo sulla posizione attuale
  show('menu', false); show('lobby', false); show('overlay', false); show('hud', true); show('countdown', true);
  show('hud-pos', raceSize > 1);
  document.body.classList.add('racing');
  updateChaseCam(0, true);
  lastBeep = 4;
  sfx.playMusic(track.def.id);
}
function pause() {
  if (state !== 'race' && state !== 'countdown') return;
  // In multiplayer la gara non si ferma: si apre solo il menu
  if (!mp) state = 'paused';
  $('ov-title').textContent = mp ? 'Menu' : 'Pausa';
  $('ov-text').textContent = mp ? 'La gara continua!' : '';
  show('btn-resume', true); show('btn-retry', !mp); show('btn-lobby', false); show('overlay', true);
  $('btn-menu').textContent = mp ? 'Esci dalla stanza' : 'Menu';
  document.body.classList.remove('racing');
}
function resume() {
  input.tiltCenter = input.tiltRaw;
  if (!mp) state = countdownT > 0 ? 'countdown' : 'race';
  show('overlay', false);
  document.body.classList.add('racing');
}
function renderResults() {
  const res = mp && net.results.length ? net.results : results;
  const mine = res.findIndex(r => r.id === (mp ? net.myId : 'me'));
  $('ov-title').textContent = mine >= 0 ? `🏁 Sei arrivato ${mine + 1}°!` : '🏁 Traguardo!';
  const lines = res.map((r, i) => `${i + 1}. ${r.name}  ${fmt(r.time)}`);
  if (res.length < raceSize) lines.push('', 'In attesa degli altri piloti…');
  if (!mp) lines.push('', recordLine);
  if (cup) lines.unshift(`🏆 Coppa · gara ${cup.i + 1}/${cup.tracks.length}`, '');
  $('ov-text').textContent = lines.join('\n');
}
function finish() {
  state = 'finished';
  sfx.stopMusic(); sfx.fanfare(); sfx.setDrift(0);
  if (mp) {
    net.send({ t: 'fin', time: raceTime });
    renderResults();
    show('btn-resume', false); show('btn-retry', false); show('btn-lobby', net.isHost);
    $('btn-menu').textContent = 'Esci dalla stanza';
    show('overlay', true); show('countdown', false);
    document.body.classList.remove('racing');
    return;
  }
  // Record personale per pista e numero di giri
  const key = `tt-best-${track.def.id}-${laps}`;
  let best = Infinity;
  try { best = +localStorage.getItem(key) || Infinity; } catch {}
  const record = raceTime < best;
  if (record) try { localStorage.setItem(key, raceTime); } catch {}
  recordLine = record ? '⭐ Nuovo record!' : `Record: ${fmt(best)}`;
  kartFinished('me', settings.name, raceTime);
  renderResults();
  show('btn-resume', false); show('btn-retry', !cup); show('btn-next', !!cup); show('overlay', true); show('countdown', false);
  $('btn-next').textContent = '📊 Classifica coppa';
  cupShown = false;
  document.body.classList.remove('racing');
}
let recordLine = '';

// ---------- Coppa: tutte le piste di fila, punti a ogni gara ----------
const CUP_POINTS = [15, 12, 10, 8, 6, 5, 4, 3, 2, 1];
let cup = null, cupShown = false;
function startCup() {
  cup = { i: 0, tracks: TRACKS.map(t => t.id), pts: {} };
  startSolo();
}
function cupStandings() {
  return Object.entries(cup.pts).sort((a, b) => b[1].pts - a[1].pts);
}
// Primo tocco: assegna i punti e mostra la classifica; secondo tocco: gara successiva
function cupNext() {
  if (!cupShown) {
    // Ordine d'arrivo: chi ha finito, poi gli altri per posizione in pista
    const order = [...results.map(r => ({ id: r.id, name: r.name }))];
    const rest = bots.filter(b => !results.some(r => r.id === b.id)).sort((a, b) => progress(b) - progress(a));
    for (const b of rest) order.push({ id: b.id, name: b.name });
    order.forEach((k, i) => {
      const e = cup.pts[k.id] ||= { name: k.name, pts: 0 };
      e.pts += CUP_POINTS[i] || 0;
    });
    const last = cup.i >= cup.tracks.length - 1;
    const medals = ['🥇', '🥈', '🥉'];
    $('ov-title').textContent = last ? '🏆 Coppa conclusa!' : `📊 Classifica dopo ${cup.i + 1}/${cup.tracks.length}`;
    $('ov-text').textContent = cupStandings().map(([id, e], i) => `${medals[i] || `${i + 1}.`} ${e.name}${id === 'me' ? ' (tu)' : ''}  ${e.pts} pt`).join('\n');
    $('btn-next').textContent = last ? '🏠 Menu' : '▶ Gara successiva';
    cupShown = true;
    if (last) cup.done = true;
    return;
  }
  if (cup.done) { toMenu(); return; }
  cup.i++;
  startSolo();
}
function toMenu() {
  state = 'menu';
  cup = null;
  clearBots();
  sfx.playMusic('menu');
  show('overlay', false); show('hud', false); show('countdown', false); show('lobby', false); show('menu', true);
  showScreen('scr-main');
  $('btn-menu').textContent = 'Menu';
  document.body.classList.remove('racing');
}

// ---------- Multiplayer ----------
const net = new Net();
let mp = false, raceSize = 1, results = [], lobbyPlayers = [], lobbyCfg = null;
const raceCfg = () => ({ track: settings.track, laps: settings.laps, bots: settings.bots, level: settings.level });
// In stanza i bot riempiono i posti liberi fino a 10
const lobbyBots = () => Math.min(settings.bots, MAX_PLAYERS - lobbyPlayers.length);
const me = () => ({ name: settings.name, color: settings.color, char: settings.char });

function showLobby(room, msg = '') {
  state = 'lobby';
  sfx.playMusic('menu');
  show('menu', false); show('overlay', false); show('hud', false); show('countdown', false); show('lobby', true);
  show('lobby-choose', !room); show('lobby-room', room);
  show('btn-start', room && net.isHost);
  $('lobby-msg').textContent = msg || (room && !net.isHost ? "In attesa che l'host avvii la gara…" : '');
  document.body.classList.remove('racing');
  if (room) renderLobby();
}
function renderLobby() {
  $('room-code').textContent = net.code;
  show('lobby-host-cfg', net.isHost);
  const t = TRACKS.find(t => t.id === lobbyCfg?.track);
  const nb = net.isHost ? lobbyBots() : Math.min(+lobbyCfg?.bots || 0, MAX_PLAYERS - lobbyPlayers.length);
  $('lobby-cfg').textContent = !net.isHost && t ? `${t.icon} ${t.name} · ${lobbyCfg.laps} giri${nb ? ` · ${nb} CPU` : ''}` : '';
  $('player-count').textContent = `${lobbyPlayers.length}/${MAX_PLAYERS}${nb ? ` + ${nb} 🤖` : ''}`;
  const ul = $('players'); ul.innerHTML = '';
  lobbyPlayers.forEach((p, i) => {
    const li = document.createElement('li'), dot = document.createElement('i');
    dot.style.background = safeColor(p.color);
    li.append(dot, `${p.name}${i === 0 ? ' 👑' : ''}${p.id === net.myId ? ' (tu)' : ''}`);
    ul.appendChild(li);
  });
}
function leaveMP(msg = '') {
  net.leave(); mp = false; clearRemotes(); clearBots();
  if (msg) showLobby(false, msg); else toMenu();
}

net.on('closed', reason => leaveMP(reason));
net.on('msg', m => {
  switch (m.t) {
    case 'lobby':
      lobbyPlayers = m.players;
      if (m.cfg) { lobbyCfg = m.cfg; loadTrack(m.cfg.track); }
      if (state === 'lobby') renderLobby();
      break;
    case 'start': {
      mp = true; results = []; clearRemotes(); clearBots();
      loadTrack(m.cfg?.track); laps = clamp(+m.cfg?.laps || 3, 1, 5);
      raceSize = m.grid.length;
      m.grid.forEach((p, i) => {
        if (p.id === net.myId) return;
        // I bot li guida il telefono dell'host; per gli altri sono avversari come gli altri
        if (p.bot && net.isHost) bots.push(makeBot(p.id, p.name, safeColor(p.color), i, m.cfg?.level, p.char));
        else addRemote(p, i);
      });
      startRace(Math.max(0, m.grid.findIndex(p => p.id === net.myId)));
      break;
    }
    case 'st': {
      const r = remotes.get(m.id);
      if (r) Object.assign(r, { x: +m.x, z: +m.z, h: +m.h, s: +m.s, prog: +m.p, y: +m.y || 0, sh: m.sh, sp: m.sp });
      break;
    }
    case 'left': removeRemote(m.id); break;
    case 'fx': onFx(m); break;
    case 'res': results = m.results; if (state === 'finished') renderResults(); break;
    case 'back': mp = false; clearRemotes(); clearBots(); showLobby(true); break;
  }
});

let netT = 0;
function sendState(dt) {
  netT += dt;
  if (netT < 1 / 15) return;
  netT = 0;
  const p = player;
  net.send({ t: 'st', x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), h: +p.heading.toFixed(3), s: +p.speed.toFixed(1), p: progress(p), y: +p.y.toFixed(2), sh: p.shield > 0 ? 1 : 0, sp: p.spin > 0 ? 1 : 0 });
}

// Menu
$('name').value = settings.name;
$('name').addEventListener('input', e => { settings.name = e.target.value.trim() || 'Pilota'; saveSettings(); });
// Scelta pista e giri: nel menu (gara singola) e nella stanza (solo l'host)
function trackPicker(el, onPick) {
  el.innerHTML = '';
  for (const t of TRACKS) {
    const b = document.createElement('button');
    b.textContent = `${t.icon} ${t.name}`;
    b.classList.toggle('sel', t.id === settings.track);
    b.onclick = () => { onPick(t.id); for (const x of el.children) x.classList.toggle('sel', x === b); };
    el.appendChild(b);
  }
}
function pickTrack(id) { settings.track = id; saveSettings(); loadTrack(id); if (net.isHost) net.setCfg(raceCfg()); syncPickers(); }
function pickBots(n) { settings.bots = clamp(+n, 0, 9); saveSettings(); if (net.isHost) net.setCfg(raceCfg()); syncPickers(); if (state === 'lobby') renderLobby(); }
function pickLevel(l) { settings.level = LEVELS[l] ? l : 'medio'; saveSettings(); if (net.isHost) net.setCfg(raceCfg()); syncPickers(); }
function pickLaps(n) { settings.laps = clamp(+n, 1, 5); saveSettings(); if (net.isHost) net.setCfg(raceCfg()); syncPickers(); if (menuScreen === 'scr-tracks') renderTrackCards(); }
function syncPickers() {
  trackPicker($('lobby-pick'), pickTrack);
  $('laps').value = $('lobby-laps').value = settings.laps;
  $('bots').value = $('lobby-bots').value = settings.bots;
  $('level').value = $('lobby-level').value = settings.level;
}
for (const id of ['bots', 'lobby-bots']) $(id).onchange = e => pickBots(e.target.value);
for (const id of ['level', 'lobby-level']) $(id).onchange = e => pickLevel(e.target.value);
$('laps').onchange = e => pickLaps(e.target.value);
$('lobby-laps').onchange = e => pickLaps(e.target.value);
syncPickers();
loadTrack(settings.track);

$('sens').value = settings.sens;
$('sens').addEventListener('input', e => { settings.sens = +e.target.value; saveSettings(); });
$('invert').checked = settings.invert;
$('invert').addEventListener('change', e => { settings.invert = e.target.checked; saveSettings(); });
// ---------- Menu di gioco: schermate ----------
let menuScreen = 'scr-title', menuMode = 'solo';
function showScreen(id) {
  menuScreen = id;
  for (const s of document.querySelectorAll('.mscr')) s.classList.toggle('hidden', s.id !== id);
  if (id === 'scr-chars') refreshPreview();
  if (id === 'scr-tracks') renderTrackCards();
}
$('btn-press').onclick = () => { goFullscreenLandscape(); askSensors(); sfx.go(); showScreen('scr-main'); };
for (const t of document.querySelectorAll('.tile')) t.onclick = () => {
  menuMode = t.dataset.mode;
  showScreen(menuMode === 'options' ? 'scr-options' : 'scr-chars');
};
for (const b of document.querySelectorAll('.back')) b.onclick = () => showScreen(b.dataset.back);
$('btn-chars-ok').onclick = () => {
  if (menuMode === 'multi') { goFullscreenLandscape(); askSensors(); showLobby(false); }
  else showScreen('scr-tracks');
};
$('btn-go').onclick = () => {
  goFullscreenLandscape();   // deve partire subito dal tap, senza attese
  askSensors().finally(menuMode === 'cup' ? startCup : startSolo);
};

// Pilota: griglia, statistiche e kart 3D in vetrina
const pct = (v, lo, hi) => `${Math.round(clamp((v - lo) / (hi - lo), 0.08, 1) * 100)}%`;
function charPicker() {
  const el = $('chars'); el.innerHTML = '';
  for (const c of CHARS) {
    const b = document.createElement('button');
    b.innerHTML = `<span>${c.icon}</span>${c.name}<small>${c.cls}</small>`;
    b.classList.toggle('sel', c.id === settings.char);
    b.onclick = () => { settings.char = c.id; saveSettings(); charPicker(); refreshPreview(); sfx.click(); };
    el.appendChild(b);
  }
  const c = charOf(settings.char);
  $('ci-name').textContent = `${c.icon} ${c.name}`;
  $('ci-class').textContent = `Classe ${c.cls}`;
  $('st-top').style.width = pct(c.top, 0.9, 1.08);
  $('st-acc').style.width = pct(c.acc, 0.75, 1.25);
  $('st-weight').style.width = pct(c.weight, 0.55, 1.5);
}
function refreshPreview() {
  if (previewKart) turntable.remove(previewKart);
  previewKart = makeKart(settings.color, settings.char);
  turntable.add(previewKart);
}
charPicker();
for (const c of COLORS) {
  const b = document.createElement('button');
  b.style.background = c;
  b.className = c === settings.color ? 'sel' : '';
  b.onclick = () => { settings.color = c; saveSettings(); for (const x of $('colors').children) x.classList.toggle('sel', x === b); refreshPreview(); };
  $('colors').appendChild(b);
}

// Pista: schede grandi; in Coppa mostrano l'ordine delle gare
function renderTrackCards() {
  const el = $('track-pick'), isCup = menuMode === 'cup';
  el.innerHTML = ''; el.classList.toggle('cup', isCup);
  $('tracks-title').textContent = isCup ? '🏆 Coppa: tutte le piste' : 'Scegli la pista';
  TRACKS.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'tcard';
    b.style.background = `linear-gradient(160deg, ${t.card[0]}, ${t.card[1]})`;
    let best = 0;
    try { best = +localStorage.getItem(`tt-best-${t.id}-${settings.laps}`) || 0; } catch {}
    b.innerHTML = `<span class="ico">${t.icon}</span><b>${isCup ? `${i + 1}. ` : ''}${t.name}</b><small>${t.desc}</small>${best ? `<em>⏱ ${fmt(best)}</em>` : ''}`;
    b.classList.toggle('sel', !isCup && t.id === settings.track);
    if (!isCup) b.onclick = () => { pickTrack(t.id); renderTrackCards(); sfx.click(); };
    el.appendChild(b);
  });
}
function startSolo() {
  mp = false; laps = settings.laps; loadTrack(cup ? cup.tracks[cup.i] : settings.track);
  clearBots(); results = [];
  const list = botEntries(settings.bots);
  bots = list.map((e, k) => makeBot(e.id, e.name, e.color, k, settings.level, e.char));
  raceSize = list.length + 1;
  startRace(list.length);   // il giocatore parte in fondo alla griglia
}
// Pulsanti in gara: reagiscono appena il dito tocca, senza aspettare il "clic"
// (che il browser annulla se il dito si sposta anche di poco)
function onTap(el, fn) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); sfx.click(); fn(); });
  el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
}
onTap($('btn-pause'), pause);
onTap($('btn-cam'), () => {
  settings.view = ((settings.view || 0) + 1) % VIEWS.length; saveSettings();
  $('btn-cam').textContent = `🎥 ${VIEWS[settings.view].name}`;
  if (player) updateChaseCam(0, true);
});
$('btn-cam').textContent = `🎥 ${(VIEWS[settings.view] || VIEWS[0]).name}`;
$('btn-resume').onclick = resume;
$('btn-retry').onclick = () => startSolo();
$('btn-next').onclick = cupNext;
onTap($('btn-item'), () => { if (state === 'race') useItem(player, true); });
$('btn-menu').onclick = () => (net.active ? leaveMP() : toMenu());
$('btn-lobby').onclick = () => net.backToLobby();

// Sensori e schermo intero vanno chiesti qui, su un tap: in multiplayer la gara parte da un messaggio di rete
$('btn-host').onclick = async () => {
  $('lobby-msg').textContent = 'Creo la stanza…';
  try { await net.host(me(), raceCfg()); showLobby(true); }
  catch (e) { net.leave(); $('lobby-msg').textContent = e.message; }
};
$('btn-join').onclick = async () => {
  const code = $('code').value.trim();
  if (code.length !== 4) { $('lobby-msg').textContent = 'Il codice ha 4 lettere'; return; }
  $('code').blur();
  $('lobby-msg').textContent = 'Mi collego…';
  try { await net.join(code, me()); showLobby(true); }
  catch (e) { net.leave(); $('lobby-msg').textContent = e.message; }
};
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); });
$('btn-start').onclick = () => net.startRace(botEntries(lobbyBots()));
$('btn-leave').onclick = () => (net.active ? leaveMP() : toMenu());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); sfx.suspend(document.hidden); });

// ---------- Audio ----------
// Il browser lo sblocca solo dopo un tocco dell'utente
for (const ev of ['pointerdown', 'touchstart', 'keydown']) addEventListener(ev, () => sfx.initAudio(), { capture: true });
document.addEventListener('click', e => { if (e.target.closest('button')) sfx.click(); });
sfx.setMuted(settings.muted);
sfx.playMusic('menu');
function syncMute() {
  sfx.setMuted(settings.muted);
  $('btn-sound').textContent = settings.muted ? '🔇' : '🔊';
  $('sound').checked = !settings.muted;
}
onTap($('btn-sound'), () => { settings.muted = !settings.muted; saveSettings(); syncMute(); });
$('sound').onchange = e => { settings.muted = !e.target.checked; saveSettings(); syncMute(); };
syncMute();
let lastBeep = 4;
function updateAudio() {
  const p = player, racing = p && (state === 'race' || state === 'countdown' || state === 'finished');
  sfx.setEngine(racing, racing ? p.speed / MAX_SPEED : 0, racing && p.boost > 0);
  sfx.setDrift(racing && p.drift ? (p.driftT > 1.6 ? 3 : p.driftT > 0.8 ? 2 : 1) : 0);
}

// ---------- Loop ----------
const clock = new THREE.Clock();
let menuT = 0;
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state === 'menu' && menuScreen === 'scr-chars') {
    // Vetrina del pilota
    turntable.rotation.y += dt * 0.8;
    updateAudio();
    renderer.render(previewScene, previewCam);
    requestAnimationFrame(loop);
    return;
  }
  if (state === 'menu' || state === 'lobby') {
    // Giro panoramico sulla pista
    menuT += dt * 0.012;
    const a = curve.getPointAt(menuT % 1), b = curve.getPointAt((menuT + 0.03) % 1);
    camera.position.lerp(a.clone().setY(a.y + 18), 0.05);
    camera.lookAt(b);
    camera.fov = 70; camera.updateProjectionMatrix();
  } else if (player) {
    if (state === 'countdown') {
      countdownT -= dt;
      $('countdown').textContent = countdownT > 0 ? Math.ceil(countdownT) : 'VIA!';
      const n = countdownT > 0 ? Math.ceil(countdownT) : 0;
      if (n < lastBeep) { lastBeep = n; n ? sfx.beep() : sfx.go(); }
      if (countdownT <= 0) {
        state = 'race'; setTimeout(() => state === 'race' && show('countdown', false), 700);
        // Gas premuto nell'ultimo secondo = partenza a razzo; troppo presto = motore ingolfato
        const cd = player.gasCD;
        if (cd != null && cd <= 0.9) { startBoost(player, 1.2); toast('🚀 Partenza a razzo!'); }
        else if (cd != null && cd > 1.8) { player.stall = 0.8; toast('💨 Motore ingolfato!'); }
        for (const b of bots) if (Math.random() < b.L.boost) startBoost(b, 1.0);
      }
    }
    if (state === 'race') raceTime += dt;
    if (state === 'race' || state === 'countdown' || state === 'finished') updatePlayer(dt);
    if (state === 'race' || state === 'finished') for (const b of bots) updateBot(b, dt);
    if (state !== 'paused') updatePickups(dt);
    updateItemHUD();
    updateToast(dt);
    if (mp) { updateRemotes(dt); if (state === 'race') sendState(dt); }
    updateChaseCam(dt);
    updateHUD();
  }
  track?.update?.(performance.now() / 1000);
  updateAudio();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
camera.position.set(0, 30, 0);
loop();
