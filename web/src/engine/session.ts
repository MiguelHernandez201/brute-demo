// Demo: pelea simulada TURNO A TURNO (en vez de generarla entera de golpe como generateFight).
// Así las compras de la tienda (armas, power-ups, mascotas) pueden entrar en mitad de la pelea,
// justo antes del siguiente turno. La lógica de cada turno es la del motor original.
import {
  AchievementsStore, BASE_FIGHTER_STATS, CalculatedBrute, Fighter, FightStep, Modifiers,
  SkillByName, SkillId, StepType, WeaponByName, WeaponId, fightBackgrounds, getPetScaledStat,
  pets, randomBetween, skills, weapons, weightedRandom,
} from '@labrute/core';
import { DetailedFight, DetailedFighter } from './generateFight';
import { getFighters } from './getFighters';
import { applySpy } from './applySpy';
import {
  Stats, checkDeaths, fighterArrives, orderFighters, playFighterTurn, saboteur,
} from './fightMethods';

export type Purchase = { weapons?: string[]; skills?: string[]; pets?: string[]; potions?: number };

// Cada poción cura este % de la vida máxima (y quita el veneno)
const POTION_HEAL = 0.5;

const getTempo = (speed: number) => 0.10 + (20 / Math.max(1, 10 + (speed * 1.5))) * 0.90;

// Versión reducida de un luchador, la que necesita la animación (igual que generateFight)
export const toAnimationFighter = (fighter: DetailedFighter): Fighter => {
  const object: Fighter = {
    id: fighter.id,
    index: fighter.index,
    team: fighter.team,
    name: fighter.name,
    gender: fighter.gender,
    body: fighter.body,
    colors: fighter.colors,
    rank: fighter.rank,
    level: fighter.level,
    pupilsCount: fighter.pupilsCount,
    agility: fighter.agility,
    strength: fighter.strength,
    speed: fighter.speed,
    type: fighter.type,
    master: fighter.master,
    maxHp: fighter.maxHp,
    hp: fighter.hp,
    weapons: Object.values(fighter.weapons).reduce<Partial<Record<WeaponId, number>>>((acc, weapon) => {
      acc[WeaponByName[weapon.name]] = weapon.tier;
      return acc;
    }, {}),
    skills: Object.values(fighter.skills).reduce<Partial<Record<SkillId, number>>>((acc, skill) => {
      acc[SkillByName[skill.name]] = skill.tier;
      return acc;
    }, {}),
    shield: fighter.shield,
  };
  if (fighter.size !== 1) object.size = fighter.size;
  return object;
};

export class FightSession {
  fightData: DetailedFight;

  steps: FightStep[] = [];

  background: string;

  winner: DetailedFighter | null = null;

  loser: DetailedFighter | null = null;

  #stats: Stats = {};

  #achievements: AchievementsStore = {};

  #brutes: CalculatedBrute[];

  #turn = 0;

  #emitted = 0;

  // Battle royale: todos contra todos (cada brute es su propio equipo); gana el último en pie
  royale: boolean;

  // Orden de eliminación (brutes) en el battle royale
  eliminated: DetailedFighter[] = [];

  // startHp: vida con la que empieza cada brute (el campeón arrastra la que le quedó); undefined = llena
  constructor(
    brutes: CalculatedBrute[],
    { modifiers = {}, startHp = [], royale = false }: {
      modifiers?: Modifiers;
      startHp?: (number | undefined)[];
      royale?: boolean;
    } = {},
  ) {
    this.#brutes = brutes;
    this.royale = royale;
    this.background = weightedRandom(fightBackgrounds).name;

    for (const brute of this.#brutes) {
      this.#achievements[brute.id] = { userId: brute.userId, eventId: brute.eventId, achievements: {} };
      this.#stats[brute.id] = { userId: brute.userId };
    }

    let fighters: DetailedFighter[];
    if (!royale) {
      fighters = getFighters({
        team1: { brutes: [brutes[0]], backups: [], bosses: [] },
        team2: { brutes: [brutes[1]], backups: [], bosses: [] },
        modifiers,
      });
    } else {
      // Cada brute (con sus mascotas) forma su propio equipo "T1", "T2"…
      // getFighters numera desde 1 en cada llamada, así que se renumeran los índices
      fighters = [];
      let nextBrute = 1;
      let nextPet = -1;
      brutes.forEach((brute, i) => {
        const own = getFighters({
          team1: { brutes: [brute], backups: [], bosses: [] },
          team2: { brutes: [], backups: [], bosses: [] },
          modifiers,
        });
        for (const f of own) {
          f.team = `T${i + 1}` as never;
          if (f.type === 'pet') {
            f.index = nextPet--;
            f.id = `${f.index}`;
          } else {
            f.index = nextBrute++;
          }
          fighters.push(f);
        }
      });
    }

    // Demo: el ganador no recupera vida entre peleas
    this.#brutes.forEach((brute, i) => {
      const hp = startHp[i];
      const fighter = fighters.find((f) => f.id === brute.id);
      if (fighter && typeof hp === 'number') fighter.hp = Math.max(1, Math.min(fighter.maxHp, Math.round(hp)));
    });

    this.fightData = {
      modifiers,
      fighters,
      initialFighters: JSON.parse(JSON.stringify(fighters)) as DetailedFighter[],
      steps: this.steps,
      initiative: 0,
      winner: null,
      loser: null,
      overtime: false,
    };

    // Llegada de todos, espionaje (1 vs 1) y saboteador, como en generateFight
    fighters.forEach((fighter) => fighterArrives(this.fightData, fighter));
    orderFighters(this.fightData);
    const main = this.fightData.fighters.filter((f) => f.type === 'brute' && !f.master);
    // El espionaje solo existe en el 1 vs 1
    if (main.length === 2) main.forEach((brute) => {
      const opponent = main.find((f) => f.id !== brute.id);
      if (opponent) applySpy(this.fightData, brute, opponent);
    });
    saboteur(this.fightData, this.#achievements);
  }

  get finished() { return !!this.fightData.loser; }

  // Luchadores para la animación al empezar.
  // En el battle royale la animación solo entiende dos lados ('L'/'R'): se reparten alternando
  // y se guarda el equipo real en `realTeam` (la animación cambia de lado según quién ataque a quién).
  initialAnimationFighters() {
    return this.fightData.initialFighters.map((f) => {
      const out = toAnimationFighter(f) as Fighter & { realTeam?: string };
      if (this.royale) {
        const n = parseInt(String(f.team).slice(1), 10);
        out.realTeam = f.team;
        out.team = n % 2 === 1 ? 'L' : 'R';
      }
      return out;
    });
  }

  // Pasos generados desde la última llamada
  takeNewSteps() {
    const out = this.steps.slice(this.#emitted);
    this.#emitted = this.steps.length;
    return out;
  }

  // Juega un turno (o termina la pelea). Devuelve false si ya terminó.
  playTurn() {
    if (this.finished) return false;
    const fd = this.fightData;
    const before = this.steps.length;

    // Algunos turnos no producen pasos: se sigue hasta que haya algo que animar
    while (!fd.loser && this.steps.length === before && this.#turn < 2000) {
      orderFighters(fd);
      const first = fd.fighters[0];
      if (!first) break;
      fd.initiative = first.initiative;
      if (this.#turn > 1000) fd.overtime = true;
      playFighterTurn(fd, this.#stats, this.#achievements);
      checkDeaths(fd, this.#stats);
      if (this.royale) this.#royaleEliminations();
      this.#turn += 1;
    }

    if (fd.loser && !this.winner) this.#finish();
    return true;
  }

  // checkDeaths marca "perdedor" en cuanto cae un equipo. En el royale eso solo es una eliminación:
  // se anota, sus mascotas caen con él y la pelea sigue mientras quede más de un brute en pie.
  #royaleEliminations() {
    const fd = this.fightData;
    if (!fd.loser) return;
    const brutes = fd.fighters.filter((f) => f.type === 'brute' && !f.master);
    for (const b of brutes) {
      if (b.hp <= 0 && !this.eliminated.includes(b)) {
        this.eliminated.push(b);
        fd.fighters.filter((p) => p.master === b.id && p.hp > 0).forEach((p) => { p.hp = 0; });
      }
    }
    const alive = brutes.filter((b) => b.hp > 0);
    if (alive.length > 1) {
      fd.loser = null;
      // Registra la caída de las mascotas de los eliminados (pasos Death)
      checkDeaths(fd, this.#stats);
      fd.loser = null;
    } else {
      // Fin: el perdedor es el último eliminado
      fd.loser = this.eliminated[this.eliminated.length - 1]?.id ?? fd.loser;
    }
  }

  #finish() {
    const fd = this.fightData;
    let loser = fd.fighters.find((f) => f.id === fd.loser);
    if (!loser) throw new Error('No loser found');
    const [b1, b2] = this.#brutes;
    // Royale: si los dos últimos caen en el mismo turno, gana el último en caer
    if (this.royale && !fd.fighters.some((f) => f.type === 'brute' && !f.master && f.hp > 0)) {
      const n = this.eliminated.length;
      const survivor = this.eliminated[n - 1];
      if (survivor) {
        this.eliminated.pop();
        loser = this.eliminated[n - 2] ?? loser;
        survivor.hp = 1;
      }
    }
    const winner = this.royale
      ? fd.fighters.find((f) => f.type === 'brute' && !f.master && f.hp > 0)
      : loser.team === 'L'
        ? fd.fighters.find((f) => f.team === 'R' && f.id === b2.id)
        : fd.fighters.find((f) => f.team === 'L' && f.id === b1.id);
    if (!winner) throw new Error('No winner found');
    fd.winner = winner.id;
    this.winner = winner;
    this.loser = loser;
    this.steps.push({ a: StepType.End, w: winner.index, l: loser.index });
  }

  // Aplica una compra al brute de un equipo antes del siguiente turno.
  // Devuelve pasos "demo" para que la animación lo refleje (HUD y nueva mascota que llega).
  applyPurchase(team: 'L' | 'R', purchase: Purchase) {
    if (this.finished) return false;
    const fd = this.fightData;
    const brute = fd.fighters.find((f) => f.team === team && f.type === 'brute' && !f.master);
    const calculated = this.#brutes[team === 'L' ? 0 : 1];
    if (!brute || !calculated) return false;

    const gear: { weapons: Partial<Record<WeaponId, number>>; skills: Partial<Record<SkillId, number>> } = { weapons: {}, skills: {} };

    for (const name of purchase.weapons ?? []) {
      const existing = brute.weapons[name as keyof typeof brute.weapons];
      const tier = Math.min(3, (existing?.tier ?? 0) + 1);
      brute.weapons[name as keyof typeof brute.weapons] = { ...structuredClone(weapons[name as keyof typeof weapons]), tier } as never;
      gear.weapons[WeaponByName[name as keyof typeof WeaponByName]] = tier;
    }

    for (const name of purchase.skills ?? []) {
      if (brute.skills[name as keyof typeof brute.skills]) continue;
      const skill = { ...structuredClone(skills[name as keyof typeof skills]), tier: 1 } as never as { uses?: number[]; name: string };
      // Bruto Feroz: un uso extra cada 30 de fuerza (como al empezar la pelea)
      if (name === 'fierceBrute' && skill.uses) skill.uses = skill.uses.map((u) => u + Math.floor(brute.strength / 30));
      brute.skills[name as keyof typeof brute.skills] = skill as never;
      gear.skills[SkillByName[name as keyof typeof SkillByName]] = 1;
    }

    if (Object.keys(gear.weapons).length || Object.keys(gear.skills).length) {
      this.steps.push({ a: 'demoGear', f: brute.index, ...gear } as never);
    }

    // Pociones: el brute bebe en el acto y recupera vida
    for (let n = 0; n < (purchase.potions ?? 0); n++) {
      const healed = Math.max(0, Math.min(brute.maxHp - brute.hp, Math.round(brute.maxHp * POTION_HEAL)));
      brute.hp += healed;
      const cured = !!brute.poisonedBy;
      brute.poisonedBy = null;
      this.steps.push({ a: 'demoPotion', b: brute.index, h: healed, c: cured ? 1 : 0 } as never);
    }

    for (const petName of purchase.pets ?? []) {
      const pet = { ...pets[petName as keyof typeof pets], tier: 1 };
      const index = Math.min(0, ...fd.fighters.map((f) => f.index), ...fd.initialFighters.map((f) => f.index)) - 1;
      const s = (stat: Parameters<typeof getPetScaledStat>[3], precision?: number) => getPetScaledStat(false, calculated, pet as never, stat, precision);
      const fighter: DetailedFighter = {
        id: `${index}`,
        index,
        team,
        name: petName,
        rank: 0,
        level: 0,
        type: 'pet',
        master: brute.id,
        maxHp: s('hp'),
        hp: s('hp'),
        strength: s('strength'),
        agility: s('agility'),
        speed: s('speed'),
        criticalChance: BASE_FIGHTER_STATS.criticalChance,
        criticalDamage: BASE_FIGHTER_STATS.criticalDamage,
        regeneration: 0,
        // Entra a jugar enseguida
        initiative: fd.initiative + 0.01 + randomBetween(0, 10) / 1000,
        hitSpeed: 0,
        tempo: getTempo(s('speed')),
        baseDamage: s('damage'),
        counter: s('counter', 2),
        combo: s('combo', 2),
        deflect: 0,
        reversal: s('counter', 2),
        block: s('block', 2),
        accuracy: s('accuracy', 2),
        reach: 0,
        armor: 0,
        disarm: s('disarm', 2),
        weaponGrip: 0,
        sabotage: 0,
        evasion: s('evasion', 2),
        determination: 0,
        resistant: 0,
        ironHead: 0,
        size: 1,
        bodybuilder: false,
        survival: false,
        balletShoes: false,
        retryAttack: false,
        fastMetabolism: null,
        skills: {},
        weapons: {},
        shield: false,
        activeSkills: [],
        activeWeapon: null,
        keepWeaponChance: 0,
        poisonedBy: null,
        trapped: false,
        hitBy: {},
      };
      fd.fighters.push(fighter);
      fd.initialFighters.push(JSON.parse(JSON.stringify(fighter)));
      // La animación crea el luchador y luego lo hace llegar, como al inicio de la pelea
      this.steps.push({ a: 'demoSpawn', fighter: toAnimationFighter(fighter) } as never);
      fighterArrives(fd, fighter);
    }
    return true;
  }
}
