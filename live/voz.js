// Voz del streamer virtual. Se conecta al puente (live/puente.js, ws://127.0.0.1:21214) como un cliente más, igual que
// el juego, y habla con ElevenLabs lo que pasa en tu directo:
//   - regalos  → un gracias con plantillas (sin IA: es instantáneo y nunca falla). Los de racha se juntan en un solo aviso
//   - entradas → un saludo, agrupando a los que llegan casi a la vez
//   - preguntas del chat → las responde un modelo local con Ollama (live/prompt-streamer.txt es su personalidad y lo que
//     sabe del juego). Los comentarios que no son preguntas no se contestan
// Lo que se dice pasa por una cola con prioridad (regalos > preguntas > saludos), y si se acumula demasiado se descarta lo
// menos importante, para que la voz nunca vaya muy por detrás del directo.
//
// Uso: node voz.js   (o iniciar-directo.bat, que lo abre solo si existe live/voz.env)
//      node voz.js --prueba   (no usa el puente: lanza unos eventos de ejemplo para oír la voz)
// Configuración en live/voz.env (copia voz.env.ejemplo). Sin clave de ElevenLabs no habla: solo escribe lo que diría.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));

// ===== Configuración =====
const envFile = join(here, 'voz.env');
if (existsSync(envFile))
  for (const line of readFileSync(envFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
const env = process.env;
const cfg = {
  puente: env.PUENTE_URL || 'ws://127.0.0.1:21214',
  ollama: (env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  modelo: env.OLLAMA_MODEL || 'qwen2.5:3b',
  key: env.ELEVENLABS_API_KEY || '',
  voz: env.ELEVENLABS_VOICE_ID || '',
  modeloVoz: env.ELEVENLABS_MODEL || 'eleven_flash_v2_5',
};
const promptFile = join(here, 'prompt-streamer.txt');
if (!existsSync(promptFile)) {
  console.error('Falta live/prompt-streamer.txt (la personalidad del streamer).');
  process.exit(1);
}
const SISTEMA = readFileSync(promptFile, 'utf8').trim();

const RETRY_MS = 5000;
const MAX_COLA = 6;
// Cuánto vale todavía cada cosa en la cola (prioridad → ms): un saludo tarde ya no tiene sentido
const CADUCA = [90_000, 40_000, 15_000];
const REGALO = 0;
const PREGUNTA = 1;
const SALUDO = 2;

// ===== Texto =====
// Los usuarios de TikTok suenan raro leídos tal cual (luna_gamer_2024): se quitan los _ . - y los números del final
const nombreHablado = (user) => {
  const limpio = user.replace(/[_.\-]+/g, ' ').replace(/\d+$/, '').replace(/\s+/g, ' ').trim();
  return limpio || user;
};
const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];
const lista = (nombres) => (nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres[0]);

// Lo que sale del modelo, listo para leerse en voz alta: sin emojis, markdown, enlaces ni saltos de línea, y no más de
// ~200 caracteres (cortando en un punto si hace falta)
function limpiar(texto) {
  let t = String(texto ?? '')
    .replace(/^\s*respuesta\s*:\s*/i, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\p{Extended_Pictographic}‍️]/gu, '')
    .replace(/[*_`#>~"“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > 200) {
    const corte = t.slice(0, 200);
    const punto = Math.max(corte.lastIndexOf('.'), corte.lastIndexOf('!'), corte.lastIndexOf('?'));
    t = punto > 60 ? corte.slice(0, punto + 1) : `${corte.trim()}…`;
  }
  return t;
}

// ===== Cola de voz =====
const cola = [];
let hablando = false;
// fija: la frase no lleva nombres, así que su audio se guarda en live/cache-voz y las demás veces no gasta créditos
function decir(texto, prio, fija = false) {
  cola.push({ texto, prio, at: Date.now(), fija });
  cola.sort((a, b) => a.prio - b.prio || a.at - b.at);
  while (cola.length > MAX_COLA) cola.pop(); // lo menos importante y más reciente
  if (!hablando) void hablar();
}
async function hablar() {
  hablando = true;
  try {
    while (cola.length) {
      const { texto, prio, at, fija } = cola.shift();
      if (Date.now() - at > CADUCA[prio]) continue;
      console.log(`🗣️ ${texto}`);
      await sintetizar(texto, fija);
    }
  } finally {
    hablando = false;
  }
}

// ===== ElevenLabs + reproducción =====
let carpeta = null;
let n = 0;
let avisoVoz = false;
async function sintetizar(texto, fija = false) {
  if (!cfg.key || !cfg.voz) {
    if (!avisoVoz) {
      avisoVoz = true;
      console.log('🔇 Sin ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID en voz.env: solo escribo lo que diría, sin voz.');
    }
    return;
  }
  let guardado = null;
  if (fija) {
    // (la clave incluye la voz y el modelo: si los cambias en voz.env, se genera de nuevo)
    const hash = createHash('sha1').update(`${cfg.voz}|${cfg.modeloVoz}|${texto}`).digest('hex').slice(0, 16);
    guardado = join(here, 'cache-voz', `${hash}.mp3`);
    if (existsSync(guardado)) {
      try {
        return await reproducir(await readFile(guardado));
      } catch {
        /* si el archivo está roto, se genera de nuevo */
      }
    }
  }
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cfg.voz}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': cfg.key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: texto, model_id: cfg.modeloVoz }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const detalle = (await res.text().catch(() => '')).slice(0, 200);
      console.error(
        `🟠 ElevenLabs respondió ${res.status}${res.status === 401 ? ' (revisa la clave en voz.env)' : ''}${res.status === 429 ? ' (sin créditos o demasiadas peticiones)' : ''}: ${detalle}`,
      );
      return;
    }
    const mp3 = Buffer.from(await res.arrayBuffer());
    if (guardado) {
      await mkdir(dirname(guardado), { recursive: true });
      await writeFile(guardado, mp3);
    }
    await reproducir(mp3);
  } catch (err) {
    console.error(`🟠 No se pudo generar la voz: ${err?.message ?? err}`);
  }
}
// Windows: el reproductor de WPF desde PowerShell (no hace falta instalar nada). Suena por la salida de audio
// predeterminada; para mandarla a OBS / TikTok LIVE Studio ver el README
async function reproducir(mp3) {
  carpeta ??= await mkdtemp(join(tmpdir(), 'voz-streamer-'));
  const archivo = join(carpeta, `${++n}.mp3`);
  await writeFile(archivo, mp3);
  const script = [
    'Add-Type -AssemblyName presentationCore',
    '$p = New-Object System.Windows.Media.MediaPlayer',
    '$p.Open([uri]$env:VOZ_ARCHIVO)',
    '$t = 0',
    'while (-not $p.NaturalDuration.HasTimeSpan -and $t -lt 50) { Start-Sleep -Milliseconds 100; $t++ }',
    '$p.Play()',
    'if ($p.NaturalDuration.HasTimeSpan) { Start-Sleep -Milliseconds ([int]$p.NaturalDuration.TimeSpan.TotalMilliseconds + 300) }',
    '$p.Close()',
  ].join('; ');
  await new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...env, VOZ_ARCHIVO: archivo },
      stdio: 'ignore',
      windowsHide: true,
    });
    ps.on('error', (err) => {
      console.error(`🟠 No pude reproducir el audio (¿no es Windows?): ${err.message}`);
      resolve();
    });
    ps.on('close', resolve);
  });
  await rm(archivo, { force: true });
}

// ===== Regalos → gracias =====
// Los de racha (las Rose seguidas) llegan de uno en uno: se juntan por espectador y se agradecen todos de una vez
// cuando dejan de llegar (3 s), o a los 10 s si la racha sigue
const regalos = new Map();
function regalo({ user, gift, coins = 0, count = 1 }) {
  if (!user || !gift) return;
  const r = regalos.get(user) ?? { first: Date.now(), count: 0, monedas: 0, nombres: new Set(), timer: null };
  clearTimeout(r.timer);
  r.count += count;
  r.monedas += coins * count;
  r.nombres.add(gift);
  regalos.set(user, r);
  r.timer = setTimeout(() => agradecer(user), Date.now() - r.first > 10_000 ? 0 : 3000);
}
function agradecer(user) {
  const r = regalos.get(user);
  if (!r) return;
  regalos.delete(user);
  const nombre = nombreHablado(user);
  const que =
    r.nombres.size > 1 ? 'todos esos regalos' : `${r.count > 1 ? `${r.count} ` : ''}${[...r.nombres][0]}`;
  const por = (frases) => elegir(frases).replace('{n}', nombre).replace('{r}', que);
  if (r.monedas >= 299)
    decir(por(['Uyyy {n}! Gracias por {r}! Eso sí es un regalazo, la arena está temblando!', 'No lo puedo creer, {n}! {r}! Eres una leyenda, muchísimas gracias!']), REGALO);
  else if (r.monedas >= 30)
    decir(por(['Qué nivel, {n}! Gracias por {r}, ahora sí vas a repartir golpes!', '{n}, gracias por {r}! Se te nota el poder desde acá!']), REGALO);
  else
    decir(por(['Gracias {n} por {r}! A pelear se dijo!', 'Eso es, {n}! Gracias por {r}, mucha suerte en la arena!', 'Mil gracias {n} por {r}, ya te armaste para la pelea!']), REGALO);
}

// ===== Entradas → saludo =====
// Se agrupa a los que llegan en 5 s, no se saluda dos veces a la misma persona en 10 minutos y entre saludos pasan al
// menos 10 s: en un directo con gente entrando sin parar, saludar a cada uno taparía todo lo demás
const saludados = new Map();
let porSaludar = [];
let saludoTimer = null;
let ultimoSaludo = 0;
function entra(user) {
  if (!user) return;
  const ahora = Date.now();
  for (const [u, at] of saludados) if (ahora - at > 600_000) saludados.delete(u);
  if (saludados.has(user)) return;
  saludados.set(user, ahora);
  porSaludar.push(nombreHablado(user));
  saludoTimer ??= setTimeout(saludar, 5000);
}
function saludar() {
  saludoTimer = null;
  const nombres = [...new Set(porSaludar)];
  porSaludar = [];
  if (!nombres.length || Date.now() - ultimoSaludo < 10_000 || cola.length >= 3) return;
  ultimoSaludo = Date.now();
  if (nombres.length === 1) decir(`Bienvenido ${nombres[0]}! Comenta algo en el chat y entras a la arena!`, SALUDO);
  else if (nombres.length <= 3) decir(`Bienvenidos ${lista(nombres)}! Comenten para entrar a pelear!`, SALUDO);
  else decir('Bienvenidos todos los que van llegando! Comenten o den treinta toques y entran a la arena!', SALUDO, true);
}

// ===== Seguidores y compartidos → gracias =====
// Una vez por persona en 10 minutos (TikTok a veces repite el aviso)
const agradecidos = new Map();
function social({ user }, tipo) {
  if (!user) return;
  const ahora = Date.now();
  for (const [k, at] of agradecidos) if (ahora - at > 600_000) agradecidos.delete(k);
  if (agradecidos.has(`${tipo}|${user}`)) return;
  agradecidos.set(`${tipo}|${user}`, ahora);
  const n = nombreHablado(user);
  if (tipo === 'follow')
    decir(elegir([`Mirá, ${n} nos siguió! Gracias parce, bienvenido a la familia!`, `Qué nota, ${n}! Gracias por el follow, hágale que acá se pelea bonito!`]), PREGUNTA);
  else decir(elegir([`Gracias ${n} por compartir el directo, de una!`, `${n} compartió el live! Mil gracias, parce!`]), PREGUNTA);
}

// ===== Saludos en el chat → respuesta con plantilla =====
// "hola", "buenas", "qué más"… no son preguntas, pero Brutus tiene que devolver el saludo (sin IA, instantáneo)
const SALUDO_RE = /^\W*(hola+|holi+|ola|buenas+|buenos d[ií]as|buenas (tardes|noches)|hey+|ey+|saludos|qu[eé] m[aá]s|quiubo|quihubo|epa|hello|hi)\b/i;
const saludadosChat = new Map();
let ultimoSaludoChat = 0;
function saludoChat({ user, text }) {
  const t = String(text ?? '').trim();
  if (!user || t.length > 40 || !SALUDO_RE.test(t)) return false;
  const ahora = Date.now();
  if (ahora - (saludadosChat.get(user) ?? 0) < 120_000 || ahora - ultimoSaludoChat < 4000 || cola.length >= 3) return true;
  saludadosChat.set(user, ahora);
  ultimoSaludoChat = ahora;
  const n = nombreHablado(user);
  decir(elegir([`Hola ${n}, qué más pues! Comenta o dale treinta toques y entrás a la arena!`, `Quiubo ${n}! Bienvenido, escribí lo que quieras y entrás a pelear!`, `Ey ${n}, buenas! Qué nota que estés acá, hágale a la arena!`]), SALUDO);
  return true;
}

// ===== Preguntas del chat → modelo local =====
const PREGUNTA_RE = /^(como|cómo|que|qué|cuando|cuándo|cuanto|cuánto|cuantos|cuántos|donde|dónde|cual|cuál|quien|quién|por qu[eé]|para qu[eé]|se puede|puedo|sirve|hay)\b/i;
const esPregunta = (t) => t.length >= 8 && t.length <= 200 && (/[?¿]/.test(t) || PREGUNTA_RE.test(t));
// Intentos evidentes de cambiarle las reglas: ni se le pasan al modelo
const SOSPECHOSO = /ignor[ae].*(instruc|regla|prompt)|system prompt|prompt del sistema|eres ahora|act[uú]a como|olvida (todo|tus)/i;
const COOLDOWN_GLOBAL_MS = 5000;
const COOLDOWN_USUARIO_MS = 30_000;
let preguntando = false;
let ultimaPregunta = 0;
const porUsuario = new Map();

async function comentario({ user, text }) {
  const t = String(text ?? '').trim();
  if (saludoChat({ user, text: t })) return;
  if (!user || !esPregunta(t) || SOSPECHOSO.test(t)) return;
  const ahora = Date.now();
  if (preguntando || cola.length >= 3 || ahora - ultimaPregunta < COOLDOWN_GLOBAL_MS) return;
  if (ahora - (porUsuario.get(user) ?? 0) < COOLDOWN_USUARIO_MS) return;
  preguntando = true;
  ultimaPregunta = ahora;
  porUsuario.set(user, ahora);
  try {
    const respuesta = await preguntar(t);
    if (respuesta) decir(`${nombreHablado(user)}, ${respuesta}`, PREGUNTA);
  } catch (err) {
    console.error(`🟠 El modelo no respondió (¿Ollama abierto?): ${err?.message ?? err}`);
  } finally {
    preguntando = false;
  }
}
async function preguntar(pregunta) {
  const res = await fetch(`${cfg.ollama}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.modelo,
      stream: false,
      keep_alive: '30m',
      messages: [
        { role: 'system', content: SISTEMA },
        { role: 'user', content: `Pregunta: ${pregunta}` },
      ],
      options: { temperature: 0.6, num_predict: 80, num_ctx: 2048 },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Ollama respondió ${res.status}: ${(await res.text().catch(() => '')).slice(0, 150)}`);
  return limpiar((await res.json()).message?.content);
}
// Al arrancar: ver que Ollama está y tiene el modelo, y dejarlo cargado en memoria para que la primera respuesta no tarde
async function calentarModelo() {
  try {
    const res = await fetch(`${cfg.ollama}/api/tags`, { signal: AbortSignal.timeout(5000) });
    const { models = [] } = await res.json();
    if (!models.some((m) => m.name === cfg.modelo || m.name === `${cfg.modelo}:latest`)) {
      console.error(`🟠 Ollama no tiene el modelo ${cfg.modelo}. Instálalo con: ollama pull ${cfg.modelo}`);
      return;
    }
    await fetch(`${cfg.ollama}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.modelo, keep_alive: '30m' }),
      signal: AbortSignal.timeout(60_000),
    });
    console.log(`🧠 Modelo ${cfg.modelo} listo (Ollama).`);
  } catch {
    console.error(`🟠 No encuentro Ollama en ${cfg.ollama}: ábrelo para que pueda responder preguntas. Los gracias y saludos funcionan igual.`);
  }
}

// ===== Eventos del puente =====
function evento(msg) {
  switch (msg?.type) {
    case 'gift':
      return regalo(msg);
    case 'join':
      return entra(msg.user);
    case 'follow':
    case 'share':
      return social(msg, msg.type);
    case 'comment':
      return void comentario(msg);
    default: // like y status no se dicen en voz
  }
}
function conectar() {
  const ws = new WebSocket(cfg.puente);
  let abierto = false;
  ws.on('open', () => {
    abierto = true;
    console.log(`🔌 Conectado al puente (${cfg.puente}).`);
  });
  ws.on('message', (raw) => {
    try {
      evento(JSON.parse(raw.toString()));
    } catch {
      /* un mensaje roto no tumba la voz */
    }
  });
  ws.on('close', () => {
    if (abierto) console.log('🟠 Se cerró el puente. Reintentando…');
    setTimeout(conectar, RETRY_MS);
  });
  ws.on('error', () => {}); // (el close que sigue ya reintenta)
}

// ===== Arranque =====
async function prueba() {
  console.log('Modo prueba: eventos de ejemplo, sin puente.');
  evento({ type: 'gift', user: 'luna_gamer23', gift: 'Rose', coins: 1, count: 1 });
  await new Promise((r) => setTimeout(r, 4000));
  await comentario({ user: 'pedro99', text: 'cómo entro a pelear?' });
  evento({ type: 'join', user: 'sofi.vega' });
  evento({ type: 'join', user: 'migue73' });
  await new Promise((r) => setTimeout(r, 6000));
  evento({ type: 'gift', user: 'carlos_k', gift: 'Corgi', coins: 299, count: 1 });
  await new Promise((r) => setTimeout(r, 4000));
  while (hablando || cola.length) await new Promise((r) => setTimeout(r, 500));
  await limpiarTodo();
  process.exit(0);
}
async function limpiarTodo() {
  if (carpeta) await rm(carpeta, { recursive: true, force: true }).catch(() => {});
}
process.on('SIGINT', async () => {
  await limpiarTodo();
  process.exit(0);
});

console.log(`Voz del streamer virtual: ${cfg.key && cfg.voz ? 'ElevenLabs' : 'sin voz (solo texto)'} + ${cfg.modelo} en Ollama. Ctrl+C para cerrarla.`);
await calentarModelo();
if (process.argv.includes('--prueba')) await prueba();
else conectar();
