import * as THREE from 'three';
import type { EngineProfile } from './sound';

export type CarKind = 'gt' | 'formula' | 'muscle' | 'rally';

export interface CarSpec {
  id: string;
  name: string;
  tagline: string;
  kind: CarKind;
  color: string;
  accent: string;
  /** Top speed m/s, launch acceleration m/s², lateral grip m/s², max yaw rate rad/s. */
  top: number;
  accel: number;
  grip: number;
  steer: number;
  /** Speed factor on grass. */
  offroad: number;
  stats: { speed: number; accel: number; handling: number };
  engine: EngineProfile;
  eye: [number, number, number];
  fov: number;
}

export const CARS: CarSpec[] = [
  {
    id: 'vortex', name: 'Vortex GT', tagline: 'Twin-turbo V6 · Rear-wheel drive', kind: 'gt',
    color: '#b3121b', accent: '#141414', top: 72, accel: 9.5, grip: 15.5, steer: 1.25, offroad: 0.5,
    stats: { speed: 8, accel: 7, handling: 8 },
    engine: { cylinders: 6, idle: 900, redline: 8200 },
    eye: [-0.36, 1.03, 0.12], fov: 70,
  },
  {
    id: 'aero', name: 'Aero One', tagline: 'Naturally aspirated V10 · Open wheel', kind: 'formula',
    color: '#1747b8', accent: '#f2f2f2', top: 80, accel: 11.5, grip: 19, steer: 1.35, offroad: 0.4,
    stats: { speed: 10, accel: 10, handling: 10 },
    engine: { cylinders: 10, idle: 4200, redline: 15000 },
    eye: [0, 0.98, 0.34], fov: 74,
  },
  {
    id: 'bulldog', name: 'Bulldog V8', tagline: 'Big-block V8 · Muscle coupé', kind: 'muscle',
    color: '#e6a700', accent: '#101010', top: 68, accel: 10.5, grip: 12.5, steer: 1.1, offroad: 0.5,
    stats: { speed: 7, accel: 9, handling: 5 },
    engine: { cylinders: 8, idle: 750, redline: 6800 },
    eye: [-0.38, 1.1, 0.12], fov: 70,
  },
  {
    id: 'scout', name: 'Trail Scout', tagline: 'Turbo four · All-wheel-drive rally', kind: 'rally',
    color: '#eceff1', accent: '#0f766e', top: 61, accel: 9, grip: 16, steer: 1.4, offroad: 0.82,
    stats: { speed: 6, accel: 7, handling: 9 },
    engine: { cylinders: 4, idle: 1000, redline: 7800 },
    eye: [-0.36, 1.2, 0.05], fov: 70,
  },
];

interface BodyParams {
  W: number;
  /** Side silhouette from front-bottom over the top to rear-bottom (x forward, y up). */
  top: [number, number][];
  bottomY: number;
  wheelX: [number, number];
  archR: number;
  wheelR: number;
  wheelW: number;
  /** Glass greenhouse: windshield base, roof front, roof rear, rear glass base. */
  cabin: [number, number][];
}

const BODIES: Record<Exclude<CarKind, 'formula'>, BodyParams> = {
  gt: {
    W: 1.96, bottomY: 0.3, wheelX: [1.45, -1.4], archR: 0.41, wheelR: 0.35, wheelW: 0.28,
    top: [[2.22, 0.3], [2.34, 0.45], [2.28, 0.6], [1.9, 0.72], [0.8, 0.86], [-1.5, 0.92], [-2.15, 0.9], [-2.32, 0.78], [-2.32, 0.3]],
    cabin: [[0.82, 0.86], [0.05, 1.2], [-0.85, 1.18], [-1.65, 0.92]],
  },
  muscle: {
    W: 2.0, bottomY: 0.32, wheelX: [1.5, -1.5], archR: 0.43, wheelR: 0.37, wheelW: 0.32,
    top: [[2.38, 0.32], [2.46, 0.55], [2.38, 0.82], [0.72, 0.93], [-1.6, 0.96], [-2.38, 0.93], [-2.46, 0.6], [-2.46, 0.32]],
    cabin: [[0.74, 0.93], [0.0, 1.32], [-0.92, 1.32], [-1.52, 0.96]],
  },
  rally: {
    W: 1.86, bottomY: 0.37, wheelX: [1.3, -1.25], archR: 0.41, wheelR: 0.34, wheelW: 0.27,
    top: [[1.98, 0.37], [2.07, 0.56], [1.96, 0.78], [1.0, 0.93], [-1.75, 0.99], [-2.03, 0.9], [-2.05, 0.37]],
    cabin: [[1.02, 0.93], [0.3, 1.42], [-1.55, 1.42], [-1.98, 0.99]],
  },
};

function materials(spec: CarSpec) {
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: spec.color, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 }),
    accent: new THREE.MeshPhysicalMaterial({ color: spec.accent, metalness: 0.3, roughness: 0.4, clearcoat: 0.6 }),
    trim: new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.6, metalness: 0.2 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#0d1520', metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.82, envMapIntensity: 1.6 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.88 }),
    rim: new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.9, roughness: 0.25 }),
    head: new THREE.MeshStandardMaterial({ color: '#fffaf0', emissive: '#fff4d6', emissiveIntensity: 0.8 }),
    tail: new THREE.MeshStandardMaterial({ color: '#7a0000', emissive: '#ff1a1a', emissiveIntensity: 0.6 }),
    interior: new THREE.MeshStandardMaterial({ color: '#1b1d21', roughness: 0.85 }),
  };
}

type Mats = ReturnType<typeof materials>;

/** Wheel assembly: pivot (steers around Y) > spinner (rolls around X) > tyre + rim. */
function wheel(r: number, w: number, m: Mats) {
  const pivot = new THREE.Group();
  const spinner = new THREE.Group();
  pivot.add(spinner);
  const tyre = new THREE.CylinderGeometry(r, r, w, 28);
  tyre.rotateZ(Math.PI / 2);
  spinner.add(new THREE.Mesh(tyre, m.tyre));
  const rimG = new THREE.CylinderGeometry(r * 0.64, r * 0.64, w + 0.012, 20);
  rimG.rotateZ(Math.PI / 2);
  spinner.add(new THREE.Mesh(rimG, m.rim));
  const hubG = new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 16);
  hubG.rotateZ(Math.PI / 2);
  spinner.add(new THREE.Mesh(hubG, m.trim));
  for (let k = 0; k < 5; k++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, r * 0.13, r * 1.2), m.rim);
    spoke.rotation.x = (k / 5) * Math.PI;
    spinner.add(spoke);
  }
  return { pivot, spinner };
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Extrude a side profile (x forward, y up) across the car's width. Car forward = -Z. */
function extrudeSide(shape: THREE.Shape, width: number, bevel: number) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 14,
  });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2); // profile +x -> -z (forward), extrusion -> x (width)
  return g;
}

function bodyShape(p: BodyParams) {
  const s = new THREE.Shape();
  const [first, ...rest] = p.top;
  s.moveTo(first[0], first[1]);
  for (const [x, y] of rest) s.lineTo(x, y);
  // Bottom edge from rear to front, notched around the wheels.
  const [fx, rx] = p.wheelX;
  s.lineTo(rx - p.archR, p.bottomY);
  s.absarc(rx, p.bottomY, p.archR, Math.PI, 0, true);
  s.lineTo(fx - p.archR, p.bottomY);
  s.absarc(fx, p.bottomY, p.archR, Math.PI, 0, true);
  s.lineTo(first[0], first[1]);
  return s;
}

export interface CarModel {
  group: THREE.Group;
  /** Main body shell; swapped for a hood-only piece in the driver's view. */
  body: THREE.Mesh | null;
  spinners: THREE.Object3D[];
  steerPivots: THREE.Object3D[];
  wheelR: number;
  length: number;
  width: number;
  /** Parts to hide when viewed from the driver's seat. */
  driverOnly: THREE.Object3D[];
}

export function buildCar(spec: CarSpec): CarModel {
  return spec.kind === 'formula' ? buildFormula(spec) : buildBodied(spec, BODIES[spec.kind]);
}

function buildBodied(spec: CarSpec, p: BodyParams): CarModel {
  const m = materials(spec);
  const g = new THREE.Group();
  const body = new THREE.Mesh(extrudeSide(bodyShape(p), p.W, 0.06), m.paint);
  g.add(body);

  const cabin = new THREE.Shape();
  cabin.moveTo(p.cabin[0][0], p.cabin[0][1] - 0.02);
  for (const [x, y] of p.cabin.slice(1)) cabin.lineTo(x, y);
  cabin.lineTo(p.cabin[3][0], p.cabin[3][1] - 0.02);
  g.add(new THREE.Mesh(extrudeSide(cabin, p.W - 0.34, 0.04), m.glass));

  // Roof panel over the glass
  const [, rf, rr] = p.cabin;
  const roofLen = rf[0] - rr[0];
  const roof = box(p.W - 0.36, 0.05, roofLen + 0.05, m.paint, 0, Math.max(rf[1], rr[1]) + 0.035, -(rf[0] + rr[0]) / 2);
  roof.rotation.x = Math.atan2(rf[1] - rr[1], roofLen);
  g.add(roof);

  // Lights, grille, exhausts, mirrors
  const nose = p.top[1];
  const tailX = Math.min(...p.top.map((q) => q[0]));
  for (const side of [-1, 1]) {
    g.add(box(0.42, 0.09, 0.1, m.head, side * (p.W / 2 - 0.32), nose[1] + 0.08, -(nose[0] - 0.06)));
    g.add(box(0.46, 0.08, 0.06, m.tail, side * (p.W / 2 - 0.3), 0.76, -tailX + 0.03));
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 12), m.rim);
    ex.rotation.x = Math.PI / 2;
    ex.position.set(side * 0.4, p.bottomY + 0.05, -tailX);
    g.add(ex);
    g.add(box(0.12, 0.08, 0.16, m.paint, side * (p.W / 2 + 0.08), p.cabin[0][1] + 0.08, -(p.cabin[0][0] - 0.15)));
  }
  g.add(box(p.W * 0.55, 0.12, 0.06, m.trim, 0, p.bottomY + 0.08, -(p.top[0][0] + 0.08)));

  // Kind-specific details
  if (spec.kind === 'gt') {
    const wingZ = -(tailX + 0.25);
    g.add(box(p.W - 0.25, 0.04, 0.34, m.accent, 0, 1.17, wingZ));
    for (const side of [-1, 1]) g.add(box(0.05, 0.26, 0.18, m.accent, side * 0.55, 1.03, wingZ));
  } else if (spec.kind === 'muscle') {
    for (const side of [-1, 1]) {
      const hood = box(0.26, 0.02, 1.68, m.accent, side * 0.2, 0.9, -1.55);
      hood.rotation.x = -Math.atan2(0.11, 1.66);
      g.add(hood);
      g.add(box(0.26, 0.02, roofLen, m.accent, side * 0.2, 1.39, -(rf[0] + rr[0]) / 2));
      g.add(box(0.26, 0.02, 0.8, m.accent, side * 0.2, 0.975, 2.0));
    }
    g.add(box(p.W - 0.2, 0.07, 0.16, m.accent, 0, 1.0, 2.36));
  } else {
    g.add(box(0.42, 0.05, 0.36, m.trim, 0, 0.96, -1.5));
    g.add(box(p.W - 0.3, 0.05, 0.42, m.accent, 0, 1.45, 1.9));
    for (const side of [-1, 1]) {
      g.add(box(0.01, 0.16, 2.8, m.accent, side * (p.W / 2 + 0.065), 0.6, -0.05));
      g.add(box(0.3, 0.32, 0.02, m.trim, side * (p.W / 2 - 0.2), 0.32, 1.55));
    }
  }

  const spinners: THREE.Object3D[] = [];
  const steerPivots: THREE.Object3D[] = [];
  for (const [k, wx] of p.wheelX.entries()) {
    for (const side of [-1, 1]) {
      const w = wheel(p.wheelR, p.wheelW, m);
      w.pivot.position.set(side * (p.W / 2 - p.wheelW / 2 + 0.03), p.wheelR, -wx);
      g.add(w.pivot);
      spinners.push(w.spinner);
      if (k === 0) steerPivots.push(w.pivot);
    }
  }
  const len = p.top[1][0] - tailX;
  return { group: g, body, spinners, steerPivots, wheelR: p.wheelR, length: len, width: p.W, driverOnly: [] };
}

function buildFormula(spec: CarSpec): CarModel {
  const m = materials(spec);
  const g = new THREE.Group();
  const prof: [number, number][] = [
    [2.75, 0.2], [2.75, 0.3], [1.3, 0.5], [0.45, 0.6], [0.15, 0.72], [-0.55, 0.74], [-0.75, 1.0],
    [-1.3, 1.0], [-1.9, 0.62], [-2.35, 0.5], [-2.35, 0.2],
  ];
  const s = new THREE.Shape();
  s.moveTo(prof[0][0], prof[0][1]);
  for (const [x, y] of prof.slice(1)) s.lineTo(x, y);
  s.lineTo(prof[0][0], prof[0][1]);
  g.add(new THREE.Mesh(extrudeSide(s, 0.62, 0.06), m.paint));

  for (const side of [-1, 1]) {
    g.add(box(0.5, 0.4, 1.7, m.paint, side * 0.58, 0.42, 0.35));
    g.add(box(0.04, 0.24, 0.56, m.accent, side * 0.97, 0.22, -2.55)); // front wing endplate
    g.add(box(0.04, 0.5, 0.62, m.accent, side * 0.49, 0.86, 2.25)); // rear wing endplate
    g.add(box(0.6, 0.035, 0.05, m.trim, side * 0.55, 0.4, -1.75)); // wishbones
    g.add(box(0.5, 0.035, 0.05, m.trim, side * 0.6, 0.42, 1.45));
    const mirror = box(0.14, 0.07, 0.04, m.paint, side * 0.62, 0.78, -0.35);
    g.add(mirror);
  }
  g.add(box(1.55, 0.05, 3.3, m.trim, 0, 0.12, 0.3)); // floor
  g.add(box(1.95, 0.04, 0.5, m.accent, 0, 0.14, -2.55)); // front wing
  g.add(box(0.95, 0.05, 0.45, m.accent, 0, 1.06, 2.25)); // rear wing
  g.add(box(0.06, 0.5, 0.12, m.trim, 0, 0.78, 2.15));
  g.add(box(0.34, 0.06, 0.06, m.tail, 0, 0.32, 2.42));

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), m.accent);
  helmet.position.set(0, 0.88, 0.25);
  const visor = box(0.22, 0.06, 0.05, m.glass, 0, 0.9, 0.12);
  g.add(helmet, visor);

  const spinners: THREE.Object3D[] = [];
  const steerPivots: THREE.Object3D[] = [];
  for (const [k, z] of [-1.75, 1.45].entries()) {
    for (const side of [-1, 1]) {
      const w = wheel(0.34, k === 0 ? 0.32 : 0.4, m);
      w.pivot.position.set(side * 0.86, 0.34, z);
      g.add(w.pivot);
      spinners.push(w.spinner);
      if (k === 0) steerPivots.push(w.pivot);
    }
  }
  return { group: g, body: null, spinners, steerPivots, wheelR: 0.34, length: 5.1, width: 1.95, driverOnly: [helmet, visor] };
}

let shadowTex: THREE.Texture | null = null;

/** Soft contact shadow — far cheaper than real shadow maps while racing. */
export function blobShadow(length: number, width: number) {
  if (!shadowTex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const c = cv.getContext('2d')!;
    const gr = c.createRadialGradient(64, 64, 10, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 128, 128);
    shadowTex = new THREE.CanvasTexture(cv);
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 0.9, length + 0.9),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.035;
  return mesh;
}

export interface Cockpit {
  wheel: THREE.Group;
  gauge: CanvasRenderingContext2D;
  gaugeTex: THREE.CanvasTexture;
}

/** Interior seen from the driver's seat, added onto the car model. */
export function buildCockpit(spec: CarSpec, model: CarModel): Cockpit {
  const g = model.group;
  for (const o of model.driverOnly) o.visible = false;
  const dark = new THREE.MeshStandardMaterial({ color: '#17191d', roughness: 0.85 });
  const soft = new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.95 });
  const metal = new THREE.MeshStandardMaterial({ color: '#8a9099', metalness: 0.8, roughness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.6 });

  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const gaugeTex = new THREE.CanvasTexture(cv);
  gaugeTex.colorSpace = THREE.SRGBColorSpace;
  const gaugeMat = new THREE.MeshBasicMaterial({ map: gaugeTex, toneMapped: false });

  const wheelG = new THREE.Group();
  const [ex] = spec.eye;

  if (spec.kind === 'formula') {
    wheelG.add(box(0.28, 0.13, 0.04, dark, 0, 0, 0));
    for (const side of [-1, 1]) wheelG.add(box(0.05, 0.17, 0.07, soft, side * 0.16, -0.01, 0));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.075), gaugeMat);
    screen.position.set(0, 0.01, 0.021);
    wheelG.add(screen);
    wheelG.position.set(0, 0.8, -0.16);
    wheelG.rotation.x = -0.55;
    g.add(wheelG);
  } else {
    const p = BODIES[spec.kind];
    const [base, rf, rr] = p.cabin;
    const baseZ = -base[0];
    const [, ey, ez] = spec.eye;

    // The solid body shell would cover the view from inside; keep only the hood ahead of the windshield.
    if (model.body) {
      model.body.visible = false;
      const hood = new THREE.Shape();
      const front = p.top.filter(([x]) => x > base[0]);
      hood.moveTo(front[0][0], front[0][1]);
      for (const [x, y] of front.slice(1)) hood.lineTo(x, y);
      hood.lineTo(base[0], base[1]);
      hood.lineTo(base[0], p.bottomY);
      hood.lineTo(front[0][0], front[0][1]);
      g.add(new THREE.Mesh(extrudeSide(hood, p.W, 0.06), model.body.material));
    }

    // Dashboard fills the lower view, ending just in front of the steering wheel.
    const dashTop = base[1] - 0.06;
    const dashRear = ez - 0.62;
    const dashLen = dashRear - (baseZ - 0.05);
    g.add(box(p.W - 0.16, dashTop - 0.3, dashLen, dark, 0, (dashTop + 0.3) / 2, baseZ - 0.05 + dashLen / 2));
    g.add(box(p.W - 0.16, 0.04, 0.1, soft, 0, dashTop - 0.01, dashRear - 0.04)); // padded top edge
    for (const side of [-1, 1]) {
      // Door cards up to the window line
      const doorLen = ez + 0.6 - baseZ;
      g.add(box(0.08, base[1] - 0.3, doorLen, soft, side * (p.W / 2 - 0.02), (base[1] + 0.3) / 2, baseZ + doorLen / 2));
    }

    // Instrument cluster on top of the dash
    const gaugeY = dashTop + 0.08;
    const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), gaugeMat);
    gauge.position.set(ex, gaugeY, dashRear - 0.12);
    gauge.rotation.x = -0.35;
    g.add(gauge);
    const housing = box(0.34, 0.17, 0.08, dark, ex, gaugeY - 0.01, dashRear - 0.17);
    housing.rotation.x = -0.35;
    g.add(housing);

    // Thin A-pillars and the headliner frame the windshield.
    for (const side of [-1, 1]) {
      const a = new THREE.Vector3(side * (p.W / 2 - 0.2), base[1], baseZ);
      const b = new THREE.Vector3(side * (p.W / 2 - 0.22), rf[1] - 0.03, -rf[0]);
      const pillar = box(0.055, 0.055, a.distanceTo(b), dark, 0, 0, 0);
      pillar.position.copy(a).add(b).multiplyScalar(0.5);
      pillar.lookAt(b); // group is untransformed at build time
      g.add(pillar);
    }
    g.add(box(p.W - 0.32, 0.03, rf[0] - rr[0], soft, 0, Math.min(rf[1], rr[1]) - 0.05, -(rf[0] + rr[0]) / 2));
    g.add(box(0.22, 0.06, 0.02, dark, 0.05, rf[1] - 0.12, -rf[0] + 0.12)); // rear-view mirror

    // Steering wheel + column
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 10, 36), soft);
    wheelG.add(rim);
    wheelG.add(box(0.3, 0.028, 0.02, dark, 0, 0, 0));
    wheelG.add(box(0.028, 0.14, 0.02, dark, 0, -0.075, 0));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 20), dark);
    hub.rotation.x = Math.PI / 2;
    wheelG.add(hub);
    wheelG.add(box(0.025, 0.032, 0.026, red, 0, 0.16, 0));
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16), metal);
    badge.position.z = 0.02;
    wheelG.add(badge);
    wheelG.position.set(ex, ey - 0.33, ez - 0.52);
    wheelG.rotation.x = -0.32;
    g.add(wheelG);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 12), dark);
    column.rotation.x = Math.PI / 2 - 0.32;
    column.position.set(ex, ey - 0.36, ez - 0.64);
    g.add(column);
  }
  return { wheel: wheelG, gauge: cv.getContext('2d')!, gaugeTex };
}
