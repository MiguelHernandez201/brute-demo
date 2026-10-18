// Demo: calidad dinámica según cuántos luchadores hay en pie (pensado para los royale enormes).
//   Nivel 0 (pocos): todo como siempre. El sombreado del cuerpo y la sombra se calculan en cada fotograma.
//   Nivel 1: cada pieza sombreada se dibuja una vez con su sombreado a una imagen y se reutiliza, y la sombra
//            ya va desenfocada (se ve igual, sin repetir esos filtros en cada fotograma).
//   Nivel 2: además, los que están en reposo se redibujan a la mitad de fotogramas (respiran al mismo ritmo).
// Se sube con más luchadores de los umbrales y se baja con unos menos, para no saltar de un nivel a otro.
const UP = [20, 35];
const DOWN = [17, 31];
// Piezas horneadas como mucho por fotograma (entre todos), para no dar un tirón al cambiar de nivel
const BAKES_PER_FRAME = 24;

export const crowdQuality = {
  level: 0,
  // Nivel fijo para comparar (?calidad=0, 1 o 2 en la URL); null = automático
  forced: null as number | null,
  bakeShading: false,
  bakeShadows: false,
  // Cada cuántos ticks de animación se redibuja el reposo (1 = siempre)
  idleEvery: 1,
  // Lo que queda por hornear en este fotograma
  bakeBudget: BAKES_PER_FRAME,
};

export const setCrowdLevel = (level: number) => {
  crowdQuality.level = level;
  crowdQuality.bakeShading = level >= 1;
  crowdQuality.bakeShadows = level >= 1;
  crowdQuality.idleEvery = level >= 2 ? 2 : 1;
};

// Ajusta el nivel a los luchadores en pie
export const updateCrowdQuality = (alive: number) => {
  let { level } = crowdQuality;
  while (level < UP.length && alive > (UP[level] ?? Infinity)) level += 1;
  while (level > 0 && alive < (DOWN[level - 1] ?? 0)) level -= 1;
  if (crowdQuality.forced !== null) level = crowdQuality.forced;
  if (level !== crowdQuality.level) setCrowdLevel(level);
};

// Cada fotograma se renueva el cupo de horneado
export const resetBakeBudget = () => {
  crowdQuality.bakeBudget = BAKES_PER_FRAME;
};
