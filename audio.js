// Tutto l'audio è sintetizzato con Web Audio: niente file da scaricare.
let ctx, master, sfxBus, musicBus, noiseBuf;
let muted = false, pendingSong = null;
let eng, drift;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended' && !document.hidden) ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = bus(muted ? 0 : 1, ctx.destination);
  sfxBus = bus(0.5, master);
  musicBus = bus(0.16, master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  setupEngine();
  setupDrift();
  setInterval(scheduleMusic, 25);
  if (pendingSong) playMusic(pendingSong);
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
}
export function suspend(on) {
  if (!ctx) return;
  on ? ctx.suspend() : ctx.resume();
}

function bus(v, to) { const g = ctx.createGain(); g.gain.value = v; g.connect(to); return g; }
const midi = m => 440 * 2 ** ((m - 69) / 12);

// ---------- Motore ----------
function setupEngine() {
  const out = bus(0, sfxBus);
  // Suono morbido: triangolo + sottofondo, filtro senza risonanza e un leggero tremolio
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 0.7; filter.connect(out);
  const a = ctx.createOscillator(); a.type = 'triangle';
  const b = ctx.createOscillator(); b.type = 'square';
  const bg = bus(0.25, filter);
  a.connect(filter); b.connect(bg);
  const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
  lfo.frequency.value = 9; lfoGain.gain.value = 3;
  lfo.connect(lfoGain); lfoGain.connect(a.frequency); lfoGain.connect(b.frequency);
  a.start(); b.start(); lfo.start();
  eng = { out, filter, a, b };
}
// Cambio marce solo sonoro: 5 marce, ognuna copre una fascia di velocità.
// La quinta arriva oltre la velocità massima, così in crociera il motore resta a metà giri.
const GEARS = [0, 0.16, 0.34, 0.54, 0.76, 1.35];
let gear = 0, shiftUntil = 0;

// ratio = velocità / velocità massima (0..1.3)
export function setEngine(on, ratio = 0, boost = false) {
  if (!ctx) return;
  const t = ctx.currentTime, r = Math.min(Math.abs(ratio), 1.3);
  // Sale di marcia a fine fascia, scala con un po' di margine (niente su e giù continui)
  if (gear < 4 && r > GEARS[gear + 1]) { gear++; shiftUntil = t + 0.12; }
  else if (gear > 0 && r < GEARS[gear] - 0.04) gear--;
  const rpm = Math.min(1, (r - GEARS[gear]) / (GEARS[gear + 1] - GEARS[gear]));
  const shifting = t < shiftUntil;

  const f = 42 + rpm * 58 + gear * 4 + (boost ? 12 : 0);
  // In cambiata il tono crolla subito; poi sale dolcemente con i giri
  const k = shifting ? 0.015 : 0.06;
  eng.a.frequency.setTargetAtTime(f, t, k);
  eng.b.frequency.setTargetAtTime(f / 2, t, k);
  eng.filter.frequency.setTargetAtTime(220 + rpm * 700 + (boost ? 400 : 0), t, 0.08);
  // Piccolo stacco del gas durante la cambiata
  const vol = on ? (shifting ? 0.04 : 0.09 + rpm * 0.05) : 0;
  eng.out.gain.setTargetAtTime(vol, t, shifting ? 0.02 : 0.08);
  if (!on) gear = 0;
}

// ---------- Drift ----------
function setupDrift() {
  const out = bus(0, sfxBus);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.connect(out);
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.connect(f); src.start();
  drift = { out, f, level: 0 };
}
// level: 0 niente, 1 derapata, 2 scintille blu, 3 arancioni
export function setDrift(level) {
  if (!ctx) return;
  const t = ctx.currentTime;
  drift.out.gain.setTargetAtTime(level ? 0.16 : 0, t, 0.04);
  drift.f.frequency.setTargetAtTime([1500, 1500, 2300, 3200][level], t, 0.05);
  if (level > drift.level && level >= 2) tone(level === 2 ? 880 : 1320, 0.12, 'triangle', 0.25);
  drift.level = level;
}

// ---------- Effetti ----------
function tone(freq, dur, type = 'square', vol = 0.3, slideTo = 0, when = 0, dest = sfxBus) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, type = 'lowpass', f0 = 1000, f1 = 0, when = 0, dest = sfxBus) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

export const beep = () => tone(523, 0.18, 'square', 0.25);
export const go = () => { tone(1046, 0.5, 'square', 0.25); tone(784, 0.5, 'square', 0.15); };
export const click = () => tone(660, 0.05, 'square', 0.12);
export const boost = () => { noise(0.6, 0.35, 'highpass', 400, 4000); tone(220, 0.5, 'sawtooth', 0.15, 880); };
export const bump = () => { tone(110, 0.18, 'sine', 0.6, 40); noise(0.12, 0.3, 'lowpass', 900); };
export const jump = () => tone(260, 0.3, 'triangle', 0.3, 720);
export const land = () => { tone(90, 0.16, 'sine', 0.6, 40); noise(0.15, 0.25, 'lowpass', 600); };
export const gem = () => { tone(1568, 0.08, 'square', 0.12); tone(2093, 0.12, 'square', 0.1, 0, 0.06); };
export const box = () => { for (let i = 0; i < 6; i++) tone(600 + i * 120, 0.06, 'square', 0.1, 0, i * 0.08); };
export const shield = () => tone(400, 0.4, 'sine', 0.3, 1200);
export const drop = () => { tone(180, 0.2, 'sine', 0.35, 70); noise(0.2, 0.2, 'lowpass', 500); };
export const rocket = () => { noise(0.7, 0.3, 'bandpass', 600, 2500); tone(300, 0.5, 'sawtooth', 0.12, 120); };
export const trick = () => tone(500, 0.25, 'triangle', 0.25, 1500);
export const lap = () => { tone(784, 0.12, 'square', 0.2); tone(1046, 0.25, 'square', 0.2, 0, 0.12); };
export function fanfare() {
  [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'square', 0.22, 0, i * 0.13));
  tone(1046, 0.8, 'square', 0.2, 0, 0.55);
  tone(784, 0.8, 'triangle', 0.25, 0, 0.55);
}

// ---------- Musica ----------
// Pattern di 32 sedicesimi: numero = semitoni sopra la tonica, "." = pausa
const seq = s => s.trim().split(/\s+/).map(x => (x === '.' ? null : +x));
const SONGS = {
  menu: { bpm: 112, root: 48, lead: 'square', drums: false,
    bass: seq('0 . . 0 . . 0 . 5 . . 5 . . 7 . 9 . . 9 . . 9 . 7 . . 7 . . 7 .'),
    melody: seq('24 . 28 . 31 . 28 . 29 . 28 . 26 . . . 28 . 31 . 33 . 31 . 28 . 26 . 24 . . .') },
  prato: { bpm: 140, root: 50, lead: 'square', drums: true,
    bass: seq('0 . 12 . 0 . 12 . 5 . 17 . 5 . 17 . 7 . 19 . 7 . 19 . 5 . 17 . 7 . 19 .'),
    melody: seq('12 . 16 19 . 16 . 12 17 . 21 . 19 . 17 . 19 . 23 . 26 . 23 . 21 . 19 . 17 . 16 .') },
  deserto: { bpm: 128, root: 52, lead: 'sawtooth', drums: true,
    bass: seq('0 . 0 . 1 . 0 . 0 . 0 . 1 . 0 . 8 . 8 . 7 . 5 . 4 . 4 . 5 . 4 .'),
    melody: seq('12 . 13 . 16 . . 13 12 . . . 17 16 13 . 19 . 20 . 19 . 16 . 17 . 16 . 13 . 12 .') },
  citta: { bpm: 108, root: 45, lead: 'sawtooth', drums: true,
    bass: seq('0 0 12 0 0 0 12 0 8 8 20 8 8 8 20 8 3 3 15 3 3 3 15 3 10 10 22 10 7 7 19 7'),
    melody: seq('24 . . . 27 . . 31 . . 29 . 27 . . . 24 . . . 22 . 24 . 27 . . . . . . .') },
  neve: { bpm: 120, root: 53, lead: 'triangle', drums: true,
    bass: seq('0 . . . 7 . . . 2 . . . 7 . . . 4 . . . 11 . . . 2 . . . 7 . . .'),
    melody: seq('24 31 28 31 24 31 28 31 26 31 30 31 26 31 30 31 28 35 31 35 28 35 31 35 26 31 30 31 26 31 30 31') },
};
let song = null, step = 0, nextT = 0, songId = null;

export function playMusic(id) {
  pendingSong = id;
  if (!ctx || songId === id) return;
  songId = id; song = SONGS[id] || null; step = 0; nextT = ctx.currentTime + 0.1;
}
export function stopMusic() { song = null; songId = null; pendingSong = null; }

function scheduleMusic() {
  if (!song || ctx.state !== 'running') return;
  const dt = 60 / song.bpm / 4;
  if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.02;
  while (nextT < ctx.currentTime + 0.12) {
    const i = step % 32, when = nextT - ctx.currentTime;
    const b = song.bass[i], m = song.melody[i];
    if (b != null) tone(midi(song.root - 12 + b), dt * 1.8, 'triangle', 0.5, 0, when, musicBus);
    if (m != null) tone(midi(song.root + m), dt * 1.6, song.lead, 0.22, 0, when, musicBus);
    if (song.drums) {
      if (i % 8 === 0) tone(120, 0.14, 'sine', 0.8, 40, when, musicBus);          // cassa
      if (i % 8 === 4) noise(0.12, 0.35, 'highpass', 1500, 0, when, musicBus);    // rullante
      if (i % 2 === 0) noise(0.03, 0.12, 'highpass', 7000, 0, when, musicBus);    // charleston
    }
    nextT += dt; step++;
  }
}
