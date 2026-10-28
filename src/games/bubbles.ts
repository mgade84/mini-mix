import type { GameDef } from '../types';
import { Stage } from '../engine/stage';
import { Particles } from '../engine/particles';
import { sfx } from '../engine/audio';
import { cached, drawEmoji } from '../engine/sprites';
import { clamp, easeOutBack, easeOutCubic, hexA, pick, rand, randInt, roundRect, shuffle, TAU } from '../engine/util';

const COLORS = ['#ff5d8f', '#4cc9f0', '#80ed99', '#ffd166', '#b388ff', '#ff9f1c'];
const CRITTERS = ['🐟', '🐸', '🐥', '🦋', '🐞', '🐠', '🐙', '🦀', '🐳', '🐝'];

interface Bubble {
  bx: number; y: number; vx: number; vy: number; r: number;
  phase: number; wob: number; color: string; critter: string | null;
  golden: boolean; age: number;
}

interface Floater {
  x: number; y: number; vy: number; life: number; ch: string; size: number;
}

/** A slot in the collector (bottom right): fills up as `need` of its animal fly in. */
interface Slot {
  ch: string; need: number; have: number; coming: number; bounce: number;
}

/** An animal on its way from a popped bubble to its slot. */
interface Flyer {
  ch: string; slot: number; x0: number; y0: number; size0: number; t: number;
}

const COLLECT = 3;
const FLY_TIME = 0.85;

function bubbleSprite(color: string) {
  return cached('bubble:' + color, 160, 160, (c) => {
    const g = c.createRadialGradient(55, 50, 8, 80, 80, 78);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.3, hexA(color, 0.22));
    g.addColorStop(0.8, hexA(color, 0.5));
    g.addColorStop(1, hexA(color, 0.95));
    c.fillStyle = g;
    c.beginPath();
    c.arc(80, 80, 76, 0, TAU);
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath();
    c.ellipse(52, 44, 18, 10, -0.7, 0, TAU);
    c.fill();
    c.beginPath();
    c.arc(112, 116, 5, 0, TAU);
    c.fill();
  });
}

export const bubbles: GameDef = {
  id: 'bubbles',
  title: { en: 'Bubble Pop', da: 'Boblepop' },
  emoji: '🫧',
  color: '#3fa7f5',
  age: '4+',
  start(ctx) {
    const stage = new Stage(ctx.area);
    const fx = new Particles(1200);
    const list: Bubble[] = [];
    const floaters: Floater[] = [];
    const pressed = new Set<number>();
    let bg: CanvasGradient | null = null;
    let spawnIn = 0;
    let time = 0;
    let pops = 0;
    let alive = true;
    let slots: Slot[] = [];
    const flyers: Flyer[] = [];

    function newRound() {
      slots = shuffle([...CRITTERS]).slice(0, COLLECT).map((ch) => ({ ch, need: randInt(2, 5), have: 0, coming: 0, bounce: 0 }));
    }
    newRound();

    const wanted = (s: Slot) => s.have + s.coming < s.need;

    /** Collector layout: a row of slots in the bottom-right corner, with progress dots below each. */
    function collector() {
      const size = 62 * scale();
      const gap = 10 * scale();
      const pad = 12 * scale();
      const dots = 16 * scale();
      const w = COLLECT * size + (COLLECT - 1) * gap + pad * 2;
      const h = size + dots + pad * 2;
      const x = stage.width - w - 16;
      const y = stage.height - h - 16;
      const slot = (i: number) => ({ x: x + pad + i * (size + gap) + size / 2, y: y + pad + size / 2 });
      return { x, y, w, h, size, dots, slot };
    }

    const scale = () => clamp(Math.min(stage.width, stage.height) / 800, 0.6, 1.4);
    stage.onResize(() => (bg = null));

    function spawn(x?: number, y?: number, small = false): Bubble {
      const golden = !small && x === undefined && Math.random() < 0.06;
      const r = (small ? rand(22, 32) : golden ? 72 : rand(34, 66)) * scale();
      const b: Bubble = {
        bx: x ?? rand(r, stage.width - r),
        y: y ?? stage.height + r,
        vx: 0,
        vy: rand(55, 115) * scale(),
        r,
        phase: rand(0, TAU),
        wob: rand(8, 26),
        color: golden ? '#ffd166' : pick(COLORS),
        critter: !golden && !small && Math.random() < 0.3 ? pickCritter() : null,
        golden,
        age: 0,
      };
      list.push(b);
      return b;
    }

    /** Mostly animals still missing from the collector, so a round doesn't drag on. */
    function pickCritter() {
      const missing = slots.filter(wanted);
      return missing.length && Math.random() < 0.55 ? pick(missing).ch : pick(CRITTERS);
    }

    const bubbleX = (b: Bubble) => b.bx + Math.sin(time * 1.4 + b.phase) * b.wob;

    function pop(i: number) {
      const b = list[i];
      const x = bubbleX(b);
      list.splice(i, 1);
      fx.ring(x, b.y, '#ffffff', b.r);
      fx.burst(x, b.y, { count: 14, color: [b.color, '#ffffff'], speed: 280 * scale(), size: 5 * scale(), gravity: 500, life: 0.7 });
      sfx.pop(clamp(50 / b.r, 0.6, 1.8));
      const slot = slots.findIndex((s) => s.ch === b.critter && wanted(s));
      if (slot >= 0) {
        slots[slot].coming++;
        flyers.push({ ch: b.critter!, slot, x0: x, y0: b.y, size0: b.r, t: 0 });
        sfx.whoosh();
      } else if (b.critter) floaters.push({ x, y: b.y, vy: -220, life: 1, ch: b.critter, size: b.r });
      if (b.golden) {
        sfx.good();
        fx.burst(x, b.y, { count: 30, kind: 'star', speed: 420, size: 12, life: 1.2, gravity: 200 });
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU;
          const s = spawn(x, b.y, true);
          s.vx = Math.cos(a) * 260;
          s.vy = 60 - Math.sin(a) * 120;
          s.age = 1;
        }
      }
      if (++pops % 10 === 0) ctx.addStars(1);
    }

    function hit(x: number, y: number) {
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        const dx = bubbleX(b) - x;
        const dy = b.y - y;
        const rr = b.r + 14; // generous targets for small fingers
        if (dx * dx + dy * dy < rr * rr) {
          pop(i);
          return true;
        }
      }
      return false;
    }

    stage.on({
      down: (x, y, id) => {
        pressed.add(id);
        if (!hit(x, y)) fx.burst(x, y, { count: 6, kind: 'star', color: '#ffffff', speed: 120, size: 7, life: 0.5 });
      },
      // Swiping across bubbles pops them too.
      move: (x, y, id) => {
        if (pressed.has(id)) hit(x, y);
      },
      up: (_x, _y, id) => pressed.delete(id),
    });

    function land(i: number) {
      const s = slots[i];
      s.coming--;
      s.have++;
      s.bounce = 1;
      const p = collector().slot(i);
      fx.burst(p.x, p.y, { count: 16, kind: 'star', speed: 260 * scale(), size: 9 * scale(), life: 0.8, gravity: 300 });
      if (s.have < s.need) {
        sfx.pop(1.5);
        return;
      }
      sfx.good();
      ctx.addStars(1);
      if (slots.some((x) => x.have < x.need)) return;
      const found = slots.map((x) => `${x.need} ${x.ch}`).join('  ');
      setTimeout(async () => {
        if (!alive) return;
        await ctx.celebrate(undefined, found, COLLECT);
        if (alive) newRound();
      }, 700);
    }

    /** Position along the flight: an arc up and over into the slot, shrinking to fit. */
    function flyerPos(f: Flyer) {
      const to = collector().slot(f.slot);
      const k = easeOutCubic(clamp(f.t, 0, 1));
      const cx = (f.x0 + to.x) / 2;
      const cy = Math.min(f.y0, to.y) - 160 * scale();
      const u = 1 - k;
      return {
        x: u * u * f.x0 + 2 * u * k * cx + k * k * to.x,
        y: u * u * f.y0 + 2 * u * k * cy + k * k * to.y,
        size: f.size0 + (collector().size * 0.78 - f.size0) * k,
        spin: Math.sin(k * Math.PI) * 0.6,
      };
    }

    for (let i = 0; i < 7; i++) spawn(undefined, rand(stage.height * 0.35, stage.height)).age = 1;

    stage.start((dt) => {
      time += dt;
      const w = stage.width;
      const h = stage.height;
      const target = Math.round(clamp((w * h) / 65000, 6, 18));
      spawnIn -= dt;
      if (spawnIn <= 0 && list.length < target) {
        spawn();
        spawnIn = rand(0.2, 0.6);
      }

      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        b.age += dt;
        b.y -= b.vy * dt;
        b.bx += b.vx * dt;
        b.vx *= 1 - Math.min(1, 2.5 * dt);
        if (b.bx < b.r) b.bx = b.r;
        else if (b.bx > w - b.r) b.bx = w - b.r;
        if (b.y < -b.r * 2) list.splice(i, 1);
      }
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.y += f.vy * dt;
        f.vy += 260 * dt;
        f.life -= dt * 0.9;
        if (f.life <= 0) floaters.splice(i, 1);
      }
      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i];
        f.t += dt / FLY_TIME;
        if (f.t < 1) continue;
        flyers.splice(i, 1);
        land(f.slot);
      }
      for (const s of slots) s.bounce = Math.max(0, s.bounce - dt * 2.2);
      fx.update(dt);

      const c = stage.ctx;
      if (!bg) {
        bg = c.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#a8ecff');
        bg.addColorStop(0.55, '#5ab4ff');
        bg.addColorStop(1, '#3b6fd6');
      }
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);

      for (const b of list) {
        const x = bubbleX(b);
        const grow = b.age < 0.35 ? easeOutBack(b.age / 0.35) : 1;
        const sq = Math.sin(time * 3 + b.phase) * 0.04;
        const rx = b.r * grow * (1 + sq);
        const ry = b.r * grow * (1 - sq);
        if (b.critter) drawEmoji(c, b.critter, x, b.y + Math.sin(time * 2 + b.phase) * 3, b.r * grow);
        c.drawImage(bubbleSprite(b.color), x - rx, b.y - ry, rx * 2, ry * 2);
      }
      for (const f of floaters) {
        c.globalAlpha = clamp(f.life * 1.5, 0, 1);
        drawEmoji(c, f.ch, f.x, f.y, f.size);
      }
      c.globalAlpha = 1;

      // Collector: faint targets until each animal arrives.
      const col = collector();
      c.fillStyle = 'rgba(255,255,255,0.85)';
      roundRect(c, col.x, col.y, col.w, col.h, col.size * 0.42);
      c.fill();
      slots.forEach((s, i) => {
        const p = col.slot(i);
        c.fillStyle = s.have >= s.need ? '#fff3c4' : 'rgba(59,111,214,0.12)';
        c.beginPath();
        c.arc(p.x, p.y, col.size / 2, 0, TAU);
        c.fill();
        c.globalAlpha = s.have ? 1 : 0.28;
        drawEmoji(c, s.ch, p.x, p.y, col.size * 0.78 * (1 + Math.sin(s.bounce * Math.PI) * 0.35));
        c.globalAlpha = 1;
        // One dot per animal needed; caught ones are filled.
        const r = Math.min(col.dots * 0.28, col.size / (s.need * 2.6));
        const step = r * 2.6;
        for (let k = 0; k < s.need; k++) {
          c.fillStyle = k < s.have ? '#ff9f1c' : 'rgba(59,111,214,0.22)';
          c.beginPath();
          c.arc(p.x + (k - (s.need - 1) / 2) * step, p.y + col.size / 2 + col.dots * 0.55, r, 0, TAU);
          c.fill();
        }
      });
      for (const f of flyers) {
        const p = flyerPos(f);
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.spin);
        drawEmoji(c, f.ch, 0, 0, p.size);
        c.restore();
      }
      fx.draw(c, stage.dpr);
    });

    return () => {
      alive = false;
      stage.destroy();
    };
  },
};
