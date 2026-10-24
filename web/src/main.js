import { Application, Assets, Filter, Rectangle, TextureSource, UPDATE_PRIORITY } from 'pixi.js';

// Pixi dibuja los filtros (contornos de textos, iconos, colores de mascotas) a resolución 1
// por defecto; con 'inherit' usan la resolución real del lienzo y no se pixelan.
Filter.defaultOptions.resolution = 'inherit';
// Mipmaps: las imágenes grandes que se muestran reducidas (retratos, hojas de sprites x3) se ven suaves y sin dientes.
TextureSource.defaultOptions.autoGenerateMipmaps = true;
import { gsap } from 'gsap';
import { BANDOS_GIFTS, bandosGift, createRoyale } from './sim.ts';
import { StepType } from '@labrute/core';
import { createRenderer } from './renderer.ts';
import { setupFight } from './fight/setupFight.ts';
import { FATALITY_VERBS } from './fight/fatality.ts';
import { royaleColorCss, setSideColors } from './fight/royaleTags.ts';
import { crowdQuality } from './fight/crowdQuality.ts';
import { setFightDisposing } from './fight/utils/lifecycle.ts';
import { arenaBackground, BACKGROUND_BLEED, musicTrack, renderQuality } from './fight/FighterHolder.ts';
import { clockConfig } from './fight/royaleClock.ts';
import { applyLayout, onLayoutChange, resetLayout, toggleEdit } from './ttLayout.js';
import { royaleZoom, setRoyaleView } from './fight/royaleCamera.ts';
import { sound } from '@pixi/sound';
import { sfx, sounds } from './sfx.ts';
import { playPromotionalTrailer } from './trailer.ts';
import { BOOST_HP, boostPet } from './engine/ultimates.ts';
import { connectLive } from './live.js';
import { HELPER_LABELS } from './ayudantes.ts';
import { CEPEDA_FACE, RESTREPO_FACE } from './ayudantesCaras.ts';
import { ABELARDO_LOOK, CHIEF_FACES, CHUCK_LOOK, PETRO_LOOK, installChuck, teamLook } from './chuck.ts';
// Personajes especiales con piezas dibujadas para el muñeco además de las del juego (ver chuck.ts): se meten antes de
// la primera pelea
installChuck();

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
const audio = { sfx: true, music: true, sfxVol: 1, musicVol: 0.6, track: 'background' };
// Pistas de música: la de la pelea original y la del menú (sin usar en el juego original)
const TRACKS = ['background', 'menu'];
// Voces grabadas del anunciador (suenan con los efectos): "Multi kill!" (ver fight/multiKill) y las de la fatality,
// "Finish him!" / "Finish her!" y "Fatality!" (ver fight/fatality). Y la ráfaga de la minigun (ver fight/minigun), que
// tampoco está entre los sonidos de la pelea original
const VOICES = ['multikill', 'finishhim', 'finishher', 'fatality', 'minigun'];
// Al irse a otra ventana (la de TikTok LIVE Studio, por ejemplo) el juego tiene que seguir sonando: de fábrica,
// @pixi/sound lo calla todo, música y efectos, en cuanto la ventana pierde el foco
sound.disableAutoPause = true;
function setupSounds() {
  for (const track of TRACKS) {
    if (!sound.exists(track)) sound.add(track, `${import.meta.env.BASE_URL}sfx/${track}.mp3`);
  }
  for (const voice of VOICES) {
    if (!sound.exists(voice)) sound.add(voice, { url: `${import.meta.env.BASE_URL}sfx/${voice}.mp3`, preload: true });
  }
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
  if (sound.exists('sfx')) sound.volume('sfx', audio.sfx ? audio.sfxVol : 0);
  for (const voice of VOICES) if (sound.exists(voice)) sound.volume(voice, audio.sfx ? audio.sfxVol : 0);
  if (!TRACKS.includes(audio.track)) audio.track = 'background';
  musicTrack.name = audio.track;
  for (const track of TRACKS) if (sound.exists(track)) sound.volume(track, audio.music ? audio.musicVol : 0);
  $('giftTrack').value = audio.track;
  // Botones de solo icono: apagados se ven oscuros (y la música, con la nota tachada)
  $('sfx').textContent = audio.sfx ? '🔊' : '🔇';
  for (const [id, on] of [
    ['sfx', audio.sfx],
    ['music', audio.music],
  ]) {
    $(id).classList.toggle('off', !on);
    $(id).setAttribute('aria-pressed', String(on));
  }
  // Panel G: mismos interruptores y volúmenes
  $('giftMusic').classList.toggle('off', !audio.music);
  $('giftSfx').classList.toggle('off', !audio.sfx);
  $('giftSfx').textContent = audio.sfx ? '🔊 Efectos' : '🔇 Efectos';
  $('giftMusicVol').value = String(Math.round(audio.musicVol * 100));
  $('giftSfxVol').value = String(Math.round(audio.sfxVol * 100));
}
// Botones de la arena: solo icono; lo que hacen va en su título (sale al pasar el ratón) y para lectores de pantalla
function setControl(id, icon, label) {
  $(id).textContent = icon;
  $(id).title = label;
  $(id).setAttribute('aria-label', label);
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

// Modo actual: 'royale' (todos contra todos) o 'trailer' (vídeo promocional)
let mode = 'royale';
let royaleCount = 6;

// Modo TikTok: pantalla vertical 9:16 para transmitir en directo (ver index.html, body.tiktok). Letras grandes, sin
// botones (la tecla C los muestra u oculta), rondas seguidas solas con el ganador en grande entre una y otra, y un
// ranking de victorias que se recuerda en este navegador. `round`: número de la ronda en curso
const tiktok = { on: false, round: 0 };
// Segundos con el ganador en pantalla antes de la siguiente ronda
const TIKTOK_DELAY = 8;
const TT_AUTO_KEY = 'brute-demo-tt-auto';
const TT_TIMER_KEY = 'brute-demo-tt-timer';
// El número de ronda se recuerda en este navegador, como el marcador de Petro vs Abelardo: si se recarga la página (con
// F5, desde OBS o porque el servidor de desarrollo recarga al cambiar un archivo) no vuelve a "Ronda 1". Se borra con
// 🗑️ Limpiar ranking
const TT_ROUND_KEY = 'brute-demo-tt-round';
const loadRound = () => {
  try {
    return Math.max(0, Math.round(+localStorage.getItem(TT_ROUND_KEY)) || 0);
  } catch {
    return 0;
  }
};
const saveRound = () => {
  try {
    localStorage.setItem(TT_ROUND_KEY, String(tiktok.round));
  } catch {
    /* sin storage */
  }
};
const RANKING_KEY = 'brute-demo-tiktok-ranking';
const escHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let ranking = {};
try {
  ranking = JSON.parse(localStorage.getItem(RANKING_KEY) || '{}');
} catch {
  /* sin storage */
}
const saveRanking = () => {
  try {
    localStorage.setItem(RANKING_KEY, JSON.stringify(ranking));
  } catch {
    /* sin storage */
  }
};
// Rondas ganadas y rivales eliminados de cada nombre, sumando todas las rondas
const scoreOf = (name) => (ranking[name] ??= { wins: 0, kills: 0 });
function renderRanking() {
  const top = Object.entries(ranking)
    .sort(([, a], [, b]) => b.kills - a.kills)
    .slice(0, 5);
  const rows = top
    .map(
      ([name, s], i) =>
        `<li><span>${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} ${escHtml(name)}</span><b>${s.kills} ☠️</b></li>`,
    )
    .join('');
  $('ttRanking').innerHTML =
    `<div class="tt-title">Ranking</div>${rows ? `<ol>${rows}</ol>` : '<p>Aún no hay ganadores</p>'}`;
}
function showWinner(name) {
  $('ttWinner').innerHTML = `<div class="tt-crown">🏆</div><div class="tt-name">${escHtml(name)}</div>
    <div class="tt-sub">¡gana la ronda ${tiktok.round}!</div><div class="tt-next" id="ttNext"></div>`;
  $('ttWinner').classList.add('show');
}
const hideWinner = () => $('ttWinner').classList.remove('show');

// ===== Modo Gustavo Petro vs Abelardo =====
// El royale del modo TikTok, en dos bandos (ver sim.createRoyale): solo pelean Gustavo Petro y Abelardo, sus jefes, y
// el chat los apoya (ver supportGift). Gana la ronda el bando cuyo jefe derriba al otro. (`dress`, la ropa del bando,
// era la de los espectadores cuando también peleaban: ver chuck.teamLook.) Cada bando, con su color en las etiquetas y
// la lista (naranja y celeste: ninguno de los de sus partidos)
const SIDES = [
  {
    id: 'petro',
    name: 'Petro',
    chief: 'Gustavo Petro',
    chiefLook: PETRO_LOOK,
    // (su ayudante: Iván Cepeda; el de Abelardo, José Manuel Restrepo, ver ayudantes.ts)
    helper: 'cepeda',
    color: 0xff9f43,
    dress: (gender) => teamLook('petro', gender),
  },
  {
    id: 'abelardo',
    name: 'Abelardo',
    chief: 'Abelardo',
    chiefLook: ABELARDO_LOOK,
    helper: 'restrepo',
    color: 0x4fb3ff,
    dress: (gender) => teamLook('abelardo', gender),
  },
];
// (la letra con la que se elige a cada presidente comentando)
const SIDE_LETTER = { petro: 'A', abelardo: 'B' };
const HELPER_FACES = { cepeda: CEPEDA_FACE, restrepo: RESTREPO_FACE };
const sideById = (id) => SIDES.find((s) => s.id === id);
const sideCss = (side) => `#${side.color.toString(16).padStart(6, '0')}`;
// `on`: en este modo; `score`: rondas ganadas por cada bando, que se recuerdan en este navegador
const bandos = { on: false, score: {} };
const BANDOS_SCORE_KEY = 'brute-demo-bandos-marcador';
try {
  bandos.score = JSON.parse(localStorage.getItem(BANDOS_SCORE_KEY) || '{}') || {};
} catch {
  /* sin storage */
}
const saveBandosScore = () => {
  try {
    localStorage.setItem(BANDOS_SCORE_KEY, JSON.stringify(bandos.score));
  } catch {
    /* sin storage */
  }
};
// Barra de arriba (en lugar de la cabecera): cada jefe con su cara, su vida y cuántos espectadores le apoyan, y en
// medio el marcador de rondas. Se arma una vez y luego solo se cambian la vida, los números y el marcador (se repinta
// cada 150 ms: rehacerla entera volvía a decodificar las caras). `live`: por bando, { hp, maxHp, fans } (sin ronda,
// vacío)
// (con bandos va dentro de ¿Cómo jugar?, formando un solo panel: renderBandosHowTo lo coloca. Se guarda aquí porque al
// repintar ese panel sale del documento)
const versusBox = $('ttVersus');
function renderVersus(live = {}) {
  const box = versusBox;
  if (!box.firstChild) {
    const half = (
      side,
      i,
    ) => `<div class="vs-side ${i ? 'right' : 'left'}" data-side="${side.id}" style="--c:${sideCss(side)}">
      <img class="vs-face" src="${CHIEF_FACES[side.id]}" alt="" draggable="false" />
      <div class="vs-info">
        <b class="vs-name"><span class="tt-letter">${SIDE_LETTER[side.id]}</span>${escHtml(side.name)}</b>
        <div class="vs-bar"><i></i></div>
        <small></small>
      </div>
    </div>`;
    const [a, b] = SIDES;
    box.innerHTML = `${half(a, 0)}<div class="vs-mid"><b data-score="${a.id}"></b><span>VS</span><b data-score="${b.id}"></b></div>${half(b, 1)}`;
  }
  for (const side of SIDES) {
    const s = live[side.id];
    const el = box.querySelector(`[data-side="${side.id}"]`);
    const pct = s ? Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100)) : 100;
    const width = `${pct}%`;
    const bar = el.querySelector('.vs-bar i');
    if (bar.style.width !== width) bar.style.width = width;
    const text = `${s ? `${Math.max(0, Math.round(s.hp))}/${s.maxHp}` : ''} · 👥 ${s?.fans ?? 0}`;
    const small = el.querySelector('small');
    if (small.textContent !== text) small.textContent = text;
    const score = String(bandos.score[side.id] ?? 0);
    const b = box.querySelector(`[data-score="${side.id}"]`);
    if (b.textContent !== score) b.textContent = score;
  }
}
// Pantalla del ganador: el bando, quien más le regaló en la ronda (`mvp`: { name, coins }) y el marcador
function showBandosWinner(sideId, mvp) {
  const side = sideById(sideId);
  if (!side) return;
  const [a, b] = SIDES;
  $('ttWinner').innerHTML = `<div class="tt-crown">🏆</div>
    <div class="tt-name bandos" style="color:${sideCss(side)}">¡Gana el bando de ${escHtml(side.name)}!</div>
    <div class="tt-sub">${mvp ? `⭐ ${escHtml(mvp.name)} · ${COIN_ICON}${mvp.coins}` : `ronda ${tiktok.round}`}</div>
    <div class="tt-sub">${escHtml(a.name)} ${bandos.score[a.id] ?? 0} – ${bandos.score[b.id] ?? 0} ${escHtml(b.name)}</div>
    <div class="tt-next" id="ttNext"></div>`;
  $('ttWinner').classList.add('show');
}

// Battle royale: N brutes al azar, todos contra todos
async function startRoyale(count) {
  const id = ++run;
  await destroyApp();
  $('again').disabled = true;
  if (tiktok.on) {
    tiktok.round += 1;
    saveRound();
    $('ttRound').textContent = `Ronda ${tiktok.round}`;
    hideWinner();
  }
  // (con bandos, solo los dos jefes: ver supportGift)
  const { fight } = bandos.on ? createRoyale(0, { sides: SIDES }) : createRoyale(count);
  if (id !== run) return;
  // (con bandos, el color de cada uno es el de su bando)
  setSideColors(bandos.on ? (index) => sideById(fight.sideOf(index))?.color : null);
  renderRoster(fight);
  // (los espectadores del directo que siguen por aquí vuelven a pelear: entran en cuanto empieza)
  if (!bandos.on) queueRecentViewers();
  await playFight(id, fight);
}

// Fotogramas por segundo (se muestran en la lista del royale para ver cuántos brutes aguanta la pantalla),
// con el nivel de la calidad automática: con muchos brutes se ahorra trabajo sin que se note
const QUALITY_LABELS = ['', ' ⚡', ' ⚡⚡'];
const QUALITY_TITLE =
  'Calidad automática: con muchos brutes en pie el sombreado y las sombras se precalculan, y con más todavía los que esperan respiran a menos fotogramas';
let fpsText = '';
let fpsClass = '';
(() => {
  let frames = 0;
  let since = performance.now();
  const loop = (now) => {
    frames += 1;
    if (now - since >= 1000) {
      const fps = Math.round((frames * 1000) / (now - since));
      frames = 0;
      since = now;
      fpsText = `${fps} fps${QUALITY_LABELS[crowdQuality.level] ?? ''}`;
      fpsClass = fps >= 50 ? 'fps-good' : fps >= 30 ? 'fps-ok' : 'fps-bad';
      $('giftFps').textContent = `${fps} fps${QUALITY_LABELS[crowdQuality.level] ?? ''}`;
      $('giftFps').className = fpsClass;
      const el = $('rosterFps');
      if (el) {
        el.textContent = fpsText;
        el.className = fpsClass;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();

// Un golpe crítico cuenta como "muy duro" desde esta parte de la vida máxima de quien lo recibe
const CRIT_BIG_PCT = 0.25;
// Lista de participantes del royale: cada uno con el color de su etiqueta en la arena (pasar el ratón por una fila lo
// resalta; tocarla en el móvil no hace nada), vida en vivo, eliminaciones, quién eliminó a quién y botones para agregar
// brutes en plena pelea. Se actualiza con cada caída según avanza la animación.
// La ronda no termina sola: si queda uno en pie, espera a que entre alguien. "Finalizar" pone un reloj de 3 minutos
// en la arena y la ronda termina al llegar a cero: gana quien más victorias tenga de los que siguen en pie.
let rosterFight = null;
// Activa o desactiva el reloj de la ronda en curso (lo pone la lista del royale, ver renderRoster)
let ttTimerToggle = null;
// Mientras se pulsa algo de la lista no se repinta: se repinta al soltar, tras el clic. Si no, con la pelea en marcha
// (caídas, ultimates…) el botón pulsado podía cambiarse por otro a mitad del toque y el clic se perdía
let rosterPressed = false;
let rosterRedraw = null;
let rosterReleaseTimer = null;
const releaseRoster = () => {
  clearTimeout(rosterReleaseTimer);
  if (!rosterPressed) return;
  rosterPressed = false;
  const redraw = rosterRedraw;
  rosterRedraw = null;
  redraw?.();
};
window.addEventListener('click', releaseRoster);
window.addEventListener('pointercancel', releaseRoster);
// (por si no llega el clic, por ejemplo al soltar fuera del botón)
window.addEventListener('pointerup', () => {
  clearTimeout(rosterReleaseTimer);
  rosterReleaseTimer = setTimeout(releaseRoster, 400);
});
// Potenciadores de cada brute: los dan los regalos y también tres botones en su fila de la lista (ver
// engine/ultimates.BoostTier). Valen según lo que cuesta su regalo, para que 30 Rose no rindan más que una dona: el 1
// solo cura o suma un poco de vida; el 2 y el 3 lanzan poderes (ultimates, cada vez una de las cuatro, ver
// sim.castBoost; el botón no dice cuál), le curan o le suman vida, le dan un arma poderosa que ya no pierde y un aura
// de ki durante un minuto (daño x2), y el 3 además un ayudante que pelea con él un minuto y una minigun durante
// 20 s (ver fight/minigun). `powers`: poderes que lanza, uno tras otro (ver `launched` en renderRoster). Sin recarga:
// en cuanto se ve el anterior se pueden volver a pulsar
// Los ayudantes de los potenciadores grandes (ver ayudantes.ts), donde antes iba la mascota 🐾: sus nombres, uno sobre
// una palabra (`HELPERS_INLINE`, en las tarjetas del panel)
// (genérico: los nombres solo salen en Petro vs Abelardo, donde cada presidente tiene el suyo, ver sideCard)
const HELPERS_INLINE = 'ayudante';
// Icono de la minigun (no hay emoji: 🔫 parecía una pistola de agua)
const MINIGUN_ICON = `<img class="gift-img minigun-img" src="${import.meta.env.BASE_URL}images/minigun.png" alt="minigun" draggable="false" />`;
const BOOSTS = [
  {
    tier: 1,
    label: '+30',
    perks: '',
    offer: '',
    powers: 0,
    text: 'cura o suma 30 PV y nada más (lo que dan los 100 tap tap; un regalo de 1 moneda trae además un arma)',
  },
  {
    tier: 2,
    label: '+1000',
    perks: '⚔️🔥✨',
    offer: '⚔️ arma poderosa · 🔥 aura de ki 1 min (daño x2) · ✨ un poder',
    powers: 1,
    text: 'cura o suma 1000 PV, trae un arma poderosa, enciende un aura de ki durante un minuto (daño x2) y lanza un poder (cada vez uno distinto)',
  },
  {
    tier: 3,
    label: '+3000',
    perks: `🔥${MINIGUN_ICON}✨x2<small class="helpers-card">${HELPERS_INLINE}</small>`,
    offer: `⚔️ arma poderosa · 🔥 aura de ki 1 min (daño x2) · ${HELPERS_INLINE} 1 min · ${MINIGUN_ICON} minigun 20 s · ✨ 2 poderes`,
    powers: 2,
    text: 'cura o suma 3000 PV, trae un arma poderosa, aura de ki durante un minuto (daño x2), un ayudante que pelea con él un minuto, una minigun durante 20 s y lanza dos poderes, uno tras otro (cada vez uno distinto)',
  },
];
// Vida de una fila de la lista. Nunca por encima de la máxima: la cura de un potenciador se ve antes que golpes que en
// el motor ya le habían dado (ver demoBoost en setupFight), y hasta que se ven, lo que cura de más se lo llevan ellos
const hpText = (hp, maxHp) => `${Math.max(0, Math.min(maxHp, Math.round(hp)))}/${maxHp}`;
// Botones para agregar un brute que entra con uno de los potenciadores (ver `add` en renderRoster)
const giftButtons = (disabled) =>
  BOOSTS.map(
    (b) =>
      `<button class="t${b.tier}" data-add="1" data-gift="${b.tier}" title="Agregar un brute que entra con el potenciador ${b.label}: ${b.text}" ${disabled}>${b.label}</button>`,
  ).join('');

// ===== Panel de regalos =====
// Simula los regalos del directo de TikTok (aún sin conectar con TikFinity): con el nombre del espectador y un regalo,
// entra a la pelea con su nombre (si no está en pie) y recibe el potenciador que da ese regalo. Sin regalo ("Unirse",
// como quien comenta para entrar), solo entra. Se abre con 🎁 o la tecla G, en otra ventana (?panel, ver
// openGiftWindow) que manda los regalos a la del juego (BroadcastChannel): así en el directo se captura solo la del juego
// Uno de cada escalón de monedas (ver COIN_TIERS), para probar. `boost`: el potenciador que da, si no es el que le toca
// por sus monedas. `apart`: va aparte en ¿Cómo jugar? y en el panel aunque dé lo de sus monedas (el Quiéreme, que ayuda
// a crecer la cuenta; antes daba solo un arma, el potenciador 4, y desde que 1 moneda da +30 y un arma daba menos)
const GIFTS = [
  // (con los nombres de TikTok: "Rose" es la de 1 moneda y "Rosa", la de 10)
  // Modo Petro vs Abelardo: `side`, el jefe al que va el regalo (ver supportGift). Uno de cada escalón de monedas para
  // cada jefe, del mismo precio, así ninguno tiene ventaja
  { id: 'rose', file: '7906db96d5.webp', icon: '🌹', name: 'Rose', coins: 1, side: 'petro' },
  { id: 'quiereme', file: 'f856132638.webp', icon: '🫶', name: 'Quiéreme', coins: 1, apart: true },
  { id: 'rosa', file: 'fc9f17a510.webp', icon: '🌹', name: 'Rosa', coins: 10, side: 'petro' },
  { id: 'dona', file: '993fc4dd9e.webp', icon: '🍩', name: 'Dona', coins: 30, side: 'petro' },
  { id: 'handheart', file: '11ab716bcf.webp', icon: '💗', name: 'Hand Heart', coins: 100, side: 'petro' },
  // (el escalón de arriba de este modo es el de 199 monedas, ver BANDOS_GIFTS; el Corgi de 299 y cualquier otro de
  // más van al presidente que eligió quien lo manda)
  { id: 'nightstar', file: '9a3e9775ee.webp', icon: '🌟', name: 'Night Star', coins: 199, side: 'petro' },
  { id: 'tiktok', file: 'f4cff84279.webp', icon: '🎵', name: 'TikTok', coins: 1, side: 'abelardo' },
  { id: 'heart', file: '9768483c6f.webp', icon: '❤️', name: 'Corazon', coins: 10, side: 'abelardo' },
  { id: 'capibara', file: '54a84fc725.webp', icon: '🦫', name: 'Capibara', coins: 30, side: 'abelardo' },
  // (el Mishka Bear de TikTok; los del directo llegan con ese nombre y se reconocen por su archivo, ver findGift)
  { id: 'mishka', file: 'ae769f4992.webp', icon: '🧸', name: 'Osito Mishka', coins: 100, side: 'abelardo' },
  { id: 'hearts', file: '5d8a4bf214.webp', icon: '💕', name: 'Corazones', coins: 199, side: 'abelardo' },
];
// Catálogo completo de regalos de TikTok (public/images/gifts/gifts.json: nombre, monedas y archivo). Se carga al abrir;
// los regalos del catálogo se identifican como "f:<archivo>" o por su nombre (labrute.gift('usuario', 'Rose')). Si es
// uno de los de arriba (el mismo archivo: "Heart Me" es el Quiéreme), cuenta como ese
let catalog = [];
const giftImg = (file) => `${import.meta.env.BASE_URL}images/gifts/${file}`;
// `coins`: lo que vale uno, cuando se sabe (los del directo llegan con su nombre y su precio). Entonces solo cuenta
// como uno del catálogo con ese nombre y ese precio, y si no hay ninguno, como un regalo cualquiera de lo que vale:
// así un nombre que no casa (otro idioma, uno nuevo) nunca da más de lo que se pagó
const findGift = (id, coins) => {
  if (typeof id !== 'string' || !id) return undefined;
  const found = GIFTS.find((x) => x.id === id);
  if (found) return found;
  const lower = id.toLowerCase();
  if (coins > 0) {
    const same = (x) => x.name.toLowerCase() === lower && x.coins === coins;
    const listed = catalog.find(same);
    return (
      (listed ? (GIFTS.find((x) => x.file === listed.file) ?? listed) : GIFTS.find(same)) ?? {
        name: id.slice(0, 40),
        coins,
        icon: '🎁',
      }
    );
  }
  const listed = catalog.find((x) => `f:${x.file}` === id || x.name.toLowerCase() === lower);
  return (
    (listed && GIFTS.find((x) => x.file === listed.file)) ?? listed ?? GIFTS.find((x) => x.name.toLowerCase() === lower)
  );
};
// Icono de un regalo: su imagen si la tiene (si no carga, el emoji) y si no, el emoji
const giftIcon = (g) =>
  g.file
    ? `<img class="gift-img" src="${giftImg(g.file)}" alt="" loading="lazy" draggable="false" onerror="this.replaceWith(document.createTextNode('${g.icon ?? '🎁'}'))" />`
    : (g.icon ?? '🎁');
// Lo que da un potenciador, para las tarjetas del panel de regalos: cruz verde vida, ⚔️ arma poderosa, 🔥 aura de ki
// (daño x2), 🧑‍💼 ayudante, minigun (MINIGUN_ICON) y ✨ poder
const HEAL_ICON =
  '<svg class="heal" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>';
// (la cruz ya dice "suma": el número va sin su "+", que se repetía)
const heal = (amount) => `${HEAL_ICON}${String(amount).replace(/^\+/, '')}`;
const boostOffer = (b) => `<b>${b.tier === WEAPON_TIER ? b.label : heal(b.label)}</b><em class="perks">${b.perks}</em>`;
// Moneda de TikTok (dibujada: dorada, con la nota del logo de TikTok)
const COIN_ICON =
  '<svg class="coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11.5" fill="#f2a900"/><circle cx="12" cy="12" r="9.3" fill="#ffd335"/><path transform="translate(6.6 6.3) scale(0.46)" fill="#e08a00" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>';
// Potenciador según lo que vale el regalo en monedas de TikTok, sea el que sea (antes cada regalo de la lista daba lo
// suyo): desde 1 → +30 y un arma, desde 10 → +300 y un arma, desde 30 → +1000 y aura, desde 100 → +2000 y ayudante, desde 299 →
// +3000 y minigun. Es lo que dice ¿Cómo jugar?, con `short` (lo que más se nota, aparte de la vida)
const COIN_TIERS = [
  { coins: 1, tier: 7, short: '🗡️ arma' },
  { coins: 10, tier: 5, short: '🗡️ arma' },
  { coins: 30, tier: 2, short: '🔥 aura' },
  // (sin sus nombres: son de Petro vs Abelardo; en el modo normal salen por turnos)
  { coins: 100, tier: 6, short: '🤝 ayudante' },
  { coins: 299, tier: 3, short: `${MINIGUN_ICON} minigun` },
];
const giftTier = (coins) => COIN_TIERS.findLast((t) => coins >= t.coins)?.tier ?? 1;
// El que da un regalo (los de la lista pueden dar otro, como el Quiéreme)
const tierOf = (g) => (GIFTS.find((x) => x.file === g.file) ?? g).boost ?? giftTier(g.coins);
// Regalos grandes que no están en la lista (desde 299 monedas, como el León): lo del +3000, pero con la vida en
// proporción a lo que valen (la del Corgi: 3000 por 299 monedas, unas 10 por moneda). Si no, un León de 29.999
// monedas daba lo mismo que un Corgi. Undefined: la de su nivel
const BIG_GIFT_COINS = COIN_TIERS.at(-1).coins;
const giftHp = (g) =>
  g.coins >= BIG_GIFT_COINS && !GIFTS.some((x) => x.file === g.file)
    ? Math.round((g.coins * BOOST_HP[3]) / BIG_GIFT_COINS)
    : undefined;
// Potenciadores que solo dan los regalos (ver engine/ultimates.BoostTier), no los botones de la lista: el 4, solo un
// arma (ya no lo da ninguno: era el del Quiéreme); el 5, +300 y un arma (desde 10 monedas); el 6, entre el 2 y el 3 (desde 100), y el 7, +30 y un
// arma (de 1 a 9 monedas: el 1, solo los +30, lo dan los 100 tap tap)
const WEAPON_TIER = 4;
const GIFT_BOOSTS = {
  [WEAPON_TIER]: {
    tier: WEAPON_TIER,
    label: 'Arma',
    perks: '🗡️',
    offer: '🗡️ un arma para toda la pelea',
    powers: 0,
    text: 'trae un arma sencilla que equipa al momento y le dura toda la pelea',
  },
  5: {
    tier: 5,
    label: '+300',
    perks: '🗡️',
    offer: '🗡️ un arma para toda la pelea',
    powers: 0,
    text: 'cura o suma 300 PV y trae un arma sencilla que equipa al momento y le dura toda la pelea',
  },
  7: {
    tier: 7,
    label: '+30',
    perks: '🗡️',
    offer: '🗡️ un arma para toda la pelea',
    powers: 0,
    text: 'cura o suma 30 PV y trae un arma sencilla que equipa al momento y le dura toda la pelea',
  },
  // (modo Petro vs Abelardo: lo del espectador de un regalo desde 30 monedas, ver sim.bandosGift)
  8: {
    tier: 8,
    label: '+100',
    perks: '⚔️',
    offer: '⚔️ un arma poderosa para toda la pelea',
    powers: 0,
    text: 'cura o suma vida y trae un arma poderosa que equipa al momento y le dura toda la pelea',
  },
  6: {
    tier: 6,
    label: '+2000',
    perks: `⚔️🔥✨<small class="helpers-card">${HELPERS_INLINE}</small>`,
    offer: `⚔️ arma poderosa · 🔥 aura de ki 1 min (daño x2) · ${HELPERS_INLINE} 1 min · ✨ un poder`,
    powers: 1,
    text: 'cura o suma 2000 PV, trae un arma poderosa, aura de ki durante un minuto (daño x2), un ayudante que pelea con él un minuto y lanza un poder (cada vez uno distinto)',
  },
};
const boostOf = (tier) => GIFT_BOOSTS[tier] ?? BOOSTS[tier - 1];
// Como mucho, potenciadores en cola por brute (un combo de muchos regalos no lo deja disparando ultimates sin fin). Los
// jefes del modo de bandos reciben los de todo su bando: su cola es más larga
const GIFT_QUEUE_MAX = 10;
const CHIEF_QUEUE_MAX = 30;
// Lo pone la lista de la ronda en curso (ver `gift` en renderRoster). Los regalos que llegan sin ronda en la que entrar
// (entre rondas, o fuera del royale) esperan a la siguiente
let rosterGift = null;
// También de la lista de la ronda (ver renderRoster): 'in' si `user` sigue en pie, 'out' si ya cayó en ella
let rosterWho = null;
const pendingGifts = [];
const cleanUser = (user) =>
  String(user ?? '')
    .trim()
    .slice(0, 24);
// Aspecto fijo de los espectadores que entran como un personaje especial (`look` al unirse: 'petro', 'abelardo' o
// 'chuck'). Se recuerda mientras sigue abierta la página, así sigue siéndolo en las rondas siguientes
const LOOKS = { chuck: CHUCK_LOOK, petro: PETRO_LOOK, abelardo: ABELARDO_LOOK };
const looks = new Map();
// Modo de bandos: el jefe al que apoya cada espectador. Lo elige comentando su nombre (u otras, ver sideFromText), con
// los botones 👓 y 🎩 del panel de regalos o con labrute.bando; si no eligió, se le queda el de su primer regalo o
// toques (ver supportGift). Se recuerda mientras siga abierta la página
const chosenSides = new Map();
// Cómo se elige: el nombre del jefe, el lado en el que está (Petro a la izquierda, ver royaleArena.lock), su color o,
// como comentario entero, 1/2 o A/B. (Las palabras van sueltas: pueden llevar números o signos pegados, como
// #petro2026, pero no otras letras, como "petróleo")
const SIDE_WORDS = {
  petro: /(^|[^a-z])(petro|gustavo|izquierda|izquierdo|izq|left|naranja)([^a-z]|$)/,
  abelardo: /(^|[^a-z])(abelardo|espriella|derecha|derecho|der|right|azul|celeste)([^a-z]|$)/,
};
const SIDE_EXACT = { petro: ['1', 'a'], abelardo: ['2', 'b'] };
const sideFromText = (text) => {
  const t = String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const said = Object.keys(SIDE_WORDS).filter((id) => SIDE_WORDS[id].test(t) || SIDE_EXACT[id].includes(t));
  // (si nombra a los dos, no elige ninguno)
  return said.length === 1 ? said[0] : undefined;
};
function applyGift({ user, gift, count = 1, coins, look, side }) {
  let name = cleanUser(user);
  // (con bandos, los botones de Petro y Abelardo del panel eligen bando; sin nombre, o con el de un jefe, entra uno al
  // azar: si no, se confundiría con él)
  if (bandos.on && side && (!name || SIDES.some((s) => s.chief === name))) name = randomUser();
  if (!name) return;
  const g = findGift(gift, Math.round(+coins) || 0);
  if (bandos.on) return supportGift(name, g, count, side);
  if (LOOKS[look]) looks.set(name, LOOKS[look]);
  const tier = g ? tierOf(g) : 0;
  const hp = g ? giftHp(g) : undefined;
  const n = Math.max(1, Math.min(GIFT_QUEUE_MAX, Math.round(+count) || 1));
  showToast(
    g
      ? `<b>${escHtml(name)}</b> envió ${giftIcon(g)} ${escHtml(g.name)}${n > 1 ? ` x${n}` : ''} <span>${hp ? `+${hp}` : boostOf(tier).label}</span>`
      : `<b>${escHtml(name)}</b> se unió 🙋`,
    tier,
  );
  if (mode === 'royale' && rosterGift?.(name, tier, n, hp)) return;
  if (pendingGifts.length < 50) pendingGifts.push({ user: name, tier, count: n, hp });
}
// Modo Petro vs Abelardo: solo pelean los dos jefes (antes entraban también los espectadores, como refuerzos de un
// bando) y el chat los apoya. Cada regalo de un bando (`side` en GIFTS) va a su jefe; cualquier otro regalo y los
// toques, al del bando que eligió quien los manda (comentando su nombre, ver sideFromText) o, si no eligió, al que va
// perdiendo (el de menos vida), y desde entonces es de ese bando. Los regalos fuertes (desde STRONG_GIFT_COINS) de
// quien no eligió van al más débil aunque sean del otro bando. Lo que le da al jefe, según las
// monedas: ver sim.bandosGift. Los toques: cada CHIEF_TAPS (antes 100), TAP_CHIEF (antes +10)
const CHIEF_TAPS = 30;
const TAP_CHIEF = { tier: 1, hp: 30 };
// Los pone la lista de la ronda (ver renderRoster): dar `count` veces `part` al jefe de `side` (false si no hay ronda
// en la que dárselo: espera a la siguiente) y el bando que va perdiendo
let rosterChief = null;
let rosterWeaker = null;
const pendingChief = [];
// Monedas que lleva regaladas cada espectador a cada bando en la ronda (quien más dio al ganador sale en su pantalla).
// (Con bandos no hay ranking abajo: ver index.html)
const support = { petro: new Map(), abelardo: new Map() };
// Desde cuántas monedas un regalo es "fuerte" (ver supportSide): el de 30 ya trae aura y un poder
const STRONG_GIFT_COINS = 30;
const supportSide = (name, g) => {
  const anyone = () => SIDES[Math.floor(Math.random() * SIDES.length)].id;
  // Un regalo fuerte de quien no ha elegido presidente va al más débil, sea del bando que sea, para que no lo hunda el
  // otro (y desde entonces es de ese bando, ver supportChief)
  if (g && g.coins >= STRONG_GIFT_COINS && !chosenSides.has(name)) return rosterWeaker?.() ?? g.side ?? anyone();
  return g?.side ?? chosenSides.get(name) ?? rosterWeaker?.() ?? anyone();
};
const sideTag = (side) => `<span style="color:${sideCss(side)}">👑 ${escHtml(side.name)}</span>`;
function supportChief(name, sideId, part, count) {
  if (!chosenSides.has(name)) chosenSides.set(name, sideId);
  if (rosterChief?.(sideId, part, count)) return;
  if (pendingChief.length < 50) pendingChief.push({ side: sideId, part, count });
}
// Un regalo, o sin regalo (un comentario, 🙋 Unirse o los botones de los jefes del panel), elegir bando con `side`
function supportGift(name, g, count, side) {
  if (!g) {
    if (!sideById(side) || chosenSides.get(name) === side) return;
    chosenSides.set(name, side);
    return showToast(`<b>${escHtml(name)}</b> apoya a ${sideTag(sideById(side))}`, 0);
  }
  const to = sideById(supportSide(name, g));
  const n = Math.max(1, Math.min(CHIEF_QUEUE_MAX, Math.round(+count) || 1));
  const part = bandosGift(g.coins).chief;
  showToast(
    `<b>${escHtml(name)}</b> envió ${giftIcon(g)} ${escHtml(g.name)}${n > 1 ? ` x${n}` : ''} → ${sideTag(to)} <span>+${part.hp}</span>`,
    part.tier,
  );
  support[to.id].set(name, (support[to.id].get(name) ?? 0) + g.coins * n);
  supportChief(name, to.id, part, n);
}
// Con bandos, los toques no meten a nadie a pelear: cada CHIEF_TAPS curan a su jefe
function supportLikes(name, n) {
  const before = likes.get(name) ?? 0;
  likes.set(name, before + n);
  const heals = Math.min(CHIEF_QUEUE_MAX, Math.floor((before + n) / CHIEF_TAPS) - Math.floor(before / CHIEF_TAPS));
  if (!heals) return;
  const to = sideById(supportSide(name));
  showToast(
    `<b>${escHtml(name)}</b> 👆 ${heals * CHIEF_TAPS} toques → ${sideTag(to)} <span>+${heals * TAP_CHIEF.hp}</span>`,
    1,
  );
  supportChief(name, to.id, TAP_CHIEF, heals);
}
// Tap tap (los "me gusta" del directo: toques en la pantalla). Son gratis, así que dan poco: LIKES_TO_JOIN toques
// meten al espectador en la pelea (antes bastaba el primero, como comentar) y cada LIKES_PER_HEAL toques suyos le dan
// el potenciador 1 (+30, lo de una Rose). Los toques se cuentan por espectador mientras dura el directo (esta página);
// los de entrar también curan, pero al entrar. Volver tras caer cuesta: quien ya cayó en la ronda necesita
// LIKES_TO_RETURN toques para entrar otra vez, y esos toques no curan
const LIKES_TO_JOIN = 30;
const LIKES_PER_HEAL = 100;
const LIKES_TO_RETURN = 100;
const likes = new Map();
// Toques que lleva para entrar quien no está en la ronda, y para volver quien ya cayó en ella
const joinLikes = new Map();
const returnLikes = new Map();
function applyLikes({ user, count = 1 }) {
  const name = cleanUser(user);
  if (!name) return;
  let n = Math.max(1, Math.round(+count) || 1);
  if (bandos.on) return supportLikes(name, n);
  const who = mode === 'royale' ? rosterWho?.(name) : undefined;
  if (who === 'out') {
    const paid = (returnLikes.get(name) ?? 0) + n;
    if (paid < LIKES_TO_RETURN) return void returnLikes.set(name, paid);
    returnLikes.delete(name);
    if (rosterGift?.(name, 0, 1) === 'joined') showToast(`<b>${escHtml(name)}</b> volvió 👆`, 0);
    return;
  }
  returnLikes.delete(name);
  // (quien ya espera la ronda siguiente, por un regalo o por sus toques, no tiene que volver a pagar la entrada)
  const entering = who !== 'in' && !pendingGifts.some((g) => g.user === name);
  if (entering) {
    n += joinLikes.get(name) ?? 0;
    if (n < LIKES_TO_JOIN) return void joinLikes.set(name, n);
  }
  joinLikes.delete(name);
  const before = likes.get(name) ?? 0;
  const total = before + n;
  likes.set(name, total);
  const heals = Math.min(GIFT_QUEUE_MAX, Math.floor(total / LIKES_PER_HEAL) - Math.floor(before / LIKES_PER_HEAL));
  const result = mode === 'royale' ? rosterGift?.(name, heals ? 1 : 0, heals || 1) : false;
  if (result === 'joined') showToast(`<b>${escHtml(name)}</b> se unió 👆`, 0);
  if (heals)
    showToast(`<b>${escHtml(name)}</b> 👆 ${heals * LIKES_PER_HEAL} toques <span>${BOOSTS[0].label}</span>`, 1);
  // Sin ronda en la que entrar, esperan a la siguiente quien ya pagó la entrada y las curas
  if (!result && (heals || entering) && pendingGifts.length < 50)
    pendingGifts.push({ user: name, tier: heals ? 1 : 0, count: heals || 1 });
}
// Lo que llega del panel (aquí o en su otra ventana) o de labrute.*: toques o un regalo
const applyEvent = (data) => (data?.likes ? applyLikes(data) : applyGift(data ?? {}));
// Aviso encima de la arena (los tres últimos), con el color del potenciador
function showToast(html, tier) {
  let box = $('giftToasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'giftToasts';
    $('canvas').appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `gift-toast t${tier}`;
  el.innerHTML = html;
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }, 4000);
}
const panelOnly = new URLSearchParams(location.search).has('panel');
const giftChannel = 'BroadcastChannel' in window ? new BroadcastChannel('brute-demo-regalos') : null;
const sendGift = (data) => (panelOnly ? giftChannel?.postMessage(data) : applyEvent(data));
// Para mandar regalos desde fuera (consola, TikFinity u otro): labrute.gift('usuario', 'rose', 5), con lo que vale
// uno si se sabe (labrute.gift('usuario', 'Rose', 5, 1)), labrute.join('usuario') y labrute.like('usuario', 15) (los
// toques de cada aviso de "me gusta"). Los del directo llegan solos por el puente (ver connectLive, abajo)
globalThis.labrute = {
  gift: (user, gift, count = 1, coins) => applyGift({ user, gift, count, coins }),
  join: (user) => applyGift({ user }),
  petro: (user = 'Gustavo Petro') => applyGift({ user, look: 'petro', side: 'petro' }),
  abelardo: (user = 'Abelardo') => applyGift({ user, look: 'abelardo', side: 'abelardo' }),
  // Modo de bandos: elige (o cambia) el jefe al que apoya, 'petro' o 'abelardo'
  bando: (user, side) => applyGift({ user, side }),
  chuck: (user = 'Chuck') => applyGift({ user, look: 'chuck' }),
  like: (user, count = 1) => applyLikes({ user, count }),
  gifts: GIFTS.map((g) => g.id),
};
// ===== Directo de TikTok de verdad =====
// El puente (live/puente.js, con iniciar-directo.bat) lee tu directo y lo pasa aquí (ver live.js): regalos, toques y
// comentarios (comentar mete a pelear, como 🙋 Unirse). En tu PC se conecta solo; en la versión publicada, solo con
// ?live en la dirección (si no, cualquiera que la abriera intentaría conectarse a su propio PC). El panel de regalos
// dice cómo va, también el de la otra ventana (?panel), que lo recibe de esta
const liveParam = new URLSearchParams(location.search).has('live');
const liveEnabled = liveParam || ['localhost', '127.0.0.1'].includes(location.hostname);
const LIVE_TEXT = {
  off: () => '⚪ Directo sin conectar: abre <b>iniciar-directo.bat</b>',
  conectando: (s) => `🟡 Conectando con el directo de <b>@${escHtml(s.streamer)}</b>…`,
  esperando: (s) => `🟡 <b>@${escHtml(s.streamer)}</b> no está en directo: esperando a que empieces`,
  conectado: (s) => `🟢 Conectado al directo de <b>@${escHtml(s.streamer)}</b>`,
  error: (s) => `🟠 No conecta con el directo de <b>@${escHtml(s.streamer)}</b>: reintentando`,
  disabled: () => '⚪ El directo solo se conecta en tu PC (o con <b>?live</b> en la dirección)',
};
let liveStatus = { state: liveEnabled ? 'off' : 'disabled' };
const showLiveStatus = (s) => {
  liveStatus = s;
  const el = $('giftLive');
  if (!el) return;
  el.innerHTML = (LIVE_TEXT[s.state] ?? LIVE_TEXT.off)(s);
  el.title = s.text ?? '';
  el.dataset.state = s.state;
};
showLiveStatus(liveStatus);
// Quien entra a ver el directo entra a pelear aunque no comente (casilla 🚪 del panel de regalos, marcada de
// fábrica): con poca gente llena la arena de espectadores de verdad; con mucha, mejor desmarcarla. Se lee en cada
// aviso, así también cuenta lo que se marque en el panel de la otra ventana (comparten el navegador)
const JOIN_ON_ENTER_KEY = 'brute-demo-live-join-on-enter';
const joinOnEnter = () => {
  try {
    return localStorage.getItem(JOIN_ON_ENTER_KEY) !== 'false';
  } catch {
    return true;
  }
};
$('giftMembers').checked = joinOnEnter();
$('giftMembers').onchange = (e) => {
  try {
    localStorage.setItem(JOIN_ON_ENTER_KEY, String(e.target.checked));
  } catch {
    /* sin storage */
  }
};
// Brutus, el streamer virtual (live/voz.js), recibe por el puente los ajustes de dos casillas del panel de regalos:
// 💬 conversa con el chat (apagada de fábrica), 🥊 comenta la pelea y 👋 saluda por su nombre (encendidas de fábrica), y lo que pasa en la
// pelea (ver narrate). Se recuerdan en el navegador; la otra ventana del panel los cambia por 'storage'
const TALK_KEY = 'brute-demo-live-talk';
const NARR_KEY = 'brute-demo-live-narrator';
const HELLO_KEY = 'brute-demo-live-hello';
const readFlag = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch {
    return fallback;
  }
};
const saveFlag = (key, on) => {
  try {
    localStorage.setItem(key, String(on));
  } catch {
    /* sin storage */
  }
};
let talk = readFlag(TALK_KEY, false);
let narr = readFlag(NARR_KEY, true);
let hello = readFlag(HELLO_KEY, true);
let liveLink = null;
// (`modo`: 'bandos' en el de Petro vs Abelardo, para que Brutus salude, agradezca y responda con sus reglas)
const pushConfig = () =>
  liveLink?.send({
    type: 'config',
    conversacional: talk,
    narrador: narr,
    saludos: hello,
    modo: bandos.on ? 'bandos' : 'royale',
  });
// Lo que pasa en la pelea, para que la voz lo comente: 'critico' (nombres: quien pega y quien recibe; pct: lo que le
// quitó, en proporción a su vida máxima), 'renida' (los dos que quedan) y 'solo' (el que espera rival). Con bandos,
// además: 'bandos_inicio' (empieza la ronda; nombres: los bandos), 'bandos_peligro' (un jefe con poca vida: él y su
// bando), 'bandos_gana' (el bando que gana y el jefe que cayó) y 'bandos_bando' (un espectador elige bando comentando:
// él y el bando)
const narrate = (evento, nombres, pct = 0) => narr && liveLink?.send({ type: 'pelea', evento, nombres, pct });
$('giftTalk').checked = talk;
$('giftNarr').checked = narr;
$('giftHello').checked = hello;
$('giftTalk').onchange = (e) => {
  talk = e.target.checked;
  saveFlag(TALK_KEY, talk);
  pushConfig();
};
$('giftNarr').onchange = (e) => {
  narr = e.target.checked;
  saveFlag(NARR_KEY, narr);
  pushConfig();
};
$('giftHello').onchange = (e) => {
  hello = e.target.checked;
  saveFlag(HELLO_KEY, hello);
  pushConfig();
};
window.addEventListener('storage', (e) => {
  if (e.key === TALK_KEY) {
    talk = readFlag(TALK_KEY, false);
    $('giftTalk').checked = talk;
  } else if (e.key === NARR_KEY) {
    narr = readFlag(NARR_KEY, true);
    $('giftNarr').checked = narr;
  } else if (e.key === HELLO_KEY) {
    hello = readFlag(HELLO_KEY, true);
    $('giftHello').checked = hello;
  } else return;
  pushConfig();
});
// Espectadores del directo que siguen por aquí: los que entraron, comentaron, tocaron o regalaron hace menos de
// VIEWER_KEEP_MS. Con la casilla 🚪 marcada vuelven a pelear al empezar cada ronda (si no, solo peleaban en la que
// entraron); como mucho VIEWER_ROUND_MAX, los más recientes. TikTok no avisa de quién se va: por eso el plazo
const VIEWER_KEEP_MS = 10 * 60_000;
const VIEWER_ROUND_MAX = 30;
const recentViewers = new Map();
const queueRecentViewers = () => {
  if (!joinOnEnter()) return;
  const since = Date.now() - VIEWER_KEEP_MS;
  for (const [user, at] of recentViewers) if (at < since) recentViewers.delete(user);
  [...recentViewers]
    .sort((a, b) => b[1] - a[1])
    .slice(0, VIEWER_ROUND_MAX)
    .forEach(([user]) => pendingGifts.some((g) => g.user === user) || pendingGifts.push({ user, tier: 0, count: 1 }));
};
const applyLiveEvent = (e) => {
  const viewer = cleanUser(e.user);
  if (viewer) recentViewers.set(viewer, Date.now());
  if (e.type === 'gift') applyGift({ user: e.user, gift: e.gift, count: e.count, coins: e.coins });
  else if (e.type === 'like') applyLikes({ user: e.user, count: e.count });
  // (con bandos, el comentario elige bando si nombra a uno de los jefes; si es uno nuevo para él, la voz lo dice)
  else if (e.type === 'comment') {
    const side = bandos.on ? sideFromText(e.text) : undefined;
    const fresh = side && viewer && chosenSides.get(viewer) !== side;
    applyGift({ user: e.user, side });
    if (fresh) narrate('bandos_bando', [viewer, sideById(side)?.name]);
  } else if (e.type === 'join' && joinOnEnter()) applyGift({ user: e.user });
};
if (panelOnly) {
  if (giftChannel) {
    giftChannel.onmessage = ({ data }) => {
      if (data?.liveStatus) showLiveStatus(data.liveStatus);
      else if (data?.panelState) showPanelState(data.panelState, data.bandos);
    };
    giftChannel.postMessage({ liveStatusAsk: true });
  }
} else {
  // (a la otra ventana del panel: al cambiar y cuando lo pregunta al abrirse)
  const shareStatus = () => giftChannel?.postMessage({ liveStatus });
  if (giftChannel)
    giftChannel.onmessage = ({ data }) => {
      if (data?.liveStatusAsk) shareStatus();
      else if (data?.control) applyControl(data);
      else if (!data?.liveStatus && !data?.panelState) applyEvent(data);
    };
  if (liveEnabled)
    liveLink = connectLive({
      onOpen: pushConfig,
      onEvent: applyLiveEvent,
      onStatus: (s) => {
        showLiveStatus(s);
        shareStatus();
      },
    });
}
const RANDOM_USERS = [
  'luna',
  'elpepe',
  'sofi_gamer',
  'tito_mx',
  'karla_xo',
  'migue',
  'dani.fit',
  'vale',
  'nico',
  'pao',
];
const randomUser = () =>
  `${RANDOM_USERS[Math.floor(Math.random() * RANDOM_USERS.length)]}${Math.floor(Math.random() * 90 + 10)}`;
let giftCount = 1;
// ¿Cómo jugar? (lo arma setupGiftPanel; cambia con el modo de bandos)
let renderHowTo = () => {};
// Las tarjetas de regalos del panel G (también cambian con el modo de bandos)
let renderGiftGrid = () => {};
// (el catálogo sirve para reconocer los regalos del directo: ver findGift)
fetch(`${import.meta.env.BASE_URL}images/gifts/gifts.json`)
  .then((r) => (r.ok ? r.json() : []))
  .then((list) => {
    catalog = Array.isArray(list) ? list : [];
  })
  .catch(() => {});
function setupGiftPanel() {
  // Regalos por monedas, como los cuenta el juego (ver COIN_TIERS): uno por escalón, que da lo mismo que cualquier
  // regalo de ese precio, y el Quiéreme, que va aparte. Antes había una tarjeta por regalo y la lista de todos los del
  // catálogo con un buscador
  const coinCard = ({ coins, tier }) => {
    const b = boostOf(tier);
    const what = `${coins} ${coins === 1 ? 'moneda' : 'monedas'}`;
    return `<button class="gift t${b.tier}" data-coins="${coins}" title="Un regalo de ${what}: ${b.label} (${b.text})"><i>${COIN_ICON}</i><span>${what}</span>${boostOffer(b)}</button>`;
  };
  const giftCard = (g) => {
    const b = boostOf(tierOf(g));
    return `<button class="gift t${b.tier}" data-gift="${g.id}" title="${escHtml(g.name)}: ${b.label} (${b.text})"><i>${giftIcon(g)}</i><span>${escHtml(g.name)}</span><small>🪙${g.coins}</small>${boostOffer(b)}</button>`;
  };
  // Con bandos, los regalos de cada jefe (ver supportGift), de dos en dos: a la izquierda el de Petro y a la derecha el
  // de Abelardo del mismo precio, con lo que le dan a él
  const sideCard = (g) => {
    const side = sideById(g.side);
    const part = bandosGift(g.coins).chief;
    const b = boostOf(part.tier);
    // (el ayudante de este presidente, no los dos)
    const perks = b.perks.replace(HELPERS_INLINE, HELPER_LABELS[side.helper]);
    return `<button class="gift t${b.tier}" data-gift="${g.id}" style="--b:${sideCss(side)}" title="${escHtml(g.name)}: a ${escHtml(side.chief)} +${part.hp} (${b.text})"><i>${giftIcon(g)}</i><span>${escHtml(g.name)}</span><small>🪙${g.coins} · ${escHtml(side.name)}</small><b>${heal(part.hp)}</b><em class="perks">${part.tier === 1 ? '' : perks}</em></button>`;
  };
  renderGiftGrid = () => {
    $('giftGrid').innerHTML = bandos.on
      ? BANDOS_GIFTS.flatMap((t) => SIDES.map((s) => GIFTS.find((g) => g.side === s.id && g.coins === t.coins)))
          .filter(Boolean)
          .map(sideCard)
          .join('')
      : [...COIN_TIERS.map(coinCard), ...GIFTS.filter((g) => g.apart).map(giftCard)].join('');
  };
  renderGiftGrid();
  // ¿Cómo jugar? (modo TikTok, bajo la arena): a la izquierda cómo se entra a pelear con tu nombre y a la derecha qué
  // da un regalo según sus monedas. Antes ahí había un cuadro tipo chat que lo explicaba regalo a regalo, con un
  // mensaje largo cada 3,5 s
  const heartMe = GIFTS.find((g) => g.apart);
  const row = (icon, what, gives) => `<li><i>${icon}</i><span>${what}</span><b>${gives}</b></li>`;
  const life = (tier) => heal(boostOf(tier).label);
  // (la vida y lo que más se nota de un escalón de monedas; el Quiéreme, lo mismo que 1 moneda pero sin la palabra, que
  // no cabe)
  const gives = (tier) => [life(tier), COIN_TIERS.find((t) => t.tier === tier)?.short].filter(Boolean).join(' ');
  // Con bandos (solo pelean los jefes, ver supportGift): los regalos de cada uno, de dos en dos (el de Petro, lo que le
  // dan a su jefe y el de Abelardo del mismo precio), cómo se elige y lo de los toques. Al jefe se le llama "tu
  // presidente". Para elegir solo se dice A o B, la letra de cada uno junto a su nombre (antes también su nombre, 1/2 e
  // izquierda/derecha: demasiadas opciones); lo demás se sigue entendiendo (ver sideFromText). Lo que le da cada regalo: la vida y lo que más se nota (arma, aura, ayudante o minigun)
  const CHIEF_PERK = { 8: '⚔️', 2: '🔥', 3: MINIGUN_ICON };
  const chiefGives = (t) => {
    const { tier, hp } = bandosGift(t.coins).chief;
    return [heal(hp), CHIEF_PERK[tier]].filter(Boolean).join(' ');
  };
  const renderBandosHowTo = () => {
    const [a, b] = SIDES;
    const pair = (t) => {
      const [ga, gb] = SIDES.map((s) => GIFTS.find((g) => g.side === s.id && g.coins === t.coins));
      if (!ga || !gb) return '';
      // (los regalos que traen un ayudante lo dicen bajo su nombre: el de cada presidente)
      const hasHelper = boostPet(bandosGift(t.coins).chief.tier);
      const [ha, hb] = hasHelper
        ? SIDES.map((s) => `<span class="helpers">+ ${HELPER_LABELS[s.helper]}</span>`)
        : ['', ''];
      // (en el centro, a cada lado de la vida, la cara del ayudante del presidente de ese lado)
      const [fa, fb] = hasHelper
        ? SIDES.map(
            (s) =>
              `<img class="hface" src="${HELPER_FACES[s.helper]}" style="--c:${sideCss(s)}" alt="" draggable="false" />`,
          )
        : ['', ''];
      return `<li><span class="stack"><span><i>${giftIcon(ga)}</i>${escHtml(ga.name)}</span>${ha}</span><b>${fa}${chiefGives(t)}${fb}</b><span class="stack"><span>${escHtml(gb.name)}<i>${giftIcon(gb)}</i></span>${hb}</span></li>`;
    };
    // (un solo panel: el marcador de los dos presidentes, cómo elegir y los regalos de cada uno)
    $('ttHowTo').innerHTML = `<div id="ttVersusSlot"></div>
  <p class="tt-pick">Comenta <b class="tt-letter" style="color:${sideCss(a)}">A</b> por ${escHtml(a.name)} o <b class="tt-letter" style="color:${sideCss(b)}">B</b> por ${escHtml(b.name)}</p>
  <ul class="tt-duel">
    ${BANDOS_GIFTS.map(pair).join('')}
  </ul>
  <p class="tt-foot">Cada ${CHIEF_TAPS} tap tap: ${heal(TAP_CHIEF.hp)} a tu presidente</p>`;
    $('ttVersusSlot').replaceWith(versusBox);
  };
  renderHowTo = () => {
    if (bandos.on) return renderBandosHowTo();
    $('ttHowTo').innerHTML = `<div class="tt-cols"><div><div class="tt-title">¿Cómo jugar?</div><ul>
    ${row('👆', `${LIKES_TO_JOIN} tap tap`, '¡entras!')}
    ${row('💬', 'Comenta entrar', 'o iniciar')}
    ${row('👆', `${LIKES_PER_HEAL} tap tap`, life(1))}
    ${heartMe ? row(giftIcon(heartMe), escHtml(heartMe.name), `${life(tierOf(heartMe))} ${boostOf(tierOf(heartMe)).perks}`) : ''}
  </ul></div><ul>
    ${COIN_TIERS.map((t) => row(COIN_ICON, t.coins, gives(t.tier))).join('')}
  </ul></div>`;
  };
  renderHowTo();
  const user = () => {
    if (!$('giftUser').value.trim()) $('giftUser').value = randomUser();
    return $('giftUser').value.trim();
  };
  // (uno de monedas no casa con ningún regalo del catálogo, así que cuenta solo por lo que vale)
  $('giftGrid').onclick = (e) => {
    const button = e.target.closest?.('[data-gift], [data-coins]');
    if (!button) return;
    const { gift = 'Monedas', coins } = button.dataset;
    sendGift({ user: user(), gift, count: giftCount, ...(coins ? { coins: +coins } : {}) });
  };
  $('giftCount').onclick = (e) => {
    const button = e.target.closest?.('[data-count]');
    if (!button) return;
    giftCount = +button.dataset.count;
    $('giftCount')
      .querySelectorAll('[data-count]')
      .forEach((b) => b.classList.toggle('on', b === button));
  };
  $('giftJoin').onclick = () => sendGift({ user: user() });
  // Personajes especiales: con el nombre escrito o, si no hay, el suyo
  // (con bandos, eligen bando: el aspecto de Petro y Abelardo es de los jefes, ver applyGift)
  $('giftPetro').onclick = () =>
    sendGift({ user: $('giftUser').value.trim() || 'Gustavo Petro', look: 'petro', side: 'petro' });
  $('giftAbelardo').onclick = () =>
    sendGift({ user: $('giftUser').value.trim() || 'Abelardo', look: 'abelardo', side: 'abelardo' });
  // Toques: LIKES_TO_JOIN por cantidad elegida (x1: lo que cuesta entrar)
  // (con bandos, CHIEF_TAPS: lo que cura a su jefe)
  $('giftTap').onclick = () =>
    sendGift({ user: user(), likes: true, count: (bandos.on ? CHIEF_TAPS : LIKES_TO_JOIN) * giftCount });
  $('giftRandom').onclick = () => {
    $('giftUser').value = randomUser();
  };
  $('giftPopup').onclick = openGiftWindow;
  $('giftClose').onclick = () => document.body.classList.remove('gifts-open');
  if (panelOnly) document.body.classList.add('panel-only', 'gifts-open');
}

function renderRoster(fight) {
  rosterFight = fight;
  const fighters = JSON.parse(fight.fighters).filter((f) => f.type === 'brute' && !f.master);
  // Con bandos: índice del jefe de cada bando (los jefes no cuentan para el ranking de los espectadores)
  const chiefOf = bandos.on ? (fight.chiefs?.() ?? {}) : {};
  const isChief = (index) => Object.values(chiefOf).includes(index);
  // ult: potenciadores listos ('ready'), en cola o lanzado y aún sin verse su poder ('pending'); tier: el que está en
  // cola o se lanzó
  const state = new Map(
    fighters.map((f) => [f.index, { name: f.name, out: 0, hp: f.hp, maxHp: f.maxHp, wins: 0, ult: 'ready' }]),
  );
  let fallen = 0;
  let winner;
  // Fila que acaba de sumar una victoria (su trofeo salta en ese dibujo)
  let popped = null;
  // "Finalizar" activa el reloj de la arena (royaleClock), que lleva la cuenta atrás; el botón la muestra también
  const finishLabel = () => {
    const left = fight.timeLeft;
    if (!fight.finishing || left == null || (winner && !fight.timeUp)) return '🏁 Finalizar';
    const secs = Math.max(0, Math.ceil(left));
    return `🏁 ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  };
  const setFinish = (on) => {
    fight.finishing = on;
    draw();
  };
  // Fila fijada con un clic (se queda resaltada al quitar el ratón)
  let pinned = null;
  const kills = [];
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hpColor = (pct) => (pct > 50 ? '#4ade80' : pct > 25 ? '#facc15' : '#ef4444');
  const who = (index) =>
    `<i class="dot" style="background:${royaleColorCss(index)}"></i><span class="who">${esc(state.get(index)?.name ?? '?')}</span>`;
  const canAdd = () => !winner && !!fight.canAddBrute?.();
  // Botones de potenciador de una fila (sin el icono de su poder): listos, en cola (⏳ en la esquina del que espera) o
  // lanzado y esperando a que se vea su poder (… en el que se lanzó)
  const boostLabel = (s, b) => {
    const label = `<span class="boost-label">${b.label}</span>`;
    if (s.ult === 'queued' && s.tier === b.tier) return `${label}<i class="boost-badge">⏳</i>`;
    if (s.ult === 'pending' && s.tier === b.tier) return `${label}<b class="boost-cd">…</b>`;
    return label;
  };
  // Se pueden pulsar listos (lo lanza o lo deja en cola) y con uno en cola (otro clic lo quita; otro botón lo cambia)
  const boostDisabled = (s) => !!(winner || fight.timeUp || (s.ult !== 'ready' && s.ult !== 'queued'));
  const boostButtons = (index, s) => {
    if (!fight.castBoost) return '';
    const disabled = boostDisabled(s) ? 'disabled' : '';
    const buttons = BOOSTS.map((b) => {
      const queued = s.ult === 'queued' && s.tier === b.tier;
      const title = `Potenciador ${b.tier}: ${b.text}${queued ? ' · En cola: sale en cuanto se pueda (clic para quitarlo)' : ''}`;
      return `<button class="boost t${b.tier}${queued ? ' queued' : ''}" data-boost="${index}" data-tier="${b.tier}" title="${esc(title)}" ${disabled}>${boostLabel(s, b)}</button>`;
    });
    return `<div class="boosts">${buttons.join('')}</div>`;
  };
  // Ya está en la arena (un brute recién agregado tarda un poco en aparecer)
  const onStage = (index) => !!fight.liveFighters?.()?.some((f) => f.index === index);
  // Lanza un potenciador. Si ahora no se puede (aún no ha aparecido en la arena: se animaba antes que su llegada; o en
  // la pelea ya ha caído aunque aún no se vea y su vida no le alcanza para salvarse, ver session.castBoost), queda en
  // cola y sale solo en cuanto se pueda (ver `tick`); otro clic lo quita de la cola y otro botón lo cambia. Sin rivales
  // sale igual: el Súper gigante
  const castBoost = (index, tier) => {
    const s = state.get(index);
    if (!s || s.out || boostDisabled(s)) return;
    if (s.ult === 'queued' && s.tier === tier) s.ult = 'ready';
    else {
      s.tier = tier;
      s.boostHp = undefined;
      if (onStage(index) && fight.castBoost?.(index, tier)) launched(s);
      else s.ult = 'queued';
    }
    draw();
  };
  // Salió su potenciador: espera a verse (el del arma, que no tiene nada que esperar, deja listo para el siguiente).
  // Si lanza más de un poder (el 3), los demás quedan los primeros en su cola como potenciadores 0 (solo poder, ver
  // engine/ultimates.BoostTier) y salen uno tras otro (ver `tick`)
  const launched = (s) => {
    s.ult = s.tier === WEAPON_TIER ? 'ready' : 'pending';
    const extra = (boostOf(s.tier)?.powers ?? 1) - 1;
    if (extra > 0) s.more = [...Array.from({ length: extra }, () => ({ tier: 0 })), ...(s.more ?? [])];
  };
  // Barra de arriba (con bandos): vida de cada jefe y cuántos espectadores le apoyan (ver chosenSides)
  const versusLive = () =>
    Object.fromEntries(
      SIDES.map((side) => {
        const chief = state.get(chiefOf[side.id]);
        const fans = [...chosenSides.values()].filter((id) => id === side.id).length;
        return [side.id, { hp: chief?.hp ?? 0, maxHp: chief?.maxHp || 1, fans }];
      }),
    );
  const draw = () => {
    if (rosterPressed) {
      rosterRedraw = () => rosterFight === fight && draw();
      return;
    }
    const total = state.size;
    const rows = [...state.entries()]
      // Solo los que siguen en pie: los eliminados cuentan en "X de Y en pie" y en las últimas eliminaciones
      .filter(([, s]) => !s.out)
      .map(([index, s]) => {
        const status = index === winner ? '🏆 Ganador' : '';
        const pct = Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100));
        const classes = [index === winner ? 'win' : '', index === pinned ? 'lit' : ''].join(' ');
        // Victorias de la ronda (rivales que eliminó), junto a la vida: desde la primera
        const wins = s.wins ? `<b class="wins${index === popped ? ' pop' : ''}">🏆${s.wins}</b>` : '';
        // Regalos de un combo que aún no han salido (sin contar los poderes de más del 3)
        const waiting = s.more?.filter((e) => e.tier).length;
        const gifts = waiting ? `<b class="gifts">🎁${waiting}</b>` : '';
        return `<li data-index="${index}" class="${classes}" style="--c:${royaleColorCss(index)}">
          <div class="roster-main">
            <div class="roster-top">${who(index)}${gifts}${wins}</div>
            <div class="roster-hp"><div class="roster-bar"><div style="width:${pct}%;background:${hpColor(pct)}"></div></div><small class="hp-text">${hpText(s.hp, s.maxHp)}</small></div>
            ${status ? `<small>${status}</small>` : ''}
          </div>
          ${boostButtons(index, s)}
        </li>`;
      })
      .join('');
    const feed = kills
      .slice(0, 3)
      .map(({ victim, killer, kind }) =>
        killer !== undefined && state.has(killer)
          ? `<li>${who(killer)} ${kind ? FATALITY_VERBS[kind] : 'eliminó a'} ${who(victim)}</li>`
          : `<li>${who(victim)} cayó</li>`,
      )
      .join('');
    const disabled = canAdd() ? '' : 'disabled';
    const alive = total - fallen;
    const note = winner ? (fight.timeUp ? ' · fin por tiempo' : '') : alive === 1 ? ' · esperando retador' : '';
    const finishTitle = fight.finishing
      ? 'Cancelar el final'
      : 'Pone un reloj de 3 minutos en la arena: al acabar gana quien más victorias tenga de los que siguen en pie';
    if (bandos.on) renderVersus(versusLive());
    $('roster').innerHTML = `<div class="shop-name">${bandos.on ? 'Petro vs Abelardo' : 'Battle Royale'}</div>
      <div class="shop-label roster-stats"><span>${alive} de ${total} en pie${note}</span><span id="rosterFps" class="${fpsClass}" title="${QUALITY_TITLE}">${fpsText}</span></div>
      <div class="roster-add"><button data-add="1" title="Agregar un brute a la pelea" ${disabled}>➕ Agregar</button><button data-add="5" title="Agregar 5 brutes" ${disabled}>+5</button><button data-finish class="${fight.finishing ? 'on' : ''}" title="${finishTitle}" ${winner || fight.timeUp ? 'disabled' : ''}>${finishLabel()}</button></div>
      <div class="roster-add gift-add"><span>➕ con regalo</span>${giftButtons(disabled)}</div>
      <ol class="roster">${rows}</ol>
      ${feed ? `<ul class="kill-feed">${feed}</ul>` : ''}`;
  };
  // Agregar brutes en plena pelea: entran con su propio color y aparecen en la lista. Con regalo (`tier`), su
  // potenciador queda en cola y sale en cuanto aparece en la arena (ver `tick`)
  const add = (count, tier = 0) => {
    for (let k = 0; k < count; k++) {
      const brute = fight.addBrute?.();
      if (!brute) break;
      state.set(brute.index, {
        name: brute.name,
        out: 0,
        hp: brute.hp,
        maxHp: brute.maxHp,
        wins: 0,
        ...(tier ? { ult: 'queued', tier } : { ult: 'ready' }),
      });
    }
    draw();
  };
  // Regalo del panel (ver applyGift): si no está en pie, entra con su nombre; cada regalo le da su potenciador, y los
  // de un combo quedan en cola (`more`: { tier, hp }) y salen uno tras otro. `hp`: su vida, si no es la de su nivel
  // (regalos grandes, ver giftHp). False si la ronda ya no admite a nadie, y 'joined' si acaba de entrar. (Con bandos
  // no se usa: los espectadores no pelean, ver supportGift)
  const gift = (user, tier, count, hp) => {
    if (winner || fight.timeUp) return false;
    const queue = tier ? Array.from({ length: count }, () => ({ tier, hp })) : [];
    const index = [...state].find(([i, s]) => !s.out && s.name === user && !isChief(i))?.[0];
    const joined = index === undefined;
    if (joined) {
      if (!canAdd()) return false;
      const brute = fight.addBrute?.(user, looks.get(user));
      if (!brute) return false;
      const first = queue.shift();
      state.set(brute.index, {
        name: brute.name,
        out: 0,
        hp: brute.hp,
        maxHp: brute.maxHp,
        wins: 0,
        more: queue,
        ...(first ? { ult: 'queued', tier: first.tier, boostHp: first.hp } : { ult: 'ready' }),
      });
    } else {
      const s = state.get(index);
      s.more = [...(s.more ?? []), ...queue].slice(0, GIFT_QUEUE_MAX);
    }
    draw();
    return joined ? 'joined' : true;
  };
  // Lo del jefe de un regalo o de los toques (con bandos, ver supportGift): a su cola, como los de un combo. Las curas
  // seguidas (regalos de menos de 30 monedas y toques) se suman en una sola, y la cola es más larga que la de un
  // espectador: le regala todo su bando
  const chiefGift = (side, part, count) => {
    const index = chiefOf[side];
    const s = state.get(index);
    if (index === undefined || !s || s.out) return;
    s.more ??= [];
    for (let k = 0; k < count; k++) {
      const last = s.more.at(-1);
      if (part.tier === 1 && last?.tier === 1) last.hp += part.hp;
      else if (s.more.length < CHIEF_QUEUE_MAX) s.more.push({ ...part });
    }
  };
  rosterGift = gift;
  rosterChief = (side, part, count) => {
    if (!bandos.on || winner || fight.timeUp) return false;
    chiefGift(side, part, count);
    draw();
    return true;
  };
  // El presidente con menos vida (la de ahora, no en proporción a su máxima: con cada cura la máxima sube y los dos
  // quedan siempre "llenos"); si empatan, uno al azar
  rosterWeaker = () =>
    winner !== undefined || fight.timeUp
      ? undefined
      : SIDES.map((side) => [side.id, state.get(chiefOf[side.id])])
          .filter(([, s]) => s && !s.out)
          .sort(([, a], [, b]) => a.hp - b.hp || Math.random() - 0.5)[0]?.[0];
  rosterWho = (user) => {
    let out;
    for (const [index, s] of state) {
      if (s.name !== user || isChief(index)) continue;
      if (!s.out) return 'in';
      out = 'out';
    }
    return out;
  };
  // Resaltar en la arena, solo con el ratón: al pasar por una fila, o fijándola con un clic. Tocar la fila (móvil) no
  // hace nada, así no se resalta sin querer al ir a pulsar su ultimate
  let pointer = 'mouse';
  $('roster').onpointerdown = (e) => {
    pointer = e.pointerType;
    rosterPressed = true;
    clearTimeout(rosterReleaseTimer);
  };
  $('roster').onpointerover = (e) => {
    if (e.pointerType !== 'mouse') return;
    const li = e.target.closest?.('ol.roster li[data-index]');
    fight.highlight = li ? +li.dataset.index : pinned;
  };
  $('roster').onpointerleave = () => {
    fight.highlight = pinned;
  };
  $('roster').onclick = (e) => {
    const button = e.target.closest?.('[data-add]');
    if (button) return add(+button.dataset.add, +(button.dataset.gift ?? 0));
    if (e.target.closest?.('[data-finish]')) return setFinish(!fight.finishing);
    const boost = e.target.closest?.('[data-boost]');
    if (boost) return castBoost(+boost.dataset.boost, +boost.dataset.tier);
    const li = e.target.closest?.('ol.roster li[data-index]');
    if (!li || pointer !== 'mouse') return;
    pinned = pinned === +li.dataset.index ? null : +li.dataset.index;
    fight.highlight = pinned;
    draw();
  };
  fight.onKill = (kill) => {
    kills.unshift(kill);
    // Victoria para quien lo eliminó (la misma que suma su trofeo en la arena)
    const by = kill.killer !== kill.victim ? state.get(kill.killer) : undefined;
    if (by) {
      by.wins += 1;
      popped = kill.killer;
      if (tiktok.on && !isChief(kill.killer)) {
        scoreOf(by.name).kills += 1;
        saveRanking();
        renderRanking();
      }
    }
    draw();
    popped = null;
  };
  // Vida en vivo: se lee de los luchadores de la animación (así va al ritmo de los golpes que se ven)
  let lastTick = performance.now();
  // Para la voz del streamer virtual (ver narrate): pelea reñida (una vez por ronda), el que queda solo (a los ALONE_MS,
  // y otra vez cada ALONE_REPEAT_MS mientras siga esperando) y el último golpe crítico duro enviado
  const ALONE_MS = 10_000;
  const ALONE_REPEAT_MS = 30_000;
  let closeSent = false;
  let aloneSince = null;
  let aloneSent = -Infinity;
  let aloneAnnounced = false;
  let lastCritSent = 0;
  // Con bandos: jefes de los que ya avisó que están en peligro (por debajo de CHIEF_DANGER de su vida; se vuelve a
  // avisar si suben de CHIEF_SAFE, por los regalos de su bando)
  const CHIEF_DANGER = 0.3;
  const CHIEF_SAFE = 0.6;
  const chiefWarned = new Set();
  // Con bandos, si ya avisó a la voz de que empieza la ronda: en cuanto empieza a verse la pelea (no al crearla: en la
  // primera ronda el juego aún no está conectado al puente y el aviso se perdía)
  let startAnnounced = false;
  const tick = setInterval(() => {
    if (rosterFight !== fight) return clearInterval(tick);
    // Potenciadores en cola (con la pelea en marcha)
    const now = performance.now();
    const elapsed = app?.ticker?.started ? (now - lastTick) / 1000 : 0;
    lastTick = now;
    let fired = false;
    // Regalos que esperaban una ronda (llegaron entre rondas): entran en cuanto empieza
    if (pendingGifts.length && elapsed && !winner && canAdd()) {
      pendingGifts.splice(0).forEach((g) => gift(g.user, g.tier, g.count, g.hp));
    }
    // (con bandos, lo de los jefes)
    if (bandos.on && pendingChief.length && elapsed && !winner) {
      pendingChief.splice(0).forEach((c) => chiefGift(c.side, c.part, c.count));
    }
    for (const [index, s] of state) {
      // Regalos de un combo: el siguiente, en cuanto se ve el poder del anterior
      if (s.ult === 'ready' && s.more?.length && !s.out) {
        const next = s.more.shift();
        s.tier = next.tier;
        s.boostHp = next.hp;
        s.ult = 'queued';
        fired = true;
      }
      // En cola: sale en cuanto se pueda (con la pelea en marcha)
      if (
        s.ult === 'queued' &&
        !s.out &&
        !winner &&
        !fight.timeUp &&
        elapsed &&
        onStage(index) &&
        fight.castBoost?.(index, s.tier, s.boostHp)
      ) {
        launched(s);
        fired = true;
      }
    }
    if (fired) draw();
    if (winner || fight.timeUp) document.querySelectorAll('#roster [data-boost]').forEach((b) => (b.disabled = true));
    // Cuenta atrás de "Finalizar": la lleva el reloj de la arena, aquí se copia al botón
    const finish = $('roster').querySelector('[data-finish]');
    if (finish && fight.finishing) {
      const text = finishLabel();
      if (finish.textContent !== text) finish.textContent = text;
      finish.disabled = !!(winner || fight.timeUp);
    }
    // Ya no se puede agregar (la pelea se cerró: solo queda el final por ver): botones apagados
    if (!canAdd()) document.querySelectorAll('#roster [data-add]').forEach((b) => (b.disabled = true));
    if (bandos.on && !startAnnounced && elapsed) {
      startAnnounced = true;
      narrate(
        'bandos_inicio',
        SIDES.map((side) => side.name),
      );
    }
    // Con bandos: un jefe con poca vida (la voz pide a su bando que lo defienda). Una vez hasta que se recupere
    if (bandos.on && !winner && !fight.timeUp) {
      for (const side of SIDES) {
        const s = state.get(chiefOf[side.id]);
        if (!s || s.out) continue;
        const pct = s.hp / s.maxHp;
        if (pct < CHIEF_DANGER && !chiefWarned.has(side.id)) {
          chiefWarned.add(side.id);
          narrate('bandos_peligro', [side.chief, side.name]);
        } else if (pct > CHIEF_SAFE) chiefWarned.delete(side.id);
      }
    }
    const left = !winner && !fight.timeUp ? [...state.values()].filter((s) => !s.out) : [];
    if (left.length === 2 && !closeSent) {
      const [p, q] = left.map((s) => s.hp / s.maxHp);
      if (p <= 0.6 && q <= 0.6 && Math.abs(p - q) <= 0.15) {
        closeSent = true;
        narrate(
          'renida',
          left.map((s) => s.name),
        );
      }
    }
    // (con bandos no hay "solo esperando rival": si queda uno es que el otro presidente cayó y la ronda se cierra)
    if (left.length === 1 && !bandos.on) {
      aloneSince ??= now;
      if (now - aloneSince >= ALONE_MS && now - aloneSent >= ALONE_REPEAT_MS) {
        aloneSent = now;
        aloneAnnounced = true;
        narrate('solo', [left[0].name]);
      }
    } else {
      aloneSince = null;
      // Ya no está solo (entró alguien, o acabó la ronda): la voz deja de decirlo si aún lo tenía pendiente
      if (aloneAnnounced) {
        aloneAnnounced = false;
        narrate('solo_fin', []);
      }
    }
    const live = fight.liveFighters?.();
    if (!live) return;
    for (const f of live) {
      const s = state.get(f.index);
      if (!s || s.out || f.master) continue;
      // (con un potenciador sube también su vida máxima)
      if (s.hp === f.hp && s.maxHp === f.maxHp) continue;
      s.hp = f.hp;
      s.maxHp = f.maxHp;
      const li = $('roster').querySelector(`li[data-index="${f.index}"]`);
      if (!li) continue;
      const pct = Math.max(0, Math.min(100, (f.hp / s.maxHp) * 100));
      const bar = li.querySelector('.roster-bar > div');
      bar.style.width = `${pct}%`;
      bar.style.background = hpColor(pct);
      li.querySelector('.hp-text').textContent = hpText(f.hp, s.maxHp);
    }
    if (bandos.on) renderVersus(versusLive());
  }, 150);
  fight.onStep = (step) => {
    // Golpe crítico que le quita al menos CRIT_BIG_PCT de su vida máxima: la voz lo comenta (como mucho uno cada 1,5 s)
    if (step.c && typeof step.d === 'number' && step.f !== step.t) {
      const hitter = state.get(step.f);
      const victim = state.get(step.t);
      const now = performance.now();
      if (hitter && victim && victim.maxHp > 0 && step.d / victim.maxHp >= CRIT_BIG_PCT && now - lastCritSent > 1500) {
        lastCritSent = now;
        narrate('critico', [hitter.name, victim.name], step.d / victim.maxHp);
      }
    }
    // Su potenciador se ve ya (su poder, o su vida si no lanza ninguno): sin recarga, listos para otro
    if ((step.a === 'demoUltimate' || (step.a === 'demoBoost' && step.o)) && state.has(step.f)) {
      state.get(step.f).ult = 'ready';
      draw();
    }
    if (step.a === StepType.Death && state.has(step.f) && !state.get(step.f).out) {
      fallen += 1;
      state.get(step.f).out = fallen;
      // Su fila desaparece: si estaba fijada, deja de resaltarse
      if (pinned === step.f) {
        pinned = null;
        fight.highlight = null;
      }
      draw();
    } else if (step.a === StepType.End) {
      const w = state.get(step.w);
      if (w && w.out) {
        w.out = 0;
        fallen -= 1;
      }
      // Modo TikTok: el ganador sale en grande y suma una ronda en el ranking (una vez por ronda). Con bandos, la ronda
      // es para su bando, y sale quien más le regaló
      if (tiktok.on && w && winner === undefined) {
        const side = bandos.on ? fight.sideOf?.(step.w) : undefined;
        if (side) {
          bandos.score[side] = (bandos.score[side] ?? 0) + 1;
          saveBandosScore();
          const [name, coins] = [...(support[side] ?? [])].sort((a, b) => b[1] - a[1])[0] ?? [];
          showBandosWinner(side, name && { name, coins });
          // (lo que llegue desde ahora es para la ronda siguiente)
          Object.values(support).forEach((m) => m.clear());
          const fallen = SIDES.find((x) => x.id !== side);
          narrate('bandos_gana', [sideById(side)?.name, fallen?.chief]);
        } else if (!bandos.on) {
          scoreOf(w.name).wins += 1;
          saveRanking();
          renderRanking();
          showWinner(w.name);
        }
      }
      winner = step.w;
      draw();
    }
  };
  ttTimerToggle = () => {
    if (rosterFight === fight && !winner && !fight.timeUp) setFinish(!fight.finishing);
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
  // (con la arena alta, el lienzo es más ancho que la arena: se le recortan los lados)
  const shown = tiktok.on
    ? Math.max($('canvas').clientWidth, ($('canvas').clientHeight * 5) / 3)
    : $('canvas').clientWidth;
  const displayWidth = Math.min(tiktok.on ? 1800 : 800, shown || 800);
  // Modo TikTok: se dibuja con más resolución (al menos x2 de pantalla y un 50 % más), porque el zoom dinámico agranda la
  // arena y la captura del directo la vuelve a comprimir
  const pixelRatio = tiktok.on ? Math.max(2, window.devicePixelRatio || 1) * 1.5 : window.devicePixelRatio || 1;
  const quality = Math.min(4, pixelRatio * (displayWidth / 500));
  // Royale con zoom dinámico: los luchadores se dibujan con más detalle, para que de cerca no se vean borrosos
  renderQuality.value = mode === 'royale' && royaleZoom.enabled ? Math.min(4, quality * 1.6) : quality;
  // (modo TikTok: transparente, por si la cámara se asoma fuera del escenario con un Súper gigante; ahí se ve el de la
  // pantalla, ver royaleCamera y followScene. En negro: el color con alpha 0 no se multiplica y aclaraba lo de detrás)
  await a.init({
    backgroundColor: tiktok.on ? 0x000000 : 0xfbf7c0,
    backgroundAlpha: tiktok.on ? 0 : 1,
    width: 500,
    height: 300,
    resolution: quality,
    antialias: true,
  });
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
  // Modo TikTok: el fondo de la ronda también fuera de la arena, siguiendo a la cámara (ver followScene)
  if (tiktok.on) {
    scene.round = String(fight.background ?? '').split('.')[0];
    setSceneBackground(arenaBackground.name === 'auto' ? scene.round : arenaBackground.name);
    measureScene();
    a.ticker.add(() => followScene(a.stage), null, UPDATE_PRIORITY.LOW);
  }
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

// Rondas continuas: al terminar cada ronda, cuenta atrás (en la esquina del botón de nueva ronda) y empieza otra sola
const AUTO_DELAY = 3;
let autoChallenge = false;
let autoTimer = null;
const againIcon = () => $('again').dataset.icon || '👑';
const countdown = (left) => `${againIcon()}<b class="badge">${left}</b>`;
function cancelAutoChallenge() {
  clearInterval(autoTimer);
  autoTimer = null;
  $('again').textContent = againIcon();
}
function scheduleAutoChallenge(id) {
  cancelAutoChallenge();
  if (!autoChallenge) return;
  let left = tiktok.on ? TIKTOK_DELAY : AUTO_DELAY;
  const show = () => {
    $('again').innerHTML = countdown(left);
    if (tiktok.on && $('ttNext')) $('ttNext').textContent = `Nueva ronda en ${left}…`;
  };
  show();
  autoTimer = setInterval(() => {
    // Si se cambió de pelea, se desactivó o está en pausa, no seguir
    if (id !== run || !autoChallenge) return cancelAutoChallenge();
    if (app && !app.ticker.started) return;
    left -= 1;
    if (left > 0) {
      show();
      return;
    }
    cancelAutoChallenge();
    $('again').click();
  }, 1000);
}

let promoDownloadUrl = null;
let promoDownloadExt = 'webm';

async function startTrailer() {
  const id = ++run;
  await destroyApp();
  $('again').disabled = true;
  $('downloadPromo').hidden = true;
  setFightDisposing(false);
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
  try {
    await document.fonts.load('20px GameFont');
  } catch {
    /* usa la fuente por defecto */
  }
  const result = await playPromotionalTrailer(
    $('canvas'),
    spritesheets,
    (msg) => {
      if (id === run) $('status').textContent = msg;
    },
    () => id !== run,
  );
  if (id === run) {
    $('again').disabled = false;
    if (result.url) {
      if (promoDownloadUrl) URL.revokeObjectURL(promoDownloadUrl);
      promoDownloadUrl = result.url;
      promoDownloadExt = result.ext || 'webm';
      setControl('downloadPromo', '⬇️', `Descargar el video (.${promoDownloadExt})`);
      $('downloadPromo').hidden = false;
    }
  }
}

const showError = (e) => {
  console.error(e);
  $('status').textContent = 'Error: ' + e.message;
};
const beginRoyale = () => startRoyale(royaleCount).catch(showError);
const beginTrailer = () => startTrailer().catch(showError);
function enterArena(newMode) {
  mode = newMode;
  $('arena').classList.toggle('royale', mode === 'royale');
  $('arena').classList.toggle('trailer', mode === 'trailer');
  $('downloadPromo').hidden = true;
  $('again').dataset.icon = mode === 'trailer' ? '🎬' : '👑';
  setControl('again', $('again').dataset.icon, mode === 'trailer' ? 'Repetir el tráiler' : 'Nueva ronda');
  $('setup').style.display = 'none';
  $('arena').style.display = tiktok.on ? 'flex' : 'block';
}
$('trailerGo').onclick = () => {
  enterArena('trailer');
  beginTrailer();
};
// Modo TikTok: el battle royale en vertical, para el directo (el único royale: el normal, en horizontal, se quitó). Con
// `withBandos`, el modo Gustavo Petro vs Abelardo (solo pelean los dos jefes; el chat los apoya, ver supportGift)
const enterTiktok = (withBandos = false) => {
  bandos.on = withBandos;
  document.body.classList.toggle('bandos', withBandos);
  pushConfig();
  if (withBandos) renderVersus();
  pendingChief.length = 0;
  Object.values(support).forEach((m) => m.clear());
  renderHowTo();
  renderGiftGrid();
  royaleCount = Math.max(3, Math.min(20, +$('royaleCount').value || 6));
  try {
    localStorage.setItem('brute-demo-royale-count', String(royaleCount));
  } catch {
    /* sin storage */
  }
  tiktok.on = true;
  tiktok.round = loadRound();
  document.body.classList.add('tiktok');
  applyLayout();
  // Rondas continuas: solo si se activan en el panel de administración (se recuerda aparte de las del modo normal)
  try {
    autoChallenge = localStorage.getItem(TT_AUTO_KEY) === 'true';
  } catch {
    autoChallenge = false;
  }
  $('auto').checked = autoChallenge;
  renderRanking();
  enterArena('royale');
  beginRoyale();
};
$('tiktokGo').onclick = () => enterTiktok();
$('bandosGo').onclick = () => enterTiktok(true);
// Arena alta (modo TikTok): el lienzo llena el alto de la arena y se le recortan los lados (ver index.html). La cámara
// tiene que saber qué parte se ve y cuánto tapa ¿Cómo jugar? por arriba, si está encima (ver setRoyaleView)
function syncArenaView() {
  const arena = $('canvas').getBoundingClientRect();
  if (!tiktok.on || !arena.height) return setRoyaleView(1, 0);
  const sign = $('ttHowTo').getBoundingClientRect();
  const over =
    sign.height > 0 && sign.left < arena.right && sign.right > arena.left && sign.top < arena.top + arena.height / 2;
  setRoyaleView(arena.width / ((arena.height * 5) / 3), over ? (sign.bottom - arena.top) / arena.height : 0);
  measureScene();
}
const arenaWatch = new ResizeObserver(syncArenaView);
arenaWatch.observe($('canvas'));
arenaWatch.observe($('ttHowTo'));
onLayoutChange(syncArenaView);
// Escenario a pantalla completa (modo TikTok): el fondo de la arena sigue por encima y por debajo de ella hasta llenar
// la pantalla (ver #ttScene en index.html). Es el mismo fondo, alineado con la cámara (se mueve y se acerca con ella),
// y más allá de sus bordes, reflejado y cada vez más oscuro. Así toda la pantalla es escenario, aunque los brutes solo
// pelean en la arena. Sale de la hoja de imágenes del juego, como el de la arena (los fondos sueltos son más pequeños)
const scene = { frames: {}, size: null, name: '', round: '', left: 0, top: 0, k: 0, dark: 0 };
fetch(`${import.meta.env.BASE_URL}images/game/misc.json`)
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => {
    scene.frames = d?.frames ?? {};
    scene.size = d?.meta?.size ?? null;
    setSceneBackground(scene.name);
  })
  .catch(() => {});
// Versiones altas de los fondos, hechas con IA a partir de una plantilla (ver fondos-ia/LEEME.txt): si la del fondo
// de la ronda existe, se ve esa en lugar del reflejo. Se pregunta una vez por fondo (true, false o pendiente)
const tallBackgrounds = new Map();
function showTallBackground(name) {
  const known = tallBackgrounds.get(name);
  $('ttScene').classList.toggle('has-tall', known === true);
  if (known === true) $('ttScene').style.setProperty('--scene-tall', `url(${tallUrl(name)})`);
  if (known !== undefined) return;
  tallBackgrounds.set(name, null);
  const img = new Image();
  img.onload = () => {
    tallBackgrounds.set(name, true);
    if (scene.name === name) showTallBackground(name);
  };
  img.onerror = () => tallBackgrounds.set(name, false);
  img.src = tallUrl(name);
}
const tallUrl = (name) => `${import.meta.env.BASE_URL}images/fondos-altos/${name}.webp`;
function setSceneBackground(name) {
  scene.name = name;
  if (name) showTallBackground(name);
  const entry = scene.frames[`background/${name}.jpg`];
  if (!entry || !scene.size) return;
  // (estirado como en la arena: 500 de ancho y sobresaliendo BACKGROUND_BLEED por arriba y por abajo de sus 300 de alto)
  const h = 300 + 2 * BACKGROUND_BLEED;
  const style = $('ttScene').style;
  // El 10 va girado en la hoja (la arena lo endereza, el CSS no): el suelto, que es el mismo, más pequeño
  if (entry.rotated) {
    style.setProperty(
      '--scene-img',
      `url(${import.meta.env.BASE_URL}images/game/resources/misc/background/${name}.jpg)`,
    );
    style.setProperty('--scene-size', `500px ${h}px`);
    style.setProperty('--scene-pos', `0 ${-BACKGROUND_BLEED}px`);
    return;
  }
  // (el fotograma de la hoja)
  const f = entry.frame;
  style.setProperty('--scene-img', `url(${import.meta.env.BASE_URL}images/game/misc.webp)`);
  style.setProperty('--scene-size', `${(scene.size.w / f.w) * 500}px ${(scene.size.h / f.h) * h}px`);
  style.setProperty('--scene-pos', `${(-f.x / f.w) * 500}px ${(-f.y / f.h) * h - BACKGROUND_BLEED}px`);
}
// Dónde se ve el lienzo de la arena (cambia con su tamaño y al mover los paneles: ver syncArenaView)
function measureScene() {
  const live = $('canvas').querySelector('canvas.live');
  if (!live) return;
  const r = live.getBoundingClientRect();
  const o = $('ttScene').getBoundingClientRect();
  scene.left = r.left - o.left;
  scene.top = r.top - o.top;
  scene.k = r.width / 500;
}
// Cada fotograma, la misma posición y escala que el escenario de la arena (ver royaleCamera)
function followScene(stage) {
  if (!scene.k || stage.destroyed) return;
  const k = stage.scale.x * scene.k;
  const x = scene.left + (stage.position.x - stage.pivot.x * stage.scale.x) * scene.k;
  const y = scene.top + (stage.position.y - stage.pivot.y * stage.scale.y) * scene.k;
  $('ttSceneWorld').style.transform = `matrix(${k}, 0, 0, ${k}, ${x}, ${y})`;
  // (y se oscurece con la arena en el remate del duelo final: ver la sombra en fatality)
  const shade = stage.getChildByLabel('arena-shade');
  const dark = shade && !shade.destroyed ? shade.alpha : 0;
  if (dark !== scene.dark) $('ttSceneShade').style.opacity = String((scene.dark = dark));
}
// Tecla C: muestra u oculta los botones (para manejarlo durante el directo sin que salgan en pantalla)
// Tecla G: panel de regalos (en otra ventana, ver openGiftWindow)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea')) return;
  const key = e.key.toLowerCase();
  if (key === 'c' && tiktok.on) {
    document.body.classList.toggle('tt-controls');
    toggleEdit(false);
  }
  // Tecla E: modo edición de los paneles (mover y cambiar tamaño); R, ya en edición, los restablece
  if (key === 'e' && tiktok.on) toggleEdit();
  if (key === 'r' && tiktok.on && document.body.classList.contains('tt-edit')) resetLayout();
  if (key === 'g' && !panelOnly) openGiftWindow();
});
// El panel de regalos en su propia ventana (?panel): la tecla G y el botón 🎁 la abren (o la traen delante, si ya está
// abierta). Antes abrían el panel dentro de esta, que salía en la captura del directo; si el navegador bloquea la
// ventana, se abre ese como antes
function openGiftWindow() {
  const url = new URL(location.href);
  url.search = '?panel';
  const win = window.open(url.toString(), 'brute-demo-regalos', 'width=400,height=900');
  if (win) win.focus();
  else document.body.classList.toggle('gifts-open');
}
$('gifts').onclick = openGiftWindow;
setupGiftPanel();
// (`ask`: false cuando ya lo preguntó la otra ventana del panel, ver applyControl)
const clearRanking = (ask = true) => {
  if (ask && !confirm(bandos.on ? '¿Borrar el marcador y el número de ronda?' : '¿Borrar el ranking?')) return;
  ranking = {};
  saveRanking();
  renderRanking();
  // (la siguiente ronda vuelve a ser la 1; con Petro vs Abelardo, además, el marcador de rondas ganadas)
  tiktok.round = 0;
  saveRound();
  if (bandos.on) {
    bandos.score = {};
    saveBandosScore();
    renderVersus();
  }
};
$('ttReset').onclick = clearRanking;
$('giftClearRank').onclick = clearRanking;
$('downloadPromo').onclick = () => {
  if (!promoDownloadUrl) return;
  const a = document.createElement('a');
  a.href = promoDownloadUrl;
  a.download = `video-promocional-labrute.${promoDownloadExt}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
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
// Nueva ronda con brutes nuevos (o repetir el tráiler)
$('again').onclick = () => {
  cancelAutoChallenge();
  if (mode === 'trailer') return beginTrailer();
  return beginRoyale();
};
// Royale: zoom dinámico (ver fight/royaleCamera). Se puede cambiar en plena pelea y se recuerda en este navegador
try {
  royaleZoom.enabled = localStorage.getItem('brute-demo-zoom') !== 'false';
} catch {
  /* sin storage */
}
$('zoom').checked = royaleZoom.enabled;
$('zoom').onchange = (e) => {
  royaleZoom.enabled = e.target.checked;
  try {
    localStorage.setItem('brute-demo-zoom', String(royaleZoom.enabled));
  } catch {
    /* sin storage */
  }
};
$('auto').onchange = (e) => {
  autoChallenge = e.target.checked;
  try {
    if (tiktok.on) localStorage.setItem(TT_AUTO_KEY, String(autoChallenge));
  } catch {
    /* sin storage */
  }
  // Si se activa con una pelea ya terminada, arranca la cuenta atrás
  if (autoChallenge && !$('again').disabled) scheduleAutoChallenge(run);
  else if (!autoChallenge) cancelAutoChallenge();
};
$('back').onclick = async () => {
  cancelAutoChallenge();
  if (tiktok.on) {
    tiktok.on = false;
    bandos.on = false;
    renderGiftGrid();
    pushConfig();
    setSideColors(null);
    document.body.classList.remove('tiktok', 'tt-controls', 'tt-edit', 'bandos');
    hideWinner();
    autoChallenge = false;
    $('auto').checked = false;
  }
  rosterFight = null;
  rosterGift = null;
  rosterWho = null;
  run++;
  await destroyApp();
  $('canvas').innerHTML = '';
  $('arena').style.display = 'none';
  $('setup').style.display = 'flex';
};
$('speed').onclick = () => {
  speed.current = speed.current === 1 ? 2 : 1;
  $('speed').textContent = `x${speed.current}`;
};
$('pause').onclick = () => {
  if (!app) return;
  if (app.ticker.started) {
    app.ticker.stop();
    sound.pauseAll();
    setControl('pause', '▶️', 'Reanudar');
  } else {
    app.ticker.start();
    sound.resumeAll();
    setControl('pause', '⏸️', 'Pausa');
  }
};
// Con la ventana oculta (minimizada, en otra pestaña o tapada del todo) el navegador deja de pedir fotogramas y la
// pelea se quedaba parada: sin golpes ni efectos, solo la música. Mientras está oculta, la mueve un reloj en un worker
// (los relojes de la página los frena el navegador), unas 30 veces por segundo; al volver, sigue sola como siempre
const hiddenClock = new Worker(
  URL.createObjectURL(
    new Blob(
      ['let t; onmessage = (e) => { clearInterval(t); if (e.data) t = setInterval(() => postMessage(0), e.data); };'],
      {
        type: 'text/javascript',
      },
    ),
  ),
);
hiddenClock.onmessage = () => {
  if (!document.hidden) return;
  gsap.ticker.tick();
  // (sin la pausa ⏸️)
  if (app?.ticker?.started) app.ticker.update(performance.now());
};
document.addEventListener('visibilitychange', () => hiddenClock.postMessage(document.hidden ? 33 : 0));

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
// Cambiar de pista: suena la nueva desde el principio (si la pelea está en curso y sin pausa)
$('giftTrack').onchange = (e) => {
  const playing = TRACKS.some((t) => sound.exists(t) && sound.find(t).isPlaying);
  for (const t of TRACKS) if (sound.exists(t)) sound.stop(t);
  audio.track = e.target.value;
  saveAudio();
  applyVolumes();
  if (playing && app?.ticker?.started) sound.play(audio.track, { loop: true });
};
$('giftMusic').onclick = () => $('music').click();
$('giftSfx').onclick = () => $('sfx').click();
$('giftMusicVol').oninput = (e) => {
  audio.musicVol = +e.target.value / 100;
  if (audio.musicVol > 0) audio.music = true;
  saveAudio();
  applyVolumes();
};
$('giftSfxVol').oninput = (e) => {
  audio.sfxVol = +e.target.value / 100;
  if (audio.sfxVol > 0) audio.sfx = true;
  saveAudio();
  applyVolumes();
};
applyVolumes();

const trailerParam = new URLSearchParams(location.search).get('trailer');
if (trailerParam) {
  $('trailerGo').click();
}

// Calidad fija para comparar: ?calidad=0 (completa), 1 o 2 (la de las multitudes); sin el parámetro, automática
const qualityParam = new URLSearchParams(location.search).get('calidad');
if (qualityParam !== null && ['0', '1', '2'].includes(qualityParam)) crowdQuality.forced = +qualityParam;
globalThis.__crowdQuality = crowdQuality; // depuración

// ?tiktok (o ?tiktok=8 para elegir cuántos brutes): entra directo al modo TikTok. ?bandos, al de Gustavo Petro vs
// Abelardo (solo los dos jefes)
const tiktokParam = new URLSearchParams(location.search).get('tiktok');
const bandosParam = new URLSearchParams(location.search).get('bandos');
const startParam = bandosParam ?? tiktokParam;
if (startParam !== null) {
  if (+startParam) $('royaleCount').value = startParam;
  $(bandosParam !== null ? 'bandosGo' : 'tiktokGo').click();
}

// Panel de administración (modo TikTok): duración del reloj de la ronda y botón para activarlo cuando se quiera.
// El reloj solo corre si se activa (⏱ aquí o 🏁 en la lista); al llegar a cero gana quien más victorias lleva
const ttMin = $('ttTimerMin');
const ttSec = $('ttTimerSec');
const readTimer = () => {
  const seconds = Math.max(5, Math.min(5999, (+ttMin.value || 0) * 60 + (+ttSec.value || 0)));
  clockConfig.seconds = seconds;
  return seconds;
};
try {
  const saved = +localStorage.getItem(TT_TIMER_KEY);
  if (saved >= 5) {
    ttMin.value = Math.floor(saved / 60);
    ttSec.value = saved % 60;
  }
} catch {
  /* sin storage */
}
readTimer();
const onTimerInput = () => {
  const seconds = readTimer();
  try {
    localStorage.setItem(TT_TIMER_KEY, String(seconds));
  } catch {
    /* sin storage */
  }
};
ttMin.oninput = onTimerInput;
ttSec.oninput = onTimerInput;
$('ttTimerBtn').onclick = () => ttTimerToggle?.();

// Resto de la sección "Ronda" del panel G: rondas continuas (refleja la casilla 🔁 de los botones), nueva ronda y el
// texto del botón del reloj según esté corriendo o no
$('giftAuto').onchange = (e) => {
  $('auto').checked = e.target.checked;
  $('auto').dispatchEvent(new Event('change'));
};
$('giftNewRound').onclick = () => {
  if (!$('again').disabled) $('again').click();
};
setInterval(() => {
  if (panelOnly) return;
  $('giftAuto').checked = autoChallenge;
  const running = !!rosterFight?.finishing && !rosterFight.timeUp;
  const text = running ? '⏹ Parar reloj' : '▶️ Iniciar reloj';
  if ($('ttTimerBtn').textContent.trim() !== text) $('ttTimerBtn').textContent = text;
  $('ttTimerBtn').disabled = !rosterFight || rosterFight.timeUp;
  $('giftNewRound').disabled = $('again').disabled;
  sharePanelState();
}, 400);

// Fondo de la arena: "auto" (el que toque en cada ronda) o uno fijo; se cambia al instante y se recuerda
const BG_KEY = 'brute-demo-bg';
try {
  arenaBackground.name = localStorage.getItem(BG_KEY) || 'auto';
} catch {
  /* sin storage */
}
$('giftBg').innerHTML =
  '<option value="auto">Automático</option>' +
  Array.from({ length: 13 }, (_, i) => `<option value="${i + 1}">Fondo ${i + 1}</option>`).join('');
$('giftBg').value = arenaBackground.name;
$('giftBg').onchange = (e) => {
  arenaBackground.name = e.target.value;
  arenaBackground.apply?.(arenaBackground.name);
  setSceneBackground(arenaBackground.name === 'auto' ? scene.round : arenaBackground.name);
  try {
    localStorage.setItem(BG_KEY, arenaBackground.name);
  } catch {
    /* sin storage */
  }
};

// Panel G en otra ventana (?panel, botón ↗): los regalos ya iban a la ventana del juego (ver sendGift), pero el resto
// (reloj, ronda, ranking, sonido y fondo) se hacía en la del panel, que no tiene juego, y no pasaba nada. Ahora el
// panel le pasa cada cambio por el mismo canal y la del juego lo hace como si se hubiera tocado en ella; a su vez, le
// manda cada 400 ms cómo están esos controles (y los fps) y si se juega Petro vs Abelardo, para que el panel los
// muestre igual
const RELAYED = {
  ttTimerMin: 'input',
  ttTimerSec: 'input',
  ttTimerBtn: 'click',
  giftAuto: 'change',
  giftNewRound: 'click',
  giftClearRank: 'click',
  giftMusic: 'click',
  giftTrack: 'change',
  giftMusicVol: 'input',
  giftSfx: 'click',
  giftSfxVol: 'input',
  giftBg: 'change',
};
const SHARED = [...Object.keys(RELAYED), 'giftFps'];
if (panelOnly)
  for (const type of ['click', 'input', 'change'])
    $('giftPanel').addEventListener(
      type,
      (e) => {
        const el = e.target.closest?.('[id]');
        if (!el || RELAYED[el.id] !== type) return;
        // (antes de que le llegue a su manejador de aquí)
        e.stopPropagation();
        if (el.id === 'giftClearRank' && !confirm('¿Borrar el ranking?')) return;
        giftChannel?.postMessage({ control: el.id, value: el.value, checked: el.checked });
      },
      true,
    );
function applyControl({ control, value, checked }) {
  const el = $(control);
  const type = RELAYED[control];
  if (!el || !type) return;
  if (control === 'giftClearRank') return clearRanking(false);
  if (type === 'click') return el.click();
  if (typeof value === 'string') el.value = value;
  if (typeof checked === 'boolean') el.checked = checked;
  el.dispatchEvent(new Event(type));
}
function sharePanelState() {
  if (!giftChannel) return;
  const state = {};
  for (const id of SHARED) {
    const el = $(id);
    state[id] = {
      value: el.value,
      checked: el.checked,
      disabled: el.disabled,
      text: el.matches('button, b') ? el.textContent : null,
      cls: el.className,
    };
  }
  giftChannel.postMessage({ panelState: state, bandos: bandos.on });
}
// (lo que se está escribiendo o arrastrando en el panel no se pisa). Con `withBandos`, las tarjetas de los regalos de
// cada jefe (ver renderGiftGrid)
function showPanelState(state, withBandos) {
  if (typeof withBandos === 'boolean' && withBandos !== bandos.on) {
    bandos.on = withBandos;
    document.body.classList.toggle('bandos', withBandos);
    renderGiftGrid();
  }
  for (const [id, s] of Object.entries(state)) {
    const el = $(id);
    if (!el || (el === document.activeElement && el.matches('input, select'))) continue;
    if (s.text !== null && el.textContent !== s.text) el.textContent = s.text;
    el.className = s.cls;
    el.disabled = s.disabled;
    if (el.type === 'checkbox') el.checked = s.checked;
    else if (el.matches('input, select')) el.value = s.value;
  }
}
