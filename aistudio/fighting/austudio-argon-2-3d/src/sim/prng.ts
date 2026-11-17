/**
 * Seeded PRNG utilities for deterministic & procedurally unique stunt scenes.
 */

export interface PRNG {
  seedString: string;
  seedNumber: number;
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export function hashSeedString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 0x9e3779b9;
}

const PREFIXES = ['HK', 'KOWLOON', 'DRAGON', 'GOLDEN', 'SHAW', 'VICTORIA', 'MONGKOK', 'SHAOLIN'] as const;
const SUFFIXES = ['TEA', 'ROOF', 'DOCK', 'BAMBOO', 'FURY', 'TIGER', 'LOTUS', 'CRANE', 'LADDER', 'VAULT'] as const;

let sequenceCounter = 0;

export function generateUniqueSeedString(): string {
  sequenceCounter = (sequenceCounter + 1) % 10000;
  const nowEntropy = (Date.now() ^ Math.floor(Math.random() * 0xffffffff) ^ (sequenceCounter * 7919)) >>> 0;
  const prefix = PREFIXES[nowEntropy % PREFIXES.length];
  const suffix = SUFFIXES[(nowEntropy >>> 4) % SUFFIXES.length];
  const code = ((nowEntropy >>> 8) % 9000) + 1000;
  return `${prefix}-${code}-${suffix}`;
}

export function createPRNG(seedInput?: string | number): PRNG {
  const seedString =
    typeof seedInput === 'string' && seedInput.trim().length > 0
      ? seedInput.trim().toUpperCase()
      : typeof seedInput === 'number'
        ? `HK-${Math.abs(Math.floor(seedInput)) % 9000 + 1000}-SEED`
        : generateUniqueSeedString();

  let state = hashSeedString(seedString);

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);

  const int = (min: number, max: number): number => Math.floor(range(min, max + 1));

  const chance = (probability: number): boolean => next() < probability;

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    return items[Math.floor(next() * items.length)];
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  };

  return {
    seedString,
    seedNumber: state >>> 0,
    next,
    range,
    int,
    chance,
    pick,
    shuffle,
  };
}
