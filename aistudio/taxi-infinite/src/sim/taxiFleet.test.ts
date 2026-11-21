import test from 'node:test';
import assert from 'node:assert/strict';
import { AutonomousTaxiFleet } from './taxiFleet';

test('peer taxi fleet spawns a dense mix of ground taxis and flying Aero-Shuttles around hero', () => {
  const fleet = new AutonomousTaxiFleet(28, 7742);
  assert.equal(fleet.agents.length, 28);

  const aeroCount = fleet.agents.filter((a) => a.isAero).length;
  const groundCount = fleet.agents.filter((a) => !a.isAero).length;
  const onHeroAvenue = fleet.agents.filter((a) => a.gx === 0).length;
  assert.ok(aeroCount >= 8, `Expected multiple flying peer taxis, got ${aeroCount}`);
  assert.ok(groundCount >= 14, `Expected multiple ground peer taxis, got ${groundCount}`);
  assert.ok(onHeroAvenue >= 8, `Expected busy peer taxis directly on hero avenue, got ${onHeroAvenue}`);
  assert.ok(fleet.getActiveCount(0.7) >= 22);
});

test('peer taxis autonomously open doors, board/drop off passengers, fly, and complete trips', () => {
  const fleet = new AutonomousTaxiFleet(28, 991);

  let sawDoorOpen = false;
  let sawAeroAirborne = false;
  let sawAeroLandedForStop = false;

  for (let i = 0; i < 600; i++) {
    fleet.step({
      dt: 0.05,
      heroX: 0,
      heroZ: -i * 0.4,
      heroAltitude: 0,
      trafficDensity: 0.8,
    });

    for (const a of fleet.agents) {
      if (a.doorOpenAmount > 0.7) sawDoorOpen = true;
      if (a.isAero && a.altitude > 6) sawAeroAirborne = true;
      if (a.isAero && (a.phase === 'boarding' || a.phase === 'dropoff') && a.altitude === 0) {
        sawAeroLandedForStop = true;
      }
    }
  }

  assert.ok(sawDoorOpen, 'At least one peer taxi must swing open its passenger door');
  assert.ok(sawAeroAirborne, 'Flying peer Aero-Shuttles must soar above the avenues');
  assert.ok(sawAeroLandedForStop, 'Flying peer Aero-Shuttles must land cleanly to pick up/drop off passengers');
  assert.ok(fleet.totalFleetTrips >= 2, `Expected peer taxis to complete multiple trips, got ${fleet.totalFleetTrips}`);
});
