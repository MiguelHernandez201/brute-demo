// Demo: fatality al estilo Mortal Kombat cuando cae el brute perdedor en el modo 1 vs 1.
// "FINISH HIM!", el ganador corre hacia el perdedor, le da dos cortes y el tercero lo decapita:
// la cabeza sale volando y rueda, el cuerpo sangra por el cuello y se desploma. Luego, "FATALITY".
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

const GRAVITY = 520;
const MAX_SPLATS = 160;
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

  const W = app.screen.width;
  const H = app.screen.height;
  const V = victim.animation.container;
  const K = killer.animation.container;
  const alive = () => !stage.destroyed && !V.destroyed && !K.destroyed;
  // Cámara lenta: afecta a la sangre, la cabeza y el cuerpo mientras dura
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

  // El perdedor se pone rojo un instante al recibir un corte
  const hurt = () => {
    const previous = V.filters ? [...V.filters] : [];
    V.filters = [...previous, new ColorOverlayFilter({ color: 0xff0000, alpha: 0.55 })];
    void wait(0.12).then(() => {
      if (!V.destroyed) V.filters = previous;
    });
  };

  const towards = Math.sign(V.x - K.x) || 1; // del ganador hacia el perdedor
  const bodyHeight = victim.animation.baseHeight * 0.8;

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

  // ===== 2. El ganador corre hacia el perdedor =====
  K.scale.x = Math.abs(K.scale.x) * towards;
  const targetX = V.x - towards * Math.max(30, getHitDistance(killer, victim) * 0.8);
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

  // ===== 3. Dos cortes =====
  const cuts = [
    { y: 0.48, angle: -0.6 },
    { y: 0.34, angle: 0.55 },
  ];
  for (const cut of cuts) {
    const hit = killer.animation.waitForEvent('slash:hit', 1200);
    const end = killer.animation.waitForEvent('slash:end', 1200);
    killer.animation.setAnimation('slash');
    await hit;
    if (!alive()) return;
    const cy = groundY - bodyHeight * cut.y;
    void sound.play('sfx', { sprite: pick(['sharp1', 'sharp3', 'sharp5', 'sword']) });
    slashFx(V.x, cy, cut.angle, 48, 5);
    spray(V.x, cy, 24, towards > 0 ? -0.45 : Math.PI + 0.45, 1.3, [70, 210]);
    hurt();
    void shake(3, 0.2);
    const x0 = V.x;
    void animate(0.12, (p) => {
      V.x = x0 + towards * 5 * Math.sin(p * Math.PI);
    });
    await Promise.race([end, wait(0.45)]);
    if (!alive()) return;
  }

  // ===== 4. Decapitación en cámara lenta =====
  const neckGuessY = groundY - bodyHeight * 0.5;
  await moveCamera(1.9, V.x - towards * 12, neckGuessY, 0.35, easeOutCubic);
  if (!alive()) return;
  timeScale = 0.4;
  killer.animation.animationSpeed = 0.5;
  const finalHit = killer.animation.waitForEvent('slash:hit', 2500);
  killer.animation.setAnimation('slash');
  await finalHit;
  killer.animation.animationSpeed = 1;
  if (!alive()) return;
  swaying = false;
  V.rotation = 0;
  void sound.play('sfx', { sprite: 'broadsword1' });
  void sound.play('sfx', { sprite: 'hammer' });
  void flashTo(0xffffff, 0.9, 0.3);
  void shake(7, 0.5);

  // Foto del perdedor en reposo, partida a la altura del cuello en cabeza y cuerpo
  victim.animation.setAnimation('idle');
  const shadow = victim.animation.shadow;
  shadow.visible = false;
  const lb = V.getLocalBounds();
  const frame = new Rectangle(
    Math.floor(lb.minX) - 2,
    Math.floor(lb.minY) - 2,
    Math.ceil(lb.maxX - lb.minX) + 4,
    Math.ceil(lb.maxY - lb.minY) + 4,
  );
  const resolution = Math.min(8, app.renderer.resolution * 2);
  let neck = { y: lb.minY * (1 - 0.47), x0: -5, x1: 5 };
  let photo: Texture;
  try {
    photo = app.renderer.generateTexture({ target: V, frame, resolution });
    const { pixels, width } = app.renderer.extract.pixels({ target: photo });
    const top = Math.max(lb.minY, -victim.animation.baseHeight);
    let best = Infinity;
    for (let y = top * (1 - NECK_BAND[0]); y <= top * (1 - NECK_BAND[1]); y += 1 / resolution) {
      const row = Math.round((y - frame.y) * resolution);
      let count = 0;
      let x0 = Infinity;
      let x1 = -Infinity;
      for (let x = 0; x < width; x++) {
        if ((pixels[(row * width + x) * 4 + 3] ?? 0) > 128) {
          count += 1;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
        }
      }
      if (count > 0 && count < best) {
        best = count;
        neck = { y, x0: frame.x + x0 / resolution, x1: frame.x + x1 / resolution };
      }
    }
  } catch (e) {
    console.warn('fatality: sin foto del perdedor', e);
    shadow.visible = true;
    death(fighters, step, speed, false);
    return;
  }
  const cutY = clamp(neck.y, frame.y + 4, frame.y + frame.height - 4);
  const headTex = new Texture({ source: photo.source, frame: new Rectangle(0, 0, frame.width, cutY - frame.y) });
  const bodyTex = new Texture({
    source: photo.source,
    frame: new Rectangle(0, cutY - frame.y, frame.width, frame.y + frame.height - cutY),
  });
  const neckX = (neck.x0 + neck.x1) / 2;
  const neckRx = Math.max(3, (neck.x1 - neck.x0) / 2 + 1);
  const sx = V.scale.x;
  const stump = (x: number, y: number) => {
    const g = new Graphics()
      .ellipse(0, 0, neckRx, 2.4)
      .fill(0x6a0000)
      .ellipse(0, -0.3, neckRx * 0.6, 1.3)
      .fill(0xc81010);
    g.position.set(x, y);
    return g;
  };

  // Cuerpo: gira sobre el pie del lado hacia el que cae (lejos del ganador)
  const bodyInner = new Container();
  bodyInner.scale.set(sx, V.scale.y);
  const bodySprite = new Sprite(bodyTex);
  bodySprite.position.set(frame.x, cutY);
  const neckMark = new Container();
  neckMark.position.set(neckX, cutY);
  bodyInner.addChild(bodySprite, stump(neckX, cutY), neckMark);
  const fallEdge = (towards > 0 ? Math.max(lb.minX * sx, lb.maxX * sx) : Math.min(lb.minX * sx, lb.maxX * sx)) * 0.6;
  const body = new Container();
  body.pivot.set(fallEdge, 0);
  body.position.set(V.x + fallEdge, V.y);
  body.zIndex = V.y;
  body.eventMode = 'none';
  body.addChild(bodyInner);

  // Cabeza: gira sobre su centro
  const headInner = new Container();
  headInner.scale.set(sx, V.scale.y);
  const hcx = neckX;
  const hcy = (frame.y + cutY) / 2;
  const headSprite = new Sprite(headTex);
  headSprite.position.set(frame.x - hcx, frame.y - hcy);
  headInner.addChild(headSprite, stump(0, cutY - hcy));
  const head = new Container();
  head.position.set(V.x + hcx * sx, V.y + hcy);
  head.zIndex = 1500;
  head.eventMode = 'none';
  head.addChild(headInner);

  // Sombra propia del cuerpo (la del luchador queda oculta con él)
  const bodyShadow = new Graphics().ellipse(0, 0, victim.animation.baseWidth * 0.36, 4).fill({ color: 0, alpha: 0.35 });
  bodyShadow.position.set(V.x, V.y);
  bodyShadow.zIndex = 1;
  V.visible = false;
  stage.addChild(bodyShadow, body, head);

  const neckWorld = () => stage.toLocal(neckMark.getGlobalPosition(new Point()));

  // Estela del corte final y primer chorro del cuello
  const neckNow = neckWorld();
  slashFx(neckNow.x - towards * 4, neckNow.y, towards * 0.08, 84, 7);
  spray(neckNow.x, neckNow.y, 40, -Math.PI / 2 + towards * 0.35, 0.9, [160, 330]);

  // La cabeza sale volando, rebota y rueda dejando un rastro de sangre
  const headRadius = Math.max(8, Math.min(frame.width, cutY - frame.y) / 2);
  const headGround = groundY - headRadius * 0.75;
  const flight = { vx: towards * rand(75, 110), vy: -rand(240, 290), spin: towards * rand(7, 10), grounded: false };
  let headResting = false;
  every((dt) => {
    if (head.destroyed) return false;
    if (!flight.grounded) {
      flight.vy += GRAVITY * dt;
      head.x += flight.vx * dt;
      head.y += flight.vy * dt;
      head.rotation += flight.spin * dt;
      if (Math.random() < 0.7) spray(head.x, head.y + headRadius * 0.4, 1, Math.PI / 2, 1, [10, 40]);
      if (head.x < 15 || head.x > W - 15) {
        head.x = clamp(head.x, 15, W - 15);
        flight.vx = -flight.vx * 0.5;
      }
      if (flight.vy > 0 && head.y >= headGround) {
        head.y = headGround;
        spray(head.x, headGround + headRadius * 0.5, 8, -Math.PI / 2, 2.4, [20, 80]);
        if (flight.vy > 90) {
          void sound.play('sfx', { sprite: 'blunt1' });
          flight.vy = -flight.vy * 0.35;
          flight.vx *= 0.7;
        } else {
          flight.grounded = true;
          head.zIndex = groundY;
        }
      }
      return true;
    }
    // Rodando por el suelo
    head.x = clamp(head.x + flight.vx * dt, 15, W - 15);
    head.rotation += (flight.vx / headRadius) * dt;
    flight.vx *= Math.max(0, 1 - 2.2 * dt);
    if (Math.random() < 0.25) splat(head.x, groundY + rand(0, 4), rand(0.8, 1.6), pick(BLOOD));
    if (Math.abs(flight.vx) < 3) {
      headResting = true;
      return false;
    }
    return true;
  });

  // Chorro de sangre del cuello, a latidos, mientras el cuerpo sigue de pie y cae
  let gushTime = 0;
  let gushing = true;
  every((dt) => {
    if (!gushing || body.destroyed) return false;
    gushTime += dt;
    const beat = 0.35 + 0.65 * Math.abs(Math.sin(gushTime * Math.PI * 2.2));
    const fade = Math.max(0.25, 1 - gushTime / 3.5);
    const amount = 90 * beat * fade * dt;
    const count = Math.floor(amount) + (Math.random() < amount % 1 ? 1 : 0);
    if (count) {
      const n = neckWorld();
      spray(n.x, n.y, count, -Math.PI / 2 + body.rotation, 0.55, [150, 300 * fade + 60]);
    }
    return true;
  });

  // Cámara lenta mientras la cabeza vuela; luego vuelve poco a poco a la velocidad normal
  await wait(1.1);
  if (!alive()) return;
  void animate(0.5, (p) => {
    timeScale = lerp(0.4, 1, p);
  });
  void moveCamera(1.35, (V.x + head.x) / 2, groundY - 30, 0.8);

  // El cuerpo se tambalea y se desploma
  await animate(0.45, (p) => {
    body.rotation = Math.sin(p * Math.PI * 2) * 0.05 * towards;
  });
  if (!alive()) return;
  await animate(0.45, (p) => {
    body.rotation = towards * (Math.PI / 2) * 0.97 * easeInQuad(p);
    bodyShadow.scale.x = 1 + p * 0.8;
    bodyShadow.x = V.x + towards * p * 22;
  });
  if (!alive()) return;
  void sound.play('sfx', { sprite: 'blunt3' });
  void shake(5, 0.35);
  const neckAtGround = neckWorld();
  spray(neckAtGround.x, groundY, 14, -Math.PI / 2, 2.6, [30, 110]);
  await animate(0.2, (p) => {
    body.rotation = towards * (Math.PI / 2) * (0.97 - 0.06 * Math.sin(p * Math.PI));
  });
  // Charco de sangre que crece bajo el cuello
  const pool = new Graphics().ellipse(0, 0, 24, 5).fill({ color: 0x6a0000, alpha: 0.9 });
  pool.position.set(neckAtGround.x + towards * 6, groundY + 2);
  pool.zIndex = 1.5;
  pool.scale.set(0.15);
  stage.addChild(pool);
  void animate(2.5, (p) => {
    if (!pool.destroyed) pool.scale.set(lerp(0.15, 1, easeOutCubic(p)));
  });
  await Promise.race([
    animate(1.2, () => {}),
    new Promise<void>((resolve) => {
      every(() => {
        if (!headResting) return true;
        resolve();
        return false;
      });
    }),
  ]);
  gushing = false;
  if (!alive()) return;

  // ===== 5. "FATALITY" =====
  await moveCamera(1, W / 2, H / 2, 0.5);
  if (!alive()) return;
  timeScale = 1;
  const title = bigText('FATALITY', 60, ['#ff5a4a', '#d40000', '#5a0000']);
  title.anchor.set(0.5);
  title.position.set(W / 2, H * 0.42);
  title.alpha = 0;
  const glow = new GlowFilter({ color: 0xff1a1a, distance: 14, outerStrength: 0, innerStrength: 0, quality: 0.3 });
  title.filters = [glow];
  const titleLayer = new Container();
  titleLayer.addChild(title);
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
  if (!killer.trapped && !killer.stunned) killer.animation.setAnimation('strengthen');
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

  // ===== 6. Todo vuelve a la normalidad (la cabeza, el cuerpo y la sangre se quedan) =====
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
