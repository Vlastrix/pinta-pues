import { createApp } from './app.js';

const server = createApp();
const port = Number(process.env.PORT ?? 3001);
server.http.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log(`Pinta Pues · http://localhost:${port}`));
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await server.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
