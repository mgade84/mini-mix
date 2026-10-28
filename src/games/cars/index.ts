import type { GameDef } from '../../types';
import { say, sfx } from '../../engine/audio';
import { rand } from '../../engine/util';
import { L, type Lang } from '../../i18n';
import { CARS, carName, carSpoken } from './cars';
import './cars.css';

const PHOTOS = import.meta.glob<string>('./photos/*.jpg', { eager: true, import: 'default' });

const en = {
  done: 'You saw all the cars!',
  seen: (n: number) => `${n} cool cars`,
};
export const M: Record<Lang, typeof en> = {
  en,
  da: {
    done: 'Du har set alle bilerne!',
    seen: (n: number) => `${n} seje biler`,
  },
};

/** Tap a car: it zooms up, revs with speed lines, says its name, then drives off and parks again. */
export const cars: GameDef = {
  id: 'cars',
  title: { en: 'Cool Cars', da: 'Seje biler' },
  emoji: '🚙',
  color: '#ef476f',
  age: '4+',
  start(ctx) {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = document.createElement('div');
    root.className = 'cars';
    root.style.setProperty('--top', `${ctx.topInset}px`);
    root.innerHTML = `<div class="cars-grid">${CARS.map(
      (c, i) => `
      <button class="car-card" data-i="${i}" aria-label="${carName(c)}">
        <img src="${PHOTOS[`./photos/${c.id}.jpg`]}" alt="" draggable="false">
        <span class="car-name">${carName(c)}</span>
        <i class="car-star" aria-hidden="true">⭐</i>
      </button>`,
    ).join('')}</div>`;
    ctx.area.appendChild(root);

    const cards = [...root.querySelectorAll<HTMLElement>('.car-card')];
    const seen = new Set<number>();
    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    let alive = true;
    // The car currently on show; one at a time.
    let shown: { i: number; stage: HTMLElement; hero: HTMLElement; ready: boolean; leaving: boolean } | null = null;

    function show(i: number) {
      const card = cards[i];
      const box = root.getBoundingClientRect();
      const r = card.getBoundingClientRect();
      // Built at its final size (keeps the photo sharp), then animated from the card's spot.
      const s = Math.min((box.width * 0.88) / r.width, ((box.height - ctx.topInset) * 0.8) / r.height);
      const w = r.width * s;
      const h = r.height * s;
      const x = (box.width - w) / 2;
      const y = ctx.topInset + (box.height - ctx.topInset - h) / 2;
      const dx = r.left - box.left + r.width / 2 - (x + w / 2);
      const dy = r.top - box.top + r.height / 2 - (y + h / 2);

      const stage = document.createElement('div');
      stage.className = 'car-stage';
      stage.innerHTML = `
        <div class="car-dim"></div>
        <div class="car-lines"></div>
        <div class="car-hero" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">
          <div class="car-hero-card">
            <img src="${PHOTOS[`./photos/${CARS[i].id}.jpg`]}" alt="" draggable="false">
            <span class="car-name">${carName(CARS[i])}</span>
          </div>
        </div>`;
      const lines = stage.querySelector<HTMLElement>('.car-lines')!;
      for (let k = 0; k < 10; k++) {
        const l = document.createElement('i');
        l.style.cssText = `top:${rand(5, 95)}%;animation-duration:${rand(0.35, 0.6)}s;animation-delay:${-rand(0, 0.6)}s`;
        lines.appendChild(l);
      }
      root.appendChild(stage);
      card.classList.add('out');
      const hero = stage.querySelector<HTMLElement>('.car-hero')!;
      shown = { i, stage, hero, ready: false, leaving: false };
      const me = shown;

      sfx.whoosh();
      stage.querySelector('.car-dim')!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
      hero
        .animate([{ transform: `translate(${dx}px, ${dy}px) scale(${1 / s})` }, { transform: 'none' }], {
          duration: calm ? 250 : 480,
          easing: 'cubic-bezier(0.34, 1.3, 0.64, 1)',
        })
        .finished.then(() => alive && shown === me && rev(me));
    }

    function rev(me: NonNullable<typeof shown>) {
      me.ready = true;
      say(L(carSpoken(CARS[me.i])));
      me.hero.querySelector('.car-name')!.animate(
        [
          { transform: 'scale(0.3)', opacity: 0 },
          { transform: 'scale(1.15)', opacity: 1, offset: 0.7 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 450, easing: 'ease-out' },
      );
      if (!calm) {
        sfx.vroom();
        me.stage.querySelector('.car-lines')!.classList.add('on');
        // Rumble while the engine revs.
        me.hero.querySelector('.car-hero-card')!.animate(
          [
            { transform: 'none' },
            { transform: 'translate(-3px, 2px) rotate(-0.6deg)' },
            { transform: 'translate(3px, -1px) rotate(0.5deg)' },
            { transform: 'none' },
          ],
          { duration: 110, iterations: 10, delay: 550 },
        );
      }
      later(2400, () => driveOff(me));
    }

    function driveOff(me: NonNullable<typeof shown>) {
      if (!me.ready || me.leaving || !alive) return;
      me.leaving = true;
      const width = root.getBoundingClientRect().width;
      sfx.whoosh();
      me.stage.querySelector('.car-dim')!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' });
      const away = calm
        ? me.hero.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' })
        : me.hero.animate(
            [
              { transform: 'none' },
              { transform: 'translateX(-4%) skewX(6deg)', offset: 0.25 },
              { transform: `translateX(${width}px) skewX(-14deg)` },
            ],
            { duration: 650, easing: 'cubic-bezier(0.5, 0, 0.9, 0.4)', fill: 'forwards' },
          );
      away.finished.then(() => {
        if (!alive) return;
        me.stage.remove();
        shown = null;
        park(me.i);
      });
    }

    /** The car comes back into its spot; first visits earn a star. */
    function park(i: number) {
      const card = cards[i];
      card.classList.remove('out');
      card.animate(
        [
          { transform: 'translateX(-40%) scale(0.6)', opacity: 0 },
          { transform: 'scale(1.06)', opacity: 1, offset: 0.7 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: calm ? 200 : 450, easing: 'ease-out' },
      );
      if (seen.has(i)) return;
      seen.add(i);
      card.classList.add('seen');
      sfx.pop(1.2);
      ctx.addStars(1);
      if (seen.size < CARS.length) return;
      later(700, async () => {
        await ctx.celebrate(L(M).done, L(M).seen(CARS.length), 5);
        if (!alive) return;
        seen.clear();
        cards.forEach((c) => c.classList.remove('seen'));
      });
    }

    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (shown) {
        if (t.closest('.car-stage')) driveOff(shown); // tap again to send it off sooner
        return;
      }
      const card = t.closest<HTMLElement>('.car-card');
      if (card) show(Number(card.dataset.i));
    });

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      root.remove();
    };
  },
};
