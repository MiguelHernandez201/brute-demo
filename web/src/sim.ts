// Genera brutes aleatorios y peleas en memoria con el motor original de LaBrute (sin base de datos).
// La pelea se simula turno a turno (engine/session.ts) para que las compras entren en el siguiente turno.
import {
  createRandomBruteStats,
  getBruteToSave,
  getCalculatedBrute,
  getLevelUpChoices,
  getRandomBody,
  getRandomColors,
  FIGHTS_PER_DAY,
  weapons,
  getBruteHP,
  pets,
} from '@labrute/core';
import { updateBruteData } from './engine/updateBruteData';
import { FightSession, Purchase } from './engine/session';

function randomBruteData(name: string, level: number) {
  const gender = Math.random() > 0.5 ? 'male' : 'female';
  let data: any = getBruteToSave({
    id: undefined,
    name,
    gender,
    body: getRandomBody(gender as any),
    colors: getRandomColors(gender as any),
    victories: 0,
    losses: 0,
    pupilsCount: 0,
    lastFight: null,
    fightsFor: 0,
    fightsLeft: FIGHTS_PER_DAY,
    ...createRandomBruteStats(),
  } as any);
  for (let j = 1; j < level; j++) {
    const choices = getLevelUpChoices(data);
    const choice = Math.random() > 0.5 ? choices[0] : choices[1];
    data = { ...data, ...updateBruteData({ ...data, id: '', eventId: null }, choice as any), id: undefined };
  }
  return data;
}

// Las mascotas solo llegan comprándolas: se quitan las que traiga y se le devuelve la vida que restaban
function stripPets(data: any) {
  const tiers = new Map<string, number>();
  data.pets.forEach((p: string) => tiers.set(p, (tiers.get(p) ?? 0) + 1));
  tiers.forEach((tier, p) => {
    data.hpModifier += (pets as any)[p].hpMalus[tier - 1] ?? 0;
  });
  data.pets = [];
  data.hpValue = getBruteHP(data);
}

export function makeBrute(name: string, id: string) {
  const data: any = randomBruteData(name, 5);
  stripPets(data);
  // Garantiza al menos un arma
  if (!data.weapons.length)
    data.weapons = [Object.keys(weapons)[Math.floor(Math.random() * Object.keys(weapons).length)]];
  return { ...data, id, name, userId: id, eventId: null, ranking: data.ranking ?? 10, deletedAt: null };
}

// Guarda la compra en el brute para que el campeón la conserve en las siguientes peleas
function recordPurchase(brute: any, purchase: Purchase) {
  for (const w of purchase.weapons ?? []) brute.weapons.push(w);
  for (const s of purchase.skills ?? []) if (!brute.skills.includes(s)) brute.skills.push(s);
  for (const p of purchase.pets ?? []) {
    brute.pets.push(p);
    // Como en el juego, cada mascota resta un % de vida al brute (se nota desde la siguiente pelea)
    brute.hpModifier -= (pets as any)[p].hpMalus[0] ?? 0;
    brute.hpValue = getBruteHP(brute);
  }
}

let seq = 0; // ids únicos: el renderer cachea las imágenes por id

export type Purchases = { p1: Purchase | null; p2: Purchase | null };

// keep: brutes que se reutilizan (el ganador al "Desafiar")
// takePurchases: se llama antes de cada turno; devuelve lo comprado por cada jugador desde el turno anterior
export function createFight(
  name1: string,
  name2: string,
  keep: { b1?: any; b2?: any },
  takePurchases: () => Purchases,
  onGearChange: (brutes: any[]) => void,
) {
  const modifiers = {};
  const b1 = keep.b1 ?? makeBrute(name1, `player-1-${++seq}`);
  const b2 = keep.b2 ?? makeBrute(name2, `player-2-${++seq}`);
  // carryHp: vida que le quedó al campeón en su última pelea (no se cura entre peleas)
  const session = new FightSession(
    [getCalculatedBrute(b1, modifiers) as any, getCalculatedBrute(b2, modifiers) as any],
    { modifiers, startHp: [b1.carryHp, b2.carryHp] },
  );

  // Objeto "fight" que entiende la animación original, con pasos que se van generando
  const fight: any = {
    id: 'demo',
    background: session.background,
    fighters: JSON.stringify(session.initialAnimationFighters()),
    steps: '[]',
    liveSteps: session.takeNewSteps(),
    winner: null,
    loser: null,
    winnerId: null,
    // La animación lo llama cuando se queda sin pasos: aplica compras y juega el siguiente turno
    pullSteps: async () => {
      if (session.finished) return false;
      const bought = takePurchases();
      let changed = false;
      (
        [
          ['L', 'p1', b1],
          ['R', 'p2', b2],
        ] as const
      ).forEach(([team, p, brute]) => {
        const purchase = bought[p];
        if (purchase && session.applyPurchase(team, purchase)) {
          recordPurchase(brute, purchase);
          changed = true;
        }
      });
      if (changed) onGearChange([b1, b2]);
      session.playTurn();
      if (session.finished) {
        fight.winner = session.winner?.name ?? null;
        fight.loser = session.loser?.name ?? null;
        fight.winnerId = session.winner?.id ?? null;
        fight.loserId = session.loser?.id ?? null;
        // El ganador se lleva a la siguiente pelea la vida que le queda
        const winnerBrute = [b1, b2].find((b) => b.id === session.winner?.id);
        if (winnerBrute && session.winner) winnerBrute.carryHp = Math.max(1, session.winner.hp);
      }
      fight.liveSteps.push(...session.takeNewSteps());
      return true;
    },
  };

  return { brutes: [b1, b2], fight, session };
}

// ---------------------------------------------------------------------------
// Battle royale: N brutes al azar, todos contra todos en la misma arena
const ROYALE_NAMES = [
  'Tritón',
  'Brasa',
  'Colmillo',
  'Rayo',
  'Mazo',
  'Sombra',
  'Trueno',
  'Pólvora',
  'Cuervo',
  'Hierro',
  'Tormenta',
  'Garra',
  'Chispa',
  'Roca',
  'Lince',
  'Volcán',
  'Furia',
  'Escarcha',
  'Titán',
  'Zarpa',
];

export function createRoyale(count: number) {
  const modifiers = {};
  const names = [...ROYALE_NAMES].sort(() => Math.random() - 0.5).slice(0, count);
  const brutes = names.map((name, i) => makeBrute(name, `royale-${i + 1}-${++seq}`));
  const session = new FightSession(
    brutes.map((b) => getCalculatedBrute(b, modifiers) as any),
    { modifiers, royale: true },
  );

  const fight: any = {
    id: 'royale',
    royale: true,
    background: session.background,
    fighters: JSON.stringify(session.initialAnimationFighters()),
    steps: '[]',
    liveSteps: session.takeNewSteps(),
    winner: null,
    loser: null,
    winnerId: null,
    pullSteps: async () => {
      if (session.finished) return false;
      session.playTurn();
      if (session.finished) {
        fight.winner = session.winner?.name ?? null;
        fight.loser = session.loser?.name ?? null;
        fight.winnerId = session.winner?.id ?? null;
        fight.loserId = session.loser?.id ?? null;
      }
      fight.liveSteps.push(...session.takeNewSteps());
      return true;
    },
  };

  return { brutes, fight, session };
}
