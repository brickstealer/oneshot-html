import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BIOME_DEFS,
  CHUNK_SIZE,
  formatTimeOfDay,
  getBiomeAt,
  getDistrictName,
  nearestRoadAxisPosition,
  worldToChunk,
} from '../sim/biomes';
import {
  calculateExplosionDamage,
  computeAdaptiveFov,
  getPoliceBudget,
  heatToWantedStars,
  selectNextAIAction,
  selectOptimalWeapon,
  shortestAngleDelta,
} from '../sim/aiLogic';
import {
  assignPoliceRole,
  computePoliceTacticalGoal,
  computeSeparationVector,
  computeTrafficBrakeFactor,
  getVehicleCollisionDiscs,
  resolveBuildingCollision,
  resolveVehiclePairCollision,
  type CivilianMood,
  type OfficerState,
  type PoliceRole,
} from '../sim/physicsAndNpc';
import {
  ACTION_LABELS,
  CAMERA_LABELS,
  DEFAULT_SETTINGS,
  VEHICLE_LABELS,
  WEAPON_ORDER,
  WEAPON_SPECS,
  type AIActionState,
  type CameraMode,
  type ForcedEventType,
  type HudSnapshot,
  type RadarBlip,
  type SimLifecycleState,
  type SimulationSettings,
  type VehicleKind,
  type WeaponId,
} from '../sim/types';
import { ProceduralAudio } from './audio';
import { WorldChunkManager, type ActiveBank } from './chunkManager';
import {
  buildHumanoidModel,
  buildPoliceChopper,
  buildVehicleModel,
  type ChopperRig,
  type HumanoidRig,
  type VehicleRig,
} from './models';
import { createProceduralTextures, type ProceduralTexturePack } from './textures';

interface SimVehicle {
  id: number;
  kind: VehicleKind;
  rig: VehicleRig;
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  speed: number;
  targetSpeed: number;
  length: number;
  width: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  destroyTimer: number;
  isPolice: boolean;
  isPlayerControlled: boolean;
  roadAxis: 'x' | 'z';
  roadDir: 1 | -1;
  laneCoord: number;
  fireCooldown: number;
  policeRole: PoliceRole;
  policeSlot: number;
  deployedOfficer: boolean;
  mood: CivilianMood;
  panicTimer: number;
  stuckTimer: number;
  avoidSign: number;
}

interface FootOfficer {
  id: number;
  rig: HumanoidRig;
  x: number;
  z: number;
  heading: number;
  hp: number;
  fireCooldown: number;
  burstRemaining: number;
  burstTimer: number;
  strafeSign: number;
  flankAngle: number;
  state: OfficerState;
  koTimer: number;
  alive: boolean;
}

interface PedestrianNPC {
  id: number;
  rig: HumanoidRig;
  x: number;
  z: number;
  heading: number;
  speed: number;
  roadAxis: 'x' | 'z';
  roadDir: 1 | -1;
  sidewalkCoord: number;
  state: 'strolling' | 'fleeing';
  panicTimer: number;
  threatX: number;
  threatZ: number;
  walkPhase: number;
  koTimer: number;
  alive: boolean;
}

interface Projectile {
  active: boolean;
  fromPlayer: boolean;
  explosive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  damage: number;
  mesh: THREE.Mesh;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  size: number;
  grow: number;
  gravity: number;
  r: number;
  g: number;
  b: number;
}

interface ShockwaveRing {
  active: boolean;
  age: number;
  maxAge: number;
  maxRadius: number;
  mesh: THREE.Mesh;
}

const MAX_PARTICLES = 420;
const MAX_PROJECTILES = 36;
const MAX_SHOCKWAVES = 6;
const RAIN_COUNT = 260;

// Pre-allocated scratch helpers (zero GC inside animation loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _skyTop = new THREE.Color();
const _skyHorizon = new THREE.Color();
const _skyBottom = new THREE.Color();
const _sunColor = new THREE.Color();
const _hemiSky = new THREE.Color();
const _hemiGround = new THREE.Color();

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class SimulationEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ProceduralTexturePack;
  private chunks: WorldChunkManager;
  private audio = new ProceduralAudio();

  // Lighting & Sky
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private explosionFlashLight: THREE.PointLight;
  private skyDomeMat: THREE.ShaderMaterial;
  private skyDome: THREE.Mesh;
  private rainLines: THREE.LineSegments;
  private rainPositions: Float32Array;

  // Entities
  private protagonistRig: HumanoidRig;
  private chopperRig: ChopperRig;
  private vehicles: SimVehicle[] = [];
  private officers: FootOfficer[] = [];
  private pedestrians: PedestrianNPC[] = [];
  private projectiles: Projectile[] = [];
  private particles: ParticleSlot[] = [];
  private particleInstanced: THREE.InstancedMesh;
  private shockwaves: ShockwaveRing[] = [];
  private nextEntityId = 1;

  // Protagonist state
  private playerX = 3.8;
  private playerZ = 6;
  private playerHeading = 0;
  private playerSpeed = 0;
  private playerHealth = 100;
  private playerArmor = 100;
  private playerCash = 12500;
  private playerWeapon: WeaponId = 'rifle';
  private playerAmmo = 120;
  private playerVehicle: SimVehicle | null = null;
  private hijackTarget: SimVehicle | null = null;
  private activeBankTarget: ActiveBank | null = null;
  private wantedHeat = 0;
  private wantedStars = 0;
  private aiAction: AIActionState = 'driving';
  private aiStateTimer = 0;
  private aiDecisionTimer = 0;
  private fireCooldown = 0;
  private walkCycle = 0;
  private wastedTimer = 0;
  private heistBurstTimer = 0;
  private banksRobbed = 0;
  private carsStolen = 1;
  private explosionsCount = 0;

  // Police helicopter state
  private chopperActive = false;
  private chopperAngle = 0;
  private chopperFireTimer = 0;

  // Juice & Camera
  private camPos = new THREE.Vector3(-12, 11, -14);
  private camTarget = new THREE.Vector3(3.8, 1.8, 12);
  private autoDirectorTimer = 0;
  private autoSubMode: Exclude<CameraMode, 'auto'> = 'chase';
  private trauma = 0;
  private hitstopTimer = 0;
  private flashLightIntensity = 0;
  private bannerText: string | null = null;
  private bannerSubtext: string | null = null;
  private bannerTone: HudSnapshot['bannerTone'] = null;
  private bannerTimer = 0;

  // Loop & lifecycle
  private settings: SimulationSettings = { ...DEFAULT_SETTINGS };
  private lifecycle: SimLifecycleState = 'title';
  private elapsedTime = 0;
  private hudEmitTimer = 0;
  private lastTimestamp = 0;
  private frameId = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xe6a17c, 0.0046);

    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.3, 420);

    // Subtle IBL reflections via RoomEnvironment without washing out bright daytime surfaces
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;
    pmrem.dispose();

    // Procedural Sky Gradient Dome with glowing solar disc
    this.skyDomeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x1f3461) },
        uHorizonColor: { value: new THREE.Color(0xf69d72) },
        uBottomColor: { value: new THREE.Color(0x272a36) },
        uSunDir: { value: new THREE.Vector3(0.7, 0.25, 0.65).normalize() },
        uSunColor: { value: new THREE.Color(0xffe19c) },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uBottomColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec3 vWorldDir;
        void main() {
          vec3 d = normalize(vWorldDir);
          float h = d.y;
          vec3 col = h >= 0.0
            ? mix(uHorizonColor, uTopColor, pow(clamp(h, 0.0, 1.0), 0.55))
            : mix(uHorizonColor, uBottomColor, clamp(-h * 3.0, 0.0, 1.0));
          float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * pow(sunDot, 22.0) * 0.45;
          col += uSunColor * smoothstep(0.996, 0.9992, sunDot) * 1.4;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(340, 24, 16), this.skyDomeMat);
    this.scene.add(this.skyDome);

    // Warm/Cool Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0x9ec5ff, 0x3b2c2a, 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffcb8c, 2.2);
    this.sunLight.position.set(50, 38, 42);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 175;
    const sd = 58;
    this.sunLight.shadow.camera.left = -sd;
    this.sunLight.shadow.camera.right = sd;
    this.sunLight.shadow.camera.top = sd;
    this.sunLight.shadow.camera.bottom = -sd;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Dynamic explosion / gunfire flash light (unshadowed PointLight within budget)
    this.explosionFlashLight = new THREE.PointLight(0xff8a2b, 0, 58, 1.7);
    this.explosionFlashLight.position.set(0, 6, 0);
    this.scene.add(this.explosionFlashLight);

    // Procedural textures & infinite multi-biome chunk world
    this.textures = createProceduralTextures(this.renderer);
    this.chunks = new WorldChunkManager(this.textures);
    this.scene.add(this.chunks.root);

    // Protagonist humanoid rig
    this.protagonistRig = buildHumanoidModel('protagonist', this.textures, 0);
    this.scene.add(this.protagonistRig.group);
    this.equipWeapon('rifle');

    // Police helicopter rig (activated at 3+ stars)
    this.chopperRig = buildPoliceChopper();
    this.chopperRig.group.visible = false;
    this.scene.add(this.chopperRig.group);

    // Pooled InstancedMesh Particle System (smooth fireballs, smoke plumes, sparks, debris, cash)
    const partGeo = new THREE.IcosahedronGeometry(0.44, 1);
    const partMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleInstanced = new THREE.InstancedMesh(partGeo, partMat, MAX_PARTICLES);
    this.particleInstanced.frustumCulled = false;
    this.particleInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxAge: 1,
        size: 0,
        grow: 0,
        gravity: 0,
        r: 1,
        g: 1,
        b: 1,
      });
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.particleInstanced.setMatrixAt(i, _dummy.matrix);
      this.particleInstanced.setColorAt(i, _color.setRGB(1, 1, 1));
    }
    this.scene.add(this.particleInstanced);

    // Pooled aerodynamic tracer / RPG rocket projectiles
    const projGeo = new THREE.CapsuleGeometry(0.065, 1.25, 4, 8);
    projGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd54f });
      const mesh = new THREE.Mesh(projGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.projectiles.push({
        active: false,
        fromPlayer: true,
        explosive: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        damage: 20,
        mesh,
      });
    }

    // Pooled explosion shockwave rings
    const ringGeo = new THREE.RingGeometry(0.7, 1.0, 28);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      const mesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffb74d,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      mesh.visible = false;
      this.scene.add(mesh);
      this.shockwaves.push({ active: false, age: 0, maxAge: 0.5, maxRadius: 12, mesh });
    }

    // Tropical Rain Streaks
    this.rainPositions = new Float32Array(RAIN_COUNT * 2 * 3);
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainLines = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({ color: 0xcbe8ff, transparent: true, opacity: 0.45 }),
    );
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.initRainDrops();
    this.scene.add(this.rainLines);

    // Build initial chunks & spawn protagonist inside a sleek sports car on the main Vice avenue!
    this.chunks.updateAround(this.playerX, this.playerZ, 2);
    this.spawnInitialWorld();
    this.updateAtmosphereLighting(0);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // ResizeObserver for crisp desktop + portrait mobile responsiveness
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    // Handle WebGL context loss safely
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
    });

    this.lastTimestamp = performance.now();
    this.emitHud();
    this.scheduleNextFrame();
  }

  private initRainDrops() {
    for (let i = 0; i < RAIN_COUNT; i++) {
      const rx = (Math.random() - 0.5) * 70;
      const ry = Math.random() * 28;
      const rz = (Math.random() - 0.5) * 70;
      const idx = i * 6;
      this.rainPositions[idx] = rx;
      this.rainPositions[idx + 1] = ry;
      this.rainPositions[idx + 2] = rz;
      this.rainPositions[idx + 3] = rx - 0.15;
      this.rainPositions[idx + 4] = ry - 1.35;
      this.rainPositions[idx + 5] = rz - 0.1;
    }
  }

  private spawnInitialWorld() {
    // Give the protagonist a glossy stolen Banshee sports car right on the palm-lined downtown avenue
    const heroCar = this.spawnVehicle('sports', 3.8, 4.0, 0, 'z', 1, 3.8);
    heroCar.isPlayerControlled = true;
    heroCar.speed = 18;
    heroCar.vx = 0;
    heroCar.vz = 18;
    heroCar.targetSpeed = 24;
    this.playerVehicle = heroCar;
    this.playerX = heroCar.x;
    this.playerZ = heroCar.z;
    this.playerHeading = 0;
    this.protagonistRig.group.visible = false;
    heroCar.rig.driverGroup.visible = true;
    heroCar.rig.protagonistDriverMesh.visible = true;
    heroCar.rig.npcDriverMesh.visible = false;

    // Seed exciting traffic right in front and on cross avenues (including a fuel tanker and a city bus!)
    this.spawnVehicle('tanker', 3.8, 46, 0, 'z', 1, 3.8);
    this.spawnVehicle('bus', -3.8, 34, Math.PI, 'z', -1, -3.8);
    this.spawnVehicle('muscle', 26, 3.8, Math.PI / 2, 'x', 1, 3.8);
    this.spawnVehicle('sedan', -22, -3.8, -Math.PI / 2, 'x', -1, -3.8);
    this.spawnVehicle('suv', 3.8, -28, 0, 'z', 1, 3.8);
    this.spawnVehicle('sports', 64 + 3.8, 22, 0, 'z', 1, 64 + 3.8);

    // Seed lively sidewalk pedestrians along the avenue
    for (let i = 0; i < 10; i++) {
      this.spawnPedestrianNearPlayer(true);
    }

    // Place camera nicely behind hero car facing downtown towers & bank vista
    this.camPos.set(this.playerX - 6, 6.2, this.playerZ - 14);
    this.camTarget.set(this.playerX + 4, 2.2, this.playerZ + 18);
  }

  public setLifecycleState(state: SimLifecycleState) {
    this.lifecycle = state;
    this.audio.setPaused(state !== 'playing');
    if (state === 'playing') {
      this.audio.unlock();
      this.lastTimestamp = performance.now();
    }
    this.emitHud();
  }

  public updateSettings(partial: Partial<SimulationSettings>) {
    const prevLock = this.settings.biomeLock;
    const prevStation = this.settings.radioStation;
    this.settings = { ...this.settings, ...partial };
    this.audio.unlock();
    this.audio.setMuted(this.settings.muted);
    this.audio.setRadioStation(this.settings.radioStation);
    if (partial.radioStation && partial.radioStation !== prevStation) {
      const info = this.audio.getRadioHudInfo();
      this.showBanner(
        `РАДИО: ${info.radioStationName}`,
        `${info.radioGenre} · ${info.radioTrackTitle}`,
        'hijack',
        2.3,
      );
    }
    if (partial.biomeLock && partial.biomeLock !== prevLock) {
      this.chunks.setBiomeLock(this.settings.biomeLock, this.playerX, this.playerZ);
    }
    this.emitHud();
  }

  public resetSimulation() {
    // Clear vehicles, officers, pedestrians, projectiles
    for (const v of this.vehicles) this.scene.remove(v.rig.group);
    this.vehicles = [];
    for (const o of this.officers) this.scene.remove(o.rig.group);
    this.officers = [];
    for (const ped of this.pedestrians) this.scene.remove(ped.rig.group);
    this.pedestrians = [];
    for (const p of this.projectiles) {
      p.active = false;
      p.mesh.visible = false;
    }

    this.playerX = 3.8;
    this.playerZ = 4.0;
    this.playerHealth = 100;
    this.playerArmor = 100;
    this.playerCash = 12500;
    this.wantedHeat = 0;
    this.wantedStars = 0;
    this.banksRobbed = 0;
    this.carsStolen = 1;
    this.explosionsCount = 0;
    this.aiAction = 'driving';
    this.aiStateTimer = 0;
    this.chopperActive = false;
    this.chopperRig.group.visible = false;
    this.bannerText = null;
    this.bannerSubtext = null;
    this.bannerTone = null;
    this.chunks.updateAround(this.playerX, this.playerZ, 2);
    this.spawnInitialWorld();
    this.emitHud();
  }

  public triggerEvent(event: ForcedEventType) {
    this.audio.unlock();
    if (event === 'max_wanted') {
      this.wantedHeat = 98;
      this.wantedStars = 5;
      this.showBanner('РОЗЫСК 5 ЗВЁЗД', 'SWAT и вертолёт VCPD высланы на перехват', 'wanted', 3.4);
      this.trauma = Math.min(1, this.trauma + 0.45);
    } else if (event === 'clear_wanted') {
      this.wantedHeat = 0;
      this.wantedStars = 0;
      this.chopperActive = false;
      this.chopperRig.group.visible = false;
      for (const v of this.vehicles) {
        if (v.isPolice) v.destroyTimer = 0.01;
      }
      this.showBanner('ПОГОНЯ СБРОШЕНА', 'Полиция потеряла след', 'hijack', 2.4);
    } else if (event === 'next_weapon') {
      const idx = (WEAPON_ORDER.indexOf(this.playerWeapon) + 1) % WEAPON_ORDER.length;
      this.equipWeapon(WEAPON_ORDER[idx]);
      this.showBanner(WEAPON_SPECS[this.playerWeapon].name, 'Смена активного вооружения', 'hijack', 2.0);
    } else if (event === 'rob_bank') {
      const bank = this.findNearestBank(true) ?? this.findNearestBank(false);
      if (bank) {
        bank.cooldown = 0;
        this.activeBankTarget = bank;
        // Bring protagonist close to the bank entrance for immediate cinematic heist
        if (this.playerVehicle) {
          this.playerVehicle.isPlayerControlled = false;
          this.playerVehicle.speed = 0;
          this.playerVehicle = null;
        }
        this.playerX = bank.x - 1.5;
        this.playerZ = bank.z - 2.5;
        this.protagonistRig.group.visible = true;
        this.aiAction = 'robbing_bank';
        this.aiStateTimer = 0;
        this.heistBurstTimer = 0;
        this.equipWeapon('rifle');
        this.showBanner('ОГРАБЛЕНИЕ БАНКА', 'Взлом хранилища Leonida Bank', 'heist', 3.2);
      }
    } else if (event === 'hijack_car') {
      if (this.playerVehicle) {
        this.exitCurrentVehicle();
      }
      // Spawn a shiny sports car right next to protagonist if none close
      let target = this.findNearestVehicle(36, false);
      if (!target) {
        target = this.spawnVehicle('sports', this.playerX + 5, this.playerZ + 6, this.playerHeading, 'z', 1, nearestRoadAxisPosition(this.playerX) + 3.8);
      }
      this.hijackTarget = target;
      this.aiAction = 'seeking_car';
      this.aiStateTimer = 0;
      this.showBanner('УГОН АВТОМОБИЛЯ', `Цель: ${VEHICLE_LABELS[target.kind]}`, 'hijack', 2.4);
    } else if (event === 'explode_tanker') {
      let tanker = this.vehicles.find((v) => !v.destroyed && (v.kind === 'tanker' || v.kind === 'bus'));
      if (!tanker) {
        const fx = this.playerX + Math.sin(this.playerHeading) * 20;
        const fz = this.playerZ + Math.cos(this.playerHeading) * 20;
        tanker = this.spawnVehicle('tanker', fx, fz, this.playerHeading, 'z', 1, nearestRoadAxisPosition(fx) + 3.8);
      }
      this.equipWeapon('rpg');
      this.detonateVehicle(tanker, true);
    } else if (event === 'next_radio_track') {
      if (this.settings.radioStation === 'off') {
        this.settings.radioStation = 'vrock';
        this.audio.setRadioStation('vrock');
      }
      const next = this.audio.nextRadioTrack();
      this.showBanner(`📻 ${next.stationName}`, `В эфире: ${next.trackTitle}`, 'hijack', 2.4);
    }
    this.emitHud();
  }

  private equipWeapon(id: WeaponId) {
    this.playerWeapon = id;
    this.playerAmmo = id === 'rpg' ? 12 : id === 'shotgun' ? 48 : 180;
    for (const key of WEAPON_ORDER) {
      this.protagonistRig.weaponMeshes[key].visible = key === id;
    }
  }

  private showBanner(
    text: string,
    subtext: string,
    tone: HudSnapshot['bannerTone'],
    duration = 2.8,
  ) {
    this.bannerText = text;
    this.bannerSubtext = subtext;
    this.bannerTone = tone;
    this.bannerTimer = duration;
  }

  private handleResize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private scheduleNextFrame() {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(() => this.tick(), 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.requestAnimationFrame(() => this.tick());
    }
  }

  private tick() {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastTimestamp) / 1000));
    this.lastTimestamp = now;

    if (this.lifecycle !== 'paused') {
      // Hitstop freezes simulation physics briefly while rendering & camera trauma stay smooth
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - rawDt);
      } else {
        const simDt = rawDt * this.settings.simSpeed;
        this.elapsedTime += simDt;
        this.stepSimulation(simDt);
      }
      this.updateCamera(rawDt);
      this.updateParticles(rawDt);
      this.updateShockwaves(rawDt);
      this.updateRain(rawDt);
      this.updateAtmosphereLighting(rawDt);
    }

    this.renderer.render(this.scene, this.camera);

    this.hudEmitTimer += rawDt;
    if (this.hudEmitTimer >= 0.14) {
      this.hudEmitTimer = 0;
      this.emitHud();
    }

    this.scheduleNextFrame();
  }

  private stepSimulation(dt: number) {
    // Advance time of day smoothly
    if (this.settings.timeCycleSpeed > 0) {
      this.settings.timeOfDay = (this.settings.timeOfDay + dt * 0.08 * this.settings.timeCycleSpeed) % 24;
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.bannerText = null;
        this.bannerSubtext = null;
        this.bannerTone = null;
      }
    }

    // Stream procedural chunks seamlessly around the protagonist
    this.chunks.updateAround(this.playerX, this.playerZ, 2);
    this.chunks.tickCooldowns(dt);

    // Maintain traffic, pedestrians & police unit budgets
    this.maintainTraffic();
    this.maintainPedestrians();
    this.maintainPolice();

    // Update Protagonist autonomous AI
    this.updateProtagonistAI(dt);

    // Update Vehicles (steering & tactical movement)
    this.updateVehicles(dt);

    // Rigid multi-iteration vehicle-to-vehicle & building collision pass (prevents any interpenetration)
    this.resolveAllCollisions(dt);

    // Update Police Foot Officers
    this.updateOfficers(dt);

    // Update Sidewalk Pedestrians
    this.updatePedestrians(dt);

    // Update Police Helicopter
    this.updateChopper(dt);

    // Update Projectiles & Hits
    this.updateProjectiles(dt);

    // Wanted star calculation & gradual cool-off when evading police
    const nearestPolice = this.getNearestPoliceDistance();
    if (this.wantedHeat > 0) {
      const decay = nearestPolice > 52 ? 2.4 : 0.35;
      this.wantedHeat = Math.max(0, this.wantedHeat - dt * decay);
    }
    const newStars = heatToWantedStars(this.wantedHeat);
    if (newStars > this.wantedStars && this.lifecycle === 'playing') {
      this.showBanner(`РОЗЫСК: ${'★'.repeat(newStars)}`, 'Полиция Вайс-Сити усиливает перехват', 'wanted', 2.4);
    }
    this.wantedStars = newStars;

    // Procedural police siren, V8 vehicle engine & GTA Radio Station sequencer
    this.audio.updateSiren(dt, this.wantedStars, nearestPolice);
    this.audio.updateVehicleAudio(
      dt,
      !!this.playerVehicle,
      this.playerVehicle ? this.playerVehicle.kind : null,
      this.playerSpeed,
      this.playerVehicle ? this.playerVehicle.rig.steeringWheel.rotation.z : 0,
    );
    this.audio.updateRadio();
  }

  private addWantedHeat(amount: number) {
    this.wantedHeat = Math.min(100, this.wantedHeat + amount);
  }

  private updateProtagonistAI(dt: number) {
    this.aiStateTimer += dt;
    this.aiDecisionTimer -= dt;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    // Handle Wasted slow-mo respawn cleanly so simulation runs forever
    if (this.aiAction === 'wasted') {
      this.wastedTimer -= dt;
      this.protagonistRig.group.rotation.x = THREE.MathUtils.damp(
        this.protagonistRig.group.rotation.x,
        -Math.PI * 0.48,
        8,
        dt,
      );
      if (this.wastedTimer <= 0) {
        this.playerHealth = 100;
        this.playerArmor = 100;
        this.wantedHeat = 0;
        this.wantedStars = 0;
        this.protagonistRig.group.rotation.x = 0;
        this.aiAction = 'seeking_car';
        this.aiStateTimer = 0;
      }
      return;
    }

    // Periodic autonomous decision refresh
    if (this.aiDecisionTimer <= 0) {
      this.aiDecisionTimer = 1.6 + Math.random() * 1.4;
      const bank = this.findNearestBank(true);
      const bankDist = bank ? Math.hypot(bank.x - this.playerX, bank.z - this.playerZ) : 999;
      const civCar = this.findNearestVehicle(55, false);
      const civDist = civCar ? Math.hypot(civCar.x - this.playerX, civCar.z - this.playerZ) : 999;
      const heavyTarget = this.findNearestHeavyTarget(44);
      const heavyDist = heavyTarget ? Math.hypot(heavyTarget.x - this.playerX, heavyTarget.z - this.playerZ) : 999;
      const policeDist = this.getNearestPoliceDistance();

      const nextAction = selectNextAIAction({
        currentAction: this.aiAction,
        inVehicle: !!this.playerVehicle,
        wantedStars: this.wantedStars,
        chaosLevel: this.settings.chaosLevel,
        health: this.playerHealth,
        nearbyBankDist: this.elapsedTime < 6 ? 999 : bankDist,
        nearbyBankReady: this.elapsedTime >= 6 && !!bank,
        nearbyCivilianCarDist: civDist,
        nearbyTankerOrBusDist: this.elapsedTime < 4 ? 999 : heavyDist,
        nearestPoliceDist: policeDist,
        stateTimer: this.aiStateTimer,
        randomRoll: Math.random(),
      });

      if (nextAction !== this.aiAction) {
        this.aiAction = nextAction;
        this.aiStateTimer = 0;
        if (nextAction === 'robbing_bank' && bank) {
          this.activeBankTarget = bank;
        }
        if (nextAction === 'seeking_car' && civCar) {
          if (this.playerVehicle) this.exitCurrentVehicle();
          this.hijackTarget = civCar;
        }
        if ((nextAction === 'combat' || nextAction === 'sabotage') && this.playerVehicle && Math.random() < 0.6) {
          this.exitCurrentVehicle();
        }
      }
    }

    // Execute current autonomous action
    if (this.aiAction === 'robbing_bank') {
      const bank = this.activeBankTarget ?? this.findNearestBank(true);
      if (!bank) {
        this.aiAction = this.playerVehicle ? 'driving' : 'seeking_car';
        return;
      }
      const dist = Math.hypot(bank.x - this.playerX, bank.z - this.playerZ);
      if (this.playerVehicle && dist < 11) {
        this.exitCurrentVehicle();
      }
      if (this.playerVehicle) {
        this.steerVehicleToward(this.playerVehicle, bank.x, bank.z, 18, dt);
      } else if (dist > 2.4) {
        this.movePlayerOnFootToward(bank.x, bank.z, 7.6, dt);
      } else {
        // Inside bank heist vault burst! Spawn flying green cash bills & raise stars
        this.heistBurstTimer -= dt;
        if (this.heistBurstTimer <= 0) {
          this.heistBurstTimer = 0.22;
          this.spawnCashBurst(bank.x, 2.0, bank.z, 8);
          this.audio.playHeistCash();
        }
        if (this.aiStateTimer >= 3.8) {
          const loot = 32000 + Math.floor(Math.random() * 26000);
          this.playerCash += loot;
          this.banksRobbed += 1;
          bank.cooldown = 55;
          this.addWantedHeat(38);
          this.showBanner(`ОГРАБЛЕНИЕ +$${loot.toLocaleString('ru-RU')}`, 'Сигнализация Leonida Bank сработала · Уход от полиции!', 'heist', 3.4);
          this.activeBankTarget = null;
          this.aiAction = 'seeking_car';
          this.aiStateTimer = 0;
          this.hijackTarget = this.findNearestVehicle(45, false);
        }
      }
    } else if (this.aiAction === 'seeking_car') {
      let target = this.hijackTarget;
      if (!target || target.destroyed || Math.hypot(target.x - this.playerX, target.z - this.playerZ) > 65) {
        target = this.findNearestVehicle(58, false);
        this.hijackTarget = target;
      }
      if (!target) {
        this.movePlayerOnFootToward(this.playerX + Math.sin(this.playerHeading) * 14, this.playerZ + Math.cos(this.playerHeading) * 14, 6.8, dt);
        return;
      }
      // Slow target slightly as protagonist sprints up to pull driver out
      const dist = Math.hypot(target.x - this.playerX, target.z - this.playerZ);
      if (dist < 10) target.targetSpeed = 2;
      if (dist > 2.9) {
        this.movePlayerOnFootToward(target.x, target.z, 8.2, dt);
      } else {
        this.aiAction = 'hijacking';
        this.aiStateTimer = 0;
        target.speed = 0;
        target.vx = 0;
        target.vz = 0;
        target.targetSpeed = 0;
      }
    } else if (this.aiAction === 'hijacking') {
      const target = this.hijackTarget;
      if (!target || target.destroyed) {
        this.aiAction = 'roaming';
        return;
      }
      this.playerX = THREE.MathUtils.lerp(this.playerX, target.x, dt * 6);
      this.playerZ = THREE.MathUtils.lerp(this.playerZ, target.z, dt * 6);
      this.syncProtagonistMesh(dt, 0.5);
      if (this.aiStateTimer >= 0.85) {
        this.enterVehicle(target);
        this.carsStolen += 1;
        this.addWantedHeat(target.isPolice ? 26 : 14);
        this.showBanner(`УГОН: ${VEHICLE_LABELS[target.kind]}`, 'Машина перехвачена · Полный газ!', 'hijack', 2.4);
        this.hijackTarget = null;
        this.aiAction = this.wantedStars > 0 ? 'fleeing_police' : 'driving';
        this.aiStateTimer = 0;
      }
    } else if (this.aiAction === 'sabotage') {
      const target = this.findNearestHeavyTarget(55) ?? this.findNearestVehicle(45, true);
      if (!target) {
        this.aiAction = this.playerVehicle ? 'driving' : 'seeking_car';
        return;
      }
      const dist = Math.hypot(target.x - this.playerX, target.z - this.playerZ);
      const optimal = selectOptimalWeapon('sabotage', dist, target.kind === 'tanker' || target.kind === 'bus', this.wantedStars);
      if (optimal !== this.playerWeapon) this.equipWeapon(optimal);

      if (this.playerVehicle) {
        this.driveAutonomousRoad(this.playerVehicle, dt, true);
        this.tryFireAtPoint(target.x, 1.4, target.z, true);
      } else {
        this.playerHeading = Math.atan2(target.x - this.playerX, target.z - this.playerZ);
        if (dist > 28) {
          this.movePlayerOnFootToward(target.x, target.z, 7.2, dt);
        } else {
          this.syncProtagonistMesh(dt, 0, true);
        }
        this.tryFireAtPoint(target.x, 1.4, target.z, true);
      }
    } else if (this.aiAction === 'combat') {
      const target = this.findNearestCombatTarget();
      if (!target) {
        this.aiAction = this.playerVehicle ? 'fleeing_police' : 'seeking_car';
        return;
      }
      const dist = Math.hypot(target.x - this.playerX, target.z - this.playerZ);
      const optimal = selectOptimalWeapon('combat', dist, target.heavy, this.wantedStars);
      if (optimal !== this.playerWeapon) this.equipWeapon(optimal);

      if (this.playerVehicle) {
        this.driveAutonomousRoad(this.playerVehicle, dt, true);
        this.tryFireAtPoint(target.x, target.y, target.z, true);
      } else {
        this.playerHeading = Math.atan2(target.x - this.playerX, target.z - this.playerZ);
        // Strafe dynamically around police cover
        const strafeAngle = this.playerHeading + Math.PI * 0.5;
        const strafeSpeed = Math.sin(this.elapsedTime * 1.9) * 4.2;
        this.playerX += Math.sin(strafeAngle) * strafeSpeed * dt;
        this.playerZ += Math.cos(strafeAngle) * strafeSpeed * dt;
        this.syncProtagonistMesh(dt, Math.abs(strafeSpeed), true);
        this.tryFireAtPoint(target.x, target.y, target.z, true);
      }
    } else if (this.aiAction === 'driving' || this.aiAction === 'fleeing_police') {
      if (!this.playerVehicle) {
        this.aiAction = 'seeking_car';
        return;
      }
      const reckless = this.aiAction === 'fleeing_police' || this.settings.chaosLevel > 0.55;
      this.driveAutonomousRoad(this.playerVehicle, dt, reckless);

      // Drive-by shooting at pursuing police or nearby tankers!
      const target = this.findNearestCombatTarget();
      if (target && Math.hypot(target.x - this.playerX, target.z - this.playerZ) < 38) {
        if (this.playerWeapon === 'pistol' || this.playerWeapon === 'shotgun') {
          this.equipWeapon('smg');
        }
        this.tryFireAtPoint(target.x, target.y, target.z, true);
      }
    } else {
      // Roaming on foot along avenues
      const tx = this.playerX + Math.sin(this.playerHeading) * 12;
      const tz = this.playerZ + Math.cos(this.playerHeading) * 12;
      this.movePlayerOnFootToward(tx, tz, 6.2, dt);
    }

    // Regenerate armor/health slightly when out of immediate combat
    if (this.wantedStars === 0 && this.playerHealth < 100) {
      this.playerHealth = Math.min(100, this.playerHealth + dt * 4);
    }
  }

  private enterVehicle(v: SimVehicle) {
    if (this.playerVehicle) {
      this.playerVehicle.isPlayerControlled = false;
      this.playerVehicle.rig.driverGroup.visible = false;
      this.playerVehicle.rig.protagonistDriverMesh.visible = false;
    }
    // If an NPC driver was sitting behind the wheel, pull them out onto the asphalt in panic
    if (v.rig.driverGroup.visible && v.rig.npcDriverMesh.visible) {
      this.spawnEjectedDriver(v);
    }
    v.isPlayerControlled = true;
    v.isPolice = false;
    v.rig.driverGroup.visible = true;
    v.rig.protagonistDriverMesh.visible = true;
    v.rig.npcDriverMesh.visible = false;
    this.playerVehicle = v;
    this.protagonistRig.group.visible = false;
    this.playerX = v.x;
    this.playerZ = v.z;
    this.playerHeading = v.heading;
  }

  private spawnEjectedDriver(v: SimVehicle) {
    const id = this.nextEntityId++;
    const doorX = v.x - Math.cos(v.heading) * (v.rig.width * 0.62 + 0.75);
    const doorZ = v.z + Math.sin(v.heading) * (v.rig.width * 0.62 + 0.75);
    const fleeHeading = Math.atan2(doorX - v.x, doorZ - v.z);
    const rig = buildHumanoidModel('civilian', this.textures, v.id * 17 + 5);
    rig.group.position.set(doorX, 0.04, doorZ);
    rig.group.rotation.y = fleeHeading;
    this.scene.add(rig.group);
    const nearX = nearestRoadAxisPosition(doorX);
    this.pedestrians.push({
      id,
      rig,
      x: doorX,
      z: doorZ,
      heading: fleeHeading,
      speed: 2.1,
      roadAxis: 'z',
      roadDir: 1,
      sidewalkCoord: nearX + 9.5,
      state: 'fleeing',
      panicTimer: 6.5,
      threatX: v.x,
      threatZ: v.z,
      walkPhase: 0,
      koTimer: 0,
      alive: true,
    });
  }

  private exitCurrentVehicle() {
    if (!this.playerVehicle) return;
    const v = this.playerVehicle;
    v.isPlayerControlled = false;
    v.rig.driverGroup.visible = false;
    v.rig.protagonistDriverMesh.visible = false;
    v.speed *= 0.35;
    v.vx *= 0.35;
    v.vz *= 0.35;
    v.targetSpeed = 0;
    this.playerX = v.x + Math.cos(v.heading) * (v.rig.width * 0.65 + 0.9);
    this.playerZ = v.z - Math.sin(v.heading) * (v.rig.width * 0.65 + 0.9);
    this.playerVehicle = null;
    this.protagonistRig.group.visible = true;
    this.protagonistRig.group.position.set(this.playerX, 0.04, this.playerZ);
  }

  private movePlayerOnFootToward(tx: number, tz: number, speed: number, dt: number) {
    const dx = tx - this.playerX;
    const dz = tz - this.playerZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.2) {
      this.syncProtagonistMesh(dt, 0);
      return;
    }
    const targetHeading = Math.atan2(dx, dz);
    this.playerHeading += shortestAngleDelta(this.playerHeading, targetHeading) * Math.min(1, dt * 10);
    const step = Math.min(dist, speed * dt);
    this.playerX += (dx / dist) * step;
    this.playerZ += (dz / dist) * step;
    this.playerSpeed = speed;
    this.syncProtagonistMesh(dt, speed, false);
  }

  private syncProtagonistMesh(dt: number, speed: number, aiming = false) {
    this.protagonistRig.group.position.set(this.playerX, 0.04, this.playerZ);
    this.protagonistRig.group.rotation.y = this.playerHeading;
    if (speed > 0.4) {
      this.walkCycle += dt * speed * 1.9;
      const swing = Math.sin(this.walkCycle) * 0.72;
      this.protagonistRig.leftLeg.rotation.x = swing;
      this.protagonistRig.rightLeg.rotation.x = -swing;
      this.protagonistRig.leftArm.rotation.x = -swing * 0.65;
      this.protagonistRig.rightArm.rotation.x = aiming ? -1.45 : swing * 0.65;
    } else {
      this.protagonistRig.leftLeg.rotation.x = THREE.MathUtils.damp(this.protagonistRig.leftLeg.rotation.x, 0, 10, dt);
      this.protagonistRig.rightLeg.rotation.x = THREE.MathUtils.damp(this.protagonistRig.rightLeg.rotation.x, 0, 10, dt);
      this.protagonistRig.leftArm.rotation.x = THREE.MathUtils.damp(this.protagonistRig.leftArm.rotation.x, 0, 10, dt);
      this.protagonistRig.rightArm.rotation.x = THREE.MathUtils.damp(
        this.protagonistRig.rightArm.rotation.x,
        aiming ? -1.48 : 0,
        12,
        dt,
      );
    }
  }

  private driveAutonomousRoad(v: SimVehicle, dt: number, reckless: boolean) {
    const desiredTopSpeed =
      v.kind === 'sports'
        ? reckless
          ? 34
          : 25
        : v.kind === 'muscle'
          ? reckless
            ? 30
            : 22
          : v.kind === 'bus' || v.kind === 'tanker'
            ? 18
            : reckless
              ? 26
              : 20;

    v.targetSpeed = desiredTopSpeed;

    // Smoothly follow road axis and periodically turn at intersections to explore different biomes!
    const nearX = nearestRoadAxisPosition(v.x);
    const nearZ = nearestRoadAxisPosition(v.z);
    const atIntersection = Math.abs(v.x - nearX) < 3.6 && Math.abs(v.z - nearZ) < 3.6;

    if (atIntersection && Math.random() < dt * 1.1) {
      if (v.roadAxis === 'z') {
        v.roadAxis = 'x';
        v.roadDir = Math.random() < 0.5 ? 1 : -1;
        v.laneCoord = nearZ + (v.roadDir === 1 ? 3.8 : -3.8);
      } else {
        v.roadAxis = 'z';
        v.roadDir = Math.random() < 0.5 ? 1 : -1;
        v.laneCoord = nearX + (v.roadDir === 1 ? 3.8 : -3.8);
      }
    }

    // Lookahead waypoint along chosen lane
    let wx = v.x;
    let wz = v.z;
    if (v.roadAxis === 'z') {
      wx = v.laneCoord;
      wz = v.z + v.roadDir * 24;
    } else {
      wx = v.x + v.roadDir * 24;
      wz = v.laneCoord;
    }

    // Proactively steer around traffic, wrecks, and police roadblocks ahead
    let speedLimit = desiredTopSpeed;
    for (const other of this.vehicles) {
      if (other === v) continue;
      const dx = other.x - v.x;
      const dz = other.z - v.z;
      const d = Math.hypot(dx, dz);
      if (d < 16) {
        const sinH = Math.sin(v.heading);
        const cosH = Math.cos(v.heading);
        const fwd = dx * sinH + dz * cosH;
        const lat = dx * cosH - dz * sinH;
        if (fwd > 0 && Math.abs(lat) < 3.4) {
          const evadeDir = lat >= 0 ? -1 : 1;
          wx += cosH * evadeDir * 5.6;
          wz -= sinH * evadeDir * 5.6;
          if (!reckless && d < 10) {
            speedLimit = Math.min(speedLimit, 12);
          }
        }
      }
    }

    // Unstick maneuver if wedged against a roadblock or wreck
    if (Math.abs(v.speed) < 2.2) {
      v.stuckTimer += dt;
      if (v.stuckTimer > 1.2) {
        wx = v.x - Math.sin(v.heading) * 10 + Math.cos(v.heading) * v.avoidSign * 7;
        wz = v.z - Math.cos(v.heading) * 10 - Math.sin(v.heading) * v.avoidSign * 7;
        speedLimit = 12;
        if (v.stuckTimer > 2.2) {
          v.stuckTimer = 0;
          v.avoidSign *= -1;
        }
      }
    } else {
      v.stuckTimer = Math.max(0, v.stuckTimer - dt * 2);
    }

    this.steerVehicleToward(v, wx, wz, speedLimit, dt);
    this.playerX = v.x;
    this.playerZ = v.z;
    this.playerHeading = v.heading;
    this.playerSpeed = Math.hypot(v.vx, v.vz);
  }

  private steerVehicleToward(v: SimVehicle, tx: number, tz: number, maxSpeed: number, dt: number) {
    const dx = tx - v.x;
    const dz = tz - v.z;
    const dist = Math.hypot(dx, dz);
    let cornerBrake = 1.0;

    if (dist > 0.35 && maxSpeed > 0.25) {
      const desiredHeading = Math.atan2(dx, dz);
      const delta = shortestAngleDelta(v.heading, desiredHeading);
      const turnRate = v.kind === 'bus' || v.kind === 'tanker' ? 2.3 : v.kind === 'swat' ? 3.1 : 4.2;
      v.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, delta * 3.6 * dt));
      cornerBrake = Math.abs(delta) > 0.6 ? 0.56 : Math.abs(delta) > 0.35 ? 0.8 : 1.0;
      const targetSteerAngle = THREE.MathUtils.clamp(-delta * 1.85, -1.1, 1.1);
      v.rig.steeringWheel.rotation.z = THREE.MathUtils.damp(v.rig.steeringWheel.rotation.z, targetSteerAngle, 10, dt);
      v.rig.driverGroup.rotation.y = THREE.MathUtils.damp(v.rig.driverGroup.rotation.y, THREE.MathUtils.clamp(delta * 0.28, -0.26, 0.26), 8, dt);
    } else {
      v.rig.steeringWheel.rotation.z = THREE.MathUtils.damp(v.rig.steeringWheel.rotation.z, 0, 8, dt);
      v.rig.driverGroup.rotation.y = THREE.MathUtils.damp(v.rig.driverGroup.rotation.y, 0, 8, dt);
    }

    const sinH = Math.sin(v.heading);
    const cosH = Math.cos(v.heading);

    if (maxSpeed <= 0.25) {
      // Firm braking to a clean halt (for waiting traffic & police perimeter cordons)
      v.vx = THREE.MathUtils.damp(v.vx, 0, 7.5, dt);
      v.vz = THREE.MathUtils.damp(v.vz, 0, 7.5, dt);
      v.speed = v.vx * sinH + v.vz * cosH;
    } else {
      const targetSpd = maxSpeed * cornerBrake;
      const desiredVx = sinH * targetSpd;
      const desiredVz = cosH * targetSpd;
      // Tire traction blends current momentum vector toward target velocity so crash impulses deflect realistically
      const accelRate = v.kind === 'sports' ? 4.4 : v.kind === 'bus' || v.kind === 'tanker' ? 2.4 : 3.5;
      v.vx = THREE.MathUtils.damp(v.vx, desiredVx, accelRate, dt);
      v.vz = THREE.MathUtils.damp(v.vz, desiredVz, accelRate, dt);
      v.speed = v.vx * sinH + v.vz * cosH;
    }

    v.x += v.vx * dt;
    v.z += v.vz * dt;
  }

  private isSpawnClear(x: number, z: number, minDist: number): boolean {
    if (Math.hypot(x - this.playerX, z - this.playerZ) < Math.max(8, minDist * 0.8)) {
      return false;
    }
    for (const v of this.vehicles) {
      if (Math.hypot(v.x - x, v.z - z) < minDist) {
        return false;
      }
    }
    return true;
  }

  private spawnVehicle(
    kind: VehicleKind,
    x: number,
    z: number,
    heading: number,
    roadAxis: 'x' | 'z',
    roadDir: 1 | -1,
    laneCoord: number,
  ): SimVehicle {
    const id = this.nextEntityId++;
    const rig = buildVehicleModel(kind, id * 7, this.textures);
    rig.group.position.set(x, 0.04, z);
    rig.group.rotation.y = heading;
    this.scene.add(rig.group);

    const maxHp =
      kind === 'swat' ? 260 : kind === 'bus' ? 165 : kind === 'tanker' ? 95 : kind === 'police' ? 130 : 100;
    const initSpeed = kind === 'bus' || kind === 'tanker' ? 10 : 13;

    const v: SimVehicle = {
      id,
      kind,
      rig,
      x,
      z,
      vx: Math.sin(heading) * initSpeed,
      vz: Math.cos(heading) * initSpeed,
      heading,
      speed: initSpeed,
      targetSpeed: kind === 'bus' || kind === 'tanker' ? 12 : 16,
      length: rig.length,
      width: rig.width,
      hp: maxHp,
      maxHp,
      destroyed: false,
      destroyTimer: 0,
      isPolice: kind === 'police' || kind === 'swat',
      isPlayerControlled: false,
      roadAxis,
      roadDir,
      laneCoord,
      fireCooldown: 1.4 + Math.random() * 0.8,
      policeRole: 'intercept',
      policeSlot: 0,
      deployedOfficer: false,
      mood: 'calm',
      panicTimer: 0,
      stuckTimer: 0,
      avoidSign: id % 2 === 0 ? 1 : -1,
    };
    this.vehicles.push(v);
    return v;
  }

  private maintainTraffic() {
    const desiredCivilians = Math.round(7 + this.settings.trafficDensity * 9);
    let currentCivilians = 0;
    for (const v of this.vehicles) {
      if (!v.isPolice && !v.isPlayerControlled && !v.destroyed) currentCivilians++;
    }
    if (currentCivilians >= desiredCivilians) return;

    const axis: 'x' | 'z' = Math.random() < 0.5 ? 'z' : 'x';
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const baseRoadX = nearestRoadAxisPosition(this.playerX) + (Math.floor(Math.random() * 3) - 1) * CHUNK_SIZE;
    const baseRoadZ = nearestRoadAxisPosition(this.playerZ) + (Math.floor(Math.random() * 3) - 1) * CHUNK_SIZE;

    let sx = baseRoadX;
    let sz = baseRoadZ;
    let laneCoord = 0;
    let heading = 0;

    if (axis === 'z') {
      laneCoord = baseRoadX + (dir === 1 ? 3.8 : -3.8);
      sx = laneCoord;
      sz = this.playerZ + (Math.random() < 0.5 ? 1 : -1) * (46 + Math.random() * 48);
      heading = dir === 1 ? 0 : Math.PI;
    } else {
      laneCoord = baseRoadZ + (dir === 1 ? 3.8 : -3.8);
      sz = laneCoord;
      sx = this.playerX + (Math.random() < 0.5 ? 1 : -1) * (46 + Math.random() * 48);
      heading = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    }

    if (!this.isSpawnClear(sx, sz, 12.5)) return;

    // Ensure regular appearance of Buses & explosive Fuel Tankers alongside sleek Vice City cars!
    const roll = Math.random();
    const kind: VehicleKind =
      roll < 0.14
        ? 'tanker'
        : roll < 0.28
          ? 'bus'
          : roll < 0.52
            ? 'sports'
            : roll < 0.72
              ? 'muscle'
              : roll < 0.86
                ? 'suv'
                : 'sedan';

    this.spawnVehicle(kind, sx, sz, heading, axis, dir, laneCoord);
  }

  private maintainPolice() {
    const budget = getPoliceBudget(this.wantedStars);
    let cruisers = 0;
    let swat = 0;
    for (const v of this.vehicles) {
      if (!v.destroyed && v.kind === 'police') cruisers++;
      if (!v.destroyed && v.kind === 'swat') swat++;
    }

    if (cruisers < budget.cruisers) {
      this.spawnPoliceVehicle('police', cruisers + swat);
    }
    if (swat < budget.swatVans) {
      this.spawnPoliceVehicle('swat', cruisers + swat + 1);
    }

    // Police helicopter at 3+ stars
    this.chopperActive = budget.helicopters > 0;
    this.chopperRig.group.visible = this.chopperActive;

    // Armed foot officers — spawn spread across distinct tactical angles when player is on foot or wanted
    const aliveOfficers = this.officers.filter((o) => o.alive).length;
    if (aliveOfficers < budget.footOfficers && this.wantedStars > 0) {
      const ang = (aliveOfficers / Math.max(2, budget.footOfficers)) * Math.PI * 2 + Math.random() * 0.6;
      const dist = 26 + Math.random() * 14;
      const ox = this.playerX + Math.sin(ang) * dist;
      const oz = this.playerZ + Math.cos(ang) * dist;
      this.spawnOfficerAt(ox, oz, ang);
    }
  }

  private spawnOfficerAt(ox: number, oz: number, flankAngle: number) {
    const id = this.nextEntityId++;
    const rig = buildHumanoidModel('police', this.textures, id);
    rig.group.position.set(ox, 0.04, oz);
    this.scene.add(rig.group);
    this.officers.push({
      id,
      rig,
      x: ox,
      z: oz,
      heading: Math.atan2(this.playerX - ox, this.playerZ - oz),
      hp: 65,
      fireCooldown: 0.9 + Math.random() * 0.7,
      burstRemaining: 2 + (id % 2),
      burstTimer: 0,
      strafeSign: id % 2 === 0 ? 1 : -1,
      flankAngle,
      state: 'advancing',
      koTimer: 0,
      alive: true,
    });
  }

  private spawnPoliceVehicle(kind: 'police' | 'swat', slotHint: number) {
    // Spread police spawns across 4 distinct street approaches (ahead roadblock, rear chase, left & right avenues)
    const baseRoadX = nearestRoadAxisPosition(this.playerX);
    const baseRoadZ = nearestRoadAxisPosition(this.playerZ);

    for (let attempt = 0; attempt < 6; attempt++) {
      const sector = (slotHint + attempt) % 4;
      const dist = 52 + attempt * 9 + Math.random() * 14;
      let sx = baseRoadX + 3.8;
      let sz = this.playerZ - dist;
      let axis: 'x' | 'z' = 'z';
      let dir: 1 | -1 = 1;
      let laneCoord = sx;

      if (sector === 0) {
        // Rear pursuit along North/South avenue
        axis = 'z';
        dir = 1;
        laneCoord = baseRoadX + 3.8;
        sx = laneCoord;
        sz = this.playerZ - dist;
      } else if (sector === 1) {
        // Ahead roadblock / intercept along opposite lane
        axis = 'z';
        dir = -1;
        laneCoord = baseRoadX - 3.8;
        sx = laneCoord;
        sz = this.playerZ + dist;
      } else if (sector === 2) {
        // Flanking from East cross-avenue
        axis = 'x';
        dir = -1;
        laneCoord = baseRoadZ - 3.8;
        sx = this.playerX + dist;
        sz = laneCoord;
      } else {
        // Flanking from West cross-avenue
        axis = 'x';
        dir = 1;
        laneCoord = baseRoadZ + 3.8;
        sx = this.playerX - dist;
        sz = laneCoord;
      }

      if (this.isSpawnClear(sx, sz, 13)) {
        const heading = Math.atan2(this.playerX - sx, this.playerZ - sz);
        const cruiser = this.spawnVehicle(kind, sx, sz, heading, axis, dir, laneCoord);
        cruiser.policeSlot = slotHint;
        cruiser.policeRole = assignPoliceRole(slotHint, kind, !this.playerVehicle);
        return;
      }
    }
  }

  private updateVehicles(dt: number) {
    const flashState = Math.floor(this.elapsedTime * 8) % 2 === 0;
    const playerOnFoot = !this.playerVehicle;

    // Re-index active police units sequentially so roles & cordon ring angles stay cleanly distributed
    const activePolice: SimVehicle[] = [];
    for (const v of this.vehicles) {
      if (!v.destroyed && v.isPolice) {
        activePolice.push(v);
      }
    }
    const totalPolice = activePolice.length;
    for (let idx = 0; idx < totalPolice; idx++) {
      const pv = activePolice[idx];
      pv.policeSlot = idx;
      pv.policeRole = assignPoliceRole(idx, pv.kind, playerOnFoot);
    }

    // Shared snapshot of vehicle positions/lengths for separation steering & headway braking
    const vehicleSnapshots = this.vehicles.map((veh) => ({
      id: veh.id,
      x: veh.x,
      z: veh.z,
      length: veh.length,
    }));

    const budget = getPoliceBudget(this.wantedStars);

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      const distToPlayer = Math.hypot(v.x - this.playerX, v.z - this.playerZ);

      // Cull far-away traffic or aged wrecks
      if (v.destroyed) {
        v.destroyTimer -= dt;
        // Dampen wreck momentum smoothly if pushed by a crash
        v.vx = THREE.MathUtils.damp(v.vx, 0, 5.5, dt);
        v.vz = THREE.MathUtils.damp(v.vz, 0, 5.5, dt);
        v.x += v.vx * dt;
        v.z += v.vz * dt;
        v.speed = 0;

        // Billowing black smoke & embers from destroyed vehicles
        if (Math.random() < dt * 8) {
          this.spawnSmokeParticle(v.x + (Math.random() - 0.5) * 1.5, 1.3, v.z + (Math.random() - 0.5) * 1.5);
        }
        if (v.destroyTimer <= 0 || distToPlayer > 140) {
          this.scene.remove(v.rig.group);
          this.vehicles.splice(i, 1);
        }
        continue;
      }

      if (!v.isPlayerControlled && distToPlayer > 145) {
        this.scene.remove(v.rig.group);
        this.vehicles.splice(i, 1);
        continue;
      }

      // Flashing police lightbars
      if (v.rig.lightBarRed && v.rig.lightBarBlue) {
        const redMat = v.rig.lightBarRed.material as THREE.MeshStandardMaterial;
        const blueMat = v.rig.lightBarBlue.material as THREE.MeshStandardMaterial;
        const activeSirens = this.wantedStars > 0;
        redMat.emissiveIntensity = activeSirens && flashState ? 4.5 : 0.4;
        blueMat.emissiveIntensity = activeSirens && !flashState ? 4.5 : 0.4;
      }

      if (!v.isPlayerControlled) {
        if (v.isPolice && this.wantedStars > 0) {
          // Tactical multi-role pursuit (intercept / flank_left / flank_right / roadblock / perimeter)
          const goal = computePoliceTacticalGoal({
            role: v.policeRole,
            slotIndex: v.policeSlot,
            totalPolice,
            policeX: v.x,
            policeZ: v.z,
            playerX: this.playerX,
            playerZ: this.playerZ,
            playerHeading: this.playerHeading,
            playerSpeed: this.playerSpeed,
            isSwat: v.kind === 'swat',
          });

          // Strong inter-vehicle separation so cruisers NEVER collapse into a single point
          const sep = computeSeparationVector(v.id, v.x, v.z, vehicleSnapshots, 11.5);
          let tx = goal.targetX + sep.ox * 1.45;
          let tz = goal.targetZ + sep.oz * 1.45;
          let desiredSpeed = goal.desiredSpeed;

          // Unstick maneuver if wedged against a building edge or wrecked vehicle
          if (desiredSpeed > 5 && Math.hypot(v.vx, v.vz) < 1.8) {
            v.stuckTimer += dt;
            if (v.stuckTimer > 1.3) {
              tx = v.x - Math.sin(v.heading) * 9 + Math.cos(v.heading) * v.avoidSign * 8;
              tz = v.z - Math.cos(v.heading) * 9 - Math.sin(v.heading) * v.avoidSign * 8;
              desiredSpeed = 10;
              if (v.stuckTimer > 2.3) {
                v.stuckTimer = 0;
                v.avoidSign *= -1;
              }
            }
          } else {
            v.stuckTimer = Math.max(0, v.stuckTimer - dt * 2);
          }

          this.steerVehicleToward(v, tx, tz, desiredSpeed, dt);

          // Deploy armed foot officer cleanly from halted perimeter / roadblock cruisers!
          if (goal.shouldBrakeAndDeploy && !v.deployedOfficer && distToPlayer < 34) {
            const aliveOfficers = this.officers.filter((o) => o.alive).length;
            if (aliveOfficers < budget.footOfficers + 2) {
              v.deployedOfficer = true;
              const sideX = Math.cos(v.heading) * (v.width * 0.65 + 1.1);
              const sideZ = -Math.sin(v.heading) * (v.width * 0.65 + 1.1);
              const flankAng = (v.policeSlot / Math.max(3, totalPolice)) * Math.PI * 2;
              this.spawnOfficerAt(v.x + sideX, v.z + sideZ, flankAng);
            }
          }

          // Police shoot at protagonist when within engagement range
          v.fireCooldown -= dt;
          if (distToPlayer < 34 && v.fireCooldown <= 0 && this.aiAction !== 'wasted') {
            v.fireCooldown = v.kind === 'swat' ? 0.6 : 1.15;
            this.fireProjectile(v.x, 1.6, v.z, this.playerX, 1.2, this.playerZ, false, false, 6, 0x60a5fa);
          }
        } else {
          // Civilian traffic AI with headway braking, intersection turns, and panic reactions
          if (v.panicTimer > 0) {
            v.panicTimer -= dt;
            if (v.panicTimer <= 0) v.mood = 'calm';
          }

          const nearX = nearestRoadAxisPosition(v.x);
          const nearZ = nearestRoadAxisPosition(v.z);
          if (Math.abs(v.x - nearX) < 1.6 && Math.abs(v.z - nearZ) < 1.6 && Math.random() < dt * 0.45) {
            if (v.roadAxis === 'z') {
              v.roadAxis = 'x';
              v.roadDir = Math.random() < 0.5 ? 1 : -1;
              v.laneCoord = nearZ + (v.roadDir === 1 ? 3.8 : -3.8);
            } else {
              v.roadAxis = 'z';
              v.roadDir = Math.random() < 0.5 ? 1 : -1;
              v.laneCoord = nearX + (v.roadDir === 1 ? 3.8 : -3.8);
            }
          }

          // Pull slightly toward outer curb when a high-star police chase roars nearby
          const yieldOffset =
            v.mood === 'calm' && this.wantedStars >= 2 && distToPlayer < 26
              ? v.roadDir * 1.15
              : 0;

          let wx = v.roadAxis === 'z' ? v.laneCoord + yieldOffset : v.x + v.roadDir * 22;
          let wz = v.roadAxis === 'z' ? v.z + v.roadDir * 22 : v.laneCoord + yieldOffset;

          // Keep safe spacing from neighboring vehicles
          const sep = computeSeparationVector(v.id, v.x, v.z, vehicleSnapshots, 7.2);
          wx += sep.ox * 0.7;
          wz += sep.oz * 0.7;

          // Compute headway braking behind vehicles directly ahead in lane
          const others = vehicleSnapshots.filter((o) => o.id !== v.id);
          const brakeFactor = computeTrafficBrakeFactor(v.x, v.z, v.heading, v.length, others);

          let desiredSpd =
            v.mood === 'panicked'
              ? Math.min(27, v.targetSpeed * 1.45) * Math.max(0.35, brakeFactor)
              : v.targetSpeed * brakeFactor;

          // If calm vehicle is yielding to nearby sirens, ease off throttle
          if (yieldOffset !== 0) {
            desiredSpd *= 0.65;
          }

          // If blocked for > 2.4s (e.g., by a charred wreck ahead), steer around it cleanly
          if (brakeFactor < 0.15 && Math.hypot(v.vx, v.vz) < 1.2) {
            v.stuckTimer += dt;
            if (v.stuckTimer > 2.2) {
              wx += Math.cos(v.heading) * v.avoidSign * 6.5;
              wz -= Math.sin(v.heading) * v.avoidSign * 6.5;
              desiredSpd = 7.5;
              if (v.stuckTimer > 3.8) {
                v.stuckTimer = 0;
                v.avoidSign *= -1;
              }
            }
          } else {
            v.stuckTimer = Math.max(0, v.stuckTimer - dt * 2);
          }

          this.steerVehicleToward(v, wx, wz, desiredSpd, dt);
        }
      }

      // Smoke warning when heavily damaged
      if (v.hp < v.maxHp * 0.45 && Math.random() < dt * 6) {
        this.spawnSmokeParticle(v.x + Math.sin(v.heading) * 1.6, 1.2, v.z + Math.cos(v.heading) * 1.6);
      }
    }
  }

  /**
   * Multi-iteration rigid body collision solver for all vehicles + solid city blocks.
   * Ensures vehicles bounce, deflect, spark, and NEVER clip through each other or buildings.
   */
  private resolveAllCollisions(dt: number) {
    const count = this.vehicles.length;
    const iterations = 3;

    for (let iter = 0; iter < iterations; iter++) {
      // Vehicle-to-vehicle solid multi-disc collision pass
      for (let i = 0; i < count; i++) {
        const a = this.vehicles[i];
        for (let j = i + 1; j < count; j++) {
          const b = this.vehicles[j];
          const impact = resolveVehiclePairCollision(a, b);
          if (impact && iter === 0 && impact.closingSpeed > 5.0) {
            // Metallic crash sparks at true contact point
            this.spawnExplosionParticles(impact.contactX, 0.95, impact.contactZ, impact.closingSpeed > 12 ? 9 : 4, true);

            // Panic nearby civilians & pedestrians on loud crashes
            if (impact.closingSpeed > 9.5) {
              this.broadcastAlert(impact.contactX, impact.contactZ, 26);
            }

            // Apply realistic structural damage on heavy impacts
            if (impact.closingSpeed > 11.5) {
              const dmg = Math.min(34, (impact.closingSpeed - 10) * 2.1);
              if (!a.destroyed && !a.isPlayerControlled) this.damageVehicle(a, dmg);
              if (!b.destroyed && !b.isPlayerControlled) this.damageVehicle(b, dmg);
            }

            // Player feedback & wanted heat on hard rams
            if (a.isPlayerControlled || b.isPlayerControlled) {
              this.trauma = Math.min(1, this.trauma + Math.min(0.28, impact.closingSpeed * 0.012));
              const other = a.isPlayerControlled ? b : a;
              if (impact.closingSpeed > 8.5) {
                this.addWantedHeat(other.isPolice ? 8 : 5);
                if (!other.isPolice) {
                  other.mood = 'panicked';
                  other.panicTimer = 7.5;
                }
              }
            }
          }
        }
      }

      // Solid city-block / building boundary clamping
      for (let i = 0; i < count; i++) {
        const v = this.vehicles[i];
        const hitWall = resolveBuildingCollision(v);
        if (hitWall && iter === 0 && Math.hypot(v.vx, v.vz) > 9) {
          this.spawnExplosionParticles(v.x, 0.9, v.z, 3, true);
        }
      }
    }

    // Keep protagonist synced with post-collision vehicle position or push on-foot protagonist out of vehicles
    if (this.playerVehicle) {
      this.playerX = this.playerVehicle.x;
      this.playerZ = this.playerVehicle.z;
      this.playerHeading = this.playerVehicle.heading;
      this.playerSpeed = Math.hypot(this.playerVehicle.vx, this.playerVehicle.vz);
    } else if (this.aiAction !== 'hijacking') {
      this.resolvePlayerFootCollisions();
    }

    // Sync final post-collision transforms to Three.js vehicle rigs so no overlapping frame ever renders
    for (let i = 0; i < count; i++) {
      const v = this.vehicles[i];
      v.rig.group.position.set(v.x, 0.04, v.z);
      v.rig.group.rotation.y = v.heading;
      if (!v.destroyed) {
        const wheelSpin = v.speed * dt * 2.4;
        for (const w of v.rig.wheels) {
          w.rotation.x += wheelSpin;
        }
      }
    }
  }

  private resolvePlayerFootCollisions() {
    const playerRad = 0.65;
    for (const v of this.vehicles) {
      const discs = getVehicleCollisionDiscs(v);
      for (const d of discs) {
        const dx = this.playerX - d.x;
        const dz = this.playerZ - d.z;
        const minD = d.r + playerRad;
        const distSq = dx * dx + dz * dz;
        if (distSq < minD * minD) {
          const dist = Math.max(0.01, Math.sqrt(distSq));
          const push = minD - dist + 0.04;
          this.playerX += (dx / dist) * push;
          this.playerZ += (dz / dist) * push;
        }
      }
    }
    this.protagonistRig.group.position.set(this.playerX, 0.04, this.playerZ);
  }

  private broadcastAlert(ax: number, az: number, radius: number) {
    const rSq = radius * radius;
    for (const v of this.vehicles) {
      if (v.isPolice || v.isPlayerControlled || v.destroyed) continue;
      const dx = v.x - ax;
      const dz = v.z - az;
      if (dx * dx + dz * dz <= rSq) {
        v.mood = 'panicked';
        v.panicTimer = 7.5;
      }
    }
    for (const ped of this.pedestrians) {
      if (!ped.alive) continue;
      const dx = ped.x - ax;
      const dz = ped.z - az;
      if (dx * dx + dz * dz <= rSq) {
        ped.state = 'fleeing';
        ped.panicTimer = 8.0;
        ped.threatX = ax;
        ped.threatZ = az;
      }
    }
  }

  private updateOfficers(dt: number) {
    const aliveList = this.officers.filter((o) => o.alive);
    const totalAlive = Math.max(1, aliveList.length);

    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      if (!o.alive) {
        o.koTimer -= dt;
        o.rig.group.rotation.x = THREE.MathUtils.damp(o.rig.group.rotation.x, -Math.PI * 0.48, 9, dt);
        if (o.koTimer <= 0) {
          this.scene.remove(o.rig.group);
          this.officers.splice(i, 1);
        }
        continue;
      }

      const dx = this.playerX - o.x;
      const dz = this.playerZ - o.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 110 || this.wantedStars === 0) {
        this.scene.remove(o.rig.group);
        this.officers.splice(i, 1);
        continue;
      }

      // Spread officers into distinct flanking angles around the suspect
      const aliveIdx = aliveList.indexOf(o);
      const targetAngle = (aliveIdx / totalAlive) * Math.PI * 2 + o.flankAngle * 0.25;
      const desiredRange = 16.5;
      const slotX = this.playerX + Math.sin(targetAngle) * desiredRange;
      const slotZ = this.playerZ + Math.cos(targetAngle) * desiredRange;

      // Separation force from fellow foot officers so they NEVER stack into one point
      let sepX = 0;
      let sepZ = 0;
      for (const other of aliveList) {
        if (other === o) continue;
        const odx = o.x - other.x;
        const odz = o.z - other.z;
        const od = Math.hypot(odx, odz);
        if (od > 0.01 && od < 4.2) {
          const push = ((4.2 - od) / 4.2) * 5.2;
          sepX += (odx / od) * push;
          sepZ += (odz / od) * push;
        }
      }

      // State transitions: advancing -> flanking -> suppressing
      let moveX = 0;
      let moveZ = 0;
      if (dist > 22) {
        o.state = 'advancing';
        const sx = slotX - o.x;
        const sz = slotZ - o.z;
        const sd = Math.max(0.1, Math.hypot(sx, sz));
        moveX = (sx / sd) * 5.6 + sepX;
        moveZ = (sz / sd) * 5.6 + sepZ;
      } else if (dist < 11) {
        // Backpedal to maintain tactical firing distance instead of walking into the suspect
        o.state = 'flanking';
        const invD = 1 / Math.max(0.1, dist);
        moveX = -dx * invD * 3.8 + (-dz * invD) * o.strafeSign * 2.6 + sepX;
        moveZ = -dz * invD * 3.8 + (dx * invD) * o.strafeSign * 2.6 + sepZ;
      } else {
        // Alternate between tactical lateral strafing and steady suppressing fire
        const cycle = Math.sin(this.elapsedTime * 0.85 + o.id);
        if (cycle > 0.15) {
          o.state = 'flanking';
          const invD = 1 / Math.max(0.1, dist);
          moveX = (-dz * invD) * o.strafeSign * 3.2 + sepX;
          moveZ = (dx * invD) * o.strafeSign * 3.2 + sepZ;
        } else {
          o.state = 'suppressing';
          moveX = sepX * 0.6;
          moveZ = sepZ * 0.6;
        }
      }

      const moveSpeed = Math.hypot(moveX, moveZ);
      if (moveSpeed > 0.15) {
        const clamped = Math.min(6.0, moveSpeed);
        o.x += (moveX / moveSpeed) * clamped * dt;
        o.z += (moveZ / moveSpeed) * clamped * dt;
      }

      // Push officer cleanly outside vehicle hulls; knock down if struck by a speeding vehicle!
      for (const v of this.vehicles) {
        const discs = getVehicleCollisionDiscs(v);
        const vSpeed = Math.hypot(v.vx, v.vz);
        for (const d of discs) {
          const vdx = o.x - d.x;
          const vdz = o.z - d.z;
          const minD = d.r + 0.65;
          const dSq = vdx * vdx + vdz * vdz;
          if (dSq < minD * minD) {
            const vd = Math.max(0.01, Math.sqrt(dSq));
            if (vSpeed > 9.5) {
              o.alive = false;
              o.koTimer = 3.2;
              this.spawnExplosionParticles(o.x, 1.1, o.z, 5, true);
              if (v.isPlayerControlled) {
                this.addWantedHeat(14);
              }
              break;
            }
            const push = minD - vd + 0.06;
            o.x += (vdx / vd) * push;
            o.z += (vdz / vd) * push;
          }
        }
        if (!o.alive) break;
      }
      if (!o.alive) continue;

      o.heading = Math.atan2(this.playerX - o.x, this.playerZ - o.z);
      if (moveSpeed > 0.6) {
        const swing = Math.sin(this.elapsedTime * 9.5 + o.id) * 0.65;
        o.rig.leftLeg.rotation.x = swing;
        o.rig.rightLeg.rotation.x = -swing;
      } else {
        o.rig.leftLeg.rotation.x = THREE.MathUtils.damp(o.rig.leftLeg.rotation.x, 0, 10, dt);
        o.rig.rightLeg.rotation.x = THREE.MathUtils.damp(o.rig.rightLeg.rotation.x, 0, 10, dt);
      }
      o.rig.leftArm.rotation.x = -0.35;
      o.rig.rightArm.rotation.x = -1.45;
      o.rig.group.position.set(o.x, 0.04, o.z);
      o.rig.group.rotation.y = o.heading;

      // Controlled 2-3 round tactical bursts
      o.fireCooldown -= dt;
      if (o.burstTimer > 0) o.burstTimer -= dt;
      if (dist < 40 && o.fireCooldown <= 0 && o.burstTimer <= 0 && this.aiAction !== 'wasted') {
        this.fireProjectile(o.x, 1.4, o.z, this.playerX, 1.2, this.playerZ, false, false, 5, 0x93c5fd);
        this.spawnMuzzleFlash(o.x + Math.sin(o.heading) * 0.6, 1.4, o.z + Math.cos(o.heading) * 0.6);
        o.burstRemaining--;
        if (o.burstRemaining > 0) {
          o.burstTimer = 0.22;
        } else {
          o.burstRemaining = 2 + (o.id % 2);
          o.fireCooldown = 1.15 + Math.random() * 0.65;
        }
      }
    }
  }

  private maintainPedestrians() {
    const desiredPeds = Math.round(10 + this.settings.trafficDensity * 8);
    let aliveCount = 0;
    for (const p of this.pedestrians) {
      if (p.alive) aliveCount++;
    }
    if (aliveCount < desiredPeds) {
      this.spawnPedestrianNearPlayer(false);
    }
  }

  private spawnPedestrianNearPlayer(initialSeed: boolean) {
    const id = this.nextEntityId++;
    const axis: 'x' | 'z' = Math.random() < 0.5 ? 'z' : 'x';
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const sidewalkSide: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const baseRoadX = nearestRoadAxisPosition(this.playerX) + (initialSeed ? 0 : (Math.floor(Math.random() * 3) - 1) * CHUNK_SIZE);
    const baseRoadZ = nearestRoadAxisPosition(this.playerZ) + (initialSeed ? 0 : (Math.floor(Math.random() * 3) - 1) * CHUNK_SIZE);

    const spread = initialSeed ? (Math.random() - 0.5) * 65 : (Math.random() < 0.5 ? 1 : -1) * (32 + Math.random() * 34);
    let px = 0;
    let pz = 0;
    let sidewalkCoord = 0;
    let heading = 0;

    if (axis === 'z') {
      sidewalkCoord = baseRoadX + sidewalkSide * 9.5;
      px = sidewalkCoord + (Math.random() - 0.5) * 1.1;
      pz = this.playerZ + spread;
      heading = dir === 1 ? 0 : Math.PI;
    } else {
      sidewalkCoord = baseRoadZ + sidewalkSide * 9.5;
      pz = sidewalkCoord + (Math.random() - 0.5) * 1.1;
      px = this.playerX + spread;
      heading = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    }

    const rig = buildHumanoidModel('civilian', this.textures, id * 13);
    rig.group.position.set(px, 0.04, pz);
    rig.group.rotation.y = heading;
    this.scene.add(rig.group);

    this.pedestrians.push({
      id,
      rig,
      x: px,
      z: pz,
      heading,
      speed: 1.7 + Math.random() * 0.9,
      roadAxis: axis,
      roadDir: dir,
      sidewalkCoord,
      state: 'strolling',
      panicTimer: 0,
      threatX: 0,
      threatZ: 0,
      walkPhase: Math.random() * Math.PI * 2,
      koTimer: 0,
      alive: true,
    });
  }

  private updatePedestrians(dt: number) {
    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      const ped = this.pedestrians[i];
      if (!ped.alive) {
        ped.koTimer -= dt;
        ped.rig.group.rotation.x = THREE.MathUtils.damp(ped.rig.group.rotation.x, -Math.PI * 0.48, 9, dt);
        if (ped.koTimer <= 0) {
          this.scene.remove(ped.rig.group);
          this.pedestrians.splice(i, 1);
        }
        continue;
      }

      const distToPlayer = Math.hypot(ped.x - this.playerX, ped.z - this.playerZ);
      if (distToPlayer > 110) {
        this.scene.remove(ped.rig.group);
        this.pedestrians.splice(i, 1);
        continue;
      }

      if (ped.state === 'fleeing') {
        ped.panicTimer -= dt;
        if (ped.panicTimer <= 0) {
          ped.state = 'strolling';
        }
      }

      let moveSpeed = ped.speed;
      if (ped.state === 'fleeing') {
        // Sprint away from gunfire/explosion/crash with raised arms!
        const fdx = ped.x - ped.threatX;
        const fdz = ped.z - ped.threatZ;
        const fleeHeading = Math.atan2(fdx, fdz);
        ped.heading += shortestAngleDelta(ped.heading, fleeHeading) * Math.min(1, dt * 10);
        moveSpeed = 6.4;
      } else {
        // Calm sidewalk stroll along procedural city sidewalks
        const nearX = nearestRoadAxisPosition(ped.x);
        const nearZ = nearestRoadAxisPosition(ped.z);
        const nearCorner = Math.abs(Math.abs(ped.x - nearX) - 9.5) < 1.2 && Math.abs(Math.abs(ped.z - nearZ) - 9.5) < 1.2;
        if (nearCorner && Math.random() < dt * 0.55) {
          if (ped.roadAxis === 'z') {
            ped.roadAxis = 'x';
            ped.roadDir = Math.random() < 0.5 ? 1 : -1;
            ped.sidewalkCoord = nearZ + (ped.z >= nearZ ? 9.5 : -9.5);
          } else {
            ped.roadAxis = 'z';
            ped.roadDir = Math.random() < 0.5 ? 1 : -1;
            ped.sidewalkCoord = nearX + (ped.x >= nearX ? 9.5 : -9.5);
          }
        }
        const tx = ped.roadAxis === 'z' ? ped.sidewalkCoord : ped.x + ped.roadDir * 8;
        const tz = ped.roadAxis === 'z' ? ped.z + ped.roadDir * 8 : ped.sidewalkCoord;
        const targetH = Math.atan2(tx - ped.x, tz - ped.z);
        ped.heading += shortestAngleDelta(ped.heading, targetH) * Math.min(1, dt * 6);
      }

      ped.x += Math.sin(ped.heading) * moveSpeed * dt;
      ped.z += Math.cos(ped.heading) * moveSpeed * dt;

      // Keep pedestrians outside solid interior city buildings
      const localX = ((ped.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localZ = ((ped.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const bMin = 11.2;
      const bMax = CHUNK_SIZE - 11.2;
      if (localX > bMin && localX < bMax && localZ > bMin && localZ < bMax) {
        const dL = localX - bMin;
        const dR = bMax - localX;
        const dB = localZ - bMin;
        const dT = bMax - localZ;
        const m = Math.min(dL, dR, dB, dT);
        if (m === dL) ped.x -= dL + 0.1;
        else if (m === dR) ped.x += dR + 0.1;
        else if (m === dB) ped.z -= dB + 0.1;
        else ped.z += dT + 0.1;
      }

      // Dodge or get knocked down by nearby vehicles
      for (const v of this.vehicles) {
        const roughDistSq = (ped.x - v.x) ** 2 + (ped.z - v.z) ** 2;
        if (roughDistSq > 80) continue;
        const vSpeed = Math.hypot(v.vx, v.vz);
        if (roughDistSq < 36 && vSpeed > 12 && ped.state !== 'fleeing') {
          ped.state = 'fleeing';
          ped.panicTimer = 5.0;
          ped.threatX = v.x;
          ped.threatZ = v.z;
        }
        const discs = getVehicleCollisionDiscs(v);
        for (const d of discs) {
          const vdx = ped.x - d.x;
          const vdz = ped.z - d.z;
          const minD = d.r + 0.55;
          const dSq = vdx * vdx + vdz * vdz;
          if (dSq < minD * minD) {
            const vd = Math.max(0.01, Math.sqrt(dSq));
            if (vSpeed > 8.5) {
              ped.alive = false;
              ped.koTimer = 3.5;
              if (v.isPlayerControlled) {
                this.addWantedHeat(10);
                this.broadcastAlert(ped.x, ped.z, 26);
              }
              break;
            }
            const push = minD - vd + 0.08;
            ped.x += (vdx / vd) * push;
            ped.z += (vdz / vd) * push;
          }
        }
        if (!ped.alive) break;
      }
      if (!ped.alive) continue;

      // Procedural walk / panicked sprint animation
      ped.walkPhase += dt * moveSpeed * 2.1;
      const swing = Math.sin(ped.walkPhase) * (ped.state === 'fleeing' ? 0.85 : 0.5);
      ped.rig.leftLeg.rotation.x = swing;
      ped.rig.rightLeg.rotation.x = -swing;
      if (ped.state === 'fleeing') {
        ped.rig.leftArm.rotation.x = -2.65 + swing * 0.25;
        ped.rig.rightArm.rotation.x = -2.65 - swing * 0.25;
      } else {
        ped.rig.leftArm.rotation.x = -swing * 0.65;
        ped.rig.rightArm.rotation.x = swing * 0.65;
      }
      ped.rig.group.position.set(ped.x, 0.04, ped.z);
      ped.rig.group.rotation.y = ped.heading;
    }
  }

  private updateChopper(dt: number) {
    if (!this.chopperActive) return;
    this.chopperAngle += dt * 0.55;
    const radius = 26;
    const cx = this.playerX + Math.cos(this.chopperAngle) * radius;
    const cz = this.playerZ + Math.sin(this.chopperAngle) * radius;
    const cy = 22 + Math.sin(this.elapsedTime * 1.4) * 1.4;

    this.chopperRig.group.position.set(cx, cy, cz);
    this.chopperRig.group.lookAt(this.playerX, 1.2, this.playerZ);
    this.chopperRig.mainRotor.rotation.y += dt * 26;
    this.chopperRig.tailRotor.rotation.x += dt * 32;

    this.chopperFireTimer -= dt;
    if (this.chopperFireTimer <= 0 && this.aiAction !== 'wasted') {
      this.chopperFireTimer = 0.42;
      this.fireProjectile(
        cx,
        cy - 1.5,
        cz,
        this.playerX + (Math.random() - 0.5) * 4,
        1.0,
        this.playerZ + (Math.random() - 0.5) * 4,
        false,
        false,
        4,
        0xfef08a,
      );
    }
  }

  private tryFireAtPoint(tx: number, ty: number, tz: number, fromPlayer: boolean) {
    if (this.fireCooldown > 0) return;
    const spec = WEAPON_SPECS[this.playerWeapon];
    this.fireCooldown = 1 / spec.fireRate;
    if (this.playerAmmo > 0) this.playerAmmo--;
    if (this.playerAmmo <= 0) {
      this.equipWeapon(WEAPON_ORDER[(WEAPON_ORDER.indexOf(this.playerWeapon) + 1) % WEAPON_ORDER.length]);
    }

    const ox = this.playerX + Math.sin(this.playerHeading) * 0.8;
    const oy = this.playerVehicle ? 1.55 : 1.45;
    const oz = this.playerZ + Math.cos(this.playerHeading) * 0.8;

    for (let p = 0; p < spec.pellets; p++) {
      const spreadX = (Math.random() - 0.5) * spec.spread * 22;
      const spreadZ = (Math.random() - 0.5) * spec.spread * 22;
      this.fireProjectile(
        ox,
        oy,
        oz,
        tx + spreadX,
        ty,
        tz + spreadZ,
        fromPlayer,
        spec.explosive,
        spec.damage,
        spec.tracerColor,
      );
    }

    // Muzzle flash sparks & alert nearby civilian traffic/pedestrians to gunfire
    this.spawnMuzzleFlash(ox, oy, oz);
    this.audio.playGunshot(this.playerWeapon, 1.0);
    this.broadcastAlert(ox, oz, 34);
    if (spec.explosive) {
      this.trauma = Math.min(1, this.trauma + 0.25);
    }
  }

  private fireProjectile(
    ox: number,
    oy: number,
    oz: number,
    tx: number,
    ty: number,
    tz: number,
    fromPlayer: boolean,
    explosive: boolean,
    damage: number,
    colorHex: number,
  ) {
    const slot = this.projectiles.find((p) => !p.active);
    if (!slot) return;
    const dx = tx - ox;
    const dy = ty - oy;
    const dz = tz - oz;
    const len = Math.max(0.1, Math.hypot(dx, dy, dz));
    const speed = explosive ? 48 : 88;

    slot.active = true;
    slot.fromPlayer = fromPlayer;
    slot.explosive = explosive;
    slot.x = ox;
    slot.y = oy;
    slot.z = oz;
    slot.vx = (dx / len) * speed;
    slot.vy = (dy / len) * speed;
    slot.vz = (dz / len) * speed;
    slot.life = explosive ? 2.2 : 1.1;
    slot.damage = damage;

    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(colorHex);
    slot.mesh.scale.set(explosive ? 2.2 : 1, explosive ? 2.2 : 1, explosive ? 1.8 : 1.4);
    slot.mesh.position.set(ox, oy, oz);
    slot.mesh.lookAt(tx, ty, tz);
    slot.mesh.visible = true;
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.mesh.position.set(p.x, p.y, p.z);

      if (p.explosive && Math.random() < 0.75) {
        this.spawnSmokeParticle(p.x, p.y, p.z);
      }

      let hit = p.y <= 0.1 || p.life <= 0;

      if (!hit && p.fromPlayer) {
        // Check vehicles
        for (const v of this.vehicles) {
          if (v.isPlayerControlled || v.destroyed) continue;
          const r = v.kind === 'bus' || v.kind === 'tanker' ? 4.2 : 2.3;
          if (Math.hypot(v.x - p.x, v.z - p.z) < r && Math.abs(1.4 - p.y) < 2.2) {
            hit = true;
            this.damageVehicle(v, p.damage);
            break;
          }
        }
        // Check police foot officers
        if (!hit) {
          for (const o of this.officers) {
            if (!o.alive) continue;
            if (Math.hypot(o.x - p.x, o.z - p.z) < 1.3) {
              hit = true;
              o.hp -= p.damage;
              this.spawnExplosionParticles(o.x, 1.3, o.z, 5, true);
              if (o.hp <= 0) {
                o.alive = false;
                o.koTimer = 2.6;
                this.addWantedHeat(15);
              }
              break;
            }
          }
        }
      } else if (!hit && !p.fromPlayer && this.aiAction !== 'wasted') {
        const hitRad = this.playerVehicle ? 2.5 : 1.1;
        if (Math.hypot(this.playerX - p.x, this.playerZ - p.z) < hitRad) {
          hit = true;
          this.applyPlayerDamage(p.damage);
        }
      }

      if (hit) {
        if (p.explosive) {
          this.triggerExplosion(p.x, Math.max(0.5, p.y), p.z, 15, 190);
        } else {
          this.spawnExplosionParticles(p.x, Math.max(0.3, p.y), p.z, 4, true);
        }
        p.active = false;
        p.mesh.visible = false;
      }
    }
  }

  private applyPlayerDamage(amount: number) {
    if (this.playerArmor > 0) {
      const absorbed = Math.min(this.playerArmor, amount * 0.7);
      this.playerArmor -= absorbed;
      this.playerHealth -= amount - absorbed;
    } else {
      this.playerHealth -= amount;
    }
    this.trauma = Math.min(1, this.trauma + 0.14);
    if (this.playerHealth <= 0) {
      this.playerHealth = 0;
      if (this.playerVehicle) this.exitCurrentVehicle();
      this.aiAction = 'wasted';
      this.wastedTimer = 3.0;
      this.showBanner('ПОТРАЧЕНО', 'Возрождение у ближайшего квартала...', 'wasted', 3.0);
    }
  }

  private damageVehicle(v: SimVehicle, amount: number) {
    v.hp -= amount;
    this.addWantedHeat(v.isPolice ? 12 : 8);
    if (v.hp <= 0 && !v.destroyed) {
      this.detonateVehicle(v, false);
    }
  }

  private detonateVehicle(v: SimVehicle, forced: boolean) {
    if (v.destroyed) return;
    v.destroyed = true;
    v.destroyTimer = 14;
    v.speed = 0;
    v.vx *= 0.25;
    v.vz *= 0.25;
    v.rig.driverGroup.visible = false;

    // Char the vehicle body dark smoky matte
    for (const m of v.rig.bodyMeshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat && mat.color) {
        mat.color.setHex(0x1f1d1d);
        mat.roughness = 0.95;
        mat.metalness = 0.15;
      }
    }

    const isHuge = v.kind === 'tanker' || v.kind === 'bus';
    const radius = v.kind === 'tanker' ? 24 : v.kind === 'bus' ? 18 : 13;
    const dmg = v.kind === 'tanker' ? 260 : 165;
    this.triggerExplosion(v.x, 1.5, v.z, radius, dmg);

    if (v.kind === 'tanker') {
      this.showBanner('ВЗРЫВ БЕНЗОВОЗА!', 'Колоссальная детонация топлива', 'explosion', 3.0);
      this.addWantedHeat(32);
    } else if (v.kind === 'bus') {
      this.showBanner('АВТОБУС УНИЧТОЖЕН', 'Цепная детонация на проспекте', 'explosion', 2.6);
      this.addWantedHeat(24);
    } else if (forced) {
      this.showBanner('ДЕТОНАЦИЯ ТЕХНИКИ', 'Автомобиль взлетел на воздух', 'explosion', 2.2);
    } else {
      this.addWantedHeat(16);
    }

    if (isHuge) {
      this.hitstopTimer = 0.045;
    }
  }

  private triggerExplosion(x: number, y: number, z: number, radius: number, maxDamage: number) {
    this.explosionsCount += 1;
    this.audio.playExplosion(radius / 14);
    this.trauma = Math.min(1, this.trauma + (radius > 16 ? 0.85 : 0.52));

    // Subtle localized dynamic point light flash
    this.explosionFlashLight.position.set(x, y + 3.0, z);
    this.flashLightIntensity = radius > 16 ? 34 : 20;

    // Fireball + black smoke + sparks
    this.spawnExplosionParticles(x, y, z, radius > 16 ? 48 : 28, false);

    // Expanding shockwave ring
    const ring = this.shockwaves.find((r) => !r.active);
    if (ring) {
      ring.active = true;
      ring.age = 0;
      ring.maxAge = radius > 16 ? 0.65 : 0.45;
      ring.maxRadius = radius * 0.9;
      ring.mesh.position.set(x, 0.28, z);
      ring.mesh.scale.setScalar(0.5);
      ring.mesh.visible = true;
    }

    this.broadcastAlert(x, z, Math.max(44, radius * 2.4));

    // Chain-reaction splash damage to nearby vehicles, officers & pedestrians
    for (const other of this.vehicles) {
      if (other.destroyed || other.isPlayerControlled) continue;
      const d = Math.hypot(other.x - x, other.z - z);
      const splash = calculateExplosionDamage(d, radius, maxDamage);
      if (splash > 0) {
        other.hp -= splash;
        // Blast shockwave impulse pushes nearby vehicles outward realistically
        if (d > 0.1) {
          const push = (splash / maxDamage) * 14;
          other.vx += ((other.x - x) / d) * push;
          other.vz += ((other.z - z) / d) * push;
        }
        if (other.hp <= 0) {
          this.detonateVehicle(other, false);
        }
      }
    }
    for (const o of this.officers) {
      if (!o.alive) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      const splash = calculateExplosionDamage(d, radius, maxDamage);
      if (splash > 0) {
        o.hp -= splash;
        if (o.hp <= 0) {
          o.alive = false;
          o.koTimer = 2.5;
        }
      }
    }
    for (const ped of this.pedestrians) {
      if (!ped.alive) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius * 0.72) {
        ped.alive = false;
        ped.koTimer = 3.2;
      }
    }
  }

  private spawnMuzzleFlash(x: number, y: number, z: number) {
    for (let i = 0; i < 4; i++) {
      this.allocParticle(
        x,
        y,
        z,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 4,
        0.12,
        0.28,
        -1.5,
        0,
        1.0,
        0.85,
        0.3,
      );
    }
  }

  private spawnCashBurst(x: number, y: number, z: number, count: number) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2.5 + Math.random() * 4.5;
      this.allocParticle(
        x,
        y,
        z,
        Math.cos(ang) * spd,
        5 + Math.random() * 4,
        Math.sin(ang) * spd,
        1.4,
        0.32,
        0,
        -6.5,
        0.16,
        0.86,
        0.42,
      );
    }
  }

  private spawnSmokeParticle(x: number, y: number, z: number) {
    this.allocParticle(
      x,
      y,
      z,
      (Math.random() - 0.5) * 1.4,
      2.6 + Math.random() * 2.2,
      (Math.random() - 0.5) * 1.4,
      1.35,
      0.55,
      1.6,
      0.6,
      0.16,
      0.16,
      0.18,
    );
  }

  private spawnExplosionParticles(x: number, y: number, z: number, count: number, sparksOnly: boolean) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const elev = Math.random() * Math.PI * 0.48;
      const spd = sparksOnly ? 5 + Math.random() * 10 : 4 + Math.random() * 18;
      const isSmoke = !sparksOnly && i > count * 0.55;
      this.allocParticle(
        x + (Math.random() - 0.5) * 1.4,
        y + Math.random() * 1.2,
        z + (Math.random() - 0.5) * 1.4,
        Math.cos(ang) * Math.cos(elev) * spd,
        Math.sin(elev) * spd + (isSmoke ? 4 : 2),
        Math.sin(ang) * Math.cos(elev) * spd,
        isSmoke ? 1.5 + Math.random() * 0.8 : 0.45 + Math.random() * 0.45,
        isSmoke ? 1.2 : sparksOnly ? 0.22 : 1.05,
        isSmoke ? 2.2 : 1.4,
        isSmoke ? 1.2 : -14,
        isSmoke ? 0.14 : 1.0,
        isSmoke ? 0.14 : 0.35 + Math.random() * 0.55,
        isSmoke ? 0.16 : 0.08,
      );
    }
  }

  private allocParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    maxAge: number,
    size: number,
    grow: number,
    gravity: number,
    r: number,
    g: number,
    b: number,
  ) {
    const slot = this.particles.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.age = 0;
    slot.maxAge = maxAge;
    slot.size = size;
    slot.grow = grow;
    slot.gravity = gravity;
    slot.r = r;
    slot.g = g;
    slot.b = b;
  }

  private updateParticles(dt: number) {
    let dirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirty = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.particleInstanced.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.15, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const t = p.age / p.maxAge;
      const scale = Math.max(0.05, (p.size + p.grow * t) * (1 - t * 0.65));

      _dummy.position.set(p.x, p.y, p.z);
      _dummy.scale.setScalar(scale);
      _dummy.rotation.set(p.age * 2, p.age * 3, 0);
      _dummy.updateMatrix();
      this.particleInstanced.setMatrixAt(i, _dummy.matrix);
      _color.setRGB(p.r * (1 - t * 0.4), p.g * (1 - t * 0.65), p.b);
      this.particleInstanced.setColorAt(i, _color);
    }
    if (dirty) {
      this.particleInstanced.instanceMatrix.needsUpdate = true;
      if (this.particleInstanced.instanceColor) {
        this.particleInstanced.instanceColor.needsUpdate = true;
      }
    }
  }

  private updateShockwaves(dt: number) {
    for (const s of this.shockwaves) {
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= s.maxAge) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      const t = s.age / s.maxAge;
      s.mesh.scale.setScalar(0.6 + t * s.maxRadius);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
    }

    if (this.flashLightIntensity > 0) {
      this.flashLightIntensity = Math.max(0, this.flashLightIntensity - dt * 360);
      this.explosionFlashLight.intensity = this.flashLightIntensity;
    }
  }

  private updateRain(dt: number) {
    const isRain = this.settings.weather === 'rain';
    this.rainLines.visible = isRain;
    this.chunks.setRainWetness(isRain ? 1 : 0);
    if (!isRain) return;

    this.rainLines.position.set(this.playerX, 0, this.playerZ);
    const arr = this.rainPositions;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const idx = i * 6;
      arr[idx + 1] -= 34 * dt;
      arr[idx + 4] -= 34 * dt;
      if (arr[idx + 1] < 0) {
        const ny = 24 + Math.random() * 8;
        arr[idx + 1] = ny;
        arr[idx + 4] = ny - 1.45;
      }
    }
    this.rainLines.geometry.attributes.position.needsUpdate = true;
  }

  private updateAtmosphereLighting(dt: number) {
    const hour = this.settings.timeOfDay;
    // Compute smooth sun elevation angle & night factor
    const dayAngle = ((hour - 6) / 12) * Math.PI;
    const sunY = Math.sin(dayAngle);
    const sunXZ = Math.cos(dayAngle);
    const nightFactor = THREE.MathUtils.clamp(1 - (sunY + 0.12) / 0.55, 0, 1);
    const sunsetFactor = THREE.MathUtils.clamp(1 - Math.abs(sunY - 0.14) / 0.34, 0, 1);

    // Sky palette: Golden/Coral Vice Sunset vs Crisp Tropical Noon vs Deep Neon Night
    if (nightFactor > 0.65) {
      _skyTop.setHex(0x070d1e);
      _skyHorizon.setHex(0x1f2848);
      _skyBottom.setHex(0x0b0f1c);
      _sunColor.setHex(0x88b8ff);
      _hemiSky.setHex(0x4b6ba8);
      _hemiGround.setHex(0x1b1a29);
    } else if (sunsetFactor > 0.35) {
      _skyTop.setHex(0x1f366e);
      _skyHorizon.setHex(0xf59d78);
      _skyBottom.setHex(0x3a2c3d);
      _sunColor.setHex(0xffd28a);
      _hemiSky.setHex(0xffc39c);
      _hemiGround.setHex(0x3a2d3d);
    } else {
      _skyTop.setHex(0x1d6ec9);
      _skyHorizon.setHex(0xa8dafc);
      _skyBottom.setHex(0x4c6072);
      _sunColor.setHex(0xfff4d6);
      _hemiSky.setHex(0xbbe1ff);
      _hemiGround.setHex(0x4f4a40);
    }

    if (this.settings.weather === 'rain') {
      _skyTop.lerp(_color.setHex(0x253041), 0.55);
      _skyHorizon.lerp(_color.setHex(0x526173), 0.55);
    } else if (this.settings.weather === 'fog') {
      _skyHorizon.lerp(_color.setHex(0xc8d2dc), 0.6);
    }

    this.skyDomeMat.uniforms.uTopColor.value.copy(_skyTop);
    this.skyDomeMat.uniforms.uHorizonColor.value.copy(_skyHorizon);
    this.skyDomeMat.uniforms.uBottomColor.value.copy(_skyBottom);
    this.skyDomeMat.uniforms.uSunColor.value.copy(_sunColor);
    this.skyDomeMat.uniforms.uSunDir.value
      .set(sunXZ * 0.75, Math.max(0.08, Math.abs(sunY)), 0.62)
      .normalize();

    this.skyDome.position.set(this.playerX, 0, this.playerZ);

    // Horizon-matched FogExp2
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(_skyHorizon);
    const targetFogDensity =
      this.settings.weather === 'fog' ? 0.0135 : this.settings.weather === 'rain' ? 0.0085 : 0.0046;
    fog.density = THREE.MathUtils.damp(fog.density, targetFogDensity, 4, dt || 0.016);

    // Move directional shadow light tightly around protagonist
    const sunDir = this.skyDomeMat.uniforms.uSunDir.value as THREE.Vector3;
    this.sunLight.position.set(
      this.playerX + sunDir.x * 72,
      Math.max(18, sunDir.y * 85),
      this.playerZ + sunDir.z * 72,
    );
    this.sunLight.target.position.set(this.playerX, 0, this.playerZ);
    this.sunLight.color.copy(_sunColor);
    this.sunLight.intensity = nightFactor > 0.65 ? 0.55 : sunsetFactor > 0.35 ? 1.38 : 1.5;

    this.hemiLight.color.copy(_hemiSky);
    this.hemiLight.groundColor.copy(_hemiGround);
    this.hemiLight.intensity = nightFactor > 0.65 ? 0.38 : 0.48;

    this.chunks.updateAtmosphere(nightFactor, this.elapsedTime);
  }

  private updateCamera(dt: number) {
    // Title screen uses a sweeping high-production Vice City flyover around the live protagonist
    if (this.lifecycle === 'title') {
      const orbitA = this.elapsedTime * 0.24;
      _vec3A.set(
        this.playerX + Math.sin(orbitA) * 24,
        10.5 + Math.sin(this.elapsedTime * 0.5) * 2.5,
        this.playerZ + Math.cos(orbitA) * 24,
      );
      _vec3B.set(this.playerX, 3.2, this.playerZ + 6);
      const alpha = 1 - Math.exp(-3.2 * dt);
      this.camPos.lerp(_vec3A, alpha);
      this.camTarget.lerp(_vec3B, alpha);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camTarget);
      const targetFov = computeAdaptiveFov(56, this.camera.aspect, 0.2, 'drone');
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5, dt);
      this.camera.updateProjectionMatrix();
      return;
    }

    // Auto Director cycles dynamically between dramatic camera angles every ~8 seconds
    let activeMode: Exclude<CameraMode, 'auto'> =
      this.settings.cameraMode === 'auto' ? this.autoSubMode : this.settings.cameraMode;
    if (this.settings.cameraMode === 'auto') {
      this.autoDirectorTimer += dt;
      if (this.autoDirectorTimer > 8.5) {
        this.autoDirectorTimer = 0;
        const pool: Exclude<CameraMode, 'auto'>[] = ['chase', 'drone', 'heli', 'chase', 'hood'];
        this.autoSubMode = pool[(pool.indexOf(this.autoSubMode) + 1) % pool.length];
      }
      activeMode = this.autoSubMode;
    }

    const sinH = Math.sin(this.playerHeading);
    const cosH = Math.cos(this.playerHeading);
    const isInCar = !!this.playerVehicle;

    if (activeMode === 'chase') {
      const distBack = isInCar ? 8.6 : 6.0;
      const heightUp = isInCar ? 3.2 : 2.9;
      _vec3A.set(this.playerX - sinH * distBack, heightUp, this.playerZ - cosH * distBack);
      _vec3B.set(this.playerX + sinH * 6, 1.45, this.playerZ + cosH * 6);
    } else if (activeMode === 'heli') {
      const sway = Math.sin(this.elapsedTime * 0.45) * 8;
      _vec3A.set(this.playerX - sinH * 22 + sway, 26, this.playerZ - cosH * 22 + 10);
      _vec3B.set(this.playerX + sinH * 5, 1.5, this.playerZ + cosH * 5);
    } else if (activeMode === 'hood') {
      const fwd = isInCar ? 1.4 : 0.45;
      const h = isInCar ? 1.52 : 1.72;
      _vec3A.set(this.playerX + sinH * fwd, h, this.playerZ + cosH * fwd);
      _vec3B.set(this.playerX + sinH * 26, h - 0.1, this.playerZ + cosH * 26);
    } else {
      // Low-angle cinematic drone orbit right around window height to showcase cabin interiors & drivers
      const orb = this.elapsedTime * 0.65;
      const r = isInCar ? 7.2 : 6.2;
      _vec3A.set(this.playerX + Math.sin(orb) * r, 2.15 + Math.sin(orb * 1.5) * 0.45, this.playerZ + Math.cos(orb) * r);
      _vec3B.set(this.playerX, 1.25, this.playerZ);
    }

    const posDamp = activeMode === 'hood' ? 22 : 5.5;
    const tgtDamp = activeMode === 'hood' ? 24 : 8.0;
    this.camPos.lerp(_vec3A, 1 - Math.exp(-posDamp * dt));
    this.camTarget.lerp(_vec3B, 1 - Math.exp(-tgtDamp * dt));

    // Apply decaying trauma*trauma explosion/gunfire camera shake
    this.trauma = Math.max(0, this.trauma - dt * 1.65);
    const shake = this.trauma * this.trauma;
    _vec3C.set(
      (Math.sin(this.elapsedTime * 57) * 0.65) * shake,
      (Math.cos(this.elapsedTime * 63) * 0.55) * shake,
      (Math.sin(this.elapsedTime * 49) * 0.45) * shake,
    );

    this.camera.position.copy(this.camPos).add(_vec3C);
    this.camera.lookAt(this.camTarget);

    // Adaptive portrait / landscape FOV with speed boost
    const speedRatio = Math.min(1, this.playerSpeed / 34);
    const targetFov = computeAdaptiveFov(56, this.camera.aspect, speedRatio, activeMode);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
    this.camera.updateProjectionMatrix();
  }

  private findNearestBank(readyOnly: boolean): ActiveBank | null {
    const banks = this.chunks.getActiveBanks();
    let best: ActiveBank | null = null;
    let bestDist = Infinity;
    for (const b of banks) {
      if (readyOnly && b.cooldown > 0) continue;
      const d = Math.hypot(b.x - this.playerX, b.z - this.playerZ);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  private findNearestVehicle(maxDist: number, includePolice: boolean): SimVehicle | null {
    let best: SimVehicle | null = null;
    let bestDist = maxDist;
    for (const v of this.vehicles) {
      if (v.destroyed || v.isPlayerControlled) continue;
      if (!includePolice && v.isPolice) continue;
      const d = Math.hypot(v.x - this.playerX, v.z - this.playerZ);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    return best;
  }

  private findNearestHeavyTarget(maxDist: number): SimVehicle | null {
    let best: SimVehicle | null = null;
    let bestDist = maxDist;
    for (const v of this.vehicles) {
      if (v.destroyed || v.isPlayerControlled) continue;
      if (v.kind !== 'tanker' && v.kind !== 'bus') continue;
      const d = Math.hypot(v.x - this.playerX, v.z - this.playerZ);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    return best;
  }

  private findNearestCombatTarget(): { x: number; y: number; z: number; heavy: boolean } | null {
    let best: { x: number; y: number; z: number; heavy: boolean } | null = null;
    let bestDist = 52;

    for (const o of this.officers) {
      if (!o.alive) continue;
      const d = Math.hypot(o.x - this.playerX, o.z - this.playerZ);
      if (d < bestDist) {
        bestDist = d;
        best = { x: o.x, y: 1.25, z: o.z, heavy: false };
      }
    }
    for (const v of this.vehicles) {
      if (v.destroyed || v.isPlayerControlled) continue;
      if (!v.isPolice && v.kind !== 'tanker' && v.kind !== 'bus') continue;
      const d = Math.hypot(v.x - this.playerX, v.z - this.playerZ);
      if (d < bestDist) {
        bestDist = d;
        best = { x: v.x, y: 1.4, z: v.z, heavy: v.kind === 'swat' || v.kind === 'tanker' || v.kind === 'bus' };
      }
    }
    return best;
  }

  private getNearestPoliceDistance(): number {
    let best = 999;
    for (const v of this.vehicles) {
      if (v.destroyed || !v.isPolice) continue;
      const d = Math.hypot(v.x - this.playerX, v.z - this.playerZ);
      if (d < best) best = d;
    }
    for (const o of this.officers) {
      if (!o.alive) continue;
      const d = Math.hypot(o.x - this.playerX, o.z - this.playerZ);
      if (d < best) best = d;
    }
    return best;
  }

  private emitHud() {
    const { cx, cz } = worldToChunk(this.playerX, this.playerZ);
    const biome = getBiomeAt(cx, cz, this.settings.biomeLock);
    const blips: RadarBlip[] = [];

    for (const v of this.vehicles) {
      if (v.destroyed || v.isPlayerControlled) continue;
      const dx = v.x - this.playerX;
      const dz = v.z - this.playerZ;
      if (Math.abs(dx) > 95 || Math.abs(dz) > 95) continue;
      blips.push({
        dx,
        dz,
        kind: v.isPolice ? 'police' : v.kind === 'tanker' ? 'tanker' : v.kind === 'bus' ? 'bus' : 'civilian',
      });
    }
    if (this.chopperActive) {
      blips.push({
        dx: this.chopperRig.group.position.x - this.playerX,
        dz: this.chopperRig.group.position.z - this.playerZ,
        kind: 'chopper',
      });
    }
    for (const b of this.chunks.getActiveBanks()) {
      const dx = b.x - this.playerX;
      const dz = b.z - this.playerZ;
      if (Math.abs(dx) <= 95 && Math.abs(dz) <= 95) {
        blips.push({ dx, dz, kind: 'bank' });
      }
    }

    const policeCount =
      this.vehicles.filter((v) => !v.destroyed && v.isPolice).length +
      this.officers.filter((o) => o.alive).length +
      (this.chopperActive ? 1 : 0);

    const activeCamLabel =
      this.settings.cameraMode === 'auto'
        ? `Авто · ${CAMERA_LABELS[this.autoSubMode]}`
        : CAMERA_LABELS[this.settings.cameraMode];

    const radioInfo = this.audio.getRadioHudInfo();

    this.onHudUpdate({
      biome,
      biomeName: BIOME_DEFS[biome].name,
      districtName: getDistrictName(cx, cz, biome),
      action: this.aiAction,
      actionLabel: ACTION_LABELS[this.aiAction],
      wantedStars: this.wantedStars,
      wantedHeat: Math.round(this.wantedHeat),
      health: Math.round(this.playerHealth),
      armor: Math.round(this.playerArmor),
      cash: Math.round(this.playerCash),
      weapon: this.playerWeapon,
      weaponName: WEAPON_SPECS[this.playerWeapon].name,
      ammo: this.playerAmmo,
      speedKmh: Math.round(this.playerSpeed * 3.6),
      inVehicle: !!this.playerVehicle,
      vehicleLabel: this.playerVehicle ? VEHICLE_LABELS[this.playerVehicle.kind] : 'Пешком',
      policeCount,
      explosionsCount: this.explosionsCount,
      banksRobbed: this.banksRobbed,
      carsStolen: this.carsStolen,
      activeCameraLabel: activeCamLabel,
      timeFormatted: formatTimeOfDay(this.settings.timeOfDay),
      ...radioInfo,
      bannerText: this.bannerText,
      bannerSubtext: this.bannerSubtext,
      bannerTone: this.bannerTone,
      playerHeading: this.playerHeading,
      playerX: this.playerX,
      playerZ: this.playerZ,
      radarBlips: blips,
    });
  }

  public dispose() {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.audio.dispose();
    this.chunks.dispose();
    this.textures.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
