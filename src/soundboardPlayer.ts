import { SOUNDBOARD_CLIPS, type SoundboardId } from '../shared/soundboard';

/** Separate channel: muting game effects never changes the soundboard gain. */
export class SoundboardPlayer {
  private context = new AudioContext();
  private gain = this.context.createGain();
  private buffers = new Map<SoundboardId, Promise<AudioBuffer>>();
  private source: AudioBufferSourceNode | null = null;
  private enabled = false;
  private version = 0;
  constructor(volume: number) { this.gain.connect(this.context.destination); this.setVolume(volume); }
  async enable() {
    const version = ++this.version;
    await this.context.resume();
    if (version === this.version) this.enabled = true;
  }
  stop() {
    this.version++;
    this.source?.stop(); this.source = null;
  }
  mute() { this.enabled = false; this.stop(); }
  setVolume(volume: number) { this.gain.gain.value = Math.max(0, Math.min(1, volume)); }
  private load(id: SoundboardId) {
    const clip = SOUNDBOARD_CLIPS.find(item => item.id === id);
    if (!clip) throw new Error('Audio desconocido.');
    let buffer = this.buffers.get(id);
    if (!buffer) {
      if (this.buffers.size >= 8) this.buffers.delete(this.buffers.keys().next().value!);
      buffer = fetch(`/audio/soundboard/${encodeURIComponent(clip.file)}`).then(async response => {
        if (!response.ok) throw new Error('No se pudo cargar el audio del soundboard.');
        return this.context.decodeAudioData(await response.arrayBuffer());
      }).catch(error => { this.buffers.delete(id); throw error; });
      this.buffers.set(id, buffer);
    }
    return buffer;
  }
  async play(id: SoundboardId) {
    if (!this.enabled || this.context.state !== 'running') return false;
    this.stop(); const version = this.version;
    const buffer = await this.load(id);
    if (!this.enabled || this.version !== version || this.context.state !== 'running') return false;
    const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.gain);
    source.onended = () => { if (this.source === source) this.source = null; source.disconnect(); };
    this.source = source; source.start(); return true;
  }
}
