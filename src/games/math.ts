import type { GameDef } from '../types';
import { Stage } from '../engine/stage';
import { Particles } from '../engine/particles';
import { say, sfx } from '../engine/audio';
import { cached } from '../engine/sprites';
import { clamp, FONT, pick, rand, randInt, roundRect, shade, TAU, Timers } from '../engine/util';
import { L, type Lang } from '../i18n';

const en = {
  level: 'Pick a level',
  praise: ['Yes!', 'Correct!', 'Great!', 'Awesome!'],
  done: 'Math star!',
  right: (n: number) => `${n} answers right`,
  times: '×',
  divide: '÷',
};
const M: Record<Lang, typeof en> = {
  en,
  da: {
    level: 'Vælg et niveau',
    praise: ['Ja!', 'Rigtigt!', 'Flot!', 'Fantastisk!'],
    done: 'Regnestjerne!',
    right: (n: number) => `${n} rigtige svar`,
    // Danish schools write · for times and : for divide.
    times: '·',
    divide: ':',
  },
};

type Level = 'easy' | 'medium' | 'hard';

interface Question { text: string; answer: number; }

const BALLOON_COLORS = ['#ff595e', '#ffb703', '#38b000', '#3a86ff', '#b388ff', '#ff70a6', '#ff7f11'];
const PER_ROUND = 10;

function makeQuestion(level: Level): Question {
  if (level === 'easy') {
    const a = randInt(0, 9);
    const b = randInt(0, 10 - a);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  if (level === 'medium') {
    if (Math.random() < 0.5) {
      const a = randInt(2, 15);
      const b = randInt(1, 20 - a);
      return { text: `${a} + ${b}`, answer: a + b };
    }
    const a = randInt(5, 20);
    const b = randInt(1, a);
    return { text: `${a} − ${b}`, answer: a - b };
  }
  const a = randInt(2, 10);
  const b = randInt(1, 10);
  if (Math.random() < 0.7) return { text: `${a} ${L(M).times} ${b}`, answer: a * b };
  return { text: `${a * b} ${L(M).divide} ${a}`, answer: b };
}

function distractor(ans: number) {
  for (;;) {
    const d = ans + randInt(-5, 5);
    if (d !== ans && d >= 0) return d;
  }
}

function balloonSprite(color: string) {
  return cached('balloon:' + color, 120, 150, (c) => {
    const g = c.createRadialGradient(42, 40, 6, 60, 62, 70);
    g.addColorStop(0, shade(color, 0.55));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, -0.25));
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(60, 64, 52, 60, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.moveTo(60, 120);
    c.lineTo(51, 134);
    c.lineTo(69, 134);
    c.closePath();
    c.fillStyle = shade(color, -0.2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath();
    c.ellipse(38, 38, 10, 18, 0.5, 0, TAU);
    c.fill();
  });
}

function numberSprite(n: number) {
  return cached('bnum:' + n, 120, 120, (c) => {
    c.font = `900 ${n >= 100 ? 52 : 72}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = 10;
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.strokeText(String(n), 60, 64);
    c.fillStyle = '#fff';
    c.fillText(String(n), 60, 64);
  });
}

interface Balloon {
  x: number; y: number; r: number; vy: number; phase: number;
  color: string; n: number; wrong: number;
}

export const math: GameDef = {
  id: 'math',
  title: { en: 'Balloon Math', da: 'Ballonregning' },
  emoji: '🎈',
  color: '#ff595e',
  age: '6–10',
  start(ctx) {
    const stage = new Stage(ctx.area);
    const fx = new Particles(900);
    const timers = new Timers();
    let balloons: Balloon[] = [];
    let level: Level = 'easy';
    let q: Question = makeQuestion(level);
    let solved = 0;
    let showAnswer = 0;
    let spawnIn = 0;
    let sinceCorrect = 0;
    let playing = false;
    let alive = true;
    let bg: CanvasGradient | null = null;

    const radius = () => clamp(stage.width / 13, 40, 66);
    stage.onResize(() => (bg = null));

    async function begin() {
      playing = false;
      balloons = [];
      level = await ctx.choose(
        L(M).level,
        [
          { label: '1 + 2', value: 'easy' as Level, emoji: '🐣', color: '#38b000' },
          { label: '12 − 5', value: 'medium' as Level, emoji: '🦊', color: '#ffb703' },
          { label: `3 ${L(M).times} 4`, value: 'hard' as Level, emoji: '🦉', color: '#e63946' },
        ],
        '🎈',
      );
      if (!alive) return;
      solved = 0;
      nextQuestion();
      playing = true;
    }

    function nextQuestion() {
      let nq = makeQuestion(level);
      while (nq.text === q.text) nq = makeQuestion(level);
      q = nq;
      showAnswer = 0;
      sinceCorrect = 99; // spawn a correct balloon soon
    }

    function spawn(correct: boolean) {
      const r = radius();
      const lanes = Math.max(3, Math.floor((stage.width - 20) / (r * 2.3)));
      const laneW = (stage.width - 20) / lanes;
      // Prefer a lane with no balloon near the bottom.
      let lane = randInt(0, lanes - 1);
      for (let t = 0; t < 6; t++) {
        const x = 10 + laneW * (lane + 0.5);
        if (!balloons.some((b) => Math.abs(b.x - x) < r * 2 && b.y > stage.height - r * 4)) break;
        lane = randInt(0, lanes - 1);
      }
      balloons.push({
        x: 10 + laneW * (lane + 0.5),
        y: stage.height + r * 1.6,
        r,
        vy: rand(55, 85) * clamp(stage.height / 900, 0.8, 1.4),
        phase: rand(0, TAU),
        color: pick(BALLOON_COLORS),
        n: correct ? q.answer : distractor(q.answer),
        wrong: 0,
      });
      if (correct) sinceCorrect = 0;
    }

    function popBalloon(b: Balloon) {
      balloons.splice(balloons.indexOf(b), 1);
      fx.ring(b.x, b.y, b.color, b.r * 1.2);
      fx.burst(b.x, b.y, { count: 36, kind: 'confetti', color: [b.color, '#ffd166', '#ffffff', '#4cc9f0'], speed: 520, size: 14, gravity: 700, life: 1.3 });
      sfx.pop(0.8);
      sfx.good();
      say(pick(L(M).praise));
      solved++;
      showAnswer = 1;
      ctx.addStars(1);
      if (solved >= PER_ROUND) {
        playing = false;
        timers.after(1.2, async () => {
          await ctx.celebrate(L(M).done, L(M).right(PER_ROUND), 5);
          if (alive) begin();
        });
      } else {
        timers.after(1.1, nextQuestion);
      }
    }

    stage.on({
      down: (x, y) => {
        if (!playing || showAnswer) return;
        for (let i = balloons.length - 1; i >= 0; i--) {
          const b = balloons[i];
          if (b.wrong) continue;
          const dx = x - b.x;
          const dy = y - b.y;
          if (dx * dx + dy * dy < (b.r * 1.25) ** 2) {
            if (b.n === q.answer) popBalloon(b);
            else {
              b.wrong = 0.01;
              sfx.oops();
            }
            return;
          }
        }
      },
    });

    stage.start((dt, t) => {
      timers.update(dt);
      fx.update(dt);
      const W = stage.width;
      const H = stage.height;
      const c = stage.ctx;

      if (playing && !showAnswer) {
        sinceCorrect += dt;
        spawnIn -= dt;
        const max = Math.max(5, Math.floor(W / 140));
        const live = balloons.filter((b) => !b.wrong);
        if (spawnIn <= 0 && live.length < max) {
          const hasCorrect = live.some((b) => b.n === q.answer);
          spawn((!hasCorrect && sinceCorrect > 1.2) || Math.random() < 0.25);
          spawnIn = rand(0.7, 1.3);
        }
      }

      for (let i = balloons.length - 1; i >= 0; i--) {
        const b = balloons[i];
        if (b.wrong) b.wrong += dt;
        b.y -= b.vy * dt * (b.wrong ? 3 : 1);
        if (b.y < -b.r * 3) balloons.splice(i, 1);
      }

      if (!bg) {
        bg = c.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#7dd3fc');
        bg.addColorStop(1, '#e0f2fe');
      }
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);
      // Soft clouds
      c.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 337 + t * 12 * (1 + i * 0.3)) % (W + 300)) - 150;
        const cy = H * (0.3 + i * 0.17);
        c.beginPath();
        c.arc(cx, cy, 40, 0, TAU);
        c.arc(cx + 45, cy - 18, 50, 0, TAU);
        c.arc(cx + 95, cy, 38, 0, TAU);
        c.fill();
      }

      // All strings in a single path = one draw call.
      c.beginPath();
      for (const b of balloons) {
        const sway = Math.sin(t * 2 + b.phase) * 10;
        const bx = b.x + Math.sin(t * 1.3 + b.phase) * 6;
        c.moveTo(bx, b.y + b.r * 1.3);
        c.quadraticCurveTo(bx + sway, b.y + b.r * 2.1, bx - sway * 0.5, b.y + b.r * 2.9);
      }
      c.strokeStyle = 'rgba(60,60,80,0.5)';
      c.lineWidth = 2;
      c.stroke();

      for (const b of balloons) {
        const bx = b.x + Math.sin(t * 1.3 + b.phase) * 6 + (b.wrong ? Math.sin(b.wrong * 40) * 6 * Math.max(0, 1 - b.wrong) : 0);
        c.globalAlpha = b.wrong ? 0.55 : 1;
        c.drawImage(balloonSprite(b.color), bx - b.r, b.y - b.r * 1.07, b.r * 2, b.r * 2.5);
        const ns = b.r * 1.5;
        c.drawImage(numberSprite(b.n), bx - ns / 2, b.y - ns / 2, ns, ns);
      }
      c.globalAlpha = 1;

      // Question panel
      if (playing || showAnswer) {
        const pw = Math.min(520, W - 32);
        const ph = 104;
        const px = (W - pw) / 2;
        const py = ctx.topInset;
        roundRect(c, px, py + 6, pw, ph, 30);
        c.fillStyle = 'rgba(0,0,0,0.12)';
        c.fill();
        roundRect(c, px, py, pw, ph, 30);
        c.fillStyle = '#fff';
        c.fill();
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = `900 56px ${FONT}`;
        c.fillStyle = showAnswer ? '#38b000' : '#2b2d42';
        c.fillText(`${q.text} = ${showAnswer ? q.answer : '?'}`, W / 2, py + ph / 2 - 6);
        // Progress dots
        const dg = 22;
        const dx0 = W / 2 - ((PER_ROUND - 1) * dg) / 2;
        for (let i = 0; i < PER_ROUND; i++) {
          c.fillStyle = i < solved ? '#ffb703' : '#e2e8f0';
          c.beginPath();
          c.arc(dx0 + i * dg, py + ph - 14, 7, 0, TAU);
          c.fill();
        }
      }

      fx.draw(c, stage.dpr);
    });

    begin();

    return () => {
      alive = false;
      timers.clear();
      stage.destroy();
    };
  },
};
