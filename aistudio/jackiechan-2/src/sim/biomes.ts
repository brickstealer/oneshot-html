import { SeededRandom } from './prng';
import {
  BiomeConfig,
  BiomeId,
  InteractiveProp,
  Platform,
  PropKind,
} from './types';

export const BIOMES: Record<BiomeId, BiomeConfig> = {
  teahouse: {
    id: 'teahouse',
    nameRu: 'Чайный дом «Золотой Дракон»',
    subtitleRu: 'Гонконг 1985 · Двухуровневый зал, фарфоровые вазы и красные фонари',
    skyTop: '#160b0e',
    skyBottom: '#2d1418',
    ambientTint: '#f59e0b',
    floorColor: '#3b1d16',
    floorTrimColor: '#7c2d12',
    platformColor: '#4a2319',
    platformAccent: '#d97706',
    accentNeon: '#ef4444',
    secondaryNeon: '#f59e0b',
    signTexts: ['龍鳳茶樓', '醉拳大侠', '香港功夫'],
    propWeights: {
      ladder: 1.5,
      table: 3.0,
      chair: 3.5,
      vase: 3.2,
      bottle: 2.5,
      bamboo_pole: 1.6,
      crate: 0.8,
      barrel: 0.6,
      lantern: 2.5,
      wok: 0.8,
      steamer: 2.4,
    },
  },
  night_market: {
    id: 'night_market',
    nameRu: 'Ночной рынок Коулуна',
    subtitleRu: 'Тempest Street · Пружинящие навесы, неоновые вывески и уличные лавки',
    skyTop: '#090d1a',
    skyBottom: '#172038',
    ambientTint: '#38bdf8',
    floorColor: '#1e2433',
    floorTrimColor: '#334155',
    platformColor: '#1e293b',
    platformAccent: '#0ea5e9',
    accentNeon: '#f43f5e',
    secondaryNeon: '#22d3ee',
    signTexts: ['九龍夜市', '大排檔', '黃金嘉禾'],
    propWeights: {
      ladder: 2.0,
      table: 2.5,
      chair: 3.0,
      vase: 1.2,
      bottle: 3.5,
      bamboo_pole: 2.2,
      crate: 2.8,
      barrel: 1.5,
      lantern: 2.0,
      wok: 1.8,
      steamer: 2.6,
    },
  },
  harbour_warehouse: {
    id: 'harbour_warehouse',
    nameRu: 'Портовый склад №8',
    subtitleRu: 'Бухта Виктория · Грузовые ящики, бочки, стремянки и подвесные цепи',
    skyTop: '#0b1118',
    skyBottom: '#182432',
    ambientTint: '#fb923c',
    floorColor: '#222831',
    floorTrimColor: '#475569',
    platformColor: '#2d3748',
    platformAccent: '#f97316',
    accentNeon: '#f59e0b',
    secondaryNeon: '#38bdf8',
    signTexts: ['八號貨倉', '危險物品', '請勿靠近'],
    propWeights: {
      ladder: 3.5,
      table: 1.2,
      chair: 1.5,
      vase: 0.4,
      bottle: 2.0,
      bamboo_pole: 2.4,
      crate: 4.0,
      barrel: 3.4,
      lantern: 1.2,
      wok: 0.5,
      steamer: 0.4,
    },
  },
  bamboo_scaffold: {
    id: 'bamboo_scaffold',
    nameRu: 'Бамбуковые леса небоскрёба',
    subtitleRu: 'Пик Виктория · Пружинящие балки, шесты, стремянки и строительные ящики',
    skyTop: '#0d1520',
    skyBottom: '#1e2d3d',
    ambientTint: '#a3e635',
    floorColor: '#292524',
    floorTrimColor: '#78716c',
    platformColor: '#3f3624',
    platformAccent: '#eab308',
    accentNeon: '#eab308',
    secondaryNeon: '#10b981',
    signTexts: ['高空作業', '成家班特技', '注意安全'],
    propWeights: {
      ladder: 3.8,
      table: 1.0,
      chair: 1.2,
      vase: 0.5,
      bottle: 1.5,
      bamboo_pole: 4.5,
      crate: 3.2,
      barrel: 2.2,
      lantern: 1.5,
      wok: 0.4,
      steamer: 0.5,
    },
  },
  peking_kitchen: {
    id: 'peking_kitchen',
    nameRu: 'Кухня ресторана «Гранд-Пекин»',
    subtitleRu: 'Банкетный цех · Чугунные воки, пароварки дим-сам, столы и бутылки соуса',
    skyTop: '#171111',
    skyBottom: '#2b1d1c',
    ambientTint: '#fbbf24',
    floorColor: '#272020',
    floorTrimColor: '#57534e',
    platformColor: '#332b2b',
    platformAccent: '#f59e0b',
    accentNeon: '#ef4444',
    secondaryNeon: '#fbbf24',
    signTexts: ['北京飯店', '廚房重地', '名廚主理'],
    propWeights: {
      ladder: 1.8,
      table: 3.2,
      chair: 2.8,
      vase: 2.0,
      bottle: 3.8,
      bamboo_pole: 1.4,
      crate: 1.8,
      barrel: 1.6,
      lantern: 1.5,
      wok: 4.2,
      steamer: 4.0,
    },
  },
};

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];

export interface PropBlueprint {
  nameRu: string;
  width: number;
  height: number;
  hp: number;
  mass: number;
  bounciness: number;
  colorPrimary: string;
  colorSecondary: string;
}

export const PROP_BLUEPRINTS: Record<PropKind, PropBlueprint> = {
  ladder: {
    nameRu: 'Стремянка',
    width: 30,
    height: 92,
    hp: 160,
    mass: 2.2,
    bounciness: 0.35,
    colorPrimary: '#eab308',
    colorSecondary: '#a16207',
  },
  table: {
    nameRu: 'Банкетный стол',
    width: 86,
    height: 44,
    hp: 110,
    mass: 2.8,
    bounciness: 0.3,
    colorPrimary: '#9a3412',
    colorSecondary: '#c2410c',
  },
  chair: {
    nameRu: 'Деревянный стул',
    width: 34,
    height: 46,
    hp: 45,
    mass: 1.1,
    bounciness: 0.4,
    colorPrimary: '#b45309',
    colorSecondary: '#78350f',
  },
  vase: {
    nameRu: 'Династическая ваза Мин',
    width: 24,
    height: 40,
    hp: 25,
    mass: 0.9,
    bounciness: 0.2,
    colorPrimary: '#f8fafc',
    colorSecondary: '#2563eb',
  },
  bottle: {
    nameRu: 'Бутылка напитка',
    width: 14,
    height: 30,
    hp: 18,
    mass: 0.6,
    bounciness: 0.25,
    colorPrimary: '#10b981',
    colorSecondary: '#047857',
  },
  bamboo_pole: {
    nameRu: 'Бамбуковый шест',
    width: 110,
    height: 12,
    hp: 130,
    mass: 1.2,
    bounciness: 0.65,
    colorPrimary: '#84cc16',
    colorSecondary: '#4d7c0f',
  },
  crate: {
    nameRu: 'Грузовой ящик',
    width: 48,
    height: 48,
    hp: 65,
    mass: 2.0,
    bounciness: 0.3,
    colorPrimary: '#d97706',
    colorSecondary: '#92400e',
  },
  barrel: {
    nameRu: 'Тяжёлая бочка',
    width: 42,
    height: 56,
    hp: 95,
    mass: 2.5,
    bounciness: 0.5,
    colorPrimary: '#dc2626',
    colorSecondary: '#991b1b',
  },
  lantern: {
    nameRu: 'Подвесной фонарь',
    width: 34,
    height: 42,
    hp: 40,
    mass: 0.8,
    bounciness: 0.6,
    colorPrimary: '#ef4444',
    colorSecondary: '#fbbf24',
  },
  wok: {
    nameRu: 'Чугунный вок',
    width: 38,
    height: 22,
    hp: 200,
    mass: 1.8,
    bounciness: 0.7,
    colorPrimary: '#475569',
    colorSecondary: '#94a3b8',
  },
  steamer: {
    nameRu: 'Пароварка дим-сам',
    width: 32,
    height: 28,
    hp: 35,
    mass: 0.9,
    bounciness: 0.45,
    colorPrimary: '#fcd34d',
    colorSecondary: '#b45309',
  },
};

export interface ProceduralArena {
  biome: BiomeConfig;
  worldWidth: number;
  worldHeight: number;
  floorY: number;
  platforms: Platform[];
  props: InteractiveProp[];
  pillars: { x: number; width: number; topY: number; label: string }[];
}

export function generateProceduralArena(
  rng: SeededRandom,
  propDensity = 1.0,
  forcedBiomeId?: BiomeId
): ProceduralArena {
  const biomeId = forcedBiomeId ?? rng.pick(BIOME_IDS);
  const biome = BIOMES[biomeId];

  const worldWidth = 1280;
  const worldHeight = 720;
  const floorY = 610;

  const platforms: Platform[] = [
    {
      id: 'main_floor',
      x: 0,
      y: floorY,
      width: worldWidth,
      height: worldHeight - floorY,
      kind: 'floor',
      bounciness: 0.15,
      flexOffset: 0,
      flexVelocity: 0,
    },
  ];

  // Generate 2 to 4 procedural elevated platforms (balconies, awnings, bamboo scaffolding)
  const tierCount = rng.int(2, 4);
  const leftW = rng.int(220, 310);
  const leftX = rng.int(60, 140);
  const leftY = rng.int(395, 455);

  platforms.push({
    id: 'plat_left',
    x: leftX,
    y: leftY,
    width: leftW,
    height: 18,
    kind: biomeId === 'night_market' ? 'awning' : biomeId === 'bamboo_scaffold' ? 'scaffolding' : 'balcony',
    bounciness: biomeId === 'night_market' || biomeId === 'bamboo_scaffold' ? 0.85 : 0.35,
    flexOffset: 0,
    flexVelocity: 0,
  });

  const rightW = rng.int(220, 310);
  const rightX = worldWidth - rightW - rng.int(60, 140);
  const rightY = rng.int(395, 455);

  platforms.push({
    id: 'plat_right',
    x: rightX,
    y: rightY,
    width: rightW,
    height: 18,
    kind: biomeId === 'bamboo_scaffold' ? 'scaffolding' : biomeId === 'peking_kitchen' ? 'counter' : 'balcony',
    bounciness: biomeId === 'bamboo_scaffold' ? 0.85 : 0.35,
    flexOffset: 0,
    flexVelocity: 0,
  });

  if (tierCount >= 3) {
    const midW = rng.int(200, 280);
    const midX = (worldWidth - midW) / 2 + rng.int(-60, 60);
    const midY = rng.int(275, 330);
    platforms.push({
      id: 'plat_high_center',
      x: midX,
      y: midY,
      width: midW,
      height: 16,
      kind: 'awning',
      bounciness: 0.9,
      flexOffset: 0,
      flexVelocity: 0,
    });
  }

  // Procedural pillars for wall-run backflips and neon signs
  const pillarCount = rng.int(2, 3);
  const pillars: { x: number; width: number; topY: number; label: string }[] = [];
  const spacing = worldWidth / (pillarCount + 1);
  for (let i = 0; i < pillarCount; i++) {
    pillars.push({
      x: spacing * (i + 1) + rng.range(-55, 55),
      width: rng.int(38, 52),
      topY: rng.int(90, 150),
      label: biome.signTexts[i % biome.signTexts.length],
    });
  }

  // Generate interactive props across the floor and platforms
  const props: InteractiveProp[] = [];
  const basePropCount = Math.max(6, Math.min(22, Math.round(12 * propDensity)));

  // Always guarantee at least 1 signature Jackie Chan step-ladder and 1 table!
  const guaranteedKinds: PropKind[] = ['ladder', 'table', 'chair', 'vase'];

  for (let i = 0; i < basePropCount; i++) {
    const kind: PropKind =
      i < guaranteedKinds.length
        ? guaranteedKinds[i]
        : rng.pickWeighted(biome.propWeights);
    const bp = PROP_BLUEPRINTS[kind];

    if (kind === 'lantern') {
      const tetherX = rng.range(220, worldWidth - 220);
      const tetherY = rng.range(60, 110);
      const tetherLength = rng.range(120, 185);
      props.push({
        id: `prop_${i}_${kind}`,
        kind,
        nameRu: bp.nameRu,
        x: tetherX + rng.range(-25, 25),
        y: tetherY + tetherLength,
        vx: rng.range(-30, 30),
        vy: 0,
        angle: 0,
        vAngle: 0,
        width: bp.width,
        height: bp.height,
        hp: bp.hp,
        maxHp: bp.hp,
        mass: bp.mass,
        bounciness: bp.bounciness,
        isHeldBy: null,
        isThrownBy: null,
        broken: false,
        tetherX,
        tetherY,
        tetherLength,
        hitFlash: 0,
        colorPrimary: bp.colorPrimary,
        colorSecondary: bp.colorSecondary,
      });
      continue;
    }

    // Place on main floor or one of the platforms
    const targetPlat =
      kind === 'table' || kind === 'ladder' || rng.chance(0.62)
        ? platforms[0]
        : rng.pick(platforms);

    const margin = 45;
    const px = rng.range(
      Math.max(90, targetPlat.x + margin),
      Math.min(worldWidth - 90, targetPlat.x + targetPlat.width - margin)
    );
    const py = targetPlat.y - bp.height * 0.5 - 2;

    props.push({
      id: `prop_${i}_${kind}`,
      kind,
      nameRu: bp.nameRu,
      x: px,
      y: py,
      vx: 0,
      vy: 0,
      angle: kind === 'bamboo_pole' ? rng.range(-0.15, 0.15) : 0,
      vAngle: 0,
      width: bp.width,
      height: bp.height,
      hp: bp.hp,
      maxHp: bp.hp,
      mass: bp.mass,
      bounciness: bp.bounciness,
      isHeldBy: null,
      isThrownBy: null,
      broken: false,
      hitFlash: 0,
      colorPrimary: bp.colorPrimary,
      colorSecondary: bp.colorSecondary,
    });
  }

  return {
    biome,
    worldWidth,
    worldHeight,
    floorY,
    platforms,
    props,
    pillars,
  };
}
