import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { StuntSimulationEngine } from '../sim/engine';
import {
  CameraMode,
  Fighter,
  InteractiveProp,
  SimEvent,
  SimulationStats,
  Vec3,
} from '../sim/types';
import { MartialArtsAudioSynth } from './AudioSynth';

const BASE_URL = import.meta.env.BASE_URL ?? '/';
const COURTYARD_TEX_URL = `${BASE_URL}src/assets/images/tex_courtyard_stone_1794933964744.jpg`;
const TEAK_WOOD_TEX_URL = `${BASE_URL}src/assets/images/tex_teak_wood_1794933964696.jpg`;

// Pre-allocated scratch math objects (Zero GC in render loop)
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _mat4 = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _camGoal = new THREE.Vector3();
const _lookGoal = new THREE.Vector3();

interface FighterVisualRig {
  root: THREE.Group;
  shadowDisc: THREE.Mesh;
  pelvisMesh: THREE.Mesh;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  upperArmL: THREE.Mesh;
  lowerArmL: THREE.Mesh;
  upperArmR: THREE.Mesh;
  lowerArmR: THREE.Mesh;
  upperLegL: THREE.Mesh;
  lowerLegL: THREE.Mesh;
  upperLegR: THREE.Mesh;
  lowerLegR: THREE.Mesh;
  kneeCapL: THREE.Mesh;
  kneeCapR: THREE.Mesh;
  footShoeL: THREE.Mesh;
  footShoeR: THREE.Mesh;
  fistL: THREE.Mesh;
  fistR: THREE.Mesh;
  clothMat: THREE.MeshStandardMaterial;
  pantsMat: THREE.MeshStandardMaterial;
}

interface PropVisualRig {
  root: THREE.Group;
  shadowDisc: THREE.Mesh;
  mainMat: THREE.MeshStandardMaterial;
}

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  vrz: number;
  sx: number;
  sy: number;
  sz: number;
  life: number;
  maxLife: number;
  colorHex: number;
}

export class StuntScene3D {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public isSoftwareGl: boolean;
  public engine: StuntSimulationEngine;
  public audio: MartialArtsAudioSynth;

  public paused = false;
  public timeScale = 1.0;
  public cameraMode: CameraMode = 'auto_director';

  private container: HTMLElement;
  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private lastHudSyncTime = 0;
  private onStatsUpdate: (stats: SimulationStats) => void;

  // Scene lighting & environment groups
  private keyLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private backdropGroup = new THREE.Group();
  private fighterRigs = new Map<string, FighterVisualRig>();
  private propRigs = new Map<string, PropVisualRig>();

  // Shared geometries & materials
  private limbGeo = new THREE.CylinderGeometry(0.068, 0.058, 1, 10);
  private shadowGeo = new THREE.CircleGeometry(0.62, 16);
  private shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  private woodTexture!: THREE.Texture;
  private floorMaterial!: THREE.MeshStandardMaterial;

  // Pooled Debris & Impact Sparks InstancedMesh
  private readonly maxParticles = 160;
  private particlePool: PooledParticle[] = [];
  private particleMesh!: THREE.InstancedMesh;
  private particleCursor = 0;

  // Camera tracking state
  private currentCamPos = new THREE.Vector3(0, 5.2, 10.5);
  private currentLookAt = new THREE.Vector3(0, 1.2, 0);
  private orbitYaw = 0.4;
  private orbitPitch = 0.42;
  private orbitDistance = 10.8;
  private isDragging = false;
  private dragPrevX = 0;
  private dragPrevY = 0;
  private directorAngleIndex = 0;
  private directorSwitchTimer = 0;

  constructor(
    container: HTMLElement,
    engine: StuntSimulationEngine,
    onStatsUpdate: (stats: SimulationStats) => void
  ) {
    this.container = container;
    this.engine = engine;
    this.onStatsUpdate = onStatsUpdate;
    this.audio = new MartialArtsAudioSynth();

    // 1. Detect software WebGL from GPU renderer string
    this.isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.2, 120);
    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.currentLookAt);

    // 2. Studio PBR Environment Map via RoomEnvironment
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    // 3. Initialize textures, lighting, arena floor, perimeter architecture, and particle pool
    this.initTexturesAndMaterials();
    this.initLights();
    this.initFloorAndBackdrop();
    this.initParticlePool();
    this.syncSceneWithEngine(true);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindInteractionEvents();
    this.startLoop();
  }

  private createProceduralBumpTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 32) {
      ctx.fillStyle = '#555555';
      ctx.fillRect(0, y, 128, 2);
      for (let x = (y % 64 === 0 ? 0 : 16); x < 128; x += 32) {
        ctx.fillRect(x, y, 2, 32);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    return tex;
  }

  private createSignageTexture(text: string, bgHex: string, fgHex: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = fgHex;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 240, 112);
    ctx.fillStyle = fgHex;
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  private initTexturesAndMaterials(): void {
    const loader = new THREE.TextureLoader();
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const bumpTex = this.createProceduralBumpTexture();

    const floorTex = loader.load(COURTYARD_TEX_URL);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(7, 7);
    floorTex.anisotropy = maxAniso;

    this.woodTexture = loader.load(TEAK_WOOD_TEX_URL);
    this.woodTexture.colorSpace = THREE.SRGBColorSpace;
    this.woodTexture.wrapS = THREE.RepeatWrapping;
    this.woodTexture.wrapT = THREE.RepeatWrapping;
    this.woodTexture.repeat.set(2, 2);
    this.woodTexture.anisotropy = maxAniso;

    this.floorMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: floorTex,
      bumpMap: bumpTex,
      bumpScale: 0.015,
      roughness: 0.68,
      metalness: 0.08,
    });
  }

  private initLights(): void {
    const theme = this.engine.theme;
    this.scene.background = new THREE.Color(theme.skyColor);
    this.scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);

    this.hemiLight = new THREE.HemisphereLight(
      theme.hemiSkyColor,
      theme.hemiGroundColor,
      0.85
    );
    this.hemiLight.position.set(0, 25, 0);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(
      theme.keyLightColor,
      theme.keyLightIntensity
    );
    this.keyLight.position.set(11, 18, 10);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    const d = 13;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 42;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    // Cool rim backlight for dramatic martial arts silhouette separation
    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.95);
    rimLight.position.set(-12, 9, -11);
    this.scene.add(rimLight);
  }

  private initFloorAndBackdrop(): void {
    // Main octagonal courtyard stone floor
    const floorGeo = new THREE.CylinderGeometry(12.2, 12.6, 0.4, 32);
    const floorMesh = new THREE.Mesh(floorGeo, this.floorMaterial);
    floorMesh.position.y = -0.2;
    floorMesh.receiveShadow = !this.isSoftwareGl;
    this.scene.add(floorMesh);

    // Raised ornate martial arts ring border (offset by +0.02 on Y to prevent Z-fighting)
    const borderGeo = new THREE.RingGeometry(11.35, 12.15, 32);
    borderGeo.rotateX(-Math.PI / 2);
    const borderMat = new THREE.MeshStandardMaterial({
      color: 0x7c2d12,
      roughness: 0.45,
      metalness: 0.25,
    });
    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.position.y = 0.012;
    this.scene.add(borderMesh);

    // Center inlaid martial arts Yin-Yang / Dragon medallion ring
    const centerRingGeo = new THREE.RingGeometry(2.2, 2.45, 32);
    centerRingGeo.rotateX(-Math.PI / 2);
    const centerRingMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.35,
      metalness: 0.65,
    });
    const centerRing = new THREE.Mesh(centerRingGeo, centerRingMat);
    centerRing.position.y = 0.014;
    this.scene.add(centerRing);

    // Extended dark outer ground plane so arena sits naturally in a vast world
    const outerGroundGeo = new THREE.PlaneGeometry(160, 160);
    outerGroundGeo.rotateX(-Math.PI / 2);
    const outerGroundMat = new THREE.MeshStandardMaterial({
      color: 0x141210,
      roughness: 0.92,
      metalness: 0.05,
    });
    const outerGround = new THREE.Mesh(outerGroundGeo, outerGroundMat);
    outerGround.position.y = -0.22;
    this.scene.add(outerGround);

    this.scene.add(this.backdropGroup);
    this.rebuildBackdropArchitecture();
  }

  private rebuildBackdropArchitecture(): void {
    while (this.backdropGroup.children.length > 0) {
      const child = this.backdropGroup.children[0];
      this.backdropGroup.remove(child);
    }

    const theme = this.engine.theme;
    this.scene.background = new THREE.Color(theme.skyColor);
    this.scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);
    this.keyLight.color.setHex(theme.keyLightColor);
    this.keyLight.intensity = theme.keyLightIntensity;
    this.hemiLight.color.setHex(theme.hemiSkyColor);
    this.hemiLight.groundColor.setHex(theme.hemiGroundColor);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x29201b,
      roughness: 0.78,
      metalness: 0.1,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: theme.accentColor,
      roughness: 0.42,
      metalness: 0.22,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.28,
      metalness: 0.82,
    });
    const lanternMat = new THREE.MeshStandardMaterial({
      color: theme.lanternColor,
      emissive: theme.lanternColor,
      emissiveIntensity: 1.8,
      roughness: 0.3,
    });

    // Build 6 multi-part Hong Kong pavilion / scaffolding structures around the outer perimeter
    const signs = ['龍門茶樓', '功夫武館', '成家班', '九龍寨', '黃金嘉禾', '醉拳宗師'];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const dist = 15.8;
      const pavilion = new THREE.Group();
      pavilion.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      pavilion.rotation.y = -angle - Math.PI / 2;

      // 1. Primary base wall & timber columns
      const baseWall = new THREE.Mesh(new THREE.BoxGeometry(7.2, 4.2, 1.4), wallMat);
      baseWall.position.y = 2.1;
      pavilion.add(baseWall);

      // 2. Curved/tiered pagoda eave roof
      const eaveLower = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.45, 2.2), roofMat);
      eaveLower.position.y = 4.35;
      pavilion.add(eaveLower);

      const upperStory = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.4, 1.2), wallMat);
      upperStory.position.y = 5.75;
      pavilion.add(upperStory);

      const eaveUpper = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.48, 2.0), roofMat);
      eaveUpper.position.y = 7.1;
      pavilion.add(eaveUpper);

      // 3. Illuminated Hong Kong Signage Plaque
      const signTex = this.createSignageTexture(
        signs[i % signs.length],
        i % 2 === 0 ? '#7f1d1d' : '#1e293b',
        '#fbbf24'
      );
      const signMat = new THREE.MeshStandardMaterial({
        map: signTex,
        emissiveMap: signTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.45,
        roughness: 0.3,
      });
      const signBoard = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.25, 0.16), signMat);
      signBoard.position.set(0, 3.1, 0.78);
      pavilion.add(signBoard);

      // 4. Pair of hanging glowing silk lanterns per pavilion
      for (const side of [-2.4, 2.4]) {
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), lanternMat);
        lantern.scale.y = 1.25;
        lantern.position.set(side, 3.65, 0.95);
        pavilion.add(lantern);

        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 8), goldMat);
        cap.position.set(side, 4.05, 0.95);
        pavilion.add(cap);
      }

      this.backdropGroup.add(pavilion);
    }
  }

  private initParticlePool(): void {
    const fragGeo = new THREE.BoxGeometry(1, 1, 1);
    const fragMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.15,
    });
    this.particleMesh = new THREE.InstancedMesh(fragGeo, fragMat, this.maxParticles);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < this.maxParticles; i++) {
      this.particlePool.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        vrx: 0,
        vry: 0,
        vrz: 0,
        sx: 0.1,
        sy: 0.1,
        sz: 0.1,
        life: 0,
        maxLife: 1,
        colorHex: 0xf59e0b,
      });
      _mat4.makeTranslation(0, -100, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.particleMesh);
  }

  private spawnParticles(origin: Vec3, count: number, kind: string): void {
    for (let i = 0; i < count; i++) {
      const p = this.particlePool[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.maxParticles;

      p.active = true;
      p.x = origin.x + (Math.random() - 0.5) * 0.4;
      p.y = Math.max(0.15, origin.y + (Math.random() - 0.5) * 0.4);
      p.z = origin.z + (Math.random() - 0.5) * 0.4;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 6.5;
      p.vx = Math.cos(angle) * speed;
      p.vy = 2.8 + Math.random() * 6.2;
      p.vz = Math.sin(angle) * speed;

      p.rx = Math.random() * Math.PI;
      p.ry = Math.random() * Math.PI;
      p.rz = Math.random() * Math.PI;
      p.vrx = (Math.random() - 0.5) * 14;
      p.vry = (Math.random() - 0.5) * 14;
      p.vrz = (Math.random() - 0.5) * 14;

      if (kind === 'wood') {
        p.sx = 0.08;
        p.sy = 0.05;
        p.sz = 0.36 + Math.random() * 0.25;
        p.colorHex = Math.random() > 0.4 ? 0xb45309 : 0x78350f;
        p.maxLife = 1.1;
      } else if (kind === 'bamboo') {
        p.sx = 0.06;
        p.sy = 0.06;
        p.sz = 0.45;
        p.colorHex = 0xa3e635;
        p.maxLife = 1.1;
      } else {
        // Impact sparks
        p.sx = 0.11;
        p.sy = 0.11;
        p.sz = 0.11;
        p.colorHex = Math.random() > 0.45 ? 0xfbbf24 : 0xef4444;
        p.maxLife = 0.48;
      }
      p.life = p.maxLife;
    }
  }

  private updateParticles(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particlePool[i];
      if (!p.active) continue;
      anyChanged = true;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _mat4.makeTranslation(0, -100, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 17.5 * dt;

      if (p.y < 0.04) {
        p.y = 0.04;
        p.vy = -p.vy * 0.35;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }

      p.rx += p.vrx * dt;
      p.ry += p.vry * dt;
      p.rz += p.vrz * dt;

      const s = Math.max(0.01, p.life / p.maxLife);
      _vA.set(p.x, p.y, p.z);
      _quat.setFromEuler(new THREE.Euler(p.rx, p.ry, p.rz));
      _scale.set(p.sx * s, p.sy * s, p.sz * s);
      _mat4.compose(_vA, _quat, _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(p.colorHex));
    }

    if (anyChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private createFighterVisualRig(f: Fighter): FighterVisualRig {
    const root = new THREE.Group();

    const clothMat = new THREE.MeshStandardMaterial({
      color: f.primaryColor,
      roughness: 0.65,
      metalness: 0.08,
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: f.secondaryColor,
      roughness: 0.75,
      metalness: 0.05,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xe6b89c,
      roughness: 0.52,
      metalness: 0.04,
    });
    const beltMat = new THREE.MeshStandardMaterial({
      color: f.beltColor,
      roughness: 0.4,
      metalness: 0.2,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x171717,
      roughness: 0.4,
      metalness: 0.15,
    });

    // Contact shadow disc
    const shadowDisc = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.015;
    root.add(shadowDisc);

    // Pelvis & lower martial arts tunic hem
    const pelvisMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.16, 0.34, 12),
      pantsMat
    );
    pelvisMesh.castShadow = !this.isSoftwareGl;
    root.add(pelvisMesh);

    // Torso group (chest + martial arts sash belt + collar trim + lower tunic skirt)
    const torsoGroup = new THREE.Group();
    const chestMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.54, 0.25),
      clothMat
    );
    chestMesh.position.y = -0.04;
    chestMesh.castShadow = !this.isSoftwareGl;
    torsoGroup.add(chestMesh);

    const lowerTunic = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.22, 0.24),
      clothMat
    );
    lowerTunic.position.y = -0.28;
    torsoGroup.add(lowerTunic);

    const sashMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.1, 0.27),
      beltMat
    );
    sashMesh.position.y = -0.2;
    torsoGroup.add(sashMesh);

    const collarMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.14, 0.26),
      beltMat
    );
    collarMesh.position.y = 0.17;
    torsoGroup.add(collarMesh);
    root.add(torsoGroup);

    // Head group (sculpted cranium + martial arts hair + headband for Hero)
    const headGroup = new THREE.Group();
    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.145, 14, 12),
      skinMat
    );
    skull.scale.set(0.95, 1.08, 0.98);
    skull.castShadow = !this.isSoftwareGl;
    headGroup.add(skull);

    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.152, 12, 10),
      hairMat
    );
    hairCap.position.set(0, 0.035, -0.02);
    hairCap.scale.set(1.0, 0.92, 1.02);
    headGroup.add(hairCap);

    if (f.isHero) {
      // Iconic crimson martial arts headband on Master Jackie
      const headband = new THREE.Mesh(
        new THREE.CylinderGeometry(0.153, 0.153, 0.055, 14),
        beltMat
      );
      headband.position.y = 0.05;
      headGroup.add(headband);
    }
    root.add(headGroup);

    // Articulated upper & lower limbs
    const upperArmL = new THREE.Mesh(this.limbGeo, clothMat);
    const lowerArmL = new THREE.Mesh(this.limbGeo, skinMat);
    const upperArmR = new THREE.Mesh(this.limbGeo, clothMat);
    const lowerArmR = new THREE.Mesh(this.limbGeo, skinMat);

    const upperLegL = new THREE.Mesh(this.limbGeo, pantsMat);
    const lowerLegL = new THREE.Mesh(this.limbGeo, pantsMat);
    const upperLegR = new THREE.Mesh(this.limbGeo, pantsMat);
    const lowerLegR = new THREE.Mesh(this.limbGeo, pantsMat);

    // Spherical knee joints, fists, and kung-fu shoes for seamless anatomical silhouette
    const jointSphereGeo = new THREE.SphereGeometry(0.076, 10, 8);
    const kneeCapL = new THREE.Mesh(jointSphereGeo, pantsMat);
    const kneeCapR = new THREE.Mesh(jointSphereGeo, pantsMat);

    const fistGeo = new THREE.SphereGeometry(0.068, 10, 8);
    const fistL = new THREE.Mesh(fistGeo, skinMat);
    const fistR = new THREE.Mesh(fistGeo, skinMat);

    const shoeGeo = new THREE.BoxGeometry(0.13, 0.09, 0.24);
    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.6,
      metalness: 0.1,
    });
    const footShoeL = new THREE.Mesh(shoeGeo, shoeMat);
    const footShoeR = new THREE.Mesh(shoeGeo, shoeMat);

    for (const limb of [
      upperArmL,
      lowerArmL,
      upperArmR,
      lowerArmR,
      upperLegL,
      lowerLegL,
      upperLegR,
      lowerLegR,
      kneeCapL,
      kneeCapR,
      fistL,
      fistR,
      footShoeL,
      footShoeR,
    ]) {
      limb.castShadow = !this.isSoftwareGl;
      root.add(limb);
    }

    this.scene.add(root);

    return {
      root,
      shadowDisc,
      pelvisMesh,
      torsoGroup,
      headGroup,
      upperArmL,
      lowerArmL,
      upperArmR,
      lowerArmR,
      upperLegL,
      lowerLegL,
      upperLegR,
      lowerLegR,
      kneeCapL,
      kneeCapR,
      footShoeL,
      footShoeR,
      fistL,
      fistR,
      clothMat,
      pantsMat,
    };
  }

  private orientLimbSegment(mesh: THREE.Mesh, start: Vec3, end: Vec3, radiusScale = 1): void {
    _vA.set(start.x, start.y, start.z);
    _vB.set(end.x, end.y, end.z);
    _vDir.subVectors(_vB, _vA);
    const length = Math.max(0.05, _vDir.length());
    mesh.position.copy(_vA).addScaledVector(_vDir, 0.5);
    _vDir.normalize();
    _quat.setFromUnitVectors(_up, _vDir);
    mesh.quaternion.copy(_quat);
    mesh.scale.set(radiusScale, length, radiusScale);
  }

  private createPropVisualRig(p: InteractiveProp): PropVisualRig {
    const root = new THREE.Group();
    const mainMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.woodTexture,
      roughness: 0.58,
      metalness: 0.1,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      roughness: 0.35,
      metalness: 0.82,
    });
    const bambooMat = new THREE.MeshStandardMaterial({
      color: 0xd9f99d,
      map: this.woodTexture,
      roughness: 0.38,
      metalness: 0.08,
    });
    const porcelainMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.15,
      metalness: 0.1,
    });

    const shadowDisc = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.scale.setScalar(p.radius * 1.4);
    shadowDisc.position.y = 0.015;
    root.add(shadowDisc);

    if (p.type === 'table') {
      // Composite Teahouse Table (Tabletop + apron + 4 legs + teapot & cups)
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.09, 1.45), mainMat);
      top.position.y = 0.74;
      top.castShadow = !this.isSoftwareGl;
      top.receiveShadow = !this.isSoftwareGl;
      root.add(top);

      const apron = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.12, 1.28), darkMetalMat);
      apron.position.y = 0.65;
      root.add(apron);

      for (const lx of [-0.58, 0.58]) {
        for (const lz of [-0.58, 0.58]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.09), mainMat);
          leg.position.set(lx, 0.36, lz);
          leg.castShadow = !this.isSoftwareGl;
          root.add(leg);
        }
      }

      const teapot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), porcelainMat);
      teapot.position.set(0, 0.86, 0);
      root.add(teapot);
    } else if (p.type === 'chair') {
      // Composite Folding Stunt Chair
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.52), mainMat);
      seat.position.y = 0.46;
      seat.castShadow = !this.isSoftwareGl;
      root.add(seat);

      for (const lx of [-0.22, 0.22]) {
        for (const lz of [-0.22, 0.22]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.46, 8), mainMat);
          leg.position.set(lx, 0.23, lz);
          root.add(leg);
        }
      }
      const backPostL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.48, 0.05), mainMat);
      backPostL.position.set(-0.22, 0.7, -0.22);
      const backPostR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.48, 0.05), mainMat);
      backPostR.position.set(0.22, 0.7, -0.22);
      const backRest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.05), mainMat);
      backRest.position.set(0, 0.82, -0.22);
      root.add(backPostL, backPostR, backRest);
    } else if (p.type === 'ladder') {
      // Composite Bamboo Stunt Ladder (2 side rails + 6 rungs)
      for (const side of [-0.26, 0.26]) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.1, 8), bambooMat);
        rail.position.set(side, 1.05, 0);
        rail.castShadow = !this.isSoftwareGl;
        root.add(rail);
      }
      for (let r = 0; r < 6; r++) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.54, 8), bambooMat);
        rung.rotation.z = Math.PI / 2;
        rung.position.set(0, 0.28 + r * 0.3, 0);
        root.add(rung);
      }
    } else if (p.type === 'barrel') {
      // Coopered Wine Barrel with iron hoops
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.4, 0.92, 14), mainMat);
      body.position.y = 0.46;
      body.castShadow = !this.isSoftwareGl;
      root.add(body);

      for (const hy of [0.2, 0.46, 0.72]) {
        const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.435, 0.435, 0.05, 14), darkMetalMat);
        hoop.position.y = hy;
        root.add(hoop);
      }
    } else if (p.type === 'crate') {
      // Cargo Crate with battens
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.78, 0.84), mainMat);
      box.position.y = 0.39;
      box.castShadow = !this.isSoftwareGl;
      root.add(box);

      const rimTop = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.07, 0.88), darkMetalMat);
      rimTop.position.y = 0.75;
      const rimBot = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.07, 0.88), darkMetalMat);
      rimBot.position.y = 0.04;
      root.add(rimTop, rimBot);
    } else if (p.type === 'bamboo_pole') {
      // Long Martial Arts Bamboo Pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 2.5, 10), bambooMat);
      pole.position.y = 1.25;
      pole.rotation.z = 0.18;
      pole.castShadow = !this.isSoftwareGl;
      root.add(pole);
    } else if (p.type === 'pillar') {
      // Ornate Crimson Lacquer Temple Pillar + Plinth + Glowing Lantern
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x991b1b,
        roughness: 0.32,
        metalness: 0.18,
      });
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.62, 0.35, 16), darkMetalMat);
      plinth.position.y = 0.175;
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 3.8, 16), pillarMat);
      column.position.y = 1.9;
      column.castShadow = !this.isSoftwareGl;
      const capital = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.28, 1.15), mainMat);
      capital.position.y = 3.85;
      root.add(plinth, column, capital);
    }

    this.scene.add(root);
    return { root, shadowDisc, mainMat };
  }

  public syncSceneWithEngine(fullReset = false): void {
    if (fullReset) {
      this.rebuildBackdropArchitecture();
      for (const rig of this.fighterRigs.values()) {
        this.scene.remove(rig.root);
      }
      this.fighterRigs.clear();
      for (const rig of this.propRigs.values()) {
        this.scene.remove(rig.root);
      }
      this.propRigs.clear();
    }

    // 1. Sync Fighter Rigs
    const activeFighterIds = new Set<string>();
    for (const f of this.engine.fighters) {
      activeFighterIds.add(f.id);
      let rig = this.fighterRigs.get(f.id);
      if (!rig) {
        rig = this.createFighterVisualRig(f);
        this.fighterRigs.set(f.id, rig);
      }

      // Hit flash visual feedback
      if (f.hitFlash > 0.1) {
        rig.clothMat.emissive.setHex(0xffffff);
        rig.clothMat.emissiveIntensity = f.hitFlash * 0.65;
      } else {
        rig.clothMat.emissive.setHex(0x000000);
        rig.clothMat.emissiveIntensity = 0;
      }

      const b = f.bones;
      const yaw = f.visualYaw ?? f.facingAngle;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const rightX = -sin;
      const rightZ = cos;

      rig.shadowDisc.position.set(b.pelvis.pos.x, 0.015, b.pelvis.pos.z);

      rig.pelvisMesh.position.set(b.pelvis.pos.x, b.pelvis.pos.y, b.pelvis.pos.z);
      rig.pelvisMesh.rotation.set(0, -yaw + Math.PI / 2, 0);

      rig.torsoGroup.position.set(b.torso.pos.x, b.torso.pos.y, b.torso.pos.z);
      rig.torsoGroup.rotation.order = 'YXZ';
      rig.torsoGroup.rotation.y = -yaw + Math.PI / 2;
      rig.torsoGroup.scale.set(f.scaleX, f.scaleY, f.scaleX);
      if (f.ragdollBlend > 0.5) {
        rig.torsoGroup.rotation.x = Math.sin(f.stateTimer * 9) * 0.85;
        rig.torsoGroup.rotation.z = Math.cos(f.stateTimer * 7) * 0.65;
      } else {
        rig.torsoGroup.rotation.x = f.torsoPitch ?? 0.1;
        rig.torsoGroup.rotation.z = f.torsoRoll ?? 0;
      }

      rig.headGroup.position.set(b.head.pos.x, b.head.pos.y, b.head.pos.z);
      rig.headGroup.rotation.y = -yaw + Math.PI / 2;

      // Compute anatomical hip & shoulder sockets in world space so thighs and arms never cross or gap
      const hipL: Vec3 = {
        x: b.pelvis.pos.x + rightX * -0.14,
        y: b.pelvis.pos.y,
        z: b.pelvis.pos.z + rightZ * -0.14,
      };
      const hipR: Vec3 = {
        x: b.pelvis.pos.x + rightX * 0.14,
        y: b.pelvis.pos.y,
        z: b.pelvis.pos.z + rightZ * 0.14,
      };
      const shoulderL: Vec3 = {
        x: b.torso.pos.x + rightX * -0.20,
        y: b.torso.pos.y + 0.12,
        z: b.torso.pos.z + rightZ * -0.20,
      };
      const shoulderR: Vec3 = {
        x: b.torso.pos.x + rightX * 0.20,
        y: b.torso.pos.y + 0.12,
        z: b.torso.pos.z + rightZ * 0.20,
      };

      // Orient 8 articulated upper/lower limb segments between sockets and IK bones
      this.orientLimbSegment(rig.upperArmL, shoulderL, b.elbowL.pos, 0.96);
      this.orientLimbSegment(rig.lowerArmL, b.elbowL.pos, b.handL.pos, 0.86);
      this.orientLimbSegment(rig.upperArmR, shoulderR, b.elbowR.pos, 0.96);
      this.orientLimbSegment(rig.lowerArmR, b.elbowR.pos, b.handR.pos, 0.86);

      this.orientLimbSegment(rig.upperLegL, hipL, b.kneeL.pos, 1.15);
      this.orientLimbSegment(rig.lowerLegL, b.kneeL.pos, b.footL.pos, 1.0);
      this.orientLimbSegment(rig.upperLegR, hipR, b.kneeR.pos, 1.15);
      this.orientLimbSegment(rig.lowerLegR, b.kneeR.pos, b.footR.pos, 1.0);

      // Position spherical knee caps, fists, and oriented kung-fu shoes
      rig.kneeCapL.position.set(b.kneeL.pos.x, b.kneeL.pos.y, b.kneeL.pos.z);
      rig.kneeCapR.position.set(b.kneeR.pos.x, b.kneeR.pos.y, b.kneeR.pos.z);
      rig.fistL.position.set(b.handL.pos.x, b.handL.pos.y, b.handL.pos.z);
      rig.fistR.position.set(b.handR.pos.x, b.handR.pos.y, b.handR.pos.z);

      rig.footShoeL.position.set(b.footL.pos.x, b.footL.pos.y, b.footL.pos.z);
      rig.footShoeL.rotation.y = -yaw + Math.PI / 2;
      rig.footShoeR.position.set(b.footR.pos.x, b.footR.pos.y, b.footR.pos.z);
      rig.footShoeR.rotation.y = -yaw + Math.PI / 2;
    }

    // Remove stale fighter rigs
    for (const [id, rig] of this.fighterRigs.entries()) {
      if (!activeFighterIds.has(id)) {
        this.scene.remove(rig.root);
        this.fighterRigs.delete(id);
      }
    }

    // 2. Sync Interactive Prop Rigs
    const activePropIds = new Set<string>();
    for (const p of this.engine.props) {
      activePropIds.add(p.id);
      let rig = this.propRigs.get(p.id);
      if (!rig) {
        rig = this.createPropVisualRig(p);
        this.propRigs.set(p.id, rig);
      }

      rig.root.visible = !p.broken;
      if (!p.broken) {
        rig.root.position.set(p.pos.x, p.pos.y, p.pos.z);
        rig.root.rotation.set(p.rot.x, p.rot.y, p.rot.z);
        rig.shadowDisc.position.y = Math.max(0.015 - p.pos.y, -2);
        if (p.hitFlash > 0.1) {
          rig.mainMat.emissive.setHex(0xf59e0b);
          rig.mainMat.emissiveIntensity = p.hitFlash * 0.5;
        } else {
          rig.mainMat.emissive.setHex(0x000000);
          rig.mainMat.emissiveIntensity = 0;
        }
      }
    }

    for (const [id, rig] of this.propRigs.entries()) {
      if (!activePropIds.has(id)) {
        this.scene.remove(rig.root);
        this.propRigs.delete(id);
      }
    }
  }

  private updateCameraChoreography(dt: number): void {
    const hero = this.engine.getHero();
    if (!hero) return;

    this.directorSwitchTimer += dt;
    if (this.directorSwitchTimer > 5.5) {
      this.directorSwitchTimer = 0;
      this.directorAngleIndex = (this.directorAngleIndex + 1) % 3;
    }

    _lookGoal.set(hero.pos.x * 0.75, hero.pos.y + 1.15, hero.pos.z * 0.75);

    if (this.cameraMode === 'orbit') {
      if (!this.isDragging) {
        this.orbitYaw += dt * 0.28;
      }
      const horiz = Math.cos(this.orbitPitch) * this.orbitDistance;
      _camGoal.set(
        _lookGoal.x + Math.sin(this.orbitYaw) * horiz,
        Math.max(1.4, Math.sin(this.orbitPitch) * this.orbitDistance),
        _lookGoal.z + Math.cos(this.orbitYaw) * horiz
      );
    } else if (this.cameraMode === 'close_stunt') {
      const angle = this.engine.elapsedSeconds * 0.35;
      _camGoal.set(
        hero.pos.x + Math.cos(angle) * 5.2,
        2.35,
        hero.pos.z + Math.sin(angle) * 5.2
      );
    } else if (this.cameraMode === 'wide_cinema') {
      const slowPan = Math.sin(this.engine.elapsedSeconds * 0.18) * 3.5;
      _camGoal.set(slowPan, 7.8, 13.8);
      _lookGoal.set(0, 1.0, 0);
    } else {
      // Auto Director Mode: dynamically zooms in on stunts and cuts between classic Hong Kong angles
      const isStuntActive = hero.state === 'stunt';
      const dist = isStuntActive ? 5.8 : this.directorAngleIndex === 0 ? 8.6 : 10.2;
      const height = isStuntActive ? 2.4 : this.directorAngleIndex === 1 ? 5.8 : 3.8;
      const orbitOffset = this.directorAngleIndex * 1.1 + this.engine.elapsedSeconds * 0.22;

      _camGoal.set(
        hero.pos.x * 0.6 + Math.sin(orbitOffset) * dist,
        height,
        hero.pos.z * 0.6 + Math.cos(orbitOffset) * dist
      );
    }

    // Frame-rate independent exponential damping
    const dampFactor = 1 - Math.exp(-5.5 * dt);
    this.currentCamPos.lerp(_camGoal, dampFactor);
    this.currentLookAt.lerp(_lookGoal, dampFactor);

    // Apply decaying trauma * trauma impact shake
    const shake = this.engine.cameraTrauma * this.engine.cameraTrauma * 0.24;
    this.camera.position.set(
      this.currentCamPos.x + (Math.random() - 0.5) * shake,
      this.currentCamPos.y + (Math.random() - 0.5) * shake,
      this.currentCamPos.z + (Math.random() - 0.5) * shake
    );
    this.camera.lookAt(this.currentLookAt);
  }

  private bindInteractionEvents(): void {
    const dom = this.renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      this.isDragging = true;
      this.dragPrevX = e.clientX;
      this.dragPrevY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragPrevX;
      const dy = e.clientY - this.dragPrevY;
      this.dragPrevX = e.clientX;
      this.dragPrevY = e.clientY;
      this.orbitYaw -= dx * 0.007;
      this.orbitPitch = Math.max(0.15, Math.min(1.25, this.orbitPitch + dy * 0.006));
      if (this.cameraMode !== 'orbit') {
        this.cameraMode = 'orbit';
      }
    };

    const onPointerUp = () => {
      this.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      this.orbitDistance = Math.max(4.5, Math.min(18, this.orbitDistance + e.deltaY * 0.008));
    };

    const onResize = () => {
      if (this.disposed) return;
      const w = Math.max(1, this.container.clientWidth || window.innerWidth);
      const h = Math.max(1, this.container.clientHeight || window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('resize', onResize);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || !gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;

      const now = performance.now();
      const rawDt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      if (!this.paused) {
        const simDt = rawDt * this.timeScale;
        const events = this.engine.step(simDt);
        for (const ev of events) {
          this.audio.playEvent(ev);
          if (ev.type === 'scene_reset') {
            this.syncSceneWithEngine(true);
          } else if (ev.type === 'prop_break') {
            this.spawnParticles(ev.pos, 22, ev.debrisKind ?? 'wood');
          } else if (ev.type === 'heavy_hit' || ev.type === 'ko') {
            this.spawnParticles(ev.pos, 16, 'spark');
          } else if (ev.type === 'hit') {
            this.spawnParticles(ev.pos, 7, 'spark');
          }
        }
        this.syncSceneWithEngine(false);
        this.updateParticles(rawDt);
        this.updateCameraChoreography(rawDt);

        // Throttle React HUD state updates to ~8 Hz so React never stalls 60Hz WebGL
        if (now - this.lastHudSyncTime > 125) {
          this.lastHudSyncTime = now;
          this.onStatsUpdate(this.engine.getStats());
        }
      }

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
