/**
 * Procedural Web Audio Synthesizer for classic Hong Kong Martial Arts SFX
 * Generates crisp kung-fu slaps, bamboo whooshes, ceramic shatters, wood splinters,
 * metallic wok clangs, and clapperboard snaps with zero external audio files.
 */
class StuntSoundEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
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

  public playWhoosh(pitchMultiplier = 1.0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const base = 180 * pitchMultiplier * (0.92 + Math.random() * 0.16);
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.35, now + 0.11);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playKungFuHit(heavy = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Classic Hong Kong cinema crisp punch transient + low body thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = heavy ? 'sawtooth' : 'square';
    const startFreq = (heavy ? 240 : 320) * (0.92 + Math.random() * 0.16);
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + (heavy ? 0.14 : 0.08));

    gain.gain.setValueAtTime(heavy ? 0.22 : 0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.15 : 0.09));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (heavy ? 0.16 : 0.1));
  }

  public playPropBreak(kind: 'ceramic' | 'wood' | 'metal' | 'bounce'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (kind === 'metal') {
      // Wok / Ladder metallic clang!
      const freqs = [520, 785, 1140];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f * (0.97 + Math.random() * 0.06), now);
        osc.frequency.exponentialRampToValueAtTime(f * 0.88, now + 0.32);
        gain.gain.setValueAtTime(0.11 / (idx + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      });
      return;
    }

    if (kind === 'ceramic') {
      // High-pitched porcelain/bottle chime burst
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const f = 1200 + Math.random() * 1400;
        osc.frequency.setValueAtTime(f, now + i * 0.02);
        osc.frequency.exponentialRampToValueAtTime(f * 0.6, now + i * 0.02 + 0.09);
        gain.gain.setValueAtTime(0.1, now + i * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.02 + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.02);
        osc.stop(now + i * 0.02 + 0.11);
      }
      return;
    }

    if (kind === 'bounce') {
      // Springy bamboo / awning boing
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.16);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
      return;
    }

    // Wood crack / splinter
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.12);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playClapperboard(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }
}

export const stuntSound = new StuntSoundEngine();
