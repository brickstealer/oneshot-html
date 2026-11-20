import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES } from './worldGen';
import type { BiomeId } from './types';
import {
  BIOME_PASSENGERS,
  generateBiomePassenger,
  getBiomeCrowdOutfit,
} from './passengers';

const ALL_BIOMES = Object.keys(BIOMES) as BiomeId[];

describe('biome-themed crazy passengers', () => {
  it('defines at least 3 unique crazy characters for every one of the 13 biomes', () => {
    assert.equal(ALL_BIOMES.length, 13);
    for (const biome of ALL_BIOMES) {
      const roster = BIOME_PASSENGERS[biome];
      assert.ok(roster && roster.length >= 3, `Expected >=3 characters for biome ${biome}`);
      const names = new Set(roster.map((p) => p.name));
      assert.equal(names.size, roster.length, `Duplicate names in biome ${biome}`);
      for (const p of roster) {
        assert.ok(p.name.length >= 5, `Name too short for ${biome}`);
        assert.ok(p.quotes.length >= 2, `Expected >=2 quotes for ${p.name}`);
        assert.ok(p.coatHex >= 0 && p.coatHex <= 0xffffff);
        assert.ok(p.pantsHex >= 0 && p.pantsHex <= 0xffffff);
        assert.ok(p.skinHex >= 0 && p.skinHex <= 0xffffff);
      }
    }
  });

  it('generates deterministic passengers with matching archetype and Russian quotes', () => {
    for (let i = 0; i < ALL_BIOMES.length; i++) {
      const pickup = ALL_BIOMES[i];
      const dropoff = ALL_BIOMES[(i + 1) % ALL_BIOMES.length];
      const p1 = generateBiomePassenger(pickup, dropoff, 42 + i);
      const p2 = generateBiomePassenger(pickup, dropoff, 42 + i);

      assert.deepEqual(p1, p2);
      assert.equal(p1.archetype, pickup);
      assert.ok(p1.quote.includes('«') && p1.quote.includes('»'));
    }
  });

  it('injects cross-biome travel quotes when crossing into another biome', () => {
    const cross = generateBiomePassenger('egypt', 'candy', 2); // seed % 3 === 2
    assert.equal(cross.archetype, 'egypt');
    assert.ok(cross.quote.includes(BIOMES.candy.nameRu));
  });

  it('provides themed crowd outfits for every biome', () => {
    for (const biome of ALL_BIOMES) {
      const outfit = getBiomeCrowdOutfit(biome, 1);
      assert.ok(outfit.coatHex >= 0 && outfit.coatHex <= 0xffffff);
      assert.ok(outfit.skinHex >= 0 && outfit.skinHex <= 0xffffff);
    }
  });
});
