/**
 * The cars in Cool Cars. Photos are from Wikimedia Commons, cropped to 3:2 and resized
 * (photos/<id>.jpg); their licenses require crediting the photographer, which Settings does.
 */
import type { Txt } from '../../i18n';

export interface Car {
  id: string;
  brand: string;
  model: string;
  /** How to say the name when the spelling would be read wrong (numbers, letters). */
  spoken?: Txt;
  credit: { author: string; license: string; url: string };
}

const commons = (file: string) => `https://commons.wikimedia.org/wiki/File:${file}`;

export const CARS: Car[] = [
  { id: 'beetle', brand: 'Volkswagen', model: 'Beetle', credit: { author: 'Renée Kools', license: 'CC BY 4.0', url: commons('Blue_Volkswagen_Beetle_side_view.jpg') } },
  { id: 'fiat500', brand: 'Fiat', model: '500', credit: { author: 'Lothar Spurzem', license: 'CC BY-SA 2.0 DE', url: commons('Fiat_500_2007_(2012-07-14).JPG') } },
  { id: 'mini', brand: 'Mini', model: 'Cooper', credit: { author: 'DeFacto', license: 'CC BY-SA 4.0', url: commons('Rover_Mini_Cooper_2000_(X411JOP).jpg') } },
  { id: 'porsche911', brand: 'Porsche', model: '911', spoken: { en: 'Porsche nine eleven', da: 'Porsche ni elleve' }, credit: { author: 'Matti Blume', license: 'CC BY-SA 4.0', url: commons('Porsche_911_GT3_Touring,_IAA_2017,_Frankfurt_(1Y7A2766).jpg') } },
  { id: 'f40', brand: 'Ferrari', model: 'F40', spoken: { en: 'Ferrari F forty', da: 'Ferrari F fyrre' }, credit: { author: 'Will ainsworth', license: 'CC BY-SA 3.0', url: commons('F40_Ferrari_20090509.jpg') } },
  { id: 'aventador', brand: 'Lamborghini', model: 'Aventador', credit: { author: 'Matti Blume', license: 'CC BY-SA 4.0', url: commons('Lamborghini_Aventador,_Motortreff_Bella_Italia_2024,_Munich_(P1190389-RR).jpg') } },
  { id: 'chiron', brand: 'Bugatti', model: 'Chiron', credit: { author: 'MrWalkr', license: 'CC BY-SA 4.0', url: commons('Bugatti_Chiron_2.jpg') } },
  { id: 'mustang', brand: 'Ford', model: 'Mustang', credit: { author: 'Hans-Jürgen Neubert', license: 'CC BY 4.0', url: commons('1966_Ford_Mustang_coupe_white_002.jpg') } },
  { id: 'modely', brand: 'Tesla', model: 'Model Y', spoken: { en: 'Tesla Model Y', da: 'Tesla Model Wai' }, credit: { author: 'Nikolai Bulykin', license: 'CC BY-SA 4.0', url: commons('Алматы,_Tesla_Model_Y_на_Каримова.jpg') } },
  { id: 'xc90', brand: 'Volvo', model: 'XC90', spoken: { en: 'Volvo X C ninety', da: 'Volvo X C halvfems' }, credit: { author: 'Alexander Migl', license: 'CC BY-SA 4.0', url: commons('2025_Volvo_XC90_II_autoMOBIL_Tübingen_2025_DSC_2767.jpg') } },
  { id: 'wrangler', brand: 'Jeep', model: 'Wrangler', credit: { author: 'Alexander Migl', license: 'CC BY-SA 4.0', url: commons('Jeep_Wrangler_Rubicon_(JL)_4xe_1X7A0285.jpg') } },
  { id: 'defender', brand: 'Land Rover', model: 'Defender', credit: { author: 'DeFacto', license: 'CC BY-SA 4.0', url: commons('Land_Rover_Defender_110_Station_Wagon_2016_-_front.jpg') } },
];

export const carName = (c: Car) => `${c.brand} ${c.model}`;
export const carSpoken = (c: Car): Txt => c.spoken ?? { en: carName(c), da: carName(c) };
