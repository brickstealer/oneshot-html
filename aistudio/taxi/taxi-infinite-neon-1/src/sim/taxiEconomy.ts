import { BIOMES } from './worldGen';
import type { BiomeId, OrderTier, UpgradeKey, UpgradeLevels } from './types';

export interface UpgradeSpec {
  key: UpgradeKey;
  nameRu: string;
  shortRu: string;
  baseCost: number;
  costGrowth: number;
  effectLabel: (level: number) => string;
}

export const UPGRADE_SPECS: Record<UpgradeKey, UpgradeSpec> = {
  engine: {
    key: 'engine',
    nameRu: 'Двигатель и Турбо',
    shortRu: 'Двигатель',
    baseCost: 120,
    costGrowth: 1.48,
    effectLabel: (lvl) => `${Math.round(computeMaxSpeedKmh(lvl))} км/ч`,
  },
  chassis: {
    key: 'chassis',
    nameRu: 'Кузов и Аэродинамика',
    shortRu: 'Кузов',
    baseCost: 150,
    costGrowth: 1.52,
    effectLabel: (lvl) => `×${computeChassisPrestigeMultiplier(lvl).toFixed(2)} престиж`,
  },
  autopilot: {
    key: 'autopilot',
    nameRu: 'Автопилот ИИ',
    shortRu: 'Автопилот',
    baseCost: 140,
    costGrowth: 1.5,
    effectLabel: (lvl) => `-${Math.round((1 - computeSearchTimeFactor(lvl)) * 100)}% поиск`,
  },
  comfort: {
    key: 'comfort',
    nameRu: 'Салон и Тариф',
    shortRu: 'Тариф',
    baseCost: 130,
    costGrowth: 1.46,
    effectLabel: (lvl) => `×${computeFareMultiplier(lvl).toFixed(2)} доход`,
  },
};

export const UPGRADE_ORDER: UpgradeKey[] = ['engine', 'chassis', 'autopilot', 'comfort'];

export function createInitialUpgrades(): UpgradeLevels {
  return {
    engine: 1,
    chassis: 1,
    autopilot: 1,
    comfort: 1,
  };
}

/** Infinite upgrade cost scaling that remains finite & balanced across hundreds of levels */
export function getUpgradeCost(key: UpgradeKey, currentLevel: number): number {
  const spec = UPGRADE_SPECS[key];
  const safeLevel = Math.max(1, Math.floor(currentLevel));
  // Smooth hybrid curve: exponential early, slightly moderated polynomial exponent after lv 30
  if (safeLevel <= 30) {
    return Math.round(spec.baseCost * Math.pow(spec.costGrowth, safeLevel - 1));
  }
  const base30 = spec.baseCost * Math.pow(spec.costGrowth, 29);
  const extra = safeLevel - 30;
  return Math.round(base30 * Math.pow(1.22, extra));
}

/** Returns cruising speed in m/s (1 m/s = 3.6 km/h). Scales infinitely with smooth diminishing feel */
export function computeMaxSpeedMs(engineLevel: number): number {
  const lvl = Math.max(1, engineLevel);
  // Lv1: 18 m/s (65 km/h), Lv5: 27 m/s (97 km/h), Lv15: 40 m/s (144 km/h), Lv50+: 60+ m/s (216+ km/h)
  const kmh = 56 + 9 * lvl + 16 * Math.log2(lvl) - Math.max(0, lvl - 10) * 5.2;
  const clampedKmh = Math.min(340, Math.max(60, kmh));
  return clampedKmh / 3.6;
}

export function computeMaxSpeedKmh(engineLevel: number): number {
  return computeMaxSpeedMs(engineLevel) * 3.6;
}

export function computeAcceleration(engineLevel: number): number {
  const lvl = Math.max(1, engineLevel);
  return 9.5 + Math.min(32, (lvl - 1) * 1.45);
}

/** Prestige multiplier from chassis upgrades (scales infinitely) */
export function computeChassisPrestigeMultiplier(chassisLevel: number): number {
  const lvl = Math.max(1, chassisLevel);
  return 1 + (lvl - 1) * 0.28 + Math.pow(Math.max(0, lvl - 5), 1.15) * 0.08;
}

/** Fare multiplier from comfort upgrades (scales infinitely) */
export function computeFareMultiplier(comfortLevel: number): number {
  const lvl = Math.max(1, comfortLevel);
  return 1 + (lvl - 1) * 0.35 + Math.pow(Math.max(0, lvl - 4), 1.18) * 0.1;
}

/** Search wait factor between orders (approaches 0.18 asymptotically as autopilot improves) */
export function computeSearchTimeFactor(autopilotLevel: number): number {
  const lvl = Math.max(1, autopilotLevel);
  return 0.18 + 0.82 / (1 + (lvl - 1) * 0.28);
}

/** Cornering speed factor (higher autopilot = faster, smoother cornering) */
export function computeCornerSpeedFactor(autopilotLevel: number): number {
  const lvl = Math.max(1, autopilotLevel);
  return Math.min(0.88, 0.52 + (lvl - 1) * 0.03);
}

export const FLIGHT_UNLOCK_TOTAL_LEVEL = 20;

export function getTotalUpgradeLevel(upgrades: UpgradeLevels): number {
  return upgrades.engine + upgrades.chassis + upgrades.autopilot + upgrades.comfort;
}

/** Flying hover-taxi transformation unlocks once the vehicle reaches total upgrade level 20 (Гипер-Шаттл) */
export function isFlightUnlocked(upgrades: UpgradeLevels): boolean {
  return getTotalUpgradeLevel(upgrades) >= FLIGHT_UNLOCK_TOTAL_LEVEL;
}

/** Determines visual vehicle tier index (0..5+) and localized class title */
export function getVehicleClassInfo(upgrades: UpgradeLevels): {
  tierIndex: number;
  nameRu: string;
  paintHex: number;
  trimHex: number;
} {
  const total = getTotalUpgradeLevel(upgrades);
  if (total < 7) {
    return {
      tierIndex: 0,
      nameRu: 'Классик Седан',
      paintHex: 0xf4b41a, // iconic warm taxi amber-gold
      trimHex: 0x1e2430,
    };
  }
  if (total < 12) {
    return {
      tierIndex: 1,
      nameRu: 'Бизнес Экспресс',
      paintHex: 0xe6a117, // deeper metallic gold
      trimHex: 0xcbd5e1, // brushed chrome
    };
  }
  if (total < 16) {
    return {
      tierIndex: 2,
      nameRu: 'Спорт GT',
      paintHex: 0xf97316, // burnt racing amber
      trimHex: 0x18181b, // carbon black
    };
  }
  if (total < FLIGHT_UNLOCK_TOTAL_LEVEL) {
    return {
      tierIndex: 3,
      nameRu: 'Люкс Гран-Туризмо',
      paintHex: 0x10b981, // emerald metallic
      trimHex: 0xfbbf24, // champagne gold
    };
  }
  if (total < 30) {
    return {
      tierIndex: 4,
      nameRu: 'Аэро-Шаттл',
      paintHex: 0x1e293b, // obsidian slate
      trimHex: 0x38bdf8, // plasma aero cyan
    };
  }
  const prestigeMk = Math.floor((total - 30) / 8) + 1;
  const palettes = [
    { paintHex: 0xe2e8f0, trimHex: 0x38bdf8 }, // platinum-cyan aero
    { paintHex: 0x0f172a, trimHex: 0xc084fc }, // midnight plasma
    { paintHex: 0x991b1b, trimHex: 0xfde047 }, // crimson imperial
    { paintHex: 0x065f46, trimHex: 0x34d399 }, // royal emerald
  ];
  const palette = palettes[(prestigeMk - 1) % palettes.length];
  return {
    tierIndex: 5 + prestigeMk - 1,
    nameRu: `Апекс Престиж Mk.${prestigeMk}`,
    paintHex: palette.paintHex,
    trimHex: palette.trimHex,
  };
}

const PASSENGER_NAMES = [
  'Анна С.',
  'Дмитрий К.',
  'Мария В.',
  'Алексей П.',
  'Елена Т.',
  'Игорь М.',
  'София Л.',
  'Максим Р.',
  'Ольга Д.',
  'Никита Б.',
  'Ксения Н.',
  'Артём Г.',
  'Виктория Ф.',
  'Роман Ш.',
];

export function pickOrderTier(upgrades: UpgradeLevels, rngValue: number): OrderTier {
  const vipChance = Math.min(0.45, 0.04 + (upgrades.chassis - 1) * 0.03 + (upgrades.autopilot - 1) * 0.02);
  const expressChance = Math.min(0.35, 0.12 + (upgrades.engine - 1) * 0.02);
  const comfortChance = 0.28;

  if (rngValue < vipChance) return 'vip';
  if (rngValue < vipChance + expressChance) return 'express';
  if (rngValue < vipChance + expressChance + comfortChance) return 'comfort';
  return 'standard';
}

export function getOrderTierInfo(tier: OrderTier): { labelRu: string; multiplier: number } {
  switch (tier) {
    case 'vip':
      return { labelRu: 'VIP-класс', multiplier: 2.35 };
    case 'express':
      return { labelRu: 'Экспресс', multiplier: 1.65 };
    case 'comfort':
      return { labelRu: 'Комфорт+', multiplier: 1.3 };
    default:
      return { labelRu: 'Стандарт', multiplier: 1.0 };
  }
}

export function pickPassengerName(seedInt: number): string {
  return PASSENGER_NAMES[Math.abs(seedInt) % PASSENGER_NAMES.length];
}

export function calculateOrderFare(params: {
  distanceM: number;
  tier: OrderTier;
  pickupBiome: BiomeId;
  dropoffBiome: BiomeId;
  upgrades: UpgradeLevels;
}): number {
  const { distanceM, tier, pickupBiome, dropoffBiome, upgrades } = params;
  const tierMult = getOrderTierInfo(tier).multiplier;
  const biomeMult =
    (BIOMES[pickupBiome].fareMultiplier + BIOMES[dropoffBiome].fareMultiplier) * 0.5;
  const crossBiomeBonus = pickupBiome !== dropoffBiome ? 1.25 : 1.0;
  const comfortMult = computeFareMultiplier(upgrades.comfort);
  const prestigeMult = computeChassisPrestigeMultiplier(upgrades.chassis);

  const baseDrop = 45;
  const distanceRate = distanceM * 0.58;
  const raw =
    (baseDrop + distanceRate) *
    tierMult *
    biomeMult *
    crossBiomeBonus *
    comfortMult *
    prestigeMult;

  return Math.max(35, Math.round(raw));
}

/** Picks the cheapest affordable upgrade for Auto-Upgrade mode, or null if none affordable */
export function pickBestAffordableUpgrade(
  balance: number,
  upgrades: UpgradeLevels,
): UpgradeKey | null {
  let bestKey: UpgradeKey | null = null;
  let lowestCost = Infinity;

  for (const key of UPGRADE_ORDER) {
    const cost = getUpgradeCost(key, upgrades[key]);
    if (cost <= balance && cost < lowestCost) {
      lowestCost = cost;
      bestKey = key;
    }
  }
  return bestKey;
}

/** Compact Russian currency formatter */
export function formatMoney(amount: number): string {
  const n = Math.floor(amount);
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 100_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString('ru-RU')}`;
}
