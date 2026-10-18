import {
  randomItem, SkillId, weapons, WeaponType
} from '@labrute/core';
import { AnimationFighter } from './findFighter';

// Y positions
const minYPosition = 175;
const maxYPosition = 281;

// Demo: acercamiento ajustable (0 = distancia original del juego, 100 = lo más cerca posible)
export const fightApproach = { value: 0 };
const MAX_APPROACH_OFFSET = 100;
// Al 100 %: los desplazamientos son un salto corto, sin animación de correr
export const isMaxApproach = () => fightApproach.value >= 100;
export const QUICK_STEP_DURATION = 0.08;
const approachOffset = () => (Math.max(0, Math.min(100, fightApproach.value)) / 100) * MAX_APPROACH_OFFSET;

// Left X positions
const minLeftXPosition = () => 40 + approachOffset();
const maxLeftXPosition = () => 125 + approachOffset();

// Right X positions
const minRightXPosition = () => 500 - minLeftXPosition();
const maxRightXPosition = () => 500 - maxLeftXPosition();

// Demo battle royale: no hay bandos, así que vale cualquier sitio de la arena (si no, todos acaban amontonados
// en los dos bordes). Se prueban unos puntos al azar y gana el más despejado que no obligue a cruzar media arena.
export const royaleArena = { enabled: false, minX: 36, maxX: 464, minY: minYPosition + 1, maxY: maxYPosition - 1 };
// Espacio libre alrededor de un punto: distancia al luchador más cercano (lo vertical cuenta el doble,
// porque la arena es poco profunda), hasta un máximo
export const roomAt = (x: number, y: number, others: { x: number; y: number }[], max = 120) => {
  let room = max;
  for (const o of others) room = Math.min(room, Math.hypot(o.x - x, (o.y - y) * 2));
  return room;
};
export const getRoyalePosition = (
  fighters: AnimationFighter[],
  fighter: AnimationFighter,
  takenPositions: { x: number; y: number }[] = [],
): { x: number, y: number } => {
  const others = [
    ...fighters
      .filter((f) => f !== fighter && !f.dead && f.animation.container.visible
        && f.animation.container.y >= minYPosition && f.animation.container.y <= maxYPosition)
      .map((f) => ({ x: f.animation.container.x, y: f.animation.container.y })),
    ...takenPositions,
  ];
  const { x: fx, y: fy } = fighter.animation.container;
  // Recién llegando (aún fuera de la arena) no cuenta lo que tenga que recorrer
  const onStage = fy >= minYPosition && fy <= maxYPosition;
  const { minX, maxX, minY, maxY } = royaleArena;
  let best = { x: 250, y: (minY + maxY) / 2 };
  let bestScore = -Infinity;
  for (let k = 0; k < 16; k++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    const score = roomAt(x, y, others) - (onStage ? Math.hypot(x - fx, y - fy) * 0.2 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
};

// Demo battle royale (duelos): tras atacar, retrocede un poco frente a su rival en vez de irse a otro sitio de la
// arena, así cada pareja pelea en su zona sin cruzarse con las demás. Se prueban unos puntos a los lados del rival
// (sobre todo del suyo) y gana el más despejado.
export const getDuelPosition = (
  fighters: AnimationFighter[],
  fighter: AnimationFighter,
  foe: AnimationFighter,
): { x: number, y: number } => {
  const others = fighters
    .filter((f) => f !== fighter && f !== foe && !f.dead && f.animation.container.visible
      && f.animation.container.y >= minYPosition && f.animation.container.y <= maxYPosition)
    .map((f) => ({ x: f.animation.container.x, y: f.animation.container.y }));
  const { minX, maxX, minY, maxY } = royaleArena;
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const fx = foe.animation.container.x;
  const fy = clamp(foe.animation.container.y, minY, maxY);
  const side = Math.sign(fighter.animation.container.x - fx) || 1;
  // Sin solaparse con el rival (los gigantes ocupan más)
  const gap = (foe.animation.baseWidth + fighter.animation.baseWidth) / 2;
  let best = { x: clamp(fx + side * (gap + 45), minX, maxX), y: fy };
  let bestScore = -Infinity;
  for (let k = 0; k < 12; k++) {
    const s = Math.random() < 0.8 ? side : -side;
    const x = clamp(fx + s * (gap + 30 + Math.random() * 40), minX, maxX);
    const y = clamp(fy + (Math.random() - 0.5) * 30, minY, maxY);
    // Contra un borde quedaría encima del rival
    if (Math.abs(x - fx) < gap) continue;
    const score = roomAt(x, y, others, 70) - Math.abs(x - fighter.animation.container.x) * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
};

const getRandomPosition = (
  fighters: AnimationFighter[],
  fighter: AnimationFighter,
  takenPositions?: { x: number; y: number }[],
): { x: number, y: number } => {
  if (royaleArena.enabled) return getRoyalePosition(fighters, fighter, takenPositions);

  // Get fighter min and max x position
  const minXPosition = fighter.team === 'L' ? minLeftXPosition() : minRightXPosition();
  const maxXPosition = fighter.team === 'L' ? maxLeftXPosition() : maxRightXPosition();

  // Returned value, should always change
  const resultPosition = {
    x: (minXPosition + maxXPosition) / 2,
    y: (minYPosition + maxYPosition) / 2,
  };

  // Y positioning
  // Sort position of fighters in the target side of the map
  const sortedPositions = [
    ...fighters
      .filter((animationFighter) => {
        // Remove animationFighter not positioned yet
        if (animationFighter.animation.container.y < minYPosition
          || animationFighter.animation.container.y > maxYPosition) return false;
        // Add self, for more natural movements
        if (animationFighter === fighter) return true;
        // Get fighters in the target side of the map
        return (fighter.team === 'L')
          ? animationFighter.animation.container.x < 250
          : animationFighter.animation.container.x > 250;
      })
      // Get y positions
      .map((animationFighter) => animationFighter.animation.container.y),
    ...(takenPositions?.map((position) => position.y) || []),
  ]
    // Sort ascending
    .sort((a, b) => a - b);

  // Add max and min Y position
  sortedPositions.unshift(minYPosition);
  sortedPositions.push(maxYPosition);

  // Find the largest gap
  let largestGap = 0;
  let largestGapPositions: { start: number, end: number } | null = null;
  // List every large enough gap
  const comfortYMargin = 15;
  const comfortableGapPositions: { start: number, end: number }[] = [];

  // Loop throught fighters Y
  for (let i = 1; i < sortedPositions.length; i++) {
    const gap = (sortedPositions[i] ?? 0) - (sortedPositions[i - 1] ?? 0);
    const gapPosition = { start: sortedPositions[i - 1] ?? 0, end: sortedPositions[i] ?? 0 };
    // Add to lerge enough gap list
    if (gap > comfortYMargin * 2) comfortableGapPositions.push(gapPosition);
    // Update largest gap
    if (gap > largestGap) {
      largestGap = gap;
      largestGapPositions = gapPosition;
    }
  }

  // Should never happen
  if (!largestGapPositions) {
    throw new Error('No gap found');
  }

  // Chose a random large enough gap position
  let chosenGapPositions: { start: number, end: number } = comfortableGapPositions.length
    ? randomItem(comfortableGapPositions)
    : largestGapPositions;

  // If it is smaller than twice the largest gap, chose the largest gap instead
  if (chosenGapPositions.end - chosenGapPositions.start < largestGap * 0.5) {
    chosenGapPositions = largestGapPositions;
  }

  // Chose an y within the chosen gap
  // Candidate interval length
  const comfortSpace = chosenGapPositions.end - chosenGapPositions.start - comfortYMargin * 2;
  // If not enough space, just go in the middle of the gap
  if (comfortSpace <= 0) {
    resultPosition.y = (chosenGapPositions.start + chosenGapPositions.end) / 2;
    // Else, chose a random y in the candidate interval
  } else {
    resultPosition.y = chosenGapPositions.start
      + comfortYMargin
      + comfortSpace * 0.15
      + Math.random() * (
        chosenGapPositions.end
        - chosenGapPositions.start
        - comfortYMargin * 2
        - comfortSpace * 0.2
      );
  }

  // If chosen y is too close to the edges, stick it to the edge
  // This way space is optimized for crowded fights
  if (resultPosition.y <= minYPosition + comfortYMargin
    && chosenGapPositions.start === minYPosition) resultPosition.y = minYPosition + 1;
  if (resultPosition.y >= maxYPosition - comfortYMargin
    && chosenGapPositions.end === maxYPosition) resultPosition.y = maxYPosition - 1;

  // X positioning
  // Random x position from 0 to 1
  let randomXPositionFactor = 0.4 + Math.random() * 0.6;

  // Adjust x position to get more natural looking movements
  const possibleWeapon = fighter.animation.weapon ? weapons[fighter.animation.weapon] : undefined;
  // If fighter has a weapon
  if (possibleWeapon) {
    // A bit further if long range
    if (possibleWeapon.types.includes(WeaponType.LONG)) randomXPositionFactor -= 0.25;
    // Further if thrown weapon
    if (possibleWeapon.types.includes(WeaponType.THROWN)) randomXPositionFactor -= 0.5;
    // Confidence boost if heavy weapon and bodybuilder
    if (possibleWeapon.types.includes(WeaponType.HEAVY)
      && fighter.skills[SkillId.bodybuilder]) {
      randomXPositionFactor += 0.15;
    }
    // Confidence boost if sharp weapon and weaponMaster
    if (possibleWeapon.types.includes(WeaponType.SHARP)
      && fighter.skills[SkillId.weaponsMaster]) {
      randomXPositionFactor += 0.15;
    }
    // Confidence boost if unarmed and martialArts
  } else if (fighter.skills[SkillId.martialArts]) {
    randomXPositionFactor += 0.25;
  }

  // Adjust x position to overall gameplan
  const skillPositionModifiers: Partial<Record<SkillId, number>> = {
    [SkillId.hideaway]: -0.25,
    [SkillId.monk]: -0.25,
    [SkillId.untouchable]: -0.25,
    [SkillId.sixthSense]: -0.1,
    [SkillId.balletShoes]: -0.05,
    [SkillId.shield]: 0.05,
    [SkillId.toughenedSkin]: 0.05,
    [SkillId.leadSkeleton]: 0.1,
    [SkillId.armor]: 0.1,
    [SkillId.ironHead]: 0.15,
  };

  // Apply position modifier for each fighter's skill
  Object.keys(fighter.skills).forEach((skillId) => {
    randomXPositionFactor += skillPositionModifiers[+skillId as SkillId] ?? 0;
  });

  // Clamp position to 0 - 1
  randomXPositionFactor = Math.max(0, Math.min(1, randomXPositionFactor));

  // Interpolate it to minXPosition - maxXPosition
  resultPosition.x = minXPosition + randomXPositionFactor * (maxXPosition - minXPosition);

  return resultPosition;
};

const getMultipleRandomPosition = (
  fighters: AnimationFighter[],
  multipleFighters: AnimationFighter[],
): { x: number; y: number }[] => {
  const positions: { x: number; y: number }[] = [];

  for (const fighter of multipleFighters) {
    positions.push(getRandomPosition(fighters, fighter, positions));
  }
  return positions;
};

export {
  getRandomPosition,
  getMultipleRandomPosition,
};

export const WEAPON_SIZE = 12;
export const SKILL_SIZE = 12;
export const WEAPON_SPACING = 4;
export const SKILL_SPACING = 4;
export const WEAPONS_PER_ROW = 11;
export const SKILLS_PER_ROW = 11;
