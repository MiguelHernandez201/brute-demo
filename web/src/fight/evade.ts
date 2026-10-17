
import { EvadeStep } from '@labrute/core';
import { sound } from '@pixi/sound';
import { Application } from 'pixi.js';
import { AnimationFighter, findFighter } from './utils/findFighter';
import { getRealKnockBack } from './utils/knockBack';
import { playStepDust } from './utils/playVFX';
import { Spritesheets } from './utils/spritesheet';
import { airbornMove } from './utils/updateShadow';
import { Easing, tween } from './utils/tween';

export const jumpBack = async (
  fighter: AnimationFighter,
  speed: React.RefObject<number>,
  distance: number = 30,
  duration: number = 0.5,
  // Demo: para el polvo al aterrizar
  app?: Application,
  spritesheets?: Spritesheets,
) => {
  // Set animation to `evade`
  fighter.animation.setAnimation('evade');
  // Play evade SFX
  void sound.play('sfx', { sprite: 'evade' });
  // Start airborn phase
  fighter.animation.setAirborn(true);

  // Sign the X backward movement and clamp it
  const setBack = getRealKnockBack(fighter, distance);

  // Store initial X position
  const initialX = fighter.animation.container.x;
  const jumpHeight = Math.min(80, fighter.animation.baseHeight * 0.5);

  const upAnimations: Promise<unknown>[] = [];

  // Add horizontal tweener
  upAnimations.push(tween(fighter.animation.container, {
    duration: (duration * 0.5) / speed.current,
    ease: 'none',
    x: initialX + setBack * 0.5,
  })
  );

  // Add a vertical tweener handling shadow
  upAnimations.push(airbornMove({
    fighter,
    speed,
    duration: duration * 0.5,
    ease: Easing.easeTo,
    endPosition: { y: fighter.animation.container.y - jumpHeight },
  }));

  await Promise.all(upAnimations);

  const downAnimations: Promise<unknown>[] = [];

  // Add horizontal tween
  downAnimations.push(tween(fighter.animation.container, {
    duration: (duration * 0.5) / speed.current,
    ease: 'none',
    x: initialX + setBack,
  }));

  // Add a vertical tweener handling shadow
  downAnimations.push(airbornMove({
    fighter,
    speed,
    duration: duration * 0.5,
    ease: Easing.easeFrom,
    endPosition: { y: fighter.animation.container.y + jumpHeight },
  }));

  await Promise.all(downAnimations);

  // End airborn phase
  fighter.animation.setAirborn(false);

  // Demo: polvo al aterrizar
  if (app && spritesheets) playStepDust(app, spritesheets, fighter, speed, 0, 0.7);

  // Set animation to `idle`
  fighter.animation.setAnimation('idle');
};

export const evade = async (
  fighters: AnimationFighter[],
  step: EvadeStep,
  speed: React.RefObject<number>,
  // Demo: para el polvo al aterrizar
  app?: Application,
  spritesheets?: Spritesheets,
) => {
  const fighter = findFighter(fighters, step.f);
  if (!fighter) {
    throw new Error('Fighter not found');
  }
  // Jump back
  await jumpBack(fighter, speed, undefined, undefined, app, spritesheets);
};
