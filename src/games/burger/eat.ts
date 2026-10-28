import { say, sfx } from '../../engine/audio';
import { clamp, easeOutBack, pick, rand, TAU } from '../../engine/util';
import { drawBurger, drawCarton, drawCup, fryColor, fryStick, Kitchen, plate, stackHeight, TINT } from './art';
import { drawTray, type Env, type Scene, prompt, squish } from './core';
import { S } from './strings';

const BITE = 0.2; // how far each bite reaches into the burger, in bun widths
const FRIES = 12;
const SIPS = 5;

interface Gone { x: number; y: number; vx: number; vy: number; rot: number; vr: number; }

/** Tap the food to eat it: bites out of the burger, fries vanish, the cup empties. */
export function eatScene(env: Env): Scene {
  const { ctx, stage, meal, fx, timers } = env;
  const kitchen = new Kitchen('#eaf4ff');
  const stackH = stackHeight(meal.layers, 1);
  const crumbs = meal.layers.map((l) => TINT[l]);

  // Burger: drawn once into its own canvas so bites can be erased from it.
  const burgerCv = document.createElement('canvas');
  const bites: { x: number; ys: number[]; r: number }[] = [];
  let leftE = -0.55;
  let rightE = 0.55;
  let burgerGone = false;
  let burgerBounce = 0;

  let fries = FRIES;
  let friesBounce = 0;
  let carton = 0; // crumple 0..1 once empty
  const flyingFries: Gone[] = [];

  let sips = 0;
  let level = 1;
  let cupBounce = 0;

  let tray = { x: 0, y: 0, w: 0, h: 0 };
  let base = 0;
  let bw = 0;
  let bx = 0, fxX = 0, cx = 0;
  let fw = 0, ch = 0;
  let over = false;

  say(S().eat);

  function renderBurger() {
    const dpr = stage.dpr;
    const w = bw * 1.3, h = bw * (stackH + 0.3);
    burgerCv.width = Math.ceil(w * dpr);
    burgerCv.height = Math.ceil(h * dpr);
    const c = burgerCv.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    if (burgerGone) return;
    drawBurger(c, meal.layers, w / 2, h - bw * 0.2, bw);
    c.globalCompositeOperation = 'destination-out';
    for (const b of bites) {
      for (const y of b.ys) {
        c.beginPath();
        c.arc(w / 2 + b.x * bw, h - bw * 0.2 - y * bw, b.r * bw, 0, TAU);
        c.fill();
      }
    }
    c.globalCompositeOperation = 'source-over';
  }

  function biteBurger(fromLeft: boolean) {
    const edge = fromLeft ? leftE : rightE;
    const r = 0.15;
    const x = edge + (fromLeft ? BITE - r : r - BITE);
    const ys: number[] = [];
    for (let y = -0.16; y < stackH + 0.05; y += 0.11) ys.push(y + rand(-0.02, 0.02));
    bites.push({ x, ys, r: r + rand(-0.015, 0.015) });
    if (fromLeft) leftE += BITE;
    else rightE -= BITE;
    burgerBounce = 1;
    sfx.crunch();
    fx.burst(bx + (x + (fromLeft ? -r : r) * 0.5) * bw, base - stackH * bw * 0.5, {
      count: 16, color: crumbs, speed: 280, size: 6, gravity: 900, life: 0.8,
    });
    if (rightE - leftE < 0.2) {
      burgerGone = true;
      fx.burst(bx, base - stackH * bw * 0.5, { count: 30, kind: 'star', speed: 400, size: 11, gravity: 300, life: 1 });
      sfx.good();
      say(S().burgerGone);
    } else if (bites.length === 1) {
      say(pick(S().yum));
    }
    renderBurger();
  }

  function check() {
    if (over || !burgerGone || fries > 0 || sips < SIPS) return;
    over = true;
    timers.after(1.4, async () => {
      ctx.addStars(2);
      await ctx.celebrate(S().end, S().cost(meal.price), 5);
      env.restart();
    });
  }

  return {
    layout(W, H) {
      const top = ctx.topInset;
      const counterY = H * 0.55;
      kitchen.layout(stage.ctx, W, H, counterY);
      const tw = Math.min(W - 24, 900);
      tray = { x: W / 2, y: counterY + (H - counterY) * 0.5, w: tw, h: Math.min((H - counterY) * 0.55, tw * 0.3) };
      base = tray.y + tray.h * 0.25;
      const room = base - top - 80;
      const slot = tw / 3;
      bw = Math.min(slot * 0.82, room / stackH);
      bx = tray.x - slot * 0.9;
      fxX = tray.x + slot * 0.1;
      cx = tray.x + slot * 0.95;
      fw = Math.min(slot * 0.62, room * 0.75);
      ch = Math.min(slot * 1.05, room * 0.72);
      renderBurger();
    },

    update(d) {
      burgerBounce = Math.max(0, burgerBounce - d * 4);
      friesBounce = Math.max(0, friesBounce - d * 4);
      cupBounce = Math.max(0, cupBounce - d * 4);
      if (fries === 0) carton = Math.min(1, carton + d * 2);
      level += (1 - sips / SIPS - level) * Math.min(1, d * 6);
      for (let i = flyingFries.length - 1; i >= 0; i--) {
        const f = flyingFries[i];
        f.vy += 400 * d;
        f.x += f.vx * d;
        f.y += f.vy * d;
        f.rot += f.vr * d;
        if (f.y < -100) flyingFries.splice(i, 1);
      }
    },

    draw(c, t) {
      kitchen.draw(c);
      const W = stage.width;
      prompt(c, S().eat, W / 2, ctx.topInset + 28, W - 40);
      drawTray(c, tray.x, tray.y, tray.w, tray.h);

      plate(c, bx, base, bw * 1.2);
      if (!burgerGone) {
        const { sx, sy } = squish(burgerBounce);
        const w = bw * 1.3, h = bw * (stackH + 0.3);
        c.save();
        c.translate(bx, base);
        c.scale(sx, sy);
        c.drawImage(burgerCv, -w / 2, -(h - bw * 0.2), w, h);
        c.restore();
      } else {
        c.fillStyle = '#d99a52';
        for (let i = 0; i < 7; i++) {
          c.beginPath();
          c.arc(bx + Math.sin(i * 2.4) * bw * 0.3, base - 4 + Math.cos(i * 1.3) * 4, 3 + (i % 3), 0, TAU);
          c.fill();
        }
      }

      c.globalAlpha = 1 - clamp((carton - 0.6) * 2.5, 0, 0.6);
      const fb = squish(friesBounce);
      c.save();
      c.translate(fxX, base);
      c.scale(fb.sx, fb.sy);
      drawCarton(c, 0, 0, fw, fries, meal.fryLevel, easeOutBack(carton));
      c.restore();
      c.globalAlpha = 1;
      for (const f of flyingFries) fryStick(c, f.x, f.y, fw * 0.6, fw * 0.1, f.rot, fryColor(meal.fryLevel));

      const cb = squish(cupBounce);
      c.save();
      c.translate(cx, base);
      c.scale(cb.sx, cb.sy);
      drawCup(c, 0, 0, ch, meal.drink, t, { lid: 1, straw: 1, level });
      c.restore();
      if (sips > 0 && sips < SIPS && cupBounce > 0) {
        c.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.arc(cx + ch * 0.12 + i * 4, base - ch * 1.1 - cupBounce * 30 - i * 12, 4 - i, 0, TAU);
          c.fill();
        }
      }
    },

    down(x, y) {
      if (over) return;
      if (!burgerGone && Math.abs(x - bx) < bw * 0.6 && y > base - stackH * bw - 20 && y < base + 20) {
        biteBurger(x < bx + (leftE + rightE) * 0.5 * bw);
        check();
        return;
      }
      if (Math.abs(x - fxX) < fw * 0.6 && y > base - fw * 1.3 && y < base + 20) {
        if (fries === 0) {
          sfx.boing();
          return;
        }
        for (let i = 0; i < 2 && fries > 0; i++) {
          fries--;
          flyingFries.push({ x: fxX + rand(-fw * 0.2, fw * 0.2), y: base - fw * 0.9, vx: rand(-120, 120), vy: rand(-1100, -900), rot: rand(-0.5, 0.5), vr: rand(-8, 8) });
        }
        friesBounce = 1;
        sfx.crunch();
        fx.burst(fxX, base - fw * 0.8, { count: 8, color: [fryColor(meal.fryLevel), '#ffffff'], speed: 200, size: 5, gravity: 800, life: 0.6 });
        if (fries === 0) {
          sfx.good();
          say(S().friesGone);
          check();
        } else if (fries === FRIES - 2) {
          say(pick(S().yum));
        }
        return;
      }
      if (Math.abs(x - cx) < ch * 0.45 && y > base - ch * 1.3 && y < base + 20) {
        if (sips >= SIPS) {
          sfx.boing();
          return;
        }
        sips++;
        cupBounce = 1;
        sfx.slurp(sips === SIPS);
        if (sips === SIPS) {
          say(S().sodaGone);
          check();
        }
      }
    },
  };
}
