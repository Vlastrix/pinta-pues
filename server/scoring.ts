/** All durations use milliseconds. A first guess never extends the current turn. */
export function finalGuessWindow(duration: number, remaining: number) {
  return Math.max(0, Math.min(duration * .5, remaining));
}

export function followingGuessPoints(remaining: number, window: number) {
  const fraction = window > 0 ? Math.max(0, Math.min(1, remaining / window)) : 0;
  return 10 + Math.round(40 * fraction);
}

export function painterPoints(correct: number, eligible: number) {
  return eligible > 0 ? Math.round(60 * Math.max(0, Math.min(1, correct / eligible))) : 0;
}
