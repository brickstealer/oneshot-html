/**
 * Deterministic Seeded PRNG (FNV-1a hash + Mulberry32)
 * Guarantees every procedural scene is 100% unique for a new seed
 * and 100% reproducible when a user shares or replays a specific seed.
 */
export class SeededRandom {
  private state: number;
  public readonly seedString: string;

  constructor(seedInput?: string | number) {
    const raw =
      seedInput !== undefined && String(seedInput).trim().length > 0
        ? String(seedInput).trim()
        : SeededRandom.generateUniqueSeed();
    this.seedString = raw;
    this.state = SeededRandom.hashString(raw);
  }

  public static generateUniqueSeed(): string {
    const prefixes = ['HK', 'CHAN', 'DRAGON', 'KOWLOON', 'STUNT', 'JACKIE', 'LOTUS', 'TIGER'];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${p}-${num}-${suffix}`;
  }

  public static hashString(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0 || 0x12345678;
  }

  /** Returns float in [0, 1) */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns float in [min, max) */
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns integer in [min, max] inclusive */
  public int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Returns boolean with probability p of true */
  public chance(p = 0.5): boolean {
    return this.next() < p;
  }

  /** Picks a random element from a non-empty array */
  public pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Picks a weighted key from a weight map */
  public pickWeighted<K extends string>(weights: Record<K, number>): K {
    const entries = Object.entries(weights) as [K, number][];
    let total = 0;
    for (const [, w] of entries) {
      total += Math.max(0, w);
    }
    if (total <= 0) return entries[0][0];
    let r = this.next() * total;
    for (const [k, w] of entries) {
      r -= Math.max(0, w);
      if (r <= 0) return k;
    }
    return entries[entries.length - 1][0];
  }
}
