import * as THREE from 'three';
import { S } from './strings';

export const ROAD_W = 14;
export const CURB_W = 1.4;
/** Lateral distance from the centerline to the guard rails. */
export const BARRIER = ROAD_W / 2 + 10;
/** Lateral acceleration used for the reference speed profile (m/s²). */
export const REF_GRIP = 14;

// Circuit layout in meters (x, z), ~2.1 km. Start/finish straight runs along +x.
const CTRL: [number, number][] = [
  [-120, 0], [80, 0], [230, 0], [340, 30], [390, 140], [330, 250], [200, 262], [130, 340],
  [180, 450], [80, 525], [-90, 485], [-150, 360], [-250, 300], [-305, 165], [-220, 45],
];

export interface Loc {
  i: number;
  /** Distance along the track (m). */
  s: number;
  /** Signed lateral offset; positive = right of travel direction. */
  d: number;
}

export class TrackData {
  readonly N: number;
  readonly ds: number;
  readonly L: number;
  readonly xs: Float32Array;
  readonly zs: Float32Array;
  readonly tx: Float32Array;
  readonly tz: Float32Array;
  readonly curv: Float32Array;
  readonly vmax: Float32Array;
  readonly curb: Uint8Array;

  constructor() {
    const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
    this.L = curve.getLength();
    const N = (this.N = Math.round(this.L / 2));
    this.ds = this.L / N;
    const pts = curve.getSpacedPoints(N);
    this.xs = new Float32Array(N);
    this.zs = new Float32Array(N);
    this.tx = new Float32Array(N);
    this.tz = new Float32Array(N);
    this.curv = new Float32Array(N);
    this.vmax = new Float32Array(N);
    this.curb = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      this.xs[i] = pts[i].x;
      this.zs[i] = pts[i].z;
    }
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const dx = this.xs[b] - this.xs[a], dz = this.zs[b] - this.zs[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
    }
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      raw[i] = (this.tx[i] * this.tz[j] - this.tz[i] * this.tx[j]) / this.ds;
    }
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let k = -8; k <= 8; k++) sum += raw[(i + k + N) % N];
      this.curv[i] = sum / 17;
      this.curb[i] = Math.abs(this.curv[i]) > 1 / 260 ? 1 : 0;
      this.vmax[i] = Math.min(85, Math.sqrt(REF_GRIP / Math.max(Math.abs(this.curv[i]), 1e-5)));
    }
    // Backward pass so the profile brakes before corners (10 m/s²).
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const j = (i + 1) % N;
        this.vmax[i] = Math.min(this.vmax[i], Math.sqrt(this.vmax[j] ** 2 + 2 * 10 * this.ds));
      }
    }
  }

  idx(s: number) {
    return ((Math.round(s / this.ds) % this.N) + this.N) % this.N;
  }

  /** Nearest centerline sample; searches near `hint` (or everywhere when hint < 0). */
  locate(x: number, z: number, hint: number, out: Loc) {
    const N = this.N;
    const span = hint < 0 ? N : 61;
    const start = hint < 0 ? 0 : hint - 30;
    let best = 0;
    let bd = Infinity;
    for (let k = 0; k < span; k++) {
      const i = (((start + k) % N) + N) % N;
      const dx = x - this.xs[i], dz = z - this.zs[i];
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) {
        bd = d2;
        best = i;
      }
    }
    const dx = x - this.xs[best], dz = z - this.zs[best];
    out.i = best;
    out.s = best * this.ds + dx * this.tx[best] + dz * this.tz[best];
    out.d = dx * -this.tz[best] + dz * this.tx[best];
    return out;
  }

  /** Position on the track at distance s and lateral offset d. */
  pose(s: number, d: number, out: { x: number; z: number; tx: number; tz: number }) {
    const f = (((s / this.ds) % this.N) + this.N) % this.N;
    const i = Math.floor(f), j = (i + 1) % this.N, t = f - i;
    const tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t;
    const tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t;
    const l = Math.hypot(tx, tz) || 1;
    out.tx = tx / l;
    out.tz = tz / l;
    out.x = this.xs[i] + (this.xs[j] - this.xs[i]) * t - out.tz * d;
    out.z = this.zs[i] + (this.zs[j] - this.zs[i]) * t + out.tx * d;
    return out;
  }
}

// ---------- Procedural textures ----------

function makeTex(w: number, h: number, aniso: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

function noise(c: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], amp: number) {
  const img = c.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const n = (Math.random() - 0.5) * amp;
    img.data[i * 4] = base[0] + n;
    img.data[i * 4 + 1] = base[1] + n;
    img.data[i * 4 + 2] = base[2] + n;
    img.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}

function asphaltTex(aniso: number) {
  return makeTex(512, 512, aniso, (c) => {
    noise(c, 512, 512, [62, 64, 68], 26);
    // Rubbered-in racing line
    const g = c.createLinearGradient(0, 0, 512, 0);
    g.addColorStop(0.2, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.18)');
    g.addColorStop(0.8, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
      c.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    c.fillStyle = '#e8e8e4';
    c.fillRect(14, 0, 10, 512);
    c.fillRect(488, 0, 10, 512);
  });
}

function grassTex(aniso: number) {
  return makeTex(256, 256, aniso, (c) => {
    noise(c, 256, 256, [78, 112, 52], 34);
    for (let i = 0; i < 400; i++) {
      c.fillStyle = `rgba(${Math.random() < 0.5 ? '40,70,25' : '120,150,70'},0.25)`;
      c.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  });
}

function curbTex(aniso: number) {
  return makeTex(64, 128, aniso, (c) => {
    c.fillStyle = '#c8211b';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#eeeeea';
    c.fillRect(0, 64, 64, 64);
    c.fillStyle = 'rgba(0,0,0,0.15)';
    c.fillRect(56, 0, 8, 128);
  });
}

function checkerTex(aniso: number, cols: number, rows: number) {
  return makeTex(cols * 32, rows * 32, aniso, (c) => {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        c.fillStyle = (x + y) % 2 ? '#111' : '#f2f2f2';
        c.fillRect(x * 32, y * 32, 32, 32);
      }
    }
  });
}

function crowdTex(aniso: number) {
  return makeTex(512, 64, aniso, (c) => {
    c.fillStyle = '#2b2f36';
    c.fillRect(0, 0, 512, 64);
    const cols = ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#ffb703', '#2a9d8f', '#f4a261', '#ffffff'];
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = cols[Math.floor(Math.random() * cols.length)];
      const x = Math.random() * 512, y = 10 + Math.random() * 50;
      c.fillRect(x, y, 3, 5);
      c.fillStyle = '#e0b48a';
      c.fillRect(x, y - 3, 3, 3);
    }
  });
}

function boardTex(aniso: number, text: string, bg: string, fg: string) {
  return makeTex(1024, 256, aniso, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, 1024, 256);
    c.fillStyle = fg;
    c.font = '800 130px system-ui, -apple-system, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 512, 136, 960);
  });
}

export function skyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 2;
  cv.height = 512;
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#3f78b5');
  g.addColorStop(0.42, '#9cc3e4');
  g.addColorStop(0.52, '#dce6ee');
  g.addColorStop(1, '#c9d3c0');
  c.fillStyle = g;
  c.fillRect(0, 0, 2, 512);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- Geometry ----------

/** Strip between two (lateral offset, height) edges, optionally only where `keep(i)` is true. */
function ribbon(
  T: TrackData,
  a: { d: number; y: number },
  b: { d: number; y: number },
  vScale: number,
  keep: (i: number) => boolean = () => true,
) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < T.N; i++) {
    if (!keep(i)) continue;
    const j = (i + 1) % T.N;
    const base = pos.length / 3;
    for (const [k, v] of [[i, i * T.ds], [j, i * T.ds + T.ds]] as const) {
      const nx = -T.tz[k], nz = T.tx[k];
      pos.push(T.xs[k] + nx * a.d, a.y, T.zs[k] + nz * a.d);
      pos.push(T.xs[k] + nx * b.d, b.y, T.zs[k] + nz * b.d);
      uv.push(0, v * vScale, 1, v * vScale);
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Yaw that aligns local +X with the track tangent at sample i (local +Z = right normal). */
const alongYaw = (T: TrackData, i: number) => Math.atan2(-T.tz[i], T.tx[i]);

function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

export function buildWorld(scene: THREE.Scene, T: TrackData, aniso: number) {
  const rnd = seeded(42);

  // Ground
  const grass = grassTex(aniso);
  grass.repeat.set(500, 500);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(5000, 5000),
    new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(40, 0, 260);
  scene.add(ground);

  // Road
  const asphalt = asphaltTex(aniso);
  const road = new THREE.Mesh(
    ribbon(T, { d: -ROAD_W / 2, y: 0.02 }, { d: ROAD_W / 2, y: 0.02 }, 1 / ROAD_W),
    new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, metalness: 0 }),
  );
  scene.add(road);

  // Run-off strip of lighter gravel/grass beside the road
  const verge = new THREE.MeshStandardMaterial({ color: '#8c8a78', roughness: 1 });
  for (const side of [-1, 1]) {
    const inner = side * (ROAD_W / 2 + CURB_W);
    const outer = side * (ROAD_W / 2 + CURB_W + 2.5);
    scene.add(new THREE.Mesh(ribbon(T, { d: Math.min(inner, outer), y: 0.012 }, { d: Math.max(inner, outer), y: 0.012 }, 0.1), verge));
  }

  // Curbs on the corners
  const curbMat = new THREE.MeshStandardMaterial({ map: curbTex(aniso), roughness: 0.7 });
  const curbCover = (i: number) => T.curb[i] === 1;
  scene.add(new THREE.Mesh(ribbon(T, { d: -ROAD_W / 2 - CURB_W, y: 0.05 }, { d: -ROAD_W / 2, y: 0.03 }, 1 / 3, curbCover), curbMat));
  scene.add(new THREE.Mesh(ribbon(T, { d: ROAD_W / 2, y: 0.03 }, { d: ROAD_W / 2 + CURB_W, y: 0.05 }, 1 / 3, curbCover), curbMat));
  // Plain run-off where there's no curb
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#6f7a54', roughness: 1 });
  const noCurb = (i: number) => T.curb[i] === 0;
  scene.add(new THREE.Mesh(ribbon(T, { d: -ROAD_W / 2 - CURB_W, y: 0.015 }, { d: -ROAD_W / 2, y: 0.015 }, 0.1, noCurb), edgeMat));
  scene.add(new THREE.Mesh(ribbon(T, { d: ROAD_W / 2, y: 0.015 }, { d: ROAD_W / 2 + CURB_W, y: 0.015 }, 0.1, noCurb), edgeMat));

  // Guard rails + posts
  const railMat = new THREE.MeshStandardMaterial({ color: '#c3c8ce', metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    scene.add(new THREE.Mesh(ribbon(T, { d: side * BARRIER, y: 0.42 }, { d: side * BARRIER, y: 0.78 }, 0.25), railMat));
  }
  const posts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 0.8, 0.12),
    new THREE.MeshStandardMaterial({ color: '#7d838a', metalness: 0.5, roughness: 0.5 }),
    Math.ceil(T.N / 2) * 2,
  );
  const m = new THREE.Matrix4();
  let pi = 0;
  for (let i = 0; i < T.N; i += 2) {
    for (const side of [-1, 1]) {
      const d = side * (BARRIER + 0.12);
      m.makeTranslation(T.xs[i] - T.tz[i] * d, 0.4, T.zs[i] + T.tx[i] * d);
      posts.setMatrixAt(pi++, m);
    }
  }
  posts.count = pi;
  scene.add(posts);

  // Start/finish line, gantry
  const startLine = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, ROAD_W),
    new THREE.MeshStandardMaterial({ map: checkerTex(aniso, 2, 14), roughness: 0.8 }),
  );
  startLine.geometry.rotateX(-Math.PI / 2);
  startLine.position.set(T.xs[0], 0.03, T.zs[0]);
  startLine.rotation.y = alongYaw(T, 0);
  scene.add(startLine);

  const steel = new THREE.MeshStandardMaterial({ color: '#2d3138', metalness: 0.6, roughness: 0.45 });
  const gantry = new THREE.Group();
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.4, 0.6), steel);
    pillar.position.set(0, 3.7, side * (ROAD_W / 2 + 1.6));
    gantry.add(pillar);
  }
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.5, ROAD_W + 4),
    [steel, steel, steel, steel, steel, steel],
  );
  banner.position.y = 6.6;
  gantry.add(banner);
  const flag = checkerTex(aniso, 24, 3);
  for (const side of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 3.6, 1.3), new THREE.MeshStandardMaterial({ map: flag, roughness: 0.7 }));
    face.rotation.y = side * Math.PI / 2;
    face.position.set(side * 0.26, 6.6, 0);
    gantry.add(face);
  }
  gantry.position.set(T.xs[0], 0, T.zs[0]);
  gantry.rotation.y = alongYaw(T, 0);
  scene.add(gantry);

  // Grandstand along the main straight (outside = left of travel)
  const stand = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: '#a7a9a6', roughness: 0.9 });
  const crowd = crowdTex(aniso);
  crowd.repeat.set(6, 1);
  const crowdMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 });
  const standLen = 140;
  for (let k = 0; k < 7; k++) {
    const h = 0.8 + k * 0.9;
    const step = new THREE.Mesh(new THREE.BoxGeometry(standLen, h, 2.4), concrete);
    step.position.set(0, h / 2, -(k * 2.4));
    stand.add(step);
    const people = new THREE.Mesh(new THREE.BoxGeometry(standLen, 0.9, 0.7), [concrete, concrete, concrete, concrete, crowdMat, concrete]);
    people.position.set(0, h + 0.45, -(k * 2.4) + 0.5);
    stand.add(people);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(standLen + 4, 0.4, 19), steel);
  roof.position.set(0, 12.5, -7.5);
  stand.add(roof);
  for (let x = -standLen / 2; x <= standLen / 2; x += 20) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, 12.5, 0.4), steel);
    col.position.set(x, 6.25, -16.5);
    stand.add(col);
  }
  const si = T.idx(75);
  stand.position.set(T.xs[si] + T.tz[si] * (BARRIER + 3), 0, T.zs[si] - T.tx[si] * (BARRIER + 3));
  stand.rotation.y = alongYaw(T, si);
  scene.add(stand);

  // Billboards
  const colors: [string, string][] = [
    ['#0b3d91', '#ffffff'], ['#e10600', '#ffffff'], ['#111111', '#ffcc00'],
    ['#ffffff', '#0b3d91'], ['#1b5e20', '#ffffff'], ['#ffcc00', '#111111'],
  ];
  const boards = S().boards.map((text, k) => [text, ...colors[k]] as const);
  boards.forEach(([text, bg, fg], k) => {
    const i = T.idx(((k + 0.5) / boards.length) * T.L);
    const side = k % 2 ? 1 : -1;
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshStandardMaterial({ map: boardTex(aniso, text, bg, fg), roughness: 0.6 }));
    face.position.y = 3.2;
    g.add(face);
    const back = new THREE.Mesh(new THREE.BoxGeometry(12.2, 3.2, 0.2), steel);
    back.position.set(0, 3.2, -0.12);
    g.add(back);
    for (const x of [-4.5, 4.5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.8, 0.25), steel);
      leg.position.set(x, 0.9, -0.12);
      g.add(leg);
    }
    const d = side * (BARRIER + 3);
    g.position.set(T.xs[i] - T.tz[i] * d, 0, T.zs[i] + T.tx[i] * d);
    // Face the road: local +Z points along the right normal; flip on the right side.
    g.rotation.y = alongYaw(T, i) + (side > 0 ? Math.PI : 0);
    scene.add(g);
  });

  // Trees, kept well clear of the circuit
  const nearTrack = (x: number, z: number, r: number) => {
    for (let i = 0; i < T.N; i += 3) {
      const dx = T.xs[i] - x, dz = T.zs[i] - z;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  };
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 3, 6), new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 1 }), 700);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 7, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), 700);
  const col = new THREE.Color();
  let n = 0;
  for (let tries = 0; tries < 6000 && n < 700; tries++) {
    const x = -700 + rnd() * 1500, z = -350 + rnd() * 1250;
    if (nearTrack(x, z, BARRIER + 10)) continue;
    // Keep the grandstand area open
    if (Math.abs(z + 30) < 30 && x > -120 && x < 150) continue;
    const s = 0.7 + rnd() * 0.8;
    m.compose(new THREE.Vector3(x, 1.5 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(n, m);
    m.compose(new THREE.Vector3(x, (3 + 3.5) * s, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6), new THREE.Vector3(s, s * (0.9 + rnd() * 0.4), s));
    crowns.setMatrixAt(n, m);
    crowns.setColorAt(n, col.setHSL(0.27 + rnd() * 0.06, 0.45 + rnd() * 0.2, 0.18 + rnd() * 0.1));
    n++;
  }
  trunks.count = crowns.count = n;
  scene.add(trunks, crowns);

  // Distant hills ring for horizon parallax
  const segs = 96;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k <= segs; k++) {
    const a = (k / segs) * Math.PI * 2;
    const h = 60 + 90 * (0.5 + 0.5 * Math.sin(a * 3 + 1)) * (0.6 + 0.4 * Math.sin(a * 7)) + rnd() * 40;
    const r = 1500;
    pos.push(40 + Math.cos(a) * r, -5, 260 + Math.sin(a) * r, 40 + Math.cos(a) * r, h, 260 + Math.sin(a) * r);
    if (k < segs) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
  }
  const hills = new THREE.BufferGeometry();
  hills.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hills.setIndex(idx);
  scene.add(new THREE.Mesh(hills, new THREE.MeshBasicMaterial({ color: '#7f95a3', side: THREE.DoubleSide })));
}
