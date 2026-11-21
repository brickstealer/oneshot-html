import { CHUNK_SIZE, ROAD_WIDTH, SIDEWALK_WIDTH } from './biomes';
import type { VehicleKind } from './types';

export type PoliceRole = 'intercept' | 'flank_left' | 'flank_right' | 'roadblock' | 'perimeter';
export type CivilianMood = 'calm' | 'panicked';
export type OfficerState = 'advancing' | 'flanking' | 'suppressing';

export interface RigidVehicleBody {
  id: number;
  kind: VehicleKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  speed: number;
  length: number;
  width: number;
  destroyed: boolean;
}

export interface CollisionImpact {
  idA: number;
  idB: number;
  contactX: number;
  contactZ: number;
  closingSpeed: number;
}

/**
 * Physical mass per vehicle class so heavy SWAT vans, buses, and fuel tankers
 * feel genuinely weighty during impacts, while sports cars deflect crisply.
 */
export function getVehicleMass(kind: VehicleKind, destroyed: boolean): number {
  const base =
    kind === 'tanker'
      ? 9.5
      : kind === 'bus'
        ? 8.0
        : kind === 'swat'
          ? 4.8
          : kind === 'suv'
            ? 2.3
            : kind === 'police'
              ? 1.85
              : kind === 'muscle'
                ? 1.65
                : 1.45;
  return destroyed ? base * 1.8 : base;
}

/**
 * Returns collision disc centers & radius approximating an oriented vehicle hull.
 * Standard vehicles use 2 discs (front + rear); elongated buses & fuel tankers use 3 discs.
 */
export function getVehicleCollisionDiscs(
  v: Pick<RigidVehicleBody, 'x' | 'z' | 'heading' | 'length' | 'width'>,
): { x: number; z: number; r: number }[] {
  const r = Math.max(0.95, v.width * 0.52);
  const sinH = Math.sin(v.heading);
  const cosH = Math.cos(v.heading);
  const halfSpan = Math.max(0.4, v.length * 0.5 - r * 0.85);

  if (v.length >= 9.0) {
    return [
      { x: v.x + sinH * halfSpan, z: v.z + cosH * halfSpan, r },
      { x: v.x, z: v.z, r },
      { x: v.x - sinH * halfSpan, z: v.z - cosH * halfSpan, r },
    ];
  }
  return [
    { x: v.x + sinH * halfSpan, z: v.z + cosH * halfSpan, r },
    { x: v.x - sinH * halfSpan, z: v.z - cosH * halfSpan, r },
  ];
}

/**
 * Resolves solid multi-circle collision between two oriented vehicles.
 * Separates overlaps by inverse mass and applies realistic momentum impulse + steering deflection.
 */
export function resolveVehiclePairCollision(
  a: RigidVehicleBody,
  b: RigidVehicleBody,
): CollisionImpact | null {
  // Broad-phase quick reject
  const maxReach = (a.length + b.length) * 0.55 + 1.2;
  const roughDx = b.x - a.x;
  const roughDz = b.z - a.z;
  if (roughDx * roughDx + roughDz * roughDz > maxReach * maxReach) {
    return null;
  }

  const discsA = getVehicleCollisionDiscs(a);
  const discsB = getVehicleCollisionDiscs(b);

  let deepestPen = 0;
  let bestNx = 0;
  let bestNz = 1;
  let contactX = (a.x + b.x) * 0.5;
  let contactZ = (a.z + b.z) * 0.5;

  for (let i = 0; i < discsA.length; i++) {
    const da = discsA[i];
    for (let j = 0; j < discsB.length; j++) {
      const db = discsB[j];
      const dx = db.x - da.x;
      const dz = db.z - da.z;
      const minDist = da.r + db.r;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        const pen = minDist - dist;
        if (pen > deepestPen) {
          deepestPen = pen;
          if (dist > 0.0001) {
            bestNx = dx / dist;
            bestNz = dz / dist;
          } else {
            // Deterministic fallback normal based on entity IDs so stacked spawns always separate cleanly
            const fallbackAngle = ((a.id * 1.7 + b.id * 2.3) % (Math.PI * 2));
            bestNx = Math.sin(fallbackAngle);
            bestNz = Math.cos(fallbackAngle);
          }
          contactX = da.x + bestNx * da.r;
          contactZ = da.z + bestNz * da.r;
        }
      }
    }
  }

  if (deepestPen <= 0) return null;

  const invMassA = 1 / getVehicleMass(a.kind, a.destroyed);
  const invMassB = 1 / getVehicleMass(b.kind, b.destroyed);
  const invSum = invMassA + invMassB;

  // Full positional separation (+ slight slop margin so vehicles never visibly interpenetrate)
  const sep = deepestPen + 0.04;
  const shareA = invMassA / invSum;
  const shareB = invMassB / invSum;
  a.x -= bestNx * sep * shareA;
  a.z -= bestNz * sep * shareA;
  b.x += bestNx * sep * shareB;
  b.z += bestNz * sep * shareB;

  // Relative velocity along collision normal
  const rvx = b.vx - a.vx;
  const rvz = b.vz - a.vz;
  const velAlongNormal = rvx * bestNx + rvz * bestNz;

  let closingSpeed = 0;
  if (velAlongNormal < 0) {
    closingSpeed = -velAlongNormal;
    const restitution = 0.28;
    const j = (-(1 + restitution) * velAlongNormal) / invSum;
    const impX = j * bestNx;
    const impZ = j * bestNz;

    a.vx -= impX * invMassA;
    a.vz -= impZ * invMassA;
    b.vx += impX * invMassB;
    b.vz += impZ * invMassB;

    // Sync forward scalar speeds with post-impact velocity projection
    a.speed = a.vx * Math.sin(a.heading) + a.vz * Math.cos(a.heading);
    b.speed = b.vx * Math.sin(b.heading) + b.vz * Math.cos(b.heading);

    // Subtle yaw kick on glancing hits / PIT maneuvers
    if (closingSpeed > 4.5) {
      const crossA = Math.sin(a.heading) * bestNz - Math.cos(a.heading) * bestNx;
      const crossB = Math.sin(b.heading) * bestNz - Math.cos(b.heading) * bestNx;
      a.heading += Math.max(-0.22, Math.min(0.22, crossA * closingSpeed * 0.008 * shareA));
      b.heading -= Math.max(-0.22, Math.min(0.22, crossB * closingSpeed * 0.008 * shareB));
    }
  }

  return {
    idA: a.id,
    idB: b.id,
    contactX,
    contactZ,
    closingSpeed,
  };
}

/**
 * Prevents vehicles from clipping into solid interior city blocks (buildings, banks, mesas, containers).
 * Roads occupy [-8..+8] around multiples of CHUNK_SIZE; sidewalks buffer up to ±11.5m.
 */
export function resolveBuildingCollision(
  v: Pick<RigidVehicleBody, 'x' | 'z' | 'vx' | 'vz' | 'heading' | 'speed' | 'width'>,
): boolean {
  const halfRoadPlusCurb = ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH - 0.6; // ~10.9m from road center before solid architecture
  const pad = v.width * 0.52;
  const blockEdge = halfRoadPlusCurb - pad; // max safe distance from road centerline into block

  const localX = ((v.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const localZ = ((v.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

  // Interior solid building footprint in local chunk coords is [blockEdge .. CHUNK_SIZE - blockEdge]
  const minBound = blockEdge;
  const maxBound = CHUNK_SIZE - blockEdge;

  if (localX > minBound && localX < maxBound && localZ > minBound && localZ < maxBound) {
    // Push out to whichever street edge is nearest
    const dLeft = localX - minBound;
    const dRight = maxBound - localX;
    const dBottom = localZ - minBound;
    const dTop = maxBound - localZ;
    const minPen = Math.min(dLeft, dRight, dBottom, dTop);

    if (minPen === dLeft) {
      v.x -= dLeft + 0.05;
      if (v.vx > 0) v.vx *= -0.25;
    } else if (minPen === dRight) {
      v.x += dRight + 0.05;
      if (v.vx < 0) v.vx *= -0.25;
    } else if (minPen === dBottom) {
      v.z -= dBottom + 0.05;
      if (v.vz > 0) v.vz *= -0.25;
    } else {
      v.z += dTop + 0.05;
      if (v.vz < 0) v.vz *= -0.25;
    }

    v.speed = Math.max(-6, Math.min(v.speed * 0.65, 14));
    return true;
  }

  return false;
}

/**
 * Assigns diverse tactical roles to police vehicles so they coordinate chases,
 * flank on both sides, set roadblocks, and form spaced perimeter cordons instead of clumping.
 */
export function assignPoliceRole(slotIndex: number, kind: VehicleKind, playerOnFoot: boolean): PoliceRole {
  if (playerOnFoot) return 'perimeter';
  if (kind === 'swat') return slotIndex % 2 === 0 ? 'roadblock' : 'intercept';
  const cycle: PoliceRole[] = ['intercept', 'flank_left', 'flank_right', 'roadblock', 'perimeter'];
  return cycle[Math.abs(slotIndex) % cycle.length];
}

export interface PoliceTacticalTarget {
  targetX: number;
  targetZ: number;
  desiredSpeed: number;
  shouldBrakeAndDeploy: boolean;
}

/**
 * Computes a role-specific, non-overlapping tactical waypoint for a police cruiser/SWAT van.
 */
export function computePoliceTacticalGoal(params: {
  role: PoliceRole;
  slotIndex: number;
  totalPolice: number;
  policeX: number;
  policeZ: number;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  playerSpeed: number;
  isSwat: boolean;
}): PoliceTacticalTarget {
  const {
    role,
    slotIndex,
    totalPolice,
    policeX,
    policeZ,
    playerX,
    playerZ,
    playerHeading,
    playerSpeed,
    isSwat,
  } = params;

  const sinH = Math.sin(playerHeading);
  const cosH = Math.cos(playerHeading);
  // Perpendicular right vector
  const rightX = cosH;
  const rightZ = -sinH;
  const distToPlayer = Math.hypot(playerX - policeX, playerZ - policeZ);
  const maxSpd = isSwat ? 23 : 29;

  if (role === 'perimeter') {
    // Spread units around a wide 16-22m cordon ring around the suspect so units NEVER converge to one point
    const count = Math.max(3, totalPolice);
    const ringAngle = (slotIndex / count) * Math.PI * 2 + 0.35;
    const cordonRadius = isSwat ? 19.5 : 16.5;
    const tx = playerX + Math.sin(ringAngle) * cordonRadius;
    const tz = playerZ + Math.cos(ringAngle) * cordonRadius;
    const distToSlot = Math.hypot(tx - policeX, tz - policeZ);
    const shouldHold = distToSlot < 4.5 || (distToPlayer < 14.5 && playerSpeed < 4);
    return {
      targetX: tx,
      targetZ: tz,
      desiredSpeed: shouldHold ? 0 : Math.min(maxSpd, 6 + distToSlot * 0.9),
      shouldBrakeAndDeploy: shouldHold,
    };
  }

  if (role === 'roadblock') {
    // Move ahead along the player's projected street vector and block at an angle
    const leadDist = Math.max(26, Math.min(48, 22 + playerSpeed * 1.1));
    const sideOffset = slotIndex % 2 === 0 ? 3.8 : -3.8;
    const tx = playerX + sinH * leadDist + rightX * sideOffset;
    const tz = playerZ + cosH * leadDist + rightZ * sideOffset;
    const distToBlock = Math.hypot(tx - policeX, tz - policeZ);
    const arrived = distToBlock < 5.5 && distToPlayer > 14;
    return {
      targetX: tx,
      targetZ: tz,
      desiredSpeed: arrived ? 0 : maxSpd,
      shouldBrakeAndDeploy: arrived,
    };
  }

  if (role === 'flank_left' || role === 'flank_right') {
    const side = role === 'flank_left' ? -1 : 1;
    const lateral = side * 6.2;
    const trail = -7.5 - (slotIndex % 2) * 5.0;
    const tx = playerX + sinH * trail + rightX * lateral;
    const tz = playerZ + cosH * trail + rightZ * lateral;
    const distToSlot = Math.hypot(tx - policeX, tz - policeZ);
    const matchSpeed = Math.max(playerSpeed + 3.5, 14);
    return {
      targetX: tx,
      targetZ: tz,
      desiredSpeed: distToSlot < 5 ? Math.min(maxSpd, playerSpeed + 1.5) : Math.min(maxSpd, matchSpeed + distToSlot * 0.4),
      shouldBrakeAndDeploy: false,
    };
  }

  // 'intercept' — lead pursuit & lateral PIT box-in (aims beside the suspect, never dead center)
  const lead = Math.min(14, playerSpeed * 0.45 + 4);
  const pitSide = slotIndex % 2 === 0 ? 4.4 : -4.4;
  const tx = playerX + sinH * lead + rightX * pitSide;
  const tz = playerZ + cosH * lead + rightZ * pitSide;
  return {
    targetX: tx,
    targetZ: tz,
    desiredSpeed: distToPlayer < 10 ? Math.min(maxSpd, Math.max(10, playerSpeed + 2)) : maxSpd,
    shouldBrakeAndDeploy: false,
  };
}

/**
 * Computes a repulsion steering offset to keep vehicles from crowding into the same point.
 */
export function computeSeparationVector(
  selfId: number,
  selfX: number,
  selfZ: number,
  neighbors: { id: number; x: number; z: number }[],
  comfortRadius = 9.5,
): { ox: number; oz: number } {
  let ox = 0;
  let oz = 0;
  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i];
    if (n.id === selfId) continue;
    const dx = selfX - n.x;
    const dz = selfZ - n.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > 0.0001 && distSq < comfortRadius * comfortRadius) {
      const dist = Math.sqrt(distSq);
      const strength = ((comfortRadius - dist) / comfortRadius) * 10.5;
      ox += (dx / dist) * strength;
      oz += (dz / dist) * strength;
    }
  }
  return { ox, oz };
}

/**
 * Computes safe forward speed factor (0..1) for civilian traffic when another vehicle is directly ahead in lane.
 */
export function computeTrafficBrakeFactor(
  selfX: number,
  selfZ: number,
  selfHeading: number,
  selfLength: number,
  others: { x: number; z: number; length: number }[],
): number {
  const sinH = Math.sin(selfHeading);
  const cosH = Math.cos(selfHeading);
  const rightX = cosH;
  const rightZ = -sinH;

  let minGap = 999;
  for (let i = 0; i < others.length; i++) {
    const o = others[i];
    const dx = o.x - selfX;
    const dz = o.z - selfZ;
    const fwd = dx * sinH + dz * cosH;
    if (fwd <= 0 || fwd > 20) continue;
    const lat = Math.abs(dx * rightX + dz * rightZ);
    if (lat > 2.6) continue;
    const bumperGap = fwd - (selfLength + o.length) * 0.5;
    if (bumperGap < minGap) minGap = bumperGap;
  }

  if (minGap <= 2.4) return 0;
  if (minGap >= 11.5) return 1;
  return (minGap - 2.4) / (11.5 - 2.4);
}
