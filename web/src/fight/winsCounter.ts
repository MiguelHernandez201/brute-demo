// Demo 1 vs 1: victorias de cada jugador, con un trofeo junto a su barra de vida (encima del extremo de dentro).
// Las guarda la interfaz (main.js) entre pelea y pelea; aquí se suma la del ganador cuando se ve el final.
import { Application, Container, Graphics, Text } from 'pixi.js';
import { OutlineFilter } from 'pixi-filters/outline';
import { tween } from './utils/tween';

export type Wins = { L: number; R: number };

// Extremo de dentro de cada barra de vida (las barras van de 7 a 243 y de 257 a 493). El número va del mismo
// tamaño y a la misma altura que el nombre del jugador, para que se lea igual de bien (también en el móvil)
const INNER = { L: 243, R: 257 };
const CUP_Y = 12.5;
const CUP_SCALE = 1.3;
const BASELINE = 23;

// Copa dorada (las hojas del juego no traen un icono de trofeo). `outline`: grosor de un contorno oscuro dibujado,
// para cuando no lleva filtro de contorno (las etiquetas del royale, que con muchos brutes no pueden pagar filtros)
const handles = (g: Graphics) => g.circle(-4.6, -3.2, 2.3).circle(4.6, -3.2, 2.3);
const cupShape = (g: Graphics) => g
  .moveTo(-4.8, -6)
  .lineTo(4.8, -6)
  .quadraticCurveTo(4.8, 1.2, 0, 1.2)
  .quadraticCurveTo(-4.8, 1.2, -4.8, -6)
  .rect(-1, 1, 2, 2.6)
  .roundRect(-3.6, 3.4, 7.2, 2.4, 0.8);
export const trophy = (outline = 0) => {
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

export const winsCounter = (app: Application, wins: Wins, speed: React.RefObject<number>) => {
  const parts = (['L', 'R'] as const).map((side) => {
    const root = new Container();
    root.zIndex = 104;
    root.eventMode = 'none';
    root.filters = [new OutlineFilter()];
    const cup = trophy();
    const count = new Text({
      text: String(wins[side]),
      style: { fontFamily: 'GameFont', fontSize: 20, fill: 0xffffff },
    });
    // El trofeo va pegado al extremo de dentro de la barra y el número hacia fuera
    const inward = side === 'L' ? 1 : -1;
    cup.scale.set(CUP_SCALE);
    cup.position.set(INNER[side] - inward * 8, CUP_Y);
    count.anchor.set(side === 'L' ? 1 : 0, 1);
    count.position.set(INNER[side] - inward * 17, BASELINE);
    root.addChild(cup, count);
    app.stage?.addChild(root);
    return { side, cup, count };
  });

  return {
    // El ganador suma una victoria: el número salta y el trofeo se balancea
    win: (side: 'L' | 'R' | undefined) => {
      const part = parts.find((p) => p.side === side);
      if (!part || part.count.destroyed) return;
      wins[part.side] += 1;
      part.count.text = String(wins[part.side]);
      const duration = 0.9 / speed.current;
      void tween(part.count.scale, {
        keyframes: [
          { x: 1.7, y: 1.7, duration: duration * 0.3 },
          { x: 1, y: 1, duration: duration * 0.7, ease: 'elastic.out(1, 0.4)' },
        ],
      });
      void tween(part.cup, {
        keyframes: [
          { rotation: -0.35, duration: duration * 0.2 },
          { rotation: 0.25, duration: duration * 0.25 },
          { rotation: 0, duration: duration * 0.55, ease: 'elastic.out(1, 0.4)' },
        ],
      });
    },
  };
};
