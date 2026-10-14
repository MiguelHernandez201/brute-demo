// Demo: fatality al estilo Mortal Kombat cuando cae el brute perdedor en el modo 1 vs 1.
// Destello, la cámara se acerca al caído, sangre y muerte en cámara lenta, y el letrero "FATALITY".
// Todo se anima con el ticker de la pelea: se detiene con la pausa y respeta la velocidad (x1 / x2).
import { DeathStep } from '@labrute/core';
import { sound } from '@pixi/sound';
import { Application, Container, FillGradient, Graphics, Text, Ticker } from 'pixi.js';
import { GlowFilter } from 'pixi-filters/glow';
import { death } from './death';
import { AnimationFighter, findFighter } from './utils/findFighter';
import { isHudLayer } from './utils/hud';

const ZOOM = 1.7;
const SLOW_MOTION = 0.45;
const GRAVITY = 520;
const MAX_SPLATS = 70;
const BLOOD = [0x4a0000, 0x7a0000, 0xa30000, 0xc81010];

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)] as T;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const easeOutBack = (p: number) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;

// Solo la caída del brute principal (no la de sus mascotas) se remata con fatality
export const isFatalityDeath = (fighters: AnimationFighter[], step: DeathStep) => {
  const fighter = findFighter(fighters, step.f);
  return !!fighter && fighter.type === 'brute' && !fighter.master;
};

// Voz grave del anunciador (síntesis de voz del navegador), solo si los efectos están activos
const announce = () => {
  try {
    if (!sound.exists('sfx') || !sound.volume('sfx') || !('speechSynthesis' in window)) return;
    const voice = new SpeechSynthesisUtterance('Fatality');
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

export const fatality = async (
  app: Application,
  fighters: AnimationFighter[],
  step: DeathStep,
  speed: React.RefObject<number>,
) => {
  const victim = findFighter(fighters, step.f);
  const { stage, ticker } = app;
  if (!victim || !stage || !ticker) {
    death(fighters, step, speed, false);
    return;
  }
  const killer = fighters.find((f) => f.type === 'brute' && !f.master && f.team !== victim.team && !f.dead);
  const W = app.screen.width;
  const H = app.screen.height;
  const alive = () => !stage.destroyed;
  // Cámara lenta: afecta a la sangre mientras la cámara está cerca
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

  // --- Cámara: acercamiento con pivote y temblor, sin salirse del escenario ---
  const camera = { z: 1, fx: W / 2, fy: H / 2, shake: 0 };
  const applyCamera = () => {
    if (!alive()) return;
    const hw = W / 2 / camera.z;
    const hh = H / 2 / camera.z;
    const sx = camera.shake ? rand(-camera.shake, camera.shake) : 0;
    const sy = camera.shake ? rand(-camera.shake, camera.shake) : 0;
    stage.pivot.set(clamp(camera.fx + sx, hw, W - hw), clamp(camera.fy + sy, hh, H - hh));
    stage.position.set(W / 2, H / 2);
    stage.scale.set(camera.z);
  };
  ticker.add(applyCamera);
  const shake = (intensity: number, seconds: number) =>
    animate(seconds, (p) => {
      camera.shake = intensity * (1 - p);
    });

  // --- Capas: fondo oscurecido (bajo los luchadores) y destello (encima de todo) ---
  const shade = new Graphics().rect(0, 0, W, H).fill(0x160000);
  shade.alpha = 0;
  shade.zIndex = -0.5;
  shade.eventMode = 'none';
  const flash = new Graphics().rect(0, 0, W, H).fill(0xffffff);
  flash.alpha = 0;
  flash.zIndex = 2000;
  flash.eventMode = 'none';
  stage.addChild(shade, flash);
  const flashTo = (color: number, alpha: number, seconds: number) => {
    flash.clear().rect(0, 0, W, H).fill(color);
    return animate(seconds, (p) => {
      flash.alpha = alpha * (1 - p);
    });
  };

  // El HUD superior se aparta mientras la cámara está cerca
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
  const bloodTick = (tk: Ticker) => {
    if (!alive()) {
      ticker.remove(bloodTick);
      return;
    }
    const dt = elapsed(tk) * timeScale;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i] as Drop;
      d.vy += GRAVITY * dt;
      d.g.x += d.vx * dt;
      d.g.y += d.vy * dt;
      if (d.vy > 0 && d.g.y >= d.ground) {
        if (splats < MAX_SPLATS) {
          splats += 1;
          const splat = new Graphics()
            .ellipse(0, 0, d.r * rand(1.8, 3.4), d.r * rand(0.5, 0.9))
            .fill({ color: d.color, alpha: 0.85 });
          splat.position.set(d.g.x, d.ground);
          splat.zIndex = 1;
          splat.eventMode = 'none';
          stage.addChild(splat);
        }
        d.g.destroy();
        drops.splice(i, 1);
      }
    }
  };
  ticker.add(bloodTick);

  const fighterX = () => victim.animation.container.x;
  const groundY = () => victim.animation.container.y;
  const away = killer ? Math.sign(fighterX() - killer.animation.container.x) || 1 : 1;
  const splatter = (x: number, y: number, count: number, spread: number, lift: [number, number]) => {
    for (let i = 0; i < count; i++) {
      const r = rand(0.9, 2.6);
      const color = pick(BLOOD);
      const g = new Graphics().circle(0, 0, r).fill(color);
      g.position.set(x + rand(-5, 5), y + rand(-8, 8));
      g.zIndex = 1500;
      g.eventMode = 'none';
      stage.addChild(g);
      drops.push({
        g,
        r,
        color,
        vx: away * rand(10, spread) + rand(-45, 45),
        vy: -rand(lift[0], lift[1]),
        ground: groundY() + rand(-5, 9),
      });
    }
  };

  // ===== 1. Golpe final: destello, temblor y la cámara se acerca =====
  void sound.play('sfx', { sprite: 'hammer' });
  camera.fx = fighterX();
  camera.fy = groundY() - 35;
  void flashTo(0xffffff, 0.85, 0.25);
  void shake(6, 0.45);
  void fadeHud(0, 0.3);
  void animate(0.4, (p) => {
    shade.alpha = 0.75 * p;
  });
  timeScale = SLOW_MOTION;
  const zoomIn = animate(0.6, (p) => {
    camera.z = lerp(1, ZOOM, easeOutCubic(p));
  });

  // ===== 2. Muerte en cámara lenta con chorro de sangre =====
  await wait(0.12);
  if (!alive()) return;
  victim.animation.animationSpeed = SLOW_MOTION;
  const dropped = victim.animation.waitForEvent('death:drop');
  death(fighters, step, speed, false);
  splatter(fighterX(), groundY() - 32, 45, 150, [80, 240]);
  await zoomIn;
  if (!alive()) return;
  splatter(fighterX(), groundY() - 28, 20, 110, [40, 170]);
  await dropped;
  if (!alive()) return;
  // Al tocar el suelo: más sangre y un golpe seco de cámara
  victim.animation.animationSpeed = 1;
  splatter(fighterX() + away * 12, groundY() - 6, 25, 90, [20, 90]);
  void shake(4, 0.3);
  await wait(0.35);
  if (!alive()) return;

  // ===== 3. La cámara se aleja =====
  const zoomFrom = camera.z;
  const focusFrom = { x: camera.fx, y: camera.fy };
  await animate(0.5, (p) => {
    const e = easeInOutCubic(p);
    camera.z = lerp(zoomFrom, 1, e);
    camera.fx = lerp(focusFrom.x, W / 2, e);
    camera.fy = lerp(focusFrom.y, H / 2, e);
    timeScale = lerp(SLOW_MOTION, 1, e);
  });
  if (!alive()) return;

  // ===== 4. "FATALITY" =====
  const title = new Text({
    text: 'FATALITY',
    style: {
      fontFamily: 'GameFont',
      fontSize: 60,
      letterSpacing: 3,
      fill: new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: '#ff5a4a' },
          { offset: 0.45, color: '#d40000' },
          { offset: 1, color: '#5a0000' },
        ],
        textureSpace: 'local',
      }),
      stroke: { color: 0x120000, width: 7, join: 'round' },
      dropShadow: { color: 0x000000, alpha: 0.9, blur: 4, distance: 5, angle: Math.PI / 2 },
    },
  });
  title.anchor.set(0.5);
  title.position.set(W / 2, H * 0.42);
  title.zIndex = 2100;
  title.eventMode = 'none';
  title.alpha = 0;
  const glow = new GlowFilter({ color: 0xff1a1a, distance: 14, outerStrength: 0, innerStrength: 0, quality: 0.3 });
  title.filters = [glow];
  const titleLayer = new Container();
  titleLayer.zIndex = 2100;
  titleLayer.addChild(title);
  stage.addChild(titleLayer);

  await animate(0.32, (p) => {
    const e = easeOutBack(p);
    title.scale.set(lerp(3.2, 1, e));
    title.alpha = Math.min(1, p * 2.5);
  });
  if (!alive()) return;
  // Impacto del letrero
  void sound.play('sfx', { sprite: 'bomb' });
  announce();
  void flashTo(0xff0000, 0.45, 0.4);
  void animate(0.35, (p) => {
    camera.z = 1 + 0.06 * Math.sin(p * Math.PI);
  });
  void shake(8, 0.5);
  if (killer && !killer.trapped && !killer.stunned) killer.animation.setAnimation('strengthen');
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

  // ===== 5. Todo vuelve a la normalidad (las manchas de sangre se quedan) =====
  await Promise.all([
    animate(0.45, (p) => {
      titleLayer.alpha = 1 - p;
      shade.alpha = 0.75 * (1 - p);
    }),
    fadeHud(1, 0.45),
  ]);
  ticker.remove(applyCamera);
  if (!alive()) return;
  stage.pivot.set(0, 0);
  stage.position.set(0, 0);
  stage.scale.set(1);
  titleLayer.destroy({ children: true });
  shade.destroy();
  flash.destroy();
};
