export type FactionId = 'red' | 'black';

export type AntRole = 'soldier' | 'engineer' | 'forager' | 'tunnel_worker' | 'scout';

export type AntState =
  | 'patrol_trench'
  | 'charge'
  | 'fight'
  | 'retreat'
  | 'fetch_material'
  | 'build_fort'
  | 'forage_out'
  | 'forage_return'
  | 'tunnel_crawl'
  | 'tunnel_work'
  | 'scout_roam';

export type CargoType = 'none' | 'seed' | 'pebble' | 'twig' | 'larva' | 'soil';

export type CameraMode = 'auto' | 'panorama' | 'trenches' | 'tunnels' | 'battle' | 'free';

export type AtmospherePreset = 'sunset' | 'mist' | 'overcast';

export type FortificationType = 'sandbags' | 'bunker' | 'barbed_thorns' | 'mortar_nest' | 'watchtower';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SimulationConfig {
  timeScale: number;
  antsPerFaction: number;
  battleIntensity: number; // 0.2 .. 1.8
  buildSpeed: number; // 0.3 .. 2.0
  cameraSpeed: number; // 0.35 .. 2.2
  cameraMode: CameraMode;
  autoDiveTunnels: boolean;
  atmosphere: AtmospherePreset;
  paused: boolean;
}

export interface AnthillMound {
  faction: FactionId;
  x: number;
  z: number;
  radius: number;
  height: number;
  portalPos: Vec3;
  exitPortalPos: Vec3;
}

export interface TrenchSegment {
  faction: FactionId;
  line: 'front' | 'support';
  points: Vec3[];
  width: number;
  depth: number;
}

export interface CraterData {
  x: number;
  z: number;
  radius: number;
  depth: number;
}

export interface FoodSite {
  id: number;
  x: number;
  y: number;
  z: number;
  amount: number;
  maxAmount: number;
  kind: 'seeds' | 'resin' | 'beetle_shell';
}

export interface Fortification {
  id: number;
  faction: FactionId;
  type: FortificationType;
  x: number;
  y: number;
  z: number;
  yaw: number;
  progress: number; // 0.15 .. 1.0
  hp: number;
  maxHp: number;
  lastFireTime: number;
}

export interface TunnelChamber {
  id: string;
  faction: FactionId;
  kind: 'queen' | 'brood' | 'storage' | 'barracks';
  center: Vec3;
  radius: number;
}

export interface TunnelPath {
  id: string;
  faction: FactionId;
  points: Vec3[];
  radius: number;
  isMainShaft: boolean;
}

export interface WorldData {
  seed: number;
  worldRadius: number;
  playableRadius: number;
  mounds: Record<FactionId, AnthillMound>;
  trenches: TrenchSegment[];
  craters: CraterData[];
  foodSites: FoodSite[];
  initialFortifications: Fortification[];
  tunnels: TunnelPath[];
  chambers: TunnelChamber[];
  heightAt: (x: number, z: number) => number;
  portalMaskAt: (x: number, z: number) => number; // 0 = solid terrain, 1 = inside open portal shaft
  isInTrench: (x: number, z: number) => boolean;
}

export interface AntAgent {
  id: number;
  faction: FactionId;
  role: AntRole;
  state: AntState;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  hp: number;
  maxHp: number;
  speed: number;
  scale: number;
  cargo: CargoType;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetFortId: number | null;
  targetFoodId: number | null;
  targetEnemyId: number | null;
  stateTimer: number;
  animPhase: number;
  underground: boolean;
  tunnelIndex: number;
  tunnelT: number;
  tunnelDir: 1 | -1;
  tunnelAngle: number; // radial placement on tunnel floor
}

export interface Projectile {
  id: number;
  faction: FactionId;
  startX: number;
  startY: number;
  startZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  x: number;
  y: number;
  z: number;
  progress: number;
  duration: number;
  arcHeight: number;
}

export interface BurstEffect {
  id: number;
  x: number;
  y: number;
  z: number;
  kind: 'acid' | 'dust' | 'clash' | 'build';
  age: number;
  maxAge: number;
  scale: number;
}

export interface HudSnapshot {
  seed: number;
  redAlive: number;
  blackAlive: number;
  redBuilt: number;
  blackBuilt: number;
  activeFights: number;
  undergroundAnts: number;
  shotLabel: string;
  isUnderground: boolean;
  cameraAltitude: number;
}
