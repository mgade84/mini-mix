import type { GameDef } from '../types';
import { Stage } from '../engine/stage';
import { Particles, RAINBOW } from '../engine/particles';
import { playNote, sfx } from '../engine/audio';
import { drawEmoji } from '../engine/sprites';
import { clamp, pick, rand, TAU } from '../engine/util';
import { L, type Lang } from '../i18n';
import { getPaintSave } from '../engine/storage';

const en = { clear: 'Clear', save: 'Save', painting: 'My painting', file: 'my-painting.png' };
const M: Record<Lang, typeof en> = {
  en,
  da: { clear: 'Ryd', save: 'Gem', painting: 'Mit maleri', file: 'mit-maleri.png' },
};

type Tool = 'brush' | 'rainbow' | 'glitter' | 'stamp' | 'eraser';

const TOOLS: [Tool, string][] = [
  ['brush', '🖍️'], ['rainbow', '🌈'], ['glitter', '✨'], ['stamp', '🌟'], ['eraser', '🧽'],
];
const COLORS = ['#ff595e', '#ff924c', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff70a6', '#8b5a2b', '#222222'];
const SIZES = [8, 18, 34];
const STAMPS = ['⭐', '❤️', '🌸', '🦋', '🐱', '🐶', '🌈', '🍓', '🚀', '☀️', '🐠', '🦄'];
// C major pentatonic: anything you draw sounds nice.
const PENTA = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880];

interface Stroke { x: number; y: number; hue: number; dist: number; }

export const paint: GameDef = {
  id: 'paint',
  title: { en: 'Magic Paint', da: 'Tryllemaling' },
  emoji: '🎨',
  color: '#ff5d8f',
  age: '4+',
  start(ctx) {
    // Persistent painting lives on its own canvas, only touched when drawing;
    // the Stage on top is a transparent layer for sparkles + input.
    const layer = document.createElement('canvas');
    layer.className = 'paint-layer';
    ctx.area.appendChild(layer);
    const pc = layer.getContext('2d')!;
    const stage = new Stage(ctx.area, { alpha: true });

    let tool: Tool = 'brush';
    let color = COLORS[0];
    let size = SIZES[1];
    let fxIdle = false;
    const fx = new Particles(900);
    const strokes = new Map<number, Stroke>();

    function resizeLayer(w: number, h: number) {
      const dpr = stage.dpr;
      const old = layer.width ? layer : null;
      let copy: HTMLCanvasElement | null = null;
      if (old) {
        copy = document.createElement('canvas');
        copy.width = old.width;
        copy.height = old.height;
        copy.getContext('2d')!.drawImage(old, 0, 0);
      }
      const prevW = layer.width / dpr;
      const prevH = layer.height / dpr;
      layer.width = Math.round(w * dpr);
      layer.height = Math.round(h * dpr);
      layer.style.width = w + 'px';
      layer.style.height = h + 'px';
      pc.setTransform(dpr, 0, 0, dpr, 0, 0);
      pc.fillStyle = '#ffffff';
      pc.fillRect(0, 0, w, h);
      if (copy) pc.drawImage(copy, 0, 0, prevW, prevH);
      pc.lineCap = 'round';
      pc.lineJoin = 'round';
    }
    resizeLayer(stage.width, stage.height);
    stage.onResize(resizeLayer);

    // ---- Toolbar ----
    const bar = document.createElement('div');
    bar.className = 'toolbar bottom';
    bar.innerHTML = `
      <div class="grp">${TOOLS.map(([t, e]) => `<button class="tool" data-tool="${t}">${e}</button>`).join('')}</div>
      <div class="grp">${COLORS.map((c) => `<button class="swatch" data-color="${c}" style="--sw:${c}"></button>`).join('')}</div>
      <div class="grp">
        ${SIZES.map((s) => `<button class="size" data-size="${s}"><i style="--d:${Math.round(s * 0.7) + 4}px"></i></button>`).join('')}
        <button class="tool" data-act="clear" aria-label="${L(M).clear}">🗑️</button>
        ${getPaintSave() ? `<button class="tool" data-act="save" aria-label="${L(M).save}">💾</button>` : ''}
      </div>`;
    ctx.shell.appendChild(bar);

    function refreshBar() {
      bar.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
      bar.querySelectorAll<HTMLElement>('[data-color]').forEach((b) => b.classList.toggle('active', b.dataset.color === color));
      bar.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.classList.toggle('active', Number(b.dataset.size) === size));
    }
    refreshBar();

    bar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      sfx.tap();
      if (b.dataset.tool) tool = b.dataset.tool as Tool;
      if (b.dataset.color) {
        color = b.dataset.color;
        if (tool === 'eraser' || tool === 'rainbow') tool = 'brush';
      }
      if (b.dataset.size) size = Number(b.dataset.size);
      if (b.dataset.act === 'clear') clear();
      if (b.dataset.act === 'save') savePicture();
      refreshBar();
    });

    function clear() {
      sfx.whoosh();
      pc.fillStyle = '#ffffff';
      pc.fillRect(0, 0, stage.width, stage.height);
      for (let i = 0; i < 8; i++) {
        fx.burst(rand(0, stage.width), rand(0, stage.height), { count: 10, kind: 'star', speed: 300, size: 12, life: 0.9 });
      }
    }

    function savePicture() {
      layer.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], L(M).file, { type: 'image/png' });
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        try {
          if (nav.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: L(M).painting });
            return;
          }
        } catch {
          return; // share sheet dismissed
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, 'image/png');
    }

    // ---- Painting ----
    function stamp(x: number, y: number) {
      const s = size * 3 + 30;
      pc.save();
      pc.translate(x, y);
      pc.rotate(rand(-0.4, 0.4));
      drawEmoji(pc, pick(STAMPS), 0, 0, s);
      pc.restore();
      sfx.pop(rand(0.8, 1.3));
      fx.burst(x, y, { count: 12, kind: 'star', speed: 260, size: 9, life: 0.7 });
    }

    function segment(st: Stroke, x: number, y: number) {
      const dx = x - st.x;
      const dy = y - st.y;
      const len = Math.hypot(dx, dy);
      if (tool === 'eraser') {
        pc.strokeStyle = '#ffffff';
        pc.lineWidth = size * 2.2;
      } else if (tool === 'rainbow') {
        st.hue = (st.hue + len * 0.6) % 360;
        pc.strokeStyle = `hsl(${st.hue},95%,58%)`;
        pc.lineWidth = size * 1.3;
      } else if (tool === 'glitter') {
        pc.strokeStyle = color;
        pc.lineWidth = size * 0.6;
      } else {
        pc.strokeStyle = color;
        pc.lineWidth = size;
      }
      pc.beginPath();
      pc.moveTo(st.x, st.y);
      pc.lineTo(x + 0.01, y);
      pc.stroke();

      if (tool === 'glitter') {
        const n = Math.ceil(len / 6);
        for (let i = 0; i < n; i++) {
          const t = Math.random();
          pc.fillStyle = pick(RAINBOW);
          pc.beginPath();
          pc.arc(st.x + dx * t + rand(-size, size), st.y + dy * t + rand(-size, size), rand(1, 3.5), 0, TAU);
          pc.fill();
        }
        if (Math.random() < 0.6) fx.burst(x, y, { count: 2, kind: 'star', speed: 90, size: 8, life: 0.8, gravity: 60 });
      }

      st.dist += len;
      if ((tool === 'rainbow' || tool === 'glitter') && st.dist > 55) {
        st.dist = 0;
        const i = Math.floor(clamp(1 - y / stage.height, 0, 0.999) * PENTA.length);
        playNote(PENTA[i], 'bells', 0.12);
      }
      st.x = x;
      st.y = y;
    }

    stage.on({
      down: (x, y, id) => {
        if (tool === 'stamp') {
          stamp(x, y);
          return;
        }
        const st = { x, y, hue: rand(0, 360), dist: 99 };
        strokes.set(id, st);
        segment(st, x, y);
      },
      move: (_x, _y, id, e) => {
        const st = strokes.get(id);
        if (!st) return;
        // Coalesced events give smooth lines even when touches arrive faster than frames.
        const evs = e.getCoalescedEvents?.() ?? [];
        for (const ce of evs.length ? evs : [e]) {
          const p = stage.toLocal(ce);
          segment(st, p.x, p.y);
        }
      },
      up: (_x, _y, id) => strokes.delete(id),
    });

    stage.start((dt) => {
      fx.update(dt);
      const c = stage.ctx;
      // Skip clearing an already-empty overlay to save fill-rate.
      if (fx.count === 0) {
        if (!fxIdle) c.clearRect(0, 0, stage.width, stage.height);
        fxIdle = true;
        return;
      }
      fxIdle = false;
      c.clearRect(0, 0, stage.width, stage.height);
      fx.draw(c, stage.dpr);
    });

    return () => {
      stage.destroy();
      bar.remove();
      layer.width = layer.height = 0;
      layer.remove();
    };
  },
};
