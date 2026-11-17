import {
  COMBO_CHAINS,
  computeMartialArtsPose,
  MARTIAL_STRIKES,
  MartialStrikeId,
  solveTwoBoneIK,
  StrikeSpec,
} from './martialArtsIK';
import { createPRNG, PRNG } from './prng';
import {
  ArenaThemeId,
  ArenaThemeSpec,
  BoneConstraint,
  BoneId,
  Fighter,
  FighterRole,
  InteractiveProp,
  PropType,
  RagdollBone,
  SimEvent,
  SimulationStats,
  StuntManeuverId,
  StuntManeuverSpec,
  Vec3,
} from './types';

export const ARENA_THEMES: Record<ArenaThemeId, ArenaThemeSpec> = {
  teahouse: {
    id: 'teahouse',
    nameRu: 'Чайный дом «Золотой Дракон»',
    subtitleRu: 'Коулун · Двухъярусный зал с деревянными столами и фонарями',
    skyColor: 0x1a120b,
    fogColor: 0x1a120b,
    fogDensity: 0.018,
    keyLightColor: 0xffd28a,
    keyLightIntensity: 2.4,
    hemiSkyColor: 0x7c98b3,
    hemiGroundColor: 0x4a2c18,
    floorTint: 0xd9c2a6,
    accentColor: 0xd9381e,
    lanternColor: 0xff4518,
  },
  rooftop: {
    id: 'rooftop',
    nameRu: 'Крыша ночного Монг-Кока',
    subtitleRu: 'Гонконг · Бамбуковые леса и неоновые огни над проспектом',
    skyColor: 0x0d1522,
    fogColor: 0x0d1522,
    fogDensity: 0.017,
    keyLightColor: 0xffb36b,
    keyLightIntensity: 2.3,
    hemiSkyColor: 0x3b82f6,
    hemiGroundColor: 0x291d18,
    floorTint: 0x9ca3af,
    accentColor: 0xf59e0b,
    lanternColor: 0xff2a55,
  },
  warehouse: {
    id: 'warehouse',
    nameRu: 'Портовый склад Виктория',
    subtitleRu: 'Доки Гонконга · Контейнеры, стремянки и винные бочки',
    skyColor: 0x16191d,
    fogColor: 0x16191d,
    fogDensity: 0.019,
    keyLightColor: 0xffe0a3,
    keyLightIntensity: 2.5,
    hemiSkyColor: 0x64748b,
    hemiGroundColor: 0x332419,
    floorTint: 0xb8a99a,
    accentColor: 0xea580c,
    lanternColor: 0xff8c1a,
  },
  courtyard: {
    id: 'courtyard',
    nameRu: 'Храмовый двор Шаолинь',
    subtitleRu: 'Горный монастырь · Каменные плиты, колонны и шесты для ушу',
    skyColor: 0x1c1714,
    fogColor: 0x1c1714,
    fogDensity: 0.015,
    keyLightColor: 0xffdf9e,
    keyLightIntensity: 2.6,
    hemiSkyColor: 0x93c5fd,
    hemiGroundColor: 0x433022,
    floorTint: 0xe5d5c3,
    accentColor: 0xc2410c,
    lanternColor: 0xff5522,
  },
};

export const STUNT_MANEUVERS: Record<StuntManeuverId, StuntManeuverSpec> = {
  table_vault_kick: {
    id: 'table_vault_kick',
    titleRu: 'Опорный прыжок через стол с двойным ударом ног',
    requiredProp: 'table',
    duration: 0.68,
    hitTime: 0.36,
    damage: 44,
    knockbackForce: 13.5,
    upwardForce: 7.2,
    aoeRadius: 3.4,
  },
  chair_catch_spin: {
    id: 'chair_catch_spin',
    titleRu: 'Перехват складного стула и круговой блок 360°',
    requiredProp: 'chair',
    duration: 0.62,
    hitTime: 0.3,
    damage: 38,
    knockbackForce: 12.0,
    upwardForce: 6.0,
    aoeRadius: 3.2,
  },
  ladder_helicopter: {
    id: 'ladder_helicopter',
    titleRu: 'Вертушка Джеки с бамбуковой стремянкой',
    requiredProp: 'ladder',
    duration: 0.82,
    hitTime: 0.42,
    damage: 52,
    knockbackForce: 15.2,
    upwardForce: 8.0,
    aoeRadius: 4.1,
  },
  pole_swing_dropkick: {
    id: 'pole_swing_dropkick',
    titleRu: 'Круговой оборот на бамбуковом шесте в дропкик',
    requiredProp: 'bamboo_pole',
    duration: 0.74,
    hitTime: 0.38,
    damage: 48,
    knockbackForce: 14.4,
    upwardForce: 7.8,
    aoeRadius: 3.8,
  },
  wall_backflip_counter: {
    id: 'wall_backflip_counter',
    titleRu: 'Забег по колонне и заднее сальто с ударом пяткой',
    requiredProp: 'pillar',
    duration: 0.72,
    hitTime: 0.4,
    damage: 46,
    knockbackForce: 13.8,
    upwardForce: 8.4,
    aoeRadius: 3.3,
  },
  crate_smash_uppercut: {
    id: 'crate_smash_uppercut',
    titleRu: 'Пролом ящика с рикошетным апперкотом',
    requiredProp: 'crate',
    duration: 0.58,
    hitTime: 0.28,
    damage: 42,
    knockbackForce: 12.8,
    upwardForce: 7.5,
    aoeRadius: 3.1,
  },
  barrel_roll_sweep: {
    id: 'barrel_roll_sweep',
    titleRu: 'Подкат с пуском тяжёлой бочки по ногам',
    requiredProp: 'barrel',
    duration: 0.64,
    hitTime: 0.32,
    damage: 40,
    knockbackForce: 13.2,
    upwardForce: 6.8,
    aoeRadius: 3.6,
  },
  drunken_weave_strike: {
    id: 'drunken_weave_strike',
    titleRu: 'Уклонение «Пьяный Мастер» и молниеносная подсечка',
    requiredProp: null,
    duration: 0.56,
    hitTime: 0.28,
    damage: 35,
    knockbackForce: 11.4,
    upwardForce: 6.2,
    aoeRadius: 2.9,
  },
  flying_bicycle_kick: {
    id: 'flying_bicycle_kick',
    titleRu: 'Каскад «Велосипедный удар» в прыжке',
    requiredProp: null,
    duration: 0.65,
    hitTime: 0.34,
    damage: 39,
    knockbackForce: 12.6,
    upwardForce: 7.0,
    aoeRadius: 3.0,
  },
};

const BONE_CONSTRAINTS: BoneConstraint[] = [
  { boneA: 'pelvis', boneB: 'torso', restLength: 0.46 },
  { boneA: 'torso', boneB: 'head', restLength: 0.36 },
  { boneA: 'torso', boneB: 'elbowL', restLength: 0.31 },
  { boneA: 'elbowL', boneB: 'handL', restLength: 0.30 },
  { boneA: 'torso', boneB: 'elbowR', restLength: 0.31 },
  { boneA: 'elbowR', boneB: 'handR', restLength: 0.30 },
  { boneA: 'pelvis', boneB: 'kneeL', restLength: 0.42 },
  { boneA: 'kneeL', boneB: 'footL', restLength: 0.42 },
  { boneA: 'pelvis', boneB: 'kneeR', restLength: 0.42 },
  { boneA: 'kneeR', boneB: 'footR', restLength: 0.42 },
];

function createBone(id: BoneId, x: number, y: number, z: number, radius: number): RagdollBone {
  return {
    id,
    pos: { x, y, z },
    prevPos: { x, y, z },
    targetPos: { x, y, z },
    radius,
  };
}

function createInitialBones(pos: Vec3): Record<BoneId, RagdollBone> {
  return {
    pelvis: createBone('pelvis', pos.x, pos.y + 0.88, pos.z, 0.16),
    torso: createBone('torso', pos.x, pos.y + 1.34, pos.z, 0.2),
    head: createBone('head', pos.x, pos.y + 1.70, pos.z, 0.15),
    elbowL: createBone('elbowL', pos.x - 0.26, pos.y + 1.22, pos.z + 0.1, 0.09),
    handL: createBone('handL', pos.x - 0.30, pos.y + 1.24, pos.z + 0.32, 0.09),
    elbowR: createBone('elbowR', pos.x + 0.26, pos.y + 1.22, pos.z + 0.1, 0.09),
    handR: createBone('handR', pos.x + 0.30, pos.y + 1.24, pos.z + 0.32, 0.09),
    kneeL: createBone('kneeL', pos.x - 0.16, pos.y + 0.48, pos.z + 0.12, 0.1),
    footL: createBone('footL', pos.x - 0.17, pos.y + 0.08, pos.z + 0.06, 0.1),
    kneeR: createBone('kneeR', pos.x + 0.16, pos.y + 0.48, pos.z + 0.12, 0.1),
    footR: createBone('footR', pos.x + 0.17, pos.y + 0.08, pos.z - 0.06, 0.1),
  };
}

function dist2D(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class StuntSimulationEngine {
  public prng: PRNG;
  public theme: ArenaThemeSpec;
  public fighters: Fighter[] = [];
  public props: InteractiveProp[] = [];
  public events: SimEvent[] = [];
  public arenaRadius = 11.5;
  public targetEnemyCount = 5;
  public hitstopTimer = 0;
  public cameraTrauma = 0;
  public waveNumber = 1;
  public stuntsPerformed = 0;
  public propsBroken = 0;
  public knockouts = 0;
  public comboCount = 0;
  public comboResetTimer = 0;
  public activeComboNameRu = COMBO_CHAINS[0].nameRu;
  public activeStuntBanner = 'Автономная хореография: Поиск трюка...';
  public activeStuntTimer = 0;
  public elapsedSeconds = 0;
  private propCounter = 0;
  private enemyCounter = 0;

  constructor(seed?: string, themeOverride?: ArenaThemeId, enemyCount = 5) {
    this.targetEnemyCount = clamp(enemyCount, 2, 9);
    this.prng = createPRNG(seed);
    const themeKeys: ArenaThemeId[] = ['teahouse', 'rooftop', 'warehouse', 'courtyard'];
    const chosenTheme = themeOverride ?? this.prng.pick(themeKeys);
    this.theme = ARENA_THEMES[chosenTheme];
    this.generateScene(this.prng.seedString, chosenTheme);
  }

  public generateScene(newSeed?: string, themeOverride?: ArenaThemeId): void {
    this.prng = createPRNG(newSeed);
    const themeKeys: ArenaThemeId[] = ['teahouse', 'rooftop', 'warehouse', 'courtyard'];
    const chosenTheme = themeOverride ?? this.prng.pick(themeKeys);
    this.theme = ARENA_THEMES[chosenTheme];
    this.fighters = [];
    this.props = [];
    this.events = [];
    this.propCounter = 0;
    this.enemyCounter = 0;
    this.waveNumber = 1;
    this.comboCount = 0;
    this.hitstopTimer = 0;
    this.cameraTrauma = 0;
    this.activeComboNameRu = COMBO_CHAINS[0].nameRu;
    this.activeStuntBanner = `Сцена: ${this.theme.nameRu}`;
    this.activeStuntTimer = 2.5;

    // 1. Spawn 4 structural temple/teahouse pillars on perimeter ring
    const pillarAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    const pillarRadius = this.prng.range(6.6, 7.6);
    for (const ang of pillarAngles) {
      const jitter = this.prng.range(-0.12, 0.12);
      const px = Math.cos(ang + jitter) * pillarRadius;
      const pz = Math.sin(ang + jitter) * pillarRadius;
      this.spawnProp('pillar', px, pz);
    }

    // 2. Spawn 2 immediate close-range stunt props right near the center ring + 14-17 arena props
    const closeProps: PropType[] = ['table', 'chair', 'ladder', 'barrel', 'crate'];
    for (let c = 0; c < 2; c++) {
      const cAng = c * Math.PI + this.prng.range(-0.4, 0.4);
      this.spawnProp(this.prng.pick(closeProps), Math.cos(cAng) * 1.65, Math.sin(cAng) * 1.65);
    }

    const propPool: PropType[] = [
      'table',
      'table',
      'table',
      'chair',
      'chair',
      'chair',
      'chair',
      'ladder',
      'ladder',
      'barrel',
      'barrel',
      'barrel',
      'crate',
      'crate',
      'crate',
      'bamboo_pole',
      'bamboo_pole',
    ];
    const totalProps = this.prng.int(14, 17);
    for (let i = 0; i < totalProps; i++) {
      const pType = this.prng.pick(propPool);
      const pos = this.findFreePropSpot(2.1, 8.6);
      this.spawnProp(pType, pos.x, pos.z);
    }

    // 3. Spawn Hero (Master Jackie) at center
    this.fighters.push(this.createFighter('hero', 'Джеки (Мастер Трюков)', 0, 0));

    // 4. Spawn initial wave of stunt antagonists around the hero
    this.spawnEnemyWave(this.targetEnemyCount);

    this.events.push({
      type: 'scene_reset',
      pos: { x: 0, y: 1, z: 0 },
      weight: 1,
      stuntName: this.theme.nameRu,
    });
  }

  private findFreePropSpot(minDistFromCenter: number, maxDistFromCenter: number): Vec3 {
    for (let attempt = 0; attempt < 35; attempt++) {
      const angle = this.prng.range(0, Math.PI * 2);
      const dist = this.prng.range(minDistFromCenter, maxDistFromCenter);
      const candidate = { x: Math.cos(angle) * dist, y: 0, z: Math.sin(angle) * dist };
      let clear = true;
      for (const existing of this.props) {
        if (dist2D(candidate, existing.pos) < existing.radius + 1.15) {
          clear = false;
          break;
        }
      }
      if (clear) return candidate;
    }
    const fallbackAngle = this.prng.range(0, Math.PI * 2);
    return {
      x: Math.cos(fallbackAngle) * 4.5,
      y: 0,
      z: Math.sin(fallbackAngle) * 4.5,
    };
  }

  public spawnProp(type: PropType, x: number, z: number): InteractiveProp {
    this.propCounter++;
    const specMap: Record<
      PropType,
      {
        nameRu: string;
        radius: number;
        height: number;
        mass: number;
        hp: number;
        breakable: boolean;
        grabbable: boolean;
        vaultable: boolean;
        climbable: boolean;
      }
    > = {
      table: {
        nameRu: 'Чайный стол',
        radius: 0.82,
        height: 0.78,
        mass: 22,
        hp: 45,
        breakable: true,
        grabbable: false,
        vaultable: true,
        climbable: false,
      },
      chair: {
        nameRu: 'Складной стул',
        radius: 0.42,
        height: 0.85,
        mass: 7,
        hp: 25,
        breakable: true,
        grabbable: true,
        vaultable: false,
        climbable: false,
      },
      ladder: {
        nameRu: 'Бамбуковая стремянка',
        radius: 0.58,
        height: 1.85,
        mass: 11,
        hp: 65,
        breakable: true,
        grabbable: true,
        vaultable: false,
        climbable: true,
      },
      barrel: {
        nameRu: 'Винная бочка',
        radius: 0.48,
        height: 0.92,
        mass: 18,
        hp: 38,
        breakable: true,
        grabbable: true,
        vaultable: true,
        climbable: false,
      },
      crate: {
        nameRu: 'Деревянный ящик',
        radius: 0.54,
        height: 0.76,
        mass: 15,
        hp: 32,
        breakable: true,
        grabbable: true,
        vaultable: true,
        climbable: false,
      },
      bamboo_pole: {
        nameRu: 'Бамбуковый шест',
        radius: 0.35,
        height: 2.35,
        mass: 6,
        hp: 80,
        breakable: false,
        grabbable: true,
        vaultable: false,
        climbable: true,
      },
      pillar: {
        nameRu: 'Опорная колонна',
        radius: 0.56,
        height: 3.8,
        mass: 999,
        hp: 9999,
        breakable: false,
        grabbable: false,
        vaultable: false,
        climbable: true,
      },
    };

    const meta = specMap[type];
    const prop: InteractiveProp = {
      id: `prop_${this.propCounter}`,
      type,
      nameRu: meta.nameRu,
      pos: { x, y: 0, z },
      vel: { x: 0, y: 0, z: 0 },
      rot: { x: 0, y: this.prng.range(0, Math.PI * 2), z: 0 },
      angVel: { x: 0, y: 0, z: 0 },
      radius: meta.radius,
      height: meta.height,
      mass: meta.mass,
      hp: meta.hp,
      maxHp: meta.hp,
      broken: false,
      breakable: meta.breakable,
      grabbable: meta.grabbable,
      vaultable: meta.vaultable,
      climbable: meta.climbable,
      heldByFighterId: null,
      hitFlash: 0,
      colorVariant: this.prng.int(0, 3),
    };
    this.props.push(prop);
    return prop;
  }

  public replenishProps(count = 6): void {
    const types: PropType[] = ['table', 'chair', 'ladder', 'barrel', 'crate', 'bamboo_pole'];
    for (let i = 0; i < count; i++) {
      const spot = this.findFreePropSpot(2.0, 8.2);
      const p = this.spawnProp(this.prng.pick(types), spot.x, spot.z);
      p.pos.y = 2.8 + i * 0.35;
      p.vel.y = -2.0;
    }
  }

  private createFighter(role: FighterRole, nameRu: string, x: number, z: number): Fighter {
    const isHero = role === 'hero';
    const id = isHero ? 'hero_jackie' : `enemy_${++this.enemyCounter}`;

    const paletteByRole: Record<
      FighterRole,
      { primary: number; secondary: number; belt: number; maxHp: number }
    > = {
      hero: { primary: 0xf5efe6, secondary: 0x1e293b, belt: 0xd9381e, maxHp: 250 },
      brawler: { primary: 0x7f1d1d, secondary: 0x1c1917, belt: 0xf59e0b, maxHp: 95 },
      acrobat: { primary: 0x1e3a8a, secondary: 0x0f172a, belt: 0x38bdf8, maxHp: 85 },
      enforcer: { primary: 0x365314, secondary: 0x1a2e05, belt: 0xeab308, maxHp: 125 },
      specialist: { primary: 0x581c87, secondary: 0x1e1b4b, belt: 0xf43f5e, maxHp: 100 },
    };

    const pal = paletteByRole[role];
    const pos = { x, y: 0, z };
    const initialFacing = isHero ? 0 : Math.atan2(-z, -x);

    return {
      id,
      nameRu,
      role,
      isHero,
      pos,
      vel: { x: 0, y: 0, z: 0 },
      facingAngle: initialFacing,
      targetAngle: initialFacing,
      visualYaw: initialFacing,
      torsoPitch: 0.08,
      torsoRoll: 0,
      hp: pal.maxHp,
      maxHp: pal.maxHp,
      state: isHero ? 'stalk' : 'approach',
      stateTimer: 0,
      stateDuration: 0.4,
      activeStunt: null,
      activeStrikeId: null,
      activeComboIndex: this.prng.int(0, COMBO_CHAINS.length - 1),
      stuntPropId: null,
      heldPropId: null,
      targetFighterId: null,
      ragdollBlend: 0.04,
      hitFlash: 0,
      comboStep: 0,
      gaitPhase: this.prng.range(0, Math.PI * 2),
      scaleX: 1,
      scaleY: 1,
      primaryColor: pal.primary,
      secondaryColor: pal.secondary,
      beltColor: pal.belt,
      bones: createInitialBones(pos),
      constraints: [...BONE_CONSTRAINTS],
      koCount: 0,
    };
  }

  public spawnEnemyWave(count: number): void {
    const roles: FighterRole[] = ['brawler', 'acrobat', 'enforcer', 'specialist'];
    const namesRu: Record<FighterRole, string[]> = {
      hero: ['Джеки'],
      brawler: ['Боец триады Чен', 'Каскадёр Вонг', 'Кулак Коулуна'],
      acrobat: ['Акробат Ли', 'Прыгун Ло', 'Тень Монг-Кока'],
      enforcer: ['Вышибала Боло', 'Молот Доков', 'Тяжёлый Тай'],
      specialist: ['Мастер шеста Фэн', 'Хранитель Зала', 'Каскадёр Хо'],
    };

    for (let i = 0; i < count; i++) {
      const role = roles[(i + this.waveNumber) % roles.length];
      const angle = (i / count) * Math.PI * 2 + this.prng.range(-0.25, 0.25);
      const radius = this.prng.range(2.5, 4.8);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const nameList = namesRu[role];
      const f = this.createFighter(role, this.prng.pick(nameList), x, z);
      this.fighters.push(f);
    }
  }

  public getHero(): Fighter {
    return this.fighters[0];
  }

  public triggerSpinningCombo(): void {
    const hero = this.getHero();
    if (!hero) return;
    if (hero.heldPropId) {
      const held = this.props.find((p) => p.id === hero.heldPropId);
      if (held) held.heldByFighterId = null;
      hero.heldPropId = null;
    }
    hero.activeStunt = null;
    hero.stuntPropId = null;

    const spinPool: MartialStrikeId[] = [
      'tornado_kick_540',
      'spinning_hook_kick',
      'butterfly_twist_kick',
      'dragon_tail_sweep',
      'split_kick_dual',
      'spinning_crescent_flurry',
      'flying_side_kick',
    ];
    const strikeId = this.prng.pick(spinPool);
    this.startFighterStrike(hero, MARTIAL_STRIKES[strikeId]);
  }

  public triggerShowcaseStunt(): void {
    const hero = this.getHero();
    if (!hero) return;

    // Find nearest usable prop or spawn one next to hero
    let bestProp: InteractiveProp | null = null;
    let bestDist = 999;
    for (const p of this.props) {
      if (p.broken) continue;
      const d = dist2D(hero.pos, p.pos);
      if (d < bestDist) {
        bestDist = d;
        bestProp = p;
      }
    }

    if (!bestProp || bestDist > 4.2) {
      const angle = hero.facingAngle;
      bestProp = this.spawnProp(
        this.prng.pick(['table', 'ladder', 'chair', 'barrel']),
        hero.pos.x + Math.cos(angle) * 1.4,
        hero.pos.z + Math.sin(angle) * 1.4
      );
    }

    const stuntByProp: Record<PropType, StuntManeuverId> = {
      table: 'table_vault_kick',
      chair: 'chair_catch_spin',
      ladder: 'ladder_helicopter',
      barrel: 'barrel_roll_sweep',
      crate: 'crate_smash_uppercut',
      bamboo_pole: 'pole_swing_dropkick',
      pillar: 'wall_backflip_counter',
    };

    const chosenId = stuntByProp[bestProp.type] ?? 'flying_bicycle_kick';
    this.startHeroStunt(hero, STUNT_MANEUVERS[chosenId], bestProp);
  }

  private startFighterStrike(fighter: Fighter, spec: StrikeSpec): void {
    fighter.state = 'attack';
    fighter.stateTimer = 0;
    fighter.stateDuration = spec.duration;
    fighter.activeStrikeId = spec.id;
    fighter.activeStunt = null;
    fighter.ragdollBlend = 0.02;
    fighter.scaleX = 0.92;
    fighter.scaleY = 1.10;

    if (fighter.isHero) {
      const chain = COMBO_CHAINS[fighter.activeComboIndex % COMBO_CHAINS.length];
      this.activeComboNameRu = chain.nameRu;
      this.activeStuntBanner = `УДАР: ${spec.nameRu}`;
      this.activeStuntTimer = 1.8;
      if (spec.category === 'spin_kick' || spec.category === 'acrobatic') {
        this.stuntsPerformed++;
      }
    }

    this.events.push({
      type: 'whoosh',
      pos: { ...fighter.pos },
      weight: spec.category === 'spin_kick' ? 0.75 : 0.45,
      stuntName: spec.nameRu,
    });
  }

  private startHeroStunt(
    hero: Fighter,
    maneuver: StuntManeuverSpec,
    prop: InteractiveProp | null
  ): void {
    hero.state = 'stunt';
    hero.stateTimer = 0;
    hero.stateDuration = maneuver.duration;
    hero.activeStunt = maneuver;
    hero.activeStrikeId = null;
    hero.stuntPropId = prop ? prop.id : null;
    hero.ragdollBlend = 0.02;
    hero.scaleX = 0.86;
    hero.scaleY = 1.18;

    if (prop && (prop.type === 'chair' || prop.type === 'ladder' || prop.type === 'bamboo_pole')) {
      prop.heldByFighterId = hero.id;
      hero.heldPropId = prop.id;
    }

    this.stuntsPerformed++;
    this.activeStuntBanner = `ТРЮК: ${maneuver.titleRu}`;
    this.activeStuntTimer = 2.6;

    this.events.push({
      type: 'stunt_start',
      pos: { ...hero.pos },
      weight: 0.9,
      stuntName: maneuver.titleRu,
    });
  }

  public step(rawDt: number): SimEvent[] {
    const dt = clamp(rawDt, 0.001, 0.05);
    this.events = [];
    this.elapsedSeconds += dt;

    // Decay hitFlash, trauma, and timers even during hitstop
    this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.85);
    if (this.activeStuntTimer > 0) {
      this.activeStuntTimer = Math.max(0, this.activeStuntTimer - dt);
    }
    if (this.comboResetTimer > 0) {
      this.comboResetTimer = Math.max(0, this.comboResetTimer - dt);
      if (this.comboResetTimer === 0) {
        this.comboCount = 0;
      }
    }

    for (const f of this.fighters) {
      if (f.hitFlash > 0) f.hitFlash = Math.max(0, f.hitFlash - dt * 6);
      f.scaleX += (1 - f.scaleX) * Math.min(1, dt * 14);
      f.scaleY += (1 - f.scaleY) * Math.min(1, dt * 14);
    }
    for (const p of this.props) {
      if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt * 6);
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return this.events;
    }

    // Ensure enough unbroken interactive props remain in the arena
    const intactProps = this.props.filter((p) => !p.broken && p.type !== 'pillar');
    if (intactProps.length < 5) {
      this.replenishProps(5);
    }

    // Adjust active enemy count dynamically if user changed targetEnemyCount
    const enemies = this.fighters.filter((f) => !f.isHero);
    if (enemies.length < this.targetEnemyCount) {
      this.spawnEnemyWave(this.targetEnemyCount - enemies.length);
    } else if (enemies.length > this.targetEnemyCount) {
      this.fighters.splice(1 + this.targetEnemyCount);
    }

    // Update AI & fighter state machines
    this.updateHeroAI(dt);
    this.updateEnemiesAI(dt);

    // Update interactive props physics
    this.updatePropsPhysics(dt);

    // Update fighter kinematics & active-ragdoll bone physics
    for (const fighter of this.fighters) {
      this.updateFighterKinematics(fighter, dt);
      this.updateRagdollSkeleton(fighter, dt);
    }

    // Resolve fighter-to-fighter & fighter-to-prop ragdoll collisions
    this.resolveCollisions();

    return this.events;
  }

  private updateHeroAI(dt: number): void {
    const hero = this.getHero();
    if (!hero) return;

    // Autonomous Jackie Chan recovery: hero never stays down long
    if (hero.hp < hero.maxHp * 0.35) {
      hero.hp = Math.min(hero.maxHp, hero.hp + dt * 28);
    }

    hero.stateTimer += dt;

    // Find nearest standing enemy
    const enemies = this.fighters.filter((f) => !f.isHero);
    let nearestEnemy: Fighter | null = null;
    let nearestEnemyDist = 999;

    for (const e of enemies) {
      const weightPenalty =
        e.state === 'ragdoll_air' || e.state === 'ragdoll_ground' ? 3.5 : 0;
      const d = dist2D(hero.pos, e.pos) + weightPenalty;
      if (d < nearestEnemyDist) {
        nearestEnemyDist = d;
        nearestEnemy = e;
      }
    }

    if (hero.state === 'stunt' && hero.activeStunt) {
      const maneuver = hero.activeStunt;
      const prevTime = hero.stateTimer - dt;

      if (nearestEnemy) {
        const dx = nearestEnemy.pos.x - hero.pos.x;
        const dz = nearestEnemy.pos.z - hero.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        hero.targetAngle = Math.atan2(dz, dx);
        if (len > 1.0 && hero.stateTimer < maneuver.hitTime) {
          hero.vel.x = (dx / len) * 6.8;
          hero.vel.z = (dz / len) * 6.8;
        }
      }

      if (prevTime < maneuver.hitTime && hero.stateTimer >= maneuver.hitTime) {
        this.executeStuntImpact(hero, maneuver);
      }

      if (hero.stateTimer >= hero.stateDuration) {
        if (hero.heldPropId) {
          const held = this.props.find((p) => p.id === hero.heldPropId);
          if (held) held.heldByFighterId = null;
          hero.heldPropId = null;
        }
        hero.activeStunt = null;
        hero.stuntPropId = null;
        hero.state = 'stalk';
        hero.stateTimer = 0;
      }
      return;
    }

    if (hero.state === 'attack') {
      const strikeId = (hero.activeStrikeId as MartialStrikeId) || 'jab_cross_snap';
      const spec = MARTIAL_STRIKES[strikeId] ?? MARTIAL_STRIKES.jab_cross_snap;
      const prevTime = hero.stateTimer - dt;

      if (nearestEnemy) {
        const dx = nearestEnemy.pos.x - hero.pos.x;
        const dz = nearestEnemy.pos.z - hero.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        hero.targetAngle = Math.atan2(dz, dx);
        if (len > 1.05 && hero.stateTimer < spec.hitTime) {
          hero.vel.x = (dx / len) * spec.forwardSpeed;
          hero.vel.z = (dz / len) * spec.forwardSpeed;
        }
      }

      const crossedPrimary = prevTime < spec.hitTime && hero.stateTimer >= spec.hitTime;
      const crossedSecondary =
        spec.secondaryHitTime !== undefined &&
        prevTime < spec.secondaryHitTime &&
        hero.stateTimer >= spec.secondaryHitTime;

      if (crossedPrimary || crossedSecondary) {
        this.executeStrikeImpact(hero, spec, crossedSecondary);
      }

      if (hero.stateTimer >= hero.stateDuration) {
        hero.state = 'stalk';
        hero.stateTimer = 0;
        hero.activeStrikeId = null;
      }
      return;
    }

    if (!nearestEnemy) return;

    const dx = nearestEnemy.pos.x - hero.pos.x;
    const dz = nearestEnemy.pos.z - hero.pos.z;
    const distToEnemy = Math.hypot(dx, dz);
    hero.targetAngle = Math.atan2(dz, dx);

    // Look for an interactive prop near hero
    let candidateProp: InteractiveProp | null = null;
    let bestPropScore = 999;

    for (const p of this.props) {
      if (p.broken) continue;
      const dHero = dist2D(hero.pos, p.pos);
      const dEnemy = dist2D(nearestEnemy.pos, p.pos);
      if (dHero < 2.5 && dEnemy < 3.8) {
        const score = dHero + dEnemy * 0.5;
        if (score < bestPropScore) {
          bestPropScore = score;
          candidateProp = p;
        }
      }
    }

    // Balance between environmental prop stunts (28% when near prop) and rich martial arts combo chains (72%)!
    if (candidateProp && distToEnemy < 3.5 && hero.stateTimer > 0.16 && this.prng.chance(0.28)) {
      const stuntByProp: Record<PropType, StuntManeuverId> = {
        table: 'table_vault_kick',
        chair: 'chair_catch_spin',
        ladder: 'ladder_helicopter',
        barrel: 'barrel_roll_sweep',
        crate: 'crate_smash_uppercut',
        bamboo_pole: 'pole_swing_dropkick',
        pillar: 'wall_backflip_counter',
      };
      const stuntId = stuntByProp[candidateProp.type];
      this.startHeroStunt(hero, STUNT_MANEUVERS[stuntId], candidateProp);
      return;
    }

    // Execute diverse multi-hit martial arts combo chains & spinning kicks!
    if (distToEnemy <= 2.65 && hero.stateTimer > 0.08) {
      const currentChain = COMBO_CHAINS[hero.activeComboIndex % COMBO_CHAINS.length];
      const strikeId = currentChain.sequence[hero.comboStep % currentChain.sequence.length];
      const spec = MARTIAL_STRIKES[strikeId];

      hero.comboStep++;
      if (hero.comboStep >= currentChain.sequence.length) {
        hero.comboStep = 0;
        hero.activeComboIndex = (hero.activeComboIndex + 1 + this.prng.int(0, 2)) % COMBO_CHAINS.length;
      }

      this.startFighterStrike(hero, spec);
      return;
    }

    // Move smoothly toward enemy
    const gdx = nearestEnemy.pos.x - hero.pos.x;
    const gdz = nearestEnemy.pos.z - hero.pos.z;
    const glen = Math.hypot(gdx, gdz) || 1;
    const moveSpeed = 5.8;
    hero.vel.x += ((gdx / glen) * moveSpeed - hero.vel.x) * Math.min(1, dt * 10);
    hero.vel.z += ((gdz / glen) * moveSpeed - hero.vel.z) * Math.min(1, dt * 10);
  }

  private executeStrikeImpact(attacker: Fighter, spec: StrikeSpec, isSecondaryHit: boolean): void {
    const isHeavyFinisher =
      spec.category === 'spin_kick' ||
      spec.category === 'acrobatic' ||
      spec.knockback >= 11.5;

    let hitAny = false;
    for (const target of this.fighters) {
      if (target.id === attacker.id) continue;
      if (attacker.isHero === target.isHero) continue;

      const d = dist2D(attacker.pos, target.pos);
      if (d <= spec.range) {
        hitAny = true;
        this.applyStrikeToEnemy(
          attacker,
          target,
          isSecondaryHit ? Math.round(spec.damage * 0.65) : spec.damage,
          isSecondaryHit ? spec.knockback * 0.6 : spec.knockback,
          isSecondaryHit ? spec.upward * 0.5 : spec.upward,
          isHeavyFinisher && !isSecondaryHit
        );
        if (!spec.aoe) break;
      }
    }

    if (!hitAny) {
      this.events.push({ type: 'whoosh', pos: { ...attacker.pos }, weight: 0.45 });
    }
  }

  private executeStuntImpact(hero: Fighter, maneuver: StuntManeuverSpec): void {
    const prop = hero.stuntPropId
      ? this.props.find((p) => p.id === hero.stuntPropId) ?? null
      : null;

    if (prop && !prop.broken) {
      prop.hitFlash = 1.0;
      if (prop.type === 'table' || prop.type === 'crate') {
        prop.hp -= 28;
        if (prop.hp <= 0) {
          this.breakProp(prop, hero.pos);
        }
      } else if (prop.type === 'barrel' || prop.type === 'chair') {
        prop.heldByFighterId = null;
        hero.heldPropId = null;
        prop.vel.x = Math.cos(hero.facingAngle) * 10.5;
        prop.vel.z = Math.sin(hero.facingAngle) * 10.5;
        prop.vel.y = 3.2;
        prop.angVel.x = this.prng.range(-8, 8);
        prop.angVel.z = this.prng.range(-8, 8);
      }
    }

    let hitCount = 0;
    for (const enemy of this.fighters) {
      if (enemy.isHero) continue;
      const d = dist2D(hero.pos, enemy.pos);
      if (d <= maneuver.aoeRadius) {
        hitCount++;
        this.applyStrikeToEnemy(
          hero,
          enemy,
          maneuver.damage,
          maneuver.knockbackForce,
          maneuver.upwardForce,
          true
        );
      }
    }

    if (hitCount === 0) {
      this.events.push({ type: 'whoosh', pos: { ...hero.pos }, weight: 0.6 });
    } else {
      this.hitstopTimer = 0.055;
      this.cameraTrauma = Math.min(1.0, this.cameraTrauma + 0.55);
    }
  }

  private applyStrikeToEnemy(
    attacker: Fighter,
    target: Fighter,
    damage: number,
    knockback: number,
    upward: number,
    isHeavyStunt: boolean
  ): void {
    target.hp -= damage;
    target.hitFlash = 1.0;
    if (attacker.isHero) {
      this.comboCount++;
      this.comboResetTimer = 3.8;
    }

    const dx = target.pos.x - attacker.pos.x;
    const dz = target.pos.z - attacker.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;

    target.vel.x = nx * knockback;
    target.vel.z = nz * knockback;
    target.vel.y = upward;

    target.state = isHeavyStunt || target.hp <= 0 ? 'ragdoll_air' : 'stagger';
    target.stateTimer = 0;
    target.stateDuration = isHeavyStunt ? 1.1 : 0.42;
    target.ragdollBlend = isHeavyStunt || target.hp <= 0 ? 0.92 : 0.45;
    target.scaleX = 1.22;
    target.scaleY = 0.80;

    const boneImpulse = knockback * 0.04;
    target.bones.torso.pos.x += nx * boneImpulse;
    target.bones.torso.pos.z += nz * boneImpulse;
    target.bones.torso.pos.y += upward * 0.025;
    target.bones.head.pos.x += nx * boneImpulse * 1.25;
    target.bones.head.pos.z += nz * boneImpulse * 1.25;

    if (target.hp <= 0) {
      this.knockouts++;
      target.koCount++;
      this.events.push({
        type: 'ko',
        pos: { ...target.pos, y: 1.1 },
        weight: 1.0,
        debrisKind: 'spark',
      });
    } else {
      this.events.push({
        type: isHeavyStunt ? 'heavy_hit' : 'hit',
        pos: { ...target.pos, y: 1.1 },
        weight: isHeavyStunt ? 0.9 : 0.5,
        debrisKind: 'spark',
      });
    }

    if (!isHeavyStunt) {
      this.hitstopTimer = 0.025;
      this.cameraTrauma = Math.min(1.0, this.cameraTrauma + 0.22);
    }
  }

  private breakProp(prop: InteractiveProp, impactOrigin: Vec3): void {
    if (prop.broken) return;
    prop.broken = true;
    prop.hp = 0;
    if (prop.heldByFighterId) {
      const holder = this.fighters.find((f) => f.id === prop.heldByFighterId);
      if (holder) holder.heldPropId = null;
      prop.heldByFighterId = null;
    }
    this.propsBroken++;

    const debrisKind =
      prop.type === 'ladder' || prop.type === 'bamboo_pole' ? 'bamboo' : 'wood';

    this.events.push({
      type: 'prop_break',
      pos: { x: prop.pos.x, y: prop.pos.y + 0.5, z: prop.pos.z },
      weight: 0.95,
      debrisKind,
      stuntName: `${prop.nameRu} вдребезги!`,
    });

    const dx = prop.pos.x - impactOrigin.x;
    const dz = prop.pos.z - impactOrigin.z;
    const len = Math.hypot(dx, dz) || 1;
    prop.vel.x = (dx / len) * 6;
    prop.vel.z = (dz / len) * 6;
  }

  private updateEnemiesAI(dt: number): void {
    const hero = this.getHero();
    if (!hero) return;

    let activeAttackers = 0;
    for (const f of this.fighters) {
      if (!f.isHero && (f.state === 'windup' || f.state === 'attack')) {
        activeAttackers++;
      }
    }

    const enemyStrikeByRole: Record<FighterRole, MartialStrikeId[]> = {
      hero: ['jab_cross_snap'],
      brawler: ['jab_cross_snap', 'chain_punches', 'tiger_uppercut_palm', 'spinning_backfist'],
      acrobat: ['roundhouse_high_kick', 'tornado_kick_540', 'spinning_hook_kick', 'butterfly_twist_kick'],
      enforcer: ['flying_side_kick', 'axe_kick_drop', 'knee_clincher_elbow', 'spinning_backfist'],
      specialist: ['dragon_tail_sweep', 'question_mark_kick', 'spinning_crescent_flurry', 'split_kick_dual'],
    };

    for (let i = 1; i < this.fighters.length; i++) {
      const enemy = this.fighters[i];
      enemy.stateTimer += dt;

      if (enemy.state === 'ragdoll_air') {
        enemy.ragdollBlend = 0.92;
        if (enemy.pos.y <= 0.02 && enemy.stateTimer > 0.28) {
          enemy.state = 'ragdoll_ground';
          enemy.stateTimer = 0;
          enemy.stateDuration = enemy.hp <= 0 ? 1.1 : 0.6;
        }
        continue;
      }

      if (enemy.state === 'ragdoll_ground') {
        enemy.ragdollBlend = 0.85;
        enemy.vel.x *= Math.pow(0.05, dt);
        enemy.vel.z *= Math.pow(0.05, dt);
        if (enemy.stateTimer >= enemy.stateDuration) {
          if (enemy.hp <= 0) {
            this.respawnDefeatedEnemy(enemy, i);
          } else {
            enemy.state = 'getup';
            enemy.stateTimer = 0;
            enemy.stateDuration = 0.42;
          }
        }
        continue;
      }

      if (enemy.state === 'getup') {
        enemy.ragdollBlend = Math.max(0.06, 0.8 * (1 - enemy.stateTimer / enemy.stateDuration));
        if (enemy.stateTimer >= enemy.stateDuration) {
          enemy.state = 'approach';
          enemy.stateTimer = 0;
          enemy.ragdollBlend = 0.06;
        }
        continue;
      }

      if (enemy.state === 'stagger') {
        enemy.ragdollBlend = 0.38;
        if (enemy.stateTimer >= enemy.stateDuration) {
          enemy.state = 'approach';
          enemy.stateTimer = 0;
          enemy.ragdollBlend = 0.06;
        }
        continue;
      }

      const dx = hero.pos.x - enemy.pos.x;
      const dz = hero.pos.z - enemy.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      enemy.targetAngle = Math.atan2(dz, dx);

      if (enemy.state === 'windup') {
        enemy.vel.x *= 0.85;
        enemy.vel.z *= 0.85;
        if (enemy.stateTimer >= enemy.stateDuration) {
          const roleMoves = enemyStrikeByRole[enemy.role] ?? enemyStrikeByRole.brawler;
          const chosenMove = roleMoves[enemy.comboStep % roleMoves.length];
          enemy.comboStep++;
          this.startFighterStrike(enemy, MARTIAL_STRIKES[chosenMove]);
        }
        continue;
      }

      if (enemy.state === 'attack') {
        const prevTime = enemy.stateTimer - dt;
        const strikeSpec =
          MARTIAL_STRIKES[(enemy.activeStrikeId as MartialStrikeId) || 'jab_cross_snap'] ??
          MARTIAL_STRIKES.jab_cross_snap;

        if (prevTime < strikeSpec.hitTime && enemy.stateTimer >= strikeSpec.hitTime && dist <= 2.15) {
          if (hero.state !== 'stunt' && hero.state !== 'attack') {
            hero.hitFlash = 0.45;
            this.events.push({
              type: 'hit',
              pos: { x: (hero.pos.x + enemy.pos.x) * 0.5, y: 1.2, z: (hero.pos.z + enemy.pos.z) * 0.5 },
              weight: 0.35,
              debrisKind: 'spark',
            });
          }
        }
        if (enemy.stateTimer >= enemy.stateDuration) {
          enemy.state = 'stalk';
          enemy.stateTimer = 0;
          enemy.stateDuration = this.prng.range(0.35, 0.75);
          enemy.activeStrikeId = null;
        }
        continue;
      }

      const slotAngle = (i / Math.max(1, this.fighters.length - 1)) * Math.PI * 2 + this.elapsedSeconds * 0.55;
      let desiredDist = 2.05;
      let speed = 3.9;
      let strafeFactor = 0.35;

      if (enemy.role === 'acrobat') {
        desiredDist = 2.45;
        speed = 4.9;
        strafeFactor = 0.82;
      } else if (enemy.role === 'enforcer') {
        desiredDist = 1.75;
        speed = 3.3;
        strafeFactor = 0.12;
      } else if (enemy.role === 'specialist') {
        desiredDist = 2.3;
        speed = 4.2;
        strafeFactor = 0.55;
      }

      const targetX = hero.pos.x - Math.cos(slotAngle) * desiredDist * strafeFactor;
      const targetZ = hero.pos.z - Math.sin(slotAngle) * desiredDist * strafeFactor;
      const tdx = targetX - enemy.pos.x;
      const tdz = targetZ - enemy.pos.z;
      const tlen = Math.hypot(tdx, tdz) || 1;

      if (dist > 1.85) {
        enemy.vel.x += ((tdx / tlen) * speed - enemy.vel.x) * Math.min(1, dt * 7);
        enemy.vel.z += ((tdz / tlen) * speed - enemy.vel.z) * Math.min(1, dt * 7);
      } else {
        enemy.vel.x *= 0.82;
        enemy.vel.z *= 0.82;
        if (activeAttackers < 2 && enemy.stateTimer > 0.38) {
          enemy.state = 'windup';
          enemy.stateTimer = 0;
          enemy.stateDuration = 0.24;
          activeAttackers++;
        }
      }
    }
  }

  private respawnDefeatedEnemy(enemy: Fighter, index: number): void {
    this.waveNumber++;
    const spawnAngle = this.prng.range(0, Math.PI * 2);
    const spawnRadius = this.arenaRadius - 1.2;
    enemy.pos.x = Math.cos(spawnAngle) * spawnRadius;
    enemy.pos.y = 0;
    enemy.pos.z = Math.sin(spawnAngle) * spawnRadius;
    enemy.vel.x = -Math.cos(spawnAngle) * 4.5;
    enemy.vel.y = 2.5;
    enemy.vel.z = -Math.sin(spawnAngle) * 4.5;
    enemy.hp = enemy.maxHp;
    enemy.state = 'approach';
    enemy.stateTimer = 0;
    enemy.activeStrikeId = null;
    enemy.ragdollBlend = 0.06;
    enemy.bones = createInitialBones(enemy.pos);
    const roles: FighterRole[] = ['brawler', 'acrobat', 'enforcer', 'specialist'];
    enemy.role = roles[(index + this.waveNumber) % roles.length];
  }

  private updatePropsPhysics(dt: number): void {
    const hero = this.getHero();

    for (const p of this.props) {
      if (p.broken || p.type === 'pillar') continue;

      if (p.heldByFighterId && hero && p.heldByFighterId === hero.id) {
        const spinAngle = hero.facingAngle + hero.stateTimer * 14.0;
        p.pos.x = hero.pos.x + Math.cos(spinAngle) * 0.85;
        p.pos.y = hero.pos.y + 1.05;
        p.pos.z = hero.pos.z + Math.sin(spinAngle) * 0.85;
        p.rot.y = spinAngle;
        p.rot.z = Math.PI * 0.38;
        continue;
      }

      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;

      p.rot.x += p.angVel.x * dt;
      p.rot.y += p.angVel.y * dt;
      p.rot.z += p.angVel.z * dt;

      if (p.pos.y > 0) {
        p.vel.y -= 18.0 * dt;
      } else {
        p.pos.y = 0;
        if (p.vel.y < -3.5) {
          p.vel.y = -p.vel.y * 0.32;
        } else {
          p.vel.y = 0;
        }
        p.vel.x *= Math.pow(0.08, dt);
        p.vel.z *= Math.pow(0.08, dt);
        p.angVel.x *= Math.pow(0.05, dt);
        p.angVel.y *= Math.pow(0.05, dt);
        p.angVel.z *= Math.pow(0.05, dt);
        p.rot.x *= Math.pow(0.1, dt);
        p.rot.z *= Math.pow(0.1, dt);
      }

      const d = Math.hypot(p.pos.x, p.pos.z);
      if (d > this.arenaRadius - p.radius) {
        const nx = p.pos.x / d;
        const nz = p.pos.z / d;
        p.pos.x = nx * (this.arenaRadius - p.radius);
        p.pos.z = nz * (this.arenaRadius - p.radius);
        p.vel.x = -p.vel.x * 0.5;
        p.vel.z = -p.vel.z * 0.5;
      }
    }
  }

  private updateFighterKinematics(f: Fighter, dt: number): void {
    let angleDiff = f.targetAngle - f.facingAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    f.facingAngle += angleDiff * Math.min(1, dt * 12);

    const horizSpeed = Math.hypot(f.vel.x, f.vel.z);
    f.gaitPhase += horizSpeed * dt * 3.4;

    f.pos.x += f.vel.x * dt;
    f.pos.y += f.vel.y * dt;
    f.pos.z += f.vel.z * dt;

    if (f.pos.y > 0 || f.vel.y > 0) {
      f.vel.y -= 19.5 * dt;
      if (f.pos.y <= 0 && f.vel.y <= 0) {
        f.pos.y = 0;
        f.vel.y = 0;
        f.scaleX = 1.16;
        f.scaleY = 0.84;
      }
    } else {
      f.pos.y = 0;
      f.vel.y = 0;
    }

    if (f.pos.y <= 0.01 && f.state !== 'stunt' && f.state !== 'attack') {
      f.vel.x *= Math.pow(0.12, dt);
      f.vel.z *= Math.pow(0.12, dt);
    }

    const r = Math.hypot(f.pos.x, f.pos.z);
    const maxR = this.arenaRadius - 0.65;
    if (r > maxR) {
      const nx = f.pos.x / r;
      const nz = f.pos.z / r;
      f.pos.x = nx * maxR;
      f.pos.z = nz * maxR;
      f.vel.x *= -0.4;
      f.vel.z *= -0.4;
    }
  }

  private updateRagdollSkeleton(f: Fighter, dt: number): void {
    // 1. Compute anatomically accurate Two-Bone IK Martial Arts pose
    const pose = computeMartialArtsPose({
      pos: f.pos,
      facingAngle: f.facingAngle,
      gaitPhase: f.gaitPhase,
      isAttacking: f.state === 'attack',
      strikeId: (f.activeStrikeId as MartialStrikeId) ?? null,
      strikeProgress: f.stateDuration > 0 ? f.stateTimer / f.stateDuration : 0,
      isStunt: f.state === 'stunt',
      stuntId: f.activeStunt ? f.activeStunt.id : null,
      stuntProgress: f.stateDuration > 0 ? f.stateTimer / f.stateDuration : 0,
    });

    f.visualYaw = pose.visualYaw;
    f.torsoPitch = pose.torsoPitch;
    f.torsoRoll = pose.torsoRoll;

    f.bones.pelvis.targetPos = pose.pelvisPos;
    f.bones.torso.targetPos = pose.torsoPos;
    f.bones.head.targetPos = pose.headPos;
    f.bones.elbowL.targetPos = pose.elbowL;
    f.bones.handL.targetPos = pose.handL;
    f.bones.elbowR.targetPos = pose.elbowR;
    f.bones.handR.targetPos = pose.handR;
    f.bones.kneeL.targetPos = pose.kneeL;
    f.bones.footL.targetPos = pose.footL;
    f.bones.kneeR.targetPos = pose.kneeR;
    f.bones.footR.targetPos = pose.footR;

    const boneList = Object.values(f.bones);

    // 2. When fighter is in active martial arts control (ragdollBlend < 0.35),
    // drive limbs directly with the anatomical Two-Bone IK solver so knees & kicks never lag or invert!
    if (f.ragdollBlend < 0.35) {
      for (const b of boneList) {
        b.prevPos.x = b.pos.x;
        b.prevPos.y = b.pos.y;
        b.prevPos.z = b.pos.z;
        b.pos.x = b.targetPos.x;
        b.pos.y = Math.max(b.radius, b.targetPos.y);
        b.pos.z = b.targetPos.z;
      }
      return;
    }

    // 3. When fighter is in ragdoll tumble/stagger (ragdollBlend >= 0.35),
    // run Verlet physics + distance constraints AND enforce anatomical knee/elbow IK pole constraints!
    const muscleStiffness = clamp(1 - f.ragdollBlend, 0.04, 0.95);
    const damping = 0.95;
    const gravity = -16.5;

    for (const b of boneList) {
      const vx = (b.pos.x - b.prevPos.x) * damping;
      const vy = (b.pos.y - b.prevPos.y) * damping;
      const vz = (b.pos.z - b.prevPos.z) * damping;

      b.prevPos.x = b.pos.x;
      b.prevPos.y = b.pos.y;
      b.prevPos.z = b.pos.z;

      b.pos.x += vx;
      b.pos.y += vy + gravity * dt * dt;
      b.pos.z += vz;

      b.pos.x += (b.targetPos.x - b.pos.x) * muscleStiffness;
      b.pos.y += (b.targetPos.y - b.pos.y) * muscleStiffness;
      b.pos.z += (b.targetPos.z - b.pos.z) * muscleStiffness;
    }

    for (let iter = 0; iter < 3; iter++) {
      for (const c of f.constraints) {
        const bA = f.bones[c.boneA];
        const bB = f.bones[c.boneB];
        const dx = bB.pos.x - bA.pos.x;
        const dy = bB.pos.y - bA.pos.y;
        const dz = bB.pos.z - bA.pos.z;
        const dist = Math.hypot(dx, dy, dz) || 0.0001;
        const diff = (dist - c.restLength) / dist;
        const corrX = dx * 0.5 * diff;
        const corrY = dy * 0.5 * diff;
        const corrZ = dz * 0.5 * diff;

        bA.pos.x += corrX;
        bA.pos.y += corrY;
        bA.pos.z += corrZ;

        bB.pos.x -= corrX;
        bB.pos.y -= corrY;
        bB.pos.z -= corrZ;
      }

      for (const b of boneList) {
        if (b.pos.y < b.radius) {
          b.pos.y = b.radius;
        }
      }
    }

    // Re-project ragdoll knees via anatomical Two-Bone IK so knees NEVER bend backward even during ragdoll flight!
    const cos = Math.cos(f.visualYaw);
    const sin = Math.sin(f.visualYaw);
    const rightX = -sin;
    const rightZ = cos;

    const hipL: Vec3 = {
      x: f.bones.pelvis.pos.x + rightX * -0.14,
      y: f.bones.pelvis.pos.y,
      z: f.bones.pelvis.pos.z + rightZ * -0.14,
    };
    const hipR: Vec3 = {
      x: f.bones.pelvis.pos.x + rightX * 0.14,
      y: f.bones.pelvis.pos.y,
      z: f.bones.pelvis.pos.z + rightZ * 0.14,
    };

    const poleWorld: Vec3 = { x: cos, y: 0.85, z: sin };
    const fixedLegL = solveTwoBoneIK(hipL, f.bones.footL.pos, 0.42, 0.42, poleWorld);
    const fixedLegR = solveTwoBoneIK(hipR, f.bones.footR.pos, 0.42, 0.42, poleWorld);

    f.bones.kneeL.pos = {
      x: fixedLegL.midPos.x,
      y: Math.max(f.bones.kneeL.radius, fixedLegL.midPos.y),
      z: fixedLegL.midPos.z,
    };
    f.bones.kneeR.pos = {
      x: fixedLegR.midPos.x,
      y: Math.max(f.bones.kneeR.radius, fixedLegR.midPos.y),
      z: fixedLegR.midPos.z,
    };
  }

  private resolveCollisions(): void {
    for (let i = 0; i < this.fighters.length; i++) {
      for (let j = i + 1; j < this.fighters.length; j++) {
        const a = this.fighters[i];
        const b = this.fighters[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz) || 0.001;
        const minSep = 0.78;
        if (d < minSep) {
          const overlap = (minSep - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          a.pos.x -= nx * overlap;
          a.pos.z -= nz * overlap;
          b.pos.x += nx * overlap;
          b.pos.z += nz * overlap;
        }
      }
    }

    for (const p of this.props) {
      if (p.broken || p.heldByFighterId) continue;

      const propSpeed = Math.hypot(p.vel.x, p.vel.z);
      if (propSpeed > 3.5) {
        for (const f of this.fighters) {
          if (f.isHero) continue;
          if (dist2D(p.pos, f.pos) < p.radius + 0.52) {
            this.applyStrikeToEnemy(this.getHero(), f, 32, 11.0, 5.8, true);
            if (p.breakable) {
              this.breakProp(p, f.pos);
              break;
            }
          }
        }
      }

      if (p.broken) continue;

      for (const f of this.fighters) {
        const d = dist2D(f.pos, p.pos);
        const minDist = p.radius + 0.45;
        if (d < minDist) {
          if (
            !f.isHero &&
            (f.state === 'ragdoll_air' || f.state === 'stagger') &&
            p.breakable
          ) {
            this.breakProp(p, f.pos);
            break;
          } else if (f.state !== 'stunt') {
            const dx = f.pos.x - p.pos.x;
            const dz = f.pos.z - p.pos.z;
            const len = Math.hypot(dx, dz) || 0.001;
            const push = minDist - len;
            f.pos.x += (dx / len) * push;
            f.pos.z += (dz / len) * push;
          }
        }
      }
    }
  }

  public getStats(): SimulationStats {
    return {
      seed: this.prng.seedString,
      themeId: this.theme.id,
      themeNameRu: this.theme.nameRu,
      waveNumber: this.waveNumber,
      stuntsPerformed: this.stuntsPerformed,
      propsBroken: this.propsBroken,
      knockouts: this.knockouts,
      comboCount: this.comboCount,
      activeComboNameRu: this.activeComboNameRu,
      activeStuntBanner: this.activeStuntBanner,
      activeStuntTimer: this.activeStuntTimer,
      activeEnemies: this.fighters.length - 1,
      remainingProps: this.props.filter((p) => !p.broken && p.type !== 'pillar').length,
      elapsedSeconds: this.elapsedSeconds,
    };
  }
}
