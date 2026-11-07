/**
 * Procedural hotdog art, seen from the front and a little above. A hotdog is
 * drawn back to front: the bun's back with its soft inside, the sausage, the
 * toppings, then the bun's front lip. Every part is a cached sprite in "bun
 * lengths" (u) around the bun's bottom center, so a frame is a few drawImage calls.
 */
import { cached } from '../../engine/sprites';
import { clamp, lerp, roundRect, shade, TAU } from '../../engine/util';

export type Bread = 'classic' | 'wholegrain' | 'sesame' | 'pretzel';
export type Sausage = 'red' | 'wiener' | 'grill' | 'cheese' | 'veggie';
export type Topping = 'ketchup' | 'mustard' | 'remoulade' | 'crispy' | 'onion' | 'pickles';

export const BREADS: Bread[] = ['classic', 'wholegrain', 'sesame', 'pretzel'];
export const SAUSAGES: Sausage[] = ['red', 'wiener', 'grill', 'cheese', 'veggie'];
export const TOPPINGS: Topping[] = ['ketchup', 'mustard', 'remoulade', 'crispy', 'onion', 'pickles'];

export const isSauce = (t: Topping) => t === 'ketchup' || t === 'mustard' || t === 'remoulade';

export interface Dog {
  bread: Bread;
  sausage: Sausage;
  /** Doneness: 0 raw, 1 perfect, up to 1.6 dark. */
  cook: number;
  toppings: Topping[];
}

/** Main color of each topping, for splashes. */
export const TINT: Record<Topping, string> = {
  ketchup: '#d0101f', mustard: '#e9a800', remoulade: '#efe0a0', crispy: '#b8692a', onion: '#f6f1e1', pickles: '#7a9a3a',
};

/** Crust light, crust dark and the soft inside. */
const CRUST: Record<Bread, [string, string, string]> = {
  classic: ['#f4b96e', '#c4712c', '#fbe6c0'],
  wholegrain: ['#b98550', '#7a4f2a', '#ead2a6'],
  sesame: ['#f0b267', '#bf6c28', '#fbe6c0'],
  pretzel: ['#a8592a', '#5a2a10', '#f1d6a8'],
};

/** Raw and perfectly cooked color of each sausage. */
const MEAT: Record<Sausage, [string, string]> = {
  red: ['#f37a8a', '#d7263d'],
  wiener: ['#efc3a0', '#c97c4a'],
  grill: ['#e2b393', '#98522c'],
  cheese: ['#e9be98', '#b9692f'],
  veggie: ['#ecd3a8', '#c9914f'],
};

/** Height of the sausage's center above the bun's base. */
export const SAUSAGE_Y = -0.2;
/** Tallest a dressed hotdog gets, and its widest point (the sausage ends). */
export const DOG_H = 0.34;
export const DOG_W = 1.2;

const sausageLen = (s: Sausage) => (s === 'red' ? 1.18 : 1.1);
const sausageThick = (s: Sausage) => (s === 'grill' ? 0.18 : s === 'red' ? 0.15 : 0.165);

/** A stable 0..1 value per integer, so scattered bits stay where they are. */
const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Blends two '#rrggbb' colors. */
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t));
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

export function sausageColor(s: Sausage, level: number) {
  const [raw, done] = MEAT[s];
  if (level <= 1) return mix(raw, done, clamp(level, 0, 1));
  return mix(done, shade(done, -0.4), clamp((level - 1) / 0.6, 0, 1));
}

function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
}

/** Seeds, oats or salt on a band of crust between y0 and y1. */
function decorate(c: CanvasRenderingContext2D, b: Bread, u: number, x0: number, x1: number, y0: number, y1: number, seed: number) {
  const n = b === 'classic' ? 0 : 16;
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, hash(seed + i)) * u;
    const y = lerp(y0, y1, hash(seed + i * 7 + 3)) * u;
    const rot = hash(seed + i * 13) * TAU;
    if (b === 'sesame') {
      ellipse(c, x, y, 0.014 * u, 0.007 * u, rot);
      c.fillStyle = '#fff4d6';
      c.fill();
    } else if (b === 'wholegrain') {
      ellipse(c, x, y, 0.016 * u, 0.009 * u, rot);
      c.fillStyle = i % 3 ? '#e4c08a' : '#4a2e17';
      c.fill();
    } else {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.fillStyle = '#fbfbf6';
      c.fillRect(-0.007 * u, -0.007 * u, 0.014 * u, 0.014 * u);
      c.restore();
    }
  }
}

function drawBunBack(c: CanvasRenderingContext2D, b: Bread, u: number) {
  const [lt, dk, crumb] = CRUST[b];
  roundRect(c, -0.5 * u, -0.32 * u, u, 0.32 * u, 0.16 * u);
  const g = c.createLinearGradient(0, -0.32 * u, 0, 0);
  g.addColorStop(0, lt);
  g.addColorStop(1, dk);
  c.fillStyle = g;
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.2)';
  roundRect(c, -0.36 * u, -0.31 * u, 0.72 * u, 0.024 * u, 0.012 * u);
  c.fill();
  decorate(c, b, u, -0.4, 0.4, -0.305, -0.28, 0);
  // The opened, soft inside
  roundRect(c, -0.46 * u, -0.272 * u, 0.92 * u, 0.13 * u, 0.065 * u);
  c.fillStyle = crumb;
  c.fill();
  c.fillStyle = 'rgba(150,90,30,0.14)';
  roundRect(c, -0.44 * u, -0.272 * u, 0.88 * u, 0.035 * u, 0.0175 * u);
  c.fill();
}

function drawBunFront(c: CanvasRenderingContext2D, b: Bread, u: number) {
  const [lt, dk] = CRUST[b];
  roundRect(c, -0.49 * u, -0.16 * u, 0.98 * u, 0.16 * u, 0.08 * u);
  const g = c.createLinearGradient(0, -0.16 * u, 0, 0);
  g.addColorStop(0, lt);
  g.addColorStop(1, dk);
  c.fillStyle = g;
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.24)';
  roundRect(c, -0.4 * u, -0.15 * u, 0.8 * u, 0.026 * u, 0.013 * u);
  c.fill();
  decorate(c, b, u, -0.42, 0.42, -0.125, -0.04, 100);
}

/** A sausage centered at (0, cy). Grill marks show once it starts to cook. */
function drawSausage(c: CanvasRenderingContext2D, s: Sausage, level: number, u: number, cy: number) {
  const L = sausageLen(s) * u, T = sausageThick(s) * u;
  const col = sausageColor(s, level);
  roundRect(c, -L / 2, cy - T / 2, L, T, T / 2);
  const g = c.createLinearGradient(0, cy - T / 2, 0, cy + T / 2);
  g.addColorStop(0, shade(col, 0.22));
  g.addColorStop(0.4, col);
  g.addColorStop(1, shade(col, -0.32));
  c.fillStyle = g;
  c.fill();
  // Twisted ends
  c.fillStyle = shade(col, -0.35);
  for (const side of [-1, 1]) {
    ellipse(c, side * (L / 2 - T * 0.1), cy, T * 0.1, T * 0.2);
    c.fill();
  }
  if (s === 'cheese') {
    c.fillStyle = '#ffd23f';
    for (let i = 0; i < 8; i++) {
      ellipse(c, lerp(-0.42, 0.42, hash(40 + i)) * L, cy + (hash(60 + i) - 0.5) * T * 0.5, T * 0.13, T * 0.08);
      c.fill();
    }
  } else if (s === 'veggie') {
    c.fillStyle = '#4f9a3a';
    for (let i = 0; i < 22; i++) {
      ellipse(c, lerp(-0.45, 0.45, hash(80 + i)) * L, cy + (hash(110 + i) - 0.5) * T * 0.6, T * 0.04, T * 0.03);
      c.fill();
    }
  }
  const marks = clamp((level - 0.55) * 1.6, 0, 0.7);
  if (marks > 0) {
    c.strokeStyle = `rgba(55,22,8,${marks})`;
    c.lineWidth = T * 0.13;
    c.lineCap = 'round';
    const n = s === 'grill' ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const x = lerp(-0.36, 0.36, i / (n - 1)) * L;
      c.beginPath();
      c.moveTo(x - T * 0.22, cy + T * 0.3);
      c.lineTo(x + T * 0.22, cy - T * 0.3);
      c.stroke();
    }
  }
  c.strokeStyle = 'rgba(255,255,255,0.38)';
  c.lineWidth = T * 0.12;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-L / 2 + T * 0.7, cy - T * 0.27);
  c.lineTo(L / 2 - T * 0.7, cy - T * 0.27);
  c.stroke();
}

function sauce(c: CanvasRenderingContext2D, color: string, variant: number, u: number) {
  const waves = 4.5 + variant * 1.5;
  const phase = variant * 1.9;
  const lift = -variant * 0.008;
  const path = (dy: number) => {
    c.beginPath();
    for (let i = 0; i <= 64; i++) {
      const k = i / 64;
      c.lineTo(lerp(-0.44, 0.44, k) * u, (-0.24 + lift + dy + Math.sin(k * waves * TAU + phase) * 0.028) * u);
    }
  };
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = shade(color, -0.25);
  c.lineWidth = 0.04 * u;
  path(0.006);
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = 0.031 * u;
  path(0);
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.45)';
  c.lineWidth = 0.007 * u;
  path(-0.005);
  c.stroke();
}

/** One crispy onion, onion cube or pickle slice at (x, y); s is its size. */
function piece(c: CanvasRenderingContext2D, t: Topping, x: number, y: number, s: number, i: number) {
  const rot = hash(i * 3 + 1) * TAU;
  if (t === 'crispy') {
    ellipse(c, x, y, s * 0.9, s * 0.55, rot);
    c.fillStyle = ['#a65a1f', '#cf8a3e', '#7e3f12'][i % 3];
    c.fill();
  } else if (t === 'onion') {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.fillStyle = '#fbf7ea';
    c.strokeStyle = '#d6ccb4';
    c.lineWidth = s * 0.15;
    c.fillRect(-s * 0.55, -s * 0.55, s * 1.1, s * 1.1);
    c.strokeRect(-s * 0.55, -s * 0.55, s * 1.1, s * 1.1);
    c.restore();
  } else {
    const r = rot * 0.1 - 0.3;
    ellipse(c, x, y, s * 2.4, s * 1.05, r);
    c.fillStyle = '#5b7a26';
    c.fill();
    ellipse(c, x, y, s * 1.9, s * 0.75, r);
    c.fillStyle = '#b9c96a';
    c.fill();
    c.fillStyle = '#eef3c8';
    for (let k = 0; k < 3; k++) {
      ellipse(c, x + (k - 1) * s * 0.7, y, s * 0.18, s * 0.12);
      c.fill();
    }
  }
}

function drawTopping(c: CanvasRenderingContext2D, t: Topping, variant: number, u: number) {
  if (isSauce(t)) {
    sauce(c, TINT[t], variant, u);
    return;
  }
  const seed = variant * 50 + (t === 'crispy' ? 0 : t === 'onion' ? 300 : 600);
  const n = t === 'pickles' ? 7 : 24;
  for (let i = 0; i < n; i++) {
    const x = (t === 'pickles' ? lerp(-0.38, 0.38, (i + hash(seed + i) * 0.5) / n) : lerp(-0.42, 0.42, hash(seed + i))) * u;
    const y = (-0.26 - variant * 0.008 + (hash(seed + i * 5 + 2) - 0.5) * 0.05) * u;
    piece(c, t, x, y, (t === 'pickles' ? 0.024 : 0.018) * u, seed + i);
  }
}

// ---------- Sprites ----------

const SPR_W = 1.4;
const SPR_UP = 0.42;
const SPR_DOWN = 0.08;
const bucket = (w: number) => Math.max(16, Math.round(w / 8) * 8);

function part(key: string, w: number, draw: (c: CanvasRenderingContext2D, u: number) => void) {
  const u = bucket(w);
  return cached(`hotdog:${key}:${u}`, u * SPR_W, u * (SPR_UP + SPR_DOWN), (c) => {
    c.translate(u * SPR_W * 0.5, u * SPR_UP);
    draw(c, u);
  });
}

function blit(c: CanvasRenderingContext2D, spr: HTMLCanvasElement, cx: number, base: number, w: number) {
  c.drawImage(spr, cx - w * SPR_W * 0.5, base - w * SPR_UP, w * SPR_W, w * (SPR_UP + SPR_DOWN));
}

export const blitBunBack = (c: CanvasRenderingContext2D, b: Bread, cx: number, base: number, w: number) =>
  blit(c, part(`back:${b}`, w, (g, u) => drawBunBack(g, b, u)), cx, base, w);

export const blitBunFront = (c: CanvasRenderingContext2D, b: Bread, cx: number, base: number, w: number) =>
  blit(c, part(`front:${b}`, w, (g, u) => drawBunFront(g, b, u)), cx, base, w);

/** The sausage as it lies in a bun standing on `base`. */
export function blitSausage(c: CanvasRenderingContext2D, s: Sausage, level: number, cx: number, base: number, w: number) {
  const lv = Math.round(clamp(level, 0, 1.6) * 20) / 20;
  blit(c, part(`sausage:${s}:${lv}`, w, (g, u) => drawSausage(g, s, lv, u, SAUSAGE_Y * u)), cx, base, w);
}

/** A loose sausage centered at (cx, cy), w being the bun length it belongs to. */
export const blitSausageAt = (c: CanvasRenderingContext2D, s: Sausage, level: number, cx: number, cy: number, w: number) =>
  blitSausage(c, s, level, cx, cy - SAUSAGE_Y * w, w);

export const blitTopping = (c: CanvasRenderingContext2D, t: Topping, variant: number, cx: number, base: number, w: number) =>
  blit(c, part(`top:${t}:${variant % 3}`, w, (g, u) => drawTopping(g, t, variant % 3, u)), cx, base, w);

/** A whole hotdog standing on `base`; w is the bun length. */
export function drawHotdog(c: CanvasRenderingContext2D, d: Dog, cx: number, base: number, w: number) {
  blitBunBack(c, d.bread, cx, base, w);
  blitSausage(c, d.sausage, d.cook, cx, base, w);
  d.toppings.forEach((t, i) => blitTopping(c, t, i, cx, base, w));
  blitBunFront(c, d.bread, cx, base, w);
}

/** A squeeze bottle or a bowl of toppings, centered at (x, y), about `s` tall. */
export function drawBinIcon(c: CanvasRenderingContext2D, t: Topping, x: number, y: number, s: number) {
  const size = bucket(s);
  const spr = cached(`hotdog:icon:${t}:${size}`, size, size, (g) => {
    const m = size / 2;
    if (isSauce(t)) {
      const col = TINT[t];
      g.fillStyle = shade(col, -0.2);
      g.beginPath();
      g.moveTo(m - size * 0.04, size * 0.04);
      g.lineTo(m + size * 0.04, size * 0.04);
      g.lineTo(m + size * 0.08, size * 0.2);
      g.lineTo(m - size * 0.08, size * 0.2);
      g.closePath();
      g.fill();
      roundRect(g, m - size * 0.16, size * 0.18, size * 0.32, size * 0.12, size * 0.04);
      g.fillStyle = t === 'ketchup' ? '#f4f4f4' : '#d0101f';
      g.fill();
      roundRect(g, m - size * 0.22, size * 0.28, size * 0.44, size * 0.68, size * 0.12);
      g.fillStyle = col;
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(g, m - size * 0.15, size * 0.34, size * 0.07, size * 0.5, size * 0.035);
      g.fill();
      return;
    }
    // A bowl with a heap
    for (let i = 0; i < 18; i++) {
      const a = hash(900 + i) * Math.PI;
      const r = Math.sqrt(hash(950 + i)) * size * 0.32;
      piece(g, t, m + Math.cos(a) * r, size * 0.6 - Math.sin(a) * r * 0.7, size * (t === 'pickles' ? 0.06 : 0.07), i);
    }
    g.beginPath();
    g.moveTo(m - size * 0.44, size * 0.6);
    g.quadraticCurveTo(m, size * 1.05, m + size * 0.44, size * 0.6);
    g.closePath();
    g.fillStyle = '#4cc9f0';
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(m - size * 0.44, size * 0.6, size * 0.88, size * 0.04);
  });
  c.drawImage(spr, x - s / 2, y - s / 2, s, s);
}
