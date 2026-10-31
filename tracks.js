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
];

const lambert = c => new THREE.MeshLambertMaterial({ color: c });

export function buildTrack(def) {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(def.pts.map(([x, z]) => new THREE.Vector3(x * def.scale, 0, z * def.scale)), true, 'centripetal');
  const samples = curve.getSpacedPoints(N).slice(0, N);
  const tangents = samples.map((_, i) => curve.getTangentAt(i / N));
  const normals = tangents.map(t => new THREE.Vector3(-t.z, 0, t.x));
  const yawAt = i => Math.atan2(tangents[i].x, tangents[i].z);
  const add = (m, shadow = true) => { m.castShadow = shadow; m.receiveShadow = true; group.add(m); return m; };

  // Distanza dalla pista (controllo grossolano, basta per piazzare le decorazioni)
  const distToRoad = p => {
    let bd = Infinity;
    for (let j = 0; j < N; j += 3) bd = Math.min(bd, (samples[j].x - p.x) ** 2 + (samples[j].z - p.z) ** 2);
    return Math.sqrt(bd);
  };

  // Strada e cordoli come strisce lungo la curva
  function strip(offIn, offOut, y, colorFn) {
    const pos = [], col = [], idx = [], c = new THREE.Color();
    for (let i = 0; i <= N; i++) {
      const k = i % N, p = samples[k], n = normals[k];
      pos.push(p.x + n.x * offIn, y, p.z + n.z * offIn, p.x + n.x * offOut, y, p.z + n.z * offOut);
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
  add(new THREE.Mesh(strip(-ROAD_W, ROAD_W, 0.02, i => def.road[(i % 20 < 10) ? 0 : 1]), vcMat), false);
  for (const s of [1, -1]) add(new THREE.Mesh(strip(s * ROAD_W, s * (ROAD_W + 1.2), 0.04, i => def.kerb[(i % 6 < 3) ? 0 : 1]), vcMat), false);

  const ground = add(new THREE.Mesh(new THREE.PlaneGeometry(900, 900), lambert(def.ground)), false);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -70);

  // Traguardo a scacchi con arco
  {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 16;
    const ctx = cv.getContext('2d');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff'; ctx.fillRect(x * 4, y * 4, 4, 4); }
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter;
    // Piano orientato come la pista: larghezza (x locale) perpendicolare alla direzione di marcia
    const lineGeo = new THREE.PlaneGeometry(ROAD_W * 2, 3).rotateX(-Math.PI / 2);
    const line = add(new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ map: tex })), false);
    line.rotation.y = yawAt(0);
    line.position.copy(samples[0]).setY(0.05);
    for (const s of [1, -1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), lambert('#ffd23f')))
      .position.copy(samples[0]).addScaledVector(normals[0], s * (ROAD_W + 1.5)).setY(3.5);
    const beam = add(new THREE.Mesh(new THREE.BoxGeometry(ROAD_W * 2 + 4, 1.5, 0.8), lambert('#e8364f')));
    beam.position.copy(samples[0]).setY(7);
    beam.rotation.y = yawAt(0);
  }

  // Barriere a bordo pista
  {
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

  // Trampolino per il salto
  let jumpIdx = -1;
  if (def.jump) {
    jumpIdx = Math.round(def.jump * N);
    const i0 = jumpIdx - 6;
    const len = samples[i0].distanceTo(samples[jumpIdx]);
    const ramp = new THREE.Group();
    const slope = Math.atan2(1.6, len);
    const plank = mesh(new THREE.BoxGeometry(ROAD_W * 2 - 2, 0.3, len / Math.cos(slope)), lambert('#c0392b'), 0, 0.8, 0, ramp);
    plank.rotation.x = -slope;
    plank.receiveShadow = true;
    // Strisce gialle sul bordo
    mesh(new THREE.BoxGeometry(ROAD_W * 2 - 2, 0.32, 0.5), lambert('#ffd23f'), 0, 1.6, len / 2 - 0.2, ramp);
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

  return { def, group, curve, samples, tangents, normals, jumpIdx, tunnel: def.tunnel?.map(f => Math.round(f * N)) };
}
