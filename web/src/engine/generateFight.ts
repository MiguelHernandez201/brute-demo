import {
  AchievementsStore,
  BOSS_GOLD_REWARD,
  Boss,
  BruteRanking,
  CLAN_SIZE_LIMIT,
  CalculatedBrute,
  FightStep,
  FightWeapon,
  Fighter, ForbiddenError, Modifiers, Skill, SkillByName,
  SkillId,
  StepType, Tiered, WeaponByName,
  WeaponId,
  bossBackground, bosses,
  fightBackgrounds,
  getCalculatedBrute,
  randomItem,
  tournamentBackground,
  weightedRandom
} from '@labrute/core';
import {
  Gender, InventoryItemType, LogType, Prisma, PrismaClient,
  SkillName,
  UserLogType,
  WeaponName,
} from '@labrute/prisma';
import { applySpy } from './applySpy.js';
import {
  Stats,
  checkDeaths, fighterArrives,
  orderFighters, playFighterTurn,
  saboteur,
} from './fightMethods.js';
import { getFighters } from './getFighters.js';
import { handleStats } from './handleStats.js';


export type DetailedFighter = {
  // Metadata
  id: string;
  eventId?: string;
  index: number;
  team: 'L' | 'R';
  name: string;
  gender?: Gender;
  body?: string;
  colors?: string;
  rank: BruteRanking;
  level: number;
  pupilsCount?: number;
  type: 'brute' | 'pet' | 'boss';
  // Follower/Backup variables
  master?: string;
  arrivesAtInitiative?: number;
  leavesAtInitiative?: number;
  // Pet variables
  eaten?: boolean;
  // Raw stats
  maxHp: number;
  hp: number;
  strength: number;
  agility: number;
  speed: number;
  criticalChance: number;
  criticalDamage: number;
  regeneration: number;
  // Initiative
  initiative: number; // Lower attacks next
  hitSpeed: number;
  tempo: number; // Lower is better
  // hit stats
  baseDamage: number,
  counter: number,
  reversal: number,
  combo: number,
  deflect: number,
  block: number,
  accuracy: number,
  armor: number,
  disarm: number,
  weaponGrip: number;
  sabotage: number;
  evasion: number,
  reach: number,
  size: number;
  // Chance of re-attacking on misses (evasion or block)
  determination: number;
  // Max % max HP per hit
  resistant: number;
  // Chance of disarming when being hit
  ironHead: number;
  // Passives
  // Flag set if determination triggers
  retryAttack: boolean;
  // tempo -25% for heavy weapons
  bodybuilder: boolean;
  // Survive with 1 HP on first death
  survival: boolean;
  // First hit of the fight is evaded
  balletShoes: boolean;
  // Regen boost at 50% HP
  fastMetabolism: number | null;
  // Available skills
  skills: Partial<Record<SkillName, Tiered<Skill>>>;
  // Available weapons
  weapons: Partial<Record<WeaponName, FightWeapon>>;
  // Shield state
  shield: boolean;
  // Active skills
  activeSkills: Tiered<Skill>[];
  // Active weapon
  activeWeapon: FightWeapon | null;
  keepWeaponChance: number;
  // Status effects
  poisonedBy: number | null; // Fighter index
  trapped: boolean;
  // Keep track of consecutive hits for stun status
  hitBy: Record<number, number>;
  stunned?: boolean;
  hypnotized?: boolean;
  // Bare hand hit (for the fight modifier)
  bareHandHit?: boolean;
  // Damage immunity
  immune?: boolean;
}

export type DetailedFight = {
  modifiers: Modifiers;
  fighters: DetailedFighter[];
  initialFighters: DetailedFighter[];
  steps: FightStep[];
  initiative: number;
  winner: string | null;
  loser: string | null;
  overtime: boolean;
}

export type GenerateFightResult = {
  data: Prisma.FightCreateInput;
  boss?: {
    defeated: boolean;
    xp: number;
    gold: number;
  }
};

type Team = {
  brutes?: CalculatedBrute[];
  bosses?: (Boss & {
    startHP: number;
  })[];
};

type GenerateFightParams = {

  team1: Team;
  team2: Team;
  modifiers: Modifiers;
  backups: boolean;
  achievements: boolean;
  tournament?: 'fight' | 'finals';
  clanId?: string;
  clanWar?: boolean;
};

export const generateFight = async ({

  team1,
  team2,
  modifiers,
  backups,
  achievements,
  tournament,
  clanId,
  clanWar,
}: GenerateFightParams): Promise<GenerateFightResult> => {
  if (team1.brutes?.some((brute) => team2.brutes?.some((b) => b.id === brute.id))) {
    throw new ForbiddenError('Attempted to created a fight between the same brutes');
  }

  const background = (team1.bosses?.length || team2.bosses?.length)
    ? bossBackground
    : tournament
      ? tournamentBackground
      : weightedRandom(fightBackgrounds);

  // Achievements
  const achievementsStore: AchievementsStore = {};
  // Stats
  const stats: Stats = {};

  team1.brutes?.concat(team2.brutes ?? []).forEach((brute) => {
    achievementsStore[brute.id] = {
      userId: brute.userId,
      eventId: brute.eventId,
      achievements: {},
    };

    stats[brute.id] = {
      userId: brute.userId,
    };
  });

  const team1Backups: CalculatedBrute[] = [];
  const team2Backups: CalculatedBrute[] = [];

  if (team1.bosses?.length || team2.bosses?.length) {
    // Handle bosses coming as multiple instances
    team1.bosses?.forEach((boss) => {
      team1.bosses?.push(...Array(boss.count - 1).fill({ ...boss }) as typeof boss[]);
    });
    team2.bosses?.forEach((boss) => {
      team2.bosses?.push(...Array(boss.count - 1).fill({ ...boss }) as typeof boss[]);
    });
  }

  // Global fight data
  const fightDataFighters = getFighters({
    team1: { brutes: team1.brutes ?? [], backups: team1Backups, bosses: team1.bosses ?? [] },
    team2: { brutes: team2.brutes ?? [], backups: team2Backups, bosses: team2.bosses ?? [] },
    modifiers,
    clanFight: clanWar,
  });

  const fightData: DetailedFight = {
    modifiers,
    fighters: fightDataFighters,
    initialFighters: JSON.parse(JSON.stringify(fightDataFighters)) as DetailedFighter[],
    steps: [],
    initiative: 0,
    winner: null,
    loser: null,
    overtime: false,
  };

  // Add arrive step for all fighters
  fightData.fighters.forEach((fighter) => {
    // Ignore backups
    if (fighter.type === 'brute' && fighter.master) {
      return;
    }

    fighterArrives(fightData, fighter);
  });

  // Add spy steps (only 1v1)
  if (team1.brutes?.length === 1 && team2.brutes?.length === 1) {
    orderFighters(fightData);

    const mainFighters = fightData.fighters.filter((f) => f.type === 'brute' && !f.master);

    mainFighters.forEach((brute) => {
      const opponent = mainFighters.find((f) => f.id !== brute.id);

      if (!opponent) {
        throw new Error('Opponent not found');
      }
      applySpy(fightData, brute, opponent);
    });
  }

  // Pre-fight saboteur
  saboteur(fightData, achievementsStore);

  let turn = 0;

  // Fight loop
  while (!fightData.loser && turn < 2000) {
    // Order fighters by initiative (random if equal)
    orderFighters(fightData);

    const firstFighter = fightData.fighters[0];
    if (!firstFighter) {
      // No fighters left
      break;
    }

    // Set current initiative to first fighter
    fightData.initiative = firstFighter.initiative;

    // Set overtime
    if (turn > 1000) {
      fightData.overtime = true;
    }

    // Play fighter turn
    playFighterTurn(fightData, stats, achievementsStore);

    // Check deaths
    checkDeaths(fightData, stats);

    turn += 1;
  }

  if (!fightData.loser) {
    throw new Error('Fight not finished');
  }

  // Get loser
  const loser = fightData.fighters.find((fighter) => fighter.id === fightData.loser);

  if (!loser) {
    throw new Error('No loser found');
  }

  // Get winner
  const winner = loser.team === 'L'
    ? fightData.fighters.find((fighter) => fighter.team === 'R' && (fighter.type === 'boss' || fighter.id === team2.brutes?.[0]?.id))
    : fightData.fighters.find((fighter) => fighter.team === 'L' && (fighter.type === 'boss' || fighter.id === team1.brutes?.[0]?.id));

  if (!winner) {
    throw new Error('No winner found');
  }

  // Set fight winner and loser
  fightData.winner = winner.id;

  // Add end step
  fightData.steps.push({
    a: StepType.End,
    w: winner.index,
    l: loser.index,
  });

  // Reduce the size of the fighters data
  const fighters: Fighter[] = fightData.initialFighters.map((fighter) => {
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
      weapons: Object.values(fighter.weapons)
        .reduce<Partial<Record<WeaponId, number>>>((acc, weapon) => {
          const weaponId = WeaponByName[weapon.name];
          acc[weaponId] = weapon.tier;
          return acc;
        }, {}),
      skills: Object.values(fighter.skills)
        .reduce<Partial<Record<SkillId, number>>>((acc, skill) => {
          const skillId = SkillByName[skill.name];
          acc[skillId] = skill.tier;
          return acc;
        }, {}),
      shield: fighter.shield,
    };

    if (fighter.size !== 1) {
      object.size = fighter.size;
    }

    if (fighter.eventId) {
      object.eventId = fighter.eventId;
    }

    return object;
  });

  const brute1 = team1.brutes?.[0];
  const brute2 = team2.brutes?.[0];

  if (!brute1) {
    throw new Error('No brute 1');
  }

  const result: GenerateFightResult = {
    data: {
      brute1: { connect: { id: brute1.id } },
      winnerId: winner.id,
      loserId: loser.id,
      winner: winner.name,
      loser: loser.name,
      steps: JSON.stringify(fightData.steps),
      fighters: JSON.stringify(fighters),
      background: background.name,
    },
  };

  if (brute2) {
    result.data.brute2 = { connect: { id: brute2.id } };
  }

  // Add achievements from stats
  handleStats(fightData, stats, achievementsStore, tournament);

  return result;
};
