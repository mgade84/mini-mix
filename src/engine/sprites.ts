/**
 * Offscreen sprite cache. Drawing text, gradients and paths every frame is
 * slow on mobile GPUs; blitting a pre-rendered canvas is cheap.
 */
const SCALE = 2;
const cache = new Map<string, HTMLCanvasElement>();

export function cached(
  key: string,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D, w: number, h: number) => void,
): HTMLCanvasElement {
  let cv = cache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = Math.ceil(w * SCALE);
  cv.height = Math.ceil(h * SCALE);
  const c = cv.getContext('2d')!;
  c.scale(SCALE, SCALE);
  draw(c, w, h);
  cache.set(key, cv);
  return cv;
}

export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const BOX = 1.25; // emoji glyphs overflow their font size slightly

function emojiSprite(ch: string, size: number) {
  const b = size <= 40 ? 40 : size <= 80 ? 80 : size <= 140 ? 140 : 220;
  return cached(`emoji:${ch}:${b}`, b * BOX, b * BOX, (c, w, h) => {
    c.font = `${b}px ${EMOJI_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(ch, w / 2, h / 2 + b * 0.06);
  });
}

/** Draws an emoji centered at (x, y) with the given font size. */
export function drawEmoji(c: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number) {
  const d = size * BOX;
  c.drawImage(emojiSprite(ch, size), x - d / 2, y - d / 2, d, d);
}

export function starPath(c: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points = 5) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  c.closePath();
}

export function starSprite(color: string) {
  return cached('star:' + color, 32, 32, (c) => {
    starPath(c, 16, 16, 15, 6.5);
    c.fillStyle = color;
    c.fill();
    starPath(c, 14, 14, 6, 2.6);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fill();
  });
}
