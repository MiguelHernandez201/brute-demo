// Simula rondas del royale sin animación, con el motor de verdad (sim.ts), y estima lo que durarían en pantalla.
// Sirve para ajustar el equilibrio (por ejemplo, la vida de los jefes del royale de bandos, CHIEF_HP en sim.ts).
//
// Desde web/:
//   node scripts/simular.mjs royale [rondas] [brutes]
//   node scripts/simular.mjs bandos [rondas] [refuerzos] [regalos: 0, 1, 2…] [vida de los jefes]
//
// Con regalos, cada 10 unidades (unos 27 s) llegan tantos como diga, de un espectador de un bando al azar, repartidos
// como en el juego (ver sim.bandosGift): casi todos de 1 o 10 monedas, y de vez en cuando uno de 30, 100 o 299
//
// La duración sale de un modelo de la animación: cada turno ocupa a todos los que salen en él una "unidad" y el motor
// no juega el turno de quien sigue ocupado (como session.playTurn con `hold`). Medido en el navegador (con un reloj
// simulado), 3 royales de 10 tardaron 67, 71 y 105 s de juego, 81 de media, y aquí son unas 30 unidades: una unidad son
// unos 2,7 s
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const SECONDS_PER_UNIT = 2.7;
// El reloj de "Finalizar": 3 minutos
const LIMIT = 180 / SECONDS_PER_UNIT;

const [mode = 'royale', ...rest] = process.argv.slice(2);
const [rounds = 100, count = mode === 'bandos' ? 6 : 10, gifts = 0, chiefHp] = rest.map(Number);
if (!['royale', 'bandos'].includes(mode)) {
  console.log('Uso: node scripts/simular.mjs royale|bandos [rondas] [brutes] [regalos 0/1] [vida de los jefes]');
  process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({
  root,
  configFile: `${root}/vite.config.js`,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
try {
  const sim = await server.ssrLoadModule('/src/sim.ts');
  const { PETRO_LOOK, ABELARDO_LOOK } = await server.ssrLoadModule('/src/chuck.ts');
  const sides = [
    { id: 'petro', chief: 'Gustavo Petro', chiefLook: PETRO_LOOK },
    { id: 'abelardo', chief: 'Abelardo', chiefLook: ABELARDO_LOOK },
  ];
  const bandos = mode === 'bandos';
  const durations = [];
  const wins = { petro: 0, abelardo: 0 };
  let timeUps = 0;
  let friendly = 0;
  let notChief = 0;
  for (let r = 0; r < rounds; r++) {
    const { session, fight } = sim.createRoyale(count, bandos ? { sides, chiefHp } : {});
    const fd = session.fightData;
    const busy = new Map();
    let now = 0;
    let lastJoin = 0;
    let lastGift = 0;
    const hold = (i) => (busy.get(i) ?? 0) > now + 1e-9;
    while (!session.finished && now <= LIMIT) {
      // Con regalos: entra un espectador cada ~16 s y llegan regalos (ver arriba). El que regala entra a su bando y
      // recibe su parte, y su jefe la suya
      if (bandos && gifts) {
        const side = () => (Math.random() < +(process.env.SESGO ?? 0.5) ? 'petro' : 'abelardo');
        if (now - lastJoin >= 6 && fight.canAddBrute()) {
          lastJoin = now;
          fight.addBrute(`espectador${r}-${now}`, undefined, side());
        }
        if (now - lastGift >= 10 / gifts) {
          lastGift = now;
          const coins = [1, 1, 1, 1, 10, 10, 30, 100, 299][Math.floor(Math.random() * 9)];
          const { chief, viewer } = sim.bandosGift(coins);
          const own = side();
          const giver = fight.canAddBrute() ? fight.addBrute(`regalo${r}-${now}`, undefined, own) : null;
          if (giver) fight.castBoost(giver.index, viewer.tier, viewer.hp);
          fight.castBoost(fight.chiefs()[own], chief.tier, chief.hp);
        }
      }
      const before = fd.steps.length;
      const res = session.playTurn(hold);
      if (res === null) {
        const next = Math.min(...[...busy.values()].filter((v) => v > now + 1e-9));
        if (!Number.isFinite(next)) break;
        now = next;
        continue;
      }
      if (res === false) break;
      const involved = new Set();
      for (const st of fd.steps.slice(before)) {
        for (const key of ['f', 't', 'b']) {
          [].concat(st[key] ?? []).forEach((i) => typeof i === 'number' && involved.add(i));
        }
        // Nadie golpea a uno de su bando
        const actor = st.f ?? st.b;
        if (bandos && actor !== undefined && session.sideOf(actor) !== undefined) {
          [].concat(st.t ?? []).forEach((t) => {
            if (typeof t === 'number' && t !== actor && session.sideOf(t) === session.sideOf(actor)) friendly++;
          });
        }
      }
      const start = Math.max(now, ...[...involved].map((i) => busy.get(i) ?? 0));
      involved.forEach((i) => busy.set(i, start + 1));
    }
    const units = Math.max(now, ...busy.values());
    durations.push(Math.min(units, LIMIT) * SECONDS_PER_UNIT);
    if (!session.finished) {
      timeUps++;
      continue;
    }
    if (bandos) {
      const loser = fd.fighters.find((f) => f.id === fd.loser);
      const side = Object.entries(session.chiefs).find(([, f]) => f === loser)?.[0];
      if (side) wins[side === 'petro' ? 'abelardo' : 'petro']++;
      else notChief++;
    }
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const at = (p) => Math.round(sorted[Math.floor(sorted.length * p)]);
  const mean = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  console.log(`${rounds} rondas de ${mode === 'bandos' ? `bandos con ${count} refuerzos` : `${count} brutes`}`);
  console.log(`Duración (s): media ${mean}, 10 % ${at(0.1)}, mediana ${at(0.5)}, 90 % ${at(0.9)}`);
  console.log(`Llegan a los 3 minutos: ${timeUps} (${Math.round((timeUps / rounds) * 100)} %)`);
  if (bandos) {
    console.log(`Gana el bando de Petro: ${wins.petro} · el de Abelardo: ${wins.abelardo}`);
    console.log(`Golpes a uno de su bando: ${friendly} · rondas que no acabaron por un jefe: ${notChief}`);
  }
} finally {
  await server.close();
}
