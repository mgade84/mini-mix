import { say, sfx } from '../../engine/audio';
import { clamp, FONT, rand, roundRect } from '../../engine/util';
import { blitLayer, INGS, type Ing, K, Kitchen, type Layer, plate, THICK, TINT } from './art';
import { Btn, type Env, prompt, type Scene, squish } from './core';
import { S } from './strings';

const MAX = 12;

interface Piece { id: Layer; fall: number; vy: number; squash: number; dx: number; }
interface Flying { id: Layer; x: number; y: number; vx: number; vy: number; rot: number; life: number; }
interface Bin { id: Ing; x: number; y: number; w: number; h: number; press: number; }

/** Stack a burger: tap ingredient trays, the layer drops onto the bun. */
export function buildScene(env: Env): Scene {
  const { ctx, stage, fx, timers, meal } = env;
  const kitchen = new Kitchen();
  const stack: Piece[] = [{ id: 'bottom', fall: 0, vy: 0, squash: 0, dx: 0 }];
  const flying: Flying[] = [];
  const bins: Bin[] = INGS.map((id) => ({ id, x: 0, y: 0, w: 0, h: 0, press: 0 }));
  const done = new Btn(S().done, '#38b000');
  const undo = new Btn('↩', '#ff9f1c');
  let finished = false;
  let bun = 240; // bun width
  let plateX = 0;
  let plateY = 0;
  let shakeBins = 0;
  let dt = 0;

  say(S().build);

  const ings = () => stack.length - 1 - (stack[stack.length - 1].id === 'top' ? 1 : 0);
  const refresh = () => {
    done.enabled = ings() > 0;
    undo.enabled = ings() > 0;
    done.pulse = ings() >= 3;
  };
  refresh();

  function drop(id: Layer) {
    stack.push({ id, fall: -stage.height * 0.7, vy: 0, squash: 0, dx: id === 'top' ? 0 : rand(-0.025, 0.025) * bun });
    sfx.whoosh();
  }

  function landed(p: Piece, y: number) {
    p.squash = 1;
    if (p.id === 'patty') sfx.thud();
    else sfx.splat();
    fx.burst(plateX + p.dx, y, { count: 10, color: [TINT[p.id], '#ffffff'], speed: 220, size: 7, gravity: 600, life: 0.6, angle: -Math.PI / 2, spread: Math.PI });
    if (p.id !== 'top') return;
    finished = true;
    sfx.good();
    say(S().burgerDone);
    fx.burst(plateX, y - bun * 0.2, { count: 40, kind: 'star', speed: 480, size: 12, gravity: 300, life: 1.2 });
    meal.layers = stack.map((s) => s.id);
    meal.burger = true;
    ctx.addStars(1);
    timers.after(2.2, () => env.go('hub'));
  }

  return {
    layout(W, H) {
      const top = ctx.topInset;
      const cols = 5;
      const gap = clamp(W * 0.015, 8, 14);
      const bw = Math.min((W - 32 - gap * (cols - 1)) / cols, 150);
      const bh = Math.min(bw * 0.82, H * 0.13);
      const gridW = cols * bw + (cols - 1) * gap;
      const y0 = H - 16 - bh * 2 - gap;
      bins.forEach((b, i) => {
        b.w = bw;
        b.h = bh;
        b.x = (W - gridW) / 2 + (i % cols) * (bw + gap) + bw / 2;
        b.y = y0 + Math.floor(i / cols) * (bh + gap) + bh / 2;
      });
      // Room for the tallest possible burger: buns plus MAX thick layers, and the plate's front rim.
      const tallest = THICK.bottom + THICK.top + MAX * 0.06 + 0.1;
      const rim = 1.25 * 0.5 * K + 0.03;
      bun = Math.min(W * 0.46, 330, (y0 - 16 - top - 60) / (tallest + rim));
      plateY = y0 - 16 - bun * rim;
      const counterY = plateY - 40;
      kitchen.layout(stage.ctx, W, H, counterY);
      const btnW = clamp(W * 0.2, 120, 190);
      plateX = W * 0.42;
      done.place(W - 20 - btnW / 2, plateY - bh * 1.7, btnW, btnW * 0.48);
      undo.place(W - 20 - btnW / 2, plateY - bh * 1.7 - btnW * 0.66, btnW * 0.6, btnW * 0.48);
    },

    update(d) {
      dt = d;
      let y = plateY - bun * 0.02;
      for (const p of stack) {
        if (p.fall < 0) {
          p.vy += 3200 * d;
          p.fall = Math.min(0, p.fall + p.vy * d);
          if (p.fall === 0) landed(p, y);
        }
        p.squash = Math.max(0, p.squash - d * 4);
        y -= THICK[p.id] * bun;
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
      prompt(c, S().build, W / 2, ctx.topInset + 28, W - 40);

      plate(c, plateX, plateY, bun * 1.25);
      let y = plateY - bun * 0.02;
      for (const p of stack) {
        const { sx, sy } = squish(p.squash);
        c.save();
        c.translate(plateX + p.dx, y + p.fall);
        c.scale(sx, sy);
        blitLayer(c, p.id, 0, 0, bun);
        c.restore();
        y -= THICK[p.id] * bun;
      }
      for (const f of flying) {
        c.save();
        c.translate(f.x, f.y);
        c.rotate(f.rot);
        blitLayer(c, f.id, 0, 0, bun);
        c.restore();
      }

      const names = S().ings;
      for (const b of bins) {
        const ox = Math.sin(shakeBins * 30) * shakeBins * 8;
        const py = b.press * 4;
        const x = b.x - b.w / 2 + ox;
        const by = b.y - b.h / 2 + py;
        roundRect(c, x, b.y - b.h / 2 + 5, b.w, b.h, 16);
        c.fillStyle = '#8a96a6';
        c.fill();
        roundRect(c, x, by, b.w, b.h, 16);
        c.fillStyle = '#eef2f6';
        c.fill();
        roundRect(c, x + 6, by + 6, b.w - 12, b.h * 0.6, 10);
        c.fillStyle = '#d5dde6';
        c.fill();
        const iw = b.w * 0.62;
        blitLayer(c, b.id, b.x + ox, by + b.h * 0.42 + THICK[b.id] * iw * 0.5, iw);
        c.fillStyle = '#3d4a5c';
        c.font = `800 ${clamp(b.w * 0.15, 13, 20)}px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(names[b.id], b.x + ox, by + b.h * 0.82, b.w - 8);
      }
      undo.draw(c, dt, t);
      done.draw(c, dt, t);
    },

    down(x, y) {
      if (finished || stack[stack.length - 1].id === 'top') return;
      if (done.hit(x, y)) {
        done.press = 1;
        if (!done.enabled) {
          done.shake = 1;
          sfx.oops();
          return;
        }
        drop('top');
        refresh();
        return;
      }
      if (undo.hit(x, y)) {
        undo.press = 1;
        const last = stack[stack.length - 1];
        if (!undo.enabled || last.fall < 0) return;
        stack.pop();
        const ly = plateY - stack.reduce((s, p) => s + THICK[p.id] * bun, 0);
        flying.push({ id: last.id, x: plateX + last.dx, y: ly, vx: rand(500, 800), vy: -700, rot: 0, life: 1.2 });
        sfx.whoosh();
        refresh();
        return;
      }
      for (const b of bins) {
        if (Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2) {
          b.press = 1;
          if (ings() >= MAX) {
            shakeBins = 1;
            sfx.oops();
            say(S().full);
            done.pulse = true;
            return;
          }
          say(S().ings[b.id]);
          drop(b.id);
          refresh();
          return;
        }
      }
    },
  };
}
