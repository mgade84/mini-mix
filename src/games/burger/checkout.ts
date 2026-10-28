import { say, sfx } from '../../engine/audio';
import { clamp, easeOutBack, easeOutCubic, FONT, lerp, roundRect, TAU } from '../../engine/util';
import { changeCoins, COINS, coinRadius, drawCoin, Kitchen } from './art';
import { Btn, drawMeal, drawTray, type Env, prompt, type Scene } from './core';
import { money, S, spoken } from './strings';

export const MAX_PRICE = 50;

/** Set the price of the meal on a swinging price tag. */
export function priceScene(env: Env): Scene {
  const { ctx, stage, meal, timers } = env;
  const kitchen = new Kitchen();
  const minus = new Btn('−', '#ff5d8f');
  const plus = new Btn('+', '#38b000');
  const ok = new Btn('OK ✓', '#3a86ff');
  let price = meal.price;
  let tray = { x: 0, y: 0, w: 0, h: 0 };
  let tag = { x: 0, y: 0, w: 0, h: 0 };
  let swing = 0;
  let hold: { id: number; dir: number; t: number; n: number } | null = null;
  let done = false;
  let dt = 0;
  ok.pulse = true;

  say(S().price);

  function step(d: number) {
    const p = clamp(price + d, 1, MAX_PRICE);
    if (p === price) {
      (d > 0 ? plus : minus).shake = 1;
      return;
    }
    price = p;
    swing = 1;
    sfx.clink(0.8 + price / MAX_PRICE);
  }

  return {
    layout(W, H) {
      const counterY = H * 0.42;
      kitchen.layout(stage.ctx, W, H, counterY);
      const tw = Math.min(W - 40, 640);
      tray = { x: W / 2, y: counterY + 36, w: tw, h: 72 };
      const gw = Math.min(W * 0.46, 330);
      tag = { x: W / 2, y: counterY + (H - counterY) * 0.45, w: gw, h: gw * 0.48 };
      const b = Math.min(gw * 0.42, (W - gw) / 2 - 30, 120);
      minus.place(tag.x - gw / 2 - b / 2 - 20, tag.y, b, b);
      plus.place(tag.x + gw / 2 + b / 2 + 20, tag.y, b, b);
      ok.place(W / 2, Math.min(H - 60, tag.y + tag.h / 2 + 90), clamp(W * 0.3, 160, 240), 72);
    },

    update(d) {
      dt = d;
      swing = Math.max(0, swing - d * 2);
      if (hold) {
        hold.t -= d;
        if (hold.t <= 0) {
          step(hold.dir);
          hold.n++;
          hold.t = hold.n > 6 ? 0.06 : 0.12; // speeds up while held
        }
      }
    },

    draw(c, t) {
      kitchen.draw(c);
      const W = stage.width;
      prompt(c, S().price, W / 2, ctx.topInset + 28, W - 40);
      drawTray(c, tray.x, tray.y, tray.w, tray.h);
      drawMeal(c, meal, tray.x, tray.y + 8, tray.w, tray.y + 8 - ctx.topInset - 64, t);

      // Price tag on a string
      const a = Math.sin(t * 9) * swing * 0.12;
      c.save();
      c.translate(tag.x, tag.y - tag.h * 0.9);
      c.rotate(a);
      c.strokeStyle = '#8a6a4a';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-tag.w * 0.3, tag.h * 0.42);
      c.moveTo(0, 0);
      c.lineTo(tag.w * 0.3, tag.h * 0.42);
      c.stroke();
      c.translate(0, tag.h * 0.9);
      roundRect(c, -tag.w / 2, -tag.h / 2 + 6, tag.w, tag.h, 22);
      c.fillStyle = '#d9a300';
      c.fill();
      roundRect(c, -tag.w / 2, -tag.h / 2, tag.w, tag.h, 22);
      c.fillStyle = '#ffd23f';
      c.fill();
      c.strokeStyle = '#fff3c4';
      c.lineWidth = 4;
      c.setLineDash([10, 8]);
      roundRect(c, -tag.w / 2 + 10, -tag.h / 2 + 10, tag.w - 20, tag.h - 20, 14);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#5a3a1a';
      c.font = `900 ${tag.h * 0.5}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(money(price), 0, 4, tag.w - 30);
      c.restore();

      minus.draw(c, dt, t);
      plus.draw(c, dt, t);
      ok.draw(c, dt, t);
    },

    down(x, y, id) {
      if (done) return;
      for (const [b, dir] of [[minus, -1], [plus, 1]] as const) {
        if (b.hit(x, y)) {
          b.press = 1;
          step(dir);
          hold = { id, dir, t: 0.45, n: 0 };
          return;
        }
      }
      if (ok.hit(x, y)) {
        ok.press = 1;
        done = true;
        meal.price = price;
        sfx.good();
        timers.after(0.3, () => env.go('pay'));
      }
    },

    up(_x, _y, id) {
      if (hold?.id !== id) return;
      hold = null;
      say(spoken(price));
    },
  };
}

interface Flying { v: number; x0: number; y0: number; x1: number; y1: number; t: number; dur: number; kind: 'in' | 'back' | 'change'; }

/** Feed coins into the cash register until the meal is paid for. */
export function payScene(env: Env): Scene {
  const { ctx, stage, meal, fx, timers } = env;
  const kitchen = new Kitchen();
  const price = meal.price;
  const flying: Flying[] = [];
  let reg = { x: 0, y: 0, w: 0, h: 0 };
  let slot = { x: 0, y: 0 };
  let coinR = 44;
  let coinY = 0;
  let coinXs: number[] = [];
  let paid = 0;
  let change = 0;
  let bump = 0;
  let complete = false;
  let drawer = 0;
  let receipt = 0;
  let drag: { v: number; id: number; x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;

  say(S().pay(price));

  const pending = () => paid + flying.reduce((s, f) => s + (f.kind === 'in' ? f.v : 0), 0);
  const inReg = (x: number, y: number) => Math.abs(x - reg.x) < reg.w / 2 + 20 && y > reg.y - 30 && y < reg.y + reg.h + 20;

  function insert(v: number, x: number, y: number) {
    flying.push({ v, x0: x, y0: y, x1: slot.x, y1: slot.y, t: 0, dur: 0.35, kind: 'in' });
    sfx.whoosh();
  }

  function arrived(f: Flying) {
    if (f.kind !== 'in') return;
    paid += f.v;
    bump = 1;
    sfx.clink(f.v >= 10 ? 0.8 : 1.1);
    fx.burst(slot.x, slot.y, { count: 8, kind: 'star', speed: 200, size: 8, life: 0.5 });
    if (paid < price || complete) {
      if (paid < price && pending() <= paid) say(String(paid));
      return;
    }
    complete = true;
    if (paid > price) {
      change = paid - price;
      timers.after(0.5, () => {
        say(S().change(change));
        changeCoins(change).forEach((v, i) => {
          timers.after(i * 0.25, () => {
            flying.push({ v, x0: reg.x, y0: reg.y + reg.h * 0.9, x1: coinR * 1.5, y1: stage.height + coinR * 2, t: 0, dur: 0.9, kind: 'change' });
            sfx.clink(1.3);
          });
        });
      });
    }
    timers.after(change ? 2.2 : 0.3, () => {
      sfx.chaching();
      drawer = 0.001;
      receipt = 0.001;
      ctx.addStars(1);
      fx.burst(reg.x, reg.y + reg.h * 0.3, { count: 50, kind: 'confetti', speed: 600, size: 14, gravity: 700, life: 1.5 });
      timers.after(0.5, () => say(S().thanks));
      timers.after(2.8, () => env.go('eat'));
    });
  }

  return {
    layout(W, H) {
      const top = ctx.topInset;
      coinR = clamp(Math.min(W / 13, H / 15), 30, 56);
      coinY = H - 20 - coinR * 1.2;
      const counterY = coinY - coinR * 1.9;
      kitchen.layout(stage.ctx, W, H, counterY);
      const rw = Math.min(W * 0.66, 480, ((counterY - top - 90) / 0.92));
      reg = { x: W / 2, y: counterY - rw * 0.8, w: rw, h: rw * 0.8 };
      slot = { x: reg.x + rw * 0.36, y: reg.y + reg.h * 0.5 };
      const gap = (Math.min(W - 40, 640) - COINS.length * coinR * 2) / (COINS.length - 1);
      const x0 = W / 2 - ((COINS.length - 1) * (coinR * 2 + gap)) / 2;
      coinXs = COINS.map((_, i) => x0 + i * (coinR * 2 + gap));
    },

    update(d) {
      bump = Math.max(0, bump - d * 4);
      if (drawer > 0) drawer = Math.min(1, drawer + d * 3);
      if (receipt > 0) receipt = Math.min(1, receipt + d * 0.8);
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i];
        f.t += d / f.dur;
        if (f.t >= 1) {
          flying.splice(i, 1);
          arrived(f);
        }
      }
    },

    draw(c, t) {
      kitchen.draw(c);
      const W = stage.width;
      const left = Math.max(0, price - paid);
      prompt(c, complete ? S().thanks : S().pay(price), W / 2, ctx.topInset + 28, W - 40);

      const { x, y, w, h } = reg;
      // Receipt behind the top
      if (receipt > 0) {
        const rh = easeOutCubic(receipt) * h * 0.55;
        c.fillStyle = '#ffffff';
        c.fillRect(x - w * 0.36, y - rh + 10, w * 0.24, rh);
        c.fillStyle = '#c5ccd6';
        for (let i = 1; i < 6; i++) if (i * 16 < rh - 8) c.fillRect(x - w * 0.33, y - rh + 10 + i * 16, w * (i % 2 ? 0.17 : 0.12), 4);
      }
      // Body
      c.beginPath();
      c.moveTo(x - w * 0.42, y);
      c.lineTo(x + w * 0.42, y);
      c.lineTo(x + w * 0.5, y + h * 0.78);
      c.lineTo(x - w * 0.5, y + h * 0.78);
      c.closePath();
      c.fillStyle = '#2a9d8f';
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.15)';
      c.fillRect(x - w * 0.4, y + 6, w * 0.8, 8);
      // Display
      const dw = w * 0.56, dh = h * 0.3;
      const dx = x - w * 0.08 - dw / 2, dy = y + h * 0.07;
      roundRect(c, dx, dy, dw, dh, 12);
      c.fillStyle = '#10261a';
      c.fill();
      c.fillStyle = complete ? '#ffd23f' : '#7cff8a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const s = 1 + bump * 0.15;
      c.save();
      c.translate(dx + dw / 2, dy + dh * 0.42);
      c.scale(s, s);
      c.font = `900 ${dh * 0.5}px ui-monospace, Menlo, monospace`;
      c.fillText(`${Math.min(paid, price)} / ${price}`, 0, 0, dw - 16);
      c.restore();
      c.font = `800 ${dh * 0.2}px ${FONT}`;
      c.fillText(complete ? (change ? `↩ ${money(change)}` : '✓') : S().left(left), dx + dw / 2, dy + dh * 0.82, dw - 16);
      // Keys
      const kc = ['#ffd23f', '#ff9f1c', '#ff5d8f', '#e9eef5'];
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < 4; k++) {
          roundRect(c, x - w * 0.34 + k * w * 0.13, y + h * 0.44 + r * h * 0.14, w * 0.1, h * 0.1, 6);
          c.fillStyle = kc[(k + r) % 4];
          c.fill();
        }
      }
      // Coin slot
      roundRect(c, slot.x - w * 0.05, slot.y - h * 0.16, w * 0.1, h * 0.32, 10);
      c.fillStyle = '#21867a';
      c.fill();
      roundRect(c, slot.x - 5, slot.y - h * 0.12, 10, h * 0.24, 5);
      c.fillStyle = '#0b2d29';
      c.fill();
      if (!complete && !drag) {
        c.font = `${coinR}px ${FONT}`;
        c.fillText('⬇️', slot.x, slot.y - h * 0.16 - coinR * 0.6 + Math.sin(t * 5) * 6);
      }
      // Drawer
      const open = easeOutBack(drawer) * h * 0.2;
      if (drawer > 0) {
        c.fillStyle = '#1b5e57';
        c.fillRect(x - w * 0.46, y + h * 0.78, w * 0.92, open);
        for (let k = 0; k < 4; k++) {
          for (let j = 0; j < 3; j++) drawCoin(c, COINS[(k + j) % 5], x - w * 0.34 + k * w * 0.23 + j * 6, y + h * 0.78 + open * 0.55 - j * 3, w * 0.035);
        }
      }
      roundRect(c, x - w * 0.5, y + h * 0.78 + open, w, h * 0.22, 10);
      c.fillStyle = '#23867a';
      c.fill();
      roundRect(c, x - w * 0.1, y + h * 0.86 + open, w * 0.2, h * 0.06, 6);
      c.fillStyle = '#e9eef5';
      c.fill();

      // Coin dish
      const tw = Math.min(W - 24, 680);
      roundRect(c, W / 2 - tw / 2, coinY - coinR * 1.3, tw, coinR * 2.6, coinR);
      c.fillStyle = '#8a5a2b';
      c.fill();
      roundRect(c, W / 2 - tw / 2 + 8, coinY - coinR * 1.3 + 8, tw - 16, coinR * 2.6 - 16, coinR - 8);
      c.fillStyle = '#b77b42';
      c.fill();
      const locked = complete || pending() >= price;
      c.globalAlpha = locked ? 0.45 : 1;
      COINS.forEach((v, i) => drawCoin(c, v, coinXs[i], coinY + Math.sin(t * 3 + i) * (locked ? 0 : 2), coinR));
      c.globalAlpha = 1;

      for (const f of flying) {
        const k = f.kind === 'in' ? easeOutCubic(f.t) : f.t;
        const arc = Math.sin(k * Math.PI) * (f.kind === 'change' ? -120 : -60);
        const r = f.kind === 'in' ? lerp(coinR, coinR * 0.6, k) : coinR * 0.7;
        drawCoin(c, f.v, lerp(f.x0, f.x1, k), lerp(f.y0, f.y1, k) + arc, r);
      }
      if (drag) {
        c.fillStyle = 'rgba(0,0,0,0.15)';
        c.beginPath();
        c.arc(drag.x + 6, drag.y + 10, coinRadius(drag.v, coinR * 1.15), 0, TAU);
        c.fill();
        drawCoin(c, drag.v, drag.x, drag.y, coinR * 1.15);
      }
    },

    down(px, py, id) {
      if (drag || complete || pending() >= price) return;
      for (let i = 0; i < COINS.length; i++) {
        if (Math.hypot(px - coinXs[i], py - coinY) < coinR * 1.1) {
          drag = { v: COINS[i], id, x: px, y: py, sx: coinXs[i], sy: coinY, moved: false };
          sfx.tap();
          return;
        }
      }
    },

    move(px, py, id) {
      if (!drag || drag.id !== id) return;
      if (Math.hypot(px - drag.sx, py - drag.sy) > 14) drag.moved = true;
      drag.x = px;
      drag.y = py;
    },

    up(px, py, id) {
      if (!drag || drag.id !== id) return;
      const d = drag;
      drag = null;
      // A plain tap sends the coin in by itself; a drag must end over the register.
      if (!d.moved || inReg(px, py)) insert(d.v, d.x, d.y);
      else flying.push({ v: d.v, x0: d.x, y0: d.y, x1: d.sx, y1: d.sy, t: 0, dur: 0.3, kind: 'back' });
    },
  };
}
