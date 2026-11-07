/**
 * Glass bottles with crown caps, a bottle opener and a drinking glass.
 * Bottles are drawn standing with their base center at the origin, h tall.
 */
import { cached } from '../../engine/sprites';
import { clamp, roundRect, shade, TAU } from '../../engine/util';

export type DrinkKind = 'choco' | 'cola' | 'orange';
export const DRINKS: DrinkKind[] = ['choco', 'cola', 'orange'];

export const LIQUID: Record<DrinkKind, string> = { choco: '#8a5230', cola: '#3b1d0f', orange: '#ff9f1c' };
const CAP: Record<DrinkKind, string> = { choco: '#2b7bd6', cola: '#d62828', orange: '#f77f00' };
const LABEL: Record<DrinkKind, [string, string]> = {
  choco: ['#fff3d6', '#2b7bd6'], cola: ['#d62828', '#ffffff'], orange: ['#ffe066', '#f77f00'],
};
/** Cola comes in greenish glass, the others in clear glass. */
const GLASS: Record<DrinkKind, string> = {
  choco: 'rgba(225,238,246,0.45)', cola: 'rgba(170,215,190,0.5)', orange: 'rgba(225,238,246,0.45)',
};

/** Neck top (where the drink comes out) and cap height, in bottle heights. */
export const MOUTH = 0.955;
const BODY_W = 0.17, NECK_W = 0.058;

function bottlePath(c: CanvasRenderingContext2D, h: number) {
  const bw = BODY_W * h, nw = NECK_W * h;
  c.beginPath();
  c.moveTo(-bw + h * 0.03, 0);
  c.quadraticCurveTo(-bw, 0, -bw, -h * 0.04);
  c.lineTo(-bw, -h * 0.52);
  c.bezierCurveTo(-bw, -h * 0.66, -nw, -h * 0.68, -nw, -h * 0.8);
  c.lineTo(-nw, -h * MOUTH);
  c.lineTo(nw, -h * MOUTH);
  c.lineTo(nw, -h * 0.8);
  c.bezierCurveTo(nw, -h * 0.68, bw, -h * 0.66, bw, -h * 0.52);
  c.lineTo(bw, -h * 0.04);
  c.quadraticCurveTo(bw, 0, bw - h * 0.03, 0);
  c.closePath();
}

/**
 * The drink inside a bottle that is turned by `rot`, drawn in the bottle's own frame
 * (base center at the origin). The surface stays level, so a tipped bottle's drink
 * runs to the neck. `level` is how full it is, 0..1.
 */
export function drawLiquid(c: CanvasRenderingContext2D, k: DrinkKind, h: number, level: number, rot: number) {
  if (level <= 0.01) return;
  // World "down" seen from inside the bottle
  const dx = Math.sin(rot), dy = Math.cos(rot);
  const bw = BODY_W * h, nw = NECK_W * h;
  let lo = Infinity, hi = -Infinity;
  for (const [x, y] of [[-bw, 0], [bw, 0], [-bw, -h * 0.52], [bw, -h * 0.52], [-nw, -h * MOUTH], [nw, -h * MOUTH]]) {
    const p = x * dx + y * dy;
    lo = Math.min(lo, p);
    hi = Math.max(hi, p);
  }
  const s = hi - (hi - lo) * level * 0.85;
  c.save();
  bottlePath(c, h);
  c.clip();
  // Everything below the surface line
  const qx = dx * s, qy = dy * s, tx = -dy * h * 3, ty = dx * h * 3;
  c.beginPath();
  c.moveTo(qx - tx, qy - ty);
  c.lineTo(qx + tx, qy + ty);
  c.lineTo(qx + tx + dx * h * 3, qy + ty + dy * h * 3);
  c.lineTo(qx - tx + dx * h * 3, qy - ty + dy * h * 3);
  c.closePath();
  c.fillStyle = LIQUID[k];
  c.fill();
  c.restore();
}

/** A crown cap centered on its bottom edge. */
export function drawCap(c: CanvasRenderingContext2D, k: DrinkKind, x: number, y: number, h: number, rot = 0) {
  const w = NECK_W * h * 2.5, ch = h * 0.05;
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.fillStyle = shade(CAP[k], -0.3);
  c.beginPath();
  for (let i = 0; i <= 10; i++) c.lineTo(-w / 2 + (w * i) / 10, i % 2 ? 0 : -ch * 0.25);
  c.lineTo(w / 2, -ch);
  c.lineTo(-w / 2, -ch);
  c.closePath();
  c.fill();
  roundRect(c, -w / 2, -ch * 1.05, w, ch * 0.7, ch * 0.3);
  c.fillStyle = CAP[k];
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.fillRect(-w * 0.35, -ch * 0.95, w * 0.3, ch * 0.15);
  c.restore();
}

/** The tinted glass alone, to draw under drawLiquid() and an untinted bottle. */
export function drawBottleTint(c: CanvasRenderingContext2D, k: DrinkKind, h: number) {
  bottlePath(c, h);
  c.fillStyle = GLASS[k];
  c.fill();
}

function drawBottle(c: CanvasRenderingContext2D, k: DrinkKind, h: number, level: number, capped: boolean, tint: boolean) {
  if (tint) drawBottleTint(c, k, h);
  if (level > 0.01) {
    c.save();
    bottlePath(c, h);
    c.clip();
    const top = -h * 0.82 * level;
    c.fillStyle = LIQUID[k];
    c.fillRect(-h, top, h * 2, -top + 1);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(-h, top, h * 2, h * 0.012);
    c.restore();
  }
  // Label
  const [bg, fg] = LABEL[k];
  const bw = BODY_W * h;
  c.fillStyle = bg;
  c.fillRect(-bw, -h * 0.42, bw * 2, h * 0.2);
  c.fillStyle = fg;
  if (k === 'choco') {
    for (const [x, y, r] of [[-0.35, -0.36, 0.17], [0.3, -0.27, 0.2], [0.05, -0.38, 0.1]]) {
      c.beginPath();
      c.ellipse(x * bw, y * h, r * bw, r * bw * 0.7, 0.3, 0, TAU);
      c.fill();
    }
  } else if (k === 'cola') {
    c.beginPath();
    c.moveTo(-bw, -h * 0.29);
    c.bezierCurveTo(-bw * 0.3, -h * 0.4, bw * 0.3, -h * 0.24, bw, -h * 0.35);
    c.lineTo(bw, -h * 0.31);
    c.bezierCurveTo(bw * 0.3, -h * 0.2, -bw * 0.3, -h * 0.36, -bw, -h * 0.25);
    c.fill();
  } else {
    c.beginPath();
    c.arc(0, -h * 0.32, bw * 0.45, 0, TAU);
    c.fill();
    c.fillStyle = '#38b000';
    c.beginPath();
    c.ellipse(bw * 0.25, -h * 0.4, bw * 0.18, bw * 0.08, -0.5, 0, TAU);
    c.fill();
  }
  // Glass rim and shine
  c.fillStyle = 'rgba(255,255,255,0.55)';
  roundRect(c, -NECK_W * h * 1.2, -h * MOUTH, NECK_W * h * 2.4, h * 0.025, h * 0.01);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.fillRect(-bw * 0.7, -h * 0.5, bw * 0.16, h * 0.44);
  bottlePath(c, h);
  c.strokeStyle = 'rgba(90,120,140,0.6)';
  c.lineWidth = Math.max(1.5, h * 0.008);
  c.stroke();
  if (capped) drawCap(c, k, 0, -h * (MOUTH - 0.01), h);
}

/** A bottle standing on (x, base); level is how full it is, 0..1. Without `tint` it is just label, shine and outline. */
export function blitBottle(c: CanvasRenderingContext2D, k: DrinkKind, x: number, base: number, h: number, level: number, capped: boolean, tint = true) {
  const hb = Math.max(32, Math.round(h / 8) * 8);
  const lv = Math.round(clamp(level, 0, 1) * 20) / 20;
  const spr = cached(`hotdog:bottle:${k}:${lv}:${capped ? 1 : 0}:${tint ? 1 : 0}:${hb}`, hb * 0.5, hb * 1.1, (g) => {
    g.translate(hb * 0.25, hb * 1.05);
    drawBottle(g, k, hb, lv, capped, tint);
  });
  c.drawImage(spr, x - h * 0.25, base - h * 1.05, h * 0.5, h * 1.1);
}

/**
 * Bottle opener with its ring around (0, 0), pointing along +x before `rot`.
 * `s` is the ring's radius.
 */
export function drawOpener(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  roundRect(c, s * 0.5, -s * 0.42, s * 4.2, s * 0.84, s * 0.42);
  c.fillStyle = '#e63946';
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.3)';
  roundRect(c, s * 0.9, -s * 0.3, s * 3.4, s * 0.2, s * 0.1);
  c.fill();
  c.beginPath();
  c.arc(0, 0, s, 0, TAU);
  c.arc(0, 0, s * 0.55, 0, TAU, true);
  c.fillStyle = '#adb5bd';
  c.fill('evenodd');
  c.strokeStyle = '#6c757d';
  c.lineWidth = Math.max(1.5, s * 0.08);
  c.stroke();
  c.restore();
}

/** A drinking glass standing on (x, base), h tall, filled to `level` (0..1). */
export function drawGlass(c: CanvasRenderingContext2D, k: DrinkKind | null, x: number, base: number, h: number, level: number, t: number) {
  const tw = h * 0.36, bw = h * 0.29;
  const top = base - h;
  const path = () => {
    c.beginPath();
    c.moveTo(x - tw, top);
    c.lineTo(x + tw, top);
    c.lineTo(x + bw, base);
    c.lineTo(x - bw, base);
    c.closePath();
  };
  c.fillStyle = 'rgba(0,0,0,0.1)';
  c.beginPath();
  c.ellipse(x, base + 3, bw * 1.15, h * 0.04, 0, 0, TAU);
  c.fill();
  path();
  c.fillStyle = 'rgba(225,238,250,0.45)';
  c.fill();
  if (k && level > 0.005) {
    c.save();
    path();
    c.clip();
    const inner = h * 0.9;
    const ly = base - h * 0.06 - inner * level;
    c.fillStyle = LIQUID[k];
    c.fillRect(x - tw, ly, tw * 2, base - ly);
    if (k === 'cola') {
      c.fillStyle = 'rgba(255,240,220,0.75)';
      c.fillRect(x - tw, ly - h * 0.03, tw * 2, h * 0.035);
      c.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 10; i++) {
        const by = base - ((t * (0.3 + (i % 4) * 0.08) + i * 0.137) % 1) * (base - ly);
        c.beginPath();
        c.arc(x + Math.sin(i * 7.3) * bw * 0.8, by, 1.5 + (i % 3), 0, TAU);
        c.fill();
      }
    } else {
      c.fillStyle = 'rgba(255,255,255,0.3)';
      c.fillRect(x - tw, ly, tw * 2, h * 0.015);
    }
    c.restore();
  }
  // Thick glass bottom and shine
  c.fillStyle = 'rgba(200,220,240,0.7)';
  c.fillRect(x - bw, base - h * 0.06, bw * 2, h * 0.06);
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.fillRect(x - tw * 0.72, top + h * 0.06, tw * 0.15, h * 0.8);
  path();
  c.strokeStyle = 'rgba(110,140,175,0.85)';
  c.lineWidth = Math.max(2, h * 0.015);
  c.stroke();
}
