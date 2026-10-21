# Pinta Pues 🎨🇧🇴

Juego web de dibujar y adivinar para la tropa. Inspirado en la mecánica de Pinturillo, con nombre, interfaz y código propios; palabras bolivianas, categorías y herramientas de dibujo adicionales.

## Primera versión

- Salas privadas por código o enlace, con 2 a 12 jugadores. Puedes jugar como invitado o crear una cuenta opcional con correo y contraseña.
- Avatar elegible junto al apodo: robots de DiceBear, opciones nuevas al azar y elección guardada en el navegador. Se comparte con todos los jugadores de la sala.
- Anfitrión que configura entre 1 y 5 rondas, tiempo por turno y categorías.
- Cada jugador dibuja una vez por ronda. Elige entre hasta tres palabras; si no elige en 15 segundos, se selecciona una automáticamente.
- Las palabras dibujadas no se repiten en la misma sala, incluidas las revanchas, mientras queden palabras nuevas en las categorías seleccionadas. Si quedan una o dos, se ofrecen esas; al agotarse la selección se reutiliza, evitando la palabra inmediatamente anterior cuando sea posible. Las opciones descartadas pueden volver a aparecer. El historial se pierde cuando se elimina la sala o se reinicia el servidor.
- Dibujo y chat sincronizados con Socket.IO.
- Los trazos locales permanecen visibles mientras el servidor los confirma, para evitar parpadeos con conexiones lentas. Las reconstrucciones del lienzo se preparan fuera de pantalla y se muestran completas.
- Para los espectadores, el primer punto se envía al apoyar el pincel y los tramos siguientes se envían cada 24 ms, incluso si el mouse hace una pausa. Las actualizaciones recibidas se agrupan por frame y se pintan solo los tramos nuevos.
- Pistas progresivas iguales para todos: el máximo es la mitad de las letras o números de la respuesta, redondeando hacia abajo (3 → 1, 4 → 2, 6 → 3, 10 → 5). Hasta tres pistas aparecen al 35%, 60% y 80% del turno; si la palabra permite más, se reparten entre el 35% y el 80%. Los espacios y guiones se mantienen y no cuentan para calcular el máximo. Las pistas se reinician en cada turno.
- Pincel, borrador, línea, rectángulo, elipse, estrella, balde de relleno y texto; colores, grosor, deshacer y limpiar.
- Atajos durante tu turno: P o B (pincel), E (borrador), L (línea), R (rectángulo), O (círculo), S (estrella), F (relleno) y T (texto). También puedes usar 1–8 en el orden de la barra. Ctrl+Z o ⌘Z deshacen; los atajos no interfieren al escribir en campos ni con diálogos abiertos. Cada botón muestra sus atajos al pasar el cursor.
- Cursor compartido del dibujante: lápiz del color elegido, animación al trazar y posición sincronizada para los demás, adaptada al tamaño de cada lienzo. Los movimientos se agrupan en intervalos de 32 ms y no se guardan como trazos; salir del lienzo o terminar el turno oculta el cursor. La animación respeta la preferencia de movimiento reducido.
- Texto del lienzo validado en el servidor: bloquea la respuesta completa incluso con tildes, mayúsculas, espacios o puntuación intercalada. Esto no impide sinónimos, abreviaciones o letras dibujadas a mano.
- 660 palabras en 12 categorías: Bolivia, Cotidianas, Sistemas, Anime, Comida, Animales, Naturaleza, Deportes, Videojuegos, Profesiones, Cine y series y Fantasía. Sistemas incluye 100 palabras entre tecnología y conceptos de la carrera: diagramas, bases de datos, programación, redes y sistemas operativos. Se pueden combinar todas las categorías y añadir palabras personalizadas.
- Palabras personalizadas por sala, separadas por comas o saltos de línea. Se permiten jergas y malas palabras del grupo; no hay filtro de vocabulario. Al agregarlas se activa la categoría Personalizadas.
- Adivinar concede entre 100 y 500 puntos según el tiempo restante. El dibujante recibe 100 por cada acierto. Al adivinar todos o agotarse el tiempo, se revela la respuesta durante 5 segundos.
- Clasificación, revancha y resultados de partidas terminadas guardados en SQLite.
- Sonidos con silencio y volumen: tono al acertar, Steve (Minecraft) al denunciar y Roblox cuando todos los demás jugadores denuncian al dibujante. Activados por defecto al crear o unirse a una sala, con volumen al 35%; pulsa el altavoz del chat para silenciarlos o reactivarlos.
- Reportar al pintor es una broma: avisa a la sala y reproduce Steve a quienes tengan sonidos activos. Un reporte por jugador y turno, con 3 segundos entre reportes de la sala. Cuando todos los demás jugadores presentes lo reportan, suena Roblox una sola vez. No cambia los puntos, no termina el turno y no expulsa. En partidas de dos personas basta el reporte del único adivinador. Escribir la respuesta en el lienzo se rechaza sin reproducir efectos.
- El anfitrión puede silenciar o habilitar el chat de otros jugadores, borrar mensajes y expulsar con confirmación. Silenciar no impide enviar un acierto: solo las respuestas correctas pasan al servidor y puntúan. La expulsión bloquea la misma cuenta y navegador durante la vida de la sala y borra los mensajes públicos de ese apodo.
- Interfaz adaptable a escritorio y móvil; dibujo con mouse, lápiz o pantalla táctil.
- En móvil, el chat aparece antes de la clasificación y las herramientas se ocultan a quienes adivinan durante la partida. El lienzo se adapta al espacio visible al escribir; los mensajes nuevos desplazan solo el historial del chat. El teclado virtual debe comprobarse también en dispositivos reales.

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

Usa «Entrar con cuenta» en la cabecera para registrarte o iniciar sesión. El correo identifica la cuenta; dentro del juego sigues eligiendo tu apodo y avatar. Una cuenta solo puede ocupar un puesto por sala. Puedes cerrar sesión desde «Mi cuenta» fuera de la sala.

- Contraseñas de 10 a 128 caracteres, con salt aleatorio y scrypt (N=32768, r=8, p=3), una configuración documentada por [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). No se guardan contraseñas en texto plano.
- Sesiones de 7 días en cookies HttpOnly y SameSite=Strict; en producción también Secure. SQLite guarda el hash del token, no el token original. Cerrar sesión invalida el token y desconecta sus conexiones activas.
- Verificación de origen en cambios de cuenta y conexiones del navegador, límite de JSON a 8 KB, y máximo de 4 derivaciones de contraseña simultáneas.
- Hasta 15 intentos de registro/inicio por IP y 10 por correo cada 15 minutos; hasta 240 solicitudes API por IP/minuto.
- Hasta 60 conexiones nuevas por IP/minuto, 24 simultáneas por IP y 1.000 conexiones globales. Las salas están limitadas a 200 y 12 jugadores por sala; creación a 10 por IP/minuto y entradas a 30 por IP/minuto.
- Se mantiene el límite de 100 eventos por conexión/segundo, con desconexión al superar 200 en la ventana. Las imágenes, mensajes y pistas se muestran como contenido, sin ejecutar HTML proporcionado por usuarios.

En las tarjetas de jugadores, el anfitrión abre «Moderar a…» para silenciar o expulsar. La papelera junto a un mensaje permite borrarlo. No se aplica un filtro de malas palabras: las jergas y bromas del grupo siguen permitidas.

Detrás del Caddy incluido en Compose se usa `TRUST_PROXY=1` para contar la IP real. Fuera de ese despliegue deja `TRUST_PROXY=0` y no habilites la confianza en cabeceras si el backend recibe tráfico directo de Internet.

## Ejecutar en desarrollo

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

- **Reconexión:** al desconectarse, el jugador sale y pierde su puntuación; el anfitrión pasa al siguiente jugador. No se admiten ingresos a partidas en curso. Si quedan menos de dos, se vuelve a la sala de espera. Falta recuperar sesiones con un período de gracia.
- **Reinicios:** interrumpen las partidas activas; catálogo y resultados finales permanecen en disco. Las palabras personalizadas desaparecen con la sala.
- **Un solo proceso:** no ejecutar réplicas ni un clúster de Node. Redis y PostgreSQL se evaluarán si la carga medida requiere distribuir partidas.
- **Límites de seguridad:** los invitados pueden evadir el bloqueo de navegador borrando sus cookies; las cuentas sí conservan su bloqueo de sala al reconectar. No hay verificación de correo, recuperación de contraseña, MFA ni sanciones globales. Los límites locales no sustituyen la protección contra DDoS del proveedor; los bloqueos de sala y contadores de frecuencia se reinician con el proceso.
- **Biblioteca personal:** falta guardar y administrar paquetes propios entre sesiones, editar el catálogo desde la interfaz y consultar el historial guardado.
- **Dibujo:** falta zoom, atajos y relleno con tolerancia ajustable. Los límites actuales son 8.000 operaciones y 60.000 puntos por turno; deshacer o limpiar libera espacio.
- **Calidad visual:** Canvas usa fuentes y suavizado del navegador; el aspecto del texto y los bordes puede variar ligeramente entre dispositivos.

Primera meta: una partida completa entre amigos. Después, reconexión, paquetes persistentes y las mecánicas propias de Pinta Pues.
