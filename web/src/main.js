import { Application, Assets, Filter, Rectangle, TextureSource } from 'pixi.js';

// Pixi dibuja los filtros (contornos de textos, iconos, colores de mascotas) a resolución 1
// por defecto; con 'inherit' usan la resolución real del lienzo y no se pixelan.
Filter.defaultOptions.resolution = 'inherit';
// Mipmaps: las imágenes grandes que se muestran reducidas (retratos, hojas de sprites x3) se ven suaves y sin dientes.
TextureSource.defaultOptions.autoGenerateMipmaps = true;
import { gsap } from 'gsap';
import { createFight, createRoyale } from './sim.ts';
import { StepType } from '@labrute/core';
import { createRenderer } from './renderer.ts';
import { setupFight } from './fight/setupFight.ts';
import { fatalityOptions } from './fight/fatality.ts';
import { setFightDisposing } from './fight/utils/lifecycle.ts';
import { renderQuality } from './fight/FighterHolder.ts';
import { fightApproach } from './fight/utils/fightPositions.ts';
import { sound } from '@pixi/sound';
import { sfx, sounds } from './sfx.ts';
import { renderShop, setCurrentGear, setShopNames, takePurchases } from './shop.js';

const $ = (id) => document.getElementById(id);
const renderer = createRenderer();
const speed = { current: 1 };
let app = null;
let run = 0;

const theme = {
  palette: { secondary: { main: '#c8a46b' }, hpBar: { main: '#4ade80', dark: '#166534' }, error: { main: '#ef4444' } },
};
const t = (key, opts) => (key === 'fight.wonTheFight' ? `${opts.brute} ganó la pelea` : key);

const loadSheet = (path, cachePrefix) => Assets.load({ src: path, data: { cachePrefix } });

// Sonido: mismos audios y sprites que la pelea original
const audio = { sfx: true, music: true };
function setupSounds() {
  if (!sound.exists('background')) sound.add('background', `${import.meta.env.BASE_URL}sfx/background.mp3`);
  if (!sound.exists('sfx')) {
    const sprites = {};
    sounds.forEach((name) => {
      const s = sfx.spritemap[name];
      sprites[name] = { start: s?.start ?? 0, end: s?.end ?? 0, loop: s?.loop ?? false };
    });
    sound.add('sfx', { url: sfx.resources[0], sprites, preload: true });
  }
  applyVolumes();
}
function applyVolumes() {
  sound.volumeAll = 1;
  if (sound.exists('sfx')) sound.volume('sfx', audio.sfx ? 1 : 0);
  if (sound.exists('background')) sound.volume('background', audio.music ? 0.6 : 0);
  $('sfx').textContent = audio.sfx ? '🔊 Efectos' : '🔇 Efectos';
  $('music').textContent = audio.music ? '🎵 Música' : '🔇 Música';
}

async function destroyApp() {
  setFightDisposing(true);
  sound.stopAll();
  // Voz de la fatality (síntesis de voz del navegador)
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* sin síntesis de voz */
  }
  gsap.killTweensOf('*');
  gsap.globalTimeline.clear();
  if (app) {
    // Foto del último fotograma: se queda en pantalla hasta que la siguiente pelea dibuje su escenario
    // (evita el parpadeo negro mientras se simula la nueva pelea y se crea el nuevo lienzo)
    const snapshot = takeSnapshot(app);
    try {
      app.ticker?.stop();
      app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false, context: true });
    } catch (e) {
      console.warn(e);
    }
    app = null;
    if (snapshot) {
      $('canvas')
        .querySelectorAll('.snapshot')
        .forEach((el) => el.remove());
      $('canvas').appendChild(snapshot);
    }
  }
}

function takeSnapshot(application) {
  try {
    const c = application.renderer.extract.canvas({
      target: application.stage,
      frame: new Rectangle(0, 0, 500, 300),
      resolution: application.renderer.resolution,
    });
    c.className = 'snapshot';
    return c;
  } catch (e) {
    console.warn('snapshot', e);
    return null;
  }
}

// Espera a que el nuevo lienzo tenga el escenario dibujado y entonces cambia la foto por la pelea en vivo
function revealWhenReady(a, id) {
  const started = performance.now();
  const check = () => {
    if (id !== run) return;
    const ready = a.stage && a.stage.children.length >= 3;
    if (!ready && performance.now() - started < 4000) return requestAnimationFrame(check);
    // Dos fotogramas más para asegurar que ya se pintó
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (id !== run) return;
        a.canvas.classList.add('ready');
        $('canvas')
          .querySelectorAll('.snapshot')
          .forEach((el) => {
            el.classList.add('fade');
            setTimeout(() => el.remove(), 250);
          });
      }),
    );
  };
  requestAnimationFrame(check);
}

// Última pelea: brutes y ganador, para el botón "Desafiar"
let last = null;

// Modo actual: '1v1' (dos jugadores con tienda) o 'royale' (todos contra todos)
let mode = '1v1';
let royaleCount = 6;

async function startFight(n1, n2, keep = {}) {
  const id = ++run;
  await destroyApp();
  $('again').disabled = true;
  // La pelea se simula turno a turno mientras se anima; las compras entran antes del siguiente turno
  const { brutes, fight } = createFight(n1, n2, keep, takePurchases, setCurrentGear);
  if (id !== run) return;
  // Los brutes guardan lo comprado: el campeón lo conserva al "Desafiar". El ganador se conoce al terminar.
  last = { brutes, fight };
  setCurrentGear(brutes);
  await playFight(id, fight);
}

// Battle royale: N brutes al azar, todos contra todos
async function startRoyale(count) {
  const id = ++run;
  await destroyApp();
  $('again').disabled = true;
  const { fight } = createRoyale(count);
  if (id !== run) return;
  last = null;
  renderRoster(fight);
  await playFight(id, fight);
}

// Lista de participantes del royale: se actualiza con cada caída según avanza la animación
let rosterFight = null;
function renderRoster(fight) {
  rosterFight = fight;
  const fighters = JSON.parse(fight.fighters).filter((f) => f.type === 'brute' && !f.master);
  const total = fighters.length;
  const state = new Map(fighters.map((f) => [f.index, { name: f.name, out: 0, hp: f.hp, maxHp: f.maxHp }]));
  let fallen = 0;
  let winner;
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hpColor = (pct) => (pct > 50 ? '#4ade80' : pct > 25 ? '#facc15' : '#ef4444');
  const draw = () => {
    const rows = [...state.entries()]
      // En pie primero; los eliminados después, del último en caer al primero
      .sort(([, a], [, b]) => (a.out === 0 ? -1 : b.out === 0 ? 1 : b.out - a.out))
      .map(([index, s]) => {
        const status = index === winner ? '🏆 Ganador' : s.out ? `Eliminado · puesto ${total - s.out + 1}` : '';
        const pct = s.out ? 0 : Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100));
        return `<li data-index="${index}" class="${index === winner ? 'win' : s.out ? 'out' : ''}">
          <div class="roster-top"><span>${esc(s.name)}</span><small class="hp-text">${s.out ? '' : `${Math.max(0, Math.round(s.hp))}/${s.maxHp}`}</small></div>
          <div class="roster-bar"><div style="width:${pct}%;background:${hpColor(pct)}"></div></div>
          ${status ? `<small>${status}</small>` : ''}
        </li>`;
      })
      .join('');
    $('roster').innerHTML = `<div class="shop-name">Battle Royale</div>
      <div class="shop-label">${total - fallen} de ${total} en pie</div><ol class="roster">${rows}</ol>`;
  };
  // Vida en vivo: se lee de los luchadores de la animación (así va al ritmo de los golpes que se ven)
  const tick = setInterval(() => {
    if (rosterFight !== fight) return clearInterval(tick);
    const live = fight.liveFighters?.();
    if (!live) return;
    for (const f of live) {
      const s = state.get(f.index);
      if (!s || s.out || f.master) continue;
      if (s.hp === f.hp) continue;
      s.hp = f.hp;
      const li = $('roster').querySelector(`li[data-index="${f.index}"]`);
      if (!li) continue;
      const pct = Math.max(0, Math.min(100, (f.hp / s.maxHp) * 100));
      const bar = li.querySelector('.roster-bar > div');
      bar.style.width = `${pct}%`;
      bar.style.background = hpColor(pct);
      li.querySelector('.hp-text').textContent = `${Math.max(0, Math.round(f.hp))}/${s.maxHp}`;
    }
  }, 150);
  fight.onStep = (step) => {
    if (step.a === StepType.Death && state.has(step.f) && !state.get(step.f).out) {
      fallen += 1;
      state.get(step.f).out = fallen;
      draw();
    } else if (step.a === StepType.End) {
      const w = state.get(step.w);
      if (w && w.out) {
        w.out = 0;
        fallen -= 1;
      }
      winner = step.w;
      draw();
    }
  };
  draw();
}

async function playFight(id, fight) {
  globalThis.__lastFight = fight; // depuración
  $('status').textContent = '';
  setFightDisposing(false);
  const a = new Application();
  // El escenario lógico es 500x300 (como el juego), pero se muestra más grande:
  // se dibuja a la resolución real de pantalla para que no se vea borroso.
  const displayWidth = Math.min(800, $('canvas').clientWidth || 800);
  const quality = Math.min(4, (window.devicePixelRatio || 1) * (displayWidth / 500));
  renderQuality.value = quality;
  await a.init({ backgroundColor: 0xfbf7c0, width: 500, height: 300, resolution: quality, antialias: true });
  if (id !== run) {
    a.destroy({ removeView: true });
    return;
  }
  app = a;
  // El lienzo nuevo entra oculto bajo la foto de la pelea anterior
  $('canvas')
    .querySelectorAll('canvas:not(.snapshot)')
    .forEach((el) => el.remove());
  a.canvas.classList.add('live');
  $('canvas').prepend(a.canvas);
  revealWhenReady(a, id);
  a.ticker.speed = 0.5;
  const spritesheets = {
    thrownWeapons: await loadSheet(
      `${import.meta.env.BASE_URL}images/game/thrown-weapons.json`,
      'fight/thrownWeapons/',
    ),
    misc: await loadSheet(`${import.meta.env.BASE_URL}images/game/misc.json`, 'fight/misc/'),
    skills: await loadSheet(`${import.meta.env.BASE_URL}images/game/skills.json`, 'fight/skills/'),
  };
  if (id !== run) return;
  setupSounds();
  // La fuente del juego debe estar cargada antes de crear los textos de Pixi
  try {
    await document.fonts.load('20px GameFont');
  } catch {
    /* usa la fuente por defecto */
  }
  await setupFight(
    theme,
    fight,
    a,
    speed,
    t,
    () => {},
    renderer,
    spritesheets,
    false,
    () => id !== run,
  );
  if (id === run) {
    $('again').disabled = false;
    scheduleAutoChallenge(id);
  }
}

// Desafío continuo: al terminar cada pelea, cuenta atrás y desafía solo
const AUTO_DELAY = 3;
let autoChallenge = false;
let autoTimer = null;
const againLabel = () => $('again').dataset.label || '⚔️ Desafiar';
function cancelAutoChallenge() {
  clearInterval(autoTimer);
  autoTimer = null;
  $('again').textContent = againLabel();
}
function scheduleAutoChallenge(id) {
  cancelAutoChallenge();
  if (!autoChallenge) return;
  let left = AUTO_DELAY;
  $('again').textContent = `${againLabel()} (${left})`;
  autoTimer = setInterval(() => {
    // Si se cambió de pelea, se desactivó o está en pausa, no seguir
    if (id !== run || !autoChallenge) return cancelAutoChallenge();
    if (app && !app.ticker.started) return;
    left -= 1;
    if (left > 0) {
      $('again').textContent = `${againLabel()} (${left})`;
      return;
    }
    cancelAutoChallenge();
    $('again').click();
  }, 1000);
}

let names = ['', ''];
const showError = (e) => {
  console.error(e);
  $('status').textContent = 'Error: ' + e.message;
};
const begin = (keep) => startFight(...names, keep).catch(showError);
const beginRoyale = () => startRoyale(royaleCount).catch(showError);
function enterArena(newMode) {
  mode = newMode;
  $('arena').classList.toggle('royale', mode === 'royale');
  $('again').dataset.label = mode === 'royale' ? '👑 Nueva ronda' : '⚔️ Desafiar';
  $('again').textContent = $('again').dataset.label;
  $('autoLabel').textContent = mode === 'royale' ? 'Rondas continuas' : 'Desafiar continuamente';
  $('back').textContent = mode === 'royale' ? 'Volver al menú' : 'Cambiar nombres';
  $('setup').style.display = 'none';
  $('arena').style.display = 'block';
}
$('go').onclick = () => {
  names = [$('n1').value.trim() || 'Jugador 1', $('n2').value.trim() || 'Jugador 2'];
  enterArena('1v1');
  setShopNames(...names);
  begin();
};
$('royaleGo').onclick = () => {
  royaleCount = Math.max(3, Math.min(10, +$('royaleCount').value || 6));
  try {
    localStorage.setItem('brute-demo-royale-count', String(royaleCount));
  } catch {
    /* sin storage */
  }
  enterArena('royale');
  beginRoyale();
};
try {
  $('royaleCount').value = localStorage.getItem('brute-demo-royale-count') || '6';
} catch {
  /* sin storage */
}
$('royaleCount').oninput = (e) => {
  $('royaleCountValue').textContent = e.target.value;
};
$('royaleCountValue').textContent = $('royaleCount').value;
// Desafiar: el ganador conserva su brute; solo el perdedor recibe uno nuevo.
// En el royale: nueva ronda con brutes nuevos.
$('again').onclick = () => {
  cancelAutoChallenge();
  if (mode === 'royale') return beginRoyale();
  if (!last) return begin();
  const [b1, b2] = last.brutes;
  begin(last.fight.winnerId === b1.id ? { b1 } : { b2 });
};
try {
  autoChallenge = localStorage.getItem('brute-demo-auto') === 'true';
} catch {
  /* sin storage */
}
$('auto').checked = autoChallenge;
// Celebración del ganador tras la fatality (se recuerda en este navegador)
try {
  fatalityOptions.celebrate = localStorage.getItem('brute-demo-celebrate') !== 'false';
} catch {
  /* sin storage */
}
$('celebrate').checked = fatalityOptions.celebrate;
$('celebrate').onchange = (e) => {
  fatalityOptions.celebrate = e.target.checked;
  try {
    localStorage.setItem('brute-demo-celebrate', String(fatalityOptions.celebrate));
  } catch {
    /* sin storage */
  }
};
$('auto').onchange = (e) => {
  autoChallenge = e.target.checked;
  try {
    localStorage.setItem('brute-demo-auto', String(autoChallenge));
  } catch {
    /* sin storage */
  }
  // Si se activa con una pelea ya terminada, arranca la cuenta atrás
  if (autoChallenge && !$('again').disabled) scheduleAutoChallenge(run);
  else if (!autoChallenge) cancelAutoChallenge();
};
$('back').onclick = async () => {
  cancelAutoChallenge();
  rosterFight = null;
  run++;
  await destroyApp();
  $('canvas').innerHTML = '';
  $('arena').style.display = 'none';
  $('setup').style.display = 'flex';
};
$('speed').onclick = () => {
  speed.current = speed.current === 1 ? 2 : 1;
  $('speed').textContent = `Velocidad x${speed.current}`;
};
$('pause').onclick = () => {
  if (!app) return;
  if (app.ticker.started) {
    app.ticker.stop();
    sound.pauseAll();
    $('pause').textContent = '▶ Reanudar';
  } else {
    app.ticker.start();
    sound.resumeAll();
    $('pause').textContent = '⏸ Pausa';
  }
};

// Preferencias de sonido (se recuerdan en este navegador)
try {
  Object.assign(audio, JSON.parse(localStorage.getItem('brute-demo-audio') || '{}'));
} catch {
  /* sin storage */
}
const saveAudio = () => {
  try {
    localStorage.setItem('brute-demo-audio', JSON.stringify(audio));
  } catch {
    /* sin storage */
  }
};
$('sfx').onclick = () => {
  audio.sfx = !audio.sfx;
  saveAudio();
  applyVolumes();
};
$('music').onclick = () => {
  audio.music = !audio.music;
  saveAudio();
  applyVolumes();
};
applyVolumes();

// Acercamiento: cuánto se acercan las posiciones de cada bando al centro.
// Se aplica en vivo: cada vez que un luchador vuelve a su sitio usa el valor actual.
const setApproach = (v) => {
  fightApproach.value = +v;
  $('approach').value = v;
  $('approachValue').textContent = `${v}%`;
};
try {
  setApproach(localStorage.getItem('brute-demo-approach') ?? 0);
} catch {
  setApproach(0);
}
$('approach').oninput = (e) => {
  setApproach(e.target.value);
  try {
    localStorage.setItem('brute-demo-approach', e.target.value);
  } catch {
    /* sin storage */
  }
};

renderShop();

const royaleParam = new URLSearchParams(location.search).get('royale');
if (royaleParam) {
  $('royaleCount').value = royaleParam;
  $('royaleGo').click();
}

const auto = new URLSearchParams(location.search).get('auto');
if (auto) {
  const [x, y] = auto.split(',');
  $('n1').value = x || '';
  $('n2').value = y || '';
  $('go').click();
}
