// Puente entre tu directo de TikTok y el juego. Lee los regalos, los toques (tap tap) y los comentarios de tu directo
// con tiktok-live-connector (no hay API oficial: se conecta como un espectador más, solo con tu nombre de usuario) y
// se los pasa a la página del juego por un WebSocket local, ws://127.0.0.1:21214 (ver web/src/live.js). Si aún no
// estás en directo, espera y lo vuelve a intentar solo; si se corta, se reconecta.
//
// Uso: node puente.js tu_usuario   (o iniciar-directo.bat, en la carpeta de arriba, que también abre el juego)
// Opcional: la variable EULER_API_KEY con una clave de https://www.eulerstream.com, el servicio que usa la librería
// para conectarse, si el uso gratuito se queda corto (avisa con un error de límite)
import {
  ControlEvent,
  InvalidResponseCompositeError,
  SignatureRateLimitError,
  TikTokLiveConnection,
  UserOfflineError,
  WebcastEvent,
} from 'tiktok-live-connector';
import { WebSocketServer } from 'ws';

const PORT = 21214;
// Cada cuánto se reintenta: sin directo (no se le pregunta a TikTok más a menudo) y tras un corte o un error
const OFFLINE_RETRY_MS = 30_000;
const ERROR_RETRY_MS = 10_000;

const streamer = (process.argv[2] ?? '').replace(/^@/, '').trim();
if (!streamer) {
  console.error('Falta tu usuario de TikTok. Uso: node puente.js tu_usuario');
  process.exit(1);
}

// ===== Hacia el juego =====
// Solo páginas del juego: en tu PC (localhost) o la publicada en GitHub Pages (con ?live)
const allowed = (origin) => {
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.github.io');
  } catch {
    return false;
  }
};
const server = new WebSocketServer({ host: '127.0.0.1', port: PORT, verifyClient: ({ origin }) => allowed(origin) });
server.on('error', (err) => {
  console.error(
    err.code === 'EADDRINUSE' ? `El puerto ${PORT} está ocupado: ¿ya tienes el puente abierto en otra ventana?` : err,
  );
  process.exit(1);
});
const send = (msg) => {
  const text = JSON.stringify(msg);
  for (const client of server.clients) if (client.readyState === client.OPEN) client.send(text);
};
// Cómo va la conexión con el directo, para el panel de regalos del juego: 'conectando', 'esperando' (no estás en
// directo), 'conectado' o 'error'
let status = { type: 'status', state: 'conectando', streamer };
const setStatus = (state, text) => {
  const changed = state !== status.state || text !== status.text;
  status = { type: 'status', state, streamer, ...(text ? { text } : {}) };
  if (changed) send(status);
  return changed;
};
// Ajustes que el juego le manda a la voz del streamer virtual (casilla 💬 del panel de regalos): el puente se los pasa a
// los demás clientes y se los recuerda a los que se conecten después
let config = null;
server.on('connection', (ws) => {
  ws.send(JSON.stringify(status));
  if (config) ws.send(JSON.stringify(config));
  console.log('🎮 Un cliente se conectó al puente (el juego o la voz)');
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg?.type !== 'config' || typeof msg.conversacional !== 'boolean') return;
    config = { type: 'config', conversacional: msg.conversacional };
    console.log(`💬 Modo conversacional ${msg.conversacional ? 'activado' : 'apagado'}`);
    const text = JSON.stringify(config);
    for (const client of server.clients) if (client !== ws && client.readyState === client.OPEN) client.send(text);
  });
});

// ===== Desde TikTok =====
const connection = new TikTokLiveConnection(streamer, {
  signApiKey: process.env.EULER_API_KEY || undefined,
  // Sin los comentarios de antes de conectarse: al reconectar volverían a meter a pelear a quien ya comentó
  processInitialData: false,
});
// El espectador: su usuario de TikTok (@usuario, sin la @), que no se repite y se lee bien en la arena
const who = (user) => user?.uniqueId || user?.displayId || user?.nickname || '';

let retryTimer = null;
const retry = (ms) => {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, ms);
};
let connecting = false;
async function connect() {
  if (connecting || connection.isConnected) return;
  connecting = true;
  // (mientras no estés en directo se queda en 'esperando', sin parpadear a 'conectando' en cada intento)
  if (status.state !== 'esperando') setStatus('conectando');
  // La sala se busca de nuevo en cada intento: la librería se queda con la del último directo, que ya no sirve, y
  // con ella nunca vería el siguiente
  connection.webClient.roomId = '';
  try {
    const state = await connection.connect();
    streaks.clear();
    setStatus('conectado');
    console.log(`🟢 Conectado al directo de @${streamer} (sala ${state.roomId}). Ya pasan los regalos al juego.`);
  } catch (err) {
    // Sin directo: o TikTok dice que no estás en directo, o ni siquiera encuentra una sala (pasa con cuentas que aún no
    // tienen ninguna, o si el usuario está mal escrito)
    if (err instanceof UserOfflineError || err instanceof InvalidResponseCompositeError) {
      if (setStatus('esperando', err.message))
        console.log(
          `🟡 No encuentro ningún directo de @${streamer}: esperando a que empieces (lo vuelvo a mirar cada 30 s).\n` +
            `   Si ya estás en directo y no conecta, revisa que el usuario sea el de tu perfil: tiktok.com/@${streamer}`,
        );
      return retry(OFFLINE_RETRY_MS);
    }
    const text = err?.message ?? String(err);
    setStatus('error', text);
    console.error(`🟠 No se pudo conectar con el directo: ${text}`);
    if (err instanceof SignatureRateLimitError)
      console.error('   Es el límite del uso gratuito: pon una clave de https://www.eulerstream.com en EULER_API_KEY.');
    retry(ERROR_RETRY_MS);
  } finally {
    connecting = false;
  }
}
connection.on(ControlEvent.DISCONNECTED, () => {
  if (status.state === 'conectado') console.log('🟠 Se cortó la conexión con el directo. Reintentando…');
  setStatus('conectando');
  retry(ERROR_RETRY_MS);
});
connection.on(WebcastEvent.STREAM_END, () => console.log('⏹️ Terminó el directo.'));
connection.on(ControlEvent.ERROR, ({ info, exception }) => {
  // (los de conectar ya los cuenta connect, y que no estés en directo no es un error)
  if (connecting) return;
  console.error(`⚠️ ${info ?? 'Error'}${exception?.message ? `: ${exception.message}` : ''}`);
});

// Regalos. Los de racha (los que se mandan seguidos, como la Rose) repiten el aviso con el total que llevan, y llega
// uno más al terminar: se pasa al juego cada regalo nuevo según llega (no todos al final), sin contar dos veces
const streaks = new Map();
const STREAK_FORGET_MS = 60_000;
connection.on(WebcastEvent.GIFT, (data) => {
  const gift = data.gift ?? {};
  const name = gift.name || data.giftDetails?.giftName || data.extendedGiftInfo?.name || '';
  // (lo que vale uno, en monedas)
  const coins = gift.diamondCount || data.giftDetails?.diamondCount || data.extendedGiftInfo?.diamond_count || 0;
  const user = who(data.user);
  if (!user || !name) return;
  const total = Math.max(1, data.repeatCount || 1);
  let count = total;
  if (gift.combo || (gift.type ?? data.giftDetails?.giftType) === 1) {
    const now = Date.now();
    for (const [key, s] of streaks) if (now - s.at > STREAK_FORGET_MS) streaks.delete(key);
    const key = `${user}|${data.giftId}|${data.groupId}`;
    const sent = streaks.get(key)?.sent ?? 0;
    count = total - sent;
    if (data.repeatEnd) streaks.delete(key);
    else streaks.set(key, { sent: Math.max(sent, total), at: now });
  }
  if (count <= 0) return;
  console.log(`🎁 ${user} envió ${name}${count > 1 ? ` x${count}` : ''} (🪙${coins})`);
  send({ type: 'gift', user, gift: name, coins, count });
});
// Toques en la pantalla: TikTok los manda en tandas de hasta 15 (no uno a uno, y con mucha gente no siempre). El
// juego los va sumando por espectador; aquí también, para ver cuántos lleva cada uno (mientras el puente sigue abierto)
const likes = new Map();
connection.on(WebcastEvent.LIKE, (data) => {
  const user = who(data.user);
  const count = data.likeCount || data.count || 0;
  if (!user || count <= 0) return;
  const total = (likes.get(user) ?? 0) + count;
  likes.set(user, total);
  console.log(`👆 ${user} +${count} toques (${total} en total)`);
  send({ type: 'like', user, count });
});
// Quien entra a ver el directo: el juego lo mete a pelear aunque no comente, si está marcada la casilla 🚪 de su panel
// de regalos
connection.on(WebcastEvent.MEMBER, (data) => {
  const user = who(data.user);
  if (!user) return;
  console.log(`🚪 ${user} entró al directo`);
  send({ type: 'join', user });
});
// Quien te sigue o comparte el directo: solo lo usa la voz del streamer virtual (live/voz.js) para agradecerlo; el juego lo ignora
connection.on(WebcastEvent.FOLLOW, (data) => {
  const user = who(data.user);
  if (!user) return;
  console.log(`➕ ${user} te siguió`);
  send({ type: 'follow', user });
});
connection.on(WebcastEvent.SHARE, (data) => {
  const user = who(data.user);
  if (!user) return;
  console.log(`🔁 ${user} compartió el directo`);
  send({ type: 'share', user });
});
// Comentarios: comentar mete a pelear (ver ¿Cómo jugar? en el juego)
connection.on(WebcastEvent.CHAT, (data) => {
  const user = who(data.user);
  if (!user) return;
  const text = data.comment ?? data.content ?? '';
  console.log(`💬 ${user}: ${text}`);
  // (el texto lo usa la voz del streamer virtual, live/voz.js; el juego solo mira quién comentó)
  send({ type: 'comment', user, text });
});

process.on('SIGINT', async () => {
  await connection.disconnect().catch(() => {});
  process.exit(0);
});

console.log(`Puente del directo de TikTok: @${streamer} → juego (ws://127.0.0.1:${PORT}). Ctrl+C para cerrarlo.`);
connect();
