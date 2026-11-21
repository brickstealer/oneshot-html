export type BiomeId =
  | 'metropolis'
  | 'riviera'
  | 'canyon'
  | 'alpine'
  | 'sakura'
  | 'mushroom'
  | 'medieval'
  | 'rome'
  | 'egypt'
  | 'candy'
  | 'dino'
  | 'cyberpunk'
  | 'moon';

export type CameraMode =
  | 'director'
  | 'chase'
  | 'drone'
  | 'hood'
  | 'side'
  | 'orbit';

export type TimeOfDayMode = 'auto' | 'dawn' | 'day' | 'sunset' | 'night';

export type WeatherMode = 'clear' | 'rain' | 'fog';

export type OrderPhase =
  | 'cruising'
  | 'en_route_pickup'
  | 'boarding'
  | 'en_route_dropoff'
  | 'dropoff';

export type UpgradeKey = 'engine' | 'chassis' | 'autopilot' | 'comfort';

export type OrderTier = 'standard' | 'comfort' | 'express' | 'vip';

export interface UpgradeLevels {
  engine: number;
  chassis: number;
  autopilot: number;
  comfort: number;
}

export interface TaxiOrder {
  id: number;
  passengerName: string;
  passengerArchetype: BiomeId;
  passengerQuote: string;
  passengerCoatHex: number;
  passengerPantsHex: number;
  passengerSkinHex: number;
  tier: OrderTier;
  pickupX: number;
  pickupZ: number;
  pickupDir: number; // 0:+Z, 1:+X, 2:-Z, 3:-X
  dropoffX: number;
  dropoffZ: number;
  dropoffDir: number;
  pickupBiome: BiomeId;
  dropoffBiome: BiomeId;
  estimatedDistance: number;
  baseFare: number;
  currentFare: number;
  traveledDistance: number;
}

export interface SimSettings {
  cameraMode: CameraMode;
  timeOfDay: TimeOfDayMode;
  weather: WeatherMode;
  simSpeed: number; // 0.5 | 1 | 2 | 4
  trafficDensity: number; // 0..1
  autoUpgrade: boolean;
  audioEnabled: boolean;
}

export interface TaxiStats {
  balance: number;
  totalEarned: number;
  tripsCompleted: number;
  totalDistanceKm: number;
  lastPayout: number;
  lastPayoutId: number;
}

export interface HudSnapshot {
  speedKmh: number;
  maxSpeedKmh: number;
  biome: BiomeId;
  orderPhase: OrderPhase;
  hasPassengerInCabin: boolean;
  doorOpenAmount: number;
  tripProgress: number; // 0..1 when carrying passenger
  activeOrder: TaxiOrder | null;
  distanceToTargetM: number;
  balance: number;
  totalEarned: number;
  tripsCompleted: number;
  totalDistanceKm: number;
  upgrades: UpgradeLevels;
  vehicleClassName: string;
  vehicleTierIndex: number;
  altitude: number; // meters above ground (0 on asphalt, 9..16m in hover-flight)
  flightBlend: number; // 0..1 smooth hover-wheel fold & wing deploy blend
  flightUnlocked: boolean;
  timeHours: number; // 0..24
  lastPayout: number;
  lastPayoutId: number;
  activeDirectorAngle: string;
  fleetActiveCount: number;
  fleetTripsCompleted: number;
}

export interface BiomeDefinition {
  id: BiomeId;
  nameRu: string;
  subtitleRu: string;
  accentHex: string;
  groundHex: number;
  sidewalkHex: number;
  fogTintHex: number;
  fareMultiplier: number;
}
