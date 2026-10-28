import { pick, rand, TAU } from './util';
import { starSprite } from './sprites';

export type ParticleKind = 'circle' | 'star' | 'confetti' | 'ring';

interface P {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; grow: number;
  rot: number; vr: number; g: number; drag: number;
  color: string; kind: ParticleKind;
}

export interface BurstOptions {
  count?: number;
  color?: string | readonly string[];
  speed?: number;
  size?: number;
  gravity?: number;
  drag?: number;
  /** Size change per second, e.g. for smoke puffs. */
  grow?: number;
  life?: number;
  kind?: ParticleKind;
  /** Direction (radians) and spread; default is a full circle. */
  angle?: number;
  spread?: number;
}

export const RAINBOW = ['#ff5d8f', '#ff9f1c', '#ffd166', '#80ed99', '#4cc9f0', '#b388ff'] as const;

/**
 * Fixed-size pooled particle system: no allocations after construction,
 * dead particles are swap-removed so update/draw only touch live ones.
 */
export class Particles {
  private ps: P[];
  private n = 0;

  constructor(private cap = 800) {
    this.ps = Array.from({ length: cap }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, grow: 0,
      rot: 0, vr: 0, g: 0, drag: 0, color: '#fff', kind: 'circle' as ParticleKind,
    }));
  }

  get count() {
    return this.n;
  }

  private next(): P | null {
    return this.n < this.cap ? this.ps[this.n++] : null;
  }

  burst(x: number, y: number, o: BurstOptions = {}) {
    const count = o.count ?? 16;
    const colors = o.color ?? RAINBOW;
    for (let i = 0; i < count; i++) {
      const p = this.next();
      if (!p) return;
      const a = o.spread !== undefined ? (o.angle ?? 0) + (Math.random() - 0.5) * o.spread : Math.random() * TAU;
      const sp = (o.speed ?? 200) * rand(0.35, 1);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.max = p.life = (o.life ?? 0.9) * rand(0.7, 1.2);
      p.size = (o.size ?? 6) * rand(0.6, 1.3);
      p.grow = o.grow ?? 0;
      p.color = typeof colors === 'string' ? colors : pick(colors);
      p.kind = o.kind ?? 'circle';
      p.rot = rand(0, TAU);
      p.vr = rand(-8, 8);
      p.g = o.gravity ?? 0;
      p.drag = o.drag ?? 1.5;
    }
  }

  /** An expanding outline circle, e.g. a pop shockwave. */
  ring(x: number, y: number, color: string, radius: number, life = 0.35) {
    const p = this.next();
    if (!p) return;
    p.x = x; p.y = y; p.vx = p.vy = 0; p.g = 0; p.drag = 0;
    p.max = p.life = life;
    p.size = radius * 0.6;
    p.grow = (radius * 0.9) / life;
    p.color = color;
    p.kind = 'ring';
  }

  update(dt: number) {
    const ps = this.ps;
    for (let i = 0; i < this.n; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.n--;
        ps[i] = ps[this.n];
        ps[this.n] = p;
        i--;
        continue;
      }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
    }
  }

  draw(c: CanvasRenderingContext2D, dpr: number) {
    const ps = this.ps;
    for (let i = 0; i < this.n; i++) {
      const p = ps[i];
      const t = p.life / p.max;
      c.globalAlpha = t < 0.35 ? t / 0.35 : 1;
      switch (p.kind) {
        case 'circle':
          c.fillStyle = p.color;
          c.beginPath();
          c.arc(p.x, p.y, p.size, 0, TAU);
          c.fill();
          break;
        case 'ring':
          c.globalAlpha = t;
          c.strokeStyle = p.color;
          c.lineWidth = 2 + 5 * t;
          c.beginPath();
          c.arc(p.x, p.y, p.size, 0, TAU);
          c.stroke();
          break;
        case 'star': {
          const cs = Math.cos(p.rot) * dpr, sn = Math.sin(p.rot) * dpr;
          c.setTransform(cs, sn, -sn, cs, p.x * dpr, p.y * dpr);
          c.drawImage(starSprite(p.color), -p.size, -p.size, p.size * 2, p.size * 2);
          break;
        }
        case 'confetti': {
          const cs = Math.cos(p.rot) * dpr, sn = Math.sin(p.rot) * dpr;
          c.setTransform(cs, sn, -sn, cs, p.x * dpr, p.y * dpr);
          c.fillStyle = p.color;
          const flip = Math.abs(Math.cos(p.rot * 1.7));
          c.fillRect(-p.size / 2, (-p.size / 3) * flip, p.size, (p.size / 1.5) * flip + 1);
          break;
        }
      }
    }
    c.globalAlpha = 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    this.n = 0;
  }
}
