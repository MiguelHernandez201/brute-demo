// Demo battle royale: minigun del potenciador +3000 (ver engine/ultimates.boostGear y fightMethods.minigunBurst). La
// lleva en las manos, a la altura de la cadera y apuntando hacia donde mira, y crece con el Súper gigante; su arma de
// siempre se guarda mientras tanto (ver `stash`). En cada turno suyo dispara una ráfaga a cada rival de su duelo (ver
// `fire`): los cañones giran, fogonazos en la boca, trazadoras hasta el rival, chispas donde dan y casquillos que
// saltan. Al acabarse su tiempo la suelta (ver `drop`): cae al suelo y se desvanece, y vuelve a su arma.
import { WeaponName } from '@labrute/prisma';
import { sound } from '@pixi/sound';
import { Application, Container, Graphics, Ticker } from 'pixi.js';
import { AnimationFighter } from './utils/findFighter';
import { tween } from './utils/tween';

type Speed = React.RefObject<number>;

export type Minigun = {
  readonly removed: boolean;
  // Ráfaga contra `target` durante `seconds` segundos de pelea
  fire: (target: AnimationFighter, seconds: number) => Promise<void>;
  // Guarda el arma que tenga en la mano (si equipa otra mientras lleva la minigun, se guarda esa)
  stash: () => void;
  // La suelta (cae y se desvanece) y vuelve a su arma
  drop: () => void;
  // Fuera al momento (cae el brute)
  remove: () => void;
};

// Dibujo de la minigun a escala 100 (largo), apuntando hacia +x, con la empuñadura en el origen
const LENGTH = 100;
const MUZZLE = { x: 99, y: 0 };
const PORT = { x: 30, y: -6 };
const METAL = 0x3d4148;
const DARK = 0x24272b;
const BRASS = 0xd4a537;
// Disparos por segundo de pelea, y cuánto duran en pantalla trazadoras, chispas y casquillos
const RATE = 24;
const TRACER_LIFE = 0.07;
const SPARK_LIFE = 0.16;
const CASING_LIFE = 0.55;
// Largo de la minigun respecto a la altura del brute, y dónde la lleva (respecto a su ancho y su altura)
const SIZE = 0.72;
const HOLD = { x: -0.05, y: -0.42 };

const housing = () => {
  const g = new Graphics();
  // Asa de transporte, empuñadura y caja de munición
  g.moveTo(8, -10).lineTo(8, -19).lineTo(30, -19).lineTo(30, -10).stroke({ width: 3, color: DARK });
  g.roundRect(4, 8, 8, 18, 2).fill(DARK);
  g.rect(14, 9, 20, 15).fill(0x56602b).stroke({ width: 1.5, color: 0x2e3417 });
  // Cinta de balas que sale de la caja
  for (let k = 0; k < 4; k++) g.rect(16 + k * 4.5, 6.5, 3, 4).fill(BRASS);
  // Cuerpo
  g.roundRect(0, -10, 38, 20, 3).fill(METAL).stroke({ width: 2, color: 0x1f2226 });
  g.moveTo(3, -7.5).lineTo(35, -7.5).stroke({ width: 2, color: 0x7a818b });
  return g;
};

// Seis cañones alrededor de un eje, girando (`phase`): se dibujan de atrás adelante, más claros los de delante
const drawBarrels = (g: Graphics, phase: number) => {
  g.clear();
  g.moveTo(38, 0).lineTo(97, 0).stroke({ width: 3, color: DARK });
  const barrels = Array.from({ length: 6 }, (_, k) => {
    const a = phase + (k * Math.PI) / 3;
    return { y: Math.cos(a) * 6, depth: Math.sin(a) };
  }).sort((p, q) => p.depth - q.depth);
  for (const b of barrels) {
    const light = Math.round(0x50 + (b.depth + 1) * 0x25);
    const color = (light << 16) | ((light + 6) << 8) | (light + 12);
    g.moveTo(38, b.y).lineTo(98, b.y).stroke({ width: 3.6, color });
  }
  // Abrazaderas
  g.rect(60, -9, 4, 18).fill(DARK);
  g.rect(88, -9, 4, 18).fill(DARK);
};

const muzzleFlash = () => {
  const g = new Graphics();
  const points: number[] = [];
  for (let k = 0; k < 16; k++) {
    const r = k % 2 ? 5 : 15;
    const a = (k / 16) * Math.PI * 2;
    points.push(Math.cos(a) * r * 1.4 + 8, Math.sin(a) * r);
  }
  g.poly(points).fill({ color: 0xffd35a, alpha: 0.9 });
  g.circle(4, 0, 5).fill({ color: 0xffffff, alpha: 0.95 });
  g.blendMode = 'add';
  g.position.set(MUZZLE.x, MUZZLE.y);
  g.visible = false;
  return g;
};

type Tracer = { x1: number; y1: number; x2: number; y2: number; t: number };
type Spark = { x: number; y: number; t: number };
type Casing = { x: number; y: number; vx: number; vy: number; t: number };

export const minigun = (app: Application, fighter: AnimationFighter, speed: Speed): Minigun => {
  const holder = fighter.animation;
  const body = holder.container;
  const gun = new Container();
  gun.zIndex = 5;
  gun.eventMode = 'none';
  const barrels = new Graphics();
  const flash = muzzleFlash();
  gun.addChild(housing(), barrels, flash);
  body.addChild(gun);
  // Trazadoras, chispas y casquillos: en la arena (van de la boca del arma al rival)
  const fx = new Graphics();
  fx.zIndex = 945;
  fx.blendMode = 'add';
  const casings = new Graphics();
  casings.zIndex = 944;
  app.stage.addChild(casings, fx);

  let removed = false;
  let stored: WeaponName | null = null;
  let phase = 0;
  let spin = 0;
  let firing: { target: AnimationFighter; left: number; next: number; done: () => void } | null = null;
  const tracers: Tracer[] = [];
  const sparks: Spark[] = [];
  const shells: Casing[] = [];

  // Punto del arma (a escala 100) en coordenadas de la arena
  const onStage = (p: { x: number; y: number }) => app.stage.toLocal(gun.toGlobal(p));

  const shoot = (target: AnimationFighter) => {
    const from = onStage(MUZZLE);
    const t = target.animation.container;
    const w = target.animation.baseWidth;
    const h = target.animation.baseHeight;
    const to = { x: t.x + (Math.random() - 0.5) * w * 0.6, y: t.y - h * (0.3 + Math.random() * 0.45) };
    tracers.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, t: TRACER_LIFE });
    sparks.push({ x: to.x, y: to.y, t: SPARK_LIFE });
    const port = onStage(PORT);
    const back = body.scale.x >= 0 ? -1 : 1;
    shells.push({ x: port.x, y: port.y, vx: back * (40 + Math.random() * 40), vy: -(90 + Math.random() * 50), t: CASING_LIFE });
  };

  const remove = () => {
    if (removed) return;
    removed = true;
    app.ticker.remove(tick);
    firing?.done();
    firing = null;
    if (!gun.destroyed) gun.destroy({ children: true });
    if (!fx.destroyed) fx.destroy();
    if (!casings.destroyed) casings.destroy();
  };

  // Lo que ya estaba en pantalla se apaga (antes de las balas nuevas: así cada una se ve al menos una vez, aunque el
  // dispositivo vaya a pocos fotogramas)
  const age = (items: { t: number }[], dt: number) => {
    for (let k = items.length - 1; k >= 0; k--) {
      items[k]!.t -= dt;
      if (items[k]!.t <= 0) items.splice(k, 1);
    }
  };

  const tick = (ticker: Ticker) => {
    if (body.destroyed || gun.destroyed) return remove();
    // Si cae, fuera al momento
    if (fighter.dead) return remove();
    const dt = (Math.min(ticker.elapsedMS, 100) / 1000) * speed.current;
    age(tracers, dt);
    age(sparks, dt);
    age(shells, dt);
    for (const c of shells) {
      c.vy += 420 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
    // Tamaño y sitio: crece con el Súper gigante
    const scale = (holder.baseHeight * SIZE) / LENGTH;
    gun.scale.set(scale);
    gun.position.set(holder.baseWidth * HOLD.x, holder.baseHeight * HOLD.y);
    // Disparando: los cañones a toda velocidad, retroceso, fogonazos y una bala cada 1/RATE s
    if (firing) {
      spin = Math.min(46, spin + dt * 260);
      firing.left -= dt;
      // (los cañones tardan un momento en coger vueltas antes de la primera bala)
      const shooting = spin > 30;
      if (shooting) firing.next -= dt;
      while (shooting && firing.next <= 0) {
        firing.next += 1 / RATE;
        if (!firing.target.animation.container.destroyed) shoot(firing.target);
      }
      flash.visible = shooting && Math.random() < 0.7;
      flash.scale.set(0.8 + Math.random() * 0.5);
      if (shooting) {
        gun.position.x -= Math.random() * 2.5;
        gun.position.y += (Math.random() - 0.5) * 1.5;
      }
      if (firing.left <= 0) {
        const { done } = firing;
        firing = null;
        done();
      }
    } else {
      spin = Math.max(0, spin - dt * 70);
      flash.visible = false;
    }
    phase += spin * dt;
    drawBarrels(barrels, phase);

    fx.clear();
    for (const tr of tracers) {
      fx.moveTo(tr.x1, tr.y1).lineTo(tr.x2, tr.y2)
        .stroke({ width: 2 * scale + 0.6, color: 0xffe08a, alpha: tr.t / TRACER_LIFE });
    }
    for (const sp of sparks) {
      const p = sp.t / SPARK_LIFE;
      fx.circle(sp.x, sp.y, 2 + (1 - p) * 5).fill({ color: 0xfff6c8, alpha: p });
    }
    casings.clear();
    for (const c of shells) {
      casings.rect(c.x - 1.2, c.y - 0.6, 2.4, 1.2).fill({ color: BRASS, alpha: Math.min(1, c.t * 3) });
    }
  };
  app.ticker.add(tick);

  const stash = () => {
    if (removed || body.destroyed) return;
    if (holder.weapon) stored = holder.weapon;
    holder.weapon = null;
  };
  stash();

  return {
    get removed() {
      return removed;
    },
    stash,
    fire: (target, seconds) => {
      if (removed) return Promise.resolve();
      if (sound.exists('minigun')) void sound.play('minigun');
      return new Promise<void>((resolve) => {
        firing?.done();
        firing = { target, left: seconds, next: 0, done: resolve };
      });
    },
    drop: () => {
      if (removed) return;
      // Cae al suelo desde donde estaba, ya en la arena, y se desvanece; él vuelve a su arma
      if (!body.destroyed && !fighter.dead) holder.weapon = stored;
      const at = onStage({ x: 0, y: 0 });
      const scale = gun.scale.x * Math.abs(body.scale.x);
      const facing = body.scale.x >= 0 ? 1 : -1;
      app.ticker.remove(tick);
      removed = true;
      firing?.done();
      firing = null;
      if (!fx.destroyed) fx.destroy();
      if (!casings.destroyed) casings.destroy();
      body.removeChild(gun);
      gun.position.set(at.x, at.y);
      gun.scale.set(scale * facing, scale);
      gun.zIndex = 900;
      app.stage.addChild(gun);
      void sound.play('sfx', { sprite: 'equip' });
      const ground = body.destroyed ? at.y + 20 : body.y - 3;
      void tween(gun, { y: ground, angle: facing * 25, duration: 0.35 / speed.current, ease: 'power2.in' })
        .then(() => tween(gun, { alpha: 0, duration: 1.2 / speed.current, delay: 0.6 / speed.current }))
        .then(() => {
          if (!gun.destroyed) gun.destroy({ children: true });
        });
    },
    remove,
  };
};
