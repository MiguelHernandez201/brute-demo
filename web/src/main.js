import { Application, Assets, Filter, Rectangle, TextureSource } from 'pixi.js';

// Pixi dibuja los filtros (contornos de textos, iconos, colores de mascotas) a resolución 1
// por defecto; con 'inherit' usan la resolución real del lienzo y no se pixelan.
Filter.defaultOptions.resolution = 'inherit';
// Mipmaps: las imágenes grandes que se muestran reducidas (retratos, hojas de sprites x3) se ven suaves y sin dientes.
TextureSource.defaultOptions.autoGenerateMipmaps = true;
import { gsap } from 'gsap';
import { createRoyale } from './sim.ts';
import { StepType } from '@labrute/core';
import { createRenderer } from './renderer.ts';
import { setupFight } from './fight/setupFight.ts';
import { FATALITY_VERBS } from './fight/fatality.ts';
import { royaleColorCss } from './fight/royaleTags.ts';
import { crowdQuality } from './fight/crowdQuality.ts';
import { setFightDisposing } from './fight/utils/lifecycle.ts';
import { renderQuality } from './fight/FighterHolder.ts';
import { royaleZoom } from './fight/royaleCamera.ts';
import { sound } from '@pixi/sound';
import { sfx, sounds } from './sfx.ts';
import { playPromotionalTrailer } from './trailer.ts';

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
// Voces grabadas del anunciador (suenan con los efectos): "Multi kill!" (ver fight/multiKill) y las de la fatality,
// "Finish him!" / "Finish her!" y "Fatality!" (ver fight/fatality). Y la ráfaga de la minigun (ver fight/minigun), que
// tampoco está entre los sonidos de la pelea original
const VOICES = ['multikill', 'finishhim', 'finishher', 'fatality', 'minigun'];
function setupSounds() {
  if (!sound.exists('background')) sound.add('background', `${import.meta.env.BASE_URL}sfx/background.mp3`);
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
  if (sound.exists('sfx')) sound.volume('sfx', audio.sfx ? 1 : 0);
  for (const voice of VOICES) if (sound.exists(voice)) sound.volume(voice, audio.sfx ? 1 : 0);
  if (sound.exists('background')) sound.volume('background', audio.music ? 0.6 : 0);
  // Botones de solo icono: apagados se ven oscuros (y la música, con la nota tachada)
  $('sfx').textContent = audio.sfx ? '🔊' : '🔇';
  for (const [id, on] of [
    ['sfx', audio.sfx],
    ['music', audio.music],
  ]) {
    $(id).classList.toggle('off', !on);
    $(id).setAttribute('aria-pressed', String(on));
  }
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
// Si queda uno solo en pie, la ronda acaba a los pocos segundos (en vez de esperar al final del reloj)
const TIKTOK_LAST_STANDING = 10;
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
    .sort(([, a], [, b]) => b.wins - a.wins || b.kills - a.kills)
    .slice(0, 5);
  const rows = top
    .map(
      ([name, s], i) =>
        `<li><span>${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} ${escHtml(name)}</span><b>${s.wins} 👑 · ${s.kills} ☠️</b></li>`,
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

// Battle royale: N brutes al azar, todos contra todos
async function startRoyale(count) {
  const id = ++run;
  await destroyApp();
  $('again').disabled = true;
  if (tiktok.on) {
    tiktok.round += 1;
    $('ttRound').textContent = `Ronda ${tiktok.round}`;
    hideWinner();
  }
  const { fight } = createRoyale(count);
  if (id !== run) return;
  renderRoster(fight);
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

// Lista de participantes del royale: cada uno con el color de su etiqueta en la arena (pasar el ratón por una fila lo
// resalta; tocarla en el móvil no hace nada), vida en vivo, eliminaciones, quién eliminó a quién y botones para agregar
// brutes en plena pelea. Se actualiza con cada caída según avanza la animación.
// La ronda no termina sola: si queda uno en pie, espera a que entre alguien. "Finalizar" pone un reloj de 3 minutos
// en la arena y la ronda termina al llegar a cero: gana quien más victorias tenga de los que siguen en pie.
let rosterFight = null;
// Activa "Finalizar" en la ronda en curso (las rondas continuas lo hacen solas)
let royaleFinish = null;
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
// Potenciadores de cada brute: tres botones en su fila de la lista (ver engine/ultimates.boost). Los tres lanzan un
// poder (una ultimate, cada vez una de las cuatro, ver sim.castBoost; el botón no dice cuál) y además le curan o le
// suman vida y le dan un arma que ya no pierde; el 2 y el 3 le encienden un aura de ki para el resto de la pelea (daño
// x3) y el 3 le trae también una mascota que pelea con él un minuto y una minigun durante 20 s (ver fight/minigun). Sin
// recarga: en cuanto se ve su poder se pueden volver a pulsar
const BOOSTS = [
  {
    tier: 1,
    label: '+300',
    text: 'cura o suma 300 PV, trae un arma sencilla que equipa al momento (y ya no pierde) y lanza un poder (cada vez uno distinto)',
  },
  {
    tier: 2,
    label: '+1000',
    text: 'cura o suma 1000 PV, trae un arma poderosa, enciende un aura de ki para toda la pelea (daño x3) y lanza un poder (cada vez uno distinto)',
  },
  {
    tier: 3,
    label: '+3000',
    text: 'cura o suma 3000 PV, trae un arma poderosa, aura de ki para toda la pelea (daño x3), una mascota que pelea con él un minuto, una minigun durante 20 s y lanza un poder (cada vez uno distinto)',
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
// como quien comenta para entrar), solo entra. Se abre con 🎁 o la tecla G, y también en otra ventana (?panel) que manda
// los regalos a la del juego (BroadcastChannel): así en el directo se captura solo la del juego
const GIFTS = [
  { id: 'rosa', icon: '🌹', name: 'Rosa', coins: 1 },
  { id: 'corazon', icon: '🫰', name: 'Corazón', coins: 5 },
  { id: 'dona', icon: '🍩', name: 'Dona', coins: 30 },
  { id: 'gorra', icon: '🧢', name: 'Gorra', coins: 99 },
  { id: 'corgi', icon: '🐶', name: 'Corgi', coins: 299 },
  { id: 'leon', icon: '🦁', name: 'León', coins: 29999 },
];
// Potenciador según lo que vale el regalo en monedas de TikTok: hasta 29 → +300, hasta 298 → +1000, desde 299 → +3000
const giftTier = (coins) => (coins >= 299 ? 3 : coins >= 30 ? 2 : 1);
// Como mucho, potenciadores en cola por brute (un combo de muchos regalos no lo deja disparando ultimates sin fin)
const GIFT_QUEUE_MAX = 10;
// Lo pone la lista de la ronda en curso (ver `gift` en renderRoster). Los regalos que llegan sin ronda en la que entrar
// (entre rondas, o fuera del royale) esperan a la siguiente
let rosterGift = null;
const pendingGifts = [];
function applyGift({ user, gift, count = 1 }) {
  const name = String(user ?? '')
    .trim()
    .slice(0, 24);
  if (!name) return;
  const g = GIFTS.find((x) => x.id === gift);
  const tier = g ? giftTier(g.coins) : 0;
  const n = Math.max(1, Math.min(GIFT_QUEUE_MAX, Math.round(+count) || 1));
  giftToast(name, g, n, tier);
  if (mode === 'royale' && rosterGift?.(name, tier, n)) return;
  if (pendingGifts.length < 50) pendingGifts.push({ user: name, tier, count: n });
}
// Aviso del regalo encima de la arena (los tres últimos)
function giftToast(name, g, n, tier) {
  let box = $('giftToasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'giftToasts';
    $('canvas').appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `gift-toast t${tier}`;
  el.innerHTML = g
    ? `<b>${escHtml(name)}</b> envió ${g.icon} ${escHtml(g.name)}${n > 1 ? ` x${n}` : ''} <span>${BOOSTS[tier - 1].label}</span>`
    : `<b>${escHtml(name)}</b> se unió 🙋`;
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }, 4000);
}
const panelOnly = new URLSearchParams(location.search).has('panel');
const giftChannel = 'BroadcastChannel' in window ? new BroadcastChannel('brute-demo-regalos') : null;
if (giftChannel && !panelOnly) giftChannel.onmessage = (e) => applyGift(e.data ?? {});
const sendGift = (data) => (panelOnly ? giftChannel?.postMessage(data) : applyGift(data));
// Para conectar después los regalos de verdad (TikFinity u otro): labrute.gift('usuario', 'rosa', 5), labrute.join(…)
globalThis.labrute = {
  gift: (user, gift, count = 1) => applyGift({ user, gift, count }),
  join: (user) => applyGift({ user }),
  gifts: GIFTS.map((g) => g.id),
};
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
function setupGiftPanel() {
  $('giftGrid').innerHTML = GIFTS.map((g) => {
    const b = BOOSTS[giftTier(g.coins) - 1];
    return `<button class="gift t${b.tier}" data-gift="${g.id}" title="${escHtml(g.name)}: ${b.label} (${b.text})"><i>${g.icon}</i><span>${escHtml(g.name)}</span><small>🪙${g.coins}</small><b>${b.label}</b></button>`;
  }).join('');
  const user = () => {
    if (!$('giftUser').value.trim()) $('giftUser').value = randomUser();
    return $('giftUser').value.trim();
  };
  $('giftGrid').onclick = (e) => {
    const button = e.target.closest?.('[data-gift]');
    if (button) sendGift({ user: user(), gift: button.dataset.gift, count: giftCount });
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
  $('giftRandom').onclick = () => {
    $('giftUser').value = randomUser();
  };
  $('giftPopup').onclick = () => {
    const url = new URL(location.href);
    url.search = '?panel';
    window.open(url.toString(), 'brute-demo-regalos', 'width=380,height=640');
  };
  $('giftClose').onclick = () => document.body.classList.remove('gifts-open');
  if (panelOnly) document.body.classList.add('panel-only', 'gifts-open');
}

function renderRoster(fight) {
  rosterFight = fight;
  const fighters = JSON.parse(fight.fighters).filter((f) => f.type === 'brute' && !f.master);
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
      s.ult = onStage(index) && fight.castBoost?.(index, tier) ? 'pending' : 'queued';
    }
    draw();
  };
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
        // Regalos de un combo que aún no han salido
        const gifts = s.more?.length ? `<b class="gifts">🎁${s.more.length}</b>` : '';
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
    $('roster').innerHTML = `<div class="shop-name">Battle Royale</div>
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
  // de un combo quedan en cola (`more`) y salen uno tras otro. False si la ronda ya no admite a nadie
  const gift = (user, tier, count) => {
    if (winner || fight.timeUp) return false;
    const tiers = tier ? Array.from({ length: count }, () => tier) : [];
    const index = [...state].find(([, s]) => !s.out && s.name === user)?.[0];
    if (index === undefined) {
      if (!canAdd()) return false;
      const brute = fight.addBrute?.(user);
      if (!brute) return false;
      const first = tiers.shift();
      state.set(brute.index, {
        name: brute.name,
        out: 0,
        hp: brute.hp,
        maxHp: brute.maxHp,
        wins: 0,
        more: tiers,
        ...(first ? { ult: 'queued', tier: first } : { ult: 'ready' }),
      });
    } else {
      const s = state.get(index);
      s.more = [...(s.more ?? []), ...tiers].slice(0, GIFT_QUEUE_MAX);
    }
    draw();
    return true;
  };
  rosterGift = gift;
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
      if (tiktok.on) {
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
  const tick = setInterval(() => {
    if (rosterFight !== fight) return clearInterval(tick);
    // Potenciadores en cola (con la pelea en marcha)
    const now = performance.now();
    const elapsed = app?.ticker?.started ? (now - lastTick) / 1000 : 0;
    lastTick = now;
    let fired = false;
    // Regalos que esperaban una ronda (llegaron entre rondas): entran en cuanto empieza
    if (pendingGifts.length && elapsed && !winner && canAdd()) {
      pendingGifts.splice(0).forEach((g) => gift(g.user, g.tier, g.count));
    }
    for (const [index, s] of state) {
      // Regalos de un combo: el siguiente, en cuanto se ve el poder del anterior
      if (s.ult === 'ready' && s.more?.length && !s.out) {
        s.tier = s.more.shift();
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
        fight.castBoost?.(index, s.tier)
      ) {
        s.ult = 'pending';
        fired = true;
      }
    }
    if (fired) draw();
    // Modo TikTok: con uno solo en pie la ronda acaba enseguida (el reloj baja a TIKTOK_LAST_STANDING segundos)
    if (
      tiktok.on &&
      !winner &&
      fight.finishing &&
      state.size - fallen === 1 &&
      (fight.timeLeft ?? 0) > TIKTOK_LAST_STANDING
    ) {
      fight.timeLeft = TIKTOK_LAST_STANDING;
    }
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
  }, 150);
  fight.onStep = (step) => {
    // Su potenciador se ve ya (su poder): sin recarga, listos para otro
    if (step.a === 'demoUltimate' && state.has(step.f)) {
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
      // Modo TikTok: el ganador sale en grande y suma una ronda en el ranking (una vez por ronda)
      if (tiktok.on && w && winner === undefined) {
        scoreOf(w.name).wins += 1;
        saveRanking();
        renderRanking();
        showWinner(w.name);
      }
      winner = step.w;
      draw();
    }
  };
  royaleFinish = () => {
    if (rosterFight === fight && !fight.finishing && !winner) setFinish(true);
  };
  draw();
  // Rondas continuas: cada ronda se finaliza sola (si no, con uno en pie esperaría para siempre)
  if (autoChallenge) royaleFinish();
}

async function playFight(id, fight) {
  globalThis.__lastFight = fight; // depuración
  $('status').textContent = '';
  setFightDisposing(false);
  const a = new Application();
  // El escenario lógico es 500x300 (como el juego), pero se muestra más grande:
  // se dibuja a la resolución real de pantalla para que no se vea borroso.
  const displayWidth = Math.min(tiktok.on ? 1080 : 800, $('canvas').clientWidth || 800);
  const quality = Math.min(4, (window.devicePixelRatio || 1) * (displayWidth / 500));
  // Royale con zoom dinámico: los luchadores se dibujan con más detalle, para que de cerca no se vean borrosos
  renderQuality.value = mode === 'royale' && royaleZoom.enabled ? Math.min(4, quality * 1.6) : quality;
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
$('royaleGo').onclick = () => {
  royaleCount = Math.max(3, Math.min(20, +$('royaleCount').value || 6));
  try {
    localStorage.setItem('brute-demo-royale-count', String(royaleCount));
  } catch {
    /* sin storage */
  }
  enterArena('royale');
  beginRoyale();
};
$('trailerGo').onclick = () => {
  enterArena('trailer');
  beginTrailer();
};
// Modo TikTok: siempre con rondas continuas (sin tocar la preferencia guardada)
$('tiktokGo').onclick = () => {
  royaleCount = Math.max(3, Math.min(20, +$('royaleCount').value || 6));
  tiktok.on = true;
  tiktok.round = 0;
  document.body.classList.add('tiktok');
  autoChallenge = true;
  $('auto').checked = true;
  renderRanking();
  enterArena('royale');
  beginRoyale();
};
// Tecla C: muestra u oculta los botones (para manejarlo durante el directo sin que salgan en pantalla)
// Tecla G: panel de regalos
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea')) return;
  const key = e.key.toLowerCase();
  if (key === 'c' && tiktok.on) document.body.classList.toggle('tt-controls');
  if (key === 'g' && !panelOnly) document.body.classList.toggle('gifts-open');
});
$('gifts').onclick = () => document.body.classList.toggle('gifts-open');
setupGiftPanel();
$('ttReset').onclick = () => {
  if (!confirm('¿Borrar el ranking?')) return;
  ranking = {};
  saveRanking();
  renderRanking();
};
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
try {
  autoChallenge = localStorage.getItem('brute-demo-auto') === 'true';
} catch {
  /* sin storage */
}
$('auto').checked = autoChallenge;
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
    localStorage.setItem('brute-demo-auto', String(autoChallenge));
  } catch {
    /* sin storage */
  }
  // Si se activa con una pelea ya terminada, arranca la cuenta atrás
  if (autoChallenge && !$('again').disabled) scheduleAutoChallenge(run);
  else if (!autoChallenge) cancelAutoChallenge();
  // En plena ronda del royale, se finaliza para poder pasar a la siguiente
  if (autoChallenge && mode === 'royale') royaleFinish?.();
};
$('back').onclick = async () => {
  cancelAutoChallenge();
  if (tiktok.on) {
    tiktok.on = false;
    document.body.classList.remove('tiktok', 'tt-controls');
    hideWinner();
    try {
      autoChallenge = localStorage.getItem('brute-demo-auto') === 'true';
    } catch {
      autoChallenge = false;
    }
    $('auto').checked = autoChallenge;
  }
  rosterFight = null;
  rosterGift = null;
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

const trailerParam = new URLSearchParams(location.search).get('trailer');
if (trailerParam) {
  $('trailerGo').click();
}

// Calidad fija para comparar: ?calidad=0 (completa), 1 o 2 (la de las multitudes); sin el parámetro, automática
const qualityParam = new URLSearchParams(location.search).get('calidad');
if (qualityParam !== null && ['0', '1', '2'].includes(qualityParam)) crowdQuality.forced = +qualityParam;
globalThis.__crowdQuality = crowdQuality; // depuración

// ?tiktok (o ?tiktok=8 para elegir cuántos brutes): entra directo al modo TikTok
const tiktokParam = new URLSearchParams(location.search).get('tiktok');
if (tiktokParam !== null) {
  if (+tiktokParam) $('royaleCount').value = tiktokParam;
  $('tiktokGo').click();
}

const royaleParam = new URLSearchParams(location.search).get('royale');
if (royaleParam) {
  $('royaleCount').value = royaleParam;
  $('royaleGo').click();
}
