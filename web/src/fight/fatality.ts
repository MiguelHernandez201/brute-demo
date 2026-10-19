// Demo: fatality al estilo Mortal Kombat cuando cae un brute (la versión completa, de cine, sale en el vídeo
// promocional). Primero "FINISH HIM!" mientras el ganador se acerca; luego un remate distinto según el arma que lleva:
//   espadas → decapitación · hachas → partido en dos · contundentes → aplastado
//   de estocada → acribillado · látigo → arrancacabezas · puños y arrojadizas → explosión
// y al final el letrero "FATALITY". Para probar una en concreto: ?fatality=aplastado (u otra).
// Todo se anima con el ticker de la pelea: se detiene con la pausa y respeta la velocidad (x1 / x2).
// En el battle royale (`royale`) solo se anima lo que les pasa a los personajes, con los sonidos del remate:
// sin letreros, voz, cámara (acercamiento ni temblor), fondo oscurecido ni destellos, porque el resto de duelos
// sigue a la vez.
import { DeathStep } from '@labrute/core';
import { sound } from '@pixi/sound';
import {
  Application,
  Container,
  FillGradient,
  Graphics,
  GraphicsContext,
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
import { stampGround } from './utils/groundLayer';
import { isHudLayer } from './utils/hud';
import { Spritesheets } from './utils/spritesheet';

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
// Para contarlo en la lista del royale: "Mazo decapitó a Brasa"
export const FATALITY_VERBS: Record<Kind, string> = {
  decapitacion: 'decapitó a',
  partido: 'partió en dos a',
  aplastado: 'aplastó a',
  acribillado: 'acribilló a',
  latigo: 'le arrancó la cabeza a',
  explosion: 'hizo explotar a',
};

const GRAVITY = 540;
const MAX_SPLATS = 240;
// En el royale puede haber muchas: menos manchas por cada una
const ROYALE_MAX_SPLATS = 140;
// Royale: los restos se desvanecen pasado un rato (la sangre del suelo se queda)
const ROYALE_REMAINS_SECONDS = 2.6;
const BLOOD = [0x4a0000, 0x7a0000, 0xa30000, 0xc81010, 0xe01818];
// Radio de los círculos de sangre compartidos (cada gota o mancha los escala a su tamaño)
const DROP_RADIUS = 4;
// Tinte de los pedazos de la explosión al salir (rojo vivo, como el cuerpo hinchado)
const HOT = 0xff6e50;
// Franja donde se busca el cuello (proporción desde lo alto de la cabeza hacia los pies)
const NECK_BAND: [number, number] = [0.34, 0.48];
// Fotograma en el que cada ataque descarga el golpe (el que dispara ':hit' en FighterHolder)
const HIT_FRAME = { slash: 5, estoc: 4, fist: 2, whip: 4 };

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)] as T;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const mixColor = (from: number, to: number, p: number) =>
  (Math.round(lerp((from >> 16) & 255, (to >> 16) & 255, p)) << 16) |
  (Math.round(lerp((from >> 8) & 255, (to >> 8) & 255, p)) << 8) |
  Math.round(lerp(from & 255, to & 255, p));
const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
const easeInQuad = (p: number) => p * p;
const easeInCubic = (p: number) => p * p * p;
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const easeOutBack = (p: number) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;

// Solo la caída del brute principal (no la de sus mascotas) se remata con fatality
export const isFatalityDeath = (fighters: AnimationFighter[], step: DeathStep) => {
  const fighter = findFighter(fighters, step.f);
  return !!fighter && fighter.type === 'brute' && !fighter.master;
};

export const fatalityKind = (killer: AnimationFighter): Kind => {
  try {
    const forced = new URLSearchParams(location.search).get('fatality');
    if (forced && forced in KIND_TITLES) return forced as Kind;
  } catch {
    /* sin URL */
  }
  return KIND_BY_WEAPON[killer.animation.weapon ?? ''] ?? 'explosion';
};

// --- Voz del anunciador (síntesis de voz del navegador) ---
// Se usa la voz masculina en inglés más natural que haya: las "Natural" de Edge, "Google UK English Male" en Chrome,
// "Daniel" en Apple… y solo se agrava un poco: con el tono al mínimo cualquier voz suena robótica y distorsionada.
const voiceNames = (names: string) => new RegExp(`\\b(${names.trim().split(/\s*,\s*/).join('|')})\\b`, 'i');
const MALE_VOICE = voiceNames(`christopher, eric, roger, guy, davis, andrew, brian, steffan, ryan, thomas, william,
  liam, daniel, arthur, aaron, gordon, oliver, alex, david, mark, george, james, richard, male`);
const FEMALE_VOICE = voiceNames(`female, zira, hazel, susan, samantha, karen, moira, tessa, fiona, victoria, allison,
  ava, jenny, aria, ana, emma, michelle, libby, sonia, maisie, natasha, clara, serena, kate, martha, nicky, zoe`);
// Las más graves dan mejor el papel; las de broma (y las robóticas antiguas) de Apple no sirven
const DEEP_VOICE = voiceNames('christopher, eric, roger, daniel, arthur, gordon');
const NOVELTY_VOICE = voiceNames(`albert, bad news, bahh, bells, boing, bubbles, cellos, deranged, good news,
  hysterical, jester, organ, superstar, trinoids, whisper, wobble, zarvox, fred, ralph, junior, kathy, princess`);

let announcerVoice: SpeechSynthesisVoice | null | undefined;
const pickAnnouncerVoice = () => {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return undefined; // todavía cargando: se vuelve a intentar en el próximo anuncio
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const voice of voices) {
    const lang = voice.lang.toLowerCase().replace('_', '-');
    if (!lang.startsWith('en')) continue;
    let score = lang === 'en-us' || lang === 'en-gb' ? 5 : 0;
    if (/natural|neural|premium|enhanced/i.test(voice.name)) score += 40;
    if (/google/i.test(voice.name)) score += 15;
    if (FEMALE_VOICE.test(voice.name)) score -= 30;
    else if (MALE_VOICE.test(voice.name)) score += 30;
    if (DEEP_VOICE.test(voice.name)) score += 8;
    if (NOVELTY_VOICE.test(voice.name)) score -= 100;
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
};
try {
  // Chrome entrega la lista de voces más tarde: cuando llega se vuelve a elegir
  speechSynthesis.addEventListener('voiceschanged', () => {
    announcerVoice = undefined;
  });
  speechSynthesis.getVoices();
} catch {
  /* sin síntesis de voz */
}

// Solo si los efectos están activos. Un `rate` menor que 1 alarga la palabra, como el anunciador del juego
export const announce = (text: string, rate: number) => {
  try {
    if (!sound.exists('sfx') || !sound.volume('sfx') || !('speechSynthesis' in window)) return;
    if (announcerVoice === undefined) announcerVoice = pickAnnouncerVoice();
    const line = new SpeechSynthesisUtterance(text);
    line.lang = announcerVoice?.lang ?? 'en-US';
    if (announcerVoice) line.voice = announcerVoice;
    line.pitch = 0.75;
    line.rate = rate;
    line.volume = 1;
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    speechSynthesis.speak(line);
  } catch {
    /* sin síntesis de voz */
  }
};

// Letrero grande al estilo del juego (degradado, contorno y sombra)
export const bigText = (text: string, fontSize: number, colors: [string, string, string]) =>
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

// Muñón rojo del corte con un pequeño hueso en el centro (`k` lo agranda con el Súper gigante)
const stump = (rx: number, k = 1) =>
  new Graphics()
    .ellipse(0, 0, rx, 2.5 * k)
    .fill(0x5a0000)
    .ellipse(0, -0.2 * k, rx * 0.7, 1.5 * k)
    .fill(0xc81010)
    .ellipse(0, -0.2 * k, Math.max(1.2 * k, rx * 0.28), 0.75 * k)
    .fill(0xf2e8dc);

// Foto del perdedor (en sus coordenadas locales, sin escala ni volteo) para partirlo en piezas
type Photo = {
  tex: Texture;
  frame: Rectangle;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  res: number;
  pixels: Uint8ClampedArray | Uint8Array;
  pw: number;
  ph: number;
};
const opaque = (photo: Photo, lx: number, ly: number) => {
  const x = Math.round((lx - photo.frame.x) * photo.res);
  const y = Math.round((ly - photo.frame.y) * photo.res);
  if (x < 0 || y < 0 || x >= photo.pw || y >= photo.ph) return false;
  return (photo.pixels[(y * photo.pw + x) * 4 + 3] ?? 0) > 110;
};

export const fatality = async (
  app: Application,
  spritesheets: Spritesheets,
  fighters: AnimationFighter[],
  step: DeathStep,
  speed: React.RefObject<number>,
  // Battle royale: quién remata (el último que lo golpeó), versión sin cine y aviso en el golpe final
  royale?: { killer: AnimationFighter; onImpact?: () => void },
) => {
  const cinematic = !royale;
  const victim = findFighter(fighters, step.f);
  const killer = royale?.killer
    ?? fighters.find((f) => f.type === 'brute' && !f.master && f.team !== victim?.team && !f.dead);
  const { stage, ticker } = app;
  if (!victim || !killer || !stage || !ticker) {
    death(fighters, step, speed, !cinematic);
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
  // Súper gigante: el dibujo es más grande, así que las medidas fijas en píxeles crecen con él
  const giant = victim.animation.giantScale || 1;
  const killerGiant = killer.animation.giantScale || 1;
  // Cámara lenta: afecta a la sangre y a las piezas mientras dura
  let timeScale = 1;
  const elapsed = (tk: Ticker) => (Math.min(tk.elapsedMS, 50) / 1000) * speed.current;
  // A x2 el anunciador también habla algo más deprisa
  const voiceRate = (rate: number) => rate * (speed.current > 1 ? 1.15 : 1);
  // Efectos de sonido (también en el royale: el remate suena)
  const sfx = (sprite: string) => {
    void sound.play('sfx', { sprite });
  };
  // Royale: restos (piezas y sus sombras) que se desvanecen al final, y fotos cuya textura se libera después
  const remains: Container[] = [];
  const photos: Photo[] = [];

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
  // Royale: la cámara no se toca (ni acercamientos ni temblores)
  if (cinematic) ticker.add(applyCamera);
  const shake = (intensity: number, seconds: number) => {
    if (!cinematic) return Promise.resolve();
    return animate(seconds, (p) => {
      camera.shake = intensity * (1 - p);
    });
  };
  // Con un Súper gigante en escena se acerca menos, para que quepa en el encuadre
  const moveCamera = (z: number, fx: number, fy: number, seconds: number, ease = easeInOutCubic) => {
    if (!cinematic) return Promise.resolve();
    const from = { ...camera };
    const to = 1 + (z - 1) / Math.max(giant, killerGiant);
    return animate(seconds, (p) => {
      const e = ease(p);
      camera.z = lerp(from.z, to, e);
      camera.fx = lerp(from.fx, fx, e);
      camera.fy = lerp(from.fy, fy, e);
    });
  };

  // --- Capas: fondo oscurecido (bajo los luchadores) y destello (encima de todo) ---
  const shade = new Graphics().rect(0, 0, W, H).fill(0x120000);
  shade.alpha = 0;
  shade.zIndex = -0.5;
  shade.eventMode = 'none';
  const flash = new Graphics().rect(0, 0, W, H).fill(0xffffff);
  flash.alpha = 0;
  screen.addChild(flash);
  if (cinematic) stage.addChild(shade, screen);
  // El destello marca el golpe final. En el royale no hay destello: se avisa (una vez) para que reaccionen
  // los que están cerca
  let impacted = false;
  const flashTo = (color: number, alpha: number, seconds: number) => {
    if (!cinematic) {
      if (!impacted) royale?.onImpact?.();
      impacted = true;
      return Promise.resolve();
    }
    flash.clear().rect(0, 0, W, H).fill(color);
    return animate(seconds, (p) => {
      flash.alpha = alpha * (1 - p);
    });
  };
  const fadeShade = (to: number, seconds: number) => {
    if (!cinematic) return Promise.resolve();
    const from = shade.alpha;
    return animate(seconds, (p) => {
      shade.alpha = lerp(from, to, p);
    });
  };

  // El HUD superior se aparta mientras dura la fatality
  const hud = stage.children.filter((c) => isHudLayer(c.zIndex) && !fighters.some((f) => f.animation.container === c));
  const hudAlpha = new Map(hud.map((c) => [c, c.alpha]));
  const fadeHud = (to: number, seconds: number) => {
    if (!cinematic) return Promise.resolve();
    const from = new Map(hud.map((c) => [c, c.alpha]));
    return animate(seconds, (p) => {
      hud.forEach((c) => {
        if (!c.destroyed) c.alpha = lerp(from.get(c) ?? 1, to * (hudAlpha.get(c) ?? 1), p);
      });
    });
  };

  // --- Sangre: gotas con gravedad que se estiran con la velocidad y dejan manchas en el suelo ---
  // Todas comparten un círculo ya dibujado por color y solo cambian de escala: cientos de gotas
  // no crean cientos de dibujos nuevos, y la animación no se traba en móviles
  const dropShapes = new Map(
    BLOOD.map((color) => [color, new GraphicsContext().circle(0, 0, DROP_RADIUS).fill(color)]),
  );
  const splatShapes = new Map(
    BLOOD.map((color) => [color, new GraphicsContext().circle(0, 0, DROP_RADIUS).fill({ color, alpha: 0.86 })]),
  );
  type Drop = { g: Graphics; vx: number; vy: number; ground: number; r: number; color: number };
  const drops: Drop[] = [];
  let splats = 0;
  const groundY = V.y;
  const splat = (x: number, y: number, r: number, color: number) => {
    if (splats >= (cinematic ? MAX_SPLATS : ROYALE_MAX_SPLATS)) return;
    splats += 1;
    const g = new Graphics(splatShapes.get(color));
    g.scale.set((r * rand(1.8, 3.5)) / DROP_RADIUS, (r * rand(0.45, 0.85)) / DROP_RADIUS);
    g.position.set(x, y);
    // Se pinta una vez en la capa del suelo (ver groundLayer): miles de manchas no pesan en cada fotograma
    stampGround(app, g);
  };
  // El ticker de las gotas solo corre mientras hay alguna en el aire (en el royale caen varias fatalities)
  let dropsTicking = false;
  const updateDrops = (dt: number) => {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i] as Drop;
      d.vy += GRAVITY * dt;
      d.g.x += d.vx * dt;
      d.g.y += d.vy * dt;
      const speedLen = Math.hypot(d.vx, d.vy);
      const size = d.r / DROP_RADIUS;
      d.g.rotation = Math.atan2(d.vy, d.vx);
      d.g.scale.set(size * clamp(1 + speedLen / 240, 1, 2.3), size * clamp(1 - speedLen / 750, 0.55, 1));
      if (d.vy > 0 && d.g.y >= d.ground) {
        splat(d.g.x, d.ground, d.r, d.color);
        d.g.destroy();
        drops.splice(i, 1);
      }
    }
    dropsTicking = drops.length > 0;
    return dropsTicking;
  };
  // Chorro de sangre en una dirección (ángulo en radianes: 0 = derecha, -π/2 = arriba)
  const spray = (x: number, y: number, count: number, angle: number, cone: number, velocity: [number, number]) => {
    for (let i = 0; i < count; i++) {
      const r = rand(0.9, 2.5);
      const color = pick(BLOOD);
      const a = angle + rand(-cone / 2, cone / 2);
      const v = rand(velocity[0], velocity[1]);
      const g = new Graphics(dropShapes.get(color));
      g.scale.set(r / DROP_RADIUS);
      g.position.set(x + rand(-2, 2), y + rand(-2, 2));
      g.zIndex = 1500;
      g.eventMode = 'none';
      stage.addChild(g);
      drops.push({ g, r, color, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ground: groundY + rand(-6, 10) });
      if (!dropsTicking) {
        dropsTicking = true;
        every(updateDrops);
      }
    }
  };
  // Chorro a latidos desde un punto que puede moverse; devuelve la función que lo corta
  const gush = (point: () => Point, angle: () => number, strength = 1, cone = 0.55) => {
    let t = 0;
    let on = true;
    every((dt) => {
      if (!on) return false;
      t += dt;
      const beat = 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * 2.4));
      const fade = Math.max(0.25, 1 - t / 3.5);
      const amount = 95 * strength * beat * fade * dt;
      const count = Math.floor(amount) + (Math.random() < amount % 1 ? 1 : 0);
      if (count) {
        const p = point();
        spray(p.x, p.y, count, angle(), cone, [65 + 90 * strength, 70 + 240 * fade * strength]);
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
      const d = rand(radius * 0.25, radius);
      splat(x + Math.cos(a) * d, groundY + Math.sin(a) * d * 0.22, rand(1, 2.6), pick(BLOOD));
    }
  };
  // Charco que crece
  const pool = (x: number, size = 1) => {
    const g = new Graphics()
      .ellipse(0, 0, 26 * size, 5.5 * size)
      .fill({ color: 0x580000, alpha: 0.92 })
      .ellipse(-3 * size, -0.5, 16 * size, 3.2 * size)
      .fill({ color: 0x8a0000, alpha: 0.85 });
    g.position.set(x, groundY + 2);
    g.zIndex = 1.5;
    g.scale.set(0.15);
    g.eventMode = 'none';
    stage.addChild(g);
    // Crece y, ya quieto, pasa a la capa del suelo
    void animate(1.8, (p) => {
      if (!g.destroyed) g.scale.set(lerp(0.15, 1, easeOutCubic(p)));
    }).then(() => {
      if (!g.destroyed) stampGround(app, g);
    });
  };
  const groundShadow = (x: number, width: number) => {
    const g = new Graphics().ellipse(0, 0, width, 4.2).fill({ color: 0, alpha: 0.36 });
    g.position.set(x, groundY + 1);
    g.zIndex = 1;
    g.eventMode = 'none';
    stage.addChild(g);
    remains.push(g);
    return g;
  };

  // Onda de choque en el suelo (para impactos fuertes y explosiones)
  const shockwave = (x: number, y: number, maxRadius: number, color = 0xffffff, duration = 0.35) => {
    const ring = new Graphics();
    ring.position.set(x, y);
    ring.zIndex = 1580;
    ring.eventMode = 'none';
    stage.addChild(ring);
    void animate(duration, (p) => {
      if (ring.destroyed) return;
      const r = lerp(4, maxRadius, easeOutCubic(p));
      ring
        .clear()
        .ellipse(0, 0, r, r * 0.35)
        .stroke({ width: Math.max(1, 5 * (1 - p)), color, alpha: 1 - p });
    }).then(() => ring.destroy());
  };

  // Estela luminosa de un corte o estocada
  const slashFx = (x: number, y: number, angle: number, length: number, thickness: number) => {
    const g = new Graphics()
      .poly([-length / 2, 0, 0, -thickness / 2, length / 2, 0, 0, thickness / 2])
      .fill(0xffffff)
      .poly([-length * 0.35, 0, 0, -thickness * 0.25, length * 0.35, 0, 0, thickness * 0.25])
      .fill(0xfff2b2);
    g.position.set(x, y);
    g.rotation = angle;
    g.zIndex = 1600;
    g.eventMode = 'none';
    g.filters = [new GlowFilter({ color: 0xff2222, distance: 9, outerStrength: 2.8, innerStrength: 0, quality: 0.25 })];
    stage.addChild(g);
    void animate(0.26, (p) => {
      if (g.destroyed) return;
      g.scale.set(Math.min(1, p * 5.5), 1 - p * 0.75);
      g.alpha = p < 0.25 ? 1 : 1 - (p - 0.25) / 0.75;
    }).then(() => g.destroy());
  };

  // Del ganador hacia el perdedor. Si por ese lado no cabe (perdedor contra un borde, algo que en el royale pasa),
  // remata desde el otro
  const reach = kind === 'latigo' ? 105 : 45;
  const fits = (side: number) => V.x - side * reach >= 16 && V.x - side * reach <= W - 16;
  const natural = Math.sign(V.x - K.x) || 1;
  const towards = fits(natural) ? natural : -natural;
  const bodyHeight = victim.animation.baseHeight * 0.82;
  const killerHeight = killer.animation.baseHeight * 0.82;
  const baseScaleX = V.scale.x;
  const baseScaleY = V.scale.y;
  // Donde está el perdedor: los retrocesos de los golpes siempre vuelven aquí (aunque se encadenen)
  const victimX = V.x;
  // Ángulo pensado para el lado derecho, reflejado si el perdedor está a la izquierda
  const away = (angle: number) => (towards > 0 ? angle : Math.PI - angle);
  const toStage = (c: Container, x = 0, y = 0) => stage.toLocal(c.toGlobal(new Point(x, y)));
  // El perdedor se tambalea mareado hasta el golpe final (ver "FINISH HIM!")
  let swaying = true;

  // Animación de impacto del perdedor: los brutes varones tienen tres y ninguna 'hit' (con ella el cuerpo
  // desaparecería); las mujeres solo 'hit'. Sin género se dibujan como varones.
  const hitAnimation = () =>
    victim.gender === 'female' ? 'hit' : (`hit-${Math.floor(Math.random() * 3)}` as 'hit-0' | 'hit-1' | 'hit-2');

  // Encaja el golpe final: la animación de impacto se reproduce una vez y se queda en su último fotograma
  // (congelar el primero dejaría fijas las marcas blancas del impacto)
  const recoil = () => {
    victim.animation.animationSpeed = 1;
    victim.animation.setAnimation(hitAnimation());
  };

  // El perdedor reproduce su animación de impacto, se tiñe de rojo un instante y retrocede;
  // al acabar el impacto vuelve a tambalearse mareado
  const baseFilters = V.filters ? [...V.filters] : [];
  const flinch = (push = 5) => {
    const hitAnim = hitAnimation();
    victim.animation.animationSpeed = 1.3;
    victim.animation.setAnimation(hitAnim);
    victim.animation.once(`${hitAnim}:end`, () => {
      if (!swaying || V.destroyed || victim.animation.animation !== hitAnim) return;
      victim.animation.animationSpeed = 0.45;
      victim.animation.setAnimation('idle');
    });
    V.filters = [...baseFilters, new ColorOverlayFilter({ color: 0xff1010, alpha: 0.55 })];
    void wait(0.1).then(() => {
      if (!V.destroyed) V.filters = baseFilters;
    });
    void animate(0.14, (p) => {
      V.x = victimX + towards * push * Math.sin(p * Math.PI);
    });
  };

  // El ganador ataca con una animación y se espera al momento del golpe
  const strike = async (animation: keyof typeof HIT_FRAME, animationSpeed = 1) => {
    const hit = killer.animation.waitForEvent(`${animation}:hit`, 1500);
    const end = killer.animation.waitForEvent(`${animation}:end`, 2500);
    killer.animation.animationSpeed = animationSpeed;
    killer.animation.setAnimation(animation);
    // A más de x1 la animación avanza a saltos y puede pasar por encima del fotograma del golpe: el evento
    // no llegaría y todo se quedaría esperando. Como mucho se espera lo que tarda en llegar a ese fotograma
    // (uno cada 1/30 s de pelea, más el primero)
    const frames = Math.ceil(HIT_FRAME[animation] / Math.max(0.1, killer.animation.animationSpeed)) + 2;
    await Promise.race([hit, wait(frames / 30)]);
    killer.animation.animationSpeed = 1;
    void end.then(() => {
      if (!K.destroyed && killer.animation.animation === animation) killer.animation.setAnimation('idle');
    });
  };
  // Golpe final: la cámara se acerca mientras el ganador lo carga, y la sangre y el mareo van a cámara lenta
  const finalStrike = async (
    animation: keyof typeof HIT_FRAME,
    zoom: number,
    fx: number,
    fy: number,
    animationSpeed = 0.7,
  ) => {
    void moveCamera(zoom, fx, fy, 0.28, easeOutCubic);
    // Royale: a velocidad normal, como el resto de la arena
    if (cinematic) timeScale = 0.4;
    await strike(animation, animationSpeed);
  };

  // --- Fotos y piezas del perdedor ---
  // Por defecto la foto se toma en reposo (fotograma 0), donde el cuello se encuentra bien; el cambio de pose
  // queda tapado por el destello del golpe. Con `keepPose` se congela la pose actual.
  const takePhoto = (keepPose = false): Photo | null => {
    if (!keepPose) victim.animation.setAnimation('idle', 0);
    victim.animation.pause();
    V.filters = baseFilters;
    const shadow = victim.animation.shadow;
    const prevShadowVis = shadow.visible;
    shadow.visible = false;

    // Se fotografía sin la transformación de V (las piezas la vuelven a aplicar)
    const saved = { x: V.x, y: V.y, sx: V.scale.x, sy: V.scale.y, rotation: V.rotation, px: V.pivot.x, py: V.pivot.y };
    const restore = () => {
      V.position.set(saved.x, saved.y);
      V.scale.set(saved.sx, saved.sy);
      V.rotation = saved.rotation;
      V.pivot.set(saved.px, saved.py);
    };
    V.position.set(0, 0);
    V.scale.set(1, 1);
    V.rotation = 0;
    V.pivot.set(0, 0);

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
      restore();
      const photo: Photo = {
        tex,
        frame,
        minX: lb.minX,
        maxX: lb.maxX,
        minY: lb.minY,
        maxY: lb.maxY,
        res,
        pixels,
        pw: width,
        ph: height,
      };
      photos.push(photo);
      return photo;
    } catch (e) {
      console.warn('fatality: sin foto del perdedor', e);
      restore();
      shadow.visible = prevShadowVis;
      return null;
    }
  };

  // Si no hay foto, muerte normal
  const plainDeath = () => {
    V.visible = true;
    V.filters = baseFilters;
    victim.animation.shadow.visible = true;
    victim.animation.animationSpeed = 1;
    victim.animation.play();
    death(fighters, step, speed, !cinematic);
  };

  // Cuello: la fila más angosta de la silueta (cerca del eje del cuerpo) dentro de la franja esperada,
  // y la caja real de la cabeza por encima
  const findNeck = (photo: Photo) => {
    const top = Math.max(photo.frame.y + 2, -victim.animation.baseHeight * 1.08);
    const yStart = top * (1 - NECK_BAND[0]);
    const yEnd = top * (1 - NECK_BAND[1]);
    let best = { count: Infinity, y: (yStart + yEnd) / 2, x: 0, half: 4.8 * giant };
    for (let y = yStart; y <= yEnd; y += 1 / photo.res) {
      let count = 0;
      let x0 = Infinity;
      let x1 = -Infinity;
      // Solo cerca del eje central, para no contar los brazos
      for (let x = -18 * giant; x <= 18 * giant; x += 1 / photo.res) {
        if (!opaque(photo, x, y)) continue;
        count += 1;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
      if (count > 0 && count < best.count) {
        best = {
          count,
          y,
          x: clamp((x0 + x1) / 2, -6 * giant, 6 * giant),
          half: clamp((x1 - x0) / 2 + 0.5, 3.6 * giant, 6.5 * giant),
        };
      }
    }
    let hx0 = Infinity;
    let hx1 = -Infinity;
    let hy0 = Infinity;
    for (let y = photo.frame.y; y < best.y; y += 1) {
      for (let x = photo.frame.x; x < photo.frame.x + photo.frame.width; x += 1) {
        if (!opaque(photo, x, y)) continue;
        hx0 = Math.min(hx0, x);
        hx1 = Math.max(hx1, x);
        hy0 = Math.min(hy0, y);
      }
    }
    if (!Number.isFinite(hx0)) {
      hx0 = photo.frame.x;
      hx1 = photo.frame.x + photo.frame.width;
      hy0 = photo.frame.y;
    }
    const headTop = Math.max(photo.frame.y, Math.floor(hy0) - 2);
    const headRect = new Rectangle(
      Math.max(photo.frame.x, Math.floor(hx0) - 2),
      headTop,
      Math.min(photo.frame.width, Math.ceil(hx1 - hx0) + 4),
      Math.max(4, best.y - headTop),
    );
    return { ...best, headRect };
  };

  // Tramos opacos verticales en la columna `x` (el corte rojo no rellena el aire entre las piernas)
  const columnOpaqueSegments = (photo: Photo, x: number) => {
    const segments: { y0: number; y1: number }[] = [];
    let currentStart: number | null = null;
    for (let y = photo.frame.y; y < photo.frame.y + photo.frame.height; y += 1 / photo.res) {
      const isOpaque = opaque(photo, x, y) || opaque(photo, x - 1, y) || opaque(photo, x + 1, y);
      if (isOpaque && currentStart === null) {
        currentStart = y;
      } else if (!isOpaque && currentStart !== null) {
        if (y - currentStart > 1.5) segments.push({ y0: currentStart, y1: y });
        currentStart = null;
      }
    }
    if (currentStart !== null) segments.push({ y0: currentStart, y1: photo.frame.y + photo.frame.height });
    return segments;
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

  // Pieza recortada de la foto, colocada exactamente sobre V y que gira alrededor de `pivot` (coords. locales).
  // Con `tornEdges` el recorte tiene bordes irregulares, de carne desgarrada, en vez de rectos.
  const makePiece = (photo: Photo, rect: Rectangle, pivot: { x: number; y: number }, tornEdges = false) => {
    const sx = V.scale.x;
    const sy = V.scale.y;
    const inner = new Container();
    inner.scale.set(sx, sy);

    const rx = clamp(rect.x, photo.frame.x, photo.frame.x + photo.frame.width - 1);
    const ry = clamp(rect.y, photo.frame.y, photo.frame.y + photo.frame.height - 1);
    const rw = Math.max(1, Math.min(rect.width, photo.frame.x + photo.frame.width - rx));
    const rh = Math.max(1, Math.min(rect.height, photo.frame.y + photo.frame.height - ry));

    const sprite = new Sprite(
      new Texture({
        source: photo.tex.source,
        frame: new Rectangle(rx - photo.frame.x, ry - photo.frame.y, rw, rh),
      }),
    );
    sprite.position.set(rx - pivot.x, ry - pivot.y);
    inner.addChild(sprite);

    if (tornEdges) {
      const pts: number[] = [];
      const sides = 9;
      const cx = rx - pivot.x + rw / 2;
      const cy = ry - pivot.y + rh / 2;
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * Math.PI * 2;
        const rad = rand(0.5, 0.68);
        pts.push(cx + Math.cos(ang) * rw * rad, cy + Math.sin(ang) * rh * rad);
      }
      const mask = new Graphics().poly(pts).fill(0xffffff);
      inner.addChild(mask);
      sprite.mask = mask;
    }

    const piece = new Container();
    piece.addChild(inner);
    piece.position.set(V.x + pivot.x * sx, V.y + pivot.y * sy);
    piece.zIndex = V.y;
    piece.eventMode = 'none';
    stage.addChild(piece);
    remains.push(piece);
    // Convierte coordenadas locales del perdedor a las de la pieza
    const at = (x: number, y: number) => new Point(x - pivot.x, y - pivot.y);
    return { piece, inner, sprite, at };
  };

  // Pieza que sale volando: rebota (con su sombra) y rueda; se resuelve al quedar quieta.
  // `radius` es su medio tamaño real: así se apoya en el suelo sin hundirse ni flotar
  const throwPiece = (
    piece: Container,
    o: { vx: number; vy: number; spin: number; radius: number; bleed?: number; noisy?: boolean; hasShadow?: boolean },
  ) =>
    new Promise<void>((resolve) => {
      const ground = groundY - o.radius * 0.8;
      let { vx, vy, spin } = o;
      let grounded = false;
      piece.zIndex = 1500;
      const pieceShadow = o.hasShadow ? groundShadow(piece.x, o.radius * 0.95) : null;
      every((dt) => {
        if (piece.destroyed) {
          pieceShadow?.destroy();
          resolve();
          return false;
        }
        if (pieceShadow && !pieceShadow.destroyed) {
          pieceShadow.x = piece.x;
          const s = clamp(1 - Math.max(0, ground - piece.y) / 180, 0.3, 1);
          pieceShadow.scale.set(s, s);
          pieceShadow.alpha = 0.36 * s;
        }
        if (!grounded) {
          vy += GRAVITY * dt;
          piece.x += vx * dt;
          piece.y += vy * dt;
          piece.rotation += spin * dt;
          if (o.bleed && Math.random() < o.bleed) spray(piece.x, piece.y, 1, Math.PI / 2, 1, [10, 45]);
          if (piece.x < 14 || piece.x > W - 14) {
            piece.x = clamp(piece.x, 14, W - 14);
            vx = -vx * 0.5;
          }
          if (vy > 0 && piece.y >= ground) {
            piece.y = ground;
            if (o.bleed) spray(piece.x, groundY - 2, 6, -Math.PI / 2, 2.3, [25, 85]);
            if (vy > 85) {
              if (o.noisy) sfx('blunt1');
              vy = -vy * 0.36;
              vx *= 0.68;
              spin *= 0.6;
            } else {
              grounded = true;
              piece.zIndex = groundY + 1;
            }
          }
          return true;
        }
        // Rodando por el suelo
        piece.x = clamp(piece.x + vx * dt, 14, W - 14);
        piece.rotation += (vx / Math.max(5, o.radius)) * dt;
        vx *= Math.max(0, 1 - 2.6 * dt);
        if (o.bleed && Math.random() < 0.25) splat(piece.x, groundY + rand(-1, 3), rand(0.8, 1.6), pick(BLOOD));
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

  // Una pieza cae girando, cada vez más deprisa, hasta quedar al ras del suelo y rebota
  const topple = async (c: Container, to: number, seconds = 0.36, dropToGround = 5) => {
    const fromRot = c.rotation;
    const fromY = c.y;
    await animate(seconds, (p) => {
      c.rotation = lerp(fromRot, to, easeInCubic(p));
      c.y = lerp(fromY, groundY - 1 + dropToGround, easeInQuad(p));
    });
    sfx('blunt3');
    void shake(5, 0.28);
    await animate(0.14, (p) => {
      c.rotation = to - Math.sign(to) * 0.055 * Math.sin(p * Math.PI);
    });
  };

  // ===== 1. "FINISH HIM!": el perdedor queda desarmado y mareado; el ganador se acerca mientras tanto =====
  untrap(app, spritesheets, killer);
  untrap(app, spritesheets, victim);
  killer.stunned = false;
  // Sin arma ni escudo, para que no queden flotando al cortarlo
  victim.animation.weapon = null;
  victim.animation.shield = false;
  killer.animation.setAnimation('idle');
  victim.animation.setAnimation('idle');
  victim.animation.animationSpeed = 0.45;

  // Estrellas de mareo girando sobre la cabeza del perdedor
  const dizzyStars = new Container();
  dizzyStars.zIndex = 1520;
  dizzyStars.eventMode = 'none';
  stage.addChild(dizzyStars);
  const starNodes: Graphics[] = [];
  for (let s = 0; s < 4; s++) {
    const star = new Graphics()
      .star(0, 0, 5, 3.8 * giant, 1.7 * giant)
      .fill(0xffe04a)
      .stroke({ width: 0.8, color: 0x7a4200 });
    dizzyStars.addChild(star);
    starNodes.push(star);
  }
  let swayTime = 0;
  every((dt) => {
    if (!swaying) return false;
    swayTime += dt;
    V.rotation = Math.sin(swayTime * 3.8) * 0.065;
    V.scale.set(baseScaleX, baseScaleY * (1 - 0.028 * Math.abs(Math.sin(swayTime * 3.8))));
    if (!dizzyStars.destroyed) {
      dizzyStars.position.set(V.x + Math.sin(swayTime * 3.8) * 4 * giant, groundY - bodyHeight * 1.02);
      starNodes.forEach((st, idx) => {
        const ang = swayTime * 4.2 + (idx * Math.PI) / 2;
        st.position.set(Math.cos(ang) * 14 * giant, Math.sin(ang) * 4.2 * giant);
        const depth = 0.75 + 0.25 * Math.sin(ang);
        st.scale.set(depth);
        st.alpha = depth;
      });
    }
    return true;
  });
  const stopSway = () => {
    if (!swaying) return;
    swaying = false;
    V.rotation = 0;
    V.scale.set(baseScaleX, baseScaleY);
    if (!dizzyStars.destroyed) dizzyStars.destroy({ children: true });
  };

  // El ganador se pone de cara y se acerca (con el látigo se queda a distancia)
  K.scale.x = Math.abs(K.scale.x) * towards;
  // Distancia por el lado desde el que remata (negativa si está al otro lado)
  const gap = (V.x - K.x) * towards;
  const targetX =
    kind === 'latigo'
      ? gap >= 80 && gap <= 140
        ? K.x
        : V.x - towards * 105
      : clamp(V.x - towards * Math.max(kind === 'acribillado' ? 42 : 32, getHitDistance(killer, victim) * 0.8), 16, W - 16);
  const approach = async () => {
    const start = { x: K.x, y: K.y };
    const distance = Math.hypot(targetX - start.x, groundY + 1 - start.y);
    if (distance <= 4) return;
    killer.animation.setAnimation('run');
    await animate(clamp(distance / 320, 0.15, 0.75), (p) => {
      K.x = lerp(start.x, targetX, p);
      K.y = lerp(start.y, groundY + 1, p);
    });
    if (alive()) killer.animation.setAnimation('idle');
  };

  const finishHim = async () => {
    void fadeHud(0, 0.25);
    void fadeShade(0.62, 0.4);
    void moveCamera(1.25, (V.x + targetX) / 2, groundY - 40, 0.5);
    sfx('hammer');
    // La voz tarda un poco en arrancar: se pide a la vez que aparece el letrero
    announce(victim.gender === 'female' ? 'Finish her!' : 'Finish him!', voiceRate(0.85));
    const finish = bigText(victim.gender === 'female' ? 'FINISH HER!' : 'FINISH HIM!', 40, [
      '#fff3a0',
      '#ff8a00',
      '#a31000',
    ]);
    finish.anchor.set(0.5);
    finish.position.set(W / 2, H * 0.3);
    finish.alpha = 0;
    screen.addChild(finish);
    await animate(0.22, (p) => {
      finish.scale.set(lerp(2.6, 1, easeOutBack(p)));
      finish.alpha = Math.min(1, p * 2.5);
    });
    void shake(5, 0.35);
    const approached = approach();
    await animate(0.5, (p) => {
      finish.scale.set(1 + Math.sin(p * Math.PI * 2) * 0.03);
    });
    await animate(0.18, (p) => {
      finish.alpha = 1 - p;
    });
    finish.destroy();
    await approached;
  };
  // Royale: sin letrero ni voz. El perdedor se tambalea mareado mientras el ganador llega corriendo
  if (cinematic) await finishHim();
  else await Promise.all([approach(), wait(0.35)]);
  if (!alive()) return;

  // ===== 2. El remate =====

  // Cabeza fuera: hacia delante (espada) o hacia el ganador (látigo); el cuerpo sangra y cae al ras del suelo
  const behead = async (headDir: 1 | -1, onHead?: (head: Container) => void) => {
    const photo = takePhoto();
    if (!photo) return plainDeath();
    const neck = findNeck(photo);
    const { frame } = photo;
    const { headRect } = neck;
    const fallDir = headDir === 1 ? towards : -towards;

    // El cuerpo gira sobre los tobillos (y = -3) para quedar tumbado en el suelo, sin flotar
    const body = makePiece(photo, new Rectangle(frame.x, neck.y, frame.width, frame.y + frame.height - neck.y), {
      x: neck.x,
      y: -3,
    });
    const bodyStump = stump(neck.half, giant);
    bodyStump.position.copyFrom(body.at(neck.x, neck.y));
    const neckMark = new Container();
    neckMark.position.copyFrom(body.at(neck.x, neck.y));
    body.inner.addChild(bodyStump, neckMark);

    const head = makePiece(photo, headRect, {
      x: headRect.x + headRect.width / 2,
      y: headRect.y + headRect.height / 2,
    });
    const headStump = stump(neck.half * 0.9, giant);
    headStump.position.copyFrom(head.at(neck.x, neck.y - 0.5));
    head.inner.addChild(headStump);

    V.visible = false;
    const shadow = groundShadow(V.x, victim.animation.baseWidth * 0.36);

    const neckAt = () => toStage(neckMark);
    const n = neckAt();
    if (headDir === 1) slashFx(n.x, n.y, towards * 0.06, 92 * giant, 7.5);
    spray(n.x, n.y, 45, -Math.PI / 2 + headDir * towards * 0.3, 0.85, [170, 340]);

    const landed = throwPiece(head.piece, {
      vx: headDir === 1 ? towards * rand(80, 115) : -towards * rand(135, 175),
      vy: -rand(headDir === 1 ? 235 : 175, headDir === 1 ? 285 : 215),
      spin: headDir * towards * rand(7.5, 10.5),
      radius: Math.max(4 * giant, Math.min(headRect.width, headRect.height) / 2 - 1),
      bleed: 0.75,
      noisy: true,
      hasShadow: true,
    });
    onHead?.(head.piece);
    const stopGush = gush(neckAt, () => -Math.PI / 2 + body.piece.rotation);

    // Cámara lenta un instante mientras la cabeza sale disparada; luego el cuerpo se desploma
    await wait(0.45);
    if (!alive()) return;
    void slowMotion(1, 0.35);
    void moveCamera(1.35, clamp((V.x + head.piece.x) / 2, 80, W - 80), groundY - 30, 0.6);
    void animate(0.5, (p) => {
      shadow.scale.x = 1 + p * 0.85;
      shadow.x = V.x + fallDir * p * 24;
    });
    await topple(body.piece, fallDir * (Math.PI / 2) * 0.96, 0.36, -2);
    if (!alive()) return;
    const down = neckAt();
    spray(down.x, groundY, 16, -Math.PI / 2, 2.5, [35, 115]);
    pool(down.x + fallDir * 6);
    await settle([landed], 0.3);
    // El cuello sigue sangrando un poco más, ya con el letrero en pantalla
    void wait(0.8).then(stopGush);
  };

  const decapitacion = async () => {
    for (const cut of [
      { y: 0.52, angle: -0.55 },
      { y: 0.38, angle: 0.5 },
    ]) {
      await strike('slash', 1.7);
      if (!alive()) return;
      const cy = groundY - bodyHeight * cut.y;
      sfx(pick(['sharp1', 'sharp3', 'sharp5', 'sword']));
      slashFx(V.x, cy, cut.angle, 54 * giant, 5.5);
      spray(V.x, cy, 22, away(-0.4), 1.2, [75, 215]);
      flinch(6);
      void shake(3.2, 0.18);
      await wait(0.08);
    }
    await finalStrike('slash', 1.85, V.x - towards * 12, groundY - bodyHeight * 0.52);
    if (!alive()) return;
    stopSway();
    sfx('broadsword1');
    sfx('hammer');
    void flashTo(0xffffff, 0.9, 0.25);
    void shake(7.5, 0.45);
    await behead(1);
  };

  const latigo = async () => {
    await strike('whip', 1.4);
    if (!alive()) return;
    sfx('whip');
    const cy = groundY - bodyHeight * 0.48;
    slashFx(V.x, cy, rand(-0.35, 0.35), 46 * giant, 4.5);
    spray(V.x, cy, 20, away(-0.4), 1.2, [65, 195]);
    flinch(7);
    void shake(3.2, 0.18);
    await wait(0.1);
    // El latigazo sigue su animación hasta recogerse: si se congelara, su tralla se vería junto a la cuerda
    await finalStrike('whip', 1.45, (V.x + K.x) / 2, groundY - bodyHeight * 0.55, 0.85);
    if (!alive()) return;
    stopSway();
    recoil();

    sfx('whip');
    sfx('chaining');

    // El látigo trenzado se enrolla en el cuello y se tensa con un tirón hacia atrás
    const neckY = groundY - bodyHeight * 0.58;
    const hand = () => new Point(K.x + towards * 20 * killerGiant, groundY - killerHeight * 0.48);
    let ropeEnd = () => new Point(V.x - towards * 2 * giant, neckY);
    let slack = 1;
    const rope = new Graphics();
    rope.zIndex = 1550;
    rope.eventMode = 'none';
    stage.addChild(rope);
    every(() => {
      if (rope.destroyed) return false;
      const a = hand();
      const b = ropeEnd();
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2 + 18 * slack;
      rope
        .clear()
        // Grosor exterior del látigo
        .moveTo(a.x, a.y)
        .quadraticCurveTo(midX, midY, b.x, b.y)
        .stroke({ width: 3.2, color: 0x241306 })
        // Trenzado interior del cuero
        .moveTo(a.x, a.y)
        .quadraticCurveTo(midX, midY, b.x, b.y)
        .stroke({ width: 1.6, color: 0x6b3e1e })
        // Lazo apretado alrededor del cuello
        .ellipse(b.x, b.y, 5.5 * giant, 2.4 * giant)
        .stroke({ width: 2.4, color: 0x241306 })
        .ellipse(b.x, b.y, 5.5 * giant, 2.4 * giant)
        .stroke({ width: 1.2, color: 0x6b3e1e });
      return true;
    });

    const vStartX = V.x;
    const kStartX = K.x;
    await animate(0.3, (p) => {
      const e = easeOutCubic(p);
      slack = 1 - e;
      // El ganador da un tirón seco inclinándose hacia atrás y arrastra al perdedor
      K.x = kStartX - towards * 12 * e;
      K.rotation = -towards * 0.1 * e;
      V.x = vStartX - towards * 9 * e;
      V.rotation = -towards * 0.12 * e;
    });
    if (!alive()) return;

    // ¡Tirón mortal!
    K.rotation = 0;
    V.rotation = 0;
    sfx('hammer');
    sfx('whip');
    void flashTo(0xffffff, 0.85, 0.25);
    void shake(7, 0.4);
    await behead(-1, (head) => {
      ropeEnd = () => new Point(head.x, head.y + 3 * giant);
      void wait(0.25)
        .then(() =>
          animate(0.18, (p) => {
            if (!rope.destroyed) rope.alpha = 1 - p;
          }),
        )
        .then(() => rope.destroy());
    });
    // Sin foto (muerte normal) no hay cabeza que arrastrar
    if (!rope.destroyed) rope.destroy();
  };

  const partido = async () => {
    await strike('slash', 1.45);
    if (!alive()) return;
    sfx(pick(['axe1', 'axe2', 'hatchet1']));
    const cy = groundY - bodyHeight * 0.45;
    slashFx(V.x, cy, -0.45, 56 * giant, 6);
    spray(V.x, cy, 24, away(-0.4), 1.2, [75, 215]);
    flinch(6);
    void shake(3.5, 0.18);
    await wait(0.1);
    await finalStrike('slash', 1.65, V.x, groundY - bodyHeight * 0.5);
    if (!alive()) return;
    stopSway();
    sfx('broadsword1');
    sfx('hammer');
    void flashTo(0xffffff, 0.9, 0.28);
    void shake(8.5, 0.45);

    const photo = takePhoto();
    if (!photo) return plainDeath();
    const { frame } = photo;
    const splitX = findNeck(photo).x;
    const sx = Math.sign(V.scale.x) || 1;
    const lineX = V.x + splitX * V.scale.x;
    slashFx(lineX, groundY - bodyHeight * 0.5, Math.PI / 2, bodyHeight * 1.35, 8.5);
    const segments = columnOpaqueSegments(photo, splitX);
    const topY = segments[0]?.y0 ?? -bodyHeight;

    // Dos mitades que giran sobre el centro de los pies (y = -3) y se abren hacia fuera, cada una a su lado
    const halves = ([-1, 1] as const).map((side) => {
      const rect =
        side < 0
          ? new Rectangle(frame.x, frame.y, Math.max(2, splitX - frame.x), frame.height)
          : new Rectangle(splitX, frame.y, Math.max(2, frame.x + frame.width - splitX), frame.height);
      const half = makePiece(photo, rect, { x: splitX + side * 2, y: -3 });
      // El corte rojo (con hueso) solo donde de verdad hay cuerpo
      const cut = new Graphics();
      for (const seg of segments) {
        const segH = Math.max(1, seg.y1 - seg.y0);
        cut.rect(side < 0 ? -2.2 * giant : 0, seg.y0, 2.2 * giant, segH).fill(0x5a0000);
        if (segH > 3 * giant) {
          cut
            .rect(side < 0 ? -1.3 * giant : 0.2 * giant, seg.y0 + 1.2 * giant, 1.1 * giant, segH - 2.4 * giant)
            .fill(0xc81010);
        }
      }
      cut.position.copyFrom(half.at(splitX, 0));
      half.inner.addChild(cut);
      return { ...half, dir: side * sx, x0: half.piece.x };
    });

    V.visible = false;
    groundShadow(lineX, victim.animation.baseWidth * 0.45);
    const linePoint = () =>
      new Point(lineX + rand(-2, 2), lerp(groundY + topY * Math.abs(V.scale.y), groundY - 6, Math.random()));
    for (let i = 0; i < 4; i++) {
      const p = linePoint();
      spray(p.x, p.y, 12, pick([-0.35, Math.PI + 0.35]), 1, [85, 230]);
    }
    const stopGush = gush(linePoint, () => -Math.PI / 2 + rand(-0.55, 0.55), 1.35, 0.85);

    // Las dos mitades se separan un instante antes de desplomarse
    await animate(0.24, (p) => {
      halves.forEach((h) => {
        h.piece.x = h.x0 + h.dir * 5 * easeOutCubic(p);
        h.piece.rotation = h.dir * 0.06 * easeOutCubic(p);
      });
    });
    await wait(0.12);
    if (!alive()) return;
    void slowMotion(1, 0.35);
    void moveCamera(1.3, lineX, groundY - 30, 0.55);
    stopGush();
    await Promise.all(halves.map((h) => topple(h.piece, h.dir * (Math.PI / 2) * 0.96, 0.36, -2)));
    if (!alive()) return;
    spray(lineX, groundY - 2, 24, -Math.PI / 2, 2.4, [35, 130]);
    pool(lineX, 1.35);
    await wait(0.3);
  };

  const aplastado = async () => {
    await strike('slash', 1.45);
    if (!alive()) return;
    sfx(pick(['blunt2', 'blunt4', 'blunt6']));
    spray(V.x, groundY - bodyHeight * 0.65, 16, away(-0.55), 1.2, [65, 180]);
    flinch(7);
    void shake(3.5, 0.18);
    await wait(0.08);

    // El ganador salta muy alto con el arma en alto
    const startX = K.x;
    const landX = V.x - towards * 12;
    const apex = 115;
    const shadow = killer.animation.shadow;
    const airborne = (x: number, h: number) => {
      K.x = x;
      K.y = groundY + 1 - h;
      shadow.y = h;
      shadow.alpha = clamp(1 - h / 160, 0.25, 1);
    };
    killer.animation.setAirborn(true);
    K.zIndex = groundY + 5;
    // Pose de impulso del golpe (fotograma 2 de 'slash'), quieta durante el salto
    killer.animation.setAnimation('slash', 2);
    killer.animation.pause();
    void moveCamera(1.32, (V.x + K.x) / 2, groundY - 68, 0.35);
    await animate(0.32, (p) => airborne(lerp(startX, landX, p * 0.85), apex * easeOutCubic(p)));
    if (!alive()) return;

    // Cae en picado descargando el golpe
    if (cinematic) timeScale = 0.55;
    killer.animation.play();
    killer.animation.animationSpeed = 1.4;
    await animate(0.12, (p) => airborne(lerp(startX, landX, 0.85 + 0.15 * p), apex * (1 - easeInQuad(p))));
    if (!alive()) return;
    killer.animation.animationSpeed = 1;

    // ¡PLAF! Grietas en el suelo y onda de choque
    stopSway();
    killer.animation.setAirborn(false);
    airborne(landX, 0);
    recoil();

    sfx('hammer');
    sfx('bomb');
    void flashTo(0xffffff, 0.85, 0.25);
    void shake(11, 0.55);
    shockwave(V.x, groundY, 62 * giant, 0xffd27a, 0.35);

    const cracks = new Graphics();
    cracks.position.set(V.x, groundY + 1);
    cracks.zIndex = 1.2;
    cracks.eventMode = 'none';
    for (let c = 0; c < 8; c++) {
      const ang = (c / 8) * Math.PI * 2 + rand(-0.15, 0.15);
      const len = rand(18, 34) * giant;
      const midLen = len * 0.55;
      cracks
        .moveTo(0, 0)
        .lineTo(Math.cos(ang) * midLen, Math.sin(ang) * midLen * 0.28 + rand(-1.5, 1.5))
        .lineTo(Math.cos(ang) * len, Math.sin(ang) * len * 0.28)
        .stroke({ width: 1.4, color: 0x26160c, alpha: 0.75 });
    }
    stampGround(app, cracks);

    await animate(0.07, (p) => {
      V.scale.set(baseScaleX * lerp(1, 1.72, p), baseScaleY * lerp(1, 0.16, p));
      V.y = groundY + 2 * p;
    });
    spray(V.x, groundY - 2, 42, 0, 0.5, [130, 330]);
    spray(V.x, groundY - 2, 42, Math.PI, 0.5, [130, 330]);
    spray(V.x, groundY - 5, 25, -Math.PI / 2, 1.6, [90, 230]);
    splashRing(V.x, 34, 48 * giant);
    pool(V.x, 1.55);

    await animate(0.3, (p) => {
      V.scale.y = baseScaleY * (0.16 + 0.06 * Math.sin(p * Math.PI * 2) * (1 - p));
    });
    void slowMotion(1, 0.3);
    await wait(0.15);

    // El ganador salta hacia atrás y la cámara enfoca cómo quedó
    killer.animation.setAirborn(true);
    K.zIndex = groundY + 5;
    killer.animation.setAnimation('evade');
    void moveCamera(1.65, V.x - towards * 18, groundY - 22, 0.4);
    // Sin salirse de la arena
    const backX = clamp(landX - towards * 68, 16, W - 16);
    await animate(0.32, (p) => airborne(lerp(landX, backX, p), 38 * Math.sin(p * Math.PI)));
    killer.animation.setAirborn(false);
    airborne(backX, 0);
    killer.animation.setAnimation('idle');
    await wait(0.3);
  };

  const acribillado = async () => {
    const jets: (() => void)[] = [];
    const holes: Graphics[] = [];
    const hole = (lx: number, ly: number, r: number) => {
      const g = new Graphics()
        .circle(0, 0, r)
        .fill(0x5a0000)
        .circle(0, 0, r * 0.55)
        .fill(0x1a0000);
      g.position.set(lx, ly);
      g.zIndex = 1000;
      V.addChild(g);
      holes.push(g);
      return g;
    };

    // Ráfaga de estocadas cada vez más rápidas (velocidades que sí pasan por el fotograma del golpe)
    for (const [i, stabSpeed] of [1.4, 1.6, 2, 2.2, 2.4].entries()) {
      await strike('estoc', stabSpeed);
      if (!alive()) return;
      sfx(pick(['sharp2', 'sharp4', 'sharp6', 'sharp8']));
      const h = hole(rand(-6, 6) * giant, -bodyHeight * rand(0.28, 0.62), 2.3 * giant);
      const p = toStage(h);
      slashFx(p.x, p.y, towards * rand(-0.18, 0.18), 44 * giant, 3.8);
      spray(p.x, p.y, 15, away(-0.2), 0.8, [95, 240]);
      flinch(3.5);
      void shake(2.4, 0.1);
      if (i % 2 === 0) {
        jets.push(
          gush(
            () => toStage(h),
            () => away(-0.3),
            0.35,
            0.4,
          ),
        );
      }
    }
    await finalStrike('estoc', 1.7, V.x - towards * 10, groundY - bodyHeight * 0.45);
    if (!alive()) return;
    stopSway();
    sfx('sword');
    sfx('hammer');
    void flashTo(0xffffff, 0.85, 0.25);
    void shake(7.5, 0.45);

    const big = hole(0, -bodyHeight * 0.46, 3.8 * giant);
    const bp = toStage(big);
    slashFx(bp.x, bp.y, 0, 78 * giant, 6);
    spray(bp.x, bp.y, 48, away(-0.1), 0.9, [160, 360]);
    jets.push(
      gush(
        () => toStage(big),
        () => away(-0.2),
        1,
        0.5,
      ),
    );

    // Tiembla atravesado...
    victim.animation.pause();
    const x0 = V.x;
    await animate(0.45, (p) => {
      V.x = x0 + rand(-1.8, 1.8) * (1 - p * 0.5);
    });
    V.x = x0;
    if (!alive()) return;
    void slowMotion(1, 0.3);

    // ...y se desploma con su caída real. Los agujeros no seguirían al cuerpo: se cierran y se desvanecen
    jets.forEach((stop) => stop());
    void animate(0.15, (p) => {
      holes.forEach((h) => {
        h.alpha = 1 - p;
      });
    }).then(() => holes.forEach((h) => h.destroy()));
    victim.animation.animationSpeed = 1;
    victim.animation.play();
    death(fighters, step, speed, !cinematic);
    await wait(0.35);
    if (!alive()) return;
    spray(V.x + towards * 10 * giant, groundY - 2, 18, -Math.PI / 2, 2.2, [30, 110]);
    pool(V.x + towards * 8 * giant, 1.25);
    await wait(0.3);
  };

  const explosion = async () => {
    // Tres puñetazos cada vez más rápidos (velocidades que sí pasan por el fotograma del golpe)
    for (const punchSpeed of [1.25, 1.4, 2]) {
      await strike('fist', punchSpeed);
      if (!alive()) return;
      sfx(pick(['fist1', 'fist2', 'fist3']));
      spray(V.x, groundY - bodyHeight * 0.62, 10, away(-0.45), 1, [65, 175]);
      flinch(6);
      void shake(2.8, 0.12);
      await wait(0.06);
    }
    await finalStrike('fist', 1.65, V.x, groundY - bodyHeight * 0.5);
    if (!alive()) return;
    stopSway();
    recoil();
    sfx('hammer');
    void flashTo(0xffffff, 0.75, 0.25);
    void shake(6, 0.35);

    // Se hincha y enrojece con temblor de presión interna...
    const glow = new ColorOverlayFilter({ color: 0xff1e00, alpha: 0 });
    V.filters = [...baseFilters, glow];
    const x0 = V.x;
    let swell = 1;
    await animate(0.6, (p) => {
      swell = 1 + 0.34 * easeInQuad(p) + 0.04 * Math.sin(p * 30);
      V.scale.set(baseScaleX * swell, baseScaleY * swell);
      glow.alpha = 0.68 * p;
      V.x = x0 + rand(-1.5, 1.5) * p * 2;
    });
    V.x = x0;
    if (!alive()) return;

    // ...y revienta. La foto se toma ahora, con esta misma pose, y cada pedazo aplica la escala del cuerpo
    // hinchado: salen exactamente del mismo tamaño, sin saltos
    const photo = takePhoto(true);
    if (!photo) {
      V.scale.set(baseScaleX, baseScaleY);
      return plainDeath();
    }
    sfx('bomb');
    sfx('hammer');
    void flashTo(0xffffff, 0.95, 0.35);
    void shake(12, 0.6);
    const center = new Point(V.x, groundY - bodyHeight * 0.5 * swell);
    shockwave(center.x, center.y, 95 * giant, 0xff5a2a, 0.4);
    shockwave(V.x, groundY, 65 * giant, 0xffaa44, 0.35);

    const { frame } = photo;
    const cols = 4;
    const rows = 5;
    const cw = frame.width / cols;
    const ch = frame.height / rows;
    const pieces: Promise<void>[] = [];
    const sprites: Sprite[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const rect = new Rectangle(frame.x + c * cw, frame.y + r * ch, cw, ch);
        if (coverage(photo, rect) < 0.16) continue;
        const { piece, sprite } = makePiece(photo, rect, { x: rect.x + cw / 2, y: rect.y + ch / 2 }, true);
        sprite.tint = HOT;
        sprites.push(sprite);
        const dx = piece.x - center.x;
        const dy = piece.y - center.y;
        const len = Math.hypot(dx, dy) || 1;
        const v = rand(145, 310);
        pieces.push(
          throwPiece(piece, {
            vx: (dx / len) * v + rand(-45, 45),
            vy: (dy / len) * v - rand(90, 210),
            spin: rand(-14, 14),
            radius: (Math.min(cw, ch) * swell) / 2,
            bleed: 0.4,
          }),
        );
      }
    }
    V.visible = false;
    V.scale.set(baseScaleX, baseScaleY);
    // Los pedazos salen al rojo, como el cuerpo hinchado, y recuperan su color enseguida
    void animate(0.5, (p) => {
      const tint = mixColor(HOT, 0xffffff, easeOutCubic(p));
      sprites.forEach((s) => {
        if (!s.destroyed) s.tint = tint;
      });
    });
    spray(center.x, center.y, 115, -Math.PI / 2, Math.PI * 1.65, [85, 390]);
    splashRing(V.x, 34, 58 * giant);
    pool(V.x, 1.4);
    await wait(0.35);
    void slowMotion(1, 0.35);
    void moveCamera(1.15, V.x, groundY - 40, 0.5);
    await settle(pieces, 0.7);
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
  timeScale = 1;

  // Royale: sin letrero. El ganador saca músculo y sigue peleando; los restos se desvanecen pasado un rato
  // (la sangre del suelo se queda), como los caídos normales
  if (!cinematic) {
    screen.destroy({ children: true });
    shade.destroy();
    if (!killer.trapped && !killer.stunned) {
      killer.animation.setAnimation('strengthen');
      killer.animation.once('strengthen:end', () => {
        if (!K.destroyed && killer.animation.animation === 'strengthen') killer.animation.setAnimation('idle');
      });
    }
    // Aplastado: el cuerpo chafado sigue siendo el perdedor (los que caen con su animación ya se desvanecen solos)
    const flattened = V.visible && victim.animation.animation !== 'death';
    void wait(ROYALE_REMAINS_SECONDS)
      .then(() =>
        animate(0.6, (p) => {
          remains.forEach((c) => {
            if (!c.destroyed) c.alpha = 1 - p;
          });
          if (flattened) V.alpha = 1 - p;
        }),
      )
      .then(() => {
        if (stage.destroyed) return;
        remains.forEach((c) => {
          if (!c.destroyed) c.destroy({ children: true });
        });
        photos.forEach((photo) => photo.tex.destroy(true));
        // El chafado ya no se ve: que no se siga dibujando
        if (flattened && !V.destroyed) V.visible = false;
      });
    return;
  }

  // ===== 3. "FATALITY" (y el nombre del remate) =====
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

  announce('Fatality!', voiceRate(0.8));
  // La cámara se aleja mientras el letrero cae de golpe
  void moveCamera(1, W / 2, H / 2, 0.3);
  await animate(0.3, (p) => {
    title.scale.set(lerp(3.2, 1, easeOutBack(p)));
    title.alpha = Math.min(1, p * 2.5);
  });
  if (!alive()) return;
  // Impacto del letrero
  sfx('bomb');
  void flashTo(0xff0000, 0.45, 0.35);
  void animate(0.3, (p) => {
    camera.z = 1 + 0.06 * Math.sin(p * Math.PI);
  });
  void shake(8, 0.45);
  if (!killer.trapped && !killer.stunned) killer.animation.setAnimation('strengthen');
  void animate(0.25, (p) => {
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
    void wait(rand(0, 0.35)).then(() =>
      animate(rand(0.8, 1.2), (p) => {
        if (drip.destroyed) return;
        drip.y = y0 + fall * p * p;
        drip.scale.y = 1 + 1.4 * p;
        drip.alpha = 1 - p * 0.7;
      }),
    );
  }
  // El letrero late un momento
  await animate(1.1, (p) => {
    glow.outerStrength = 2.5 + Math.sin(p * Math.PI * 3) * 1.5;
    title.scale.set(1 + Math.sin(p * Math.PI * 2) * 0.025);
  });
  if (!alive()) return;

  // ===== 4. Todo vuelve a la normalidad (los restos y la sangre se quedan) =====
  await Promise.all([
    animate(0.35, (p) => {
      titleLayer.alpha = 1 - p;
      shade.alpha = 0.62 * (1 - p);
    }),
    fadeHud(1, 0.35),
  ]);
  ticker.remove(applyCamera);
  if (!alive()) return;
  stage.pivot.set(0, 0);
  stage.position.set(0, 0);
  stage.scale.set(1);
  screen.destroy({ children: true });
  shade.destroy();
};
