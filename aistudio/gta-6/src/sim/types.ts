export type BiomeId = 'downtown' | 'beach' | 'everglades' | 'desert' | 'port';
export type BiomeFilter = 'auto' | BiomeId;

export type CameraMode = 'auto' | 'chase' | 'heli' | 'hood' | 'drone';

export type WeatherMode = 'clear' | 'rain' | 'fog';

export type TimePreset = 'sunset' | 'noon' | 'night' | 'dawn';

export type WeaponId = 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'rpg';

export type RadioStationId = 'vrock' | 'skull' | 'vice84' | 'leonida' | 'off';

export interface RadioStationSpec {
  id: RadioStationId;
  shortName: string;
  freq: string;
  genre: string;
  accentColor: string;
  tracks: string[];
}

export type VehicleKind =
  | 'sports'
  | 'muscle'
  | 'sedan'
  | 'suv'
  | 'bus'
  | 'tanker'
  | 'police'
  | 'swat';

export type AIActionState =
  | 'roaming'
  | 'seeking_car'
  | 'hijacking'
  | 'driving'
  | 'robbing_bank'
  | 'fleeing_police'
  | 'combat'
  | 'sabotage'
  | 'wasted';

export type SimLifecycleState = 'title' | 'playing' | 'paused';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  fireRate: number; // shots per second
  damage: number;
  range: number;
  explosive: boolean;
  pellets: number;
  spread: number;
  tracerColor: number;
}

export interface SimulationSettings {
  cameraMode: CameraMode;
  timeOfDay: number; // 0..24 hours (17.8 = Vice Golden Hour Sunset)
  timeCycleSpeed: number; // 0 = locked, 1 = normal progression
  weather: WeatherMode;
  biomeLock: BiomeFilter;
  simSpeed: number; // 0.5 .. 2.0
  chaosLevel: number; // 0.2 .. 1.0
  trafficDensity: number; // 0.3 .. 1.0
  radioStation: RadioStationId;
  muted: boolean;
}

export interface RadarBlip {
  dx: number;
  dz: number;
  kind: 'police' | 'chopper' | 'bank' | 'tanker' | 'bus' | 'civilian';
}

export interface HudSnapshot {
  biome: BiomeId;
  biomeName: string;
  districtName: string;
  action: AIActionState;
  actionLabel: string;
  wantedStars: number; // 0..5
  wantedHeat: number; // 0..100
  health: number; // 0..100
  armor: number; // 0..100
  cash: number;
  weapon: WeaponId;
  weaponName: string;
  ammo: number;
  speedKmh: number;
  inVehicle: boolean;
  vehicleLabel: string;
  policeCount: number;
  explosionsCount: number;
  banksRobbed: number;
  carsStolen: number;
  activeCameraLabel: string;
  timeFormatted: string;
  radioStation: RadioStationId;
  radioStationName: string;
  radioGenre: string;
  radioTrackTitle: string;
  bannerText: string | null;
  bannerSubtext: string | null;
  bannerTone: 'heist' | 'wanted' | 'explosion' | 'wasted' | 'hijack' | null;
  playerHeading: number;
  playerX: number;
  playerZ: number;
  radarBlips: RadarBlip[];
}

export type ForcedEventType =
  | 'rob_bank'
  | 'hijack_car'
  | 'max_wanted'
  | 'explode_tanker'
  | 'next_weapon'
  | 'clear_wanted'
  | 'next_radio_track';

export const WEAPON_SPECS: Record<WeaponId, WeaponSpec> = {
  pistol: {
    id: 'pistol',
    name: 'Пистолет 9мм',
    fireRate: 3.4,
    damage: 24,
    range: 46,
    explosive: false,
    pellets: 1,
    spread: 0.03,
    tracerColor: 0xffe082,
  },
  smg: {
    id: 'smg',
    name: 'Микро-ПП',
    fireRate: 10.5,
    damage: 14,
    range: 42,
    explosive: false,
    pellets: 1,
    spread: 0.08,
    tracerColor: 0xffd54f,
  },
  rifle: {
    id: 'rifle',
    name: 'Штурмовая М4',
    fireRate: 7.5,
    damage: 26,
    range: 64,
    explosive: false,
    pellets: 1,
    spread: 0.04,
    tracerColor: 0xffca28,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Боевой дробовик',
    fireRate: 1.5,
    damage: 18,
    range: 28,
    explosive: false,
    pellets: 5,
    spread: 0.14,
    tracerColor: 0xffab40,
  },
  rpg: {
    id: 'rpg',
    name: 'РПГ-7',
    fireRate: 0.45,
    damage: 160,
    range: 85,
    explosive: true,
    pellets: 1,
    spread: 0.015,
    tracerColor: 0xff5722,
  },
};

export const WEAPON_ORDER: WeaponId[] = ['pistol', 'smg', 'rifle', 'shotgun', 'rpg'];

export const VEHICLE_LABELS: Record<VehicleKind, string> = {
  sports: 'Суперкар Banshee VI',
  muscle: 'Маслкар Dominator',
  sedan: 'Седан Tailgater',
  suv: 'Внедорожник Cavalcade',
  bus: 'Городской автобус',
  tanker: 'Бензовоз FuelCo',
  police: 'Патруль VCPD',
  swat: 'Броневик SWAT',
};

export const ACTION_LABELS: Record<AIActionState, string> = {
  roaming: 'Патрулирование улиц',
  seeking_car: 'Поиск цели для угона',
  hijacking: 'Угон автомобиля',
  driving: 'Скоростной заезд',
  robbing_bank: 'Ограбление банка',
  fleeing_police: 'Уход от погони',
  combat: 'Перестрелка с полицией',
  sabotage: 'Подрыв техники',
  wasted: 'Потрачено · Респаун',
};

export const CAMERA_LABELS: Record<CameraMode, string> = {
  auto: 'Авто-Кино',
  chase: 'Погоня',
  heli: 'Вертолёт',
  hood: 'От капота',
  drone: 'Дрон-орбита',
};

export const RADIO_ORDER: RadioStationId[] = ['vrock', 'skull', 'vice84', 'leonida', 'off'];

export const RADIO_STATIONS: Record<RadioStationId, RadioStationSpec> = {
  vrock: {
    id: 'vrock',
    shortName: 'V-ROCK',
    freq: '106.6 FM',
    genre: 'Хард-Рок & Хэви-Метал',
    accentColor: '#f59e0b',
    tracks: [
      'Sunset Distortion — Highway to Vice',
      'Iron Palm — Chrome & Thunder',
      'Banshee Overdrive — Full Throttle Riff',
    ],
  },
  skull: {
    id: 'skull',
    shortName: 'IRON SKULL',
    freq: '99.9 FM',
    genre: 'Трэш & Индастриал Метал',
    accentColor: '#ef4444',
    tracks: [
      'Drop-D Syndicate — Chainsaw Protocol',
      'Skullcrusher — 5-Star Lockdown',
      'Doom Foundry — Asphalt Inferno',
    ],
  },
  vice84: {
    id: 'vice84',
    shortName: 'VICE 84',
    freq: '84.3 FM',
    genre: 'Неоновый Синтвейв 80-х',
    accentColor: '#ec4899',
    tracks: [
      'Miami Outrun — Ocean Drive 1986',
      'Neon Flamingo — Golden Hour Horizon',
      'Laser Grid — Night Interceptor',
    ],
  },
  leonida: {
    id: 'leonida',
    shortName: 'LEONIDA BASS',
    freq: '91.5 FM',
    genre: 'Майами Дрифт-Фонк & 808',
    accentColor: '#10b981',
    tracks: [
      'Vice Drift — Night Turbo 808',
      'Everglades Crew — Cowbell Chase',
      'Port Street — Heavy Sub Hustle',
    ],
  },
  off: {
    id: 'off',
    shortName: 'РАДИО ВЫКЛ',
    freq: '---',
    genre: 'Только звуки двигателя и улиц',
    accentColor: '#94a3b8',
    tracks: ['Эфир отключён'],
  },
};

export const DEFAULT_SETTINGS: SimulationSettings = {
  cameraMode: 'auto',
  timeOfDay: 17.6, // Golden-hour Vice City sunset
  timeCycleSpeed: 0.35,
  weather: 'clear',
  biomeLock: 'auto',
  simSpeed: 1.0,
  chaosLevel: 0.72,
  trafficDensity: 0.75,
  radioStation: 'vrock',
  muted: false,
};
