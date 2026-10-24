// Demo battle royale: zoom dinámico (opción que se activa o desactiva junto a los botones de la arena, ver main.js).
// Encuadra a los que siguen en pie: con pocos se acerca (hasta x2) para ver los duelos con más detalle y con muchos se
// aleja hasta la arena entera, sin salirse nunca del escenario. Se aleja deprisa (lo que entra en escena se ve
// enseguida) y se acerca despacio, sin tirones. Mueve el escenario entero (pivote y escala, como la cámara de la
// fatality del vídeo promocional); lo que es de la interfaz (reloj, letreros) va en una capa de pantalla que lo
// compensa (ver screenLayer) y las etiquetas sobre las cabezas mantienen su tamaño (ver royaleTags).
import { Application, Container, Ticker } from 'pixi.js';
import { AnimationFighter } from './utils/findFighter';
import { royaleArena } from './utils/fightPositions';
import { setScreenLayer } from './utils/hud';

const W = 500;
const H = 300;
const MAX_ZOOM = 2;
// Arena alta con un Súper gigante (x3, ver GIANT_SCALE en setupFight): no cabe en el escenario, así que la cámara se
// aleja hasta MIN_ZOOM y puede subir hasta ABOVE por encima de él para que se le vea la cara. Lo de fuera lo pone el
// escenario de la pantalla (#ttScene, ver followScene en main.js), que se ve a través del lienzo
const MIN_ZOOM = 0.6;
const ABOVE = 0.6 * 300;
// Con la arena alta, la franja de abajo del lienzo que se funde con el escenario de fuera (ver index.html): la cámara
// no deja ahí a nadie
const FADE_BOTTOM = 0.05;

// Se recuerda en el navegador (ver main.js)
export const royaleZoom = { enabled: true };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
// (si no cabe, en medio)
const fitIn = (v: number, min: number, max: number) => (min > max ? (min + max) / 2 : clamp(v, min, max));

// Arena alta (modo TikTok, ver syncArenaView en main.js): el lienzo se muestra más alto que el 5:3 del juego,
// llenando el alto y con los lados recortados, así los luchadores se ven más grandes. `frac`: la parte del ancho que
// se ve (1: toda) y `top`: la parte del alto que tapa por arriba un letrero de la página (¿Cómo jugar?). La cámara
// encuadra a los luchadores en lo que queda a la vista, sin zoom dinámico también (los sigue sin acercarse), y los
// brutes solo van a sitios que se ven (ver royaleArena)
export const royaleView = { frac: 1, top: 0 };
export const setRoyaleView = (frac: number, top: number) => {
  royaleView.frac = clamp(frac, 0.3, 1);
  royaleView.top = clamp(top, 0, 0.4);
  const half = (W / 2) * royaleView.frac;
  royaleArena.minX = W / 2 - half + 36;
  royaleArena.maxX = W / 2 + half - 36;
};

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
  // Caídos que se siguen encuadrando mientras se les remata: la víctima de una balacera, a la que la minigun dispara
  // desde donde esté, a veces lejos (ver setupFight)
  const framed = new Set<AnimationFighter>();

  // Encuadre de los que siguen en pie (con sitio para su etiqueta y un margen): cuanto menos son, más cerca, pero sin
  // dejar a nadie fuera
  const target = () => {
    const { frac, top } = royaleView;
    const standing = royaleZoom.enabled || frac < 1
      ? getFighters().filter((f) => !f.animation.container.destroyed && (framed.has(f)
        || (f.type === 'brute' && !f.master && !f.dead && f.hp > 0 && f.animation.container.visible)))
      : [];
    if (!standing.length) return { z: 1, x: W / 2, y: H / 2 };
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let giants = false;
    for (const f of standing) {
      const c = f.animation.container;
      const giant = f.animation.giantScale || 1;
      if (giant > 1) giants = true;
      const half = (f.animation.baseWidth / 2) * giant;
      x0 = Math.min(x0, c.x - half - 30);
      x1 = Math.max(x1, c.x + half + 30);
      y0 = Math.min(y0, c.y - f.animation.baseHeight * giant - 30);
      y1 = Math.max(y1, c.y + 20);
    }
    const bottom = frac < 1 ? FADE_BOTTOM : 0;
    const fit = Math.min((W * frac) / (x1 - x0), (H * (1 - top - bottom)) / (y1 - y0));
    const byCount = 2.2 - 0.17 * (standing.length - 1);
    const min = frac < 1 && giants ? MIN_ZOOM : 1;
    const z = royaleZoom.enabled || min < 1 ? clamp(Math.min(fit, royaleZoom.enabled ? byCount : 1), min, MAX_ZOOM) : 1;
    return { z, x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  };

  const apply = () => {
    const { frac, top } = royaleView;
    const hw = W / 2 / camera.z;
    const hh = H / 2 / camera.z;
    // (lo que se ve a lo ancho: con la arena alta, solo la parte de en medio del lienzo)
    const vw = hw * frac;
    const px = fitIn(camera.x, vw, W - vw);
    // Lo encuadrado, en medio de lo que no tapa el letrero de arriba ni se funde abajo (con la arena alta, puede
    // asomarse por encima del escenario: ver ABOVE)
    const bottom = frac < 1 ? FADE_BOTTOM : 0;
    const py = fitIn(camera.y - (H * (top - bottom)) / 2 / camera.z, hh - (frac < 1 ? ABOVE : 0), H - hh);
    stage.pivot.set(px, py);
    // (la `y` la mueve después el temblor del escenario, si lo hay: ver shakeStage)
    stage.position.set(W / 2, H / 2);
    stage.scale.set(camera.z);
    // La capa de pantalla, en lo que se ve: con la arena alta, encogida (los letreros salen del mismo tamaño que antes
    // en pantalla) y justo debajo del letrero de arriba
    screen.scale.set(frac / camera.z);
    screen.position.set(px - vw, py - hh + (H * top) / camera.z);
    Object.assign(view, { x0: px - vw, y0: py - hh + (H * top) / camera.z, x1: px + vw, y1: py + hh, z: camera.z });
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
  return { view, framed };
};
