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
  Stats, activateSuper, checkDeaths, fighterArrives, orderFighters, playFighterTurn, royalePace, saboteur,
} from './fightMethods';
import {
  BoostTier, Ultimate, boost, castUltimate as playUltimate, cleave, endGiant,
} from './ultimates';
import { PetName } from '@labrute/prisma';

// `activate`: power-ups que se activan al empezar el siguiente turno (sin depender de la probabilidad)
export type Purchase = { weapons?: string[]; skills?: string[]; pets?: string[]; potions?: number; activate?: string[] };

// Power-up propio de la demo (no existe en el juego): el brute crece, daño x2 y resistencia x2
export const SUPER_GIANT = 'superGiant';

// Turnos que se reintenta un power-up que todavía no puede usarse (p. ej. Ladrón si el rival no tiene arma)
const ACTIVATE_TRIES = 3;

// Cada poción cura este % de la vida máxima (y quita el veneno)
const POTION_HEAL = 0.5;

// Mascota del potenciador 3 del royale (ver castBoost): perro, pantera u oso, al azar
const BOOST_PETS = [[PetName.dog1, PetName.dog2, PetName.dog3], [PetName.panther], [PetName.bear]];

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
  // Power-ups comprados pendientes de activar, por equipo
  #toActivate: Record<'L' | 'R', { name: string; tries: number }[]> = { L: [], R: [] };

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
      // Royale: duelos simultáneos (cada equipo en una pareja o un trío hasta que caen sus rivales)
      ...(royale ? { royaleDuels: { group: {}, next: 1, step: {} } } : {}),
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

  // Battle royale: la ronda no termina sola. Con uno solo en pie el motor se queda esperando (`finished` sin ganador)
  // a que entre otro brute, y solo se cierra al acabarse el tiempo de "Finalizar", con esto. Gana quien diga la
  // animación (el que más victorias lleva de los que siguen en pie): el motor va por delante y lo que jugó y aún no
  // se vio ya no cuenta
  endRoyaleNow(winnerIndex: number) {
    if (!this.royale || this.winner) return false;
    const fd = this.fightData;
    const brutes = fd.fighters.filter((f) => f.type === 'brute' && !f.master);
    const winner = brutes.find((f) => f.index === winnerIndex);
    const loser = this.eliminated[this.eliminated.length - 1] ?? brutes.find((f) => f !== winner);
    if (!winner || !loser) return false;
    fd.winner = winner.id;
    fd.loser = loser.id;
    this.winner = winner;
    this.loser = loser;
    this.steps.push({ a: StepType.End, w: winner.index, l: loser.index });
    return true;
  }

  // Battle royale: el brute `index` lanza la ultimate `kind` (con un potenciador, ver castBoost). Como al agregar un
  // brute, se juega en el motor ya (tras lo que el motor ya llevaba jugado); la animación la muestra enseguida (ver
  // setupFight). No se puede si no queda a quién darle (salvo el Súper gigante) o si está atrapado en una red o
  // aturdido (entonces se prueba otra, ver sim.castBoost, y si no sale ninguna el botón la deja en cola, ver main.js)
  castUltimate(index: number, kind: Ultimate) {
    if (!this.royale || this.winner) return false;
    const fd = this.fightData;
    const caster = fd.fighters.find((f) => f.index === index && f.type === 'brute' && !f.master && f.hp > 0
      && !f.trapped && !f.stunned);
    if (!caster || !playUltimate(fd, this.#stats, this.#achievements, caster, kind)) return false;
    checkDeaths(fd, this.#stats);
    this.#royaleEliminations();
    return true;
  }

  // Battle royale: potenciador `tier` del brute `index` (botones de la lista, ver ultimates.boost). Lanza la ultimate
  // `kind` y, si sale, le cura (o le suma) vida, le da un arma que ya no pierde, le enciende el aura de ki (niveles 2 y
  // 3) y le trae una mascota (nivel 3) que pelea con él hasta que la animación la despide (ver endPet). Si la ultimate
  // no puede salir, no se hace nada (ver sim.castBoost)
  castBoost(index: number, kind: Ultimate, tier: BoostTier) {
    if (!this.castUltimate(index, kind)) return false;
    const fd = this.fightData;
    const caster = fd.fighters.find((f) => f.index === index && f.type === 'brute' && !f.master);
    const calculated = this.#brutes.find((b) => b.id === caster?.id);
    if (!caster) return true;
    boost(fd, caster, tier);
    if (tier === 3 && calculated) {
      const kinds = BOOST_PETS[Math.floor(Math.random() * BOOST_PETS.length)] ?? [PetName.bear];
      const pet = this.#newPet(caster, calculated, kinds[Math.floor(Math.random() * kinds.length)] ?? PetName.bear);
      fd.fighters.push(pet);
      fd.initialFighters.push(JSON.parse(JSON.stringify(pet)));
      // Para la animación, en el lado en el que empezó su amo (luego cambia según con quién pelee)
      const animation = toAnimationFighter(pet) as Fighter & { realTeam?: string };
      animation.realTeam = pet.team;
      animation.team = parseInt(String(pet.team).slice(1), 10) % 2 === 1 ? 'L' : 'R';
      this.steps.push({ a: 'demoSpawn', fighter: animation } as never);
      fighterArrives(fd, pet);
      // Desde que llega cuenta su minuto
      this.steps.push({ a: 'demoPet', f: pet.index } as never);
    }
    return true;
  }

  // Battle royale: se va la mascota de un potenciador (la animación avisa cuando pasa su minuto): sale de la arena
  // corriendo y deja de pelear
  endPet(index: number) {
    if (!this.royale || this.winner) return false;
    const fd = this.fightData;
    const pet = fd.fighters.find((f) => f.index === index && f.type === 'pet');
    if (!pet || pet.hp <= 0) return false;
    fd.fighters.splice(fd.fighters.indexOf(pet), 1);
    this.steps.push({ a: StepType.Leave, f: pet.index });
    return true;
  }

  // Battle royale: la onda del Súper gigante `index` alcanza a los primeros de `candidates` que pueda (la animación
  // la suelta cuando le ve atacar). Devuelve a quiénes, cuánto les quita y si caen
  cleave(index: number, candidates: number[]) {
    if (!this.royale || this.winner) return [];
    const fd = this.fightData;
    const hits = cleave(fd, this.#stats, this.#achievements, index, candidates);
    if (hits.some((h) => h.k)) {
      checkDeaths(fd, this.#stats);
      this.#royaleEliminations();
    }
    return hits;
  }

  // Battle royale: se acaba el Súper gigante (ultimate) del brute `index`
  endGiant(index: number) {
    return this.royale && !this.winner && endGiant(this.fightData, index);
  }

  // Si se puede agregar un brute al royale: hasta su paso End, con alguien en pie con quien pelear
  // (si los dos últimos caen a la vez ya no entra nadie y la ronda se cierra)
  canAddRoyaleBrute() {
    return this.royale && !this.winner
      && this.fightData.fighters.some((f) => f.type === 'brute' && !f.master && f.hp > 0);
  }

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

  // Battle royale: entra un brute nuevo en plena pelea (botón "Agregar brute"). Forma su propio equipo, actúa
  // enseguida y la animación lo crea y lo hace llegar como al principio. Devuelve su luchador (o null si ya acabó).
  addRoyaleBrute(brute: CalculatedBrute) {
    if (!this.canAddRoyaleBrute()) return null;
    const fd = this.fightData;
    // Si ya solo quedaba uno en pie (esperando retador), sigue contra el que llega
    fd.loser = null;
    // El tiempo extra (veneno para todos pasados 1000 turnos) cuenta desde el último que entró: si no, al mantener
    // la pelea agregando brutes un buen rato, los que entraban caían envenenados en cuatro turnos
    this.#turn = 0;
    fd.overtime = false;
    const team = this.#brutes.length + 1;
    this.#brutes.push(brute);
    this.#achievements[brute.id] = { userId: brute.userId, eventId: brute.eventId, achievements: {} };
    this.#stats[brute.id] = { userId: brute.userId };
    const own = getFighters({
      team1: { brutes: [brute], backups: [], bosses: [] },
      team2: { brutes: [], backups: [], bosses: [] },
      modifiers: fd.modifiers,
    });
    const indices = [...fd.fighters, ...fd.initialFighters].map((f) => f.index);
    let nextBrute = Math.max(0, ...indices) + 1;
    let nextPet = Math.min(0, ...indices) - 1;
    let added: DetailedFighter | null = null;
    for (const f of own) {
      f.team = `T${team}` as never;
      if (f.type === 'pet') {
        f.index = nextPet--;
        f.id = `${f.index}`;
      } else {
        f.index = nextBrute++;
        added = f;
      }
      // Entra a jugar enseguida
      f.initiative = fd.initiative + 0.01 + randomBetween(0, 10) / 1000;
      fd.fighters.push(f);
      fd.initialFighters.push(JSON.parse(JSON.stringify(f)));
      // Para la animación, en uno de los dos lados (como al empezar)
      const animation = toAnimationFighter(f) as Fighter & { realTeam?: string };
      animation.realTeam = f.team;
      animation.team = team % 2 === 1 ? 'L' : 'R';
      this.steps.push({ a: 'demoSpawn', fighter: animation } as never);
      fighterArrives(fd, f);
    }
    return added;
  }

  // Pasos generados desde la última llamada
  takeNewSteps() {
    const out = this.steps.slice(this.#emitted);
    this.#emitted = this.steps.length;
    return out;
  }

  // Activa los power-ups comprados al empezar el turno, antes de que actúe nadie
  activatePurchased() {
    const fd = this.fightData;
    const chaos = !!(fd.modifiers as Record<string, unknown>)?.chaos;
    for (const team of ['L', 'R'] as const) {
      const queue = this.#toActivate[team];
      const brute = fd.fighters.find((f) => f.team === team && f.type === 'brute' && !f.master);
      for (let i = 0; i < queue.length && !this.finished; ) {
        const entry = queue[i]!;
        // Súper gigante: dura el resto de la pelea (comprarlo otra vez no lo acumula)
        if (entry.name === SUPER_GIANT) {
          const giant = brute as { demoGiant?: boolean } | undefined;
          if (brute && brute.hp > 0 && !giant!.demoGiant) {
            giant!.demoGiant = true;
            this.steps.push({ a: 'demoGiant', f: brute.index } as never);
          }
          queue.splice(i, 1);
          continue;
        }
        const skill = brute?.skills[entry.name as keyof typeof brute.skills];
        if (!brute || brute.hp <= 0 || !skill) {
          queue.splice(i, 1);
          continue;
        }
        if (activateSuper(chaos, fd, brute, skill as never, this.#stats, this.#achievements)) {
          queue.splice(i, 1);
          checkDeaths(fd, this.#stats);
          if (fd.loser && !this.winner) this.#finish();
          continue;
        }
        // Todavía no se puede usar: se reintenta en los próximos turnos
        entry.tries += 1;
        if (entry.tries >= ACTIVATE_TRIES) queue.splice(i, 1);
        else i += 1;
      }
    }
  }

  // Juega un turno (o termina la pelea). Devuelve false si ya terminó.
  // Battle royale: `hold(index)` dice qué luchadores tienen que esperar porque la animación aún está mostrando (o tiene
  // en cola) su turno anterior (ver setupFight): juega el siguiente en orden que no espere, así el motor no va por
  // delante de lo que se ve. Si esperan todos, no juega nadie (null)
  playTurn(hold?: (index: number) => boolean) {
    if (this.finished) return false;
    const fd = this.fightData;
    const before = this.steps.length;

    // Algunos turnos no producen pasos: se sigue hasta que haya algo que animar
    while (!fd.loser && this.steps.length === before && this.#turn < 2000) {
      orderFighters(fd);
      let first = fd.fighters[0];
      if (!first) break;
      if (hold && this.royale) {
        // Los de un mismo duelo esperan juntos: así dentro de cada uno se sigue el orden de iniciativa (en un trío, el
        // que queda libre no se adelanta a los otros dos)
        const groupOf = (f: DetailedFighter) => fd.royaleDuels?.group[f.team];
        const waiting = new Set(fd.fighters.filter((f) => f.hp > 0 && hold(f.index)).map(groupOf));
        waiting.delete(undefined);
        const next = fd.fighters.find((f) => f.hp > 0 && !hold(f.index) && !waiting.has(groupOf(f)));
        if (!next) return null;
        if (next !== first) {
          // (playFighterTurn juega el primero de la lista)
          fd.fighters.splice(fd.fighters.indexOf(next), 1);
          fd.fighters.unshift(next);
          first = next;
        }
      }
      fd.initiative = first.initiative;
      if (this.#turn > 1000) fd.overtime = true;
      const before = first.initiative;
      playFighterTurn(fd, this.#stats, this.#achievements);
      if (this.royale) royalePace(fd, first, before);
      checkDeaths(fd, this.#stats);
      if (this.royale) this.#royaleEliminations();
      this.#turn += 1;
    }

    // El royale no se cierra solo (ver endRoyaleNow)
    if (fd.loser && !this.winner && !this.royale) this.#finish();
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

  // Fin del 1 vs 1 (el royale se cierra con endRoyaleNow)
  #finish() {
    const fd = this.fightData;
    const loser = fd.fighters.find((f) => f.id === fd.loser);
    if (!loser) throw new Error('No loser found');
    const [b1, b2] = this.#brutes;
    const winner = loser.team === 'L'
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

    // Power-ups a activar: se le da un uso más (o la habilidad con un solo uso si no la tenía)
    const extraUses: Partial<Record<SkillId, number>> = {};
    for (const name of purchase.activate ?? []) {
      if (name === SUPER_GIANT) {
        this.#toActivate[team].push({ name, tries: 0 });
        continue;
      }
      const id = SkillByName[name as keyof typeof SkillByName];
      const owned = brute.skills[name as keyof typeof brute.skills] as { uses?: number[]; tier: number } | undefined;
      if (owned?.uses) {
        owned.uses[owned.tier - 1] = (owned.uses[owned.tier - 1] ?? 0) + 1;
        extraUses[id] = owned.uses[owned.tier - 1];
      } else if (!owned) {
        const skill = { ...structuredClone(skills[name as keyof typeof skills]), tier: 1 } as never as { uses?: number[] };
        skill.uses = [1, 1, 1];
        brute.skills[name as keyof typeof brute.skills] = skill as never;
        extraUses[id] = (extraUses[id] ?? 0) + 1;
      }
      // Icono en el HUD (la animación de activación lo necesita)
      gear.skills[id] = (brute.skills[name as keyof typeof brute.skills] as { tier?: number })?.tier ?? 1;
      this.#toActivate[team].push({ name, tries: 0 });
    }

    if (Object.keys(gear.weapons).length || Object.keys(gear.skills).length) {
      this.steps.push({ a: 'demoGear', f: brute.index, ...gear, u: extraUses } as never);
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
      const fighter = this.#newPet(brute, calculated, petName);
      fd.fighters.push(fighter);
      fd.initialFighters.push(JSON.parse(JSON.stringify(fighter)));
      // La animación crea el luchador y luego lo hace llegar, como al inicio de la pelea
      this.steps.push({ a: 'demoSpawn', fighter: toAnimationFighter(fighter) } as never);
      fighterArrives(fd, fighter);
    }
    return true;
  }

  // Mascota nueva de un brute (compra del 1 vs 1 o potenciador del royale), en el equipo de su amo y que entra a jugar
  // enseguida
  #newPet(brute: DetailedFighter, calculated: CalculatedBrute, petName: string): DetailedFighter {
    const fd = this.fightData;
    const pet = { ...pets[petName as keyof typeof pets], tier: 1 };
    const index = Math.min(0, ...fd.fighters.map((f) => f.index), ...fd.initialFighters.map((f) => f.index)) - 1;
    const s = (stat: Parameters<typeof getPetScaledStat>[3], precision?: number) => getPetScaledStat(false, calculated, pet as never, stat, precision);
    const fighter: DetailedFighter = {
      id: `${index}`,
      index,
      // En el equipo de su amo
      team: brute.team,
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
    return fighter;
  }
}
