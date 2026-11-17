import test from 'node:test';
import assert from 'node:assert/strict';
import { createPRNG, generateUniqueSeedString } from './prng';
import { StuntSimulationEngine } from './engine';
import {
  COMBO_CHAINS,
  computeMartialArtsPose,
  MARTIAL_STRIKES,
  MartialStrikeId,
} from './martialArtsIK';

test('PRNG generates unique seeds and deterministic sequences per seed', () => {
  const s1 = generateUniqueSeedString();
  const s2 = generateUniqueSeedString();
  assert.notEqual(s1, s2, 'Consecutive generated seeds must be unique');

  const rngA = createPRNG('HK-1985-DRAGON');
  const rngB = createPRNG('HK-1985-DRAGON');
  const rngC = createPRNG('KOWLOON-9999-TEA');

  const seqA = [rngA.next(), rngA.next(), rngA.next()];
  const seqB = [rngB.next(), rngB.next(), rngB.next()];
  const seqC = [rngC.next(), rngC.next(), rngC.next()];

  assert.deepEqual(seqA, seqB, 'Identical seeds must produce identical sequences');
  assert.notDeepEqual(seqA, seqC, 'Different seeds must produce distinct sequences');
});

test('Anatomical Two-Bone IK guarantees knees never invert or bend downward across all 17 martial arts strikes', () => {
  const strikeIds = Object.keys(MARTIAL_STRIKES) as MartialStrikeId[];
  assert.ok(strikeIds.length >= 17, 'Must have at least 17 distinct martial arts strikes');
  assert.ok(COMBO_CHAINS.length >= 5, 'Must have at least 5 multi-hit combo chains');

  for (const strikeId of strikeIds) {
    for (let step = 0; step <= 10; step++) {
      const progress = step / 10;
      const pose = computeMartialArtsPose({
        pos: { x: 0, y: 0, z: 0 },
        facingAngle: 0.4,
        gaitPhase: 1.2,
        isAttacking: true,
        strikeId,
        strikeProgress: progress,
        isStunt: false,
        stuntId: null,
        stuntProgress: 0,
      });

      const midpointL = {
        x: 0.5 * (pose.pelvisPos.x + pose.footL.x),
        y: 0.5 * (pose.pelvisPos.y + pose.footL.y),
        z: 0.5 * (pose.pelvisPos.z + pose.footL.z),
      };
      const midpointR = {
        x: 0.5 * (pose.pelvisPos.x + pose.footR.x),
        y: 0.5 * (pose.pelvisPos.y + pose.footR.y),
        z: 0.5 * (pose.pelvisPos.z + pose.footR.z),
      };

      // Whenever a foot is raised off the ground in a kick (y > 0.25), the knee MUST sit above the hip-to-foot midpoint
      if (pose.footL.y > 0.25) {
        assert.ok(
          pose.kneeL.y >= midpointL.y - 0.01,
          `Left knee inverted on raised kick ${strikeId} at progress ${progress}: kneeL.y=${pose.kneeL.y}, mid=${midpointL.y}`
        );
      }
      if (pose.footR.y > 0.25) {
        assert.ok(
          pose.kneeR.y >= midpointR.y - 0.01,
          `Right knee inverted on raised kick ${strikeId} at progress ${progress}: kneeR.y=${pose.kneeR.y}, mid=${midpointR.y}`
        );
      }

      // And on ALL frames (standing or kicking), the knee must always sit above min(hip.y, foot.y) — never drooping below the lowest endpoint!
      assert.ok(
        pose.kneeL.y >= Math.min(pose.pelvisPos.y, pose.footL.y) - 0.02,
        `Left knee drooped below min(hip, foot) on ${strikeId}`
      );
      assert.ok(
        pose.kneeR.y >= Math.min(pose.pelvisPos.y, pose.footR.y) - 0.02,
        `Right knee drooped below min(hip, foot) on ${strikeId}`
      );
    }
  }
});

test('Autonomous simulation executes diverse combo strikes, spinning kicks, and ragdoll physics', () => {
  const engine = new StuntSimulationEngine('SHAW-8888-FURY', 'courtyard', 5);
  const seenBanners = new Set<string>();

  for (let i = 0; i < 300; i++) {
    engine.step(1 / 30);
    seenBanners.add(engine.activeStuntBanner);
  }

  const stats = engine.getStats();
  assert.ok(stats.stuntsPerformed >= 1, 'Hero AI must automatically execute stunts and spinning kicks');
  assert.ok(seenBanners.size >= 4, 'Hero AI must cycle through multiple distinct strikes and stunts');

  // Verify triggerSpinningCombo works
  const stuntsBefore = engine.stuntsPerformed;
  engine.triggerSpinningCombo();
  assert.equal(engine.stuntsPerformed, stuntsBefore + 1);
  assert.equal(engine.getHero().state, 'attack');
});
