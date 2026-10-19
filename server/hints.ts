const isLetter = (character: string) => /[\p{L}\p{N}]/u.test(character);
const characters = (word: string) => Array.from(word.normalize('NFC'));

export function maskWord(word: string) {
  return characters(word).map(character => /[\s-]/u.test(character) ? character : '_').join('');
}

/** Select positions once per turn. Only the finished hint strings leave the server. */
export function hintSteps(word: string) {
  const letters = characters(word);
  const positions = letters.flatMap((character, index) => isLetter(character) ? [index] : []);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const count = Math.floor(positions.length / 2);
  const progressSteps = count <= 3
    ? [0.35, 0.6, 0.8].slice(0, count)
    : Array.from({ length: count }, (_, index) => 0.35 + 0.45 * index / (count - 1));
  const revealed = new Set<number>();
  return progressSteps.map(progress => {
    revealed.add(positions[revealed.size]);
    return {
      progress,
      hint: letters.map((character, index) => revealed.has(index) || /[\s-]/u.test(character) ? character : '_').join(''),
    };
  });
}
