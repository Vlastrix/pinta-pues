/** All durations use milliseconds. A first guess never extends the current turn. */
export function finalGuessWindow(duration: number, remaining: number) {
  return Math.max(0, Math.min(duration * .5, remaining));
}

export function followingGuessPoints(remaining: number, window: number) {
  const fraction = window > 0 ? Math.max(0, Math.min(1, remaining / window)) : 0;
  return 10 + Math.round(40 * fraction);
}

export function firstGuessPoints(remaining: number, duration: number, duel: boolean) {
  if (!duel) return 60;
  const fraction = duration > 0 ? Math.max(0, Math.min(1, remaining / duration)) : 0;
  return 30 + Math.round(30 * fraction);
}

export function painterPoints(correct: number, eligible: number, duel = false) {
  return eligible > 0 ? Math.round((duel ? 30 : 60) * Math.max(0, Math.min(1, correct / eligible))) : 0;
}
