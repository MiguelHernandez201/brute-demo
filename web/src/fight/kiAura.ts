// Demo battle royale: aura de ki al estilo Dragon Ball (potenciadores 2 y 3, ver engine/ultimates.boost). Llamas
// doradas y translúcidas que envuelven al brute y suben parpadeando, chispas que suben y, en el nivel 3, rayos (como el
// Súper Saiyajin 2). Va dentro del luchador, detrás de su cuerpo: le sigue a todas partes y crece con el Súper gigante.
// Al encenderse (y con cada potenciador más, ver `pulse`), un estallido de luz y un grito de los que suben de nivel. Ya
// no se apaga en toda la pelea; solo si cae, y al momento (así no sale en las fotos de la fatality).
import { sound } from '@pixi/sound';
import { Application, Container, Graphics, Rectangle, Ticker } from 'pixi.js';
import { AnimationFighter } from './utils/findFighter';
import { shakeStage } from './utils/stageAnimations';

type Speed = React.RefObject<number>;

const GOLD = 0xffc21a;
const PALE = 0xfff3a6;
const EDGE = 0xff8a00;
const SPARK = 0xfffbe0;
const BOLT = 0xbfe6ff;

// Capas de llama de fuera a dentro: tamaño (respecto al cuerpo), relleno translúcido y borde (el borde naranja marca la
// forma de las llamas, que sobre la arena clara se perdería)
const LAYERS = [
  { size: 1.12, fill: GOLD, alpha: 0.22, edge: EDGE, edgeAlpha: 0.75 },
  { size: 0.94, fill: PALE, alpha: 0.2, edge: GOLD, edgeAlpha: 0.6 },
  { size: 0.76, fill: 0xffffff, alpha: 0.14, edge: PALE, edgeAlpha: 0.45 },
];
const SPARKS = 14;
// Lenguas de llama por encima de la cintura
const TONGUES = 6;

export type KiAura = { readonly tier: number; readonly stopped: boolean; pulse: () => void; stop: () => void };

export const kiAura = (app: Application, fighter: AnimationFighter, speed: Speed, tier: number): KiAura => {
  const holder = fighter.animation;
  const body = holder.container;
  const back = new Container();
  // No cuenta para el tamaño del luchador (los números de daño y curación salen encima de su cabeza, no del aura)
  back.boundsArea = new Rectangle(0, 0, 0, 0);
  back.eventMode = 'none';
  back.alpha = 0;
  back.zIndex = -1;
  const flames = LAYERS.map(() => {
    const g = new Graphics();
    back.addChild(g);
    return g;
  });
  const sparks = Array.from({ length: SPARKS }, (_, k) => {
    const g = new Graphics().ellipse(0, 0, 1, 3.2).fill(SPARK);
    g.blendMode = 'add';
    back.addChild(g);
    return { g, t: k / SPARKS, x: Math.random() * 2 - 1, v: 0.7 + Math.random() * 0.6 };
  });
  const bolts = new Graphics();
  bolts.blendMode = 'add';
  back.addChild(bolts);
  // Detrás del cuerpo (y de su sombra)
  body.addChild(back);

  let time = 0;
  let fade = 0;
  let stopped = false;
  let boltIn = 0.3;
  const remove = () => {
    stopped = true;
    app.ticker.remove(tick);
    if (!back.destroyed) back.destroy({ children: true });
  };
  const tick = (ticker: Ticker) => {
    if (back.destroyed || body.destroyed) return remove();
    // Si cae, fuera al momento
    if (fighter.dead || fighter.hp <= 0) return remove();
    const dt = (Math.min(ticker.elapsedMS, 100) / 1000) * speed.current;
    time += dt;
    fade = stopped ? fade - dt * 2.5 : Math.min(1, fade + dt * 3);
    if (fade <= 0 && stopped) return remove();
    back.alpha = fade;
    // Tamaño del cuerpo en cada momento (crece si se hace gigante)
    const w = holder.baseWidth * 0.62;
    const h = holder.baseHeight * 0.92;
    const cy = -h * 0.48;
    flames.forEach((g, n) => {
      const { size, fill, alpha, edge, edgeAlpha } = LAYERS[n]!;
      const rx = w * size;
      const ry = h * 0.6 * size;
      const points: number[] = [];
      const steps = 72;
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        // (0 en los costados y abajo, 1 arriba del todo: la y crece hacia abajo, ver el punto de abajo)
        const up = Math.max(0, Math.sin(a));
        // Por arriba, lenguas de llama afiladas que suben y se mueven; por abajo, el contorno se cierra en los pies
        const wave = Math.sin(a * TONGUES * 2 - time * (9 + n * 1.7) + n * 2);
        const tongue = Math.max(0, wave) ** 3;
        const flicker = 1 + 0.04 * Math.sin(time * 27 + s * 2.3 + n);
        const reach = (1 + up * (0.12 + 0.42 * tongue)) * flicker;
        const x = Math.cos(a) * rx * (1 - 0.3 * up * up) * flicker;
        points.push(x, cy - Math.sin(a) * ry * reach);
      }
      const pulse = 0.85 + 0.15 * Math.sin(time * 17 + n);
      g.clear()
        .poly(points)
        .fill({ color: fill, alpha: alpha * pulse })
        .stroke({ width: 1.4, color: edge, alpha: edgeAlpha * pulse, join: 'round' });
    });
    // Chispas que suben desde los pies y se desvanecen arriba
    sparks.forEach((s) => {
      s.t += dt * s.v * 0.9;
      if (s.t > 1) {
        s.t -= 1;
        s.x = Math.random() * 2 - 1;
      }
      s.g.position.set(s.x * w * 0.8, -s.t * h * 1.45);
      s.g.alpha = Math.sin(s.t * Math.PI) * 0.9;
      s.g.scale.set(1, 0.6 + s.t);
    });
    // Nivel 3: rayos que saltan alrededor del cuerpo de vez en cuando
    if (tier >= 3) {
      boltIn -= dt;
      if (boltIn <= 0) {
        boltIn = 0.15 + Math.random() * 0.45;
        bolts.clear();
        for (let b = 0; b < 2; b++) {
          let x = (Math.random() * 2 - 1) * w;
          let y = -Math.random() * h;
          const pts = [x, y];
          for (let k = 0; k < 5; k++) {
            x += (Math.random() * 2 - 1) * w * 0.35;
            y -= h * (0.06 + Math.random() * 0.1);
            pts.push(x, y);
          }
          bolts.poly(pts, false).stroke({ width: 1.3, color: BOLT, alpha: 0.95 });
        }
        bolts.alpha = 1;
      } else {
        bolts.alpha = Math.max(0, bolts.alpha - dt * 9);
      }
    }
  };
  app.ticker.add(tick);

  // Estallido de poder: un anillo de luz que se abre desde el cuerpo, grito y temblor
  const pulse = () => {
    if (body.destroyed) return;
    const burst = new Graphics()
      .circle(0, 0, 10)
      .fill({ color: PALE, alpha: 0.35 })
      .circle(0, 0, 10)
      .stroke({ width: 2.5, color: GOLD, alpha: 0.95 });
    burst.blendMode = 'add';
    burst.position.set(0, -holder.baseHeight * 0.45);
    burst.zIndex = 10;
    body.addChild(burst);
    let b = 0;
    const burstTick = (ticker: Ticker) => {
      if (burst.destroyed || body.destroyed) {
        app.ticker.remove(burstTick);
        return;
      }
      b += (Math.min(ticker.elapsedMS, 100) / 1000) * speed.current;
      const p = Math.min(1, b / 0.45);
      // Hasta algo más que su altura (el doble si es gigante: crece con él)
      burst.scale.set(0.5 + p * ((holder.baseHeight * 0.75) / 10));
      burst.alpha = 1 - p;
      if (p >= 1) {
        app.ticker.remove(burstTick);
        burst.destroy();
      }
    };
    app.ticker.add(burstTick);
    void sound.play('sfx', { sprite: 'cryOfTheDamned' });
    void shakeStage(app, speed, tier >= 3 ? 6 : 4, 400);
  };
  pulse();

  return {
    tier,
    get stopped() {
      return stopped;
    },
    pulse,
    // Se apaga poco a poco
    stop: () => {
      stopped = true;
    },
  };
};
