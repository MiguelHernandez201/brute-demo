// Demo battle royale: zoom dinámico (opción que se activa o desactiva junto a los botones de la arena, ver main.js).
// Encuadra a los que siguen en pie: con pocos se acerca (hasta x2) para ver los duelos con más detalle y con muchos se
// aleja hasta la arena entera, sin salirse nunca del escenario. Se aleja deprisa (lo que entra en escena se ve
// enseguida) y se acerca despacio, sin tirones. Mueve el escenario entero (pivote y escala, como la cámara de la
// fatality del 1 vs 1); lo que es de la interfaz (reloj, letreros) va en una capa de pantalla que lo compensa
// (ver screenLayer) y las etiquetas sobre las cabezas mantienen su tamaño (ver royaleTags).
import { Application, Container, Ticker } from 'pixi.js';
import { AnimationFighter } from './utils/findFighter';
import { setScreenLayer } from './utils/hud';

const W = 500;
const H = 300;
const MAX_ZOOM = 2;

// Se recuerda en el navegador (ver main.js)
export const royaleZoom = { enabled: true };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Lo que se ve del escenario (en sus coordenadas) y el zoom
export type CameraView = { x0: number; y0: number; x1: number; y1: number; z: number };

export const royaleCamera = (app: Application, getFighters: () => AnimationFighter[]) => {
  const { stage } = app;
  const screen = new Container();
  screen.zIndex = 2000;
  screen.eventMode = 'none';
  screen.sortableChildren = true;
  stage.addChild(screen);
  setScreenLayer(app, screen);
  const camera = { z: 1, x: W / 2, y: H / 2 };
  const view: CameraView = { x0: 0, y0: 0, x1: W, y1: H, z: 1 };
  (globalThis as any).__royaleCamera = view; // depuración: lo que se ve y el zoom

  // Encuadre de los que siguen en pie (con sitio para su etiqueta y un margen): cuanto menos son, más cerca, pero sin
  // dejar a nadie fuera
  const target = () => {
    const standing = royaleZoom.enabled
      ? getFighters().filter((f) => f.type === 'brute' && !f.master && !f.dead && f.hp > 0
        && f.animation.container.visible && !f.animation.container.destroyed)
      : [];
    if (!standing.length) return { z: 1, x: W / 2, y: H / 2 };
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const f of standing) {
      const c = f.animation.container;
      const giant = f.animation.giantScale || 1;
      const half = (f.animation.baseWidth / 2) * giant;
      x0 = Math.min(x0, c.x - half - 30);
      x1 = Math.max(x1, c.x + half + 30);
      y0 = Math.min(y0, c.y - f.animation.baseHeight * giant - 30);
      y1 = Math.max(y1, c.y + 20);
    }
    const fit = Math.min(W / (x1 - x0), H / (y1 - y0));
    const byCount = 2.2 - 0.17 * (standing.length - 1);
    return { z: clamp(Math.min(fit, byCount), 1, MAX_ZOOM), x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  };

  const apply = () => {
    const hw = W / 2 / camera.z;
    const hh = H / 2 / camera.z;
    const px = clamp(camera.x, hw, W - hw);
    const py = clamp(camera.y, hh, H - hh);
    stage.pivot.set(px, py);
    // (la `y` la mueve después el temblor del escenario, si lo hay: ver shakeStage)
    stage.position.set(W / 2, H / 2);
    stage.scale.set(camera.z);
    screen.scale.set(1 / camera.z);
    screen.position.set(px - hw, py - hh);
    Object.assign(view, { x0: px - hw, y0: py - hh, x1: px + hw, y1: py + hh, z: camera.z });
  };
  const tick = (ticker: Ticker) => {
    if (stage.destroyed || screen.destroyed) return;
    const dt = Math.min(ticker.elapsedMS, 100) / 1000;
    const goal = target();
    const ease = (k: number) => 1 - Math.exp(-k * dt);
    camera.z += (goal.z - camera.z) * ease(goal.z < camera.z ? 3 : 0.8);
    camera.x += (goal.x - camera.x) * ease(2.5);
    camera.y += (goal.y - camera.y) * ease(2.5);
    apply();
  };
  // Ya desde el principio, antes que cualquier temblor (que se suma a la posición que deja esto)
  apply();
  app.ticker.add(tick);
  return { view };
};
