// Demo battle royale: nadie se queda quieto. Quien no está en ningún duelo hace algo cada poco: trota a un sitio
// más despejado o a rondar a un rival, cruza la arena a la carrera, amaga un golpe al aire, salta hacia atrás,
// rebota como un boxeador, se pone en guardia, saca músculo o mira a otro lado. Cuando pasa algo gordo cerca
// (`react`) los que miran reaccionan. Al entrar en un duelo se le suelta al instante (`release`): vuelve al
// reposo mirando hacia su lado, así que la pelea se anima exactamente igual que antes.
// Si queda uno solo en pie, mientras espera a que entre alguien hace el tonto (entrena, merienda, baila, presume...)
// con frases en un globo.
import { Animation, weapons } from '@labrute/core';
import { gsap } from 'gsap';
import { Application, Container, Graphics, Text, Ticker } from 'pixi.js';
import type { CameraView } from './royaleCamera';
import { AnimationFighter } from './utils/findFighter';
import { roomAt, royaleArena, royaleBounds } from './utils/fightPositions';
import { playStepDust } from './utils/playVFX';
import { Spritesheets } from './utils/spritesheet';

type Action = {
  // Avanza `dt` segundos de pelea; devuelve false al terminar
  update: (dt: number) => boolean;
  // Lo deja en reposo donde esté (en el suelo y con su animación normal)
  cancel: () => void;
};
type Dir = 1 | -1;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Perros y pantera están dibujados mirando al revés
const isDog = (f: AnimationFighter) => f.type === 'pet' && (f.name.startsWith('dog') || f.name === 'panther');
// Hacia dónde mira (1 = derecha)
const facing = (f: AnimationFighter): Dir => ((f.animation.container.scale.x >= 0) !== isDog(f) ? 1 : -1);
const face = (f: AnimationFighter, dir: Dir) => {
  const c = f.animation.container;
  c.scale.x = Math.abs(c.scale.x || 1) * dir * (isDog(f) ? -1 : 1);
};
// Los del lado L miran a la derecha y los del R a la izquierda (lo que esperan las animaciones de la pelea)
const teamDir = (f: AnimationFighter): Dir => (f.team === 'L' ? 1 : -1);
// Su amo, sus mascotas y las mascotas de su amo no son rivales
const allies = (a: AnimationFighter, b: AnimationFighter) =>
  a.id === b.master || b.id === a.master || (!!a.master && a.master === b.master);

export const royaleAmbient = (
  app: Application,
  spritesheets: Spritesheets,
  getFighters: () => AnimationFighter[],
  speed: React.RefObject<number>,
  isBusy: (f: AnimationFighter) => boolean,
  // Lo que se ve del escenario con el zoom dinámico (ver royaleCamera): los globos no se salen de ahí
  getView?: () => CameraView | undefined,
) => {
  type State = { wait: number; action: Action | null; touched: boolean; dest?: { x: number; y: number } };
  const states = new WeakMap<AnimationFighter, State>();
  let stopped = false;

  const visible = (f: AnimationFighter) => !f.dead && f.hp > 0 && f.animation.loaded
    && !f.animation.container.destroyed && f.animation.container.visible && f.animation.container.alpha > 0.5;
  // Puede empezar algo: en reposo, sin red, sin aturdir y sin otra animación de la pelea a medias
  const ready = (f: AnimationFighter) => visible(f) && !f.trapped && !f.stunned
    && (f.animation.animation === 'idle' || f.animation.animation === 'monk')
    && !gsap.isTweening(f.animation.container)
    && f.animation.container.y >= royaleArena.minY - 1;

  const rest = (f: AnimationFighter) => {
    if (f.animation.container.destroyed) return;
    f.animation.animationSpeed = 1;
    f.animation.setAnimation('idle');
  };
  const nearestRival = (f: AnimationFighter) => {
    const { x, y } = f.animation.container;
    let best: AnimationFighter | null = null;
    let bestDistance = Infinity;
    for (const o of getFighters()) {
      if (o === f || !visible(o) || allies(f, o)) continue;
      const d = Math.hypot(o.animation.container.x - x, (o.animation.container.y - y) * 2);
      if (d < bestDistance) {
        bestDistance = d;
        best = o;
      }
    }
    return best;
  };
  const faceNearest = (f: AnimationFighter) => {
    const rival = nearestRival(f);
    if (rival) face(f, rival.animation.container.x >= f.animation.container.x ? 1 : -1);
  };
  // Dónde está cada uno (o adónde va trotando): para no ir todos al mismo hueco
  const spots = (f: AnimationFighter) => getFighters()
    .filter((o) => o !== f && visible(o))
    .map((o) => states.get(o)?.dest ?? { x: o.animation.container.x, y: o.animation.container.y });

  // --- Acciones ---

  // Trota hasta `dest` (más deprisa las mascotas, o a la carrera con `rush`) y al llegar mira al rival más cercano
  const jog = (f: AnimationFighter, s: State, dest: { x: number; y: number }, rush = 1): Action => {
    const c = f.animation.container;
    const pace = (f.type === 'pet' ? rand(170, 230) : rand(125, 165)) * rush;
    face(f, dest.x >= c.x ? 1 : -1);
    f.animation.setAnimation('run');
    f.animation.animationSpeed = (f.type === 'pet' ? 1 : 0.85) * Math.sqrt(rush);
    s.dest = dest;
    if (Math.hypot(dest.x - c.x, dest.y - c.y) > 50) playStepDust(app, spritesheets, f, speed, -facing(f) * 8, 0.45);
    const done = () => {
      s.dest = undefined;
      rest(f);
    };
    return {
      update: (dt) => {
        const dx = dest.x - c.x;
        const dy = dest.y - c.y;
        const distance = Math.hypot(dx, dy);
        // Frena en los últimos píxeles
        const step = pace * dt * clamp(distance / 14, 0.35, 1);
        if (distance <= step) {
          c.position.set(dest.x, dest.y);
          done();
          faceNearest(f);
          return false;
        }
        c.x += (dx / distance) * step;
        c.y += (dy / distance) * step;
        return true;
      },
      cancel: done,
    };
  };

  // A un hueco despejado cerca
  const roam = (f: AnimationFighter, s: State) => {
    const { x, y } = f.animation.container;
    const others = spots(f);
    const { minX, maxX } = royaleBounds(f);
    let best = { x, y };
    let bestRoom = -Infinity;
    for (let k = 0; k < 8; k++) {
      const angle = rand(0, Math.PI * 2);
      const distance = rand(30, 110);
      const candidate = {
        x: clamp(x + Math.cos(angle) * distance, minX, maxX),
        y: clamp(y + Math.sin(angle) * distance * 0.45, royaleArena.minY, royaleArena.maxY),
      };
      const room = roomAt(candidate.x, candidate.y, others) + rand(0, 15);
      if (room > bestRoom) {
        bestRoom = room;
        best = candidate;
      }
    }
    return Math.hypot(best.x - x, best.y - y) < 12 ? null : jog(f, s, best);
  };

  // Cruza media arena a la carrera hasta el hueco más despejado que encuentre lejos
  const sprint = (f: AnimationFighter, s: State) => {
    const { x } = f.animation.container;
    const others = spots(f);
    const { minX, maxX } = royaleBounds(f);
    let best: { x: number; y: number } | null = null;
    let bestRoom = -Infinity;
    for (let k = 0; k < 10; k++) {
      const candidate = {
        x: minX + Math.random() * (maxX - minX),
        y: royaleArena.minY + Math.random() * (royaleArena.maxY - royaleArena.minY),
      };
      if (Math.abs(candidate.x - x) < 130) continue;
      const room = roomAt(candidate.x, candidate.y, others);
      if (room > bestRoom) {
        bestRoom = room;
        best = candidate;
      }
    }
    return best ? jog(f, s, best, 1.7) : null;
  };

  // Ronda al rival más cercano: se le acerca hasta quedar a unos pasos, sin pegarse
  const stalk = (f: AnimationFighter, s: State) => {
    const rival = nearestRival(f);
    if (!rival) return null;
    const c = f.animation.container;
    const r = rival.animation.container;
    const { minX, maxX } = royaleBounds(f);
    const side = royaleArena.lock?.(f) || (c.x <= r.x ? -1 : 1);
    const dest = {
      x: clamp(r.x + side * rand(55, 80), minX, maxX),
      y: clamp(r.y + rand(-12, 12), royaleArena.minY, royaleArena.maxY),
    };
    if (Math.hypot(dest.x - c.x, dest.y - c.y) < 15 || roomAt(dest.x, dest.y, spots(f).filter((o) => o.x !== r.x || o.y !== r.y)) < 25) {
      return null;
    }
    return jog(f, s, dest);
  };

  // Saltos en el sitio o hacia atrás (con la sombra pegada al suelo)
  const hops = (f: AnimationFighter, count: number, height: number, back: number, duration: number, pose: 'evade' | null): Action => {
    const c = f.animation.container;
    const ground = { x: c.x, y: c.y };
    const { minX, maxX } = royaleBounds(f);
    const endX = clamp(ground.x - facing(f) * back, minX, maxX);
    const giant = f.animation.giantScale || 1;
    if (pose) f.animation.setAnimation(pose);
    f.animation.setAirborn(true);
    let t = 0;
    const land = () => {
      c.y = ground.y;
      f.animation.setAirborn(false);
    };
    return {
      update: (dt) => {
        t += dt;
        const p = Math.min(1, t / (duration * count));
        const h = height * giant * Math.abs(Math.sin(p * Math.PI * count));
        c.x = ground.x + (endX - ground.x) * p;
        c.y = ground.y - h;
        f.animation.shadow.y = h;
        if (p < 1) return true;
        land();
        if (pose) {
          playStepDust(app, spritesheets, f, speed, 0, 0.5);
          rest(f);
        }
        return false;
      },
      cancel: () => {
        land();
        rest(f);
      },
    };
  };

  // Una animación entera de la pelea (guardia, músculo) y vuelta al reposo
  const pose = (f: AnimationFighter, animation: 'block' | 'strengthen'): Action => {
    let ended = false;
    let t = 0;
    f.animation.setAnimation(animation);
    f.animation.once(`${animation}:end`, () => {
      ended = true;
    });
    return {
      update: (dt) => {
        t += dt;
        if (f.animation.animation !== animation) return false;
        // Se queda un instante en la última postura
        if ((ended && t > 0.95) || t > 1.6) {
          rest(f);
          return false;
        }
        return true;
      },
      cancel: () => {
        ended = true;
        rest(f);
      },
    };
  };

  // Amaga: un paso rápido hacia el rival más cercano con un golpe al aire, y vuelve a su sitio
  const feint = (f: AnimationFighter): Action | null => {
    const rival = nearestRival(f);
    if (!rival) return null;
    const c = f.animation.container;
    const r = rival.animation.container;
    const gap = Math.abs(r.x - c.x);
    if (gap < 48 || gap > 130 || Math.abs(r.y - c.y) > 28) return null;
    const weapon = f.animation.weapon ? weapons[f.animation.weapon] : null;
    const animation = (weapon?.animation || 'fist') as 'fist' | 'slash' | 'estoc' | 'whip';
    // El latigazo llegaría hasta el rival y parecería un golpe de verdad
    if (animation === 'whip') return null;
    const dir: Dir = r.x >= c.x ? 1 : -1;
    const x0 = c.x;
    const lunge = Math.min(15, gap - 44);
    face(f, dir);
    f.animation.animationSpeed = 1.2;
    f.animation.setAnimation(animation);
    let t = 0;
    return {
      update: (dt) => {
        t += dt;
        const p = Math.min(1, t / 0.45);
        c.x = x0 + dir * lunge * Math.sin(p * Math.PI);
        if (p < 1) return true;
        c.x = x0;
        rest(f);
        return false;
      },
      cancel: () => {
        c.x = x0;
        rest(f);
      },
    };
  };

  // Mira hacia el otro lado un momento
  const look = (f: AnimationFighter): Action => {
    const hold = rand(0.45, 1);
    let t = 0;
    face(f, facing(f) === 1 ? -1 : 1);
    return {
      update: (dt) => {
        t += dt;
        if (t < hold) return true;
        faceNearest(f);
        return false;
      },
      cancel: () => {},
    };
  };

  // --- Solo en la arena: el último en pie hace el tonto mientras espera a que entre alguien ---

  // `w`, `h`: tamaño del globo; `size`: lo que crece en el móvil
  type Bubble = { root: Container; f: AnimationFighter; t: number; life: number; w: number; h: number; size: number };
  const bubbles = new Set<Bubble>();
  (globalThis as any).__royaleBubbles = bubbles; // depuración: globos a la vista
  const drop = (b: Bubble | null) => {
    if (!b || !bubbles.delete(b)) return;
    if (!b.root.destroyed) b.root.destroy({ children: true });
  };
  // Globo con una frase sobre la cabeza: sigue al que habla y se desvanece solo
  const say = (f: AnimationFighter, text: string, life = 2): Bubble => {
    const label = new Text({ text, style: { fontFamily: 'GameFont', fontSize: 8, fill: 0x2a1a0a } });
    label.anchor.set(0.5);
    const w = Math.ceil(label.width) + 10;
    const h = Math.ceil(label.height) + 4;
    label.position.set(0, -h / 2 - 4);
    // Globo y pico como una sola silueta: primero el borde de los dos y encima el relleno
    const shape = (g: Graphics) => g.roundRect(-w / 2, -h - 4, w, h, 4).poly([-5, -5, 3, -5, -7, 2]);
    const box = new Graphics();
    shape(box).stroke({ color: 0x2a1a0a, width: 2 });
    shape(box).fill(0xfffdf5);
    const root = new Container();
    root.addChild(box, label);
    root.zIndex = 905;
    root.eventMode = 'none';
    root.alpha = 0;
    app.stage.addChild(root);
    // Como las etiquetas: en el móvil el lienzo se ve reducido y el globo crece para que se lea
    const size = clamp(9 / (8 * ((app.canvas?.clientWidth || 500) / 500)), 1, 1.7);
    const b = { root, f, t: 0, life, w, h, size };
    bubbles.add(b);
    return b;
  };
  const updateBubbles = (dt: number) => {
    for (const b of bubbles) {
      const c = b.f.animation.container;
      b.t += dt;
      if (c.destroyed || b.f.dead || b.t >= b.life) {
        drop(b);
        continue;
      }
      b.root.alpha = Math.min(1, b.t / 0.15, (b.life - b.t) / 0.3);
      // Sobre la cabeza y entero dentro de lo que se ve (con zoom, del mismo tamaño en pantalla que sin él). El globo
      // va de `h + 4` por encima de su punto a 2 por debajo (el pico)
      const view = getView?.() ?? { x0: 0, y0: 0, x1: 500, y1: 300, z: 1 };
      const scale = b.size / view.z;
      const edge = 3 / view.z;
      const half = (b.w / 2) * scale + edge;
      b.root.scale.set(scale);
      b.root.position.set(
        clamp(c.x + 14 * scale, view.x0 + half, view.x1 - half),
        clamp(
          c.y - b.f.animation.baseHeight * (b.f.animation.giantScale || 1) - 20 * scale,
          view.y0 + (b.h + 4) * scale + edge,
          view.y1 - 2 * scale - edge,
        ),
      );
    }
  };

  const QUIPS = {
    brag: ['¿Nadie más?', '¡Que pase el siguiente!', '¿Eso es todo?', '¡Soy invencible!', '¡Traigan más!'],
    flex: ['¡Mira estos músculos!', '¡Puro músculo!', '¿Ves esto?'],
    train: ['¡Uno, dos! ¡Uno, dos!', '¡A entrenar!', '¡Sin dolor no hay gloria!'],
    eat: ['Ñam, ñam...', '¡Qué rico!', 'Hora del bocadillo'],
    drink: ['¡Salud!', 'Glup, glup...'],
    dance: ['¡A bailar!', '¡Pasos prohibidos!', '¡Bailando solo!'],
    spin: ['¡Tachán!', '¡Olé!'],
    laps: ['¡Calentando!', '¡Una vuelta más!'],
    box: ['¡Toma!', '¡Ven si te atreves!', '¡Ja! ¡Ja!'],
  };
  const quip = (kind: keyof typeof QUIPS) => QUIPS[kind][Math.floor(Math.random() * QUIPS[kind].length)] ?? '';

  // Una animación de la pelea un rato (entrenar, merendar, beber, sacar músculo, celebrar), repitiéndola si acaba.
  // Se repite en el siguiente fotograma y no dentro del aviso de fin: un aviso "once" pedido desde otro del mismo
  // nombre se dispara en la misma pasada y se encadena sin fin (la página se quedaba colgada)
  const perform = (f: AnimationFighter, animation: Animation, seconds: number, text: string): Action => {
    let t = 0;
    let ended = false;
    const play = () => {
      ended = false;
      f.animation.setAnimation(animation);
      f.animation.once(`${animation}:end`, () => {
        ended = true;
      });
    };
    play();
    const bubble = say(f, text, Math.min(seconds, 2.4));
    return {
      update: (dt) => {
        t += dt;
        if (t >= seconds || f.animation.container.destroyed) {
          rest(f);
          return false;
        }
        if (ended && t < seconds - 0.5) play();
        return true;
      },
      cancel: () => {
        drop(bubble);
        rest(f);
      },
    };
  };

  // Baila: da saltitos al ritmo mirando a un lado y a otro
  const dance = (f: AnimationFighter): Action => {
    const c = f.animation.container;
    const ground = c.y;
    const giant = f.animation.giantScale || 1;
    const bubble = say(f, quip('dance'), 2.2);
    const BEAT = 0.28;
    let t = 0;
    let beat = -1;
    f.animation.setAirborn(true);
    const land = () => {
      c.y = ground;
      f.animation.setAirborn(false);
    };
    return {
      update: (dt) => {
        t += dt;
        const b = Math.floor(t / BEAT);
        if (b !== beat) {
          beat = b;
          face(f, b % 2 ? -1 : 1);
        }
        const h = 4 * giant * Math.abs(Math.sin((t / BEAT) * Math.PI));
        c.y = ground - h;
        f.animation.shadow.y = h;
        if (t < BEAT * 9) return true;
        land();
        rest(f);
        return false;
      },
      cancel: () => {
        drop(bubble);
        land();
        rest(f);
      },
    };
  };

  // Pirueta: salta girando sobre sí mismo y cae levantando polvo
  const spin = (f: AnimationFighter): Action => {
    const c = f.animation.container;
    const ground = c.y;
    const giant = f.animation.giantScale || 1;
    const TIME = 0.75;
    let t = 0;
    let turn = -1;
    f.animation.setAnimation('evade');
    f.animation.setAirborn(true);
    const land = () => {
      c.y = ground;
      f.animation.setAirborn(false);
    };
    return {
      update: (dt) => {
        t += dt;
        const p = Math.min(1, t / TIME);
        const h = 24 * giant * Math.sin(p * Math.PI);
        c.y = ground - h;
        f.animation.shadow.y = h;
        const k = Math.floor(p * 9);
        if (k !== turn) {
          turn = k;
          face(f, k % 2 ? -1 : 1);
        }
        if (p < 1) return true;
        land();
        playStepDust(app, spritesheets, f, speed, 0, 0.6);
        say(f, quip('spin'), 1.4);
        rest(f);
        return false;
      },
      cancel: () => {
        land();
        rest(f);
      },
    };
  };

  // Da una vuelta a la carrera: hasta la otra punta de la arena y de vuelta
  const laps = (f: AnimationFighter, s: State): Action => {
    const c = f.animation.container;
    const home = { x: c.x, y: c.y };
    const { minX, maxX } = royaleBounds(f);
    const far = {
      x: c.x < (minX + maxX) / 2 ? maxX - rand(10, 40) : minX + rand(10, 40),
      y: clamp(c.y + rand(-15, 15), royaleArena.minY, royaleArena.maxY),
    };
    const bubble = say(f, quip('laps'), 1.8);
    let leg = jog(f, s, far, 1.8);
    let back = false;
    return {
      update: (dt) => {
        if (leg.update(dt)) return true;
        if (back) return false;
        back = true;
        leg = jog(f, s, home, 1.8);
        return true;
      },
      cancel: () => {
        drop(bubble);
        leg.cancel();
      },
    };
  };

  // Boxea con el aire: golpes a un lado y a otro con lo que lleve en la mano
  const shadowBox = (f: AnimationFighter): Action => {
    const weapon = f.animation.weapon ? weapons[f.animation.weapon] : null;
    const animation = (weapon?.animation || 'fist') as 'fist' | 'slash' | 'estoc' | 'whip';
    const bubble = say(f, quip('box'), 2);
    let t = 0;
    let swing = -1;
    f.animation.animationSpeed = 1.2;
    return {
      update: (dt) => {
        t += dt;
        const k = Math.floor(t / 0.5);
        if (k !== swing && k < 4) {
          swing = k;
          face(f, k % 2 ? -1 : 1);
          f.animation.setAnimation(animation);
        }
        if (t < 2.1) return true;
        rest(f);
        return false;
      },
      cancel: () => {
        drop(bubble);
        rest(f);
      },
    };
  };

  // Se queda dormido de pie: respira despacio y suelta zetas
  const snooze = (f: AnimationFighter): Action => {
    let t = 0;
    let next = 0;
    let bubble: Bubble | null = null;
    f.animation.animationSpeed = 0.35;
    return {
      update: (dt) => {
        t += dt;
        if (t >= next) {
          drop(bubble);
          bubble = say(f, next === 0 ? 'Zzz...' : 'ZZZ...', 1.1);
          next += 1.3;
        }
        if (t < 3.6) return true;
        rest(f);
        return false;
      },
      cancel: () => {
        drop(bubble);
        rest(f);
      },
    };
  };

  const pickSolo = (f: AnimationFighter, s: State): Action | null => {
    const options: [number, () => Action | null][] = [
      [14, () => perform(f, 'win', 2.4, quip('brag'))],
      [10, () => perform(f, 'strengthen', 1.8, quip('flex'))],
      [12, () => perform(f, Math.random() < 0.5 ? 'train' : 'train2', 3, quip('train'))],
      [8, () => perform(f, 'eat', 2.2, quip('eat'))],
      [8, () => perform(f, 'drink', 2, quip('drink'))],
      [12, () => dance(f)],
      [10, () => spin(f)],
      [8, () => laps(f, s)],
      [10, () => shadowBox(f)],
      [8, () => snooze(f)],
    ];
    let roll = Math.random() * options.reduce((sum, [w]) => sum + w, 0);
    for (const [weight, make] of options) {
      roll -= weight;
      if (roll <= 0) return make();
    }
    return null;
  };

  const pick = (f: AnimationFighter, s: State): Action | null => {
    const brute = f.type === 'brute';
    const options: [number, () => Action | null][] = brute
      ? [
        [26, () => roam(f, s)],
        [20, () => stalk(f, s)],
        [8, () => sprint(f, s)],
        [10, () => feint(f)],
        [10, () => hops(f, 1, rand(10, 15), rand(14, 26), 0.34, 'evade')],
        [8, () => hops(f, 3, rand(3.5, 5), 0, 0.17, null)],
        [8, () => pose(f, 'block')],
        [6, () => pose(f, 'strengthen')],
        [4, () => look(f)],
      ]
      : [
        [48, () => roam(f, s)],
        [27, () => stalk(f, s)],
        [13, () => hops(f, 1, rand(8, 12), rand(10, 20), 0.3, 'evade')],
        [12, () => look(f)],
      ];
    let roll = Math.random() * options.reduce((sum, [w]) => sum + w, 0);
    for (const [weight, make] of options) {
      roll -= weight;
      if (roll <= 0) return make() ?? (brute ? look(f) : null);
    }
    return null;
  };

  const tick = (ticker: Ticker) => {
    if (stopped || !app.stage || app.stage.destroyed) return;
    const dt = (Math.min(ticker.elapsedMS, 50) / 1000) * speed.current;
    updateBubbles(dt);
    // El único brute que queda en pie, si es así
    const standing = getFighters().filter((o) => o.type === 'brute' && !o.master && visible(o));
    const alone = standing.length === 1 ? standing[0] : null;
    for (const f of getFighters()) {
      let s = states.get(f);
      if (!s) {
        s = { wait: rand(0.2, 1), action: null, touched: false };
        states.set(f, s);
      }
      if (isBusy(f)) continue;
      if (s.action) {
        if (s.action.update(dt)) continue;
        s.action = null;
        s.wait = f === alone ? rand(0.4, 1) : f.type === 'pet' ? rand(0.1, 0.45) : rand(0.15, 0.6);
        continue;
      }
      s.wait -= dt;
      if (s.wait > 0 || !ready(f)) continue;
      s.action = f === alone ? pickSolo(f, s) : pick(f, s);
      s.touched = true;
      if (!s.action) s.wait = rand(0.2, 0.5);
    }
  };
  app.ticker.add(tick);

  // Entra en un duelo: se corta lo que estuviera haciendo y vuelve a mirar hacia su lado
  const release = (f: AnimationFighter | undefined) => {
    const s = f && states.get(f);
    if (!f || !s) return;
    if (s.action) {
      s.action.cancel();
      s.action = null;
    }
    s.dest = undefined;
    if (s.touched && !f.animation.container.destroyed) face(f, teamDir(f));
    s.touched = false;
    s.wait = rand(0.3, 0.8);
  };

  // Una acción que empieza pasado un momento (así no reaccionan todos a la vez)
  const later = (delay: number, make: () => Action | null): Action => {
    let t = 0;
    let inner: Action | null = null;
    let started = false;
    return {
      update: (dt) => {
        if (!started) {
          t += dt;
          if (t < delay) return true;
          started = true;
          inner = make();
        }
        return inner ? inner.update(dt) : false;
      },
      cancel: () => inner?.cancel(),
    };
  };

  // Pasa algo gordo en (x, y): el golpe final de una fatality (`big`) o un crítico. Los que están cerca y libres
  // reaccionan: los más cercanos saltan hacia atrás del susto; con una fatality, el resto se vuelve a mirar y lo
  // celebra o se pone en guardia
  const react = (x: number, y: number, radius: number, big: boolean) => {
    if (stopped) return;
    for (const f of getFighters()) {
      const s = states.get(f);
      if (!s || isBusy(f) || !visible(f) || f.trapped || f.stunned) continue;
      // Solo si está en reposo o haciendo algo suyo (no a mitad de una animación de la pelea)
      if (!s.action && !ready(f)) continue;
      const c = f.animation.container;
      const distance = Math.hypot(c.x - x, (c.y - y) * 2);
      if (distance > radius) continue;
      if (s.action) s.action.cancel();
      s.dest = undefined;
      s.touched = true;
      const towards: Dir = x >= c.x ? 1 : -1;
      const startled = !big || distance < radius * 0.45;
      s.action = later(rand(0, 0.22), () => {
        if (!visible(f) || c.destroyed) return null;
        face(f, towards);
        if (startled) return hops(f, 1, rand(9, 14), rand(16, 28), 0.3, 'evade');
        // Las mascotas solo se quedan mirando
        if (f.type !== 'brute') return later(rand(0.5, 1), () => null);
        return pose(f, Math.random() < 0.6 ? 'strengthen' : 'block');
      });
    }
  };

  return {
    release,
    react,
    // Fin de la ronda: todos vuelven al reposo y ya nadie se mueve por su cuenta
    stop: () => {
      stopped = true;
      getFighters().forEach(release);
      [...bubbles].forEach(drop);
      app.ticker?.remove(tick);
    },
  };
};
