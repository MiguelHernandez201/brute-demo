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

Para transmitir con los regalos de verdad: doble clic en `iniciar-directo.bat` (ver **Directo de TikTok**, abajo).

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

- **🎬 Vídeo promocional**, que se graba en tiempo real con el motor del juego y se puede descargar.
- El **Battle Royale** normal (en horizontal, con el botón 👑 de la pantalla de inicio o `?royale`) se quitó: el royale
  solo se juega en el modo TikTok, que usa el mismo motor (ver **Battle Royale**, abajo).
- **📱 Modo TikTok (vertical)**: el Battle Royale en una pantalla vertical 9:16, pensada para transmitirla en TikTok
  LIVE (capturando la ventana con TikTok LIVE Studio u OBS). También se entra con `?tiktok` en la dirección
  (`?tiktok=8` para elegir cuántos brutes por ronda).
  - Arriba el título y el número de ronda; debajo la arena a todo lo ancho; luego la lista de los que siguen en pie
    (en dos columnas, con letras grandes), las últimas eliminaciones y un **ranking** con los 5 mejores (rondas
    ganadas 👑 y rivales eliminados ☠️), que se recuerda en el navegador. Lo de abajo queda libre, porque ahí TikTok
    pone los comentarios.
  - Bajo la arena, **¿Cómo jugar?** lo dice todo en una lista corta: a la izquierda, cómo se entra a pelear (👆 30
    tap tap o 💬 comentar), que 100 tap tap dan +30 de vida y lo que da el 🫶 Quiéreme; a la derecha, qué da
    un regalo según sus monedas, con la moneda de TikTok (1 → +30 y arma, 10 → +300 y arma, 30 → +1000 y aura, 100 →
    +2000 y mascota, 299 → +3000 y minigun). Antes ahí había un cuadro tipo chat que lo explicaba regalo a regalo,
    con un mensaje largo cada 3,5 s, y ¿Cómo jugar? iba aparte, abajo a la derecha.
  - Los paneles se mueven y cambian de tamaño con la tecla **E** (R, en edición, los restablece). La distribución de
    fábrica es la que se dejó puesta así para el directo: la arena arriba, ¿Cómo jugar? debajo, el chat con las dos
    imágenes a la izquierda y el ranking a la derecha. Lo que se mueva se guarda en el navegador, panel a panel, por
    encima de la de fábrica.
  - Todo se mide en proporción al ancho de la pantalla vertical: se ve igual en una ventana pequeña que a pantalla
    completa, y si la ventana es más ancha queda centrada con bandas negras.
  - Rondas seguidas solas: cada una dura como mucho 3 minutos (el reloj de "Finalizar"), y si queda uno solo en pie
    acaba a los 10 segundos. El ganador sale en grande ("¡gana la ronda N!") con la cuenta atrás de la siguiente (8 s).
  - Sin botones en pantalla: la tecla **C** los muestra u oculta (los de abajo, los de agregar brutes y los
    potenciadores de cada uno, y 🗑️ para borrar el ranking).
- **🎁 Panel de regalos** (botón 🎁 o tecla **G**; en el modo TikTok): simula los regalos del directo de TikTok (los
  de verdad llegan solos con el puente: ver **Directo de TikTok**, abajo), y arriba dice cómo va la conexión con el
  directo. Justo debajo, **🚪 Los que se unen al live entran a la arena** (en verde si está activado; ver **Directo
  de TikTok**). Se escribe el nombre del espectador (vacío o 🎲: uno al azar), se elige la cantidad (x1, x5, x10) y se
  pulsa uno de los regalos, que van **por monedas** (1, 10, 30, 100 y 299, con la moneda de TikTok), más el 🫶
  Quiéreme, que va aparte. Antes había una tarjeta por regalo (Rose, Rosa, Dona…) y la lista de todos los del
  catálogo con un buscador:
  - Si no está en pie, entra a la pelea con su nombre; si ya está, recibe el potenciador. Cada regalo da el suyo
    **solo según lo que vale en monedas de TikTok**, sea el que sea (antes los de la lista daban lo suyo y los demás
    iban en tres escalones):

    | Monedas   | Da                                                        | En la lista         |
    | --------- | --------------------------------------------------------- | ------------------- |
    | 1 a 9     | **+30** y un arma sencilla para toda la pelea             | 🌹 Rose (1)         |
    | 10 a 29   | **+300** y un arma sencilla para toda la pelea            | 🌹 Rosa (10)        |
    | 30 a 99   | **+1000**, arma poderosa, aura de ki (daño x3) y un poder | 🍩 Dona (30)        |
    | 100 a 298 | **+2000**, lo de la Dona y una mascota durante 1 minuto   | 💗 Hand Heart (100) |
    | 299 o más | **+3000**, lo de antes, una minigun 20 s y 2 poderes      | 🐶 Corgi (299)      |

    Valen según lo que cuestan, para que muchos regalos pequeños no rindan más que uno grande: 30 Rose dan +900 de
    vida y un arma sencilla, y una dona +1000, arma, aura y un poder; el corgi lanza 2 poderes (con 3 vaciaba la arena en
    segundos). Los de un combo van saliendo uno tras otro (🎁N en su fila: los que faltan; como mucho 10).
  - Los regalos se llaman como en TikTok: **Rose** es la rosa de 1 moneda y **Rosa**, la de 10.
  - **Regalos más grandes** que no están en la lista (desde 299 monedas, como el León): lo del +3000, pero con la
    vida en proporción a lo que valen, la del Corgi (3000 por 299 monedas, unas 10 por moneda). Un León (29.999)
    da +300.993. Antes daba lo mismo que un Corgi.
  - 🫶 **Quiéreme** ("Heart Me" en TikTok, 1 moneda) da lo mismo que cualquier regalo de 1 moneda: **+30** y un
    **arma** sencilla (espada ancha, cuchillo, bastón, lanza o hachuela) que equipa al momento y le dura toda la
    pelea. Pero va aparte en ¿Cómo jugar? y en el panel, porque ayuda a crecer la cuenta. (Antes daba solo el arma, y
    cuando 1 moneda pasó a dar +30 y arma se quedó por debajo.) Si ya lleva el arma poderosa de una dona o un corgi, no
    se la cambia: se guarda la nueva. Sacar un arma por su cuenta cuesta (ver abajo), así que un regalo es la manera
    segura de ir armado.
  - **🙋 Unirse**: entra sin regalo, como quien comenta para unirse.
  - **👓 Gustavo Petro** y **🎩 Abelardo**: botones especiales que meten a pelear a **Gustavo Petro** (peinado con
    entradas y copete lateral, gafas rectangulares, guayabera blanca con alforzas, banda presidencial tricolor y
    pantalón oscuro) o a **Abelardo** (con la caricatura de referencia como cabeza, en grande, recortada del fondo y
    metida en el juego con el pelo y la barba en negro, `web/src/abelardoCara.ts`; y traje de cachaco: paño oscuro con
    rayas finas, chaleco gris, camisa blanca, corbata vinotinto, pañuelo blanco y zapatos negros),
    con el nombre escrito en el panel o el suyo propio si está vacío (`web/src/chuck.ts`). También desde la consola con
    `labrute.petro('usuario')`, `labrute.abelardo('usuario')` y `labrute.chuck('usuario')`. Quien entra con una de estas
    skins la conserva en las rondas siguientes mientras la página siga abierta.
  - **👆 Tap tap**: los toques en la pantalla (los "me gusta" del directo), 30 por la cantidad elegida (x1: lo que
    cuesta entrar). Son gratis, así que dan poco: **30 toques** meten al espectador en la pelea (antes bastaba el
    primero) y cada 100 toques suyos le dan **+30** de vida (lo de una Rose, sin su arma); los de entrar también cuentan para eso.
    Los toques se cuentan por espectador mientras la página sigue abierta. Volver tras caer cuesta: quien ya cayó en
    la ronda necesita **100 toques** para entrar otra vez, y esos toques no curan. En la ronda siguiente vuelve a
    entrar con 30, y si llega a 30 entre rondas, entra al empezar la siguiente.
  - Cada regalo genera un aviso ("luna23 envió 🌹 Rose x3 +30", con el color de su potenciador), pero el modo TikTok
    los oculta, y era el royale normal el que los mostraba arriba a la izquierda de la arena: ahora no se ven. Los
    regalos que llegan entre rondas entran al empezar la siguiente.
  - **↗️ Otra ventana** abre el panel solo (`?panel`), que manda los regalos a la ventana del juego: así en el directo
    se captura solo la del juego.
  - Para mandar regalos desde fuera (la consola, TikFinity u otro programa): `labrute.gift('usuario', 'rose', 5)`,
    `labrute.join('usuario')`, `labrute.petro('usuario')`, `labrute.abelardo('usuario')`, `labrute.chuck('usuario')` y
    `labrute.like('usuario', 15)` (los toques de cada aviso de "me gusta") en la ventana
    del juego (los regalos: `rose`, `quiereme`, `rosa`, `dona`, `handheart`, `corgi`, o el nombre de cualquiera del
    catálogo, como `'Heart Me'` o `'Rose'`). Con lo que vale uno como cuarto dato
    (`labrute.gift('usuario', 'Rose', 5, 1)`) solo cuenta como ese regalo si el nombre y el precio casan; si no, da
    lo que le toca por sus monedas.

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
  - En el royale cuesta más **sacar un arma por su cuenta**: todos entran sin arma en la mano (y con al menos una
    guardada), y en cada turno sin arma la sacan con probabilidad (peso de sus armas) / (peso de sus armas + 50).
    Antes era + 10, como en el juego original. De media, un ~11 % por turno (antes ~36 %): el ~28 % va armado tras
    3 turnos y el ~41 % tras 5 (antes, ~71 % y ~85 %). El tráiler sigue como antes.
  - Quien cae lo hace con una **fatality** según el arma de quien lo remata:

    | Arma de quien remata | Fatality |
    |---|---|
    | Espada, sable, cimitarra, abanico | Decapitación |
    | Hacha, hachuela, alabarda | Partido en dos |
    | Maza, mayal, sartén, hueso, lucero del alba, trombón, teclado, puerro, raqueta, bastón, jarra | Aplastado |
    | Lanza, tridente, cuchillo, sai | Acribillado |
    | Látigo | Arrancacabezas |
    | Sin arma, tazón, piopio, shuriken | Explosión |
    | Minigun (potenciador +3000 del royale) | Balacera |

    Para ver una en concreto se puede forzar con la URL, por ejemplo `?fatality=aplastado`
    (`decapitacion`, `partido`, `aplastado`, `acribillado`, `latigo` o `explosion`; la balacera no, que necesita la
    minigun). En el vídeo promocional sale la
    versión completa: "FINISH HIM!", el remate y el letrero "FATALITY" con voz. La voz del anunciador ("Finish
    him!" / "Finish her!" y "Fatality!") es una grabación, como la de "Multi kill!" (ver abajo).
- **Battle Royale** (el del modo TikTok): de 3 a 20 brutes, todos contra todos y todos peleando a la vez por toda la
  arena.
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
  - **Potenciadores**: los dan los regalos (ver el panel de regalos, arriba), y cada brute tiene además tres botones
    en su fila de la lista, **+30**, **+1000** y **+3000**. El +1000 y el +3000 lanzan poderes (las ultimates, ver
    abajo, cada vez una distinta; el botón no dice cuál):
    - **+30**: solo le cura o le suma 30 PV (el del regalo pequeño, la Rose: sobre todo, para entrar a pelear). Antes
      daba 300 PV, un arma sencilla y un poder.
    - **+1000**: 1000 PV, un poder, un arma poderosa (hacha, espada, mayal, lucero del alba, alabarda o maza, de
      nivel 2) y un **aura de ki** al estilo Dragon Ball para el resto de la pelea: llamas doradas y translúcidas que
      le envuelven y suben, con chispas, y hace el triple de daño (con el Súper gigante, x6).
    - **+3000**: 3000 PV, **2 poderes** uno tras otro (antes, uno), un arma poderosa de nivel 3, el aura de ki (esta
      con rayos, como el Súper Saiyajin 2), una
      **mascota** (perro, pantera u oso) que pelea con él durante un minuto y luego se va, y una **minigun** durante
      20 s de pelea. La agarra por el asa de arriba con la mano con la que coge las armas (se ve su propio puño encima
      del asa) y, mientras la lleva, en vez de la guardia de reposo se planta con el brazo adelantado y el arma a la
      cadera (antes flotaba delante de él sin que nadie la sujetara). Su arma se guarda mientras tanto, y cada turno
      suyo es una ráfaga a distancia a los rivales de su duelo (hasta 3): gira el arma sobre el puño hasta apuntar a
      cada uno (antes apuntaba siempre recto y las balas salían en diagonal), los cañones dan vueltas y sale un chorro
      de 80 balas por segundo, destellos que vuelan hasta el rival (antes eran 24 por segundo y cada una, una raya fija:
      se veían dos o tres), con fogonazos, chispas donde dan, casquillos y su propio sonido. No se esquiva, ni se
      bloquea, ni se contraataca, y a cada uno le quita lo de tres golpes suyos (x9 con el aura; antes, lo de uno): en
      120 royales simulados, unos 1.250 PV por turno frente a unos 250 de sus turnos normales (antes, unos 400). Al
      acabarse la suelta (cae al suelo y se desvanece) y vuelve a su arma; otro +3000 con ella en las manos vuelve a
      empezar sus 20 s. Quien cae por ella tiene su propia fatality, la **balacera** (ver el royale, abajo).

    "Cura o suma": recupera la vida que le falte y lo que sobra sube su vida máxima, así siempre gana esos PV (y se le
    quita el veneno). La vida llega al momento de pulsar, esté haciendo lo que esté: sale el número en verde y la vida
    de su etiqueta y de la lista lo reflejan, y si está libre, además bebe una poción. Antes esperaba a que acabara lo
    que tuviera pendiente en pantalla (por ejemplo, recibir la ultimate de otro). Con muchos seguidos el número verde
    pasa a ser la suma de todos (+1000 → +4000 → +5000…) y bebe como mucho con el primero, mientras le queden más en
    cola o hasta 8 s de pelea después del último. Antes bebía con cada uno: con 10 seguidos se pasaba más de 25 s
    bebiendo.
    - **La cura nunca llega tarde**: las ultimates y los golpes se calculan en el motor al lanzarse y tardan unos
      segundos en verse, así que un brute puede haber caído en el motor mientras en pantalla sigue en pie. Si se pulsa
      su potenciador antes de que empiece a verse su caída, la vida le llega antes que esos golpes: si le alcanza para
      seguir en pie, no cae (su caída se anula, y la de sus mascotas) y sigue peleando. Antes el potenciador se quedaba
      en cola y caía igual: en un duelo, si uno lanzaba su ultimate, el otro ya no podía curarse a tiempo.
    - Sin recarga: en cuanto se ve su poder (o su vida, el +30), los botones se pueden volver a pulsar (antes se
      recargaban 30, 60 o 90 s). Cada pulsación lanza otros poderes y le suma la vida; si ya tenía el aura, estalla otra vez (y la del
      +1000 pasa a la de rayos con un +3000), y cada +3000 trae otra mascota.
    - El aura no se apaga en toda la pelea (antes duraba un minuto); solo si cae, y al momento. La mascota cuenta su
      minuto desde que llega (se para con la pausa y va al doble a x2).
    - **Lo que dura un tiempo solo cuenta mientras tiene rivales**: la minigun (20 s), la mascota (1 min) y el Súper
      gigante (15 s) se paran mientras está solo en la arena esperando retador, y siguen en cuanto aparece otro.
      Antes corrían igual, y quien quería entrar esperaba a que se le acabaran para no comerse la minigun.
    - **Quien usa un potenciador ya no pierde nunca el arma que lleva**: no se la quitan (desarmes al golpearle o al
      contraatacar, el Martillo, el Ladrón), no la lanza (ni sola ni con el Diluvio, que tira las que tenga guardadas)
      y no la cambia por otra. Antes, al rato, acababan peleando a puñetazos. La que llevaba en la mano al recibir el
      arma vuelve con las suyas, y un potenciador menor no le cambia el arma de uno mayor: se la guarda (un +1000 no le
      quita el arma de nivel 3 de un +3000).
  - **Ultimates** (el poder que lanza cada potenciador): una versión mucho más fuerte y de área de una técnica del
    juego, hecha para eliminar a varios de golpe, que alcanza a rivales de cualquier duelo. Van cambiando: cada brute
    las saca de su propia bolsa con las cuatro barajadas, así no repite ninguna hasta haberlas lanzado todas ni lanza
    la misma dos veces seguidas (antes cada brute tenía siempre la misma). Si ya es gigante, el Súper gigante espera a
    que se le acabe y sale otra:
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
    - Si no le queda a quién darle, sale el Súper gigante, que no lo necesita (es para él): aunque en el motor ya no
      quede nadie (las ultimates eliminan al momento, y en pantalla los rivales tardan unos segundos en caer), crece
      igual y le sirve contra el que entre. Si ya era gigante, vuelven a empezar sus 15 s (antes se acababa con el
      tiempo del primero).
    - Atrapado en una red o aturdido también se puede (antes quedaba en cola): sale cualquier ultimate menos la Prisa
      en cadena (no puede embestir) y no bebe la poción (sigue en la red o en el suelo), pero la vida le llega igual.
    - Si ahora no se puede lanzar (es un brute recién agregado que aún no ha aparecido en la arena, o en el motor ya
      ha caído y la vida del potenciador no le alcanza para salvarse), el potenciador queda **en cola** entero (⏳ en
      su botón, que late) y sale solo en cuanto se pueda. Otro clic lo quita de la cola y pulsar otro de los tres lo
      cambia.
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
    - **➕ con regalo** (**+30** / **+1000** / **+3000**, debajo): agrega un brute que entra con ese potenciador. En
      cuanto aparece en la arena recibe todo lo del potenciador (vida, arma, aura de ki, mascota y sus poderes), como si
      se pulsara en su fila; hasta entonces su botón de la lista lleva el ⏳ de los que esperan en cola.
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
  - Con la **minigun** del +3000 en las manos, la fatality es la **balacera**: desde donde está (no se acerca) le
    vacía encima una ráfaga larga con el arma apuntándole; cada balazo le abre un agujero y le hace sangrar (de algunos
    sale un chorro), baila con los impactos y al final se hincha, se pone al rojo y revienta en pedazos, como en la
    explosión. Aunque esté lejos, el zoom del royale le sigue encuadrando hasta el final. La lista lo cuenta como
    "Tritón acribilló a balazos a Sombra", y en el duelo final sale con "FINISH HIM!" y el letrero "FATALITY ·
    BALACERA".
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

## Gustavo Petro vs Abelardo (en desarrollo)

Un royale de dos bandos: Gustavo Petro y Abelardo entran como jefes y los espectadores pelean como refuerzos de uno
de los dos. La ronda la gana el bando que derriba al jefe rival. Por ahora solo está el motor (aún no hay botón para
jugarlo):

- `createRoyale(n, { sides })` (`web/src/sim.ts`) arma la ronda con los dos jefes y `n` brutes repartidos entre los
  bandos. Los jefes salen con las mismas estadísticas, armas y habilidades (solo cambian el nombre y el aspecto), así
  ningún bando tiene ventaja, y con **300** de vida (`CHIEF_HP`). Cada bando empieza en su lado de la arena.
- Los de un mismo bando no se atacan: los duelos solo se arman entre bandos rivales (si un bando tiene muchos más en
  pie, varios se juntan contra el mismo rival) y las ultimates, la onda del gigante y la minigun solo alcanzan al otro
  bando. A los jefes, las ultimates y la minigun les quitan la cuarta parte.
- Cuando cae un jefe, el motor espera a que la animación vea su caída para cerrar la ronda; si antes le llega un
  potenciador que le salva, la pelea sigue. Mientras tanto no entra nadie más. Quien entra sin decir su bando va al que
  tenga menos en pie.
- Al jefe le pegan de uno en uno (cada golpe se anima por separado), así que lo que tarda en caer depende sobre todo de
  su vida. Con 300 y 6 brutes más, sin regalos, el primer jefe cae a los 2 minutos de media y 1 ronda de cada 20 llega
  a los 3 minutos del reloj (con 400, 1 de cada 6). Para volver a medirlo, desde `web/`:

  ```bash
  node scripts/simular.mjs bandos 200 6        # 200 rondas con 6 refuerzos
  node scripts/simular.mjs bandos 200 6 1 500  # con espectadores y regalos, y jefes con 500 de vida
  node scripts/simular.mjs royale 200 10       # el royale normal, para comparar
  ```

  Simula las rondas con el motor de verdad y estima lo que durarían en pantalla (una unidad de turno son unos 2,7 s,
  medido en el navegador). El royale normal no cambia: en 400 rondas de 10, la misma duración que antes.

## Directo de TikTok

Los regalos, toques y comentarios de tu directo de verdad entran solos a la pelea.

- `iniciar-directo.bat` pregunta tu usuario de TikTok la primera vez (lo guarda en `live/usuario.txt`; para cambiarlo,
  `iniciar-directo.bat otro_usuario`), abre el **puente** en otra ventana y el juego en modo TikTok
  (http://localhost:3100/?tiktok). Para el directo se captura esa página (con TikTok LIVE Studio u OBS).
- El puente (`live/puente.js`, con [tiktok-live-connector](https://www.npmjs.com/package/tiktok-live-connector))
  lee el directo como un espectador más, solo con tu usuario: no hay API oficial de TikTok para esto, así que si
  TikTok cambia algo puede dejar de funcionar hasta que se actualice la librería (`npm install
  tiktok-live-connector@latest` en `live/`). Se lo pasa al juego por un WebSocket local (`ws://127.0.0.1:21214`, ver
  `web/src/live.js`). Si aún no estás en directo, espera y lo vuelve a intentar cada 30 s; si se corta, se reconecta
  solo. En su ventana va escribiendo cada regalo, toque y comentario que pasa.
- Lo que llega: un **comentario** mete a pelear a quien lo escribe (como 🙋 Unirse); los **toques** (tap tap)
  cuentan como los del panel, y los **regalos** dan lo suyo. Quien **entra a ver el directo** también entra a pelear
  aunque no comente, mientras esté marcada la opción **🚪 Los que se unen al live entran a la arena** del panel de regalos
  (marcada de fábrica: con poca gente llena la arena de espectadores de verdad; con mucha, mejor desmarcarla). Con
  ella marcada, además, al empezar cada ronda vuelven a pelear los que pasaron por el directo (entraron, comentaron,
  tocaron o regalaron) en los últimos 10 minutos, como mucho 30, los más recientes: si no, cada uno peleaba solo la
  ronda en la que llegó. TikTok no avisa de quién se va, por eso el plazo. Los de racha (como la Rose) entran uno a uno según
  llegan, sin esperar a que acabe la racha. El nombre del brute es el usuario de TikTok del espectador (sin la @), y su sexo, el de su nombre de pila si lo lleva y es conocido (`sofi_gamer` sale mujer y `migue73`, hombre; ver `web/src/genderNames.ts`). TikTok no dice el sexo de nadie: con los que no llevan nombre, o uno que vale para los dos (Alex, Dani, Andrea…), sale al azar, como antes con todos.
- Los regalos se reconocen por su nombre y su precio en monedas: si los dos casan con uno del catálogo, cuenta como
  ese (Heart Me es el Quiéreme); si no (otro idioma, un regalo nuevo), da lo que le toca por sus monedas. Así un
  nombre que no casa nunca da más de lo que se pagó.
- El panel de regalos (G, o el de la otra ventana) dice arriba cómo va: ⚪ sin el puente abierto, 🟡 conectando o
  esperando a que empieces, 🟢 conectado.
- El juego se conecta solo cuando corre en tu PC (localhost). La versión publicada en GitHub Pages solo lo intenta
  con `?live` en la dirección, para que quien la abra no intente conectarse a su propio PC.
- El uso gratuito del servicio con el que se conecta la librería ([Euler Stream](https://www.eulerstream.com))
  tiene un límite; si se queda corto, el puente avisa y se le puede poner una clave en la variable `EULER_API_KEY`.

## Streamer virtual (voz)

Una voz que agradece los regalos, saluda a los que entran y responde preguntas del chat sobre el juego. Es opcional:
`live/voz.js` se conecta al mismo puente que el juego y no toca nada de él.

- **Gracias y saludos**: plantillas fijas (sin IA, instantáneas). Las Rose seguidas de una misma persona se agradecen de
  una sola vez, y a los que entran casi juntos se les saluda en grupo (como mucho uno cada 10 s).
- **Preguntas**: solo los comentarios que lo parecen (llevan `?` o empiezan por cómo, qué, cuándo…) los responde un
  modelo local con [Ollama](https://ollama.com), con la personalidad y los datos del juego de `live/prompt-streamer.txt`
  (edítalo para cambiarle el nombre, el tono o lo que sabe). Una respuesta cada 5 s como mucho y una por espectador cada
  30 s; los intentos de cambiarle las reglas ("ignora tus instrucciones…") no llegan al modelo.
- **👋 Saludos con nombre** (casilla **👋 Brutus saluda por su nombre** del panel de regalos; encendida de fábrica):
  apagada, Brutus no saluda por su nombre a quien entra al live (una frase distinta por persona, lo que más voz gasta).
  El saludo general de los grupos (4 o más que llegan casi a la vez) sigue sonando, con el audio en caché, sin gasto.
- **💬 Modo conversacional** (casilla **💬 Brutus conversa con el chat** del panel de regalos, 🎁/G; apagada de fábrica):
  encendida, Brutus también comenta mensajes del chat que no son preguntas (de 3 palabras o más), con memoria de los
  últimos mensajes y de lo que ya dijo. Como mucho una respuesta cada 12 s, una por espectador cada 45 s y 60 por hora
  (`CONVERSACION_MAX_HORA` en `voz.env`); el modelo puede callarse si el mensaje no merece respuesta. Ni lee ni dice
  groserías ni temas delicados (política, religión, drogas…). La casilla le llega a la voz por el puente.
- **🥊 Narrador de la pelea** (casilla **🥊 Brutus comenta la pelea** del panel de regalos; encendida de fábrica): el
  juego le avisa a la voz de lo que pasa y Brutus lo comenta con frases fijas (sin IA): un **golpe crítico muy duro** (que
  le quita a quien lo recibe el 25 % o más de su vida máxima; con el 45 % o más, una frase más fuerte), una **pelea
  reñida** (quedan dos, los dos con el 60 % de vida o menos y menos de 15 puntos de diferencia; una vez por ronda) y el
  que **queda solo esperando rival** (a los 6 s, y otra vez cada 30 s; invita a comentar o dar 30 toques para entrar).
  Límites para no hablar sin parar: 8 s entre comentarios de la pelea, un mínimo por tipo (críticos 20 s, reñida 90 s,
  solo 40 s) y 60 por hora (`NARRADOR_MAX_HORA` en `voz.env`). Lo que tarda en tocarle y ya no tiene sentido se descarta.
- **Voz**: [ElevenLabs](https://elevenlabs.io), con el modelo `eleven_flash_v2_5`. Una cola con prioridad (regalos,
  preguntas, saludos) descarta lo que caduca, para que la voz no vaya por detrás del directo.
- **Puesta en marcha (Windows)**: instala Ollama, abre PowerShell y ejecuta `ollama pull qwen2.5:3b`; copia
  `live/voz.env.ejemplo` como `live/voz.env` y pon tu clave y el ID de la voz de ElevenLabs. Con `voz.env`,
  `iniciar-directo.bat` abre también la ventana de la voz. Para probarla sin directo: `node voz.js --prueba` en `live/`.
  Sin las claves no habla: solo escribe en su ventana lo que diría.
- **Que se oiga en el directo**: suena por la salida de audio predeterminada de Windows. En OBS o TikTok LIVE Studio,
  captura el audio del escritorio (o manda la salida a un cable de audio virtual y captúralo).
- El puente ahora manda también el texto de cada comentario (`{ type: 'comment', user, text }`); el juego lo ignora.

## Estructura (`web/src`)

- `engine/` — motor de peleas del servidor original, sin Prisma; `session.ts` lo juega turno a turno.
- `fight/` — animación de la pelea del cliente original (PixiJS), con ajustes para la demo.
- `core/` — copia de `@labrute/core`.
- `sim.ts` — genera brutes y el royale; `trailer.ts` — vídeo promocional; `main.js` — interfaz.
- `live.js` — recibe el directo de TikTok del puente (`live/puente.js`, fuera de `web/`).

## Origen y licencia

Código y recursos tomados de [LaBrute](https://github.com/Zenoo/labrute) (Eternaltwin).
El código está bajo **PolyForm Noncommercial 1.0.0** y los recursos gráficos y de sonido bajo
**CC BY-NC-SA 4.0**: no se permite ningún uso comercial.

Las voces del anunciador ("Multi kill!", "Finish him!", "Finish her!" y "Fatality!": `multikill.mp3`,
`finishhim.mp3`, `finishher.mp3` y `fatality.mp3` en `web/public/sfx/`) se generaron con
[Kokoro-82M](https://github.com/hexgrad/kokoro) (Apache 2.0), voz `am_michael`, y se les bajó el tono y se les añadió
eco con ffmpeg.
