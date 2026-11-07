import { say, sfx } from '../../engine/audio';
import { drawEmoji } from '../../engine/sprites';
import { clamp, easeOutBack, FONT, roundRect, TAU } from '../../engine/util';
import { Kitchen } from '../burger/art';
import { drawTray, prompt } from '../burger/core';
import { S as burgerS } from '../burger/strings';
import { drawMeal, type Env, type Scene, type SceneName } from './core';
import { blitBottle } from './drinks';
import { S } from './strings';

interface Card { scene: SceneName; label: () => string; done: () => boolean; color: string; x: number; y: number; w: number; h: number; press: number; }

/** The stand's counter: pick what to make next; finished food waits on the tray. */
export function hubScene(env: Env): Scene {
  const { ctx, stage, meal, fx, timers } = env;
  const kitchen = new Kitchen();
  const card = (scene: SceneName, label: () => string, done: () => boolean, color: string): Card =>
    ({ scene, label, done, color, x: 0, y: 0, w: 0, h: 0, press: 0 });
  const cards: Card[] = [
    card('bread', () => S().hotdog, () => meal.hotdog, '#e63946'),
    card('apple', () => S().snack, () => meal.snackDone, '#38b000'),
    card('drink', () => S().drink, () => meal.drinkDone, '#3a86ff'),
  ];
  const allDone = () => cards.every((k) => k.done());
  let tray = { x: 0, y: 0, w: 0, h: 0 };
  let cardsBottom = 0;
  let appear = 0;
  let leaving = false;

  if (allDone()) {
    leaving = true;
    say(burgerS().ready);
    timers.after(0.6, () => fx.burst(tray.x, tray.y - tray.h, { count: 50, kind: 'confetti', speed: 600, size: 14, gravity: 700, life: 1.5 }));
    timers.after(2.2, () => env.go('price'));
  } else {
    say(burgerS().hubAsk);
  }

  return {
    layout(W, H) {
      const top = ctx.topInset;
      const counterY = H * 0.6;
      kitchen.layout(stage.ctx, W, H, counterY);
      const gap = clamp(W * 0.03, 12, 28);
      const n = cards.length;
      const cw = Math.min((W - 32 - gap * 2) / 3, 250, (counterY - top - 90) / 1.2);
      const ch = cw * 1.2;
      const cy = top + 70 + (counterY - top - 70) / 2 - 10;
      cards.forEach((k, i) => Object.assign(k, { x: W / 2 + (i - (n - 1) / 2) * (cw + gap), y: cy, w: cw, h: ch }));
      cardsBottom = cy + ch / 2 + 14;
      const tw = Math.min(W - 40, 720);
      tray = { x: W / 2, y: counterY + (H - counterY) * 0.62, w: tw, h: Math.min((H - counterY) * 0.42, tw * 0.2) };
    },

    update(dt) {
      appear = Math.min(1, appear + dt * 2.5);
      for (const k of cards) k.press = Math.max(0, k.press - dt * 4);
    },

    draw(c, t) {
      kitchen.draw(c);
      const W = stage.width;
      prompt(c, allDone() ? burgerS().ready : burgerS().hubAsk, W / 2, ctx.topInset + 28, W - 40);

      cards.forEach((k, i) => {
        const done = k.done();
        const a = clamp(appear * 1.6 - i * 0.2, 0, 1);
        const s = easeOutBack(a) * (1 - k.press * 0.06) * (done || leaving ? 1 : 1 + Math.sin(t * 3 + i) * 0.02);
        if (s <= 0) return;
        c.save();
        c.translate(k.x, k.y);
        c.scale(s, s);
        roundRect(c, -k.w / 2, -k.h / 2 + 8, k.w, k.h, 28);
        c.fillStyle = 'rgba(0,0,0,0.15)';
        c.fill();
        roundRect(c, -k.w / 2, -k.h / 2, k.w, k.h, 28);
        c.fillStyle = done ? '#eef7ea' : '#ffffff';
        c.fill();
        c.lineWidth = 6;
        c.strokeStyle = done ? '#38b000' : k.color;
        c.stroke();
        c.globalAlpha = done ? 0.45 : 1;
        const bob = done ? 0 : Math.sin(t * 4 + i * 2) * 4;
        if (k.scene === 'drink') blitBottle(c, 'cola', 0, k.h * 0.18 + bob, k.h * 0.55, 1, true);
        else drawEmoji(c, k.scene === 'apple' ? '🍎' : '🌭', 0, -k.h * 0.1 + bob, k.w * 0.55);
        c.globalAlpha = 1;
        c.fillStyle = done ? '#2d6a1f' : '#5a3a1a';
        c.font = `900 ${clamp(k.w * 0.15, 18, 32)}px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(k.label(), 0, k.h * 0.34, k.w - 16);
        if (done) {
          c.fillStyle = '#38b000';
          c.beginPath();
          c.arc(k.w * 0.36, -k.h * 0.38, k.w * 0.14, 0, TAU);
          c.fill();
          c.fillStyle = '#fff';
          c.font = `900 ${k.w * 0.17}px ${FONT}`;
          c.fillText('✓', k.w * 0.36, -k.h * 0.375);
        }
        c.restore();
      });

      drawTray(c, tray.x, tray.y, tray.w, tray.h);
      drawMeal(c, meal, tray.x, tray.y + tray.h * 0.1, tray.w, tray.y + tray.h * 0.1 - cardsBottom, t);
    },

    down(px, py) {
      if (leaving) return;
      for (const k of cards) {
        if (Math.abs(px - k.x) < k.w / 2 && Math.abs(py - k.y) < k.h / 2) {
          k.press = 1;
          if (k.done()) {
            sfx.boing();
            return;
          }
          sfx.tap();
          leaving = true;
          timers.after(0.15, () => env.go(k.scene));
          return;
        }
      }
    },
  };
}
