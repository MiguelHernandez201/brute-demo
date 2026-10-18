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
import { ULTIMATES, Ultimate } from './engine/ultimates';

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
      session.activatePurchased();
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

// Un nombre libre de la lista; si ya se usaron todos (al agregar muchos brutes) se repiten con número: "Rayo 2"
function royaleName(used: Set<string>) {
  for (let n = 1; ; n++) {
    const options = ROYALE_NAMES.map((base) => (n === 1 ? base : `${base} ${n}`)).filter((name) => !used.has(name));
    if (options.length) return options[Math.floor(Math.random() * options.length)]!;
  }
}

// Battle royale: Carroñero (come mascotas caídas) y Golosina (reanima a las propias) están en desuso en este modo.
// Aquí no hay mascotas (solo llegan comprándolas en el 1 vs 1), así que nunca podían usarse. Si un brute sale con
// alguna se genera otro entero: así recibe otra mejora que sí le sirva y sus estadísticas quedan coherentes
const ROYALE_DISABLED_SKILLS = ['tamer', 'treat'];
function makeRoyaleBrute(name: string, id: string) {
  let brute = makeBrute(name, id);
  for (let i = 0; i < 50 && brute.skills.some((s: string) => ROYALE_DISABLED_SKILLS.includes(s)); i++) {
    brute = makeBrute(name, id);
  }
  // Por si acaso (muy improbable tras tantos intentos): sin ellas, que no dan estadísticas
  brute.skills = brute.skills.filter((s: string) => !ROYALE_DISABLED_SKILLS.includes(s));
  return brute;
}

export function createRoyale(count: number) {
  const modifiers = {};
  const used = new Set<string>();
  const brutes = Array.from({ length: count }, (_, i) => {
    const name = royaleName(used);
    used.add(name);
    return makeRoyaleBrute(name, `royale-${i + 1}-${++seq}`);
  });
  const session = new FightSession(
    brutes.map((b) => getCalculatedBrute(b, modifiers) as any),
    { modifiers, royale: true },
  );
  // Ultimate de cada brute (por su número de luchador). Se sacan de una bolsa con las cuatro, así se reparten por igual
  const ultimates = new Map<number, Ultimate>();
  let bag: Ultimate[] = [];
  const drawUltimate = () => {
    if (!bag.length) bag = [...ULTIMATES].sort(() => Math.random() - 0.5);
    return bag.pop() as Ultimate;
  };
  session.fightData.fighters
    .filter((f) => f.type === 'brute' && !f.master)
    .forEach((f) => ultimates.set(f.index, drawUltimate()));

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
    // Botón "Finalizar": activa el reloj de la arena (royaleClock), que deja en `timeLeft` los segundos que quedan y
    // marca `timeUp` al llegar a cero. Solo entonces termina la ronda (ver endNow)
    finishing: false,
    timeLeft: null,
    timeUp: false,
    // La ronda no termina sola: con uno solo en pie el motor espera (null) a que entre otro brute o se acabe el tiempo
    pullSteps: async () => {
      if (session.winner) return false;
      if (session.finished) return null;
      session.playTurn();
      takeResult();
      return true;
    },
    // Fin por tiempo: cierra ya la pelea con el ganador que elige la animación
    endNow: (winnerIndex: number) => {
      if (!session.endRoyaleNow(winnerIndex)) return false;
      takeResult();
      return true;
    },
    // Botón de ultimate de cada brute (ver engine/ultimates): se juega ya en el motor y la animación la muestra en
    // cuanto puede (`wake` la avisa, ver setupFight)
    ultimateOf: (index: number) => ultimates.get(index),
    castUltimate: (index: number) => {
      const kind = ultimates.get(index);
      if (!kind || fight.timeUp || !session.castUltimate(index, kind)) return false;
      fight.liveSteps.push(...session.takeNewSteps());
      fight.wake?.();
      return true;
    },
    // Súper gigante: lo llama la animación cuando le ve atacar (su onda alcanza a los más cercanos de `candidates`,
    // devuelve a quiénes) y cuando pasan sus segundos
    cleave: (index: number, candidates: number[]) => {
      if (fight.timeUp) return [];
      const hit = session.cleave(index, candidates);
      if (!hit.length) return hit;
      fight.liveSteps.push(...session.takeNewSteps());
      fight.wake?.();
      return hit;
    },
    endGiant: (index: number) => {
      if (fight.timeUp || !session.endGiant(index)) return false;
      fight.liveSteps.push(...session.takeNewSteps());
      fight.wake?.();
      return true;
    },
    // Botón "Agregar brute": entra uno nuevo en plena pelea. Devuelve sus datos para la lista (null si ya acabó)
    canAddBrute: () => !fight.timeUp && session.canAddRoyaleBrute(),
    addBrute: () => {
      if (!fight.canAddBrute()) return null;
      const name = royaleName(used);
      const brute = makeRoyaleBrute(name, `royale-${brutes.length + 1}-${++seq}`);
      const added = session.addRoyaleBrute(getCalculatedBrute(brute, modifiers) as any);
      if (!added) return null;
      used.add(name);
      brutes.push(brute);
      ultimates.set(added.index, drawUltimate());
      // Sus pasos (aparecer y llegar) van solos, antes del siguiente turno
      fight.liveSteps.push(...session.takeNewSteps());
      return { index: added.index, name: added.name, hp: added.hp, maxHp: added.maxHp };
    },
  };

  // Ganador (si ya lo hay) y pasos nuevos para la animación
  function takeResult() {
    if (session.winner) {
      fight.winner = session.winner.name;
      fight.loser = session.loser?.name ?? null;
      fight.winnerId = session.winner.id;
      fight.loserId = session.loser?.id ?? null;
    }
    fight.liveSteps.push(...session.takeNewSteps());
  }

  return { brutes, fight, session };
}
