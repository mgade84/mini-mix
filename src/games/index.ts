import type { GameDef } from '../types';
import { bubbles } from './bubbles';
import { memory } from './memory';
import { shapes } from './shapes';
import { paint } from './paint';
import { counting } from './counting';
import { piano } from './piano';
import { math } from './math';
import { train } from './train';
import { race } from './race';
import { burger } from './burger';
import { cars } from './cars';
import { dino } from './dino';

/** Menu order. To add a game: create a GameDef module and list it here. */
export const games: GameDef[] = [bubbles, paint, piano, train, race, dino, cars, burger, shapes, counting, memory, math];
