# LaBrute Demo

Demo jugable de LaBrute que corre **sin servidor ni base de datos**: el motor de peleas original
se ejecuta en el navegador, turno a turno, y se anima con los sprites y sonidos del juego.

## Cómo correrlo

Doble clic en `iniciar-web.bat`, o desde una terminal:

```bash
cd web
npm install        # solo la primera vez
npx vite --port 3100
```

y abrir http://localhost:3100/.

También se puede jugar en línea en https://miguelhernandez201.github.io/brute-demo/
(se publica solo con cada push a `main`).

## Calidad de código

Desde `web/`:

```bash
npm run lint           # ESLint
npm run format         # Prettier (corrige el formato)
npm run format:check   # Prettier (solo verifica)
npm run build          # compilación de producción en web/dist
```

El workflow `.github/workflows/ci.yml` corre lint, formato y build en cada push y pull request,
y en `main` además publica `web/dist` en GitHub Pages. Las carpetas copiadas de LaBrute
(`core/`, `engine/`, `fight/`, `pixi/`) se excluyen de Prettier para conservar su formato original.

## Modos

- **1 vs 1**: dos jugadores con brutes al azar. Tienda lateral para comprar armas, power-ups,
  mascotas y pociones, que entran en el siguiente turno. El ganador sigue (sin curarse) al *Desafiar*.
  Cuando cae el perdedor, la pelea se remata con una **fatality**: "FINISH HIM!", el ganador se acerca
  y lo remata según el arma que lleva, y luego el letrero "FATALITY" (con voz del navegador si los
  efectos de sonido están activos):

  | Arma del ganador | Fatality |
  |---|---|
  | Espada, sable, cimitarra, abanico | Decapitación |
  | Hacha, hachuela, alabarda | Partido en dos |
  | Maza, mayal, sartén, hueso, lucero del alba, trombón, teclado, puerro, raqueta, bastón, jarra | Aplastado |
  | Lanza, tridente, cuchillo, sai | Acribillado |
  | Látigo | Arrancacabezas |
  | Sin arma, tazón, piopio, shuriken | Explosión |

  Para ver una en concreto se puede forzar con la URL, por ejemplo `?fatality=aplastado`
  (`decapitacion`, `partido`, `aplastado`, `acribillado`, `latigo` o `explosion`).
- **Battle Royale**: de 3 a 10 brutes, todos contra todos, con varios duelos animados a la vez.

## Estructura (`web/src`)

- `engine/` — motor de peleas del servidor original, sin Prisma; `session.ts` lo juega turno a turno.
- `fight/` — animación de la pelea del cliente original (PixiJS), con ajustes para la demo.
- `core/` — copia de `@labrute/core`.
- `sim.ts` — genera brutes y peleas; `shop.js` — tienda; `main.js` — interfaz.

## Origen y licencia

Código y recursos tomados de [LaBrute](https://github.com/Zenoo/labrute) (Eternaltwin).
El código está bajo **PolyForm Noncommercial 1.0.0** y los recursos gráficos y de sonido bajo
**CC BY-NC-SA 4.0**: no se permite ningún uso comercial.
