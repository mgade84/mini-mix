import type { GameDef } from '../types';
import { Stage } from '../engine/stage';
import { Particles } from '../engine/particles';
import { hornStart, say, sfx } from '../engine/audio';
import { cached, drawEmoji } from '../engine/sprites';
import { clamp, easeOutBack, FONT, pick, randInt, roundRect, shade, TAU, Timers } from '../engine/util';
import { L, type Lang } from '../i18n';

const en = {
  loadFirst: 'Load all the cargo first!',
  waitDelivery: 'Wait for the delivery!',
  loadCargo: 'Load the cargo on the train!',
  welcome: 'Welcome to the Farm! ',
  allAboard: 'All aboard! Push the lever to go!',
  done: 'Great driving!',
  deliveries: (n: number) => `${n} deliveries`,
  bannerLoad: (n: number) => `📦 Load the cargo!  ${n} left`,
  bannerReady: '🚂 Push the lever to go!',
  bannerUnload: (icon: string, name: string) => `${icon} Delivering to ${name}…`,
  bannerNext: (icon: string, name: string) => `Next stop: ${icon} ${name}`,
  horn: 'Horn',
};
export const M: Record<Lang, typeof en> = {
  en,
  da: {
    loadFirst: 'Læs alle varerne på først!',
    waitDelivery: 'Vent på leveringen!',
    loadCargo: 'Læs varerne på toget!',
    welcome: 'Velkommen til bondegården! ',
    allAboard: 'Alle om bord! Skub håndtaget for at køre!',
    done: 'Flot kørt!',
    deliveries: (n: number) => `${n} leveringer`,
    bannerLoad: (n: number) => `📦 Læs varerne på!  ${n} tilbage`,
    bannerReady: '🚂 Skub håndtaget for at køre!',
    bannerUnload: (icon: string, name: string) => `${icon} Leverer til ${name}…`,
    bannerNext: (icon: string, name: string) => `Næste stop: ${icon} ${name}`,
    horn: 'Horn',
  },
};

interface Pt { x: number; y: number; }

/** Track shape as a closed spline through these points (0..1 of the play area). */
const CTRL: [number, number][] = [
  [0.18, 0.12], [0.5, 0.08], [0.82, 0.14], [0.9, 0.34], [0.9, 0.62], [0.84, 0.82],
  [0.62, 0.92], [0.26, 0.9], [0.1, 0.64], [0.32, 0.46], [0.1, 0.28],
];

export const STATIONS = [
  { name: { en: 'Farm', da: 'Bondegård' }, icon: '🏡', at: 0.08, cargo: ['🍎', '🥕', '🌽', '🥚', '🍓'] },
  { name: { en: 'Toy Shop', da: 'Legetøjsbutik' }, icon: '🏪', at: 0.41, cargo: ['🧸', '🪀', '🎈', '🪁', '⚽'] },
  { name: { en: 'Factory', da: 'Fabrik' }, icon: '🏭', at: 0.74, cargo: ['📦', '🪵', '🧱', '🔩', '🛢️'] },
];
const DECOR = ['🌳', '🌲', '🌳', '🌷', '🌼', '🪨', '🐄', '🐑', '🌻', '🌲'];
const WAGON_COLORS = ['#3a86ff', '#ffb703', '#38b000'];
const PER_WAGON = 2;

/** Closed track resampled at (almost) equal arc-length steps for O(1) lookups. */
class Track {
  xs = new Float32Array(0);
  ys = new Float32Array(0);
  n = 0;
  ds = 3;
  L = 0;

  build(ctrl: Pt[]) {
    const dense: Pt[] = [];
    const m = ctrl.length;
    for (let i = 0; i < m; i++) {
      const p0 = ctrl[(i - 1 + m) % m], p1 = ctrl[i], p2 = ctrl[(i + 1) % m], p3 = ctrl[(i + 2) % m];
      for (let k = 0; k < 24; k++) {
        const t = k / 24, t2 = t * t, t3 = t2 * t;
        const cr = (a: number, b: number, c: number, d: number) =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        dense.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) });
      }
    }
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1], b = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.L = cum[dense.length];
    this.n = Math.max(8, Math.floor(this.L / 3));
    this.ds = this.L / this.n;
    this.xs = new Float32Array(this.n);
    this.ys = new Float32Array(this.n);
    let j = 0;
    for (let k = 0; k < this.n; k++) {
      const target = k * this.ds;
      while (cum[j + 1] < target) j++;
      const t = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
      const a = dense[j], b = dense[(j + 1) % dense.length];
      this.xs[k] = a.x + (b.x - a.x) * t;
      this.ys[k] = a.y + (b.y - a.y) * t;
    }
  }

  at(s: number, out: Pt) {
    s = ((s % this.L) + this.L) % this.L;
    const f = s / this.ds;
    const i = Math.floor(f) % this.n;
    const j = (i + 1) % this.n;
    const t = f - Math.floor(f);
    out.x = this.xs[i] + (this.xs[j] - this.xs[i]) * t;
    out.y = this.ys[i] + (this.ys[j] - this.ys[i]) * t;
    return out;
  }

  /** Unit normal (left of travel direction). */
  normal(s: number, out: Pt) {
    const a = this.at(s - 3, { x: 0, y: 0 });
    const b = this.at(s + 3, { x: 0, y: 0 });
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    out.x = -(b.y - a.y) / len;
    out.y = (b.x - a.x) / len;
    return out;
  }
}

function locoSprite() {
  return cached('loco', 80, 44, (c) => {
    roundRect(c, 1, 3, 78, 38, 10);
    c.fillStyle = '#2b2d42';
    c.fill();
    roundRect(c, 26, 7, 50, 30, 14);
    c.fillStyle = '#e63946';
    c.fill();
    c.fillStyle = '#ffd166';
    c.fillRect(40, 7, 3, 30);
    c.fillRect(56, 7, 3, 30);
    c.beginPath();
    c.arc(48, 22, 6, 0, TAU);
    c.fill();
    c.fillStyle = '#212529';
    c.beginPath();
    c.arc(67, 22, 7, 0, TAU);
    c.fill();
    c.fillStyle = '#495057';
    c.beginPath();
    c.arc(67, 22, 4, 0, TAU);
    c.fill();
    roundRect(c, 3, 4, 22, 36, 6);
    c.fillStyle = '#1d3557';
    c.fill();
    roundRect(c, 7, 8, 14, 28, 4);
    c.fillStyle = '#457b9d';
    c.fill();
    c.fillStyle = '#fff3b0';
    for (const y of [11, 33]) {
      c.beginPath();
      c.arc(77, y, 3, 0, TAU);
      c.fill();
    }
  });
}

function wagonSprite(color: string) {
  return cached('wagon:' + color, 64, 40, (c) => {
    roundRect(c, 1, 2, 62, 36, 8);
    c.fillStyle = '#2b2d42';
    c.fill();
    roundRect(c, 4, 4, 56, 32, 7);
    c.fillStyle = color;
    c.fill();
    roundRect(c, 9, 9, 46, 22, 5);
    c.fillStyle = shade(color, -0.3);
    c.fill();
  });
}

interface Pose { x: number; y: number; a: number; len: number; fx: number; fy: number; bx: number; by: number; }
interface Station { name: string; icon: string; cargo: string[]; s: number; side: number; bx: number; by: number; spots: Pt[]; }
interface Crate { ch: string; x: number; y: number; hx: number; hy: number; drag: number | null; ox: number; oy: number; downX: number; downY: number; appear: number; spot: number; }
interface Flyer { ch: string; x0: number; y0: number; x1: number; y1: number; t: number; dur: number; size: number; done: () => void; }

type Phase = 'drive' | 'unload' | 'load' | 'ready';

export const train: GameDef = {
  id: 'train',
  title: { en: 'Choo-Choo Train', da: 'Tut-tut-toget' },
  emoji: '🚂',
  color: '#e76f51',
  age: '4+',
  start(ctx) {
    const stage = new Stage(ctx.area);
    const fx = new Particles(900);
    const timers = new Timers();
    const track = new Track();
    const bgCanvas = document.createElement('canvas');
    const tmp: Pt = { x: 0, y: 0 };
    const tmp2: Pt = { x: 0, y: 0 };
    const nrm: Pt = { x: 0, y: 0 };

    let sc = 1;
    let bannerY = 0;
    let locoLen = 76, wagonLen = 62, gap = 10, carW = 40, trainLen = 300;
    let stations: Station[] = [];
    const poses: Pose[] = Array.from({ length: 1 + WAGON_COLORS.length }, () => ({ x: 0, y: 0, a: 0, len: 0, fx: 0, fy: 0, bx: 0, by: 0 }));
    let s = -1; // head of the train along the track
    let v = 0;
    let throttle = 0;
    let locked = true;
    let phase: Phase = 'load';
    let atStation = 0;
    let nextStation = 0;
    let crates: Crate[] = [];
    let cargo: string[] = []; // '' = reserved slot, item still flying in
    let flyers: Flyer[] = [];
    let deliveries = 0;
    let chuffDist = 0;
    let idlePuff = 0;
    let lastHint = 0;
    let alive = true;
    let stopHorn: (() => void) | null = null;

    // ---- Controls ----
    const bar = document.createElement('div');
    bar.className = 'toolbar bottom train-bar';
    bar.innerHTML = `
      <div class="throttle">
        <span>🐢</span>
        <div class="thr-track"><div class="thr-fill"></div><div class="thr-knob">🚂</div></div>
        <span>🐇</span>
      </div>
      <button class="horn" aria-label="${L(M).horn}">📯</button>`;
    ctx.shell.appendChild(bar);
    const thr = bar.querySelector<HTMLElement>('.thr-track')!;
    const horn = bar.querySelector<HTMLElement>('.horn')!;

    function setThrottle(x: number) {
      throttle = x;
      thr.style.setProperty('--v', x.toFixed(3));
    }

    function refreshBar() {
      thr.classList.toggle('locked', locked);
      thr.classList.toggle('pulse', phase === 'ready' && throttle === 0);
    }

    let thrPointer: number | null = null;
    const setFromEvent = (e: PointerEvent) => {
      const r = thr.getBoundingClientRect();
      let x = clamp((e.clientX - r.left - 34) / (r.width - 68), 0, 1);
      if (x < 0.04) x = 0;
      setThrottle(x);
      refreshBar();
    };
    thr.addEventListener('pointerdown', (e) => {
      if (locked) {
        thr.classList.remove('shake');
        void thr.offsetWidth;
        thr.classList.add('shake');
        const now = performance.now();
        if (now - lastHint > 2500) {
          lastHint = now;
          say(phase === 'load' ? L(M).loadFirst : L(M).waitDelivery);
        }
        return;
      }
      thrPointer = e.pointerId;
      thr.setPointerCapture(e.pointerId);
      setFromEvent(e);
    });
    thr.addEventListener('pointermove', (e) => {
      if (e.pointerId === thrPointer) setFromEvent(e);
    });
    const thrUp = (e: PointerEvent) => {
      if (e.pointerId === thrPointer) thrPointer = null;
    };
    thr.addEventListener('pointerup', thrUp);
    thr.addEventListener('pointercancel', thrUp);

    function toot(hold?: number) {
      stopHorn?.();
      stopHorn = hornStart();
      horn.classList.add('on');
      const p = poses[0];
      fx.burst(p.x + Math.cos(p.a) * locoLen * 0.3, p.y + Math.sin(p.a) * locoLen * 0.3, {
        count: 8, color: 'rgba(255,255,255,0.9)', speed: 90, size: 6 * sc, grow: 18 * sc, life: 0.9, drag: 2,
      });
      if (hold !== undefined) timers.after(hold, endToot);
    }
    function endToot() {
      stopHorn?.();
      stopHorn = null;
      horn.classList.remove('on');
    }
    horn.addEventListener('pointerdown', (e) => {
      horn.setPointerCapture(e.pointerId);
      toot();
    });
    horn.addEventListener('pointerup', endToot);
    horn.addEventListener('pointercancel', endToot);

    // ---- Layout ----
    const mod = (x: number) => ((x % track.L) + track.L) % track.L;

    function layout() {
      bannerY = ctx.topInset + 2;
      const top = bannerY + 48; // room for the message banner
      const bottom = bar.offsetTop - 8;
      const W = stage.width;
      const H = Math.max(200, bottom - top);
      sc = clamp(Math.min(W, H) / 700, 0.65, 1.4);
      locoLen = 76 * sc;
      wagonLen = 62 * sc;
      gap = 10 * sc;
      carW = 40 * sc;
      trainLen = locoLen + WAGON_COLORS.length * (wagonLen + gap);
      const m = 48 * sc;
      const frac = s >= 0 && track.L ? s / track.L : -1;
      track.build(CTRL.map(([u, w]) => ({ x: m + u * (W - 2 * m), y: top + m * 0.5 + w * (H - m) })));
      s = frac >= 0 ? frac * track.L : 0;

      const angleAt = (d: number) => {
        track.normal(d, nrm);
        return Math.atan2(nrm.y, nrm.x);
      };
      const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
      const clearance = (x: number, y: number) => {
        let best = Infinity;
        for (let i = 0; i < track.n; i += 2) best = Math.min(best, Math.hypot(track.xs[i] - x, track.ys[i] - y));
        const edge = Math.min(x, y - top, W - x, bottom - y);
        return Math.min(best, edge * 1.5);
      };

      stations = STATIONS.map((d) => {
        // Use the straightest stretch near the intended spot, so the platform fits the train.
        let st = d.at * track.L;
        let bestTurn = Infinity;
        for (let c = (d.at - 0.07) * track.L; c <= (d.at + 0.07) * track.L; c += 8) {
          const tv = turn(angleAt(c), angleAt(c - trainLen)) + turn(angleAt(c), angleAt(c - trainLen / 2));
          if (tv < bestTurn) {
            bestTurn = tv;
            st = mod(c);
          }
        }
        // One side for the whole station: whichever has more free space for the building.
        const mid = st - trainLen / 2;
        const p = track.at(mid, { x: 0, y: 0 });
        const n = track.normal(mid, { x: 0, y: 0 });
        const off = 100 * sc;
        const side = clearance(p.x + n.x * off, p.y + n.y * off) >= clearance(p.x - n.x * off, p.y - n.y * off) ? 1 : -1;
        const spots: Pt[] = [];
        for (let k = 0; k < WAGON_COLORS.length * PER_WAGON; k++) {
          const ss = st - trainLen * 0.12 - (k * trainLen * 0.78) / (WAGON_COLORS.length * PER_WAGON - 1);
          const q = track.at(ss, { x: 0, y: 0 });
          const qn = track.normal(ss, { x: 0, y: 0 });
          spots.push({ x: q.x + qn.x * side * 38 * sc, y: q.y + qn.y * side * 38 * sc });
        }
        return {
          name: L(d.name), icon: d.icon, cargo: d.cargo, s: st, side, spots,
          bx: p.x + n.x * side * off, by: p.y + n.y * side * off,
        };
      });
      if (phase !== 'drive') s = stations[atStation].s; // stay parked at the platform
      for (const c of crates) {
        const sp = stations[atStation].spots[c.spot];
        c.hx = sp.x;
        c.hy = sp.y;
        if (c.drag === null) {
          c.x = c.hx;
          c.y = c.hy;
        }
      }
      renderBackground(W, stage.height);
      computePoses();
    }

    function tracePath(b: CanvasRenderingContext2D, off: number) {
      b.beginPath();
      for (let i = 0; i < track.n; i++) {
        const i0 = (i - 1 + track.n) % track.n, i1 = (i + 1) % track.n;
        const dx = track.xs[i1] - track.xs[i0], dy = track.ys[i1] - track.ys[i0];
        const l = Math.hypot(dx, dy) || 1;
        b.lineTo(track.xs[i] - (dy / l) * off, track.ys[i] + (dx / l) * off);
      }
      b.closePath();
    }

    /** Everything that doesn't move is drawn once into an offscreen canvas. */
    function renderBackground(W: number, H: number) {
      const dpr = stage.dpr;
      bgCanvas.width = Math.round(W * dpr);
      bgCanvas.height = Math.round(H * dpr);
      const b = bgCanvas.getContext('2d')!;
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      let seed = 12345;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

      b.fillStyle = '#93d36f';
      b.fillRect(0, 0, W, H);
      b.fillStyle = 'rgba(255,255,255,0.08)';
      for (let i = 0; i < 70; i++) {
        b.beginPath();
        b.arc(rnd() * W, rnd() * H, 10 + rnd() * 40, 0, TAU);
        b.fill();
      }

      // Platforms (under the track edge)
      for (const st of stations) {
        b.beginPath();
        for (let k = 0; k <= 30; k++) {
          const ss = st.s + trainLen * 0.02 - (k / 30) * trainLen * 1.04;
          track.at(ss, tmp);
          track.normal(ss, nrm);
          b.lineTo(tmp.x + nrm.x * st.side * 38 * sc, tmp.y + nrm.y * st.side * 38 * sc);
        }
        b.lineCap = 'round';
        b.lineJoin = 'round';
        b.lineWidth = 46 * sc;
        b.strokeStyle = '#b08968';
        b.stroke();
        b.lineWidth = 38 * sc;
        b.strokeStyle = '#ede0d4';
        b.stroke();
      }

      // Ballast, sleepers, rails
      b.lineJoin = 'round';
      tracePath(b, 0);
      b.lineWidth = 34 * sc;
      b.strokeStyle = '#cbb796';
      b.stroke();
      b.fillStyle = '#8b5a2b';
      for (let d = 0; d < track.L; d += 15 * sc) {
        track.at(d, tmp);
        track.normal(d, nrm);
        const a = Math.atan2(nrm.y, nrm.x);
        b.setTransform(Math.cos(a) * dpr, Math.sin(a) * dpr, -Math.sin(a) * dpr, Math.cos(a) * dpr, tmp.x * dpr, tmp.y * dpr);
        b.fillRect(-14 * sc, -3 * sc, 28 * sc, 6 * sc);
      }
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const off of [-8 * sc, 8 * sc]) {
        tracePath(b, off);
        b.lineWidth = 4 * sc;
        b.strokeStyle = '#5c677d';
        b.stroke();
        b.lineWidth = 1.5 * sc;
        b.strokeStyle = '#ced4da';
        b.stroke();
      }

      // Station buildings + signs
      b.textAlign = 'center';
      b.textBaseline = 'middle';
      for (const st of stations) {
        drawEmoji(b, st.icon, st.bx, st.by, 72 * sc);
        b.font = `900 ${20 * sc}px ${FONT}`;
        const w = b.measureText(st.name).width + 24 * sc;
        const y = st.by + 48 * sc;
        roundRect(b, st.bx - w / 2, y - 15 * sc, w, 30 * sc, 15 * sc);
        b.fillStyle = '#ffffff';
        b.fill();
        b.fillStyle = '#2b2d42';
        b.fillText(st.name, st.bx, y + 1);
      }

      // Scenery, kept clear of track and stations
      const clearTrack = (x: number, y: number, r: number) => {
        for (let i = 0; i < track.n; i += 3) {
          if (Math.hypot(track.xs[i] - x, track.ys[i] - y) < r) return false;
        }
        return stations.every((st) =>
          Math.hypot(st.bx - x, st.by - y) > 80 * sc && st.spots.every((p) => Math.hypot(p.x - x, p.y - y) > 50 * sc));
      };
      const top = bannerY + 40;
      for (let i = 0, placed = 0; i < 300 && placed < 26; i++) {
        const x = 20 + rnd() * (W - 40);
        const y = top + rnd() * (bar.offsetTop - top - 20);
        const size = (28 + rnd() * 22) * sc;
        if (!clearTrack(x, y, 30 * sc + size * 0.6)) continue;
        drawEmoji(b, DECOR[Math.floor(rnd() * DECOR.length)], x, y, size);
        placed++;
      }
    }

    function computePoses() {
      let cs = s - locoLen / 2;
      for (let i = 0; i < poses.length; i++) {
        const len = i === 0 ? locoLen : wagonLen;
        if (i > 0) cs -= (i === 1 ? locoLen / 2 : wagonLen / 2) + gap + wagonLen / 2;
        track.at(cs + len / 2, tmp);
        track.at(cs - len / 2, tmp2);
        const p = poses[i];
        p.len = len;
        p.fx = tmp.x; p.fy = tmp.y; p.bx = tmp2.x; p.by = tmp2.y;
        p.x = (tmp.x + tmp2.x) / 2;
        p.y = (tmp.y + tmp2.y) / 2;
        p.a = Math.atan2(tmp.y - tmp2.y, tmp.x - tmp2.x);
      }
    }

    function slotPos(k: number): Pt {
      const p = poses[1 + Math.floor(k / PER_WAGON)];
      const off = (k % PER_WAGON ? -1 : 1) * 13 * sc;
      return { x: p.x + Math.cos(p.a) * off, y: p.y + Math.sin(p.a) * off };
    }

    // ---- Station flow ----
    function arrive(i: number) {
      const st = stations[i];
      atStation = i;
      v = 0;
      setThrottle(0);
      locked = true;
      sfx.hiss();
      refreshBar();
      if (cargo.length) {
        say(`${st.name}!`);
        unload(st);
      } else {
        startLoad(`${st.name}! `);
      }
    }

    function unload(st: Station) {
      phase = 'unload';
      const items = cargo.slice();
      items.forEach((ch, k) =>
        timers.after(0.6 + k * 0.3, () => {
          const p = slotPos(k);
          cargo[k] = '';
          flyers.push({
            ch, x0: p.x, y0: p.y, x1: st.bx, y1: st.by, t: 0, dur: 0.6, size: 28 * sc,
            done: () => {
              fx.burst(st.bx, st.by, { count: 12, kind: 'star', speed: 260, size: 10, life: 0.8, gravity: 200 });
              sfx.pop(1.2);
              ctx.addStars(1);
            },
          });
        }),
      );
      timers.after(0.6 + items.length * 0.3 + 0.8, async () => {
        cargo = [];
        deliveries++;
        sfx.good();
        if (deliveries % 3 === 0) {
          await ctx.celebrate(L(M).done, L(M).deliveries(deliveries), 5);
          if (!alive) return;
        }
        startLoad('');
      });
    }

    function startLoad(prefix: string) {
      const st = stations[atStation];
      const count = randInt(3, WAGON_COLORS.length * PER_WAGON);
      crates = Array.from({ length: count }, (_, k) => ({
        ch: pick(st.cargo), x: st.spots[k].x, y: st.spots[k].y, hx: st.spots[k].x, hy: st.spots[k].y,
        drag: null, ox: 0, oy: 0, downX: 0, downY: 0, appear: -k * 0.12, spot: k,
      }));
      phase = 'load';
      say(prefix + L(M).loadCargo);
      refreshBar();
    }

    function loadCrate(c: Crate) {
      crates.splice(crates.indexOf(c), 1);
      const k = cargo.length;
      cargo.push('');
      const to = slotPos(k);
      sfx.tap();
      flyers.push({
        ch: c.ch, x0: c.x, y0: c.y, x1: to.x, y1: to.y, t: 0, dur: 0.45, size: 34 * sc,
        done: () => {
          cargo[k] = c.ch;
          sfx.snap();
          fx.burst(to.x, to.y, { count: 8, kind: 'star', speed: 160, size: 8, life: 0.5 });
          if (phase === 'load' && crates.length === 0 && cargo.every(Boolean)) ready();
        },
      });
    }

    function ready() {
      phase = 'ready';
      nextStation = (atStation + 1) % stations.length;
      locked = false;
      sfx.good();
      say(L(M).allAboard);
      timers.after(0.3, () => toot(0.5));
      refreshBar();
    }

    // ---- Touch on the play field ----
    const nearTrain = (x: number, y: number) => poses.some((p) => Math.hypot(p.x - x, p.y - y) < 70 * sc);

    stage.on({
      down: (x, y, id) => {
        if (phase === 'load') {
          for (let i = crates.length - 1; i >= 0; i--) {
            const c = crates[i];
            if (c.drag !== null || c.appear < 1 || Math.hypot(c.x - x, c.y - y) > 36 * sc) continue;
            c.drag = id;
            c.ox = c.x - x;
            c.oy = c.y - y;
            c.downX = x;
            c.downY = y;
            crates.splice(i, 1);
            crates.push(c);
            sfx.tap();
            return;
          }
        }
        if (Math.hypot(poses[0].x - x, poses[0].y - y) < 45 * sc) toot(0.4);
      },
      move: (x, y, id) => {
        for (const c of crates) {
          if (c.drag !== id) continue;
          c.x = x + c.ox;
          c.y = y + c.oy;
        }
      },
      up: (x, y, id) => {
        for (const c of crates.slice()) {
          if (c.drag !== id) continue;
          c.drag = null;
          // A tap, or a drop onto the train, loads it.
          if (Math.hypot(x - c.downX, y - c.downY) < 14 || nearTrain(c.x, c.y)) loadCrate(c);
          else sfx.boing();
        }
      },
    });

    stage.onResize(layout);
    layout();
    startLoad(L(M).welcome);

    const MAXV = () => 230 * sc;
    const ACCEL = () => 140 * sc;
    const BRAKE = () => 240 * sc;

    stage.start((dt, t) => {
      timers.update(dt);
      fx.update(dt);

      if (phase === 'ready' && throttle > 0) {
        phase = 'drive';
        refreshBar();
      }
      if (phase === 'drive') {
        const target = throttle * MAXV();
        v += clamp(target - v, -BRAKE() * dt, ACCEL() * dt);
        const st = stations[nextStation];
        const d = mod(st.s - s);
        v = Math.min(v, Math.sqrt(2 * BRAKE() * d)); // brake smoothly into the station
        const step = v * dt;
        if (d < 30 * sc && step >= d - 0.5) {
          s = st.s;
          computePoses();
          arrive(nextStation);
        } else {
          s = mod(s + step);
        }
        chuffDist += step;
        if (chuffDist > 44 * sc) {
          chuffDist = 0;
          sfx.chuff();
          const p = poses[0];
          fx.burst(p.x + Math.cos(p.a) * locoLen * 0.3, p.y + Math.sin(p.a) * locoLen * 0.3, {
            count: 2, color: 'rgba(255,255,255,0.85)', speed: 30, size: 5 * sc, grow: 16 * sc, life: 1.1, drag: 1,
          });
        }
      } else if ((idlePuff -= dt) <= 0) {
        idlePuff = 1.4;
        const p = poses[0];
        fx.burst(p.x + Math.cos(p.a) * locoLen * 0.3, p.y + Math.sin(p.a) * locoLen * 0.3, {
          count: 1, color: 'rgba(255,255,255,0.7)', speed: 15, size: 4 * sc, grow: 12 * sc, life: 1.2, drag: 1,
        });
      }
      computePoses();

      const c = stage.ctx;
      const dpr = stage.dpr;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(bgCanvas, 0, 0);
      stage.resetTransform();

      // Waiting cargo on the platform
      for (const k of crates) {
        k.appear = Math.min(1, k.appear + dt * 2.5);
        if (k.appear <= 0) continue;
        if (k.drag === null) {
          const f = Math.min(1, dt * 12);
          k.x += (k.hx - k.x) * f;
          k.y += (k.hy - k.y) * f;
        }
        const bob = k.drag === null ? Math.sin(t * 4 + k.spot) * 3 : 0;
        const size = 34 * sc * easeOutBack(k.appear) * (k.drag !== null ? 1.3 : 1);
        drawEmoji(c, k.ch, k.x, k.y + bob, size);
      }

      // Couplings, then cars
      c.beginPath();
      for (let i = 1; i < poses.length; i++) {
        c.moveTo(poses[i - 1].bx, poses[i - 1].by);
        c.lineTo(poses[i].fx, poses[i].fy);
      }
      c.lineWidth = 4 * sc;
      c.strokeStyle = '#2b2d42';
      c.stroke();
      for (let i = poses.length - 1; i >= 0; i--) {
        const p = poses[i];
        const cs = Math.cos(p.a), sn = Math.sin(p.a);
        c.setTransform(cs * dpr, sn * dpr, -sn * dpr, cs * dpr, p.x * dpr, p.y * dpr);
        if (i === 0) {
          c.drawImage(locoSprite(), -p.len / 2, -carW / 2 - 1 * sc, p.len, carW * 1.1);
        } else {
          c.drawImage(wagonSprite(WAGON_COLORS[i - 1]), -p.len / 2, -carW / 2, p.len, carW);
          for (let j = 0; j < PER_WAGON; j++) {
            const ch = cargo[(i - 1) * PER_WAGON + j];
            if (ch) drawEmoji(c, ch, (j ? -1 : 1) * 13 * sc, 0, 24 * sc);
          }
        }
      }
      stage.resetTransform();

      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i];
        f.t += dt / f.dur;
        const e = Math.min(1, f.t);
        const x = f.x0 + (f.x1 - f.x0) * e;
        const y = f.y0 + (f.y1 - f.y0) * e - Math.sin(e * Math.PI) * 50 * sc;
        drawEmoji(c, f.ch, x, y, f.size);
        if (f.t >= 1) {
          flyers.splice(i, 1);
          f.done();
        }
      }
      fx.draw(c, dpr);

      // Message banner
      const st = stations[phase === 'drive' ? nextStation : atStation];
      const msg =
        phase === 'load' ? L(M).bannerLoad(crates.length)
        : phase === 'ready' ? L(M).bannerReady
        : phase === 'unload' ? L(M).bannerUnload(st.icon, st.name)
        : L(M).bannerNext(st.icon, st.name);
      c.font = `900 ${clamp(22 * sc, 18, 28)}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const bw = c.measureText(msg).width + 40;
      const by = bannerY;
      roundRect(c, stage.width / 2 - bw / 2, by, bw, 44, 22);
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.fill();
      c.fillStyle = '#2b2d42';
      c.fillText(msg, stage.width / 2, by + 23);
    });

    return () => {
      alive = false;
      timers.clear();
      endToot();
      stage.destroy();
      bar.remove();
      bgCanvas.width = bgCanvas.height = 0;
    };
  },
};
