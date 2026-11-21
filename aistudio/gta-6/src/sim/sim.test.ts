import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHUNK_SIZE,
  chunkHasBank,
  distToRoadCenter,
  formatTimeOfDay,
  getBankEntryPosition,
  getBiomeAt,
  hash2D,
  isOnRoad,
  worldToChunk,
} from './biomes';
import {
  calculateExplosionDamage,
  computeAdaptiveFov,
  getPoliceBudget,
  heatToWantedStars,
  selectNextAIAction,
  selectOptimalWeapon,
  shortestAngleDelta,
} from './aiLogic';

test('procedural biome generator is deterministic and produces all 5 biomes across the infinite world', () => {
  const seen = new Set<string>();
  for (let cx = -12; cx <= 12; cx++) {
    for (let cz = -12; cz <= 12; cz++) {
      const b1 = getBiomeAt(cx, cz, 'auto');
      const b2 = getBiomeAt(cx, cz, 'auto');
      assert.equal(b1, b2);
      seen.add(b1);
    }
  }
  assert.equal(seen.has('downtown'), true);
  assert.equal(seen.has('beach'), true);
  assert.equal(seen.has('everglades'), true);
  assert.equal(seen.has('desert'), true);
  assert.equal(seen.has('port'), true);
});

test('spawn chunk guarantees downtown biome and a nearby robbable bank', () => {
  assert.equal(getBiomeAt(0, 0, 'auto'), 'downtown');
  assert.equal(getBiomeAt(1, 0, 'auto'), 'beach');
  assert.equal(chunkHasBank(0, 0, 'downtown'), true);
  const bankPos = getBankEntryPosition(0, 0);
  assert.ok(bankPos.x > 8 && bankPos.x < CHUNK_SIZE);
  assert.ok(bankPos.z > 8 && bankPos.z < CHUNK_SIZE);
});

test('biome lock overrides procedural biome selection', () => {
  assert.equal(getBiomeAt(0, 0, 'desert'), 'desert');
  assert.equal(getBiomeAt(5, -3, 'everglades'), 'everglades');
});

test('road and chunk coordinate utilities handle negative coordinates accurately', () => {
  assert.deepEqual(worldToChunk(10, 10), { cx: 0, cz: 0 });
  assert.deepEqual(worldToChunk(-1, -1), { cx: -1, cz: -1 });
  assert.equal(isOnRoad(0, 20), true);
  assert.equal(isOnRoad(-64, 30), true);
  assert.equal(isOnRoad(32, 32), false);
  assert.equal(distToRoadCenter(-64), 0);
  assert.ok(hash2D(3, -5) >= 0 && hash2D(3, -5) < 1);
});

test('wanted star escalation and police response budgets scale monotonically from 0 to 5 stars', () => {
  assert.equal(heatToWantedStars(0), 0);
  assert.equal(heatToWantedStars(15), 1);
  assert.equal(heatToWantedStars(35), 2);
  assert.equal(heatToWantedStars(55), 3);
  assert.equal(heatToWantedStars(75), 4);
  assert.equal(heatToWantedStars(95), 5);

  const b0 = getPoliceBudget(0);
  const b3 = getPoliceBudget(3);
  const b5 = getPoliceBudget(5);
  assert.equal(b0.cruisers, 0);
  assert.equal(b3.helicopters, 1);
  assert.ok(b5.swatVans >= 2 && b5.cruisers >= b3.cruisers);
});

test('AI decision engine prioritizes bank heists, sabotage, combat, and carjacking cleanly', () => {
  const heist = selectNextAIAction({
    currentAction: 'driving',
    inVehicle: true,
    wantedStars: 1,
    chaosLevel: 0.8,
    health: 100,
    nearbyBankDist: 18,
    nearbyBankReady: true,
    nearbyCivilianCarDist: 10,
    nearbyTankerOrBusDist: 60,
    nearestPoliceDist: 80,
    stateTimer: 5,
    randomRoll: 0.2,
  });
  assert.equal(heist, 'robbing_bank');

  const sabotage = selectNextAIAction({
    currentAction: 'driving',
    inVehicle: true,
    wantedStars: 0,
    chaosLevel: 0.9,
    health: 100,
    nearbyBankDist: 90,
    nearbyBankReady: false,
    nearbyCivilianCarDist: 10,
    nearbyTankerOrBusDist: 20,
    nearestPoliceDist: 90,
    stateTimer: 5,
    randomRoll: 0.1,
  });
  assert.equal(sabotage, 'sabotage');

  const seekCar = selectNextAIAction({
    currentAction: 'roaming',
    inVehicle: false,
    wantedStars: 0,
    chaosLevel: 0.5,
    health: 100,
    nearbyBankDist: 100,
    nearbyBankReady: false,
    nearbyCivilianCarDist: 16,
    nearbyTankerOrBusDist: 90,
    nearestPoliceDist: 90,
    stateTimer: 3,
    randomRoll: 0.5,
  });
  assert.equal(seekCar, 'seeking_car');

  assert.equal(selectOptimalWeapon('sabotage', 22, true, 2), 'rpg');
  assert.equal(selectOptimalWeapon('combat', 9, false, 2), 'shotgun');
});

test('explosion damage falls off smoothly and adaptive FOV widens for vertical mobile screens', () => {
  assert.equal(calculateExplosionDamage(0, 18, 200), 200);
  assert.equal(calculateExplosionDamage(9, 18, 200), 50);
  assert.equal(calculateExplosionDamage(20, 18, 200), 0);

  const desktopFov = computeAdaptiveFov(56, 1440 / 900, 0.5, 'chase');
  const mobileFov = computeAdaptiveFov(56, 390 / 844, 0.5, 'chase');
  assert.ok(mobileFov > desktopFov + 8, `Expected portrait FOV (${mobileFov}) > desktop FOV (${desktopFov})`);
  assert.equal(formatTimeOfDay(17.5), '17:30');
  assert.ok(Math.abs(shortestAngleDelta(0.1, Math.PI * 2 - 0.1) + 0.2) < 1e-6);
});
