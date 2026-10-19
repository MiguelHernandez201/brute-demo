// Demo battle royale: ¡MULTI KILL! Cuando un brute elimina a varios casi a la vez (sobre todo con su ultimate), sale un
// letrero grande arriba y la voz de un anunciador lo dice. Si en esa racha suma más, el letrero cuenta cuántos lleva y
// vuelve a latir.
// La voz es una grabación (public/sfx/multikill.mp3, voz am_michael de Kokoro-82M, Apache 2.0, más grave y con eco de
// estadio): la síntesis de voz del navegador fallaba en silencio en algunos (por ejemplo con las voces de Google en
// Chrome). Solo si no se pudo cargar se usa la del navegador, como la fatality.
import { sound } from '@pixi/sound';
import { Application, Container, Text } from 'pixi.js';
import { announce, bigText } from './fatality';
import { AnimationFighter } from './utils/findFighter';
import { screenLayer } from './utils/hud';
import { shakeStage } from './utils/stageAnimations';
import { tween } from './utils/tween';

type Speed = React.RefObject<number>;

// Segundos entre una eliminación y la siguiente para que cuenten en la misma racha, y que sigue el letrero tras la última
const STREAK_SECONDS = 4;
const HOLD_SECONDS = 1.8;

export const multiKills = (app: Application, speed: Speed) => {
  const streaks = new Map<number, { last: number; count: number }>();
  let shown: { root: Container; count: Text; index: number; hideAt: number } | null = null;
  const wait = (seconds: number) => tween({ t: 0 }, { t: 1, duration: seconds / speed.current });

  // Letrero (o el que ya está, si es de la misma racha) con el nombre y cuántos lleva
  const show = (killer: AnimationFighter, count: number) => {
    const label = `${killer.name.toLocaleUpperCase()} ×${count}`;
    const hideAt = performance.now() + (HOLD_SECONDS * 1000) / speed.current;
    if (shown && shown.index === killer.index && !shown.root.destroyed) {
      shown.count.text = label;
      shown.hideAt = hideAt;
      shown.root.scale.set(1.3);
      void tween(shown.root.scale, { x: 1, y: 1, duration: 0.3 / speed.current, ease: 'back.out(2)' });
      return;
    }
    if (shown && !shown.root.destroyed) shown.root.destroy({ children: true });
    const root = new Container();
    const title = bigText('MULTI KILL', 34, ['#fff6b0', '#ffb703', '#d62828']);
    title.anchor.set(0.5);
    const counter = new Text({
      text: label,
      style: { fontFamily: 'GameFont', fontSize: 15, fill: 0xffffff, stroke: { color: 0x3a1a00, width: 4, join: 'round' } },
    });
    counter.anchor.set(0.5);
    counter.y = 30;
    root.addChild(title, counter);
    root.position.set(250, 112);
    root.zIndex = 970;
    root.scale.set(2.4);
    root.alpha = 0;
    screenLayer(app).addChild(root);
    const banner = { root, count: counter, index: killer.index, hideAt };
    shown = banner;
    void tween(root.scale, { x: 1, y: 1, duration: 0.35 / speed.current, ease: 'back.out(1.6)' });
    void tween(root, { alpha: 1, duration: 0.15 / speed.current });
    // Se va cuando pasa un rato sin que sume más
    void (async () => {
      while (!root.destroyed && performance.now() < banner.hideAt) await wait(0.2);
      if (root.destroyed) return;
      await tween(root, { alpha: 0, duration: 0.4 / speed.current });
      if (!root.destroyed) root.destroy({ children: true });
      if (shown === banner) shown = null;
    })();
  };

  // Cuenta una eliminación de `killer`: con la segunda de la racha, ¡MULTI KILL!
  return (killer: AnimationFighter) => {
    const now = performance.now();
    const streak = streaks.get(killer.index);
    const count = streak && now - streak.last < (STREAK_SECONDS * 1000) / speed.current ? streak.count + 1 : 1;
    streaks.set(killer.index, { last: now, count });
    if (count < 2) return;
    show(killer, count);
    void sound.play('sfx', { sprite: 'hammer' });
    void shakeStage(app, speed, 6, 350);
    if (count === 2) {
      if (sound.exists('multikill')) void sound.play('multikill');
      else announce('Multi kill!', 0.85 * (speed.current > 1 ? 1.15 : 1));
    }
  };
};
