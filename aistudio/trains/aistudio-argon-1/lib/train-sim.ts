// Pure procedural generation, track spline math, biome transitions, and simulation rules

export type BiomeId = 'city' | 'village' | 'forest' | 'mountain';
export type BiomeMode = 'auto' | BiomeId;
export type CameraMode = 'cinematic' | 'free' | 'chase' | 'cabin' | 'side' | 'drone';
export type TimeOfDay = 'dawn' | 'day' | 'sunset' | 'night';
export type WeatherType = 'clear' | 'fog' | 'rain' | 'snow';

export interface SimulationConfig {
  speedKmh: number;         // 0 to 240 km/h
  targetSpeedKmh: number;
  wagonCount: number;       // 2 to 8 wagons
  biomeMode: BiomeMode;
  cameraMode: CameraMode;
  freeCamDistance: number;  // 4 to 160 meters zoom radius
  freeCamResetCount: number;
  timeOfDay: TimeOfDay;
  weather: WeatherType;
  headlightOn: boolean;
  soundEnabled: boolean;
  cinematicAutoSwitch: boolean;
}

export interface BiomeDefinition {
  id: BiomeId;
  nameRu: string;
  subtitleRu: string;
  groundColor: number;
  secondaryGroundColor: number;
  rockColor: number;
  foliagePrimary: number;
  foliageSecondary: number;
  buildingAccent: number;
  curvatureAmplitude: number;
  elevationAmplitude: number;
  elevationBase: number;
  treeDensity: number;
  buildingDensity: number;
  rockDensity: number;
  bridgeChance: number;
}

export const BIOMES: Record<BiomeId, BiomeDefinition> = {
  city: {
    id: 'city',
    nameRu: 'Мегаполис',
    subtitleRu: 'Индустриальные кварталы, небоскрёбы и эстакады',
    groundColor: 0x262930,
    secondaryGroundColor: 0x333742,
    rockColor: 0x4b5563,
    foliagePrimary: 0x2e6f40,
    foliageSecondary: 0x3d8b52,
    buildingAccent: 0x38bdf8,
    curvatureAmplitude: 14,
    elevationAmplitude: 1.2,
    elevationBase: 1.0,
    treeDensity: 0.15,
    buildingDensity: 0.92,
    rockDensity: 0.08,
    bridgeChance: 0.1,
  },
  village: {
    id: 'village',
    nameRu: 'Тихая деревня',
    subtitleRu: 'Уютные домики, мельницы, поля и переезды',
    groundColor: 0x4d6b3c,
    secondaryGroundColor: 0x6e8c49,
    rockColor: 0x78716c,
    foliagePrimary: 0x3b7a3e,
    foliageSecondary: 0x65a30d,
    buildingAccent: 0xf59e0b,
    curvatureAmplitude: 24,
    elevationAmplitude: 2.5,
    elevationBase: 1.4,
    treeDensity: 0.45,
    buildingDensity: 0.55,
    rockDensity: 0.15,
    bridgeChance: 0.2,
  },
  forest: {
    id: 'forest',
    nameRu: 'Вековой лес',
    subtitleRu: 'Густая тайга, мшистые валуны и лесные реки',
    groundColor: 0x2d4c2b,
    secondaryGroundColor: 0x3a5f32,
    rockColor: 0x57534e,
    foliagePrimary: 0x1e4620,
    foliageSecondary: 0x2d6a31,
    buildingAccent: 0xd97706,
    curvatureAmplitude: 34,
    elevationAmplitude: 4.5,
    elevationBase: 2.5,
    treeDensity: 0.95,
    buildingDensity: 0.06,
    rockDensity: 0.42,
    bridgeChance: 0.35,
  },
  mountain: {
    id: 'mountain',
    nameRu: 'Горный серпантин',
    subtitleRu: 'Крутые скальные ущелья, виадуки и снежные пики',
    groundColor: 0x475569,
    secondaryGroundColor: 0x64748b,
    rockColor: 0x334155,
    foliagePrimary: 0x1e3a2f,
    foliageSecondary: 0xcbd5e1,
    buildingAccent: 0xf97316,
    curvatureAmplitude: 56,
    elevationAmplitude: 14.0,
    elevationBase: 9.5,
    treeDensity: 0.32,
    buildingDensity: 0.08,
    rockDensity: 0.95,
    bridgeChance: 0.75,
  },
};

export const BIOME_CYCLE_ORDER: BiomeId[] = ['city', 'village', 'forest', 'mountain'];
export const BIOME_SEGMENT_LENGTH = 360; // meters per biome in auto mode
export const CHUNK_LENGTH = 60; // length of 1 procedural world chunk along Z

/**
 * Deterministic hash in [0, 1) from integer seed coordinates
 */
export function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return x - Math.floor(x);
}

/**
 * Smoothstep interpolation in [0, 1]
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Returns the active biome and blend weight at world distance `s` (meters along Z)
 */
export function getBiomeAtDistance(
  distanceMeters: number,
  biomeMode: BiomeMode
): { primary: BiomeDefinition; secondary: BiomeDefinition; blend: number } {
  if (biomeMode !== 'auto') {
    const def = BIOMES[biomeMode];
    return { primary: def, secondary: def, blend: 0 };
  }

  const d = Math.max(0, distanceMeters);
  const rawIndex = Math.floor(d / BIOME_SEGMENT_LENGTH);
  const localPos = d - rawIndex * BIOME_SEGMENT_LENGTH;
  const currentIdx = rawIndex % BIOME_CYCLE_ORDER.length;
  const nextIdx = (rawIndex + 1) % BIOME_CYCLE_ORDER.length;

  const transitionZone = 80; // last 80m of segment smoothly blends into next biome
  const blendStart = BIOME_SEGMENT_LENGTH - transitionZone;
  const blend = localPos > blendStart ? smoothstep(blendStart, BIOME_SEGMENT_LENGTH, localPos) : 0;

  return {
    primary: BIOMES[BIOME_CYCLE_ORDER[currentIdx]],
    secondary: BIOMES[BIOME_CYCLE_ORDER[nextIdx]],
    blend,
  };
}

/**
 * Evaluates the procedural track centerline (x, y, z) at longitudinal coordinate `z`
 * Note: Train travels forward along positive `z` (or we parameterize by longitudinal coordinate `s`).
 */
export function getTrackPointAtS(
  s: number,
  biomeMode: BiomeMode
): { x: number; y: number; z: number; banking: number; grade: number; isBridge: boolean } {
  const { primary, secondary, blend } = getBiomeAtDistance(s, biomeMode);
  const curveAmp = primary.curvatureAmplitude * (1 - blend) + secondary.curvatureAmplitude * blend;
  const elevAmp = primary.elevationAmplitude * (1 - blend) + secondary.elevationAmplitude * blend;
  const elevBase = primary.elevationBase * (1 - blend) + secondary.elevationBase * blend;

  // Multi-frequency smooth serpentine curve
  const freq1 = 0.011;
  const freq2 = 0.023;
  const freq3 = 0.0045;

  const x =
    Math.sin(s * freq1) * curveAmp * 0.65 +
    Math.cos(s * freq2 + 1.2) * curveAmp * 0.35 +
    Math.sin(s * freq3) * curveAmp * 0.4;

  // Analytical derivative dx/ds for banking calculation
  const dxds =
    Math.cos(s * freq1) * freq1 * curveAmp * 0.65 -
    Math.sin(s * freq2 + 1.2) * freq2 * curveAmp * 0.35 +
    Math.cos(s * freq3) * freq3 * curveAmp * 0.4;

  const d2xds2 =
    -Math.sin(s * freq1) * freq1 * freq1 * curveAmp * 0.65 -
    Math.cos(s * freq2 + 1.2) * freq2 * freq2 * curveAmp * 0.35 -
    Math.sin(s * freq3) * freq3 * freq3 * curveAmp * 0.4;

  // Elevation profile: gentle hills in village/forest, dramatic serpentine climbs in mountains
  const ef1 = 0.008;
  const ef2 = 0.019;
  const rawClimb = Math.sin(s * ef1) * 0.6 + Math.cos(s * ef2 + 0.7) * 0.4;
  const y = Math.max(0.6, elevBase + rawClimb * elevAmp);

  const dyds =
    (Math.cos(s * ef1) * ef1 * 0.6 - Math.sin(s * ef2 + 0.7) * ef2 * 0.4) * elevAmp;

  // Superelevation (banking angle in radians) proportional to second derivative
  const banking = Math.max(-0.14, Math.min(0.14, -d2xds2 * 18.0));

  // Determine if track is elevated over a valley / canyon (bridge/viaduct)
  const valleyWave = Math.sin(s * 0.037 + 0.4);
  const bridgeThreshold = 1.0 - (primary.bridgeChance * (1 - blend) + secondary.bridgeChance * blend) * 0.65;
  const isBridge = y > 3.2 && valleyWave > bridgeThreshold;

  return {
    x,
    y,
    z: s,
    banking,
    grade: dyds - dxds * 0.01,
    isBridge,
  };
}

/**
 * Computes terrain height at world (x, z) taking into account the track roadbed cut/embankment
 * so terrain never clips over the rails and forms canyons under viaducts.
 */
export function getTerrainHeightAt(
  worldX: number,
  worldZ: number,
  biomeMode: BiomeMode
): { height: number; distFromTrack: number; isWater: boolean } {
  const track = getTrackPointAtS(worldZ, biomeMode);
  const { primary, secondary, blend } = getBiomeAtDistance(worldZ, biomeMode);

  const dx = worldX - track.x;
  const absDx = Math.abs(dx);

  // Track roadbed width is ~3.6m half-width
  const roadbedHalfWidth = 3.8;
  const transitionWidth = 14.0;

  // Natural procedural noise outside the track corridor
  const n1 = Math.sin(worldX * 0.045 + worldZ * 0.032) * Math.cos(worldZ * 0.027 - worldX * 0.019);
  const n2 = Math.sin(worldX * 0.11 - worldZ * 0.08) * 0.35;
  const ridge = Math.abs(Math.sin(worldX * 0.028 + worldZ * 0.015));

  const mountainFactor =
    (primary.id === 'mountain' ? 1 : primary.id === 'forest' ? 0.35 : 0.08) * (1 - blend) +
    (secondary.id === 'mountain' ? 1 : secondary.id === 'forest' ? 0.35 : 0.08) * blend;

  // In mountain serpentine mode, create dramatic cliff wall on one side and deep drop-off on the other
  const sideSign = Math.sin(worldZ * 0.008) >= 0 ? 1 : -1;
  const cliffBias = dx * sideSign * mountainFactor * 0.55;

  const naturalHeight =
    track.y +
    (n1 + n2) * (2.5 + mountainFactor * 16.0) +
    ridge * mountainFactor * 18.0 +
    cliffBias;

  if (absDx <= roadbedHalfWidth) {
    // Under the track: if it's a bridge/viaduct, drop the terrain down into a gorge/riverbed
    if (track.isBridge) {
      const gorgeDepth = 5.5 + mountainFactor * 8.0;
      const h = track.y - gorgeDepth * smoothstep(0, roadbedHalfWidth, roadbedHalfWidth - absDx * 0.2);
      return { height: h, distFromTrack: absDx, isWater: h < 1.2 };
    }
    return { height: track.y - 0.15, distFromTrack: absDx, isWater: false };
  }

  const t = smoothstep(roadbedHalfWidth, roadbedHalfWidth + transitionWidth, absDx);
  let baseNearTrack = track.y - 0.35;
  if (track.isBridge) {
    baseNearTrack = track.y - (5.5 + mountainFactor * 8.0);
  }

  const finalHeight = baseNearTrack * (1 - t) + naturalHeight * t;
  return {
    height: finalHeight,
    distFromTrack: absDx,
    isWater: finalHeight < 0.35,
  };
}

/**
 * Calculates longitudinal positions `s` for the locomotive and each coupled wagon
 */
export function getTrainCarPositions(
  leadDistanceS: number,
  wagonCount: number,
  locomotiveLength = 11.5,
  wagonLength = 10.2,
  couplerGap = 1.4
): number[] {
  const count = Math.max(0, Math.min(10, Math.floor(wagonCount)));
  const positions: number[] = [leadDistanceS];
  let currentS = leadDistanceS - (locomotiveLength * 0.5 + wagonLength * 0.5 + couplerGap);

  for (let i = 0; i < count; i++) {
    positions.push(currentS);
    currentS -= wagonLength + couplerGap;
  }
  return positions;
}

export const MIN_FREE_CAM_DISTANCE = 4;
export const MAX_FREE_CAM_DISTANCE = 160;

export function clampFreeCamDistance(dist: number): number {
  if (!Number.isFinite(dist)) return 22;
  return Math.max(MIN_FREE_CAM_DISTANCE, Math.min(MAX_FREE_CAM_DISTANCE, dist));
}

export function clampFreeCamPitch(pitchRadians: number): number {
  if (!Number.isFinite(pitchRadians)) return 0.35;
  // Allow looking from just above ground (-0.15 rad) up to straight overhead (1.48 rad)
  return Math.max(-0.15, Math.min(1.48, pitchRadians));
}

/**
 * Computes 3D cartesian camera offset (dx, dy, dz) from unrestricted spherical orbit (yaw, pitch, distance)
 */
export function computeSphericalCameraOffset(
  yawRadians: number,
  pitchRadians: number,
  distance: number
): { dx: number; dy: number; dz: number } {
  const r = clampFreeCamDistance(distance);
  const pitch = clampFreeCamPitch(pitchRadians);
  const horiz = r * Math.cos(pitch);
  return {
    dx: Math.sin(yawRadians) * horiz,
    dy: r * Math.sin(pitch),
    dz: Math.cos(yawRadians) * horiz,
  };
}

/**
 * Formats speed, distance, and altitude for telemetry display
 */
export function formatTelemetry(speedKmh: number, distanceMeters: number, altitudeMeters: number) {
  return {
    speedText: `${Math.round(Math.max(0, speedKmh))}`,
    distanceKmText: (Math.max(0, distanceMeters) / 1000).toFixed(2),
    altitudeText: `${Math.round(altitudeMeters * 12 + 140)} м`,
  };
}
