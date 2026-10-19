import { Application, Container } from 'pixi.js';

// Demo: permite ocultar el HUD superior (nombres, barras de vida, retratos e iconos) en el battle royale,
// donde la vida de todos se muestra en el panel lateral.
export const hudControl = { hidden: false };

// Capas (zIndex) que ocupa el HUD superior en el escenario: iconos 99, cabeceras/barras/retratos 100-103
export const isHudLayer = (zIndex: number) => zIndex >= 99 && zIndex <= 103;

// Demo battle royale: capa de pantalla, que no se mueve con el zoom dinámico (ver royaleCamera). Lo que es de la
// interfaz (reloj, letreros) va ahí; sin cámara, en el escenario
const screens = new WeakMap<Application, Container>();
export const setScreenLayer = (app: Application, layer: Container) => screens.set(app, layer);
export const screenLayer = (app: Application) => {
  const layer = screens.get(app);
  return layer && !layer.destroyed ? layer : app.stage;
};
