import { load, save } from './engine/storage';

export type Lang = 'en' | 'da';
export type Txt = Record<Lang, string>;

export const LANGS: { id: Lang; flag: string; label: string; speech: string }[] = [
  { id: 'en', flag: '🇬🇧', label: 'English', speech: 'en-US' },
  { id: 'da', flag: '🇩🇰', label: 'Dansk', speech: 'da-DK' },
];

const deviceLang: Lang = navigator.language?.toLowerCase().startsWith('da') ? 'da' : 'en';
let lang: Lang = load<Lang>('lang', deviceLang);
document.documentElement.lang = lang;

export const getLang = () => lang;

export function setLang(l: Lang) {
  lang = l;
  save('lang', l);
  document.documentElement.lang = l;
}

export const speechLang = () => LANGS.find((x) => x.id === lang)!.speech;

/** Picks the current language's entry: L({ en: 'dog', da: 'hund' }), or a whole message table. */
export function L<T>(m: Record<Lang, T>): T {
  return m[lang];
}

const en = {
  greatJob: 'Great job!',
  playAgain: 'Play again ▶',
  home: 'Back to menu',
  sound: 'Sound on/off',
  language: 'Language',
  settings: 'Settings',
  hold: 'Grown-ups: hold for 3 seconds',
  soundLabel: 'Sounds and voice',
  paintSave: 'Save button in Magic Paint',
  paintSaveHint: 'Lets children save or share their drawings',
  app: 'App',
  refresh: 'Refresh app',
  refreshHint: 'Loads the newest version',
  on: 'On',
  off: 'Off',
  stars: 'Stars',
  starsHint: (n: number) => `Collected so far: ${n} ⭐`,
  resetStars: 'Reset stars',
  sure: 'Tap again to reset',
  photoCredits: 'Photo credits',
  photoCreditsHint: 'Car photos from Wikimedia Commons, cropped and resized. Tap to see who took them.',
};

/** Shell and menu strings. Games keep their own tables next to their code. */
export const UI: Record<Lang, typeof en> = {
  en,
  da: {
    greatJob: 'Godt klaret!',
    playAgain: 'Spil igen ▶',
    home: 'Tilbage til menuen',
    sound: 'Lyd til/fra',
    language: 'Sprog',
    settings: 'Indstillinger',
    hold: 'Voksne: hold inde i 3 sekunder',
    soundLabel: 'Lyd og stemme',
    paintSave: 'Gem-knap i Tryllemaling',
    paintSaveHint: 'Lader børn gemme eller dele deres tegninger',
    app: 'App',
    refresh: 'Opdater app',
    refreshHint: 'Henter den nyeste version',
    on: 'Til',
    off: 'Fra',
    stars: 'Stjerner',
    starsHint: (n: number) => `Samlet indtil nu: ${n} ⭐`,
    resetStars: 'Nulstil stjerner',
    sure: 'Tryk igen for at nulstille',
    photoCredits: 'Fotokreditering',
    photoCreditsHint: 'Bilfotos fra Wikimedia Commons, beskåret og skaleret. Tryk for at se, hvem der tog dem.',
  },
};
