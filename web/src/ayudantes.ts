// Ayudantes de los potenciadores grandes (los regalos de 100 y 299 monedas, ver engine/ultimates.boostPet): antes llegaba
// una mascota (perro, pantera u oso) y ahora llega un ayudante, que pelea con su presidente un minuto y se va. El primero
// es José Manuel Restrepo y el segundo, Iván Cepeda: personajes del juego con la cara de la caricatura que pasó el
// usuario (ver chuck.ts y ayudantesCaras.ts). Aquí solo los datos, sin dibujos, para que los use también el motor
export type HelperId = 'restrepo' | 'cepeda';
// Orden en que llegan: el primero que recibe un brute es Restrepo y el segundo, Cepeda (ver session.castBoost)
export const HELPERS: HelperId[] = ['restrepo', 'cepeda'];
export const HELPER_NAMES: Record<HelperId, string> = { restrepo: 'Restrepo', cepeda: 'Cepeda' };
// Cómo se llaman en pantalla (¿Cómo jugar? y las tarjetas de regalos), en lugar de un icono
export const HELPER_LABELS: Record<HelperId, string> = { restrepo: 'Jose Manuel', cepeda: 'Ivan Cepeda' };

// Cabeza (p3) que comparten los dos: el muñeco solo admite 16 peinados, así que lo que cambia de cara es p4, que solo
// cuenta dentro de la cabeza (ver HelperFace en chuck.ts). Y un atuendo (p7) para cada uno
export const HELPER_HEAD = 15;
export const RESTREPO_OUTFIT = 10;
export const CEPEDA_OUTFIT = 11;

// Aspectos (como los de chuck.ts): cuerpo (p1, p1a, p1b, p2, p3, p4, p5, p6, p7, p7b, p8, en hexadecimal) y colores
// (col0..col4b: piel, pelo, saco, pantalón y cinturón/zapatos)
const hex = (n: number) => n.toString(16);
const look = (face: number, outfit: number, skin: string, hair: string, clothes: string[]) => ({
  gender: 'male' as const,
  body: `0000${hex(HELPER_HEAD)}${hex(face)}00${hex(outfit)}00`,
  colors: [...Array<string>(3).fill(skin), ...Array<string>(5).fill(hair), ...clothes].join(''),
});

export const HELPER_LOOKS: Record<HelperId, { gender: 'male'; body: string; colors: string }> = {
  // (saco azul oscuro, camisa blanca abierta y un pin con la bandera de Colombia)
  restrepo: look(0, RESTREPO_OUTFIT, 'e6b394', '1a1818', [
    '23283a',
    '1c2030',
    '161a28',
    '1f2024',
    '2b2f3d',
    '141416',
    '111113',
    '1a1a1a',
  ]),
  // (saco gris sin solapas sobre una camisa blanca de cuello mao)
  cepeda: look(1, CEPEDA_OUTFIT, 'dca381', '3a3330', [
    '5d6065',
    '4c4f54',
    '3f4247',
    '1f2024',
    '34363c',
    '141416',
    '111113',
    '1a1a1a',
  ]),
};
