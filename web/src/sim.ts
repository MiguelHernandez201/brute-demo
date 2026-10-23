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
import { FightSession } from './engine/session';
import { BoostTier, ULTIMATES, Ultimate, boostCasts } from './engine/ultimates';
import { genderOfName } from './genderNames';

// Aspecto fijo de un personaje especial (ver chuck.ts): sexo, cuerpo y colores
export type BruteLook = { gender: 'male' | 'female'; body: string; colors: string };

// `wanted`: el sexo, si se sabe (si no, al azar). `look`: todo el aspecto (si no, al azar)
function randomBruteData(name: string, level: number, wanted?: 'male' | 'female', look?: BruteLook) {
  const gender = look?.gender ?? wanted ?? (Math.random() > 0.5 ? 'male' : 'female');
  let data: any = getBruteToSave({
    id: undefined,
    name,
    gender,
    body: look?.body ?? getRandomBody(gender as any),
    colors: look?.colors ?? getRandomColors(gender as any),
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

// Los brutes salen sin mascotas: se quitan las que traiga y se le devuelve la vida que restaban. Las mascotas y las
// pociones siguen en el motor (FightSession.applyPurchase) y en la animación, aunque ahora nada las da
function stripPets(data: any) {
  const tiers = new Map<string, number>();
  data.pets.forEach((p: string) => tiers.set(p, (tiers.get(p) ?? 0) + 1));
  tiers.forEach((tier, p) => {
    data.hpModifier += (pets as any)[p].hpMalus[tier - 1] ?? 0;
  });
  data.pets = [];
  data.hpValue = getBruteHP(data);
}

export function makeBrute(name: string, id: string, gender?: 'male' | 'female', look?: BruteLook) {
  const data: any = randomBruteData(name, 5, gender, look);
  stripPets(data);
  // Garantiza al menos un arma
  if (!data.weapons.length)
    data.weapons = [Object.keys(weapons)[Math.floor(Math.random() * Object.keys(weapons).length)]];
  return { ...data, id, name, userId: id, eventId: null, ranking: data.ranking ?? 10, deletedAt: null };
}

let seq = 0; // ids únicos: el renderer cachea las imágenes por id

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
// Aquí no hay mascotas, así que nunca podían usarse. Si un brute sale con
// alguna se genera otro entero: así recibe otra mejora que sí le sirva y sus estadísticas quedan coherentes
const ROYALE_DISABLED_SKILLS = ['tamer', 'treat'];
function makeRoyaleBrute(name: string, id: string, gender?: 'male' | 'female', look?: BruteLook) {
  let brute = makeBrute(name, id, gender, look);
  for (let i = 0; i < 50 && brute.skills.some((s: string) => ROYALE_DISABLED_SKILLS.includes(s)); i++) {
    brute = makeBrute(name, id, gender, look);
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
  // Ultimate de cada potenciador: cada brute la saca de su propia bolsa con las cuatro barajadas, que se rellena al
  // vaciarse. Así cambia en cada lanzamiento y no repite hasta haberlas lanzado todas (tampoco seguidas al rellenarla)
  const bags = new Map<number, Ultimate[]>();
  const lastUltimate = new Map<number, Ultimate>();
  const bagOf = (index: number) => {
    let bag = bags.get(index);
    if (!bag?.length) {
      bag = [...ULTIMATES].sort(() => Math.random() - 0.5);
      if (bag[0] === lastUltimate.get(index)) bag.push(bag.shift() as Ultimate);
      bags.set(index, bag);
    }
    return bag;
  };
  const isGiant = (index: number) =>
    !!(session.fightData.fighters.find((f) => f.index === index) as { demoGiant?: boolean } | undefined)?.demoGiant;
  // Orden en que se prueban (si la que le toca no puede salir ahora: sin rivales solo sale el Súper gigante): la que le
  // toca, el resto de su bolsa y las demás; al final, la última que lanzó (así no la repite) y el gigante si ya lo es
  // (solo le alargaría el tiempo)
  const ultimateOrder = (index: number) => {
    const bag = bagOf(index);
    const others = ULTIMATES.filter((k) => !bag.includes(k)).sort(() => Math.random() - 0.5);
    const late = (k: Ultimate) => (k === 'giant' && isGiant(index) ? 2 : k === lastUltimate.get(index) ? 1 : 0);
    return [...bag, ...others].sort((a, b) => late(a) - late(b));
  };

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
    // La ronda no termina sola: con uno solo en pie el motor espera (null) a que entre otro brute o se acabe el tiempo.
    // `hold`: luchadores que esperan a que acabe de verse su turno anterior (ver session.playTurn); si esperan todos,
    // también null
    pullSteps: async (_drained?: boolean, hold?: (index: number) => boolean) => {
      if (session.winner) return false;
      if (session.finished) return null;
      if (session.playTurn(hold) === null) return null;
      takeResult();
      return true;
    },
    // Fin por tiempo: cierra ya la pelea con el ganador que elige la animación
    endNow: (winnerIndex: number) => {
      if (!session.endRoyaleNow(winnerIndex)) return false;
      takeResult();
      return true;
    },
    // Potenciadores de cada brute (regalos y botones de su fila, ver engine/ultimates.BoostTier): salvo el 1, lanzan
    // una ultimate (la que le toque de su bolsa, ver ultimateOrder) y le dan vida, arma, aura de ki y mascota según el
    // nivel. Se juegan ya en el motor y la animación los muestra en cuanto puede (`wake` la avisa, ver setupFight). La
    // mascota dura un minuto: la animación avisa al acabar. `hp`: la vida, si no es la de su nivel (regalos grandes)
    castBoost: (index: number, tier: BoostTier, hp?: number) => {
      if (fight.timeUp) return false;
      // También a quien en el motor ya cayó pero en pantalla aún no: le salva (ver session.castBoost)
      const rescuable = (i: number) => !!fight.rescuable?.(i);
      const casts = boostCasts(tier);
      const kind = casts
        ? ultimateOrder(index).find((k) => session.canCastBoost(index, k, tier, rescuable, hp))
        : undefined;
      if ((casts && !kind) || !session.castBoost(index, kind, tier, rescuable, hp)) return false;
      if (kind) {
        const rest = bagOf(index).filter((k) => k !== kind);
        bags.set(index, rest);
        lastUltimate.set(index, kind);
      }
      fight.liveSteps.push(...session.takeNewSteps());
      fight.wake?.();
      return true;
    },
    endPet: (index: number) => {
      if (fight.timeUp || !session.endPet(index)) return false;
      fight.liveSteps.push(...session.takeNewSteps());
      fight.wake?.();
      return true;
    },
    // Súper gigante: lo llama la animación cuando le ve atacar (su onda alcanza a los más cercanos de `candidates`;
    // devuelve a quiénes, cuánto les quita y si caen) y cuando pasan sus segundos. Los golpes que no matan los anima
    // ella misma en ese momento; los que rematan (y su caída) van con el resto de pasos
    cleave: (index: number, candidates: number[]) => {
      if (fight.timeUp) return [];
      const hits = session.cleave(index, candidates);
      const killed = new Set(hits.filter((h) => h.k).map((h) => h.t));
      const steps = session.takeNewSteps().filter((s: any) => s.a !== 'demoCleaveHit' || killed.has(s.t));
      if (steps.length) {
        fight.liveSteps.push(...steps);
        fight.wake?.();
      }
      return hits;
    },
    endGiant: (index: number) => {
      if (fight.timeUp || !session.endGiant(index)) return false;
      fight.liveSteps.push(...session.takeNewSteps());
      fight.wake?.();
      return true;
    },
    // Minigun del potenciador 3: la animación avisa cuando pasan sus segundos
    endMinigun: (index: number) => {
      if (fight.timeUp || !session.endMinigun(index)) return false;
      fight.liveSteps.push(...session.takeNewSteps());
      fight.wake?.();
      return true;
    },
    // Botón "Agregar brute": entra uno nuevo en plena pelea. Devuelve sus datos para la lista (null si ya acabó). Con
    // `wanted`, con ese nombre (un espectador que se une, ver el panel de regalos en main.js); si no, uno al azar
    canAddBrute: () => !fight.timeUp && session.canAddRoyaleBrute(),
    addBrute: (wanted?: string, look?: BruteLook) => {
      if (!fight.canAddBrute()) return null;
      const name = wanted?.trim().slice(0, 24) || royaleName(used);
      // (el de un espectador, del sexo de su nombre si lleva uno conocido: ver genderNames; con `look`, ese aspecto)
      const gender = wanted ? genderOfName(name) : undefined;
      const brute = makeRoyaleBrute(name, `royale-${brutes.length + 1}-${++seq}`, gender, look);
      const added = session.addRoyaleBrute(getCalculatedBrute(brute, modifiers) as any);
      if (!added) return null;
      used.add(name);
      brutes.push(brute);
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
