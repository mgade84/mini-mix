import { noiseLoop, type NoiseLoop, say, sfx } from '../../engine/audio';
import { drawEmoji } from '../../engine/sprites';
import { clamp, easeOutBack, FONT, roundRect, shade } from '../../engine/util';
import { type Drink, drawCup, Kitchen } from './art';
import { Btn, type Env, prompt, type Scene } from './core';
import { S } from './strings';

const DRINKS = [
  { id: 'cola', color: '#5b2a12', emoji: '🥤' },
  { id: 'orange', color: '#ff8a1c', emoji: '🍊' },
  { id: 'lemon', color: '#c6e23c', emoji: '🍋' },
  { id: 'grape', color: '#8e44ad', emoji: '🍇' },
  { id: 'berry', color: '#e8364f', emoji: '🍓' },
];
const RATE = 0.17; // cups per second

interface Tap { x: number; w: number; press: number; }

/** Five soda taps over one cup: hold to pour, mix freely. */
export function sodaScene(env: Env): Scene {
  const { ctx, stage, fx, timers, meal } = env;
  const kitchen = new Kitchen();
  const taps: Tap[] = DRINKS.map(() => ({ x: 0, w: 0, press: 0 }));
  const drink: Drink[] = [];
  const done = new Btn(S().done, '#38b000');
  const empty = new Btn('🗑', '#8a96a6');
  const held = new Map<number, number>(); // pointer -> tap
  let machine = { x: 0, y: 0, w: 0, h: 0 };
  let panelH = 0;
  let nozzleY = 0;
  let cupX = 0;
  let cupH = 0;
  let cupBottom = 0;
  let cupTarget = 0;
  let pouring = -1;
  let saidFull = false;
  let finished = false;
  let lid = 0;
  let straw = 0;
  let dumpT = 0;
  let dt = 0;
  let pour: NoiseLoop | null = null;

  say(S().pour);

  const fill = () => drink.reduce((s, d) => s + d.amt, 0);
  const refresh = () => {
    done.enabled = fill() >= 0.25;
    done.pulse = fill() >= 0.85;
    empty.visible = fill() > 0 && !finished;
  };
  refresh();

  function active() {
    let last = -1;
    for (const i of held.values()) last = i;
    return last;
  }

  return {
    layout(W, H) {
      const top = ctx.topInset;
      const counterY = H * 0.78;
      kitchen.layout(stage.ctx, W, H, counterY);
      const mw = Math.min(W - 24, 900);
      machine = { x: W / 2, y: top + 64, w: mw, h: counterY - top - 50 };
      const tw = mw / DRINKS.length;
      taps.forEach((tp, i) => Object.assign(tp, { x: W / 2 - mw / 2 + tw * (i + 0.5), w: tw - 12 }));
      panelH = Math.min(tw * 1.05, machine.h * 0.32);
      nozzleY = machine.y + panelH + 46;
      cupBottom = counterY - 6;
      cupH = clamp(cupBottom - nozzleY - 40, 120, 260);
      if (!cupX) cupX = cupTarget = W / 2;
      const bw = clamp(W * 0.2, 120, 190);
      done.place(W - 16 - bw / 2, counterY + (H - counterY) / 2, bw, Math.min(bw * 0.46, (H - counterY) * 0.7));
      empty.place(16 + bw * 0.3, counterY + (H - counterY) / 2, bw * 0.6, Math.min(bw * 0.46, (H - counterY) * 0.7));
    },

    update(d, t) {
      dt = d;
      for (const tp of taps) tp.press = Math.max(0, tp.press - d * 5);
      const a = finished ? -1 : active();
      if (a >= 0) {
        cupTarget = taps[a].x;
        taps[a].press = 1;
      }
      cupX += (cupTarget - cupX) * Math.min(1, d * 10);
      pouring = a >= 0 && Math.abs(cupX - taps[a].x) < 6 && fill() < 1 && dumpT <= 0 ? a : -1;
      if (pouring >= 0) {
        const col = DRINKS[pouring].color;
        const add = Math.min(RATE * d, 1 - fill());
        const last = drink[drink.length - 1];
        if (last && last.color === col) last.amt += add;
        else drink.push({ color: col, amt: add });
        pour ??= noiseLoop('bandpass', 700, 2.5);
        pour.set(0.3, 500 + fill() * 1500 + Math.sin(t * 40) * 60);
        if (Math.random() < d * 30) {
          fx.burst(cupX, cupBottom - fill() * cupH * 0.93, { count: 1, color: 'rgba(255,255,255,0.8)', speed: 90, size: 4, gravity: 300, life: 0.4, angle: -Math.PI / 2, spread: 2 });
        }
        if (fill() >= 0.999 && !saidFull) {
          saidFull = true;
          say(S().cupFull);
          sfx.beep(true);
          fx.burst(cupX, cupBottom - cupH, { count: 20, color: ['#ffffff', col], speed: 200, size: 7, gravity: 400, life: 0.8, angle: -Math.PI / 2, spread: 2.4 });
        }
        refresh();
      } else {
        pour?.set(0);
      }
      if (dumpT > 0) {
        dumpT -= d;
        for (const dr of drink) dr.amt *= Math.max(0, 1 - d * 6);
        if (dumpT <= 0) {
          drink.length = 0;
          saidFull = false;
          refresh();
        }
      }
      if (finished) {
        lid = Math.min(1, lid + d * 2.5);
        if (lid >= 1) straw = Math.min(1, straw + d * 2.5);
      }
    },

    draw(c, t) {
      kitchen.draw(c);
      const W = stage.width;
      prompt(c, finished ? S().sodaDone : S().pour, W / 2, ctx.topInset + 28, W - 40);

      // Machine body
      const { x, y, w, h } = machine;
      roundRect(c, x - w / 2, y + 8, w, h, 26);
      c.fillStyle = 'rgba(0,0,0,0.15)';
      c.fill();
      roundRect(c, x - w / 2, y, w, h, 26);
      c.fillStyle = '#d63d2e';
      c.fill();
      roundRect(c, x - w / 2 + 12, y + panelH + 22, w - 24, h - panelH - 34, 18);
      c.fillStyle = '#3a3f47';
      c.fill();
      // Drip grate
      c.fillStyle = '#6c7580';
      roundRect(c, x - w / 2 + 24, cupBottom - 12, w - 48, 14, 6);
      c.fill();

      const names = S().drinks;
      DRINKS.forEach((dk, i) => {
        const tp = taps[i];
        const py = tp.press * 5;
        const px = tp.x - tp.w / 2;
        roundRect(c, px, y + 12 + 6, tp.w, panelH, 18);
        c.fillStyle = shade(dk.color, -0.35);
        c.fill();
        roundRect(c, px, y + 12 + py, tp.w, panelH, 18);
        c.fillStyle = dk.color;
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.22)';
        roundRect(c, px + 8, y + 20 + py, tp.w - 16, panelH * 0.18, 8);
        c.fill();
        drawEmoji(c, dk.emoji, tp.x, y + 12 + py + panelH * 0.42, Math.min(tp.w, panelH) * 0.45);
        c.fillStyle = '#fff';
        c.font = `900 ${clamp(tp.w * 0.15, 13, 22)}px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(names[dk.id], tp.x, y + 12 + py + panelH * 0.82, tp.w - 10);
        // Nozzle
        roundRect(c, tp.x - 14, nozzleY - 30, 28, 30, 6);
        c.fillStyle = '#b8c1cc';
        c.fill();
        c.fillStyle = '#7b8590';
        c.fillRect(tp.x - 8, nozzleY - 4, 16, 8);
      });

      if (pouring >= 0) {
        const surf = cupBottom - fill() * cupH * 0.93;
        const sw = 9 + Math.sin(t * 30) * 1.5;
        c.fillStyle = DRINKS[pouring].color;
        c.fillRect(taps[pouring].x - sw / 2, nozzleY + 2, sw, surf - nozzleY);
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.fillRect(taps[pouring].x - sw / 2 + 2, nozzleY + 2, 2, surf - nozzleY);
      }

      const lift = dumpT > 0 ? Math.sin((1 - dumpT / 0.6) * Math.PI) * 20 : 0;
      drawCup(c, cupX, cupBottom - lift, cupH, drink, t, { lid: easeOutBack(lid), straw });
      empty.draw(c, dt, t);
      done.draw(c, dt, t);
    },

    down(px, py, id) {
      if (finished) return;
      if (done.hit(px, py)) {
        done.press = 1;
        if (!done.enabled) {
          done.shake = 1;
          sfx.oops();
          return;
        }
        finished = true;
        held.clear();
        pour?.set(0);
        sfx.snap();
        refresh();
        meal.drink = drink.map((d) => ({ ...d }));
        meal.soda = true;
        timers.after(0.8, () => {
          sfx.good();
          say(S().sodaDone);
          ctx.addStars(1);
          fx.burst(cupX, cupBottom - cupH * 0.6, { count: 40, kind: 'star', speed: 480, size: 12, gravity: 300, life: 1.2 });
        });
        timers.after(2.6, () => env.go('hub'));
        return;
      }
      if (empty.hit(px, py)) {
        empty.press = 1;
        if (dumpT <= 0 && fill() > 0) {
          dumpT = 0.6;
          sfx.whoosh();
        }
        return;
      }
      if (py > machine.y && py < nozzleY + 20) {
        taps.forEach((tp, i) => {
          if (Math.abs(px - tp.x) < tp.w / 2 + 6) {
            held.set(id, i);
            sfx.tap();
            if (fill() >= 0.999) {
              sfx.oops();
              say(S().cupFull);
            }
          }
        });
      }
    },

    up(_x, _y, id) {
      held.delete(id);
    },

    dispose() {
      pour?.stop();
    },
  };
}
