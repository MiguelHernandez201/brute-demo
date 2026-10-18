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
  Arriba, junto a la barra de vida de cada jugador, un trofeo cuenta sus victorias: suma una (con un salto) cuando
  se ve el final de la pelea y vuelve a cero al elegir los nombres.
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
  - Duelos simultáneos: cada brute (con sus mascotas) pelea solo con los de su grupo, una pareja o un trío,
    hasta que caen sus rivales, y entonces busca otro: alguien libre; si no hay, saca a uno de un trío; y si
    todos están en pareja, se suma a una y forman un trío donde los tres pelean entre sí. Así cada turno solo
    implica a un grupo y se animan todos los duelos a la vez: si cada ataque fuera a un rival al azar entre
    todos, la mayoría tendría que esperar a que otros terminaran. Bomba, Diluvio y demás técnicas solo alcanzan
    a los de su grupo.
  - Todos los grupos dan turnos al mismo ritmo: un trío, o una pareja de brutes rápidos, no generan más turnos
    que los demás (dentro del grupo el más rápido sigue atacando más seguido). La animación muestra los turnos
    de cada grupo de uno en uno, así que el grupo con más turnos marcaba el paso de toda la arena y el resto
    esperaba.
  - Tras atacar, cada uno retrocede frente a su rival (no a otra punta de la arena), así cada pareja pelea en
    su zona. Las llegadas del principio van escalonadas, sin esperar a que aterrice el anterior.
  - Carroñero y Golosina están en desuso en el royale: aquí no hay mascotas (solo llegan comprándolas en el
    1 vs 1), así que nunca podían usarse. Los brutes del royale reciben otra mejora en su lugar.
  - Cada brute lleva encima su nombre y su vida, con un color propio que también marca su fila en la
    lista. Al pasar el ratón por una fila (o tocarla) se resalta en la arena; con un clic se queda fijo.
    La lista solo muestra a los que siguen en pie: los eliminados cuentan en "X de Y en pie" y en las
    últimas eliminaciones, debajo.
  - Junto a esa barra de vida, un trofeo cuenta las victorias de cada brute en la ronda (cada rival que
    elimina). Aparece con la primera, para no llenar la arena de ceros, y salta cada vez que suma. La lista
    también lo muestra junto a la vida de cada fila.
  - La ronda no termina sola: si queda uno en pie, se queda **esperando retador** y mientras tanto hace el tonto
    (entrena, merienda, bebe, baila, hace piruetas, da vueltas a la arena, boxea con el aire, presume o se
    duerme), con frases en un globo. En cuanto entra alguien, vuelve a pelear.
  - **🏁 Finalizar** pone un reloj de 3 minutos arriba en la arena (y en el propio botón). Se para con la pausa y,
    pulsándolo otra vez, se cancela. La victoria llega solo cuando el reloj llega a cero ("¡TIEMPO!"): mientras
    tanto, aunque quede uno solo, sigue esperando retador y se pueden agregar brutes. Al acabarse el tiempo gana
    el que más victorias lleve de los que siguen en pie (si solo queda uno, él), y a igualdad el que tenga más
    vida. Lo que el motor ya había jugado y aún no se veía no cuenta. Los últimos 10 segundos el reloj se pone en
    rojo y late. Si los últimos caen a la vez y no queda nadie, la ronda se cierra ahí (ya no puede entrar nadie).
    Con **Rondas continuas** cada ronda empieza con el reloj en marcha, así terminan solas y pasa la siguiente.
  - **Ultimates**: cada brute tiene un botoncito en su fila de la lista con su ultimate, una versión más fuerte
    y de área de una técnica del juego que alcanza a rivales de cualquier duelo. Se reparten por igual (salen de
    una bolsa con las cuatro):
    - 🌊 **Diluvio total**: caen del cielo 16 armas repartidas entre hasta 8 rivales.
    - 💣 **Lluvia de bombas**: caen 7 bombas, cada una sobre uno o dos rivales.
    - ⚡ **Prisa en cadena**: 8 embestidas seguidas, cada una a un rival (si hay menos, vuelve a por los primeros).
    - 💪 **Súper gigante**: crece 15 s (daño x2 y recibe la mitad) y tras cada ataque da un pisotón cuya onda
      golpea a la vez a los 3 rivales más cercanos (sin rematar: deja como mínimo 1 PV).

    Están equilibradas: en 400 royales de 10 simulados, cada una quita de media unos 240 PV en total (el gigante,
    contando lo que pega de más y lo que deja de recibir). Tras verse, el botón se recarga en 30 s (se para con la
    pausa). Quien cae por una ultimate no tiene fatality (son muchos a la vez), pero la victoria es para quien la
    lanzó. Si no queda a quién darle, o ese brute ya ha caído en el motor aunque aún no se vea, el botón tiembla y
    no se gasta.
    - El letrero sale al momento y cada golpe va por su cuenta: solo espera a que su objetivo acabe lo que está
      haciendo y pasa por delante de lo que tuviera en cola (da igual en qué orden reciba los golpes: la vida que
      le quitan es la misma). Solo el golpe que remata espera su turno, para caer justo después. Si la ultimate
      fuera un turno más, no se vería hasta que todos sus objetivos terminaran lo que el motor ya había jugado.
    - La onda del gigante la suelta la animación cuando le ve atacar, así alcanza a los que tiene cerca en ese
      momento, y sus 15 s cuentan desde que se le ve crecer. Sus golpes llegan a todos a la vez que el suyo, aunque
      estén a mitad de su turno: quien está libre encaja el golpe y quien está ocupado lo recibe sin pararse
      (destello, daño y vida). Por eso la onda no remata: si alguien cayera por ella, su caída tendría que esperar
      a que acabara lo que tenía en cola. Antes cada golpe esperaba a que su objetivo quedara libre y llegaban
      escalonados, a veces segundos después del pisotón.
  - **➕ Agregar** / **+5** meten brutes nuevos en plena pelea, en cualquier momento hasta que se ve el final. El
    que llega entra en un duelo desde su primer turno (si todos están en pareja, forma un trío), así que ataca y
    recibe golpes enseguida; con +5 cada uno aparece y llega por su cuenta, sin esperar al anterior.
    - El motor solo juega por delante de la animación un turno por cada brute en pie. Antes eran al menos 16:
      con pocos en pie, todos esos turnos eran del mismo duelo y el recién llegado esperaba unos 25 s a que
      se vieran.
    - Cuando en el motor ya queda uno solo en pie, la pelea no se cierra: espera, y si entra alguien, sigue contra
      él. Antes el botón se apagaba con 3 o 4 brutes aún peleando en pantalla (el motor va por delante y ya había
      terminado).
    - El tiempo extra (veneno para todos pasados 1000 turnos) cuenta desde el último que entró: al mantener la
      pelea agregando brutes un buen rato, los que entraban caían envenenados en cuatro turnos.
    - La lista muestra los fps para ver cuántos aguanta la pantalla: en un PC de escritorio va fluido hasta
      unos 55 en pie, a unos 37 fps con 70 y a unos 29 fps con 85.
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
