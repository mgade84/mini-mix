/** A red apple, apple slices and the bowl they are served in. */
import { cached } from '../../engine/sprites';
import { TAU } from '../../engine/util';

export const FLESH = '#fff1c9';
const SKIN = '#d62828';

/** The apple's outline, centered at the origin, r being about its radius. */
export function applePath(c: CanvasRenderingContext2D, r: number) {
  c.beginPath();
  c.moveTo(0, -0.72 * r);
  c.bezierCurveTo(-0.45 * r, -1.02 * r, -1.04 * r, -0.85 * r, -1.0 * r, -0.12 * r);
  c.bezierCurveTo(-0.96 * r, 0.6 * r, -0.45 * r, 0.98 * r, 0, 0.84 * r);
  c.bezierCurveTo(0.45 * r, 0.98 * r, 0.96 * r, 0.6 * r, 1.0 * r, -0.12 * r);
  c.bezierCurveTo(1.04 * r, -0.85 * r, 0.45 * r, -1.02 * r, 0, -0.72 * r);
  c.closePath();
}

function drawApple(c: CanvasRenderingContext2D, r: number) {
  // Stem and leaf behind the top
  c.strokeStyle = '#6b3a1f';
  c.lineWidth = r * 0.09;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(0, -0.7 * r);
  c.quadraticCurveTo(0.02 * r, -0.95 * r, 0.12 * r, -1.12 * r);
  c.stroke();
  c.fillStyle = '#4caf50';
  c.beginPath();
  c.ellipse(0.34 * r, -1.0 * r, 0.26 * r, 0.12 * r, -0.45, 0, TAU);
  c.fill();
  applePath(c, r);
  const g = c.createRadialGradient(-0.35 * r, -0.35 * r, r * 0.1, 0, 0, r * 1.05);
  g.addColorStop(0, '#ff6b6b');
  g.addColorStop(0.6, SKIN);
  g.addColorStop(1, '#8d0f16');
  c.fillStyle = g;
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.beginPath();
  c.ellipse(-0.45 * r, -0.4 * r, 0.16 * r, 0.26 * r, 0.5, 0, TAU);
  c.fill();
}

/** The whole apple centered at (x, y). */
export function blitApple(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const rb = Math.max(16, Math.round(r / 8) * 8);
  const spr = cached(`hotdog:apple:${rb}`, rb * 2.2, rb * 2.4, (g) => {
    g.translate(rb * 1.1, rb * 1.3);
    drawApple(g, rb);
  });
  c.drawImage(spr, x - r * 1.1, y - r * 1.3, r * 2.2, r * 2.4);
}

/** One apple slice lying on its skin, centered at (x, y), w wide. */
export function drawSlice(c: CanvasRenderingContext2D, x: number, y: number, w: number, rot: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.beginPath();
  c.ellipse(0, 0, w / 2, w * 0.3, 0, 0, Math.PI);
  c.closePath();
  c.fillStyle = FLESH;
  c.fill();
  c.strokeStyle = SKIN;
  c.lineWidth = w * 0.1;
  c.beginPath();
  c.ellipse(0, 0, w / 2, w * 0.3, 0, 0.08, Math.PI - 0.08);
  c.stroke();
  c.fillStyle = '#5a3216';
  for (const dx of [-0.08, 0.08]) {
    c.beginPath();
    c.ellipse(dx * w, w * 0.07, w * 0.035, w * 0.06, dx * 4, 0, TAU);
    c.fill();
  }
  c.restore();
}

/** Where each slice rests in the bowl, as [x, y, rotation] in bowl widths. */
const IN_BOWL: [number, number, number][] = [[-0.22, -0.14, -0.4], [0.2, -0.15, 0.35], [-0.05, -0.2, -0.1], [0.06, -0.08, 0.15]];

/** A bowl with `n` apple slices, standing on (x, base), w wide. */
export function drawBowl(c: CanvasRenderingContext2D, x: number, base: number, w: number, n: number) {
  c.fillStyle = 'rgba(0,0,0,0.12)';
  c.beginPath();
  c.ellipse(x, base + 2, w * 0.36, w * 0.06, 0, 0, TAU);
  c.fill();
  const rim = base - w * 0.34;
  c.fillStyle = '#2a9fc9';
  c.beginPath();
  c.ellipse(x, rim, w / 2, w * 0.1, 0, 0, TAU);
  c.fill();
  for (let i = 0; i < Math.min(n, IN_BOWL.length); i++) {
    const [dx, dy, rot] = IN_BOWL[i];
    drawSlice(c, x + dx * w, rim + dy * w + w * 0.08, w * 0.42, rot);
  }
  c.beginPath();
  c.moveTo(x - w / 2, rim);
  // Control points below the base put the curve's lowest point right on it
  c.bezierCurveTo(x - w * 0.48, base + w * 0.11, x + w * 0.48, base + w * 0.11, x + w / 2, rim);
  c.ellipse(x, rim, w / 2, w * 0.1, 0, 0, Math.PI);
  c.closePath();
  c.fillStyle = '#4cc9f0';
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.beginPath();
  c.ellipse(x - w * 0.22, rim + w * 0.12, w * 0.08, w * 0.04, -0.3, 0, TAU);
  c.fill();
}

/** Where slice i lands in a bowl standing on (x, base), w wide. */
export function bowlSlot(i: number, x: number, base: number, w: number) {
  const [dx, dy] = IN_BOWL[i % IN_BOWL.length];
  return { x: x + dx * w, y: base - w * 0.34 + dy * w + w * 0.08 };
}
