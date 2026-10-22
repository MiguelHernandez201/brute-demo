// Directo de TikTok de verdad: se conecta al puente (live/puente.js, que lee tu directo) por un WebSocket local y le
// pasa al juego lo que llega: regalos ({ type: 'gift', user, gift, coins, count }), toques ({ type: 'like', user,
// count }), comentarios ({ type: 'comment', user }) y quien entra a verlo ({ type: 'join', user }). Y cómo va el
// puente con TikTok ({ type: 'status', state,
// streamer, text }; state 'off' si el puente no está abierto). Si no está abierto, lo vuelve a intentar cada poco
export const LIVE_URL = 'ws://127.0.0.1:21214';
const RETRY_MS = 5000;

export function connectLive({ onEvent, onStatus }) {
  const open = () => {
    let ws;
    try {
      ws = new WebSocket(LIVE_URL);
    } catch {
      return void setTimeout(open, RETRY_MS);
    }
    ws.onmessage = (e) => {
      let data;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data?.type === 'status') onStatus(data);
      else if (data?.type) onEvent(data);
    };
    ws.onclose = () => {
      onStatus({ state: 'off' });
      setTimeout(open, RETRY_MS);
    };
  };
  onStatus({ state: 'off' });
  open();
}
