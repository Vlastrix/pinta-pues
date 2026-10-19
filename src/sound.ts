import type { SoundEffect } from '../shared/types';

const files: Record<SoundEffect, string> = {
  report: '/audio/steve-old-hurt-sound-effect.mp3',
  penalty: '/audio/roblox-death-sound-effect.mp3',
};

/** One context, unlocked by a user click, shared by the MP3 effects and success tone. */
export class SoundPlayer {
  private context: AudioContext;
  private gain: GainNode;
  private buffers = new Map<SoundEffect, Promise<AudioBuffer>>();
  private active = new Set<AudioScheduledSourceNode>();
  private enabled = false;
  private nextEffectAt = 0;
  constructor(volume: number) {
    this.context = new AudioContext();
    this.gain = this.context.createGain();
    this.gain.connect(this.context.destination);
    this.setVolume(volume);
  }
  private load(effect: SoundEffect) {
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
    await Promise.all([this.load('report'), this.load('penalty')]);
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
  async play(effect: SoundEffect) {
    if (!this.enabled || this.context.state !== 'running') return;
    const buffer = await this.load(effect);
    if (!this.enabled || this.context.state !== 'running') return;
    const source = this.context.createBufferSource();
    source.buffer = buffer; source.connect(this.gain);
    // The last report plays Steve first, followed by Roblox, without cutting it off.
    const at = Math.max(this.context.currentTime, this.nextEffectAt);
    this.nextEffectAt = at + buffer.duration;
    this.start(source, at, false);
  }
  correct() {
    if (!this.enabled || this.context.state !== 'running') return;
    const oscillator = this.context.createOscillator(); const envelope = this.context.createGain();
    oscillator.connect(envelope); envelope.connect(this.gain);
    const now = this.context.currentTime;
    oscillator.frequency.setValueAtTime(520, now); oscillator.frequency.exponentialRampToValueAtTime(900, now + 0.15);
    envelope.gain.setValueAtTime(0.2, now); envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    this.start(oscillator); oscillator.stop(now + 0.3);
    oscillator.onended = () => { this.active.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
  }
}
