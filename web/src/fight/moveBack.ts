
import { MoveBackStep } from '@labrute/core';
import { Application } from 'pixi.js';

import { getRandomPosition, isMaxApproach, QUICK_STEP_DURATION, royaleArena } from './utils/fightPositions';
import { AnimationFighter, findFighter } from './utils/findFighter';
import { playStepDust } from './utils/playVFX';
import { Spritesheets } from './utils/spritesheet';
import { Easing, tween } from './utils/tween';

export const moveBack = async (
  fighters: AnimationFighter[],
  step: MoveBackStep,
  speed: React.RefObject<number>,
  targetPosition?: { x: number; y: number },
  // Demo: para el polvo al arrancar y al frenar
  app?: Application,
  spritesheets?: Spritesheets,
) => {
  const fighter = findFighter(fighters, step.f);
  if (!fighter) {
    throw new Error('Fighter not found');
  }

  // Get positions
  const { x, y } = targetPosition ?? getRandomPosition(fighters, fighter);

  const travelDistance = Math.hypot(
    x - fighter.animation.container.x,
    y - fighter.animation.container.y,
  );

  // No-op movement: skip animation/tween overhead.
  if (travelDistance < 1) {
    return;
  }

  // Demo: acercamiento al 100 % -> vuelve con un salto corto sin correr
  if (isMaxApproach()) {
    await tween(fighter.animation.container, {
      duration: QUICK_STEP_DURATION / speed.current, ease: 'power2.out', x, y,
    });
    return;
  }

  // Set animation to `run`
  fighter.animation.setAnimation('run');

  // Is fighter inversion needed ?
  const invertFighter = fighter.team === 'L'
    ? fighter.animation.container.x > x
    : fighter.animation.container.x < x;

  // Invert fighter if needed
  if (invertFighter) fighter.animation.container.scale.x *= -1;

  // Travel duration depends on distance (Demo: en el royale se corre un 20 % más rápido)
  const duration = Math.max(0.15, travelDistance / (royaleArena.enabled ? 580 : 480));

  // Demo: polvo detrás al arrancar y delante al frenar (solo en carreras de verdad)
  const dir = Math.sign(x - fighter.animation.container.x) || 1;
  const dusty = app && spritesheets && travelDistance >= 40;
  if (dusty) playStepDust(app, spritesheets, fighter, speed, -dir * 10);

  // Move fighter to the position (Demo: acelera, mantiene y frena en vez de ir a velocidad fija)
  await tween(fighter.animation.container, {
    duration: duration / speed.current,
    ease: Easing.run,
    x,
    y
  });
  if (dusty) playStepDust(app, spritesheets, fighter, speed, dir * 8, 0.5);

  // Invert fighter if needed
  if (invertFighter) fighter.animation.container.scale.x *= -1;

  // Set animation to `idle`
  fighter.animation.setAnimation('idle');
};
