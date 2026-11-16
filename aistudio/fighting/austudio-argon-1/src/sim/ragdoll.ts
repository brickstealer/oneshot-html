import { SeededRandom } from './prng';
import {
  BoneConstraint,
  Fighter,
  FighterRole,
  NodeId,
  Platform,
  SashLink,
  VerletNode,
} from './types';

export const NODE_IDS: NodeId[] = [
  'head',
  'neck',
  'pelvis',
  'lElbow',
  'lHand',
  'rElbow',
  'rHand',
  'lKnee',
  'lFoot',
  'rKnee',
  'rFoot',
];

const ENEMY_NAMES: Record<Exclude<FighterRole, 'hero'>, string[]> = {
  brawler: ['Бешеный Ло', 'Быстрый Чань', 'Уличный Кобра', 'Кулак Коулуна'],
  acrobat: ['Летящий Фэн', 'Тень Триады', 'Прыгун Вэй', 'Призрак Крыш'],
  bruiser: ['Большой Боло', 'Железный Тай', 'Молот Порта', 'Титан Хун'],
  weapon_master: ['Мастер Шеста Ли', 'Бамбуковый Лис', 'Хранитель Зала', 'Острый Шэнь'],
};

export function createFighter(
  id: string,
  role: FighterRole,
  x: number,
  y: number,
  facing: 1 | -1,
  rng: SeededRandom
): Fighter {
  const isHero = role === 'hero';
  const scale = role === 'bruiser' ? 1.18 : role === 'acrobat' ? 0.96 : 1.0;

  const makeNode = (ox: number, oy: number, mass = 1, radius = 7): VerletNode => ({
    x: x + ox * scale,
    y: y + oy * scale,
    oldX: x + ox * scale,
    oldY: y + oy * scale,
    mass,
    radius: radius * scale,
  });

  const nodes: Record<NodeId, VerletNode> = {
    head: makeNode(0, -82, 1.2, 13),
    neck: makeNode(0, -64, 1.5, 8),
    pelvis: makeNode(0, -32, 2.4, 10),
    lElbow: makeNode(-14, -48, 0.9, 6),
    lHand: makeNode(-24, -36, 0.8, 6),
    rElbow: makeNode(14, -48, 0.9, 6),
    rHand: makeNode(24, -36, 0.8, 6),
    lKnee: makeNode(-10, -16, 1.1, 7),
    lFoot: makeNode(-14, 0, 1.2, 7),
    rKnee: makeNode(10, -16, 1.1, 7),
    rFoot: makeNode(14, 0, 1.2, 7),
  };

  const bones: BoneConstraint[] = [
    { a: 'head', b: 'neck', length: 18 * scale, stiffness: 0.95 },
    { a: 'neck', b: 'pelvis', length: 32 * scale, stiffness: 0.95 },
    { a: 'neck', b: 'lElbow', length: 20 * scale, stiffness: 0.9 },
    { a: 'lElbow', b: 'lHand', length: 20 * scale, stiffness: 0.9 },
    { a: 'neck', b: 'rElbow', length: 20 * scale, stiffness: 0.9 },
    { a: 'rElbow', b: 'rHand', length: 20 * scale, stiffness: 0.9 },
    { a: 'pelvis', b: 'lKnee', length: 21 * scale, stiffness: 0.92 },
    { a: 'lKnee', b: 'lFoot', length: 21 * scale, stiffness: 0.92 },
    { a: 'pelvis', b: 'rKnee', length: 21 * scale, stiffness: 0.92 },
    { a: 'rKnee', b: 'rFoot', length: 21 * scale, stiffness: 0.92 },
    // Structural cross-brace for torso stability
    { a: 'head', b: 'pelvis', length: 50 * scale, stiffness: 0.45 },
  ];

  const sash: SashLink[] = [];
  for (let i = 0; i < 5; i++) {
    sash.push({
      x: x - facing * i * 9,
      y: y - 32 * scale + i * 3,
      oldX: x - facing * i * 9,
      oldY: y - 32 * scale + i * 3,
    });
  }

  const palettes: Record<FighterRole, Fighter['palette']> = {
    hero: {
      skin: '#f4c29f',
      shirt: '#f8fafc',
      vest: '#d97706',
      pants: '#1e293b',
      sash: '#ef4444',
      shoes: '#f8fafc',
      hair: '#111827',
    },
    brawler: {
      skin: '#eab68c',
      shirt: '#991b1b',
      vest: '#7f1d1d',
      pants: '#1f2937',
      sash: '#f59e0b',
      shoes: '#111827',
      hair: '#18181b',
    },
    acrobat: {
      skin: '#f1bfa0',
      shirt: '#1e1b4b',
      vest: '#312e81',
      pants: '#0f172a',
      sash: '#ec4899',
      shoes: '#e2e8f0',
      hair: '#09090b',
    },
    bruiser: {
      skin: '#e0a97f',
      shirt: '#27272a',
      vest: '#18181b',
      pants: '#09090b',
      sash: '#eab308',
      shoes: '#18181b',
      hair: '#09090b',
    },
    weapon_master: {
      skin: '#ecc09a',
      shirt: '#064e3b',
      vest: '#065f46',
      pants: '#111827',
      sash: '#34d399',
      shoes: '#d1d5db',
      hair: '#1f2937',
    },
  };

  const maxHp = isHero ? 260 : role === 'bruiser' ? 140 : 95;

  return {
    id,
    name: isHero ? 'Мастер Чан' : rng.pick(ENEMY_NAMES[role]),
    role,
    isHero,
    x,
    y,
    vx: 0,
    vy: 0,
    facing,
    hp: maxHp,
    maxHp,
    stamina: 100,
    composure: 100,
    ragdollBlend: 0,
    action: 'idle',
    actionTimer: 0,
    actionDuration: 0.4,
    attackCooldown: 0,
    stuntCooldown: 0,
    hitFlashTimer: 0,
    invulnTimer: 0,
    grounded: true,
    onPlatformId: 'main_floor',
    heldPropId: null,
    targetEnemyId: null,
    expression: 'focused',
    expressionTimer: 0,
    quips: null,
    quipTimer: 0,
    comboCount: 0,
    gaitPhase: rng.range(0, Math.PI * 2),
    scaleX: 1,
    scaleY: 1,
    nodes,
    bones,
    sash,
    palette: palettes[role],
    scale,
  };
}

/**
 * Computes target relative pose offsets for each node given the fighter's current martial arts action
 */
function computeTargetPose(
  f: Fighter,
  time: number
): Record<NodeId, { ox: number; oy: number }> {
  const dir = f.facing;
  const s = f.scale * 1.0;
  const t = f.actionDuration > 0 ? Math.min(1, f.actionTimer / f.actionDuration) : 0;
  const gait = f.gaitPhase;

  // Base Kung-Fu Guard Stance
  const pose: Record<NodeId, { ox: number; oy: number }> = {
    head: { ox: 4 * dir, oy: -82 },
    neck: { ox: 2 * dir, oy: -64 },
    pelvis: { ox: 0, oy: -34 },
    lElbow: { ox: -10 * dir, oy: -50 },
    lHand: { ox: 8 * dir, oy: -58 },
    rElbow: { ox: 14 * dir, oy: -52 },
    rHand: { ox: 26 * dir, oy: -62 },
    lKnee: { ox: -12 * dir, oy: -18 },
    lFoot: { ox: -18 * dir, oy: -2 },
    rKnee: { ox: 14 * dir, oy: -18 },
    rFoot: { ox: 18 * dir, oy: -2 },
  };

  switch (f.action) {
    case 'idle': {
      const breathe = Math.sin(time * 6 + f.x * 0.05) * 2.5;
      pose.head.oy += breathe;
      pose.neck.oy += breathe * 0.8;
      pose.rHand.oy += Math.cos(time * 7) * 3;
      pose.lHand.oy -= Math.cos(time * 7) * 2.5;
      break;
    }

    case 'run': {
      const stride = Math.sin(gait);
      const liftL = Math.max(0, Math.cos(gait)) * 12;
      const liftR = Math.max(0, -Math.cos(gait)) * 12;
      pose.head.ox = 10 * dir;
      pose.neck.ox = 7 * dir;
      pose.pelvis.oy = -34 + Math.abs(stride) * 3;
      pose.lKnee = { ox: -stride * 18 * dir, oy: -18 - liftL * 0.5 };
      pose.lFoot = { ox: -stride * 26 * dir, oy: -2 - liftL };
      pose.rKnee = { ox: stride * 18 * dir, oy: -18 - liftR * 0.5 };
      pose.rFoot = { ox: stride * 26 * dir, oy: -2 - liftR };
      pose.lElbow = { ox: stride * 14 * dir, oy: -48 };
      pose.lHand = { ox: (stride * 22 + 8) * dir, oy: -54 };
      pose.rElbow = { ox: -stride * 14 * dir, oy: -48 };
      pose.rHand = { ox: (-stride * 22 + 12) * dir, oy: -56 };
      break;
    }

    case 'punch_combo': {
      // Rapid alternating Wing Chun / Southern Fist chain punches
      const cycle = Math.sin(t * Math.PI * 3);
      const extendR = cycle >= 0 ? cycle : 0;
      const extendL = cycle < 0 ? -cycle : 0;
      pose.head = { ox: 10 * dir, oy: -80 };
      pose.neck = { ox: 8 * dir, oy: -62 };
      pose.rElbow = { ox: (14 + extendR * 14) * dir, oy: -58 };
      pose.rHand = { ox: (22 + extendR * 32) * dir, oy: -62 };
      pose.lElbow = { ox: (10 + extendL * 14) * dir, oy: -56 };
      pose.lHand = { ox: (18 + extendL * 32) * dir, oy: -60 };
      pose.rFoot = { ox: 24 * dir, oy: -2 };
      pose.lFoot = { ox: -22 * dir, oy: -2 };
      break;
    }

    case 'flying_kick': {
      // Iconic horizontal Jackie Chan mid-air side kick!
      pose.head = { ox: -14 * dir, oy: -70 };
      pose.neck = { ox: -8 * dir, oy: -56 };
      pose.pelvis = { ox: 4 * dir, oy: -42 };
      pose.rKnee = { ox: 26 * dir, oy: -44 };
      pose.rFoot = { ox: 50 * dir, oy: -46 }; // Extended kicking leg
      pose.lKnee = { ox: -14 * dir, oy: -26 };
      pose.lFoot = { ox: -22 * dir, oy: -18 }; // Tucked trailing leg
      pose.rHand = { ox: 22 * dir, oy: -66 };
      pose.lHand = { ox: -24 * dir, oy: -62 };
      break;
    }

    case 'sweep_kick': {
      // Low crouched spinning dragon tail sweep
      const sweep = Math.sin(t * Math.PI);
      pose.head = { ox: -8 * dir, oy: -52 };
      pose.neck = { ox: -4 * dir, oy: -38 };
      pose.pelvis = { ox: 0, oy: -18 };
      pose.rKnee = { ox: 22 * dir * sweep, oy: -12 };
      pose.rFoot = { ox: 44 * dir * sweep, oy: -4 };
      pose.lKnee = { ox: -12 * dir, oy: -12 };
      pose.lFoot = { ox: -14 * dir, oy: -2 };
      pose.lHand = { ox: -8 * dir, oy: -4 }; // Hand planted on floor
      pose.rHand = { ox: 18 * dir, oy: -36 };
      break;
    }

    case 'wall_flip':
    case 'table_vault': {
      // Full acrobatic somersault rotation
      const rot = -dir * t * Math.PI * 2;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const rotPt = (px: number, py: number) => {
        const cy = -44;
        const dy = py - cy;
        return {
          ox: px * cos - dy * sin,
          oy: cy + px * sin + dy * cos,
        };
      };
      pose.head = rotPt(0, -78);
      pose.neck = rotPt(0, -60);
      pose.pelvis = rotPt(0, -34);
      pose.lElbow = rotPt(-14 * dir, -52);
      pose.lHand = rotPt(16 * dir, -66);
      pose.rElbow = rotPt(14 * dir, -52);
      pose.rHand = rotPt(22 * dir, -66);
      pose.lKnee = rotPt(-14 * dir, -24);
      pose.lFoot = rotPt(-8 * dir, -10);
      pose.rKnee = rotPt(18 * dir, -22);
      pose.rFoot = rotPt(32 * dir, -12);
      break;
    }

    case 'ladder_spin':
    case 'prop_swing': {
      // Wide 2-handed prop swing arc
      const swing = Math.cos(t * Math.PI * 2);
      pose.head = { ox: 8 * dir * swing, oy: -80 };
      pose.neck = { ox: 5 * dir * swing, oy: -62 };
      pose.rElbow = { ox: 20 * dir * swing, oy: -54 };
      pose.rHand = { ox: 36 * dir * swing, oy: -56 };
      pose.lElbow = { ox: 16 * dir * swing, oy: -50 };
      pose.lHand = { ox: 30 * dir * swing, oy: -52 };
      pose.rFoot = { ox: 22 * dir, oy: -2 };
      pose.lFoot = { ox: -22 * dir, oy: -2 };
      break;
    }

    case 'duck_evade': {
      // Low comedic duck under a wild swing or flying bottle
      pose.head = { ox: 8 * dir, oy: -48 };
      pose.neck = { ox: 4 * dir, oy: -36 };
      pose.pelvis = { ox: -4 * dir, oy: -18 };
      pose.lHand = { ox: 12 * dir, oy: -54 };
      pose.rHand = { ox: 16 * dir, oy: -54 };
      pose.lKnee = { ox: -16 * dir, oy: -12 };
      pose.rKnee = { ox: 16 * dir, oy: -12 };
      break;
    }

    case 'drunken_sway': {
      // Classic Drunken Master (Zui Quan) fluid counter-weave
      const sway = Math.sin(time * 11) * 18;
      pose.head = { ox: sway + 6 * dir, oy: -78 + Math.abs(sway) * 0.2 };
      pose.neck = { ox: sway * 0.7, oy: -60 };
      pose.pelvis = { ox: -sway * 0.4, oy: -32 };
      pose.rElbow = { ox: sway + 18 * dir, oy: -56 };
      pose.rHand = { ox: sway + 28 * dir, oy: -68 }; // Cupped wine-cup hand!
      pose.lElbow = { ox: sway - 16 * dir, oy: -52 };
      pose.lHand = { ox: sway - 24 * dir, oy: -62 };
      break;
    }

    case 'hand_shake_pain': {
      // Classic Jackie Chan shaking his stinging hand & hopping on one foot!
      const hop = Math.abs(Math.sin(time * 22)) * 10;
      const shake = Math.sin(time * 38) * 10;
      pose.head = { ox: -4 * dir, oy: -78 - hop };
      pose.neck = { ox: -2 * dir, oy: -60 - hop };
      pose.pelvis = { ox: 0, oy: -32 - hop };
      pose.rElbow = { ox: 14 * dir, oy: -48 - hop };
      pose.rHand = { ox: 24 * dir, oy: -52 + shake - hop };
      pose.lHand = { ox: 18 * dir, oy: -50 - hop }; // Holding hurt wrist
      pose.rKnee = { ox: 12 * dir, oy: -24 - hop };
      pose.rFoot = { ox: 8 * dir, oy: -14 - hop };
      pose.lFoot = { ox: -8 * dir, oy: -2 - hop * 0.5 };
      break;
    }

    case 'stagger': {
      pose.head = { ox: -16 * dir, oy: -76 };
      pose.neck = { ox: -10 * dir, oy: -60 };
      pose.pelvis = { ox: -4 * dir, oy: -32 };
      pose.lHand = { ox: -22 * dir, oy: -64 };
      pose.rHand = { ox: 14 * dir, oy: -68 };
      break;
    }

    case 'get_up': {
      // Kip-up (spring from back onto feet!)
      const rise = t;
      pose.head = { ox: 4 * dir * rise, oy: -24 - 58 * rise };
      pose.neck = { ox: 2 * dir * rise, oy: -18 - 46 * rise };
      pose.pelvis = { ox: 0, oy: -14 - 20 * rise };
      pose.lHand = { ox: -16 * dir, oy: -14 - 40 * rise };
      pose.rHand = { ox: 16 * dir, oy: -14 - 44 * rise };
      pose.lFoot = { ox: -16 * dir, oy: -2 };
      pose.rFoot = { ox: 16 * dir, oy: -2 };
      break;
    }

    default:
      break;
  }

  for (const id of NODE_IDS) {
    pose[id].ox *= s * f.scaleX;
    pose[id].oy *= s * f.scaleY;
  }

  return pose;
}

/**
 * Advances articulated ragdoll Verlet nodes, active PD pose muscles,
 * bone length constraints, and cloth sash physics.
 */
export function stepFighterRagdoll(
  f: Fighter,
  dt: number,
  time: number,
  gravity: number,
  elasticity: number,
  platforms: Platform[],
  worldWidth: number,
  floorY: number
): void {
  // Smoothly recover squash & stretch toward 1
  f.scaleX += (1 - f.scaleX) * Math.min(1, dt * 14);
  f.scaleY += (1 - f.scaleY) * Math.min(1, dt * 14);

  const isPureRagdoll =
    f.action === 'ragdoll_fall' || f.action === 'ko' || f.ragdollBlend > 0.65;

  const targetPose = computeTargetPose(f, time);
  const muscleStrength = isPureRagdoll
    ? 0.04
    : Math.max(0.18, Math.min(0.95, elasticity * (1 - f.ragdollBlend * 0.85)));

  // 1. Verlet integration + PD muscle spring attraction toward target martial-arts pose
  const damping = isPureRagdoll ? 0.985 : 0.88;
  for (const id of NODE_IDS) {
    const n = f.nodes[id];
    const vx = (n.x - n.oldX) * damping;
    const vy = (n.y - n.oldY) * damping;
    n.oldX = n.x;
    n.oldY = n.y;

    n.x += vx;
    n.y += vy + gravity * dt * dt * (isPureRagdoll ? 1.0 : 0.25);

    if (!isPureRagdoll) {
      const targetX = f.x + targetPose[id].ox;
      const targetY = f.y + targetPose[id].oy;
      n.x += (targetX - n.x) * muscleStrength;
      n.y += (targetY - n.y) * muscleStrength;
    }
  }

  // If in pure ragdoll state, anchor fighter root x,y to pelvis so camera/AI tracks body
  if (isPureRagdoll) {
    f.x = f.nodes.pelvis.x;
    f.y = Math.max(f.nodes.lFoot.y, f.nodes.rFoot.y, f.nodes.pelvis.y + 14);
  }

  // 2. Solve iterative distance constraints for skeleton bones (4 iterations)
  for (let iter = 0; iter < 4; iter++) {
    for (const bone of f.bones) {
      const na = f.nodes[bone.a];
      const nb = f.nodes[bone.b];
      const dx = nb.x - na.x;
      const dy = nb.y - na.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const diff = (bone.length - dist) / dist;
      const totalMass = na.mass + nb.mass;
      const shareA = (nb.mass / totalMass) * bone.stiffness * 0.5;
      const shareB = (na.mass / totalMass) * bone.stiffness * 0.5;

      na.x -= dx * diff * shareA;
      na.y -= dy * diff * shareA;
      nb.x += dx * diff * shareB;
      nb.y += dy * diff * shareB;
    }

    // 3. Enforce arena wall and floor / platform collisions on every ragdoll joint
    for (const id of NODE_IDS) {
      const n = f.nodes[id];
      const minX = 36 + n.radius;
      const maxX = worldWidth - 36 - n.radius;
      if (n.x < minX) {
        n.x = minX;
        n.oldX = n.x + (n.x - n.oldX) * 0.4;
      } else if (n.x > maxX) {
        n.x = maxX;
        n.oldX = n.x + (n.x - n.oldX) * 0.4;
      }

      if (n.y > floorY - n.radius - 3) {
        n.y = floorY - n.radius - 3;
        // Ground friction during ragdoll slide
        n.oldX = n.x - (n.x - n.oldX) * 0.78;
      }

      // Elevated platform collision when falling
      if (isPureRagdoll) {
        for (const plat of platforms) {
          if (plat.kind === 'floor') continue;
          if (
            n.x >= plat.x &&
            n.x <= plat.x + plat.width &&
            n.oldY <= plat.y &&
            n.y >= plat.y - n.radius &&
            n.y <= plat.y + 24
          ) {
            n.y = plat.y - n.radius;
            n.oldX = n.x - (n.x - n.oldX) * 0.8;
          }
        }
      }
    }
  }

  // 4. Step flowing martial-arts belt sash physics
  if (f.sash.length > 0) {
    f.sash[0].x = f.nodes.pelvis.x;
    f.sash[0].y = f.nodes.pelvis.y;
    for (let i = 1; i < f.sash.length; i++) {
      const s = f.sash[i];
      const vx = (s.x - s.oldX) * 0.92 - f.vx * dt * 0.15;
      const vy = (s.y - s.oldY) * 0.92 + 12 * dt;
      s.oldX = s.x;
      s.oldY = s.y;
      s.x += vx + Math.sin(time * 9 + i) * 0.6;
      s.y += vy;

      const prev = f.sash[i - 1];
      const dx = s.x - prev.x;
      const dy = s.y - prev.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const targetLen = 8.5 * f.scale;
      if (d > targetLen) {
        s.x = prev.x + (dx / d) * targetLen;
        s.y = prev.y + (dy / d) * targetLen;
      }
    }
  }
}

/**
 * Applies a directional ragdoll impulse to a specific joint (and neighboring bones)
 */
export function applyRagdollImpulse(
  f: Fighter,
  targetNode: NodeId,
  ix: number,
  iy: number,
  ragdollDuration = 0.55
): void {
  f.vx += ix * 0.65;
  f.vy += iy * 0.65;
  f.ragdollBlend = Math.min(1, f.ragdollBlend + 0.85);

  const primary = f.nodes[targetNode];
  primary.oldX -= ix * 0.028;
  primary.oldY -= iy * 0.028;

  for (const id of NODE_IDS) {
    if (id === targetNode) continue;
    const n = f.nodes[id];
    n.oldX -= ix * 0.012;
    n.oldY -= iy * 0.012;
  }

  if (ragdollDuration > 0 && f.action !== 'ko') {
    f.action = 'ragdoll_fall';
    f.actionTimer = 0;
    f.actionDuration = ragdollDuration;
  }
}
