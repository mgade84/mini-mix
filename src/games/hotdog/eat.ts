import { say, sfx } from '../../engine/audio';
import { pick, rand, TAU } from '../../engine/util';
import { Kitchen, plate } from '../burger/art';
import { prompt, squish } from '../burger/core';
import { S as burgerS } from '../burger/strings';
import { DOG_H, DOG_W, drawHotdog, sausageColor, TINT } from './art';
import { drawGlass } from './drinks';
import { drawBowl, FLESH } from './fruit';
import type { Env, Scene } from './core';
import { S } from './strings';

const BITE = 0.24; // how far each bite reaches in, in bun lengths
const SIPS = 5;
const SLICES = 4;
const BOX_W = 1.4, BOX_UP = 0.42, BOX_DOWN = 0.08;

/** Tap the hotdog to take bites from its ends, the bowl to eat the apple and the glass to drink. */
export function eatScene(env: Env): Scene {
  const { ctx, stage, meal, fx, timers } = env;
  const kitchen = new Kitchen('#eaf4ff');
  const crumbs = ['#e09a4c', sausageColor(meal.sausage, meal.cook), ...meal.toppings.map((t) => TINT[t])];
  // Drawn once into its own canvas so bites can be erased from it.
  const cv = document.createElement('canvas');
  const bites: { x: number; r: number }[] = [];
  let leftE = -DOG_W / 2;
  let rightE = DOG_W / 2;
  let gone = false;
  let bounce = 0;
  let over = false;
  let sips = 0;
  let level = 1;
  let glassBounce = 0;
  let slices = SLICES;
  let bowlBounce = 0;
  let u = 300, x0 = 0, base = 0, gx = 0, gh = 0, bx = 0, bw = 0;

  say(burgerS().eat);

  const eaten = () => gone && sips >= SIPS && slices === 0;
  function check() {
    if (over || !eaten()) return;
    over = true;
    timers.after(1.4, async () => {
      ctx.addStars(2);
      await ctx.celebrate(burgerS().end, burgerS().cost(meal.price), 5);
      env.restart();
    });
  }

  function render() {
    const dpr = stage.dpr;
    const w = u * BOX_W, h = u * (BOX_UP + BOX_DOWN);
    cv.width = Math.ceil(w * dpr);
    cv.height = Math.ceil(h * dpr);
    const c = cv.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    if (gone) return;
    drawHotdog(c, meal, w / 2, u * BOX_UP, u);
    c.globalCompositeOperation = 'destination-out';
    // A few overlapping round bites per mouthful leave a scalloped edge
    for (const b of bites) {
      for (let y = -0.4; y <= 0.08; y += 0.12) {
        c.beginPath();
        c.arc(w / 2 + (b.x + Math.sin(y * 31 + b.x * 17) * 0.025) * u, u * BOX_UP + y * u, b.r * u, 0, TAU);
        c.fill();
      }
    }
    c.globalCompositeOperation = 'source-over';
  }

  function bite(fromLeft: boolean) {
    const r = 0.15 + rand(-0.015, 0.015);
    const edge = fromLeft ? leftE : rightE;
    const x = edge + (fromLeft ? BITE - r : r - BITE);
    bites.push({ x, r });
    if (fromLeft) leftE += BITE;
    else rightE -= BITE;
    bounce = 1;
    sfx.crunch();
    fx.burst(x0 + (x + (fromLeft ? -r : r) * 0.5) * u, base - u * 0.15, { count: 16, color: crumbs, speed: 280, size: 6, gravity: 900, life: 0.8 });
    if (rightE - leftE < BITE) {
      gone = true;
      fx.burst(x0, base - u * 0.15, { count: 30, kind: 'star', speed: 400, size: 11, gravity: 300, life: 1 });
      sfx.good();
      say(S().gone);
      check();
    } else if (bites.length === 1) {
      say(pick(S().yum));
    }
    render();
  }

  return {
    layout(W, H) {
      const counterY = H * 0.58;
      kitchen.layout(stage.ctx, W, H, counterY);
      base = counterY + (H - counterY) * 0.45;
      u = Math.min(W * 0.42, 460, (base - ctx.topInset - 90) / (DOG_H + 0.1));
      x0 = 16 + u * 0.66;
      gh = Math.min(u * 0.55, base - ctx.topInset - 100, W * 0.2);
      gx = W - 16 - gh * 0.42;
      bw = Math.min(u * 0.55, (gx - gh * 0.4) - (x0 + u * 0.66) - 16);
      bx = (x0 + u * 0.66 + gx - gh * 0.4) / 2;
      render();
    },

    update(d) {
      bounce = Math.max(0, bounce - d * 4);
      glassBounce = Math.max(0, glassBounce - d * 4);
      bowlBounce = Math.max(0, bowlBounce - d * 4);
      level += (1 - sips / SIPS - level) * Math.min(1, d * 6);
    },

    draw(c, t) {
      kitchen.draw(c);
      const W = stage.width;
      prompt(c, eaten() ? burgerS().end : burgerS().eat, W / 2, ctx.topInset + 28, W - 40);
      const gb = squish(glassBounce);
      c.save();
      c.translate(gx, base);
      c.scale(gb.sx, gb.sy);
      drawGlass(c, meal.drink, 0, 0, gh, level, t);
      c.restore();
      const bb = squish(bowlBounce);
      c.save();
      c.translate(bx, base);
      c.scale(bb.sx, bb.sy);
      drawBowl(c, 0, 0, bw, slices);
      c.restore();
      plate(c, x0, base, u * 1.3);
      if (gone) {
        c.fillStyle = '#d99a52';
        for (let i = 0; i < 7; i++) {
          c.beginPath();
          c.arc(x0 + Math.sin(i * 2.4) * u * 0.35, base - 4 + Math.cos(i * 1.3) * 4, 3 + (i % 3), 0, TAU);
          c.fill();
        }
        return;
      }
      const { sx, sy } = squish(bounce);
      c.save();
      c.translate(x0, base);
      c.scale(sx, sy);
      c.drawImage(cv, -u * BOX_W * 0.5, -u * BOX_UP, u * BOX_W, u * (BOX_UP + BOX_DOWN));
      c.restore();
    },

    down(x, y) {
      if (over) return;
      if (Math.abs(x - gx) < gh * 0.45 && y > base - gh * 1.15 && y < base + 20) {
        if (sips >= SIPS) {
          sfx.boing();
          return;
        }
        sips++;
        glassBounce = 1;
        sfx.slurp(sips === SIPS);
        if (sips === SIPS) {
          say(S().glassEmpty);
          check();
        }
        return;
      }
      if (Math.abs(x - bx) < bw * 0.55 && y > base - bw * 0.7 && y < base + 20) {
        if (slices === 0) {
          sfx.boing();
          return;
        }
        slices--;
        bowlBounce = 1;
        sfx.crunch();
        fx.burst(bx, base - bw * 0.4, { count: 12, color: [FLESH, '#d62828'], speed: 240, size: 6, gravity: 800, life: 0.7 });
        if (slices === 0) {
          sfx.good();
          say(S().appleGone);
          check();
        } else if (slices === SLICES - 1) {
          say(pick(S().yum));
        }
        return;
      }
      if (gone) return;
      if (x > x0 + leftE * u - 30 && x < x0 + rightE * u + 30 && y > base - u * 0.45 && y < base + u * 0.12) {
        bite(x < x0 + ((leftE + rightE) / 2) * u);
      }
    },
  };
}
