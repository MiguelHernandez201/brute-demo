// Reemplazo minimo de useRenderer: dibuja un brute en PNG (data URL) para los HUD de la pelea.
import { autoDetectRenderer, Renderer } from 'pixi.js';
import { BruteDisplay } from './BruteDisplay';

const EMPTY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s8w6f4AAAAASUVORK5CYII=';

export function createRenderer() {
  const cache = new Map<string, string>();
  const callbacks = new Map<string, ((c: string) => void)[]>();
  let renderer: Renderer | null = null;
  let chain: Promise<void> = Promise.resolve();

  const resolve = (id: string, content: string) => {
    cache.set(id, content);
    (callbacks.get(id) ?? []).forEach((cb) => cb(content));
    callbacks.delete(id);
  };

  return {
    onRender(id: string, cb: (c: string) => void) {
      const hit = cache.get(id);
      if (hit) return cb(hit);
      callbacks.set(id, [...(callbacks.get(id) ?? []), cb]);
    },
    resetCache(id: string) {
      cache.delete(id);
    },
    render(b: any) {
      if (cache.has(b.id)) return resolve(b.id, cache.get(b.id)!);
      chain = chain.then(async () => {
        try {
          renderer ??= await autoDetectRenderer({
            backgroundAlpha: 0,
            width: 800,
            height: 1000,
            antialias: true,
            autoDensity: true,
            resolution: 1,
          });
          const display = new BruteDisplay(b.gender, b.colors, b.body, 'left', 3, b.highlightColorName);
          await new Promise<void>((done) => display.onLoad(() => done()));
          const img = await renderer.extract.image({ target: display.container, format: 'png', quality: 1 });
          display.destroy();
          resolve(b.id, img?.src || EMPTY_PNG);
        } catch (e) {
          console.error('render brute', e);
          resolve(b.id, EMPTY_PNG);
        }
      });
    },
  };
}
