import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AntSimulation } from '../sim/antSimulation';
import { CameraDirector } from '../sim/cameraDirector';
import type {
  AtmospherePreset,
  FactionId,
  HudSnapshot,
  SimulationConfig,
  WorldData,
} from '../sim/types';
import { generateWorld, mulberry32 } from '../sim/worldGen';
import {
  createAntAppendagesGeometry,
  createAntBodyGeometry,
  createCargoGeometry,
  createFortificationGroup,
  createGrassTuftGeometry,
  createQueenAntGroup,
  createSculptedRockGeometry,
  createShatteredTreeStump,
  type FortMaterialSet,
} from './geometries';
import { createProceduralTextures, type ProceduralTexturePack } from './textures';

interface AtmosphereColors {
  sky: number;
  fog: number;
  fogDensity: number;
  sunColor: number;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  rimColor: number;
  rimIntensity: number;
}

const ATMOSPHERES: Record<AtmospherePreset, AtmosphereColors> = {
  sunset: {
    sky: 0xc98b63,
    fog: 0xb98260,
    fogDensity: 0.0082,
    sunColor: 0xffc684,
    sunIntensity: 2.35,
    sunPos: [-52, 34, -38],
    hemiSky: 0x8ea8c9,
    hemiGround: 0x4b3828,
    hemiIntensity: 0.85,
    rimColor: 0x7da4d6,
    rimIntensity: 0.55,
  },
  mist: {
    sky: 0x9fb0b8,
    fog: 0x99a9b0,
    fogDensity: 0.0105,
    sunColor: 0xffe4be,
    sunIntensity: 1.95,
    sunPos: [44, 42, -32],
    hemiSky: 0xbcd0df,
    hemiGround: 0x454036,
    hemiIntensity: 1.0,
    rimColor: 0x9cb8cc,
    rimIntensity: 0.45,
  },
  overcast: {
    sky: 0x7e8589,
    fog: 0x777e82,
    fogDensity: 0.0092,
    sunColor: 0xf4e3cc,
    sunIntensity: 1.65,
    sunPos: [18, 56, 26],
    hemiSky: 0x9eaab5,
    hemiGround: 0x3b3329,
    hemiIntensity: 1.1,
    rimColor: 0x8aa0b5,
    rimIntensity: 0.4,
  },
};

const MAX_ANTS = 600;
const MAX_BURSTS = 64;
const MAX_PROJECTILES = 20;

// Module-scope reusable scratch objects (zero GC in render loop)
const _dummy = new THREE.Object3D();
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecC = new THREE.Vector3();
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _upVec = new THREE.Vector3(0, 1, 0);
const _camQuat = new THREE.Quaternion();
const _bankQuat = new THREE.Quaternion();
const _ugFogColor = new THREE.Color(0x28180e);

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export interface AntWarSceneCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onUserManualControl: () => void;
  onWebglError?: (message: string) => void;
}

export class AntWarScene {
  private container: HTMLElement;
  private callbacks: AntWarSceneCallbacks;
  private config: SimulationConfig;

  private isSoftwareGl: boolean;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private textures!: ProceduralTexturePack;

  // Lights
  private sunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private rimLight!: THREE.DirectionalLight;
  private cameraLamp!: THREE.PointLight;
  private undergroundLights: THREE.PointLight[] = [];

  // Dynamic world root (rebuilt cleanly on New World)
  private worldGroup = new THREE.Group();
  private world!: WorldData;
  private sim!: AntSimulation;
  private director!: CameraDirector;

  // Shared geometries & materials
  private antBodyGeo!: THREE.BufferGeometry;
  private antAppGeo!: THREE.BufferGeometry;
  private cargoGeo!: THREE.BufferGeometry;
  private shadowDiscGeo!: THREE.CircleGeometry;
  private projGeo!: THREE.SphereGeometry;
  private burstGeo!: THREE.IcosahedronGeometry;

  private antBodyMesh!: THREE.InstancedMesh;
  private antAppMesh!: THREE.InstancedMesh;
  private antCargoMesh!: THREE.InstancedMesh;
  private antShadowMesh!: THREE.InstancedMesh;
  private projMesh!: THREE.InstancedMesh;
  private burstMesh!: THREE.InstancedMesh;
  private fortMeshes = new Map<number, THREE.Group>();
  private fortMaterials!: FortMaterialSet;

  // Loop & lifecycle
  private disposed = false;
  private frameId = 0;
  private lastNow = 0;
  private hudAccum = 0.25;
  private lastShotLabel = 'Панорамный облет долины';
  private lastUndergroundFactor = 0;
  private resizeObserver: ResizeObserver | null = null;
  private pendingResize = false;

  constructor(
    container: HTMLElement,
    initialSeed: number,
    initialConfig: SimulationConfig,
    callbacks: AntWarSceneCallbacks,
  ) {
    this.container = container;
    this.config = { ...initialConfig };
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.initRendererAndScene();
    this.initSharedMeshes();
    this.loadWorld(initialSeed);
    this.attachEvents();

    this.lastNow = performance.now();
    this.tick();
  }

  private initRendererAndScene(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.isSoftwareGl,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('data-testid', 'ant-war-canvas');
    this.container.appendChild(canvas);

    this.scene = new THREE.Scene();

    // Mandatory Studio Environment Reflection via RoomEnvironment
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    // Procedural Textures
    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());

    // Camera
    this.camera = new THREE.PerspectiveCamera(52, width / height, 0.25, 290);
    this.camera.position.set(-6, 18, 34);

    // OrbitControls (only active in manual 'free' mode)
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.maxDistance = 95;
    this.controls.minDistance = 3;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.enabled = this.config.cameraMode === 'free';

    // Three-point warm/cool outdoor rig (single shadow caster)
    this.sunLight = new THREE.DirectionalLight(0xffc684, 2.35);
    this.sunLight.position.set(-52, 34, -38);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 165;
    const d = 62;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    this.hemiLight = new THREE.HemisphereLight(0x8ea8c9, 0x4b3828, 0.85);
    this.scene.add(this.hemiLight);

    this.rimLight = new THREE.DirectionalLight(0x7da4d6, 0.55);
    this.rimLight.position.set(48, 22, 42);
    this.scene.add(this.rimLight);

    // Subterranean explorer headlamp attached to camera (ramps up inside underground tunnels)
    this.cameraLamp = new THREE.PointLight(0xffcf8b, 0.0, 26, 1.5);
    this.cameraLamp.visible = false;
    this.scene.add(this.cameraLamp);

    this.scene.add(this.worldGroup);
    this.applyAtmosphere(this.config.atmosphere, 0);
  }

  private initSharedMeshes(): void {
    // Shared fortification materials (calibrated roughness variance >= 0.25)
    this.fortMaterials = {
      wood: new THREE.MeshStandardMaterial({
        map: this.textures.woodAlbedo,
        color: 0xffffff,
        roughness: 0.84,
        metalness: 0.04,
      }),
      burlap: new THREE.MeshStandardMaterial({
        map: this.textures.burlapAlbedo,
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.0,
      }),
      darkSteel: new THREE.MeshStandardMaterial({
        color: 0x3a3e44,
        roughness: 0.34,
        metalness: 0.72,
      }),
      stone: new THREE.MeshStandardMaterial({
        map: this.textures.soilAlbedo,
        bumpMap: this.textures.soilBump,
        bumpScale: 0.3,
        color: 0x5c5347,
        roughness: 0.92,
        metalness: 0.04,
      }),
      redFlag: new THREE.MeshStandardMaterial({
        color: 0xc83e26,
        roughness: 0.68,
        metalness: 0.05,
      }),
      blackFlag: new THREE.MeshStandardMaterial({
        color: 0xd9a441,
        roughness: 0.55,
        metalness: 0.12,
      }),
      resinGlow: new THREE.MeshStandardMaterial({
        color: 0xb9df49,
        emissive: 0x66941a,
        emissiveIntensity: 0.85,
        roughness: 0.22,
        metalness: 0.05,
      }),
    };

    // Composite Instanced Ant Meshes (glossy chitin body + matte appendages/helmets + carried cargo)
    this.antBodyGeo = createAntBodyGeometry();
    const antBodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.26,
      metalness: 0.14,
    });
    this.antBodyMesh = new THREE.InstancedMesh(this.antBodyGeo, antBodyMat, MAX_ANTS);
    this.antBodyMesh.frustumCulled = false;
    this.antBodyMesh.castShadow = !this.isSoftwareGl;
    this.antBodyMesh.receiveShadow = true;
    this.scene.add(this.antBodyMesh);

    this.antAppGeo = createAntAppendagesGeometry();
    const antAppMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0.05,
    });
    this.antAppMesh = new THREE.InstancedMesh(this.antAppGeo, antAppMat, MAX_ANTS);
    this.antAppMesh.frustumCulled = false;
    this.scene.add(this.antAppMesh);

    this.cargoGeo = createCargoGeometry();
    const cargoMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.52,
      metalness: 0.04,
    });
    this.antCargoMesh = new THREE.InstancedMesh(this.cargoGeo, cargoMat, MAX_ANTS);
    this.antCargoMesh.frustumCulled = false;
    this.scene.add(this.antCargoMesh);

    // Contact grounding shadows beneath surface ants
    this.shadowDiscGeo = new THREE.CircleGeometry(0.42, 8);
    this.shadowDiscGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x120d08,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    this.antShadowMesh = new THREE.InstancedMesh(this.shadowDiscGeo, shadowMat, MAX_ANTS);
    this.antShadowMesh.frustumCulled = false;
    this.scene.add(this.antShadowMesh);

    // Acid Mortar Projectiles
    this.projGeo = new THREE.SphereGeometry(0.32, 8, 6);
    const projMat = new THREE.MeshStandardMaterial({
      color: 0xd4ff5c,
      emissive: 0x8ad61f,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });
    this.projMesh = new THREE.InstancedMesh(this.projGeo, projMat, MAX_PROJECTILES);
    this.projMesh.frustumCulled = false;
    this.scene.add(this.projMesh);

    // Impact / Skirmish / Dust Burst Puffs
    this.burstGeo = new THREE.IcosahedronGeometry(0.55, 1);
    const burstMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 0.72,
    });
    this.burstMesh = new THREE.InstancedMesh(this.burstGeo, burstMat, MAX_BURSTS);
    this.burstMesh.frustumCulled = false;
    this.scene.add(this.burstMesh);
  }

  public loadWorld(seed: number): void {
    // Clean up previous world meshes safely
    this.clearWorldGroup();
    this.fortMeshes.clear();
    this.undergroundLights = [];

    this.world = generateWorld(seed);
    this.sim = new AntSimulation(this.world, this.config);
    if (!this.director) {
      this.director = new CameraDirector(this.world);
    } else {
      this.director.resetForWorld(this.world);
    }

    this.buildTerrainMesh();
    this.buildTrenchDuckboards();
    this.buildUndergroundNetwork();
    this.buildFortifications();
    this.buildFoodSitesAndProps();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private clearWorldGroup(): void {
    while (this.worldGroup.children.length > 0) {
      const child = this.worldGroup.children[0];
      this.worldGroup.remove(child);
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          if (
            m.geometry &&
            m.geometry !== this.antBodyGeo &&
            m.geometry !== this.antAppGeo &&
            m.geometry !== this.cargoGeo
          ) {
            m.geometry.dispose();
          }
          // Dispose per-world materials (not shared fortMaterials)
          const sharedSet = new Set(Object.values(this.fortMaterials));
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            if (mat && !sharedSet.has(mat as THREE.MeshStandardMaterial)) {
              mat.dispose();
            }
          }
        }
      });
    }
  }

  private buildTerrainMesh(): void {
    const size = this.world.worldRadius * 2;
    const segs = 96;
    const plane = new THREE.PlaneGeometry(size, size, segs, segs);
    plane.rotateX(-Math.PI / 2);

    const pos = plane.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const portalFlags = new Uint8Array(pos.count);

    const colMud = new THREE.Color(0x634d39);
    const colNoMans = new THREE.Color(0x524030);
    const colGrass = new THREE.Color(0x566238);
    const colRidge = new THREE.Color(0x475234);
    const colRedMound = new THREE.Color(0x8e4c2e);
    const colBlackMound = new THREE.Color(0x4a433d);
    const colTrench = new THREE.Color(0x3a2d21);
    const colBurrowShadow = new THREE.Color(0x160e08);

    const redM = this.world.mounds.red;
    const blackM = this.world.mounds.black;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.world.heightAt(x, z);
      pos.setY(i, y);

      const pMask = this.world.portalMaskAt(x, z);
      if (pMask > 0.34) portalFlags[i] = 1;

      // Biome vertex coloring
      const distCenter = Math.abs(x);
      const distOrig = Math.hypot(x, z);
      const dRed = Math.hypot(x - redM.x, z - redM.z);
      const dBlack = Math.hypot(x - blackM.x, z - blackM.z);

      _colorA.copy(colMud);
      if (distCenter < 18) {
        _colorA.lerp(colNoMans, 1 - distCenter / 18);
      }
      if (distOrig > 34) {
        const gT = Math.min(1, (distOrig - 34) / 28);
        _colorA.lerp(colGrass, gT * 0.85);
      }
      if (distOrig > this.world.playableRadius) {
        const rT = Math.min(1, (distOrig - this.world.playableRadius) / 30);
        _colorA.lerp(colRidge, rT * 0.7);
      }
      if (dRed < redM.radius * 1.45) {
        const mT = Math.max(0, 1 - dRed / (redM.radius * 1.45));
        _colorA.lerp(colRedMound, mT * 0.9);
      }
      if (dBlack < blackM.radius * 1.45) {
        const mT = Math.max(0, 1 - dBlack / (blackM.radius * 1.45));
        _colorA.lerp(colBlackMound, mT * 0.88);
      }
      if (this.world.isInTrench(x, z)) {
        _colorA.lerp(colTrench, 0.72);
      }
      if (pMask > 0.04) {
        _colorA.lerp(colBurrowShadow, Math.min(1, pMask * 1.45));
      }

      colors[i * 3] = _colorA.r;
      colors[i * 3 + 1] = _colorA.g;
      colors[i * 3 + 2] = _colorA.b;
    }

    // Cut real open holes right over the anthill burrow mouths using triangle centroids
    const oldIndex = plane.getIndex();
    if (oldIndex) {
      const arr = oldIndex.array;
      const filtered: number[] = [];
      for (let i = 0; i < arr.length; i += 3) {
        const a = arr[i];
        const b = arr[i + 1];
        const c = arr[i + 2];
        const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
        const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
        if (this.world.portalMaskAt(cx, cz) > 0.36 || (portalFlags[a] && portalFlags[b] && portalFlags[c])) {
          continue; // True open burrow hole!
        }
        filtered.push(a, b, c);
      }
      plane.setIndex(filtered);
    }

    plane.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    plane.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      map: this.textures.soilAlbedo,
      bumpMap: this.textures.soilBump,
      bumpScale: 0.35,
      vertexColors: true,
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(plane, terrainMat);
    mesh.receiveShadow = true;
    this.worldGroup.add(mesh);

    // Sculpt seamless terrain-conforming dark earthen burrow funnels & grounded timber entrance frames
    const portalCoords = [
      { pos: redM.portalPos, dir: 1, faction: 'red' as FactionId, radius: 2.15 },
      { pos: redM.exitPortalPos, dir: -1, faction: 'red' as FactionId, radius: 1.9 },
      { pos: blackM.portalPos, dir: -1, faction: 'black' as FactionId, radius: 2.15 },
      { pos: blackM.exitPortalPos, dir: 1, faction: 'black' as FactionId, radius: 1.9 },
    ];

    const funnelMat = new THREE.MeshStandardMaterial({
      map: this.textures.soilAlbedo,
      bumpMap: this.textures.soilBump,
      bumpScale: 0.4,
      vertexColors: true,
      color: 0xffffff,
      roughness: 0.96,
      metalness: 0.0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const clodGeo = new THREE.DodecahedronGeometry(0.32, 0);
    const rngPortal = mulberry32(this.world.seed + 8821);

    for (const p of portalCoords) {
      const moundCol = p.faction === 'red' ? colRedMound : colBlackMound;
      const radialSegs = 24;
      // Build custom flared burrow throat whose outer skirt blends seamlessly into the anthill slope
      // and curves smoothly downward into a deep dark hole connecting to the tunnel shaft
      const verts: number[] = [];
      const uvs: number[] = [];
      const vCols: number[] = [];
      const indices: number[] = [];

      const ringProfiles = [
        { radMul: 2.25, drop: -0.02, dark: 0.0 }, // Wide outer skirt tucked flush into hillside
        { radMul: 1.56, drop: 0.14, dark: 0.16 }, // Soft mounded spoil-earth rim around burrow
        { radMul: 1.15, drop: -0.1, dark: 0.52 }, // Rounded shadowed burrow lip
        { radMul: 0.94, drop: -1.1, dark: 0.88 }, // Steep dark earthen throat
        { radMul: 0.9, drop: -2.55, dark: 1.0 }, // Deep pitch-black shaft wall
        { radMul: 0.92, drop: -4.4, dark: 1.0 }, // Joins underground TubeGeometry cleanly
      ];
      const rings = ringProfiles.length;

      for (let r = 0; r < rings; r++) {
        const prof = ringProfiles[r];
        for (let s = 0; s <= radialSegs; s++) {
          const theta = (s / radialSegs) * Math.PI * 2;
          // Organic uneven burrow edge (zero mechanical circles)
          const wobble =
            1 +
            0.08 * Math.sin(theta * 3 + p.pos.x) +
            0.05 * Math.cos(theta * 5 + p.pos.z);
          const rad = p.radius * prof.radMul * wobble;
          const wx = p.pos.x + Math.cos(theta) * rad;
          const wz = p.pos.z + Math.sin(theta) * rad;

          let wy: number;
          if (r <= 1) {
            wy = this.world.heightAt(wx, wz) + prof.drop;
          } else {
            // Smoothly converge from sloped rim toward vertical tunnel shaft center
            const rimY = this.world.heightAt(wx, wz);
            const tCenter = (r - 1) / (rings - 1);
            const anchorY = rimY * (1 - tCenter * 0.72) + p.pos.y * (tCenter * 0.72);
            wy = anchorY + prof.drop;
          }

          verts.push(wx, wy, wz);
          uvs.push((s / radialSegs) * 3, r * 0.55);

          _colorA.copy(moundCol).lerp(colBurrowShadow, prof.dark);
          if (r >= 4) {
            _colorA.setHex(0x070402);
          }
          vCols.push(_colorA.r, _colorA.g, _colorA.b);
        }
      }

      const stride = radialSegs + 1;
      for (let r = 0; r < rings - 1; r++) {
        for (let s = 0; s < radialSegs; s++) {
          const i0 = r * stride + s;
          const i1 = i0 + 1;
          const i2 = (r + 1) * stride + s;
          const i3 = i2 + 1;
          indices.push(i0, i2, i1);
          indices.push(i1, i2, i3);
        }
      }

      const funnelGeo = new THREE.BufferGeometry();
      funnelGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      funnelGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      funnelGeo.setAttribute('color', new THREE.Float32BufferAttribute(vCols, 3));
      funnelGeo.setIndex(indices);
      funnelGeo.computeVertexNormals();

      const funnelMesh = new THREE.Mesh(funnelGeo, funnelMat);
      funnelMesh.receiveShadow = true;
      this.worldGroup.add(funnelMesh);

      // Small excavated dirt clods embedded naturally around the burrow lip
      const clodMat = new THREE.MeshStandardMaterial({
        color: p.faction === 'red' ? 0x6b3a23 : 0x3b352f,
        roughness: 0.94,
        flatShading: true,
      });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + (rngPortal() - 0.5) * 0.35;
        const dist = p.radius * (1.28 + rngPortal() * 0.35);
        const cx = p.pos.x + Math.cos(a) * dist;
        const cz = p.pos.z + Math.sin(a) * dist;
        const cy = this.world.heightAt(cx, cz);
        const clod = new THREE.Mesh(clodGeo, clodMat);
        clod.position.set(cx, cy + 0.04, cz);
        clod.rotation.set(rngPortal() * 2, rngPortal() * 3, rngPortal() * 2);
        clod.scale.set(0.8 + rngPortal() * 0.9, 0.45 + rngPortal() * 0.4, 0.8 + rngPortal() * 0.8);
        this.worldGroup.add(clod);
      }

      // Grounded WWI mine-mouth timber frame straddling the uphill side of the burrow hole
      // Plant each post individually into terrain height so nothing floats on the slope
      const postOffsetZ = p.radius * 1.18;
      const postOffsetX = -p.dir * 0.55;
      const leftX = p.pos.x + postOffsetX;
      const leftZ = p.pos.z - postOffsetZ;
      const rightX = p.pos.x + postOffsetX;
      const rightZ = p.pos.z + postOffsetZ;
      const leftGroundY = this.world.heightAt(leftX, leftZ);
      const rightGroundY = this.world.heightAt(rightX, rightZ);
      const beamY = Math.max(leftGroundY, rightGroundY) + 1.55;

      const leftH = beamY - leftGroundY + 0.55;
      const leftPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.17, leftH, 6),
        this.fortMaterials.wood,
      );
      leftPost.position.set(leftX, leftGroundY + leftH * 0.5 - 0.35, leftZ);
      leftPost.castShadow = true;
      this.worldGroup.add(leftPost);

      const rightH = beamY - rightGroundY + 0.55;
      const rightPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.17, rightH, 6),
        this.fortMaterials.wood,
      );
      rightPost.position.set(rightX, rightGroundY + rightH * 0.5 - 0.35, rightZ);
      rightPost.castShadow = true;
      this.worldGroup.add(rightPost);

      const span = postOffsetZ * 2 + 0.55;
      const lintel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, span, 6),
        this.fortMaterials.wood,
      );
      lintel.rotation.x = Math.PI * 0.5;
      lintel.position.set(postOffsetX + p.pos.x, beamY + 0.1, p.pos.z);
      lintel.castShadow = true;
      this.worldGroup.add(lintel);

      // Small faction pennant planted cleanly on the right post
      const flagPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 1.35, 5),
        this.fortMaterials.wood,
      );
      flagPole.position.set(rightX, beamY + 0.65, rightZ);
      this.worldGroup.add(flagPole);

      const flag = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.42, 0.05),
        p.faction === 'red' ? this.fortMaterials.redFlag : this.fortMaterials.blackFlag,
      );
      flag.position.set(rightX + p.dir * 0.45, beamY + 1.05, rightZ);
      flag.castShadow = true;
      this.worldGroup.add(flag);
    }
  }

  private buildTrenchDuckboards(): void {
    // Lay wooden WWI duckboard walkways along all trench bottoms (+0.04 Y offset for zero Z-fighting)
    const plankGeo = new THREE.BoxGeometry(1.5, 0.08, 2.0);
    const placements: { x: number; y: number; z: number; yaw: number }[] = [];

    for (const tr of this.world.trenches) {
      for (let i = 0; i < tr.points.length - 1; i++) {
        const a = tr.points[i];
        const b = tr.points[i + 1];
        const dist = Math.hypot(b.x - a.x, b.z - a.z);
        const steps = Math.max(1, Math.floor(dist / 2.3));
        const yaw = Math.atan2(b.x - a.x, b.z - a.z);
        for (let s = 0; s < steps; s++) {
          const t = (s + 0.5) / steps;
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          const y = this.world.heightAt(x, z) + 0.05;
          placements.push({ x, y, z, yaw });
        }
      }
    }

    const inst = new THREE.InstancedMesh(plankGeo, this.fortMaterials.wood, placements.length);
    inst.receiveShadow = true;
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(0, p.yaw, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    this.worldGroup.add(inst);
  }

  private buildUndergroundNetwork(): void {
    const tunnelMat = new THREE.MeshStandardMaterial({
      map: this.textures.tunnelAlbedo,
      bumpMap: this.textures.tunnelBump,
      bumpScale: 0.45,
      vertexColors: true,
      color: 0xd9b392,
      roughness: 0.9,
      metalness: 0.02,
      side: THREE.BackSide,
    });

    const chamberMat = new THREE.MeshStandardMaterial({
      map: this.textures.tunnelAlbedo,
      bumpMap: this.textures.tunnelBump,
      bumpScale: 0.5,
      color: 0xc99c74,
      roughness: 0.88,
      metalness: 0.02,
      side: THREE.BackSide,
    });

    const glowFungusMat = new THREE.MeshStandardMaterial({
      color: 0xffd07a,
      emissive: 0xd98628,
      emissiveIntensity: 1.45,
      roughness: 0.35,
    });

    const eggMat = new THREE.MeshStandardMaterial({
      color: 0xf6ebd2,
      emissive: 0x3b2c16,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.05,
    });

    // Rib support arches + glowing amber resin nodules placed along tunnel walls
    const ribMatrices: THREE.Matrix4[] = [];
    const noduleMatrices: THREE.Matrix4[] = [];
    const rng = mulberry32(this.world.seed + 7001);

    for (const tunnel of this.world.tunnels) {
      const curvePts = tunnel.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
      const curve = new THREE.CatmullRomCurve3(curvePts);
      const tubularSegs = Math.max(40, tunnel.points.length * 10);
      const radialSegs = 12;
      const tubeGeo = new THREE.TubeGeometry(curve, tubularSegs, tunnel.radius, radialSegs, false);

      // Shade main-shaft mouths smoothly into deep burrow darkness so sunlight never lights an orange rim inside the hole
      const tPos = tubeGeo.attributes.position;
      const tCols = new Float32Array(tPos.count * 3);
      const ringVerts = radialSegs + 1;
      for (let i = 0; i < tPos.count; i++) {
        const ringIdx = Math.floor(i / ringVerts);
        const u = ringIdx / tubularSegs;
        let shade = 1.0;
        if (tunnel.isMainShaft) {
          const edgeDist = Math.min(u, 1 - u);
          if (edgeDist < 0.11) {
            const k = edgeDist / 0.11;
            shade = 0.04 + 0.96 * k * k;
          }
        }
        tCols[i * 3] = shade;
        tCols[i * 3 + 1] = shade;
        tCols[i * 3 + 2] = shade;
      }
      tubeGeo.setAttribute('color', new THREE.BufferAttribute(tCols, 3));

      const tubeMesh = new THREE.Mesh(tubeGeo, tunnelMat);
      this.worldGroup.add(tubeMesh);

      // Timber WWI mine-gallery support rings & glowing bioluminescent/amber root nodules
      const ribCount = Math.floor(tunnel.points.length * 2.2);
      for (let i = 1; i < ribCount; i++) {
        const t = i / ribCount;
        if (tunnel.isMainShaft && (t < 0.11 || t > 0.89)) continue;
        const pt = curve.getPointAt(t);
        const tan = curve.getTangentAt(t).normalize();

        _dummy.position.copy(pt);
        _dummy.lookAt(_vecA.copy(pt).add(tan));
        _dummy.scale.setScalar(tunnel.radius * 0.94);
        _dummy.updateMatrix();
        ribMatrices.push(_dummy.matrix.clone());

        // Add warm glowing amber nodule along upper wall every second rib
        if (i % 2 === 0) {
          const side = i % 4 === 0 ? 1 : -1;
          _vecB.crossVectors(tan, _upVec).normalize();
          _dummy.position
            .copy(pt)
            .addScaledVector(_vecB, side * tunnel.radius * 0.82)
            .addScaledVector(_upVec, tunnel.radius * 0.45);
          _dummy.rotation.set(rng() * 3, rng() * 3, 0);
          _dummy.scale.setScalar(0.28 + rng() * 0.2);
          _dummy.updateMatrix();
          noduleMatrices.push(_dummy.matrix.clone());
        }
      }
    }

    if (ribMatrices.length > 0) {
      const ribGeo = new THREE.TorusGeometry(1.0, 0.085, 6, 12);
      const ribInst = new THREE.InstancedMesh(ribGeo, this.fortMaterials.wood, ribMatrices.length);
      for (let i = 0; i < ribMatrices.length; i++) {
        ribInst.setMatrixAt(i, ribMatrices[i]);
      }
      ribInst.instanceMatrix.needsUpdate = true;
      ribInst.computeBoundingSphere();
      this.worldGroup.add(ribInst);
    }

    if (noduleMatrices.length > 0) {
      const nodGeo = new THREE.DodecahedronGeometry(0.65, 0);
      const nodInst = new THREE.InstancedMesh(nodGeo, glowFungusMat, noduleMatrices.length);
      for (let i = 0; i < noduleMatrices.length; i++) {
        nodInst.setMatrixAt(i, noduleMatrices[i]);
      }
      nodInst.instanceMatrix.needsUpdate = true;
      nodInst.computeBoundingSphere();
      this.worldGroup.add(nodInst);
    }

    // Build vaulted underground chambers + Queens + warm subterranean PointLights (budget <= 4)
    let undergroundLightCount = 0;
    for (const chamber of this.world.chambers) {
      const domeGeo = new THREE.SphereGeometry(chamber.radius, 16, 12);
      domeGeo.scale(1.15, 0.78, 1.15);
      const dome = new THREE.Mesh(domeGeo, chamberMat);
      dome.position.set(chamber.center.x, chamber.center.y, chamber.center.z);
      this.worldGroup.add(dome);

      // Flat earthy floor inside chamber
      const floorGeo = new THREE.CircleGeometry(chamber.radius * 0.96, 14);
      floorGeo.rotateX(-Math.PI / 2);
      const floor = new THREE.Mesh(
        floorGeo,
        new THREE.MeshStandardMaterial({
          map: this.textures.tunnelAlbedo,
          color: 0x875f3e,
          roughness: 0.94,
        }),
      );
      floor.position.set(chamber.center.x, chamber.center.y - chamber.radius * 0.54, chamber.center.z);
      this.worldGroup.add(floor);

      const floorY = chamber.center.y - chamber.radius * 0.54;

      if (chamber.kind === 'queen') {
        const queen = createQueenAntGroup(chamber.faction, eggMat);
        queen.position.set(chamber.center.x, floorY, chamber.center.z);
        queen.rotation.y = chamber.faction === 'red' ? Math.PI * 0.35 : -Math.PI * 0.35;
        this.worldGroup.add(queen);

        if (undergroundLightCount < 4) {
          const light = new THREE.PointLight(
            chamber.faction === 'red' ? 0xffb366 : 0xffcc7a,
            14,
            18,
            1.4,
          );
          light.position.set(chamber.center.x, chamber.center.y + 0.6, chamber.center.z);
          light.visible = false;
          this.worldGroup.add(light);
          this.undergroundLights.push(light);
          undergroundLightCount++;
        }
      } else if (chamber.kind === 'brood') {
        // Mound of glowing pearlescent larvae/eggs
        const pileGeo = new THREE.SphereGeometry(0.2, 7, 5);
        pileGeo.scale(0.85, 0.75, 1.35);
        for (let e = 0; e < 14; e++) {
          const a = (e / 14) * Math.PI * 2;
          const rad = 0.4 + (e % 3) * 0.45;
          const egg = new THREE.Mesh(pileGeo, eggMat);
          egg.position.set(
            chamber.center.x + Math.cos(a) * rad,
            floorY + 0.16 + (e % 2) * 0.14,
            chamber.center.z + Math.sin(a) * rad,
          );
          egg.rotation.set(e * 0.4, a, 0.2);
          this.worldGroup.add(egg);
        }
        if (undergroundLightCount < 4) {
          const light = new THREE.PointLight(0xffcb82, 11, 16, 1.4);
          light.position.set(chamber.center.x, chamber.center.y + 0.5, chamber.center.z);
          light.visible = false;
          this.worldGroup.add(light);
          this.undergroundLights.push(light);
          undergroundLightCount++;
        }
      } else if (chamber.kind === 'storage') {
        // Golden seed & amber food stash
        const seedGeo = new THREE.DodecahedronGeometry(0.28, 0);
        const seedMat = new THREE.MeshStandardMaterial({
          color: 0xe3b448,
          roughness: 0.45,
          metalness: 0.08,
        });
        for (let s = 0; s < 12; s++) {
          const a = (s / 12) * Math.PI * 2;
          const rad = 0.4 + (s % 3) * 0.45;
          const seed = new THREE.Mesh(seedGeo, seedMat);
          seed.position.set(
            chamber.center.x + Math.cos(a) * rad,
            floorY + 0.2 + (s % 2) * 0.18,
            chamber.center.z + Math.sin(a) * rad,
          );
          this.worldGroup.add(seed);
        }
      }
    }
  }

  private buildFortifications(): void {
    for (const fort of this.sim.fortifications) {
      const group = createFortificationGroup(fort.type, fort.faction, this.fortMaterials);
      group.position.set(fort.x, fort.y - 0.06, fort.z);
      group.rotation.y = fort.yaw;
      const sY = 0.25 + 0.75 * fort.progress;
      group.scale.set(1, sY, 1);
      this.worldGroup.add(group);
      this.fortMeshes.set(fort.id, group);
    }
  }

  private buildFoodSitesAndProps(): void {
    const rng = mulberry32(this.world.seed + 31337);

    // 1. Food Resource Sites (instanced golden seeds & amber resin droplets)
    const seedMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.08,
    });
    const seedGeo = new THREE.SphereGeometry(0.32, 6, 5);
    seedGeo.scale(0.85, 0.72, 1.35);
    const totalFoodPieces = this.world.foodSites.length * 6;
    const foodInst = new THREE.InstancedMesh(seedGeo, seedMat, totalFoodPieces);
    foodInst.castShadow = !this.isSoftwareGl;
    let fIdx = 0;
    for (const site of this.world.foodSites) {
      _colorA.setHex(site.kind === 'resin' ? 0xf0932b : 0xe8b948);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + rng() * 0.5;
        const r = 0.35 + rng() * 0.85;
        const px = site.x + Math.cos(a) * r;
        const pz = site.z + Math.sin(a) * r;
        const py = this.world.heightAt(px, pz) + 0.16;
        _dummy.position.set(px, py, pz);
        _dummy.rotation.set(rng() * 0.5, a, rng() * 0.5);
        _dummy.scale.setScalar(0.85 + rng() * 0.45);
        _dummy.updateMatrix();
        foodInst.setMatrixAt(fIdx, _dummy.matrix);
        foodInst.setColorAt(fIdx, _colorA);
        fIdx++;
      }
    }
    foodInst.instanceMatrix.needsUpdate = true;
    if (foodInst.instanceColor) foodInst.instanceColor.needsUpdate = true;
    foodInst.computeBoundingSphere();
    this.worldGroup.add(foodInst);

    // 2. Instanced Sculpted Faceted Rocks & Boulders (earthy dark sRGB hex palette)
    const rockCount = 90;
    const rockGeo = createSculptedRockGeometry();
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    });
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rockInst.castShadow = !this.isSoftwareGl;
    rockInst.receiveShadow = true;

    const rockPalette = [0x4c4338, 0x595044, 0x3e372f, 0x625747, 0x454337];
    let rockIdx = 0;
    for (let i = 0; i < rockCount * 2 && rockIdx < rockCount; i++) {
      const angle = rng() * Math.PI * 2;
      const rad = i < 42 ? 12 + rng() * 42 : 48 + rng() * 44;
      const rx = Math.cos(angle) * rad;
      const rz = Math.sin(angle) * rad;
      if (this.world.portalMaskAt(rx, rz) > 0.1 || this.world.isInTrench(rx, rz)) continue;
      const ry = this.world.heightAt(rx, rz);
      const sx = (0.55 + rng() * 1.35) * (rad > 50 ? 2.0 : 1.0);
      const sy = sx * (0.42 + rng() * 0.42);
      const sz = sx * (0.75 + rng() * 0.5);
      _dummy.position.set(rx, ry + sy * 0.12, rz);
      _dummy.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3);
      _dummy.scale.set(sx, sy, sz);
      _dummy.updateMatrix();
      rockInst.setMatrixAt(rockIdx, _dummy.matrix);

      _colorA.setHex(rockPalette[Math.floor(rng() * rockPalette.length)]);
      rockInst.setColorAt(rockIdx, _colorA);
      rockIdx++;
    }
    rockInst.count = rockIdx;
    rockInst.instanceMatrix.needsUpdate = true;
    if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
    rockInst.computeBoundingSphere();
    this.worldGroup.add(rockInst);

    // 3. Instanced Multi-Blade Dried Meadow Grass Tufts (dark olive & autumn straw hex palette)
    const grassCount = 240;
    const tuftGeo = createGrassTuftGeometry();
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.0,
    });
    const grassInst = new THREE.InstancedMesh(tuftGeo, bladeMat, grassCount);
    const grassPalette = [0x4c572b, 0x5c5b2f, 0x6b5a32, 0x3d4924, 0x736238];
    let gIdx = 0;
    for (let i = 0; i < grassCount * 2 && gIdx < grassCount; i++) {
      const a = rng() * Math.PI * 2;
      const dist = 25 + rng() * 58;
      const gx = Math.cos(a) * dist;
      const gz = Math.sin(a) * dist;
      if (Math.abs(gx) < 16 && Math.abs(gz) < 28) continue;
      if (this.world.portalMaskAt(gx, gz) > 0.05) continue;
      const gy = this.world.heightAt(gx, gz);
      _dummy.position.set(gx, gy - 0.12, gz);
      _dummy.rotation.set((rng() - 0.5) * 0.22, rng() * Math.PI * 2, (rng() - 0.5) * 0.22);
      const sc = 0.6 + rng() * 1.15;
      _dummy.scale.set(sc, sc, sc);
      _dummy.updateMatrix();
      grassInst.setMatrixAt(gIdx, _dummy.matrix);

      _colorA.setHex(grassPalette[Math.floor(rng() * grassPalette.length)]);
      grassInst.setColorAt(gIdx, _colorA);
      gIdx++;
    }
    grassInst.count = gIdx;
    grassInst.instanceMatrix.needsUpdate = true;
    if (grassInst.instanceColor) grassInst.instanceColor.needsUpdate = true;
    grassInst.computeBoundingSphere();
    this.worldGroup.add(grassInst);

    // 4. Composite Shattered WWI Dead Tree Stumps (tall dramatic silhouettes in spawn vista!)
    const barkMat = new THREE.MeshStandardMaterial({
      color: 0x3f3328,
      roughness: 0.93,
      metalness: 0.02,
    });
    const stumpSpots: [number, number, number][] = [
      [-8, -22, 1.35],
      [9, 20, 1.2],
      [-28, 28, 1.5],
      [29, -26, 1.45],
      [-4, 34, 1.15],
      [48, 22, 1.75],
      [-50, -18, 1.7],
      [3, -38, 1.55],
    ];
    for (const [sx, sz, sc] of stumpSpots) {
      const rx = sx + (rng() - 0.5) * 6;
      const rz = sz + (rng() - 0.5) * 6;
      if (this.world.portalMaskAt(rx, rz) > 0.05) continue;
      const stump = createShatteredTreeStump(this.fortMaterials.wood, barkMat, sc);
      stump.position.set(rx, this.world.heightAt(rx, rz) - 0.15, rz);
      stump.rotation.y = rng() * Math.PI * 2;
      this.worldGroup.add(stump);
    }
  }

  private applyAtmosphere(preset: AtmospherePreset, undergroundFactor: number): void {
    const atmo = ATMOSPHERES[preset];
    const ug = Math.max(0, Math.min(1, undergroundFactor));

    _colorA.setHex(atmo.sky).lerp(_ugFogColor, ug);
    if (!this.scene.background || !(this.scene.background instanceof THREE.Color)) {
      this.scene.background = _colorA.clone();
    } else {
      this.scene.background.copy(_colorA);
    }

    _colorB.setHex(atmo.fog).lerp(_ugFogColor, ug);
    const fogDensity = atmo.fogDensity + ug * 0.024;
    if (!this.scene.fog || !(this.scene.fog instanceof THREE.FogExp2)) {
      this.scene.fog = new THREE.FogExp2(_colorB.getHex(), fogDensity);
    } else {
      this.scene.fog.color.copy(_colorB);
      this.scene.fog.density = fogDensity;
    }

    this.sunLight.color.setHex(atmo.sunColor);
    this.sunLight.intensity = atmo.sunIntensity * (1 - ug * 0.78);
    this.sunLight.position.set(atmo.sunPos[0], atmo.sunPos[1], atmo.sunPos[2]);

    this.hemiLight.color.setHex(atmo.hemiSky);
    this.hemiLight.groundColor.setHex(atmo.hemiGround);
    this.hemiLight.intensity = atmo.hemiIntensity * (1 - ug * 0.55) + ug * 0.35;

    this.rimLight.color.setHex(atmo.rimColor);
    this.rimLight.intensity = atmo.rimIntensity * (1 - ug * 0.8);

    // Smoothly turn on warm explorer headlamp & chamber lights only when diving inside tunnels
    const ugActive = ug > 0.02;
    this.cameraLamp.visible = ugActive;
    this.cameraLamp.intensity = ug * 18.5;
    for (let i = 0; i < this.undergroundLights.length; i++) {
      this.undergroundLights[i].visible = ugActive;
    }
  }

  public updateConfig(next: SimulationConfig): void {
    const atmoChanged = next.atmosphere !== this.config.atmosphere;
    const modeChanged = next.cameraMode !== this.config.cameraMode;
    this.config = { ...next };

    if (modeChanged) {
      this.controls.enabled = next.cameraMode === 'free';
      if (next.cameraMode === 'free') {
        const cur = this.director.getCurrentState();
        this.controls.target.set(cur.look.x, cur.look.y, cur.look.z);
        this.controls.update();
      } else {
        this.director.snapToMode(next.cameraMode, this.sim.getActionHotspot());
        this.hudAccum = 0.25;
      }
    }
    if (atmoChanged) {
      this.applyAtmosphere(next.atmosphere, this.lastUndergroundFactor);
    }
  }

  public regenerateWorld(newSeed: number): void {
    this.loadWorld(newSeed);
    this.applyAtmosphere(this.config.atmosphere, 0);
  }

  private attachEvents(): void {
    this.controls.addEventListener('start', () => {
      if (this.config.cameraMode !== 'free') {
        this.callbacks.onUserManualControl();
      }
    });

    // Allow dragging on canvas even while in auto mode to seamlessly take manual control
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handleCanvasPointerDown);
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', this.handleResize);
  }

  private handleCanvasPointerDown = (e: PointerEvent): void => {
    if (e.button === 0 && this.config.cameraMode !== 'free') {
      // Enable controls on drag intent
      this.controls.enabled = true;
      const cur = this.director.getCurrentState();
      this.controls.target.set(cur.look.x, cur.look.y, cur.look.z);
      this.callbacks.onUserManualControl();
    }
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onWebglError?.('Контекст WebGL был временно потерян.');
  };

  private handleContextRestored = (): void => {
    this.callbacks.onWebglError?.('');
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    this.pendingResize = true;
  };

  private applyPendingResize(): void {
    if (!this.pendingResize) return;
    this.pendingResize = false;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private syncInstancedVisuals(): void {
    const ants = this.sim.ants;
    const count = Math.min(MAX_ANTS, ants.length);
    this.antBodyMesh.count = count;
    this.antAppMesh.count = count;

    let cargoIdx = 0;
    let shadowIdx = 0;

    for (let i = 0; i < count; i++) {
      const a = ants[i];
      const bob = Math.abs(Math.sin(a.animPhase)) * 0.06;
      const roll = Math.sin(a.animPhase) * 0.08;
      const lunge = a.state === 'fight' ? Math.sin(a.animPhase * 1.4) * 0.14 : 0;

      _dummy.position.set(
        a.x + Math.sin(a.yaw) * lunge,
        a.y + bob,
        a.z + Math.cos(a.yaw) * lunge,
      );
      _dummy.rotation.set(-a.pitch, a.yaw, roll);
      _dummy.scale.setScalar(a.scale);
      _dummy.updateMatrix();

      this.antBodyMesh.setMatrixAt(i, _dummy.matrix);
      this.antAppMesh.setMatrixAt(i, _dummy.matrix);

      // Distinct rich faction & role coloration
      if (a.faction === 'red') {
        if (a.role === 'soldier') _colorA.setHex(0xb8351c);
        else if (a.role === 'engineer') _colorA.setHex(0xc95a22);
        else _colorA.setHex(0x9e3a1e);

        _colorB.setHex(a.role === 'soldier' ? 0x6b2819 : 0x5c3621);
      } else {
        if (a.role === 'soldier') _colorA.setHex(0x28272b);
        else if (a.role === 'engineer') _colorA.setHex(0x3a342c);
        else _colorA.setHex(0x1f2024);

        _colorB.setHex(a.role === 'soldier' ? 0x8f7443 : 0x474139);
      }

      this.antBodyMesh.setColorAt(i, _colorA);
      this.antAppMesh.setColorAt(i, _colorB);

      // Carried cargo between mandibles
      if (a.cargo !== 'none') {
        const fwd = 0.68 * a.scale;
        _dummy.position.set(
          a.x + Math.sin(a.yaw) * fwd,
          a.y + 0.3 * a.scale + bob,
          a.z + Math.cos(a.yaw) * fwd,
        );
        _dummy.rotation.set(0.2, a.yaw, 0);
        _dummy.scale.setScalar(a.scale * (a.cargo === 'twig' ? 1.25 : 0.95));
        _dummy.updateMatrix();
        this.antCargoMesh.setMatrixAt(cargoIdx, _dummy.matrix);

        if (a.cargo === 'seed') _colorA.setHex(0xebbd47);
        else if (a.cargo === 'larva') _colorA.setHex(0xf5ead2);
        else if (a.cargo === 'pebble') _colorA.setHex(0x9b9287);
        else if (a.cargo === 'twig') _colorA.setHex(0x7d5836);
        else _colorA.setHex(0x6e4b30);

        this.antCargoMesh.setColorAt(cargoIdx, _colorA);
        cargoIdx++;
      }

      // Ground contact shadow for outdoor ants
      if (!a.underground) {
        _dummy.position.set(a.x, a.y + 0.025, a.z);
        _dummy.rotation.set(0, a.yaw, 0);
        _dummy.scale.set(a.scale, 1, a.scale * 1.35);
        _dummy.updateMatrix();
        this.antShadowMesh.setMatrixAt(shadowIdx, _dummy.matrix);
        shadowIdx++;
      }
    }

    this.antCargoMesh.count = cargoIdx;
    this.antShadowMesh.count = shadowIdx;

    this.antBodyMesh.instanceMatrix.needsUpdate = true;
    this.antAppMesh.instanceMatrix.needsUpdate = true;
    if (this.antBodyMesh.instanceColor) this.antBodyMesh.instanceColor.needsUpdate = true;
    if (this.antAppMesh.instanceColor) this.antAppMesh.instanceColor.needsUpdate = true;

    this.antCargoMesh.instanceMatrix.needsUpdate = true;
    if (this.antCargoMesh.instanceColor) this.antCargoMesh.instanceColor.needsUpdate = true;
    this.antShadowMesh.instanceMatrix.needsUpdate = true;

    // Update fortification construction/damage heights
    for (let i = 0; i < this.sim.fortifications.length; i++) {
      const f = this.sim.fortifications[i];
      const mesh = this.fortMeshes.get(f.id);
      if (mesh) {
        const targetY = 0.22 + 0.78 * f.progress;
        mesh.scale.y += (targetY - mesh.scale.y) * 0.12;
      }
    }

    // Acid Mortar Projectiles
    const pCount = Math.min(MAX_PROJECTILES, this.sim.projectiles.length);
    this.projMesh.count = pCount;
    for (let i = 0; i < pCount; i++) {
      const p = this.sim.projectiles[i];
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(p.progress * 6, p.progress * 4, 0);
      _dummy.scale.setScalar(1.0);
      _dummy.updateMatrix();
      this.projMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.projMesh.instanceMatrix.needsUpdate = true;

    // Impact / Dust / Combat Bursts
    const bCount = Math.min(MAX_BURSTS, this.sim.bursts.length);
    this.burstMesh.count = bCount;
    for (let i = 0; i < bCount; i++) {
      const b = this.sim.bursts[i];
      const u = b.age / b.maxAge;
      const rad = b.scale * (0.35 + Math.sin(u * Math.PI) * 1.15);
      _dummy.position.set(b.x, b.y + u * 1.2, b.z);
      _dummy.rotation.set(u * 2, b.id, u);
      _dummy.scale.setScalar(Math.max(0.05, rad));
      _dummy.updateMatrix();
      this.burstMesh.setMatrixAt(i, _dummy.matrix);

      if (b.kind === 'acid') _colorA.setHex(0xb7e843);
      else if (b.kind === 'clash') _colorA.setHex(0xffb547);
      else if (b.kind === 'build') _colorA.setHex(0xd6c29f);
      else _colorA.setHex(0x827260);
      this.burstMesh.setColorAt(i, _colorA);
    }
    this.burstMesh.instanceMatrix.needsUpdate = true;
    if (this.burstMesh.instanceColor) this.burstMesh.instanceColor.needsUpdate = true;
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
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

  private tick = (): void => {
    if (this.disposed) return;

    this.applyPendingResize();

    const now = performance.now();
    const maxDt = this.isSoftwareGl ? 0.14 : 0.06;
    const dt = Math.min(maxDt, Math.max(0.016, (now - this.lastNow) / 1000));
    this.lastNow = now;

    // 1. Advance Ant Colony Simulation
    this.sim.step(dt, this.config);

    // 2. Advance Camera Director or OrbitControls
    const aspect = this.camera.aspect || 1;
    if (this.config.cameraMode === 'free') {
      this.controls.update();
      this.director.syncFromManual(
        { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
        { x: this.controls.target.x, y: this.controls.target.y, z: this.controls.target.z },
      );
      const frame = this.director.update(dt, aspect, this.config, this.sim.getActionHotspot());
      this.lastUndergroundFactor = frame.undergroundFactor;
      this.lastShotLabel = frame.shotLabel;
      if (Math.abs(this.camera.fov - frame.fov) > 0.2) {
        this.camera.fov = frame.fov;
        this.camera.updateProjectionMatrix();
      }
    } else {
      const hotspot = this.sim.getActionHotspot();
      const frame = this.director.update(dt, aspect, this.config, hotspot);
      this.camera.position.set(frame.position.x, frame.position.y, frame.position.z);
      _vecA.set(frame.lookAt.x, frame.lookAt.y, frame.lookAt.z);
      this.camera.lookAt(_vecA);

      if (Math.abs(frame.bankAngle) > 0.001) {
        _camQuat.copy(this.camera.quaternion);
        _vecC.set(0, 0, 1);
        _bankQuat.setFromAxisAngle(_vecC, frame.bankAngle);
        this.camera.quaternion.copy(_camQuat).multiply(_bankQuat);
      }

      if (Math.abs(this.camera.fov - frame.fov) > 0.15) {
        this.camera.fov = frame.fov;
        this.camera.updateProjectionMatrix();
      }
      this.lastUndergroundFactor = frame.undergroundFactor;
      this.lastShotLabel = frame.shotLabel;
    }

    // Update subterranean lighting & fog smoothly
    this.cameraLamp.position.copy(this.camera.position);
    this.applyAtmosphere(this.config.atmosphere, this.lastUndergroundFactor);

    // 3. Sync instanced meshes & render
    this.syncInstancedVisuals();
    this.renderer.render(this.scene, this.camera);

    // 4. Throttle React HUD telemetry updates to ~4Hz (zero 60Hz setState churn)
    this.hudAccum += dt;
    if (this.hudAccum >= 0.25) {
      this.hudAccum = 0;
      const stats = this.sim.getStats();
      const groundAtCam = this.world.heightAt(this.camera.position.x, this.camera.position.z);
      this.callbacks.onHudUpdate({
        seed: this.world.seed,
        redAlive: stats.redAlive,
        blackAlive: stats.blackAlive,
        redBuilt: stats.redBuilt,
        blackBuilt: stats.blackBuilt,
        activeFights: stats.activeFights,
        undergroundAnts: stats.undergroundAnts,
        shotLabel: this.lastShotLabel,
        isUnderground: this.lastUndergroundFactor > 0.45,
        cameraAltitude: Math.round((this.camera.position.y - groundAtCam) * 10) / 10,
      });
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = window.requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.controls.dispose();
    this.clearWorldGroup();

    this.antBodyGeo.dispose();
    this.antAppGeo.dispose();
    this.cargoGeo.dispose();
    this.shadowDiscGeo.dispose();
    this.projGeo.dispose();
    this.burstGeo.dispose();
    Object.values(this.fortMaterials).forEach((m) => m.dispose());
    (this.antBodyMesh.material as THREE.Material).dispose();
    (this.antAppMesh.material as THREE.Material).dispose();
    (this.antCargoMesh.material as THREE.Material).dispose();
    (this.antShadowMesh.material as THREE.Material).dispose();
    (this.projMesh.material as THREE.Material).dispose();
    (this.burstMesh.material as THREE.Material).dispose();

    this.textures.dispose();
    this.envRT?.dispose();
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
