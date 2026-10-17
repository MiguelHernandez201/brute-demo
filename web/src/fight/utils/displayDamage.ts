import { BossName } from '@labrute/prisma';
import { Application, FillGradient, Text } from 'pixi.js';
import { AnimationFighter } from './findFighter';
import { insideXBounds } from './insideXBounds';
import { tween } from './tween';

// Demo: números de daño que se leen bien. Aparecen de golpe, salen hacia la espalda del que recibe y se desvanecen
// en un segundo; los críticos son más grandes, dorados y tiemblan. Varios seguidos sobre el mismo se escalonan.
const recentDamage = new WeakMap<AnimationFighter, { at: number; slot: number }>();

export const displayDamage = ({
  app,
  target,
  damage,
  criticalHit,
  speed,
}: {
  app: Application;
  target: AnimationFighter;
  damage: number;
  criticalHit?: 1 | 0;
  speed: React.RefObject<number>;
}) => {
  const critical = !!criticalHit;
  // Display floating and fading damage text
  const damageText = new Text({
    text: `-${damage}`,
    style: {
      fontFamily: 'GameFont',
      fontSize: critical ? 34 : 24,
      fill: critical
        ? new FillGradient({
          type: 'linear',
          start: { x: 0, y: 0 },
          end: { x: 0, y: 1 },
          colorStops: [
            { offset: 0, color: '#fff27a' },
            { offset: 0.5, color: '#ff9a1f' },
            { offset: 1, color: '#e01010' },
          ],
          textureSpace: 'local',
        })
        : 0xffffff,
      stroke: { color: critical ? 0x3a0000 : 0x1a1208, width: critical ? 5 : 4, join: 'round' },
    },
  });
  damageText.anchor.set(0.5);
  damageText.zIndex = 1000;

  damageText.x = insideXBounds(target.animation.container.x);

  // Custom height for bosses
  if (target.type === 'boss') {
    if (target.name === BossName.GoldClaw) {
      damageText.y = target.animation.container.y - 100;
    } else {
      damageText.y = target.animation.container.y - 50;
    }
  } else {
    damageText.y = target.animation.container.y - target.animation.container.height;
  }

  // Si acaba de recibir otro, este sale un escalón más arriba para no taparlo
  const now = performance.now();
  const recent = recentDamage.get(target);
  const slot = recent && now - recent.at < 700 / speed.current ? (recent.slot + 1) % 3 : 0;
  recentDamage.set(target, { at: now, slot });
  damageText.y -= slot * 18;

  damageText.scale.set(0.3);
  app.stage.addChild(damageText);

  const s = speed.current;
  // Hacia la espalda del que recibe
  const side = target.team === 'L' ? -1 : 1;
  void tween(damageText.scale, { duration: 0.2 / s, ease: 'back.out(3)', x: 1, y: 1 });
  void tween(damageText, {
    duration: 0.95 / s,
    ease: 'power2.out',
    x: insideXBounds(damageText.x + side * (12 + slot * 6)),
    y: damageText.y - (critical ? 52 : 40),
  });
  if (critical) {
    void tween(damageText, {
      keyframes: [0.16, -0.13, 0.09, -0.05, 0].map((rotation) => ({ rotation, duration: 0.06 / s })),
    });
  }
  tween(damageText, {
    duration: 0.3 / s,
    delay: 0.65 / s,
    ease: 'power1.in',
    alpha: 0,
  }).then(() => {
    // Remove text
    damageText.destroy();
  }).catch(console.error);
};
