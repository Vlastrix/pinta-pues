import type { SoundEffect } from '../shared/types';
import { GUESS_REACTION_FILES } from './guessReactions';

type Effect = SoundEffect | 'correct' | 'finish' | 'creator-prank';
const files: Record<Effect, string> = {
  report: '/audio/game/steve-old-hurt-sound-effect.mp3',
  penalty: '/audio/game/roblox-death-sound-effect.mp3',
  correct: '/audio/game/success.mp3',
  finish: '/audio/game/success-fanfare-trumpets.mp3',
  'creator-prank': '/audio/game/maldito-traidor-spain-version-1-0.mp3',
};

/** One context, unlocked by a user click, shared by all MP3 effects. */
export class SoundPlayer {
  private context: AudioContext;
  private gain: GainNode;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private active = new Set<AudioScheduledSourceNode>();
  private enabled = false;
  private nextEffectAt = 0;
  private version = 0;
  private lastGuess = -1;
  constructor(volume: number) {
    this.context = new AudioContext();
    this.gain = this.context.createGain();
    this.gain.connect(this.context.destination);
    this.setVolume(volume);
  }
  private load(file: string) {
    let buffer = this.buffers.get(file);
    if (!buffer) {
      if (this.buffers.size >= 8) this.buffers.delete(this.buffers.keys().next().value!);
      buffer = fetch(file).then(async response => {
        if (!response.ok) throw new Error('No se pudo cargar el audio.');
        return this.context.decodeAudioData(await response.arrayBuffer());
      }).catch(error => { if (this.buffers.get(file) === buffer) this.buffers.delete(file); throw error; });
      this.buffers.set(file, buffer);
    }
    return buffer;
  }
  async enable() {
    const version = ++this.version;
    await this.context.resume();
    await Promise.all([this.load(files.report), this.load(files.penalty), this.load(files.finish)]);
    if (version === this.version) this.enabled = true;
  }
  mute() {
    this.enabled = false;
    this.stop();
  }
  stop() {
    this.version++;
    this.nextEffectAt = 0;
    for (const source of this.active) source.stop();
    this.active.clear();
  }
  setVolume(volume: number) { this.gain.gain.value = Math.max(0, Math.min(1, volume)); }
  private start(source: AudioScheduledSourceNode, at = this.context.currentTime, interrupt = true) {
    if (interrupt) {
      for (const previous of this.active) previous.stop();
      this.active.clear(); this.nextEffectAt = 0;
    }
    this.active.add(source);
    source.onended = () => { this.active.delete(source); source.disconnect(); };
    source.start(at);
  }
  async play(effect: Effect) {
    if (!this.enabled || this.context.state !== 'running') return;
    let file = files[effect];
    if (effect === 'correct' && GUESS_REACTION_FILES.length) {
      const length = GUESS_REACTION_FILES.length;
      this.lastGuess = this.lastGuess < 0 ? Math.floor(Math.random() * length) : (this.lastGuess + 1 + Math.floor(Math.random() * Math.max(1, length - 1))) % length;
      file = GUESS_REACTION_FILES[this.lastGuess];
    }
    const version = this.version, buffer = await this.load(file);
    if (!this.enabled || version !== this.version || this.context.state !== 'running') return;
    const source = this.context.createBufferSource();
    source.buffer = buffer; source.connect(this.gain);
    // The last report plays Steve first, followed by Roblox, without cutting it off.
    const interrupt = effect === 'correct' || effect === 'finish' || effect === 'creator-prank';
    const at = interrupt ? this.context.currentTime : Math.max(this.context.currentTime, this.nextEffectAt);
    this.start(source, at, interrupt);
    this.nextEffectAt = at + buffer.duration;
  }
  correct() {
    return this.play('correct');
  }
  finish() {
    return this.play('finish');
  }
}
