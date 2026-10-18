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

- **1 vs 1**: dos jugadores con brutes al azar. Tienda lateral para comprar armas, mascotas y pociones,
  que entran en el siguiente turno, y un botón por cada power-up (Bomba, Red, Rompecuellos, Hipnosis…):
  el power-up elegido se activa sí o sí al empezar el siguiente turno, sin depender de la probabilidad
  (si aún no puede usarse, como Ladrón con el rival desarmado, se reintenta hasta 3 turnos).
  Además hay un power-up propio de la demo, **Súper gigante**: el brute crece al triple de su tamaño y durante el resto
  de la pelea hace el doble de daño y recibe la mitad.
  El **Grito maldito** y el **Ladrón** están en desuso en los dos modos: ningún brute los recibe y la tienda no
  los ofrece.
  En los dos modos los brutes conservan más tiempo el arma que sacan: los desarmes son la mitad de probables,
  lanzan el arma que llevan con menos frecuencia y tardan más en cambiarla por otra (ver las constantes al
  principio de `engine/fightMethods.ts`). La probabilidad de perder el arma en cada golpe baja de ~11 % a ~6 %.
  El ganador sigue (sin curarse) al *Desafiar*.
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

  La casilla **Celebrar tras la fatality** decide si después el ganador saca músculo y hace su
  celebración de victoria (pose, fanfarria y pétalos) o se queda quieto.

  Para ver una en concreto se puede forzar con la URL, por ejemplo `?fatality=aplastado`
  (`decapitacion`, `partido`, `aplastado`, `acribillado`, `latigo` o `explosion`).
- **Battle Royale**: de 3 a 20 brutes, todos contra todos y todos peleando a la vez por toda la arena.
  - Duelos simultáneos: cada brute (con sus mascotas) pelea contra un rival fijo hasta que uno de los dos
    cae, y entonces busca otro (primero a quien lo esté atacando, luego a alguien libre). Así cada turno solo
    implica a una pareja y se animan todos los duelos a la vez: si cada ataque fuera a un rival al azar entre
    todos, la mayoría tendría que esperar a que otros terminaran. Con número impar, el que sobra se suma a un
    duelo ajeno hasta que alguien quede libre. Bomba, Diluvio y demás técnicas solo alcanzan al rival del duelo.
  - Tras atacar, cada uno retrocede frente a su rival (no a otra punta de la arena), así cada pareja pelea en
    su zona. Las llegadas del principio van escalonadas, sin esperar a que aterrice el anterior.
  - Carroñero y Golosina están en desuso en el royale: aquí no hay mascotas (solo llegan comprándolas en el
    1 vs 1), así que nunca podían usarse. Los brutes del royale reciben otra mejora en su lugar.
  - Cada brute lleva encima su nombre y su vida, con un color propio que también marca su fila en la
    lista. Al pasar el ratón por una fila (o tocarla) se resalta en la arena; con un clic se queda fijo.
  - **➕ Agregar** / **+5** meten brutes nuevos en plena pelea. La lista muestra los fps para ver cuántos
    aguanta la pantalla: en un PC de escritorio va fluido hasta unos 55 en pie, a unos 37 fps con 70 y a
    unos 29 fps con 85.
  - Calidad automática: con pocos brutes todo se dibuja como siempre. Con más de 20 en pie (⚡ junto a los
    fps), cada pieza sombreada del cuerpo se dibuja una vez a una imagen y se reutiliza, y la sombra ya va
    desenfocada: se ve igual sin repetir esos filtros en cada fotograma. Con más de 35 (⚡⚡), los que
    esperan respiran a la mitad de fotogramas. Para comparar se puede fijar con `?calidad=0`, `1` o `2`.
  - Los que esperan su turno no se quedan quietos: trotan, cruzan la arena a la carrera, rondan y amagan
    a un rival, saltan, se ponen en guardia o sacan músculo. Se sobresaltan con los críticos de al lado,
    y los críticos lanzan por los aires a quien los recibe.
  - Cada eliminado cae con la fatality del arma de quien lo remató: solo la animación sobre los personajes
    y sus sonidos (sin letreros, voz ni cámara), mientras el resto sigue peleando y los que miran
    reaccionan. Sus restos se desvanecen al rato y la sangre se queda en el suelo. La lista cuenta quién
    eliminó a quién ("Mazo decapitó a Brasa").
  - Toda la sangre del suelo (manchas, charcos y grietas) es un solo dibujo: cada mancha se pinta una vez en
    una imagen de la arena y se descarta. Así no pesa más a medida que avanza la pelea y los fps se recuperan
    cuando quedan pocos en pie (antes cada mancha era un dibujo suelto y llegaban a acumularse unas 8.000).

## Estructura (`web/src`)

- `engine/` — motor de peleas del servidor original, sin Prisma; `session.ts` lo juega turno a turno.
- `fight/` — animación de la pelea del cliente original (PixiJS), con ajustes para la demo.
- `core/` — copia de `@labrute/core`.
- `sim.ts` — genera brutes y peleas; `shop.js` — tienda; `main.js` — interfaz.

## Origen y licencia

Código y recursos tomados de [LaBrute](https://github.com/Zenoo/labrute) (Eternaltwin).
El código está bajo **PolyForm Noncommercial 1.0.0** y los recursos gráficos y de sonido bajo
**CC BY-NC-SA 4.0**: no se permite ningún uso comercial.
