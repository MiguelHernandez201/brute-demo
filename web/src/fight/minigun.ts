// Demo battle royale: minigun del potenciador +3000 (ver engine/ultimates.boostGear y fightMethods.minigunBurst). La
// agarra con la mano con la que coge las armas: el asa va en su puño, que se ve encima (ver `hold`). Crece con el Súper
// gigante, y su arma de siempre se guarda mientras tanto (ver `stash`). En cada turno suyo dispara una ráfaga a cada
// rival de su duelo (ver `fire`): gira el arma sobre el puño hasta apuntarle, los cañones dan vueltas y sale un chorro
// de balas (destellos que vuelan hasta él), con fogonazos en la boca, chispas donde dan y casquillos que saltan. Al
// acabarse su tiempo la suelta (ver `drop`): cae al suelo y se desvanece, y vuelve a su arma.
import { WeaponName } from '@labrute/prisma';
import { sound } from '@pixi/sound';
import { Application, Container, Filter, Graphics, Matrix, Sprite, Ticker } from 'pixi.js';
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

// Dibujo de la minigun a escala 100 (largo), apuntando hacia +x
const LENGTH = 100;
const MUZZLE = { x: 99, y: 0 };
const PORT = { x: 30, y: -6 };
const METAL = 0x3d4148;
const DARK = 0x24272b;
const BRASS = 0xd4a537;
// Balas por segundo de pelea, a qué velocidad vuelan (unidades de la arena por segundo) y el largo de su destello: con
// el rival a 150-250 unidades van 15-25 balas en el aire a la vez; casquillos que saltan (uno de cada tantas balas) y
// chispas donde dan (parte de las balas). Antes eran 24 por segundo y cada una, una raya fija de la boca al rival: se
// veían dos o tres
const RATE = 80;
const BULLET_SPEED = 750;
const STREAK = 20;
const CASING_EVERY = 3;
const SPARK_CHANCE = 0.55;
const SPARK_LIFE = 0.16;
const CASING_LIFE = 0.55;
// Largo de la minigun respecto a la altura del brute, y dónde la lleva si no se le ve la mano (respecto a su ancho y su
// altura)
const SIZE = 0.64;
const HOLD = { x: -0.05, y: -0.42 };
// La mano con la que coge las armas (ver FighterHolder: WEAPON_SYMBOL) y, dentro, su puño; y en el dibujo de la
// minigun, el asa de arriba, donde va el puño (y sobre la que gira al apuntar): en guardia lleva los puños a la altura
// de la barbilla, y así el arma le cuelga a la altura del pecho (por la empuñadura de abajo le tapaba la cara)
const HAND = 'Symbol68';
const FIST = 'Symbol38';
const GRIP = { x: 24, y: -16 };
// Al disparar gira el arma hacia el rival, como mucho tanto hacia arriba o hacia abajo (radianes), y lo rápido que
// llega (antes apuntaba siempre recto y las balas salían en diagonal)
const MAX_AIM = 1;
const AIM_SPEED = 14;
// Postura con la minigun en las manos (al disparar, y en vez del reposo): plantado, con el puño de esa mano adelantado a
// la altura del pecho y el arma a la cadera. Es un fotograma de la estocada, quieto (en guardia llevaba el puño a la
// barbilla y el arma le tapaba la cara). Para correr, encajar un golpe o lo que sea se anima como siempre
const AIM = { animation: 'estoc', frame: 3 } as const;
const RESTING = new Set(['idle', 'monk']);

// Contenedor visible con esa etiqueta dentro de `root` (con todos los de por medio visibles), salvo los de `skip`
const findVisible = (root: Container, label: string, skip: Container[]): Container | undefined => {
  for (const child of root.children) {
    if (!child.visible || skip.includes(child)) continue;
    if (child.label === label) return child;
    const found = findVisible(child, label, skip);
    if (found) return found;
  }
  return undefined;
};

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

// Bala en vuelo: de la boca del arma (x1, y1) a donde da (x2, y2), lleva `t` de los `life` segundos que tarda
type Bullet = { x1: number; y1: number; x2: number; y2: number; t: number; life: number; spark: boolean };
type Spark = { x: number; y: number; t: number };
type Casing = { x: number; y: number; vx: number; vy: number; t: number };

export const minigun = (app: Application, fighter: AnimationFighter, speed: Speed): Minigun => {
  const holder = fighter.animation;
  const body = holder.container;
  const gun = new Container();
  gun.zIndex = 5;
  gun.eventMode = 'none';
  // (gira sobre el asa, donde la agarra)
  gun.pivot.set(GRIP.x, GRIP.y);
  const barrels = new Graphics();
  const flash = muzzleFlash();
  gun.addChild(housing(), barrels, flash);
  // Copia de su puño (las mismas piezas, con su color y en su sitio) encima de la empuñadura: el de verdad queda detrás
  // del arma, o del cuerpo
  const fist = new Container();
  fist.zIndex = 6;
  fist.eventMode = 'none';
  const pieces: Sprite[] = [];
  body.addChild(gun, fist);
  // Balas, chispas y casquillos: en la arena (van de la boca del arma al rival)
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
  // Hacia dónde apunta (radianes respecto a recto, en el espacio del brute)
  let aim = 0;
  let shots = 0;
  let firing: { target: AnimationFighter; left: number; next: number; done: () => void } | null = null;
  // Quieto en la postura de la minigun (ver AIM). Si otra cosa le cambia la animación, vuelve a moverse
  let posed = false;
  const pose = () => {
    if (posed || fighter.dead || body.destroyed) return;
    posed = true;
    holder.animationSpeed = 0;
    holder.setAnimation(AIM.animation, AIM.frame);
  };
  // (la velocidad, solo si sigue quieto por la postura: otras cosas, como la cámara lenta de una fatality, ponen la suya)
  const unpose = (rest = false) => {
    if (!posed) return;
    posed = false;
    if (holder.animationSpeed === 0) holder.animationSpeed = 1;
    if (rest && !fighter.dead && !body.destroyed) holder.setAnimation('idle');
  };
  const bullets: Bullet[] = [];
  const sparks: Spark[] = [];
  const shells: Casing[] = [];

  // Punto del arma (a escala 100) en coordenadas de la arena
  const onStage = (p: { x: number; y: number }) => app.stage.toLocal(gun.toGlobal(p));

  // Transformación de `node` en el espacio del brute
  const relative = (node: Container) => {
    const o = body.toLocal(node.toGlobal({ x: 0, y: 0 }));
    const ex = body.toLocal(node.toGlobal({ x: 1, y: 0 }));
    const ey = body.toLocal(node.toGlobal({ x: 0, y: 1 }));
    return new Matrix(ex.x - o.x, ex.y - o.y, ey.x - o.x, ey.y - o.y, o.x, o.y);
  };
  // La agarra (en cada fotograma: la mano se mueve con la animación): el asa en su puño y la copia del puño encima. Si
  // ahora no se le ve la mano, la lleva a la altura de la cadera
  const hold = (scale: number) => {
    const hand = findVisible(body, HAND, [gun, fist]);
    const real = hand?.children.find((c) => c.label === FIST && c.visible);
    const parts: { sprite: Sprite; filters: Filter[] }[] = [];
    const collect = (c: Container, filters: Filter[]) => {
      for (const child of c.children) {
        if (!child.visible) continue;
        const own = [...filters, ...((child.filters as Filter[] | null) ?? [])];
        if (child instanceof Sprite && child.renderable) parts.push({ sprite: child, filters: own });
        collect(child, own);
      }
    };
    if (real) collect(real, (real.filters as Filter[] | null) ?? []);
    pieces.forEach((piece) => { piece.visible = false; });
    if (!real || !parts.length) {
      gun.position.set(holder.baseWidth * HOLD.x + GRIP.x * scale, holder.baseHeight * HOLD.y + GRIP.y * scale);
      return;
    }
    parts.forEach(({ sprite, filters }, k) => {
      let piece = pieces[k];
      if (!piece) {
        piece = new Sprite();
        pieces.push(piece);
        fist.addChild(piece);
      }
      piece.texture = sprite.texture;
      piece.tint = sprite.tint;
      piece.alpha = sprite.alpha;
      piece.anchor.copyFrom(sprite.anchor);
      piece.filters = filters.length ? filters : null;
      piece.setFromMatrix(relative(sprite));
      piece.visible = true;
    });
    // El asa, en el centro del puño
    const box = real.getLocalBounds();
    const center = relative(real).apply({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
    gun.position.set(center.x, center.y);
  };

  // Hacia dónde tiene que girar para apuntar a `target` (al centro de su cuerpo), dentro de lo que puede
  const aimAt = (target: AnimationFighter) => {
    const t = target.animation;
    const goal = body.toLocal(t.container.toGlobal({ x: 0, y: -t.baseHeight * 0.5 }));
    const angle = Math.atan2(goal.y - gun.y, Math.abs(goal.x - gun.x));
    return Math.max(-MAX_AIM, Math.min(MAX_AIM, angle));
  };

  // Bala a `target`, disparada hace `late` segundos (en un dispositivo lento salen varias en un mismo fotograma: cada
  // una ya va por donde le toca, y el chorro se reparte por el camino)
  const shoot = (target: AnimationFighter, late: number) => {
    const from = onStage(MUZZLE);
    const t = target.animation.container;
    const w = target.animation.baseWidth;
    const h = target.animation.baseHeight;
    const to = { x: t.x + (Math.random() - 0.5) * w * 0.7, y: t.y - h * (0.25 + Math.random() * 0.55) };
    const life = Math.max(0.03, Math.hypot(to.x - from.x, to.y - from.y) / BULLET_SPEED);
    const spark = Math.random() < SPARK_CHANCE;
    bullets.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, t: Math.min(late, life * 0.95), life, spark });
    shots += 1;
    if (shots % CASING_EVERY) return;
    const port = onStage(PORT);
    const back = body.scale.x >= 0 ? -1 : 1;
    shells.push({ x: port.x, y: port.y, vx: back * (40 + Math.random() * 40), vy: -(90 + Math.random() * 50), t: CASING_LIFE });
  };

  const remove = () => {
    if (removed) return;
    removed = true;
    app.ticker.remove(tick);
    unpose(true);
    firing?.done();
    firing = null;
    if (!gun.destroyed) gun.destroy({ children: true });
    if (!fist.destroyed) fist.destroy({ children: true });
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
    if (posed && holder.animation !== AIM.animation) unpose();
    // (a quien está cayendo, no)
    if (!posed && RESTING.has(holder.animation) && fighter.hp > 0) pose();
    age(sparks, dt);
    age(shells, dt);
    for (const c of shells) {
      c.vy += 420 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
    // Las balas avanzan; las que llegan, chispa donde dan
    for (let k = bullets.length - 1; k >= 0; k--) {
      const b = bullets[k]!;
      b.t += dt;
      if (b.t < b.life) continue;
      bullets.splice(k, 1);
      if (b.spark) sparks.push({ x: b.x2, y: b.y2, t: SPARK_LIFE });
    }
    // Tamaño y sitio: crece con el Súper gigante, y en su puño
    const scale = (holder.baseHeight * SIZE) / LENGTH;
    gun.scale.set(scale);
    hold(scale);
    // Apunta al rival mientras dispara (girando sobre el puño) y luego vuelve a recto, poco a poco
    const target = firing && !firing.target.animation.container.destroyed ? firing.target : null;
    const want = target ? aimAt(target) : 0;
    aim += (want - aim) * Math.min(1, dt * AIM_SPEED);
    gun.rotation = aim;
    // Disparando: los cañones a toda velocidad, retroceso, fogonazos y una bala cada 1/RATE s
    if (firing) {
      spin = Math.min(46, spin + dt * 260);
      firing.left -= dt;
      // (los cañones tardan un momento en coger vueltas antes de la primera bala)
      const shooting = spin > 30;
      if (shooting) firing.next -= dt;
      while (shooting && firing.next <= 0) {
        const late = -firing.next;
        firing.next += 1 / RATE;
        if (target) shoot(target, late);
      }
      flash.visible = shooting && Math.random() < 0.8;
      flash.scale.set(0.8 + Math.random() * 0.6);
      // Retroceso a lo largo del arma: ella y el puño que la agarra
      if (shooting) {
        const back = Math.random() * 2.5;
        const kick = { x: -Math.cos(aim) * back, y: -Math.sin(aim) * back + (Math.random() - 0.5) * 1.5 };
        gun.position.set(gun.x + kick.x, gun.y + kick.y);
        fist.position.set(kick.x, kick.y);
      } else {
        fist.position.set(0, 0);
      }
      if (firing.left <= 0) {
        const { done } = firing;
        firing = null;
        done();
      }
    } else {
      spin = Math.max(0, spin - dt * 70);
      flash.visible = false;
      fist.position.set(0, 0);
    }
    phase += spin * dt;
    drawBarrels(barrels, phase);

    fx.clear();
    // Cada bala, un destello que vuela hacia donde da (más fino en la cola)
    for (const b of bullets) {
      const length = Math.hypot(b.x2 - b.x1, b.y2 - b.y1) || 1;
      const head = Math.min(1, b.t / b.life);
      const tail = Math.max(0, head - (STREAK * Math.max(1, scale * 1.4)) / length);
      const hx = b.x1 + (b.x2 - b.x1) * head;
      const hy = b.y1 + (b.y2 - b.y1) * head;
      const tx = b.x1 + (b.x2 - b.x1) * tail;
      const ty = b.y1 + (b.y2 - b.y1) * tail;
      fx.moveTo(tx, ty).lineTo(hx, hy).stroke({ width: 1.6 * scale + 0.8, color: 0xffe08a, alpha: 0.95 });
      fx.circle(hx, hy, 0.9 * scale + 0.6).fill({ color: 0xffffff, alpha: 0.95 });
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
      pose();
      return new Promise<void>((resolve) => {
        firing?.done();
        firing = { target, left: seconds, next: 0, done: resolve };
      });
    },
    drop: () => {
      if (removed) return;
      // Cae al suelo desde donde estaba, ya en la arena, y se desvanece; él vuelve a su arma
      if (!body.destroyed && !fighter.dead) holder.weapon = stored;
      const at = onStage(GRIP);
      const scale = gun.scale.x * Math.abs(body.scale.x);
      const facing = body.scale.x >= 0 ? 1 : -1;
      app.ticker.remove(tick);
      removed = true;
      unpose(true);
      firing?.done();
      firing = null;
      if (!fx.destroyed) fx.destroy();
      if (!casings.destroyed) casings.destroy();
      // (la mano la suelta)
      if (!fist.destroyed) fist.destroy({ children: true });
      body.removeChild(gun);
      // Igual que se veía: si miraba a la izquierda, volteada (y su giro, al revés)
      gun.position.set(at.x, at.y);
      gun.scale.set(scale * facing, scale);
      gun.rotation = aim * facing;
      gun.zIndex = 900;
      app.stage.addChild(gun);
      void sound.play('sfx', { sprite: 'equip' });
      const ground = body.destroyed ? at.y + 20 : body.y - 3;
      void tween(gun, { y: ground, angle: gun.angle + facing * 25, duration: 0.35 / speed.current, ease: 'power2.in' })
        .then(() => tween(gun, { alpha: 0, duration: 1.2 / speed.current, delay: 0.6 / speed.current }))
        .then(() => {
          if (!gun.destroyed) gun.destroy({ children: true });
        });
    },
    remove,
  };
};
