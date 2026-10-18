
import {
  HitStep, StepType, WEAPONS_SFX, WeaponById, randomBetween
} from '@labrute/core';
import { ColorOverlayFilter } from 'pixi-filters/color-overlay';
import { OutlineFilter } from 'pixi-filters/outline';

import { Application, Ticker } from 'pixi.js';
import { sound } from '@pixi/sound';
import { displayDamage } from './utils/displayDamage';
import { AnimationFighter, findFighter } from './utils/findFighter';
import { royaleArena } from './utils/fightPositions';
import { getRealKnockBack } from './utils/knockBack';
import { isFightDisposing } from './utils/lifecycle';
import { shakeStage } from './utils/stageAnimations';
import { stagger } from './stagger';
import { updateHp } from './updateHp';
import { untrap } from './untrap';
import { playHitEffect, playStepDust } from './utils/playVFX';
import { playResistAnimation } from './resist';
import { Spritesheets } from './utils/spritesheet';
import { tween } from './utils/tween';

const POISON_OUTLINE_FILTER_CONFIG = {
  thickness: 1,
  color: 0x006400,
};

// Demo: "hit-stop". Al conectar, atacante y víctima se quedan quietos un instante (más si el golpe es fuerte
// o crítico) mientras la víctima destella en blanco; en los fuertes y críticos además tiembla la pantalla.
const HIT_STOP_MS = { normal: 55, heavy: 85, critical: 120 };
const impact = async (
  app: Application,
  fighter: AnimationFighter,
  target: AnimationFighter,
  step: HitStep,
  speed: React.RefObject<number>,
) => {
  // Fuerte: quita al menos un 20 % de la vida o deja aturdido
  const strength = step.c ? 'critical' : step.d >= target.maxHp * 0.2 || step.s ? 'heavy' : 'normal';
  const ms = HIT_STOP_MS[strength] / speed.current;
  fighter.animation.freeze(ms);
  target.animation.freeze(ms);

  const { container } = target.animation;
  const flash = new ColorOverlayFilter({ color: 0xffffff, alpha: 0.75 });
  container.filters = [...container.filters || [], flash];
  if (strength === 'critical') void shakeStage(app, speed, 6, 280);
  else if (strength === 'heavy') void shakeStage(app, speed, 3, 180);

  // Espera con el ticker de la pelea (se detiene con la pausa)
  await new Promise<void>((resolve) => {
    const { ticker } = app;
    if (isFightDisposing() || !ticker) {
      resolve();
      return;
    }
    let waited = 0;
    const tick = (t: Ticker) => {
      waited += t.elapsedMS;
      if (waited < ms) return;
      ticker.remove(tick);
      resolve();
    };
    ticker.add(tick);
  });
  if (!container.destroyed) container.filters = (container.filters || []).filter((f) => f !== flash);
};

// Demo royale: un crítico lanza por los aires al que lo recibe. Vuela hacia atrás, cae levantando polvo y derrapa
const launch = async (
  app: Application,
  spritesheets: Spritesheets,
  target: AnimationFighter,
  speed: React.RefObject<number>,
  unsignedDistance: number,
) => {
  const c = target.animation.container;
  const distance = getRealKnockBack(target, unsignedDistance);
  const x0 = c.x;
  const y0 = c.y;
  const height = Math.min(26, 10 + Math.abs(distance) * 0.2) * (target.animation.giantScale || 1);
  const flight = { p: 0 };
  target.animation.setAirborn(true);
  await tween(flight, {
    p: 1,
    duration: 0.36 / speed.current,
    ease: 'none',
    onUpdate: () => {
      if (c.destroyed) return;
      const h = height * 4 * flight.p * (1 - flight.p);
      c.x = x0 + distance * 0.85 * flight.p;
      c.y = y0 - h;
      target.animation.shadow.y = h;
    },
  });
  if (c.destroyed) return;
  c.y = y0;
  target.animation.setAirborn(false);
  playStepDust(app, spritesheets, target, speed, 0, 0.7);
  await tween(c, { x: x0 + distance, duration: 0.14 / speed.current, ease: 'power2.out' });
};

export const hit = async (
  app: Application,
  spritesheets: Spritesheets,
  fighters: AnimationFighter[],
  step: HitStep,
  speed: React.RefObject<number>,
  isClanWar: boolean,
) => {
  const fighter = findFighter(fighters, step.f);
  if (!fighter) {
    throw new Error('Fighter not found');
  }
  const target = findFighter(fighters, step.t);
  if (!target) {
    throw new Error('Target not found');
  }

  // Get hit animation (random for male brute)
  const animation: 'hit' | 'hit-0' | 'hit-1' | 'hit-2' = target.type === 'brute' && target.gender === 'male'
    ? `hit-${randomBetween(0, 2) as 0 | 1 | 2}`
    : 'hit';

  // Fighter's side of the map
  const fighterSide = fighter.animation.container.x > 250 ? 'R' : 'L';
  // Target's side of the map
  const targetSide = target.animation.container.x > 250 ? 'R' : 'L';
  // Store if the hit was dealt in it's own side of the map
  const ownSideHit = fighter.team === fighterSide && targetSide === fighterSide;

  // Wake up target
  target.stunned = false;

  // Untrap target
  untrap(app, spritesheets, target);

  // Set animation to the correct hit animation
  target.animation.setAnimation(animation);
  // Play hitting SFX
  if (step.a === StepType.Poison) {
    // Poison SFX
    void sound.play('sfx', { sprite: 'poison' });
  } else if (typeof step.w !== 'undefined') {
    // Weapon SFX
    void sound.play('sfx', { sprite: `${WEAPONS_SFX[WeaponById[step.w]][randomBetween(0, WEAPONS_SFX[WeaponById[step.w]].length - 1)]}` });
  } else if (fighter.type === 'pet') {
    // Sword SFX for pets
    void sound.play('sfx', { sprite: 'sword' });
  } else {
    // Fist SFX
    void sound.play('sfx', { sprite: `fist${randomBetween(1, 3)}` });
  }

  // Play hit SFX
  if (target.type === 'pet') {
    // Remove numbers from pet name
    void sound.play('sfx', { sprite: `${target.name.replace(/\d/g, '')}` });
  }

  if (step.a !== StepType.Poison) {
    playHitEffect(app, spritesheets, fighter, target, speed);
  }

  // Add poison filter if damage is poison
  let poisonFilter: OutlineFilter | null = null;
  if (step.a === StepType.Poison) {
    poisonFilter = new OutlineFilter(POISON_OUTLINE_FILTER_CONFIG);
    target.animation.container.filters = [
      ...target.animation.container.filters || [],
      poisonFilter,
    ];
  }

  displayDamage({ app, target, damage: step.d, speed, criticalHit: step.c });

  // Play the resist animation now
  playResistAnimation(app, spritesheets, target, speed);

  // Update HP bar
  updateHp(fighters, target, -step.d, speed, isClanWar);

  // Max possible hit knockback
  const maxKnockBack = 32;
  let knockBack = 0;

  // If regular hit
  if (!ownSideHit) {
    // 0 - 50 % knockBack from 0 - 20% lost hp
    if (step.d > target.maxHp * 0.2) {
      knockBack = maxKnockBack * 0.5 * (1 + (step.d - target.maxHp * 0.2) / (target.maxHp * 0.8));
      // 50 - 100 % knockBack from 20 - 100% lost hp
    } else {
      knockBack = maxKnockBack * 0.5 * (step.d / (target.maxHp * 0.2));
    }
    // 2 minimum knockBack
    if (knockBack < 1) knockBack = 2;
    if (knockBack > maxKnockBack) knockBack = maxKnockBack;
    // Else if stun and own side hit
  } else if (step.s) {
    // Counter stun knockback
    knockBack = 65;
  }

  if (step.c) {
    knockBack += 12;
  }

  // Demo: impacto (pausa, destello y temblor) antes del retroceso; el veneno no es un golpe
  if (step.a !== StepType.Poison) {
    await impact(app, fighter, target, step, speed);
  }

  // Stagger with knockBack (Demo royale: con un crítico sale volando, con espacio de sobra en la arena)
  if (royaleArena.enabled && step.c && step.a !== StepType.Poison) {
    await launch(app, spritesheets, target, speed, Math.min(85, knockBack * 1.8 + 18));
  } else {
    await stagger(target, speed, knockBack);
  }

  // Remove poison filter
  if (step.a === StepType.Poison) {
    target.animation.container.filters = target.animation.container.filters?.filter(
      (filter) => filter !== poisonFilter,
    ) || [];
  }

  // Chaining
  if (step.s) {
    void sound.play('sfx', { sprite: 'chaining' });
    target.stunned = true;
  }

  // Set animation to `death` if target is stunned
  if (target.stunned) {
    target.animation.setAnimation('death');
    // Wait for 0.45s if this is a counter attack stun so it gets readable for the player
    if (ownSideHit) {
      await new Promise((resolve) => { setTimeout(resolve, 450 / speed.current); });
    }
  } else {
    // Set animation to `idle`
    target.animation.setAnimation('idle');
  }
};
