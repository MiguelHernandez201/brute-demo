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

## Modos

- **1 vs 1**: dos jugadores con brutes al azar. Tienda lateral para comprar armas, power-ups,
  mascotas y pociones, que entran en el siguiente turno. El ganador sigue (sin curarse) al *Desafiar*.
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
