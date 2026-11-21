import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AutonomousTaxiController } from '../sim/navigation';
import { AutonomousTaxiFleet } from '../sim/taxiFleet';
import {
  BIOMES,
  findBiomeSpawnNode,
  getBiomeAtWorld,
} from '../sim/worldGen';
import {
  computeMaxSpeedKmh,
  createInitialUpgrades,
  getUpgradeCost,
  getVehicleClassInfo,
  isFlightUnlocked,
  pickBestAffordableUpgrade,
} from '../sim/taxiEconomy';
import type {
  BiomeId,
  HudSnapshot,
  SimSettings,
  UpgradeKey,
  UpgradeLevels,
} from '../sim/types';
import { createProceduralTexturePack } from './proceduralTextures';
import { createHeroTaxi } from './taxiModel';
import { InfiniteWorldManager } from './worldBuilder';
import { DynamicWorldActors } from './trafficAndPassengers';
import { ProceduralSoundEngine } from '../audio/soundEngine';

const STORAGE_KEY = 'autotaxi_infinity_save_v1';

interface SavedProgress {
  balance: number;
  totalEarned: number;
  tripsCompleted: number;
  totalDistanceM: number;
  upgrades: UpgradeLevels;
}

const DIRECTOR_ANGLES = [
  { id: 'chase_hero', labelRu: 'Широкий план погони', dist: 10.2, height: 4.1, side: 1.8, ahead: 5.5, fov: 54 },
  { id: 'low_wheel', labelRu: 'Низкий ракурс борта', dist: 5.4, height: 1.35, side: 4.2, ahead: 3.2, fov: 46 },
  { id: 'aerial_drone', labelRu: 'Воздушный дрон', dist: 19.5, height: 15.5, side: 11.5, ahead: 6.0, fov: 48 },
  { id: 'front_hero', labelRu: 'Фронтальный пролёт', dist: -8.6, height: 2.35, side: 3.1, ahead: -1.5, fov: 48 },
  { id: 'quarter_cinema', labelRu: 'Кино-трэкинг 3/4', dist: 8.8, height: 2.8, side: -4.4, ahead: 4.0, fov: 50 },
] as const;

// Pre-allocated scratch math helpers (zero GC inside render loop)
const _desiredCamPos = new THREE.Vector3();
const _desiredLookAt = new THREE.Vector3();
const _skyTop = new THREE.Color();
const _skyHorizon = new THREE.Color();
const _fogColor = new THREE.Color();
const _biomeTint = new THREE.Color();
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

function createSkyDome(): {
  mesh: THREE.Mesh;
  uniforms: {
    uTopColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uSunColor: { value: THREE.Color };
    uSunGlow: { value: number };
  };
  dispose: () => void;
} {
  const uniforms = {
    uTopColor: { value: new THREE.Color(0x1e3a5f) },
    uHorizonColor: { value: new THREE.Color(0xf6a96e) },
    uSunDir: { value: new THREE.Vector3(0.5, 0.25, -0.8).normalize() },
    uSunColor: { value: new THREE.Color(0xffdfa8) },
    uSunGlow: { value: 1.0 },
  };

  const geo = new THREE.SphereGeometry(280, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldDir;
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uSunGlow;

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y * 1.15 + 0.05, 0.0, 1.0);
        vec3 sky = mix(uHorizonColor, uTopColor, pow(h, 0.58));

        float sunAmt = max(dot(dir, normalize(uSunDir)), 0.0);
        sky += uSunColor * pow(sunAmt, 14.0) * 0.42 * uSunGlow;
        sky += uSunColor * smoothstep(0.9965, 0.9992, sunAmt) * 1.45 * uSunGlow;

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  return {
    mesh,
    uniforms,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

export interface TaxiSceneEngineApi {
  updateSettings: (settings: SimSettings) => void;
  buyUpgrade: (key: UpgradeKey) => boolean;
  teleportToBiome: (biome: BiomeId) => void;
  resetProgress: () => void;
  getSnapshot: () => HudSnapshot;
  dispose: () => void;
}

export function mountTaxiSceneEngine(
  container: HTMLDivElement,
  initialSettings: SimSettings,
  onHudUpdate: (snapshot: HudSnapshot) => void,
  onWebGlError: (msg: string) => void,
): TaxiSceneEngineApi {
  const isSoftwareGl = detectSoftwareWebGL();
  let settings: SimSettings = { ...initialSettings };

  // Load saved progress if available
  const controller = new AutonomousTaxiController(2026, 260);
  let upgrades: UpgradeLevels = createInitialUpgrades();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedProgress>;
      if (typeof parsed.balance === 'number' && Number.isFinite(parsed.balance)) {
        controller.state.balance = parsed.balance;
      }
      if (typeof parsed.totalEarned === 'number' && Number.isFinite(parsed.totalEarned)) {
        controller.state.totalEarned = parsed.totalEarned;
      }
      if (typeof parsed.tripsCompleted === 'number') {
        controller.state.tripsCompleted = parsed.tripsCompleted;
      }
      if (typeof parsed.totalDistanceM === 'number') {
        controller.state.totalDistanceM = parsed.totalDistanceM;
      }
      if (parsed.upgrades) {
        upgrades = {
          engine: Math.max(1, Math.floor(parsed.upgrades.engine || 1)),
          chassis: Math.max(1, Math.floor(parsed.upgrades.chassis || 1)),
          autopilot: Math.max(1, Math.floor(parsed.upgrades.autopilot || 1)),
          comfort: Math.max(1, Math.floor(parsed.upgrades.comfort || 1)),
        };
      }
    }
  } catch {
    // ignore corrupted localStorage
  }

  const persistProgress = () => {
    try {
      const payload: SavedProgress = {
        balance: controller.state.balance,
        totalEarned: controller.state.totalEarned,
        tripsCompleted: controller.state.tripsCompleted,
        totalDistanceM: controller.state.totalDistanceM,
        upgrades,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage quota errors
    }
  };

  // Create WebGLRenderer following exact Software-WebGL guard from threejs skill
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
  } catch {
    onWebGlError('WebGL недоступен в текущем браузере.');
    return {
      updateSettings: () => {},
      buyUpgrade: () => false,
      teleportToBiome: () => {},
      resetProgress: () => {},
      getSnapshot: () => buildSnapshot(),
      dispose: () => {},
    };
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const initW = Math.max(1, container.clientWidth || window.innerWidth);
  const initH = Math.max(1, container.clientHeight || window.innerHeight);
  renderer.setSize(initW, initH);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc4a48b);
  scene.fog = new THREE.FogExp2(0xc4a48b, 0.0056);

  // Mandatory Studio Environment Reflection (RoomEnvironment + PMREMGenerator)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmremGenerator.dispose();

  const camera = new THREE.PerspectiveCamera(54, initW / initH, 0.2, 420);

  // Sky Dome
  const sky = createSkyDome();
  scene.add(sky.mesh);

  // Warm/Cool Studio Outdoor Lighting Rig (1 shadow caster + hemisphere fill)
  const sunLight = new THREE.DirectionalLight(0xffdfb0, 2.35);
  sunLight.castShadow = !isSoftwareGl;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 180;
  const shadowHalf = 54;
  sunLight.shadow.camera.left = -shadowHalf;
  sunLight.shadow.camera.right = shadowHalf;
  sunLight.shadow.camera.top = shadowHalf;
  sunLight.shadow.camera.bottom = -shadowHalf;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemiLight = new THREE.HemisphereLight(0x8bb6e6, 0x3b3532, 0.85);
  scene.add(hemiLight);

  // World & Actors
  const textures = createProceduralTexturePack(renderer.capabilities.getMaxAnisotropy());
  const world = new InfiniteWorldManager(textures, isSoftwareGl);
  scene.add(world.root);

  const heroTaxi = createHeroTaxi(textures, isSoftwareGl);
  scene.add(heroTaxi.root);

  const peerFleet = new AutonomousTaxiFleet(28, 7742);
  const actors = new DynamicWorldActors(textures, isSoftwareGl, peerFleet.agents.length);
  scene.add(actors.root);

  const sound = new ProceduralSoundEngine();

  // Initial chunks and pose
  world.updateChunksAround(controller.state.x, controller.state.z);
  const camPos = new THREE.Vector3(controller.state.x + 2, 4.2, controller.state.z + 11);
  const camLookAt = new THREE.Vector3(controller.state.x, 1.4, controller.state.z - 8);
  camera.position.copy(camPos);
  camera.lookAt(camLookAt);

  // Pre-warm shaders once on GPU
  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  // Orbit mode pointer interaction state
  let orbitAzimuth = 0.52;
  let orbitElevation = 0.34;
  let orbitDistance = 11.5;
  let isPointerDown = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (settings.cameraMode !== 'orbit') return;
    isPointerDown = true;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!isPointerDown || settings.cameraMode !== 'orbit') return;
    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    orbitAzimuth -= dx * 0.0065;
    orbitElevation = Math.max(0.12, Math.min(1.22, orbitElevation + dy * 0.0055));
  };
  const onPointerUp = () => {
    isPointerDown = false;
  };
  const onWheel = (e: WheelEvent) => {
    if (settings.cameraMode !== 'orbit') return;
    orbitDistance = Math.max(5.5, Math.min(34, orbitDistance + e.deltaY * 0.01));
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: true });

  // WebGL context loss safety
  const onContextLost = (e: Event) => {
    e.preventDefault();
    onWebGlError('Контекст WebGL был потерян. Обновите страницу.');
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);

  // Resize listener with crisp portrait/landscape adaptation
  const onResize = () => {
    const w = Math.max(1, container.clientWidth || window.innerWidth);
    const h = Math.max(1, container.clientHeight || window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (!disposed) {
      renderer.render(scene, camera);
    }
  };
  window.addEventListener('resize', onResize);

  // Dynamic simulation state
  let elapsed = 0;
  let timeHours = 17.6; // Start at breathtaking Golden Hour Sunset!
  let directorIndex = 0;
  let directorTimer = 0;
  let hudAccumulator = 0;
  let autoUpgradeTimer = 0;
  let disposed = false;
  let frameId = 0;
  let lastWallTime = performance.now();

  function buildSnapshot(): HudSnapshot {
    const s = controller.state;
    const biome = getBiomeAtWorld(s.x, s.z);
    const cls = getVehicleClassInfo(upgrades);
    return {
      speedKmh: Math.round(s.speedMs * 3.6),
      maxSpeedKmh: Math.round(computeMaxSpeedKmh(upgrades.engine)),
      biome,
      orderPhase: s.phase,
      activeOrder: s.activeOrder ? { ...s.activeOrder } : null,
      distanceToTargetM: Math.round(controller.getDistanceToTargetM()),
      balance: s.balance,
      totalEarned: s.totalEarned,
      tripsCompleted: s.tripsCompleted,
      totalDistanceKm: s.totalDistanceM / 1000,
      upgrades: { ...upgrades },
      vehicleClassName: cls.nameRu,
      vehicleTierIndex: cls.tierIndex,
      altitude: s.altitude,
      flightBlend: s.flightBlend,
      flightUnlocked: isFlightUnlocked(upgrades),
      timeHours,
      lastPayout: s.lastPayout,
      lastPayoutId: s.lastPayoutId,
      activeDirectorAngle:
        s.phase === 'boarding'
          ? 'Посадка · крупный план'
          : s.phase === 'dropoff'
            ? 'Высадка · крупный план'
            : s.flightBlend > 0.45
              ? `Аэро-съёмка · ${DIRECTOR_ANGLES[directorIndex].labelRu}`
              : DIRECTOR_ANGLES[directorIndex].labelRu,
      hasPassengerInCabin: s.hasPassengerInCabin,
      doorOpenAmount: s.doorOpenAmount,
      tripProgress: controller.getTripProgress(),
      fleetActiveCount: peerFleet.getActiveCount(settings.trafficDensity),
      fleetTripsCompleted: peerFleet.totalFleetTrips,
    };
  }

  function updateLightingAndSky(dt: number, biome: BiomeId): number {
    if (settings.timeOfDay === 'auto') {
      timeHours = (timeHours + dt * 0.16) % 24;
    } else if (settings.timeOfDay === 'dawn') {
      timeHours += (6.5 - timeHours) * Math.min(1, dt * 6.5);
    } else if (settings.timeOfDay === 'day') {
      timeHours += (13.2 - timeHours) * Math.min(1, dt * 6.5);
    } else if (settings.timeOfDay === 'sunset') {
      timeHours += (17.5 - timeHours) * Math.min(1, dt * 6.5);
    } else {
      timeHours += (22.4 - timeHours) * Math.min(1, dt * 6.5);
    }

    // Compute sun elevation angle from timeHours (6 = sunrise, 12 = noon, 18 = sunset)
    const dayAngle = ((timeHours - 6) / 24) * Math.PI * 2;
    const sunElev = Math.sin(dayAngle); // -1..+1
    const sunAz = Math.cos(dayAngle);

    // Night factor: 0 in full day, 1 in full night
    const nightFactor = THREE.MathUtils.clamp((0.06 - sunElev) / 0.36, 0, 1);
    const goldenFactor = THREE.MathUtils.clamp(1 - Math.abs(sunElev - 0.16) / 0.28, 0, 1);

    // Photorealistic atmospheric sky palette blending
    if (nightFactor > 0.55) {
      _skyTop.setHex(0x050a16);
      _skyHorizon.setHex(0x16243d);
      _sunColor.setHex(0x93c5fd);
      _hemiSky.setHex(0x2a3f68);
      _hemiGround.setHex(0x12151e);
    } else {
      _skyTop.setHex(0x1d5fa7).lerp(new THREE.Color(0x1d2b53), goldenFactor * 0.58);
      _skyHorizon.setHex(0xb8dff5).lerp(new THREE.Color(0xf6a868), goldenFactor * 0.88);
      _sunColor.setHex(0xfff7e6).lerp(new THREE.Color(0xffb56b), goldenFactor * 0.85);
      _hemiSky.setHex(0x9bd0f5).lerp(new THREE.Color(0xe5ad87), goldenFactor * 0.5);
      _hemiGround.setHex(0x47433e);
    }

    // Smoothly blend biome fog tint into horizon (richer signature atmosphere for themed/surreal biomes)
    _biomeTint.setHex(BIOMES[biome].fogTintHex);
    const isSurrealBiome =
      biome === 'mushroom' ||
      biome === 'candy' ||
      biome === 'cyberpunk' ||
      biome === 'moon' ||
      biome === 'dino' ||
      biome === 'egypt';
    const biomeBlend = nightFactor > 0.55 ? (isSurrealBiome ? 0.24 : 0.1) : isSurrealBiome ? 0.42 : 0.22;
    _fogColor.copy(_skyHorizon).lerp(_biomeTint, biomeBlend);
    if (settings.weather === 'rain') {
      _fogColor.lerp(new THREE.Color(0x232d3d), 0.45);
      _skyTop.lerp(new THREE.Color(0x172030), 0.6);
      _skyHorizon.lerp(new THREE.Color(0x3a4759), 0.52);
    } else if (settings.weather === 'fog') {
      _fogColor.lerp(new THREE.Color(0xc4d0dc), nightFactor > 0.55 ? 0.15 : 0.45);
    }

    sky.uniforms.uTopColor.value.copy(_skyTop);
    sky.uniforms.uHorizonColor.value.copy(_skyHorizon);
    sky.uniforms.uSunColor.value.copy(_sunColor);
    sky.uniforms.uSunGlow.value = settings.weather === 'rain' ? 0.2 : 1.0 - nightFactor * 0.65;

    const sunY = Math.max(0.16, Math.abs(sunElev) * 0.85 + 0.14);
    sky.uniforms.uSunDir.value.set(sunAz * 0.78, sunY, -0.58).normalize();

    // Update Fog density and scene background for atmosphere & weather
    const fog = scene.fog as THREE.FogExp2;
    fog.color.copy(_fogColor);
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(_fogColor);
    }
    const targetFogDensity =
      settings.weather === 'fog' ? 0.011 : settings.weather === 'rain' ? 0.0078 : 0.0046;
    fog.density += (targetFogDensity - fog.density) * Math.min(1, dt * 3);

    // Position sun light relative to taxi so shadows stay razor-sharp infinitely
    const tx = controller.state.x;
    const tz = controller.state.z;
    sunLight.position.set(
      tx + sky.uniforms.uSunDir.value.x * 75,
      sky.uniforms.uSunDir.value.y * 75,
      tz + sky.uniforms.uSunDir.value.z * 75,
    );
    sunLight.target.position.set(tx, 0, tz);
    sunLight.color.copy(_sunColor);
    sunLight.intensity =
      (nightFactor > 0.55 ? 0.8 : 2.45 - goldenFactor * 0.2) *
      (settings.weather === 'rain' ? 0.68 : 1.0);

    hemiLight.color.copy(_hemiSky);
    hemiLight.groundColor.copy(_hemiGround);
    hemiLight.intensity = nightFactor > 0.55 ? 0.52 : 0.96;

    sky.mesh.position.set(tx, 0, tz);

    return nightFactor;
  }

  function updateCamera(dt: number): void {
    const s = controller.state;
    const fwdX = Math.sin(s.yaw);
    const fwdZ = Math.cos(s.yaw);
    // leftX/leftZ = local +X (driver side); curbX/curbZ = local -X (passenger curb door side!)
    const leftX = Math.cos(s.yaw);
    const leftZ = -Math.sin(s.yaw);
    const curbX = -leftX;
    const curbZ = -leftZ;

    // Portrait mobile adaptation: pull back slightly & widen FOV gracefully when aspect < 1
    const isPortrait = camera.aspect < 0.85;
    const portraitDistMult = isPortrait ? 1.32 : 1.0;
    const portraitFovAdd = isPortrait ? 11 : 0;
    const alt = s.altitude;
    const flyPullback = s.flightBlend * 2.1;

    let targetFov = 54 + portraitFovAdd;
    const speedKmh = s.speedMs * 3.6;
    const speedFovBoost = Math.min(11, Math.max(0, (speedKmh - 45) * 0.08));
    const isDoorShowcase =
      settings.cameraMode === 'director' &&
      (s.phase === 'boarding' || s.phase === 'dropoff');

    if (isDoorShowcase) {
      // Rear-3/4 curb-side close-up looking directly into the V-opening of the outward-swinging door,
      // showcasing the wide-open door, illuminated cabin, and passenger walking smoothly in/out!
      const curbDist = 5.35 * portraitDistMult;
      const rearOffset = -3.85 * (isPortrait ? 1.15 : 1.0);
      const sway = Math.sin(elapsed * 0.75) * 0.25;
      _desiredCamPos.set(
        s.x + curbX * curbDist + fwdX * (rearOffset + sway),
        alt + 2.35 * (isPortrait ? 1.12 : 1.0),
        s.z + curbZ * curbDist + fwdZ * (rearOffset + sway),
      );
      _desiredLookAt.set(
        s.x + curbX * 0.55 - fwdX * 0.35,
        alt + 1.05,
        s.z + curbZ * 0.55 - fwdZ * 0.35,
      );
      targetFov = 46 + portraitFovAdd;
    } else if (settings.cameraMode === 'director') {
      directorTimer += dt;
      if (directorTimer >= 10.5) {
        directorTimer = 0;
        directorIndex = (directorIndex + 1) % DIRECTOR_ANGLES.length;
      }
      const preset = DIRECTOR_ANGLES[directorIndex];
      const d = (preset.dist + (preset.dist > 0 ? flyPullback : -flyPullback * 0.5)) * portraitDistMult;
      const side = preset.side * (isPortrait ? 0.85 : 1.0);
      const sway = Math.sin(elapsed * 0.45) * 0.9;
      _desiredCamPos.set(
        s.x - fwdX * d + leftX * (side + sway),
        alt + preset.height * (isPortrait ? 1.12 : 1.0),
        s.z - fwdZ * d + leftZ * (side + sway),
      );
      _desiredLookAt.set(
        s.x + fwdX * preset.ahead,
        alt + 1.15 - s.flightBlend * 0.5,
        s.z + fwdZ * preset.ahead,
      );
      targetFov = preset.fov + portraitFovAdd + speedFovBoost * 0.5 + s.flightBlend * 4;
    } else if (settings.cameraMode === 'chase') {
      const dist = (9.2 + flyPullback + Math.min(2.4, speedKmh * 0.015)) * portraitDistMult;
      const height = 3.7 * (isPortrait ? 1.15 : 1.0) + s.flightBlend * 0.55;
      _desiredCamPos.set(s.x - fwdX * dist, alt + height, s.z - fwdZ * dist);
      _desiredLookAt.set(s.x + fwdX * 7.5, alt + 1.35 - s.flightBlend * 0.45, s.z + fwdZ * 7.5);
      targetFov = 54 + portraitFovAdd + speedFovBoost + s.flightBlend * 4;
    } else if (settings.cameraMode === 'drone') {
      const orbitAng = elapsed * 0.16;
      const rad = (22 + flyPullback * 1.5) * portraitDistMult;
      _desiredCamPos.set(
        s.x + Math.sin(orbitAng) * rad - fwdX * 4,
        alt + 17.5 * (isPortrait ? 1.15 : 1.0),
        s.z + Math.cos(orbitAng) * rad - fwdZ * 4,
      );
      _desiredLookAt.set(s.x + fwdX * 4, alt + 1.0, s.z + fwdZ * 4);
      targetFov = 48 + portraitFovAdd;
    } else if (settings.cameraMode === 'hood') {
      _desiredCamPos.set(s.x + fwdX * 0.72, alt + 1.52, s.z + fwdZ * 0.72);
      _desiredLookAt.set(s.x + fwdX * 24, alt + 1.32 - s.flightBlend * 0.8, s.z + fwdZ * 24);
      targetFov = 66 + (isPortrait ? 8 : 0) + speedFovBoost * 0.7;
    } else if (settings.cameraMode === 'side') {
      // Curb-side low tracking shot showing both folded hover-wheels / wings and opening door
      const sideDist = (5.6 + flyPullback * 0.75) * portraitDistMult;
      _desiredCamPos.set(
        s.x + curbX * sideDist + fwdX * 2.1,
        alt + 1.55,
        s.z + curbZ * sideDist + fwdZ * 2.1,
      );
      _desiredLookAt.set(s.x + fwdX * 0.8, alt + 1.0, s.z + fwdZ * 0.8);
      targetFov = 46 + portraitFovAdd + s.flightBlend * 4;
    } else {
      // Free Orbit around moving/flying taxi
      const r = orbitDistance * portraitDistMult;
      const horiz = Math.cos(orbitElevation) * r;
      const vert = Math.sin(orbitElevation) * r + 1.2;
      _desiredCamPos.set(
        s.x + Math.sin(orbitAzimuth) * horiz,
        Math.max(1.1, alt + vert),
        s.z + Math.cos(orbitAzimuth) * horiz,
      );
      _desiredLookAt.set(s.x, alt + 1.15, s.z);
      targetFov = 52 + portraitFovAdd;
    }

    // Silky-smooth frame-rate independent exponential damping
    const posLambda =
      settings.cameraMode === 'hood'
        ? 24
        : settings.cameraMode === 'orbit'
          ? 14
          : isDoorShowcase
            ? 6.8
            : 4.2;
    const lookLambda = settings.cameraMode === 'hood' ? 24 : isDoorShowcase ? 9.0 : 7.5;
    const posAlpha = 1 - Math.exp(-posLambda * dt);
    const lookAlpha = 1 - Math.exp(-lookLambda * dt);

    camPos.lerp(_desiredCamPos, posAlpha);
    camLookAt.lerp(_desiredLookAt, lookAlpha);

    camera.position.copy(camPos);
    camera.lookAt(camLookAt);

    // Subtle cinematic banking on turns
    const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, 4.5, dt);
    if (Math.abs(nextFov - camera.fov) > 0.02) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
  }

  // Software-WebGL fence pacing helper (exact pattern from threejs skill)
  function afterDraw(cb: () => void) {
    if (disposed) return;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 80);
      }
    };
    frameId = window.setTimeout(poll, 5);
  }

  function tick() {
    if (disposed) return;
    const now = performance.now();
    const rawDt = Math.min(0.08, Math.max(0.001, (now - lastWallTime) / 1000));
    lastWallTime = now;

    const simDt = rawDt * settings.simSpeed;
    elapsed += simDt;

    // Step autonomous taxi simulation (sub-step cleanly when simSpeed >= 2)
    const subSteps = settings.simSpeed > 1.5 ? 2 : 1;
    const subDt = simDt / subSteps;
    for (let i = 0; i < subSteps; i++) {
      const stepRes = controller.step(subDt, upgrades);
      if (stepRes.pickedUpOrder) {
        sound.playChime('pickup');
      }
      if (stepRes.completedOrder) {
        sound.playChime('payout');
        persistProgress();
      }
    }

    // Optional Auto-Upgrade mode
    if (settings.autoUpgrade) {
      autoUpgradeTimer += rawDt;
      if (autoUpgradeTimer >= 1.2) {
        autoUpgradeTimer = 0;
        const bestKey = pickBestAffordableUpgrade(controller.state.balance, upgrades);
        if (bestKey) {
          buyUpgradeInternal(bestKey);
        }
      }
    }

    const s = controller.state;
    const biome = getBiomeAtWorld(s.x, s.z);

    // Update chunks, lighting, taxi, traffic, passenger & weather
    world.updateChunksAround(s.x, s.z);
    const nightFactor = updateLightingAndSky(rawDt, biome);
    const wetness = settings.weather === 'rain' ? 1.0 : 0.0;
    world.updateAtmosphere(nightFactor, wetness);

    heroTaxi.update({
      x: s.x,
      z: s.z,
      yaw: s.yaw,
      steerAngle: s.steerAngle,
      wheelSpin: s.wheelSpin,
      speedMs: s.speedMs,
      braking: s.braking,
      turnSignal: s.turnSignal,
      doorOpenAmount: s.doorOpenAmount,
      hasPassengerInCabin: s.hasPassengerInCabin,
      passengerCoatHex: s.activeOrder?.passengerCoatHex ?? 0xe11d48,
      passengerSkinHex: s.activeOrder?.passengerSkinHex ?? 0xf1c29b,
      passengerArchetype: s.activeOrder?.passengerArchetype ?? null,
      altitude: s.altitude,
      flightBlend: s.flightBlend,
      verticalVelocity: s.verticalVelocity,
      nightFactor,
      phase: s.phase,
      upgrades,
      elapsed,
    });

    peerFleet.step({
      dt: simDt,
      heroX: s.x,
      heroZ: s.z,
      heroAltitude: s.altitude,
      trafficDensity: settings.trafficDensity,
    });

    actors.update({
      dt: simDt,
      elapsed,
      taxiX: s.x,
      taxiZ: s.z,
      taxiYaw: s.yaw,
      taxiAltitude: s.altitude,
      trafficDensity: settings.trafficDensity,
      nightFactor,
      isRaining: settings.weather === 'rain',
      phase: s.phase,
      phaseProgress: s.phaseProgress,
      hasPassengerInCabin: s.hasPassengerInCabin,
      activeOrder: s.activeOrder,
      peerAgents: peerFleet.agents,
      peerActiveCount: peerFleet.getActiveCount(settings.trafficDensity),
    });

    updateCamera(rawDt);
    sound.updateEngine(s.speedMs * 3.6);

    renderer.render(scene, camera);

    // Throttled HUD callback (<= 8Hz so React never stalls WebGL)
    hudAccumulator += rawDt;
    if (hudAccumulator >= 0.14) {
      hudAccumulator = 0;
      onHudUpdate(buildSnapshot());
    }

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  }

  function buyUpgradeInternal(key: UpgradeKey): boolean {
    const cost = getUpgradeCost(key, upgrades[key]);
    if (controller.state.balance < cost) return false;
    controller.state.balance -= cost;
    upgrades = {
      ...upgrades,
      [key]: upgrades[key] + 1,
    };
    heroTaxi.triggerUpgradeBurst();
    sound.playChime('upgrade');
    persistProgress();
    onHudUpdate(buildSnapshot());
    return true;
  }

  // Emit initial HUD snapshot immediately and launch loop
  onHudUpdate(buildSnapshot());
  if (isSoftwareGl) {
    frameId = window.setTimeout(tick, 16);
  } else {
    frameId = requestAnimationFrame(tick);
  }

  return {
    updateSettings(next: SimSettings) {
      const prevAudio = settings.audioEnabled;
      settings = { ...next };
      if (next.audioEnabled !== prevAudio) {
        sound.setEnabled(next.audioEnabled);
      }
      onHudUpdate(buildSnapshot());
    },
    buyUpgrade: buyUpgradeInternal,
    teleportToBiome(biome: BiomeId) {
      const node = findBiomeSpawnNode(biome);
      controller.teleportToGrid(node.gx, node.gz, 2);
      world.updateChunksAround(controller.state.x, controller.state.z);
      // Snap camera smoothly closer to avoid flying 1000m across the map
      camPos.set(controller.state.x + 2, 4.2, controller.state.z + 11);
      camLookAt.set(controller.state.x, 1.4, controller.state.z - 8);
      onHudUpdate(buildSnapshot());
    },
    resetProgress() {
      upgrades = createInitialUpgrades();
      controller.state.balance = 260;
      controller.state.totalEarned = 0;
      controller.state.tripsCompleted = 0;
      controller.state.totalDistanceM = 0;
      controller.state.lastPayout = 0;
      controller.teleportToGrid(0, 0, 2);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      onHudUpdate(buildSnapshot());
    },
    getSnapshot: buildSnapshot,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      sound.dispose();
      heroTaxi.dispose();
      world.dispose();
      actors.dispose();
      sky.dispose();
      textures.dispose();
      envRT.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
