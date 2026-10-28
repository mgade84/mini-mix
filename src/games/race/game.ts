import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GameContext } from '../../types';
import { say, sfx } from '../../engine/audio';
import { load, save } from '../../engine/storage';
import { blobShadow, buildCar, buildCockpit, CARS, type CarModel, type CarSpec, type Cockpit } from './cars';
import { BARRIER, CURB_W, REF_GRIP, ROAD_W, TrackData, buildWorld, skyTexture, type Loc } from './track';
import { EngineSound } from './sound';
import { S } from './strings';
import './race.css';

const LAPS = 2;
const GEARS = [0.24, 0.38, 0.52, 0.67, 0.83, 1.0];
const STARS = [5, 4, 3, 2];

const CHEVRON = (dir: 'l' | 'r') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${dir === 'l' ? 'M15 4 7 12l8 8' : 'm9 4 8 8-8 8'}"/></svg>`;

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}

/** Gear + rpm from road speed, with a clutch-slip floor when launching. */
class Gearbox {
  gear = 1;
  rpm: number;
  cut = 0;
  constructor(private spec: CarSpec) {
    this.rpm = spec.engine.idle;
  }
  update(dt: number, v: number, throttle: number, moving: boolean) {
    const { idle, redline } = this.spec.engine;
    const top = this.spec.top;
    this.cut = Math.max(0, this.cut - dt);
    let target: number;
    if (!moving) {
      target = idle + throttle * (redline - idle) * 0.85; // free revving on the grid
    } else {
      const sp = Math.abs(v);
      const gTop = top * GEARS[this.gear - 1];
      target = idle + (redline - idle) * Math.min(1.02, sp / gTop);
      if (sp < 6 && throttle > 0) target = Math.max(target, idle + throttle * (redline - idle) * 0.45);
      if (v > 0 && this.gear < GEARS.length && target > redline * 0.95) {
        this.gear++;
        this.cut = 0.14;
      } else if (this.gear > 1 && sp < top * GEARS[this.gear - 2] * 0.62) {
        this.gear--;
      }
    }
    const rate = !moving ? 9 : this.cut > 0 ? 18 : 10;
    this.rpm += (target - this.rpm) * Math.min(1, dt * rate);
    return this.cut > 0;
  }
}

export function runRace(ctx: GameContext): () => void {
  const root = ctx.area;
  const shell = ctx.shell;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'rc-canvas';
  root.appendChild(renderer.domElement);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
  roomEnv.dispose();

  let carIndex = Math.min(CARS.length - 1, Math.max(0, load('race:car', 0)));
  let assist = load('race:assist', true);
  let engine: EngineSound | null = null;
  let mode: 'garage' | 'race' = 'garage';
  let raf = 0;
  let last = performance.now();
  let alive = true;

  function setEngine(spec: CarSpec) {
    engine?.stop();
    engine = new EngineSound(spec.engine);
  }

  // =================== Garage ===================
  const garage = (() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0c10');
    scene.environment = envTex;
    scene.fog = new THREE.Fog('#0a0c10', 14, 34);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: '#111419', roughness: 0.3, metalness: 0.5 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.45, 0.08, 72), new THREE.MeshStandardMaterial({ color: '#1c2027', roughness: 0.28, metalness: 0.7 }));
    table.position.y = 0.04;
    table.receiveShadow = true;
    scene.add(table);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.43, 0.018, 8, 160), new THREE.MeshBasicMaterial({ color: '#4da3ff' }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.085;
    scene.add(ring);

    const key = new THREE.SpotLight('#ffffff', 600, 40, 0.55, 0.6, 2);
    key.position.set(3, 9, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    scene.add(key, key.target);
    const rimL = new THREE.PointLight('#5aa9ff', 40, 20);
    rimL.position.set(-5, 2.5, -4);
    const rimR = new THREE.PointLight('#ffb36b', 30, 20);
    rimR.position.set(5, 2, -5);
    scene.add(rimL, rimR, new THREE.HemisphereLight('#9fb4cc', '#0a0c10', 0.4));

    const holder = new THREE.Group();
    holder.position.y = 0.08;
    scene.add(holder);
    let model: CarModel | null = null;
    let drag: { id: number; x: number } | null = null;
    let spinVel = 0.35;
    let blip = 0;

    function setCar(i: number, rev: boolean) {
      if (model) {
        holder.remove(model.group);
        disposeTree(model.group);
      }
      model = buildCar(CARS[i]);
      model.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      holder.add(model.group);
      setEngine(CARS[i]);
      blip = rev ? 1.1 : 0;
    }

    function frame(aspect: number) {
      // Fit the turntable horizontally; in portrait, aim low so the car sits above the info card.
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect;
      const dist = Math.max(9.5, 3.6 / tanHalf);
      camera.position.set(dist * 0.64, dist * 0.2, dist * 0.74);
      camera.lookAt(0, aspect < 1 ? -0.9 : 0.4, 0);
    }

    function update(dt: number) {
      if (!drag) {
        holder.rotation.y += spinVel * dt;
        spinVel += (0.35 - spinVel) * Math.min(1, dt * 1.5);
      }
      // A quick rev when a car rolls onto the turntable.
      const spec = CARS[carIndex];
      const { idle, redline } = spec.engine;
      let rpm = idle;
      let load = 0;
      if (blip > 0) {
        blip -= dt;
        const t = 1.1 - blip;
        const k = t < 0.25 ? t / 0.25 : Math.max(0, 1 - (t - 0.25) / 0.85);
        rpm = idle + (redline * 0.78 - idle) * k;
        load = t < 0.25 ? 1 : 0;
      }
      engine?.update(rpm, load, 0, 0, 0);
    }

    const el = document.createElement('div');
    el.className = 'rc-garage';
    el.innerHTML = `
      <div class="rc-head">${S().selectCar}</div>
      <button class="rc-arrow left" aria-label="${S().prevCar}">${CHEVRON('l')}</button>
      <button class="rc-arrow right" aria-label="${S().nextCar}">${CHEVRON('r')}</button>
      <div class="rc-card">
        <div class="rc-dots">${CARS.map(() => '<i></i>').join('')}</div>
        <div class="rc-name"></div>
        <div class="rc-tag"></div>
        <div class="rc-stats">
          <span>${S().topSpeed}</span><div class="rc-bar"><i data-stat="speed"></i></div>
          <span>${S().accel}</span><div class="rc-bar"><i data-stat="accel"></i></div>
          <span>${S().handling}</span><div class="rc-bar"><i data-stat="handling"></i></div>
        </div>
        <div class="rc-row">
          <button class="rc-switch" role="switch"><i></i><span>${S().assist}</span></button>
          <button class="rc-go">${S().race}</button>
        </div>
      </div>`;
    shell.appendChild(el);

    function refresh() {
      const spec = CARS[carIndex];
      el.querySelector('.rc-name')!.textContent = spec.name;
      el.querySelector('.rc-tag')!.textContent = `${S().taglines[spec.id] ?? spec.tagline} · ${Math.round(spec.top * 3.6)} km/h`;
      el.querySelectorAll<HTMLElement>('[data-stat]').forEach((b) => {
        b.style.setProperty('--w', `${spec.stats[b.dataset.stat as keyof CarSpec['stats']] * 10}%`);
      });
      el.querySelectorAll('.rc-dots i').forEach((d, i) => d.classList.toggle('on', i === carIndex));
      const sw = el.querySelector('.rc-switch')!;
      sw.classList.toggle('on', assist);
      sw.setAttribute('aria-checked', String(assist));
    }

    const pick = (delta: number) => {
      carIndex = (carIndex + delta + CARS.length) % CARS.length;
      save('race:car', carIndex);
      setCar(carIndex, true);
      refresh();
    };
    el.querySelector('.left')!.addEventListener('click', () => pick(-1));
    el.querySelector('.right')!.addEventListener('click', () => pick(1));
    el.querySelector('.rc-switch')!.addEventListener('click', () => {
      assist = !assist;
      save('race:assist', assist);
      sfx.tap();
      refresh();
    });
    el.querySelector('.rc-go')!.addEventListener('click', () => startRace());

    const cv = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      if (mode !== 'garage') return;
      drag = { id: e.pointerId, x: e.clientX };
      cv.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      drag.x = e.clientX;
      holder.rotation.y += dx * 0.01;
      spinVel = dx * 0.6;
    };
    const onUp = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);

    return {
      scene, camera, el, update, frame, refresh, setCar,
      show() {
        el.style.display = '';
        refresh();
      },
      hide() {
        el.style.display = 'none';
      },
      dispose() {
        if (model) disposeTree(model.group);
        disposeTree(scene);
        el.remove();
      },
    };
  })();

  // =================== Race ===================
  type Race = ReturnType<typeof createRace>;
  let race: Race | null = null;

  function startRace() {
    sfx.tap();
    mode = 'race';
    garage.hide();
    race?.dispose();
    race = createRace(CARS[carIndex], assist);
    resize();
  }

  function backToGarage() {
    race?.dispose();
    race = null;
    mode = 'garage';
    garage.show();
    setEngine(CARS[carIndex]);
    resize();
  }

  function createRace(spec: CarSpec, assistOn: boolean) {
    const scene = new THREE.Scene();
    const sky = skyTexture();
    scene.background = sky;
    scene.environment = envTex;
    scene.fog = new THREE.Fog('#dce6ee', 260, 1900);
    scene.add(new THREE.HemisphereLight('#d6e8ff', '#56603f', 1.15));
    const sun = new THREE.DirectionalLight('#fff1da', 2.4);
    sun.position.set(400, 650, 250);
    scene.add(sun);

    const T = new TrackData();
    buildWorld(scene, T, aniso);

    // ---- Player ----
    const model = buildCar(spec);
    const cockpit: Cockpit = buildCockpit(spec, model);
    scene.add(model.group);
    const camera = new THREE.PerspectiveCamera(spec.fov, 1, 0.05, 2600);
    camera.position.set(...spec.eye);
    camera.rotation.order = 'YXZ';
    model.group.add(camera);

    const loc: Loc = { i: 0, s: 0, d: 0 };
    const pose = { x: 0, z: 0, tx: 0, tz: 0 };
    const gearbox = new Gearbox(spec);
    T.pose(14, 3.5, pose);
    const P = {
      x: pose.x, z: pose.z, psi: Math.atan2(-pose.tx, -pose.tz), v: 0, steer: 0,
      hint: -1, laps: 0, halfway: false, lapStart: 0, best: Infinity, finished: false, finishTime: 0,
      shake: 0, place: 0, reverseHold: 0, prevFrac: 0,
    };

    // ---- Opponents ----
    const rivals = CARS.filter((c) => c !== spec);
    const grid: [number, number][] = [[34, -3.5], [34, 3.5], [24, -3.5]];
    // Assist mode is for young drivers: rivals are slower and only catch up a little.
    const skillBase = assistOn ? 0.72 : 0.88;
    const catchUp = assistOn ? 1.04 : 1.12;
    const ai = rivals.map((rs, k) => {
      const m = buildCar(rs);
      m.group.add(blobShadow(m.length, m.width));
      scene.add(m.group);
      return {
        spec: rs, model: m, s: grid[k][0], v: 0, lane: grid[k][1], laneTarget: grid[k][1], laneTimer: 3 + k,
        skill: skillBase + k * 0.03, finished: false, x: 0, z: 0, gridDelay: 0.15 + k * 0.25,
      };
    });
    const finishOrder: string[] = [];

    // ---- DOM ----
    const el = document.createElement('div');
    el.className = 'rc-race';
    el.innerHTML = `
      <div class="rc-hud">
        <div class="rc-box"><small>${S().pos}</small><b data-h="pos">4/4</b></div>
        <div class="rc-box"><small>${S().lap}</small><b data-h="lap">1/${LAPS}</b></div>
        <div class="rc-box wide"><small>${S().time}</small><b data-h="time">0:00.00</b></div>
      </div>
      <div class="rc-lights"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="rc-msg"></div>
      <div class="rc-controls">
        <div class="rc-steer">
          <button data-k="left" aria-label="${S().steerLeft}">${CHEVRON('l')}</button>
          <button data-k="right" aria-label="${S().steerRight}">${CHEVRON('r')}</button>
        </div>
        <div class="rc-speedo"><b data-h="spd">0</b><small>KM/H</small><span data-h="gear">N</span></div>
        <div class="rc-pedals">
          <button class="rc-pedal brake" data-k="brake">${S().brake}</button>
          <button class="rc-pedal gas" data-k="gas">${S().gas}</button>
        </div>
      </div>`;
    shell.appendChild(el);
    const H = (k: string) => el.querySelector<HTMLElement>(`[data-h="${k}"]`)!;
    const hPos = H('pos'), hLap = H('lap'), hTime = H('time'), hSpd = H('spd'), hGear = H('gear');
    const lights = el.querySelector<HTMLElement>('.rc-lights')!;
    const msg = el.querySelector<HTMLElement>('.rc-msg')!;

    const input = { left: false, right: false, gas: false, brake: false };
    type Key = keyof typeof input;
    el.querySelectorAll<HTMLElement>('[data-k]').forEach((b) => {
      const k = b.dataset.k as Key;
      const set = (on: boolean) => {
        input[k] = on;
        b.classList.toggle('on', on);
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        set(true);
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
    });
    const KEYS: Record<string, Key> = {
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', Space: 'brake',
    };
    const onKey = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      input[k] = e.type === 'keydown';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    // ---- Race flow ----
    let phase: 'countdown' | 'racing' | 'done' = 'countdown';
    let clock = 0;
    let raceTime = 0;
    let lit = 0;
    let hudTimer = 0;
    let gaugeTimer = 0;
    let resultsShown = false;

    function flash(text: string, ms = 1600) {
      msg.textContent = text;
      msg.classList.remove('show');
      void msg.offsetWidth;
      msg.classList.add('show');
      setTimeout(() => msg.textContent === text && msg.classList.remove('show'), ms);
    }

    function totalPlayer() {
      return P.laps * T.L + loc.s - (loc.s > T.L * 0.75 && !P.halfway && P.laps === 0 ? T.L : 0);
    }

    function drawGauge(kmh: number, rpm: number, gear: string) {
      const g = cockpit.gauge;
      const { redline } = spec.engine;
      g.fillStyle = '#07090c';
      g.fillRect(0, 0, 512, 256);
      const segs = 16;
      for (let i = 0; i < segs; i++) {
        const on = rpm / redline > (i + 0.5) / segs;
        const col = i < 10 ? '#22c55e' : i < 13 ? '#facc15' : '#ef4444';
        g.fillStyle = on ? col : '#1a1f27';
        g.fillRect(28 + i * 29, 22, 23, 26);
      }
      g.fillStyle = '#e8f1ff';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = '700 118px system-ui, -apple-system, sans-serif';
      g.fillText(String(Math.round(kmh)), 210, 190);
      g.fillStyle = '#7c8796';
      g.font = '600 26px system-ui, -apple-system, sans-serif';
      g.fillText('KM/H', 210, 230);
      g.strokeStyle = '#2b3340';
      g.lineWidth = 3;
      g.strokeRect(392, 82, 92, 132);
      g.fillStyle = '#ffb020';
      g.font = '700 104px system-ui, -apple-system, sans-serif';
      g.fillText(gear, 438, 190);
      cockpit.gaugeTex.needsUpdate = true;
    }

    function showResults() {
      if (resultsShown) return;
      resultsShown = true;
      const place = P.place;
      const stars = STARS[place - 1];
      ctx.addStars(stars);
      say(place === 1 ? S().win : S().finished(place));
      sfx.win();
      const best = load<Record<string, number>>('race:best', {});
      const record = P.best < (best[spec.id] ?? Infinity);
      if (record) save('race:best', { ...best, [spec.id]: P.best });
      const ov = document.createElement('div');
      ov.className = 'rc-results';
      ov.innerHTML = `
        <div class="rc-card">
          <div class="rc-place">${S().placeBig(place)}<small>${S().place}</small></div>
          <div class="rc-stars">${'★'.repeat(stars)}<span>${'★'.repeat(5 - stars)}</span></div>
          <div class="rc-stats">
            <span>${S().raceTime}</span><b>${fmt(P.finishTime)}</b>
            <span>${S().bestLap}</span><b>${fmt(P.best)}${record ? ` <em>${S().record}</em>` : ''}</b>
            <span>${S().car}</span><b>${spec.name}</b>
          </div>
          <div class="rc-row">
            <button class="rc-ghost" data-a="garage">${S().changeCar}</button>
            <button class="rc-go" data-a="again">${S().again}</button>
          </div>
        </div>`;
      el.appendChild(ov);
      ov.querySelector('[data-a="garage"]')!.addEventListener('click', () => {
        sfx.tap();
        backToGarage();
      });
      ov.querySelector('[data-a="again"]')!.addEventListener('click', () => startRace());
    }

    // ---- Per-frame ----
    const lookPose = { x: 0, z: 0, tx: 0, tz: 0 };

    function updatePlayer(dt: number) {
      const racing = phase === 'racing' && !P.finished;
      let throttle = racing && input.gas ? 1 : 0;
      let brake = racing && input.brake ? 1 : 0;
      if (P.finished) brake = 0.4; // coast to a stop after the flag

      T.locate(P.x, P.z, P.hint, loc);
      P.hint = loc.i;
      const absD = Math.abs(loc.d);
      const onCurb = absD > ROAD_W / 2 && absD < ROAD_W / 2 + CURB_W && T.curb[loc.i] === 1;
      const onGrass = absD > ROAD_W / 2 + (T.curb[loc.i] ? CURB_W : 0.4);

      // Steering input ramps like a real wheel.
      const target = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      P.steer += (target - P.steer) * Math.min(1, dt * (target === 0 ? 5 : 2.6));
      let steer = P.steer;

      const fx = -Math.sin(P.psi), fz = -Math.cos(P.psi);
      const rx = Math.cos(P.psi), rz = -Math.sin(P.psi);
      const vmaxHere = (i: number) => T.vmax[i] * Math.sqrt(spec.grip / REF_GRIP);

      if (assistOn && (racing || P.finished)) {
        // Pure pursuit toward a point ahead, gently pulled toward the middle of the road.
        const ahead = Math.min(36, Math.max(9, 8 + P.v * 0.45));
        T.pose(loc.s + ahead, Math.max(-3, Math.min(3, loc.d * 0.4)), lookPose);
        const dx = lookPose.x - P.x, dz = lookPose.z - P.z;
        const err = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
        // Needed yaw rate to reach the point, as a fraction of what the tyres allow.
        const yawNeed = (2 * Math.sin(err) * Math.max(P.v, 3)) / Math.hypot(dx, dz);
        const yawCap = Math.min(spec.steer, spec.grip / Math.max(Math.abs(P.v), 1)) * Math.min(1, Math.abs(P.v) / 5);
        const auto = Math.max(-1, Math.min(1, yawNeed / Math.max(yawCap, 0.05)));
        steer = Math.max(-1, Math.min(1, steer * 0.5 + auto));
        // Brake assist: stay under the grip limit for this corner and the next one.
        let cap = Infinity;
        for (let d = 0; d <= P.v * 1.2 + 10; d += 6) {
          const vmaxAt = vmaxHere(T.idx(loc.s + d)) * 0.92;
          cap = Math.min(cap, Math.sqrt(vmaxAt * vmaxAt + 2 * 12 * d));
        }
        if (P.v > cap) {
          brake = Math.max(brake, Math.min(1, (P.v - cap) / 4));
          throttle = 0;
        }
      }

      const moving = phase !== 'countdown';
      const cutting = gearbox.update(dt, P.v, phase === 'countdown' && input.gas ? 1 : throttle, moving);
      const eff = cutting ? throttle * 0.25 : throttle;

      const top = spec.top * (onGrass ? spec.offroad : 1);
      let a = 0;
      if (P.v >= 0) a += spec.accel * eff * Math.max(0, 1 - Math.pow(Math.max(0, P.v) / top, 1.6));
      a -= Math.sign(P.v) * 0.3 + 0.0004 * P.v * Math.abs(P.v); // rolling + aero drag
      if (onGrass && P.v > top) a -= 6;
      if (onGrass) a -= 1.2 * Math.sign(P.v);
      if (brake > 0) {
        if (P.v > 0.5) {
          a -= 15 * brake;
          P.reverseHold = 0;
        } else if (racing && input.brake) {
          P.reverseHold += dt;
          if (P.reverseHold > 0.35) a = P.v > -6 ? -4 : 0;
        } else if (P.v > 0) a = -P.v / dt;
      }
      if (!moving) a = 0;
      P.v += a * dt;
      if (!eff && !brake && Math.abs(P.v) < 0.25) P.v = 0;
      if (P.v < 0 && !input.brake && P.v > -0.5) P.v = 0;

      const sp = Math.abs(P.v);
      const yawMax = Math.min(spec.steer, spec.grip / Math.max(sp, 1));
      const yaw = steer * yawMax * Math.min(1, sp / 5) * Math.sign(P.v || 1);
      P.psi -= yaw * dt;
      const skid = Math.max(0, Math.min(1, (Math.abs(steer) * sp * spec.steer - spec.grip * 0.9) / spec.grip)) +
        (brake > 0.8 && sp > 20 ? 0.5 : 0);

      P.x += -Math.sin(P.psi) * P.v * dt;
      P.z += -Math.cos(P.psi) * P.v * dt;

      // Guard rails
      T.locate(P.x, P.z, P.hint, loc);
      const lim = BARRIER - 1.05;
      if (Math.abs(loc.d) > lim) {
        const over = Math.abs(loc.d) - lim;
        const sgn = Math.sign(loc.d);
        P.x -= -T.tz[loc.i] * over * sgn;
        P.z -= T.tx[loc.i] * over * sgn;
        if (sp > 4) {
          sfx.thud();
          P.shake = Math.min(1, sp / 25);
          P.v *= 0.55;
        }
        const trackPsi = Math.atan2(-T.tx[loc.i], -T.tz[loc.i]);
        const diff = Math.atan2(Math.sin(trackPsi - P.psi), Math.cos(trackPsi - P.psi));
        P.psi += diff * 0.25;
      }

      // Rivals as solid objects
      for (const r of ai) {
        const dx = P.x - r.x, dz = P.z - r.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.4 && d > 0.01) {
          const push = (3.4 - d) / d;
          P.x += dx * push * 0.7;
          P.z += dz * push * 0.7;
          if (sp > 3 && P.shake < 0.3) {
            sfx.thud();
            P.shake = 0.5;
          }
          P.v *= 0.97;
        }
      }

      // Laps
      const frac = loc.s / T.L;
      if (frac > 0.4 && frac < 0.6) P.halfway = true;
      if (P.halfway && frac < 0.1 && P.prevFrac > 0.9) {
        P.halfway = false;
        P.laps++;
        const lapTime = raceTime - P.lapStart;
        P.lapStart = raceTime;
        P.best = Math.min(P.best, lapTime);
        if (P.laps >= LAPS) {
          P.finished = true;
          P.finishTime = raceTime;
          finishOrder.push(spec.id);
          P.place = finishOrder.length;
          flash(S().finish(P.place), 2500);
          setTimeout(() => alive && race === self && showResults(), 1800);
        } else {
          flash(LAPS - P.laps === 1 ? S().finalLap : S().lapN(P.laps + 1));
          sfx.beep(true);
        }
      }
      P.prevFrac = frac;

      // Model + camera
      model.group.position.set(P.x, 0, P.z);
      model.group.rotation.y = P.psi;
      for (const s of model.spinners) s.rotation.x -= (P.v * dt) / model.wheelR;
      for (const pv of model.steerPivots) pv.rotation.y = -steer * 0.45;
      cockpit.wheel.rotation.z = -steer * 2.1;

      P.shake = Math.max(0, P.shake - dt * 2.5);
      const rough = onCurb ? 0.7 : onGrass ? Math.min(1, sp / 15) : 0;
      const jitter = P.shake * 0.05 + rough * 0.012 * Math.min(1, sp / 15);
      camera.position.set(
        spec.eye[0] + (Math.random() - 0.5) * jitter,
        spec.eye[1] + (Math.random() - 0.5) * jitter + Math.sin(clock * 9) * 0.002 * Math.min(1, sp / 30),
        spec.eye[2],
      );
      camera.rotation.set(-0.035, steer * 0.05, -steer * 0.025 * Math.min(1, sp / 30));
      const fov = spec.fov + Math.min(1, sp / spec.top) * 8;
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }

      const rpm = gearbox.rpm;
      engine?.update(rpm, phase === 'countdown' ? (input.gas ? 1 : 0) : eff, sp, skid * (onGrass ? 0 : 1), rough);

      gaugeTimer -= dt;
      if (gaugeTimer <= 0) {
        gaugeTimer = 1 / 20;
        const gear = !moving || sp < 0.3 ? 'N' : P.v < 0 ? 'R' : String(gearbox.gear);
        drawGauge(sp * 3.6, rpm, gear);
        hSpd.textContent = String(Math.round(sp * 3.6));
        hGear.textContent = gear;
      }
    }

    function updateAI(dt: number) {
      const pTotal = totalPlayer();
      for (const r of ai) {
        const go = phase !== 'countdown';
        if (!go) {
          r.v = 0;
        } else {
          if ((r.gridDelay -= dt) > 0) continue;
          const i = T.idx(r.s + Math.max(8, r.v * 1.2));
          const gap = pTotal - r.s; // > 0: player ahead
          const band = r.finished ? 0.7 : gap > 0 ? Math.min(catchUp, 1 + gap / 600) : Math.max(0.82, 1 + gap / 500);
          const target = Math.min(r.spec.top * r.skill, T.vmax[i] * Math.sqrt(r.spec.grip / REF_GRIP) * r.skill) * band;
          r.v += Math.max(-12 * dt, Math.min(r.spec.accel * 0.75 * dt * Math.max(0.2, 1 - r.v / r.spec.top), target - r.v));
          r.s += r.v * dt;
          // Drift between lanes, and dodge the player when close behind them.
          if ((r.laneTimer -= dt) <= 0) {
            r.laneTimer = 3 + Math.random() * 4;
            r.laneTarget = (Math.random() - 0.5) * 7;
          }
          const ahead = pTotal - r.s;
          if (ahead > 0 && ahead < 14 && Math.abs(loc.d - r.lane) < 2.8) r.laneTarget = loc.d > 0 ? -3.8 : 3.8;
          r.lane += Math.max(-1.4 * dt, Math.min(1.4 * dt, r.laneTarget - r.lane));
          if (!r.finished && r.s >= LAPS * T.L) {
            r.finished = true;
            finishOrder.push(r.spec.id);
          }
        }
        T.pose(r.s, r.lane, pose);
        r.x = pose.x;
        r.z = pose.z;
        r.model.group.position.set(pose.x, 0, pose.z);
        r.model.group.rotation.y = Math.atan2(-pose.tx, -pose.tz);
        for (const s of r.model.spinners) s.rotation.x -= (r.v * dt) / r.model.wheelR;
      }
    }

    function update(dt: number) {
      clock += dt;
      if (phase === 'countdown') {
        const n = Math.min(5, Math.floor(clock / 0.8));
        if (n > lit) {
          lit = n;
          lights.querySelectorAll('i').forEach((l, k) => l.classList.toggle('on', k < lit));
          sfx.beep(false);
        }
        if (clock > 4.6) {
          phase = 'racing';
          lights.classList.add('go');
          sfx.beep(true);
          flash(S().go, 900);
          setTimeout(() => lights.classList.add('hide'), 900);
        }
      } else {
        raceTime += dt;
      }
      updatePlayer(dt);
      updateAI(dt);

      hudTimer -= dt;
      if (hudTimer <= 0) {
        hudTimer = 0.1;
        if (!P.finished) {
          const pt = totalPlayer();
          P.place = 1 + ai.filter((r) => r.finished || r.s > pt).length;
        }
        hPos.textContent = `${P.place}/${ai.length + 1}`;
        hLap.textContent = `${Math.min(LAPS, P.laps + 1)}/${LAPS}`;
        hTime.textContent = fmt(P.finished ? P.finishTime : raceTime);
      }
    }

    const self = {
      scene, camera, update,
      dispose() {
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
        el.remove();
        disposeTree(scene);
        sky.dispose();
      },
    };
    return self;
  }

  // =================== Loop & lifecycle ===================
  function resize() {
    const w = Math.max(1, root.clientWidth);
    const h = Math.max(1, root.clientHeight);
    renderer.setSize(w, h);
    garage.camera.aspect = w / h;
    garage.camera.updateProjectionMatrix();
    garage.frame(w / h);
    if (race) {
      race.camera.aspect = w / h;
      race.camera.updateProjectionMatrix();
    }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (mode === 'race' && race) {
      race.update(dt);
      renderer.render(race.scene, race.camera);
    } else {
      garage.update(dt);
      renderer.render(garage.scene, garage.camera);
    }
  }

  const onVis = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      engine?.setMuted(true);
    } else {
      engine?.setMuted(false);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVis);

  garage.setCar(carIndex, false);
  garage.show();
  resize();
  raf = requestAnimationFrame(frame);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    ro.disconnect();
    engine?.stop();
    race?.dispose();
    garage.dispose();
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
