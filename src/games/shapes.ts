import type { GameDef } from '../types';
import { Stage } from '../engine/stage';
import { Particles } from '../engine/particles';
import { say, sfx } from '../engine/audio';
import { cached, starPath } from '../engine/sprites';
import { clamp, easeOutBack, hexA, pick, rand, roundRect, shade, shuffle, TAU, Timers } from '../engine/util';
import { L, type Lang, type Txt } from '../i18n';

const en = {
  praise: ['Yes!', 'Great!', 'Super!', 'Well done!'],
  done: 'All sorted!',
  round: (n: number) => `Round ${n}`,
};
export const M: Record<Lang, typeof en> = {
  en,
  da: {
    praise: ['Ja!', 'Flot!', 'Super!', 'Godt gået!'],
    done: 'Alt er sorteret!',
    round: (n: number) => `Runde ${n}`,
  },
};

type Kind = 'circle' | 'square' | 'triangle' | 'star' | 'heart' | 'diamond' | 'hexagon';

export const SHAPES: { kind: Kind; name: Txt; color: string }[] = [
  { kind: 'circle', name: { en: 'circle', da: 'cirkel' }, color: '#ff595e' },
  { kind: 'square', name: { en: 'square', da: 'firkant' }, color: '#1982c4' },
  { kind: 'triangle', name: { en: 'triangle', da: 'trekant' }, color: '#5bb318' },
  { kind: 'star', name: { en: 'star', da: 'stjerne' }, color: '#ffb703' },
  { kind: 'heart', name: { en: 'heart', da: 'hjerte' }, color: '#ff70a6' },
  { kind: 'diamond', name: { en: 'diamond', da: 'rombe' }, color: '#7b4cc9' },
  { kind: 'hexagon', name: { en: 'hexagon', da: 'sekskant' }, color: '#ff7f11' },
];

/** Path centered on (0,0) fitting a box of size s. */
function shapePath(c: CanvasRenderingContext2D, kind: Kind, s: number) {
  const h = s / 2;
  switch (kind) {
    case 'circle':
      c.beginPath();
      c.arc(0, 0, h * 0.95, 0, TAU);
      break;
    case 'square':
      roundRect(c, -h * 0.85, -h * 0.85, s * 0.85, s * 0.85, s * 0.1);
      break;
    case 'triangle':
      c.beginPath();
      c.moveTo(0, -h * 0.95);
      c.lineTo(h, h * 0.8);
      c.lineTo(-h, h * 0.8);
      c.closePath();
      break;
    case 'star':
      starPath(c, 0, h * 0.05, h, h * 0.45);
      break;
    case 'heart':
      c.beginPath();
      c.moveTo(0, h * 0.85);
      c.bezierCurveTo(-h * 1.3, -h * 0.05, -h * 0.65, -h * 1.15, 0, -h * 0.45);
      c.bezierCurveTo(h * 0.65, -h * 1.15, h * 1.3, -h * 0.05, 0, h * 0.85);
      c.closePath();
      break;
    case 'diamond':
      c.beginPath();
      c.moveTo(0, -h);
      c.lineTo(h * 0.75, 0);
      c.lineTo(0, h);
      c.lineTo(-h * 0.75, 0);
      c.closePath();
      break;
    case 'hexagon':
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        c.lineTo(Math.cos(a) * h * 0.95, Math.sin(a) * h * 0.95);
      }
      c.closePath();
      break;
  }
}

const SPRITE = 140;

function pieceSprite(kind: Kind, color: string) {
  return cached(`piece:${kind}:${color}`, SPRITE, SPRITE, (c) => {
    c.translate(SPRITE / 2, SPRITE / 2);
    shapePath(c, kind, SPRITE * 0.86);
    c.fillStyle = color;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.beginPath();
    c.ellipse(-SPRITE * 0.15, -SPRITE * 0.2, SPRITE * 0.3, SPRITE * 0.16, -0.5, 0, TAU);
    c.fill();
    c.restore();
    shapePath(c, kind, SPRITE * 0.86); // the highlight replaced the current path
    c.lineJoin = 'round';
    c.lineWidth = 6;
    c.strokeStyle = shade(color, -0.25);
    c.stroke();
  });
}

function slotSprite(kind: Kind, color: string) {
  return cached(`slot:${kind}:${color}`, SPRITE, SPRITE, (c) => {
    c.translate(SPRITE / 2, SPRITE / 2);
    shapePath(c, kind, SPRITE * 0.86);
    c.fillStyle = hexA(color, 0.18);
    c.fill();
    c.setLineDash([12, 9]);
    c.lineJoin = 'round';
    c.lineWidth = 6;
    c.strokeStyle = hexA(color, 0.75);
    c.stroke();
  });
}

interface Slot { kind: Kind; color: string; x: number; y: number; glow: number; }
interface Piece {
  kind: Kind; name: Txt; color: string;
  x: number; y: number; tx: number; ty: number; hx: number; hy: number;
  placed: boolean; drag: number | null; ox: number; oy: number;
  lift: number; shake: number; appear: number; slot: Slot;
}

export const shapes: GameDef = {
  id: 'shapes',
  title: { en: 'Shape Sorter', da: 'Find formen' },
  emoji: '🔷',
  color: '#ff9f1c',
  age: '4+',
  start(ctx) {
    const stage = new Stage(ctx.area);
    const fx = new Particles(600);
    const timers = new Timers();
    let slots: Slot[] = [];
    let pieces: Piece[] = [];
    let round = 0;
    let size = 100;
    let board = { x: 0, y: 0, w: 0, h: 0 };
    let alive = true;
    let done = false;
    let bg: CanvasGradient | null = null;

    function layout() {
      const n = slots.length;
      const top = ctx.topInset;
      const W = stage.width;
      const H = stage.height - top;
      size = clamp(Math.min((W - 40) / (n + 0.5), H * 0.2), 70, 160);
      const cols = Math.max(1, Math.min(n, Math.floor((W - 40) / (size * 1.25))));
      const rows = Math.ceil(n / cols);
      const cell = size * 1.25;
      board = { w: cols * cell + 20, h: rows * cell + 20, x: 0, y: top + 6 };
      board.x = (W - board.w) / 2;
      slots.forEach((s, i) => {
        const r = Math.floor(i / cols);
        const inRow = Math.min(cols, n - r * cols);
        const rowX = (W - inRow * cell) / 2;
        s.x = rowX + (i % cols) * cell + cell / 2;
        s.y = board.y + 10 + r * cell + cell / 2;
      });

      // Scatter pieces in the space below the board without overlaps.
      const minY = board.y + board.h + size * 0.7;
      const maxY = stage.height - size * 0.7;
      const placedHomes: { x: number; y: number }[] = [];
      for (const p of pieces) {
        let best = { x: W / 2, y: (minY + maxY) / 2 };
        let bestD = -1;
        for (let t = 0; t < 40; t++) {
          const cand = { x: rand(size * 0.7, W - size * 0.7), y: rand(minY, Math.max(minY, maxY)) };
          let d = Infinity;
          for (const q of placedHomes) d = Math.min(d, Math.hypot(q.x - cand.x, q.y - cand.y));
          if (d > bestD) {
            bestD = d;
            best = cand;
          }
          if (d > size * 1.4) break;
        }
        placedHomes.push(best);
        p.hx = best.x;
        p.hy = best.y;
        if (p.placed) {
          p.tx = p.x = p.slot.x;
          p.ty = p.y = p.slot.y;
        } else if (p.drag === null) {
          p.tx = p.hx;
          p.ty = p.hy;
        }
      }
    }

    stage.onResize(() => {
      bg = null;
      layout();
    });

    function newRound() {
      const n = Math.min(3 + round, SHAPES.length);
      const chosen = shuffle(SHAPES.slice()).slice(0, n);
      const grey = round >= 3; // later rounds: match by shape only
      slots = chosen.map((s) => ({ kind: s.kind, color: grey ? '#8d99ae' : s.color, x: 0, y: 0, glow: 0 }));
      pieces = shuffle(
        chosen.map((s, i) => ({
          kind: s.kind, name: s.name, color: s.color,
          x: 0, y: 0, tx: 0, ty: 0, hx: 0, hy: 0,
          placed: false, drag: null, ox: 0, oy: 0, lift: 0, shake: 0,
          appear: -i * 0.08, slot: slots[i],
        })),
      );
      layout();
      for (const p of pieces) {
        p.x = p.hx;
        p.y = p.hy;
      }
      done = false;
      sfx.whoosh();
    }

    function finish() {
      done = true;
      ctx.addStars(pieces.length);
      timers.after(0.9, async () => {
        await ctx.celebrate(L(M).done, L(M).round(round + 1), Math.min(5, pieces.length));
        if (!alive) return;
        round++;
        newRound();
      });
    }

    stage.on({
      down: (x, y, id) => {
        for (let i = pieces.length - 1; i >= 0; i--) {
          const p = pieces[i];
          if (p.placed || p.drag !== null || p.appear < 1) continue;
          if (Math.hypot(p.x - x, p.y - y) < size * 0.65) {
            p.drag = id;
            p.ox = p.x - x;
            p.oy = p.y - y;
            pieces.splice(i, 1);
            pieces.push(p); // bring to front
            sfx.tap();
            say(L(p.name));
            return;
          }
        }
      },
      move: (x, y, id) => {
        for (const p of pieces) {
          if (p.drag !== id) continue;
          p.x = p.tx = clamp(x + p.ox, 0, stage.width);
          p.y = p.ty = clamp(y + p.oy, 0, stage.height);
        }
      },
      up: (_x, _y, id) => {
        for (const p of pieces) {
          if (p.drag !== id) continue;
          p.drag = null;
          const snapDist = size * 0.6;
          if (Math.hypot(p.x - p.slot.x, p.y - p.slot.y) < snapDist) {
            p.placed = true;
            p.tx = p.slot.x;
            p.ty = p.slot.y;
            sfx.snap();
            say(pick(L(M).praise));
            fx.burst(p.slot.x, p.slot.y, { count: 24, kind: 'star', speed: 360, size: 11, gravity: 300, life: 1 });
            fx.ring(p.slot.x, p.slot.y, p.color, size * 0.8);
            if (!done && pieces.every((q) => q.placed)) finish();
          } else if (slots.some((s) => Math.hypot(p.x - s.x, p.y - s.y) < snapDist)) {
            // Wrong hole: wiggle and hop back home.
            p.shake = 1;
            p.tx = p.hx;
            p.ty = p.hy;
            sfx.boing();
          }
        }
      },
    });

    newRound();

    stage.start((dt, t) => {
      timers.update(dt);
      fx.update(dt);
      const c = stage.ctx;
      const W = stage.width;
      const H = stage.height;
      if (!bg) {
        bg = c.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#fff6cf');
        bg.addColorStop(1, '#ffd29c');
      }
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);

      roundRect(c, board.x, board.y + 6, board.w, board.h, 30);
      c.fillStyle = '#c98a4b';
      c.fill();
      roundRect(c, board.x, board.y, board.w, board.h, 30);
      c.fillStyle = '#e8b27a';
      c.fill();

      const dragging = new Set(pieces.filter((p) => p.drag !== null).map((p) => p.slot));
      for (const s of slots) {
        s.glow += ((dragging.has(s) ? 1 : 0) - s.glow) * Math.min(1, dt * 8);
        const k = size * (1 + s.glow * 0.08 * (1 + Math.sin(t * 8)));
        c.drawImage(slotSprite(s.kind, s.color), s.x - k / 2, s.y - k / 2, k, k);
      }

      for (const p of pieces) {
        p.appear = Math.min(1, p.appear + dt * 2.5);
        if (p.appear <= 0) continue;
        if (p.drag === null) {
          const f = Math.min(1, dt * 12);
          p.x += (p.tx - p.x) * f;
          p.y += (p.ty - p.y) * f;
        }
        p.lift += ((p.drag !== null ? 1 : 0) - p.lift) * Math.min(1, dt * 14);
        p.shake = Math.max(0, p.shake - dt * 2);
        const k = size * easeOutBack(p.appear) * (1 + p.lift * 0.15);
        const sx = Math.sin(p.shake * 35) * p.shake * 10;
        if (p.lift > 0.05) {
          c.globalAlpha = 0.18 * p.lift;
          c.fillStyle = '#000';
          c.beginPath();
          c.ellipse(p.x + 8, p.y + size * 0.5, size * 0.4, size * 0.12, 0, 0, TAU);
          c.fill();
          c.globalAlpha = 1;
        }
        c.drawImage(pieceSprite(p.kind, p.color), p.x - k / 2 + sx, p.y - k / 2 - p.lift * 10, k, k);
      }
      fx.draw(c, stage.dpr);
    });

    return () => {
      alive = false;
      timers.clear();
      stage.destroy();
    };
  },
};
