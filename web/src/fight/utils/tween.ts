import { gsap } from 'gsap';
import { isFightDisposing } from './lifecycle';

export const Easing = {
  easeTo: (pos: number) => Math.pow(pos, 0.25),
  easeFrom: (pos: number) => Math.pow(pos, 4),
  easeOutQuad: (pos: number) => -(Math.pow(pos - 1, 2) - 1),
  easeInQuad: (pos: number) => Math.pow(pos, 2),
  easeOutCubic: (pos: number) => Math.pow(pos - 1, 3) + 1,
  easeInCubic: (pos: number) => Math.pow(pos, 3),
  // Demo: carrera. Acelera al arrancar, mantiene la velocidad y frena al llegar (en el mismo tiempo total)
  run: (pos: number) => {
    const accel = 0.15;
    const brake = 0.25;
    const top = 1 / (1 - accel / 2 - brake / 2);
    if (pos < accel) return (top * pos * pos) / (2 * accel);
    if (pos > 1 - brake) return 1 - (top * (1 - pos) ** 2) / (2 * brake);
    return top * (accel / 2 + pos - accel);
  },
};

// Small helper to make `gsap.to` return a real Promise
export const tween = (target: gsap.TweenTarget, vars: gsap.TweenVars) => new Promise((resolve) => {
  if (isFightDisposing()) {
    resolve(undefined);
    return;
  }

  gsap.to(target, { ...vars, onComplete: resolve });
});
