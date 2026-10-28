import type { GameDef } from '../types';
import { Stage } from '../engine/stage';
import { Particles } from '../engine/particles';
import { say, sfx } from '../engine/audio';
import { drawEmoji } from '../engine/sprites';
import { clamp, easeOutBack, FONT, pick, rand, randInt, roundRect, shade, shuffle, TAU, Timers } from '../engine/util';
import { L, type Lang } from '../i18n';

const en = {
  howMany: 'How many',
  ask: (things: string) => `How many ${things}?`,
  yes: (n: number, thing: string) => `Yes! ${n} ${thing}!`,
  together: "Let's count together!",
  done: 'Super counting!',
  right: (n: number) => `${n} right answers`,
};
const M: Record<Lang, typeof en> = {
  en,
  da: {
    howMany: 'Hvor mange',
    ask: (things: string) => `Hvor mange ${things}?`,
    yes: (n: number, thing: string) => `Ja! ${n} ${thing}!`,
    together: 'Lad os tælle sammen!',
    done: 'Du er god til at tælle!',
    right: (n: number) => `${n} rigtige svar`,
  },
};

// [emoji, singular, plural]
type Word = Record<Lang, [string, string]>;
const THINGS: [string, Word][] = [
  ['🍎', { en: ['apple', 'apples'], da: ['æble', 'æbler'] }],
  ['🍌', { en: ['banana', 'bananas'], da: ['banan', 'bananer'] }],
  ['🐞', { en: ['ladybug', 'ladybugs'], da: ['mariehøne', 'mariehøns'] }],
  ['⭐', { en: ['star', 'stars'], da: ['stjerne', 'stjerner'] }],
  ['🐟', { en: ['fish', 'fish'], da: ['fisk', 'fisk'] }],
  ['🚗', { en: ['car', 'cars'], da: ['bil', 'biler'] }],
  ['🎈', { en: ['balloon', 'balloons'], da: ['ballon', 'balloner'] }],
  ['🐥', { en: ['chick', 'chicks'], da: ['kylling', 'kyllinger'] }],
  ['🍓', { en: ['strawberry', 'strawberries'], da: ['jordbær', 'jordbær'] }],
  ['🌸', { en: ['flower', 'flowers'], da: ['blomst', 'blomster'] }],
  ['🐢', { en: ['turtle', 'turtles'], da: ['skildpadde', 'skildpadder'] }],
  ['🍪', { en: ['cookie', 'cookies'], da: ['småkage', 'småkager'] }],
  ['🦆', { en: ['duck', 'ducks'], da: ['and', 'ænder'] }],
  ['🧁', { en: ['cupcake', 'cupcakes'], da: ['muffin', 'muffins'] }],
];
const BTN_COLORS = ['#ff5d8f', '#3a86ff', '#38b000'];

interface Item { x: number; y: number; appear: number; bounce: number; counted: number; phase: number; }
interface Btn { n: number; x: number; y: number; w: number; h: number; color: string; shake: number; press: number; }

export const counting: GameDef = {
  id: 'counting',
  title: { en: 'Count It!', da: 'Tæl med!' },
  emoji: '🔢',
  color: '#38b000',
  age: '4–6',
  start(ctx) {
    const stage = new Stage(ctx.area);
    const fx = new Particles(700);
    const timers = new Timers();
    let items: Item[] = [];
    let btns: Btn[] = [];
    let thing = THINGS[0];
    let answer = 1;
    let round = 0;
    let next = 1;
    let itemSize = 90;
    let locked = true;
    let solved = false;
    let alive = true;
    let promptY = 0;
    let bg: CanvasGradient | null = null;

    function layout() {
      const W = stage.width;
      const H = stage.height;
      const top = ctx.topInset;
      promptY = top + 30;
      const bw = clamp(W * 0.24, 110, 190);
      const bh = bw * 0.78;
      const gap = bw * 0.18;
      const by = H - bh / 2 - 24;
      const ox = (W - (3 * bw + 2 * gap)) / 2;
      btns.forEach((b, i) => {
        b.w = bw;
        b.h = bh;
        b.x = ox + i * (bw + gap) + bw / 2;
        b.y = by;
      });

      // Scatter items in the play field without overlapping.
      const area = { x0: 20, y0: promptY + 50, x1: W - 20, y1: by - bh / 2 - 20 };
      const fieldW = area.x1 - area.x0;
      const fieldH = area.y1 - area.y0;
      let s = clamp(Math.sqrt((fieldW * fieldH) / (items.length * 3)), 50, 130);
      for (let attempt = 0; attempt < 20; attempt++) {
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < items.length; i++) {
          for (let t = 0; t < 200; t++) {
            const p = { x: rand(area.x0 + s / 2, area.x1 - s / 2), y: rand(area.y0 + s / 2, area.y1 - s / 2) };
            if (pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > s * 1.15)) {
              pts.push(p);
              break;
            }
          }
        }
        if (pts.length === items.length) {
          items.forEach((it, i) => {
            it.x = pts[i].x;
            it.y = pts[i].y;
          });
          break;
        }
        s *= 0.9;
      }
      itemSize = s;
    }

    stage.onResize(() => {
      bg = null;
      layout();
    });

    function newRound() {
      const max = round < 3 ? 5 : round < 8 ? 8 : 10;
      let n = randInt(1, max);
      if (n === answer) n = randInt(1, max); // avoid repeats
      answer = n;
      thing = pick(THINGS);
      items = Array.from({ length: n }, (_, i) => ({ x: 0, y: 0, appear: -i * 0.12, bounce: 0, counted: 0, phase: rand(0, TAU) }));
      const opts = new Set([n]);
      while (opts.size < 3) {
        const d = randInt(Math.max(1, n - 3), Math.min(10, Math.max(n + 3, 4)));
        opts.add(d);
      }
      btns = shuffle([...opts]).map((v, i) => ({ n: v, x: 0, y: 0, w: 0, h: 0, color: BTN_COLORS[i], shake: 0, press: 0 }));
      next = 1;
      solved = false;
      locked = false;
      layout();
      say(L(M).ask(L(thing[1])[1]));
    }

    function countItem(it: Item) {
      it.counted = next++;
      it.bounce = 1;
      sfx.tap();
      say(String(it.counted));
      fx.burst(it.x, it.y, { count: 6, kind: 'star', speed: 160, size: 8, life: 0.5 });
    }

    /** After a wrong answer, count everything together, slowly. */
    function countTogether() {
      locked = true;
      timers.clear(); // restart if a second wrong answer comes mid-count
      items.forEach((it) => (it.counted = 0));
      next = 1;
      const order = items.slice().sort((a, b) => a.y - b.y || a.x - b.x);
      order.forEach((it, i) => timers.after(0.9 + i * 0.75, () => countItem(it)));
      timers.after(0.9 + order.length * 0.75, () => (locked = false));
    }

    function choose(b: Btn) {
      b.press = 1;
      if (b.n === answer) {
        solved = true;
        locked = true;
        sfx.good();
        say(L(M).yes(answer, L(thing[1])[answer === 1 ? 0 : 1]));
        for (const it of items) fx.burst(it.x, it.y, { count: 10, kind: 'star', speed: 300, size: 10, gravity: 300 });
        fx.burst(b.x, b.y, { count: 30, kind: 'confetti', speed: 500, size: 14, gravity: 600, life: 1.4 });
        ctx.addStars(1);
        round++;
        timers.after(2.2, async () => {
          if (round % 5 === 0) {
            await ctx.celebrate(L(M).done, L(M).right(round), 5);
            if (!alive) return;
          }
          newRound();
        });
      } else {
        b.shake = 1;
        sfx.oops();
        say(L(M).together);
        countTogether();
      }
    }

    stage.on({
      down: (x, y) => {
        if (solved) return;
        for (const b of btns) {
          if (Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2) {
            choose(b);
            return;
          }
        }
        if (locked) return;
        const r = itemSize * 0.6;
        for (const it of items) {
          if (Math.hypot(it.x - x, it.y - y) < r) {
            if (!it.counted) countItem(it);
            else it.bounce = 1;
            return;
          }
        }
      },
    });

    stage.start((dt, t) => {
      timers.update(dt);
      fx.update(dt);
      const c = stage.ctx;
      const W = stage.width;
      const H = stage.height;
      if (!bg) {
        bg = c.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#d9f99d');
        bg.addColorStop(1, '#86efac');
      }
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);

      // Prompt
      c.font = `900 ${clamp(W * 0.06, 30, 46)}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#1b4332';
      const label = L(M).howMany;
      const tw = c.measureText(label).width;
      c.fillText(label, W / 2 - 30, promptY);
      drawEmoji(c, thing[0], W / 2 + tw / 2 + 4, promptY, 46);
      c.fillText('?', W / 2 + tw / 2 + 40, promptY);

      for (const it of items) {
        it.appear = Math.min(1, it.appear + dt * 2.5);
        if (it.appear <= 0) continue;
        it.bounce = Math.max(0, it.bounce - dt * 2.5);
        const s = itemSize * easeOutBack(it.appear) * (1 + Math.sin(it.bounce * Math.PI) * 0.3);
        const bob = Math.sin(t * 2 + it.phase) * 4 - Math.sin(it.bounce * Math.PI) * 14;
        drawEmoji(c, thing[0], it.x, it.y + bob, s);
        if (it.counted) {
          const bx = it.x + itemSize * 0.38;
          const by = it.y - itemSize * 0.38 + bob;
          c.fillStyle = '#ff5d8f';
          c.beginPath();
          c.arc(bx, by, 19, 0, TAU);
          c.fill();
          c.lineWidth = 3;
          c.strokeStyle = '#fff';
          c.stroke();
          c.fillStyle = '#fff';
          c.font = `900 22px ${FONT}`;
          c.fillText(String(it.counted), bx, by + 1);
        }
      }

      for (const b of btns) {
        b.shake = Math.max(0, b.shake - dt * 2);
        b.press = Math.max(0, b.press - dt * 4);
        const ox = Math.sin(b.shake * 30) * b.shake * 12;
        const py = b.press * 6;
        const x = b.x - b.w / 2 + ox;
        const y = b.y - b.h / 2;
        roundRect(c, x, y + 8, b.w, b.h, 28);
        c.fillStyle = shade(b.color, -0.3);
        c.fill();
        roundRect(c, x, y + py, b.w, b.h, 28);
        c.fillStyle = b.color;
        c.fill();
        c.fillStyle = '#fff';
        c.font = `900 ${b.h * 0.62}px ${FONT}`;
        c.fillText(String(b.n), x + b.w / 2, y + py + b.h / 2 + 3);
      }
      fx.draw(c, stage.dpr);
    });

    newRound();

    return () => {
      alive = false;
      timers.clear();
      stage.destroy();
    };
  },
};
