import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOMES,
  BIOME_SEGMENT_LENGTH,
  getBiomeAtDistance,
  getTrackPointAtS,
  getTerrainHeightAt,
  getTrainCarPositions,
  formatTelemetry,
  clampFreeCamDistance,
  clampFreeCamPitch,
  computeSphericalCameraOffset,
  MIN_FREE_CAM_DISTANCE,
  MAX_FREE_CAM_DISTANCE,
} from './train-sim';

test('getBiomeAtDistance cycles through biomes in auto mode and locks in manual mode', () => {
  const b0 = getBiomeAtDistance(20, 'auto');
  assert.equal(b0.primary.id, 'city');
  assert.equal(b0.blend, 0);

  const b1 = getBiomeAtDistance(BIOME_SEGMENT_LENGTH + 30, 'auto');
  assert.equal(b1.primary.id, 'village');

  const b2 = getBiomeAtDistance(BIOME_SEGMENT_LENGTH * 2 + 30, 'auto');
  assert.equal(b2.primary.id, 'forest');

  const b3 = getBiomeAtDistance(BIOME_SEGMENT_LENGTH * 3 + 30, 'auto');
  assert.equal(b3.primary.id, 'mountain');

  const locked = getBiomeAtDistance(50, 'mountain');
  assert.equal(locked.primary.id, 'mountain');
  assert.equal(locked.secondary.id, 'mountain');
  assert.equal(locked.blend, 0);
});

test('getTrackPointAtS produces continuous finite coordinates and bounded banking', () => {
  for (let s = 0; s <= 1500; s += 25) {
    const pt = getTrackPointAtS(s, 'auto');
    assert.ok(Number.isFinite(pt.x), `x should be finite at s=${s}`);
    assert.ok(Number.isFinite(pt.y), `y should be finite at s=${s}`);
    assert.equal(pt.z, s);
    assert.ok(pt.banking >= -0.15 && pt.banking <= 0.15, `banking out of bounds: ${pt.banking}`);
    assert.ok(pt.y >= 0.5, `elevation should stay above ground floor: ${pt.y}`);
  }
});

test('getTerrainHeightAt keeps roadbed clear of the rails', () => {
  const s = 420;
  const track = getTrackPointAtS(s, 'forest');
  const onTrack = getTerrainHeightAt(track.x, s, 'forest');
  assert.ok(onTrack.height <= track.y, 'Terrain on track center must never clip above rail height');
  assert.equal(onTrack.distFromTrack, 0);

  const trackMtn = getTrackPointAtS(s, 'mountain');
  const offTrack = getTerrainHeightAt(trackMtn.x + 35, s, 'mountain');
  assert.ok(Number.isFinite(offTrack.height));
  assert.ok(Math.abs(offTrack.distFromTrack - 35) < 1e-6);
});

test('getTrainCarPositions spaces locomotive and wagons accurately', () => {
  const cars = getTrainCarPositions(500, 4, 11.5, 10.2, 1.4);
  assert.equal(cars.length, 5); // 1 locomotive + 4 wagons
  assert.equal(cars[0], 500);
  for (let i = 1; i < cars.length; i++) {
    assert.ok(cars[i] < cars[i - 1], 'Each following car must have a smaller longitudinal s coordinate');
  }
});

test('formatTelemetry formats speed, distance and altitude properly', () => {
  const t = formatTelemetry(142.4, 2450, 8.5);
  assert.equal(t.speedText, '142');
  assert.equal(t.distanceKmText, '2.45');
  assert.ok(t.altitudeText.endsWith(' м'));
});

test('free camera spherical math supports unrestricted 360 yaw and clamped zoom/pitch', () => {
  assert.equal(clampFreeCamDistance(1), MIN_FREE_CAM_DISTANCE);
  assert.equal(clampFreeCamDistance(500), MAX_FREE_CAM_DISTANCE);
  assert.equal(clampFreeCamDistance(45), 45);

  // Full 360 degree rotation (2*PI) returns to same offset
  const p0 = computeSphericalCameraOffset(0.5, 0.4, 30);
  const p360 = computeSphericalCameraOffset(0.5 + Math.PI * 2, 0.4, 30);
  assert.ok(Math.abs(p0.dx - p360.dx) < 1e-6);
  assert.ok(Math.abs(p0.dy - p360.dy) < 1e-6);
  assert.ok(Math.abs(p0.dz - p360.dz) < 1e-6);

  // Radius matches clamped distance
  const radius = Math.hypot(p0.dx, p0.dy, p0.dz);
  assert.ok(Math.abs(radius - 30) < 1e-6);
  assert.ok(clampFreeCamPitch(3.0) <= 1.48);
});
