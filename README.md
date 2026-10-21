# Pinta Pues 🎨🇧🇴

Juego web de dibujar y adivinar para la tropa. Inspirado en la mecánica de Pinturillo, con nombre, interfaz y código propios; palabras bolivianas, categorías y herramientas de dibujo adicionales.

## Funciones implementadas

Esta lista describe las funciones implementadas en el código. La web pública puede ir detrás hasta el siguiente despliegue.

- Salas privadas y públicas, con 2 a 12 jugadores. Crear una sala la deja privada por defecto: se comparte por código o enlace y no participa en el acceso público. Puedes jugar como invitado o crear una cuenta opcional con correo y contraseña.
- «Jugar en sala pública» te une automáticamente a una sala pública con espacio, priorizando las que esperan para empezar; también puede unirte a una partida en curso. Si no encuentra una compatible, crea una pública y te deja de anfitrión. Omite salas llenas, salas de las que fuiste expulsado, apodos repetidos y salas donde ya está tu cuenta. El anfitrión puede cambiar la visibilidad desde la sala de espera o los resultados; hacerla privada no expulsa a quienes ya están dentro. Las privadas no tienen contraseña: cualquiera que tenga su código o enlace puede entrar.
- Puedes entrar con la partida en curso: comienzas con 0 puntos, recibes el dibujo y las pistas actuales y puedes adivinar de inmediato. Dibujas desde la siguiente ronda; si entras en la última, podrás dibujar en la revancha. Entrar no reinicia el reloj ni cambia el turno actual.
- Avatar elegible junto al apodo: robots de DiceBear, opciones nuevas al azar y elección guardada en el navegador. Se comparte con todos los jugadores de la sala.
- Anfitrión que configura entre 1 y 5 rondas, tiempo por turno y categorías.
- Cada jugador dibuja una vez por ronda. Elige entre hasta tres palabras; si no elige en 15 segundos, se selecciona una automáticamente.
- Las palabras dibujadas no se repiten en la misma sala, incluidas las revanchas, mientras queden palabras nuevas en las categorías seleccionadas. Si quedan una o dos, se ofrecen esas; al agotarse la selección se reutiliza, evitando la palabra inmediatamente anterior cuando sea posible. Las opciones descartadas pueden volver a aparecer. El historial se pierde cuando se elimina la sala o se reinicia el servidor.
- Dibujo y chat sincronizados con Socket.IO.
- Chat con mensajes consecutivos agrupados por autor: el nombre aparece al inicio de cada grupo, tus burbujas se alinean a la derecha y las de otros jugadores a la izquierda. Los avisos del juego separan los grupos y el anfitrión puede seguir borrando cada mensaje individualmente.
- Los trazos locales permanecen visibles mientras el servidor los confirma, para evitar parpadeos con conexiones lentas. Las reconstrucciones del lienzo se preparan fuera de pantalla y se muestran completas.
- Para los espectadores, el primer punto se envía al apoyar el pincel y los tramos siguientes se envían cada 24 ms, incluso si el mouse hace una pausa. Las actualizaciones recibidas se agrupan por frame y se pintan solo los tramos nuevos.
- Pistas progresivas iguales para todos: el máximo es la mitad de las letras o números de la respuesta, redondeando hacia abajo (3 → 1, 4 → 2, 6 → 3, 10 → 5). Hasta tres pistas aparecen al 35%, 60% y 80% del turno; si la palabra permite más, se reparten entre el 35% y el 80%. Los espacios y guiones se mantienen y no cuentan para calcular el máximo. Las pistas se reinician en cada turno.
- Pincel, borrador, línea, rectángulo, elipse, estrella, balde de relleno y texto; colores, grosor, deshacer y limpiar. Texto directamente sobre el lienzo: arrastra un recuadro (o toca para uno de tamaño inicial) y escribe; el tamaño se ajusta al área. Enter o tocar fuera confirma, Shift+Enter agrega una línea y Escape cancela. Fuente manuscrita Excalifont incluida localmente con licencia OFL-1.1 en `public/fonts/excalifont/LICENSE.txt`; los demás jugadores ven el texto confirmado con la misma fuente.
- Pincel y borrador con curvas suaves, extremos redondos y captura de muestras agrupadas del mouse/lápiz cuando el navegador las proporciona. Los fragmentos del trazo mantienen la continuidad de las curvas durante la transmisión; la vista previa llega hasta el cursor y Deshacer sigue quitando el trazo completo. Los trazos anteriores conservan su renderizado original.
- Grosor de 2 a 200 para el pincel, borrador y herramientas de figuras, ajustable con botones −/+ a cada lado del valor, escribiendo el valor directamente, con +/− del teclado o la rueda sobre el lienzo. El círculo del borrador muestra su tamaño real y se comparte con los demás jugadores.
- Lienzo con resolución interna doble (1920×1280, manteniendo las coordenadas lógicas de 960×640). El trazo activo se recompone como una sola curva para evitar bordes oscurecidos o pequeños bultos al superponer fragmentos; el fondo terminado queda en caché y la vista previa se compone sin duplicar los bordes suavizados.
- Los movimientos y confirmaciones de red se agrupan en un único repintado por fotograma. El pincel reutiliza la geometría de la curva y repinta solo la región que cambia, evitando volver a rasterizar el lienzo completo con cada muestra, incluso con grosores grandes.
- El borrador muestra un círculo del tamaño del área que borra, adaptado a la escala del lienzo y visible también para los demás jugadores.
- Atajos durante tu turno: P o B (pincel), E (borrador), L (línea), R (rectángulo), O (círculo), S (estrella), F (relleno) y T (texto). También puedes usar 1–8 en el orden de la barra. Ctrl+Z o ⌘Z deshacen; los atajos no interfieren al escribir en campos ni con diálogos abiertos. Cada botón muestra sus atajos al pasar el cursor.
- Cursor compartido del dibujante: lápiz del color elegido, animación solo al trazar y posición sincronizada para los demás, adaptada al tamaño de cada lienzo. Al moverlo sin pintar, soltar el mouse o pausar el trazo queda estático, también para los espectadores. Los movimientos se agrupan en intervalos de 32 ms y no se guardan como trazos; salir del lienzo o terminar el turno oculta el cursor. La animación respeta la preferencia de movimiento reducido.
- Texto del lienzo validado en el servidor: bloquea la respuesta completa incluso con tildes, mayúsculas, espacios o puntuación intercalada. Esto no impide sinónimos, abreviaciones o letras dibujadas a mano.
- 760 palabras en 14 categorías: Bolivia, Cotidianas, Muebles, Electrodomésticos, Sistemas, Anime, Comida, Animales, Naturaleza, Deportes, Videojuegos, Profesiones, Cine y series y Fantasía. Muebles y Electrodomésticos tienen 50 palabras cada una. Sistemas incluye 100 palabras entre tecnología y conceptos de la carrera: diagramas, bases de datos, programación, redes y sistemas operativos. Se pueden combinar todas las categorías y añadir palabras personalizadas.
- Palabras personalizadas por sala, separadas por comas o saltos de línea. Se permiten jergas y malas palabras del grupo; no hay filtro de vocabulario. Al agregarlas se activa la categoría Personalizadas.
- Adivinar concede entre 100 y 500 puntos según el tiempo restante. El dibujante recibe 100 por cada acierto. Al adivinar todos o agotarse el tiempo, se revela la respuesta durante 5 segundos.
- Las respuestas se comparan sin distinguir tildes ni mayúsculas; también se ignoran espacios y signos de puntuación.
- Clasificación, revancha y resultados de partidas terminadas guardados en SQLite.
- Top 10 global de cuentas en la portada: suma puntos de partidas terminadas, con partidas y victorias acumuladas. Muestra el apodo y avatar del perfil, o los de la última partida si todavía no configuraste uno, nunca correos ni identificadores de cuenta, y marca tu entrada con «vos». Ordena por puntos y luego victorias; los empates restantes tienen orden estable. Los empates en primer puesto conceden victoria a todos los empatados si hubo puntos. Cuentan salas públicas y privadas; invitados, partidas interrumpidas y jugadores que salen antes del final no suman. El ranking se conserva en SQLite y puede actualizarse desde la portada. Empieza a contar con esta función: los resultados anteriores no tienen cuentas asociadas y no se importan por apodo. Las cuentas son opcionales y el ranking no incluye un sistema contra acuerdos para acumular puntos.
- Sonidos con silencio y volumen: sonido al acertar, fanfarria al terminar la partida, Steve (Minecraft) al denunciar y Roblox cuando todos los demás jugadores denuncian al dibujante. Activados por defecto al crear o unirse a una sala, con volumen al 35%; «Efectos» abre un panel flotante con volumen y silencio, sin ocupar espacio dentro del chat ni bloquear otras acciones. Se cierra al tocar fuera, con Escape o con su botón de cierre, y se adapta al espacio visible en móvil.
- Soundboard de sala con 24 audios, buscador y controles propios: el botón «Soundboard», separado del control «Efectos» del juego junto a «El chisme», abre un panel flotante y arrastrable que permite seguir escribiendo en el chat, dibujando y usando el resto de la sala. Se puede cerrar con Escape o su botón, y se adapta al tamaño visible en móvil. Permite enviar audios seguidos sin espera; se mantiene el límite general de eventos por conexión. Al silenciar el soundboard tampoco se pueden enviar audios hasta reactivarlo. Silencio y volumen son locales, independientes de los efectos del juego, y se guardan en el navegador; el volumen inicial es 35%. Se carga cada audio cuando hace falta y un clip nuevo reemplaza al anterior del soundboard, sin cortar los efectos del juego. Al silenciar o salir se detiene el clip y se cancela su reproducción pendiente; reconectar no repite audios antiguos. El servidor acepta solo audios del catálogo y bloquea los envíos de quienes el anfitrión haya silenciado.
- Reportar al pintor avisa a la sala y reproduce Steve a quienes tengan sonidos activos. Un reporte por jugador y turno, con 3 segundos entre reportes de la sala. Cuando todos los demás jugadores presentes lo reportan, suena Roblox una sola vez, se revela la palabra durante 5 segundos y pasa el turno al siguiente jugador; si era el último turno, termina la partida. No cambia los puntos ni expulsa al pintor. En partidas de dos personas basta el reporte del único adivinador. Escribir la respuesta en el lienzo se rechaza sin reproducir efectos.
- El anfitrión puede silenciar o habilitar el chat de otros jugadores, borrar mensajes y expulsar con confirmación. Silenciar no impide enviar un acierto: solo las respuestas correctas pasan al servidor y puntúan. La expulsión bloquea la misma cuenta y navegador durante la vida de la sala y borra los mensajes públicos de ese apodo.
- Interfaz adaptable a escritorio y móvil; dibujo con mouse, lápiz o pantalla táctil.
- Reconexión automática ante cortes temporales: reserva el puesto durante 2 minutos, mantiene puntos y turnos y recupera el estado actual al volver desde otra aplicación. Los demás ven «Reconectando…» junto al jugador. La partida sigue corriendo y salir voluntariamente no reserva el lugar.
- MOTD de texto en la cabecera: chistes malos, frases filosóficas y memes. En pantallas pequeñas ocupa una fila propia debajo del logo y los botones. Se elige uno al azar al abrir o recargar la página y permanece estable mientras juegas. Las frases se editan en `shared/motd.ts`, la misma lista que usa `/momazos`.
- Frases aleatorias en la portada: título principal, título del formulario y subtítulo cambian al abrir o recargar, con ocho opciones por sección. Se mantienen mientras usas la página y se personalizan en `src/landingMessages.ts`; las dos líneas del título principal se eligen juntas para conservar su sentido.
- La frase encima del código de sala también se elige al recargar y se personaliza en la lista `roomTaglines` de `src/landingMessages.ts`.
- Selector de modo claro/oscuro en la cabecera, con modo claro inicial y preferencia guardada en cada navegador. El tema se aplica al recargar y se sincroniza entre pestañas del mismo navegador; cada jugador elige el suyo. El lienzo sigue blanco en ambos temas para conservar los colores del dibujo.
- En móvil, el chat aparece antes de la clasificación y las herramientas se ocultan a quienes adivinan durante la partida. El lienzo se adapta al espacio visible al escribir; los mensajes nuevos desplazan solo el historial del chat. El teclado virtual debe comprobarse también en dispositivos reales.

## Easter eggs

- `/protocolo3` en el chat responde a la sala: «BT-7274 · Protocolo 3: proteger a la tropa». Respeta las restricciones y pausas del chat y no modifica puntos.
- Escribir «error de capa 8» en el chat, incluso dentro de una frase y con otras mayúsculas, añade «Se detectó un problema entre la silla y la pantalla».
- `/momazos` responde a toda la sala con «Momazos Diego» y una frase aleatoria de `shared/motd.ts`. Los efectos del chat respetan silencios, pausas y permisos; si el texto es un acierto se puntúa primero, y se evitan respuestas del sistema que contengan la palabra secreta.
- Al iniciar una partida o revancha hay un 20% de probabilidad de mostrar «Compilando talento… no se encontraron dependencias», como aviso y mensaje del chat. No agrega esperas ni cambia el reloj.
- Siete clics o toques al logo activan el modo salteña: cambia el icono del logo y el cursor del pincel en tu navegador, sin alterar trazos ni herramientas. Otros siete lo desactivan; recargar también lo reinicia.
- Al iniciar la tercera revancha tras tres partidas completas en la misma sala, aparece «¿No que era la última, pues?». Las partidas interrumpidas no cuentan; el contador desaparece con la sala o al reiniciar el servidor.

## Stack y arquitectura

| Parte | Tecnología |
| --- | --- |
| Frontend | React + TypeScript + Vite |
| Lienzo | Canvas 2D, coordenadas internas de 960 × 640 |
| Backend | Node.js 24 + TypeScript + Express |
| Tiempo real | Socket.IO |
| Persistencia | SQLite mediante `node:sqlite`, con WAL y espera de bloqueo |
| Despliegue | Un servidor, Docker Compose y Caddy para HTTPS |

El backend controla turnos, reloj, aciertos, puntuación y permisos. La respuesta y las opciones se envían solamente al dibujante hasta la revelación; los demás reciben una pista con guiones. El dibujante y quienes ya acertaron no pueden enviar mensajes durante el dibujo. Las acciones del anfitrión y los reportes unánimes se validan y registran en el servidor. Los reportes de broma están separados de la moderación del anfitrión.

Las salas, expulsiones de sala, trazos, chat, puntuación en curso y palabras personalizadas viven en memoria. SQLite conserva el catálogo inicial, los resultados finales, las cuentas, sesiones y registro de moderación, sin guardar cada movimiento del mouse. Una sala se elimina al salir su último jugador.

## Cuentas y moderación

### Insignias

Las cuentas desbloquean insignias de broma al terminar una partida. Se guardan una sola vez en SQLite y no cambian la puntuación. Aparecen en el top 10, en las tarjetas de jugadores al entrar a una sala y en «Mi cuenta», donde también se ven las pendientes. Se acomodan en varias líneas según el ancho de la tarjeta; la colección completa está comprobada en escritorio y pantallas de hasta 320 px de ancho. Toca una insignia de sala o ranking para ver su descripción.

- **🥔 Cero aciertos:** terminar sin adivinar ningún dibujo, con al menos una oportunidad de adivinar.
- **👻 Ronda en blanco:** pasar una ronda completa sin aciertos, con turnos para adivinar. Entrar a mitad de esa ronda no cuenta; las rondas siguientes sí pueden contar.
- **🎨 Arte incomprendido:** haber dibujado en un turno que terminó por tiempo sin ningún acierto y con al menos un adivinador conectado. No se concede por un lienzo vacío ni por reportes al pintor.
- **🐢 Último de la tropa:** quedar en el último puesto por debajo de la puntuación del primero, habiendo podido adivinar. Un empate de toda la sala no cuenta; un empate en el último puesto sí.

Solo cuentan partidas nuevas terminadas y los jugadores que siguen en la sala al final; no se conceden a invitados ni se recuperan de resultados antiguos. Abandonar o interrumpir una partida no concede insignias de esa partida.

### Cuenta y perfil

Usa «Entrar con cuenta» en la cabecera para registrarte o iniciar sesión. El correo identifica la cuenta; dentro del juego sigues eligiendo tu apodo y avatar. Una cuenta solo puede ocupar un puesto por sala. Puedes cerrar sesión desde «Mi cuenta» fuera de la sala.

En «Mi cuenta» puedes guardar un apodo de 2 a 20 caracteres y elegir un avatar. El perfil se guarda en SQLite y se recupera al iniciar sesión desde otro dispositivo, rellenando los datos de entrada a sala. El ranking usa el apodo y avatar del perfil en cuanto los guardas, conservando tus puntos; si todavía no configuraste el perfil, muestra los de la última partida terminada. Puedes usar otros datos para una sala concreta sin cambiar el perfil guardado. Las cuentas anteriores siguen funcionando y pueden configurar su perfil al entrar; el esquema se actualiza automáticamente al arrancar.

Los campos de contraseña de registro, inicio y recuperación incluyen un ojito para mostrar u ocultar el texto. Al cerrar el diálogo se vacían y vuelven a ocultarse.

- Contraseñas de 10 a 128 caracteres, con salt aleatorio y scrypt (N=32768, r=8, p=3), una configuración documentada por [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). No se guardan contraseñas en texto plano.
- Sesiones de 7 días en cookies HttpOnly y SameSite=Strict; en producción también Secure. SQLite guarda el hash del token, no el token original. Cerrar sesión invalida el token y desconecta sus conexiones activas.
- Verificación de origen en cambios de cuenta y conexiones del navegador, límite de JSON a 8 KB, y máximo de 4 derivaciones de contraseña simultáneas.
- Hasta 15 intentos de registro/inicio por IP y 10 por correo cada 15 minutos; hasta 240 solicitudes API por IP/minuto.
- Hasta 60 conexiones nuevas por IP/minuto, 24 simultáneas por IP y 1.000 conexiones globales. Las salas están limitadas a 200 y 12 jugadores por sala; creación a 10 por IP/minuto y entradas a 30 por IP/minuto.
- Se mantiene el límite de 100 eventos por conexión/segundo, con desconexión al superar 200 en la ventana. Las imágenes, mensajes y pistas se muestran como contenido, sin ejecutar HTML proporcionado por usuarios.

En las tarjetas de jugadores, el anfitrión abre «Moderar a…» para silenciar o expulsar. La papelera junto a un mensaje permite borrarlo. No se aplica un filtro de malas palabras: las jergas y bromas del grupo siguen permitidas.

Detrás del Caddy incluido en Compose se usa `TRUST_PROXY=1` para contar la IP real. Fuera de ese despliegue deja `TRUST_PROXY=0` y no habilites la confianza en cabeceras si el backend recibe tráfico directo de Internet.

### Recuperación de contraseña

«Olvidé mi contraseña» solicita un enlace al correo de la cuenta. Vence en 30 minutos, se usa una sola vez y pedir otro invalida el anterior. SQLite guarda solo su hash; el enlace lleva el token en el fragmento de la URL, que se retira al abrir el formulario. Se valida la nueva contraseña y su confirmación; al guardarla se invalidan las sesiones anteriores y hay que iniciar sesión de nuevo. El perfil, puntos e insignias permanecen.

**El envío requiere un proveedor SMTP configurado.** Sin esa configuración el formulario avisa que la recuperación no está disponible; no genera enlaces públicos ni simula un envío. Completa estas variables en `.env` (también están en `.env.example` y se pasan al contenedor de Compose):

```dotenv
PUBLIC_ORIGIN=https://pintapues.com
SMTP_HOST=smtp.tu-proveedor.com
SMTP_PORT=587
SMTP_USER=tu-usuario-smtp
SMTP_PASS=tu-contraseña-smtp
SMTP_FROM="Pinta Pues <correo@pintapues.com>"
```

Usa un remitente autorizado por tu proveedor y reinicia el backend después de configurarlo. `PUBLIC_ORIGIN` fija el dominio del enlace; no se toma de cabeceras enviadas por el solicitante. SMTP usa TLS directo en 465 y exige STARTTLS en otros puertos, según la [configuración de Nodemailer](https://nodemailer.com/smtp). En desarrollo se permite un origen HTTP de localhost; no se envían enlaces a orígenes HTTP en producción. No subas `.env` al repositorio.

El mensaje de solicitud no revela si existe la cuenta. Hay límites de solicitudes por IP y correo, límite de intentos de restablecimiento y consumo atómico del enlace para impedir reutilizarlo con dos peticiones simultáneas. Si falla el envío, se invalida ese enlace y se registra un aviso genérico sin correo ni token. Las pruebas usan un emisor simulado; falta comprobar una entrega real después de configurar SMTP.

## Ejecutar en desarrollo

### Donaciones

El texto «Apoyar Pinta Pues» del footer, con estilo de enlace a la derecha de Bolivia y su bandera, abre el QR de Binance y permite guardar la imagen desde el celular. En pantallas pequeñas pasa a otra línea si falta espacio. Coloca tu QR como **`public/images/binance-qr.png`** (imagen PNG con su margen blanco y buena resolución). Si no existe o no carga, se muestra un aviso de que aún no está disponible. Para usar otro nombre o formato, actualiza `qrPath` en `src/DonationButton.tsx`. La imagen será pública al desplegar; el diálogo muestra el QR y no procesa ni confirma pagos. Después de cambiarla, vuelve a compilar y desplegar.

### Desarrollo local

Requisitos: **Node.js 24 o superior** y npm. El módulo SQLite integrado puede mostrar una advertencia de función experimental según la versión de Node; no necesita instalar SQLite por separado.

```bash
npm install
npm run dev
```

En PowerShell con ejecución de scripts restringida, usa `npm.cmd` en lugar de `npm`.

- Juego: <http://localhost:5173> (si está ocupado, Vite imprime el siguiente puerto).
- Backend: <http://localhost:3001/api/health>.
- Vite reenvía `/api` y `/socket.io` al backend para mantener el mismo origen.
- La base se crea automáticamente en `data/pinta-pues.sqlite`.

Para probar una partida, abre dos pestañas, crea una sala y entra con un apodo distinto en la otra. También puedes usar otro dispositivo de tu red con `http://IP-DE-TU-PC:5173`, siempre que el firewall permita el acceso.

## Compilar y ejecutar

```bash
npm run build
npm start
```

Abre <http://localhost:3001>. Express sirve tanto el frontend compilado como Socket.IO y los endpoints HTTP desde el mismo proceso.

Copia `.env.example` a `.env` si quieres personalizar `PORT`, `HOST` o `DB_PATH`. El comando `start` carga ese archivo si existe. El backend de desarrollo también lo carga, pero el proxy de Vite apunta a 3001: si cambias `PORT`, ajusta `vite.config.ts`.

## Verificación

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Las pruebas de integración arrancan un servidor real en un puerto libre con una base SQLite temporal en memoria y clientes Socket.IO independientes. Las pruebas de navegador comprueban creación y unión a sala, una partida real, sincronización del dibujo, texto prohibido y relleno. Playwright inicia sus propios servidores de desarrollo.

## Desplegar en un VPS

Necesitas Docker con Compose, un dominio apuntando al servidor y los puertos 80 y 443 disponibles. En `.env` agrega:

```dotenv
DOMAIN=pinta.tudominio.com
```

```bash
docker compose up -d --build
```

Caddy gestiona HTTPS y reenvía HTTP y WebSockets al backend. SQLite queda en el volumen `pinta_data`; los certificados, en los volúmenes de Caddy. No se publica directamente el puerto del backend. Para detener sin borrar datos usa `docker compose down`; `down -v` elimina también los volúmenes.

Las fuentes web son opcionales y tienen alternativas locales si Google Fonts no está disponible.

Los avatares se generan localmente con [DiceBear](https://www.dicebear.com/integrations/javascript/), usando el estilo [Bottts de Pablo Stanley](https://www.dicebear.com/styles/bottts/), disponible para uso personal y comercial. No se envían apodos a una API externa ni se necesitan claves o imágenes subidas. La biblioteca `@dicebear/core` usa licencia MIT; la licencia del diseño Bottts se incluye en `node_modules/@dicebear/styles/LICENSE.md`.

### Copias de seguridad

Con WAL, copiar solo el archivo `.sqlite` mientras está activo no garantiza una copia consistente. Usa la API de backup de SQLite o detén el servicio y respalda el volumen completo. Mantén una copia fuera del servidor. No subas `data/`, `.env` ni archivos de audio privados al repositorio.

## Estructura

Los efectos del juego están en **`public/audio/game/`** y los clips del soundboard en **`public/audio/soundboard/`**. Los 24 clips actuales se copiaron de Descargas, conservando los originales. Para agregar otros, copia el archivo al soundboard y agrega su `id`, `name` y `file` a `shared/soundboard.ts`; `name` es la etiqueta que se muestra en los botones y `id` debe ser único. Cambiar el catálogo o los archivos requiere compilar y desplegar de nuevo. Los controles del soundboard no permiten subir archivos desde la web.

```text
src/                Interfaz React y motor de dibujo del navegador
shared/types.ts     Tipos compartidos y dimensiones del lienzo
server/app.ts       HTTP, Socket.IO y recursos del servidor
server/game.ts      Salas, validación de eventos y reglas del juego
server/store.ts     SQLite, esquema y catálogo inicial
tests/              Pruebas de integración y navegador
public/             Recursos estáticos propios
Dockerfile          Compilación y ejecución de producción
compose.yaml        Aplicación, almacenamiento y Caddy
```

## Límites actuales y siguientes pasos

- **Reconexión:** una caída temporal de red o suspensión al cambiar de aplicación reserva el lugar durante 2 minutos. Al reconectar desde la misma página se conservan puntos, apodo, anfitrión y turnos, y se recibe el estado actual del lienzo y chat. La partida y el reloj continúan; no se pausan mientras alguien está desconectado. Al vencer el plazo, el jugador sale y se transfiere el anfitrión si corresponde; con menos de dos se vuelve a la sala de espera. Salir voluntariamente o ser expulsado no reserva el puesto. Recargar, cerrar la pestaña o reiniciar el servidor no recupera automáticamente el lugar. Hay que comprobar la suspensión real en dispositivos Android/iOS; el navegador puede descartar la página por completo.
- **Reinicios:** interrumpen las partidas activas; catálogo y resultados finales permanecen en disco. Las palabras personalizadas desaparecen con la sala.
- **Un solo proceso:** no ejecutar réplicas ni un clúster de Node. Redis y PostgreSQL se evaluarán si la carga medida requiere distribuir partidas.
- **Límites de seguridad:** los invitados pueden evadir el bloqueo de navegador borrando sus cookies; las cuentas sí conservan su bloqueo de sala al reconectar. No hay verificación de correo al registrarse, MFA ni sanciones globales. La recuperación de contraseña requiere configurar SMTP. Los límites locales no sustituyen la protección contra DDoS del proveedor; los bloqueos de sala y contadores de frecuencia se reinician con el proceso.
- **Biblioteca personal:** falta guardar y administrar paquetes propios entre sesiones, editar el catálogo desde la interfaz y consultar el historial guardado.
- **Dibujo:** falta zoom y relleno con tolerancia ajustable. Los límites actuales son 8.000 operaciones y 60.000 puntos por turno; deshacer o limpiar libera espacio.
- **Calidad visual:** Canvas usa fuentes y suavizado del navegador; el aspecto del texto y los bordes puede variar ligeramente entre dispositivos.

Siguientes mejoras: reconexión, paquetes persistentes y más mecánicas propias de Pinta Pues.
