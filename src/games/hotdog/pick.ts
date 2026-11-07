import { say, sfx } from '../../engine/audio';
import { clamp, easeOutBack, FONT, roundRect } from '../../engine/util';
import { Kitchen } from '../burger/art';
import { prompt } from '../burger/core';
import { blitBunBack, blitBunFront, blitSausageAt, BREADS, type Bread, SAUSAGES, type Sausage } from './art';
import type { Env, Scene } from './core';
import { S } from './strings';

interface Card<T> { id: T; x: number; y: number; w: number; h: number; press: number; }

/** Big picture cards: first the bread, then the sausage. */
export function pickScene(env: Env, what: 'bread' | 'sausage'): Scene {
  const { ctx, stage, meal, fx, timers } = env;
  const kitchen = new Kitchen();
  const ids: (Bread | Sausage)[] = what === 'bread' ? BREADS : SAUSAGES;
  const cards: Card<Bread | Sausage>[] = ids.map((id) => ({ id, x: 0, y: 0, w: 0, h: 0, press: 0 }));
  const title = () => (what === 'bread' ? S().pickBread : S().pickSausage);
  const name = (id: Bread | Sausage) => (what === 'bread' ? S().breads[id as Bread] : S().sausages[id as Sausage]);
  let chosen: Card<Bread | Sausage> | null = null;
  let appear = 0;
  let picked = 0;

  say(title());

  return {
    layout(W, H) {
      const top = ctx.topInset + 64;
      kitchen.layout(stage.ctx, W, H, H * 0.86);
      const gap = clamp(W * 0.02, 10, 18);
      const cols = (W - 32) / cards.length >= 130 ? cards.length : Math.ceil(cards.length / 2);
      const rows = Math.ceil(cards.length / cols);
      const cw = Math.min((W - 32 - gap * (cols - 1)) / cols, 230, (H * 0.86 - top - 20 - gap * (rows - 1)) / rows / 1.15);
      const ch = cw * 1.15;
      const y0 = top + (H * 0.86 - top - rows * ch - (rows - 1) * gap) / 2 + ch / 2;
      cards.forEach((k, i) => {
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, cards.length - row * cols);
        const col = i - row * cols;
        Object.assign(k, { x: W / 2 + (col - (inRow - 1) / 2) * (cw + gap), y: y0 + row * (ch + gap), w: cw, h: ch });
      });
    },

    update(dt) {
      appear = Math.min(1, appear + dt * 2.5);
      if (chosen) picked = Math.min(1, picked + dt * 3);
      for (const k of cards) k.press = Math.max(0, k.press - dt * 4);
    },

    draw(c, t) {
      kitchen.draw(c);
      const W = stage.width;
      prompt(c, chosen ? name(chosen.id) : title(), W / 2, ctx.topInset + 28, W - 40);
      cards.forEach((k, i) => {
        const a = clamp(appear * 1.8 - i * 0.15, 0, 1);
        const me = chosen === k;
        let s = easeOutBack(a) * (1 - k.press * 0.06);
        if (chosen) s *= me ? 1 + picked * 0.08 : 1 - picked * 0.15;
        if (s <= 0) return;
        c.save();
        c.translate(k.x, k.y);
        c.scale(s, s);
        c.globalAlpha = chosen && !me ? 1 - picked * 0.6 : 1;
        roundRect(c, -k.w / 2, -k.h / 2 + 8, k.w, k.h, 26);
        c.fillStyle = 'rgba(0,0,0,0.15)';
        c.fill();
        roundRect(c, -k.w / 2, -k.h / 2, k.w, k.h, 26);
        c.fillStyle = '#ffffff';
        c.fill();
        c.lineWidth = 6;
        c.strokeStyle = me ? '#38b000' : '#e63946';
        c.stroke();
        const bob = chosen ? 0 : Math.sin(t * 3 + i * 1.3) * 3;
        if (what === 'bread') {
          const u = k.w * 0.74;
          blitBunBack(c, k.id as Bread, 0, k.h * 0.08 + bob, u);
          blitBunFront(c, k.id as Bread, 0, k.h * 0.08 + bob, u);
        } else {
          blitSausageAt(c, k.id as Sausage, 1, 0, -k.h * 0.1 + bob, k.w * 0.7);
        }
        c.fillStyle = '#5a3a1a';
        c.font = `900 ${clamp(k.w * 0.13, 15, 26)}px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(name(k.id), 0, k.h * 0.32, k.w - 14);
        c.restore();
        c.globalAlpha = 1;
      });
    },

    down(x, y) {
      if (chosen || appear < 0.5) return;
      for (const k of cards) {
        if (Math.abs(x - k.x) < k.w / 2 && Math.abs(y - k.y) < k.h / 2) {
          k.press = 1;
          chosen = k;
          sfx.pop();
          say(name(k.id));
          fx.burst(k.x, k.y, { count: 24, kind: 'star', speed: 380, size: 10, gravity: 300, life: 0.9 });
          if (what === 'bread') meal.bread = k.id as Bread;
          else meal.sausage = k.id as Sausage;
          timers.after(1.3, () => env.go(what === 'bread' ? 'sausage' : 'grill'));
          return;
        }
      }
    },
  };
}
