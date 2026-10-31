import * as THREE from 'three';

export const N = 600;            // punti campionati lungo la linea centrale
export const ROAD_W = 7;         // metà larghezza strada
export const WALL = ROAD_W + 3;  // oltre questa distanza si sbatte contro il bordo

// Ogni pista: tracciato (punti x,z), colori del tema, aderenza e caratteristiche speciali
export const TRACKS = [
  {
    id: 'prato', name: 'Prato', icon: '🌳', desc: 'Curve dolci tra gli alberi', card: ['#5fb04a', '#2f7d32'], scale: 1.4,
    pts: [[0, 0], [60, 0], [95, -15], [105, -55], [80, -90], [35, -85], [15, -55], [-15, -45], [-45, -70], [-85, -60], [-95, -20], [-65, 10], [-30, 12]],
    sky: '#8fd3ff', fog: [120, 320], ground: '#5fb04a', road: ['#5a5a66', '#555561'], kerb: ['#e8364f', '#ffffff'],
    hemi: ['#ffffff', '#4a7d3a', 0.9], sun: ['#ffffff', 1.6], barrier: '#222222', grip: 1, deco: 'trees',
  },
  {
    id: 'deserto', name: 'Deserto', icon: '🏜️', desc: 'Sabbia, cactus e un trampolino', card: ['#e3a85a', '#c4693a'], scale: 1.25,
    pts: [[0, 0], [90, 0], [130, -25], [135, -80], [100, -115], [55, -95], [20, -120], [-40, -125], [-95, -95], [-105, -45], [-70, -5]],
    sky: '#ffd9a0', fog: [140, 360], ground: '#e3c27a', road: ['#9a8468', '#927c61'], kerb: ['#f2994a', '#ffffff'],
    hemi: ['#fff4e0', '#c79a52', 1.0], sun: ['#fff1d6', 1.8], barrier: '#b5833f', grip: 0.85, deco: 'desert',
    jump: 0.06,
  },
  {
    id: 'citta', name: 'Città di notte', icon: '🌃', desc: 'Curve a gomito tra i grattacieli', card: ['#3a3f8f', '#141838'], scale: 1.2,
    pts: [[0, 0], [70, 0], [82, -10], [82, -60], [70, -72], [25, -72], [12, -84], [12, -122], [0, -134], [-55, -134], [-68, -122], [-68, -12], [-55, 0]],
    sky: '#0b1030', fog: [60, 220], ground: '#2b2d3a', road: ['#3c3c48', '#383843'], kerb: ['#ffd23f', '#222222'],
    hemi: ['#8fa3ff', '#202030', 0.55], sun: ['#aab8ff', 0.6], barrier: '#ffd23f', grip: 1, deco: 'city',
  },
  {
    id: 'neve', name: 'Neve', icon: '❄️', desc: 'Ghiaccio scivoloso e una galleria', card: ['#8fb8de', '#4a6f9a'], scale: 1.3,
    pts: [[0, 0], [70, 10], [110, -20], [100, -70], [60, -80], [40, -120], [-10, -130], [-60, -100], [-70, -50], [-40, -30], [-60, 10], [-30, 20]],
    sky: '#cfe3f5', fog: [80, 260], ground: '#eef4fa', road: ['#a6b4c6', '#9fadbf'], kerb: ['#2f80ed', '#ffffff'],
    hemi: ['#ffffff', '#b8c8dc', 1.0], sun: ['#ffffff', 1.3], barrier: '#2f80ed', grip: 0.3, deco: 'snow',
    tunnel: [0.52, 0.62],
  },
  {
    id: 'stregata', name: 'Collina Stregata', icon: '🎃', desc: 'Villa infestata, cimitero e grotta', card: ['#5b2a86', '#1a0f2e'], scale: 1,
    // [x, z, altezza]: viale → tornante in salita → villa (+11 m) → salto sulla cripta → cimitero → grotta (−6 m) → ponte
    pts: [[0, 0, 0], [120, 0, 0], [200, -30, 2], [230, -110, 8], [180, -180, 10], [100, -190, 10], [40, -200, 11], [-10, -230, 11],
      [-60, -200, 11], [-110, -210, 4], [-180, -170, 0], [-220, -110, 0], [-200, -50, -2], [-150, -10, -6], [-120, 40, -3], [-60, 60, 1], [-20, 30, 0]],
    width: 11, terrain: true,
    sections: [
      { from: 6, to: 8, kind: 'villa', hw: 8, covered: true },
      { from: 10, to: 11, kind: 'cemetery' },
      { from: 12, to: 14, kind: 'cave', hw: 8, covered: true },
      { at: 15, span: 12, kind: 'bridge', hw: 9 },
    ],
    sectionRoad: { villa: ['#4a1f2a', '#2e1219'], cave: ['#3b3530', '#332d29'], bridge: ['#6b4a2b', '#5a3d22'] },
    sky: '#0d0820', fog: [70, 260], ground: '#1f2a1c', ground2: '#2b2238', road: ['#3a3846', '#34323f'], kerb: ['#f2994a', '#1a1a1a'],
    hemi: ['#9a8cff', '#2a2018', 1.15], sun: ['#c9d2ff', 1.0], barrier: '#f2994a', grip: 1, deco: 'halloween',
    arch: ['#f2994a', '#5b2a86'], rampColor: '#5a3d22', jumpPt: 9,
  },
];

const lambert = c => new THREE.MeshLambertMaterial({ color: c });
const clamp01 = t => Math.max(0, Math.min(1, t));

export function buildTrack(def) {
  const group = new THREE.Group();
  // Punti di controllo [x, z] oppure [x, z, altezza]
  const curve = new THREE.CatmullRomCurve3(def.pts.map(([x, z, y = 0]) => new THREE.Vector3(x * def.scale, y, z * def.scale)), true, 'centripetal');
  const samples = curve.getSpacedPoints(N).slice(0, N);
  const tangents = samples.map((_, i) => curve.getTangentAt(i / N));
  const normals = tangents.map(t => new THREE.Vector3(-t.z, 0, t.x).normalize());

  // Sezioni speciali (villa, grotta, ponte, ...) tra due punti di controllo: larghezza, muri e tipo di tratto
  const ptIdx = k => {
    const [x, z] = def.pts[k]; let best = 0, bd = Infinity;
    samples.forEach((s, i) => { const d = (s.x - x * def.scale) ** 2 + (s.z - z * def.scale) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const baseHW = def.width || ROAD_W;
  const hw = new Array(N).fill(baseHW), wall = new Array(N).fill(baseHW + 3), kind = new Array(N).fill('');
  // Una sezione va da un punto di controllo a un altro, oppure si estende di "span" campioni attorno a un punto
  const sections = (def.sections || []).map(sec => sec.at != null
    ? { ...sec, a: (ptIdx(sec.at) - sec.span + N) % N, b: (ptIdx(sec.at) + sec.span) % N }
    : { ...sec, a: ptIdx(sec.from), b: ptIdx(sec.to) });
  for (const sec of sections) {
    const len = (sec.b - sec.a + N) % N;
    for (let j = -12; j <= len + 12; j++) {
      const i = (sec.a + j + N) % N;
      // Raccordo graduale della larghezza ai due capi della sezione
      const t = clamp01(Math.min(j + 12, len + 12 - j) / 12);
      if (sec.hw) hw[i] = baseHW + (sec.hw - baseHW) * t;
      if (j >= 0 && j <= len) { kind[i] = sec.kind; if (sec.covered) wall[i] = hw[i] + 1.2; }
    }
  }
  for (let i = 0; i < N; i++) if (!kind[i] || !sections.find(s => s.kind === kind[i])?.covered) wall[i] = Math.max(wall[i], hw[i] + 3);
  const yawAt = i => Math.atan2(tangents[i].x, tangents[i].z);
  const add = (m, shadow = true) => { m.castShadow = shadow; m.receiveShadow = true; group.add(m); return m; };

  // Distanza dalla pista (controllo grossolano, basta per piazzare le decorazioni)
  const distToRoad = p => {
    let bd = Infinity;
    for (let j = 0; j < N; j += 3) bd = Math.min(bd, (samples[j].x - p.x) ** 2 + (samples[j].z - p.z) ** 2);
    return Math.sqrt(bd);
  };

  // Strada e cordoli come strisce lungo la curva (scostamenti e altezze possono variare punto per punto)
  const fn = v => (typeof v === 'function' ? v : () => v);
  function strip(offIn, offOut, y, colorFn, yOut = y) {
    const fi = fn(offIn), fo = fn(offOut), yi = fn(y), yo = fn(yOut);
    const pos = [], col = [], idx = [], c = new THREE.Color();
    for (let i = 0; i <= N; i++) {
      const k = i % N, p = samples[k], n = normals[k], a = fi(k), b = fo(k);
      pos.push(p.x + n.x * a, p.y + yi(k), p.z + n.z * a, p.x + n.x * b, p.y + yo(k), p.z + n.z * b);
      c.set(colorFn(i)); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const roadColor = i => { const k = i % N, sec = def.sectionRoad?.[kind[k]]; return (sec || def.road)[(i % 20 < 10) ? 0 : 1]; };
  add(new THREE.Mesh(strip(k => -hw[k], k => hw[k], 0.02, roadColor), vcMat), false);
  for (const s of [1, -1]) add(new THREE.Mesh(strip(k => s * hw[k], k => s * (hw[k] + 1.2), 0.04, i => def.kerb[(i % 6 < 3) ? 0 : 1]), vcMat), false);

  // Terreno: piatto per le piste classiche, modellato attorno alla strada per quelle con dislivelli
  const nearestSample = (x, z, step = 2) => {
    let best = 0, bd = Infinity;
    for (let j = 0; j < N; j += step) { const d = (samples[j].x - x) ** 2 + (samples[j].z - z) ** 2; if (d < bd) { bd = d; best = j; } }
    return { k: best, d: Math.sqrt(bd) };
  };
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const hills = (x, z) => 1.5 * Math.sin(x * 0.02) * Math.cos(z * 0.025) + 2 * Math.sin((x + z) * 0.011);
  const terrainH = (x, z) => {
    if (!def.terrain) return 0;
    const { k, d } = nearestSample(x, z);
    const roadY = samples[k].y - 0.35, inner = hw[k] + 6;
    // Sotto il ponte: burrone profondo
    if (kind[k] === 'bridge' && d > hw[k] + 1.5) return -16 + (hills(x, z) + 16) * smooth((d - hw[k] - 28) / 20);
    return roadY + (hills(x, z) - roadY) * smooth((d - inner) / 28);
  };
  if (def.terrain) {
    const bb = new THREE.Box3().setFromPoints(samples).expandByScalar(120), res = 4;
    const nx = Math.ceil((bb.max.x - bb.min.x) / res), nz = Math.ceil((bb.max.z - bb.min.z) / res);
    const g = new THREE.PlaneGeometry(nx * res, nz * res, nx, nz).rotateX(-Math.PI / 2);
    const pa = g.attributes.position, cols = [], c1 = new THREE.Color(def.ground), c2 = new THREE.Color(def.ground2 || def.ground);
    for (let v = 0; v < pa.count; v++) {
      const x = pa.getX(v) + (bb.min.x + bb.max.x) / 2, z = pa.getZ(v) + (bb.min.z + bb.max.z) / 2;
      const h = terrainH(x, z);
      pa.setXYZ(v, x, h, z);
      const c = c1.clone().lerp(c2, clamp01(0.5 + Math.sin(x * 0.07) * Math.cos(z * 0.06) * 0.5));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })), false);
  } else {
    const ground = add(new THREE.Mesh(new THREE.PlaneGeometry(900, 900), lambert(def.ground)), false);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -70);
  }

  // Traguardo a scacchi con arco
  {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 16;
    const ctx = cv.getContext('2d');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff'; ctx.fillRect(x * 4, y * 4, 4, 4); }
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter;
    // Piano orientato come la pista: larghezza (x locale) perpendicolare alla direzione di marcia
    const y0 = samples[0].y, w0 = hw[0];
    const lineGeo = new THREE.PlaneGeometry(w0 * 2, 3).rotateX(-Math.PI / 2);
    const line = add(new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ map: tex })), false);
    line.rotation.y = yawAt(0);
    line.position.copy(samples[0]).setY(y0 + 0.05);
    for (const s of [1, -1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), lambert(def.arch?.[0] || '#ffd23f')))
      .position.copy(samples[0]).addScaledVector(normals[0], s * (w0 + 1.5)).setY(y0 + 3.5);
    const beam = add(new THREE.Mesh(new THREE.BoxGeometry(w0 * 2 + 4, 1.5, 0.8), lambert(def.arch?.[1] || '#e8364f')));
    beam.position.copy(samples[0]).setY(y0 + 7);
    beam.rotation.y = yawAt(0);
  }

  // Barriere a bordo pista (le piste con terreno hanno le loro decorazioni)
  if (!def.terrain) {
    const g = new THREE.TorusGeometry(0.5, 0.25, 6, 10), m = lambert(def.barrier);
    for (let i = 0; i < N; i += 8) for (const s of [1, -1]) {
      const t = add(new THREE.Mesh(g, m), false);
      t.rotation.x = Math.PI / 2;
      t.position.copy(samples[i]).addScaledVector(normals[i], s * (WALL + 0.6)).setY(0.25);
    }
  }

  // Decorazioni del tema, sparse a caso (ma sempre uguali) attorno alla pista
  let seed = 12345;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const box = new THREE.Box3().setFromPoints(samples).expandByScalar(60);
  const scatter = (count, minDist, place) => {
    for (let t = 0; t < count; t++) {
      const p = new THREE.Vector3(box.min.x + rand() * (box.max.x - box.min.x), 0, box.min.z + rand() * (box.max.z - box.min.z));
      const d = distToRoad(p);
      if (d > minDist) place(p, d);
    }
  };
  const mesh = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  if (def.deco === 'trees' || def.deco === 'snow') {
    const snow = def.deco === 'snow';
    const trunkG = new THREE.CylinderGeometry(0.4, 0.5, 2.5, 6), leafG = new THREE.ConeGeometry(2.2, 5, 7), capG = new THREE.ConeGeometry(1.2, 2.2, 7);
    const trunkM = lambert('#7a4a2a'), leafM = lambert(snow ? '#24553a' : '#2f7d32'), capM = lambert('#ffffff');
    scatter(snow ? 220 : 170, WALL + 5, p => {
      const tree = new THREE.Group();
      mesh(trunkG, trunkM, 0, 1.25, 0, tree);
      mesh(leafG, leafM, 0, 4.5, 0, tree);
      if (snow) mesh(capG, capM, 0, 6.2, 0, tree);
      tree.position.copy(p);
      tree.scale.setScalar(0.8 + rand() * 0.7);
      group.add(tree);
    });
    if (snow) {
      // Pupazzi di neve a bordo pista
      const bG = new THREE.SphereGeometry(1, 10, 8), wM = lambert('#ffffff'), nM = lambert('#f2994a');
      for (let i = 40; i < N; i += 120) {
        const s = new THREE.Group();
        mesh(bG, wM, 0, 1, 0, s).scale.setScalar(1);
        mesh(bG, wM, 0, 2.3, 0, s).scale.setScalar(0.7);
        mesh(bG, wM, 0, 3.3, 0, s).scale.setScalar(0.5);
        mesh(new THREE.ConeGeometry(0.12, 0.6, 6), nM, 0, 3.3, 0.6, s).rotation.x = Math.PI / 2;
        s.position.copy(samples[i]).addScaledVector(normals[i], WALL + 3);
        s.rotation.y = yawAt(i) + Math.PI / 2;
        group.add(s);
      }
    }
  }

  if (def.deco === 'desert') {
    const cG = new THREE.CylinderGeometry(0.5, 0.6, 4, 8), aG = new THREE.CylinderGeometry(0.35, 0.35, 1.6, 8), cM = lambert('#4f8a3c');
    const rG = new THREE.DodecahedronGeometry(1.5), rM = lambert('#b0703c');
    scatter(140, WALL + 4, p => {
      const g = new THREE.Group();
      if (rand() < 0.55) {
        mesh(cG, cM, 0, 2, 0, g);
        mesh(aG, cM, 0.8, 2.4, 0, g).rotation.z = 0.2;
        mesh(aG, cM, -0.8, 1.9, 0, g).rotation.z = -0.2;
      } else {
        mesh(rG, rM, 0, 0.8, 0, g).rotation.set(rand() * 3, rand() * 3, 0);
      }
      g.position.copy(p);
      g.scale.setScalar(0.7 + rand() * 0.9);
      group.add(g);
    });
    // Altipiani rossi lontani
    const mM = lambert('#c4693a');
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, r = 260 + rand() * 60;
      const m = mesh(new THREE.CylinderGeometry(25 + rand() * 25, 35 + rand() * 25, 30 + rand() * 40, 7), mM, Math.cos(a) * r, 15, -70 + Math.sin(a) * r, group);
      m.castShadow = false;
    }
  }

  if (def.deco === 'city') {
    // Finestre accese: una texture condivisa da tutti i palazzi
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 10) for (let x = 4; x < 64; x += 10)
      if (rand() < 0.45) { ctx.fillStyle = ['#ffe9a8', '#fff3d6', '#a8d8ff'][Math.floor(rand() * 3)]; ctx.fillRect(x, y, 6, 6); }
    const winTex = new THREE.CanvasTexture(cv);
    const bMats = ['#2c3350', '#3a2f4f', '#263a4a'].map(c => new THREE.MeshLambertMaterial({ color: c, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0.9 }));
    scatter(170, WALL + 8, p => {
      const h = 10 + rand() * 40, w = 8 + rand() * 8;
      const b = mesh(new THREE.BoxGeometry(w, h, w), bMats[Math.floor(rand() * 3)], p.x, h / 2, p.z, group);
      b.castShadow = false;
    });
    // Lampioni con la luce "accesa"
    const poleG = new THREE.CylinderGeometry(0.15, 0.2, 6, 6), poleM = lambert('#555566');
    const bulbG = new THREE.SphereGeometry(0.5, 8, 6), bulbM = new THREE.MeshBasicMaterial({ color: '#ffe9a8' });
    const glowG = new THREE.CircleGeometry(4, 16), glowM = new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.12, depthWrite: false });
    for (let i = 0; i < N; i += 15) {
      const s = (i / 15) % 2 ? 1 : -1;
      const base = samples[i].clone().addScaledVector(normals[i], s * (ROAD_W + 2));
      mesh(poleG, poleM, base.x, 3, base.z, group);
      mesh(bulbG, bulbM, base.x, 6.2, base.z, group).castShadow = false;
      const glow = mesh(glowG, glowM, base.x - normals[i].x * s * 2, 0.06, base.z - normals[i].z * s * 2, group);
      glow.rotation.x = -Math.PI / 2; glow.castShadow = false;
    }
  }

  // Trampolino per il salto (posizione in frazione di giro o vicino a un punto di controllo)
  let jumpIdx = -1;
  if (def.jump || def.jumpPt != null) {
    jumpIdx = def.jumpPt != null ? ptIdx(def.jumpPt) : Math.round(def.jump * N);
    const i0 = jumpIdx - 6;
    const len = samples[i0].distanceTo(samples[jumpIdx]);
    const ramp = new THREE.Group();
    const slope = Math.atan2(1.6, len);
    const plank = mesh(new THREE.BoxGeometry(hw[jumpIdx] * 2 - 2, 0.3, len / Math.cos(slope)), lambert(def.rampColor || '#c0392b'), 0, 0.8, 0, ramp);
    plank.rotation.x = -slope;
    plank.receiveShadow = true;
    // Strisce gialle sul bordo
    mesh(new THREE.BoxGeometry(hw[jumpIdx] * 2 - 2, 0.32, 0.5), lambert('#ffd23f'), 0, 1.6, len / 2 - 0.2, ramp);
    ramp.position.copy(samples[i0].clone().lerp(samples[jumpIdx], 0.5));
    ramp.rotation.y = yawAt(i0);
    group.add(ramp);
  }

  // Galleria
  if (def.tunnel) {
    const [a, b] = def.tunnel.map(f => Math.round(f * N));
    const wallM = lambert('#6b7280'), roofM = lambert('#4b5563');
    const lightM = new THREE.MeshBasicMaterial({ color: '#fff3c4' });
    for (let i = a; i <= b; i += 3) {
      const seg = new THREE.Group();
      for (const s of [1, -1]) mesh(new THREE.BoxGeometry(1.2, 7, 3.2), wallM, s * (WALL + 0.8), 3.5, 0, seg);
      mesh(new THREE.BoxGeometry(WALL * 2 + 3, 1.2, 3.2), roofM, 0, 7.4, 0, seg).castShadow = false;
      if ((i - a) % 9 === 0) mesh(new THREE.BoxGeometry(2, 0.15, 0.6), lightM, 0, 6.75, 0, seg).castShadow = false;
      // Neve sul tetto
      mesh(new THREE.BoxGeometry(WALL * 2 + 3.4, 0.5, 3.4), lambert('#ffffff'), 0, 8.2, 0, seg).castShadow = false;
      seg.position.copy(samples[i]);
      seg.rotation.y = yawAt(i);
      group.add(seg);
    }
  }

  // Animazioni degli oggetti di scena (fantasmi, fuochi fatui, ...): chiamate a ogni fotogramma
  const anim = [];
  if (def.deco === 'halloween') buildHalloween({ def, group, samples, tangents, normals, hw, wall, kind, sections, ptIdx, terrainH, yawAt, mesh, rand, nearestSample, anim });

  return { def, group, curve, samples, tangents, normals, jumpIdx, tunnel: def.tunnel?.map(f => Math.round(f * N)), hw, wall, kind, terrainH,
    update: t => { for (const f of anim) f(t); } };
}


// ---------- Collina Stregata: oggetti di scena (forme semplici, da sostituire poi con modelli 3D) ----------
function buildHalloween({ def, group, samples, tangents, normals, hw, wall, kind, sections, ptIdx, terrainH, yawAt, mesh, rand, nearestSample, anim }) {
  const M = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e || '#000000' });
  const glow = c => new THREE.MeshBasicMaterial({ color: c });
  const N_ = samples.length;
  const at = (i, side, off, up = 0) => samples[i].clone().addScaledVector(normals[i], side * off).add(new THREE.Vector3(0, up, 0));
  const onGround = p => p.setY(terrainH(p.x, p.z));
  const range = (a, b, step, f) => { const len = (b - a + N_) % N_; for (let j = 0; j <= len; j += step) f((a + j) % N_, j, len); };
  const secOf = k => sections.find(s => s.kind === k);

  // Luna piena
  const moon = new THREE.Mesh(new THREE.SphereGeometry(18, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff4d6', fog: false }));
  moon.position.set(-260, 150, -380); group.add(moon);

  // Zucca con la faccia illuminata
  const pumpkinG = new THREE.SphereGeometry(0.8, 12, 8); pumpkinG.scale(1, 0.8, 1);
  const pumpkinM = M('#e8761c', '#5a2600'), stemM = M('#3b5a1e'), faceM = glow('#ffd23f');
  const pumpkin = (p, s = 1, yaw = 0) => {
    const g = new THREE.Group();
    mesh(pumpkinG, pumpkinM, 0, 0.6, 0, g);
    mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.35, 5), stemM, 0, 1.3, 0, g);
    for (const x of [-0.25, 0.25]) mesh(new THREE.ConeGeometry(0.12, 0.2, 3), faceM, x, 0.75, 0.72, g).rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), faceM, 0, 0.45, 0.74, g);
    g.position.copy(p); g.scale.setScalar(s); g.rotation.y = yaw; group.add(g);
    return g;
  };
  // Albero spoglio
  const barkM = M('#2a1f1a');
  const deadTree = (p, s = 1) => {
    const g = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.25, 0.45, 5, 6), barkM, 0, 2.5, 0, g);
    for (const [a, h, l] of [[0.6, 3.6, 2.4], [-0.8, 4.2, 2], [2.4, 3, 1.8], [-2.2, 4.6, 1.5]]) {
      const b = mesh(new THREE.CylinderGeometry(0.06, 0.16, l, 5), barkM, Math.cos(a) * l * 0.35, h, Math.sin(a) * l * 0.35, g);
      b.rotation.z = Math.cos(a) * 0.9; b.rotation.x = -Math.sin(a) * 0.9;
    }
    g.position.copy(p); g.scale.setScalar(s); g.rotation.y = rand() * 6; group.add(g);
  };
  // Lapide e croce
  const stoneM = M('#6b6f78'), stoneDark = M('#4a4d55');
  const tomb = (p, yaw) => {
    const g = new THREE.Group();
    if (rand() < 0.65) {
      mesh(new THREE.BoxGeometry(1, 1.3, 0.25), rand() < 0.5 ? stoneM : stoneDark, 0, 0.65, 0, g);
      mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), stoneM, 0, 1.3, 0, g);
    } else {
      mesh(new THREE.BoxGeometry(0.22, 1.7, 0.22), stoneDark, 0, 0.85, 0, g);
      mesh(new THREE.BoxGeometry(0.9, 0.22, 0.22), stoneDark, 0, 1.25, 0, g);
    }
    g.position.copy(p); g.rotation.set((rand() - 0.5) * 0.25, yaw + (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.2); group.add(g);
  };
  // Fantasma che fluttua
  const ghostM = new THREE.MeshLambertMaterial({ color: '#e8f0ff', emissive: '#506080', transparent: true, opacity: 0.7 });
  const ghost = (p, phase) => {
    const g = new THREE.Group();
    mesh(new THREE.SphereGeometry(0.7, 12, 10), ghostM, 0, 1.6, 0, g);
    mesh(new THREE.ConeGeometry(0.75, 1.6, 12, 1, true), ghostM, 0, 0.7, 0, g).rotation.x = Math.PI;
    for (const x of [-0.22, 0.22]) mesh(new THREE.SphereGeometry(0.1, 6, 4), glow('#111'), x, 1.7, 0.6, g);
    g.position.copy(p); group.add(g);
    const y0 = p.y;
    anim.push(t => { g.position.y = y0 + Math.sin(t * 1.5 + phase) * 0.5; g.rotation.y = Math.sin(t * 0.7 + phase) * 0.8; });
  };
  const wisp = (p, phase) => {
    const m = mesh(new THREE.SphereGeometry(0.25, 8, 6), glow('#7fe8ff'), p.x, p.y, p.z, group);
    const { x, y, z } = p;
    anim.push(t => { m.position.set(x + Math.sin(t * 0.9 + phase) * 1.5, y + Math.sin(t * 2 + phase) * 0.4, z + Math.cos(t * 0.8 + phase) * 1.5); });
  };

  // 1. Viale delle zucche e curva finale: zucche e lanterne a bordo strada
  const lampM = M('#2a2a30'), flameM = glow('#ffb347');
  range(ptIdx(16), ptIdx(2), 6, (i, j) => {
    for (const s of [1, -1]) {
      const p = at(i, s, hw[i] + 3); onGround(p);
      pumpkin(p, 0.9 + rand() * 0.6, yawAt(i) + (s > 0 ? -Math.PI / 2 : Math.PI / 2));
      if (j % 18 === 0) {
        const q = at(i, s, hw[i] + 5.5); onGround(q);
        mesh(new THREE.CylinderGeometry(0.1, 0.12, 4, 6), lampM, q.x, q.y + 2, q.z, group);
        mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), flameM, q.x, q.y + 4.2, q.z, group).castShadow = false;
      }
    }
  });
  // Zucca gigante e spaventapasseri vicino al traguardo
  { const i = ptIdx(16); pumpkin(onGround(at(i, -1, hw[i] + 9)), 4, yawAt(i) + Math.PI / 2); }

  // 2. Tornante della strega: calderone fumante e alberi spogli
  {
    const i = ptIdx(3), p = onGround(at(i, -1, hw[i] + 10));
    mesh(new THREE.CylinderGeometry(1.6, 1.1, 1.8, 12), M('#1a1a1f'), p.x, p.y + 1, p.z, group);
    mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.1, 12), glow('#5dff7a'), p.x, p.y + 1.85, p.z, group);
    for (let k = 0; k < 3; k++) {
      const b = mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: '#9dffb0', transparent: true, opacity: 0.6 }), p.x, p.y + 2, p.z, group);
      anim.push(t => { const f = (t * 0.6 + k / 3) % 1; b.position.y = p.y + 2 + f * 3; b.material.opacity = 0.6 * (1 - f); });
    }
  }
  range(ptIdx(2), ptIdx(5), 9, i => { for (const s of [1, -1]) if (rand() < 0.7) deadTree(onGround(at(i, s, hw[i] + 7 + rand() * 12)), 0.9 + rand() * 0.6); });

  // 3–4. Villa abbandonata: corridoio coperto con colonne, lampadari, quadri e fantasmi
  {
    const sec = secOf('villa'), wallM = M('#3a2f45'), trimM = M('#1f1826'), roofM = M('#241a2e'), winM = glow('#ffcf6b'), colM = M('#8a8090');
    range(sec.a, sec.b, 2, (i, j) => {
      const y = samples[i].y, w = wall[i] + 0.6, seg = new THREE.Group();
      for (const s of [1, -1]) {
        mesh(new THREE.BoxGeometry(1, 11, 5.4), wallM, s * w, 5.5, 0, seg);
        if (j % 8 === 0) mesh(new THREE.BoxGeometry(0.2, 2.6, 1.6), winM, s * (w - 0.55), 5.5, 0, seg).castShadow = false;
        if (j % 8 === 4) mesh(new THREE.BoxGeometry(0.15, 1.8, 2.4), M('#5b2a2a'), s * (w - 0.55), 4.5, 0, seg); // quadro
        if (j % 12 === 6) mesh(new THREE.CylinderGeometry(0.45, 0.55, 10, 8), colM, s * (w - 1.2), 5, 0, seg);
      }
      mesh(new THREE.BoxGeometry(w * 2 + 1, 0.8, 5.4), trimM, 0, 11.2, 0, seg).castShadow = false;
      // Tetto a due falde
      for (const s of [1, -1]) {
        const r = mesh(new THREE.BoxGeometry(w + 2.5, 0.6, 5.6), roofM, s * (w + 2.5) / 2.2, 13.5, 0, seg);
        r.rotation.z = -s * 0.55; r.castShadow = false;
      }
      if (j % 10 === 5) { // lampadario
        mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 4), trimM, 0, 9.8, 0, seg);
        mesh(new THREE.TorusGeometry(1.1, 0.12, 6, 14).rotateX(Math.PI / 2), M('#c9a227'), 0, 8.8, 0, seg);
        for (let k = 0; k < 5; k++) mesh(new THREE.ConeGeometry(0.1, 0.35, 5), glow('#ffd27a'), Math.cos(k * 1.26) * 1.1, 9.1, Math.sin(k * 1.26) * 1.1, seg).castShadow = false;
      }
      seg.position.set(samples[i].x, y, samples[i].z);
      seg.rotation.y = yawAt(i);
      group.add(seg);
    });
    // Facciata con torri all'ingresso e all'uscita
    for (const [i, dir] of [[sec.a, -1], [sec.b, 1]]) {
      const y = samples[i].y, w = wall[i] + 0.6, f = new THREE.Group();
      for (const s of [1, -1]) {
        mesh(new THREE.BoxGeometry(14, 16, 2), wallM, s * (w + 7), 8, 0, f);
        mesh(new THREE.CylinderGeometry(3, 3, 20, 10), wallM, s * (w + 15), 10, 0, f);
        mesh(new THREE.ConeGeometry(3.6, 7, 10), roofM, s * (w + 15), 23.5, 0, f);
        for (const h of [6, 12]) mesh(new THREE.BoxGeometry(1.4, 2, 0.3), winM, s * (w + 7), h, -dir * 1.1, f).castShadow = false;
      }
      mesh(new THREE.BoxGeometry(w * 2 + 2, 5, 2), wallM, 0, 13.5, 0, f);           // sopra il portone
      const gable = mesh(new THREE.ConeGeometry(w + 3, 6, 4), roofM, 0, 19, 0, f);  // timpano
      gable.rotation.y = Math.PI / 4; gable.scale.set(1, 1, 0.25);
      mesh(new THREE.CircleGeometry(1.2, 16), winM, 0, 14, -dir * 1.05, f).rotation.y = dir > 0 ? 0 : Math.PI;
      f.position.set(samples[i].x, y, samples[i].z);
      f.rotation.y = yawAt(i);
      group.add(f);
    }
    // Fantasmi che attraversano il salone
    range(sec.a, sec.b, 1, (i, j, len) => { if (j === Math.round(len * 0.3) || j === Math.round(len * 0.7)) ghost(at(i, j < len / 2 ? 1 : -1, hw[i] * 0.5, 2.5), j); });
  }

  // Giardino della villa: fontana rotta e statue
  {
    const i = ptIdx(5), p = onGround(at(i, 1, hw[i] + 12));
    mesh(new THREE.CylinderGeometry(3.5, 3.8, 1, 16), stoneM, p.x, p.y + 0.5, p.z, group);
    mesh(new THREE.CylinderGeometry(0.5, 0.7, 3, 8), stoneM, p.x, p.y + 2, p.z, group);
    mesh(new THREE.CylinderGeometry(1.6, 1.2, 0.5, 12), stoneDark, p.x + 0.4, p.y + 3.4, p.z, group).rotation.z = 0.35;
    for (const s of [1, -1]) {
      const q = onGround(at(ptIdx(4), s, hw[ptIdx(4)] + 6));
      mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), stoneDark, q.x, q.y + 0.7, q.z, group);
      mesh(new THREE.CapsuleGeometry(0.5, 1.6, 4, 8), stoneM, q.x, q.y + 2.8, q.z, group);
    }
  }

  // 5. Discesa: scalinata del giardino posteriore e cripta sotto il salto
  {
    const i = ptIdx(9), p = at(i, -1, hw[i] + 14); onGround(p);
    const c = new THREE.Group();
    mesh(new THREE.BoxGeometry(8, 5, 6), stoneDark, 0, 2.5, 0, c);
    const roof = mesh(new THREE.ConeGeometry(6, 3, 4), stoneM, 0, 6.5, 0, c); roof.rotation.y = Math.PI / 4;
    mesh(new THREE.BoxGeometry(2, 3, 0.2), M('#120d14'), 0, 1.5, 3.05, c);
    c.position.copy(p); c.rotation.y = yawAt(i); group.add(c);
  }

  // 6. Cimitero: recinto di ferro, lapidi, mausoleo, fuochi fatui
  {
    const sec = secOf('cemetery'), ironM = M('#15151a');
    range((sec.a - 20 + N_) % N_, (sec.b + 20) % N_, 3, i => {
      for (const s of [1, -1]) {
        const q = onGround(at(i, s, hw[i] + 2.6));
        mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 4), ironM, q.x, q.y + 0.9, q.z, group);
        mesh(new THREE.ConeGeometry(0.12, 0.3, 4), ironM, q.x, q.y + 1.9, q.z, group);
        for (let k = 0; k < 3; k++) if (rand() < 0.6) tomb(onGround(at(i, s, hw[i] + 5 + rand() * 18)), yawAt(i) + (s > 0 ? -Math.PI / 2 : Math.PI / 2));
        if (rand() < 0.25) wisp(at(i, s, hw[i] + 4 + rand() * 8, 1.5 + rand()), i);
      }
    });
    // Mausoleo all'interno della curva
    const i = ptIdx(11), p = onGround(at(i, 1, hw[i] + 18)), m = new THREE.Group();
    mesh(new THREE.BoxGeometry(10, 1, 10), stoneM, 0, 0.5, 0, m);
    for (const x of [-4, 4]) for (const z of [-4, 4]) mesh(new THREE.CylinderGeometry(0.5, 0.5, 6, 8), stoneM, x, 4, z, m);
    mesh(new THREE.BoxGeometry(7, 6, 7), stoneDark, 0, 4, 0, m);
    mesh(new THREE.BoxGeometry(10.5, 1, 10.5), stoneM, 0, 7.5, 0, m);
    mesh(new THREE.SphereGeometry(4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), stoneDark, 0, 8, 0, m);
    mesh(new THREE.BoxGeometry(2, 3.5, 0.2), glow('#3dffa0'), 0, 2.8, 3.55, m).castShadow = false;
    m.position.copy(p); m.rotation.y = yawAt(i) - Math.PI / 2; group.add(m);
  }

  // 7. Grotta: pareti di roccia, volta, stalattiti e cristalli luminosi
  {
    const sec = secOf('cave'), rockM = M('#3d3833'), rockM2 = M('#2c2824'), crystalM = new THREE.MeshLambertMaterial({ color: '#5dff9a', emissive: '#1f9c4a' });
    const rockG = new THREE.DodecahedronGeometry(1, 0);
    range(sec.a, sec.b, 2, (i, j) => {
      const y = samples[i].y, w = wall[i] + 1.8;
      for (const s of [1, -1]) {
        const r = mesh(rockG, rand() < 0.5 ? rockM : rockM2, 0, 0, 0, group);
        r.position.copy(at(i, s, w + rand())).setY(y + 3 + rand() * 2);
        r.scale.set(2.5 + rand() * 1.5, 5 + rand() * 2, 2.5 + rand() * 1.5); r.rotation.set(rand() * 3, rand() * 3, rand() * 3);
        if (j % 6 === 0) {
          const c = mesh(new THREE.OctahedronGeometry(0.6), crystalM, 0, 0, 0, group);
          c.position.copy(at(i, s, w - 2.2)).setY(y + 0.6 + rand() * 3); c.scale.set(0.6, 1.6 + rand(), 0.6); c.rotation.z = (rand() - 0.5) * 0.8;
        }
      }
      // Volta: massi appiattiti sopra la strada
      const roof = mesh(rockG, rockM2, 0, 0, 0, group);
      roof.position.copy(samples[i]).setY(y + 10.5);
      roof.scale.set(w * 1.15, 2.5, 3.5); roof.rotation.y = yawAt(i); roof.castShadow = false;
      if (j % 4 === 2) {
        const st = mesh(new THREE.ConeGeometry(0.4, 2.5 + rand() * 2, 6), rockM, 0, 0, 0, group);
        st.position.copy(at(i, rand() < 0.5 ? 1 : -1, rand() * (hw[i] - 1))).setY(y + 8); st.rotation.x = Math.PI;
      }
    });
    // Pipistrelli che volano sotto la volta
    range(sec.a, sec.b, 1, (i, j, len) => {
      if (j % Math.max(1, Math.round(len / 4)) !== 1) return;
      const b = new THREE.Group(), bm = M('#0a0a0d');
      mesh(new THREE.SphereGeometry(0.2, 6, 4), bm, 0, 0, 0, b);
      const wl = mesh(new THREE.BoxGeometry(0.7, 0.04, 0.3), bm, -0.4, 0, 0, b), wr = mesh(new THREE.BoxGeometry(0.7, 0.04, 0.3), bm, 0.4, 0, 0, b);
      const c = samples[i].clone().setY(samples[i].y + 6.5); group.add(b);
      anim.push(t => { const a = t * 1.3 + j; b.position.set(c.x + Math.cos(a) * 4, c.y + Math.sin(a * 2) * 0.5, c.z + Math.sin(a) * 4); b.rotation.y = -a; wl.rotation.z = Math.sin(t * 20) * 0.6; wr.rotation.z = -Math.sin(t * 20) * 0.6; });
    });
  }

  // 8. Ponte sul burrone: parapetti di corda e pali, nebbia sotto
  {
    const sec = secOf('bridge'), woodM = M('#4a3220'), ropeM = M('#8a7350');
    range((sec.a - 14 + N_) % N_, (sec.b + 14) % N_, 3, i => {
      for (const s of [1, -1]) {
        const q = at(i, s, hw[i] + 0.8);
        mesh(new THREE.CylinderGeometry(0.15, 0.15, 2, 5), woodM, q.x, q.y + 1, q.z, group);
        const r = mesh(new THREE.BoxGeometry(0.08, 0.08, 7.6), ropeM, q.x, q.y + 1.8, q.z, group);
        r.rotation.y = yawAt(i); r.castShadow = false;
      }
      const under = mesh(new THREE.BoxGeometry(hw[i] * 2 + 2, 0.6, 8), woodM, samples[i].x, samples[i].y - 0.4, samples[i].z, group);
      under.rotation.y = yawAt(i);
    });
    const mid = samples[sec.a];
    const fog = new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#6b5a8a', transparent: true, opacity: 0.35, depthWrite: false }));
    fog.position.set(mid.x, -10, mid.z); group.add(fog);
  }

  // Alberi spogli sparsi sulle colline (lontano dalla strada)
  const bb = new THREE.Box3().setFromPoints(samples).expandByScalar(90);
  for (let t = 0; t < 140; t++) {
    const x = bb.min.x + rand() * (bb.max.x - bb.min.x), z = bb.min.z + rand() * (bb.max.z - bb.min.z);
    const { k, d } = nearestSample(x, z, 4);
    if (d < hw[k] + 14 || kind[k] === 'bridge') continue;
    deadTree(new THREE.Vector3(x, terrainH(x, z), z), 0.9 + rand() * 0.9);
  }
}
