import { noiseLoop, type NoiseLoop, say, sfx } from '../../engine/audio';
import { clamp, easeOutBack, easeOutCubic, FONT, lerp, rand, roundRect, TAU } from '../../engine/util';
import { drawCarton, fryColor, fryStick, Kitchen } from './art';
import { type Env, prompt, type Scene } from './core';
import { S } from './strings';

const CUTS = 6;
const FRY_TIME = 6; // seconds in the oil to golden
const MIN_LEVEL = 0.7;
const MAX_LEVEL = 1.6;

type Phase = 'cut' | 'pile' | 'fry' | 'serve';
interface Stroke { x: number; y: number; minY: number; maxY: number; }
interface Stick { x: number; y: number; rot: number; len: number; }

/** Slice a potato into strips, deep-fry them and box them up. */
export function friesScene(env: Env): Scene {
  const { ctx, stage, fx, timers, meal } = env;
  const kitchen = new Kitchen();
  let phase: Phase = 'cut';
  let W = 0, H = 0;

  // Cutting
  const cut = Array.from({ length: CUTS }, () => 0); // 0 = not cut, then 0..1 separation anim
  const strokes = new Map<number, Stroke>();
  let board = { x: 0, y: 0, w: 0, h: 0 };
  let pot = { x: 0, y: 0, rx: 0, ry: 0 };
  let idle = 0;
  let pileT = 0;

  // Frying
  let fryer = { x: 0, oilY: 0, w: 0, h: 0 };
  let basketY = 0; // 0 = up, 1 = in the oil
  let target = 0;
  let level = 0;
  let inOil = 0;
  let drag: { id: number; y0: number; b0: number; moved: boolean } | null = null;
  let sizzle: NoiseLoop | null = null;
  let serveT = 0;
  let saidLift = false;
  const sticks: Stick[] = [];

  say(S().slice);

  const guideX = (i: number) => pot.x - pot.rx + ((i + 1) * 2 * pot.rx) / (CUTS + 1);
  const cutsDone = () => cut.every((v) => v > 0);

  /** Horizontal offset of the strip between guides i-1 and i, spreading out from the middle. */
  function stripShift(strip: number) {
    let s = 0;
    for (let i = 0; i < CUTS; i++) {
      const gap = easeOutCubic(cut[i]) * pot.rx * 0.1;
      s += i < strip ? gap / 2 : -gap / 2;
    }
    return s;
  }

  function doCut(i: number) {
    cut[i] = 0.001;
    idle = 0;
    sfx.chop();
    fx.burst(guideX(i), pot.y, { count: 10, color: ['#fff3c4', '#f6e7a1'], speed: 220, size: 6, gravity: 500, life: 0.6 });
    if (!cutsDone()) return;
    phase = 'pile';
    sfx.good();
    ctx.addStars(1);
    timers.after(0.9, () => {
      // Strips become a pile of sticks
      fx.burst(pot.x, pot.y, { count: 30, kind: 'star', speed: 400, size: 10, gravity: 300, life: 1 });
      sfx.pop();
      pileT = 0.001;
    });
    timers.after(2.2, () => {
      phase = 'fry';
      layoutFryer();
      say(S().fry);
    });
  }

  function layoutFryer() {
    const top = ctx.topInset;
    const fw = Math.min(W * 0.62, 520);
    const counterY = H * 0.5;
    kitchen.layout(stage.ctx, W, H, counterY);
    fryer = { x: W * 0.45, oilY: Math.max(counterY + 30, top + fw * 0.55), w: fw, h: Math.min(H - counterY - 40, fw * 0.62) };
    sticks.length = 0;
    for (let i = 0; i < 14; i++) {
      sticks.push({ x: rand(-0.24, 0.24), y: rand(-0.04, 0.06), rot: rand(-0.5, 0.5) + Math.PI / 2, len: rand(0.26, 0.36) });
    }
  }

  function basketGeo() {
    const bw = fryer.w * 0.58;
    const bh = fryer.w * 0.2;
    const up = fryer.oilY - bh * 1.35;
    const down = fryer.oilY + bh * 0.25;
    const by = lerp(up, down, basketY); // basket top edge
    return { bw, bh, by, cx: fryer.x - fryer.w * 0.06 };
  }

  function lift() {
    target = 0;
    sfx.whoosh();
    if (level < MIN_LEVEL) {
      if (inOil > 0.4) say(S().notYet);
      return;
    }
    phase = 'serve';
    serveT = 0;
    sizzle?.set(0);
    meal.fryLevel = level;
    meal.fries = true;
    timers.after(0.9, () => {
      sfx.good();
      say(level > 1.3 ? S().extraCrispy : S().friesDone);
      ctx.addStars(1);
      fx.burst(W / 2, H * 0.55, { count: 40, kind: 'star', speed: 480, size: 12, gravity: 300, life: 1.2 });
    });
    timers.after(3, () => env.go('hub'));
  }

  function drawKnife(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(-s * 0.05 + 8, -s * 0.9 + 8, s * 0.12, s * 0.9);
    c.beginPath();
    c.moveTo(-s * 0.05, -s * 0.55);
    c.lineTo(s * 0.07, -s * 0.55);
    c.lineTo(s * 0.07, s * 0.05);
    c.quadraticCurveTo(s * 0.06, s * 0.15, -s * 0.05, s * 0.2);
    c.closePath();
    const g = c.createLinearGradient(-s * 0.05, 0, s * 0.07, 0);
    g.addColorStop(0, '#f5f7fa');
    g.addColorStop(1, '#9aa6b5');
    c.fillStyle = g;
    c.fill();
    roundRect(c, -s * 0.06, -s * 0.95, s * 0.14, s * 0.42, s * 0.05);
    c.fillStyle = '#3b2a1e';
    c.fill();
    c.fillStyle = '#c9b29b';
    for (const k of [0.25, 0.55, 0.8]) {
      c.beginPath();
      c.arc(s * 0.01, -s * 0.95 + s * 0.42 * k, s * 0.018, 0, TAU);
      c.fill();
    }
    c.restore();
  }

  function drawPotato(c: CanvasRenderingContext2D) {
    const shape = () => {
      c.beginPath();
      c.ellipse(0, 0, pot.rx, pot.ry, 0, 0, TAU);
    };
    for (let s = 0; s <= CUTS; s++) {
      const x0 = s === 0 ? -pot.rx - 4 : guideX(s - 1) - pot.x;
      const x1 = s === CUTS ? pot.rx + 4 : guideX(s) - pot.x;
      c.save();
      c.translate(pot.x + stripShift(s), pot.y);
      c.beginPath();
      c.rect(x0, -pot.ry - 4, x1 - x0, pot.ry * 2 + 8);
      c.clip();
      shape();
      const g = c.createRadialGradient(-pot.rx * 0.3, -pot.ry * 0.4, pot.ry * 0.1, 0, 0, pot.rx);
      g.addColorStop(0, '#e2b77a');
      g.addColorStop(1, '#a8743f');
      c.fillStyle = g;
      c.fill();
      c.fillStyle = 'rgba(90,55,25,0.45)';
      for (const [ex, ey, er] of [[-0.5, -0.2, 0.05], [0.2, 0.35, 0.04], [0.55, -0.1, 0.035], [-0.1, -0.45, 0.03], [-0.35, 0.4, 0.04], [0.7, 0.3, 0.03]]) {
        c.beginPath();
        c.arc(ex * pot.rx, ey * pot.ry, er * pot.rx, 0, TAU);
        c.fill();
      }
      // Pale cut faces on the edges that are cut
      c.fillStyle = '#fbefc0';
      if (s > 0 && cut[s - 1]) c.fillRect(x0, -pot.ry, pot.rx * 0.02, pot.ry * 2);
      if (s < CUTS && cut[s]) c.fillRect(x1 - pot.rx * 0.02, -pot.ry, pot.rx * 0.02, pot.ry * 2);
      c.restore();
    }
  }

  function drawCutStage(c: CanvasRenderingContext2D, t: number) {
    // Board
    roundRect(c, board.x - board.w / 2, board.y - board.h / 2 + 10, board.w, board.h, 26);
    c.fillStyle = '#8a5a2b';
    c.fill();
    roundRect(c, board.x - board.w / 2, board.y - board.h / 2, board.w, board.h, 26);
    c.fillStyle = '#d9a066';
    c.fill();
    c.strokeStyle = 'rgba(140,90,40,0.25)';
    c.lineWidth = 3;
    for (let i = 1; i < 6; i++) {
      c.beginPath();
      const y = board.y - board.h / 2 + (i * board.h) / 6;
      c.moveTo(board.x - board.w * 0.45, y);
      c.bezierCurveTo(board.x - board.w * 0.1, y - 8, board.x + board.w * 0.1, y + 8, board.x + board.w * 0.45, y);
      c.stroke();
    }

    if (pileT <= 0) {
      drawPotato(c);
      // Dashed guides where the knife should go
      c.setLineDash([10, 10]);
      c.lineWidth = 4;
      const next = cut.findIndex((v) => v === 0);
      for (let i = 0; i < CUTS; i++) {
        if (cut[i]) continue;
        c.strokeStyle = i === next ? `rgba(255,255,255,${0.6 + Math.sin(t * 6) * 0.3})` : 'rgba(255,255,255,0.45)';
        c.beginPath();
        c.moveTo(guideX(i), pot.y - pot.ry - 24);
        c.lineTo(guideX(i), pot.y + pot.ry + 24);
        c.stroke();
      }
      c.setLineDash([]);
      // A ghost knife shows how, when the child hesitates
      if (idle > 2.5 && next >= 0 && strokes.size === 0) {
        const k = ((idle - 2.5) % 1.6) / 1.6;
        c.globalAlpha = Math.sin(k * Math.PI) * 0.8;
        drawKnife(c, guideX(next), lerp(pot.y - pot.ry - 30, pot.y + pot.ry + 10, easeOutCubic(k)), pot.ry * 1.3);
        c.globalAlpha = 1;
      }
    } else {
      // Raw sticks in a neat pile
      const k = easeOutBack(clamp(pileT, 0, 1));
      for (let i = 0; i < 14; i++) {
        const sx = pot.x + (i - 6.5) * pot.rx * 0.13 * k + Math.sin(i * 3.1) * 6;
        fryStick(c, sx, pot.y + Math.cos(i * 1.7) * 8, pot.ry * 1.7, pot.rx * 0.1, 0.12 * Math.sin(i * 2.3) * k, '#f6e7a1');
      }
    }

    for (const s of strokes.values()) drawKnife(c, s.x, s.y, pot.ry * 1.3);
    if (phase === 'cut') {
      c.font = `800 ${clamp(W * 0.03, 16, 24)}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = 'rgba(70,45,20,0.8)';
      c.fillText(`🔪 ${S().swipe}`, board.x, board.y + board.h / 2 + 34);
    }
  }

  function drawFryStage(c: CanvasRenderingContext2D, t: number) {
    const { x, oilY, w, h } = fryer;
    const { bw, bh, by, cx } = basketGeo();
    const col = fryColor(level);
    // Fryer body and oil (back)
    roundRect(c, x - w / 2, oilY - 30, w, h + 30, 22);
    c.fillStyle = '#6b7685';
    c.fill();
    roundRect(c, x - w / 2 + 16, oilY - 14, w - 32, h - 10, 14);
    c.fillStyle = '#2f343b';
    c.fill();
    c.fillStyle = '#e0a526';
    c.fillRect(x - w / 2 + 16, oilY, w - 32, h - 24);

    // Handle, basket and fries
    c.strokeStyle = '#2b2b2b';
    c.lineWidth = 10;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(cx + bw / 2, by + 6);
    c.lineTo(cx + bw / 2 + w * 0.16, by - bh * 0.9);
    c.stroke();
    roundRect(c, cx + bw / 2 + w * 0.12, by - bh * 1.25, w * 0.09, bh * 0.55, 10);
    c.fillStyle = '#222';
    c.fill();
    for (const s of sticks) {
      fryStick(c, cx + s.x * bw * 1.4, by + bh * 0.45 + s.y * bh * 2, bh * s.len * 2.6, bh * 0.16, s.rot, col);
    }
    c.strokeStyle = '#c7ced8';
    c.lineWidth = 3;
    roundRect(c, cx - bw / 2, by, bw, bh, 10);
    c.stroke();
    c.save();
    c.clip();
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(200,210,220,0.8)';
    for (let i = 1; i < 12; i++) {
      c.beginPath();
      c.moveTo(cx - bw / 2 + (i * bw) / 12, by);
      c.lineTo(cx - bw / 2 + (i * bw) / 12, by + bh);
      c.stroke();
    }
    for (let i = 1; i < 4; i++) {
      c.beginPath();
      c.moveTo(cx - bw / 2, by + (i * bh) / 4);
      c.lineTo(cx + bw / 2, by + (i * bh) / 4);
      c.stroke();
    }
    c.restore();

    // Oil in front of the submerged part
    c.fillStyle = 'rgba(224,165,38,0.62)';
    c.fillRect(x - w / 2 + 16, oilY, w - 32, h - 24);
    c.fillStyle = 'rgba(255,230,140,0.7)';
    c.beginPath();
    for (let i = 0; i <= 30; i++) {
      const px = x - w / 2 + 16 + ((w - 32) * i) / 30;
      c.lineTo(px, oilY + Math.sin(t * (basketY > 0.6 ? 9 : 2) + i * 0.9) * (basketY > 0.6 ? 3 : 1));
    }
    c.lineTo(x + w / 2 - 16, oilY + 6);
    c.lineTo(x - w / 2 + 16, oilY + 6);
    c.fill();
    // Front lip
    roundRect(c, x - w / 2 - 6, oilY + h * 0.55, w + 12, h * 0.45, 18);
    c.fillStyle = '#8994a3';
    c.fill();
    c.fillStyle = '#ff4d4d';
    c.beginPath();
    c.arc(x - w / 2 + 40, oilY + h * 0.77, 9, 0, TAU);
    c.fill();
    c.fillStyle = '#dfe5ec';
    c.font = `900 ${clamp(w * 0.06, 16, 28)}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('🔥 180°', x, oilY + h * 0.77);

    // Doneness gauge
    const gx = Math.min(W - 40, x + w / 2 + 50);
    const gh = Math.min(h * 1.6, H * 0.38);
    const gy = oilY + h * 0.5 - gh;
    roundRect(c, gx - 22, gy - 6, 44, gh + 12, 22);
    c.fillStyle = '#fff';
    c.fill();
    const g = c.createLinearGradient(0, gy + gh, 0, gy);
    for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, fryColor((i / 8) * MAX_LEVEL));
    roundRect(c, gx - 14, gy, 28, gh, 14);
    c.fillStyle = g;
    c.fill();
    const zy = (l: number) => gy + gh - (l / MAX_LEVEL) * gh;
    c.strokeStyle = '#38b000';
    c.lineWidth = 4;
    roundRect(c, gx - 18, zy(1.25), 36, zy(0.85) - zy(1.25), 8);
    c.stroke();
    c.font = `22px ${FONT}`;
    c.fillText('⭐', gx + 36, (zy(0.85) + zy(1.25)) / 2);
    const my = zy(level);
    c.fillStyle = '#5a3a1a';
    c.beginPath();
    c.moveTo(gx - 30, my - 10);
    c.lineTo(gx - 16, my);
    c.lineTo(gx - 30, my + 10);
    c.fill();

    // Hint arrow on the basket
    if (phase === 'fry' && !drag) {
      const down = basketY < 0.5;
      if (down || level >= 0.85) {
        const ay = by - bh * 0.6 + Math.sin(t * 6) * 8;
        c.font = `${clamp(w * 0.1, 30, 52)}px ${FONT}`;
        c.fillText(down ? '⬇️' : '⬆️', cx, ay);
      }
    }
  }

  function drawServe(c: CanvasRenderingContext2D) {
    const k = easeOutBack(clamp(serveT * 1.5, 0, 1));
    const cw = Math.min(W * 0.32, 230);
    const n = Math.round(clamp((serveT - 0.4) * 14, 0, 12));
    drawCarton(c, W / 2, H * 0.55 + cw * 0.5 + (1 - k) * H * 0.5, cw, n, meal.fryLevel);
  }

  return {
    layout(w, h) {
      W = w;
      H = h;
      const top = ctx.topInset;
      kitchen.layout(stage.ctx, W, H, H * 0.36);
      const bwid = Math.min(W - 40, 720);
      board = { x: W / 2, y: Math.max(top + 70 + bwid * 0.26, H * 0.58), w: bwid, h: Math.min(bwid * 0.52, H * 0.45) };
      pot = { x: board.x, y: board.y, rx: board.w * 0.36, ry: board.h * 0.3 };
      if (phase !== 'cut' && phase !== 'pile') layoutFryer();
    },

    update(d) {
      idle += d;
      for (let i = 0; i < CUTS; i++) if (cut[i] > 0) cut[i] = Math.min(1, cut[i] + d * 4);
      if (pileT > 0) pileT += d * 2;
      if (phase === 'serve') serveT += d;
      if (phase === 'fry' || phase === 'serve') {
        if (!drag) basketY += clamp(target - basketY, -d * 3, d * 3);
        const submerged = basketY > 0.6;
        if (submerged && phase === 'fry') {
          if (inOil === 0) {
            sfx.hiss();
            sizzle ??= noiseLoop('highpass', 2600, 0.7);
          }
          inOil += d;
          level = Math.min(MAX_LEVEL, level + d / FRY_TIME);
          sizzle?.set(0.22 + Math.max(0, 0.3 - inOil * 0.15), 2400 + Math.sin(inOil * 13) * 300);
          if (!saidLift && level > 0.85) {
            saidLift = true;
            say(S().lift);
          }
          const { bw, cx } = basketGeo();
          if (Math.random() < d * 40) {
            fx.burst(cx + rand(-bw / 2, bw / 2), fryer.oilY, { count: 1, color: '#fff4c2', speed: 60, size: 5, gravity: -80, life: 0.4, angle: -Math.PI / 2, spread: 1 });
          }
          if (Math.random() < d * 6) {
            fx.burst(cx + rand(-bw / 2, bw / 2), fryer.oilY - 20, { count: 1, color: 'rgba(255,255,255,0.5)', speed: 40, size: 14, grow: 30, gravity: -120, life: 1, angle: -Math.PI / 2, spread: 0.6 });
          }
        } else {
          if (inOil > 0 && !submerged) inOil = 0;
          sizzle?.set(0);
        }
      }
    },

    draw(c, t) {
      kitchen.draw(c);
      const msg = phase === 'cut' || phase === 'pile' ? S().slice : phase === 'fry' ? (level >= 0.85 ? S().lift : S().fry) : S().friesDone;
      prompt(c, msg, W / 2, ctx.topInset + 28, W - 40);
      if (phase === 'cut' || phase === 'pile') drawCutStage(c, t);
      else if (phase === 'fry') drawFryStage(c, t);
      else {
        if (serveT < 0.5) {
          c.globalAlpha = 1 - serveT * 2;
          drawFryStage(c, t);
          c.globalAlpha = 1;
        }
        drawServe(c);
      }
    },

    down(x, y, id) {
      idle = 0;
      if (phase === 'cut') {
        strokes.set(id, { x, y, minY: y, maxY: y });
      } else if (phase === 'fry') {
        const { bw, bh, by, cx } = basketGeo();
        const onBasket = x > cx - bw / 2 - 20 && x < cx + bw / 2 + fryer.w * 0.25 && y > by - bh * 1.4 && y < by + bh + 20;
        if (onBasket) drag = { id, y0: y, b0: basketY, moved: false };
      }
    },

    move(x, y, id) {
      const s = strokes.get(id);
      if (s && phase === 'cut') {
        const crossed = (s.y - pot.y) * (y - pot.y) <= 0 && s.y !== y;
        s.minY = Math.min(s.minY, y);
        s.maxY = Math.max(s.maxY, y);
        s.x = x;
        s.y = y;
        if (crossed && s.maxY - s.minY > pot.ry * 0.5) {
          const spacing = (2 * pot.rx) / (CUTS + 1);
          let best = -1;
          for (let i = 0; i < CUTS; i++) {
            if (cut[i]) continue;
            const dx = Math.abs(guideX(i) - x);
            if (dx < spacing * 0.75 && (best < 0 || dx < Math.abs(guideX(best) - x))) best = i;
          }
          if (best >= 0) {
            s.minY = s.maxY = y; // zig-zagging keeps cutting
            doCut(best);
          }
        }
        return;
      }
      if (drag && drag.id === id) {
        const { bh } = basketGeo();
        if (Math.abs(y - drag.y0) > 8) drag.moved = true;
        basketY = clamp(drag.b0 + (y - drag.y0) / (bh * 1.6), 0, 1);
      }
    },

    up(_x, _y, id) {
      strokes.delete(id);
      if (!drag || drag.id !== id) return;
      const { moved, b0 } = drag;
      drag = null;
      const wantDown = moved ? basketY > 0.5 : b0 < 0.5;
      if (wantDown) {
        target = 1;
        if (!moved) sfx.whoosh();
      } else if (inOil > 0 || level > 0) {
        lift();
      } else {
        target = 0;
      }
    },

    dispose() {
      sizzle?.stop();
    },
  };
}
