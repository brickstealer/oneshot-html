import { BLOCK_SIZE, CURB_OFFSET, LANE_OFFSET, createRng } from './worldGen';
import {
  DIR_DX,
  DIR_DZ,
  RIGHT_DX,
  RIGHT_DZ,
  computeDoorOpenAmount,
  dirToYaw,
  lerpAngle,
} from './navigation';
import type { OrderPhase } from './types';

export interface FleetTaxiAgent {
  id: number;
  tier: 0 | 1 | 2 | 3 | 4;
  isAero: boolean;
  cruiseAltitude: number;
  gx: number;
  gz: number;
  dir: number;
  progressM: number;
  lateralOffset: number;
  x: number;
  z: number;
  yaw: number;
  speedMs: number;
  baseSpeedMs: number;
  altitude: number;
  flightBlend: number;
  verticalVelocity: number;
  phase: OrderPhase;
  phaseTimer: number;
  phaseDuration: number;
  phaseProgress: number;
  doorOpenAmount: number;
  hasPassenger: boolean;
  passengerCoatHex: number;
  tripsCompleted: number;
  stopsRemaining: number; // blocks left before next pickup/dropoff stop
  // World coordinates of active curb stop when stopping/boarding/dropoff
  stopX: number;
  stopZ: number;
  stopDir: number;
}

const PEER_COAT_PALETTE = [
  0xe11d48,
  0x2563eb,
  0x059669,
  0xd97706,
  0x7c3aed,
  0x0891b2,
  0xf97316,
  0xec4899,
];

const PEER_BOARDING_DUR = 2.6;
const PEER_DROPOFF_DUR = 2.2;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Pure simulation controller for a bustling fleet of autonomous peer taxis
 * (both ground sedans/GTs and flying Aero-Shuttles) operating concurrently
 * across the infinite procedural city around the hero taxi.
 */
export class AutonomousTaxiFleet {
  public readonly agents: FleetTaxiAgent[] = [];
  public totalFleetTrips = 0;
  private rng: () => number;

  constructor(count = 28, seed = 7742) {
    this.rng = createRng(seed);
    const aeroAltLanes = [7.4, 10.2, 13.0];

    // First 16 slots are staged right along the hero's starting avenue (gx=0) and adjacent cross-streets
    // so the player immediately sees a bustling swarm of ground & flying taxis working alongside them.
    const corridorSeeds: Array<{ gx: number; gz: number; dir: number; progressM: number; stopNow: boolean }> = [
      // Same avenue ahead (heading -Z)
      { gx: 0, gz: 0, dir: 2, progressM: 38, stopNow: true },
      { gx: 0, gz: -1, dir: 2, progressM: 14, stopNow: false },
      { gx: 0, gz: -1, dir: 2, progressM: 42, stopNow: true },
      { gx: 0, gz: -2, dir: 2, progressM: 22, stopNow: false },
      // Oncoming lane on hero's avenue (heading +Z)
      { gx: 0, gz: -1, dir: 0, progressM: 20, stopNow: false },
      { gx: 0, gz: -1, dir: 0, progressM: 46, stopNow: true },
      { gx: 0, gz: -2, dir: 0, progressM: 18, stopNow: false },
      { gx: 0, gz: 0, dir: 0, progressM: 12, stopNow: false },
      // Cross-street traffic right ahead of hero (gz = -1, -2)
      { gx: -1, gz: -1, dir: 1, progressM: 36, stopNow: false },
      { gx: 1, gz: -1, dir: 3, progressM: 32, stopNow: true },
      { gx: -1, gz: -2, dir: 1, progressM: 26, stopNow: false },
      { gx: 1, gz: -2, dir: 3, progressM: 28, stopNow: false },
      // Parallel neighboring avenues (gx = ±1) for aerial drone & panoramic views
      { gx: -1, gz: 0, dir: 2, progressM: 24, stopNow: true },
      { gx: 1, gz: 0, dir: 2, progressM: 34, stopNow: false },
      { gx: -1, gz: -1, dir: 0, progressM: 28, stopNow: false },
      { gx: 1, gz: -1, dir: 2, progressM: 18, stopNow: false },
    ];

    for (let i = 0; i < count; i++) {
      // Rich diverse fleet: classic yellow cabs, business, sport GT, luxury GT, and ~36% flying Aero-Shuttles
      const roll = this.rng();
      const tier: 0 | 1 | 2 | 3 | 4 =
        i % 3 === 1
          ? 4 // ~33%+ flying Aero-Shuttles soaring through sky-lanes right overhead!
          : roll < 0.44
            ? 0
            : roll < 0.66
              ? 1
              : roll < 0.85
                ? 2
                : 3;
      const isAero = tier === 4;
      const cruiseAltitude = isAero ? aeroAltLanes[i % aeroAltLanes.length] : 0;

      let gx: number;
      let gz: number;
      let dir: number;
      let progressM: number;
      let stopsRemaining: number;

      if (i < corridorSeeds.length) {
        const s = corridorSeeds[i];
        gx = s.gx;
        gz = s.gz;
        dir = s.dir;
        progressM = s.progressM;
        stopsRemaining = s.stopNow ? 0 : 1 + (i % 2);
      } else {
        const idx = i - corridorSeeds.length;
        gx = (idx % 5) - 2;
        gz = Math.floor(idx / 5) - 2;
        dir = i % 4;
        progressM = 8 + this.rng() * (BLOCK_SIZE - 16);
        stopsRemaining = i % 3 === 0 ? 0 : 1 + (i % 2);
      }

      const startsOccupied = i % 2 === 1;
      const baseSpeedMs = isAero
        ? 17.5 + this.rng() * 6.5
        : 11.5 + tier * 1.4 + this.rng() * 4.5;

      const x =
        gx * BLOCK_SIZE + DIR_DX[dir] * progressM + RIGHT_DX[dir] * LANE_OFFSET;
      const z =
        gz * BLOCK_SIZE + DIR_DZ[dir] * progressM + RIGHT_DZ[dir] * LANE_OFFSET;

      this.agents.push({
        id: i + 1,
        tier,
        isAero,
        cruiseAltitude,
        gx,
        gz,
        dir,
        progressM,
        lateralOffset: LANE_OFFSET,
        x,
        z,
        yaw: dirToYaw(dir),
        speedMs: baseSpeedMs,
        baseSpeedMs,
        altitude: isAero ? cruiseAltitude : 0,
        flightBlend: isAero ? 1 : 0,
        verticalVelocity: 0,
        phase: startsOccupied ? 'en_route_dropoff' : 'en_route_pickup',
        phaseTimer: 0,
        phaseDuration: 1,
        phaseProgress: 0,
        doorOpenAmount: 0,
        hasPassenger: startsOccupied,
        passengerCoatHex: PEER_COAT_PALETTE[i % PEER_COAT_PALETTE.length],
        tripsCompleted: 0,
        stopsRemaining,
        stopX: x,
        stopZ: z,
        stopDir: dir,
      });
    }
  }

  public getActiveCount(trafficDensity: number): number {
    // Always keep a bustling fleet of at least 14 working peer taxis, up to full 28-taxi fleet
    const clamped = Math.max(0, Math.min(1, trafficDensity));
    return Math.min(
      this.agents.length,
      Math.max(14, Math.round(this.agents.length * (0.5 + clamped * 0.5))),
    );
  }

  public step(params: {
    dt: number;
    heroX: number;
    heroZ: number;
    heroAltitude: number;
    trafficDensity: number;
  }): void {
    const { dt, heroX, heroZ, heroAltitude, trafficDensity } = params;
    const safeDt = Math.min(0.1, Math.max(0.001, dt));
    const activeCount = this.getActiveCount(trafficDensity);
    const heroGx = Math.round(heroX / BLOCK_SIZE);
    const heroGz = Math.round(heroZ / BLOCK_SIZE);
    const stopPointM = BLOCK_SIZE * 0.5;

    for (let i = 0; i < activeCount; i++) {
      const a = this.agents[i];

      // 1. Wrap drifted peer taxis neatly back into the ±2 block radius, strongly biased toward hero's active avenues
      if (Math.abs(a.gx - heroGx) > 2 || Math.abs(a.gz - heroGz) > 2) {
        const edge = Math.floor(this.rng() * 4);
        // 60% chance to respawn directly onto the hero's avenue or immediate neighboring street
        const offset =
          this.rng() < 0.6
            ? Math.floor(this.rng() * 3) - 1
            : Math.floor(this.rng() * 5) - 2;
        if (edge === 0) {
          a.gx = heroGx + offset;
          a.gz = heroGz - 2;
          a.dir = 0; // enter heading +Z
        } else if (edge === 1) {
          a.gx = heroGx - 2;
          a.gz = heroGz + offset;
          a.dir = 1; // enter heading +X
        } else if (edge === 2) {
          a.gx = heroGx + offset;
          a.gz = heroGz + 2;
          a.dir = 2; // enter heading -Z
        } else {
          a.gx = heroGx + 2;
          a.gz = heroGz + offset;
          a.dir = 3; // enter heading -X
        }
        a.progressM = 4 + this.rng() * 14;
        a.lateralOffset = LANE_OFFSET;
        a.phase = a.hasPassenger ? 'en_route_dropoff' : 'en_route_pickup';
        a.phaseProgress = 0;
        a.doorOpenAmount = 0;
        a.stopsRemaining = Math.floor(this.rng() * 2);
        a.altitude = a.isAero ? a.cruiseAltitude : 0;
        a.flightBlend = a.isAero ? 1 : 0;
        a.yaw = dirToYaw(a.dir);
      }

      const updateAltitude = (targetAlt: number) => {
        if (!a.isAero) {
          a.altitude = 0;
          a.flightBlend = 0;
          a.verticalVelocity = 0;
          return;
        }
        const prevAlt = a.altitude;
        const lambda = targetAlt > a.altitude ? 2.2 : 3.5;
        a.altitude += (targetAlt - a.altitude) * (1 - Math.exp(-lambda * safeDt));
        if (targetAlt === 0 && a.altitude < 0.05) a.altitude = 0;
        a.verticalVelocity = (a.altitude - prevAlt) / safeDt;
        a.flightBlend = Math.max(0, Math.min(1, a.altitude / 2.2));
      };

      // 2. Stationary boarding / dropoff stop at curb
      if (a.phase === 'boarding' || a.phase === 'dropoff') {
        updateAltitude(0);
        a.speedMs = 0;
        a.phaseTimer -= safeDt;
        a.phaseProgress = Math.max(0, Math.min(1, 1 - a.phaseTimer / a.phaseDuration));
        a.doorOpenAmount = computeDoorOpenAmount(a.phase, a.phaseProgress);

        if (a.phase === 'boarding') {
          a.hasPassenger = a.phaseProgress >= 0.65;
        } else {
          a.hasPassenger = a.phaseProgress < 0.28;
        }

        if (a.phaseTimer <= 0) {
          if (a.phase === 'boarding') {
            a.phase = 'en_route_dropoff';
            a.hasPassenger = true;
            a.stopsRemaining = 1 + Math.floor(this.rng() * 2);
          } else {
            a.phase = 'en_route_pickup';
            a.hasPassenger = false;
            a.tripsCompleted += 1;
            this.totalFleetTrips += 1;
            a.passengerCoatHex =
              PEER_COAT_PALETTE[Math.floor(this.rng() * PEER_COAT_PALETTE.length)];
            a.stopsRemaining = 1 + Math.floor(this.rng() * 2);
          }
          a.phaseProgress = 0;
          a.doorOpenAmount = 0;
        }
        continue;
      }

      // 3. Approaching curb stop on this block?
      const stoppingThisBlock =
        a.stopsRemaining <= 0 &&
        (a.phase === 'en_route_pickup' || a.phase === 'en_route_dropoff');
      const distToStop = stoppingThisBlock ? stopPointM - a.progressM : Infinity;

      // Update altitude: cruise high when Aero, glide down cleanly on approach to curb
      if (a.isAero) {
        let targetAlt = a.cruiseAltitude;
        if (stoppingThisBlock && distToStop < 34) {
          targetAlt = distToStop <= 2 ? 0 : a.cruiseAltitude * smoothstep(2, 34, distToStop);
        }
        updateAltitude(targetAlt);
      }

      // Compute desired speed
      let desiredSpeed = a.baseSpeedMs * (a.isAero && a.flightBlend > 0.4 ? 1.2 : 1.0);
      if (stoppingThisBlock && distToStop < 24 && distToStop >= -1) {
        const frac = Math.max(0, distToStop / 24);
        desiredSpeed = Math.min(desiredSpeed, Math.max(2.5, a.baseSpeedMs * Math.sqrt(frac) * 0.8));
      }

      // Yield cleanly to hero taxi if sharing the same vertical altitude band
      const horizDistToHero = Math.hypot(a.x - heroX, a.z - heroZ);
      const vertDistToHero = Math.abs(a.altitude - heroAltitude);
      if (horizDistToHero < 11.5 && vertDistToHero < 3.2) {
        desiredSpeed = 0;
      }

      const accelRate = desiredSpeed < a.speedMs ? 22 : 11;
      a.speedMs += (desiredSpeed - a.speedMs) * Math.min(1, safeDt * (accelRate / 8));
      if (desiredSpeed === 0 && a.speedMs < 0.3) a.speedMs = 0;

      // Pull over toward curb when approaching stop
      const desiredLateral =
        stoppingThisBlock && distToStop < 22 && distToStop > -3 ? CURB_OFFSET : LANE_OFFSET;
      a.lateralOffset += (desiredLateral - a.lateralOffset) * (1 - Math.exp(-5.5 * safeDt));

      // Advance along road segment
      a.progressM += a.speedMs * safeDt;

      // Trigger curb stop arrival
      if (stoppingThisBlock && a.progressM >= stopPointM - 0.9 && a.progressM <= stopPointM + 5) {
        a.progressM = stopPointM;
        a.speedMs = 0;
        a.altitude = 0;
        a.flightBlend = 0;
        a.verticalVelocity = 0;
        a.lateralOffset = CURB_OFFSET;
        a.x = a.gx * BLOCK_SIZE + DIR_DX[a.dir] * a.progressM + RIGHT_DX[a.dir] * CURB_OFFSET;
        a.z = a.gz * BLOCK_SIZE + DIR_DZ[a.dir] * a.progressM + RIGHT_DZ[a.dir] * CURB_OFFSET;
        a.yaw = dirToYaw(a.dir);
        a.stopX = a.x;
        a.stopZ = a.z;
        a.stopDir = a.dir;

        if (a.phase === 'en_route_pickup') {
          a.phase = 'boarding';
          a.phaseDuration = PEER_BOARDING_DUR;
          a.phaseTimer = PEER_BOARDING_DUR;
        } else {
          a.phase = 'dropoff';
          a.phaseDuration = PEER_DROPOFF_DUR;
          a.phaseTimer = PEER_DROPOFF_DUR;
        }
        a.phaseProgress = 0;
        continue;
      }

      // Intersection transition
      if (a.progressM >= BLOCK_SIZE) {
        a.progressM -= BLOCK_SIZE;
        a.gx += DIR_DX[a.dir];
        a.gz += DIR_DZ[a.dir];
        if (a.stopsRemaining > 0) a.stopsRemaining -= 1;

        // Occasional right/left turn at intersections
        const turnRoll = this.rng();
        if (turnRoll < 0.24) a.dir = (a.dir + 1) % 4;
        else if (turnRoll < 0.48) a.dir = (a.dir + 3) % 4;
      }

      // Compute final world coordinates & smooth yaw
      a.x = a.gx * BLOCK_SIZE + DIR_DX[a.dir] * a.progressM + RIGHT_DX[a.dir] * a.lateralOffset;
      a.z = a.gz * BLOCK_SIZE + DIR_DZ[a.dir] * a.progressM + RIGHT_DZ[a.dir] * a.lateralOffset;
      a.yaw = lerpAngle(a.yaw, dirToYaw(a.dir), 1 - Math.exp(-9 * safeDt));

      // Pre-compute upcoming stop spot when stopping on this block so waiting sidewalk passenger is visible on approach!
      if (stoppingThisBlock) {
        a.stopX = a.gx * BLOCK_SIZE + DIR_DX[a.dir] * stopPointM + RIGHT_DX[a.dir] * CURB_OFFSET;
        a.stopZ = a.gz * BLOCK_SIZE + DIR_DZ[a.dir] * stopPointM + RIGHT_DZ[a.dir] * CURB_OFFSET;
        a.stopDir = a.dir;
      }
    }
  }
}
