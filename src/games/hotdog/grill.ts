import { noiseLoop, say, sfx } from '../../engine/audio';
import { drawEmoji } from '../../engine/sprites';
import { clamp, rand, roundRect } from '../../engine/util';
import { Kitchen } from '../burger/art';
import { prompt } from '../burger/core';
import { blitSausageAt } from './art';
import type { Env, Scene } from './core';
import { S } from './strings';

const COOK_RATE = 0.4; // per second on the side that faces the grill
const MAX_COOK = 1.6;

/** The sausage cooks on the side facing down; tap it to turn it until both sides are done. */
export function grillScene(env: Env): Scene {
  const { ctx, stage, meal, fx, timers } = env;
  const kitchen = new Kitchen();
  const sizzle = noiseLoop('highpass', 2600, 0.7);
  const lv = [0, 0]; // doneness of each side
  let down = 0; // which side faces the grill
  let roll = 0; // 0..1 while turning
  let hop = 0;
  let done = false;
  let turns = 0;
  let nag = 0; // time since we last asked for a turn
  let asked = false;
  let smoke = 0;
  let gx = 0, gy = 0, gw = 0, depth = 0, u = 0;
  let glow: CanvasGradient | null = null;

  say(S().grill);
  sizzle.set(0.12);

  const needsTurn = () => !done && lv[down] >= 1 && lv[1 - down] < 1;
  const sausageY = () => gy - depth * 0.5 - Math.sin(roll * Math.PI) * u * 0.12 - Math.sin(hop * Math.PI) * u * 0.25;

  function finish() {
    done = true;
    meal.cook = clamp((lv[0] + lv[1]) / 2, 1, MAX_COOK);
    sizzle.set(0);
    sfx.good();
    say(S().grilled);
    ctx.addStars(1);
    fx.burst(gx, sausageY(), { count: 40, kind: 'star', speed: 480, size: 12, gravity: 300, life: 1.2 });
    hop = 0.001;
    timers.after(2.2, () => env.go('dress'));
  }

  return {
    layout(W, H) {
      const counterY = H * 0.68;
      kitchen.layout(stage.ctx, W, H, counterY);
      gw = Math.min(W * 0.8, 640, (counterY - ctx.topInset - 60) * 2.4);
      depth = gw * 0.26;
      gx = W / 2;
      gy = counterY + Math.min(40, (H - counterY) * 0.3);
      u = gw * 0.6;
      glow = stage.ctx.createRadialGradient(gx, gy - depth * 0.5, gw * 0.05, gx, gy - depth * 0.5, gw * 0.55);
      glow.addColorStop(0, '#ffb703');
      glow.addColorStop(0.5, '#fb5607');
      glow.addColorStop(1, '#6a040f');
    },

    update(dt) {
      if (!done) {
        if (roll === 0) lv[down] = Math.min(MAX_COOK, lv[down] + COOK_RATE * dt);
        if (lv[0] >= 1 && lv[1] >= 1 && roll === 0) finish();
      }
      if (roll > 0) {
        const was = roll;
        roll = Math.min(1, roll + dt * 3);
        if (was < 0.5 && roll >= 0.5) down = 1 - down;
        if (roll >= 1) roll = 0;
      }
      if (hop > 0) hop = Math.min(1, hop + dt * 2.2);
      nag += dt;
      if (needsTurn() && (!asked || nag > 5)) {
        nag = 0;
        asked = true;
        say(S().turn);
      }
      smoke -= dt;
      if (!done && smoke <= 0) {
        smoke = 0.15;
        fx.burst(gx + rand(-0.45, 0.45) * u, gy - depth * 0.5 - u * 0.12, {
          count: 1, color: ['#f1f3f5', '#e9ecef'], speed: 60, size: 5, grow: 14, gravity: -50, life: 1, angle: -Math.PI / 2, spread: 0.5,
        });
      }
    },

    draw(c, t) {
      kitchen.draw(c);
      const W = stage.width;
      prompt(c, done ? S().grilled : turns > 0 || lv[down] >= 1 ? S().turn : S().grill, W / 2, ctx.topInset + 28, W - 40);

      // Grill body, legs and the hot grate seen from above
      const top = gy - depth;
      c.fillStyle = '#1d1f2c';
      c.fillRect(gx - gw * 0.4, gy + gw * 0.2, gw * 0.05, gw * 0.12);
      c.fillRect(gx + gw * 0.35, gy + gw * 0.2, gw * 0.05, gw * 0.12);
      roundRect(c, gx - gw / 2, gy - 6, gw, gw * 0.24, 18);
      c.fillStyle = '#2b2d42';
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(gx - gw * 0.46, gy + 6, gw * 0.92, 6);
      c.beginPath();
      c.moveTo(gx - gw * 0.42, top);
      c.lineTo(gx + gw * 0.42, top);
      c.lineTo(gx + gw / 2, gy);
      c.lineTo(gx - gw / 2, gy);
      c.closePath();
      c.fillStyle = glow ?? '#fb5607';
      c.fill();
      c.strokeStyle = '#3a3a3a';
      c.lineWidth = Math.max(4, gw * 0.012);
      c.lineCap = 'round';
      for (let i = 0; i <= 12; i++) {
        const k = i / 12 - 0.5;
        c.beginPath();
        c.moveTo(gx + k * gw * 0.84, top);
        c.lineTo(gx + k * gw, gy);
        c.stroke();
      }

      // The sausage, squashing while it rolls over
      const sq = Math.sin(roll * Math.PI);
      const y = sausageY();
      c.save();
      c.translate(gx, y);
      c.scale(1 + sq * 0.03, 1 - sq * 0.5);
      blitSausageAt(c, meal.sausage, lv[1 - down], 0, 0, u);
      c.restore();

      if (needsTurn() && roll === 0) drawEmoji(c, '👆', gx, gy + u * 0.18 + Math.sin(t * 6) * 8, clamp(u * 0.22, 44, 90));
    },

    down(x, y) {
      if (done || roll > 0) return;
      if (Math.abs(x - gx) < u * 0.65 && Math.abs(y - sausageY()) < u * 0.25) {
        roll = 0.001;
        turns++;
        nag = 0;
        sfx.flip();
        fx.burst(gx, gy - depth * 0.5, { count: 10, color: ['#ffb703', '#fb5607'], speed: 260, size: 5, gravity: 500, life: 0.5, angle: -Math.PI / 2, spread: 1.6 });
      }
    },

    dispose() {
      sizzle.stop();
    },
  };
}
