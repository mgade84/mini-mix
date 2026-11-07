import type { GameContext } from '../../types';
import type { Stage } from '../../engine/stage';
import type { Particles } from '../../engine/particles';
import type { Timers } from '../../engine/util';
import { plate } from '../burger/art';
import { type Dog, DOG_H, DOG_W, drawHotdog } from './art';
import { type DrinkKind, drawGlass } from './drinks';
import { drawBowl } from './fruit';

export type { Scene } from '../burger/core';

/** Everything the child has made so far, plus its price. */
export interface Meal extends Dog {
  hotdog: boolean;
  drink: DrinkKind | null;
  drinkDone: boolean;
  snackDone: boolean;
  price: number;
}

export const newMeal = (): Meal => ({
  bread: 'classic', sausage: 'red', cook: 1, toppings: [], hotdog: false, drink: null, drinkDone: false, snackDone: false, price: 10,
});

export type SceneName = 'hub' | 'bread' | 'sausage' | 'grill' | 'dress' | 'drink' | 'apple' | 'price' | 'pay' | 'eat';

export interface Env {
  stage: Stage;
  fx: Particles;
  timers: Timers;
  ctx: GameContext;
  readonly meal: Meal;
  go(name: SceneName): void;
  restart(): void;
}

/** The finished items side by side, standing on `base`, at most w wide and `room` tall. */
export function drawMeal(c: CanvasRenderingContext2D, meal: Meal, x: number, base: number, w: number, room: number, t: number) {
  if (meal.hotdog) {
    const u = Math.max(40, Math.min(w * 0.34, room / (DOG_H + 0.1), (w * 0.48) / DOG_W));
    plate(c, x - w * 0.2, base, u * 1.15);
    drawHotdog(c, meal, x - w * 0.2, base, u);
  }
  if (meal.snackDone) drawBowl(c, x + w * 0.17, base, Math.max(40, Math.min(room * 0.9, w * 0.2)), 4);
  if (meal.drinkDone) drawGlass(c, meal.drink, x + w * 0.38, base, Math.max(30, Math.min(room * 0.6, w * 0.14)), 1, t);
}
