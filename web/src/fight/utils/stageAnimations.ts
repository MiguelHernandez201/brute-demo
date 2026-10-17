import { Application } from 'pixi.js';

// Demo: varios temblores a la vez (p. ej. críticos seguidos) comparten la posición de reposo del escenario,
// así siempre vuelve a su sitio aunque se solapen
const shakes = new WeakMap<Application, { active: number; restY: number }>();

// Shake the stage along the Y-axis with decreasing intensity over a duration
export const shakeStage = async (
  app: Application,
  speed: React.RefObject<number>,
  intensity: number,
  duration: number,
): Promise<void> => {
  const startTime = Date.now();
  const state = shakes.get(app) ?? { active: 0, restY: app.stage.y };
  if (state.active === 0) state.restY = app.stage.y;
  state.active += 1;
  shakes.set(app, state);

  return new Promise((resolve) => {
    const update = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed < duration / speed.current) {
        // Calculate the current intensity, which decreases over time.
        const currentIntensity = intensity * (1 - (elapsed * speed.current) / duration);
        // Apply a random offset to the stage's Y position.

        app.stage.y = state.restY + (Math.random() - 0.5) * currentIntensity * 2;
      } else {
        // Reset the stage's position once the last shake ends
        state.active -= 1;
        if (state.active === 0) app.stage.y = state.restY;
        app.ticker.remove(update);
        // resolve the promise
        resolve();
      }
    };
    app.ticker.add(update);
  });
};
