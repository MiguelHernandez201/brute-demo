// Demo battle royale: ultimates. Cada brute tiene una (botón en su fila de la lista) que golpea a varios rivales a la
// vez, sean o no de su duelo. Son versiones mucho más fuertes de técnicas del juego, hechas para eliminar a varios de
// golpe, y están equilibradas entre sí: todas quitan en total más o menos lo mismo (ver las constantes y el README):
// - Diluvio total: una lluvia de armas cae sobre varios rivales, más armas y durante más rato que el Diluvio
// - Lluvia de bombas: caen bombas del cielo, cada una sobre uno o dos rivales
// - Prisa en cadena: embiste a varios rivales, uno detrás de otro
// - Súper gigante: crece 15 s (daño x2 y recibe la mitad) y cada ataque suelta una onda que alcanza a la vez a los más
//   cercanos (la suelta la animación cuando le ve atacar, ver cleave)
import {
  AchievementsStore, FightStep, randomBetween, Tiered, Weapon, WeaponByName, weapons,
} from '@labrute/core';
import { WeaponName } from '@labrute/prisma';
import { DetailedFight, DetailedFighter } from './generateFight';
import { getDamage } from './getDamage';
import { Stats, registerHit } from './fightMethods';

export const ULTIMATES = ['flood', 'bombs', 'haste', 'giant'] as const;
export type Ultimate = typeof ULTIMATES[number];

// Diluvio total: armas que caen en total, sobre como mucho tantos rivales, y cuánto más pega cada una
const FLOOD_THROWS = 16;
const FLOOD_TARGETS = 8;
const FLOOD_FACTOR = 1.5;
// Lluvia de bombas: bombas, y daño de cada una a cada rival que alcanza
const BOMBS = 7;
const BOMB_DAMAGE: [number, number] = [36, 56];
// Prisa en cadena: embestidas (si hay menos rivales, vuelve a por los primeros) y cuánto más pega cada una
const HASTE_HITS = 8;
const HASTE_FACTOR = 5;
// Súper gigante: segundos de pelea que dura (los cuenta la animación, ver endGiant) y, en cada ataque, rivales que
// alcanza la onda además del suyo y con qué parte del daño de un golpe normal (luego x2, como todo lo que pega de gigante)
export const GIANT_SECONDS = 15;
const CLEAVE_TARGETS = 3;
const CLEAVE_FACTOR = 1.65;

type Ultimates = { giant?: boolean };
const state = (f: DetailedFighter) => f as DetailedFighter & { demoUlt?: Ultimates; demoGiant?: boolean };

// Rivales en pie: todos, no solo los de su duelo
const rivals = (fd: DetailedFight, caster: DetailedFighter) => fd.fighters.filter((f) => f.type === 'brute'
  && !f.master && f.hp > 0 && !f.arrivesAtInitiative && f.team !== caster.team);
const shuffle = <T>(items: T[]) => items
  .map((item) => ({ item, key: Math.random() }))
  .sort((a, b) => a.key - b.key)
  .map(({ item }) => item);
const WEAPON_NAMES = Object.keys(weapons) as WeaponName[];
const randomWeapon = (): Tiered<Weapon> => {
  const name = WEAPON_NAMES[Math.floor(Math.random() * WEAPON_NAMES.length)] ?? WeaponName.sword;
  return { ...weapons[name], tier: 1 };
};

type Hit = { fightData: DetailedFight; stats: Stats; achievements: AchievementsStore; fighter: DetailedFighter };
// Golpe de ultimate a uno o varios rivales, con el paso que la anima
const strike = (
  { fightData, stats, achievements, fighter }: Hit,
  opponents: DetailedFighter[],
  damage: number,
  step: (damage: Record<number, number>) => FightStep,
  criticalHit = false,
) => registerHit({
  fightData, stats, achievements, fighter, opponents, damage, criticalHit, thrown: true, source: 'ultimate', customStep: step,
});

// Lanza la ultimate `kind` del brute. Devuelve false si no hay a quién darle
export const castUltimate = (
  fightData: DetailedFight,
  stats: Stats,
  achievements: AchievementsStore,
  caster: DetailedFighter,
  kind: Ultimate,
) => {
  const targets = shuffle(rivals(fightData, caster));
  if (!targets.length) return false;
  const chaos = false;
  const hit: Hit = { fightData, stats, achievements, fighter: caster };
  // `id`: esta ultimate (para la animación, que lleva la cuenta de sus golpes)
  const id = fightData.steps.length;
  fightData.steps.push({ a: 'demoUltimate', f: caster.index, k: kind } as never);
  // Pasos de la serie (armas, bombas o embestidas): al final se numeran (`k` de `n`). La animación los reparte en el
  // tiempo y sabe cuándo ha acabado aunque algún rival caiga antes de tiempo
  const series: { id: number; k: number; n: number }[] = [];
  const add = (step: object) => {
    series.push(step as { id: number; k: number; n: number });
    return step as FightStep;
  };

  switch (kind) {
    case 'flood': {
      const aimed = targets.slice(0, FLOOD_TARGETS);
      for (let k = 0; k < FLOOD_THROWS; k++) {
        const target = aimed[k % aimed.length];
        if (!target || target.hp <= 0) continue;
        const weapon = randomWeapon();
        const damage = Math.max(1, Math.floor(getDamage(chaos, caster, target, weapon).damage * FLOOD_FACTOR));
        strike(hit, [target], damage, (d) => add({
          a: 'demoFlood', f: caster.index, t: target.index, w: WeaponByName[weapon.name], d: d[target.index] ?? damage,
        }));
      }
      break;
    }
    case 'bombs': {
      let next = 0;
      for (let k = 0; k < BOMBS; k++) {
        // Cada bomba, sobre uno o dos de los que siguen en pie, repartidas para que les toque a todos
        const alive = targets.filter((t) => t.hp > 0);
        if (!alive.length) break;
        const victims = [...new Set([alive[next % alive.length], ...(Math.random() < 0.5 ? [alive[(next + 1) % alive.length]] : [])])]
          .filter((t): t is DetailedFighter => !!t);
        next += victims.length;
        const damage = randomBetween(...BOMB_DAMAGE);
        strike(hit, victims, damage, (d) => add({ a: 'demoBomb', f: caster.index, t: victims.map((v) => v.index), d }));
      }
      break;
    }
    case 'haste': {
      for (let k = 0; k < HASTE_HITS; k++) {
        const alive = targets.filter((t) => t.hp > 0);
        const target = alive[k % Math.max(1, alive.length)];
        if (!target) break;
        const { damage: base, criticalHit } = getDamage(chaos, caster, target);
        const damage = Math.max(1, Math.floor(base * HASTE_FACTOR) + Math.floor(caster.speed / 2));
        strike(hit, [target], damage, (d) => add({
          a: 'demoHaste', b: caster.index, t: target.index, d: d[target.index] ?? damage, c: criticalHit ? 1 : 0,
        }), criticalHit);
      }
      break;
    }
    case 'giant': {
      const me = state(caster);
      me.demoGiant = true;
      me.demoUlt = { ...me.demoUlt, giant: true };
      fightData.steps.push({ a: 'demoGiant', f: caster.index, u: 1 } as never);
      break;
    }
    default:
      return false;
  }
  series.forEach((step, k) => {
    step.id = id;
    step.k = k;
    step.n = series.length;
  });
  return true;
};

// Se acaba el Súper gigante del brute `index` (la animación cuenta sus segundos). False si ya no lo era
export const endGiant = (fightData: DetailedFight, index: number) => {
  const giant = fightData.fighters.find((f) => f.index === index && f.type === 'brute' && !f.master);
  const s = giant && state(giant);
  if (!giant || !s?.demoUlt?.giant) return false;
  s.demoUlt.giant = false;
  s.demoGiant = false;
  if (giant.hp > 0) fightData.steps.push({ a: 'demoGiantEnd', f: giant.index } as never);
  return true;
};

// Onda del Súper gigante `index` (la animación la suelta cuando le ve atacar): alcanza a los primeros de `candidates`
// (los más cercanos en la arena) que sigan en pie, hasta CLEAVE_TARGETS. Devuelve a quiénes, cuánto les quita y si
// caen (`k`). No alcanza a quien está atrapado en una red o aturdido: la animación da los golpes que no matan sin parar
// a nadie, y a esos el golpe les soltaría
export const cleave = (
  fightData: DetailedFight,
  stats: Stats,
  achievements: AchievementsStore,
  index: number,
  candidates: number[],
) => {
  const giant = fightData.fighters.find((f) => f.index === index && f.type === 'brute' && !f.master);
  if (!giant || giant.hp <= 0 || !state(giant).demoUlt?.giant) return [];
  const alive = rivals(fightData, giant).filter((f) => !f.trapped && !f.stunned);
  const others = candidates
    .map((c) => alive.find((f) => f.index === c))
    .filter((f): f is DetailedFighter => !!f)
    .slice(0, CLEAVE_TARGETS);
  return others.map((other) => {
    const before = other.hp;
    const damage = Math.max(1, Math.floor(getDamage(false, giant, other).damage * CLEAVE_FACTOR));
    const step = { a: 'demoCleaveHit', f: giant.index, t: other.index, d: damage };
    strike({ fightData, stats, achievements, fighter: giant }, [other], damage, (d) => {
      step.d = d[other.index] ?? damage;
      return step as never;
    });
    // Si sobrevive (habilidad), lo que de verdad le quitó
    if (other.hp > 0) step.d = Math.min(step.d, before - other.hp);
    return { t: other.index, d: step.d, k: other.hp <= 0 ? 1 : 0 };
  });
};
