import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AutonomousTaxiController,
  chooseNextDirection,
  computeDoorOpenAmount,
  computeTargetFlightAltitude,
  evalIntersectionCurve,
} from './navigation';
import { createInitialUpgrades } from './taxiEconomy';

test('chooseNextDirection never executes a U-turn and moves toward target', () => {
  const dir = chooseNextDirection(0, 0, 2, 5, 0, 0.5);
  assert.equal(dir, 1);

  const noUturn = chooseNextDirection(0, 0, 2, 0, 5, 0.5);
  assert.notEqual(noUturn, 0);
});

test('evalIntersectionCurve produces finite smooth coordinates', () => {
  const p0 = evalIntersectionCurve(0, 0, 2, 1, 0);
  const pMid = evalIntersectionCurve(0, 0, 2, 1, 0.5);
  const p1 = evalIntersectionCurve(0, 0, 2, 1, 1);
  assert.ok(Number.isFinite(p0.x) && Number.isFinite(pMid.z) && Number.isFinite(p1.yaw));
});

test('computeDoorOpenAmount opens smoothly during boarding and dropoff and stays closed otherwise', () => {
  assert.equal(computeDoorOpenAmount('cruising', 0.5), 0);
  assert.equal(computeDoorOpenAmount('en_route_dropoff', 0.5), 0);
  assert.equal(computeDoorOpenAmount('boarding', 0.5), 1);
  assert.ok(computeDoorOpenAmount('boarding', 0.12) > 0 && computeDoorOpenAmount('boarding', 0.12) < 1);
  assert.equal(computeDoorOpenAmount('dropoff', 0.5), 1);
  assert.equal(computeDoorOpenAmount('dropoff', 0.99), 0);
});

test('autonomous taxi opens door for boarding, carries passenger in cabin, opens door for dropoff, and earns money', () => {
  const controller = new AutonomousTaxiController(42, 200);
  const upgrades = createInitialUpgrades();
  const initialBalance = controller.state.balance;

  let sawDoorOpenBoarding = false;
  let sawPassengerInCabin = false;
  let sawDoorOpenDropoff = false;
  let sawCompletion = false;

  for (let i = 0; i < 2400; i++) {
    const res = controller.step(0.05, upgrades);
    if (controller.state.phase === 'boarding' && controller.state.doorOpenAmount > 0.8) {
      sawDoorOpenBoarding = true;
    }
    if (controller.state.phase === 'en_route_dropoff' && controller.state.hasPassengerInCabin) {
      sawPassengerInCabin = true;
    }
    if (controller.state.phase === 'dropoff' && controller.state.doorOpenAmount > 0.8) {
      sawDoorOpenDropoff = true;
    }
    if (res.completedOrder) {
      sawCompletion = true;
      break;
    }
  }

  assert.ok(controller.state.totalDistanceM > 100, 'Taxi should drive significant distance');
  assert.ok(sawDoorOpenBoarding, 'Passenger door must swing open during boarding');
  assert.ok(sawPassengerInCabin, 'Passenger must visibly occupy cabin while en route to dropoff');
  assert.ok(sawDoorOpenDropoff, 'Passenger door must swing open during dropoff');
  assert.ok(sawCompletion, 'Taxi should complete a full trip');
  assert.ok(controller.state.balance > initialBalance, 'Balance should increase after trip');
  assert.equal(controller.state.hasPassengerInCabin, false, 'Cabin should be empty after dropoff');
});

test('computeTargetFlightAltitude returns 0 when locked or landed and cruises airborne when unlocked', () => {
  assert.equal(
    computeTargetFlightAltitude({
      flightUnlocked: false,
      phase: 'cruising',
      onTargetSegment: false,
      distToStopM: Infinity,
      totalUpgradeLevel: 12,
    }),
    0,
  );

  assert.equal(
    computeTargetFlightAltitude({
      flightUnlocked: true,
      phase: 'boarding',
      onTargetSegment: true,
      distToStopM: 0,
      totalUpgradeLevel: 24,
    }),
    0,
  );

  const cruise = computeTargetFlightAltitude({
    flightUnlocked: true,
    phase: 'en_route_dropoff',
    onTargetSegment: false,
    distToStopM: Infinity,
    totalUpgradeLevel: 24,
  });
  assert.ok(cruise >= 9.5 && cruise <= 15.5, `Expected aerial cruise altitude, got ${cruise}`);

  const glide = computeTargetFlightAltitude({
    flightUnlocked: true,
    phase: 'en_route_pickup',
    onTargetSegment: true,
    distToStopM: 18,
    totalUpgradeLevel: 24,
  });
  assert.ok(glide > 0 && glide < cruise, 'Should descend smoothly on approach to curb');
});

test('upgraded Aero-Shuttle taxi climbs into flight during trips and lands at 0m for passenger boarding', () => {
  const controller = new AutonomousTaxiController(77, 5000);
  const aeroUpgrades = { engine: 6, chassis: 6, autopilot: 5, comfort: 5 };

  let maxAltitudeSeen = 0;
  let sawLandedBoarding = false;

  for (let i = 0; i < 2000; i++) {
    controller.step(0.05, aeroUpgrades);
    if (controller.state.altitude > maxAltitudeSeen) {
      maxAltitudeSeen = controller.state.altitude;
    }
    if (controller.state.phase === 'boarding' && controller.state.altitude === 0) {
      sawLandedBoarding = true;
    }
    if (maxAltitudeSeen > 8 && sawLandedBoarding) break;
  }

  assert.ok(maxAltitudeSeen > 8, `Expected taxi to climb above 8m, reached ${maxAltitudeSeen}`);
  assert.ok(sawLandedBoarding, 'Expected flying taxi to land cleanly at 0m for passenger boarding');
});
