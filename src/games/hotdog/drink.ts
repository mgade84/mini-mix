import { noiseLoop, say, sfx } from '../../engine/audio';
import { drawEmoji } from '../../engine/sprites';
import { clamp, easeOutCubic, FONT, lerp, rand } from '../../engine/util';
import { Kitchen } from '../burger/art';
import { prompt } from '../burger/core';
import type { Env, Scene } from './core';
import { blitBottle, drawBottleTint, drawCap, drawGlass, drawLiquid, drawOpener, DRINKS, type DrinkKind, LIQUID, MOUTH } from './drinks';
import { S } from './strings';

const POUR_RATE = 0.24; // glass fills per second while the bottle is tipped
const TILT = 1.95; // radians, mouth down over the glass

type Phase = 'pick' | 'open' | 'pour' | 'done';

/** Pick a bottle, pop its cap with the opener, then hold to pour it into a glass. */
export function drinkScene(env: Env): Scene {
  const { ctx, stage, meal, fx, timers } = env;
  const kitchen = new Kitchen();
  const glug = noiseLoop('lowpass', 500, 2);
  let phase: Phase = 'pick';
  let kind: DrinkKind = 'cola';
  let chosen = -1;
  let slide = 0; // 0..1 while the chosen bottle moves to the middle
  let capped = true;
  let cap: { x: number; y: number; vx: number; vy: number; rot: number } | null = null;
  // Opener: home is where it rests; (ox, oy) is its ring, rot its angle
  let ox = 0, oy = 0, orot = 0, homeX = 0, homeY = 0, homeRot = -0.35;
  let drag: { id: number; dx: number; dy: number; y0: number } | null = null;
  let latched = false;
  let lift = 0;
  let returning = 0;
  let pouring = false;
  let tilt = 0;
  let glass = 0;
  let W = 0, H = 0, base = 0, h = 0, s = 0, gx = 0, gh = 0, bx = 0;

  say(S().pickDrink);

  const slots = () => DRINKS.map((_, i) => W / 2 + (i - 1) * Math.min(W * 0.28, 260));
  const capPos = () => ({ x: bx, y: base - h * (MOUTH + 0.02) });

  function pick(i: number) {
    chosen = i;
    kind = DRINKS[i];
    sfx.pop();
    say(S().drinks[kind]);
    timers.after(1.2, () => {
      phase = 'open';
      say(S().open);
    });
  }

  function pop() {
    capped = false;
    latched = false;
    drag = null;
    returning = 0.001;
    const p = capPos();
    cap = { x: p.x, y: p.y, vx: rand(200, 350), vy: -900, rot: 0 };
    sfx.pop(0.6);
    if (kind === 'cola') sfx.hiss();
    fx.burst(p.x, p.y, { count: 18, color: ['#ffffff', LIQUID[kind]], speed: 260, size: 5, gravity: 500, life: 0.7, angle: -Math.PI / 2, spread: 1.2 });
    timers.after(1.1, () => {
      phase = 'pour';
      say(S().pour);
    });
  }

  function finish() {
    phase = 'done';
    pouring = false;
    glug.set(0);
    meal.drink = kind;
    meal.drinkDone = true;
    sfx.good();
    say(S().cheers);
    ctx.addStars(1);
    fx.burst(gx, base - gh, { count: 40, kind: 'star', speed: 450, size: 12, gravity: 300, life: 1.2 });
    timers.after(2.4, () => env.go('hub'));
  }

  /** Where the bottle stands and how it is turned, blending from upright to pouring. */
  function bottlePose() {
    const k = easeOutCubic(tilt);
    const a = h * MOUTH;
    const th = TILT * k;
    const mx = gx - gh * 0.12, my = base - gh * 1.25;
    // Base position that puts the mouth over the glass at this angle
    const px = lerp(bx, mx - a * Math.sin(TILT), k);
    const py = lerp(base, my + a * Math.cos(TILT), k);
    return { px, py, th, mouthX: px + a * Math.sin(th), mouthY: py - a * Math.cos(th) };
  }

  return {
    layout(w, hh) {
      W = w;
      H = hh;
      const counterY = H * 0.7;
      kitchen.layout(stage.ctx, W, H, counterY);
      base = counterY + Math.min(36, (H - counterY) * 0.3);
      h = Math.min(H * 0.45, (base - ctx.topInset - 90) * 0.9, W * 0.5);
      s = h * 0.07;
      bx = W * 0.4;
      gh = h * 0.5;
      gx = W * 0.64;
      homeX = W * 0.72;
      homeY = base + (H - base) * 0.45;
      if (!drag && !latched) {
        ox = homeX;
        oy = homeY;
        orot = homeRot;
      }
    },

    update(dt) {
      if (chosen >= 0) slide = Math.min(1, slide + dt * 2.5);
      if (cap) {
        cap.vy += 2200 * dt;
        cap.x += cap.vx * dt;
        cap.y += cap.vy * dt;
        cap.rot += 12 * dt;
        if (cap.y > H + 50) cap = null;
      }
      if (returning > 0) {
        returning = Math.min(1, returning + dt * 2);
        ox = lerp(ox, homeX, Math.min(1, dt * 8));
        oy = lerp(oy, homeY, Math.min(1, dt * 8));
        orot = lerp(orot, homeRot, Math.min(1, dt * 8));
        if (returning >= 1) returning = 0;
      }
      if (latched) {
        const p = capPos();
        ox = p.x;
        oy = p.y;
        orot = -lift * 0.9;
      }
      if (phase === 'pour' || phase === 'done') {
        tilt = clamp(tilt + (pouring ? dt * 2 : -dt * 2.5), 0, 1);
        const flowing = phase === 'pour' && tilt > 0.9;
        glug.set(flowing ? 0.18 : 0, 400 + glass * 300);
        if (flowing) {
          glass = Math.min(1, glass + POUR_RATE * dt);
          if (glass >= 1) finish();
        }
      }
    },

    draw(c, t) {
      kitchen.draw(c);
      const text = phase === 'pick' ? S().pickDrink : phase === 'open' && capped ? (latched ? S().lift : S().open) : phase === 'done' ? S().cheers : S().pour;
      prompt(c, chosen >= 0 && phase === 'pick' ? S().drinks[kind] : text, W / 2, ctx.topInset + 28, W - 40);

      if (phase === 'pick') {
        const xs = slots();
        const k = easeOutCubic(slide);
        DRINKS.forEach((d, i) => {
          const me = i === chosen;
          const x = chosen < 0 ? xs[i] : me ? lerp(xs[i], bx, k) : xs[i] + (xs[i] < W / 2 ? -1 : 1) * W * 0.6 * k;
          const bob = chosen < 0 ? Math.sin(t * 3 + i * 1.7) * 4 : 0;
          blitBottle(c, d, x, base + bob, h * (me ? 1 : 0.9), 1, true);
          if (chosen < 0) {
            c.fillStyle = '#5a3a1a';
            c.font = `900 ${clamp(h * 0.09, 16, 26)}px ${FONT}`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(S().drinks[d], x, base + (H - base) * 0.45, Math.min(W * 0.27, 250));
          }
        });
        return;
      }

      if (phase !== 'open') drawGlass(c, kind, gx, base, gh, glass, t);
      const pose = bottlePose();
      c.save();
      c.translate(pose.px, pose.py);
      c.rotate(pose.th);
      // Glass, then the drink, then the label, shine and outline over it
      drawBottleTint(c, kind, h);
      drawLiquid(c, kind, h, 1 - glass * 0.95, pose.th);
      blitBottle(c, kind, 0, 0, h, 0, capped, false);
      c.restore();
      if (phase === 'pour' && tilt > 0.9) {
        // The stream from the mouth to the surface in the glass
        const surf = base - gh * 0.06 - gh * 0.9 * glass;
        c.strokeStyle = LIQUID[kind];
        c.lineWidth = h * 0.035;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(pose.mouthX, pose.mouthY);
        c.quadraticCurveTo(pose.mouthX + h * 0.03, (pose.mouthY + surf) / 2, gx - gh * 0.05, surf);
        c.stroke();
      }
      if (cap) drawCap(c, kind, cap.x, cap.y, h, cap.rot);
      if (phase === 'open' || returning > 0) drawOpener(c, ox, oy, s, orot);

      if (phase === 'open' && capped && !drag) {
        if (!latched) {
          // A hand slides from the opener to the cap
          const p = capPos();
          const k = (t * 0.6) % 1;
          drawEmoji(c, '👆', lerp(homeX, p.x, easeOutCubic(k)) + s, lerp(homeY, p.y, easeOutCubic(k)) + s * 2, clamp(h * 0.18, 40, 80));
        } else {
          drawEmoji(c, '⬆️', ox + s * 3, oy - s * 2 + Math.sin(t * 6) * 8, clamp(h * 0.16, 36, 70));
        }
      }
      if (phase === 'pour' && !pouring) drawEmoji(c, '👆', bx + h * 0.2, base - h * 0.5 + Math.sin(t * 6) * 8, clamp(h * 0.18, 40, 80));
    },

    down(x, y, id) {
      if (phase === 'pick') {
        if (chosen >= 0) return;
        const xs = slots();
        for (let i = 0; i < xs.length; i++) {
          if (Math.abs(x - xs[i]) < h * 0.22 && y > base - h * 1.05 && y < base + (H - base) * 0.6) {
            pick(i);
            return;
          }
        }
        return;
      }
      if (phase === 'open' && !drag) {
        // Grab the ring or the handle
        const hx = Math.cos(orot), hy = Math.sin(orot);
        const along = (x - ox) * hx + (y - oy) * hy;
        const across = Math.abs(-(x - ox) * hy + (y - oy) * hx);
        if (Math.hypot(x - ox, y - oy) < s * 2 || (along > 0 && along < s * 5 && across < s * 1.4)) {
          drag = { id, dx: ox - x, dy: oy - y, y0: y };
          returning = 0;
          sfx.tap();
        }
        return;
      }
      if (phase === 'pour') pouring = true;
    },

    move(x, y, id) {
      if (!drag || drag.id !== id) return;
      if (latched) {
        lift = clamp((drag.y0 - y) / (h * 0.22), 0, 1);
        if (lift >= 1) pop();
        return;
      }
      ox = x + drag.dx;
      oy = y + drag.dy;
      orot = lerp(orot, 0, 0.2);
      const p = capPos();
      if (Math.hypot(ox - p.x, oy - p.y) < s * 2) {
        latched = true;
        drag.y0 = y;
        lift = 0;
        sfx.clink(0.7);
        say(S().lift);
      }
    },

    up(_x, _y, id) {
      if (phase === 'pour') pouring = false;
      if (!drag || drag.id !== id) return;
      drag = null;
      if (latched) lift = 0;
      else returning = 0.001;
    },

    dispose() {
      glug.stop();
    },
  };
}
