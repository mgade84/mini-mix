import type { GameContext } from '../../types';
import type { Stage } from '../../engine/stage';
import type { Particles } from '../../engine/particles';
import { clamp, FONT, roundRect, shade, type Timers } from '../../engine/util';
import { type Drink, drawBurger, drawCarton, drawCup, type Layer, plate, stackHeight } from './art';

/** Everything the child has made so far. */
export interface Meal {
  layers: Layer[]; // the finished burger, bottom bun first
  burger: boolean;
  fries: boolean;
  soda: boolean;
  fryLevel: number;
  drink: Drink[];
  price: number;
}

export const newMeal = (): Meal => ({
  layers: [], burger: false, fries: false, soda: false, fryLevel: 1, drink: [], price: 10,
});

export type SceneName = 'hub' | 'burger' | 'fries' | 'soda' | 'price' | 'pay' | 'eat';

export interface Env {
  stage: Stage;
  fx: Particles;
  timers: Timers;
  ctx: GameContext;
  readonly meal: Meal;
  go(name: SceneName): void;
  restart(): void;
}

export interface Scene {
  layout(W: number, H: number): void;
  update(dt: number, t: number): void;
  draw(c: CanvasRenderingContext2D, t: number): void;
  down?(x: number, y: number, id: number): void;
  move?(x: number, y: number, id: number): void;
  up?(x: number, y: number, id: number): void;
  dispose?(): void;
}

/** A chunky canvas button, styled like the ones in Count It!. */
export class Btn {
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  press = 0;
  shake = 0;
  visible = true;
  enabled = true;
  pulse = false;
  constructor(public label: string, public color: string) {}

  place(x: number, y: number, w: number, h: number) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    return this;
  }

  hit(px: number, py: number) {
    return this.visible && Math.abs(px - this.x) < this.w / 2 + 6 && Math.abs(py - this.y) < this.h / 2 + 6;
  }

  draw(c: CanvasRenderingContext2D, dt: number, t: number) {
    if (!this.visible) return;
    this.press = Math.max(0, this.press - dt * 4);
    this.shake = Math.max(0, this.shake - dt * 2);
    const s = this.pulse && this.enabled ? 1 + Math.sin(t * 6) * 0.04 : 1;
    const w = this.w * s, h = this.h * s;
    const x = this.x - w / 2 + Math.sin(this.shake * 30) * this.shake * 10;
    const y = this.y - h / 2;
    const py = this.press * 5;
    const col = this.enabled ? this.color : '#b8bec8';
    const r = Math.min(h / 2, 28);
    roundRect(c, x, y + 7, w, h, r);
    c.fillStyle = shade(col, -0.3);
    c.fill();
    roundRect(c, x, y + py, w, h, r);
    c.fillStyle = col;
    c.fill();
    c.fillStyle = '#fff';
    c.font = `900 ${clamp(h * 0.42, 16, 34)}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(this.label, x + w / 2, y + py + h / 2 + 2, w - 12);
  }
}

/** White speech-bubble style instruction under the HUD. */
export function prompt(c: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number) {
  c.font = `900 ${clamp(maxW * 0.05, 20, 30)}px ${FONT}`;
  const w = Math.min(c.measureText(text).width + 40, maxW);
  const h = clamp(maxW * 0.08, 40, 52);
  roundRect(c, cx - w / 2, y - h / 2, w, h, h / 2);
  c.fillStyle = 'rgba(255,255,255,0.94)';
  c.fill();
  c.fillStyle = '#5a3a1a';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, cx, y + 1, w - 24);
}

/** Bouncy "drop in" scale for things that just appeared. */
export const squish = (s: number) => ({ sx: 1 + Math.sin(s * Math.PI) * 0.18, sy: 1 - Math.sin(s * Math.PI) * 0.22 });

export function drawTray(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  roundRect(c, x - w / 2, y - h / 2 + 6, w, h, 18);
  c.fillStyle = 'rgba(0,0,0,0.15)';
  c.fill();
  roundRect(c, x - w / 2, y - h / 2, w, h, 18);
  c.fillStyle = '#c0392b';
  c.fill();
  roundRect(c, x - w / 2 + 10, y - h / 2 + 8, w - 20, h - 18, 12);
  c.fillStyle = '#e74c3c';
  c.fill();
}

/** The finished items side by side, standing on `base`, at most `room` tall. */
export function drawMeal(c: CanvasRenderingContext2D, meal: Meal, x: number, base: number, w: number, room: number, t: number) {
  const slot = w / 3;
  if (meal.burger) {
    const sw = Math.min(slot * 0.75, room / stackHeight(meal.layers, 1));
    plate(c, x - slot, base, sw * 1.15);
    drawBurger(c, meal.layers, x - slot, base, sw);
  }
  if (meal.fries) drawCarton(c, x, base, Math.min(slot * 0.5, room * 0.8), 12, meal.fryLevel);
  if (meal.soda) drawCup(c, x + slot, base, Math.min(slot * 0.85, room * 0.75), meal.drink, t, { lid: 1, straw: 1 });
}
