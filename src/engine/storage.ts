const PREFIX = 'minimix:';
const OLD_PREFIX = 'playland:'; // the app's previous name

// One-time move of settings and stars saved under the old name.
try {
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith(OLD_PREFIX)) continue;
    const key = PREFIX + k.slice(OLD_PREFIX.length);
    if (localStorage.getItem(key) === null) localStorage.setItem(key, localStorage.getItem(k)!);
    localStorage.removeItem(k);
  }
} catch {
  /* storage unavailable: nothing to move */
}

export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* private mode / storage full: not critical */
  }
}

export const getTotalStars = () => load('stars', 0);
export const addTotalStars = (n: number) => save('stars', getTotalStars() + n);
export const resetTotalStars = () => save('stars', 0);

/** Grown-up setting: show the save/share button in Paint. */
export const getPaintSave = () => load('paintSave', true);
export const setPaintSave = (on: boolean) => save('paintSave', on);
