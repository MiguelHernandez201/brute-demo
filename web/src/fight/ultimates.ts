// Demo battle royale: animaciones de las ultimates (ver engine/ultimates). Reutilizan los gráficos y sonidos de las
// técnicas en las que se inspiran (Diluvio, Bomba, Prisa y Súper gigante), pero sobre varios rivales a la vez.
// Cada golpe se anima por su cuenta (ver el planificador del royale en setupFight): solo espera a que su objetivo
// quede libre, así la ultimate se ve enseguida aunque los demás estén a mitad de un turno. El letrero y el brillo de
// quien la lanza son solo efectos encima: no le paran lo que esté haciendo.
import { randomBetween, WeaponById } from '@labrute/core';
import { WeaponName } from '@labrute/prisma';
import { sound } from '@pixi/sound';
import {
  AnimatedSprite, Application, BlurFilter, ColorMatrixFilter, Filter, Graphics, Sprite, Text, Ticker,
} from 'pixi.js';
import { AdjustmentFilter } from 'pixi-filters/adjustment';
import { ColorOverlayFilter } from 'pixi-filters/color-overlay';
import { MotionBlurFilter } from 'pixi-filters/motion-blur';
import { GIANT_SECONDS, type Ultimate } from '../engine/ultimates';
import { playResistAnimation } from './resist';
import { stagger } from './stagger';
import { untrap } from './untrap';
import { updateHp } from './updateHp';
import { displayDamage } from './utils/displayDamage';
import { AnimationFighter, findFighter } from './utils/findFighter';
import { royaleArena } from './utils/fightPositions';
import { playHitEffect, playStepDust } from './utils/playVFX';
import { Spritesheets } from './utils/spritesheet';
import { shakeStage } from './utils/stageAnimations';
import { tween } from './utils/tween';

type Speed = React.RefObject<number>;
// Golpe `k` de los `n` de la ultimate `id`
type Series = { id: number; k: number; n: number };

const wait = (seconds: number, speed: Speed) => tween({ t: 0 }, { t: 1, duration: seconds / speed.current });
const pos = (f: AnimationFighter) => f.animation.container;

const TITLES: Record<Ultimate, string> = {
  flood: '¡DILUVIO TOTAL!',
  bombs: '¡LLUVIA DE BOMBAS!',
  haste: '¡PRISA EN CADENA!',
  giant: '¡SÚPER GIGANTE!',
};
// Letreros a la vista: cada uno nuevo va debajo de los anteriores
let titles: Text[] = [];

// Recibe un golpe de ultimate: animación de golpe, daño, vida y un empujón (más fuerte si es crítico). Termina cuando
// se ha recuperado (luego ya puede hacer otra cosa)
const struck = async (
  app: Application,
  spritesheets: Spritesheets,
  fighters: AnimationFighter[],
  target: AnimationFighter,
  damage: number,
  speed: Speed,
  knockBack: number,
  critical = false,
) => {
  if (pos(target).destroyed) return;
  target.stunned = false;
  untrap(app, spritesheets, target);
  const animation = target.type === 'brute' && target.gender === 'male'
    ? `hit-${randomBetween(0, 2) as 0 | 1 | 2}` as const
    : 'hit';
  target.animation.setAnimation(animation);
  displayDamage({ app, target, damage, speed, criticalHit: critical ? 1 : 0 });
  playResistAnimation(app, spritesheets, target, speed);
  updateHp(fighters, target, -damage, speed, false);
  await stagger(target, speed, knockBack + (critical ? 10 : 0), 0.35);
  if (!pos(target).destroyed && target.animation.animation.startsWith('hit')) {
    target.animation.setAnimation(target.stunned ? 'death' : 'idle');
  }
};

// Al lanzarla: letrero arriba (debajo del reloj), destello dorado y un anillo de poder a los pies de quien la lanza
export const ultimateCast = (
  app: Application,
  fighters: AnimationFighter[],
  step: { f: number; k: Ultimate },
  speed: Speed,
) => {
  const caster = findFighter(fighters, step.f);
  if (!caster || pos(caster).destroyed) return;
  titles = titles.filter((t) => !t.destroyed);
  const title = new Text({
    text: `${caster.name.toLocaleUpperCase()}: ${TITLES[step.k]}`,
    style: { fontFamily: 'GameFont', fontSize: 18, fill: 0xffd23f, stroke: { color: 0x3a1a00, width: 5, join: 'round' } },
  });
  title.anchor.set(0.5);
  title.position.set(250, 52 + 22 * (titles.length % 4));
  title.zIndex = 960;
  title.scale.set(0.4);
  titles.push(title);
  app.stage.addChild(title);
  void tween(title.scale, { x: 1, y: 1, duration: 0.35 / speed.current, ease: 'back.out(2)' });
  void tween(title, { alpha: 0, duration: 0.5 / speed.current, delay: 1.8 / speed.current }).then(() => title.destroy());

  const c = pos(caster);
  const glow = new ColorOverlayFilter({ color: 0xffd23f, alpha: 0.75 });
  c.filters = [...(c.filters || []), glow];
  void tween(glow, { alpha: 0, duration: 1 / speed.current }).then(() => {
    if (!c.destroyed) c.filters = (c.filters || []).filter((f) => f !== glow);
  });
  const aura = new Graphics()
    .ellipse(0, 0, 30, 10)
    .stroke({ width: 4, color: 0xffd23f, alpha: 0.9 });
  aura.position.set(c.x, c.y + 2);
  aura.zIndex = c.y - 1;
  aura.scale.set(0.3);
  app.stage.addChild(aura);
  void tween(aura.scale, { x: 1.6, y: 1.6, duration: 0.6 / speed.current, ease: 'power2.out' });
  void tween(aura, { alpha: 0, duration: 0.6 / speed.current }).then(() => aura.destroy());
  void sound.play('sfx', { sprite: 'fierceBrute' });
  void shakeStage(app, speed, 4, 300);
};

// Diluvio total: cada arma cae del cielo en diagonal sobre su objetivo, con el efecto del Diluvio al llegar
export const ultimateFlood = async (
  app: Application,
  spritesheets: Spritesheets,
  fighters: AnimationFighter[],
  step: Series & { t: number; w?: number; d: number },
  speed: Speed,
) => {
  const target = findFighter(fighters, step.t);
  if (!target || pos(target).destroyed) return;
  const weapon = typeof step.w === 'number' ? WeaponById[step.w] : WeaponName.lance;
  const item = new Sprite(spritesheets.thrownWeapons.textures[`${weapon}.png`]);
  item.anchor.set(1, 0.5);
  const to = { x: pos(target).x + randomBetween(-10, 10), y: pos(target).y - target.animation.baseHeight * 0.45 };
  const from = { x: to.x + (Math.random() < 0.5 ? -1 : 1) * randomBetween(60, 110), y: -30 };
  item.position.set(from.x, from.y);
  item.angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  item.zIndex = 940;
  app.stage.addChild(item);
  void sound.play('sfx', { sprite: 'flashFlood' });
  await tween(item, { x: to.x, y: to.y, duration: 0.22 / speed.current, ease: 'none' });
  const splash = new AnimatedSprite(spritesheets.misc.animations.flashFlood || []);
  splash.anchor.set(1, 0.5);
  splash.position.set(to.x, to.y);
  splash.angle = item.angle;
  splash.zIndex = 941;
  splash.animationSpeed = speed.current * 0.35;
  splash.loop = false;
  splash.onComplete = () => splash.destroy();
  app.stage.addChild(splash);
  splash.play();
  // El arma cae al suelo y se desvanece
  void tween(item, { y: pos(target).y + 3, alpha: 0, duration: 0.9 / speed.current, delay: 0.15 / speed.current })
    .then(() => item.destroy());
  await struck(app, spritesheets, fighters, target, step.d, speed, 10);
};

// Lluvia de bombas: cada bomba cae del cielo (con su sombra creciendo en el suelo) y estalla sobre sus objetivos
export const ultimateBomb = async (
  app: Application,
  spritesheets: Spritesheets,
  fighters: AnimationFighter[],
  step: Series & { t: number[]; d: Record<number, number> },
  speed: Speed,
) => {
  const victims = step.t.map((t) => findFighter(fighters, t)).filter((v): v is AnimationFighter => !!v && !pos(v).destroyed);
  const spot = victims.length
    ? {
      x: victims.reduce((sum, v) => sum + pos(v).x, 0) / victims.length,
      y: victims.reduce((sum, v) => sum + pos(v).y, 0) / victims.length,
    }
    : { x: randomBetween(royaleArena.minX, royaleArena.maxX), y: randomBetween(royaleArena.minY, royaleArena.maxY) };
  const shadow = new Graphics().ellipse(0, 0, 11, 4).fill({ color: 0x000000, alpha: 0.35 });
  shadow.position.set(spot.x, spot.y + 2);
  shadow.zIndex = spot.y - 1;
  shadow.scale.set(0.2);
  const bombSprite = new AnimatedSprite(spritesheets.misc.animations.bomb || []);
  bombSprite.animationSpeed = speed.current / 2;
  bombSprite.anchor.set(0.5);
  bombSprite.position.set(spot.x + randomBetween(-30, 30), -40);
  bombSprite.zIndex = 930;
  app.stage.addChild(shadow, bombSprite);
  bombSprite.play();
  const fall = 0.55 / speed.current;
  void tween(shadow.scale, { x: 1, y: 1, duration: fall, ease: 'none' });
  await tween(bombSprite, { x: spot.x, y: spot.y - 8, duration: fall, ease: 'circ.in' });
  bombSprite.destroy();
  shadow.destroy();
  // Explosión como la de la bomba normal
  const explosion = new AnimatedSprite(spritesheets.misc.animations.explosion || []);
  explosion.animationSpeed = speed.current;
  explosion.loop = false;
  explosion.filters = [new BlurFilter({ strength: 3 })];
  explosion.width *= 2;
  explosion.height *= 2;
  explosion.position.set(spot.x, spot.y);
  explosion.zIndex = spot.y;
  explosion.onComplete = () => explosion.destroy();
  app.stage.addChild(explosion);
  explosion.play();
  void sound.play('sfx', { sprite: 'bomb' });
  void shakeStage(app, speed, 6, 250);
  await Promise.all(victims.map((v) => struck(app, spritesheets, fighters, v, step.d[v.index] ?? 0, speed, 16)));
};

// Prisa en cadena: tras cargarse, embiste a cada rival uno detrás de otro, a toda velocidad y brillando como la Prisa.
// Las embestidas pueden llegar en otro orden (va a por el primero que quede libre) y alguna más tarde (la que remata a
// alguien espera a que acabe lo que tenía en cola): brilla solo mientras embiste, y se cuentan para saber cuál es la
// primera (se carga) y la última (polvo al acabar)
const hasteRuns = new Map<number, { started: number; done: number; filters: Filter[]; brute?: AnimationFighter }>();
export const ultimateHaste = async (
  app: Application,
  spritesheets: Spritesheets,
  fighters: AnimationFighter[],
  step: Series & { b: number; t: number; d: number; c?: 0 | 1 },
  speed: Speed,
) => {
  const run = hasteRuns.get(step.id) ?? { started: 0, done: 0, filters: [] };
  hasteRuns.set(step.id, run);
  const first = run.started === 0;
  run.started += 1;
  const brute = findFighter(fighters, step.b);
  const target = findFighter(fighters, step.t);
  try {
    if (!brute || !target || pos(brute).destroyed || pos(target).destroyed) return;
    const c = pos(brute);
    if (first) {
      void sound.play('sfx', { sprite: 'haste' });
      const ready = brute.animation.waitForEvent('strengthen:end', 1200);
      brute.animation.setAnimation('strengthen');
      await ready;
      run.filters = [new AdjustmentFilter({ red: 2, green: 2 }), new MotionBlurFilter({ velocity: [50, 0], kernelSize: 9 })];
      run.brute = brute;
    }
    if (!run.filters.every((f) => c.filters?.includes(f))) c.filters = [...(c.filters || []), ...run.filters];
    brute.animation.setAnimation('run');
    const dir = pos(target).x >= c.x ? 1 : -1;
    c.scale.x = Math.abs(c.scale.x) * dir;
    playStepDust(app, spritesheets, brute, speed, -dir * 8, 0.5);
    await tween(c, {
      x: pos(target).x - dir * 24,
      y: pos(target).y,
      duration: 0.16 / speed.current,
      ease: 'none',
    });
    playHitEffect(app, spritesheets, brute, target, speed);
    void sound.play('sfx', { sprite: `fist${randomBetween(1, 3)}` });
    const hit = struck(app, spritesheets, fighters, target, step.d, speed, 18, !!step.c);
    await wait(0.12, speed);
    brute.animation.setAnimation('idle');
    await hit;
  } finally {
    run.done += 1;
    if (brute && !pos(brute).destroyed) {
      pos(brute).filters = (pos(brute).filters || []).filter((f) => !run.filters.includes(f));
      if (run.done >= step.n) playStepDust(app, spritesheets, brute, speed, 0, 0.7);
    }
    if (run.done >= step.n) hasteRuns.delete(step.id);
  }
};

// Súper gigante: tras cada ataque da un pisotón que suelta una onda desde sus pies, tan grande como haga falta para
// llegar a los que alcanza (`v`). Sus golpes van aparte (ultimateCleaveHit): a cada uno cuando le llega la onda o, si
// estaba ocupado, en cuanto queda libre
const rings = new Map<number, { x: number; y: number; at: number; radius: number }>();
const RING_SECONDS = 0.55;
export const ultimateRing = async (
  app: Application,
  spritesheets: Spritesheets,
  fighters: AnimationFighter[],
  step: { f: number; v?: number[] },
  speed: Speed,
) => {
  const giant = findFighter(fighters, step.f);
  if (!giant || pos(giant).destroyed) return;
  const g = pos(giant);
  // Lo vertical cuenta el doble (la arena es poco profunda): la onda es una elipse el doble de ancha que de alta
  const radius = Math.max(70, ...(step.v ?? []).map((index) => {
    const victim = findFighter(fighters, index);
    return victim && !pos(victim).destroyed ? Math.hypot(pos(victim).x - g.x, (pos(victim).y - g.y) * 2) + 20 : 0;
  }));
  rings.set(giant.index, { x: g.x, y: g.y, at: performance.now(), radius });
  const ring = new Graphics()
    .ellipse(0, 0, 40, 20)
    .stroke({ width: 5, color: 0xffd23f, alpha: 0.9 })
    .ellipse(0, 0, 34, 17)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
  ring.position.set(g.x, g.y + 2);
  ring.zIndex = g.y - 1;
  ring.scale.set(0.3);
  app.stage.addChild(ring);
  void tween(ring.scale, { x: radius / 40, y: radius / 40, duration: RING_SECONDS / speed.current, ease: 'none' });
  void tween(ring, { alpha: 0, duration: RING_SECONDS / speed.current, ease: 'power2.in' }).then(() => ring.destroy());
  void sound.play('sfx', { sprite: 'hammer' });
  void shakeStage(app, speed, 7, 300);
  playStepDust(app, spritesheets, giant, speed, 0, 1.2);
  await wait(0.3, speed);
};

// Golpe de la onda del Súper gigante a uno de los que alcanza: espera a que le llegue (si no le ha llegado ya)
export const ultimateCleaveHit = async (
  app: Application,
  spritesheets: Spritesheets,
  fighters: AnimationFighter[],
  step: { f: number; t: number; d: number },
  speed: Speed,
) => {
  const victim = findFighter(fighters, step.t);
  if (!victim || pos(victim).destroyed) return;
  const ring = rings.get(step.f);
  if (ring) {
    const distance = Math.hypot(pos(victim).x - ring.x, (pos(victim).y - ring.y) * 2);
    const arrives = (RING_SECONDS * Math.min(1, distance / ring.radius)) / speed.current;
    const left = arrives - (performance.now() - ring.at) / 1000;
    if (left > 0) await wait(left * speed.current, speed);
  }
  await struck(app, spritesheets, fighters, victim, step.d, speed, 22);
};

// Cuenta los segundos del Súper gigante desde que crece (con el reloj de la pelea: se para con la pausa y va más
// rápido a x2) y entonces avisa (`end`) para que se le pase
export const giantTimer = (app: Application, speed: Speed, end: () => void) => {
  let left = GIANT_SECONDS;
  const tick = (ticker: Ticker) => {
    left -= (Math.min(ticker.elapsedMS, 250) / 1000) * speed.current;
    if (left > 0) return;
    app.ticker.remove(tick);
    end();
  };
  app.ticker.add(tick);
};

// Se acaba el Súper gigante: vuelve a su tamaño con una nube de polvo
export const giantShrink = async (
  app: Application,
  spritesheets: Spritesheets,
  fighters: AnimationFighter[],
  step: { f: number },
  speed: Speed,
) => {
  const giant = findFighter(fighters, step.f);
  if (!giant || giant.dead || pos(giant).destroyed) return;
  playStepDust(app, spritesheets, giant, speed, 0, 1);
  const flash = new ColorMatrixFilter();
  flash.brightness(1.6, false);
  pos(giant).filters = [...(pos(giant).filters || []), flash];
  const size = { s: giant.animation.giantScale };
  await tween(size, {
    s: 1,
    duration: 0.6 / speed.current,
    ease: 'power2.inOut',
    onUpdate: () => giant.animation.setGiantScale(size.s),
  });
  giant.animation.setGiantScale(1);
  if (!pos(giant).destroyed) pos(giant).filters = (pos(giant).filters || []).filter((f) => f !== flash);
};

// Se acabó la ronda con ultimates a medias (sus golpes ya no se verán): fuera el brillo de la Prisa
export const clearUltimates = () => {
  for (const run of hasteRuns.values()) {
    const c = run.brute && pos(run.brute);
    if (c && !c.destroyed) c.filters = (c.filters || []).filter((f) => !run.filters.includes(f));
  }
  hasteRuns.clear();
  rings.clear();
};
