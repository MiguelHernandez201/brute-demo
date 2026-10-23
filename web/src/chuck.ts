// Personajes especiales con piezas dibujadas para el muñeco de LaBrute:
// - Chuck: el karateka pelirrojo (el de public/images/mascota.png), con melena, barba, bigote y kimono blanco y negro.
// - Gustavo Petro: peinado con entradas y copete lateral, gafas rectangulares, ojeras de orador y guayabera blanca con
//   alforzas, banda presidencial tricolor y pantalón oscuro de vestir.
// - Abelardo: la caricatura de referencia como cabeza (ver abelardoCara.ts) y traje de cachaco: paño oscuro con rayas
//   finas, chaleco, camisa blanca, corbata y zapatos negros.
//
// Las piezas siguen el estilo de las del juego: relleno blanco que se tiñe con el color del pelo o la ropa, sombra
// #d6baba y líneas finas negras semitransparentes (el contorno grueso lo pone el filtro de toda la figura). Las de la
// cabeza están en las coordenadas de Symbol410 (mirando a la izquierda): la cara va de x -32 a 33 y de y 0 a 39, el ojo
// en x -12..0, y 18..32, y la oreja en x 20..30, y 13..30
import * as Symbols from 'labrute-fla-parser';
import type { FramePart, Svg, Symbol as LaBruteSymbol } from 'labrute-fla-parser';
import { getRandomBody, getRandomColors } from '@labrute/core';
import { ABELARDO_FACE } from './abelardoCara';

// Peinados (p3) nuevos: después de los 12 del juego (0 a 11)
export const CHUCK_HEAD = 12;
export const PETRO_HEAD = 13;
export const ABELARDO_HEAD = 14;

// Atuendos (p7) nuevos: después de los 7 del juego (0 a 6). La guayabera es la de Petro sin la banda presidencial: la
// llevan los de su bando en el modo Petro vs Abelardo (ver teamLook)
export const PETRO_OUTFIT = 7;
export const ABELARDO_OUTFIT = 8;
export const GUAYABERA_OUTFIT = 9;

// Aspectos (ver addBrute en sim.ts): cuerpo (p1, p1a, p1b, p2, p3, p4, p5, p6, p7, p7b, p8, en hexadecimal) y colores
// (col0..col4b: piel, pelo, prenda superior, pantalón y cinturón/zapatos)
const CHUCK_SKIN = 'e8b48a';
const CHUCK_HAIR = 'a8441c';
export const CHUCK_LOOK = {
  gender: 'male' as const,
  body: `0000${CHUCK_HEAD.toString(16)}000600`,
  colors: [
    ...[CHUCK_SKIN, CHUCK_SKIN, CHUCK_SKIN],
    ...[CHUCK_HAIR, CHUCK_HAIR, CHUCK_HAIR, CHUCK_HAIR, CHUCK_HAIR],
    ...['ffffff', 'f2f2f2', '1a1a1a', 'ffffff', 'f2f2f2', '1a1a1a', '1a1a1a', 'ffffff'],
  ].join(''),
};

// El motor aplica colorOffset { r: -16, g: -50, b: -80 } a la piel (Symbol344/377), por lo que usamos el tono claro
// de la paleta original (#fbe6c8 de colors.ts). Además, _col3 tiñe el iris de los ojos (Symbol347 en Symbol360), así
// que ponemos marrón en col3 y usamos _col3b para el color del pantalón.
const PETRO_SKIN = 'fbe6c8';
const PETRO_HAIR = '4a3f39';
export const PETRO_LOOK = {
  gender: 'male' as const,
  body: `0000${PETRO_HEAD.toString(16)}000${PETRO_OUTFIT.toString(16)}00`,
  colors: [
    ...[PETRO_SKIN, PETRO_SKIN, PETRO_SKIN],
    ...[PETRO_HAIR, PETRO_HAIR, PETRO_HAIR, PETRO_HAIR, PETRO_HAIR],
    ...['f7f6f0', 'eceae0', 'dcd9cc', '5c3a21', '232730', '1c1917', '18181b', '18181b'],
  ].join(''),
};

const ABELARDO_SKIN = 'fbe6c8';
const ABELARDO_HAIR = '1a1818';
export const ABELARDO_LOOK = {
  gender: 'male' as const,
  body: `0000${ABELARDO_HEAD.toString(16)}000${ABELARDO_OUTFIT.toString(16)}00`,
  colors: [
    ...[ABELARDO_SKIN, ABELARDO_SKIN, ABELARDO_SKIN],
    ...[ABELARDO_HAIR, ABELARDO_HAIR, ABELARDO_HAIR, ABELARDO_HAIR, ABELARDO_HAIR],
    // (traje de cachaco: saco, pantalón algo más claro, zapatos y cinturón negros)
    ...['2b2d33', '22242a', '1a1b20', '1f2024', '33353d', '141416', '111113', '1a1a1a'],
  ].join(''),
};

// Modo Petro vs Abelardo: aspecto de los refuerzos de un bando. Su cara, su pelo y su piel salen al azar, como los de
// cualquier brute, pero visten como su jefe: la guayabera (sin la banda presidencial, que es solo de Petro) o el traje de
// cachaco. Las piezas propias son del muñeco de hombre: las brutes llevan el atuendo 3 del juego (top y falda, que se
// tiñen con col2) en esos colores. col3 (el cinturón de ellas, y el iris) va del color del pantalón (ver PETRO_LOOK)
const TEAM_CLOTHES = {
  petro: { outfit: GUAYABERA_OUTFIT, look: PETRO_LOOK },
  abelardo: { outfit: ABELARDO_OUTFIT, look: ABELARDO_LOOK },
};
const FEMALE_TEAM_OUTFIT = 3;
export const teamLook = (side: keyof typeof TEAM_CLOTHES, gender: 'male' | 'female') => {
  const { outfit, look } = TEAM_CLOTHES[side];
  const body = getRandomBody(gender);
  const colors = getRandomColors(gender).match(/.{6}/g) ?? [];
  const own = look.colors.match(/.{6}/g) ?? [];
  // (prenda superior col2, col2a y col2b; pantalón col3 y col3b; cinturón y zapatos col4, col4a y col4b)
  [8, 9, 10, 12, 13, 14, 15].forEach((i) => (colors[i] = own[i] ?? colors[i] ?? '000000'));
  colors[11] = own[12] ?? colors[11] ?? '000000';
  // (p7 es el atuendo; y p1, entre otras cosas, si el torso de ellos va con chaleco: sin él, que es oscuro y no se
  // tiñe, la camisa lleva el color del bando)
  const p7 = (gender === 'female' ? FEMALE_TEAM_OUTFIT : outfit).toString(16);
  return { gender, body: `0${body.slice(1, 8)}${p7}${body.slice(9)}`, colors: colors.join('') };
};

const svg = (name: string, w: number, h: number, body: string[]): Svg => ({
  type: 'svg',
  name,
  offset: { x: w / 2, y: h / 2 },
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}px" height="${h}px"><g transform="matrix(1,0,0,1,${w / 2},${h / 2})">${body.join('')}</g></svg>`,
});
const fill = (d: string, color = '#ffffff') => `<path d="${d}" fill="${color}"/>`;
const shade = (d: string) => fill(d, '#d6baba');
const lines = (d: string) =>
  `<path d="${d}" fill="none" stroke="#000000" stroke-opacity="0.3" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>`;

// ===========================================================================
// 1. CHUCK
// ===========================================================================

// Melena de atrás (detrás de la cara): más oscura, hasta la nuca, con tres puntas hacia fuera
const back = svg('ChuckHairBackSvg', 140, 150, [
  shade(
    'M -30 4 C -38 -10 -36 -30 -24 -40 C -12 -48 8 -50 22 -46 C 36 -42 46 -28 46 -12 C 46 2 42 14 46 26 C 49 36 50 46 44 56 C 42 50 38 47 35 49 C 36 55 32 60 26 62 C 26 56 23 52 19 50 C 17 55 12 58 7 56 C 9 50 8 44 6 40 L 8 30 L -24 30 Z',
  ),
  lines(
    'M 40 -24 C 44 -10 40 6 43 22 C 45 32 45 42 42 50 M 34 14 C 38 26 37 40 33 52 M 24 26 C 26 36 25 44 21 50 M 14 32 C 15 40 13 48 9 54',
  ),
]);
// Coronilla con volumen (con bultos, como los peinados del juego) y flequillo hacia delante (encima de todo)
const front = svg('ChuckHairFrontSvg', 140, 150, [
  fill(
    'M -38 4 C -44 -6 -44 -18 -38 -26 C -40 -32 -36 -38 -30 -40 C -26 -46 -16 -50 -8 -48 C -2 -54 10 -54 16 -50 C 24 -52 34 -46 38 -38 C 44 -34 46 -24 44 -16 C 46 -8 44 0 42 6 C 38 2 36 -2 34 -6 C 30 -2 28 2 22 4 C 22 -2 20 -6 16 -8 C 12 -4 6 -2 0 -2 C 2 -6 0 -10 -4 -12 C -8 -6 -14 -4 -20 -4 C -18 -8 -20 -12 -24 -12 C -28 -6 -32 -2 -38 4 Z',
  ),
  shade(
    'M 30 -42 C 40 -34 46 -24 44 -14 C 45 -6 43 0 42 6 C 38 2 36 -2 34 -6 C 36 -18 34 -32 30 -42 Z M -36 -4 C -32 -10 -28 -14 -24 -12 C -28 -6 -32 -2 -38 4 Z M -2 -12 C 4 -14 10 -12 16 -8 C 12 -4 6 -2 0 -2 C 2 -6 1 -9 -2 -12 Z',
  ),
  lines(
    'M -32 -30 C -24 -38 -12 -42 -2 -40 M -36 -16 C -28 -24 -16 -28 -6 -26 M 0 -46 C 8 -44 14 -40 18 -34 M 14 -36 C 24 -32 32 -24 36 -12 M -16 -14 C -10 -20 -2 -20 6 -14 M 22 -22 C 26 -16 28 -10 28 -4',
  ),
]);
// Barba corta y entera, con el borde de abajo de pelo: patillas, mandíbula y barbilla
const beard = svg('ChuckBeardSvg', 120, 130, [
  fill(
    'M 14 2 C 18 8 18 18 16 26 C 14 34 10 40 6 44 L 7 48 L 2 46 L 1 51 L -4 48 L -6 53 L -10 49 L -14 53 L -17 49 L -22 52 L -24 47 L -29 49 L -30 44 L -34 44 C -34 40 -33 37 -30 35 C -24 37 -18 38 -12 37 C -6 36 -2 35 2 33 C 6 30 9 24 10 16 C 11 10 12 6 14 2 Z',
  ),
  shade(
    'M 6 44 L 7 48 L 2 46 L 1 51 L -4 48 L -6 53 L -10 49 L -14 53 L -17 49 L -22 52 L -24 47 L -29 49 L -30 44 C -24 45 -16 46 -8 45 C -2 44 2 43 6 41 Z',
  ),
  lines('M 12 14 C 12 24 8 32 2 38 M -6 40 C -7 44 -8 47 -10 49 M -18 41 C -19 45 -20 47 -22 50'),
]);
// Bigote poblado, caído por las puntas, bajo la nariz
const mustache = svg('ChuckMustacheSvg', 120, 130, [
  fill(
    'M -38 40 C -39 35 -34 33 -28 34 C -23 33 -18 34 -13 36 C -15 39 -18 39 -21 38 C -24 39 -27 39 -30 40 C -32 43 -36 44 -38 40 Z',
  ),
  lines('M -35 37 C -29 35 -22 35 -16 36.5'),
]);
// Cejas gruesas y fruncidas: la de este lado y la del otro, que asoma por delante (las del juego son finas)
const brows = svg('ChuckBrowsSvg', 120, 130, [
  fill(
    'M -18 21 C -13 16 -5 12 7 11 C 8 12 8 14 7 15 C -1 16 -8 19 -15 24 C -17 24 -18 23 -18 21 Z M -33 8 C -29 8 -25 10 -21 14 C -21 16 -22 17 -23 17 C -26 15 -29 13 -33 12 Z',
  ),
  shade('M -15 24 C -8 19 -1 16 7 15 C 7 16 6 17 5 17 C -2 18 -9 21 -15 24 Z'),
  lines('M -14 19 C -8 15 -1 13 5 12.5'),
]);
// Párpados: tapan la parte de arriba de los dos ojos (la mirada entornada, de enfado), con la raya de las pestañas
const lids = svg('ChuckLidsSvg', 120, 130, [
  fill(
    'M -17 13 L 5 13 L 5 21 C 1 21 -6 22 -15 26 C -17 25 -18 23 -17 13 Z M -31 10 L -21 10 L -21 19 C -24 19.5 -27 21 -30 23 Z',
  ),
  '<path d="M -15 26 C -7 22 0 21 5 21 M -30 23 C -27 21 -24 19.5 -21 19" fill="none" stroke="#000000" stroke-opacity="0.75" stroke-width="1.6" stroke-linecap="round"/>',
  lines('M -12 31.5 C -7 32.5 -2 31.5 2 29.5'),
]);
// Pupilas oscuras (los ojos del juego son grandes y claros)
const pupils = svg('ChuckPupilsSvg', 120, 130, [
  '<ellipse cx="-7.5" cy="27" rx="2.6" ry="3.2" fill="#2b1a10"/><ellipse cx="-25.2" cy="23.2" rx="1" ry="2" fill="#2b1a10"/>',
]);
// Nariz grande, que sobresale por delante de la cara
const nose = svg('ChuckNoseSvg', 120, 130, [
  fill('M -24 18 C -27 22 -32 26 -36 30 C -36 33 -32 34 -28 33 C -26 32.5 -24.5 31 -24 29 Z'),
  shade('M -36 30 C -36 33 -32 34 -28 33 C -30 32 -33 31.5 -35 30 Z'),
  lines('M -30.5 31.5 C -29 30.5 -27.5 30.5 -26.5 31.5 M -25 20 C -27 23 -30 26 -33 28.5'),
]);
// Boca apretada, enseñando los dientes, entre el bigote y la barba (con sus colores: no se tiñe)
const mouth = svg('ChuckMouthSvg', 120, 130, [
  fill('M -31 40.2 C -26 40.8 -22 40.6 -18 40 C -19 42.6 -27 43.4 -31 40.2 Z', '#3a1810'),
  fill('M -30 40.6 C -26 41.1 -22.5 41 -19 40.5 L -19.4 41.4 C -23 41.9 -26 42 -29.4 41.5 Z', '#fff6e0'),
]);

// ===========================================================================
// 2. GUSTAVO PETRO (Cabeza caricaturesca completa estilo "cabezón")
// ===========================================================================

const stroke = (d: string, color = '#33180e', width = 1.35) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="0.88" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

const petroFullHead = svg('PetroFullHeadSvg', 160, 170, [
  // 1. Mechón ondulado izquierdo que asoma junto a la sien (termina arriba de las gafas, como en la referencia)
  fill('M -22 -24 C -29 -22 -33 -16 -31 -9 C -34 -6 -34 -1 -29 2 C -32 4 -30 7 -25 6 L -22 -6 Z', '#43474a'),
  fill('M -24 -19 C -28 -16 -29 -11 -27 -6 C -29 -3 -28 1 -25 2 L -23 -5 Z', '#8c9296'),
  stroke('M -23 -24 C -29 -22 -33 -16 -31 -9 C -34 -6 -34 -1 -29 2 C -32 4 -30 7 -25 6', '#141416', 1.55),
  // 2. Cuello y sombra bajo la mandíbula/papada (como en la referencia)
  fill('M -15 39 C -9 45 -1 49 7 48 C 12 46 16 39 19 29 L 14 23 L -12 32 Z', '#b87b53'),
  fill('M -12 41 C -6 45 1 47 6 45 C 9 42 12 36 14 30 C 7 37 -2 41 -12 41 Z', '#965f3d'),
  stroke('M 19 29 C 16 39 12 46 7 48 C -1 49 -9 45 -15 39', '#141416', 1.8),
  // 3. Base de la cara (piel durazno cálida #dfa579 con pómulo, mejilla y mentón redondeado)
  fill(
    'M -20 -24 C -10 -29 4 -26 12 -16 C 16 -9 17 2 16 14 C 16 24 14 33 8 38 C 2 43 -6 44 -14 43 C -21 42 -25 39 -26 34 C -28 31 -29 26 -27 21 C -29 16 -29 10 -26 5 C -27 -4 -26 -16 -20 -24 Z',
    '#dfa579',
  ),
  // Luz clara en la frente izquierda y pómulo (#eac09b)
  fill(
    'M -19 -20 C -13 -24 -3 -22 3 -15 C 5 -9 4 -1 0 3 C -7 1 -15 0 -22 2 C -24 -5 -23 -14 -19 -20 Z M -11 18 C -5 18 1 21 3 27 C -1 32 -8 34 -14 31 C -14 26 -13 21 -11 18 Z',
    '#eac09b',
  ),
  // Sombreado lateral derecho de la cara, bajo el pómulo y a lo largo de la mandíbula (#b87b53)
  fill(
    'M 6 -16 C 11 -10 14 -1 14 10 L 8 11 L 7 2 C 7 -5 6 -11 6 -16 Z M 4 13 C 9 12 14 10 16 14 C 16 24 13 33 7 38 C 1 42 -8 43 -16 42 C -21 41 -24 38 -25 34 C -19 38 -10 39 -2 36 C 4 33 7 25 4 13 Z',
    '#b87b53',
  ),
  // Sombra bajo el labio inferior y sobre el mentón
  fill('M -24 31.5 C -19 33.8 -11 33.8 -6 30.5 C -8 35 -18 35.8 -24 31.5 Z', '#b87b53'),
  // Contorno exterior de la sien izquierda, mejilla y mentón
  stroke(
    'M -23 -15 C -26 -7 -26 0 -26 6 C -29 11 -29 16 -27 21 C -29 26 -28 31 -26 34 C -25 39 -21 42 -14 43 C -6 44 2 43 8 38 C 13 34 15 27 16 19',
    '#141416',
    1.75,
  ),
  // Líneas de expresión y sombreado tipo cómic en la mejilla derecha, mandíbula y mentón (hoyuelo)
  stroke(
    'M 4 18 L 9 23.5 M 2 20 L 6 24.5 M 9 27 C 11 31 11 35 9 38 M -1 39 C 3 40 6 39 8 37 M -18 38 C -18.5 39.5 -17.5 40.5 -16.5 39 M -13.5 38.5 L -13.2 38.8',
    '#141416',
    1.15,
  ),
  // 4. Cabellera superior y trasera (encima de la frente, con el mechón en S y puntas cortas en la nuca)
  fill(
    'M -23 -15 C -27 -24 -23 -34 -14 -38 L -15 -41 C -7 -45 4 -45 13 -40 L 11 -44 C 21 -42 29 -36 33 -27 L 36 -29 C 37 -23 36 -17 33 -12 C 39 -9 42 -2 39 5 L 43 4 C 42 11 38 16 33 19 C 37 22 37 27 32 30 C 27 33 21 32 16 29 L 15 10 C 14 -2 12 -12 8 -16 C 5 -11 -2 -10 -7 -14 C -10 -17 -12 -22 -15 -24 C -19 -23 -21 -19 -23 -15 Z',
    '#43474a',
  ),
  // Sombras oscuras entre las capas de mechones
  fill(
    'M -14 -38 C -6 -43 5 -43 13 -38 C 6 -36 -2 -32 -8 -25 Z M 18 -36 C 27 -32 32 -23 30 -13 C 35 -10 37 -3 35 4 C 31 -2 26 -8 19 -12 Z M 22 14 C 29 17 33 23 30 29 C 25 31 20 30 16 27 L 17 16 Z',
    '#26292b',
  ),
  // Mechones plateados/canosos en el copete en S (-14,-28 -> 8,-14) y en las ondas laterales
  fill(
    'M -14 -28 C -9 -32 -1 -31 5 -25 C 9 -21 11 -16 10 -12 C 5 -11 -1 -12 -5 -16 C -8 -19 -10 -24 -14 -28 Z M 4 -35 C 13 -35 22 -29 25 -20 C 27 -13 25 -6 20 -2 C 22 -8 21 -16 16 -22 C 12 -27 7 -31 4 -35 Z M 16 -4 C 23 -2 29 3 29 10 C 26 14 21 16 16 15 C 21 13 24 9 23 4 C 22 0 19 -2 16 -4 Z',
    '#7d8387',
  ),
  // Patilla canosa plateada que baja frente a la oreja (x=9..16, y=-14..18)
  fill('M 8 -16 C 13 -11 15 -2 14 8 C 13 13 14 17 16 19 L 19 15 C 20 5 19 -6 14 -16 Z', '#949a9e'),
  // Trazos de tinta del cabello, el mechón en S sobre la frente y las puntas despeinadas
  stroke(
    'M -23 -15 C -27 -24 -23 -34 -14 -38 L -15 -41 C -7 -45 4 -45 13 -40 L 11 -44 C 21 -42 29 -36 33 -27 L 36 -29 C 37 -23 36 -17 33 -12 C 39 -9 42 -2 39 5 L 43 4 C 42 11 38 16 33 19 C 37 22 37 27 32 30 C 27 33 21 32 16 29 M -23 -15 C -21 -20 -18 -24 -14 -24 C -11 -22 -9 -17 -5 -13 C 0 -9 6 -10 10 -14 M -12 -29 C -6 -31 1 -28 5 -22 C 8 -18 9 -13 7 -10 M -4 -35 C 5 -36 14 -31 19 -22 M 9 -14 C 11 -6 11 3 10 11 C 10 15 12 18 15 19 M 13 -10 C 14 -2 13 6 12 14',
    '#141416',
    1.45,
  ),
  // 5. Oreja derecha detallada (encima del cabello lateral, detrás de la patilla)
  fill('M 15 6 C 18 2 24 3 26 9 C 28 15 26 23 22 27 C 18 29 14 27 14 22 Z', '#dfa579'),
  fill('M 17 9 C 19 6 23 7 24 12 C 25 16 23 22 20 24 C 17 25 15 23 15 19 Z', '#b87b53'),
  stroke(
    'M 15 6 C 18 2 24 3 26 9 C 28 15 26 23 22 27 C 18 29 14 27 14 22 M 17 10 C 20 8 23 11 21 17 C 20 20 17 21 16 19 M 17 14 C 19 14 20 16 18 18',
    '#141416',
    1.4,
  ),
  // 6. Arrugas de la frente y el entrecejo + cejas arqueadas canosas
  stroke(
    'M -19 -11 C -14 -12 -9 -12 -5 -11.5 M -15 -3 C -14 0 -13 3 -14 6 M -11 -1 C -12 2 -12 4 -12 6 M -18 -2 L -16 1 M 3 -6 L 1 -3',
    '#141416',
    1.15,
  ),
  fill(
    'M -11 3.8 C -6 0.2 1 -1.2 7 2.2 C 7.5 3.4 6.5 4.2 5 3.6 C 0 1.4 -5.5 2.5 -9.8 5.5 C -11 5.8 -11.5 4.8 -11 3.8 Z M -26.5 3.5 C -23.5 0.5 -19 1.2 -16 4.2 C -15.5 5.2 -16.2 6 -17.5 5.4 C -20 3.2 -23.5 2.8 -26 4.8 C -26.8 4.8 -27 4 -26.5 3.5 Z',
    '#222426',
  ),
  stroke(
    'M -11 4.2 C -6 0.5 1 -1 7 2.4 M -9.5 5.2 C -5 2.2 0.5 1.5 5.5 3.5 M -26.5 3.8 C -23.5 0.8 -19 1.5 -16 4.4',
    '#141416',
    1.25,
  ),
  // 7. Ojos con la mirada característica de la referencia (iris arriba y esclerótica visible abajo) + bolsas/ojeras dobles
  fill(
    'M -11 11.5 C -7 15.5 1 15.5 4.5 11.2 C 2.5 16.8 -6.5 17.2 -11 11.5 Z M -26 10.8 C -23.5 14.2 -18 14.2 -16 10.8 C -17.5 15.2 -23.5 15.5 -26 10.8 Z',
    '#b87b53',
  ),
  fill(
    'M -10.5 9.8 C -7.5 6.8 0 6.5 4 9.5 C 1.5 13 -6.5 13.2 -10.5 9.8 Z M -25.8 9.4 C -23.5 6.8 -18.5 6.8 -16.2 9.4 C -18 12.4 -23.5 12.4 -25.8 9.4 Z',
    '#f8fafc',
  ),
  '<ellipse cx="-3.5" cy="8.6" rx="2.5" ry="2.2" fill="#181515"/><circle cx="-4.3" cy="8.1" r="0.75" fill="#ffffff"/>',
  '<ellipse cx="-20.8" cy="8.4" rx="2.1" ry="1.9" fill="#181515"/><circle cx="-21.4" cy="7.9" r="0.65" fill="#ffffff"/>',
  stroke(
    'M -11 9.8 C -7.5 6.5 0.2 6.2 4.5 9.5 M -10.2 10 C -6.5 13 1.2 12.8 4 9.6 M -9.5 12.6 C -5.5 15.2 0.5 15 3.2 12.2 M -8 14.5 C -4.5 16.2 -0.5 16 1.8 14.2 M -26 9.4 C -23.5 6.6 -18.2 6.6 -16 9.4 M -25.5 9.6 C -23.2 12.2 -18.2 12.2 -16.2 9.5 M -25 11.8 C -22.5 13.8 -18.5 13.8 -16.8 11.6',
    '#141416',
    1.3,
  ),
  // 8. Gafas rectangulares icónicas (cristal con reflejo diagonal, montura oscura y patilla hacia la oreja)
  fill('M -11.5 15.2 L 4.5 15.2 L 3.8 16.8 L -11 16.5 Z M -28.5 14.2 L -16.5 14.5 L -17 15.8 L -28 15.5 Z', '#b87b53'),
  '<path d="M -11.5 6.8 L 4.8 6.5 C 5.8 6.5 6.4 7.2 6.2 8.4 L 5 13.8 C 4.6 15 3.5 15.6 2 15.6 L -9.5 15.4 C -11 15.3 -12 14.5 -12.2 13.2 L -12.5 8.2 C -12.5 7.2 -12 6.8 -11.5 6.8 Z M -28.2 6.8 L -16.5 6.8 C -15.6 6.8 -15 7.4 -15.2 8.5 L -16 13.2 C -16.2 14.2 -17 14.8 -18.2 14.8 L -26.8 14.4 C -28 14.2 -28.8 13.5 -29 12.2 L -29.2 8 C -29.2 7.2 -28.8 6.8 -28.2 6.8 Z" fill="#ffffff" fill-opacity="0.18"/>',
  '<path d="M -8.5 7.2 L -4.5 7.2 L -7.8 14.8 L -11.2 14.8 Z M -25.5 7.2 L -22.5 7.2 L -25.2 13.8 L -27.8 13.8 Z" fill="#ffffff" fill-opacity="0.45"/>',
  '<path d="M -11.5 6.6 L 4.8 6.3 C 6 6.3 6.6 7 6.3 8.4 L 5.1 13.8 C 4.7 15.1 3.6 15.7 2 15.7 L -9.5 15.5 C -11.1 15.4 -12.1 14.6 -12.3 13.2 L -12.6 8.2 C -12.6 7.1 -12.1 6.6 -11.5 6.6 Z M -28.2 6.6 L -16.5 6.6 C -15.5 6.6 -14.9 7.3 -15.1 8.5 L -15.9 13.2 C -16.1 14.3 -17 14.9 -18.2 14.9 L -26.8 14.5 C -28.1 14.3 -28.9 13.6 -29.1 12.2 L -29.3 8 C -29.3 7.1 -28.8 6.6 -28.2 6.6 Z" fill="none" stroke="#18191b" stroke-width="1.65" stroke-linejoin="round"/>',
  '<path d="M -15.1 8.2 C -14 7.6 -13.2 7.6 -12.5 8.2 M -29.3 8.5 L -30.8 8.8 M 6.3 7.6 L 16.5 5.2 L 17 7 L 6.1 9.4 Z" fill="#18191b" stroke="#18191b" stroke-width="1.2" stroke-linejoin="round"/>',
  // 9. Nariz ancha y redondeada en la punta (sobresaliendo sobre el borde interno de la gafa)
  fill(
    'M -14.8 8.8 C -16.5 12.5 -19.8 16.5 -20.8 19.6 C -21.2 22 -18.8 23.6 -15 23.5 C -12.8 23.4 -10.8 22.8 -9.2 21.6 C -7.8 20.5 -7.8 18.2 -9.5 17.2 L -11.5 9.2 Z',
    '#dfa579',
  ),
  fill(
    'M -14.2 10 C -15.8 13.5 -18.2 17 -18.6 19.5 C -18.6 21 -16.5 21.8 -14.5 21.4 C -13.2 18.5 -13 14 -14.2 10 Z',
    '#eac09b',
  ),
  fill(
    'M -20.8 19.6 C -21.2 22 -18.8 23.6 -15 23.5 C -12.8 23.4 -10.8 22.8 -9.2 21.6 C -8.2 20.8 -8 19.5 -8.5 18.5 C -10.2 20.2 -12.5 21.2 -15.2 21.2 C -18 21.2 -19.8 20.5 -20.8 19.6 Z',
    '#a86b45',
  ),
  stroke(
    'M -14.8 8.8 C -16.5 12.5 -19.8 16.5 -20.8 19.6 C -21.2 22 -18.8 23.6 -15 23.5 C -12.8 23.4 -10.8 22.8 -9.2 21.6 C -7.8 20.5 -7.8 18.2 -9.8 17 M -13 21.5 C -11.5 20.5 -10.2 20.8 -9.5 21.6',
    '#141416',
    1.55,
  ),
  // 10. Surcos nasogenianos profundos, philtrum y boca carnosa seria (como en la referencia)
  stroke(
    'M -8.2 19.5 C -4.2 23 -1.5 27.2 -1.2 31.8 M -20.5 21.5 C -23 24.5 -24.5 28 -24.2 31.2 M -15.2 24.2 L -15.5 26.8',
    '#141416',
    1.3,
  ),
  fill(
    'M -23.8 29.8 C -20.8 28 -18.2 27.4 -16.2 28.3 C -14.2 27.2 -11.2 27.6 -5.2 29.8 C -11.2 30.3 -18 30.3 -23.8 29.8 Z',
    '#b57252',
  ),
  fill('M -22.8 30 C -17.5 30.3 -11.8 30.3 -6.2 30 C -8.5 33.6 -18.8 33.6 -22.8 30 Z', '#d9956f'),
  stroke(
    'M -24 29.8 C -20.8 28 -18.2 27.4 -16.2 28.3 C -14.2 27.2 -11.2 27.6 -4.8 29.8 M -24.4 30 C -18 29.8 -11.5 29.8 -4.5 30 M -22.2 30.8 C -17.5 33.8 -11 33.8 -6.8 30.8',
    '#141416',
    1.5,
  ),
]);

// Torso de Petro: cuello camisero blanco, alforzas verticales de guayabera y banda presidencial tricolor con escudo. La
// guayabera sola es el torso de los de su bando
const guayabera = [
  // Pechera y cuello camisero blanco cerrando el escote en V
  fill('M -12.5 -15.5 L -1 -16.5 L 1 -6 L -10.5 -3.5 Z', '#f7f6f0'),
  fill(
    'M -12.5 -15.5 L -7.5 -10.5 L -4.5 -13.5 L -9 -16.5 Z M -1 -16.5 L -4.5 -13.5 L -1.5 -9.5 L 2.5 -14.5 Z',
    '#ffffff',
  ),
  lines('M -12.5 -15.5 L -7.5 -10.5 L -4.5 -13.5 L -1.5 -9.5 L 2.5 -14.5 M -6.5 -10 L -7.5 15'),
  // Alforzas verticales de la guayabera y bolsillos
  lines(
    'M -12.5 -8 L -13.5 14 M -11 -8 L -12 14 M -1 -8 L -2 15 M 0.5 -8 L -0.5 15 M -14.5 -3 L -9.5 -2.5 M -3.5 -2.5 L 2 -2',
  ),
];
const guayaberaTorso = svg('GuayaberaTorsoSvg', 60, 50, guayabera);
const petroTorso = svg('PetroTorsoSvg', 60, 50, [
  ...guayabera,
  // Banda presidencial de Colombia (Amarillo, Azul y Rojo, de hombro derecho a cadera izquierda)
  fill('M 5.5 -15.5 L 12 -14.2 L -10.5 15.5 L -17.5 14.2 Z', '#facc15'),
  fill('M 8.5 -15 L 11.2 -14.4 L -11.5 15.4 L -14.2 14.8 Z', '#1d4ed8'),
  fill('M 10.5 -14.6 L 13 -13.8 L -9.5 15.8 L -12.2 15.2 Z', '#dc2626'),
  lines('M 5.5 -15.5 L -17.5 14.2 M 13 -13.8 L -9.5 15.8'),
  // Escudo dorado en el centro de la banda
  '<circle cx="-3.5" cy="-0.5" r="2.6" fill="#eab308" stroke="#92400e" stroke-width="0.7"/>',
  '<circle cx="-3.5" cy="-0.5" r="1.2" fill="#dc2626"/>',
]);

// ===========================================================================
// 3. ABELARDO (cabeza "cabezón" hecha con la caricatura de referencia)
// ===========================================================================

// La caricatura (ver abelardoCara.ts), en las coordenadas de la cabeza: el pelo arriba en y -46 y la barbilla en y 41,
// donde va la del juego. Sin cuello: debajo de la barba ya está el cuello del saco. Antes era una cabeza dibujada a mano
// con trazos
const abelardoFullHead = svg('AbelardoFullHeadSvg', 160, 170, [
  `<image href="${ABELARDO_FACE}" x="-28" y="-46" width="58.4" height="100" preserveAspectRatio="none"/>`,
]);

// Modo Petro vs Abelardo: la cabeza de cada jefe como imagen, recortada a la cara (de x -46 a 46 y de y -59 a 57 desde
// su centro), para la barra de arriba. El retrato que dibuja renderer.ts no sirve: usa las piezas del muñeco estático,
// sin estas cabezas
const faceImage = (head: Svg) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(head.svg.replace('width="160px" height="170px"', 'viewBox="34 26 92 116"'))}`;
export const CHIEF_FACES = { petro: faceImage(petroFullHead), abelardo: faceImage(abelardoFullHead) };

// Torso de Abelardo: traje de cachaco bogotano, de paño oscuro con rayas finas (diplomáticas), chaleco gris con sus
// botones, camisa blanca, corbata oscura y pañuelo blanco en el bolsillo. El saco, las mangas y el pantalón se tiñen con
// los colores de ABELARDO_LOOK; esto son los detalles del pecho
const abelardoTorso = svg('AbelardoTorsoSvg', 60, 50, [
  // Rayas diplomáticas del saco
  '<path d="M -15 -14 L -15.5 15 M -12 -13 L -12.5 15 M -9 -12 L -9.5 15 M -3 -12 L -3.5 15 M 0 -13 L -0.5 15 M 3 -12 L 2.5 15 M 6 -11 L 5.5 15 M 9 -10 L 8.5 15 M 12 -9 L 11.5 15" fill="none" stroke="#c9ccd6" stroke-opacity="0.22" stroke-width="0.5"/>',
  // Chaleco gris en la abertura del saco, con dos botones
  fill('M -12.2 -14.5 L -1 -15 L -3.6 0 L -6.8 6 L -10 0 Z', '#5a5d66'),
  '<circle cx="-6.8" cy="-0.6" r="0.7" fill="#16171b"/><circle cx="-6.8" cy="2.6" r="0.7" fill="#16171b"/>',
  // Camisa blanca, por encima del chaleco
  fill('M -12 -16 L -1 -16.5 L -5 -4 L -8.6 -4 Z', '#ffffff'),
  // Corbata oscura (vinotinto), metida en el chaleco
  fill('M -8.3 -13 L -5.3 -13 L -4.9 -3.2 L -6.7 -1.6 L -8.6 -3.2 Z', '#4a1520'),
  fill('M -8.1 -13.2 L -5.5 -13.2 L -6 -11.6 L -7.6 -11.6 Z', '#2e0c13'),
  // Cuello de la camisa
  fill('M -12.5 -16 L -7 -11.5 L -5 -14 L -9.5 -16.5 Z M -0.5 -16.5 L -5 -14 L -2.5 -11 L 2 -15 Z', '#ffffff'),
  stroke('M -12.5 -16 L -7 -11.5 L -5 -14 M -0.5 -16.5 L -5 -14 L -2.5 -11', '#5b5e68', 0.8),
  // Solapas del saco, del mismo paño oscuro, con su borde
  fill(
    'M -12.5 -16 L -16 -8.5 L -12.5 -8 L -13.5 -5.5 L -6.8 6 L -9.6 -6 Z M -0.5 -16.5 L 5 -8.5 L 1 -8 L 2 -5.5 L -6.8 6 L -3.8 -6 Z',
    '#2b2d33',
  ),
  stroke(
    'M -12.5 -16 L -16 -8.5 L -12.5 -8 L -13.5 -5.5 L -6.8 6 L 2 -5.5 L 1 -8 L 5 -8.5 L -0.5 -16.5 M -6.8 6 L -7.5 15',
    '#121317',
    0.9,
  ),
  // Botón del saco y pañuelo blanco en el bolsillo del pecho
  '<circle cx="-7.2" cy="9.5" r="0.75" fill="#121317"/>',
  fill('M 2.2 -7.2 L 6.4 -7.8 L 5.6 -6.2 L 4.6 -5.1 L 3.6 -6.1 Z', '#ffffff'),
  stroke('M 1.8 -6.6 L 6.8 -7.3', '#121317', 0.7),
]);

// ===========================================================================
// REGISTRO E INSTALACIÓN EN LOS SÍMBOLOS DEL MUÑECO
// ===========================================================================

// Cada pieza en un símbolo con su color, como las del juego: el pelo se tiñe con el del pelo y los párpados y la nariz,
// con el de la piel. Las pupilas, la boca, las gafas y los detalles del traje conservan sus colores propios
const wrap = (name: string, colorIdx: string | null, part: Svg): LaBruteSymbol => ({
  type: 'symbol',
  name,
  ...(colorIdx ? { colorIdx } : {}),
  parts: [part],
  frames: [[{ type: 'svg', name: part.name }]],
});

const HEAD_PARTS = [
  // Chuck
  wrap('ChuckHairFront', '_col1a', front),
  wrap('ChuckBrows', '_col1d', brows),
  wrap('ChuckLids', '_col0', lids),
  wrap('ChuckPupils', null, pupils),
  wrap('ChuckNose', '_col0', nose),
  wrap('ChuckMustache', '_col1c', mustache),
  wrap('ChuckMouth', null, mouth),
  wrap('ChuckBeard', '_col1', beard),
  wrap('ChuckHairBack', '_col1b', back),
  // Petro y Abelardo (cabezas caricaturescas completas estilo "cabezón")
  wrap('PetroFullHead', null, petroFullHead),
  wrap('AbelardoFullHead', null, abelardoFullHead),
];

const TORSO_PARTS = [
  wrap('PetroTorso', null, petroTorso),
  wrap('AbelardoTorso', null, abelardoTorso),
  wrap('GuayaberaTorso', null, guayaberaTorso),
];

// Clona una pieza de ropa cambiando su color (_col2 -> _col3b para que el pantalón tenga su propio color separado de la
// camisa/chaqueta sin alterar _col3, que tiñe el iris de los ojos)
const recolorSymbol = (part: LaBruteSymbol, name: string, colorIdx: string): LaBruteSymbol => ({
  ...part,
  name,
  ...(part.colorIdx ? { colorIdx } : {}),
  parts: part.parts?.map((sub) => (sub.type === 'symbol' && sub.colorIdx ? { ...sub, colorIdx } : sub)),
});

// Convierte el SVG de las botas del juego (Symbol181 / Symbol111) en zapatos de vestir teñibles con _col4a
const makeShoeSymbol = (footSym: LaBruteSymbol, bootSymName: string, newName: string): LaBruteSymbol | null => {
  const bootSym = footSym.parts?.find((p) => p.name === bootSymName) as LaBruteSymbol | undefined;
  const bootSvg = bootSym?.parts?.find((p) => p.type === 'svg') as Svg | undefined;
  if (!bootSvg) return null;
  const recoloredSvg: Svg = {
    ...bootSvg,
    name: `${newName}Svg`,
    svg: bootSvg.svg
      .replace(/fill="#(?:cccccc|cc9900|996600)"/gi, 'fill="#ffffff"')
      .replace(/fill="#(?:764701|ad8000)"/gi, 'fill="#d6baba"'),
  };
  return wrap(newName, '_col4a', recoloredSvg);
};

const CUSTOM_PREFIXES = ['Chuck', 'Petro', 'Abelardo', 'Suit'];

// Mete los peinados en la cabeza del muñeco (Symbol410) y los atuendos en las piezas de ropa (_p7).
let installed = false;
export function installChuck() {
  if (installed) return;
  installed = true;
  const heads = new Set<LaBruteSymbol>();
  const clothes = new Set<LaBruteSymbol>();
  const seen = new Set<object>();
  const stack: unknown[] = Object.values(Symbols);
  while (stack.length) {
    const item = stack.pop() as LaBruteSymbol | Svg | Record<string, unknown> | undefined;
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    // (el módulo entero, si llega como un objeto más: su contenido)
    if (!('type' in item)) {
      stack.push(...Object.values(item));
      continue;
    }
    if (item.type !== 'symbol') continue;
    if (item.name === 'Symbol410') heads.add(item);
    if (item.partIdx === '_p7') clothes.add(item);
    stack.push(...(item.parts ?? []));
  }

  for (const head of heads) {
    const frames = head.frames ?? [];
    const of = (name: string): FramePart => ({
      ...(frames[3]?.find((part) => part.name === name) ?? { type: 'symbol', name }),
    });
    head.parts = [
      ...(head.parts ?? []).filter((part) => !CUSTOM_PREFIXES.some((p) => part.name.startsWith(p))),
      ...HEAD_PARTS,
    ];
    // (de arriba abajo; los párpados y la nariz, sombreados como la cara)
    const skin = { colorOffset: { r: -16, g: -50, b: -80 } };
    frames[CHUCK_HEAD] = [
      { type: 'symbol', name: 'ChuckHairFront' },
      of('Symbol377'),
      { type: 'symbol', name: 'ChuckBrows' },
      { type: 'symbol', name: 'ChuckLids', ...skin },
      { type: 'symbol', name: 'ChuckPupils' },
      of('Symbol360'),
      { type: 'symbol', name: 'ChuckNose', ...skin },
      { type: 'symbol', name: 'ChuckMustache' },
      { type: 'symbol', name: 'ChuckMouth' },
      { type: 'symbol', name: 'ChuckBeard' },
      of('Symbol344'),
      { type: 'symbol', name: 'ChuckHairBack' },
    ];
    // Petro y Abelardo usan su propia cabeza caricaturesca completa ("cabezón", escalada 1.25x sobre el pivote del
    // cuello) con piel uniforme, facciones proporcionadas y sin la máscara bicolor de Symbol344
    const cabezon = { a: 1.25, d: 1.25, tx: 0, ty: -4 };
    frames[PETRO_HEAD] = [{ type: 'symbol', name: 'PetroFullHead', transform: cabezon }];
    frames[ABELARDO_HEAD] = [{ type: 'symbol', name: 'AbelardoFullHead', transform: cabezon }];
    head.frames = frames;
  }

  // Ropa (_p7): los atuendos PETRO_OUTFIT (7) y ABELARDO_OUTFIT (8) parten del traje de manga larga (6), con detalles
  // propios en el pecho (Symbol339), pantalón teñido con _col3b y zapatos de vestir teñidos con _col4a
  const PANTS_PARTS: Record<string, string> = {
    Symbol274: 'Symbol267',
    Symbol239: 'Symbol149',
    Symbol173: 'Symbol149',
    Symbol215: 'Symbol214',
    Symbol206: 'Symbol124',
    Symbol143: 'Symbol124',
  };
  for (const cloth of clothes) {
    const frames = cloth.frames ?? [];
    const baseFrame = frames[6] ? frames[6].map((fp) => ({ ...fp })) : [];
    cloth.parts = (cloth.parts ?? []).filter((part) => !CUSTOM_PREFIXES.some((p) => part.name.startsWith(p)));

    if (cloth.name === 'Symbol339') {
      cloth.parts.push(...TORSO_PARTS);
      frames[PETRO_OUTFIT] = [{ type: 'symbol', name: 'PetroTorso' }, ...baseFrame];
      frames[ABELARDO_OUTFIT] = [{ type: 'symbol', name: 'AbelardoTorso' }, ...baseFrame];
      frames[GUAYABERA_OUTFIT] = [{ type: 'symbol', name: 'GuayaberaTorso' }, ...baseFrame];
    } else if (cloth.name === 'Symbol102') {
      // En Symbol102 hay dos Symbol82 (el primero _col0 y el segundo _col2); le damos nombre propio al de la manga
      const sleevePart = [...cloth.parts].reverse().find((p) => p.name === 'Symbol82') as LaBruteSymbol | undefined;
      if (sleevePart) {
        cloth.parts.push(recolorSymbol(sleevePart, 'SuitBackSleeve', '_col2'));
        const customFrame = baseFrame.map((fp, i) => (i === 0 ? { ...fp, name: 'SuitBackSleeve' } : fp));
        frames[PETRO_OUTFIT] = customFrame;
        frames[ABELARDO_OUTFIT] = [...customFrame];
        frames[GUAYABERA_OUTFIT] = [...customFrame];
      } else {
        frames[PETRO_OUTFIT] = baseFrame;
        frames[ABELARDO_OUTFIT] = [...baseFrame];
        frames[GUAYABERA_OUTFIT] = [...baseFrame];
      }
    } else if (cloth.name in PANTS_PARTS) {
      const targetName = PANTS_PARTS[cloth.name]!;
      const origPart = cloth.parts.find((p) => p.name === targetName) as LaBruteSymbol | undefined;
      if (origPart) {
        const pantsPartName = `SuitPants_${targetName}`;
        cloth.parts.push(recolorSymbol(origPart, pantsPartName, '_col3b'));
        const customFrame = baseFrame.map((fp) => (fp.name === targetName ? { ...fp, name: pantsPartName } : fp));
        frames[PETRO_OUTFIT] = customFrame;
        frames[ABELARDO_OUTFIT] = [...customFrame];
        frames[GUAYABERA_OUTFIT] = [...customFrame];
      } else {
        frames[PETRO_OUTFIT] = baseFrame;
        frames[ABELARDO_OUTFIT] = [...baseFrame];
        frames[GUAYABERA_OUTFIT] = [...baseFrame];
      }
    } else if (cloth.name === 'Symbol189' || cloth.name === 'Symbol120') {
      const bootName = cloth.name === 'Symbol189' ? 'Symbol185' : 'Symbol115';
      const shoeSymName = cloth.name === 'Symbol189' ? 'SuitShoeRight' : 'SuitShoeLeft';
      const shoeSym = makeShoeSymbol(cloth, bootName, shoeSymName);
      if (shoeSym) {
        cloth.parts.push(shoeSym);
        frames[PETRO_OUTFIT] = [{ type: 'symbol', name: shoeSymName }];
        frames[ABELARDO_OUTFIT] = [{ type: 'symbol', name: shoeSymName }];
        frames[GUAYABERA_OUTFIT] = [{ type: 'symbol', name: shoeSymName }];
      } else {
        frames[PETRO_OUTFIT] = baseFrame;
        frames[ABELARDO_OUTFIT] = [...baseFrame];
        frames[GUAYABERA_OUTFIT] = [...baseFrame];
      }
    } else {
      frames[PETRO_OUTFIT] = baseFrame;
      frames[ABELARDO_OUTFIT] = [...baseFrame];
      frames[GUAYABERA_OUTFIT] = [...baseFrame];
    }
    cloth.frames = frames;
  }
}
