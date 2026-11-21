import type { BiomeDefinition, BiomeId } from './types';

export const BLOCK_SIZE = 72; // meters per city block / chunk
export const ROAD_WIDTH = 14; // meters total road width
export const SIDEWALK_WIDTH = 4.2; // meters on each side of road
export const LANE_OFFSET = 3.3; // meters from road centerline to right-hand lane center
export const CURB_OFFSET = 5.6; // meters from road centerline when pulled over at curb

export const BIOME_LIST: BiomeId[] = [
  'metropolis',
  'riviera',
  'canyon',
  'alpine',
  'sakura',
  'mushroom',
  'medieval',
  'rome',
  'egypt',
  'candy',
  'dino',
  'cyberpunk',
  'moon',
];

export const BIOMES: Record<BiomeId, BiomeDefinition> = {
  metropolis: {
    id: 'metropolis',
    nameRu: 'Мегаполис',
    subtitleRu: 'Деловой центр и небоскрёбы',
    accentHex: '#38bdf8',
    groundHex: 0x262a33,
    sidewalkHex: 0x646b78,
    fogTintHex: 0x8ea3bd,
    fareMultiplier: 1.25,
  },
  riviera: {
    id: 'riviera',
    nameRu: 'Ривьера',
    subtitleRu: 'Пальмовый бульвар и виллы',
    accentHex: '#14b8a6',
    groundHex: 0xd8c39e,
    sidewalkHex: 0xdcd4c4,
    fogTintHex: 0x9cd2db,
    fareMultiplier: 1.35,
  },
  canyon: {
    id: 'canyon',
    nameRu: 'Каньон',
    subtitleRu: 'Красные скалы и шоссе',
    accentHex: '#f97316',
    groundHex: 0xb76c45,
    sidewalkHex: 0xa68970,
    fogTintHex: 0xd9a074,
    fareMultiplier: 1.15,
  },
  alpine: {
    id: 'alpine',
    nameRu: 'Альпы',
    subtitleRu: 'Хвойные склоны и шале',
    accentHex: '#60a5fa',
    groundHex: 0x45634b,
    sidewalkHex: 0x7b828a,
    fogTintHex: 0xaec4d9,
    fareMultiplier: 1.3,
  },
  sakura: {
    id: 'sakura',
    nameRu: 'Сакура',
    subtitleRu: 'Старый квартал и фонари',
    accentHex: '#f472b6',
    groundHex: 0x4b5346,
    sidewalkHex: 0x7a7672,
    fogTintHex: 0xc9b4c4,
    fareMultiplier: 1.4,
  },
  mushroom: {
    id: 'mushroom',
    nameRu: 'Грибной Лес',
    subtitleRu: 'Гигантские мухоморы и неоновые споры',
    accentHex: '#ec4899',
    groundHex: 0x264236,
    sidewalkHex: 0x4a5b52,
    fogTintHex: 0x9b66b8,
    fareMultiplier: 1.55,
  },
  medieval: {
    id: 'medieval',
    nameRu: 'Долина Замков',
    subtitleRu: 'Каменные цитадели, башни и знамёна',
    accentHex: '#a78bfa',
    groundHex: 0x3b5938,
    sidewalkHex: 0x756f68,
    fogTintHex: 0x8ea1b8,
    fareMultiplier: 1.5,
  },
  rome: {
    id: 'rome',
    nameRu: 'Римская Империя',
    subtitleRu: 'Колизей, мраморные храмы и акведуки',
    accentHex: '#f59e0b',
    groundHex: 0xae9c7a,
    sidewalkHex: 0xcfc4ac,
    fogTintHex: 0xe6c79a,
    fareMultiplier: 1.65,
  },
  egypt: {
    id: 'egypt',
    nameRu: 'Пирамиды Египта',
    subtitleRu: 'Пирамиды Гизы, Сфинкс и обелиски',
    accentHex: '#eab308',
    groundHex: 0xd9a85f,
    sidewalkHex: 0xc99f65,
    fogTintHex: 0xe8bc78,
    fareMultiplier: 1.6,
  },
  candy: {
    id: 'candy',
    nameRu: 'Сладкое Королевство',
    subtitleRu: 'Гигантские леденцы, пончики и глазурь',
    accentHex: '#fb7185',
    groundHex: 0xf5b7cf,
    sidewalkHex: 0xfde8f1,
    fogTintHex: 0xf5a3c7,
    fareMultiplier: 1.7,
  },
  dino: {
    id: 'dino',
    nameRu: 'Эра Динозавров',
    subtitleRu: 'Вулканы, лава и гигантские ящеры',
    accentHex: '#ef4444',
    groundHex: 0x4a5931,
    sidewalkHex: 0x5c524a,
    fogTintHex: 0xd67c52,
    fareMultiplier: 1.75,
  },
  cyberpunk: {
    id: 'cyberpunk',
    nameRu: 'Кибер-Неон 2099',
    subtitleRu: 'Обсидиановые мегабашни и голограммы',
    accentHex: '#22d3ee',
    groundHex: 0x161829,
    sidewalkHex: 0x2b2f47,
    fogTintHex: 0x5e2c8a,
    fareMultiplier: 1.8,
  },
  moon: {
    id: 'moon',
    nameRu: 'Лунная База',
    subtitleRu: 'Кратеры, биокупола и космодром',
    accentHex: '#cbd5e1',
    groundHex: 0x6b7280,
    sidewalkHex: 0x94a3b8,
    fogTintHex: 0x3b4560,
    fareMultiplier: 1.9,
  },
};

/** Deterministic fast 32-bit hash for integer coordinates */
export function hash2D(ix: number, iz: number, seed = 1337): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Seeded PRNG (Mulberry32) */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth 2D value noise in [0, 1] */
export function valueNoise2D(x: number, z: number, seed = 42): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = fade(x - x0);
  const fz = fade(z - z0);

  const v00 = hash2D(x0, z0, seed);
  const v10 = hash2D(x0 + 1, z0, seed);
  const v01 = hash2D(x0, z0 + 1, seed);
  const v11 = hash2D(x0 + 1, z0 + 1, seed);

  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fz);
}

/** Fractal Brownian Motion 2D noise in [0, 1] */
export function fbm2D(x: number, z: number, seed = 42): number {
  const n1 = valueNoise2D(x, z, seed);
  const n2 = valueNoise2D(x * 2.03 + 17.1, z * 2.03 - 9.4, seed + 101);
  return n1 * 0.72 + n2 * 0.28;
}

const NON_METRO_BIOMES: BiomeId[] = BIOME_LIST.filter((b) => b !== 'metropolis');
const VORONOI_CELL_SIZE = 3.6;

/**
 * Maps any chunk coordinate (cx, cz) deterministically to a cohesive multi-block biome region
 * using jittered Voronoi macro-cells (~3.6x3.6 blocks = ~260m per biome district).
 * Origin neighborhood stays Metropolis; all 12 other biomes ring around nearby and tile infinitely.
 */
export function getBiomeAtChunk(cx: number, cz: number): BiomeId {
  // Keep spawn neighborhood (radius 1 around origin) in Metropolis for a dramatic skyline opening
  if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) {
    return 'metropolis';
  }

  const gx = cx / VORONOI_CELL_SIZE;
  const gz = cz / VORONOI_CELL_SIZE;
  const baseMx = Math.floor(gx);
  const baseMz = Math.floor(gz);

  let bestMx = baseMx;
  let bestMz = baseMz;
  let bestDistSq = Infinity;

  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const mx = baseMx + ox;
      const mz = baseMz + oz;
      // Keep origin macro cell centered at (0,0) so spawn skyline stays broad
      const jx = mx === 0 && mz === 0 ? 0 : (hash2D(mx, mz, 311) - 0.5) * 0.48;
      const jz = mx === 0 && mz === 0 ? 0 : (hash2D(mx, mz, 617) - 0.5) * 0.48;
      const sx = mx + 0.5 + jx;
      const sz = mz + 0.5 + jz;
      const dx = gx - sx;
      const dz = gz - sz;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestMx = mx;
        bestMz = mz;
      }
    }
  }

  if (bestMx === 0 && bestMz === 0) {
    return 'metropolis';
  }

  // Inner 5x5 macro-ring guarantees all 12 non-metropolis biomes appear right near spawn as full districts
  if (Math.abs(bestMx) <= 2 && Math.abs(bestMz) <= 2) {
    const slot = (bestMx + 2) * 5 + (bestMz + 2); // 0..24, center is 12
    const idx = slot < 12 ? slot : slot - 1; // 0..23
    return NON_METRO_BIOMES[idx % NON_METRO_BIOMES.length];
  }

  const hashIdx = Math.floor(hash2D(bestMx, bestMz, 9091) * BIOME_LIST.length);
  return BIOME_LIST[hashIdx % BIOME_LIST.length];
}

export function getBiomeAtWorld(worldX: number, worldZ: number): BiomeId {
  const cx = Math.floor(worldX / BLOCK_SIZE);
  const cz = Math.floor(worldZ / BLOCK_SIZE);
  return getBiomeAtChunk(cx, cz);
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/**
 * Deterministically locates a clean road intersection deep inside the requested biome
 * where both sides of the avenue and surrounding blocks match the target biome.
 */
export function findBiomeSpawnNode(targetBiome: BiomeId): { gx: number; gz: number } {
  if (targetBiome === 'metropolis') {
    return { gx: 0, gz: 0 };
  }

  // First pass: find a core intersection where all 6 blocks surrounding the N-S avenue match targetBiome
  for (let radius = 2; radius <= 55; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        let matches = 0;
        for (let ox = -1; ox <= 0; ox++) {
          for (let oz = -2; oz <= 0; oz++) {
            if (getBiomeAtChunk(dx + ox, dz + oz) === targetBiome) matches++;
          }
        }
        if (matches === 6 && getBiomeAtChunk(dx, dz) === targetBiome) {
          return { gx: dx, gz: dz };
        }
      }
    }
  }

  // Fallback: at least 4 matching surrounding blocks
  for (let radius = 2; radius <= 65; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (getBiomeAtChunk(dx, dz) !== targetBiome) continue;
        if (
          getBiomeAtChunk(dx - 1, dz) === targetBiome &&
          getBiomeAtChunk(dx, dz - 1) === targetBiome &&
          getBiomeAtChunk(dx - 1, dz - 1) === targetBiome
        ) {
          return { gx: dx, gz: dz };
        }
      }
    }
  }
  return { gx: 0, gz: 0 };
}
