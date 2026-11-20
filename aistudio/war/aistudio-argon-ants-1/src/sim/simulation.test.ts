import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, sampleSpline } from './worldGen';
import { AntSimulation } from './antSimulation';
import { CameraDirector, computeResponsiveFov } from './cameraDirector';
import type { SimulationConfig } from './types';

const DEFAULT_CONFIG: SimulationConfig = {
  timeScale: 1,
  antsPerFaction: 90,
  battleIntensity: 1,
  buildSpeed: 1,
  cameraSpeed: 1,
  cameraMode: 'auto',
  autoDiveTunnels: true,
  atmosphere: 'sunset',
  paused: false,
};

test('world generator produces distinct deterministic worlds per seed with two mounds and carved trenches', () => {
  const w1 = generateWorld(1042);
  const w2 = generateWorld(1042);
  const w3 = generateWorld(98765);

  assert.equal(w1.mounds.red.x, w2.mounds.red.x);
  assert.notEqual(w1.mounds.red.x, w3.mounds.red.x);
  assert.ok(w1.mounds.red.x < -30, 'Red mound should be on west flank');
  assert.ok(w1.mounds.black.x > 30, 'Black mound should be on east flank');

  // Anthill peak should rise significantly higher than No-Man's-Land center
  const redPeak = w1.heightAt(w1.mounds.red.x, w1.mounds.red.z);
  const centerHeight = w1.heightAt(0, 0);
  assert.ok(redPeak > centerHeight + 4.5, `Expected mound peak (${redPeak}) > center (${centerHeight}) + 4.5`);

  // Trenches should exist for both factions
  assert.equal(w1.trenches.filter((t) => t.faction === 'red').length, 2);
  assert.equal(w1.trenches.filter((t) => t.faction === 'black').length, 2);
  assert.ok(w1.initialFortifications.length >= 20, 'Should generate WWI fortifications');
});

test('underground tunnel network connects surface portals to deep chambers with valid finite spline positions', () => {
  const world = generateWorld(4242);
  assert.ok(world.tunnels.length >= 5, 'Should generate main loops, barracks shafts, and sapper tunnel');
  assert.ok(world.chambers.length >= 8, 'Should generate queen, brood, storage, and barracks chambers for both colonies');

  for (const tunnel of world.tunnels) {
    for (let i = 0; i <= 10; i++) {
      const { pos, tangent } = sampleSpline(tunnel.points, i / 10);
      assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z));
      const tLen = Math.hypot(tangent.x, tangent.y, tangent.z);
      assert.ok(tLen > 0.99 && tLen < 1.01, 'Spline tangent must be unit length');
    }
  }

  // Deep chambers must be below surface height
  for (const chamber of world.chambers) {
    const surfaceY = world.heightAt(chamber.center.x, chamber.center.z);
    assert.ok(
      chamber.center.y < surfaceY - 3,
      `Chamber ${chamber.id} (${chamber.center.y}) must sit safely below surface (${surfaceY})`,
    );
  }
});

test('ant simulation spawns both factions, advances movement/combat/construction, and sustains endless war', () => {
  const world = generateWorld(777);
  const sim = new AntSimulation(world, DEFAULT_CONFIG);
  assert.equal(sim.ants.length, DEFAULT_CONFIG.antsPerFaction * 2);

  const initialPos = sim.ants.slice(0, 10).map((a) => ({ x: a.x, y: a.y, z: a.z }));

  // Step 4 seconds of simulated time
  for (let i = 0; i < 80; i++) {
    sim.step(0.05, DEFAULT_CONFIG);
  }

  const stats = sim.getStats();
  assert.equal(stats.redAlive, DEFAULT_CONFIG.antsPerFaction);
  assert.equal(stats.blackAlive, DEFAULT_CONFIG.antsPerFaction);
  assert.ok(stats.undergroundAnts > 0, 'Tunnel workers should populate underground tunnels');

  let movedCount = 0;
  for (let i = 0; i < 10; i++) {
    const a = sim.ants[i];
    const dist = Math.hypot(a.x - initialPos[i].x, a.z - initialPos[i].z);
    if (dist > 0.05) movedCount++;
  }
  assert.ok(movedCount >= 5, 'Ants must actively move across terrain and tunnels');

  // Verify population resizing works dynamically
  sim.step(0.05, { ...DEFAULT_CONFIG, antsPerFaction: 120 });
  assert.equal(sim.ants.length, 240);
});

test('camera director handles outdoor clearance, underground tunnel cruise, and portrait/landscape FOV', () => {
  const world = generateWorld(2026);
  const director = new CameraDirector(world);
  const hotspot = { x: 0, y: world.heightAt(0, 0), z: 0, kind: 'battle' as const };

  assert.ok(computeResponsiveFov(0.46) > computeResponsiveFov(1.6), 'Portrait mobile FOV should be wider than desktop landscape');

  // Test outdoor panorama clearance
  const panoCfg: SimulationConfig = { ...DEFAULT_CONFIG, cameraMode: 'panorama' };
  for (let i = 0; i < 40; i++) {
    const frame = director.update(0.05, 16 / 9, panoCfg, hotspot);
    const groundY = world.heightAt(frame.position.x, frame.position.z);
    assert.ok(frame.position.y >= groundY + 1.0, 'Outdoor panorama must never clip below ground');
  }

  // Test underground tunnel flight mode
  const tunnelCfg: SimulationConfig = { ...DEFAULT_CONFIG, cameraMode: 'tunnels' };
  let lastFrame = director.update(0.05, 9 / 16, tunnelCfg, hotspot);
  for (let i = 0; i < 60; i++) {
    lastFrame = director.update(0.05, 9 / 16, tunnelCfg, hotspot);
  }
  assert.ok(lastFrame.undergroundFactor > 0.7, 'Tunnels mode should transition undergroundFactor near 1');
  assert.ok(Number.isFinite(lastFrame.position.x) && Number.isFinite(lastFrame.lookAt.y));
});
