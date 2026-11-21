import type { RadioStationId, WeaponId } from './types';

export interface StereoPcmBuffers {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

export interface RadioStepTrigger {
  bpm: number;
  kick: boolean;
  snare: boolean;
  hihat: 'closed' | 'open' | null;
  crash: boolean;
  cowbellFreq: number | null;
  guitarChordMidi: number | null;
  guitarPalmMute: boolean;
  guitarDurationSteps: number;
  leadMidi: number | null;
  leadDurationSteps: number;
  bassMidi: number | null;
  bassDurationSteps: number;
  synthChordMidis: number[] | null;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Deterministic PRNG for repeatable high-resolution acoustic sample generation.
 */
function createRng(seed: number): () => number {
  let s = seed >>> 0 || 123456789;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/**
 * Synthesizes a single Karplus-Strong plucked guitar/bass string into a mono Float32Array.
 */
function pluckKarplusStrongString(
  freq: number,
  lengthSamples: number,
  sampleRate: number,
  damping: number,
  pickPosition: number,
  seed: number,
): Float32Array {
  const out = new Float32Array(lengthSamples);
  const period = Math.max(8, Math.round(sampleRate / Math.max(25, freq)));
  const ring = new Float32Array(period);
  const rng = createRng(seed);

  // Pluck excitation: combine plectrum click transient with triangular string displacement
  const combDelay = Math.max(2, Math.floor(period * pickPosition));
  for (let i = 0; i < period; i++) {
    const phase = i / period;
    const tri = phase < pickPosition ? phase / pickPosition : (1 - phase) / (1 - pickPosition);
    const noise = rng() * 0.65;
    ring[i] = tri * 0.55 + noise;
  }
  // Pick-position comb notch (authentic electric guitar bridge/neck pickup tone)
  for (let i = period - 1; i >= combDelay; i--) {
    ring[i] -= ring[i - combDelay] * 0.45;
  }

  let prev = 0;
  let ptr = 0;
  for (let i = 0; i < lengthSamples; i++) {
    const curr = ring[ptr];
    // Pick attack transient boost during first 4ms
    const pickSnap = i < sampleRate * 0.004 ? rng() * 0.35 * (1 - i / (sampleRate * 0.004)) : 0;
    out[i] = curr + pickSnap;

    // Low-pass bridge reflection loop filter
    const avg = (curr + prev) * 0.5 * damping;
    prev = curr;
    ring[ptr] = avg;
    ptr = (ptr + 1) % period;
  }
  return out;
}

/**
 * Synthesizes a dual-tracked stereo Electric Guitar Power Chord (Root + Fifth + Octave)
 * driven through a 3-stage asymmetric tube amplifier overdrive and a 4x12" speaker cabinet filter.
 */
export function synthesizeElectricGuitarPowerChord(
  rootFreq: number,
  durationSec: number,
  sampleRate: number,
  palmMute: boolean,
  highGainMetal: boolean,
): StereoPcmBuffers {
  const length = Math.max(64, Math.floor(durationSec * sampleRate));
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  // Palm-muted chugs decay faster at the bridge; open power chords sustain richly
  const damping = palmMute ? 0.981 : 0.9965;
  const fifthFreq = rootFreq * 1.498307; // Equal-tempered 5th
  const octaveFreq = rootFreq * 2.0;

  // Dual-tracked stereo guitars: Left channel slightly detuned -3 cents, Right channel +3 cents
  const detuneL = 0.9982;
  const detuneR = 1.0018;

  const lRoot = pluckKarplusStrongString(rootFreq * detuneL, length, sampleRate, damping, 0.18, 101);
  const lFifth = pluckKarplusStrongString(fifthFreq * detuneL, length, sampleRate, damping, 0.21, 202);
  const lOct = pluckKarplusStrongString(octaveFreq * detuneL, length, sampleRate, damping * 0.998, 0.16, 303);

  const rRoot = pluckKarplusStrongString(rootFreq * detuneR, length, sampleRate, damping, 0.22, 404);
  const rFifth = pluckKarplusStrongString(fifthFreq * detuneR, length, sampleRate, damping, 0.17, 505);
  const rOct = pluckKarplusStrongString(octaveFreq * detuneR, length, sampleRate, damping * 0.998, 0.2, 606);

  const drive = highGainMetal ? (palmMute ? 26 : 32) : palmMute ? 15 : 20;

  // Preamp tight high-pass state & 4x12" cabinet speaker low-pass/mid-bite state
  let hpL = 0,
    prevInL = 0,
    cabLp1L = 0,
    cabLp2L = 0,
    cabThumpL = 0;
  let hpR = 0,
    prevInR = 0,
    cabLp1R = 0,
    cabLp2R = 0,
    cabThumpR = 0;

  const hpCoeff = 0.985;
  // Speaker cone roll-off around 3.6kHz
  const cabCut = Math.min(0.75, (2 * Math.PI * 3400) / sampleRate);
  const thumpCut = Math.min(0.25, (2 * Math.PI * 145) / sampleRate);

  for (let i = 0; i < length; i++) {
    const t = i / length;
    // Envelope: fast pick attack, natural palm-mute or open sustain decay
    const env =
      t < 0.008
        ? t / 0.008
        : palmMute
          ? Math.exp(-t * 7.2) * (1 - t)
          : Math.pow(1 - t, 0.48);

    const rawL = lRoot[i] * 0.52 + lFifth[i] * 0.36 + lOct[i] * 0.24;
    const rawR = rRoot[i] * 0.52 + rFifth[i] * 0.36 + rOct[i] * 0.24;

    // 1. Preamp tightener high-pass
    hpL = hpCoeff * (hpL + rawL - prevInL);
    prevInL = rawL;
    hpR = hpCoeff * (hpR + rawR - prevInR);
    prevInR = rawR;

    // 2. Asymmetric multi-stage tube preamp overdrive (adds rich 2nd & 3rd tube harmonics)
    const stage1L = Math.tanh(hpL * drive + 0.14) - Math.tanh(0.14);
    const ampL = Math.tanh(stage1L * 2.2);

    const stage1R = Math.tanh(hpR * drive - 0.14) + Math.tanh(0.14);
    const ampR = Math.tanh(stage1R * 2.2);

    // 3. 4x12" Speaker Cabinet simulation (rolls off harsh digital fizz + boosts palm-mute cabinet thump)
    cabLp1L += cabCut * (ampL - cabLp1L);
    cabLp2L += cabCut * (cabLp1L - cabLp2L);
    cabThumpL += thumpCut * (rawL - cabThumpL);

    cabLp1R += cabCut * (ampR - cabLp1R);
    cabLp2R += cabCut * (cabLp1R - cabLp2R);
    cabThumpR += thumpCut * (rawR - cabThumpR);

    const thumpWeight = palmMute ? 0.58 : 0.28;
    left[i] = (cabLp2L * 0.42 + cabThumpL * thumpWeight) * env;
    right[i] = (cabLp2R * 0.42 + cabThumpR * thumpWeight) * env;
  }

  return { left, right, sampleRate };
}

/**
 * Synthesizes a screaming Overdriven Lead Electric Guitar Note with finger vibrato & stereo delay slapback.
 */
export function synthesizeElectricGuitarLeadNote(
  freq: number,
  durationSec: number,
  sampleRate: number,
): StereoPcmBuffers {
  const length = Math.max(64, Math.floor(durationSec * sampleRate));
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  const str1 = pluckKarplusStrongString(freq, length, sampleRate, 0.9985, 0.24, 707);
  const str2 = pluckKarplusStrongString(freq * 1.003, length, sampleRate, 0.9985, 0.27, 808);

  let lp1L = 0,
    lp2L = 0;
  let lp1R = 0,
    lp2R = 0;
  const cabCut = Math.min(0.72, (2 * Math.PI * 3200) / sampleRate);

  for (let i = 0; i < length; i++) {
    const t = i / length;
    const timeSec = i / sampleRate;
    const env = t < 0.015 ? t / 0.015 : Math.pow(1 - t, 0.35);
    // Singing sustain feedback harmonic + vibrato modulation
    const vib = Math.sin(2 * Math.PI * 5.8 * timeSec) * 0.012 * Math.min(1, timeSec * 4);
    const feedback = Math.sin(2 * Math.PI * freq * (1 + vib) * timeSec) * 0.22;

    const drvL = Math.tanh((str1[i] + feedback) * 24 + 0.12);
    const drvR = Math.tanh((str2[i] + feedback) * 24 - 0.12);

    lp1L += cabCut * (drvL - lp1L);
    lp2L += cabCut * (lp1L - lp2L);
    lp1R += cabCut * (drvR - lp1R);
    lp2R += cabCut * (lp1R - lp2R);

    left[i] = lp2L * 0.36 * env;
    right[i] = lp2R * 0.36 * env;
  }
  return { left, right, sampleRate };
}

/**
 * Synthesizes a Picked Ampeg SVT Electric Bass Guitar Note.
 */
export function synthesizeElectricBassNote(
  freq: number,
  durationSec: number,
  sampleRate: number,
): StereoPcmBuffers {
  const length = Math.max(64, Math.floor(durationSec * sampleRate));
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  const str = pluckKarplusStrongString(freq, length, sampleRate, 0.996, 0.32, 909);
  let lp = 0;
  const cut = Math.min(0.45, (2 * Math.PI * 680) / sampleRate);

  for (let i = 0; i < length; i++) {
    const t = i / length;
    const timeSec = i / sampleRate;
    const env = t < 0.008 ? t / 0.008 : Math.pow(1 - t, 0.55);
    const subFundamental = Math.sin(2 * Math.PI * freq * timeSec) * 0.5;
    const grit = Math.tanh((str[i] * 4.5 + subFundamental) * 1.9);
    lp += cut * (grit - lp);
    const val = lp * 0.52 * env;
    left[i] = val;
    right[i] = val;
  }
  return { left, right, sampleRate };
}

/**
 * Synthesizes a punchy Acoustic Rock/Metal Kick Drum sample (beater click + maple shell pitch drop).
 */
export function synthesizeAcousticKick(sampleRate: number): StereoPcmBuffers {
  const dur = 0.34;
  const length = Math.floor(dur * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const rng = createRng(1111);

  let phase = 0;
  let clickLp = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    // Fast exponential pitch sweep from 165 Hz down to 44 Hz
    const freq = 44 + 125 * Math.exp(-t * 46);
    phase += (2 * Math.PI * freq) / sampleRate;
    const body = Math.sin(phase) * Math.exp(-t * 10.5);

    // Plastic/felt beater slap transient around 2.8kHz in the first 7ms
    const rawClick = (rng() * 0.7 + Math.sin(2 * Math.PI * 2650 * t)) * Math.exp(-t * 210);
    clickLp += 0.45 * (rawClick - clickLp);

    const sample = Math.tanh((body * 1.35 + clickLp * 0.65) * 1.4) * 0.72;
    left[i] = sample;
    right[i] = sample;
  }
  return { left, right, sampleRate };
}

/**
 * Synthesizes a cracking Acoustic Rock/Metal Snare Drum with dual shell modes, rimshot snap & stereo snare wires.
 */
export function synthesizeAcousticSnare(sampleRate: number): StereoPcmBuffers {
  const dur = 0.36;
  const length = Math.floor(dur * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const rngL = createRng(2222);
  const rngR = createRng(3333);

  let p1 = 0,
    p2 = 0;
  let bpL = 0,
    bpR = 0;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const f1 = 182 + 65 * Math.exp(-t * 55);
    const f2 = 334 + 90 * Math.exp(-t * 65);
    p1 += (2 * Math.PI * f1) / sampleRate;
    p2 += (2 * Math.PI * f2) / sampleRate;

    // Wooden shell transient
    const shell = (Math.sin(p1) * 0.65 + Math.sin(p2) * 0.42) * Math.exp(-t * 22);
    // Stick attack crack
    const stick = Math.sin(2 * Math.PI * 1950 * t) * Math.exp(-t * 190) * 0.45;

    // Stereo snare wires + gated studio room tail
    const wireEnv = (t < 0.01 ? t / 0.01 : Math.exp(-t * 12.5)) * 0.58;
    const nL = rngL();
    const nR = rngR();
    bpL = 0.38 * nL + 0.62 * bpL;
    bpR = 0.38 * nR + 0.62 * bpR;

    left[i] = Math.tanh((shell + stick + (nL - bpL * 0.4) * wireEnv) * 1.5) * 0.62;
    right[i] = Math.tanh((shell + stick + (nR - bpR * 0.4) * wireEnv) * 1.5) * 0.62;
  }
  return { left, right, sampleRate };
}

/**
 * Synthesizes a bronze Metallic Hi-Hat or Crash Cymbal using 6 inharmonic square-wave partial ratios.
 */
export function synthesizeMetallicCymbal(
  sampleRate: number,
  kind: 'closed' | 'open' | 'crash',
): StereoPcmBuffers {
  const dur = kind === 'closed' ? 0.095 : kind === 'open' ? 0.38 : 1.15;
  const length = Math.floor(dur * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const rngL = createRng(4444);
  const rngR = createRng(5555);

  const ratios = [205.3, 304.4, 369.6, 522.7, 540.5, 800.0];
  const baseScale = kind === 'crash' ? 1.42 : 1.75;
  let hpL = 0,
    prevL = 0;
  let hpR = 0,
    prevR = 0;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let metal = 0;
    for (let r = 0; r < ratios.length; r++) {
      const f = ratios[r] * baseScale;
      metal += Math.sin(2 * Math.PI * f * t + Math.sin(2 * Math.PI * f * 1.37 * t) * 1.6) > 0 ? 0.16 : -0.16;
    }

    const decayRate = kind === 'closed' ? 44 : kind === 'open' ? 9.5 : 3.2;
    const env = (t < 0.003 ? t / 0.003 : Math.exp(-t * decayRate));

    const inL = (metal * 0.65 + rngL() * 0.45) * env;
    const inR = (metal * 0.65 + rngR() * 0.45) * env;

    // High-pass bronze shimmer filter (>5.5kHz)
    hpL = 0.68 * (hpL + inL - prevL);
    prevL = inL;
    hpR = 0.68 * (hpR + inR - prevR);
    prevR = inR;

    const gain = kind === 'crash' ? 0.34 : 0.26;
    left[i] = hpL * gain;
    right[i] = hpR * gain;
  }
  return { left, right, sampleRate };
}

/**
 * Synthesizes an 808 Drift-Phonk Cowbell sample (dual inharmonic 540Hz / 800Hz bandpass saturated tone).
 */
export function synthesizePhonkCowbell(freq: number, sampleRate: number): StereoPcmBuffers {
  const dur = 0.24;
  const length = Math.floor(dur * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const f1 = freq;
  const f2 = freq * 1.481;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const env = t < 0.003 ? t / 0.003 : Math.exp(-t * 16.5);
    const w1 = Math.tanh(Math.sin(2 * Math.PI * f1 * t) * 3.5);
    const w2 = Math.tanh(Math.sin(2 * Math.PI * f2 * t) * 3.5);
    const s = (w1 * 0.55 + w2 * 0.45) * env * 0.38;
    left[i] = s * 0.95;
    right[i] = s * 1.05;
  }
  return { left, right, sampleRate };
}

/**
 * Synthesizes a realistic multi-layered stereo Weapon Gunshot Sample:
 * - Stage 1 (0..4ms): Supersonic ballistic N-wave crack & muzzle shockfront
 * - Stage 2 (4..110ms): Turbulent powder combustion through barrel cavity formants + tube saturation
 * - Stage 3 (55..290ms): Mechanical bolt-carrier / pump-action rack + metallic brass shell casing bounce
 */
export function synthesizeWeaponSample(weapon: WeaponId, sampleRate: number): StereoPcmBuffers {
  const dur =
    weapon === 'rpg'
      ? 0.72
      : weapon === 'shotgun'
        ? 0.44
        : weapon === 'rifle'
          ? 0.28
          : weapon === 'pistol'
            ? 0.24
            : 0.19;
  const length = Math.floor(dur * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const rngL = createRng(weapon.charCodeAt(0) * 911);
  const rngR = createRng(weapon.charCodeAt(1) * 997);

  let brownL = 0,
    brownR = 0;
  let cavity1L = 0,
    cavity2L = 0;
  let cavity1R = 0,
    cavity2R = 0;

  const isHeavy = weapon === 'shotgun' || weapon === 'rifle';
  const barrelCut =
    weapon === 'rpg'
      ? 0.08
      : weapon === 'shotgun'
        ? 0.18
        : weapon === 'rifle'
          ? 0.28
          : weapon === 'pistol'
            ? 0.32
            : 0.38;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const nL = rngL();
    const nR = rngR();

    // Turbulent brown/pink combustion noise
    brownL = (brownL + 0.065 * nL) / 1.065;
    brownR = (brownR + 0.065 * nR) / 1.065;

    if (weapon === 'rpg') {
      // RPG-7: Breech ignition thump + howling solid-rocket venturi jet stream
      const breech = Math.sin(2 * Math.PI * (120 * Math.exp(-t * 18) + 38) * t) * Math.exp(-t * 14);
      const jetEnv = t < 0.025 ? t / 0.025 : Math.exp(-t * 4.2);
      const whistle = Math.sin(2 * Math.PI * (1450 - t * 680) * t) * 0.18 * Math.exp(-t * 5.5);
      cavity1L += barrelCut * (brownL * 3.8 + nL * 0.45 - cavity1L);
      cavity1R += barrelCut * (brownR * 3.8 + nR * 0.45 - cavity1R);
      left[i] = Math.tanh((breech * 0.9 + cavity1L * jetEnv * 1.4 + whistle) * 1.8) * 0.72;
      right[i] = Math.tanh((breech * 0.9 + cavity1R * jetEnv * 1.4 + whistle) * 1.8) * 0.72;
      continue;
    }

    // 1. Supersonic ballistic N-wave crack (first 4.5ms)
    const crackEnv = Math.exp(-t * 520);
    const crack = (nL * 0.75 + Math.sin(2 * Math.PI * 2900 * t)) * crackEnv * (weapon === 'rifle' ? 1.35 : 0.95);

    // 2. Powder chamber pressure pulse (chest punch between 65Hz and 260Hz)
    const chamberFreq =
      (weapon === 'shotgun' ? 88 : weapon === 'rifle' ? 125 : weapon === 'pistol' ? 155 : 185) *
        Math.exp(-t * 32) +
      36;
    const chamberPunch = Math.sin(2 * Math.PI * chamberFreq * t) * Math.exp(-t * (isHeavy ? 22 : 34));

    // 3. Barrel blast wave turbulence
    const blastDecay = weapon === 'shotgun' ? 12.5 : weapon === 'rifle' ? 18.5 : 25.0;
    const blastEnv = Math.exp(-t * blastDecay);
    cavity1L += barrelCut * (brownL * 4.2 + nL * 0.6 - cavity1L);
    cavity2L += barrelCut * 0.55 * (cavity1L - cavity2L);
    cavity1R += barrelCut * (brownR * 4.2 + nR * 0.6 - cavity1R);
    cavity2R += barrelCut * 0.55 * (cavity1R - cavity2R);

    // 4. Mechanical action & metallic brass casing clink
    let mech = 0;
    if (weapon === 'shotgun') {
      // Tactical pump-action double rack ("ch-chk" at 165ms and 235ms)
      if (t > 0.16 && t < 0.21) {
        mech = nL * Math.exp(-(t - 0.16) * 95) * 0.38;
      } else if (t > 0.23 && t < 0.29) {
        mech = nR * Math.exp(-(t - 0.23) * 85) * 0.44;
      }
    } else {
      // Bolt carrier clack at +34ms & brass shell casing ping on asphalt at +115ms
      if (t > 0.032 && t < 0.055) {
        mech += nL * Math.exp(-(t - 0.032) * 160) * 0.28;
      }
      if (t > 0.11 && t < 0.22) {
        const dtShell = t - 0.11;
        const shellEnv = Math.exp(-dtShell * 48);
        mech +=
          (Math.sin(2 * Math.PI * 3920 * dtShell) +
            Math.sin(2 * Math.PI * 5840 * dtShell) * 0.7 +
            Math.sin(2 * Math.PI * 7310 * dtShell) * 0.5) *
          shellEnv *
          0.075;
      }
    }

    const mixL = crack + chamberPunch * 1.15 + cavity1L * blastEnv * 1.35 + mech;
    const mixR = crack + chamberPunch * 1.15 + cavity1R * blastEnv * 1.35 + mech;

    // Hard/soft asymmetric ballistic limiter for genuine impact punch
    left[i] = Math.tanh(mixL * 2.1) * 0.78;
    right[i] = Math.tanh(mixR * 2.1) * 0.78;
  }

  return { left, right, sampleRate };
}

/**
 * Synthesizes a 3-stage cinematic Explosion Sample (supersonic detonation shockfront,
 * deep seismic sub-bass drop, roaring fireball turbulence, and metallic shrapnel/glass debris).
 */
export function synthesizeExplosionSample(sampleRate: number): StereoPcmBuffers {
  const dur = 1.65;
  const length = Math.floor(dur * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const rngL = createRng(7777);
  const rngR = createRng(8888);

  let brownL = 0,
    brownR = 0;
  let fireLpL = 0,
    fireLpR = 0;
  let subPhase = 0;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const nL = rngL();
    const nR = rngR();

    brownL = (brownL + 0.04 * nL) / 1.04;
    brownR = (brownR + 0.04 * nR) / 1.04;

    // Stage 1: Initial shockwave crack (0..25ms)
    const shock = (nL * 0.9 + Math.sin(2 * Math.PI * 420 * t)) * Math.exp(-t * 110);

    // Stage 2: Deep seismic sub-bass wave (92Hz -> 20Hz)
    const subFreq = 20 + 72 * Math.exp(-t * 4.8);
    subPhase += (2 * Math.PI * subFreq) / sampleRate;
    const subWave = Math.sin(subPhase) * Math.exp(-t * 2.6) * 1.15;

    // Stage 3: Roaring turbulent fireball with 16Hz flame flutter modulation
    const flutter = 0.78 + 0.22 * Math.sin(2 * Math.PI * 16.5 * t);
    const fireCut = Math.max(0.02, 0.24 * Math.exp(-t * 1.8));
    fireLpL += fireCut * (brownL * 5.2 - fireLpL);
    fireLpR += fireCut * (brownR * 5.2 - fireLpR);
    const fireballEnv = (t < 0.015 ? t / 0.015 : Math.exp(-t * 2.1)) * flutter;

    // Stage 4: Shattering glass & metallic car debris crackles (100ms..900ms)
    let debris = 0;
    if (t > 0.08 && t < 0.95) {
      const spike = Math.abs(nL) > 0.965 ? (nL > 0 ? 1 : -1) : 0;
      debris =
        (spike * 0.45 + Math.sin(2 * Math.PI * 3150 * t) * spike * 0.3) *
        Math.exp(-(t - 0.08) * 3.4);
    }

    left[i] = Math.tanh((shock + subWave + fireLpL * fireballEnv + debris) * 1.65) * 0.84;
    right[i] = Math.tanh((shock + subWave + fireLpR * fireballEnv - debris * 0.8) * 1.65) * 0.84;
  }

  return { left, right, sampleRate };
}

/**
 * Synthesizes a 1.4-second Stereo Urban Street Canyon Impulse Response for ConvolverNode
 * (concrete building early reflections + smooth air-damped stereo canyon decay).
 */
export function synthesizeCanyonImpulseResponse(sampleRate: number): StereoPcmBuffers {
  const dur = 1.4;
  const length = Math.floor(dur * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const rngL = createRng(9001);
  const rngR = createRng(9002);

  // Distinct concrete skyscraper facade slapback reflections
  const earlyTaps = [
    { time: 0.019, gainL: 0.55, gainR: 0.25 },
    { time: 0.041, gainL: 0.22, gainR: 0.48 },
    { time: 0.068, gainL: 0.38, gainR: 0.18 },
    { time: 0.104, gainL: 0.16, gainR: 0.33 },
    { time: 0.152, gainL: 0.24, gainR: 0.21 },
  ];

  let lpL = 0,
    lpR = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const decay = Math.exp(-t * 3.8);
    // Air absorption damps high frequencies faster over distance
    const airCut = Math.max(0.05, 0.48 * Math.exp(-t * 1.6));
    lpL += airCut * (rngL() * decay - lpL);
    lpR += airCut * (rngR() * decay - lpR);
    left[i] = lpL * 0.45;
    right[i] = lpR * 0.45;
  }

  for (const tap of earlyTaps) {
    const idx = Math.floor(tap.time * sampleRate);
    const tapSpread = Math.floor(0.004 * sampleRate);
    for (let k = 0; k < tapSpread && idx + k < length; k++) {
      const w = 1 - k / tapSpread;
      left[idx + k] += rngL() * tap.gainL * w;
      right[idx + k] += rngR() * tap.gainR * w;
    }
  }

  return { left, right, sampleRate };
}

// ---------------------------------------------------------------------------
// GTA Radio Multi-Track Pattern Sequencer (32-step 16th-note bar loop)
// ---------------------------------------------------------------------------

// V-ROCK 106.6 FM (Hard Rock & Heavy Metal power-chord riffs + pentatonic solos)
const VROCK_RIFFS: {
  chords: (number | null)[];
  palmMutes: boolean[];
  lead: (number | null)[];
}[] = [
  // Track 0: "Sunset Distortion — Highway to Vice" (E5 -> G5 -> A5 -> C5/D5 driving riff)
  {
    chords: [
      40, null, 40, 40, 43, null, 40, 40, 45, null, 45, 45, 43, null, 47, null,
      40, null, 40, 40, 43, null, 40, 40, 48, null, 48, null, 50, null, 50, null,
    ],
    palmMutes: [
      false, false, true, true, false, false, true, true, false, false, true, true, false, false, false, false,
      false, false, true, true, false, false, true, true, false, false, false, false, false, false, false, false,
    ],
    lead: [
      null, null, null, null, 64, null, 67, null, 69, null, null, 71, 69, 67, 64, null,
      null, null, 76, null, 74, null, 71, null, 72, null, null, null, 74, null, 76, null,
    ],
  },
  // Track 1: "Iron Palm — Chrome & Thunder" (A5 -> F5 -> G5 -> E5 arena metal anthem)
  {
    chords: [
      45, 45, 45, null, 45, 45, 48, null, 41, 41, 41, null, 43, null, 43, null,
      45, 45, 45, null, 45, 45, 50, null, 43, null, 41, null, 40, null, 40, null,
    ],
    palmMutes: [
      true, true, false, false, true, true, false, false, true, true, false, false, false, false, false, false,
      true, true, false, false, true, true, false, false, false, false, false, false, false, false, false, false,
    ],
    lead: [
      69, null, null, 72, 74, null, 76, null, 77, null, 76, null, 74, null, 72, null,
      69, null, 72, null, 76, null, 79, null, 76, null, 74, null, 76, null, null, null,
    ],
  },
  // Track 2: "Banshee Overdrive — Full Throttle Riff" (F#5 speed-rock chugger)
  {
    chords: [
      42, null, 42, 42, 45, null, 42, 42, 47, null, 45, null, 42, 42, 40, null,
      42, null, 42, 42, 45, null, 47, null, 49, null, 47, null, 45, null, 44, null,
    ],
    palmMutes: [
      false, false, true, true, false, false, true, true, false, false, false, false, true, true, false, false,
      false, false, true, true, false, false, false, false, false, false, false, false, false, false, false, false,
    ],
    lead: [
      null, null, 66, null, 69, null, 71, null, 73, null, 71, 69, 66, null, 64, null,
      66, null, 69, null, 73, null, 76, null, 78, null, 76, null, 73, null, 71, null,
    ],
  },
];

// IRON SKULL 99.9 FM (Thrash & Industrial Drop-D Metal with double-bass drum pedal)
const SKULL_RIFFS: {
  chords: (number | null)[];
  palmMutes: boolean[];
  lead: (number | null)[];
}[] = [
  // Track 0: "Drop-D Syndicate — Chainsaw Protocol" (D2=38 Drop-D chugs + Phrygian tritone Eb2=39 / G#2=44)
  {
    chords: [
      38, 38, 38, 38, 39, null, 38, 38, 41, null, 38, 38, 44, null, 43, null,
      38, 38, 38, 38, 39, null, 41, null, 44, null, 43, null, 39, null, 38, null,
    ],
    palmMutes: [
      false, true, true, true, false, false, true, true, false, false, true, true, false, false, false, false,
      false, true, true, true, false, false, false, false, false, false, false, false, false, false, false, false,
    ],
    lead: [
      null, null, null, null, 63, null, 62, null, 65, null, 62, null, 68, null, 67, null,
      74, null, 73, null, 70, null, 68, null, 67, null, 65, null, 63, null, 62, null,
    ],
  },
  // Track 1: "Skullcrusher — 5-Star Lockdown"
  {
    chords: [
      38, null, 38, 38, 38, null, 41, null, 40, null, 38, 38, 39, null, 39, null,
      38, null, 38, 38, 44, null, 43, null, 41, null, 40, null, 39, null, 38, null,
    ],
    palmMutes: [
      false, false, true, true, true, false, false, false, false, false, true, true, false, false, false, false,
      false, false, true, true, false, false, false, false, false, false, false, false, false, false, false, false,
    ],
    lead: [
      62, null, 65, null, 68, null, 67, null, 65, null, 63, null, 62, null, null, null,
      74, null, 77, null, 80, null, 79, null, 77, null, 75, null, 74, null, null, null,
    ],
  },
  // Track 2: "Doom Foundry — Asphalt Inferno"
  {
    chords: [
      38, null, null, 38, 39, null, 38, null, 43, null, 41, null, 38, 38, 38, 38,
      38, null, null, 38, 44, null, 43, null, 41, null, 39, null, 38, 38, 38, null,
    ],
    palmMutes: [
      false, false, false, true, false, false, true, false, false, false, false, false, true, true, true, true,
      false, false, false, true, false, false, false, false, false, false, false, false, true, true, false, false,
    ],
    lead: [
      null, null, 62, null, 63, null, 67, null, 68, null, 67, null, 65, null, 63, null,
      62, null, 68, null, 74, null, 75, null, 74, null, 70, null, 68, null, 67, null,
    ],
  },
];

/**
 * Returns the exact musical trigger events for a 16th-note step (0..31) on the given GTA radio station.
 */
export function getRadioStepEvents(
  station: RadioStationId,
  trackIndex: number,
  step32: number,
): RadioStepTrigger {
  const s = ((step32 % 32) + 32) % 32;
  const tIdx = Math.abs(trackIndex) % 3;

  if (station === 'vrock') {
    const riff = VROCK_RIFFS[tIdx];
    const chord = riff.chords[s];
    const pm = riff.palmMutes[s];
    const lead = riff.lead[s];
    const kick = s % 8 === 0 || s % 8 === 3 || s === 14 || s === 30;
    const snare = s % 8 === 4 || s === 31;
    const crash = s === 0 || s === 16;
    const hihat: 'closed' | 'open' | null = s % 2 === 0 ? (s % 8 === 6 ? 'open' : 'closed') : null;

    return {
      bpm: 138,
      kick,
      snare,
      hihat,
      crash,
      cowbellFreq: null,
      guitarChordMidi: chord,
      guitarPalmMute: pm,
      guitarDurationSteps: pm ? 1.1 : 2.2,
      leadMidi: lead,
      leadDurationSteps: 2.0,
      bassMidi: chord !== null ? chord - 12 : s % 2 === 0 ? 28 : null,
      bassDurationSteps: 1.5,
      synthChordMidis: null,
    };
  }

  if (station === 'skull') {
    const riff = SKULL_RIFFS[tIdx];
    const chord = riff.chords[s];
    const pm = riff.palmMutes[s];
    const lead = riff.lead[s];
    // Thrash metal relentless double-bass kick drum on 16th-note gallops
    const kick = s % 2 === 0 || s % 8 === 3 || s % 8 === 7;
    const snare = s % 4 === 2 || s === 31;
    const crash = s === 0 || s === 8 || s === 16 || s === 24;
    const hihat: 'closed' | 'open' | null = s % 2 === 0 ? 'open' : 'closed';

    return {
      bpm: 154,
      kick,
      snare,
      hihat,
      crash,
      cowbellFreq: null,
      guitarChordMidi: chord,
      guitarPalmMute: pm,
      guitarDurationSteps: pm ? 0.95 : 2.0,
      leadMidi: lead,
      leadDurationSteps: 1.8,
      bassMidi: chord !== null ? chord - 12 : 26,
      bassDurationSteps: 1.2,
      synthChordMidis: null,
    };
  }

  if (station === 'vice84') {
    // 80s Outrun Synthwave (Am -> F -> C -> G progression with rolling 16th-note analog bass & lead)
    const roots = [33, 29, 36, 31];
    const chords = [
      [57, 60, 64, 69],
      [53, 57, 60, 65],
      [60, 64, 67, 72],
      [55, 59, 62, 67],
    ];
    const leads: (number | null)[] = [
      69, null, 72, null, 76, null, 72, null, 69, null, 67, null, 64, null, 67, null,
      65, null, 69, null, 72, null, 76, null, 74, null, 71, null, 67, null, 71, null,
    ];
    const barQuarter = Math.floor(s / 8) % 4;
    const rootMidi = roots[(barQuarter + tIdx) % 4];
    const bassMidi = s % 2 === 0 ? rootMidi : rootMidi + 12;

    return {
      bpm: 116,
      kick: s % 4 === 0,
      snare: s % 8 === 4,
      hihat: s % 2 === 1 ? 'open' : 'closed',
      crash: s === 0,
      cowbellFreq: null,
      guitarChordMidi: null,
      guitarPalmMute: false,
      guitarDurationSteps: 0,
      leadMidi: leads[(s + tIdx * 8) % 32],
      leadDurationSteps: 2.2,
      bassMidi,
      bassDurationSteps: 0.9,
      synthChordMidis: s % 8 === 0 ? chords[(barQuarter + tIdx) % 4] : null,
    };
  }

  if (station === 'leonida') {
    // Miami Drift-Phonk & 808 Street Beat (Cowbell hook + booming 808 sub + trap hi-hat rolls)
    const cowbellHook: (number | null)[] = [
      62, null, 62, 65, 69, null, 68, null, 65, null, 62, null, 60, null, 62, null,
      62, null, 62, 65, 69, null, 74, null, 72, null, 69, null, 65, null, 62, null,
    ];
    const sub808: (number | null)[] = [
      26, null, null, 26, null, null, 26, null, 29, null, null, 29, 28, null, 24, null,
      26, null, null, 26, null, null, 26, null, 31, null, null, 29, 26, null, null, null,
    ];
    const cbMidi = cowbellHook[(s + tIdx * 4) % 32];

    return {
      bpm: 130,
      kick: s % 8 === 0 || s % 8 === 3 || s % 8 === 6,
      snare: s % 8 === 4,
      hihat: 'closed',
      crash: s === 0,
      cowbellFreq: cbMidi !== null ? midiToFreq(cbMidi + 12) : null,
      guitarChordMidi: null,
      guitarPalmMute: false,
      guitarDurationSteps: 0,
      leadMidi: null,
      leadDurationSteps: 0,
      bassMidi: sub808[s],
      bassDurationSteps: 2.5,
      synthChordMidis: null,
    };
  }

  return {
    bpm: 120,
    kick: false,
    snare: false,
    hihat: null,
    crash: false,
    cowbellFreq: null,
    guitarChordMidi: null,
    guitarPalmMute: false,
    guitarDurationSteps: 0,
    leadMidi: null,
    leadDurationSteps: 0,
    bassMidi: null,
    bassDurationSteps: 0,
    synthChordMidis: null,
  };
}
