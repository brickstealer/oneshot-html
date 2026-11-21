import type { BiomeFilter, BiomeId } from './types';

export const CHUNK_SIZE = 64; // Each procedural city block chunk is 64m x 64m
export const ROAD_WIDTH = 16; // 4-lane avenue along chunk edges (8m inside each side or centered at 0)
export const SIDEWALK_WIDTH = 3.5;

export interface BiomeDefinition {
  id: BiomeId;
  name: string;
  districts: string[];
  groundColor: number;
  sidewalkColor: number;
  accentColor: number;
  fogTint: number;
  treeDensity: number;
  buildingDensity: number;
}

export const BIOME_DEFS: Record<BiomeId, BiomeDefinition> = {
  downtown: {
    id: 'downtown',
    name: 'Даунтаун Вайс',
    districts: ['Финансовый квартал', 'Проспект Леонида', 'Старлайт-Плаза', 'Неон-Авеню'],
    groundColor: 0x3b4048,
    sidewalkColor: 0x9aa0a8,
    accentColor: 0xff4fa3,
    fogTint: 0xf4a27e,
    treeDensity: 0.35,
    buildingDensity: 1.0,
  },
  beach: {
    id: 'beach',
    name: 'Вайс-Бич',
    districts: ['Оушен-Драйв', 'Золотой берег', 'Пальмовый бульвар', 'Лагуна-Саут'],
    groundColor: 0xe6cb97,
    sidewalkColor: 0xd9cbb4,
    accentColor: 0x22d3ee,
    fogTint: 0xf8c39b,
    treeDensity: 0.85,
    buildingDensity: 0.55,
  },
  everglades: {
    id: 'everglades',
    name: 'Эверглейдс',
    districts: ['Болотный тракт', 'Кипарисовая протока', 'Лагерь Аллигатор', 'Мост Баю'],
    groundColor: 0x2b4534,
    sidewalkColor: 0x6b5a46,
    accentColor: 0x4ade80,
    fogTint: 0x8fb5a4,
    treeDensity: 1.0,
    buildingDensity: 0.25,
  },
  desert: {
    id: 'desert',
    name: 'Красный Каньон',
    districts: ['Шоссе 66', 'Плато Сэндстоун', 'Заправка Каньон', 'Долина Кактусов'],
    groundColor: 0xc27b4b,
    sidewalkColor: 0xa6896c,
    accentColor: 0xf59e0b,
    fogTint: 0xe8a87c,
    treeDensity: 0.45,
    buildingDensity: 0.2,
  },
  port: {
    id: 'port',
    name: 'Порт Леонида',
    districts: ['Терминал 4', 'Доки Карго', 'Нефтебаза Юг', 'Промзона Гейт'],
    groundColor: 0x46494f,
    sidewalkColor: 0x767b82,
    accentColor: 0xef4444,
    fogTint: 0xb8a39a,
    treeDensity: 0.1,
    buildingDensity: 0.75,
  },
};

/**
 * Deterministic 2D hash returning a float in [0, 1).
 */
export function hash2D(x: number, z: number, seed = 1337): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/**
 * Smooth 2D value noise in [0, 1] for organic macro-scale biome regions.
 */
export function valueNoise2D(x: number, z: number, seed = 42): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;

  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);

  const n00 = hash2D(xi, zi, seed);
  const n10 = hash2D(xi + 1, zi, seed);
  const n01 = hash2D(xi, zi + 1, seed);
  const n11 = hash2D(xi + 1, zi + 1, seed);

  const nx0 = n00 * (1 - u) + n10 * u;
  const nx1 = n01 * (1 - u) + n11 * u;
  return nx0 * (1 - v) + nx1 * v;
}

/**
 * Determines which biome occupies procedural chunk (cx, cz).
 * Keeps origin chunk (0,0) and immediate spawn strip richly varied with Downtown + Beach right nearby.
 */
export function getBiomeAt(cx: number, cz: number, lock: BiomeFilter = 'auto'): BiomeId {
  if (lock !== 'auto') return lock;

  // Guarantee vibrant Downtown at spawn (0, 0) and Beach immediately East (+X) for an iconic Vice City vista
  if (cx === 0 && cz === 0) return 'downtown';
  if (cx === 1 && Math.abs(cz) <= 1) return 'beach';
  if (cx === -1 && cz === -1) return 'port';

  // Macro-scale 2D temperature + moisture fields (chunks change biome every ~2-3 blocks so player crosses biomes frequently!)
  const scale = 0.28;
  const temp = valueNoise2D(cx * scale + 11.3, cz * scale - 7.1, 101);
  const moisture = valueNoise2D(cx * scale - 19.7, cz * scale + 23.4, 202);

  if (moisture > 0.66) {
    return temp > 0.48 ? 'beach' : 'everglades';
  }
  if (temp > 0.64 && moisture < 0.42) {
    return 'desert';
  }
  if (temp < 0.36 && moisture < 0.56) {
    return 'port';
  }
  return 'downtown';
}

export function getDistrictName(cx: number, cz: number, biome: BiomeId): string {
  const list = BIOME_DEFS[biome].districts;
  const idx = Math.floor(hash2D(cx, cz, 777) * list.length) % list.length;
  return list[idx];
}

/**
 * Checks whether a chunk contains a robbable Bank landmark.
 * Placed predictably in Downtown / Beach / Port commercial corners so banks are regularly encountered.
 */
export function chunkHasBank(cx: number, cz: number, biome: BiomeId): boolean {
  if (cx === 0 && cz === 0) return true; // Always one iconic First Leonida Bank right near spawn!
  if (biome === 'everglades') return false;
  if (biome === 'downtown') return hash2D(cx, cz, 909) < 0.38;
  if (biome === 'beach' || biome === 'port') return hash2D(cx, cz, 909) < 0.2;
  return hash2D(cx, cz, 909) < 0.14;
}

/**
 * Returns the world center coordinate of chunk (cx, cz).
 * Roads run centered along X = cx * CHUNK_SIZE and Z = cz * CHUNK_SIZE.
 * The buildable interior block sits in [cx * CHUNK_SIZE + ROAD_WIDTH/2 .. (cx+1)*CHUNK_SIZE - ROAD_WIDTH/2].
 */
export function worldToChunk(x: number, z: number): { cx: number; cz: number } {
  return {
    cx: Math.floor(x / CHUNK_SIZE),
    cz: Math.floor(z / CHUNK_SIZE),
  };
}

/**
 * Distance from a world coordinate to the nearest main road centerline.
 * Road centerlines lie at multiples of CHUNK_SIZE (x = k * 64, z = m * 64).
 */
export function distToRoadCenter(coord: number): number {
  const mod = ((coord % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return Math.min(mod, CHUNK_SIZE - mod);
}

export function isOnRoad(x: number, z: number): boolean {
  const halfRoad = ROAD_WIDTH * 0.5;
  return distToRoadCenter(x) <= halfRoad || distToRoadCenter(z) <= halfRoad;
}

/**
 * Computes the bank vault entry world position for a chunk that has a bank.
 * Positioned along the south-west corner facing the avenue sidewalk so the protagonist can approach directly.
 */
export function getBankEntryPosition(cx: number, cz: number): { x: number; z: number } {
  return {
    x: cx * CHUNK_SIZE + ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH + 4,
    z: cz * CHUNK_SIZE + ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH + 1.5,
  };
}

/**
 * Snaps a coordinate to the nearest road lane center.
 * Right-hand traffic offset is ±3.8m from centerline.
 */
export function nearestRoadAxisPosition(coord: number): number {
  return Math.round(coord / CHUNK_SIZE) * CHUNK_SIZE;
}

/**
 * Formats 0..24 float hour into HH:MM string.
 */
export function formatTimeOfDay(hourFloat: number): string {
  const normalized = ((hourFloat % 24) + 24) % 24;
  const hours = Math.floor(normalized);
  const minutes = Math.floor((normalized - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
