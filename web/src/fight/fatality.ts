// Demo: fatality al estilo Mortal Kombat cuando cae el brute perdedor en el modo 1 vs 1.
// Primero "FINISH HIM!" y el ganador se acerca; luego un remate distinto según el arma que lleva:
//   espadas → decapitación · hachas → partido en dos · contundentes → aplastado
//   de estocada → acribillado · látigo → arrancacabezas · puños y arrojadizas → explosión
// y al final el letrero "FATALITY". Para probar una en concreto: ?fatality=aplastado (u otra).
// Todo se anima con el ticker de la pelea: se detiene con la pausa y respeta la velocidad (x1 / x2).
import { DeathStep } from '@labrute/core';
import { sound } from '@pixi/sound';
import {
  Application,
  Container,
  FillGradient,
  Graphics,
  Point,
  Rectangle,
  Sprite,
  Text,
  Texture,
  Ticker,
} from 'pixi.js';
import { ColorOverlayFilter } from 'pixi-filters/color-overlay';
import { GlowFilter } from 'pixi-filters/glow';
import { death } from './death';
import { untrap } from './untrap';
import { AnimationFighter, findFighter } from './utils/findFighter';
import { getHitDistance } from './utils/getHitDistance';
import { isHudLayer } from './utils/hud';
import { Spritesheets } from './utils/spritesheet';

// Opciones de la interfaz: si el ganador celebra (saca músculo y luego la celebración de victoria)
export const fatalityOptions = { celebrate: true };

type Kind = 'decapitacion' | 'partido' | 'aplastado' | 'acribillado' | 'latigo' | 'explosion';

// Remate según el arma del ganador (sin arma o con una arrojadiza: explosión)
const KIND_BY_WEAPON: Record<string, Kind> = {
  broadsword: 'decapitacion',
  scimitar: 'decapitacion',
  sword: 'decapitacion',
  fan: 'decapitacion',
  axe: 'partido',
  hatchet: 'partido',
  halbard: 'partido',
  bumps: 'aplastado',
  flail: 'aplastado',
  fryingPan: 'aplastado',
  mammothBone: 'aplastado',
  morningStar: 'aplastado',
  trombone: 'aplastado',
  keyboard: 'aplastado',
  leek: 'aplastado',
  racquet: 'aplastado',
  baton: 'aplastado',
  mug: 'aplastado',
  lance: 'acribillado',
  trident: 'acribillado',
  knife: 'acribillado',
  sai: 'acribillado',
  whip: 'latigo',
};
const KIND_TITLES: Record<Kind, string> = {
  decapitacion: 'DECAPITACIÓN',
  partido: 'PARTIDO EN DOS',
  aplastado: 'APLASTADO',
  acribillado: 'ACRIBILLADO',
  latigo: 'ARRANCACABEZAS',
  explosion: 'EXPLOSIÓN',
};

const GRAVITY = 520;
const MAX_SPLATS = 220;
const BLOOD = [0x4a0000, 0x7a0000, 0xa30000, 0xc81010];
// El cuello se busca entre el 41 % y el 53 % de la altura, contando desde lo alto de la cabeza
const NECK_BAND: [number, number] = [0.41, 0.53];

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)] as T;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
const easeInQuad = (p: number) => p * p;
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const easeOutBack = (p: number) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;

// Solo la caída del brute principal (no la de sus mascotas) se remata con fatality
export const isFatalityDeath = (fighters: AnimationFighter[], step: DeathStep) => {
  const fighter = findFighter(fighters, step.f);
  return !!fighter && fighter.type === 'brute' && !fighter.master;
};

const fatalityKind = (killer: AnimationFighter): Kind => {
  try {
    const forced = new URLSearchParams(location.search).get('fatality');
    if (forced && forced in KIND_TITLES) return forced as Kind;
  } catch {
    /* sin URL */
  }
  return KIND_BY_WEAPON[killer.animation.weapon ?? ''] ?? 'explosion';
};

// Voz grave del anunciador (síntesis de voz del navegador), solo si los efectos están activos
const announce = (text: string) => {
  try {
    if (!sound.exists('sfx') || !sound.volume('sfx') || !('speechSynthesis' in window)) return;
    const voice = new SpeechSynthesisUtterance(text);
    const english = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('en'));
    if (english) voice.voice = english;
    voice.lang = 'en-US';
    voice.pitch = 0.1;
    voice.rate = 0.7;
    speechSynthesis.cancel();
    speechSynthesis.speak(voice);
  } catch {
    /* sin síntesis de voz */
  }
};

// Letrero grande al estilo del juego (degradado, contorno y sombra)
const bigText = (text: string, fontSize: number, colors: [string, string, string]) =>
  new Text({
    text,
    style: {
      fontFamily: 'GameFont',
      fontSize,
      letterSpacing: 3,
      fill: new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: colors[0] },
          { offset: 0.45, color: colors[1] },
          { offset: 1, color: colors[2] },
        ],
        textureSpace: 'local',
      }),
      stroke: { color: 0x120000, width: Math.round(fontSize / 8.5), join: 'round' },
      dropShadow: { color: 0x000000, alpha: 0.9, blur: 4, distance: 5, angle: Math.PI / 2 },
    },
  });

// Muñón rojo del corte
const stump = (rx: number) =>
  new Graphics()
    .ellipse(0, 0, rx, 2.4)
    .fill(0x6a0000)
    .ellipse(0, -0.3, rx * 0.6, 1.3)
    .fill(0xc81010);

// Foto del perdedor (en sus coordenadas locales) para partirlo en piezas
type Photo = {
  tex: Texture;
  frame: Rectangle;
  minX: number;
  maxX: number;
  res: number;
  pixels: Uint8ClampedArray | Uint8Array;
  pw: number;
  ph: number;
};
const opaque = (photo: Photo, lx: number, ly: number) => {
  const x = Math.round((lx - photo.frame.x) * photo.res);
  const y = Math.round((ly - photo.frame.y) * photo.res);
  if (x < 0 || y < 0 || x >= photo.pw || y >= photo.ph) return false;
  return (photo.pixels[(y * photo.pw + x) * 4 + 3] ?? 0) > 128;
};

export const fatality = async (
  app: Application,
  spritesheets: Spritesheets,
  fighters: AnimationFighter[],
  step: DeathStep,
  speed: React.RefObject<number>,
) => {
  const victim = findFighter(fighters, step.f);
  const killer = fighters.find((f) => f.type === 'brute' && !f.master && f.team !== victim?.team && !f.dead);
  const { stage, ticker } = app;
  if (!victim || !killer || !stage || !ticker) {
    death(fighters, step, speed, false);
    return;
  }
  // Muerto desde ya: así ninguna animación pendiente lo vuelve a poner en reposo
  victim.dead = true;
  const kind = fatalityKind(killer);

  const W = app.screen.width;
  const H = app.screen.height;
  const V = victim.animation.container;
  const K = killer.animation.container;
  const alive = () => !stage.destroyed && !V.destroyed && !K.destroyed;
  // Cámara lenta: afecta a la sangre y a las piezas mientras dura
  let timeScale = 1;
  const elapsed = (tk: Ticker) => (Math.min(tk.elapsedMS, 50) / 1000) * speed.current;

  // Anima durante `seconds` (tiempo de pelea) llamando a update(p) con p de 0 a 1
  const animate = (seconds: number, update: (p: number) => void) =>
    new Promise<void>((resolve) => {
      let t = 0;
      const tick = (tk: Ticker) => {
        if (!alive()) {
          ticker.remove(tick);
          resolve();
          return;
        }
        t += elapsed(tk);
        const p = Math.min(1, t / seconds);
        update(p);
        if (p >= 1) {
          ticker.remove(tick);
          resolve();
        }
      };
      ticker.add(tick);
    });
  const wait = (seconds: number) => animate(seconds, () => {});
  // Un callback por fotograma (con dt ya escalado por la cámara lenta) hasta que devuelva false
  const every = (update: (dt: number) => boolean | void) => {
    const tick = (tk: Ticker) => {
      if (!alive() || update(elapsed(tk) * timeScale) === false) ticker.remove(tick);
    };
    ticker.add(tick);
  };
  const slowMotion = (to: number, seconds: number) => {
    const from = timeScale;
    return animate(seconds, (p) => {
      timeScale = lerp(from, to, p);
    });
  };

  // --- Cámara: acercamiento con pivote y temblor, sin salirse del escenario ---
  // `screen` es una capa que compensa la cámara: lo que contiene se coloca en coordenadas de pantalla
  const screen = new Container();
  screen.zIndex = 2000;
  screen.eventMode = 'none';
  const camera = { z: 1, fx: W / 2, fy: H / 2, shake: 0 };
  const applyCamera = () => {
    if (!alive()) return;
    const hw = W / 2 / camera.z;
    const hh = H / 2 / camera.z;
    const px = clamp(camera.fx, hw, W - hw);
    const py = clamp(camera.fy, hh, H - hh);
    const sx = camera.shake ? rand(-camera.shake, camera.shake) : 0;
    const sy = camera.shake ? rand(-camera.shake, camera.shake) : 0;
    stage.pivot.set(clamp(px + sx, hw, W - hw), clamp(py + sy, hh, H - hh));
    stage.position.set(W / 2, H / 2);
    stage.scale.set(camera.z);
    screen.scale.set(1 / camera.z);
    screen.position.set(px - hw, py - hh);
  };
  ticker.add(applyCamera);
  const shake = (intensity: number, seconds: number) =>
    animate(seconds, (p) => {
      camera.shake = intensity * (1 - p);
    });
  const moveCamera = (z: number, fx: number, fy: number, seconds: number, ease = easeInOutCubic) => {
    const from = { ...camera };
    return animate(seconds, (p) => {
      const e = ease(p);
      camera.z = lerp(from.z, z, e);
      camera.fx = lerp(from.fx, fx, e);
      camera.fy = lerp(from.fy, fy, e);
    });
  };

  // --- Capas: fondo oscurecido (bajo los luchadores) y destello (encima de todo) ---
  const shade = new Graphics().rect(0, 0, W, H).fill(0x160000);
  shade.alpha = 0;
  shade.zIndex = -0.5;
  shade.eventMode = 'none';
  const flash = new Graphics().rect(0, 0, W, H).fill(0xffffff);
  flash.alpha = 0;
  screen.addChild(flash);
  stage.addChild(shade, screen);
  const flashTo = (color: number, alpha: number, seconds: number) => {
    flash.clear().rect(0, 0, W, H).fill(color);
    return animate(seconds, (p) => {
      flash.alpha = alpha * (1 - p);
    });
  };
  const fadeShade = (to: number, seconds: number) => {
    const from = shade.alpha;
    return animate(seconds, (p) => {
      shade.alpha = lerp(from, to, p);
    });
  };

  // El HUD superior se aparta mientras dura la fatality
  const hud = stage.children.filter((c) => isHudLayer(c.zIndex) && !fighters.some((f) => f.animation.container === c));
  const hudAlpha = new Map(hud.map((c) => [c, c.alpha]));
  const fadeHud = (to: number, seconds: number) => {
    const from = new Map(hud.map((c) => [c, c.alpha]));
    return animate(seconds, (p) => {
      hud.forEach((c) => {
        if (!c.destroyed) c.alpha = lerp(from.get(c) ?? 1, to * (hudAlpha.get(c) ?? 1), p);
      });
    });
  };

  // --- Sangre: gotas con gravedad que dejan manchas en el suelo ---
  type Drop = { g: Graphics; vx: number; vy: number; ground: number; r: number; color: number };
  const drops: Drop[] = [];
  let splats = 0;
  const groundY = V.y;
  const splat = (x: number, y: number, r: number, color: number) => {
    if (splats >= MAX_SPLATS) return;
    splats += 1;
    const g = new Graphics().ellipse(0, 0, r * rand(1.8, 3.4), r * rand(0.5, 0.9)).fill({ color, alpha: 0.85 });
    g.position.set(x, y);
    g.zIndex = 1;
    g.eventMode = 'none';
    stage.addChild(g);
  };
  every((dt) => {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i] as Drop;
      d.vy += GRAVITY * dt;
      d.g.x += d.vx * dt;
      d.g.y += d.vy * dt;
      if (d.vy > 0 && d.g.y >= d.ground) {
        splat(d.g.x, d.ground, d.r, d.color);
        d.g.destroy();
        drops.splice(i, 1);
      }
    }
  });
  // Chorro de sangre en una dirección (ángulo en radianes: 0 = derecha, -π/2 = arriba)
  const spray = (x: number, y: number, count: number, angle: number, cone: number, velocity: [number, number]) => {
    for (let i = 0; i < count; i++) {
      const r = rand(0.8, 2.4);
      const color = pick(BLOOD);
      const a = angle + rand(-cone / 2, cone / 2);
      const v = rand(velocity[0], velocity[1]);
      const g = new Graphics().circle(0, 0, r).fill(color);
      g.position.set(x + rand(-2, 2), y + rand(-2, 2));
      g.zIndex = 1500;
      g.eventMode = 'none';
      stage.addChild(g);
      drops.push({ g, r, color, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ground: groundY + rand(-6, 10) });
    }
  };
  // Chorro a latidos desde un punto que puede moverse; devuelve la función que lo corta
  const gush = (point: () => Point, angle: () => number, strength = 1, cone = 0.55) => {
    let t = 0;
    let on = true;
    every((dt) => {
      if (!on) return false;
      t += dt;
      const beat = 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * 2.2));
      const fade = Math.max(0.25, 1 - t / 3.5);
      const amount = 90 * strength * beat * fade * dt;
      const count = Math.floor(amount) + (Math.random() < amount % 1 ? 1 : 0);
      if (count) {
        const p = point();
        spray(p.x, p.y, count, angle(), cone, [60 + 90 * strength, 60 + 240 * fade * strength]);
      }
      return true;
    });
    return () => {
      on = false;
    };
  };
  // Salpicadura en círculo sobre el suelo
  const splashRing = (x: number, count: number, radius: number) => {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(radius * 0.3, radius);
      splat(x + Math.cos(a) * d, groundY + Math.sin(a) * d * 0.2, rand(1, 2.6), pick(BLOOD));
    }
  };
  // Charco que crece
  const pool = (x: number, size = 1) => {
    const g = new Graphics().ellipse(0, 0, 24 * size, 5 * size).fill({ color: 0x6a0000, alpha: 0.9 });
    g.position.set(x, groundY + 2);
    g.zIndex = 1.5;
    g.scale.set(0.15);
    g.eventMode = 'none';
    stage.addChild(g);
    void animate(2.5, (p) => {
      if (!g.destroyed) g.scale.set(lerp(0.15, 1, easeOutCubic(p)));
    });
  };
  const groundShadow = (x: number, width: number) => {
    const g = new Graphics().ellipse(0, 0, width, 4).fill({ color: 0, alpha: 0.35 });
    g.position.set(x, groundY);
    g.zIndex = 1;
    g.eventMode = 'none';
    stage.addChild(g);
    return g;
  };

  // Estela blanca de un corte
  const slashFx = (x: number, y: number, angle: number, length: number, thickness: number) => {
    const g = new Graphics().poly([-length / 2, 0, 0, -thickness / 2, length / 2, 0, 0, thickness / 2]).fill(0xffffff);
    g.position.set(x, y);
    g.rotation = angle;
    g.zIndex = 1600;
    g.eventMode = 'none';
    g.filters = [new GlowFilter({ color: 0xff3030, distance: 8, outerStrength: 2.5, innerStrength: 0, quality: 0.2 })];
    stage.addChild(g);
    void animate(0.3, (p) => {
      g.scale.set(Math.min(1, p * 5), 1 - p * 0.7);
      g.alpha = p < 0.3 ? 1 : 1 - (p - 0.3) / 0.7;
    }).then(() => g.destroy());
  };

  // El perdedor se pone rojo un instante y retrocede al recibir un golpe
  const baseFilters = V.filters ? [...V.filters] : [];
  const flinch = (push = 5) => {
    V.filters = [...baseFilters, new ColorOverlayFilter({ color: 0xff0000, alpha: 0.55 })];
    void wait(0.12).then(() => {
      if (!V.destroyed) V.filters = baseFilters;
    });
    const x0 = V.x;
    void animate(0.12, (p) => {
      V.x = x0 + towards * push * Math.sin(p * Math.PI);
    });
  };

  const towards = Math.sign(V.x - K.x) || 1; // del ganador hacia el perdedor
  const bodyHeight = victim.animation.baseHeight * 0.8;
  // Ángulo pensado para el lado derecho, reflejado si el perdedor está a la izquierda
  const away = (angle: number) => (towards > 0 ? angle : Math.PI - angle);
  const toStage = (c: Container, x = 0, y = 0) => stage.toLocal(c.toGlobal(new Point(x, y)));

  // El ganador ataca con una animación y se espera al momento del golpe
  const strike = async (animation: 'slash' | 'estoc' | 'fist' | 'whip', animationSpeed = 1) => {
    const hit = killer.animation.waitForEvent(`${animation}:hit`, 1500);
    const end = killer.animation.waitForEvent(`${animation}:end`, 2500);
    killer.animation.animationSpeed = animationSpeed;
    killer.animation.setAnimation(animation);
    await hit;
    killer.animation.animationSpeed = 1;
    void end.then(() => {
      if (!K.destroyed && killer.animation.animation === animation) killer.animation.setAnimation('idle');
    });
  };

  // --- Fotos y piezas del perdedor ---
  const takePhoto = (): Photo | null => {
    V.filters = baseFilters;
    const shadow = victim.animation.shadow;
    shadow.visible = false;
    const lb = V.getLocalBounds();
    const frame = new Rectangle(
      Math.floor(lb.minX) - 2,
      Math.floor(lb.minY) - 2,
      Math.ceil(lb.maxX - lb.minX) + 4,
      Math.ceil(lb.maxY - lb.minY) + 4,
    );
    const res = Math.min(8, app.renderer.resolution * 2);
    try {
      const tex = app.renderer.generateTexture({ target: V, frame, resolution: res });
      const { pixels, width, height } = app.renderer.extract.pixels({ target: tex });
      return { tex, frame, minX: lb.minX, maxX: lb.maxX, res, pixels, pw: width, ph: height };
    } catch (e) {
      console.warn('fatality: sin foto del perdedor', e);
      shadow.visible = true;
      return null;
    }
  };
  // Si no hay foto, muerte normal
  const plainDeath = () => {
    V.visible = true;
    victim.animation.shadow.visible = true;
    death(fighters, step, speed, false);
  };
  // Cuello: la fila más angosta de la silueta dentro de la franja esperada
  const findNeck = (photo: Photo) => {
    const top = Math.max(photo.frame.y + 2, -victim.animation.baseHeight);
    let best = { count: Infinity, y: top * (1 - 0.47), x: 0, half: 5 };
    for (let y = top * (1 - NECK_BAND[0]); y <= top * (1 - NECK_BAND[1]); y += 1 / photo.res) {
      let count = 0;
      let x0 = Infinity;
      let x1 = -Infinity;
      for (let x = photo.frame.x; x < photo.frame.x + photo.frame.width; x += 1 / photo.res) {
        if (!opaque(photo, x, y)) continue;
        count += 1;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
      if (count > 0 && count < best.count) best = { count, y, x: (x0 + x1) / 2, half: Math.max(3, (x1 - x0) / 2 + 1) };
    }
    return best;
  };
  // Alto de la silueta en una columna
  const columnSpan = (photo: Photo, x: number) => {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let y = photo.frame.y; y < photo.frame.y + photo.frame.height; y += 1 / photo.res) {
      if (!opaque(photo, x, y)) continue;
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return y1 > y0 ? { y0, y1 } : { y0: photo.frame.y + 4, y1: 0 };
  };
  const coverage = (photo: Photo, r: Rectangle) => {
    let hits = 0;
    let total = 0;
    for (let y = r.y; y < r.y + r.height; y += 1) {
      for (let x = r.x; x < r.x + r.width; x += 1) {
        total += 1;
        if (opaque(photo, x, y)) hits += 1;
      }
    }
    return total ? hits / total : 0;
  };
  // Pieza recortada de la foto, colocada justo donde estaba y que gira alrededor de `pivot` (coords. locales)
  const makePiece = (photo: Photo, rect: Rectangle, pivot: { x: number; y: number }, scale = 1) => {
    const sx = Math.sign(V.scale.x) || 1;
    const inner = new Container();
    inner.scale.set(sx * scale, scale);
    const sprite = new Sprite(
      new Texture({
        source: photo.tex.source,
        frame: new Rectangle(rect.x - photo.frame.x, rect.y - photo.frame.y, rect.width, rect.height),
      }),
    );
    sprite.position.set(rect.x - pivot.x, rect.y - pivot.y);
    inner.addChild(sprite);
    const piece = new Container();
    piece.addChild(inner);
    piece.position.set(V.x + pivot.x * sx * scale, V.y + pivot.y * scale);
    piece.zIndex = V.y;
    piece.eventMode = 'none';
    stage.addChild(piece);
    // Convierte coordenadas locales del perdedor a las de la pieza
    const at = (x: number, y: number) => new Point(x - pivot.x, y - pivot.y);
    return { piece, inner, at };
  };
  // Borde de la silueta (coords. locales) del lado del escenario `dir` (1 = derecha, -1 = izquierda)
  const sideEdge = (photo: { minX: number; maxX: number }, dir: number) => {
    const sx = Math.sign(V.scale.x) || 1;
    return photo.minX * sx * dir > photo.maxX * sx * dir ? photo.minX : photo.maxX;
  };

  // Pieza que sale volando: rebota y rueda; se resuelve al quedar quieta
  const throwPiece = (
    piece: Container,
    o: { vx: number; vy: number; spin: number; radius: number; bleed?: number; noisy?: boolean },
  ) =>
    new Promise<void>((resolve) => {
      const ground = groundY - o.radius * 0.75;
      let { vx, vy, spin } = o;
      let grounded = false;
      piece.zIndex = 1500;
      every((dt) => {
        if (piece.destroyed) {
          resolve();
          return false;
        }
        if (!grounded) {
          vy += GRAVITY * dt;
          piece.x += vx * dt;
          piece.y += vy * dt;
          piece.rotation += spin * dt;
          if (o.bleed && Math.random() < o.bleed) spray(piece.x, piece.y, 1, Math.PI / 2, 1, [10, 40]);
          if (piece.x < 12 || piece.x > W - 12) {
            piece.x = clamp(piece.x, 12, W - 12);
            vx = -vx * 0.5;
          }
          if (vy > 0 && piece.y >= ground) {
            piece.y = ground;
            if (o.bleed) spray(piece.x, groundY - 2, 5, -Math.PI / 2, 2.4, [20, 80]);
            if (vy > 90) {
              if (o.noisy) void sound.play('sfx', { sprite: 'blunt1' });
              vy = -vy * 0.35;
              vx *= 0.7;
              spin *= 0.6;
            } else {
              grounded = true;
              piece.zIndex = groundY;
            }
          }
          return true;
        }
        // Rodando por el suelo
        piece.x = clamp(piece.x + vx * dt, 12, W - 12);
        piece.rotation += (vx / o.radius) * dt;
        vx *= Math.max(0, 1 - 2.2 * dt);
        if (o.bleed && Math.random() < 0.25) splat(piece.x, groundY + rand(0, 4), rand(0.8, 1.6), pick(BLOOD));
        if (Math.abs(vx) < 3) {
          resolve();
          return false;
        }
        return true;
      });
    });
  // Espera a que acaben (o como mucho `seconds`)
  const settle = (promises: Promise<unknown>[], seconds: number) =>
    Promise.race([Promise.all(promises), wait(seconds)]);

  // Una pieza (o el perdedor entero) se tambalea, cae girando hasta `to` y rebota en el suelo
  const topple = async (c: Container, to: number, seconds = 0.45) => {
    const from = c.rotation;
    await animate(0.45, (p) => {
      c.rotation = from + Math.sin(p * Math.PI * 2) * 0.05 * Math.sign(to);
    });
    await animate(seconds, (p) => {
      c.rotation = lerp(from, to, easeInQuad(p));
    });
    void sound.play('sfx', { sprite: 'blunt3' });
    void shake(5, 0.35);
    await animate(0.2, (p) => {
      c.rotation = to - Math.sign(to) * 0.06 * Math.sin(p * Math.PI);
    });
  };

  // ===== 1. "FINISH HIM!": el perdedor queda aturdido tambaleándose =====
  untrap(app, spritesheets, killer);
  untrap(app, spritesheets, victim);
  killer.stunned = false;
  killer.animation.setAnimation('idle');
  victim.animation.setAnimation('idle');
  let swaying = true;
  let swayTime = 0;
  every((dt) => {
    if (!swaying) {
      V.rotation = 0;
      return false;
    }
    swayTime += dt;
    V.rotation = Math.sin(swayTime * 4.5) * 0.09;
    return true;
  });
  const stopSway = () => {
    swaying = false;
    V.rotation = 0;
  };
  void fadeHud(0, 0.3);
  void fadeShade(0.6, 0.5);
  void moveCamera(1.25, (V.x + K.x) / 2, groundY - 40, 0.6);
  void sound.play('sfx', { sprite: 'hammer' });
  const finish = bigText(victim.gender === 'female' ? 'FINISH HER!' : 'FINISH HIM!', 40, [
    '#fff3a0',
    '#ff8a00',
    '#a31000',
  ]);
  finish.anchor.set(0.5);
  finish.position.set(W / 2, H * 0.3);
  finish.alpha = 0;
  screen.addChild(finish);
  await animate(0.3, (p) => {
    finish.scale.set(lerp(2.6, 1, easeOutBack(p)));
    finish.alpha = Math.min(1, p * 2.5);
  });
  announce(victim.gender === 'female' ? 'Finish her' : 'Finish him');
  void shake(5, 0.4);
  await animate(0.9, (p) => {
    finish.scale.set(1 + Math.sin(p * Math.PI * 3) * 0.03);
  });
  await animate(0.25, (p) => {
    finish.alpha = 1 - p;
  });
  finish.destroy();
  if (!alive()) return;

  // ===== 2. El ganador se acerca (con el látigo se queda a distancia) =====
  K.scale.x = Math.abs(K.scale.x) * towards;
  const gap = Math.abs(V.x - K.x);
  const targetX =
    kind === 'latigo'
      ? gap >= 75 && gap <= 140
        ? K.x
        : V.x - towards * 100
      : V.x - towards * Math.max(kind === 'acribillado' ? 40 : 30, getHitDistance(killer, victim) * 0.8);
  const start = { x: K.x, y: K.y };
  const distance = Math.hypot(targetX - start.x, groundY - start.y);
  if (distance > 4) {
    killer.animation.setAnimation('run');
    await animate(Math.max(0.15, distance / 280), (p) => {
      K.x = lerp(start.x, targetX, p);
      K.y = lerp(start.y, groundY + 1, p);
      camera.fx = lerp(camera.fx, (V.x + K.x) / 2, 0.2);
    });
    if (!alive()) return;
  }
  killer.animation.setAnimation('idle');

  // ===== 3. El remate =====

  // Cabeza fuera: hacia delante (espada) o hacia el ganador (látigo); el cuerpo sangra y cae
  const behead = async (headDir: 1 | -1, onHead?: (head: Container) => void) => {
    const photo = takePhoto();
    if (!photo) return plainDeath();
    const neck = findNeck(photo);
    const { frame } = photo;
    const fallDir = headDir === 1 ? towards : -towards;
    const edge = sideEdge(photo, fallDir) * 0.6;
    const body = makePiece(photo, new Rectangle(frame.x, neck.y, frame.width, frame.y + frame.height - neck.y), {
      x: edge,
      y: 0,
    });
    const bodyStump = stump(neck.half);
    bodyStump.position.copyFrom(body.at(neck.x, neck.y));
    const neckMark = new Container();
    neckMark.position.copyFrom(body.at(neck.x, neck.y));
    body.inner.addChild(bodyStump, neckMark);
    const head = makePiece(photo, new Rectangle(frame.x, frame.y, frame.width, neck.y - frame.y), {
      x: neck.x,
      y: (frame.y + neck.y) / 2,
    });
    const headStump = stump(neck.half);
    headStump.position.copyFrom(head.at(neck.x, neck.y));
    head.inner.addChild(headStump);
    V.visible = false;
    const shadow = groundShadow(V.x, victim.animation.baseWidth * 0.36);

    const neckAt = () => toStage(neckMark);
    const n = neckAt();
    if (headDir === 1) slashFx(n.x - towards * 4, n.y, towards * 0.08, 84, 7);
    spray(n.x, n.y, 40, -Math.PI / 2 + headDir * towards * 0.35, 0.9, [160, 330]);
    const headRadius = Math.max(8, Math.min(frame.width, neck.y - frame.y) / 2);
    const landed = throwPiece(head.piece, {
      vx: headDir === 1 ? towards * rand(75, 110) : -towards * rand(130, 165),
      vy: -rand(headDir === 1 ? 240 : 170, headDir === 1 ? 290 : 210),
      spin: headDir * towards * rand(7, 10),
      radius: headRadius,
      bleed: 0.7,
      noisy: true,
    });
    onHead?.(head.piece);
    const stopGush = gush(neckAt, () => -Math.PI / 2 + body.piece.rotation);

    // Cámara lenta mientras la cabeza vuela; luego vuelve poco a poco a la velocidad normal
    await wait(1.1);
    if (!alive()) return;
    void slowMotion(1, 0.5);
    void moveCamera(1.35, (V.x + head.piece.x) / 2, groundY - 30, 0.8);
    void animate(0.9, (p) => {
      shadow.scale.x = 1 + p * 0.8;
      shadow.x = V.x + fallDir * p * 22;
    });
    await topple(body.piece, fallDir * (Math.PI / 2) * 0.97);
    if (!alive()) return;
    const down = neckAt();
    spray(down.x, groundY, 14, -Math.PI / 2, 2.6, [30, 110]);
    pool(down.x + fallDir * 6);
    await settle([landed], 1.2);
    stopGush();
  };

  const decapitacion = async () => {
    for (const cut of [
      { y: 0.48, angle: -0.6 },
      { y: 0.34, angle: 0.55 },
    ]) {
      await strike('slash');
      if (!alive()) return;
      const cy = groundY - bodyHeight * cut.y;
      void sound.play('sfx', { sprite: pick(['sharp1', 'sharp3', 'sharp5', 'sword']) });
      slashFx(V.x, cy, cut.angle, 48, 5);
      spray(V.x, cy, 24, away(-0.45), 1.3, [70, 210]);
      flinch();
      void shake(3, 0.2);
      await wait(0.3);
    }
    await moveCamera(1.9, V.x - towards * 12, groundY - bodyHeight * 0.5, 0.35, easeOutCubic);
    timeScale = 0.4;
    await strike('slash', 0.5);
    if (!alive()) return;
    stopSway();
    void sound.play('sfx', { sprite: 'broadsword1' });
    void sound.play('sfx', { sprite: 'hammer' });
    void flashTo(0xffffff, 0.9, 0.3);
    void shake(7, 0.5);
    await behead(1);
  };

  const latigo = async () => {
    await strike('whip');
    if (!alive()) return;
    void sound.play('sfx', { sprite: 'whip' });
    const cy = groundY - bodyHeight * 0.45;
    slashFx(V.x, cy, rand(-0.4, 0.4), 40, 4);
    spray(V.x, cy, 18, away(-0.4), 1.2, [60, 190]);
    flinch(7);
    void shake(3, 0.2);
    await wait(0.35);
    await moveCamera(1.45, (V.x + K.x) / 2, groundY - bodyHeight * 0.55, 0.35, easeOutCubic);
    timeScale = 0.45;
    await strike('whip', 0.6);
    if (!alive()) return;
    stopSway();
    void sound.play('sfx', { sprite: 'whip' });
    void sound.play('sfx', { sprite: 'chaining' });
    // El látigo se enrolla en el cuello y se tensa
    const hand = () => new Point(K.x + towards * 18, groundY - bodyHeight * 0.5);
    let ropeEnd = () => new Point(V.x - towards * 2, groundY - bodyHeight * 0.55);
    let slack = 1;
    const rope = new Graphics();
    rope.zIndex = 1550;
    rope.eventMode = 'none';
    stage.addChild(rope);
    every(() => {
      if (rope.destroyed) return false;
      const a = hand();
      const b = ropeEnd();
      rope
        .clear()
        .moveTo(a.x, a.y)
        .quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 20 * slack, b.x, b.y)
        .stroke({ width: 1.6, color: 0x3a2412 })
        .ellipse(b.x, b.y, 5, 2.2)
        .stroke({ width: 1.4, color: 0x3a2412 });
      return true;
    });
    const x0 = V.x;
    await animate(0.45, (p) => {
      slack = 1 - easeOutCubic(p);
      V.x = x0 - towards * 6 * p;
    });
    if (!alive()) return;
    // ¡Tirón!
    void sound.play('sfx', { sprite: 'hammer' });
    void flashTo(0xffffff, 0.8, 0.3);
    void shake(6, 0.45);
    await behead(-1, (head) => {
      ropeEnd = () => new Point(head.x, head.y + 4);
      void wait(0.35)
        .then(() => animate(0.25, (p) => (rope.alpha = 1 - p)))
        .then(() => rope.destroy());
    });
  };

  const partido = async () => {
    await strike('slash');
    if (!alive()) return;
    void sound.play('sfx', { sprite: pick(['axe1', 'axe2', 'hatchet1']) });
    const cy = groundY - bodyHeight * 0.4;
    slashFx(V.x, cy, -0.5, 50, 6);
    spray(V.x, cy, 22, away(-0.4), 1.2, [70, 210]);
    flinch(6);
    void shake(3, 0.2);
    await wait(0.35);
    await moveCamera(1.6, V.x, groundY - bodyHeight * 0.5, 0.35, easeOutCubic);
    timeScale = 0.4;
    await strike('slash', 0.5);
    if (!alive()) return;
    stopSway();
    void sound.play('sfx', { sprite: 'broadsword1' });
    void sound.play('sfx', { sprite: 'hammer' });
    void flashTo(0xffffff, 0.9, 0.3);
    void shake(8, 0.5);
    const photo = takePhoto();
    if (!photo) return plainDeath();
    const { frame } = photo;
    const splitX = findNeck(photo).x;
    const sx = Math.sign(V.scale.x) || 1;
    const lineX = V.x + splitX * sx;
    slashFx(lineX, groundY - bodyHeight * 0.5, Math.PI / 2 + rand(-0.05, 0.05), bodyHeight * 1.3, 8);
    const span = columnSpan(photo, splitX);
    // Dos mitades que caen cada una hacia su lado, con el corte en rojo
    const halves = ([-1, 1] as const).map((side) => {
      const rect =
        side < 0
          ? new Rectangle(frame.x, frame.y, splitX - frame.x, frame.height)
          : new Rectangle(splitX, frame.y, frame.x + frame.width - splitX, frame.height);
      const outer = side < 0 ? photo.minX : photo.maxX;
      const half = makePiece(photo, rect, { x: lerp(splitX, outer, 0.7), y: 0 });
      const cut = new Graphics()
        .rect(side < 0 ? -1.8 : 0, 0, 1.8, span.y1 - span.y0)
        .fill(0x6a0000)
        .rect(side < 0 ? -1 : 0.2, 2, 0.8, Math.max(0, span.y1 - span.y0 - 4))
        .fill(0xc81010);
      cut.position.copyFrom(half.at(splitX, span.y0));
      half.inner.addChild(cut);
      return { ...half, dir: side * sx, x0: half.piece.x };
    });
    V.visible = false;
    groundShadow(lineX, victim.animation.baseWidth * 0.4);
    const linePoint = () => new Point(lineX + rand(-1.5, 1.5), lerp(groundY + span.y0, groundY - 4, Math.random()));
    for (let i = 0; i < 4; i++) {
      const p = linePoint();
      spray(p.x, p.y, 10, pick([-0.3, Math.PI + 0.3]), 1, [80, 220]);
    }
    const stopGush = gush(linePoint, () => -Math.PI / 2 + rand(-0.6, 0.6), 1.3, 0.9);
    await animate(0.4, (p) => {
      halves.forEach((h) => (h.piece.x = h.x0 + h.dir * 4 * easeOutCubic(p)));
    });
    await wait(0.5);
    if (!alive()) return;
    void slowMotion(1, 0.5);
    void moveCamera(1.3, lineX, groundY - 30, 0.8);
    stopGush();
    await Promise.all(halves.map((h) => topple(h.piece, h.dir * (Math.PI / 2) * 0.97)));
    if (!alive()) return;
    spray(lineX, groundY - 2, 20, -Math.PI / 2, 2.4, [30, 120]);
    pool(lineX, 1.2);
    await wait(0.6);
  };

  const aplastado = async () => {
    await strike('slash');
    if (!alive()) return;
    void sound.play('sfx', { sprite: pick(['blunt2', 'blunt4', 'blunt6']) });
    spray(V.x, groundY - bodyHeight * 0.65, 12, away(-0.6), 1.2, [60, 170]);
    flinch(7);
    void shake(3, 0.2);
    await wait(0.3);
    // Salto
    const sx = V.scale.x;
    const sy = V.scale.y;
    const startX = K.x;
    const landX = V.x - towards * 8;
    const apex = 120;
    const shadow = killer.animation.shadow;
    const airborne = (x: number, h: number) => {
      K.x = x;
      K.y = groundY + 1 - h;
      shadow.y = h;
      shadow.alpha = clamp(1 - h / 160, 0.25, 1);
    };
    killer.animation.setAirborn(true);
    K.zIndex = groundY + 5;
    killer.animation.setAnimation('arrive');
    void moveCamera(1.3, (V.x + K.x) / 2, groundY - 70, 0.5);
    await animate(0.45, (p) => airborne(lerp(startX, landX, p * 0.85), apex * easeOutCubic(p)));
    if (!alive()) return;
    timeScale = 0.6;
    const hit = strike('slash');
    await animate(0.17, (p) => airborne(lerp(startX, landX, 0.85 + 0.15 * p), apex * (1 - easeInQuad(p))));
    await Promise.race([hit, wait(0.15)]);
    if (!alive()) return;
    // ¡Plaf!
    stopSway();
    killer.animation.setAirborn(false);
    airborne(landX, 0);
    victim.animation.animationSpeed = 0;
    void sound.play('sfx', { sprite: 'hammer' });
    void sound.play('sfx', { sprite: 'bomb' });
    void flashTo(0xffffff, 0.8, 0.3);
    void shake(10, 0.6);
    await animate(0.08, (p) => {
      V.scale.set(sx * lerp(1, 1.6, p), sy * lerp(1, 0.25, p));
    });
    spray(V.x, groundY - 3, 40, 0, 0.5, [120, 320]);
    spray(V.x, groundY - 3, 40, Math.PI, 0.5, [120, 320]);
    spray(V.x, groundY - 6, 20, -Math.PI / 2, 1.6, [80, 220]);
    splashRing(V.x, 30, 45);
    pool(V.x, 1.5);
    await animate(0.4, (p) => {
      V.scale.y = sy * (0.25 + 0.08 * Math.sin(p * Math.PI * 2) * (1 - p));
    });
    void slowMotion(1, 0.4);
    await wait(0.4);
    // El ganador salta hacia atrás y la cámara muestra cómo quedó
    killer.animation.setAirborn(true);
    K.zIndex = groundY + 5;
    killer.animation.setAnimation('arrive');
    void moveCamera(1.7, V.x - towards * 20, groundY - 20, 0.5);
    await animate(0.4, (p) => airborne(landX - towards * 70 * p, 40 * Math.sin(p * Math.PI)));
    killer.animation.setAirborn(false);
    airborne(landX - towards * 70, 0);
    killer.animation.setAnimation('idle');
    await wait(0.9);
  };

  const acribillado = async () => {
    const jets: (() => void)[] = [];
    const hole = (lx: number, ly: number, r: number) => {
      const g = new Graphics()
        .circle(0, 0, r)
        .fill(0x5a0000)
        .circle(0, 0, r * 0.5)
        .fill(0x1a0000);
      g.position.set(lx, ly);
      g.zIndex = 1000;
      V.addChild(g);
      return g;
    };
    for (let i = 0; i < 6; i++) {
      await strike('estoc');
      if (!alive()) return;
      void sound.play('sfx', { sprite: pick(['sharp2', 'sharp4', 'sharp6', 'sharp8']) });
      const h = hole(rand(-7, 7), -bodyHeight * rand(0.25, 0.6), 2.3);
      const p = toStage(h);
      spray(p.x, p.y, 14, away(-0.2), 0.8, [90, 230]);
      flinch(3);
      void shake(2, 0.12);
      if (i % 2 === 0)
        jets.push(
          gush(
            () => toStage(h),
            () => away(-0.3) + V.rotation,
            0.35,
            0.4,
          ),
        );
    }
    await moveCamera(1.7, V.x - towards * 10, groundY - bodyHeight * 0.45, 0.3, easeOutCubic);
    timeScale = 0.4;
    await strike('estoc', 0.5);
    if (!alive()) return;
    stopSway();
    victim.animation.animationSpeed = 0;
    void sound.play('sfx', { sprite: 'sword' });
    void sound.play('sfx', { sprite: 'hammer' });
    void flashTo(0xffffff, 0.8, 0.3);
    void shake(7, 0.5);
    const big = hole(0, -bodyHeight * 0.45, 3.6);
    const bp = toStage(big);
    spray(bp.x, bp.y, 45, away(-0.1), 0.9, [160, 360]);
    jets.push(
      gush(
        () => toStage(big),
        () => away(-0.2) + V.rotation,
        1,
        0.5,
      ),
    );
    // Tiembla con los chorros saliendo...
    const x0 = V.x;
    await animate(1, (p) => {
      V.x = x0 + rand(-1.5, 1.5) * (1 - p * 0.5);
    });
    V.x = x0;
    if (!alive()) return;
    void slowMotion(1, 0.5);
    // ...cae de rodillas y se desploma de espaldas
    const edge = sideEdge(V.getLocalBounds(), towards) * 0.6;
    V.pivot.set(edge, 0);
    V.x += edge * V.scale.x;
    victim.animation.shadow.visible = false;
    groundShadow(x0, victim.animation.baseWidth * 0.4);
    const sy = V.scale.y;
    await animate(0.25, (p) => {
      V.scale.y = sy * lerp(1, 0.88, p);
    });
    await topple(V, towards * (Math.PI / 2) * 0.95);
    if (!alive()) return;
    pool(toStage(big).x, 1.2);
    await wait(0.8);
    jets.forEach((stop) => stop());
  };

  const explosion = async () => {
    for (let i = 0; i < 3; i++) {
      await strike('fist');
      if (!alive()) return;
      void sound.play('sfx', { sprite: pick(['fist1', 'fist2', 'fist3']) });
      spray(V.x, groundY - bodyHeight * 0.62, 8, away(-0.5), 1, [60, 160]);
      flinch(6);
      void shake(2.5, 0.15);
      await wait(0.15);
    }
    await moveCamera(1.6, V.x, groundY - bodyHeight * 0.5, 0.3, easeOutCubic);
    timeScale = 0.4;
    await strike('fist', 0.5);
    if (!alive()) return;
    stopSway();
    victim.animation.animationSpeed = 0;
    void sound.play('sfx', { sprite: 'hammer' });
    void flashTo(0xffffff, 0.7, 0.3);
    void shake(6, 0.4);
    // Se hincha y enrojece...
    const sx = V.scale.x;
    const sy = V.scale.y;
    const glow = new ColorOverlayFilter({ color: 0xff2000, alpha: 0 });
    V.filters = [...baseFilters, glow];
    const x0 = V.x;
    let swell = 1;
    await animate(1, (p) => {
      swell = 1 + 0.38 * easeInQuad(p) + 0.04 * Math.sin(p * 40);
      V.scale.set(sx * swell, sy * swell);
      glow.alpha = 0.6 * p;
      V.x = x0 + rand(-1, 1) * p * 2;
    });
    V.x = x0;
    if (!alive()) return;
    // ...y revienta en pedazos
    const photo = takePhoto();
    if (!photo) {
      V.scale.set(sx, sy);
      return plainDeath();
    }
    void sound.play('sfx', { sprite: 'bomb' });
    void sound.play('sfx', { sprite: 'hammer' });
    void flashTo(0xffffff, 0.95, 0.4);
    void shake(12, 0.7);
    const { frame } = photo;
    const cols = 4;
    const rows = 6;
    const cw = frame.width / cols;
    const ch = frame.height / rows;
    const center = new Point(V.x, groundY - bodyHeight * 0.5 * swell);
    const pieces: Promise<void>[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const rect = new Rectangle(frame.x + c * cw, frame.y + r * ch, cw, ch);
        if (coverage(photo, rect) < 0.18) continue;
        const { piece } = makePiece(photo, rect, { x: rect.x + cw / 2, y: rect.y + ch / 2 }, swell);
        const dx = piece.x - center.x;
        const dy = piece.y - center.y;
        const len = Math.hypot(dx, dy) || 1;
        const v = rand(140, 300);
        pieces.push(
          throwPiece(piece, {
            vx: (dx / len) * v + rand(-40, 40),
            vy: (dy / len) * v - rand(80, 200),
            spin: rand(-14, 14),
            radius: (Math.max(cw, ch) * swell) / 2,
            bleed: 0.35,
          }),
        );
      }
    }
    V.visible = false;
    spray(center.x, center.y, 110, -Math.PI / 2, Math.PI * 1.6, [80, 380]);
    splashRing(V.x, 30, 55);
    pool(V.x, 1.3);
    await wait(0.8);
    void slowMotion(1, 0.5);
    void moveCamera(1.15, V.x, groundY - 40, 0.8);
    await settle(pieces, 2.5);
  };

  const kills: Record<Kind, () => Promise<void>> = {
    decapitacion,
    partido,
    aplastado,
    acribillado,
    latigo,
    explosion,
  };
  await kills[kind]();
  if (!alive()) return;

  // ===== 4. "FATALITY" (y el nombre del remate) =====
  timeScale = 1;
  await moveCamera(1, W / 2, H / 2, 0.5);
  if (!alive()) return;
  const title = bigText('FATALITY', 60, ['#ff5a4a', '#d40000', '#5a0000']);
  title.anchor.set(0.5);
  title.position.set(W / 2, H * 0.42);
  title.alpha = 0;
  const glow = new GlowFilter({ color: 0xff1a1a, distance: 14, outerStrength: 0, innerStrength: 0, quality: 0.3 });
  title.filters = [glow];
  const subtitle = bigText(KIND_TITLES[kind], 20, ['#ffffff', '#ffd27a', '#c27a00']);
  subtitle.anchor.set(0.5);
  subtitle.position.set(W / 2, H * 0.42 + 44);
  subtitle.alpha = 0;
  const titleLayer = new Container();
  titleLayer.addChild(title, subtitle);
  screen.addChild(titleLayer);

  await animate(0.32, (p) => {
    title.scale.set(lerp(3.2, 1, easeOutBack(p)));
    title.alpha = Math.min(1, p * 2.5);
  });
  if (!alive()) return;
  // Impacto del letrero
  void sound.play('sfx', { sprite: 'bomb' });
  announce('Fatality');
  void flashTo(0xff0000, 0.45, 0.4);
  void animate(0.35, (p) => {
    camera.z = 1 + 0.06 * Math.sin(p * Math.PI);
  });
  void shake(8, 0.5);
  if (fatalityOptions.celebrate && !killer.trapped && !killer.stunned) killer.animation.setAnimation('strengthen');
  void animate(0.3, (p) => {
    subtitle.alpha = p;
    subtitle.scale.set(lerp(0.6, 1, easeOutBack(p)));
  });
  // Gotas que escurren del letrero
  const bounds = title.getLocalBounds();
  for (let i = 0; i < 7; i++) {
    const drip = new Graphics().circle(0, 0, rand(1.3, 2.2)).fill(pick(BLOOD.slice(1)));
    const x0 = title.x + rand(bounds.minX * 0.85, bounds.maxX * 0.85);
    const y0 = title.y + bounds.maxY * 0.55;
    const fall = rand(18, 45);
    drip.position.set(x0, y0);
    titleLayer.addChild(drip);
    void wait(rand(0, 0.6)).then(() =>
      animate(rand(1, 1.6), (p) => {
        if (drip.destroyed) return;
        drip.y = y0 + fall * p * p;
        drip.scale.y = 1 + 1.4 * p;
        drip.alpha = 1 - p * 0.7;
      }),
    );
  }
  // El letrero late un momento
  await animate(1.6, (p) => {
    glow.outerStrength = 2.5 + Math.sin(p * Math.PI * 4) * 1.5;
    title.scale.set(1 + Math.sin(p * Math.PI * 2) * 0.025);
  });
  if (!alive()) return;

  // ===== 5. Todo vuelve a la normalidad (los restos y la sangre se quedan) =====
  await Promise.all([
    animate(0.45, (p) => {
      titleLayer.alpha = 1 - p;
      shade.alpha = 0.6 * (1 - p);
    }),
    fadeHud(1, 0.45),
  ]);
  ticker.remove(applyCamera);
  if (!alive()) return;
  stage.pivot.set(0, 0);
  stage.position.set(0, 0);
  stage.scale.set(1);
  screen.destroy({ children: true });
  shade.destroy();
};
