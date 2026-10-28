import { L, type Lang } from '../../i18n';

const en = {
  burger: 'Burger',
  fries: 'Fries',
  soda: 'Soda',
  hubAsk: 'What should we make?',
  ready: 'The meal is ready!',
  build: 'Build your burger!',
  done: '✓ Done',
  full: 'The burger is full!',
  burgerDone: 'What a burger!',
  slice: 'Slice the potato!',
  swipe: 'Swipe down to cut',
  fry: 'Put the fries in the hot oil!',
  drag: 'Drag the basket',
  lift: 'Lift them up when they are golden!',
  notYet: 'Not crispy yet!',
  friesDone: 'Crispy fries!',
  extraCrispy: 'Extra crispy fries!',
  pour: 'Hold a button to pour. Mix as you like!',
  cupFull: 'The cup is full!',
  sodaDone: 'Fizzy!',
  price: 'How much does the meal cost?',
  pay: (n: number) => `Put ${spoken(n)} in the register!`,
  left: (n: number) => `${money(n)} to go`,
  change: (n: number) => `Here is your change: ${spoken(n)}`,
  thanks: 'Thank you!',
  eat: 'Tap to eat and drink!',
  yum: ['Yum!', 'Mmm!', 'Tasty!'],
  burgerGone: 'The burger is gone!',
  friesGone: 'All the fries are gone!',
  sodaGone: 'The cup is empty!',
  end: 'Thank you for the meal!',
  cost: (n: number) => `The meal cost ${money(n)}`,
  drinks: { cola: 'Cola', orange: 'Orange', lemon: 'Lemon', grape: 'Grape', berry: 'Strawberry' } as Record<string, string>,
  ings: {
    patty: 'Beef', cheese: 'Cheese', bacon: 'Bacon', lettuce: 'Lettuce', tomato: 'Tomato',
    onion: 'Onion', pickle: 'Pickles', egg: 'Egg', ketchup: 'Ketchup', mustard: 'Mustard',
  } as Record<string, string>,
};

function money(n: number) {
  return L({ en: `$${n}`, da: `${n} kr.` });
}

function spoken(n: number) {
  return L({ en: n === 1 ? '1 dollar' : `${n} dollars`, da: n === 1 ? '1 krone' : `${n} kroner` });
}

const M: Record<Lang, typeof en> = {
  en,
  da: {
    burger: 'Burger',
    fries: 'Pomfritter',
    soda: 'Sodavand',
    hubAsk: 'Hvad skal vi lave?',
    ready: 'Maden er klar!',
    build: 'Byg din burger!',
    done: '✓ Færdig',
    full: 'Burgeren er fyldt!',
    burgerDone: 'Sikke en burger!',
    slice: 'Skær kartoflen i strimler!',
    swipe: 'Stryg nedad for at skære',
    fry: 'Kom pomfritterne i den varme olie!',
    drag: 'Træk i kurven',
    lift: 'Løft dem op, når de er gyldne!',
    notYet: 'De er ikke sprøde endnu!',
    friesDone: 'Sprøde pomfritter!',
    extraCrispy: 'Ekstra sprøde pomfritter!',
    pour: 'Hold en knap nede for at hælde op. Bland som du vil!',
    cupFull: 'Koppen er fuld!',
    sodaDone: 'Det bobler!',
    price: 'Hvad skal maden koste?',
    pay: (n: number) => `Læg ${spoken(n)} i kassen!`,
    left: (n: number) => `${money(n)} mangler`,
    change: (n: number) => `Her er ${spoken(n)} tilbage`,
    thanks: 'Tak!',
    eat: 'Tryk for at spise og drikke!',
    yum: ['Mums!', 'Mmm!', 'Lækkert!'],
    burgerGone: 'Burgeren er spist!',
    friesGone: 'Alle pomfritterne er spist!',
    sodaGone: 'Koppen er tom!',
    end: 'Tak for mad!',
    cost: (n: number) => `Maden kostede ${money(n)}`,
    drinks: { cola: 'Cola', orange: 'Appelsin', lemon: 'Citron', grape: 'Vindrue', berry: 'Jordbær' },
    ings: {
      patty: 'Bøf', cheese: 'Ost', bacon: 'Bacon', lettuce: 'Salat', tomato: 'Tomat',
      onion: 'Løg', pickle: 'Agurk', egg: 'Spejlæg', ketchup: 'Ketchup', mustard: 'Sennep',
    },
  },
};

export const S = () => L(M);
export { money, spoken };
