import { say, sfx } from '../../engine/audio';
import { drawEmoji } from '../../engine/sprites';
import { clamp, easeOutCubic, FONT, lerp, roundRect } from '../../engine/util';
import { drawKnife, Kitchen } from '../burger/art';
import { prompt } from '../burger/core';
import { S as burgerS } from '../burger/strings';
import type { Env, Scene } from './core';
import { applePath, blitApple, bowlSlot, drawBowl, drawSlice, FLESH } from './fruit';
import { S } from './strings';

const CUTS = 3;
const SLICES = CUTS + 1;

type Phase = 'cut' | 'serve' | 'done';
interface Stroke { x: number; y: number; minY: number; maxY: number; }
interface Flight { i: number; t: number; x0: number; y0: number; }

/** Swipe the knife down through the apple, then tap the slices into the bowl. */
export function appleScene(env: Env): Scene {
  const { ctx, stage, fx, timers, meal } = env;
  const kitchen = new Kitchen();
  let phase: Phase = 'cut';
  const cut = Array.from({ length: CUTS }, () => 0); // 0 = not cut, then 0..1 while the slices part
  const strokes = new Map<number, Stroke>();
  const served = Array.from({ length: SLICES }, () => false);
  const flights: Flight[] = [];
  let inBowl = 0;
  let idle = 0;
  let W = 0;
  let board = { x: 0, y: 0, w: 0, h: 0 };
  let ax = 0, ay = 0, r = 0;
  let bowl = { x: 0, base: 0, w: 0 };

  say(S().cutApple);

  const guideX = (i: number) => ax + (i - (CUTS - 1) / 2) * r * 0.62;
  const edge = (s: number) => (s === 0 ? ax - r * 1.1 : s === SLICES ? ax + r * 1.1 : guideX(s - 1));
  const cutsDone = () => cut.every((v) => v > 0);

  /** How far slice s has moved away from the middle. */
  function shift(s: number) {
    let d = 0;
    for (let i = 0; i < CUTS; i++) {
      const gap = easeOutCubic(cut[i]) * r * 0.16;
      d += i < s ? gap / 2 : -gap / 2;
    }
    return d;
  }

  const sliceCenter = (s: number) => ({ x: (edge(s) + edge(s + 1)) / 2 + shift(s), y: ay });

  function doCut(i: number) {
    cut[i] = 0.001;
    idle = 0;
    sfx.chop();
    fx.burst(guideX(i), ay, { count: 10, color: [FLESH, '#ffffff'], speed: 220, size: 6, gravity: 500, life: 0.6 });
    if (!cutsDone()) return;
    sfx.good();
    timers.after(0.8, () => {
      phase = 'serve';
      say(S().intoBowl);
    });
  }

  function arrived() {
    inBowl++;
    sfx.pop();
    fx.burst(bowl.x, bowl.base - bowl.w * 0.35, { count: 8, kind: 'star', speed: 200, size: 8, life: 0.5 });
    if (inBowl < SLICES) return;
    phase = 'done';
    meal.snackDone = true;
    sfx.good();
    say(S().appleDone);
    ctx.addStars(1);
    fx.burst(bowl.x, bowl.base - bowl.w * 0.4, { count: 40, kind: 'star', speed: 450, size: 12, gravity: 300, life: 1.2 });
    timers.after(2.4, () => env.go('hub'));
  }

  function drawPieces(c: CanvasRenderingContext2D) {
    for (let s = 0; s < SLICES; s++) {
      if (served[s]) continue;
      const x0 = edge(s), x1 = edge(s + 1);
      c.save();
      c.translate(shift(s), 0);
      c.beginPath();
      c.rect(x0, ay - r * 1.4, x1 - x0, r * 2.6);
      c.clip();
      blitApple(c, ax, ay, r);
      // Pale flesh, with seeds near the core, on every cut face
      c.save();
      c.translate(ax, ay);
      applePath(c, r * 0.97);
      c.restore();
      c.clip();
      c.fillStyle = FLESH;
      const band = r * 0.1;
      if (s > 0 && cut[s - 1]) c.fillRect(x0, ay - r, band, r * 2);
      if (s < CUTS && cut[s]) c.fillRect(x1 - band, ay - r, band, r * 2);
      // Seeds where the knife went through the core
      const mid = (CUTS - 1) / 2;
      const seedX = s === mid && cut[mid] ? x1 - band * 0.5 : s === mid + 1 && cut[mid] ? x0 + band * 0.5 : NaN;
      if (!Number.isNaN(seedX)) {
        c.fillStyle = '#5a3216';
        for (const dy of [-0.18, 0.12]) {
          c.beginPath();
          c.ellipse(seedX, ay + dy * r, band * 0.32, band * 0.55, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.restore();
    }
  }

  return {
    layout(w, H) {
      W = w;
      const counterY = H * 0.42;
      kitchen.layout(stage.ctx, W, H, counterY);
      const bw = Math.min(W * 0.6, 560);
      board = { x: W * 0.4, y: counterY + (H - counterY) * 0.42, w: bw, h: Math.min(bw * 0.62, (H - counterY) * 0.7) };
      ax = board.x;
      ay = board.y - board.h * 0.04;
      r = Math.min(board.h * 0.36, board.w * 0.3);
      const bowlW = Math.min(W * 0.26, 240);
      bowl = { x: Math.min(W - bowlW * 0.6, board.x + board.w / 2 + bowlW * 0.6), base: board.y + board.h * 0.3, w: bowlW };
    },

    update(d) {
      idle += d;
      for (let i = 0; i < CUTS; i++) if (cut[i] > 0) cut[i] = Math.min(1, cut[i] + d * 4);
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i];
        f.t = Math.min(1, f.t + d * 2);
        if (f.t >= 1) {
          flights.splice(i, 1);
          arrived();
        }
      }
    },

    draw(c, t) {
      kitchen.draw(c);
      prompt(c, phase === 'cut' ? S().cutApple : phase === 'serve' ? S().intoBowl : S().appleDone, W / 2, ctx.topInset + 28, W - 40);

      // Cutting board
      roundRect(c, board.x - board.w / 2, board.y - board.h / 2 + 10, board.w, board.h, 26);
      c.fillStyle = '#8a5a2b';
      c.fill();
      roundRect(c, board.x - board.w / 2, board.y - board.h / 2, board.w, board.h, 26);
      c.fillStyle = '#d9a066';
      c.fill();
      c.strokeStyle = 'rgba(140,90,40,0.25)';
      c.lineWidth = 3;
      for (let i = 1; i < 6; i++) {
        const y = board.y - board.h / 2 + (i * board.h) / 6;
        c.beginPath();
        c.moveTo(board.x - board.w * 0.45, y);
        c.bezierCurveTo(board.x - board.w * 0.1, y - 8, board.x + board.w * 0.1, y + 8, board.x + board.w * 0.45, y);
        c.stroke();
      }

      drawBowl(c, bowl.x, bowl.base, bowl.w, inBowl);
      drawPieces(c);

      for (const f of flights) {
        const k = easeOutCubic(f.t);
        const to = bowlSlot(inBowl + flights.indexOf(f), bowl.x, bowl.base, bowl.w);
        drawSlice(c, lerp(f.x0, to.x, k), lerp(f.y0, to.y, k) - Math.sin(k * Math.PI) * r, lerp(r * 0.9, bowl.w * 0.42, k), k * 0.6);
      }

      if (phase === 'cut') {
        c.setLineDash([10, 10]);
        c.lineWidth = 4;
        const next = cut.findIndex((v) => v === 0);
        for (let i = 0; i < CUTS; i++) {
          if (cut[i]) continue;
          c.strokeStyle = i === next ? `rgba(255,255,255,${0.6 + Math.sin(t * 6) * 0.3})` : 'rgba(255,255,255,0.45)';
          c.beginPath();
          c.moveTo(guideX(i), ay - r * 1.1);
          c.lineTo(guideX(i), ay + r * 1.0);
          c.stroke();
        }
        c.setLineDash([]);
        if (idle > 2.5 && next >= 0 && strokes.size === 0) {
          const k = ((idle - 2.5) % 1.6) / 1.6;
          c.globalAlpha = Math.sin(k * Math.PI) * 0.8;
          drawKnife(c, guideX(next), lerp(ay - r * 1.2, ay + r * 0.8, easeOutCubic(k)), r * 1.4);
          c.globalAlpha = 1;
        }
        for (const s of strokes.values()) drawKnife(c, s.x, s.y, r * 1.4);
        c.font = `800 ${clamp(W * 0.03, 16, 24)}px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = 'rgba(70,45,20,0.8)';
        c.fillText(`🔪 ${burgerS().swipe}`, board.x, board.y + board.h / 2 + 34);
      } else if (phase === 'serve' && flights.length === 0) {
        const next = served.indexOf(false);
        if (next >= 0) {
          const p = sliceCenter(next);
          drawEmoji(c, '👆', p.x, p.y + r * 0.7 + Math.sin(t * 6) * 8, clamp(r * 0.5, 40, 80));
        }
      }
    },

    down(x, y, id) {
      idle = 0;
      if (phase === 'cut') {
        strokes.set(id, { x, y, minY: y, maxY: y });
        return;
      }
      if (phase !== 'serve') return;
      for (let s = 0; s < SLICES; s++) {
        if (served[s]) continue;
        const p = sliceCenter(s);
        const half = (edge(s + 1) - edge(s)) / 2 + 12;
        if (Math.abs(x - p.x) < half && Math.abs(y - p.y) < r * 1.1) {
          served[s] = true;
          flights.push({ i: s, t: 0, x0: p.x, y0: p.y });
          sfx.whoosh();
          return;
        }
      }
    },

    move(x, y, id) {
      const s = strokes.get(id);
      if (!s || phase !== 'cut') return;
      const crossed = (s.y - ay) * (y - ay) <= 0 && s.y !== y;
      s.minY = Math.min(s.minY, y);
      s.maxY = Math.max(s.maxY, y);
      s.x = x;
      s.y = y;
      if (!crossed || s.maxY - s.minY < r * 0.5) return;
      const spacing = r * 0.62;
      let best = -1;
      for (let i = 0; i < CUTS; i++) {
        if (cut[i]) continue;
        const dx = Math.abs(guideX(i) - x);
        if (dx < spacing * 0.75 && (best < 0 || dx < Math.abs(guideX(best) - x))) best = i;
      }
      if (best >= 0) {
        s.minY = s.maxY = y; // zig-zagging keeps cutting
        doCut(best);
      }
    },

    up(_x, _y, id) {
      strokes.delete(id);
    },
  };
}
