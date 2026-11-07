import { L, type Lang } from '../../i18n';
import type { Bread, Sausage, Topping } from './art';
import type { DrinkKind } from './drinks';

const en = {
  hotdog: 'Hotdog',
  drink: 'Drink',
  pickDrink: 'Pick a drink!',
  open: 'Open the bottle with the opener!',
  lift: 'Lift it up!',
  pour: 'Hold the bottle to pour!',
  cheers: 'Cheers!',
  glassEmpty: 'The glass is empty!',
  drinks: { choco: 'Chocolate milk', cola: 'Cola', orange: 'Orange juice' } as Record<DrinkKind, string>,
  snack: 'Apple slices',
  cutApple: 'Slice the apple!',
  intoBowl: 'Put the slices in the bowl!',
  appleDone: 'Crunchy apple slices!',
  appleGone: 'The apple slices are gone!',
  pickBread: 'Pick the bread!',
  pickSausage: 'Pick a sausage!',
  grill: 'Grill the sausage!',
  turn: 'Tap the sausage to turn it!',
  grilled: 'Perfectly grilled!',
  dress: 'Put on what you like!',
  full: 'There is no room for more!',
  done: '✓ Done',
  hotdogDone: 'What a hotdog!',
  eat: 'Tap the hotdog to eat it!',
  yum: ['Yum!', 'Mmm!', 'Tasty!'],
  gone: 'The hotdog is gone!',
  breads: { classic: 'Hotdog bun', wholegrain: 'Whole grain', sesame: 'Sesame', pretzel: 'Pretzel' } as Record<Bread, string>,
  sausages: {
    red: 'Red sausage', wiener: 'Wiener', grill: 'Grill sausage', cheese: 'Cheese sausage', veggie: 'Veggie sausage',
  } as Record<Sausage, string>,
  toppings: {
    ketchup: 'Ketchup', mustard: 'Mustard', remoulade: 'Remoulade', crispy: 'Crispy onions', onion: 'Onions', pickles: 'Pickles',
  } as Record<Topping, string>,
};

export const M: Record<Lang, typeof en> = {
  en,
  da: {
    hotdog: 'Hotdog',
    drink: 'Drikkevare',
    pickDrink: 'Vælg noget at drikke!',
    open: 'Åbn flasken med oplukkeren!',
    lift: 'Løft op!',
    pour: 'Hold på flasken for at hælde op!',
    cheers: 'Skål!',
    glassEmpty: 'Glasset er tomt!',
    drinks: { choco: 'Kakaomælk', cola: 'Cola', orange: 'Appelsinjuice' },
    snack: 'Æblebåde',
    cutApple: 'Skær æblet i både!',
    intoBowl: 'Læg æblebådene i skålen!',
    appleDone: 'Sprøde æblebåde!',
    appleGone: 'Æblebådene er spist!',
    pickBread: 'Vælg brødet!',
    pickSausage: 'Vælg en pølse!',
    grill: 'Grill pølsen!',
    turn: 'Tryk på pølsen for at vende den!',
    grilled: 'Perfekt grillet!',
    dress: 'Kom det på, du kan lide!',
    full: 'Der er ikke plads til mere!',
    done: '✓ Færdig',
    hotdogDone: 'Sikke en hotdog!',
    eat: 'Tryk på hotdoggen for at spise den!',
    yum: ['Mums!', 'Mmm!', 'Lækkert!'],
    gone: 'Hotdoggen er spist!',
    breads: { classic: 'Hotdogbrød', wholegrain: 'Grovbrød', sesame: 'Sesam', pretzel: 'Pretzel' },
    sausages: {
      red: 'Rød pølse', wiener: 'Wienerpølse', grill: 'Grillpølse', cheese: 'Ostepølse', veggie: 'Vegetarpølse',
    },
    toppings: {
      ketchup: 'Ketchup', mustard: 'Sennep', remoulade: 'Remoulade', crispy: 'Ristede løg', onion: 'Rå løg', pickles: 'Syltede agurker',
    },
  },
};

export const S = () => L(M);
