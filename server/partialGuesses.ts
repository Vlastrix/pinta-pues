import { normalize } from './store.js';

const parts = (text: string) => text.normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];

/** Accept whole words or a contiguous phrase, never substrings or a bag of guesses. */
export function matchingParts(answer: string, guess: string): string[] {
  const target = parts(answer).map(normalize), attempt = parts(guess).map(normalize);
  if (target.length < 2 || !attempt.length || attempt.length >= target.length) return [];
  for (let index = 0; index <= target.length - attempt.length; index++) {
    if (attempt.every((part, offset) => part === target[index + offset])) return [...new Set(attempt)];
  }
  return [];
}

export function completedParts(answer: string, found: Set<string>) {
  const target = parts(answer);
  return target.length > 1 && target.every(part => found.has(normalize(part)));
}

/** Merge private word discoveries with timed hints without exposing other letters. */
export function personalHint(answer: string, hint: string, found?: Set<string>) {
  if (!found?.size) return hint;
  const publicLetters = Array.from(hint);
  let position = 0;
  return (answer.normalize('NFC').match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) ?? []).map(part => {
    const reveal = found.has(normalize(part));
    return Array.from(part).map(character => {
      const index = position++;
      return reveal ? character : publicLetters[index];
    }).join('');
  }).join('');
}
