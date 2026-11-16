export type BiomeId =
  | 'teahouse'
  | 'night_market'
  | 'harbour_warehouse'
  | 'bamboo_scaffold'
  | 'peking_kitchen';

export interface BiomeConfig {
  id: BiomeId;
  nameRu: string;
  subtitleRu: string;
  skyTop: string;
  skyBottom: string;
  ambientTint: string;
  floorColor: string;
  floorTrimColor: string;
  platformColor: string;
  platformAccent: string;
  accentNeon: string;
  secondaryNeon: string;
  signTexts: string[];
  propWeights: Record<PropKind, number>;
}

export type PropKind =
  | 'ladder'
  | 'table'
  | 'chair'
  | 'vase'
  | 'bottle'
  | 'bamboo_pole'
  | 'crate'
  | 'barrel'
  | 'lantern'
  | 'wok'
  | 'steamer';

export type FighterRole = 'hero' | 'brawler' | 'acrobat' | 'bruiser' | 'weapon_master';

export type FighterAction =
  | 'idle'
  | 'run'
  | 'jump'
  | 'wall_flip'
  | 'table_vault'
  | 'ladder_spin'
  | 'punch_combo'
  | 'flying_kick'
  | 'sweep_kick'
  | 'prop_swing'
  | 'prop_throw'
  | 'duck_evade'
  | 'drunken_sway'
  | 'hand_shake_pain'
  | 'stagger'
  | 'ragdoll_fall'
  | 'get_up'
  | 'ko';

export type NodeId =
  | 'head'
  | 'neck'
  | 'pelvis'
  | 'lElbow'
  | 'lHand'
  | 'rElbow'
  | 'rHand'
  | 'lKnee'
  | 'lFoot'
  | 'rKnee'
  | 'rFoot';

export interface VerletNode {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  mass: number;
  radius: number;
}

export interface BoneConstraint {
  a: NodeId;
  b: NodeId;
  length: number;
  stiffness: number;
}

export interface SashLink {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
}

export type FacialExpression = 'focused' | 'effort' | 'shocked' | 'pain_grimace' | 'ko_dizzy' | 'smirk';

export interface Fighter {
  id: string;
  name: string;
  role: FighterRole;
  isHero: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  stamina: number;
  composure: number; // Drops on heavy hits -> triggers loose ragdoll physics
  ragdollBlend: number; // 0 = full active martial arts pose, 1 = pure floppy ragdoll
  action: FighterAction;
  actionTimer: number;
  actionDuration: number;
  attackCooldown: number;
  stuntCooldown: number;
  hitFlashTimer: number;
  invulnTimer: number;
  grounded: boolean;
  onPlatformId: string | null;
  heldPropId: string | null;
  targetEnemyId: string | null;
  expression: FacialExpression;
  expressionTimer: number;
  quips: string | null;
  quipTimer: number;
  comboCount: number;
  gaitPhase: number;
  scaleX: number;
  scaleY: number;
  // Articulated Ragdoll Skeleton
  nodes: Record<NodeId, VerletNode>;
  bones: BoneConstraint[];
  sash: SashLink[];
  // Visual Styling
  palette: {
    skin: string;
    shirt: string;
    vest: string;
    pants: string;
    sash: string;
    shoes: string;
    hair: string;
  };
  scale: number;
}

export interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'floor' | 'balcony' | 'awning' | 'scaffolding' | 'counter';
  bounciness: number; // Awnings & bamboo boards bounce fighters!
  flexOffset: number;
  flexVelocity: number;
}

export interface InteractiveProp {
  id: string;
  kind: PropKind;
  nameRu: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  vAngle: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  mass: number;
  bounciness: number;
  isHeldBy: string | null;
  isThrownBy: string | null;
  broken: boolean;
  tetherX?: number; // For hanging lanterns / woks / cargo chains
  tetherY?: number;
  tetherLength?: number;
  flipped?: boolean; // For tables flipped sideways as shields
  hitFlash: number;
  colorPrimary: string;
  colorSecondary: string;
}

export interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  vAngle: number;
  life: number;
  maxLife: number;
  color: string;
  shape: 'spark' | 'splinter' | 'shard' | 'dust' | 'ring' | 'paper';
}

export interface StuntCallout {
  id: string;
  text: string;
  subtext?: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
}

export interface StuntFeedEvent {
  id: string;
  timestamp: number;
  title: string;
  detail: string;
  points: number;
  category: 'stunt' | 'prop' | 'ko' | 'comedy';
}

export interface SimulationParams {
  timeScale: number; // 0.25, 0.5, 1.0, 1.5
  ragdollElasticity: number; // 0.3 (loose) to 1.0 (snappy kung-fu)
  gravityScale: number; // 0.6 to 1.4
  propDensity: number; // 0.5 to 2.0
  enemyCount: number; // 3 to 7
  stuntFrequency: number; // 0.5 to 2.0
  cameraMode: 'cinematic' | 'wide' | 'hero_closeup';
  slowMoOnStunts: boolean;
  autoNextScene: boolean;
  soundEnabled: boolean;
}

export interface SimulationMetrics {
  seed: string;
  takeNumber: number;
  biomeId: BiomeId;
  biomeName: string;
  biomeSubtitle: string;
  score: number;
  stuntsCount: number;
  propsSmashed: number;
  knockouts: number;
  activeEnemies: number;
  totalWaveEnemies: number;
  heroHp: number;
  heroMaxHp: number;
  heroCombo: number;
  currentActionLabel: string;
  recentEvents: StuntFeedEvent[];
}
