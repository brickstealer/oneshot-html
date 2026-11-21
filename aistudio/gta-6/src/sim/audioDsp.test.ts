import assert from 'node:assert/strict';
import test from 'node:test';
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
  synthesizeWeaponSample,
} from './audioDsp';
import { WEAPON_ORDER } from './types';

function computeRms(buf: Float32Array, startFrac = 0, endFrac = 1): number {
  const s = Math.floor(buf.length * startFrac);
  const e = Math.max(s + 1, Math.floor(buf.length * endFrac));
  let sumSq = 0;
  for (let i = s; i < e; i++) {
    assert.ok(Number.isFinite(buf[i]), `Sample at index ${i} must be finite`);
    assert.ok(Math.abs(buf[i]) <= 1.05, `Sample at index ${i} out of bounds: ${buf[i]}`);
    sumSq += buf[i] * buf[i];
  }
  return Math.sqrt(sumSq / (e - s));
}

test('Karplus-Strong electric guitar power chord produces stereo dual-tracked overdrive and palm-mute decay', () => {
  const sr = 24000;
  const e2 = midiToFreq(40); // E2 = 82.41 Hz
  const openChord = synthesizeElectricGuitarPowerChord(e2, 0.45, sr, false, true);
  const palmMuteChord = synthesizeElectricGuitarPowerChord(e2, 0.45, sr, true, true);

  const openTailRms = computeRms(openChord.left, 0.5, 0.9);
  const pmTailRms = computeRms(palmMuteChord.left, 0.5, 0.9);
  const openAttackRms = computeRms(openChord.left, 0.02, 0.2);

  assert.ok(openAttackRms > 0.08, 'Open power chord should have strong overdriven energy');
  assert.ok(openTailRms > pmTailRms * 2.2, 'Open power chord should sustain much longer than palm-muted chug');

  // Verify true stereo dual-tracking (left and right channels are distinct)
  let diffSum = 0;
  for (let i = 0; i < openChord.left.length; i++) {
    diffSum += Math.abs(openChord.left[i] - openChord.right[i]);
  }
  assert.ok(diffSum / openChord.left.length > 0.01, 'Dual-tracked stereo guitar L and R channels must differ');
});

test('Lead electric guitar, bass guitar, and studio acoustic drum kit buffers synthesize clean audio', () => {
  const sr = 24000;
  const lead = synthesizeElectricGuitarLeadNote(midiToFreq(64), 0.35, sr);
  const bass = synthesizeElectricBassNote(midiToFreq(28), 0.35, sr);
  const kick = synthesizeAcousticKick(sr);
  const snare = synthesizeAcousticSnare(sr);
  const hat = synthesizeMetallicCymbal(sr, 'closed');
  const crash = synthesizeMetallicCymbal(sr, 'crash');

  assert.ok(computeRms(lead.left) > 0.05);
  assert.ok(computeRms(bass.left) > 0.05);
  assert.ok(computeRms(kick.left, 0, 0.3) > 0.12);
  assert.ok(computeRms(snare.left, 0, 0.3) > 0.08);
  assert.ok(computeRms(hat.left) > 0.01);
  assert.ok(computeRms(crash.left) > 0.01);
});

test('All 5 weapon gunshot buffers, explosion buffer, and street canyon impulse response are finite and punchy', () => {
  const sr = 24000;
  for (const w of WEAPON_ORDER) {
    const sample = synthesizeWeaponSample(w, sr);
    const attackRms = computeRms(sample.left, 0, 0.25);
    assert.ok(attackRms > 0.08, `Weapon ${w} sample should have strong transient punch`);
  }

  const explosion = synthesizeExplosionSample(sr);
  assert.ok(computeRms(explosion.left, 0, 0.4) > 0.15, 'Explosion sample should have heavy blast energy');

  const canyonIr = synthesizeCanyonImpulseResponse(sr);
  const earlyRms = computeRms(canyonIr.left, 0, 0.2);
  const lateRms = computeRms(canyonIr.left, 0.7, 1.0);
  assert.ok(earlyRms > lateRms * 2.0, 'Canyon impulse response must decay naturally over time');
});

test('Multi-station GTA radio pattern sequencer generates distinct rock, metal, synthwave, and phonk grooves', () => {
  let vrockChords = 0;
  let skullDoubleKicks = 0;
  let viceSynths = 0;
  let leonidaCowbells = 0;

  for (let step = 0; step < 32; step++) {
    const vr = getRadioStepEvents('vrock', 0, step);
    if (vr.guitarChordMidi !== null) vrockChords++;

    const sk = getRadioStepEvents('skull', 0, step);
    if (sk.kick) skullDoubleKicks++;

    const v84 = getRadioStepEvents('vice84', 0, step);
    if (v84.synthChordMidis !== null) viceSynths++;

    const leo = getRadioStepEvents('leonida', 0, step);
    if (leo.cowbellFreq !== null) leonidaCowbells++;

    const off = getRadioStepEvents('off', 0, step);
    assert.equal(off.kick, false);
    assert.equal(off.guitarChordMidi, null);
  }

  assert.ok(vrockChords >= 12, 'V-ROCK should trigger distorted guitar power chords');
  assert.ok(skullDoubleKicks >= 18, 'IRON SKULL should trigger rapid double-bass metal kicks');
  assert.ok(viceSynths >= 4, 'VICE 84 should trigger lush synthwave chord pads');
  assert.ok(leonidaCowbells >= 14, 'LEONIDA BASS should trigger drift-phonk cowbell hooks');
});
