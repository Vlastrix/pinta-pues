import type { SoundEffect } from '../shared/types';

type Effect = SoundEffect | 'correct' | 'finish';
const files: Record<Effect, string> = {
  report: '/audio/game/steve-old-hurt-sound-effect.mp3',
  penalty: '/audio/game/roblox-death-sound-effect.mp3',
  correct: '/audio/game/success.mp3',
  finish: '/audio/game/success-fanfare-trumpets.mp3',
};

/** One context, unlocked by a user click, shared by all MP3 effects. */
export class SoundPlayer {
  private context: AudioContext;
  private gain: GainNode;
  private buffers = new Map<Effect, Promise<AudioBuffer>>();
  private active = new Set<AudioScheduledSourceNode>();
  private enabled = false;
  private nextEffectAt = 0;
  constructor(volume: number) {
    this.context = new AudioContext();
    this.gain = this.context.createGain();
    this.gain.connect(this.context.destination);
    this.setVolume(volume);
  }
  private load(effect: Effect) {
    let buffer = this.buffers.get(effect);
    if (!buffer) {
      buffer = fetch(files[effect]).then(async response => {
        if (!response.ok) throw new Error('No se pudo cargar el audio.');
        return this.context.decodeAudioData(await response.arrayBuffer());
      }).catch(error => { this.buffers.delete(effect); throw error; });
      this.buffers.set(effect, buffer);
    }
    return buffer;
  }
  async enable() {
    await this.context.resume();
    await Promise.all([this.load('report'), this.load('penalty'), this.load('correct'), this.load('finish')]);
    this.enabled = true;
  }
  mute() {
    this.enabled = false;
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
    const buffer = await this.load(effect);
    if (!this.enabled || this.context.state !== 'running') return;
    const source = this.context.createBufferSource();
    source.buffer = buffer; source.connect(this.gain);
    // The last report plays Steve first, followed by Roblox, without cutting it off.
    const interrupt = effect === 'correct' || effect === 'finish';
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
