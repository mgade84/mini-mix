import type { GameDef } from '../types';
import { Stage } from '../engine/stage';
import { Particles } from '../engine/particles';
import { type Instrument, playNote, sfx } from '../engine/audio';
import { drawEmoji } from '../engine/sprites';
import { clamp, FONT, pick, rand, roundRect, shade, Timers } from '../engine/util';
import { L, type Lang } from '../i18n';

const en = { play: '⭐ Play song', stop: '⏹ Stop', b: 'B' };
const M: Record<Lang, typeof en> = {
  en,
  // Danish names the note B "H".
  da: { play: '⭐ Spil en sang', stop: '⏹ Stop', b: 'H' },
};

const KEYS = [
  { note: 'C', freq: 261.63, color: '#ff595e', animal: '🐶' },
  { note: 'D', freq: 293.66, color: '#ff924c', animal: '🐱' },
  { note: 'E', freq: 329.63, color: '#ffca3a', animal: '🐥' },
  { note: 'F', freq: 349.23, color: '#8ac926', animal: '🐸' },
  { note: 'G', freq: 392.0, color: '#2ec4b6', animal: '🐳' },
  { note: 'A', freq: 440.0, color: '#1982c4', animal: '🐧' },
  { note: 'B', freq: 493.88, color: '#6a4c93', animal: '🦄' },
  { note: 'C', freq: 523.25, color: '#ff70a6', animal: '🐷' },
];

// "Twinkle Twinkle Little Star" (traditional). Key index; "_" = long note.
const TWINKLE = '0 0 4 4 5 5 4_ 3 3 2 2 1 1 0_ 4 4 3 3 2 2 1_ 4 4 3 3 2 2 1_ 0 0 4 4 5 5 4_ 3 3 2 2 1 1 0_';
const INSTRUMENTS: [Instrument, string][] = [['piano', '🎹'], ['bells', '🔔'], ['robot', '🤖']];

interface Note { x: number; y: number; vx: number; vy: number; life: number; ch: string; }

export const piano: GameDef = {
  id: 'piano',
  title: { en: 'Animal Piano', da: 'Dyreklaver' },
  emoji: '🎹',
  color: '#2ec4b6',
  age: '4+',
  start(ctx) {
    const stage = new Stage(ctx.area);
    const fx = new Particles(700);
    const timers = new Timers();
    const fingers = new Map<number, number>(); // pointerId -> key index
    const press = KEYS.map(() => 0);
    const jump = KEYS.map(() => 0);
    const notes: Note[] = [];
    let inst: Instrument = 'piano';
    let songPlaying = false;
    let rect = { x: 0, y: 0, w: 0, h: 0, kw: 0 };
    let bg: CanvasGradient | null = null;

    const bar = document.createElement('div');
    bar.className = 'toolbar top';
    bar.innerHTML = `
      <div class="grp">${INSTRUMENTS.map(([i, e]) => `<button class="tool" data-inst="${i}">${e}</button>`).join('')}</div>
      <button class="tool wide" data-song>${L(M).play}</button>`;
    ctx.shell.appendChild(bar);
    const songBtn = bar.querySelector<HTMLElement>('[data-song]')!;

    function refreshBar() {
      bar.querySelectorAll<HTMLElement>('[data-inst]').forEach((b) => b.classList.toggle('active', b.dataset.inst === inst));
      songBtn.classList.toggle('active', songPlaying);
      songBtn.textContent = songPlaying ? L(M).stop : L(M).play;
    }
    refreshBar();

    bar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      if (b.dataset.inst) {
        inst = b.dataset.inst as Instrument;
        hit(4);
      } else if (songPlaying) {
        stopSong();
      } else {
        playSong();
      }
      refreshBar();
    });

    function layout() {
      const top = ctx.topInset + bar.offsetHeight + 16;
      const pad = clamp(stage.width * 0.03, 10, 30);
      const w = stage.width - pad * 2;
      const h = stage.height - top - pad;
      rect = { x: pad, y: top, w, h, kw: w / KEYS.length };
    }
    stage.onResize(() => {
      bg = null;
      layout();
    });
    layout();

    function hit(i: number) {
      press[i] = 1;
      jump[i] = 1;
      playNote(KEYS[i].freq, inst);
      const x = rect.x + rect.kw * (i + 0.5);
      notes.push({ x, y: rect.y + rect.h * 0.55, vx: rand(-40, 40), vy: rand(-220, -160), life: 1.6, ch: pick(['🎵', '🎶']) });
      fx.burst(x, rect.y + rect.h * 0.6, { count: 10, color: [KEYS[i].color, '#ffffff'], speed: 260, size: 7, life: 0.7, gravity: 200 });
    }

    function keyAt(x: number, y: number) {
      if (y < rect.y || y > rect.y + rect.h || x < rect.x || x > rect.x + rect.w) return -1;
      return clamp(Math.floor((x - rect.x) / rect.kw), 0, KEYS.length - 1);
    }

    function playSong() {
      songPlaying = true;
      timers.clear();
      let at = 0.2;
      for (const tok of TWINKLE.split(' ')) {
        const i = parseInt(tok, 10);
        timers.after(at, () => hit(i));
        at += tok.endsWith('_') ? 0.84 : 0.42;
      }
      timers.after(at, () => {
        songPlaying = false;
        refreshBar();
        sfx.good();
      });
    }

    function stopSong() {
      songPlaying = false;
      timers.clear();
    }

    stage.on({
      down: (x, y, id) => {
        const k = keyAt(x, y);
        fingers.set(id, k);
        if (k >= 0) hit(k);
      },
      // Slide a finger across the keys for a glissando.
      move: (x, y, id) => {
        if (!fingers.has(id)) return;
        const k = keyAt(x, y);
        if (k !== fingers.get(id)) {
          fingers.set(id, k);
          if (k >= 0) hit(k);
        }
      },
      up: (_x, _y, id) => fingers.delete(id),
    });

    stage.start((dt, t) => {
      timers.update(dt);
      fx.update(dt);
      const c = stage.ctx;
      const W = stage.width;
      const H = stage.height;
      if (!bg) {
        bg = c.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#1e1b4b');
        bg.addColorStop(1, '#4c1d95');
      }
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);
      // Twinkly background stars
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 40; i++) {
        c.globalAlpha = 0.3 + 0.3 * Math.sin(t * 2 + i * 1.7);
        c.fillRect((i * 263) % W, (i * 149) % H, 3, 3);
      }
      c.globalAlpha = 1;

      const held = new Set(fingers.values());
      const gap = Math.max(4, rect.kw * 0.06);
      for (let i = 0; i < KEYS.length; i++) {
        const k = KEYS[i];
        if (held.has(i)) press[i] = Math.max(press[i], 0.6);
        press[i] = Math.max(0, press[i] - dt * 4);
        jump[i] = Math.max(0, jump[i] - dt * 3);
        const x = rect.x + i * rect.kw + gap / 2;
        const w = rect.kw - gap;
        const down = press[i] * 10;
        roundRect(c, x, rect.y + 12, w, rect.h - 12, 22);
        c.fillStyle = shade(k.color, -0.35);
        c.fill();
        roundRect(c, x, rect.y + down, w, rect.h - 12, 22);
        c.fillStyle = press[i] > 0 ? shade(k.color, press[i] * 0.35) : k.color;
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.25)';
        roundRect(c, x + w * 0.15, rect.y + down + 14, w * 0.18, (rect.h - 12) * 0.45, w * 0.09);
        c.fill();

        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.font = `900 ${clamp(w * 0.38, 18, 40)}px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(k.note === 'B' ? L(M).b : k.note, x + w / 2, rect.y + down + 40);

        const as = clamp(w * 0.75, 36, 90);
        const hop = Math.sin(jump[i] * Math.PI) * as * 0.6;
        drawEmoji(c, k.animal, x + w / 2, rect.y + rect.h - as * 0.75 + down - hop, as);
      }

      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        n.x += (n.vx + Math.sin(t * 4 + i) * 30) * dt;
        n.y += n.vy * dt;
        n.life -= dt;
        if (n.life <= 0) {
          notes.splice(i, 1);
          continue;
        }
        c.globalAlpha = clamp(n.life, 0, 1);
        drawEmoji(c, n.ch, n.x, n.y, 44);
      }
      c.globalAlpha = 1;
      fx.draw(c, stage.dpr);
    });

    return () => {
      timers.clear();
      stage.destroy();
      bar.remove();
    };
  },
};
