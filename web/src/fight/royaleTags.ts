// Demo battle royale: cada brute lleva encima su nombre y su vida, con un color propio que también marca su fila
// en la lista de participantes. Al pasar el ratón por una fila (o tocarla) ese luchador se resalta en la arena.
// Junto a la barra, desde su primera victoria (cada rival que elimina), un trofeo cuenta sus victorias de la ronda.
import { Application, Container, Graphics, Text, Ticker } from 'pixi.js';
import type { CameraView } from './royaleCamera';
import { AnimationFighter } from './utils/findFighter';

// Colores bien distintos entre sí y legibles sobre la arena (con el contorno oscuro del nombre)
const PALETTE = [
  0xff5a5a, 0x4fb3ff, 0x5ee67a, 0xffd23f, 0xc77dff, 0xff9f43, 0x3ee8e0, 0xff7ac8, 0xb8f14a, 0xf4f4f4, 0xffb3a7,
  0x9ab8ff,
];
const hslToHex = (h: number, s: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return (channel(0) << 16) | (channel(8) << 8) | channel(4);
};
// Demo bandos (modo Petro vs Abelardo): cada uno lleva el color de su bando (lo pone la interfaz para cada ronda;
// undefined: el suyo propio)
let sideColor: ((index: number) => number | undefined) | null = null;
export const setSideColors = (fn: ((index: number) => number | undefined) | null) => {
  sideColor = fn;
};
// Los brutes del royale se numeran desde 1. Pasada la paleta, los colores se reparten por la rueda (ángulo áureo)
export const royaleColor = (index: number) => {
  const own = sideColor?.(index);
  if (own !== undefined) return own;
  const i = Math.max(0, index - 1);
  return PALETTE[i] ?? hslToHex((i * 137.508) % 360, 0.85, 0.62);
};
export const royaleColorCss = (index: number) => `#${royaleColor(index).toString(16).padStart(6, '0')}`;

// Mismos colores que las barras de la lista
const hpColor = (pct: number) => (pct > 0.5 ? 0x4ade80 : pct > 0.25 ? 0xfacc15 : 0xef4444);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const BAR_W = 34;
const BAR_H = 5.2;
// Alto de una etiqueta (nombre y barra): lo que sube la de al lado para no taparla
const TAG_H = 14;
// Lo recién perdido se queda claro un momento antes de bajar
const GHOST_HOLD = 0.35;
const GHOST_SPEED = 0.6;
// Contador de victorias a la derecha de la barra: trofeo pequeño y número. Al sumar, salta este tiempo
const COUNTER_X = BAR_W / 2 + 2.4;
const COUNT_X = 6.4;
const POP_TIME = 0.5;

type Tag = {
  root: Container;
  fill: Graphics;
  ghost: Graphics;
  ring: Graphics;
  // Puntos de vida, sobre la barra (solo se redibuja al cambiar el número)
  hpText: Text;
  hpShown: number;
  // Lo que ocupa a cada lado del centro (el contador de victorias asoma por la derecha)
  left: number;
  right: number;
  nameWidth: number;
  wins: number;
  counter: Container | null;
  count: Text | null;
  pop: number;
  shown: number;
  lost: number;
  hold: number;
  lift: number;
  zoom: number;
  pulse: number;
};

// Copa dorada (las hojas del juego no traen un icono de trofeo). `outline`: grosor de un contorno oscuro dibujado (las
// etiquetas no llevan filtro de contorno: con muchos brutes no pueden pagarlo)
const handles = (g: Graphics) => g.circle(-4.6, -3.2, 2.3).circle(4.6, -3.2, 2.3);
const cupShape = (g: Graphics) => g
  .moveTo(-4.8, -6)
  .lineTo(4.8, -6)
  .quadraticCurveTo(4.8, 1.2, 0, 1.2)
  .quadraticCurveTo(-4.8, 1.2, -4.8, -6)
  .rect(-1, 1, 2, 2.6)
  .roundRect(-3.6, 3.4, 7.2, 2.4, 0.8);
const trophy = (outline = 0) => {
  const cup = new Graphics();
  if (outline) {
    handles(cup).stroke({ color: 0x1a0f08, width: 1.4 + 2 * outline });
    cupShape(cup).stroke({ color: 0x1a0f08, width: 2 * outline, join: 'round' });
  }
  // Asas, copa con pie y base, y brillo
  handles(cup).stroke({ color: 0xe0a91b, width: 1.4 });
  cupShape(cup).fill(0xffd23f);
  cup.rect(-2.8, -5, 1.1, 3.6).fill(0xfff3b0);
  return cup;
};

export const royaleTags = (
  app: Application,
  getFighters: () => AnimationFighter[],
  speed: React.RefObject<number>,
  getHighlight: () => number | null,
  // Lo que se ve del escenario con el zoom dinámico (ver royaleCamera): las etiquetas mantienen su tamaño en pantalla
  // y no se salen de lo que se ve
  getView?: () => CameraView | undefined,
) => {
  const tags = new Map<AnimationFighter, Tag>();
  // Victorias de cada brute en la ronda (por su número de luchador)
  const wins = new Map<number, number>();
  // En pantallas pequeñas (móvil) el lienzo se ve reducido: las etiquetas crecen para que el nombre se siga
  // leyendo (unos 9 px reales como mínimo). Se mide de vez en cuando, no en cada fotograma
  let size = 1;
  let measuredAgo = Infinity;
  const measure = (dt: number) => {
    measuredAgo += dt;
    if (measuredAgo < 1) return;
    measuredAgo = 0;
    const shown = (app.canvas?.clientWidth || 500) / 500;
    size = clamp(9 / (8 * shown), 1, 1.7);
  };

  const makeTag = (f: AnimationFighter): Tag => {
    const color = royaleColor(f.index);
    const root = new Container();
    root.zIndex = 860;
    root.eventMode = 'none';
    const name = new Text({
      text: f.name,
      style: {
        fontFamily: 'GameFont',
        fontSize: 8,
        letterSpacing: 0.3,
        fill: color,
        stroke: { color: 0x1a0f08, width: 2.6, join: 'round' },
      },
    });
    name.anchor.set(0.5, 1);
    name.y = -2;
    const frame = new Graphics()
      .roundRect(-BAR_W / 2 - 0.9, -0.9, BAR_W + 1.8, BAR_H + 1.8, 1.4)
      .fill({ color: 0x120a05, alpha: 0.85 });
    // Barras blancas que se tiñen y se estiran: no hay que redibujarlas en cada fotograma
    const ghost = new Graphics().rect(0, 0, BAR_W, BAR_H).fill(0xffffff);
    ghost.x = -BAR_W / 2;
    ghost.tint = 0xfff1c4;
    const fill = new Graphics().rect(0, 0, BAR_W, BAR_H).fill(0xffffff);
    fill.x = -BAR_W / 2;
    const hpText = new Text({
      text: String(Math.round(f.hp)),
      style: { fontFamily: 'GameFont', fontSize: 5.4, fill: 0xffffff, stroke: { color: 0x1a0f08, width: 1.8, join: 'round' } },
    });
    hpText.anchor.set(0.5);
    hpText.y = BAR_H / 2 + 0.2;
    root.addChild(frame, ghost, fill, hpText, name);
    // Anillo bajo los pies cuando se resalta desde la lista
    const ring = new Graphics().ellipse(0, 0, 17, 5.5).stroke({ width: 1.8, color }).ellipse(0, 0, 12, 3.6).stroke({ width: 1, color, alpha: 0.6 });
    ring.visible = false;
    ring.eventMode = 'none';
    app.stage.addChild(root, ring);
    const pct = clamp(f.hp / f.maxHp, 0, 1);
    const half = Math.max(BAR_W, name.width) / 2;
    return {
      root, fill, ghost, ring, hpText, hpShown: Math.round(f.hp), left: half, right: half, nameWidth: name.width,
      wins: 0, counter: null, count: null, pop: POP_TIME,
      shown: pct, lost: pct, hold: 0, lift: 0, zoom: 1, pulse: 0,
    };
  };

  const addCounter = (tag: Tag) => {
    const counter = new Container();
    const cup = trophy(1.1);
    cup.scale.set(0.42);
    cup.position.set(3, 0.2);
    const count = new Text({
      text: '',
      style: { fontFamily: 'GameFont', fontSize: 8, fill: 0xffffff, stroke: { color: 0x1a0f08, width: 2.6, join: 'round' } },
    });
    count.anchor.set(0, 0.5);
    count.position.set(COUNT_X, 0.5);
    counter.addChild(cup, count);
    counter.position.set(COUNTER_X, BAR_H / 2);
    tag.root.addChild(counter);
    tag.counter = counter;
    tag.count = count;
    return count;
  };

  const remove = (f: AnimationFighter, tag: Tag) => {
    tag.root.destroy({ children: true });
    tag.ring.destroy();
    tags.delete(f);
  };

  const tick = (ticker: Ticker) => {
    if (!app.stage || app.stage.destroyed) return;
    const dt = (Math.min(ticker.elapsedMS, 50) / 1000) * speed.current;
    measure(Math.min(ticker.elapsedMS, 50) / 1000);
    const highlight = getHighlight();
    const view = getView?.() ?? { x0: 0, y0: 0, x1: 500, y1: 300, z: 1 };
    // Tamaño en el escenario para que en pantalla se vean igual con zoom
    const scale = size / view.z;
    const placed: { x0: number; x1: number; y: number }[] = [];
    // De abajo arriba en la pantalla: los de delante colocan su etiqueta primero
    const brutes = getFighters()
      .filter((f) => f.type === 'brute' && !f.master)
      .sort((a, b) => b.animation.container.y - a.animation.container.y);
    for (const f of brutes) {
      const c = f.animation.container;
      let tag = tags.get(f);
      if (!tag) {
        if (f.dead || !f.animation.loaded || c.destroyed || !c.visible) continue;
        tag = makeTag(f);
        tags.set(f, tag);
      }
      // Eliminado: la etiqueta se desvanece
      if (f.dead || c.destroyed || !c.visible) {
        tag.ring.visible = false;
        tag.root.alpha -= dt * 3;
        if (tag.root.alpha <= 0) remove(f, tag);
        continue;
      }
      // Aún llegando (fuera de la arena)
      tag.root.visible = c.y >= 160;

      // Vida: la barra sigue a la real enseguida; el tramo claro (lo recién perdido) baja después
      const pct = clamp(f.hp / f.maxHp, 0, 1);
      tag.shown += (pct - tag.shown) * Math.min(1, dt * 12);
      if (pct >= tag.lost) {
        tag.lost = pct;
        tag.hold = 0;
      } else if (tag.hold < GHOST_HOLD) {
        tag.hold += dt;
      } else {
        tag.lost = Math.max(pct, tag.lost - GHOST_SPEED * dt);
      }
      tag.fill.scale.x = Math.max(0.001, tag.shown);
      tag.fill.tint = hpColor(pct);
      tag.ghost.scale.x = Math.max(0.001, tag.lost);
      const hpNow = Math.max(0, Math.round(f.hp));
      if (hpNow !== tag.hpShown) {
        tag.hpShown = hpNow;
        tag.hpText.text = String(hpNow);
      }

      // Victorias: el contador aparece con la primera y salta cada vez que suma
      const won = wins.get(f.index) ?? 0;
      if (won !== tag.wins) {
        tag.wins = won;
        const count = tag.count ?? addCounter(tag);
        count.text = String(won);
        tag.right = Math.max(tag.nameWidth / 2, COUNTER_X + COUNT_X + count.width);
        tag.pop = 0;
      }
      if (tag.counter && tag.pop < POP_TIME) {
        tag.pop = Math.min(POP_TIME, tag.pop + dt);
        tag.counter.scale.set(1 + 0.8 * Math.sin((Math.PI * tag.pop) / POP_TIME));
      }

      // Encima de la cabeza, sin salirse por los lados ni por arriba (Súper gigante) y sin taparse con la de al lado
      // (se sube un escalón)
      const giant = f.animation.giantScale || 1;
      const left = tag.left * scale;
      const right = tag.right * scale;
      const step = TAG_H * scale;
      const edge = 3 / view.z;
      const x = clamp(c.x, view.x0 + left + edge, view.x1 - right - edge);
      const y = Math.max(view.y0 + step + edge, c.y - f.animation.baseHeight * 0.98 * giant - 3);
      let lift = 0;
      for (let tries = 0; tries < 4; tries++) {
        const top = y - lift;
        if (!placed.some((p) => x - left < p.x1 && p.x0 < x + right && Math.abs(p.y - top) < step)) break;
        lift += step;
      }
      placed.push({ x0: x - left, x1: x + right, y: y - lift });
      tag.lift += (lift - tag.lift) * Math.min(1, dt * 10);
      tag.root.position.set(x, y - tag.lift);

      // Resaltado desde la lista: etiqueta más grande y anillo que late bajo los pies
      const lit = highlight === f.index;
      tag.zoom += ((lit ? 1.4 : 1) - tag.zoom) * Math.min(1, dt * 12);
      tag.root.scale.set(tag.zoom * scale);
      tag.root.zIndex = lit ? 870 : 860;
      tag.ring.visible = lit;
      if (lit) {
        tag.pulse += dt;
        tag.ring.position.set(c.x, c.y + 1);
        tag.ring.zIndex = c.zIndex - 0.5;
        tag.ring.scale.set((1 + 0.12 * Math.sin(tag.pulse * 7)) * giant);
      }
    }
    // Quien ya no está en la pelea (se fue) pierde su etiqueta
    for (const [f, tag] of tags) {
      if (!brutes.includes(f)) remove(f, tag);
    }
  };
  app.ticker.add(tick);

  return {
    stop: () => {
      app.ticker?.remove(tick);
    },
    // Un brute eliminó a un rival: suma una victoria
    win: (index: number) => {
      wins.set(index, (wins.get(index) ?? 0) + 1);
    },
    winsOf: (index: number) => wins.get(index) ?? 0,
  };
};
