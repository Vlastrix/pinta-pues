
export const heroMessages = [
  { firstLine: 'Vos dibujá.', secondLine: 'La tropa ', highlight: 'adivina.' },
  { firstLine: 'Tirá un trazo.', secondLine: 'Que la tropa ', highlight: 'descifre.' },
  { firstLine: '¿Es un gato?', secondLine: 'Vos decí que ', highlight: 'sí.' },
  { firstLine: 'Cero talento.', secondLine: 'Muchas ', highlight: 'risas.' },
  { firstLine: 'Dibujá algo.', secondLine: 'Sorprendé a la ', highlight: 'tropa.' },
  { firstLine: 'Arte dudoso.', secondLine: 'Diversión ', highlight: 'segura.' },
  { firstLine: 'Un lienzo.', secondLine: 'Mil ', highlight: 'ocurrencias.' },
  { firstLine: 'Vos trazá.', secondLine: 'El chat ', highlight: 'juzga.' },
] as const;

export const entryTitles = [
  'Se arma la partidovich',
  'Ya llego el wachiwachiwa',
  'Que caiga la tropa',
  'Hoy se pinta, pues',
  'Sale una partidita',
  'Se viene el arte',
  'El lienzo te espera',
  'Convocá a los artistas',
  'Arranca el despelote',
] as const;

export const entrySubtitles = [
  'La salteña puede esperar. Tu sala, no.',
  'La tarea se entrega mañana. El dibujo, ahora.',
  'Traé a tus amigos. El talento es opcional.',
  'Un enlace al grupo y que empiece el caos.',
  'Tu próximo mal dibujo merece público.',
  'Cinco minutitos. Eso dijimos hace tres rondas.',
  'El mouse está listo. Las excusas también.',
  'No hace falta saber dibujar para hacerse leyenda.',
] as const;

// Frase pequeña que aparece encima del código de la sala.
export const roomTaglines = [
  'LA TROPA ESTÁ REUNIDA',
  'SE JUNTÓ EL TALENTO',
  'EL CAOS TIENE SALA',
  'ACÁ SE VIENE A PINTAR',
  'QUE NO FALTEN LAS RISAS',
  'LA GALERÍA DEL DESASTRE',
  'PURO ARTISTA POR AQUÍ',
  'LA PARTIDOVICH NOS UNE',
] as const;

function pick<T extends readonly [unknown, ...unknown[]]>(options: T): T[number] {
  return options[Math.floor(Math.random() * options.length)];
}

export function pickLandingMessages() {
  return { hero: pick(heroMessages), title: pick(entryTitles), subtitle: pick(entrySubtitles), roomTagline: pick(roomTaglines) };
}
