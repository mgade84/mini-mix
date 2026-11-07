import type { GameDef } from '../types';
import { bubbles } from './bubbles';
import { memory } from './memory';
import { shapes } from './shapes';
import { paint } from './paint';
import { counting } from './counting';
import { piano } from './piano';
import { math } from './math';
import { train } from './train';
import { burger } from './burger';
import { hotdog } from './hotdog';
import { cars } from './cars';

/** Menu order. To add a game: create a GameDef module and list it here. */
export const games: GameDef[] = [bubbles, paint, piano, train, cars, burger, hotdog, shapes, counting, memory, math];
