import type { GameDef } from '../../types';
import { Stage } from '../../engine/stage';
import { Particles } from '../../engine/particles';
import { Timers } from '../../engine/util';
import { type Env, type Meal, newMeal, type Scene, type SceneName } from './core';
import { hubScene } from './hub';
import { buildScene } from './build';
import { friesScene } from './fries';
import { sodaScene } from './soda';
import { payScene, priceScene } from './checkout';
import { eatScene } from './eat';

const SCENES: Record<SceneName, (env: Env) => Scene> = {
  hub: hubScene,
  burger: buildScene,
  fries: friesScene,
  soda: sodaScene,
  price: priceScene,
  pay: payScene,
  eat: eatScene,
};

export const burger: GameDef = {
  id: 'burger',
  title: { en: 'Burger Diner', da: 'Burgerbaren' },
  emoji: '🍔',
  color: '#ff7b00',
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
