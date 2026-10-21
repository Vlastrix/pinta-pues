import { motdMessages } from '../shared/motd.js';
import { normalize } from './store.js';

export function chatEasterEgg(text: string, hiddenWord?: string, random = Math.random): string | null {
  const safe = (message: string) => !hiddenWord || !normalize(message).includes(normalize(hiddenWord));
  let message: string | undefined;
  const command = text.trim().toLowerCase();
  if (command === '/protocolo3') message = 'BT-7274 · Protocolo 3: proteger a la tropa.';
  else if (command === '/momazos') {
    const options = motdMessages.map(phrase => `Momazos Diego · ${phrase}`).filter(safe);
    if (options.length) message = options[Math.floor(random() * options.length)];
  } else if (/\berror\s+de\s+capa\s*8\b/i.test(text)) message = 'Se detectó un problema entre la silla y la pantalla';
  return message && safe(message) ? message : null;
}

export function startEasterEgg(random = Math.random): string | null {
  return random() < 0.2 ? 'Compilando talento… no se encontraron dependencias' : null;
}
