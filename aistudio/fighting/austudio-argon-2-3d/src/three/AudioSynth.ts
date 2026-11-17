import { SimEvent } from '../sim/types';

export class MartialArtsAudioSynth {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playEvent(ev: SimEvent): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const pitchJitter = 1 + (Math.random() - 0.5) * 0.14;

    if (ev.type === 'whoosh' || ev.type === 'stunt_start') {
      // Crisp Hong Kong cloth/air whoosh
      const dur = ev.type === 'stunt_start' ? 0.24 : 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220 * pitchJitter, now);
      osc.frequency.exponentialRampToValueAtTime(65 * pitchJitter, now + dur);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.08 * ev.weight, now + dur * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur);
    } else if (ev.type === 'hit' || ev.type === 'heavy_hit' || ev.type === 'ko') {
      // Classic 1980s Golden Harvest martial arts punch/kick slap + thud
      const isHeavy = ev.type !== 'hit';
      const dur = isHeavy ? 0.22 : 0.12;
      const osc = ctx.createOscillator();
      const snapOsc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime((isHeavy ? 165 : 210) * pitchJitter, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + dur);

      snapOsc.type = 'square';
      snapOsc.frequency.setValueAtTime(520 * pitchJitter, now);
      snapOsc.frequency.exponentialRampToValueAtTime(90, now + 0.045);

      gain.gain.setValueAtTime(isHeavy ? 0.16 : 0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain);
      snapOsc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      snapOsc.start(now);
      osc.stop(now + dur);
      snapOsc.stop(now + 0.05);
    } else if (ev.type === 'prop_break') {
      // Wooden crate/table crash
      for (let i = 0; i < 3; i++) {
        const delay = i * 0.03;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime((190 - i * 35) * pitchJitter, now + delay);
        osc.frequency.exponentialRampToValueAtTime(42, now + delay + 0.16);

        gain.gain.setValueAtTime(0.11, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.16);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.17);
      }
    }
  }
}
