'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BiomeDefinition,
  BiomeMode,
  CHUNK_LENGTH,
  clampFreeCamDistance,
  clampFreeCamPitch,
  computeSphericalCameraOffset,
  getBiomeAtDistance,
  getTrackPointAtS,
  getTrainCarPositions,
  SimulationConfig,
  TimeOfDay,
} from '@/lib/train-sim';
import {
  buildWorldChunk,
  createLocomotiveModel,
  createPassengerWagonModel,
  createSharedSceneAssets,
  SharedSceneAssets,
} from '@/lib/procedural-models';
import { TrainSoundEngine } from '@/lib/sound-engine';

export interface TelemetrySnapshot {
  speedKmh: number;
  distanceMeters: number;
  altitudeMeters: number;
  activeBiome: BiomeDefinition;
  nextBiome: BiomeDefinition;
  biomeBlend: number;
  isBridge: boolean;
}

interface TrainCanvasProps {
  config: SimulationConfig;
  hornTriggerCount: number;
  onTelemetryUpdate: (snapshot: TelemetrySnapshot) => void;
  onFreeCamGesture: (newDistance: number, switchToFree: boolean) => void;
}

// Pre-allocated math helpers at module scope to avoid GC inside render loop
const _camTargetPos = new THREE.Vector3();
const _camLookAtPos = new THREE.Vector3();
const _smoothCamPos = new THREE.Vector3(14, 7, 18);
const _smoothLookAt = new THREE.Vector3(0, 2, 30);
const _carPos = new THREE.Vector3();
const _carAhead = new THREE.Vector3();
const _skyColor = new THREE.Color();
const _hemiSkyColor = new THREE.Color();
const _hemiGroundColor = new THREE.Color();
const _sunColor = new THREE.Color();

const TIME_PALETTES: Record<
  TimeOfDay,
  {
    sky: number;
    hemiSky: number;
    hemiGround: number;
    sunColor: number;
    sunIntensity: number;
    hemiIntensity: number;
    exposure: number;
    sunDir: [number, number, number];
    windowEmissive: number;
  }
> = {
  dawn: {
    sky: 0x7c5295,
    hemiSky: 0xfda4af,
    hemiGround: 0x475569,
    sunColor: 0xfb923c,
    sunIntensity: 2.8,
    hemiIntensity: 1.15,
    exposure: 1.15,
    sunDir: [45, 28, 30],
    windowEmissive: 0.65,
  },
  day: {
    sky: 0x38bdf8,
    hemiSky: 0xe0f2fe,
    hemiGround: 0x475569,
    sunColor: 0xfffbeb,
    sunIntensity: 3.2,
    hemiIntensity: 1.35,
    exposure: 1.2,
    sunDir: [50, 75, 35],
    windowEmissive: 0.15,
  },
  sunset: {
    sky: 0x9a344f,
    hemiSky: 0xfdba74,
    hemiGround: 0x334155,
    sunColor: 0xf59e0b,
    sunIntensity: 3.0,
    hemiIntensity: 1.1,
    exposure: 1.15,
    sunDir: [-55, 25, 25],
    windowEmissive: 0.85,
  },
  night: {
    sky: 0x0f172a,
    hemiSky: 0x38bdf8,
    hemiGround: 0x1e293b,
    sunColor: 0x93c5fd,
    sunIntensity: 1.3,
    hemiIntensity: 0.75,
    exposure: 1.1,
    sunDir: [-30, 50, -20],
    windowEmissive: 1.35,
  },
};

export default function TrainCanvas({
  config,
  hornTriggerCount,
  onTelemetryUpdate,
  onFreeCamGesture,
}: TrainCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const configRef = useRef<SimulationConfig>(config);
  const telemetryCallbackRef = useRef(onTelemetryUpdate);
  const freeCamGestureRef = useRef(onFreeCamGesture);
  const soundEngineRef = useRef<TrainSoundEngine | null>(null);
  const cameraShakeRef = useRef(0);
  const freeOrbitRef = useRef({
    yaw: 0.65,
    pitch: 0.28,
    distance: config.freeCamDistance,
    panS: -4,
    panY: 0,
  });

  useEffect(() => {
    configRef.current = config;
    freeOrbitRef.current.distance = clampFreeCamDistance(config.freeCamDistance);
    if (soundEngineRef.current) {
      soundEngineRef.current.setEnabled(config.soundEnabled);
    }
  }, [config]);

  useEffect(() => {
    if (config.freeCamResetCount > 0) {
      freeOrbitRef.current.yaw = 0.65;
      freeOrbitRef.current.pitch = 0.28;
      freeOrbitRef.current.distance = 22;
      freeOrbitRef.current.panS = -4;
      freeOrbitRef.current.panY = 0;
    }
  }, [config.freeCamResetCount]);

  useEffect(() => {
    telemetryCallbackRef.current = onTelemetryUpdate;
  }, [onTelemetryUpdate]);

  useEffect(() => {
    freeCamGestureRef.current = onFreeCamGesture;
  }, [onFreeCamGesture]);

  useEffect(() => {
    if (hornTriggerCount > 0) {
      soundEngineRef.current?.triggerHorn();
      cameraShakeRef.current = 0.65;
    }
  }, [hornTriggerCount]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: isSoftwareGl,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const initPal = TIME_PALETTES[configRef.current.timeOfDay];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(initPal.sky);
    scene.fog = new THREE.FogExp2(initPal.sky, 0.004);

    if (!isSoftwareGl) {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();
    }

    const camera = new THREE.PerspectiveCamera(
      55,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.5,
      460
    );

    const hemiLight = new THREE.HemisphereLight(
      initPal.hemiSky,
      initPal.hemiGround,
      initPal.hemiIntensity
    );
    hemiLight.position.set(0, 60, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(initPal.sunColor, initPal.sunIntensity);
    sunLight.position.set(50, 75, 35);
    sunLight.castShadow = !isSoftwareGl;
    if (!isSoftwareGl) {
      sunLight.shadow.mapSize.width = 1024;
      sunLight.shadow.mapSize.height = 1024;
      const d = 45;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.camera.near = 5;
      sunLight.shadow.camera.far = 180;
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.02;
    }
    scene.add(sunLight);
    scene.add(sunLight.target);

    const assets: SharedSceneAssets = createSharedSceneAssets(renderer, isSoftwareGl);
    const { group: locoGroup, headlightSpot, headlightBeamMesh } = createLocomotiveModel(assets);
    scene.add(locoGroup);

    const maxWagons = 8;
    const wagonGroups: THREE.Group[] = [];
    for (let i = 0; i < maxWagons; i++) {
      const wGroup = createPassengerWagonModel(assets, i === maxWagons - 1);
      scene.add(wGroup);
      wagonGroups.push(wGroup);
    }

    const particleCount = 500;
    const precipGeo = new THREE.BufferGeometry();
    const precipPositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      precipPositions[i * 3] = (Math.random() - 0.5) * 70;
      precipPositions[i * 3 + 1] = Math.random() * 35;
      precipPositions[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    precipGeo.setAttribute('position', new THREE.BufferAttribute(precipPositions, 3));
    const precipMat = new THREE.PointsMaterial({
      color: 0xe2e8f0,
      size: 0.22,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const precipPoints = new THREE.Points(precipGeo, precipMat);
    precipPoints.frustumCulled = false;
    scene.add(precipPoints);

    const activeChunks = new Map<
      number,
      { group: THREE.Group; disposables: THREE.BufferGeometry[]; mode: BiomeMode }
    >();

    function syncChunks(leadS: number, biomeMode: BiomeMode) {
      const centerChunk = Math.floor(leadS / CHUNK_LENGTH);
      const minChunk = centerChunk - 1;
      const maxChunk = centerChunk + 2;

      for (const [idx, entry] of activeChunks.entries()) {
        if (idx < minChunk || idx > maxChunk || entry.mode !== biomeMode) {
          scene.remove(entry.group);
          entry.disposables.forEach((g) => g.dispose());
          activeChunks.delete(idx);
        }
      }

      for (let idx = minChunk; idx <= maxChunk; idx++) {
        if (!activeChunks.has(idx)) {
          const built = buildWorldChunk(idx, biomeMode, assets);
          scene.add(built.group);
          activeChunks.set(idx, { ...built, mode: biomeMode });
        }
      }
    }

    syncChunks(80, configRef.current.biomeMode);
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Multi-pointer tracking for 360-degree free orbit, 2-finger pinch-to-zoom, and panning
    const activePointers = new Map<number, { x: number; y: number; button: number }>();
    let lastPinchDist = 0;
    let userYawOffset = 0;
    let userPitchOffset = 0;

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onPointerDown = (e: PointerEvent) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const prev = activePointers.get(e.pointerId);
      if (!prev) return;

      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: prev.button });

      if (activePointers.size === 2) {
        // Two-finger pinch-to-zoom + midpoint pan on mobile touchscreens
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (lastPinchDist > 10 && dist > 10) {
          const scale = lastPinchDist / dist;
          const nextDist = clampFreeCamDistance(freeOrbitRef.current.distance * scale);
          freeOrbitRef.current.distance = nextDist;
          freeCamGestureRef.current(Math.round(nextDist), true);
        }
        lastPinchDist = dist;
        return;
      }

      if (activePointers.size === 1) {
        const isPanGesture = prev.button === 2 || e.shiftKey;
        if (isPanGesture) {
          // Right-click or Shift+drag pans along the train and vertically
          const panScale = freeOrbitRef.current.distance * 0.0025;
          freeOrbitRef.current.panS = Math.max(-75, Math.min(45, freeOrbitRef.current.panS - dx * panScale));
          freeOrbitRef.current.panY = Math.max(-6, Math.min(35, freeOrbitRef.current.panY + dy * panScale));
        } else {
          // Unrestricted 360-degree horizontal rotation (no clamp on yaw!) and full vertical pitch
          freeOrbitRef.current.yaw -= dx * 0.0075;
          freeOrbitRef.current.pitch = clampFreeCamPitch(freeOrbitRef.current.pitch + dy * 0.006);

          // Also update subtle offset for preset cameras
          userYawOffset = Math.max(-2.2, Math.min(2.2, userYawOffset - dx * 0.0055));
          userPitchOffset = Math.max(-0.35, Math.min(0.65, userPitchOffset + dy * 0.0045));
        }
      }
    };

    const onPointerUpOrCancel = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) {
        lastPinchDist = 0;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.12 : 0.89;
      const nextDist = clampFreeCamDistance(freeOrbitRef.current.distance * zoomFactor);
      freeOrbitRef.current.distance = nextDist;
      freeCamGestureRef.current(Math.round(nextDist), true);
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('contextmenu', onContextMenu);
    domElem.addEventListener('pointerdown', onPointerDown);
    domElem.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUpOrCancel);
    window.addEventListener('pointercancel', onPointerUpOrCancel);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ') {
        soundEngineRef.current?.triggerHorn();
        cameraShakeRef.current = 0.6;
      } else if (e.key === '=' || e.key === '+') {
        const nextDist = clampFreeCamDistance(freeOrbitRef.current.distance * 0.85);
        freeOrbitRef.current.distance = nextDist;
        freeCamGestureRef.current(Math.round(nextDist), true);
      } else if (e.key === '-' || e.key === '_') {
        const nextDist = clampFreeCamDistance(freeOrbitRef.current.distance * 1.18);
        freeOrbitRef.current.distance = nextDist;
        freeCamGestureRef.current(Math.round(nextDist), true);
      } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        freeOrbitRef.current.yaw -= 0.14;
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        freeOrbitRef.current.yaw += 0.14;
      } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        freeOrbitRef.current.pitch = clampFreeCamPitch(freeOrbitRef.current.pitch + 0.08);
      } else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
        freeOrbitRef.current.pitch = clampFreeCamPitch(freeOrbitRef.current.pitch - 0.08);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      const isPortrait = w < h;
      camera.fov = isPortrait ? 65 : 52;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    onResize();
    window.addEventListener('resize', onResize);

    const soundEngine = new TrainSoundEngine();
    soundEngineRef.current = soundEngine;
    soundEngine.setEnabled(configRef.current.soundEnabled);

    let leadS = 80;
    let currentSpeedKmh = configRef.current.targetSpeedKmh;
    let lastTime = performance.now();
    let elapsedTotal = 0;
    let lastTelemetryPush = 0;
    let frameId = 0;
    let isFirstFrame = true;
    let disposed = false;

    function afterDraw(cb: () => void) {
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
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = isFirstFrame ? 0.016 : Math.min(0.15, Math.max(0.005, rawDt));
      elapsedTotal += dt;

      const cfg = configRef.current;

      const speedAlpha = 1 - Math.exp(-2.8 * dt);
      currentSpeedKmh += (cfg.targetSpeedKmh - currentSpeedKmh) * speedAlpha;
      const metersPerSec = currentSpeedKmh / 3.6;
      leadS += metersPerSec * dt;

      soundEngine.update(dt, currentSpeedKmh);
      syncChunks(leadS, cfg.biomeMode);

      const carPositions = getTrainCarPositions(leadS, cfg.wagonCount);
      const leadPt = getTrackPointAtS(leadS, cfg.biomeMode);
      const leadAhead = getTrackPointAtS(leadS + 1.8, cfg.biomeMode);

      _carPos.set(leadPt.x, leadPt.y + 0.16, leadPt.z);
      _carAhead.set(leadAhead.x, leadAhead.y + 0.16, leadAhead.z);
      locoGroup.position.copy(_carPos);
      locoGroup.lookAt(_carAhead);
      locoGroup.rotation.z += leadPt.banking;

      const lightsActive =
        cfg.headlightOn || cfg.timeOfDay === 'night' || cfg.timeOfDay === 'sunset';
      headlightSpot.visible = lightsActive;
      headlightBeamMesh.visible = lightsActive;

      for (let i = 0; i < wagonGroups.length; i++) {
        const wGroup = wagonGroups[i];
        if (i < cfg.wagonCount) {
          wGroup.visible = true;
          const ws = carPositions[i + 1];
          const wPt = getTrackPointAtS(ws, cfg.biomeMode);
          const wAhead = getTrackPointAtS(ws + 1.6, cfg.biomeMode);
          wGroup.position.set(wPt.x, wPt.y + 0.16, wPt.z);
          wGroup.lookAt(wAhead.x, wAhead.y + 0.16, wAhead.z);
          wGroup.rotation.z += wPt.banking;
        } else {
          wGroup.visible = false;
        }
      }

      const pal = TIME_PALETTES[cfg.timeOfDay];
      sunLight.position.set(
        leadPt.x + pal.sunDir[0],
        leadPt.y + pal.sunDir[1],
        leadPt.z + pal.sunDir[2]
      );
      sunLight.target.position.set(leadPt.x, leadPt.y, leadPt.z + 10);

      const envAlpha = isFirstFrame ? 1.0 : 1 - Math.exp(-3.5 * dt);
      _skyColor.setHex(pal.sky);
      if (cfg.weather === 'fog') _skyColor.lerp(new THREE.Color(0x94a3b8), 0.45);
      if (cfg.weather === 'snow') _skyColor.lerp(new THREE.Color(0xcbd5e1), 0.35);

      (scene.background as THREE.Color).lerp(_skyColor, envAlpha);
      const fog = scene.fog as THREE.FogExp2;
      fog.color.copy(scene.background as THREE.Color);
      // Reduce fog density slightly when zoomed out far in free camera mode so the whole panorama stays crisp
      const zoomFogScale =
        cfg.cameraMode === 'free' && freeOrbitRef.current.distance > 40
          ? Math.max(0.45, 40 / freeOrbitRef.current.distance)
          : 1.0;
      const targetFogDensity =
        (cfg.weather === 'fog'
          ? 0.012
          : cfg.weather === 'rain' || cfg.weather === 'snow'
          ? 0.0075
          : 0.0032) * zoomFogScale;
      fog.density += (targetFogDensity - fog.density) * envAlpha;

      hemiLight.color.lerp(_hemiSkyColor.setHex(pal.hemiSky), envAlpha);
      hemiLight.groundColor.lerp(_hemiGroundColor.setHex(pal.hemiGround), envAlpha);
      hemiLight.intensity += (pal.hemiIntensity - hemiLight.intensity) * envAlpha;

      sunLight.color.lerp(_sunColor.setHex(pal.sunColor), envAlpha);
      sunLight.intensity += (pal.sunIntensity - sunLight.intensity) * envAlpha;
      renderer.toneMappingExposure += (pal.exposure - renderer.toneMappingExposure) * envAlpha;

      assets.materials.cityBuilding.emissiveIntensity = pal.windowEmissive;
      assets.materials.coachWindowLit.emissiveIntensity = pal.windowEmissive * 0.7;

      const showPrecip = cfg.weather === 'rain' || cfg.weather === 'snow';
      precipPoints.visible = showPrecip;
      if (showPrecip) {
        precipMat.size = cfg.weather === 'snow' ? 0.32 : 0.16;
        precipMat.color.setHex(cfg.weather === 'snow' ? 0xffffff : 0xbae6fd);
        const fallSpeed = cfg.weather === 'snow' ? 4.5 : 22.0;
        const posAttr = precipGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < particleCount; i++) {
          let py = posAttr.getY(i) - fallSpeed * dt;
          if (py < -2) py = 32;
          posAttr.setY(i, py);
        }
        posAttr.needsUpdate = true;
        precipPoints.position.set(leadPt.x, leadPt.y, leadPt.z + 10);
      }

      const isPortrait = camera.aspect < 1.0;
      const portraitDistMult = isPortrait ? 1.25 : 1.0;

      if (activePointers.size === 0) {
        userYawOffset *= Math.exp(-1.5 * dt);
        userPitchOffset *= Math.exp(-1.5 * dt);
      }

      let activeCamMode = cfg.cameraMode;
      if (cfg.cameraMode === 'cinematic' && cfg.cinematicAutoSwitch) {
        const cycle = Math.floor(elapsedTotal / 10) % 3;
        if (cycle === 1) activeCamMode = 'side';
        else if (cycle === 2) activeCamMode = 'drone';
      }

      const trackForwardX = leadAhead.x - leadPt.x;
      const trackForwardZ = leadAhead.z - leadPt.z;
      const trackHeading = Math.atan2(trackForwardX, trackForwardZ) + userYawOffset;

      if (activeCamMode === 'free') {
        // Unrestricted 360° Free Orbit & Zoom Camera around the moving train anchor
        const anchorS = leadS + freeOrbitRef.current.panS;
        const anchorPt = getTrackPointAtS(anchorS, cfg.biomeMode);
        const anchorY = anchorPt.y + 2.1 + freeOrbitRef.current.panY;

        const offset = computeSphericalCameraOffset(
          freeOrbitRef.current.yaw,
          freeOrbitRef.current.pitch,
          freeOrbitRef.current.distance
        );

        _camTargetPos.set(
          anchorPt.x + offset.dx,
          anchorY + offset.dy,
          anchorPt.z + offset.dz
        );
        _camLookAtPos.set(anchorPt.x, anchorY, anchorPt.z);
      } else if (activeCamMode === 'cabin') {
        _camTargetPos.set(
          leadPt.x + Math.sin(trackHeading) * 4.5,
          leadPt.y + 2.85,
          leadPt.z + Math.cos(trackHeading) * 4.5
        );
        const lookAheadPt = getTrackPointAtS(leadS + 38, cfg.biomeMode);
        _camLookAtPos.set(
          lookAheadPt.x + Math.sin(userYawOffset) * 12,
          lookAheadPt.y + 2.2 - userPitchOffset * 8,
          lookAheadPt.z
        );
      } else if (activeCamMode === 'chase') {
        const backS = leadS - 16 * portraitDistMult;
        const backPt = getTrackPointAtS(backS, cfg.biomeMode);
        _camTargetPos.set(
          backPt.x + 5.2,
          backPt.y + 6.4 + userPitchOffset * 8,
          backPt.z
        );
        _camLookAtPos.set(leadPt.x, leadPt.y + 2.0, leadPt.z + 4);
      } else if (activeCamMode === 'side') {
        const sideS = leadS - 4;
        const sideTrackPt = getTrackPointAtS(sideS, cfg.biomeMode);
        const sideOffset = (10.5 + Math.sin(elapsedTotal * 0.4) * 1.2) * portraitDistMult;
        _camTargetPos.set(
          sideTrackPt.x + Math.cos(trackHeading) * sideOffset,
          sideTrackPt.y + 4.2 + userPitchOffset * 6,
          sideTrackPt.z - Math.sin(trackHeading) * sideOffset
        );
        const focusPt = getTrackPointAtS(leadS - 5, cfg.biomeMode);
        _camLookAtPos.set(focusPt.x, focusPt.y + 2.0, focusPt.z);
      } else if (activeCamMode === 'drone') {
        const orbitAngle = elapsedTotal * 0.25 + userYawOffset;
        const radius = 20 * portraitDistMult;
        _camTargetPos.set(
          leadPt.x + Math.sin(orbitAngle) * radius,
          leadPt.y + 15.0 + userPitchOffset * 10,
          leadPt.z + Math.cos(orbitAngle) * radius * 0.75 - 4
        );
        const focusPt = getTrackPointAtS(leadS - 6, cfg.biomeMode);
        _camLookAtPos.set(focusPt.x, focusPt.y + 1.8, focusPt.z);
      } else {
        // Heroic 3/4 front-side tracking camera anchored to the curved spline ahead of the train
        const forwardS = leadS + 11.5 * portraitDistMult;
        const aheadTrackPt = getTrackPointAtS(forwardS, cfg.biomeMode);
        const aheadNextPt = getTrackPointAtS(forwardS + 1.0, cfg.biomeMode);
        const dx = aheadNextPt.x - aheadTrackPt.x;
        const dz = aheadNextPt.z - aheadTrackPt.z;
        const dLen = Math.hypot(dx, dz) || 1;
        const normX = dz / dLen;
        const normZ = -dx / dLen;
        const lateral = 6.8 * portraitDistMult;

        _camTargetPos.set(
          aheadTrackPt.x + normX * lateral,
          aheadTrackPt.y + 4.3 + Math.sin(elapsedTotal * 0.5) * 0.4 + userPitchOffset * 6,
          aheadTrackPt.z + normZ * lateral
        );
        const focusPt = getTrackPointAtS(leadS - 5, cfg.biomeMode);
        _camLookAtPos.set(focusPt.x, focusPt.y + 1.9, focusPt.z);
      }

      if (isFirstFrame) {
        _smoothCamPos.copy(_camTargetPos);
        _smoothLookAt.copy(_camLookAtPos);
        isFirstFrame = false;
      } else {
        const dampRate =
          activeCamMode === 'cabin' ? 16 : activeCamMode === 'free' ? 14.0 : 6.0;
        const dampAlpha = 1 - Math.exp(-dampRate * dt);
        _smoothCamPos.lerp(_camTargetPos, dampAlpha);
        _smoothLookAt.lerp(_camLookAtPos, dampAlpha);
      }

      const camGround = getTrackPointAtS(_smoothCamPos.z, cfg.biomeMode).y + 1.2;
      if (_smoothCamPos.y < camGround) {
        _smoothCamPos.y = camGround;
      }

      if (cameraShakeRef.current > 0.01) {
        cameraShakeRef.current *= Math.exp(-4.5 * dt);
      }
      const speedVibration =
        activeCamMode === 'free' ? 0 : Math.max(0, (currentSpeedKmh - 90) / 150) * 0.03;
      const totalShake = cameraShakeRef.current * 0.2 + speedVibration;

      camera.position.set(
        _smoothCamPos.x + (Math.random() - 0.5) * totalShake,
        _smoothCamPos.y + (Math.random() - 0.5) * totalShake,
        _smoothCamPos.z
      );
      camera.lookAt(_smoothLookAt);

      renderer.render(scene, camera);

      if (now - lastTelemetryPush > 180) {
        lastTelemetryPush = now;
        const biomeState = getBiomeAtDistance(leadS, cfg.biomeMode);
        telemetryCallbackRef.current({
          speedKmh: currentSpeedKmh,
          distanceMeters: leadS - 80,
          altitudeMeters: leadPt.y,
          activeBiome: biomeState.primary,
          nextBiome: biomeState.secondary,
          biomeBlend: biomeState.blend,
          isBridge: leadPt.isBridge,
        });
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      domElem.removeEventListener('contextmenu', onContextMenu);
      domElem.removeEventListener('pointerdown', onPointerDown);
      domElem.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUpOrCancel);
      window.removeEventListener('pointercancel', onPointerUpOrCancel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      soundEngine.dispose();
      for (const entry of activeChunks.values()) {
        entry.disposables.forEach((g) => g.dispose());
      }
      activeChunks.clear();
      precipGeo.dispose();
      precipMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      data-testid="train-canvas-container"
      className="fixed inset-0 w-full h-full overflow-hidden touch-none cursor-grab active:cursor-grabbing z-0"
      aria-label="Интерактивная 3D-сцена движения поезда. Крутите на 360 градусов и масштабируйте."
    />
  );
}
