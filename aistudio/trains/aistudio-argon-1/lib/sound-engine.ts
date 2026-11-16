'use client';

// Zero-dependency Web Audio API synthesizer for locomotive rumble, rail clatter, and horn

export class TrainSoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted = true;
  private masterGain: GainNode | null = null;
  private rumbleOsc: OscillatorNode | null = null;
  private rumbleGain: GainNode | null = null;
  private stepAccumulator = 0;
  private clatterIndex = 0;

  public setEnabled(enabled: boolean) {
    this.isMuted = !enabled;
    if (enabled && !this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.25;
        this.masterGain.connect(this.ctx.destination);

        // Continuous low engine hum
        this.rumbleOsc = this.ctx.createOscillator();
        this.rumbleOsc.type = 'triangle';
        this.rumbleOsc.frequency.value = 42;
        this.rumbleGain = this.ctx.createGain();
        this.rumbleGain.gain.value = 0.08;
        this.rumbleOsc.connect(this.rumbleGain);
        this.rumbleGain.connect(this.masterGain);
        this.rumbleOsc.start();
      }
    }

    if (this.ctx && this.masterGain) {
      if (this.ctx.state === 'suspended' && enabled) {
        this.ctx.resume().catch(() => {});
      }
      this.masterGain.gain.setTargetAtTime(enabled ? 0.25 : 0.0001, this.ctx.currentTime, 0.1);
    }
  }

  public update(dt: number, speedKmh: number) {
    if (this.isMuted || !this.ctx || !this.masterGain || !this.rumbleOsc || !this.rumbleGain) return;

    const normSpeed = Math.max(0, Math.min(1, speedKmh / 200));
    const now = this.ctx.currentTime;
    this.rumbleOsc.frequency.setTargetAtTime(36 + normSpeed * 38, now, 0.1);
    this.rumbleGain.gain.setTargetAtTime(0.03 + normSpeed * 0.12, now, 0.1);

    // Rail joint clatter: double-beat pattern ("ta-dum ... ta-dum")
    if (speedKmh > 5) {
      const metersPerSec = speedKmh / 3.6;
      this.stepAccumulator += metersPerSec * dt;
      const intervals = [1.8, 12.5]; // short bogie wheelbase then long rail length
      const threshold = intervals[this.clatterIndex % 2];
      if (this.stepAccumulator >= threshold) {
        this.stepAccumulator -= threshold;
        this.clatterIndex++;
        this.triggerRailClick(0.06 + normSpeed * 0.09);
      }
    }
  }

  private triggerRailClick(volume: number) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.045);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public triggerHorn() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      this.setEnabled(true);
    }
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const now = this.ctx.currentTime;
    // Classic three-chime locomotive horn chord (D#4, F#4, B4)
    const freqs = [311.13, 369.99, 493.88];
    freqs.forEach((f) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.linearRampToValueAtTime(f * 0.985, now + 1.15);

      // Low-pass filter for warm brass horn timbre
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1100;

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.11, now + 0.08);
      gain.gain.setValueAtTime(0.11, now + 0.75);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.25);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.3);
    });
  }

  public dispose() {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
