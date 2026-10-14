// Demo: permite ocultar el HUD superior (nombres, barras de vida, retratos e iconos) en el battle royale,
// donde la vida de todos se muestra en el panel lateral.
export const hudControl = { hidden: false };

// Capas (zIndex) que ocupa el HUD superior en el escenario: iconos 99, cabeceras/barras/retratos 100-103
export const isHudLayer = (zIndex: number) => zIndex >= 99 && zIndex <= 103;
