// Demo: capa única para lo que se queda en el suelo (manchas y charcos de sangre, grietas).
// Cada pieza se dibuja una sola vez en una imagen del tamaño del escenario y se descarta. Antes cada mancha era un
// dibujo suelto en el escenario y se acumulaban por miles (hasta 140 por fatality): como el escenario se reordena y
// se recorre entero en cada fotograma (los luchadores cambian de profundidad al moverse), los fps no se recuperaban
// aunque quedaran pocos en pie. Ahora toda la sangre es un solo dibujo, haya la que haya.
import { Application, Container, RenderTexture, Sprite, UPDATE_PRIORITY } from 'pixi.js';

// Encima del fondo (y de su oscurecimiento en la fatality), debajo de los luchadores y de las sombras de los restos
const GROUND_Z_INDEX = 1;

type GroundLayer = { sprite: Sprite; pending: Container };
const layers = new WeakMap<Application, GroundLayer>();

const getLayer = (app: Application): GroundLayer | null => {
  const { stage, renderer, ticker } = app;
  if (!stage || stage.destroyed || !renderer || !ticker) return null;
  const existing = layers.get(app);
  if (existing && !existing.sprite.destroyed) return existing;

  // Algo más de resolución que la pantalla: los bordes salen suaves al mostrarse reducida y sigue nítida cuando
  // la cámara de la fatality se acerca (como mucho 2000×1200 píxeles). Sin mipmaps (main.js los activa para todas
  // las texturas): no se recalculan al ir añadiendo manchas, y al mostrarse reducida la sangre se vería pálida
  const texture = RenderTexture.create({
    width: app.screen.width,
    height: app.screen.height,
    resolution: Math.min(4, renderer.resolution * 1.5),
    autoGenerateMipmaps: false,
  });
  const sprite = new Sprite(texture);
  sprite.zIndex = GROUND_Z_INDEX;
  sprite.eventMode = 'none';
  stage.addChild(sprite);
  // Lo que espera a dibujarse (en coordenadas del escenario)
  const pending = new Container();
  const layer: GroundLayer = { sprite, pending };
  layers.set(app, layer);

  // Se vuelca lo pendiente una vez por fotograma, justo antes de pintarlo (así no hay un fotograma sin la mancha)
  const flush = () => {
    if (!pending.children.length || stage.destroyed || texture.destroyed) return;
    renderer.render({ container: pending, target: texture, clear: false });
    for (const child of pending.removeChildren()) child.destroy();
  };
  ticker.add(flush, undefined, UPDATE_PRIORITY.LOW + 1);

  // Al terminar la pelea se libera la imagen (la pantalla siguiente crea la suya)
  sprite.once('destroyed', () => {
    try {
      ticker.remove(flush);
    } catch {
      /* ticker ya destruido */
    }
    pending.destroy({ children: true });
    texture.destroy(true);
    layers.delete(app);
  });
  return layer;
};

// Pasa un dibujo al suelo: se pinta una vez en la capa y deja de existir como objeto (posición en el escenario)
export const stampGround = (app: Application, piece: Container) => {
  const layer = getLayer(app);
  if (!layer) {
    if (!piece.destroyed) piece.destroy();
    return;
  }
  piece.parent?.removeChild(piece);
  layer.pending.addChild(piece);
};
