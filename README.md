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

- **Battle Royale** (abajo) y **🎬 vídeo promocional**, que se graba en tiempo real con el motor del juego y se
  puede descargar.

  El modo 1 vs 1 (dos jugadores con una tienda cada uno) se quitó: el royale lo sustituye. Lo que era solo suyo se
  fue con él (nombres de los jugadores, tiendas, contador de victorias, Acercamiento y la casilla para celebrar tras
  la fatality), pero las mecánicas siguen en el motor y en la animación, aunque ahora nada las use: mascotas,
  pociones y compras a mitad de pelea (`FightSession.applyPurchase`), además de todos los recursos gráficos y de
  sonido.

  Para todos los brutes:
  - El **Grito maldito** y el **Ladrón** están en desuso: ningún brute los recibe.
  - Conservan más tiempo el arma que sacan: los desarmes son la mitad de probables, lanzan el arma que llevan con
    menos frecuencia y tardan más en cambiarla por otra (ver las constantes al principio de
    `engine/fightMethods.ts`). La probabilidad de perder el arma en cada golpe baja de ~11 % a ~6 %.
  - Quien cae lo hace con una **fatality** según el arma de quien lo remata:

    | Arma de quien remata | Fatality |
    |---|---|
    | Espada, sable, cimitarra, abanico | Decapitación |
    | Hacha, hachuela, alabarda | Partido en dos |
    | Maza, mayal, sartén, hueso, lucero del alba, trombón, teclado, puerro, raqueta, bastón, jarra | Aplastado |
    | Lanza, tridente, cuchillo, sai | Acribillado |
    | Látigo | Arrancacabezas |
    | Sin arma, tazón, piopio, shuriken | Explosión |

    Para ver una en concreto se puede forzar con la URL, por ejemplo `?fatality=aplastado`
    (`decapitacion`, `partido`, `aplastado`, `acribillado`, `latigo` o `explosion`). En el vídeo promocional sale la
    versión completa: "FINISH HIM!", el remate y el letrero "FATALITY" con voz. La voz del anunciador ("Finish
    him!" / "Finish her!" y "Fatality!") es una grabación, como la de "Multi kill!" (ver abajo).
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
  - El motor no va por delante de lo que se ve: juega el siguiente turno de cada duelo cuando acaba de verse el
    anterior. Antes se adelantaba hasta llenar la cola y en el duelo más lento (el de animaciones más largas) se
    acumulaban hasta 7 turnos: en un royale de 10, uno de cada cinco brutes en pie en pantalla ya había caído en el
    motor (a veces más de 20 s antes de verse), y si se pulsaba su ultimate se quedaba en cola sin salir nunca. Ahora
    es uno de cada veinte, casi siempre solo mientras se ve el turno en el que lo rematan, y hay más duelos
    animándose a la vez (en la misma prueba, el 93 % de los que siguen en pie; antes, el 83 %).
    - Los de un mismo duelo esperan juntos: dentro de cada uno se sigue el orden de iniciativa (en un trío, el que
      queda libre no se adelanta a los otros dos).
    - Como cada duelo lleva su propio ritmo, quien cambia de rival se pone a la hora de su nuevo duelo (como el que
      acaba de entrar): si no, el que venía de un duelo más lento encadenaba varios turnos seguidos (en 30 royales de
      16 simulados, hasta 19 ataques seguidos; así, como antes, no pasan de 12).
  - Tras atacar, cada uno retrocede frente a su rival (no a otra punta de la arena), así cada pareja pelea en
    su zona. Las llegadas del principio van escalonadas, sin esperar a que aterrice el anterior.
  - Carroñero y Golosina están en desuso en el royale: aquí no hay mascotas (salvo la del potenciador +3000, que solo
    dura un minuto), así que casi nunca podrían usarse. Los brutes del royale reciben otra mejora en su lugar.
  - Cada brute lleva encima su nombre y su vida, con un color propio que también marca su fila en la
    lista. Al pasar el ratón por una fila se resalta en la arena; con un clic se queda fijo. En el móvil, tocar la
    fila no hace nada (así no se resalta sin querer al ir a pulsar su ultimate).
    La lista solo muestra a los que siguen en pie: los eliminados cuentan en "X de Y en pie" y en las
    últimas eliminaciones, debajo.
  - **🔍 Zoom dinámico** (botón junto a los demás de la arena; activado de entrada, se recuerda en el navegador y se
    puede cambiar en plena pelea): la cámara encuadra a los que siguen en pie. Con muchos se ve la arena entera y con
    pocos se acerca (hasta x2 cuando quedan uno o dos) para ver las peleas con más detalle, sin dejar a nadie fuera ni
    salirse del escenario. Se aleja deprisa (cuando entra alguien o se separan) y se acerca despacio, sin tirones. El
    reloj y los letreros se quedan fijos arriba, y las etiquetas de nombre y vida y los globos con las frases del que
    espera mantienen su tamaño y nunca se salen de lo que se ve (antes, con zoom, los globos se cortaban por arriba).
    Con la opción activada, los luchadores se dibujan con más resolución para que de cerca no se vean borrosos.
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
    Con **🔁 Rondas continuas** cada ronda empieza con el reloj en marcha, así terminan solas y pasa la siguiente.
  - **Potenciadores**: cada brute tiene tres botones en su fila de la lista, **+300**, **+1000** y **+3000**. Los tres
    lanzan su poder (su ultimate, ver abajo; el botón no dice cuál es) y además:
    - **+300**: le cura o le suma 300 PV y le da un arma sencilla (espada ancha, cuchillo, bastón, lanza o hachuela)
      que equipa al momento.
    - **+1000**: 1000 PV, un arma poderosa (hacha, espada, mayal, lucero del alba, alabarda o maza, de nivel 2) y un
      **aura de ki** al estilo Dragon Ball para el resto de la pelea: llamas doradas y translúcidas que le envuelven y
      suben, con chispas, y hace el triple de daño (con el Súper gigante, x6).
    - **+3000**: 3000 PV, un arma poderosa de nivel 3, el aura de ki (esta con rayos, como el Súper Saiyajin 2) y una
      **mascota** (perro, pantera u oso) que pelea con él durante un minuto y luego se va.

    "Cura o suma": recupera la vida que le falte y lo que sobra sube su vida máxima, así siempre gana esos PV (y se le
    quita el veneno). Bebe una poción, sale el número en verde y la vida de su etiqueta y de la lista lo reflejan.
    - Sin recarga: en cuanto se ve su poder, los botones se pueden volver a pulsar (antes se recargaban 30, 60 o
      90 s). Cada pulsación vuelve a lanzar su poder y le suma la vida; si ya tenía el aura, estalla otra vez (y la del
      +1000 pasa a la de rayos con un +3000), y cada +3000 trae otra mascota.
    - El aura no se apaga en toda la pelea (antes duraba un minuto); solo si cae, y al momento. La mascota cuenta su
      minuto desde que llega (se para con la pausa y va al doble a x2).
    - **Quien usa un potenciador ya no pierde nunca el arma que lleva**: no se la quitan (desarmes al golpearle o al
      contraatacar, el Martillo, el Ladrón), no la lanza (ni sola ni con el Diluvio, que tira las que tenga guardadas)
      y no la cambia por otra. Antes, al rato, acababan peleando a puñetazos. La que llevaba en la mano al recibir el
      arma vuelve con las suyas, y un potenciador menor no le cambia el arma de uno mayor: se la guarda (un +300 no le
      quita el arma poderosa de un +3000).
  - **Ultimates** (el poder que lanza cada potenciador): una versión mucho más fuerte y de área de una técnica del
    juego, hecha para eliminar a varios de golpe, que alcanza a rivales de cualquier duelo. Se reparten por igual
    (salen de una bolsa con las cuatro):
    - 🌊 **Diluvio total**: caen del cielo 16 armas repartidas entre hasta 8 rivales.
    - 💣 **Lluvia de bombas**: caen 7 bombas, cada una sobre uno o dos rivales.
    - ⚡ **Prisa en cadena**: 8 embestidas seguidas, cada una a un rival (si hay menos, vuelve a por los primeros).
    - 💪 **Súper gigante**: crece 15 s (daño x2 y recibe la mitad) y tras cada ataque da un pisotón cuya onda
      golpea a la vez a los 3 rivales más cercanos.

    Están equilibradas: en 300 royales de 10 simulados, cada una quita de media unos 470-490 PV en total (el
    gigante, contando lo que pega de más y lo que deja de recibir) y elimina a unos 2 rivales. El aura de ki de los
    potenciadores 2 y 3 se enciende después de su poder, así que ese no lo multiplica; los siguientes, con el aura ya
    encendida, pegan el triple. Quien cae por una ultimate no tiene fatality (son muchos a la vez), pero la victoria es
    para quien la lanzó.
    - Si ahora no se puede lanzar (no queda a quién darle, está atrapado en una red o aturdido, en el motor ya ha
      caído aunque aún no se vea, o es un brute recién agregado que aún no ha aparecido en la arena), el potenciador
      queda **en cola** entero (⏳ en su botón, que late) y sale solo en cuanto se pueda, por ejemplo al entrar otro
      brute. Otro clic lo quita de la cola y pulsar otro de los tres lo cambia. El Súper gigante no necesita a quién
      darle (es para él): aunque en el motor ya no quede nadie, crece igual y le sirve contra el que entre.
    - Mientras se pulsa un botón de la lista, esta no se repinta hasta soltarlo. Antes, si justo entonces caía alguien
      o cambiaba otra ultimate, el botón se cambiaba por otro a mitad del toque y la pulsación se perdía.
    - El letrero sale al momento. Lo que cae del cielo (armas, bombas) y la onda del gigante llegan a su hora: quien
      está libre encaja el golpe y quien está a mitad de su turno lo recibe sin pararse (destello, daño y vida). Las
      embestidas de la Prisa van a por cada uno en cuanto él y su objetivo quedan libres, pasando por delante de lo
      que tuvieran en cola (da igual en qué orden reciba los golpes cada uno: la vida que le quitan es la misma).
    - Quien cae por una ultimate cae en cuanto acaba lo que estaba animando y le llegan sus golpes: lo que el motor
      ya le había jugado (y aún no se veía) se da por visto, sin animarlo, y solo se ajusta la vida de los que
      salían en ello. Así los que caen a la vez caen casi juntos. Si en eso caía alguien (o paraba la arena), se ve
      entero y cae después.
    - La onda del gigante la suelta la animación cuando le ve atacar, así alcanza a los que tiene cerca en ese
      momento, y sus 15 s cuentan desde que se le ve crecer.
  - **¡MULTI KILL!**: cuando un brute elimina a dos o más casi a la vez (en menos de 4 s entre una y otra), sale un
    letrero grande con su nombre y cuántos lleva en la racha, y una voz de anunciador grave y con eco de estadio dice
    "Multi… kill!". Si suma más en la misma racha, el letrero cuenta y vuelve a latir.
    - La voz es una grabación (`public/sfx/multikill.mp3`, suena con los efectos activados) hecha con el
      sintetizador de voz Kokoro-82M, igual que las de la fatality. Antes las decía la síntesis de voz del navegador,
      pero en algunos navegadores no sonaba (por ejemplo con las voces de Google en Chrome, que fallan en silencio);
      ahora solo se usa si la grabación no se pudo cargar.
  - **➕ Agregar** / **+5** meten brutes nuevos en plena pelea, en cualquier momento hasta que se ve el final. El
    que llega entra en un duelo desde su primer turno (si todos están en pareja, forma un trío), así que ataca y
    recibe golpes enseguida; con +5 cada uno aparece y llega por su cuenta, sin esperar al anterior.
    - El motor no va por delante de la animación (ver arriba), así que el recién llegado entra en cuanto aparece.
      Antes se adelantaba al menos 16 turnos: con pocos en pie, todos esos turnos eran del mismo duelo y el recién
      llegado esperaba unos 25 s a que se vieran.
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
  - **Duelo final**: cuando solo quedan dos en pie, la fatality es como la completa: "FINISH HIM!" (o "FINISH HER!")
    con la voz del anunciador mientras el perdedor se tambalea, el fondo se oscurece y, tras el remate, cae el letrero
    "FATALITY" con el nombre del remate, su voz, el golpe y un destello rojo. Lo único que no lleva es la cámara de
    la versión completa (el royale ya tiene su zoom dinámico): en su lugar tiembla el escenario. Si entra alguien
    más, se vuelve a pelear como siempre, y la siguiente vez que queden dos se repite. Quien cae por una ultimate
    sigue sin fatality.
  - Toda la sangre del suelo (manchas, charcos y grietas) es un solo dibujo: cada mancha se pinta una vez en
    una imagen de la arena y se descarta. Así no pesa más a medida que avanza la pelea y los fps se recuperan
    cuando quedan pocos en pie (antes cada mancha era un dibujo suelto y llegaban a acumularse unas 8.000).

Los botones de la arena son solo iconos, en una fila (al pasar el ratón por encima sale lo que hace cada uno):
⏸️ pausa, x1/x2 velocidad, 🔊 efectos y 🎵 música (apagados se ven oscuros), 👑 nueva ronda (🎬 repetir en el vídeo
promocional; con las rondas continuas lleva la cuenta atrás en la esquina), 🔁 rondas continuas y 🔍 zoom dinámico
(dorados si están activados), ⬇️ descargar el vídeo grabado y 🏠 volver al menú.

## Estructura (`web/src`)

- `engine/` — motor de peleas del servidor original, sin Prisma; `session.ts` lo juega turno a turno.
- `fight/` — animación de la pelea del cliente original (PixiJS), con ajustes para la demo.
- `core/` — copia de `@labrute/core`.
- `sim.ts` — genera brutes y el royale; `trailer.ts` — vídeo promocional; `main.js` — interfaz.

## Origen y licencia

Código y recursos tomados de [LaBrute](https://github.com/Zenoo/labrute) (Eternaltwin).
El código está bajo **PolyForm Noncommercial 1.0.0** y los recursos gráficos y de sonido bajo
**CC BY-NC-SA 4.0**: no se permite ningún uso comercial.

Las voces del anunciador ("Multi kill!", "Finish him!", "Finish her!" y "Fatality!": `multikill.mp3`,
`finishhim.mp3`, `finishher.mp3` y `fatality.mp3` en `web/public/sfx/`) se generaron con
[Kokoro-82M](https://github.com/hexgrad/kokoro) (Apache 2.0), voz `am_michael`, y se les bajó el tono y se les añadió
eco con ffmpeg.
