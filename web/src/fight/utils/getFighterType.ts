import { Fighter, bosses } from '@labrute/core';
import { AnimationFighter } from './findFighter';

export const getFighterType = (
  fighter: AnimationFighter | Fighter,
) => {
  let type: 'brute' | 'dog' | 'bear' | 'panther' = 'brute';
  // (un ayudante es una persona, aunque por dentro sea una mascota)
  if (fighter.type === 'pet' && !fighter.helper) {
    type = fighter.name.startsWith('dog') ? 'dog' : fighter.name as 'bear' | 'panther';
  } else if (fighter.type === 'boss') {
    const bossType = bosses.find((b) => b.name === fighter.name)?.base as 'bear' | 'panther' | 'dog1' || 'bear';
    type = bossType === 'dog1' ? 'dog' : bossType;
  }

  return type;
};
