import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOME_LIST,
  BLOCK_SIZE,
  chunkKey,
  findBiomeSpawnNode,
  getBiomeAtChunk,
  getBiomeAtWorld,
} from './worldGen';

test('origin neighborhood spawns in metropolis', () => {
  assert.equal(getBiomeAtChunk(0, 0), 'metropolis');
  assert.equal(getBiomeAtWorld(0, 0), 'metropolis');
  assert.equal(getBiomeAtWorld(10, -15), 'metropolis');
});

test('world generates all 13 distinct biomes deterministically', () => {
  assert.equal(BIOME_LIST.length, 13);
  const seen = new Set<string>();
  for (let x = -20; x <= 20; x++) {
    for (let z = -20; z <= 20; z++) {
      const b1 = getBiomeAtChunk(x, z);
      const b2 = getBiomeAtChunk(x, z);
      assert.equal(b1, b2);
      seen.add(b1);
    }
  }
  for (const biome of BIOME_LIST) {
    assert.ok(seen.has(biome), `Expected world generator to produce biome ${biome}`);
  }
});

test('findBiomeSpawnNode locates a valid chunk for every biome', () => {
  for (const biome of BIOME_LIST) {
    const node = findBiomeSpawnNode(biome);
    assert.equal(getBiomeAtChunk(node.gx, node.gz), biome);
    assert.equal(
      getBiomeAtWorld(node.gx * BLOCK_SIZE, node.gz * BLOCK_SIZE),
      biome,
    );
  }
});

test('chunkKey produces unique string keys', () => {
  assert.equal(chunkKey(-3, 7), '-3,7');
  assert.notEqual(chunkKey(1, 2), chunkKey(2, 1));
});
