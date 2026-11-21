import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignPoliceRole,
  computePoliceTacticalGoal,
  computeSeparationVector,
  computeTrafficBrakeFactor,
  resolveBuildingCollision,
  resolveVehiclePairCollision,
  type RigidVehicleBody,
} from './physicsAndNpc';

function makeCar(overrides: Partial<RigidVehicleBody> = {}): RigidVehicleBody {
  return {
    id: 1,
    kind: 'sports',
    x: 0,
    z: 0,
    vx: 0,
    vz: 15,
    heading: 0,
    speed: 15,
    length: 4.75,
    width: 2.12,
    destroyed: false,
    ...overrides,
  };
}

test('resolveVehiclePairCollision separates overlapping vehicles and transfers momentum by mass', () => {
  const sports = makeCar({ id: 1, kind: 'sports', x: 0, z: 0, vx: 0, vz: 20, speed: 20 });
  const tanker = makeCar({
    id: 2,
    kind: 'tanker',
    x: 0.4,
    z: 4.5,
    vx: 0,
    vz: 0,
    speed: 0,
    length: 11.4,
    width: 2.6,
  });

  const impact = resolveVehiclePairCollision(sports, tanker);
  assert.ok(impact !== null, 'Expected overlapping sports car and tanker to collide');
  assert.ok(impact!.closingSpeed > 15, 'Expected high closing speed on head-on hit');

  // After solver iterations, they must no longer overlap
  for (let i = 0; i < 3; i++) {
    resolveVehiclePairCollision(sports, tanker);
  }
  const secondCheck = resolveVehiclePairCollision(sports, tanker);
  assert.equal(secondCheck, null, 'Vehicles must be fully separated with zero interpenetration');

  // Heavy tanker should barely move compared to lightweight sports car
  assert.ok(sports.z < 0, 'Light sports car should be pushed backward significantly');
  assert.ok(Math.abs(tanker.z - 4.5) < Math.abs(sports.z), 'Heavy tanker should displace less than sports car');
});

test('identical-coordinate stacked police cars separate deterministically without NaN', () => {
  const copA = makeCar({ id: 10, kind: 'police', x: 12, z: 24, vx: 0, vz: 10 });
  const copB = makeCar({ id: 11, kind: 'police', x: 12, z: 24, vx: 0, vz: 10 });

  for (let i = 0; i < 4; i++) {
    resolveVehiclePairCollision(copA, copB);
  }
  assert.ok(Number.isFinite(copA.x) && Number.isFinite(copB.x));
  const dist = Math.hypot(copA.x - copB.x, copA.z - copB.z);
  assert.ok(dist >= 2.0, `Expected stacked police cruisers to separate, got dist=${dist}`);
});

test('resolveBuildingCollision pushes cars back out of solid city block interiors', () => {
  const car = makeCar({ x: 18, z: 18, vx: 12, vz: 12, speed: 17 });
  const hit = resolveBuildingCollision(car);
  assert.equal(hit, true);
  assert.ok(car.x <= 10.5 || car.z <= 10.5, `Car should be ejected back toward street curb (x=${car.x}, z=${car.z})`);
});

test('tactical police AI spreads 5 units into distinct perimeter cordon positions instead of one point', () => {
  const goals = [0, 1, 2, 3, 4].map((slot) =>
    computePoliceTacticalGoal({
      role: assignPoliceRole(slot, 'police', true),
      slotIndex: slot,
      totalPolice: 5,
      policeX: 0,
      policeZ: 0,
      playerX: 50,
      playerZ: 50,
      playerHeading: 0,
      playerSpeed: 0,
      isSwat: false,
    }),
  );

  // Every pair of police perimeter goals must be widely spaced (>= 15m apart)
  for (let i = 0; i < goals.length; i++) {
    for (let j = i + 1; j < goals.length; j++) {
      const d = Math.hypot(goals[i].targetX - goals[j].targetX, goals[i].targetZ - goals[j].targetZ);
      assert.ok(d > 15, `Expected police cordon targets ${i} and ${j} to stay spread apart, got ${d.toFixed(2)}m`);
    }
  }
});

test('separation vector pushes nearby vehicles apart and traffic brakes smoothly behind a stopped bus', () => {
  const sep = computeSeparationVector(1, 0, 0, [{ id: 2, x: 0, z: 4 }], 9.5);
  assert.ok(sep.oz < -4, 'Separation vector should steer strongly away from neighbor ahead');

  const stopped = computeTrafficBrakeFactor(0, 0, 0, 4.8, [{ x: 0, z: 9.0, length: 10.6 }]);
  assert.equal(stopped, 0, 'Civilian car should come to a full stop right behind a bus');

  const clear = computeTrafficBrakeFactor(0, 0, 0, 4.8, [{ x: 0, z: 30.0, length: 10.6 }]);
  assert.equal(clear, 1, 'Civilian car should cruise at full speed when lane is clear');
});
