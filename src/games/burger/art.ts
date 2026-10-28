/**
 * Procedural food art. The chef looks down at the counter at an angle, so each
 * burger layer is a disc: a front side band plus its top surface as an ellipse.
 * Layers are cached as sprites per width bucket, so a tall stack is just a
 * handful of drawImage calls per frame.
 */
import { cached } from '../../engine/sprites';
import { clamp, FONT, lerp, roundRect, shade, TAU } from '../../engine/util';

export type Ing = 'patty' | 'cheese' | 'bacon' | 'lettuce' | 'tomato' | 'onion' | 'pickle' | 'egg' | 'ketchup' | 'mustard';
export type Layer = Ing | 'bottom' | 'top';

export const INGS: Ing[] = ['patty', 'cheese', 'bacon', 'lettuce', 'tomato', 'onion', 'pickle', 'egg', 'ketchup', 'mustard'];

/** Viewing angle: how round-from-above things look (ellipse height / width). */
export const K = 0.32;

/** How much each layer adds to the stack, as a fraction of the bun width. */
export const THICK: Record<Layer, number> = {
  bottom: 0.13, top: 0.3, patty: 0.11, cheese: 0.02, bacon: 0.03, lettuce: 0.035,
  tomato: 0.05, onion: 0.03, pickle: 0.03, egg: 0.03, ketchup: 0.012, mustard: 0.012,
};

/** Main color of each layer, for crumbs and splashes. */
export const TINT: Record<Layer, string> = {
  bottom: '#e09a4c', top: '#e09a4c', patty: '#6b3a1f', cheese: '#ffc629', bacon: '#b8432f',
  lettuce: '#6cc04a', tomato: '#e5383b', onion: '#e9d8f2', pickle: '#6a994e', egg: '#fff6d8',
  ketchup: '#c1121f', mustard: '#f5c400',
};

function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
}

/** A short cylinder standing at the origin: side band in `side`, top face in `top`. */
function disc(c: CanvasRenderingContext2D, x: number, r: number, th: number, side: string | CanvasGradient, top: string | CanvasGradient) {
  const ry = r * K;
  c.beginPath();
  c.moveTo(x - r, -th);
  c.lineTo(x - r, 0);
  c.ellipse(x, 0, r, ry, 0, Math.PI, 0, true);
  c.lineTo(x + r, -th);
  c.ellipse(x, -th, r, ry, 0, 0, Math.PI, false);
  c.closePath();
  c.fillStyle = side;
  c.fill();
  ellipse(c, x, -th, r, ry);
  c.fillStyle = top;
  c.fill();
}

/** Point on the top face at polar (a, f·r), for scattering details in perspective. */
const onTop = (r: number, th: number, a: number, f: number): [number, number] => [Math.cos(a) * r * f, -th + Math.sin(a) * r * f * K];

/** A ruffled outline of an ellipse (lettuce, egg white). */
function ruffle(c: CanvasRenderingContext2D, cy: number, r: number, amp: number, waves: number, phase = 0) {
  c.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * TAU;
    const rr = r + Math.sin(a * waves + phase) * amp;
    c.lineTo(Math.cos(a) * rr, cy + Math.sin(a) * rr * K);
  }
  c.closePath();
}

function squiggle(c: CanvasRenderingContext2D, u: number, th: number, color: string, waves: number) {
  c.strokeStyle = shade(color, -0.25);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const path = (dy: number) => {
    c.beginPath();
    for (let i = 0; i <= 60; i++) {
      const k = i / 60;
      const x = lerp(-0.36, 0.36, k) * u;
      // Zig-zag back and forth across the top, staying inside the bun's ellipse
      const lim = Math.sqrt(Math.max(0, 1 - (x / (0.42 * u)) ** 2)) * 0.42 * u * K;
      c.lineTo(x, -th + dy + Math.sin(k * waves * TAU) * lim * 0.8);
    }
  };
  c.lineWidth = u * 0.038;
  path(u * 0.006);
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = u * 0.03;
  path(0);
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.45)';
  c.lineWidth = u * 0.007;
  path(-u * 0.006);
  c.stroke();
}

/** Draws one layer with its base center at the origin, growing upwards. */
export function drawLayer(c: CanvasRenderingContext2D, id: Layer, u: number) {
  c.lineJoin = 'round';
  const th = THICK[id] * u;
  switch (id) {
    case 'bottom': {
      const r = 0.48 * u;
      const g = c.createLinearGradient(0, -th, 0, r * K);
      g.addColorStop(0, '#e9a55a');
      g.addColorStop(1, '#a95a20');
      disc(c, 0, r, th, g, '#f7dca8');
      c.fillStyle = 'rgba(200,140,70,0.25)';
      for (let i = 0; i < 16; i++) {
        const [x, y] = onTop(r, th, i * 2.4, 0.2 + ((i * 37) % 70) / 100);
        ellipse(c, x, y, u * 0.012, u * 0.006);
        c.fill();
      }
      break;
    }
    case 'top': {
      const r = 0.5 * u;
      // Dome: front rim of the base, then a curve over the crown
      c.beginPath();
      c.moveTo(-r, 0);
      c.ellipse(0, 0, r, r * K, 0, Math.PI, 0, true);
      c.bezierCurveTo(r * 1.02, -th * 1.2, -r * 1.02, -th * 1.2, -r, 0);
      c.closePath();
      const g = c.createRadialGradient(-0.12 * u, -th * 0.7, 0.02 * u, 0, -th * 0.2, 0.62 * u);
      g.addColorStop(0, '#f8c983');
      g.addColorStop(0.5, '#e0903f');
      g.addColorStop(1, '#a65520');
      c.fillStyle = g;
      c.fill();
      c.fillStyle = '#fff4d6';
      const seeds = [[-0.3, -0.42, 0.4], [-0.15, -0.75, -0.3], [0.02, -0.85, 0.2], [0.18, -0.72, -0.5], [0.32, -0.45, 0.3],
        [-0.06, -0.55, 0.8], [0.1, -0.5, -0.2], [-0.22, -0.2, 0.1], [0.25, -0.15, -0.6], [0.0, -0.25, 0.5], [-0.38, -0.05, 0.9], [0.4, -0.06, -0.9]];
      for (const [x, y, rot] of seeds) {
        c.beginPath();
        c.ellipse(x * u, y * th, 0.022 * u, 0.012 * u, rot, 0, TAU);
        c.fill();
      }
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.lineWidth = 0.025 * u;
      c.lineCap = 'round';
      c.beginPath();
      c.ellipse(-0.04 * u, -th * 0.35, 0.34 * u, th * 0.55, 0, Math.PI * 1.12, Math.PI * 1.38);
      c.stroke();
      break;
    }
    case 'patty': {
      const r = 0.49 * u;
      disc(c, 0, r, th, '#4a240f', '#6e3a1c');
      // Lumpy rim and a charred, juicy top
      c.fillStyle = '#4a240f';
      for (let i = 0; i < 18; i++) {
        const a = Math.PI * (i / 17);
        ellipse(c, Math.cos(a) * r * 0.98, Math.sin(a) * r * K + (i % 3) * 1.5 - th * 0.02, u * 0.03, u * 0.02);
        c.fill();
      }
      c.fillStyle = '#86482a';
      ellipse(c, -0.05 * u, -th - 0.02 * u, r * 0.75, r * K * 0.6);
      c.fill();
      c.strokeStyle = 'rgba(40,18,6,0.7)';
      c.lineWidth = 0.022 * u;
      c.lineCap = 'round';
      for (const x of [-0.24, -0.08, 0.08, 0.24]) {
        c.beginPath();
        c.moveTo((x - 0.06) * u, -th + r * K * 0.55);
        c.lineTo((x + 0.06) * u, -th - r * K * 0.55);
        c.stroke();
      }
      break;
    }
    case 'cheese': {
      // A square slice, corner towards the chef, drooping over the edges
      const s = 0.56 * u;
      const y = -th;
      c.fillStyle = '#e0a400';
      c.beginPath();
      c.moveTo(-s, y + 0.02 * u);
      c.lineTo(-s * 0.94, y + 0.1 * u);
      c.lineTo(0, y + s * K + 0.08 * u);
      c.lineTo(s * 0.94, y + 0.1 * u);
      c.lineTo(s, y + 0.02 * u);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(-s, y + 0.02 * u);
      c.lineTo(0, y - s * K);
      c.lineTo(s, y + 0.02 * u);
      c.lineTo(s * 0.94, y + 0.09 * u);
      c.lineTo(0, y + s * K + 0.06 * u);
      c.lineTo(-s * 0.94, y + 0.09 * u);
      c.closePath();
      c.fillStyle = '#ffc629';
      c.fill();
      c.fillStyle = 'rgba(255,240,170,0.7)';
      c.beginPath();
      c.moveTo(-s * 0.6, y);
      c.lineTo(0, y - s * K * 0.6);
      c.lineTo(s * 0.2, y - s * K * 0.4);
      c.lineTo(-s * 0.4, y + 0.01 * u);
      c.fill();
      break;
    }
    case 'bacon': {
      for (const [dy, rot] of [[-0.06, -0.05], [0.05, 0.06]]) {
        c.save();
        c.translate(0, -th + dy * u);
        c.rotate(rot);
        const band = (off: number, w: number, col: string) => {
          c.beginPath();
          for (let i = 0; i <= 30; i++) {
            const x = lerp(-0.5, 0.5, i / 30) * u;
            c.lineTo(x, (off + Math.sin(i * 0.9) * 0.008) * u);
          }
          for (let i = 30; i >= 0; i--) {
            const x = lerp(-0.5, 0.5, i / 30) * u;
            c.lineTo(x, (off + w + Math.sin(i * 0.9) * 0.008) * u);
          }
          c.closePath();
          c.fillStyle = col;
          c.fill();
        };
        band(-0.035, 0.085, '#7d2416');
        band(-0.04, 0.075, '#b8432f');
        band(-0.012, 0.02, '#f4c2ae');
        band(0.022, 0.01, '#e07a62');
        c.restore();
      }
      break;
    }
    case 'lettuce': {
      ruffle(c, 0, 0.55 * u, 0.025 * u, 11);
      c.fillStyle = '#3f8f2c';
      c.fill();
      ruffle(c, -th, 0.56 * u, 0.028 * u, 13, 0.6);
      c.fillStyle = '#6cc04a';
      c.fill();
      c.strokeStyle = '#4c9a33';
      c.lineWidth = 0.008 * u;
      c.stroke();
      c.strokeStyle = 'rgba(210,245,170,0.8)';
      c.lineWidth = 0.007 * u;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + 0.3;
        const [x, y] = onTop(0.5 * u, th, a, 0.85);
        c.beginPath();
        c.moveTo(x * 0.3, -th + (y + th) * 0.3);
        c.quadraticCurveTo(x * 0.6 + 0.02 * u, -th + (y + th) * 0.5, x, y);
        c.stroke();
      }
      break;
    }
    case 'tomato': {
      for (const x of [-0.22, 0.22]) {
        const r = 0.27 * u;
        disc(c, x * u, r, th, '#a4161a', '#d62828');
        ellipse(c, x * u, -th, r * 0.86, r * K * 0.86);
        c.fillStyle = '#f25c54';
        c.fill();
        c.fillStyle = '#ffd6a5';
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + 0.4;
          ellipse(c, x * u + Math.cos(a) * r * 0.5, -th + Math.sin(a) * r * K * 0.5, r * 0.13, r * K * 0.18);
          c.fill();
        }
        ellipse(c, x * u, -th, r * 0.16, r * K * 0.16);
        c.fillStyle = '#ffadad';
        c.fill();
      }
      break;
    }
    case 'onion': {
      const rings: [number, number, number][] = [[-0.2, -0.02, 0.2], [0.18, 0.03, 0.22], [0.02, -0.06, 0.14], [-0.15, 0.06, 0.12]];
      for (const [x, y, r] of rings) {
        for (const [w, col] of [[0.04, '#a663cc'], [0.026, '#f6effa']] as const) {
          c.strokeStyle = col;
          c.lineWidth = w * u;
          ellipse(c, x * u, -th + y * u, r * u, r * u * K);
          c.stroke();
        }
      }
      break;
    }
    case 'pickle': {
      const spots: [number, number][] = [[-0.3, 0.0], [-0.08, -0.06], [0.14, 0.02], [0.33, -0.03], [0.02, 0.08], [-0.18, 0.08]];
      for (const [x, y] of spots) {
        const r = 0.1 * u;
        c.save();
        c.translate(0, y * u);
        disc(c, x * u, r, th, '#31572c', '#4f772d');
        ellipse(c, x * u, -th, r * 0.8, r * K * 0.8);
        c.fillStyle = '#a7c957';
        c.fill();
        c.fillStyle = '#f2f7d9';
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          ellipse(c, x * u + Math.cos(a) * r * 0.4, -th + Math.sin(a) * r * K * 0.4, r * 0.08, r * 0.05);
          c.fill();
        }
        c.restore();
      }
      break;
    }
    case 'egg': {
      ruffle(c, 0, 0.5 * u, 0.02 * u, 5, 1);
      c.fillStyle = '#e8dcc0';
      c.fill();
      ruffle(c, -th, 0.5 * u, 0.02 * u, 5, 1);
      c.fillStyle = '#fffdf5';
      c.fill();
      const yr = 0.15 * u;
      c.fillStyle = '#e08e00';
      ellipse(c, 0.05 * u, -th + 0.01 * u, yr, yr * 0.62);
      c.fill();
      const g = c.createRadialGradient(0.01 * u, -th - 0.04 * u, 0.01 * u, 0.05 * u, -th, yr);
      g.addColorStop(0, '#ffd166');
      g.addColorStop(1, '#ffa200');
      c.fillStyle = g;
      ellipse(c, 0.05 * u, -th - 0.01 * u, yr * 0.95, yr * 0.58);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.beginPath();
      c.ellipse(0.0, -th - 0.05 * u, 0.04 * u, 0.016 * u, -0.3, 0, TAU);
      c.fill();
      break;
    }
    case 'ketchup':
      squiggle(c, u, th, '#d0101f', 4.5);
      break;
    case 'mustard':
      squiggle(c, u, th, '#f2b705', 6.5);
      break;
  }
}

/** Sprite box around a layer's base point, in bun widths. */
export const SPR_W = 1.3;
export const SPR_UP = 0.56;
export const SPR_DOWN = 0.28;

/** Cached sprite of a layer, with its base point SPR_UP from the top. */
export function layerSprite(id: Layer, w: number) {
  const u = Math.max(16, Math.round(w / 8) * 8);
  return cached(`burger:${id}:${u}`, u * SPR_W, u * (SPR_UP + SPR_DOWN), (c) => {
    c.translate(u * SPR_W * 0.5, u * SPR_UP);
    drawLayer(c, id, u);
  });
}

export function blitLayer(c: CanvasRenderingContext2D, id: Layer, cx: number, bottom: number, w: number) {
  c.drawImage(layerSprite(id, w), cx - w * SPR_W * 0.5, bottom - w * SPR_UP, w * SPR_W, w * (SPR_UP + SPR_DOWN));
}

/** Height from the base to the crown, as drawn (plus the top bun's dome overshoot). */
export function stackHeight(layers: readonly Layer[], w: number) {
  let h = 0;
  for (const l of layers) h += THICK[l] * w;
  return h + (layers[layers.length - 1] === 'top' ? 0.06 * w : 0.2 * w);
}

/** A finished burger, bottom bun first. */
export function drawBurger(c: CanvasRenderingContext2D, layers: readonly Layer[], cx: number, bottom: number, w: number) {
  let y = bottom;
  for (const l of layers) {
    blitLayer(c, l, cx, y, w);
    y -= THICK[l] * w;
  }
}

export function plate(c: CanvasRenderingContext2D, cx: number, y: number, w: number) {
  c.fillStyle = 'rgba(0,0,0,0.12)';
  ellipse(c, cx, y + w * 0.04, w * 0.5, w * 0.5 * K);
  c.fill();
  c.fillStyle = '#d5dde8';
  ellipse(c, cx, y + w * 0.015, w * 0.5, w * 0.5 * K);
  c.fill();
  c.fillStyle = '#f4f7fb';
  ellipse(c, cx, y, w * 0.5, w * 0.5 * K);
  c.fill();
  c.fillStyle = '#ffffff';
  ellipse(c, cx, y, w * 0.36, w * 0.36 * K);
  c.fill();
}

// ---------- Fries ----------

/** Raw potato → golden → dark. `level` is doneness, 1 = perfect. */
export function fryColor(level: number) {
  const pale = [246, 231, 161], gold = [240, 172, 52], dark = [140, 78, 24];
  const [a, b, t] = level < 1 ? [pale, gold, level] : [gold, dark, clamp((level - 1) / 0.6, 0, 1)];
  const ch = (i: number) => Math.round(lerp(a[i], b[i], t));
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}

export function fryStick(c: CanvasRenderingContext2D, x: number, y: number, len: number, thick: number, rot: number, color: string) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.fillStyle = color;
  roundRect(c, -thick / 2, -len / 2, thick, len, thick * 0.3);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.fillRect(-thick / 2 + thick * 0.15, -len / 2 + thick * 0.4, thick * 0.22, len - thick * 0.8);
  c.restore();
}

/** Fry positions in a carton, as [x offset, height, rotation], back to front. */
export const CARTON_FRIES: [number, number, number][] = [
  [-0.28, 0.78, -0.2], [0.26, 0.8, 0.18], [-0.1, 0.95, -0.06], [0.1, 0.92, 0.08], [0.0, 1.0, 0.02],
  [-0.2, 0.86, -0.14], [0.19, 0.85, 0.12], [-0.33, 0.66, -0.25], [0.33, 0.68, 0.24], [-0.04, 0.82, -0.1],
  [0.07, 0.74, 0.14], [-0.16, 0.7, 0.04],
];

/** Red fries carton with `count` fries; (cx, bottom) is the base center, w its top width. */
export function drawCarton(c: CanvasRenderingContext2D, cx: number, bottom: number, w: number, count: number, level: number, squash = 0) {
  const h = w * 0.85 * (1 - squash * 0.55);
  const top = bottom - h;
  const col = fryColor(level);
  for (let i = 0; i < Math.min(count, CARTON_FRIES.length); i++) {
    const [dx, len, rot] = CARTON_FRIES[i];
    fryStick(c, cx + dx * w, top + w * 0.05 - len * w * 0.3, len * w * 0.75, w * 0.11, rot, col);
  }
  c.beginPath();
  c.moveTo(cx - w * 0.5, top);
  c.quadraticCurveTo(cx, top + w * 0.16, cx + w * 0.5, top);
  c.lineTo(cx + w * 0.36, bottom);
  c.lineTo(cx - w * 0.36, bottom);
  c.closePath();
  const g = c.createLinearGradient(cx - w * 0.5, 0, cx + w * 0.5, 0);
  g.addColorStop(0, '#c9182b');
  g.addColorStop(0.45, '#ef3340');
  g.addColorStop(1, '#a5101f');
  c.fillStyle = g;
  c.fill();
  // A smiley badge
  const r = w * 0.15;
  const by = top + h * 0.55;
  c.fillStyle = '#ffd23f';
  c.beginPath();
  c.arc(cx, by, r, 0, TAU);
  c.fill();
  c.strokeStyle = '#a5101f';
  c.lineWidth = r * 0.16;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(cx, by - r * 0.05, r * 0.55, 0.2 * Math.PI, 0.8 * Math.PI);
  c.stroke();
  c.fillStyle = '#a5101f';
  for (const s of [-1, 1]) {
    c.beginPath();
    c.arc(cx + s * r * 0.35, by - r * 0.3, r * 0.12, 0, TAU);
    c.fill();
  }
}

// ---------- Soda ----------

export interface Drink { color: string; amt: number; }

export interface CupOpts { lid?: number; straw?: number; level?: number; }

/** Clear plastic cup; (cx, bottom) is the base, h its height. Liquid is stacked in pours. */
export function drawCup(c: CanvasRenderingContext2D, cx: number, bottom: number, h: number, drink: readonly Drink[], t: number, o: CupOpts = {}) {
  const tw = h * 0.36, bw = h * 0.27;
  const top = bottom - h;
  const path = () => {
    c.beginPath();
    c.moveTo(cx - tw, top);
    c.lineTo(cx + tw, top);
    c.lineTo(cx + bw, bottom);
    c.lineTo(cx - bw, bottom);
    c.closePath();
  };
  const total = drink.reduce((s, d) => s + d.amt, 0);
  const scale = o.level ?? 1; // drinking lowers everything evenly
  const inner = h * 0.93;
  // Straw behind the front wall
  if (o.straw) {
    c.save();
    c.translate(cx + tw * 0.3, top + h * 0.15);
    c.rotate(0.18);
    const sl = h * 0.95;
    const y0 = -sl * 0.3 - (1 - o.straw) * sl * 0.9; // slides down into the cup
    c.fillStyle = '#ff5d8f';
    c.fillRect(-h * 0.035, y0, h * 0.07, sl);
    c.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) c.fillRect(-h * 0.035, y0 + i * sl * 0.17, h * 0.07, sl * 0.05);
    c.restore();
  }
  c.save();
  path();
  c.fillStyle = 'rgba(220,235,255,0.35)';
  c.fill();
  c.clip();
  let y = bottom;
  for (const d of drink) {
    const lh = d.amt * inner * scale;
    c.fillStyle = d.color;
    c.fillRect(cx - tw, y - lh - 1, tw * 2, lh + 1.5);
    y -= lh;
  }
  if (total * scale > 0.01) {
    // Surface foam, fizz and a soft highlight
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(cx - tw, y - 2, tw * 2, h * 0.025);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    const liquidH = bottom - y;
    for (let i = 0; i < 14; i++) {
      const by = bottom - ((t * (0.25 + (i % 4) * 0.08) + i * 0.137) % 1) * liquidH;
      c.beginPath();
      c.arc(cx + Math.sin(i * 7.3) * bw * 0.8, by, 1.5 + (i % 3), 0, TAU);
      c.fill();
    }
  }
  c.fillStyle = 'rgba(255,255,255,0.28)';
  c.fillRect(cx - tw * 0.7, top, tw * 0.18, h);
  c.restore();
  path();
  c.lineWidth = Math.max(2, h * 0.015);
  c.strokeStyle = 'rgba(120,150,190,0.8)';
  c.stroke();
  c.fillStyle = 'rgba(150,175,210,0.9)';
  roundRect(c, cx - tw - 3, top - 3, tw * 2 + 6, 7, 3);
  c.fill();
  if (o.lid) {
    const ly = top - (1 - o.lid) * h * 0.8;
    c.globalAlpha = clamp(o.lid * 2, 0, 1);
    c.fillStyle = 'rgba(235,242,250,0.95)';
    c.beginPath();
    c.moveTo(cx - tw - 5, ly + 4);
    c.quadraticCurveTo(cx, ly - h * 0.14, cx + tw + 5, ly + 4);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(120,150,190,0.8)';
    c.lineWidth = 2;
    c.stroke();
    c.globalAlpha = 1;
  }
}

// ---------- Money ----------

export const COINS = [1, 2, 5, 10, 20];
const COIN_SIZE: Record<number, number> = { 1: 0.8, 2: 0.88, 5: 0.96, 10: 0.9, 20: 1 };

export const coinRadius = (v: number, r: number) => r * COIN_SIZE[v];

function coinSprite(v: number, r: number) {
  const R = Math.round(coinRadius(v, r));
  const gold = v >= 10;
  return cached(`coin:${v}:${R}`, R * 2 + 4, R * 2 + 4, (c) => {
    const x = R + 2, y = R + 2;
    c.fillStyle = gold ? '#a8790f' : '#7d8794';
    c.beginPath();
    c.arc(x, y + 2, R, 0, TAU);
    c.fill();
    const g = c.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R);
    g.addColorStop(0, gold ? '#fff0a8' : '#ffffff');
    g.addColorStop(0.6, gold ? '#f2c230' : '#c9d1db');
    g.addColorStop(1, gold ? '#c9961c' : '#9aa5b3');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, R - 1, 0, TAU);
    c.fill();
    c.strokeStyle = gold ? 'rgba(140,95,10,0.55)' : 'rgba(80,90,105,0.45)';
    c.lineWidth = Math.max(1.5, R * 0.06);
    c.beginPath();
    c.arc(x, y, R * 0.8, 0, TAU);
    c.stroke();
    c.fillStyle = gold ? '#7a520a' : '#3f4a57';
    c.font = `900 ${R * (v >= 10 ? 0.8 : 0.95)}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(v), x, y + R * 0.05);
  });
}

export function drawCoin(c: CanvasRenderingContext2D, v: number, x: number, y: number, r: number) {
  const s = coinSprite(v, r);
  const d = Math.round(coinRadius(v, r)) * 2 + 4;
  c.drawImage(s, x - d / 2, y - d / 2, d, d);
}

/** Greedy change in our coins, biggest first. */
export function changeCoins(n: number) {
  const out: number[] = [];
  for (const v of [...COINS].reverse()) {
    while (n >= v) {
      out.push(v);
      n -= v;
    }
  }
  return out;
}

// ---------- Kitchen backdrop ----------

let tile: HTMLCanvasElement | null = null;

/** Tiled wall, an accent stripe and a steel counter from `counterY` down. Cheap to draw every frame. */
export class Kitchen {
  private wall: CanvasPattern | null = null;
  private steel: CanvasGradient | null = null;
  private front: CanvasGradient | null = null;
  constructor(private wallColor = '#fff7ec') {}
  counterY = 0;
  private W = 0;
  private H = 0;

  layout(c: CanvasRenderingContext2D, W: number, H: number, counterY: number) {
    this.W = W;
    this.H = H;
    this.counterY = counterY;
    if (!tile) {
      tile = document.createElement('canvas');
      tile.width = tile.height = 96;
      const t = tile.getContext('2d')!;
      t.fillStyle = '#e8ddd0';
      t.fillRect(0, 0, 96, 96);
      t.fillStyle = '#ffffff';
      roundRect(t, 3, 3, 90, 90, 8);
      t.fill();
      t.fillStyle = 'rgba(255,255,255,0.8)';
      t.fillRect(12, 10, 30, 6);
    }
    this.wall = c.createPattern(tile, 'repeat');
    this.wall?.setTransform?.(new DOMMatrix().scale(0.5));
    this.steel = c.createLinearGradient(0, counterY, 0, counterY + 26);
    this.steel.addColorStop(0, '#f4f7fa');
    this.steel.addColorStop(1, '#b9c3cf');
    this.front = c.createLinearGradient(0, counterY, 0, H);
    this.front.addColorStop(0, '#d7dee6');
    this.front.addColorStop(1, '#aab5c2');
  }

  draw(c: CanvasRenderingContext2D) {
    const { W, H, counterY } = this;
    c.fillStyle = this.wallColor;
    c.fillRect(0, 0, W, counterY);
    if (this.wall) {
      c.fillStyle = this.wall;
      c.globalAlpha = 0.9;
      c.fillRect(0, 0, W, counterY);
      c.globalAlpha = 1;
    }
    c.fillStyle = '#ff7b00';
    c.fillRect(0, counterY - 40, W, 16);
    c.fillStyle = shade('#ff7b00', -0.2);
    c.fillRect(0, counterY - 24, W, 4);
    c.fillStyle = this.front ?? '#ccd';
    c.fillRect(0, counterY, W, H - counterY);
    c.fillStyle = this.steel ?? '#eee';
    c.fillRect(0, counterY, W, 26);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(0, counterY + 26, W, 3);
  }
}
