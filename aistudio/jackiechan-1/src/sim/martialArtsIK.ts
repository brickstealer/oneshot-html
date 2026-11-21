import { Vec3 } from './types';

export type MartialStrikeId =
  | 'jab_cross_snap'
  | 'chain_punches'
  | 'spinning_backfist'
  | 'tiger_uppercut_palm'
  | 'roundhouse_high_kick'
  | 'tornado_kick_540'
  | 'spinning_hook_kick'
  | 'axe_kick_drop'
  | 'flying_side_kick'
  | 'dragon_tail_sweep'
  | 'double_jump_front_kick'
  | 'butterfly_twist_kick'
  | 'drunken_sway_backkick'
  | 'knee_clincher_elbow'
  | 'split_kick_dual'
  | 'question_mark_kick'
  | 'spinning_crescent_flurry';

export interface StrikeSpec {
  id: MartialStrikeId;
  nameRu: string;
  category: 'punch' | 'kick' | 'spin_kick' | 'acrobatic';
  duration: number;
  hitTime: number;
  secondaryHitTime?: number;
  damage: number;
  knockback: number;
  upward: number;
  range: number;
  aoe: boolean;
  forwardSpeed: number;
  jumpHeight: number;
  spinRotations: number; // e.g. 1 = 360 deg, 1.5 = 540 deg
}

export interface ComboChainSpec {
  id: string;
  nameRu: string;
  sequence: MartialStrikeId[];
}

export const MARTIAL_STRIKES: Record<MartialStrikeId, StrikeSpec> = {
  jab_cross_snap: {
    id: 'jab_cross_snap',
    nameRu: 'Двойной пробивной кулак',
    category: 'punch',
    duration: 0.36,
    hitTime: 0.14,
    secondaryHitTime: 0.27,
    damage: 18,
    knockback: 5.5,
    upward: 1.8,
    range: 2.15,
    aoe: false,
    forwardSpeed: 4.5,
    jumpHeight: 0,
    spinRotations: 0,
  },
  chain_punches: {
    id: 'chain_punches',
    nameRu: 'Пулемётная серия Вин-Чун (5 ударов)',
    category: 'punch',
    duration: 0.48,
    hitTime: 0.16,
    secondaryHitTime: 0.36,
    damage: 24,
    knockback: 6.8,
    upward: 2.2,
    range: 2.1,
    aoe: false,
    forwardSpeed: 5.2,
    jumpHeight: 0,
    spinRotations: 0,
  },
  spinning_backfist: {
    id: 'spinning_backfist',
    nameRu: 'Удар кулаком с разворота 360° (Бэкфист)',
    category: 'punch',
    duration: 0.44,
    hitTime: 0.25,
    damage: 28,
    knockback: 9.2,
    upward: 3.2,
    range: 2.35,
    aoe: true,
    forwardSpeed: 5.6,
    jumpHeight: 0.12,
    spinRotations: 1.0,
  },
  tiger_uppercut_palm: {
    id: 'tiger_uppercut_palm',
    nameRu: 'Восходящий апперкот «Коготь Тигра»',
    category: 'punch',
    duration: 0.42,
    hitTime: 0.22,
    damage: 32,
    knockback: 8.5,
    upward: 7.4,
    range: 2.1,
    aoe: false,
    forwardSpeed: 4.8,
    jumpHeight: 0.28,
    spinRotations: 0,
  },
  roundhouse_high_kick: {
    id: 'roundhouse_high_kick',
    nameRu: 'Высокий круговой маваши-гери в голову',
    category: 'kick',
    duration: 0.46,
    hitTime: 0.24,
    damage: 30,
    knockback: 10.4,
    upward: 4.8,
    range: 2.45,
    aoe: false,
    forwardSpeed: 4.6,
    jumpHeight: 0.08,
    spinRotations: 0,
  },
  tornado_kick_540: {
    id: 'tornado_kick_540',
    nameRu: 'Торнадо-вертушка 540° в прыжке',
    category: 'spin_kick',
    duration: 0.64,
    hitTime: 0.38,
    damage: 42,
    knockback: 13.8,
    upward: 7.2,
    range: 2.85,
    aoe: true,
    forwardSpeed: 6.4,
    jumpHeight: 0.92,
    spinRotations: 1.5,
  },
  spinning_hook_kick: {
    id: 'spinning_hook_kick',
    nameRu: 'Вертушка пяткой с разворота 360° (Ура-маваши)',
    category: 'spin_kick',
    duration: 0.52,
    hitTime: 0.30,
    damage: 36,
    knockback: 12.6,
    upward: 5.6,
    range: 2.65,
    aoe: true,
    forwardSpeed: 5.2,
    jumpHeight: 0.18,
    spinRotations: 1.0,
  },
  axe_kick_drop: {
    id: 'axe_kick_drop',
    nameRu: 'Рубящий удар пяткой сверху «Топор»',
    category: 'kick',
    duration: 0.54,
    hitTime: 0.32,
    damage: 35,
    knockback: 9.8,
    upward: 4.2,
    range: 2.4,
    aoe: false,
    forwardSpeed: 4.4,
    jumpHeight: 0.15,
    spinRotations: 0,
  },
  flying_side_kick: {
    id: 'flying_side_kick',
    nameRu: 'Летящий боковой удар в прыжке (Йоко-тоби-гери)',
    category: 'acrobatic',
    duration: 0.58,
    hitTime: 0.28,
    damage: 38,
    knockback: 14.2,
    upward: 6.4,
    range: 2.9,
    aoe: false,
    forwardSpeed: 7.5,
    jumpHeight: 0.78,
    spinRotations: 0,
  },
  dragon_tail_sweep: {
    id: 'dragon_tail_sweep',
    nameRu: 'Нижняя вертушка-подсечка 360° «Хвост Дракона»',
    category: 'spin_kick',
    duration: 0.56,
    hitTime: 0.28,
    damage: 31,
    knockback: 10.8,
    upward: 6.8,
    range: 2.75,
    aoe: true,
    forwardSpeed: 4.8,
    jumpHeight: 0,
    spinRotations: 1.0,
  },
  double_jump_front_kick: {
    id: 'double_jump_front_kick',
    nameRu: 'Двойной велосипедный удар ногами в воздухе',
    category: 'acrobatic',
    duration: 0.60,
    hitTime: 0.24,
    secondaryHitTime: 0.42,
    damage: 34,
    knockback: 11.8,
    upward: 6.5,
    range: 2.6,
    aoe: false,
    forwardSpeed: 6.0,
    jumpHeight: 0.85,
    spinRotations: 0,
  },
  butterfly_twist_kick: {
    id: 'butterfly_twist_kick',
    nameRu: 'Горизонтальная вертушка «Бабочка» (Сюаньцзы)',
    category: 'spin_kick',
    duration: 0.66,
    hitTime: 0.36,
    damage: 40,
    knockback: 13.4,
    upward: 7.0,
    range: 2.95,
    aoe: true,
    forwardSpeed: 6.2,
    jumpHeight: 0.88,
    spinRotations: 1.0,
  },
  drunken_sway_backkick: {
    id: 'drunken_sway_backkick',
    nameRu: 'Уклонение Пьяного Мастера и удар пяткой с разворота',
    category: 'kick',
    duration: 0.50,
    hitTime: 0.28,
    damage: 34,
    knockback: 12.2,
    upward: 5.4,
    range: 2.5,
    aoe: false,
    forwardSpeed: 4.2,
    jumpHeight: 0.1,
    spinRotations: 0.5,
  },
  knee_clincher_elbow: {
    id: 'knee_clincher_elbow',
    nameRu: 'Взрывное колено в прыжке + рубящий локоть',
    category: 'acrobatic',
    duration: 0.48,
    hitTime: 0.20,
    secondaryHitTime: 0.36,
    damage: 33,
    knockback: 10.2,
    upward: 5.8,
    range: 2.2,
    aoe: false,
    forwardSpeed: 5.8,
    jumpHeight: 0.52,
    spinRotations: 0,
  },
  split_kick_dual: {
    id: 'split_kick_dual',
    nameRu: 'Двойной удар в шпагате в прыжке (Шуан-фэй)',
    category: 'acrobatic',
    duration: 0.62,
    hitTime: 0.32,
    damage: 39,
    knockback: 13.0,
    upward: 6.8,
    range: 3.1,
    aoe: true,
    forwardSpeed: 5.0,
    jumpHeight: 0.90,
    spinRotations: 0,
  },
  question_mark_kick: {
    id: 'question_mark_kick',
    nameRu: 'Хлёсткий удар-обманка «Бразильский кик»',
    category: 'kick',
    duration: 0.46,
    hitTime: 0.25,
    damage: 31,
    knockback: 10.6,
    upward: 5.0,
    range: 2.5,
    aoe: false,
    forwardSpeed: 4.8,
    jumpHeight: 0.12,
    spinRotations: 0,
  },
  spinning_crescent_flurry: {
    id: 'spinning_crescent_flurry',
    nameRu: 'Каскад из двух полумесяц-вертушек 720°',
    category: 'spin_kick',
    duration: 0.68,
    hitTime: 0.26,
    secondaryHitTime: 0.50,
    damage: 41,
    knockback: 13.5,
    upward: 6.9,
    range: 2.85,
    aoe: true,
    forwardSpeed: 6.0,
    jumpHeight: 0.65,
    spinRotations: 2.0,
  },
};

export const COMBO_CHAINS: ComboChainSpec[] = [
  {
    id: 'dragon_whirlwind',
    nameRu: 'Вихрь Дракона (Кулаки + Маваши + Торнадо 540°)',
    sequence: [
      'jab_cross_snap',
      'roundhouse_high_kick',
      'spinning_hook_kick',
      'tornado_kick_540',
    ],
  },
  {
    id: 'wing_chun_storm',
    nameRu: 'Шторм Вин-Чун (Пулемётная серия + Локоть + Шпагат)',
    sequence: [
      'chain_punches',
      'knee_clincher_elbow',
      'spinning_backfist',
      'split_kick_dual',
    ],
  },
  {
    id: 'spinning_hurricane',
    nameRu: 'Каскад Вертушек (Ура-маваши + Подсечка + Бабочка)',
    sequence: [
      'question_mark_kick',
      'spinning_hook_kick',
      'dragon_tail_sweep',
      'butterfly_twist_kick',
    ],
  },
  {
    id: 'drunken_acrobat',
    nameRu: 'Стиль Пьяного Мастера (Апперкот + Топор + Велосипед)',
    sequence: [
      'drunken_sway_backkick',
      'tiger_uppercut_palm',
      'axe_kick_drop',
      'double_jump_front_kick',
    ],
  },
  {
    id: 'hong_kong_rush',
    nameRu: 'Гонконгский Экспресс (Боковой в полёте + Каскад 720°)',
    sequence: [
      'jab_cross_snap',
      'flying_side_kick',
      'spinning_crescent_flurry',
    ],
  },
];

export interface AnatomicalPoseResult {
  pelvisPos: Vec3;
  torsoPos: Vec3;
  headPos: Vec3;
  elbowL: Vec3;
  handL: Vec3;
  elbowR: Vec3;
  handR: Vec3;
  kneeL: Vec3;
  footL: Vec3;
  kneeR: Vec3;
  footR: Vec3;
  visualYaw: number;
  torsoPitch: number;
  torsoRoll: number;
}

/**
 * Exact Anatomical Two-Bone Inverse Kinematics Solver.
 * Guarantees that the mid-joint (knee or elbow) ALWAYS bends along the anatomical poleDir
 * and NEVER hyper-extends or inverts backward ("flamingo leg").
 */
export function solveTwoBoneIK(
  rootPos: Vec3,
  endTargetPos: Vec3,
  upperLen: number,
  lowerLen: number,
  poleDir: Vec3
): { midPos: Vec3; endPos: Vec3 } {
  const dx = endTargetPos.x - rootPos.x;
  const dy = endTargetPos.y - rootPos.y;
  const dz = endTargetPos.z - rootPos.z;

  const rawDist = Math.hypot(dx, dy, dz) || 0.0001;
  const maxReach = upperLen + lowerLen - 0.006;
  const minReach = Math.abs(upperLen - lowerLen) + 0.02;
  const clampedDist = Math.max(minReach, Math.min(maxReach, rawDist));

  // Unit vector from root (hip/shoulder) toward end target (foot/hand)
  const ax = dx / rawDist;
  const ay = dy / rawDist;
  const az = dz / rawDist;

  const endPos: Vec3 = {
    x: rootPos.x + ax * clampedDist,
    y: rootPos.y + ay * clampedDist,
    z: rootPos.z + az * clampedDist,
  };

  // Law of cosines for angle alpha at root joint
  const cosAlpha = Math.max(
    -1,
    Math.min(
      1,
      (upperLen * upperLen + clampedDist * clampedDist - lowerLen * lowerLen) /
        (2 * upperLen * clampedDist)
    )
  );
  const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));

  // Orthonormalize poleDir against the (ax, ay, az) axis so knee/elbow points strictly toward poleDir
  const dotPole = poleDir.x * ax + poleDir.y * ay + poleDir.z * az;
  let px = poleDir.x - ax * dotPole;
  let py = poleDir.y - ay * dotPole;
  let pz = poleDir.z - az * dotPole;
  let pLen = Math.hypot(px, py, pz);

  if (pLen < 0.0001) {
    // Fallback orthogonal vector (upward/forward)
    px = -ay;
    py = ax;
    pz = 0.2;
    pLen = Math.hypot(px, py, pz) || 1;
  }
  px /= pLen;
  py /= pLen;
  pz /= pLen;

  const midPos: Vec3 = {
    x: rootPos.x + ax * (upperLen * cosAlpha) + px * (upperLen * sinAlpha),
    y: rootPos.y + ay * (upperLen * cosAlpha) + py * (upperLen * sinAlpha),
    z: rootPos.z + az * (upperLen * cosAlpha) + pz * (upperLen * sinAlpha),
  };

  return { midPos, endPos };
}

function smoothStep01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Computes a complete, anatomically natural 3D martial arts skeletal pose for any strike, stunt, or gait phase.
 */
export function computeMartialArtsPose(params: {
  pos: Vec3;
  facingAngle: number;
  gaitPhase: number;
  isAttacking: boolean;
  strikeId: MartialStrikeId | null;
  strikeProgress: number; // 0..1
  isStunt: boolean;
  stuntId: string | null;
  stuntProgress: number; // 0..1
}): AnatomicalPoseResult {
  const {
    pos,
    facingAngle,
    gaitPhase,
    isAttacking,
    strikeId,
    strikeProgress,
    isStunt,
    stuntId,
    stuntProgress,
  } = params;

  const p = isAttacking ? Math.max(0, Math.min(1, strikeProgress)) : isStunt ? Math.max(0, Math.min(1, stuntProgress)) : 0;
  // Plateau impact curve: fast chamber (0..0.25), full extension hold (0.25..0.68), smooth retraction (0.68..1.0)
  const impactArc =
    p < 0.25
      ? smoothStep01(p / 0.25)
      : p < 0.68
        ? 1.0
        : smoothStep01((1 - p) / 0.32);

  let spinYawOffset = 0;
  let torsoPitch = 0.08; // Positive = lean forward, Negative = lean back to counterbalance high kick
  let torsoRoll = 0; // Side tilt for side kicks / roundhouse kicks
  let pelvisDrop = 0;
  let jumpArcY = 0;

  // Local coordinate offsets relative to facing + spin rotation:
  // fwd = +X, up = +Y, right = +Z
  let footLTargetLocal = { fwd: 0, up: 0.08, right: -0.17 };
  let footRTargetLocal = { fwd: 0, up: 0.08, right: 0.17 };
  let handLTargetLocal = { fwd: 0.30, up: 1.24, right: -0.22 };
  let handRTargetLocal = { fwd: 0.34, up: 1.26, right: 0.22 };

  // Knee pole directions in local character space ( MUST have up >= 0.4 and fwd >= 0.5 so knees NEVER bend down/backward )
  let kneeLPoleLocal = { fwd: 1.0, up: 0.55, right: -0.18 };
  let kneeRPoleLocal = { fwd: 1.0, up: 0.55, right: 0.18 };

  if (!isAttacking && !isStunt) {
    // Agile Kung-Fu Footwork & Guard Bounce
    const bob = Math.sin(gaitPhase * 2) * 0.04;
    const stride = Math.sin(gaitPhase) * 0.26;
    const liftL = Math.max(0, Math.cos(gaitPhase)) * 0.11;
    const liftR = Math.max(0, -Math.cos(gaitPhase)) * 0.11;

    pelvisDrop = bob;
    footLTargetLocal = { fwd: stride, up: 0.08 + liftL, right: -0.17 };
    footRTargetLocal = { fwd: -stride, up: 0.08 + liftR, right: 0.17 };
    handLTargetLocal = { fwd: 0.32 + Math.sin(gaitPhase) * 0.05, up: 1.26 + bob, right: -0.21 };
    handRTargetLocal = { fwd: 0.38 - Math.sin(gaitPhase) * 0.05, up: 1.30 + bob, right: 0.21 };
  } else if (isAttacking && strikeId) {
    const spec = MARTIAL_STRIKES[strikeId];
    jumpArcY = Math.sin(p * Math.PI) * spec.jumpHeight;
    spinYawOffset = smoothStep01(p) * spec.spinRotations * Math.PI * 2;

    switch (strikeId) {
      case 'jab_cross_snap': {
        const jabPhase = p < 0.5 ? Math.sin(p * 2 * Math.PI) : 0;
        const crossPhase = p >= 0.4 ? Math.sin(((p - 0.4) / 0.6) * Math.PI) : 0;
        torsoPitch = 0.18 * impactArc;
        spinYawOffset = (jabPhase * 0.28 - crossPhase * 0.35);
        handLTargetLocal = { fwd: 0.30 + jabPhase * 0.44, up: 1.34, right: -0.16 + jabPhase * 0.1 };
        handRTargetLocal = { fwd: 0.28 + crossPhase * 0.48, up: 1.36, right: 0.18 - crossPhase * 0.12 };
        footLTargetLocal = { fwd: 0.22 * impactArc, up: 0.08, right: -0.18 };
        footRTargetLocal = { fwd: -0.20 * impactArc, up: 0.08, right: 0.18 };
        break;
      }

      case 'chain_punches': {
        // Rapid 5-hit Wing Chun vertical fist flurry
        const cycleL = Math.max(0, Math.sin(p * Math.PI * 5));
        const cycleR = Math.max(0, Math.sin(p * Math.PI * 5 + Math.PI));
        torsoPitch = 0.20 * impactArc;
        pelvisDrop = -0.06 * impactArc;
        handLTargetLocal = { fwd: 0.32 + cycleL * 0.42, up: 1.32 + cycleL * 0.08, right: -0.09 };
        handRTargetLocal = { fwd: 0.32 + cycleR * 0.42, up: 1.32 + cycleR * 0.08, right: 0.09 };
        footLTargetLocal = { fwd: 0.20, up: 0.08, right: -0.17 };
        footRTargetLocal = { fwd: -0.18, up: 0.08, right: 0.17 };
        break;
      }

      case 'spinning_backfist': {
        torsoPitch = 0.12 * impactArc;
        handRTargetLocal = {
          fwd: 0.45 * impactArc + 0.2,
          up: 1.38,
          right: 0.32 * (1 - impactArc * 0.5),
        };
        handLTargetLocal = { fwd: 0.15, up: 1.24, right: -0.26 };
        footLTargetLocal = { fwd: -0.12, up: 0.08, right: -0.18 };
        footRTargetLocal = { fwd: 0.18 * impactArc, up: 0.08 + jumpArcY * 0.5, right: 0.18 };
        break;
      }

      case 'tiger_uppercut_palm': {
        pelvisDrop = p < 0.35 ? -0.18 : 0.12 * impactArc;
        torsoPitch = -0.12 * impactArc;
        handRTargetLocal = {
          fwd: 0.46 * impactArc + 0.18,
          up: 1.05 + impactArc * 0.65,
          right: 0.12,
        };
        handLTargetLocal = { fwd: 0.22, up: 1.18, right: -0.24 };
        footRTargetLocal = { fwd: 0.24 * impactArc, up: 0.08 + jumpArcY, right: 0.18 };
        break;
      }

      case 'roundhouse_high_kick':
      case 'question_mark_kick': {
        // Classic High Mawashi-Geri: torso leans back & away, knee chambers high & outward, shin whips into head height!
        torsoPitch = -0.32 * impactArc;
        torsoRoll = -0.26 * impactArc;
        const chamber = p < 0.25 ? p / 0.25 : 1;
        footRTargetLocal = {
          fwd: 0.76 * impactArc + 0.12 * chamber,
          up: 0.08 + impactArc * 1.12 + jumpArcY,
          right: 0.24 * (1 - impactArc * 0.5),
        };
        // Knee pole points strictly UP and OUTWARD-RIGHT so the knee stays ABOVE the hip-to-foot line!
        kneeRPoleLocal = { fwd: 0.65, up: 1.25, right: 0.85 };
        footLTargetLocal = { fwd: -0.06, up: 0.08, right: -0.16 };
        handLTargetLocal = { fwd: 0.34, up: 1.32, right: -0.24 };
        handRTargetLocal = { fwd: -0.12 * impactArc, up: 1.18, right: 0.32 };
        break;
      }

      case 'tornado_kick_540': {
        // 540 Jump Spin Kick: Left leg chambers high on takeoff, then Right leg whips across at peak height
        torsoPitch = -0.26 * impactArc;
        torsoRoll = -0.20 * impactArc;
        const leftLead = p < 0.42 ? Math.sin((p / 0.42) * Math.PI) : 0;
        footLTargetLocal = {
          fwd: 0.42 * leftLead,
          up: 0.08 + jumpArcY * 0.85 + leftLead * 0.48,
          right: -0.18,
        };
        kneeLPoleLocal = { fwd: 1.0, up: 1.1, right: -0.3 };

        footRTargetLocal = {
          fwd: 0.79 * impactArc,
          up: 0.08 + jumpArcY + impactArc * 0.96,
          right: 0.20 * (1 - impactArc * 0.7),
        };
        kneeRPoleLocal = { fwd: 0.8, up: 1.3, right: 0.7 };
        handLTargetLocal = { fwd: 0.25, up: 1.38 + jumpArcY, right: -0.28 };
        handRTargetLocal = { fwd: 0.25, up: 1.38 + jumpArcY, right: 0.28 };
        break;
      }

      case 'spinning_hook_kick':
      case 'spinning_crescent_flurry': {
        // 360 Spinning Hook / Crescent Kick: full spin + arched high heel sweep
        torsoPitch = -0.28 * impactArc;
        torsoRoll = -0.22 * impactArc;
        const sweepSide = Math.cos(p * Math.PI) * 0.36 * impactArc;
        footRTargetLocal = {
          fwd: 0.78 * impactArc,
          up: 0.08 + jumpArcY + impactArc * 1.08,
          right: sweepSide,
        };
        kneeRPoleLocal = { fwd: 0.85, up: 1.35, right: 0.55 };
        footLTargetLocal = { fwd: 0, up: 0.08 + jumpArcY * 0.4, right: -0.16 };
        break;
      }

      case 'axe_kick_drop': {
        // Axe kick: leg rises high above head then slams straight down!
        const liftCurve = p < 0.48 ? smoothStep01(p / 0.48) : smoothStep01((1 - p) / 0.52);
        const forwardReach = Math.sin(p * Math.PI) * 0.76;
        torsoPitch = -0.34 * liftCurve + (p > 0.5 ? 0.18 : 0);
        footRTargetLocal = {
          fwd: forwardReach,
          up: 0.08 + liftCurve * 1.28,
          right: 0.14,
        };
        kneeRPoleLocal = { fwd: 1.1, up: 1.2, right: 0.2 };
        break;
      }

      case 'flying_side_kick': {
        // Classic Bruce Lee / Jackie Chan Flying Side Kick: tucked left leg, fully extended right ramming kick
        torsoPitch = -0.28 * impactArc;
        torsoRoll = -0.38 * impactArc;
        footLTargetLocal = {
          fwd: 0.16 * impactArc,
          up: 0.08 + jumpArcY * 0.9 + 0.34 * impactArc,
          right: -0.22,
        };
        kneeLPoleLocal = { fwd: 1.1, up: 1.0, right: -0.4 };

        footRTargetLocal = {
          fwd: 0.81 * impactArc,
          up: 0.08 + jumpArcY + 0.84 * impactArc,
          right: 0.12,
        };
        kneeRPoleLocal = { fwd: 0.75, up: 1.25, right: 0.75 };
        break;
      }

      case 'dragon_tail_sweep': {
        // Low crouch 360 sweep kick
        pelvisDrop = -0.38 * impactArc;
        torsoPitch = 0.35 * impactArc;
        footLTargetLocal = { fwd: 0.05, up: 0.08, right: -0.16 };
        kneeLPoleLocal = { fwd: 1.2, up: 0.8, right: -0.35 };
        footRTargetLocal = {
          fwd: 0.78 * impactArc,
          up: 0.10,
          right: 0.28 * Math.cos(p * Math.PI * 2),
        };
        kneeRPoleLocal = { fwd: 0.9, up: 1.1, right: 0.4 };
        handLTargetLocal = { fwd: 0.18, up: 0.55, right: -0.22 };
        handRTargetLocal = { fwd: 0.18, up: 0.55, right: 0.22 };
        break;
      }

      case 'double_jump_front_kick': {
        // Mid-air alternating bicycle kick!
        const leftKick = Math.max(0, Math.sin(p * Math.PI * 2));
        const rightKick = Math.max(0, Math.sin(p * Math.PI * 2 - Math.PI * 0.65));
        torsoPitch = -0.24 * impactArc;
        footLTargetLocal = {
          fwd: 0.76 * leftKick,
          up: 0.08 + jumpArcY + leftKick * 0.82,
          right: -0.15,
        };
        footRTargetLocal = {
          fwd: 0.79 * rightKick,
          up: 0.08 + jumpArcY + rightKick * 0.86,
          right: 0.15,
        };
        kneeLPoleLocal = { fwd: 1.0, up: 1.25, right: -0.2 };
        kneeRPoleLocal = { fwd: 1.0, up: 1.25, right: 0.2 };
        break;
      }

      case 'butterfly_twist_kick': {
        // Horizontal torso twist with sweeping airborne legs
        torsoPitch = 0.48 * impactArc;
        torsoRoll = 0.32 * Math.sin(p * Math.PI * 2);
        footLTargetLocal = {
          fwd: -0.55 * impactArc,
          up: 0.08 + jumpArcY + 0.72 * impactArc,
          right: -0.32,
        };
        footRTargetLocal = {
          fwd: 0.76 * impactArc,
          up: 0.08 + jumpArcY + 0.88 * impactArc,
          right: 0.32,
        };
        kneeLPoleLocal = { fwd: 0.6, up: 1.3, right: -0.5 };
        kneeRPoleLocal = { fwd: 0.8, up: 1.3, right: 0.5 };
        break;
      }

      case 'drunken_sway_backkick': {
        torsoPitch = 0.34 * impactArc;
        footRTargetLocal = {
          fwd: 0.78 * impactArc,
          up: 0.08 + impactArc * 0.92,
          right: 0.14,
        };
        kneeRPoleLocal = { fwd: 0.8, up: 1.2, right: 0.4 };
        break;
      }

      case 'knee_clincher_elbow': {
        const kneePhase = p < 0.55 ? Math.sin((p / 0.55) * Math.PI) : 0;
        const elbowPhase = p >= 0.4 ? Math.sin(((p - 0.4) / 0.6) * Math.PI) : 0;
        torsoPitch = 0.15 * elbowPhase - 0.1 * kneePhase;
        footRTargetLocal = {
          fwd: 0.22 * kneePhase,
          up: 0.08 + jumpArcY + 0.44 * kneePhase,
          right: 0.16,
        };
        kneeRPoleLocal = { fwd: 1.4, up: 1.1, right: 0.2 };
        handRTargetLocal = {
          fwd: 0.38 + elbowPhase * 0.28,
          up: 1.38 - elbowPhase * 0.22,
          right: 0.12 - elbowPhase * 0.2,
        };
        break;
      }

      case 'split_kick_dual': {
        // Mid-air full kung-fu split kick (left & right legs kick out straight simultaneously!)
        torsoPitch = -0.18 * impactArc;
        footLTargetLocal = {
          fwd: 0.56 * impactArc,
          up: 0.08 + jumpArcY + 0.84 * impactArc,
          right: -0.56 * impactArc - 0.14,
        };
        footRTargetLocal = {
          fwd: 0.58 * impactArc,
          up: 0.08 + jumpArcY + 0.86 * impactArc,
          right: 0.56 * impactArc + 0.14,
        };
        kneeLPoleLocal = { fwd: 0.9, up: 1.35, right: -0.6 };
        kneeRPoleLocal = { fwd: 0.9, up: 1.35, right: 0.6 };
        handLTargetLocal = { fwd: 0.35, up: 1.38 + jumpArcY, right: -0.38 };
        handRTargetLocal = { fwd: 0.35, up: 1.38 + jumpArcY, right: 0.38 };
        break;
      }
    }
  } else if (isStunt) {
    // Environmental Stunt Pose (Vault, Pole Swing, Wall Backflip, Ladder Helicopter)
    jumpArcY = Math.sin(p * Math.PI) * 0.96;
    if (stuntId === 'ladder_helicopter' || stuntId === 'chair_catch_spin' || stuntId === 'pole_swing_dropkick') {
      spinYawOffset = p * Math.PI * 4;
    } else if (stuntId === 'wall_backflip_counter') {
      torsoPitch = -Math.sin(p * Math.PI) * 0.65;
    } else {
      torsoPitch = -0.25 * impactArc;
    }

    footLTargetLocal = {
      fwd: 0.42 * impactArc,
      up: 0.08 + jumpArcY + 0.45 * impactArc,
      right: -0.20,
    };
    footRTargetLocal = {
      fwd: 0.72 * impactArc,
      up: 0.08 + jumpArcY + 0.78 * impactArc,
      right: 0.20,
    };
    kneeLPoleLocal = { fwd: 1.0, up: 1.25, right: -0.3 };
    kneeRPoleLocal = { fwd: 1.0, up: 1.25, right: 0.4 };
    handLTargetLocal = { fwd: 0.42, up: 1.32 + jumpArcY, right: -0.28 };
    handRTargetLocal = { fwd: 0.42, up: 1.32 + jumpArcY, right: 0.28 };
  }

  const visualYaw = facingAngle + spinYawOffset;
  const cos = Math.cos(visualYaw);
  const sin = Math.sin(visualYaw);
  const rightX = -sin;
  const rightZ = cos;

  const toWorld = (loc: { fwd: number; up: number; right: number }): Vec3 => ({
    x: pos.x + cos * loc.fwd + rightX * loc.right,
    y: pos.y + loc.up,
    z: pos.z + sin * loc.fwd + rightZ * loc.right,
  });

  const toWorldDir = (loc: { fwd: number; up: number; right: number }): Vec3 => ({
    x: cos * loc.fwd + rightX * loc.right,
    y: loc.up,
    z: sin * loc.fwd + rightZ * loc.right,
  });

  const basePelvisY = pos.y + 0.88 + pelvisDrop + jumpArcY;
  const pelvisPos: Vec3 = { x: pos.x, y: basePelvisY, z: pos.z };

  const leanFwd = Math.sin(torsoPitch) * 0.46;
  const leanUp = Math.cos(torsoPitch) * 0.46;
  const leanSide = Math.sin(torsoRoll) * 0.18;

  const torsoPos: Vec3 = {
    x: pelvisPos.x + cos * leanFwd + rightX * leanSide,
    y: pelvisPos.y + leanUp,
    z: pelvisPos.z + sin * leanFwd + rightZ * leanSide,
  };

  const headPos: Vec3 = {
    x: torsoPos.x + cos * (leanFwd * 0.45),
    y: torsoPos.y + 0.36,
    z: torsoPos.z + sin * (leanFwd * 0.45),
  };

  // Hip sockets for Left and Right legs
  const hipL: Vec3 = {
    x: pelvisPos.x + rightX * -0.14,
    y: pelvisPos.y,
    z: pelvisPos.z + rightZ * -0.14,
  };
  const hipR: Vec3 = {
    x: pelvisPos.x + rightX * 0.14,
    y: pelvisPos.y,
    z: pelvisPos.z + rightZ * 0.14,
  };

  // Solve Left & Right Legs with Anatomical Two-Bone IK
  const legLIK = solveTwoBoneIK(
    hipL,
    toWorld(footLTargetLocal),
    0.42,
    0.42,
    toWorldDir(kneeLPoleLocal)
  );
  const legRIK = solveTwoBoneIK(
    hipR,
    toWorld(footRTargetLocal),
    0.42,
    0.42,
    toWorldDir(kneeRPoleLocal)
  );

  // Shoulder sockets for Left and Right arms
  const shoulderL: Vec3 = {
    x: torsoPos.x + rightX * -0.20,
    y: torsoPos.y + 0.12,
    z: torsoPos.z + rightZ * -0.20,
  };
  const shoulderR: Vec3 = {
    x: torsoPos.x + rightX * 0.20,
    y: torsoPos.y + 0.12,
    z: torsoPos.z + rightZ * 0.20,
  };

  // Elbows point outward & downward/backward
  const armLIK = solveTwoBoneIK(
    shoulderL,
    toWorld({ ...handLTargetLocal, up: handLTargetLocal.up + pelvisDrop + jumpArcY }),
    0.31,
    0.30,
    toWorldDir({ fwd: -0.2, up: -0.7, right: -0.9 })
  );
  const armRIK = solveTwoBoneIK(
    shoulderR,
    toWorld({ ...handRTargetLocal, up: handRTargetLocal.up + pelvisDrop + jumpArcY }),
    0.31,
    0.30,
    toWorldDir({ fwd: -0.2, up: -0.7, right: 0.9 })
  );

  return {
    pelvisPos,
    torsoPos,
    headPos,
    elbowL: armLIK.midPos,
    handL: armLIK.endPos,
    elbowR: armRIK.midPos,
    handR: armRIK.endPos,
    kneeL: legLIK.midPos,
    footL: legLIK.endPos,
    kneeR: legRIK.midPos,
    footR: legRIK.endPos,
    visualYaw,
    torsoPitch,
    torsoRoll,
  };
}
