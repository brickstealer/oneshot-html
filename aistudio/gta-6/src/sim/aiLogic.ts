import type { AIActionState, CameraMode, WeaponId } from './types';

/**
 * Converts continuous wanted heat (0..100) into classic GTA 0..5 star count.
 */
export function heatToWantedStars(heat: number): number {
  if (heat <= 4) return 0;
  if (heat < 22) return 1;
  if (heat < 42) return 2;
  if (heat < 64) return 3;
  if (heat < 84) return 4;
  return 5;
}

/**
 * Computes target number of police units & helicopter support based on star level.
 */
export function getPoliceBudget(stars: number): {
  cruisers: number;
  swatVans: number;
  helicopters: number;
  footOfficers: number;
} {
  switch (Math.max(0, Math.min(5, Math.floor(stars)))) {
    case 0:
      return { cruisers: 0, swatVans: 0, helicopters: 0, footOfficers: 0 };
    case 1:
      return { cruisers: 2, swatVans: 0, helicopters: 0, footOfficers: 1 };
    case 2:
      return { cruisers: 3, swatVans: 0, helicopters: 0, footOfficers: 2 };
    case 3:
      return { cruisers: 4, swatVans: 0, helicopters: 1, footOfficers: 3 };
    case 4:
      return { cruisers: 4, swatVans: 2, helicopters: 1, footOfficers: 4 };
    default:
      return { cruisers: 5, swatVans: 3, helicopters: 1, footOfficers: 5 };
  }
}

/**
 * Computes explosion splash damage with smooth quadratic falloff.
 */
export function calculateExplosionDamage(
  distance: number,
  radius: number,
  maxDamage: number,
): number {
  if (distance >= radius || radius <= 0) return 0;
  const ratio = 1 - Math.max(0, distance) / radius;
  return Math.round(maxDamage * ratio * ratio);
}

/**
 * Adapts vertical FOV cleanly for portrait mobile vs widescreen desktop viewports
 * so vehicles, street canyons, and chases stay framed without side clipping.
 */
export function computeAdaptiveFov(
  baseFov: number,
  aspect: number,
  speedRatio: number,
  cameraMode: CameraMode,
): number {
  const safeAspect = Math.max(0.35, Math.min(3.0, aspect));
  // On narrow vertical screens (e.g. 390x844 -> aspect ~0.46), widen vertical FOV to preserve horizontal awareness
  const portraitBoost = safeAspect < 0.85 ? (0.85 - safeAspect) * 34 : 0;
  const speedKick = Math.max(0, Math.min(1, speedRatio)) * (cameraMode === 'hood' ? 12 : 9);
  const modeOffset = cameraMode === 'heli' ? -6 : cameraMode === 'hood' ? 6 : 0;
  return Math.max(42, Math.min(88, baseFov + portraitBoost + speedKick + modeOffset));
}

export interface AIDecisionInput {
  currentAction: AIActionState;
  inVehicle: boolean;
  wantedStars: number;
  chaosLevel: number; // 0..1
  health: number;
  nearbyBankDist: number;
  nearbyBankReady: boolean;
  nearbyCivilianCarDist: number;
  nearbyTankerOrBusDist: number;
  nearestPoliceDist: number;
  stateTimer: number;
  randomRoll: number; // 0..1
}

/**
 * Pure autonomous GTA-6 protagonist behavior selector.
 * Balances driving through biomes, carjacking, bank heists, tanker/bus sabotage, and police shootouts.
 */
export function selectNextAIAction(input: AIDecisionInput): AIActionState {
  if (input.health <= 0) return 'wasted';

  // If currently robbing a bank, finish the heist burst before fleeing
  if (input.currentAction === 'robbing_bank' && input.stateTimer < 4.5) {
    return 'robbing_bank';
  }

  // If currently hijacking, finish the animation beat
  if (input.currentAction === 'hijacking' && input.stateTimer < 1.3) {
    return 'hijacking';
  }

  // High-priority bank heist when near a ready bank and not already at 5 stars
  if (
    input.nearbyBankReady &&
    input.nearbyBankDist < 26 &&
    input.wantedStars <= 3 &&
    input.randomRoll < 0.45 + input.chaosLevel * 0.4
  ) {
    return 'robbing_bank';
  }

  // High-value explosive target (fuel tanker or bus) nearby -> hop out / open fire to blow it up!
  if (
    input.nearbyTankerOrBusDist < 34 &&
    input.chaosLevel > 0.35 &&
    input.randomRoll < 0.32 + input.chaosLevel * 0.35
  ) {
    return 'sabotage';
  }

  // Police close by -> either gunfight or high-speed getaway depending on vehicle & chaos
  if (input.wantedStars > 0 && input.nearestPoliceDist < 38) {
    if (!input.inVehicle) {
      if (input.nearbyCivilianCarDist < 14 && input.randomRoll > 0.52) {
        return 'seeking_car';
      }
      return 'combat';
    }
    // In a vehicle: mostly thrilling high-speed chase, occasionally hop out for intense shootout
    if (input.stateTimer > 12 && input.chaosLevel > 0.65 && input.randomRoll < 0.25) {
      return 'combat';
    }
    return 'fleeing_police';
  }

  // On foot: prefer stealing a cool nearby car
  if (!input.inVehicle) {
    if (input.nearbyCivilianCarDist < 42) {
      return 'seeking_car';
    }
    return 'roaming';
  }

  // In vehicle with wanted level -> evade police
  if (input.wantedStars > 0) {
    return 'fleeing_police';
  }

  // Otherwise cruise fast & recklessly through biomes, occasionally switching cars
  if (input.stateTimer > 18 && input.randomRoll < 0.2) {
    return 'seeking_car';
  }
  return 'driving';
}

/**
 * Picks the most cinematic and effective weapon for the current autonomous combat context.
 */
export function selectOptimalWeapon(
  action: AIActionState,
  targetDist: number,
  targetIsHeavyVehicle: boolean,
  wantedStars: number,
): WeaponId {
  if (targetIsHeavyVehicle && targetDist > 12) return 'rpg';
  if (action === 'sabotage') return targetDist > 14 ? 'rpg' : 'rifle';
  if (wantedStars >= 4 && targetDist > 18) return 'rpg';
  if (targetDist < 13) return 'shotgun';
  if (targetDist < 24) return 'smg';
  if (wantedStars >= 2) return 'rifle';
  return 'pistol';
}

/**
 * Shortest signed angular difference in radians [-PI, PI].
 */
export function shortestAngleDelta(current: number, target: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}
