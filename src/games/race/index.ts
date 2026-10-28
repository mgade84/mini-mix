import type { GameDef } from '../../types';
import { S } from './strings';

/** Three.js is only downloaded when this game is opened. */
export const race: GameDef = {
  id: 'race',
  title: { en: 'Grand Prix', da: 'Grand Prix' },
  emoji: '🏎️',
  color: '#334155',
  age: '5+',
  start(ctx) {
    ctx.shell.classList.add('theme-real');
    const loading = document.createElement('div');
    loading.className = 'rc-loading';
    loading.textContent = S().loading;
    ctx.shell.appendChild(loading);
    let cleanup: (() => void) | null = null;
    let dead = false;
    import('./game')
      .then((m) => {
        if (dead) return;
        loading.remove();
        cleanup = m.runRace(ctx);
      })
      .catch((err) => {
        console.error(err);
        loading.textContent = S().loadFailed;
      });
    return () => {
      dead = true;
      cleanup?.();
      loading.remove();
    };
  },
};
