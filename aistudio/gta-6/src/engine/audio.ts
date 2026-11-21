import {
  getRadioStepEvents,
  midiToFreq,
  synthesizeAcousticKick,
  synthesizeAcousticSnare,
  synthesizeCanyonImpulseResponse,
  synthesizeElectricBassNote,
  synthesizeElectricGuitarLeadNote,
  synthesizeElectricGuitarPowerChord,
  synthesizeExplosionSample,
  synthesizeMetallicCymbal,
  synthesizePhonkCowbell,
  synthesizeWeaponSample,
  type StereoPcmBuffers,
} from '../sim/audioDsp';
import {
  RADIO_STATIONS,
  WEAPON_ORDER,
  type RadioStationId,
  type VehicleKind,
  type WeaponId,
} from '../sim/types';

/**
 * Studio-grade Physical-Modeling Web Audio Engine & Multi-Station GTA Radio for Vice Horizon VI.
 * Features:
 * - Pre-baked multi-layer acoustic gunshots (ballistic crack, powder blast, pump/bolt action, shell casings)
 * - 3-stage cinematic explosions with stereo street-canyon ConvolverNode reverb
 * - Multi-cylinder V8 / Turbo car engine with 6-speed automatic gear shifts & asphalt tire screech
 * - Authentic American Wail / Yelp / Bullhorn police sirens
 * - 4 full-band GTA Radio Stations (V-ROCK Hard Rock, IRON SKULL Thrash Metal, VICE 84 Synthwave, LEONIDA Phonk)
 *   powered by Karplus-Strong plucked strings, 3-stage tube overdrive, 4x12" cabinet filtering, and acoustic drums.
 */
export class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbSendGain: GainNode | null = null;
  private radioBusGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private weaponBuffers = new Map<WeaponId, AudioBuffer>();
  private explosionBuffer: AudioBuffer | null = null;
  private kickBuffer: AudioBuffer | null = null;
  private snareBuffer: AudioBuffer | null = null;
  private hatClosedBuffer: AudioBuffer | null = null;
  private hatOpenBuffer: AudioBuffer | null = null;
  private crashBuffer: AudioBuffer | null = null;

  private guitarChordCache = new Map<string, AudioBuffer>();
  private guitarLeadCache = new Map<number, AudioBuffer>();
  private bassNoteCache = new Map<number, AudioBuffer>();
  private cowbellCache = new Map<number, AudioBuffer>();

  private muted = false;
  private paused = false;

  // Police Wail/Yelp Dual-Voice Siren
  private sirenOsc1: OscillatorNode | null = null;
  private sirenOsc2: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenPhase = 0;

  // Continuous Multi-Cylinder V8 Car Engine & Tire Screech
  private engineOscMain: OscillatorNode | null = null;
  private engineOscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private tireScreechGain: GainNode | null = null;
  private tireScreechFilter: BiquadFilterNode | null = null;
  private currentGear = 1;
  private shiftCooldown = 0;

  // GTA Radio Sequencer State
  private radioStation: RadioStationId = 'vrock';
  private radioTrackIndex = 0;
  private radioStep = 0;
  private nextStepTime = 0;
  private trackBarCount = 0;
  private unlockBound: (() => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.unlockBound = () => {
        this.unlock();
      };
      window.addEventListener('pointerdown', this.unlockBound, { passive: true });
      window.addEventListener('keydown', this.unlockBound, { passive: true });
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    this.syncMasterGain();
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
    this.syncMasterGain();
  }

  private syncMasterGain() {
    if (!this.ctx || !this.masterGain) return;
    const target = this.muted || this.paused ? 0 : 0.92;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04);
  }

  public setRadioStation(station: RadioStationId) {
    if (this.radioStation === station) return;
    this.radioStation = station;
    this.radioStep = 0;
    this.trackBarCount = 0;
    if (this.ctx && this.ctx.state === 'running') {
      this.nextStepTime = this.ctx.currentTime + 0.08;
      if (station !== 'off') {
        this.playRadioTuningSweep();
      }
    }
  }

  public nextRadioTrack(): { stationName: string; trackTitle: string } {
    const spec = RADIO_STATIONS[this.radioStation];
    this.radioTrackIndex = (this.radioTrackIndex + 1) % Math.max(1, spec.tracks.length);
    this.radioStep = 0;
    this.trackBarCount = 0;
    if (this.ctx && this.ctx.state === 'running' && this.radioStation !== 'off') {
      this.nextStepTime = this.ctx.currentTime + 0.06;
      this.playRadioTuningSweep();
    }
    return {
      stationName: `${spec.shortName} ${spec.freq}`.trim(),
      trackTitle: spec.tracks[this.radioTrackIndex] ?? spec.tracks[0],
    };
  }

  public getRadioHudInfo(): {
    radioStation: RadioStationId;
    radioStationName: string;
    radioGenre: string;
    radioTrackTitle: string;
  } {
    const spec = RADIO_STATIONS[this.radioStation];
    const idx = this.radioTrackIndex % Math.max(1, spec.tracks.length);
    return {
      radioStation: this.radioStation,
      radioStationName: spec.id === 'off' ? spec.shortName : `${spec.shortName} ${spec.freq}`,
      radioGenre: spec.genre,
      radioTrackTitle: spec.tracks[idx] ?? spec.tracks[0],
    };
  }

  public unlock() {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.initAudioGraph();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private toAudioBuffer(pcm: StereoPcmBuffers): AudioBuffer {
    const buf = this.ctx!.createBuffer(2, pcm.left.length, pcm.sampleRate);
    buf.getChannelData(0).set(pcm.left);
    buf.getChannelData(1).set(pcm.right);
    return buf;
  }

  private initAudioGraph() {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;

    // Master Limiter / Compressor + Master Gain
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.16;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted || this.paused ? 0 : 0.92;
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Street Canyon Stereo Convolution Reverb
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = this.toAudioBuffer(synthesizeCanyonImpulseResponse(sr));
    this.reverbSendGain = this.ctx.createGain();
    this.reverbSendGain.gain.value = 0.34;
    this.reverbNode.connect(this.reverbSendGain);
    this.reverbSendGain.connect(this.compressor);

    // Dedicated Radio Music Bus
    this.radioBusGain = this.ctx.createGain();
    this.radioBusGain.gain.value = 0.42;
    this.radioBusGain.connect(this.compressor);

    // White/Pink noise buffer for continuous tire slip & FM radio tuning
    const noiseLen = Math.floor(sr * 1.5);
    this.noiseBuffer = this.ctx.createBuffer(1, noiseLen, sr);
    const nData = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      nData[i] = Math.random() * 2 - 1;
    }

    // Pre-bake all 5 realistic multi-layer weapon samples + 3-stage explosion sample
    for (const w of WEAPON_ORDER) {
      this.weaponBuffers.set(w, this.toAudioBuffer(synthesizeWeaponSample(w, sr)));
    }
    this.explosionBuffer = this.toAudioBuffer(synthesizeExplosionSample(sr));

    // Pre-bake studio acoustic drum kit
    this.kickBuffer = this.toAudioBuffer(synthesizeAcousticKick(sr));
    this.snareBuffer = this.toAudioBuffer(synthesizeAcousticSnare(sr));
    this.hatClosedBuffer = this.toAudioBuffer(synthesizeMetallicCymbal(sr, 'closed'));
    this.hatOpenBuffer = this.toAudioBuffer(synthesizeMetallicCymbal(sr, 'open'));
    this.crashBuffer = this.toAudioBuffer(synthesizeMetallicCymbal(sr, 'crash'));

    this.initSiren();
    this.initVehicleEngine();
    this.nextStepTime = this.ctx.currentTime + 0.08;
  }

  private initSiren() {
    if (!this.ctx || !this.compressor || !this.reverbNode) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const shaper = this.ctx.createWaveShaper();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    // Federal Signal horn driver saturation curve
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 2.8);
    }
    shaper.curve = curve;

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.value = 620;
    osc2.frequency.value = 624;

    filter.type = 'bandpass';
    filter.frequency.value = 1050;
    filter.Q.value = 2.4;

    gain.gain.value = 0;
    osc1.connect(shaper);
    osc2.connect(shaper);
    shaper.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);
    gain.connect(this.reverbNode);

    osc1.start();
    osc2.start();
    this.sirenOsc1 = osc1;
    this.sirenOsc2 = osc2;
    this.sirenGain = gain;
  }

  private initVehicleEngine() {
    if (!this.ctx || !this.compressor || !this.noiseBuffer) return;

    // V8 Cross-plane crankshaft harmonic series (0.5x, 1x, 1.5x, 2x, 3x, 4x firing order)
    const real = new Float32Array([0, 0.4, 1.0, 0.65, 0.85, 0.45, 0.35, 0.2, 0.15]);
    const imag = new Float32Array(real.length);
    const v8Wave = this.ctx.createPeriodicWave(real, imag);

    const oscMain = this.ctx.createOscillator();
    oscMain.setPeriodicWave(v8Wave);
    oscMain.frequency.value = 38;

    const oscSub = this.ctx.createOscillator();
    oscSub.type = 'sawtooth';
    oscSub.frequency.value = 57;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    filter.Q.value = 3.2;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    oscMain.connect(filter);
    oscSub.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);

    oscMain.start();
    oscSub.start();
    this.engineOscMain = oscMain;
    this.engineOscSub = oscSub;
    this.engineFilter = filter;
    this.engineGain = gain;

    // Continuous looped tire-slip noise source gated by tireScreechGain
    const tireSrc = this.ctx.createBufferSource();
    tireSrc.buffer = this.noiseBuffer;
    tireSrc.loop = true;
    const tireFilter = this.ctx.createBiquadFilter();
    tireFilter.type = 'bandpass';
    tireFilter.frequency.value = 1650;
    tireFilter.Q.value = 6.5;
    const tireGain = this.ctx.createGain();
    tireGain.gain.value = 0;

    tireSrc.connect(tireFilter);
    tireFilter.connect(tireGain);
    tireGain.connect(this.compressor);
    if (this.reverbNode) tireGain.connect(this.reverbNode);
    tireSrc.start();

    this.tireScreechFilter = tireFilter;
    this.tireScreechGain = tireGain;
  }

  /**
   * Updates realistic V8 / Diesel engine RPM, 6-speed gearbox shifts, and tire screeching.
   */
  public updateVehicleAudio(
    dt: number,
    inVehicle: boolean,
    vehicleKind: VehicleKind | null,
    speedMs: number,
    steerAngle: number,
  ) {
    if (!this.ctx || !this.engineOscMain || !this.engineOscSub || !this.engineFilter || !this.engineGain) {
      return;
    }
    if (this.muted || this.paused || !inVehicle || !vehicleKind || this.ctx.state !== 'running') {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      this.tireScreechGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      return;
    }

    const now = this.ctx.currentTime;
    const absSpeed = Math.abs(speedMs);
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);

    // 6-speed automatic transmission gear calculation
    const gearThresholds = [0, 7, 13, 19, 25, 31];
    let targetGear = 1;
    for (let g = gearThresholds.length - 1; g >= 0; g--) {
      if (absSpeed >= gearThresholds[g]) {
        targetGear = g + 1;
        break;
      }
    }
    if (targetGear !== this.currentGear && this.shiftCooldown <= 0) {
      this.currentGear = targetGear;
      this.shiftCooldown = 0.35;
    }

    const gearMin = gearThresholds[this.currentGear - 1] ?? 0;
    const gearSpan = 7.5;
    const gearProgress = Math.max(0, Math.min(1.15, (absSpeed - gearMin) / gearSpan));

    // Base firing fundamental frequency by vehicle engine architecture
    const idleFreq =
      vehicleKind === 'sports'
        ? 44
        : vehicleKind === 'muscle'
          ? 34
          : vehicleKind === 'bus' || vehicleKind === 'tanker'
            ? 26
            : 38;
    const redlineSpan =
      vehicleKind === 'sports'
        ? 92
        : vehicleKind === 'muscle'
          ? 68
          : vehicleKind === 'bus' || vehicleKind === 'tanker'
            ? 38
            : 58;

    const shiftDip = this.shiftCooldown > 0.22 ? 0.72 : 1.0;
    const rpmFreq = (idleFreq + gearProgress * redlineSpan) * shiftDip;

    this.engineOscMain.frequency.setTargetAtTime(rpmFreq, now, 0.04);
    this.engineOscSub.frequency.setTargetAtTime(rpmFreq * 1.498, now, 0.04);
    this.engineFilter.frequency.setTargetAtTime(170 + rpmFreq * 4.4, now, 0.05);

    const engVol = 0.055 + Math.min(0.065, absSpeed * 0.0022);
    this.engineGain.gain.setTargetAtTime(engVol, now, 0.06);

    // Asphalt tire slip screech on hard high-speed turns
    if (this.tireScreechGain && this.tireScreechFilter) {
      const slip = Math.abs(steerAngle) > 0.42 && absSpeed > 11.5 ? Math.min(1, (absSpeed - 11) * 0.09) : 0;
      this.tireScreechFilter.frequency.setTargetAtTime(1520 + Math.sin(now * 28) * 190, now, 0.03);
      this.tireScreechGain.gain.setTargetAtTime(slip * 0.045, now, 0.05);
    }
  }

  public updateSiren(dt: number, wantedStars: number, nearestPoliceDist: number) {
    if (!this.ctx || !this.sirenOsc1 || !this.sirenOsc2 || !this.sirenGain) return;
    if (this.muted || this.paused || wantedStars === 0 || this.ctx.state !== 'running') {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      return;
    }

    const now = this.ctx.currentTime;
    // Switch between long WAIL and rapid tactical YELP when police are close or at 3+ stars
    const isYelp = (wantedStars >= 3 && Math.sin(now * 0.65) > 0.15) || nearestPoliceDist < 26;
    const rate = isYelp ? 18.5 : 2.1;
    this.sirenPhase += dt * rate;

    const sweep = Math.sin(this.sirenPhase);
    const freq1 = 620 + (sweep * 0.5 + 0.5) * 640;
    // Second distant cruiser slightly out of phase for realistic multi-car pursuit chorus
    const freq2 = 610 + (Math.cos(this.sirenPhase * 0.87) * 0.5 + 0.5) * 630;

    const prox = Math.max(0.08, Math.min(1, 1 - nearestPoliceDist / 115));
    this.sirenOsc1.frequency.setTargetAtTime(freq1, now, 0.025);
    this.sirenOsc2.frequency.setTargetAtTime(freq2, now, 0.03);
    this.sirenGain.gain.setTargetAtTime(0.038 * prox, now, 0.06);
  }

  /**
   * Advances the lookahead GTA Radio Station sequencer (Rock, Heavy Metal, Synthwave, Phonk).
   */
  public updateRadio() {
    if (!this.ctx || !this.radioBusGain || this.muted || this.paused || this.ctx.state !== 'running') {
      return;
    }
    if (this.radioStation === 'off') {
      return;
    }

    const now = this.ctx.currentTime;
    if (this.nextStepTime < now - 0.3) {
      this.nextStepTime = now + 0.02;
    }

    // Schedule 16th-note steps up to 110ms ahead for jitter-free timing
    while (this.nextStepTime < now + 0.11) {
      const ev = getRadioStepEvents(this.radioStation, this.radioTrackIndex, this.radioStep);
      const stepDur = 60 / ev.bpm / 4; // 16th-note duration in seconds
      this.scheduleRadioStep(ev, this.nextStepTime, stepDur);

      this.nextStepTime += stepDur;
      this.radioStep = (this.radioStep + 1) % 32;
      if (this.radioStep === 0) {
        this.trackBarCount++;
        // Automatically advance to the next riff/song variation every 8 two-bar phrases
        if (this.trackBarCount >= 8) {
          this.trackBarCount = 0;
          const spec = RADIO_STATIONS[this.radioStation];
          this.radioTrackIndex = (this.radioTrackIndex + 1) % Math.max(1, spec.tracks.length);
        }
      }
    }
  }

  private scheduleRadioStep(
    ev: ReturnType<typeof getRadioStepEvents>,
    when: number,
    stepDur: number,
  ) {
    if (!this.ctx || !this.radioBusGain) return;

    // 1. Acoustic Studio Drum Kit
    if (ev.kick && this.kickBuffer) {
      this.triggerBuffer(this.kickBuffer, when, 0.85, 1.0, this.radioBusGain, false);
    }
    if (ev.snare && this.snareBuffer) {
      this.triggerBuffer(this.snareBuffer, when, 0.78, 1.0, this.radioBusGain, true);
    }
    if (ev.hihat === 'closed' && this.hatClosedBuffer) {
      this.triggerBuffer(this.hatClosedBuffer, when, 0.52, 1.0, this.radioBusGain, false);
    } else if (ev.hihat === 'open' && this.hatOpenBuffer) {
      this.triggerBuffer(this.hatOpenBuffer, when, 0.58, 1.0, this.radioBusGain, false);
    }
    if (ev.crash && this.crashBuffer) {
      this.triggerBuffer(this.crashBuffer, when, 0.62, 1.0, this.radioBusGain, true);
    }

    // 2. Karplus-Strong Dual-Tracked Distorted Electric Guitar Power Chords (V-ROCK & IRON SKULL)
    if (ev.guitarChordMidi !== null) {
      const highGain = this.radioStation === 'skull';
      const durQuant = ev.guitarPalmMute ? 0.16 : 0.34;
      const key = `${ev.guitarChordMidi}_${ev.guitarPalmMute ? 'pm' : 'open'}_${highGain ? 'm' : 'r'}`;
      let buf = this.guitarChordCache.get(key);
      if (!buf) {
        const pcm = synthesizeElectricGuitarPowerChord(
          midiToFreq(ev.guitarChordMidi),
          durQuant,
          this.ctx.sampleRate,
          ev.guitarPalmMute,
          highGain,
        );
        buf = this.toAudioBuffer(pcm);
        this.guitarChordCache.set(key, buf);
      }
      this.triggerBuffer(buf, when, highGain ? 0.82 : 0.76, 1.0, this.radioBusGain, !ev.guitarPalmMute);
    }

    // 3. Screaming Overdriven Guitar Solo Lead (V-ROCK / IRON SKULL) or Retro Outrun Synth Lead (VICE 84)
    if (ev.leadMidi !== null) {
      if (this.radioStation === 'vice84') {
        this.scheduleSynthwaveLead(midiToFreq(ev.leadMidi), when, stepDur * ev.leadDurationSteps);
      } else {
        let buf = this.guitarLeadCache.get(ev.leadMidi);
        if (!buf) {
          const pcm = synthesizeElectricGuitarLeadNote(
            midiToFreq(ev.leadMidi),
            0.34,
            this.ctx.sampleRate,
          );
          buf = this.toAudioBuffer(pcm);
          this.guitarLeadCache.set(ev.leadMidi, buf);
        }
        this.triggerBuffer(buf, when, 0.62, 1.0, this.radioBusGain, true);
      }
    }

    // 4. Picked Ampeg Rock/Metal Bass Guitar or 808 Sub-Bass
    if (ev.bassMidi !== null) {
      let buf = this.bassNoteCache.get(ev.bassMidi);
      if (!buf) {
        const pcm = synthesizeElectricBassNote(
          midiToFreq(ev.bassMidi),
          0.28,
          this.ctx.sampleRate,
        );
        buf = this.toAudioBuffer(pcm);
        this.bassNoteCache.set(ev.bassMidi, buf);
      }
      const bassGain = this.radioStation === 'leonida' ? 0.92 : 0.72;
      this.triggerBuffer(buf, when, bassGain, 1.0, this.radioBusGain, false);
    }

    // 5. Drift-Phonk 808 Cowbell Lead Hook (LEONIDA 91.5 FM)
    if (ev.cowbellFreq !== null) {
      const roundF = Math.round(ev.cowbellFreq);
      let buf = this.cowbellCache.get(roundF);
      if (!buf) {
        buf = this.toAudioBuffer(synthesizePhonkCowbell(ev.cowbellFreq, this.ctx.sampleRate));
        this.cowbellCache.set(roundF, buf);
      }
      this.triggerBuffer(buf, when, 0.68, 1.0, this.radioBusGain, true);
    }

    // 6. Lush Detuned 80s Polysynth Chord Pad (VICE 84.3 FM)
    if (ev.synthChordMidis) {
      this.scheduleSynthwavePad(ev.synthChordMidis, when, stepDur * 7.8);
    }
  }

  private scheduleSynthwaveLead(freq: number, when: number, dur: number) {
    if (!this.ctx || !this.radioBusGain) return;
    for (const detune of [-7, 7]) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, when);
      osc.detune.setValueAtTime(detune, when);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, when);
      filter.frequency.exponentialRampToValueAtTime(950, when + dur);

      gain.gain.setValueAtTime(0.001, when);
      gain.gain.linearRampToValueAtTime(0.09, when + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, when + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.radioBusGain);
      if (this.reverbNode) gain.connect(this.reverbNode);
      osc.start(when);
      osc.stop(when + dur + 0.02);
    }
  }

  private scheduleSynthwavePad(midis: number[], when: number, dur: number) {
    if (!this.ctx || !this.radioBusGain) return;
    for (const m of midis) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(midiToFreq(m), when);
      osc.detune.setValueAtTime((m % 2 === 0 ? 1 : -1) * 8, when);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1650, when);

      gain.gain.setValueAtTime(0.001, when);
      gain.gain.linearRampToValueAtTime(0.048, when + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, when + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.radioBusGain);
      osc.start(when);
      osc.stop(when + dur + 0.02);
    }
  }

  private playRadioTuningSweep() {
    if (!this.ctx || !this.noiseBuffer || !this.compressor) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2400, now);
    bp.frequency.exponentialRampToValueAtTime(900, now + 0.14);
    bp.Q.value = 3.5;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.compressor);
    src.start(now);
    src.stop(now + 0.15);
  }

  private triggerBuffer(
    buffer: AudioBuffer,
    when: number,
    volume: number,
    playbackRate: number,
    dest: AudioNode,
    sendToReverb: boolean,
  ) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.setValueAtTime(playbackRate, when);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, when);
    src.connect(gain);
    gain.connect(dest);
    if (sendToReverb && this.reverbNode) {
      const revSend = this.ctx.createGain();
      revSend.gain.setValueAtTime(volume * 0.35, when);
      src.connect(revSend);
      revSend.connect(this.reverbNode);
    }
    src.start(when);
  }

  public playGunshot(weapon: WeaponId, distanceScale = 1) {
    if (this.muted || this.paused || !this.ctx || !this.compressor || this.ctx.state !== 'running') {
      return;
    }
    const buf = this.weaponBuffers.get(weapon);
    if (!buf) return;

    const now = this.ctx.currentTime;
    const vol = Math.max(0.08, Math.min(0.75, 0.54 * distanceScale));
    // Slight natural pitch variation per round so rapid fire never sounds robotic
    const rate = 0.94 + Math.random() * 0.12;
    this.triggerBuffer(buf, now, vol, rate, this.compressor, true);
  }

  public playExplosion(intensity = 1.0) {
    if (
      this.muted ||
      this.paused ||
      !this.ctx ||
      !this.compressor ||
      !this.explosionBuffer ||
      this.ctx.state !== 'running'
    ) {
      return;
    }
    const now = this.ctx.currentTime;
    const vol = Math.min(0.95, 0.68 * Math.max(0.6, intensity));
    const rate = intensity > 1.2 ? 0.85 : 0.96 + Math.random() * 0.08;
    this.triggerBuffer(this.explosionBuffer, now, vol, rate, this.compressor, true);
  }

  /**
   * Realistic tactile bank heist cash duffel-bag zip + crisp bill stack rustle + heavy vault lock clunk.
   */
  public playHeistCash() {
    if (this.muted || this.paused || !this.ctx || !this.compressor || !this.noiseBuffer || this.ctx.state !== 'running') {
      return;
    }
    const now = this.ctx.currentTime;

    // 1. Heavy steel vault bolt clunk
    const boltOsc = this.ctx.createOscillator();
    const boltGain = this.ctx.createGain();
    boltOsc.type = 'triangle';
    boltOsc.frequency.setValueAtTime(145, now);
    boltOsc.frequency.exponentialRampToValueAtTime(48, now + 0.09);
    boltGain.gain.setValueAtTime(0.32, now);
    boltGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    boltOsc.connect(boltGain);
    boltGain.connect(this.compressor);
    boltOsc.start(now);
    boltOsc.stop(now + 0.11);

    // 2. Crisp paper currency stack riffle & canvas duffel zipper sweep
    for (let k = 0; k < 3; k++) {
      const tStart = now + 0.05 + k * 0.075;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1800 + k * 650, tStart);
      bp.frequency.exponentialRampToValueAtTime(3600 + k * 500, tStart + 0.065);
      bp.Q.value = 3.2;

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.18, tStart);
      nGain.gain.exponentialRampToValueAtTime(0.001, tStart + 0.07);

      src.connect(bp);
      bp.connect(nGain);
      nGain.connect(this.compressor);
      src.start(tStart);
      src.stop(tStart + 0.075);
    }
  }

  public dispose() {
    if (typeof window !== 'undefined' && this.unlockBound) {
      window.removeEventListener('pointerdown', this.unlockBound);
      window.removeEventListener('keydown', this.unlockBound);
    }
    try {
      this.sirenOsc1?.stop();
      this.sirenOsc2?.stop();
      this.engineOscMain?.stop();
      this.engineOscSub?.stop();
      this.ctx?.close();
    } catch {
      // Ignore already-closed audio context
    }
    this.ctx = null;
  }
}
