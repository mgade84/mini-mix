import type { GameDef } from '../types';
import { Stage } from '../engine/stage';
import { Particles } from '../engine/particles';
import { say, sfx } from '../engine/audio';
import { cached, drawEmoji } from '../engine/sprites';
import { clamp, easeOutBack, FONT, roundRect, shuffle, Timers } from '../engine/util';
import { L, type Lang, type Txt } from '../i18n';

const en = {
  howMany: 'How many cards?',
  done: 'You found them all!',
  pairs: (n: number) => `${n} pairs`,
};
export const M: Record<Lang, typeof en> = {
  en,
  da: {
    howMany: 'Hvor mange kort?',
    done: 'Du fandt dem alle!',
    pairs: (n: number) => `${n} par`,
  },
};

export const ANIMALS: [string, Txt][] = [
  ['🐶', { en: 'dog', da: 'hund' }], ['🐱', { en: 'cat', da: 'kat' }], ['🐭', { en: 'mouse', da: 'mus' }],
  ['🐰', { en: 'bunny', da: 'kanin' }], ['🦊', { en: 'fox', da: 'ræv' }], ['🐻', { en: 'bear', da: 'bjørn' }],
  ['🐼', { en: 'panda', da: 'panda' }], ['🐨', { en: 'koala', da: 'koala' }], ['🐯', { en: 'tiger', da: 'tiger' }],
  ['🦁', { en: 'lion', da: 'løve' }], ['🐮', { en: 'cow', da: 'ko' }], ['🐷', { en: 'pig', da: 'gris' }],
  ['🐸', { en: 'frog', da: 'frø' }], ['🐵', { en: 'monkey', da: 'abe' }], ['🐔', { en: 'chicken', da: 'høne' }],
  ['🐧', { en: 'penguin', da: 'pingvin' }], ['🐙', { en: 'octopus', da: 'blæksprutte' }],
  ['🦄', { en: 'unicorn', da: 'enhjørning' }], ['🐢', { en: 'turtle', da: 'skildpadde' }],
  ['🐘', { en: 'elephant', da: 'elefant' }], ['🦒', { en: 'giraffe', da: 'giraf' }], ['🐳', { en: 'whale', da: 'hval' }],
];

interface Card {
  e: string; name: Txt;
  x: number; y: number; w: number; h: number;
  flip: number; up: boolean; matched: boolean;
  delay: number; appear: number; pulse: number; shake: number;
}

function backSprite(w: number, h: number) {
  return cached(`mback:${w}x${h}`, w, h, (c) => {
    const r = w * 0.14;
    roundRect(c, 2, 2, w - 4, h - 4, r);
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#8e7dff');
    g.addColorStop(1, '#ff7eb6');
    c.fillStyle = g;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = 'rgba(255,255,255,0.18)';
    const step = w * 0.22;
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        c.beginPath();
        c.arc(x, y, w * 0.04, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
    roundRect(c, 2, 2, w - 4, h - 4, r); // the dots replaced the current path
    c.lineWidth = 4;
    c.strokeStyle = '#fff';
    c.stroke();
    c.fillStyle = '#fff';
    c.font = `900 ${w * 0.5}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('?', w / 2, h / 2 + w * 0.03);
  });
}

function frontSprite(w: number, h: number, matched: boolean) {
  return cached(`mfront:${w}x${h}:${matched}`, w, h, (c) => {
    roundRect(c, 3, 3, w - 6, h - 6, w * 0.14);
    c.fillStyle = matched ? '#fff8d6' : '#ffffff';
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = matched ? '#ffc300' : '#d9deea';
    c.stroke();
  });
}

export const memory: GameDef = {
  id: 'memory',
  title: { en: 'Memory Match', da: 'Vendespil' },
  emoji: '🃏',
  color: '#a06cff',
  age: '4+',
  start(ctx) {
    const stage = new Stage(ctx.area);
    const fx = new Particles(600);
    const timers = new Timers();
    let cards: Card[] = [];
    let open: Card[] = [];
    let pairs = 3;
    let busy = true;
    let alive = true;
    let bg: CanvasGradient | null = null;

    function layout() {
      const n = cards.length;
      if (!n) return;
      const top = ctx.topInset;
      const pad = 16;
      const W = stage.width - pad * 2;
      const H = stage.height - top - pad;
      const gap = clamp(Math.min(W, H) * 0.02, 8, 16);
      let best = { cols: 1, rows: n, cw: 0 };
      for (let cols = 1; cols <= n; cols++) {
        if (n % cols) continue;
        const rows = n / cols;
        const cw = Math.min((W - gap * (cols - 1)) / cols, ((H - gap * (rows - 1)) / rows) * 0.8);
        if (cw > best.cw) best = { cols, rows, cw };
      }
      const cw = Math.floor(Math.min(best.cw, 220));
      const ch = Math.floor(cw / 0.8);
      const ox = (stage.width - (best.cols * cw + (best.cols - 1) * gap)) / 2;
      const oy = top + (H - (best.rows * ch + (best.rows - 1) * gap)) / 2;
      cards.forEach((k, i) => {
        k.x = ox + (i % best.cols) * (cw + gap) + cw / 2;
        k.y = oy + Math.floor(i / best.cols) * (ch + gap) + ch / 2;
        k.w = cw;
        k.h = ch;
      });
    }

    stage.onResize(() => {
      bg = null;
      layout();
    });

    function deal() {
      const picks = shuffle(ANIMALS.slice()).slice(0, pairs);
      const mk = ([e, name]: [string, Txt]): Card => ({
        e, name, x: 0, y: 0, w: 0, h: 0, flip: 0, up: false, matched: false,
        delay: 0, appear: 0, pulse: 0, shake: 0,
      });
      cards = shuffle(picks.flatMap((p) => [mk(p), mk(p)]));
      cards.forEach((k, i) => (k.delay = 0.15 + i * 0.05));
      open = [];
      busy = false;
      layout();
      sfx.whoosh();
    }

    async function begin() {
      pairs = await ctx.choose(
        L(M).howMany,
        [
          { label: '6', value: 3, emoji: '🐣', color: '#38b000' },
          { label: '12', value: 6, emoji: '🐥', color: '#ffb703' },
          { label: '16', value: 8, emoji: '🦉', color: '#fb8500' },
          { label: '24', value: 12, emoji: '🦅', color: '#e63946' },
        ],
        '🃏',
      );
      if (alive) deal();
    }

    function win() {
      busy = true;
      timers.after(0.7, async () => {
        ctx.addStars(Math.ceil(pairs / 2));
        await ctx.celebrate(L(M).done, L(M).pairs(pairs), Math.min(5, Math.ceil(pairs / 2)));
        if (alive) deal();
      });
    }

    stage.on({
      down: (x, y) => {
        if (busy || open.length >= 2) return;
        const k = cards.find(
          (c) => !c.up && !c.matched && c.delay <= 0 && c.appear > 0.8 &&
            Math.abs(x - c.x) < c.w / 2 && Math.abs(y - c.y) < c.h / 2,
        );
        if (!k) return;
        k.up = true;
        sfx.flip();
        open.push(k);
        if (open.length < 2) return;
        const [a, b] = open;
        if (a.e === b.e) {
          timers.after(0.45, () => {
            a.matched = b.matched = true;
            a.pulse = b.pulse = 1;
            open = [];
            sfx.good();
            say(L(a.name));
            for (const m of [a, b]) {
              fx.burst(m.x, m.y, { count: 18, kind: 'star', speed: 340, size: 11, gravity: 250, life: 1 });
            }
            if (cards.every((c) => c.matched)) win();
          });
        } else {
          timers.after(1.1, () => {
            a.up = b.up = false;
            a.shake = b.shake = 1;
            open = [];
          });
        }
      },
    });

    stage.start((dt) => {
      timers.update(dt);
      fx.update(dt);
      const c = stage.ctx;
      const dpr = stage.dpr;
      if (!bg) {
        bg = c.createLinearGradient(0, 0, stage.width, stage.height);
        bg.addColorStop(0, '#d7c8ff');
        bg.addColorStop(1, '#ffd6ea');
      }
      c.fillStyle = bg;
      c.fillRect(0, 0, stage.width, stage.height);

      for (const k of cards) {
        if (k.delay > 0) {
          k.delay -= dt;
          continue;
        }
        k.appear = Math.min(1, k.appear + dt * 3);
        const target = k.up || k.matched ? 1 : 0;
        k.flip += clamp(target - k.flip, -dt * 5, dt * 5);
        k.pulse = Math.max(0, k.pulse - dt * 2);
        k.shake = Math.max(0, k.shake - dt * 2.5);

        const s = easeOutBack(k.appear) * (1 + Math.sin(k.pulse * Math.PI) * 0.15);
        const sx = Math.max(0.02, Math.abs(Math.cos(k.flip * Math.PI))) * s;
        const ox = Math.sin(k.shake * 30) * k.shake * 8;
        c.setTransform(dpr * sx, 0, 0, dpr * s, (k.x + ox) * dpr, k.y * dpr);
        if (k.flip < 0.5) {
          c.drawImage(backSprite(k.w, k.h), -k.w / 2, -k.h / 2, k.w, k.h);
        } else {
          c.drawImage(frontSprite(k.w, k.h, k.matched), -k.w / 2, -k.h / 2, k.w, k.h);
          drawEmoji(c, k.e, 0, 0, k.w * 0.6);
        }
      }
      stage.resetTransform();
      fx.draw(c, dpr);
    });

    begin();

    return () => {
      alive = false;
      timers.clear();
      stage.destroy();
    };
  },
};
