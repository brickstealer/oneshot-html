import {
  BLOCK_SIZE,
  CURB_OFFSET,
  LANE_OFFSET,
  createRng,
  getBiomeAtWorld,
} from './worldGen';
import {
  calculateOrderFare,
  computeAcceleration,
  computeCornerSpeedFactor,
  computeMaxSpeedMs,
  computeSearchTimeFactor,
  getTotalUpgradeLevel,
  isFlightUnlocked,
  pickOrderTier,
} from './taxiEconomy';
import { generateBiomePassenger } from './passengers';
import type {
  BiomeId,
  OrderPhase,
  TaxiOrder,
  UpgradeLevels,
} from './types';

// Cardinal directions: 0 = +Z (South), 1 = +X (East), 2 = -Z (North), 3 = -X (West)
export const DIR_DX = [0, 1, 0, -1] as const;
export const DIR_DZ = [1, 0, -1, 0] as const;

// Right-hand side perpendicular vector (looking along dir)
export const RIGHT_DX = [-1, 0, 1, 0] as const;
export const RIGHT_DZ = [0, 1, 0, -1] as const;

const BOARDING_DURATION = 2.7; // seconds for door open -> walk in -> door close
const DROPOFF_DURATION = 2.4; // seconds for door open -> walk out -> door close

export function dirToYaw(dir: number): number {
  const d = ((dir % 4) + 4) % 4;
  if (d === 0) return 0;
  if (d === 1) return Math.PI * 0.5;
  if (d === 2) return Math.PI;
  return -Math.PI * 0.5;
}

export function normalizeAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export function lerpAngle(from: number, to: number, t: number): number {
  const diff = normalizeAngle(to - from);
  return from + diff * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Computes smooth door open amount (0..1) from normalized phase progress (0..1) */
export function computeDoorOpenAmount(phase: OrderPhase, phaseProgress: number): number {
  if (phase !== 'boarding' && phase !== 'dropoff') return 0;
  if (phaseProgress < 0.24) {
    return smoothstep(0.02, 0.24, phaseProgress);
  }
  if (phaseProgress > 0.74) {
    return 1 - smoothstep(0.74, 0.96, phaseProgress);
  }
  return 1;
}

/**
 * Computes desired flight altitude (meters above asphalt) for the hover-taxi transformation.
 * Returns 0 on ground or when landed for passenger boarding/dropoff, glides down smoothly
 * on approach to curb stops, and cruises 9.5..15.5m above the avenues in flight mode.
 */
export function computeTargetFlightAltitude(params: {
  flightUnlocked: boolean;
  phase: OrderPhase;
  onTargetSegment: boolean;
  distToStopM: number;
  totalUpgradeLevel: number;
}): number {
  const { flightUnlocked, phase, onTargetSegment, distToStopM, totalUpgradeLevel } = params;
  if (!flightUnlocked) return 0;
  if (phase === 'boarding' || phase === 'dropoff') return 0;

  // Cruise altitude scales gracefully from 9.5m up to 15.5m as vehicle climbs higher Prestige tiers
  const cruiseAlt = Math.min(15.5, 9.5 + Math.max(0, totalUpgradeLevel - 20) * 0.22);

  if (onTargetSegment && distToStopM < 38) {
    if (distToStopM <= 2) return 0;
    return cruiseAlt * smoothstep(2, 38, distToStopM);
  }

  return cruiseAlt;
}

export interface CurbSpot {
  x: number;
  z: number;
  gx: number;
  gz: number;
  dir: number;
}

export function getSegmentCurbSpot(
  gx: number,
  gz: number,
  dir: number,
  extraOffset = CURB_OFFSET,
): CurbSpot {
  const d = ((dir % 4) + 4) % 4;
  const cx = gx * BLOCK_SIZE + DIR_DX[d] * (BLOCK_SIZE * 0.5) + RIGHT_DX[d] * extraOffset;
  const cz = gz * BLOCK_SIZE + DIR_DZ[d] * (BLOCK_SIZE * 0.5) + RIGHT_DZ[d] * extraOffset;
  return { x: cx, z: cz, gx, gz, dir: d };
}

export function getSegmentPoint(
  gx: number,
  gz: number,
  dir: number,
  t: number,
  lateralOffset = LANE_OFFSET,
): { x: number; z: number } {
  const d = ((dir % 4) + 4) % 4;
  const clamped = Math.max(0, Math.min(1, t));
  const dist = clamped * BLOCK_SIZE;
  return {
    x: gx * BLOCK_SIZE + DIR_DX[d] * dist + RIGHT_DX[d] * lateralOffset,
    z: gz * BLOCK_SIZE + DIR_DZ[d] * dist + RIGHT_DZ[d] * lateralOffset,
  };
}

export function evalIntersectionCurve(
  gx: number,
  gz: number,
  fromDir: number,
  toDir: number,
  t: number,
  turnRadius = 11.5,
): { x: number; z: number; yaw: number } {
  const ix = gx * BLOCK_SIZE;
  const iz = gz * BLOCK_SIZE;
  const fd = ((fromDir % 4) + 4) % 4;
  const td = ((toDir % 4) + 4) % 4;

  const p0x = ix - DIR_DX[fd] * turnRadius + RIGHT_DX[fd] * LANE_OFFSET;
  const p0z = iz - DIR_DZ[fd] * turnRadius + RIGHT_DZ[fd] * LANE_OFFSET;

  const p2x = ix + DIR_DX[td] * turnRadius + RIGHT_DX[td] * LANE_OFFSET;
  const p2z = iz + DIR_DZ[td] * turnRadius + RIGHT_DZ[td] * LANE_OFFSET;

  const p1x = ix + RIGHT_DX[fd] * LANE_OFFSET + (fd === td ? 0 : RIGHT_DX[td] * LANE_OFFSET * 0.5);
  const p1z = iz + RIGHT_DZ[fd] * LANE_OFFSET + (fd === td ? 0 : RIGHT_DZ[td] * LANE_OFFSET * 0.5);

  const u = Math.max(0, Math.min(1, t));
  const inv = 1 - u;

  const x = inv * inv * p0x + 2 * inv * u * p1x + u * u * p2x;
  const z = inv * inv * p0z + 2 * inv * u * p1z + u * u * p2z;

  const tx = 2 * inv * (p1x - p0x) + 2 * u * (p2x - p1x);
  const tz = 2 * inv * (p1z - p0z) + 2 * u * (p2z - p1z);
  const yaw = Math.atan2(tx, tz);

  return { x, z, yaw };
}

export function chooseNextDirection(
  gx: number,
  gz: number,
  currentDir: number,
  targetGx: number | null,
  targetGz: number | null,
  rngVal: number,
): number {
  const reverseDir = (currentDir + 2) % 4;
  const candidates = [0, 1, 2, 3].filter((d) => d !== reverseDir);

  if (targetGx !== null && targetGz !== null) {
    let bestDir = candidates[0];
    let bestScore = Infinity;
    for (const d of candidates) {
      const nx = gx + DIR_DX[d];
      const nz = gz + DIR_DZ[d];
      const dist = Math.abs(targetGx - nx) + Math.abs(targetGz - nz);
      const straightBonus = d === currentDir ? -0.15 : 0;
      const score = dist + straightBonus;
      if (score < bestScore) {
        bestScore = score;
        bestDir = d;
      }
    }
    return bestDir;
  }

  if (rngVal < 0.62) return currentDir;
  if (rngVal < 0.81) return (currentDir + 1) % 4;
  return (currentDir + 3) % 4;
}

export interface TaxiSimState {
  gx: number;
  gz: number;
  dir: number;
  nextDir: number;
  segmentProgressM: number;
  x: number;
  z: number;
  yaw: number;
  speedMs: number;
  steerAngle: number;
  wheelSpin: number;
  braking: boolean;
  turnSignal: -1 | 0 | 1; // -1: left, 0: off, 1: right/curb
  lateralOffset: number;
  // VTOL Hover-Flight kinematics
  altitude: number; // meters above asphalt
  flightBlend: number; // 0 = wheels on road, 1 = full hover-flight transformation
  verticalVelocity: number; // m/s climb (+) or descent (-)
  // Door & passenger state
  phase: OrderPhase;
  phaseTimer: number;
  phaseDuration: number;
  phaseProgress: number; // 0..1 within boarding or dropoff
  doorOpenAmount: number; // 0..1 articulated passenger door open state
  hasPassengerInCabin: boolean;
  searchCooldown: number;
  activeOrder: TaxiOrder | null;
  targetGx: number | null;
  targetGz: number | null;
  targetDir: number | null;
  nextOrderId: number;
  // Progression
  totalDistanceM: number;
  tripsCompleted: number;
  balance: number;
  totalEarned: number;
  lastPayout: number;
  lastPayoutId: number;
}

export interface StepResult {
  completedOrder: boolean;
  pickedUpOrder: boolean;
  newOrderAssigned: boolean;
  payoutAmount: number;
}

export class AutonomousTaxiController {
  public state: TaxiSimState;
  private rng: () => number;

  constructor(seed = 2026, initialBalance = 260) {
    this.rng = createRng(seed);
    const startPos = getSegmentPoint(0, 0, 2, 0.2, LANE_OFFSET);
    this.state = {
      gx: 0,
      gz: 0,
      dir: 2, // Drive North (-Z) down the grand metropolis avenue
      nextDir: 2,
      segmentProgressM: BLOCK_SIZE * 0.2,
      x: startPos.x,
      z: startPos.z,
      yaw: dirToYaw(2),
      speedMs: 12,
      steerAngle: 0,
      wheelSpin: 0,
      braking: false,
      turnSignal: 0,
      lateralOffset: LANE_OFFSET,
      altitude: 0,
      flightBlend: 0,
      verticalVelocity: 0,
      phase: 'cruising',
      phaseTimer: 0,
      phaseDuration: 1,
      phaseProgress: 0,
      doorOpenAmount: 0,
      hasPassengerInCabin: false,
      searchCooldown: 0.7, // Immediate first order right ahead in plain sight!
      activeOrder: null,
      targetGx: null,
      targetGz: null,
      targetDir: null,
      nextOrderId: 1,
      totalDistanceM: 0,
      tripsCompleted: 0,
      balance: initialBalance,
      totalEarned: 0,
      lastPayout: 0,
      lastPayoutId: 0,
    };
  }

  public teleportToGrid(gx: number, gz: number, dir = 2): void {
    const startPos = getSegmentPoint(gx, gz, dir, 0.2, LANE_OFFSET);
    this.state.gx = gx;
    this.state.gz = gz;
    this.state.dir = dir;
    this.state.nextDir = dir;
    this.state.segmentProgressM = BLOCK_SIZE * 0.2;
    this.state.x = startPos.x;
    this.state.z = startPos.z;
    this.state.yaw = dirToYaw(dir);
    this.state.speedMs = 11;
    this.state.lateralOffset = LANE_OFFSET;
    this.state.altitude = 0;
    this.state.flightBlend = 0;
    this.state.verticalVelocity = 0;
    this.state.phase = 'cruising';
    this.state.phaseProgress = 0;
    this.state.doorOpenAmount = 0;
    this.state.hasPassengerInCabin = false;
    this.state.turnSignal = 0;
    this.state.activeOrder = null;
    this.state.targetGx = null;
    this.state.targetGz = null;
    this.state.targetDir = null;
    this.state.searchCooldown = 0.45;
  }

  private dispatchOrder(upgrades: UpgradeLevels): void {
    const s = this.state;
    const isFirstOrder = s.nextOrderId === 1;

    // Place pickup right ahead on the visible avenue (1 block ahead so local biome passenger is immediately seen!)
    const aheadSteps = isFirstOrder ? 1 : 1 + Math.floor(this.rng() * 2);
    const sideSteps = isFirstOrder ? 0 : this.rng() < 0.72 ? 0 : this.rng() < 0.5 ? -1 : 1;
    const pickupGx = s.gx + DIR_DX[s.dir] * aheadSteps + RIGHT_DX[s.dir] * sideSteps;
    const pickupGz = s.gz + DIR_DZ[s.dir] * aheadSteps + RIGHT_DZ[s.dir] * sideSteps;
    const pickupDir = s.dir;
    const pickupCurb = getSegmentCurbSpot(pickupGx, pickupGz, pickupDir, CURB_OFFSET);

    // Dropoff 2-4 blocks ahead (frequent satisfying trips + biome transitions!)
    const dropForward = 2 + Math.floor(this.rng() * 3);
    const dropSide = Math.floor(this.rng() * 3) - 1;
    const dropoffGx = pickupGx + DIR_DX[pickupDir] * dropForward + RIGHT_DX[pickupDir] * dropSide;
    const dropoffGz = pickupGz + DIR_DZ[pickupDir] * dropForward + RIGHT_DZ[pickupDir] * dropSide;
    const dropoffDir = (pickupDir + (this.rng() < 0.55 ? 0 : this.rng() < 0.5 ? 1 : 3)) % 4;
    const dropoffCurb = getSegmentCurbSpot(dropoffGx, dropoffGz, dropoffDir, CURB_OFFSET);

    const pickupBiome: BiomeId = getBiomeAtWorld(pickupCurb.x, pickupCurb.z);
    const dropoffBiome: BiomeId = getBiomeAtWorld(dropoffCurb.x, dropoffCurb.z);
    const manhattanM =
      (Math.abs(dropoffGx - pickupGx) + Math.abs(dropoffGz - pickupGz)) * BLOCK_SIZE;
    const tier = pickOrderTier(upgrades, this.rng());
    const baseFare = calculateOrderFare({
      distanceM: Math.max(BLOCK_SIZE * 2, manhattanM),
      tier,
      pickupBiome,
      dropoffBiome,
      upgrades,
    });

    const id = s.nextOrderId++;
    const passengerSeed = id * 13 + Math.floor(this.rng() * 97);
    const themed = generateBiomePassenger(pickupBiome, dropoffBiome, passengerSeed);

    s.activeOrder = {
      id,
      passengerName: themed.name,
      passengerArchetype: themed.archetype,
      passengerQuote: themed.quote,
      passengerCoatHex: themed.coatHex,
      passengerPantsHex: themed.pantsHex,
      passengerSkinHex: themed.skinHex,
      tier,
      pickupX: pickupCurb.x,
      pickupZ: pickupCurb.z,
      pickupDir,
      dropoffX: dropoffCurb.x,
      dropoffZ: dropoffCurb.z,
      dropoffDir,
      pickupBiome,
      dropoffBiome,
      estimatedDistance: manhattanM,
      baseFare,
      currentFare: Math.round(baseFare * 0.25),
      traveledDistance: 0,
    };

    s.phase = 'en_route_pickup';
    s.targetGx = pickupGx;
    s.targetGz = pickupGz;
    s.targetDir = pickupDir;

    // Immediately align nextDir toward the newly assigned pickup!
    const upcomingGx = s.gx + DIR_DX[s.dir];
    const upcomingGz = s.gz + DIR_DZ[s.dir];
    s.nextDir = chooseNextDirection(
      upcomingGx,
      upcomingGz,
      s.dir,
      s.targetGx,
      s.targetGz,
      this.rng(),
    );
  }

  public getDistanceToTargetM(): number {
    const s = this.state;
    if (!s.activeOrder) return 0;
    if (s.phase === 'en_route_pickup' || s.phase === 'boarding') {
      return Math.hypot(s.activeOrder.pickupX - s.x, s.activeOrder.pickupZ - s.z);
    }
    if (s.phase === 'en_route_dropoff' || s.phase === 'dropoff') {
      return Math.hypot(s.activeOrder.dropoffX - s.x, s.activeOrder.dropoffZ - s.z);
    }
    return 0;
  }

  public getTripProgress(): number {
    const s = this.state;
    if (!s.activeOrder) return 0;
    if (s.phase === 'dropoff') return 1;
    if (s.phase !== 'en_route_dropoff') return 0;
    return Math.max(
      0,
      Math.min(1, s.activeOrder.traveledDistance / Math.max(1, s.activeOrder.estimatedDistance)),
    );
  }

  public step(dt: number, upgrades: UpgradeLevels): StepResult {
    const safeDt = Math.min(0.1, Math.max(0.001, dt));
    const s = this.state;
    const result: StepResult = {
      completedOrder: false,
      pickedUpOrder: false,
      newOrderAssigned: false,
      payoutAmount: 0,
    };

    const flightUnlocked = isFlightUnlocked(upgrades);
    const totalLvl = getTotalUpgradeLevel(upgrades);
    const flightSpeedBonus = flightUnlocked && s.flightBlend > 0.35 ? 1.28 : 1.0;
    const maxSpeed = computeMaxSpeedMs(upgrades.engine) * flightSpeedBonus;
    const accel = computeAcceleration(upgrades.engine);
    const cornerFactor = computeCornerSpeedFactor(upgrades.autopilot);
    const turnZone = 11.5;

    const updateAltitude = (targetAlt: number) => {
      const prevAlt = s.altitude;
      const climbLambda = targetAlt > s.altitude ? 2.1 : 3.4;
      s.altitude += (targetAlt - s.altitude) * (1 - Math.exp(-climbLambda * safeDt));
      if (targetAlt === 0 && s.altitude < 0.04) s.altitude = 0;
      s.verticalVelocity = (s.altitude - prevAlt) / safeDt;
      s.flightBlend = Math.max(0, Math.min(1, s.altitude / 2.2));
    };

    // 1. Stationary boarding animation (door opens -> passenger walks in -> seated -> door closes)
    if (s.phase === 'boarding') {
      updateAltitude(0);
      s.speedMs = Math.max(0, s.speedMs - accel * 2.4 * safeDt);
      s.braking = true;
      s.turnSignal = 1; // right curb indicator blinking
      s.steerAngle *= Math.exp(-8 * safeDt);
      s.phaseTimer -= safeDt;
      s.phaseProgress = Math.max(0, Math.min(1, 1 - s.phaseTimer / s.phaseDuration));
      s.doorOpenAmount = computeDoorOpenAmount('boarding', s.phaseProgress);
      // Passenger visibly enters rear cabin at 66% of boarding phase
      s.hasPassengerInCabin = s.phaseProgress >= 0.66;

      if (s.phaseTimer <= 0 && s.activeOrder) {
        s.phase = 'en_route_dropoff';
        s.phaseProgress = 0;
        s.doorOpenAmount = 0;
        s.hasPassengerInCabin = true;
        s.turnSignal = 0;
        const dGx = Math.round(
          (s.activeOrder.dropoffX -
            DIR_DX[s.activeOrder.dropoffDir] * (BLOCK_SIZE * 0.5) -
            RIGHT_DX[s.activeOrder.dropoffDir] * CURB_OFFSET) /
            BLOCK_SIZE,
        );
        const dGz = Math.round(
          (s.activeOrder.dropoffZ -
            DIR_DZ[s.activeOrder.dropoffDir] * (BLOCK_SIZE * 0.5) -
            RIGHT_DX[s.activeOrder.dropoffDir] * 0 -
            RIGHT_DZ[s.activeOrder.dropoffDir] * CURB_OFFSET) /
            BLOCK_SIZE,
        );
        s.targetGx = dGx;
        s.targetGz = dGz;
        s.targetDir = s.activeOrder.dropoffDir;
        const upGx = s.gx + DIR_DX[s.dir];
        const upGz = s.gz + DIR_DZ[s.dir];
        s.nextDir = chooseNextDirection(upGx, upGz, s.dir, s.targetGx, s.targetGz, this.rng());
        result.pickedUpOrder = true;
      }
      return result;
    }

    // 2. Stationary dropoff animation (door opens -> passenger steps out -> door closes -> payout)
    if (s.phase === 'dropoff') {
      updateAltitude(0);
      s.speedMs = Math.max(0, s.speedMs - accel * 2.4 * safeDt);
      s.braking = true;
      s.turnSignal = 1;
      s.steerAngle *= Math.exp(-8 * safeDt);
      s.phaseTimer -= safeDt;
      s.phaseProgress = Math.max(0, Math.min(1, 1 - s.phaseTimer / s.phaseDuration));
      s.doorOpenAmount = computeDoorOpenAmount('dropoff', s.phaseProgress);
      // Passenger leaves rear cabin once door is open (~26%)
      s.hasPassengerInCabin = s.phaseProgress < 0.26;

      if (s.phaseTimer <= 0 && s.activeOrder) {
        const payout = s.activeOrder.baseFare;
        s.balance += payout;
        s.totalEarned += payout;
        s.tripsCompleted += 1;
        s.lastPayout = payout;
        s.lastPayoutId += 1;
        s.activeOrder = null;
        s.targetGx = null;
        s.targetGz = null;
        s.targetDir = null;
        s.phase = 'cruising';
        s.phaseProgress = 0;
        s.doorOpenAmount = 0;
        s.hasPassengerInCabin = false;
        s.turnSignal = 0;
        s.searchCooldown = (1.6 + this.rng() * 1.8) * computeSearchTimeFactor(upgrades.autopilot);
        result.completedOrder = true;
        result.payoutAmount = payout;
      }
      return result;
    }

    s.doorOpenAmount = 0;
    s.phaseProgress = 0;
    s.hasPassengerInCabin = s.phase === 'en_route_dropoff';

    // 3. Dispatch new order while cruising
    if (s.phase === 'cruising') {
      s.searchCooldown -= safeDt;
      if (s.searchCooldown <= 0) {
        this.dispatchOrder(upgrades);
        result.newOrderAssigned = true;
      }
    }

    // 4. Determine if approaching a curb stop on this segment
    const onTargetSegment =
      (s.phase === 'en_route_pickup' || s.phase === 'en_route_dropoff') &&
      s.targetGx !== null &&
      s.targetGz !== null &&
      s.gx === s.targetGx &&
      s.gz === s.targetGz;

    const stopProgressM = BLOCK_SIZE * 0.5;
    const distToStopM = onTargetSegment ? stopProgressM - s.segmentProgressM : Infinity;

    // Update VTOL hover-flight altitude (soars smoothly above traffic, glides down cleanly for curb stops)
    const targetAlt = computeTargetFlightAltitude({
      flightUnlocked,
      phase: s.phase,
      onTargetSegment,
      distToStopM,
      totalUpgradeLevel: totalLvl,
    });
    updateAltitude(targetAlt);

    // 5. Target speed & turn signals
    const isTurning = s.nextDir !== s.dir;
    const approachingTurn = s.segmentProgressM > BLOCK_SIZE - turnZone - 16 && isTurning;
    const inTurn = s.segmentProgressM > BLOCK_SIZE - turnZone;

    if (onTargetSegment && distToStopM < 28 && distToStopM > -4) {
      s.turnSignal = 1; // pulling over to right curb
    } else if (approachingTurn || inTurn) {
      const turnDelta = (s.nextDir - s.dir + 4) % 4;
      s.turnSignal = turnDelta === 1 ? -1 : turnDelta === 3 ? 1 : 0;
    } else {
      s.turnSignal = 0;
    }

    let desiredSpeed = maxSpeed;
    if (s.phase === 'cruising') {
      desiredSpeed = maxSpeed * 0.78;
    }
    if (approachingTurn || inTurn) {
      desiredSpeed = Math.min(desiredSpeed, Math.max(9, maxSpeed * cornerFactor));
    }
    if (onTargetSegment && distToStopM < 28 && distToStopM >= -2) {
      const stopFrac = Math.max(0, distToStopM / 28);
      desiredSpeed = Math.min(desiredSpeed, Math.max(2.5, maxSpeed * Math.sqrt(stopFrac) * 0.85));
    }

    if (s.speedMs < desiredSpeed) {
      s.speedMs = Math.min(desiredSpeed, s.speedMs + accel * safeDt);
      s.braking = false;
    } else if (s.speedMs > desiredSpeed + 0.6) {
      s.speedMs = Math.max(desiredSpeed, s.speedMs - accel * 1.8 * safeDt);
      s.braking = true;
    } else {
      s.braking = false;
    }

    // 6. Advance along segment
    const moveDist = s.speedMs * safeDt;
    s.segmentProgressM += moveDist;
    s.totalDistanceM += moveDist;
    s.wheelSpin += moveDist / 0.36;

    if (s.phase === 'en_route_dropoff' && s.activeOrder) {
      s.activeOrder.traveledDistance += moveDist;
      const ratio = Math.min(
        1,
        s.activeOrder.traveledDistance / Math.max(1, s.activeOrder.estimatedDistance),
      );
      s.activeOrder.currentFare = Math.round(
        s.activeOrder.baseFare * (0.25 + 0.75 * ratio),
      );
    }

    // Check arrival at curb stop
    if (onTargetSegment && s.segmentProgressM >= stopProgressM - 0.8 && s.segmentProgressM <= stopProgressM + 6) {
      s.segmentProgressM = stopProgressM;
      s.speedMs = 0;
      s.braking = true;
      s.altitude = 0;
      s.flightBlend = 0;
      s.verticalVelocity = 0;
      s.lateralOffset = CURB_OFFSET;
      const curbPos = getSegmentPoint(s.gx, s.gz, s.dir, 0.5, CURB_OFFSET);
      s.x = curbPos.x;
      s.z = curbPos.z;
      s.yaw = dirToYaw(s.dir);

      if (s.phase === 'en_route_pickup') {
        s.phase = 'boarding';
        s.phaseDuration = BOARDING_DURATION;
        s.phaseTimer = BOARDING_DURATION;
        s.phaseProgress = 0;
        // Snap pickup coordinates neatly to actual stop curb so passenger walks straight to door
        if (s.activeOrder) {
          s.activeOrder.pickupX = curbPos.x;
          s.activeOrder.pickupZ = curbPos.z;
          s.activeOrder.pickupDir = s.dir;
        }
      } else if (s.phase === 'en_route_dropoff') {
        s.phase = 'dropoff';
        s.phaseDuration = DROPOFF_DURATION;
        s.phaseTimer = DROPOFF_DURATION;
        s.phaseProgress = 0;
        if (s.activeOrder) {
          s.activeOrder.dropoffX = curbPos.x;
          s.activeOrder.dropoffZ = curbPos.z;
          s.activeOrder.dropoffDir = s.dir;
        }
      }
      return result;
    }

    // Proximity fallback if approaching target curb from a perpendicular lane
    if (
      (s.phase === 'en_route_pickup' || s.phase === 'en_route_dropoff') &&
      s.activeOrder &&
      !onTargetSegment
    ) {
      const tx = s.phase === 'en_route_pickup' ? s.activeOrder.pickupX : s.activeOrder.dropoffX;
      const tz = s.phase === 'en_route_pickup' ? s.activeOrder.pickupZ : s.activeOrder.dropoffZ;
      if (Math.hypot(tx - s.x, tz - s.z) < 16) {
        s.speedMs = 0;
        s.braking = true;
        s.altitude = 0;
        s.flightBlend = 0;
        s.verticalVelocity = 0;
        if (s.phase === 'en_route_pickup') {
          s.phase = 'boarding';
          s.phaseDuration = BOARDING_DURATION;
          s.phaseTimer = BOARDING_DURATION;
          s.phaseProgress = 0;
          s.activeOrder.pickupX = s.x;
          s.activeOrder.pickupZ = s.z;
          s.activeOrder.pickupDir = s.dir;
        } else {
          s.phase = 'dropoff';
          s.phaseDuration = DROPOFF_DURATION;
          s.phaseTimer = DROPOFF_DURATION;
          s.phaseProgress = 0;
          s.activeOrder.dropoffX = s.x;
          s.activeOrder.dropoffZ = s.z;
          s.activeOrder.dropoffDir = s.dir;
        }
        return result;
      }
    }

    // 7. Smooth lateral pull-over interpolation
    const desiredLateral =
      onTargetSegment && distToStopM < 24 && distToStopM > -4 ? CURB_OFFSET : LANE_OFFSET;
    s.lateralOffset += (desiredLateral - s.lateralOffset) * (1 - Math.exp(-5.5 * safeDt));

    // 8. Transition past intersection into next block
    if (s.segmentProgressM >= BLOCK_SIZE) {
      s.segmentProgressM -= BLOCK_SIZE;
      s.gx += DIR_DX[s.dir];
      s.gz += DIR_DZ[s.dir];
      s.dir = s.nextDir;

      const upcomingGx = s.gx + DIR_DX[s.dir];
      const upcomingGz = s.gz + DIR_DZ[s.dir];
      s.nextDir = chooseNextDirection(
        upcomingGx,
        upcomingGz,
        s.dir,
        s.targetGx,
        s.targetGz,
        this.rng(),
      );
    }

    // 9. Compute world pose
    const prevYaw = s.yaw;
    if (s.segmentProgressM > BLOCK_SIZE - turnZone && s.nextDir !== s.dir) {
      const turnT = (s.segmentProgressM - (BLOCK_SIZE - turnZone)) / (turnZone * 2);
      const nextGx = s.gx + DIR_DX[s.dir];
      const nextGz = s.gz + DIR_DZ[s.dir];
      const pose = evalIntersectionCurve(nextGx, nextGz, s.dir, s.nextDir, turnT, turnZone);
      s.x = pose.x;
      s.z = pose.z;
      s.yaw = lerpAngle(s.yaw, pose.yaw, 1 - Math.exp(-14 * safeDt));
    } else if (s.segmentProgressM < turnZone) {
      const pos = getSegmentPoint(s.gx, s.gz, s.dir, s.segmentProgressM / BLOCK_SIZE, s.lateralOffset);
      s.x += (pos.x - s.x) * (1 - Math.exp(-12 * safeDt));
      s.z += (pos.z - s.z) * (1 - Math.exp(-12 * safeDt));
      s.yaw = lerpAngle(s.yaw, dirToYaw(s.dir), 1 - Math.exp(-10 * safeDt));
    } else {
      const pos = getSegmentPoint(s.gx, s.gz, s.dir, s.segmentProgressM / BLOCK_SIZE, s.lateralOffset);
      s.x = pos.x;
      s.z = pos.z;
      s.yaw = lerpAngle(s.yaw, dirToYaw(s.dir), 1 - Math.exp(-12 * safeDt));
    }

    const yawRate = normalizeAngle(s.yaw - prevYaw) / safeDt;
    const targetSteer = Math.max(-0.48, Math.min(0.48, yawRate * 0.42));
    s.steerAngle += (targetSteer - s.steerAngle) * (1 - Math.exp(-10 * safeDt));

    return result;
  }
}
