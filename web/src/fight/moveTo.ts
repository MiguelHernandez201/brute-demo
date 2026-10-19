
import { MoveStep } from '@labrute/core';
import { sound } from '@pixi/sound';
import { Application } from 'pixi.js';
import { AnimationFighter, findFighter } from './utils/findFighter';
import { repositionFighters } from './utils/repositionFighters';
import { getHitDistance } from './utils/getHitDistance';
import { Easing, tween } from './utils/tween';
import { royaleArena } from './utils/fightPositions';
import { playStepDust } from './utils/playVFX';
import { Spritesheets } from './utils/spritesheet';

export const moveTo = async (
  fighters: AnimationFighter[],
  step: MoveStep,
  speed: React.RefObject<number>,
  // Demo: para el polvo al arrancar y al frenar
  app?: Application,
  spritesheets?: Spritesheets,
) => {
  const fighter = findFighter(fighters, step.f);
  if (!fighter) {
    throw new Error('Fighter not found');
  }
  const target = findFighter(fighters, step.t);
  if (!target) {
    throw new Error('Target not found');
  }

  // Filter the only moveTo case outside of neutral (melee repositioning)
  if (!step.r) {
    // Reposition mispositionned other fighters before moveTo
    await repositionFighters(fighters, speed, fighter.id);
  }

  const distance = getHitDistance(fighter, target, !!step.c, !!step.s);

  // Get travel position
  const targetX = target.team === 'R'
    ? target.animation.container.x - distance
    : target.animation.container.x + distance;
  const targetY = target.animation.container.y;

  // Get travel distance
  const travelDistance = Math.hypot(
    targetX - fighter.animation.container.x,
    targetY - fighter.animation.container.y,
  );

  if (travelDistance < 1) {
    return;
  }

  // Set animation to `run`
  fighter.animation.setAnimation('run');

  // Play running SFX
  if (fighter.type === 'pet') {
    // Remove numbers from pet name
    void sound.play('sfx', { sprite: `${fighter.name.replace(/\d/g, '')}` });
  }

  // Travel duration depends on distance (Demo: en el royale se corre un 20 % más rápido)
  const duration = Math.max(0.16, travelDistance / (royaleArena.enabled ? 520 : 430));

  // Demo: polvo detrás al arrancar y delante al frenar (solo en carreras de verdad)
  const dir = Math.sign(targetX - fighter.animation.container.x) || 1;
  const dusty = app && spritesheets && travelDistance >= 40;
  if (dusty) playStepDust(app, spritesheets, fighter, speed, -dir * 10);

  // Move fighter to the position (Demo: acelera, mantiene y frena en vez de ir a velocidad fija)
  await tween(fighter.animation.container, {
    duration: duration / speed.current,
    ease: Easing.run,
    x: targetX,
    y: targetY,
  });
  if (dusty) playStepDust(app, spritesheets, fighter, speed, dir * 8, 0.5);

  // Set animation to `idle`
  fighter.animation.setAnimation('idle');
};
