/**
 * Lists every Danish phrase the games pass to say(), using the real string tables,
 * and writes public/voice/da/phrases.json ({ clipKey: text }) for generate.py.
 * When you add or change a say() call, extend the matching section below.
 * Runs in the Dockerfile's phrases stage (also via scripts/voice/build.sh).
 */
import './env';
import { writeFileSync, mkdirSync } from 'node:fs';
import { clipKey } from '../../src/engine/clipkey';
import { setLang, UI } from '../../src/i18n';
import { M as counting, THINGS } from '../../src/games/counting';
import { M as memory, ANIMALS } from '../../src/games/memory';
import { M as shapes, SHAPES } from '../../src/games/shapes';
import { M as math } from '../../src/games/math';
import { M as train, STATIONS } from '../../src/games/train';
import { M as race } from '../../src/games/race/strings';
import { M as burger, spoken } from '../../src/games/burger/strings';
import { MAX_PRICE } from '../../src/games/burger/checkout';
import { M as cars } from '../../src/games/cars';
import { CARS, carSpoken } from '../../src/games/cars/cars';
import { M as dino } from '../../src/games/dino/strings';
import { DINOS } from '../../src/games/dino/species';

setLang('da'); // some helpers, like spoken(), read the current language

const out = new Set<string>();
const add = (...texts: string[]) => texts.forEach((t) => out.add(t));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Shell: celebrate() speaks its title.
add(UI.da.greatJob, cars.da.done, counting.da.done, memory.da.done, shapes.da.done, math.da.done, train.da.done, burger.da.end);

// Count It!: the question, each number as it is counted (max 10 items), the answer.
for (const [, w] of THINGS) {
  add(counting.da.ask(w.da[1]));
  for (const n of range(1, 10)) add(counting.da.yes(n, w.da[n === 1 ? 0 : 1]));
}
add(...range(1, 10).map(String), counting.da.together);

add(...ANIMALS.map(([, name]) => name.da));
add(...SHAPES.map((s) => s.name.da), ...shapes.da.praise);
add(...math.da.praise);

// Train: arriving with cargo says the station; loading prefixes the welcome or the station.
const t = train.da;
add(t.loadFirst, t.waitDelivery, t.allAboard, t.welcome + t.loadCargo, t.loadCargo);
for (const st of STATIONS) add(`${st.name.da}!`, `${st.name.da}! ${t.loadCargo}`);

add(...CARS.map((c) => carSpoken(c).da));

// Dino World: picker, dinosaur names, the cage escape, freeing the others and the finale.
add(dino.da.pick, dino.da.escapeHint, dino.da.escaped, dino.da.done, ...DINOS.map((d) => d.name.da));
add(...DINOS.map((d) => dino.da.freed(d.name.da)));
add(dino.da.flyHint);

add(race.da.win, ...range(2, 4).map(race.da.finished)); // 1st place says win

// Burger Diner. Coins are 1–20, so the running total stays below the price and change is at most 19.
const b = burger.da;
add(b.build, b.burgerDone, b.full, ...Object.values(b.ings));
add(b.pour, b.cupFull, b.sodaDone, b.ready, b.hubAsk);
add(b.slice, b.fry, b.notYet, b.extraCrispy, b.friesDone, b.lift);
add(b.eat, b.burgerGone, b.friesGone, b.sodaGone, ...b.yum);
add(b.price, b.thanks);
for (const n of range(1, MAX_PRICE)) add(spoken(n), b.pay(n), String(n));
for (const n of range(1, 19)) add(b.change(n));

const table: Record<string, string> = {};
for (const text of [...out].sort()) {
  const key = clipKey(text);
  if (table[key] && table[key] !== text) throw new Error(`clipKey collision: "${table[key]}" / "${text}"`);
  table[key] = text;
}
mkdirSync('public/voice/da', { recursive: true });
writeFileSync('public/voice/da/phrases.json', JSON.stringify(table, null, 1) + '\n');
console.log(`${Object.keys(table).length} Danish phrases`);
