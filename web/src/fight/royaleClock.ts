// Demo battle royale: reloj de "Finalizar" arriba en la arena. Con el botón activo (`finishing`) cuenta 3 minutos en
// tiempo real; va con el ticker de la pelea, así que se para con la pausa. Al llegar a cero marca `timeUp` y la pelea
// se cierra: gana el que más victorias lleva de los que siguen en pie (ver setupFight). La interfaz lee `timeLeft`.
import { Application, Container, Graphics, Text, Ticker } from 'pixi.js';

export const FINISH_SECONDS = 180;

type ClockFight = { finishing?: boolean; timeLeft?: number | null; timeUp?: boolean };

// Los últimos segundos se ven en rojo y laten
const HURRY = 10;

// Cronómetro dibujado (sin emojis: la fuente del juego no los tiene)
const stopwatch = () => {
  const body = new Graphics()
    .roundRect(-1.6, -9.2, 3.2, 2.6, 0.8)
    .fill(0xffd23f)
    .circle(0, 0, 6.2)
    .fill(0xfffdf5)
    .stroke({ color: 0x1a0f08, width: 1.6 });
  const hand = new Graphics().moveTo(0, 0).lineTo(0, -4.4).stroke({ color: 0xd62828, width: 1.4, cap: 'round' });
  const g = new Container();
  g.addChild(body, hand);
  return { g, hand };
};

export const royaleClock = (app: Application, fight: ClockFight) => {
  const root = new Container();
  root.zIndex = 950;
  root.eventMode = 'none';
  root.position.set(250, 17);
  root.visible = false;
  const pill = new Graphics();
  const { g: icon, hand } = stopwatch();
  const label = new Text({
    text: '',
    style: { fontFamily: 'GameFont', fontSize: 16, fill: 0xffffff, stroke: { color: 0x1a0f08, width: 4, join: 'round' } },
  });
  label.anchor.set(0, 0.5);
  root.addChild(pill, icon, label);
  app.stage.addChild(root);

  let shown = '';
  // Latido al cambiar de segundo (los últimos) y al acabarse el tiempo
  let beat = 1;
  const layout = () => {
    const width = 14 + 6 + label.width;
    icon.position.set(-width / 2 + 7, 0);
    label.position.set(-width / 2 + 20, 1);
    pill.clear().roundRect(-width / 2 - 7, -12, width + 14, 24, 9).fill({ color: 0x1a0f08, alpha: 0.62 });
  };

  const tick = (ticker: Ticker) => {
    if (root.destroyed) return;
    if (!fight.finishing && !fight.timeUp) {
      fight.timeLeft = null;
      root.visible = false;
      shown = '';
      return;
    }
    if (!fight.timeUp) {
      fight.timeLeft = Math.max(0, (fight.timeLeft ?? FINISH_SECONDS) - Math.min(ticker.elapsedMS, 250) / 1000);
      if (fight.timeLeft <= 0) fight.timeUp = true;
    }
    root.visible = true;
    const left = fight.timeLeft ?? 0;
    const secs = Math.ceil(left);
    const text = fight.timeUp ? '¡TIEMPO!' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    if (text !== shown) {
      shown = text;
      label.text = text;
      label.style.fill = fight.timeUp ? 0xffd23f : secs <= HURRY ? 0xff5a5a : 0xffffff;
      layout();
      if (fight.timeUp || secs <= HURRY) beat = fight.timeUp ? 1.6 : 1.3;
    }
    // La aguja da la vuelta cada minuto
    hand.rotation = -((left % 60) / 60) * Math.PI * 2;
    beat += (1 - beat) * Math.min(1, (ticker.elapsedMS / 1000) * 6);
    root.scale.set(beat);
  };
  app.ticker.add(tick);

  return {
    stop: () => {
      app.ticker?.remove(tick);
    },
  };
};
