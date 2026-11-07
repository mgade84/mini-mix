import type { GameDef } from '../../types';
import { Stage } from '../../engine/stage';
import { Particles } from '../../engine/particles';
import { Timers } from '../../engine/util';
import { payScene, priceScene } from '../burger/checkout';
import { drawMeal, type Env, type Meal, newMeal, type Scene, type SceneName } from './core';
import { hubScene } from './hub';
import { pickScene } from './pick';
import { drinkScene } from './drink';
import { appleScene } from './apple';
import { grillScene } from './grill';
import { dressScene } from './dress';
import { eatScene } from './eat';

const SCENES: Record<SceneName, (env: Env) => Scene> = {
  hub: hubScene,
  bread: (env) => pickScene(env, 'bread'),
  sausage: (env) => pickScene(env, 'sausage'),
  grill: grillScene,
  dress: dressScene,
  drink: drinkScene,
  apple: appleScene,
  price: (env) => priceScene(env, (c, x, base, w, room, t) => drawMeal(c, env.meal, x, base, w, room, t), () => env.go('pay')),
  pay: (env) => payScene(env, () => env.go('eat')),
  eat: eatScene,
};

/** Make a hotdog, apple slices and a drink in any order, sell the meal and eat it. Shares the burger's checkout. */
export const hotdog: GameDef = {
  id: 'hotdog',
  title: { en: 'Hotdog House', da: 'Pølsevognen' },
  emoji: '🌭',
  color: '#e63946',
  age: '4–10',
  start(ctx) {
    const stage = new Stage(ctx.area);
    const fx = new Particles(900);
    const timers = new Timers();
    let meal: Meal = newMeal();
    let scene: Scene | null = null;
    let fade = 0;

    const env: Env = {
      stage, fx, timers, ctx,
      get meal() {
        return meal;
      },
      go,
      restart() {
        meal = newMeal();
        go('hub');
      },
    };

    function go(name: SceneName) {
      scene?.dispose?.();
      timers.clear();
      fx.clear();
      scene = SCENES[name](env);
      scene.layout(stage.width, stage.height);
      fade = 1;
    }

    stage.onResize((w, h) => scene?.layout(w, h));
    stage.on({
      down: (x, y, id) => scene?.down?.(x, y, id),
      move: (x, y, id) => scene?.move?.(x, y, id),
      up: (x, y, id) => scene?.up?.(x, y, id),
    });

    stage.start((dt, t) => {
      timers.update(dt);
      fx.update(dt);
      if (!scene) return;
      scene.update(dt, t);
      const c = stage.ctx;
      scene.draw(c, t);
      fx.draw(c, stage.dpr);
      if (fade > 0) {
        fade = Math.max(0, fade - dt * 4);
        c.fillStyle = `rgba(255,255,255,${fade})`;
        c.fillRect(0, 0, stage.width, stage.height);
      }
    });

    go('hub');

    return () => {
      scene?.dispose?.();
      timers.clear();
      stage.destroy();
    };
  },
};
