import { say, sfx } from '../../engine/audio';
import { clamp, FONT, rand, roundRect } from '../../engine/util';
import { Kitchen, plate } from '../burger/art';
import { Btn, prompt, squish } from '../burger/core';
import { blitBunBack, blitBunFront, blitSausage, blitTopping, DOG_H, drawBinIcon, isSauce, TINT, type Topping, TOPPINGS } from './art';
import type { Env, Scene } from './core';
import { S } from './strings';

const MAX = 8;
const SQUEEZE = 0.75; // seconds to draw a line of sauce

interface Piece { id: Topping; p: number; fall: number; vy: number; squash: number; }
interface Flying { id: Topping; i: number; x: number; y: number; vx: number; vy: number; rot: number; life: number; }
interface Bin { id: Topping; x: number; y: number; w: number; h: number; press: number; }

/** Squeeze sauces along the sausage and drop toppings on it. */
export function dressScene(env: Env): Scene {
  const { ctx, stage, fx, timers, meal } = env;
  const kitchen = new Kitchen();
  const pieces: Piece[] = [];
  const flying: Flying[] = [];
  const bins: Bin[] = TOPPINGS.map((id) => ({ id, x: 0, y: 0, w: 0, h: 0, press: 0 }));
  const done = new Btn(S().done, '#38b000');
  const undo = new Btn('↩', '#ff9f1c');
  let finished = false;
  let u = 300;
  let px = 0, py = 0;
  let shakeBins = 0;
  let dt = 0;

  say(S().dress);

  const refresh = () => {
    undo.enabled = pieces.length > 0;
    done.pulse = pieces.length >= 2;
  };
  refresh();

  function add(id: Topping) {
    if (isSauce(id)) {
      pieces.push({ id, p: 0.001, fall: 0, vy: 0, squash: 0 });
      sfx.splat();
    } else {
      pieces.push({ id, p: 1, fall: -stage.height * 0.6, vy: 0, squash: 0 });
      sfx.whoosh();
    }
  }

  function splash(id: Topping, x: number) {
    fx.burst(x, py - u * 0.2, { count: 10, color: [TINT[id], '#ffffff'], speed: 220, size: 6, gravity: 600, life: 0.6, angle: -Math.PI / 2, spread: Math.PI });
  }

  return {
    layout(W, H) {
      const top = ctx.topInset + 60;
      const cols = W >= 900 ? 6 : 3;
      const rows = TOPPINGS.length / cols;
      const gap = clamp(W * 0.015, 8, 14);
      const bw = Math.min((W - 32 - gap * (cols - 1)) / cols, cols === 6 ? 150 : 200);
      const bh = Math.min(bw * 0.8, H * 0.14);
      const gridW = cols * bw + (cols - 1) * gap;
      const y0 = H - 16 - rows * bh - (rows - 1) * gap;
      bins.forEach((b, i) => {
        Object.assign(b, { w: bw, h: bh, x: (W - gridW) / 2 + (i % cols) * (bw + gap) + bw / 2, y: y0 + Math.floor(i / cols) * (bh + gap) + bh / 2 });
      });
      const btnW = clamp(W * 0.2, 120, 190);
      px = Math.min(W * 0.42, (W - btnW - 40) / 2);
      u = Math.min(W * 0.55, 520, (y0 - 40 - top) / (DOG_H + 0.35), (W - btnW - 60 - px) / 0.62);
      py = y0 - 30 - u * 0.16;
      kitchen.layout(stage.ctx, W, H, py - u * 0.14);
      done.place(W - 20 - btnW / 2, py - u * 0.3, btnW, btnW * 0.48);
      undo.place(W - 20 - btnW / 2, py - u * 0.3 - btnW * 0.66, btnW * 0.6, btnW * 0.48);
    },

    update(d) {
      dt = d;
      for (const p of pieces) {
        if (p.p < 1) {
          p.p = Math.min(1, p.p + d / SQUEEZE);
          if (p.p === 1) p.squash = 0.6;
        }
        if (p.fall < 0) {
          p.vy += 3200 * d;
          p.fall = Math.min(0, p.fall + p.vy * d);
          if (p.fall === 0) {
            p.squash = 1;
            sfx.splat();
            splash(p.id, px);
          }
        }
        p.squash = Math.max(0, p.squash - d * 4);
      }
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i];
        f.vy += 2000 * d;
        f.x += f.vx * d;
        f.y += f.vy * d;
        f.rot += f.vx * 0.004 * d;
        if ((f.life -= d) <= 0) flying.splice(i, 1);
      }
      for (const b of bins) b.press = Math.max(0, b.press - d * 4);
      shakeBins = Math.max(0, shakeBins - d * 2);
    },

    draw(c, t) {
      kitchen.draw(c);
      const W = stage.width;
      prompt(c, finished ? S().hotdogDone : S().dress, W / 2, ctx.topInset + 28, W - 40);

      plate(c, px, py, u * 1.3);
      blitBunBack(c, meal.bread, px, py, u);
      blitSausage(c, meal.sausage, meal.cook, px, py, u);
      pieces.forEach((p, i) => {
        const { sx, sy } = squish(p.squash);
        c.save();
        c.translate(px, py + p.fall);
        c.scale(sx, sy);
        if (p.p < 1) {
          // Reveal the sauce from left to right behind the bottle
          c.beginPath();
          c.rect(-u * 0.7, -u * 0.5, u * (0.26 + 0.88 * p.p), u * 0.6);
          c.clip();
        }
        blitTopping(c, p.id, i, 0, 0, u);
        c.restore();
      });
      blitBunFront(c, meal.bread, px, py, u);
      for (const p of pieces) {
        if (p.p >= 1) continue;
        c.save();
        c.translate(px + (-0.44 + 0.88 * p.p) * u, py - u * 0.36 + Math.sin(t * 30) * 2);
        c.rotate(Math.PI);
        drawBinIcon(c, p.id, 0, 0, u * 0.26);
        c.restore();
      }
      for (const f of flying) {
        c.save();
        c.translate(f.x, f.y);
        c.rotate(f.rot);
        blitTopping(c, f.id, f.i, 0, 0, u);
        c.restore();
      }

      const names = S().toppings;
      for (const b of bins) {
        const ox = Math.sin(shakeBins * 30) * shakeBins * 8;
        const by = b.y - b.h / 2 + b.press * 4;
        const x = b.x - b.w / 2 + ox;
        roundRect(c, x, b.y - b.h / 2 + 5, b.w, b.h, 16);
        c.fillStyle = '#8a96a6';
        c.fill();
        roundRect(c, x, by, b.w, b.h, 16);
        c.fillStyle = '#eef2f6';
        c.fill();
        drawBinIcon(c, b.id, b.x + ox, by + b.h * 0.4, b.h * 0.62);
        c.fillStyle = '#3d4a5c';
        c.font = `800 ${clamp(b.w * 0.13, 13, 20)}px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(names[b.id], b.x + ox, by + b.h * 0.84, b.w - 8);
      }
      undo.draw(c, dt, t);
      done.draw(c, dt, t);
    },

    down(x, y) {
      if (finished) return;
      if (done.hit(x, y)) {
        done.press = 1;
        finished = true;
        meal.toppings = pieces.map((p) => p.id);
        meal.hotdog = true;
        for (const p of pieces) {
          p.p = 1;
          p.fall = 0;
        }
        sfx.good();
        say(S().hotdogDone);
        fx.burst(px, py - u * 0.25, { count: 40, kind: 'star', speed: 480, size: 12, gravity: 300, life: 1.2 });
        ctx.addStars(1);
        timers.after(2.2, () => env.go('hub'));
        return;
      }
      if (undo.hit(x, y)) {
        undo.press = 1;
        const last = pieces[pieces.length - 1];
        if (!last || last.p < 1 || last.fall < 0) return;
        pieces.pop();
        flying.push({ id: last.id, i: pieces.length, x: px, y: py, vx: rand(500, 800), vy: -700, rot: 0, life: 1.2 });
        sfx.whoosh();
        refresh();
        return;
      }
      for (const b of bins) {
        if (Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2) {
          b.press = 1;
          if (pieces.length >= MAX) {
            shakeBins = 1;
            sfx.oops();
            say(S().full);
            done.pulse = true;
            return;
          }
          say(S().toppings[b.id]);
          add(b.id);
          refresh();
          return;
        }
      }
    },
  };
}
