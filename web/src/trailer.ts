// Generador y reproductor del Video Promocional (Trailer) en tiempo real con el motor PixiJS del juego.
// Graba automáticamente el lienzo en HD mediante MediaRecorder para poder descargarlo en .mp4 / .webm.
import { Gender, StepType, WeaponName } from '@labrute/core';
import { sound } from '@pixi/sound';
import { AnimatedSprite, Application, Color, Container, FillGradient, Graphics, Sprite, Text, Ticker } from 'pixi.js';
import { ColorOverlayFilter } from 'pixi-filters/color-overlay';
import { GlowFilter } from 'pixi-filters/glow';
import { OutlineFilter } from 'pixi-filters/outline';
import { fatality } from './fight/fatality';
import { FighterHolder, renderQuality } from './fight/FighterHolder';
import { AnimationFighter } from './fight/utils/findFighter';
import { Spritesheets } from './fight/utils/spritesheet';
import { makeBrute } from './sim';

const W = 500;
const H = 300;
const GROUND_Y = 250;

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
const easeOutBack = (p: number) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

const trailerTitle = (
  text: string,
  fontSize: number,
  colors: [string, string, string] = ['#fff6b0', '#ff9d00', '#b81d00'],
) =>
  new Text({
    text,
    style: {
      fontFamily: 'GameFont',
      fontSize,
      align: 'center',
      letterSpacing: 2,
      fill: new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: colors[0] },
          { offset: 0.5, color: colors[1] },
          { offset: 1, color: colors[2] },
        ],
        textureSpace: 'local',
      }),
      stroke: { color: 0x140600, width: Math.max(3, Math.round(fontSize / 7.5)), join: 'round' },
      dropShadow: { color: 0x000000, alpha: 0.9, blur: 4, distance: 4, angle: Math.PI / 2 },
    },
  });

const createBanner = (label: string, sublabel?: string) => {
  const c = new Container();
  c.zIndex = 3200;
  const bg = new Graphics()
    .roundRect(-220, -20, 440, sublabel ? 44 : 32, 8)
    .fill({ color: 0x140804, alpha: 0.86 })
    .stroke({ width: 2, color: 0xffd166, alpha: 0.9 });
  const t1 = trailerTitle(label, 18, ['#ffffff', '#ffd166', '#e07a00']);
  t1.anchor.set(0.5);
  t1.y = sublabel ? -6 : -4;
  c.addChild(bg, t1);
  if (sublabel) {
    const t2 = new Text({
      text: sublabel,
      style: {
        fontFamily: 'GameFont',
        fontSize: 10,
        fill: 0xf3e6d0,
        letterSpacing: 1.5,
      },
    });
    t2.anchor.set(0.5);
    t2.y = 12;
    c.addChild(t2);
  }
  c.position.set(W / 2, 34);
  return c;
};

const buildAnimationFighter = (
  app: Application,
  speed: { current: number },
  opts: {
    index: number;
    name: string;
    team: 'L' | 'R';
    gender?: Gender;
    weapon?: WeaponName | null;
    type?: 'brute' | 'pet';
    petName?: 'bear' | 'panther' | 'dog1';
  },
): AnimationFighter => {
  const base = makeBrute(opts.name, `trailer-${opts.index}-${Date.now()}`);
  const isPet = opts.type === 'pet';
  const fighterData: any = {
    id: opts.index,
    index: opts.index,
    name: isPet ? (opts.petName ?? 'bear') : opts.name,
    type: isPet ? 'pet' : 'brute',
    gender: opts.gender ?? base.gender,
    body: base.body,
    colors: base.colors,
    team: opts.team,
    master: isPet ? 999 : undefined,
    hp: 120,
    maxHp: 120,
    strength: 30,
    agility: 30,
    speed: 30,
    shield: false,
    activeWeapon: null,
    weapons: {},
    skills: {},
    size: 1,
  };
  const holder = new FighterHolder(app, fighterData, speed as any, 1);
  holder.weapon = opts.weapon ?? null;
  holder.shadow.alpha = 1;
  return {
    ...fighterData,
    hpBar: undefined,
    hpBarPhantom: undefined,
    bustImage: null,
    bust: undefined,
    text: undefined,
    teamWeaponsIllustrations: [],
    teamSkillsIllustrations: [],
    HUDFocused: false,
    skills: {},
    animation: holder,
  };
};

export type TrailerResult = {
  blob: Blob | null;
  url: string | null;
  ext: string;
};

export const playPromotionalTrailer = async (
  mountEl: HTMLElement,
  spritesheets: Spritesheets,
  onStatus?: (msg: string) => void,
  shouldAbort?: () => boolean,
): Promise<TrailerResult> => {
  const speed = { current: 1.2 };
  const app = new Application();
  // Resolución 1000x600 HD (2x sobre el lienzo lógico 500x300) para mantener 60 FPS fluidos
  const resolution = 2;
  renderQuality.value = resolution;
  await app.init({
    backgroundColor: 0x120804,
    width: W,
    height: H,
    resolution,
    antialias: true,
    preserveDrawingBuffer: true,
  });

  mountEl.querySelectorAll('canvas').forEach((el) => el.remove());
  app.canvas.classList.add('live', 'ready');
  mountEl.prepend(app.canvas);
  app.stage.sortableChildren = true;
  app.ticker.speed = 0.5;

  // Iniciar grabación del canvas con MediaRecorder
  let recorder: MediaRecorder | null = null;
  const chunks: BlobPart[] = [];
  let ext = 'webm';
  let recordingDone: Promise<Blob | null> = Promise.resolve(null);

  try {
    const stream = app.canvas.captureStream(60);
    const candidates = [
      { mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },
      { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
      { mime: 'video/mp4', ext: 'mp4' },
      { mime: 'video/webm;codecs=vp9', ext: 'webm' },
      { mime: 'video/webm;codecs=vp8', ext: 'webm' },
      { mime: 'video/webm', ext: 'webm' },
    ];
    const chosen =
      typeof MediaRecorder !== 'undefined' ? candidates.find((c) => MediaRecorder.isTypeSupported(c.mime)) : undefined;
    if (chosen) {
      ext = chosen.ext;
      recorder = new MediaRecorder(stream, {
        mimeType: chosen.mime,
        videoBitsPerSecond: 6_500_000,
      });
      recordingDone = new Promise<Blob | null>((resolve) => {
        recorder?.addEventListener('dataavailable', (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        });
        recorder?.addEventListener('stop', () => {
          resolve(chunks.length ? new Blob(chunks, { type: chosen.mime }) : null);
        });
        recorder?.addEventListener('error', () => resolve(null));
      });
      recorder.start(100);
    }
  } catch (e) {
    console.warn('No se pudo iniciar MediaRecorder:', e);
  }

  const isRecordingMode = new URLSearchParams(location.search).get('trailer') === 'record';
  const reportLog = (msg: string) => {
    onStatus?.(msg);
    if (isRecordingMode) {
      fetch(`http://127.0.0.1:3198/log?msg=${encodeURIComponent(msg)}`).catch(() => {});
    }
  };

  const aborted = () => (shouldAbort?.() ?? false) || app.stage.destroyed;
  const animate = (seconds: number, update: (p: number, dt: number) => void) =>
    new Promise<void>((resolve) => {
      let t = 0;
      const tick = (tk: Ticker) => {
        if (aborted()) {
          app.ticker.remove(tick);
          resolve();
          return;
        }
        const dt = Math.min(tk.elapsedMS, 50) / 1000;
        t += dt;
        const p = Math.min(1, t / seconds);
        update(p, dt);
        if (p >= 1) {
          app.ticker.remove(tick);
          resolve();
        }
      };
      app.ticker.add(tick);
    });
  const wait = (seconds: number) => animate(seconds, () => {});

  const miscSheet = spritesheets.misc;
  const setBg = (bgNum: number) => {
    const old = app.stage.children.find((c) => c.label === 'trailer-bg');
    if (old) old.destroy();
    const tex = miscSheet?.textures[`background/${bgNum}.jpg`];
    if (!tex) return;
    const bg = new Sprite(tex);
    bg.label = 'trailer-bg';
    bg.zIndex = -10;
    bg.width = W;
    bg.height = H;
    app.stage.addChild(bg);
  };

  // Barras de cine (letterbox) y destello de transición
  const letterbox = new Graphics()
    .rect(0, 0, W, 22)
    .fill(0x000000)
    .rect(0, H - 22, W, 22)
    .fill(0x000000)
    .rect(0, 22, W, 1.5)
    .fill(0xffd166)
    .rect(0, H - 23.5, W, 1.5)
    .fill(0xffd166);
  letterbox.zIndex = 3100;
  app.stage.addChild(letterbox);

  const flashOverlay = new Graphics().rect(0, 0, W, H).fill(0xffffff);
  flashOverlay.zIndex = 3500;
  flashOverlay.alpha = 0;
  app.stage.addChild(flashOverlay);

  const flash = (color = 0xffffff, alpha = 0.9, duration = 0.3) => {
    flashOverlay.clear().rect(0, 0, W, H).fill(color);
    return animate(duration, (p) => {
      flashOverlay.alpha = alpha * (1 - p);
    });
  };

  // Chispas / brasas flotantes de fondo
  const embersContainer = new Container();
  embersContainer.zIndex = 2900;
  app.stage.addChild(embersContainer);
  const embers = Array.from({ length: 22 }, () => {
    const g = new Graphics().circle(0, 0, 1 + Math.random() * 1.8).fill(Math.random() > 0.4 ? 0xffa200 : 0xff3b00);
    g.position.set(Math.random() * W, Math.random() * H);
    g.alpha = 0.35 + Math.random() * 0.55;
    embersContainer.addChild(g);
    return { g, vx: -12 + Math.random() * 24, vy: -25 - Math.random() * 35 };
  });
  const emberTick = (tk: Ticker) => {
    if (aborted()) return;
    const dt = Math.min(tk.elapsedMS, 50) / 1000;
    for (const e of embers) {
      e.g.x = (e.g.x + e.vx * dt + W) % W;
      e.g.y -= -e.vy * dt;
      if (e.g.y < 0) e.g.y = H;
    }
  };
  app.ticker.add(emberTick);

  const waitLoaded = async (list: AnimationFighter[]) => {
    let waited = 0;
    while (!aborted() && list.some((f) => !f.animation.loaded) && waited < 4000) {
      await new Promise((r) => setTimeout(r, 50));
      waited += 50;
    }
  };

  const clearSceneFighters = (list: AnimationFighter[]) => {
    for (const f of list) {
      f.animation.destroy();
    }
  };

  // =========================================================================
  // ESCENA 1: INTRO ÉPICA — "EL CLÁSICO REGRESA MÁS BRUTAL QUE NUNCA" (0 - 4.0s)
  // =========================================================================
  reportLog('🎬 Grabando Escena 1/5: Presentación e Impacto Inicial...');
  setBg(1);
  void sound.play('background', { loop: true });

  const introLeft = buildAnimationFighter(app, speed, {
    index: 1,
    name: 'TITÁN',
    team: 'L',
    gender: 'male',
    weapon: 'broadsword',
  });
  const introRight = buildAnimationFighter(app, speed, {
    index: 2,
    name: 'VALQUIRIA',
    team: 'R',
    gender: 'female',
    weapon: 'halbard',
  });
  const scene1Fighters = [introLeft, introRight];
  await waitLoaded(scene1Fighters);
  if (aborted()) return { blob: null, url: null, ext };

  introLeft.animation.container.position.set(70, GROUND_Y);
  introRight.animation.container.position.set(W - 70, GROUND_Y);
  app.stage.addChild(introLeft.animation.container, introRight.animation.container);

  const heroTitle = trailerTitle('⚔️ LA BRUTE · EDICIÓN EXTREMA', 26, ['#fff6b0', '#ffb700', '#c82800']);
  heroTitle.anchor.set(0.5);
  heroTitle.position.set(W / 2, 72);
  const heroSub = trailerTitle('COMBATES EN VIVO · SIN SERVIDOR · NUEVOS MODOS', 12, ['#ffffff', '#ffd166', '#d97706']);
  heroSub.anchor.set(0.5);
  heroSub.position.set(W / 2, 100);
  heroTitle.zIndex = 3300;
  heroSub.zIndex = 3300;
  app.stage.addChild(heroTitle, heroSub);

  void flash(0xffd166, 0.75, 0.35);
  void sound.play('sfx', { sprite: 'hammer' });

  introLeft.animation.setAnimation('run');
  introRight.animation.setAnimation('run');
  await animate(1.2, (p) => {
    const e = easeOutBack(Math.min(1, p * 1.4));
    heroTitle.scale.set(lerp(2.2, 1, e));
    heroSub.alpha = clamp((p - 0.25) * 2, 0, 1);
    introLeft.animation.container.x = lerp(60, 212, easeInOutCubic(p));
    introRight.animation.container.x = lerp(W - 60, 288, easeInOutCubic(p));
  });
  if (aborted()) return { blob: null, url: null, ext };

  // Choque de armas en el centro
  introLeft.animation.setAnimation('slash');
  introRight.animation.setAnimation('slash');
  await wait(0.22);
  void sound.play('sfx', { sprite: 'broadsword1' });
  void sound.play('sfx', { sprite: 'sword' });
  void flash(0xffffff, 0.85, 0.25);

  const clashBurst = new Graphics()
    .star(0, 0, 10, 38, 12)
    .fill({ color: 0xfff3a0, alpha: 0.95 })
    .star(0, 0, 10, 22, 7)
    .fill(0xffffff);
  clashBurst.position.set(W / 2, GROUND_Y - 45);
  clashBurst.zIndex = 2800;
  clashBurst.filters = [new GlowFilter({ color: 0xff5500, distance: 12, outerStrength: 3 })];
  app.stage.addChild(clashBurst);

  await animate(1.5, (p) => {
    clashBurst.rotation = p * 3.5;
    clashBurst.scale.set(lerp(0.4, 1.5, easeOutCubic(p)));
    clashBurst.alpha = 1 - p;
    heroTitle.scale.set(1 + Math.sin(p * Math.PI * 2) * 0.03);
  });
  clashBurst.destroy();
  heroTitle.destroy();
  heroSub.destroy();
  clearSceneFighters(scene1Fighters);
  if (aborted()) return { blob: null, url: null, ext };

  // =========================================================================
  // ESCENA 2: TIENDA EN VIVO Y ¡SÚPER GIGANTE! (4.0 - 8.5s)
  // =========================================================================
  reportLog('🎬 Grabando Escena 2/5: Tienda en Vivo y Súper Gigante...');
  void flash(0xffaa00, 0.8, 0.28);
  setBg(5);
  const banner2 = createBanner(
    '🛒 TIENDA EN PLENA PELEA + ¡SÚPER GIGANTE!',
    'COMPRA ARMAS, MASCOTAS Y POWER-UPS EN CADA TURNO',
  );
  app.stage.addChild(banner2);

  const giantHero = buildAnimationFighter(app, speed, {
    index: 3,
    name: 'COLOSO',
    team: 'L',
    gender: 'male',
    weapon: 'mammothBone',
  });
  const petBear = buildAnimationFighter(app, speed, {
    index: 4,
    name: 'bear',
    team: 'L',
    type: 'pet',
    petName: 'bear',
  });
  const rival2 = buildAnimationFighter(app, speed, {
    index: 5,
    name: 'SOMBRA',
    team: 'R',
    gender: 'male',
    weapon: 'scimitar',
  });
  const scene2Fighters = [giantHero, petBear, rival2];
  await waitLoaded(scene2Fighters);
  if (aborted()) return { blob: null, url: null, ext };

  giantHero.animation.container.position.set(175, GROUND_Y);
  petBear.animation.container.position.set(105, GROUND_Y + 6);
  rival2.animation.container.position.set(330, GROUND_Y);
  app.stage.addChild(giantHero.animation.container, petBear.animation.container, rival2.animation.container);

  giantHero.animation.setAnimation('strengthen');
  petBear.animation.setAnimation('arrive');
  rival2.animation.setAnimation('idle');
  void sound.play('sfx', { sprite: 'fierceBrute' });

  const giantLabel = trailerTitle('✨ ¡SÚPER GIGANTE! (DAÑO X2)', 18, ['#fff8b8', '#ffd000', '#d94800']);
  giantLabel.anchor.set(0.5);
  giantLabel.position.set(175, GROUND_Y - 125);
  giantLabel.zIndex = 3000;
  app.stage.addChild(giantLabel);

  // Crecimiento a Súper Gigante
  await animate(1.3, (p) => {
    const s = lerp(1, 2.25, easeOutBack(p));
    giantHero.animation.setGiantScale(s);
    giantLabel.scale.set(lerp(0.5, 1.1, easeOutBack(p)));
  });
  if (aborted()) return { blob: null, url: null, ext };

  // Ataque demoledor del Súper Gigante + el Oso
  giantHero.animation.setAnimation('slash');
  petBear.animation.setAnimation('attack');
  await wait(0.24);
  void sound.play('sfx', { sprite: 'hammer' });
  void flash(0xffffff, 0.7, 0.22);
  rival2.animation.setAnimation('hit-0');
  await animate(1.1, (p) => {
    rival2.animation.container.x = lerp(330, 445, easeOutCubic(p));
    rival2.animation.container.rotation = lerp(0, 0.45, easeOutCubic(p));
    giantLabel.y = GROUND_Y - 125 - p * 18;
    giantLabel.alpha = 1 - p * 0.6;
  });

  banner2.destroy();
  giantLabel.destroy();
  clearSceneFighters(scene2Fighters);
  if (aborted()) return { blob: null, url: null, ext };

  // =========================================================================
  // ESCENA 3: MODO BATTLE ROYALE — TODOS CONTRA TODOS (8.5 - 12.8s)
  // =========================================================================
  reportLog('🎬 Grabando Escena 3/5: Modo Battle Royale (Todos contra Todos)...');
  void flash(0xff2a85, 0.75, 0.28);
  setBg(9);
  const banner3 = createBanner(
    '👑 BATTLE ROYALE · TODOS CONTRA TODOS',
    'HASTA 10 BRUTES PELEANDO SIMULTÁNEAMENTE EN LA ARENA',
  );
  app.stage.addChild(banner3);

  const royaleSpecs: { name: string; team: 'L' | 'R'; x: number; y: number; weapon: WeaponName; gender: Gender }[] = [
    { name: 'TRITÓN', team: 'L', x: 75, y: GROUND_Y - 14, weapon: 'trident', gender: 'male' },
    { name: 'BRASA', team: 'R', x: 145, y: GROUND_Y - 14, weapon: 'axe', gender: 'female' },
    { name: 'RAYO', team: 'L', x: 215, y: GROUND_Y + 4, weapon: 'lance', gender: 'male' },
    { name: 'GARRA', team: 'R', x: 290, y: GROUND_Y + 4, weapon: 'flail', gender: 'female' },
    { name: 'CUERVO', team: 'L', x: 355, y: GROUND_Y - 10, weapon: 'whip', gender: 'male' },
    { name: 'VOLCÁN', team: 'R', x: 430, y: GROUND_Y - 10, weapon: 'morningStar', gender: 'male' },
  ];
  const royaleFighters = royaleSpecs.map((sp, idx) =>
    buildAnimationFighter(app, speed, {
      index: 10 + idx,
      name: sp.name,
      team: sp.team,
      gender: sp.gender,
      weapon: sp.weapon,
    }),
  );
  await waitLoaded(royaleFighters);
  if (aborted()) return { blob: null, url: null, ext };

  royaleFighters.forEach((f, idx) => {
    const sp = royaleSpecs[idx]!;
    f.animation.container.position.set(sp.x, sp.y);
    app.stage.addChild(f.animation.container);
  });

  // Combates simultáneos en las 3 parejas
  for (let round = 0; round < 3; round++) {
    if (aborted()) return { blob: null, url: null, ext };
    royaleFighters.forEach((f, idx) => {
      if (idx % 2 === round % 2) {
        f.animation.setAnimation(idx === 2 ? 'estoc' : idx === 4 ? 'whip' : 'slash');
      } else {
        f.animation.setAnimation(f.gender === 'male' ? 'hit-1' : 'hit');
      }
    });
    void sound.play('sfx', { sprite: round === 1 ? 'bomb' : 'sword' });
    await wait(0.8);
  }

  banner3.destroy();
  clearSceneFighters(royaleFighters);
  if (aborted()) return { blob: null, url: null, ext };

  // =========================================================================
  // ESCENA 4: NUEVAS FATALITIES AL ESTILO MORTAL KOMBAT (12.8 - 19.8s)
  // =========================================================================
  reportLog('🎬 Grabando Escena 4/5: Nuevas Fatalities Renovadas...');
  void flash(0xff0000, 0.85, 0.3);
  setBg(3);
  const banner4 = createBanner(
    '💀 6 FATALITIES RENOVADAS SEGÚN EL ARMA',
    'DECAPITACIÓN · PARTIDO EN DOS · APLASTADO · ACRIBILLADO · LÁTIGO · EXPLOSIÓN',
  );
  app.stage.addChild(banner4);

  const killerF = buildAnimationFighter(app, speed, {
    index: 30,
    name: 'VERDUGO',
    team: 'L',
    gender: 'male',
    weapon: 'broadsword',
  });
  const victimF = buildAnimationFighter(app, speed, {
    index: 31,
    name: 'VÍCTIMA',
    team: 'R',
    gender: 'male',
    weapon: 'sword',
  });
  const scene4Fighters = [killerF, victimF];
  await waitLoaded(scene4Fighters);
  if (aborted()) return { blob: null, url: null, ext };

  killerF.animation.container.position.set(190, GROUND_Y);
  victimF.animation.container.position.set(295, GROUND_Y);
  app.stage.addChild(killerF.animation.container, victimF.animation.container);

  // Ejecutar la fatality real mejorada a velocidad ágil (1.45x) para el tráiler
  const trailerSpeed = { current: 1.45 };
  await fatality(app, spritesheets, scene4Fighters, { a: StepType.Death, f: victimF.index }, trailerSpeed as any);

  banner4.destroy();
  clearSceneFighters(scene4Fighters);
  if (aborted()) return { blob: null, url: null, ext };

  // =========================================================================
  // ESCENA 5: CIERRE TRIUNFAL / CALL TO ACTION (19.8 - 23.0s)
  // =========================================================================
  reportLog('🎬 Grabando Escena 5/5: Cierre y Celebración Final...');
  void flash(0xffd166, 0.85, 0.35);
  setBg(11);
  void sound.play('sfx', { sprite: 'win' });

  const champ = buildAnimationFighter(app, speed, {
    index: 40,
    name: 'CAMPEÓN',
    team: 'L',
    gender: 'male',
    weapon: 'broadsword',
  });
  const panther = buildAnimationFighter(app, speed, {
    index: 41,
    name: 'panther',
    team: 'L',
    type: 'pet',
    petName: 'panther',
  });
  const scene5Fighters = [champ, panther];
  await waitLoaded(scene5Fighters);
  if (aborted()) return { blob: null, url: null, ext };

  champ.animation.container.position.set(W / 2, GROUND_Y + 12);
  champ.animation.setGiantScale(1.35);
  panther.animation.container.position.set(W / 2 - 75, GROUND_Y + 14);
  app.stage.addChild(champ.animation.container, panther.animation.container);
  champ.animation.setAnimation('win');
  panther.animation.setAnimation('idle');

  // Lluvia de pétalos de victoria
  for (let i = 0; i < 36; i++) {
    const petal = new AnimatedSprite(miscSheet?.animations.petals ?? []);
    petal.filters = [new ColorOverlayFilter({ color: Math.random() * 0xffffff, alpha: 0.55 })];
    petal.x = 60 + Math.random() * (W - 120);
    petal.y = -10 - Math.random() * 80;
    petal.width = 10;
    petal.height = 10;
    petal.animationSpeed = 0.25 + Math.random() * 0.35;
    petal.zIndex = 2700;
    petal.play();
    app.stage.addChild(petal);
    void animate(2.8, (p) => {
      if (!petal.destroyed) petal.y = lerp(-20, H - 25, p);
    });
  }

  const endCard = new Container();
  endCard.zIndex = 3400;
  const cardBg = new Graphics()
    .roundRect(-215, -52, 430, 104, 12)
    .fill({ color: 0x160a04, alpha: 0.88 })
    .stroke({ width: 2.5, color: 0xffd166 });
  const endT1 = trailerTitle('⚔️ LA BRUTE DEMO', 30, ['#fff6b0', '#ffb700', '#c82800']);
  endT1.anchor.set(0.5);
  endT1.y = -20;
  endT1.filters = [new OutlineFilter({ thickness: 2, color: 0x000000 })];
  const endT2 = trailerTitle('1 VS 1 · TIENDA · SÚPER GIGANTE · BATTLE ROYALE · FATALITIES', 11, [
    '#ffffff',
    '#ffd166',
    '#f59e0b',
  ]);
  endT2.anchor.set(0.5);
  endT2.y = 10;
  const endT3 = trailerTitle('¡JUEGA YA EN TU NAVEGADOR!', 16, ['#80ffdb', '#4cc9f0', '#3a86ff']);
  endT3.anchor.set(0.5);
  endT3.y = 32;
  endCard.addChild(cardBg, endT1, endT2, endT3);
  endCard.position.set(W / 2, 86);
  app.stage.addChild(endCard);

  await animate(2.8, (p) => {
    const s = p < 0.2 ? lerp(2.2, 1, easeOutBack(p / 0.2)) : 1 + Math.sin(p * Math.PI * 3) * 0.025;
    endCard.scale.set(s);
  });

  // Detener grabación y devolver el archivo de video generado
  app.ticker.remove(emberTick);
  reportLog('🎬 Finalizando y empaquetando archivo de video...');
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
  }
  const blob = await recordingDone;
  const url = blob ? URL.createObjectURL(blob) : null;

  if (blob && isRecordingMode) {
    try {
      reportLog(`📦 Subiendo video (${(blob.size / 1024 / 1024).toFixed(2)} MB)...`);
      await fetch(`http://127.0.0.1:3198/upload?ext=${ext}`, {
        method: 'POST',
        mode: 'no-cors',
        body: new Blob([blob], { type: 'text/plain' }),
      });
    } catch (err) {
      reportLog(`Error subiendo video: ${String(err)}`);
    }
  }
  (globalThis as any).__promoVideoDone = true;

  reportLog('✅ ¡Video promocional completado! Puedes volver a verlo o descargarlo.');
  return { blob, url, ext };
};
