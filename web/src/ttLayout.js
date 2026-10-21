// Modo TikTok: tamaño y posición de los paneles (arena de pelea, cabecera, chat, cuadro de regalos, cómo jugar, ranking e imágenes) personalizables. Con la tecla E se entra en
// modo edición: se arrastra un panel para moverlo y su esquina inferior derecha para cambiar el tamaño. Se guarda en
// este navegador (localStorage). Las medidas van en cqw (centésimas del ancho de la pantalla vertical), igual que el CSS.
const KEY = 'brute-demo-tiktok-layout';
// Qué se puede ajustar de cada panel: `h` false = la altura sale sola (ranking y cómo jugar: por su contenido)
const PANELS = [
  { id: 'canvas', h: false },
  { id: 'ttHeader', h: false },
  { id: 'ttChat', h: true },
  { id: 'ttBanner', h: true },
  { id: 'ttHowTo', h: false },
  { id: 'ttRanking', h: false },
  { id: 'ttMascot', h: false },
  { id: 'ttMascot2', h: false },
];
// Distribución de fábrica: la que se dejó puesta con la tecla E para el directo. Lo que se guarde en este navegador va
// por encima, panel a panel, y R vuelve a esta. Mismo formato que lo guardado: desplazamiento (x, y), ancho (w), alto
// (h) y capa (z), en cqw
const DEFAULT_LAYOUT = {
  canvas: { x: 0, y: 4.6, w: 100 },
  ttHeader: { x: -1.9, y: 0.7, w: 100, z: 4 },
  ttChat: { x: -1.3, y: 1.7, w: 47, h: 61.2, z: 1 },
  ttBanner: { x: 0.9, y: -0.5, w: 89, h: 23.8 },
  ttRanking: { x: -1.6, y: 35, w: 38.5, z: 3 },
  ttMascot: { x: -10.9, y: 21.3, w: 35.8, z: 6 },
  ttMascot2: { x: -41.8, y: 25.9, w: 33.2, z: 5 },
};
const layoutOf = (id) => saved[id] ?? DEFAULT_LAYOUT[id] ?? {};
// Lo guardado de un panel; al tocarlo por primera vez parte de como está de fábrica
const own = (id) => (saved[id] ??= { ...(DEFAULT_LAYOUT[id] ?? {}) });
// Zona de la esquina (en cqw) que cambia el tamaño en vez de mover
const CORNER = 6;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
} catch {
  /* sin storage */
}
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* sin storage */
  }
};

// Orden de capas de fábrica (de atrás hacia delante), para cuando aún no se ha tocado
const DEFAULT_ORDER = ['canvas', 'ttChat', 'ttBanner', 'ttHowTo', 'ttRanking', 'ttMascot', 'ttMascot2', 'ttHeader'];
let selected = null;
const select = (id) => {
  selected = id;
  PANELS.forEach(({ id: other }) => document.getElementById(other).classList.toggle('tt-sel', other === id));
};
// Sube o baja el panel seleccionado un puesto en el orden de capas
function moveLayer(dir) {
  if (!selected) return;
  const z = (id) => layoutOf(id).z ?? DEFAULT_ORDER.indexOf(id) + 1;
  const order = PANELS.map((p) => p.id).sort(
    (a, b) => z(a) - z(b) || DEFAULT_ORDER.indexOf(a) - DEFAULT_ORDER.indexOf(b),
  );
  const i = order.indexOf(selected);
  const j = i + dir;
  if (j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  order.forEach((id, k) => (own(id).z = k + 1));
  applyLayout();
  persist();
}
document.addEventListener('keydown', (e) => {
  if (!document.body.classList.contains('tt-edit') || e.target.closest?.('input, textarea')) return;
  if (e.key === '+' || e.key === ']' || e.key === 'PageUp') moveLayer(1);
  else if (e.key === '-' || e.key === '[' || e.key === 'PageDown') moveLayer(-1);
  else return;
  e.preventDefault();
});

const unit = () => (document.getElementById('arena').clientWidth || 540) / 100;

function applyOne({ id }) {
  const el = document.getElementById(id);
  const s = layoutOf(id);
  el.style.width = s.w != null ? `${s.w}cqw` : '';
  el.style.minWidth = s.w != null ? '0' : '';
  el.style.maxWidth = s.w != null ? 'none' : '';
  el.style.height = s.h != null ? `${s.h}cqw` : '';
  el.style.zIndex = s.z != null ? String(s.z) : '';
  el.style.transform = s.x || s.y ? `translate(${s.x ?? 0}cqw, ${s.y ?? 0}cqw)` : '';
}
export const applyLayout = () => PANELS.forEach(applyOne);

export function resetLayout() {
  saved = {};
  persist();
  applyLayout();
}

export function toggleEdit(force) {
  const on = force ?? !document.body.classList.contains('tt-edit');
  document.body.classList.toggle('tt-edit', on);
  if (!on) select(null);
  if (on) document.body.classList.remove('tt-controls');
}

for (const panel of PANELS) {
  const el = document.getElementById(panel.id);
  el.addEventListener('pointerdown', (e) => {
    if (!document.body.classList.contains('tt-edit')) return;
    e.preventDefault();
    select(panel.id);
    const u = unit();
    const box = el.getBoundingClientRect();
    const start = { px: e.clientX, py: e.clientY, ...layoutOf(panel.id) };
    const resize = (box.right - e.clientX) / u < CORNER && (box.bottom - e.clientY) / u < CORNER;
    const w0 = box.width / u;
    const h0 = box.height / u;
    el.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const dx = (ev.clientX - start.px) / u;
      const dy = (ev.clientY - start.py) / u;
      const s = own(panel.id);
      if (resize) {
        s.w = Math.round(clamp(w0 + dx, 15, 100) * 10) / 10;
        if (panel.h) s.h = Math.round(clamp(h0 + dy, 8, 130) * 10) / 10;
      } else {
        s.x = Math.round(((start.x ?? 0) + dx) * 10) / 10;
        s.y = Math.round(((start.y ?? 0) + dy) * 10) / 10;
      }
      applyOne(panel);
    };
    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      persist();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  });
}
