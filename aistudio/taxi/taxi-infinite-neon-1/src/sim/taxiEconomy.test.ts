import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLIGHT_UNLOCK_TOTAL_LEVEL,
  calculateOrderFare,
  computeFareMultiplier,
  computeMaxSpeedKmh,
  createInitialUpgrades,
  formatMoney,
  getUpgradeCost,
  getVehicleClassInfo,
  isFlightUnlocked,
  pickBestAffordableUpgrade,
} from './taxiEconomy';

test('infinite upgrade costs scale monotonically without NaN or Infinity up to lv 200', () => {
  let prev = 0;
  for (let lvl = 1; lvl <= 200; lvl++) {
    const cost = getUpgradeCost('engine', lvl);
    assert.ok(Number.isFinite(cost), `Cost at level ${lvl} must be finite`);
    assert.ok(cost > prev, `Cost must strictly increase at level ${lvl}`);
    prev = cost;
  }
});

test('engine and fare multipliers increase with upgrade levels', () => {
  assert.ok(computeMaxSpeedKmh(10) > computeMaxSpeedKmh(1));
  assert.ok(computeMaxSpeedKmh(50) > computeMaxSpeedKmh(10));
  assert.ok(computeFareMultiplier(10) > computeFareMultiplier(1));
});

test('cross-biome VIP orders pay more than same-biome standard orders', () => {
  const up = createInitialUpgrades();
  const stdFare = calculateOrderFare({
    distanceM: 300,
    tier: 'standard',
    pickupBiome: 'metropolis',
    dropoffBiome: 'metropolis',
    upgrades: up,
  });
  const vipCrossFare = calculateOrderFare({
    distanceM: 300,
    tier: 'vip',
    pickupBiome: 'metropolis',
    dropoffBiome: 'sakura',
    upgrades: up,
  });
  assert.ok(vipCrossFare > stdFare * 2);
});

test('vehicle class progresses infinitely including Prestige Mk.N tiers', () => {
  const base = createInitialUpgrades();
  assert.equal(getVehicleClassInfo(base).tierIndex, 0);

  const prestige = { engine: 15, chassis: 15, autopilot: 15, comfort: 15 };
  const info = getVehicleClassInfo(prestige);
  assert.ok(info.tierIndex >= 5);
  assert.match(info.nameRu, /Апекс Престиж Mk\./);
});

test('pickBestAffordableUpgrade picks cheapest affordable track and formatMoney formats cleanly', () => {
  const up = createInitialUpgrades();
  assert.equal(pickBestAffordableUpgrade(50, up), null);
  assert.equal(pickBestAffordableUpgrade(200, up), 'engine'); // engine baseCost=120 is cheapest
  assert.equal(formatMoney(1_500_000), '$1.50M');
});

test('hover-flight mode unlocks cleanly at FLIGHT_UNLOCK_TOTAL_LEVEL (Aero-Shuttle tier)', () => {
  const starter = createInitialUpgrades();
  assert.equal(isFlightUnlocked(starter), false);

  const almost = { engine: 5, chassis: 5, autopilot: 5, comfort: 4 }; // total 19
  assert.equal(isFlightUnlocked(almost), false);

  const aero = { engine: 5, chassis: 5, autopilot: 5, comfort: 5 }; // total 20
  assert.equal(FLIGHT_UNLOCK_TOTAL_LEVEL, 20);
  assert.equal(isFlightUnlocked(aero), true);
  assert.equal(getVehicleClassInfo(aero).tierIndex, 4);
  assert.equal(getVehicleClassInfo(aero).nameRu, 'Аэро-Шаттл');
});
