import test from 'node:test';
import assert from 'node:assert/strict';
import { SeededRandom } from './prng';
import { generateProceduralArena } from './biomes';
import { createFighter, applyRagdollImpulse, stepFighterRagdoll } from './ragdoll';
import { StuntSimulationEngine } from './engine';

test('SeededRandom produces deterministic sequences for same seed and unique sequences for different seeds', () => {
  const rngA1 = new SeededRandom('HK-1985-CHAN');
  const rngA2 = new SeededRandom('HK-1985-CHAN');
  const rngB = new SeededRandom('KOWLOON-9999-XYZ');

  const seqA1 = Array.from({ length: 8 }, () => rngA1.next());
  const seqA2 = Array.from({ length: 8 }, () => rngA2.next());
  const seqB = Array.from({ length: 8 }, () => rngB.next());

  assert.deepEqual(seqA1, seqA2);
  assert.notDeepEqual(seqA1, seqB);
});

test('generateProceduralArena builds valid platforms, pillars, and signature stunt props', () => {
  const rng = new SeededRandom('DRAGON-TEAHOUSE-01');
  const arena = generateProceduralArena(rng, 1.2, 'teahouse');

  assert.equal(arena.biome.id, 'teahouse');
  assert.ok(arena.platforms.length >= 3, 'Should have main floor + elevated platforms');
  assert.ok(arena.pillars.length >= 2, 'Should have pillars for wall-flips');
  assert.ok(arena.props.length >= 6, 'Should populate interactive props');

  const hasLadder = arena.props.some((p) => p.kind === 'ladder');
  const hasTable = arena.props.some((p) => p.kind === 'table');
  assert.equal(hasLadder, true, 'Must include signature Jackie Chan step-ladder');
  assert.equal(hasTable, true, 'Must include banquet table for vaults/flips');
});

test('Articulated ragdoll maintains bone constraints and reacts to knockback impulses', () => {
  const rng = new SeededRandom('RAGDOLL-TEST');
  const arena = generateProceduralArena(rng, 1.0);
  const fighter = createFighter('test_hero', 'hero', 500, arena.floorY, 1, rng);

  const initialX = fighter.x;
  applyRagdollImpulse(fighter, 'head', 300, -240, 0.5);
  assert.equal(fighter.action, 'ragdoll_fall');
  assert.ok(fighter.ragdollBlend > 0.5);

  for (let i = 0; i < 10; i++) {
    stepFighterRagdoll(
      fighter,
      0.016,
      i * 0.016,
      980,
      0.8,
      arena.platforms,
      arena.worldWidth,
      arena.floorY
    );
  }

  assert.ok(fighter.x > initialX, 'Fighter should translate forward from knockback impulse');
  const neckHeadDist = Math.hypot(
    fighter.nodes.head.x - fighter.nodes.neck.x,
    fighter.nodes.head.y - fighter.nodes.neck.y
  );
  assert.ok(neckHeadDist > 10 && neckHeadDist < 28, 'Bone constraint keeps head attached to neck');
});

test('StuntSimulationEngine steps autonomously, executes stunts, spawns props, and regenerates unique scenes', () => {
  const engine = new StuntSimulationEngine({ soundEnabled: false }, 'INITIAL-SEED-101');
  const initialMetrics = engine.getMetrics();
  assert.equal(initialMetrics.seed, 'INITIAL-SEED-101');
  assert.equal(initialMetrics.takeNumber, 1);

  // Run 60 autonomous simulation frames (1 second of combat)
  for (let i = 0; i < 60; i++) {
    engine.step(0.016);
  }

  const hero = engine.getHero();
  assert.ok(hero, 'Hero Master Chan must exist');
  assert.ok(hero.hp > 0, 'Hero remains alive and active');

  // Trigger signature stunt and verify stunt counter / action update
  engine.triggerHeroSignatureStunt();
  assert.ok(
    hero.action === 'wall_flip' || hero.action === 'ladder_spin',
    'Signature stunt sets hero action to wall_flip or ladder_spin'
  );

  // Spawn bonus prop
  const propCountBefore = engine.arena.props.length;
  const dropped = engine.spawnBonusProp('vase');
  assert.equal(engine.arena.props.length, propCountBefore + 1);
  assert.equal(dropped.kind, 'vase');

  // Regenerate new scene and confirm unique seed and incremented take number
  engine.regenerateScene('NEXT-SEED-202', 'night_market');
  const nextMetrics = engine.getMetrics();
  assert.equal(nextMetrics.takeNumber, 2);
  assert.equal(nextMetrics.seed, 'NEXT-SEED-202');
  assert.equal(nextMetrics.biomeId, 'night_market');
});
