export type ArenaThemeId = 'teahouse' | 'rooftop' | 'warehouse' | 'courtyard';

export interface ArenaThemeSpec {
  id: ArenaThemeId;
  nameRu: string;
  subtitleRu: string;
  skyColor: number;
  fogColor: number;
  fogDensity: number;
  keyLightColor: number;
  keyLightIntensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  floorTint: number;
  accentColor: number;
  lanternColor: number;
}

export type PropType =
  | 'table'
  | 'chair'
  | 'ladder'
  | 'barrel'
  | 'crate'
  | 'bamboo_pole'
  | 'pillar';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface InteractiveProp {
  id: string;
  type: PropType;
  nameRu: string;
  pos: Vec3;
  vel: Vec3;
  rot: Vec3;
  angVel: Vec3;
  radius: number;
  height: number;
  mass: number;
  hp: number;
  maxHp: number;
  broken: boolean;
  breakable: boolean;
  grabbable: boolean;
  vaultable: boolean;
  climbable: boolean;
  heldByFighterId: string | null;
  hitFlash: number;
  colorVariant: number;
}

export type BoneId =
  | 'pelvis'
  | 'torso'
  | 'head'
  | 'handL'
  | 'handR'
  | 'footL'
  | 'footR'
  | 'elbowL'
  | 'elbowR'
  | 'kneeL'
  | 'kneeR';

export interface RagdollBone {
  id: BoneId;
  pos: Vec3;
  prevPos: Vec3;
  targetPos: Vec3;
  radius: number;
}

export interface BoneConstraint {
  boneA: BoneId;
  boneB: BoneId;
  restLength: number;
}

export type FighterRole = 'hero' | 'brawler' | 'acrobat' | 'enforcer' | 'specialist';

export type FighterState =
  | 'idle'
  | 'stalk'
  | 'approach'
  | 'windup'
  | 'attack'
  | 'stunt'
  | 'stagger'
  | 'ragdoll_air'
  | 'ragdoll_ground'
  | 'getup';

export type StuntManeuverId =
  | 'table_vault_kick'
  | 'chair_catch_spin'
  | 'ladder_helicopter'
  | 'pole_swing_dropkick'
  | 'wall_backflip_counter'
  | 'crate_smash_uppercut'
  | 'barrel_roll_sweep'
  | 'drunken_weave_strike'
  | 'flying_bicycle_kick';

export interface StuntManeuverSpec {
  id: StuntManeuverId;
  titleRu: string;
  requiredProp: PropType | 'any' | null;
  duration: number;
  hitTime: number;
  damage: number;
  knockbackForce: number;
  upwardForce: number;
  aoeRadius: number;
}

export interface Fighter {
  id: string;
  nameRu: string;
  role: FighterRole;
  isHero: boolean;
  pos: Vec3;
  vel: Vec3;
  facingAngle: number;
  targetAngle: number;
  visualYaw: number;
  torsoPitch: number;
  torsoRoll: number;
  hp: number;
  maxHp: number;
  state: FighterState;
  stateTimer: number;
  stateDuration: number;
  activeStunt: StuntManeuverSpec | null;
  activeStrikeId: string | null;
  activeComboIndex: number;
  stuntPropId: string | null;
  heldPropId: string | null;
  targetFighterId: string | null;
  /** 0 = crisp martial arts pose, 1 = pure physical ragdoll tumble */
  ragdollBlend: number;
  hitFlash: number;
  comboStep: number;
  gaitPhase: number;
  scaleX: number;
  scaleY: number;
  primaryColor: number;
  secondaryColor: number;
  beltColor: number;
  bones: Record<BoneId, RagdollBone>;
  constraints: BoneConstraint[];
  koCount: number;
}

export type DebrisKind = 'wood' | 'ceramic' | 'spark' | 'bamboo' | 'dust';

export interface SimEvent {
  type: 'hit' | 'heavy_hit' | 'stunt_start' | 'prop_break' | 'whoosh' | 'ko' | 'scene_reset';
  pos: Vec3;
  weight: number;
  stuntName?: string;
  debrisKind?: DebrisKind;
}

export type CameraMode = 'auto_director' | 'close_stunt' | 'orbit' | 'wide_cinema';

export interface SimulationStats {
  seed: string;
  themeId: ArenaThemeId;
  themeNameRu: string;
  waveNumber: number;
  stuntsPerformed: number;
  propsBroken: number;
  knockouts: number;
  comboCount: number;
  activeComboNameRu: string;
  activeStuntBanner: string;
  activeStuntTimer: number;
  activeEnemies: number;
  remainingProps: number;
  elapsedSeconds: number;
}
