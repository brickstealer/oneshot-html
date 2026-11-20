/**
 * 100% Procedural Web Audio synthesizer for subtle autonomous taxi ambience:
 * - Warm electric/hybrid drivetrain purr proportional to vehicle speed
 * - Soft harmonic chord chimes on passenger boarding, fare payout, and upgrades
 */
export class ProceduralSoundEngine {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private enabled = false;

  public setEnabled(enable: boolean): void {
    this.enabled = enable;
    if (enable) {
      this.ensureInitialized();
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(0.28, this.ctx.currentTime, 0.12);
      }
    } else if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
    }
  }

  private ensureInitialized(): void {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    // Smooth filtered drivetrain hum
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.connect(master);

    const engGain = ctx.createGain();
    engGain.gain.value = 0.12;
    engGain.connect(filter);

    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = 58;
    osc1.connect(engGain);
    osc1.start();

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 116;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.4;
    osc2.connect(subGain);
    subGain.connect(engGain);
    osc2.start();

    this.ctx = ctx;
    this.masterGain = master;
    this.engineGain = engGain;
    this.engineOsc = osc1;
    this.engineSubOsc = osc2;
  }

  public updateEngine(speedKmh: number): void {
    if (!this.enabled || !this.ctx || !this.engineOsc || !this.engineSubOsc || !this.engineGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const norm = Math.min(1.5, speedKmh / 140);
    const freq = 52 + norm * 92;
    this.engineOsc.frequency.setTargetAtTime(freq, now, 0.08);
    this.engineSubOsc.frequency.setTargetAtTime(freq * 2.01, now, 0.08);
    this.engineGain.gain.setTargetAtTime(0.06 + Math.min(0.14, norm * 0.11), now, 0.1);
  }

  public playChime(kind: 'pickup' | 'payout' | 'upgrade'): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const notes =
      kind === 'payout'
        ? [523.25, 659.25, 783.99, 1046.5]
        : kind === 'upgrade'
          ? [440, 554.37, 659.25, 880]
          : [440, 587.33];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.065);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.22, now + idx * 0.065 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.065 + 0.34);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.36);
    });
  }

  public dispose(): void {
    if (this.engineOsc) {
      try {
        this.engineOsc.stop();
      } catch {
        // ignore
      }
    }
    if (this.engineSubOsc) {
      try {
        this.engineSubOsc.stop();
      } catch {
        // ignore
      }
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
