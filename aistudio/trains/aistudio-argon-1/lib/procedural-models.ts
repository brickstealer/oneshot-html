import * as THREE from 'three';
import {
  BiomeMode,
  CHUNK_LENGTH,
  getBiomeAtDistance,
  getTerrainHeightAt,
  getTrackPointAtS,
  seededRandom,
} from './train-sim';

export interface SharedSceneAssets {
  maxAnisotropy: number;
  isSoftwareGl: boolean;
  windowTexture: THREE.CanvasTexture;
  bumpTexture: THREE.CanvasTexture;
  coachStripeTexture: THREE.CanvasTexture;
  materials: {
    locoBody: THREE.MeshPhysicalMaterial;
    locoTrim: THREE.MeshStandardMaterial;
    locoGlass: THREE.MeshPhysicalMaterial;
    darkSteel: THREE.MeshStandardMaterial;
    railSteel: THREE.MeshStandardMaterial;
    sleeperWood: THREE.MeshStandardMaterial;
    headlightEmissive: THREE.MeshBasicMaterial;
    taillightEmissive: THREE.MeshBasicMaterial;
    coachWindowLit: THREE.MeshStandardMaterial;
    contactShadow: THREE.MeshBasicMaterial;
    cityBuilding: THREE.MeshStandardMaterial;
    cityPodium: THREE.MeshStandardMaterial;
    villageWall: THREE.MeshStandardMaterial;
    villageRoof: THREE.MeshStandardMaterial;
    woodTrunk: THREE.MeshStandardMaterial;
    pineFoliage: THREE.MeshStandardMaterial;
    snowCap: THREE.MeshStandardMaterial;
    rockCliff: THREE.MeshStandardMaterial;
    viaductStone: THREE.MeshStandardMaterial;
  };
  geometries: {
    wheel: THREE.CylinderGeometry;
    sleeper: THREE.BoxGeometry;
    contactDisc: THREE.CircleGeometry;
    pineConeBottom: THREE.ConeGeometry;
    pineConeMid: THREE.ConeGeometry;
    pineConeTop: THREE.ConeGeometry;
    trunk: THREE.CylinderGeometry;
    rockDodeca: THREE.DodecahedronGeometry;
    boxUnit: THREE.BoxGeometry;
    gableRoof: THREE.ConeGeometry;
  };
}

/**
 * Creates procedural CanvasTextures with proper SRGBColorSpace and anisotropy
 */
export function createSharedSceneAssets(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean
): SharedSceneAssets {
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  // 1. Procedural Skyscraper Illuminated Window Grid Texture
  const winCanvas = document.createElement('canvas');
  winCanvas.width = 256;
  winCanvas.height = 512;
  const wCtx = winCanvas.getContext('2d')!;
  wCtx.fillStyle = '#182234';
  wCtx.fillRect(0, 0, 256, 512);
  for (let row = 0; row < 32; row++) {
    for (let col = 0; col < 16; col++) {
      const r = seededRandom(row * 31 + col * 17);
      if (r > 0.32) {
        wCtx.fillStyle = r > 0.78 ? '#fde68a' : r > 0.52 ? '#bae6fd' : '#334155';
      } else {
        wCtx.fillStyle = '#0f172a';
      }
      wCtx.fillRect(col * 16 + 3, row * 16 + 3, 10, 10);
    }
  }
  const windowTexture = new THREE.CanvasTexture(winCanvas);
  windowTexture.colorSpace = THREE.SRGBColorSpace;
  windowTexture.wrapS = THREE.RepeatWrapping;
  windowTexture.wrapT = THREE.RepeatWrapping;
  windowTexture.anisotropy = maxAnisotropy;

  // 2. Procedural Micro-Relief Stone/Ballast Bump Texture (Linear space)
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 128;
  bumpCanvas.height = 128;
  const bCtx = bumpCanvas.getContext('2d')!;
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 128; x += 2) {
      const v = Math.floor(100 + seededRandom(x * 13 + y * 29) * 140);
      bCtx.fillStyle = `rgb(${v},${v},${v})`;
      bCtx.fillRect(x, y, 2, 2);
    }
  }
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.wrapS = THREE.RepeatWrapping;
  bumpTexture.wrapT = THREE.RepeatWrapping;
  bumpTexture.anisotropy = maxAnisotropy;

  // 3. Procedural Coach Livery & Illuminated Window Texture
  const coachCanvas = document.createElement('canvas');
  coachCanvas.width = 512;
  coachCanvas.height = 128;
  const cCtx = coachCanvas.getContext('2d')!;
  cCtx.fillStyle = '#e2e8f0';
  cCtx.fillRect(0, 0, 512, 128);
  // Crimson-amber express stripe
  cCtx.fillStyle = '#e11d48';
  cCtx.fillRect(0, 74, 512, 14);
  cCtx.fillStyle = '#f59e0b';
  cCtx.fillRect(0, 88, 512, 5);
  // Dark window band with warm lit passenger windows
  cCtx.fillStyle = '#0f172a';
  cCtx.fillRect(12, 28, 488, 38);
  for (let i = 0; i < 8; i++) {
    cCtx.fillStyle = '#fef3c7';
    cCtx.fillRect(24 + i * 58, 33, 44, 28);
  }
  const coachStripeTexture = new THREE.CanvasTexture(coachCanvas);
  coachStripeTexture.colorSpace = THREE.SRGBColorSpace;
  coachStripeTexture.anisotropy = maxAnisotropy;

  // Radial Contact Shadow Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  const sCtx = shadowCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 64, 64);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);

  const materials = {
    locoBody: new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      roughness: 0.22,
      metalness: 0.15,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
    }),
    locoTrim: new THREE.MeshStandardMaterial({
      color: 0xe11d48,
      roughness: 0.35,
      metalness: 0.45,
    }),
    locoGlass: new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.08,
      metalness: 0.1,
      transmission: isSoftwareGl ? 0 : 0.75,
      transparent: true,
      opacity: isSoftwareGl ? 0.82 : 1.0,
      ior: 1.5,
      clearcoat: 1.0,
    }),
    darkSteel: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.65,
      metalness: 0.75,
      bumpMap: bumpTexture,
      bumpScale: 0.015,
    }),
    railSteel: new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.25,
      metalness: 0.9,
    }),
    sleeperWood: new THREE.MeshStandardMaterial({
      color: 0x452c1e,
      roughness: 0.88,
      metalness: 0.05,
      bumpMap: bumpTexture,
      bumpScale: 0.03,
    }),
    headlightEmissive: new THREE.MeshBasicMaterial({
      color: 0xfef08a,
    }),
    taillightEmissive: new THREE.MeshBasicMaterial({
      color: 0xef4444,
    }),
    coachWindowLit: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: coachStripeTexture,
      roughness: 0.28,
      metalness: 0.2,
      emissive: new THREE.Color(0xfef3c7),
      emissiveMap: coachStripeTexture,
      emissiveIntensity: 0.35,
    }),
    contactShadow: new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    }),
    cityBuilding: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: windowTexture,
      roughness: 0.35,
      metalness: 0.45,
      emissive: new THREE.Color(0xbae6fd),
      emissiveMap: windowTexture,
      emissiveIntensity: 0.45,
    }),
    cityPodium: new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.72,
      metalness: 0.2,
      bumpMap: bumpTexture,
      bumpScale: 0.02,
    }),
    villageWall: new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      roughness: 0.82,
      metalness: 0.05,
      bumpMap: bumpTexture,
      bumpScale: 0.02,
    }),
    villageRoof: new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.65,
      metalness: 0.1,
    }),
    woodTrunk: new THREE.MeshStandardMaterial({
      color: 0x5c3a21,
      roughness: 0.9,
      metalness: 0.02,
    }),
    pineFoliage: new THREE.MeshStandardMaterial({
      color: 0x1e4d2b,
      roughness: 0.78,
      metalness: 0.04,
      flatShading: true,
    }),
    snowCap: new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.45,
      metalness: 0.08,
    }),
    rockCliff: new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.88,
      metalness: 0.12,
      bumpMap: bumpTexture,
      bumpScale: 0.08,
      flatShading: true,
    }),
    viaductStone: new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.8,
      metalness: 0.1,
      bumpMap: bumpTexture,
      bumpScale: 0.05,
    }),
  };

  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.22, 16);
  wheelGeo.rotateZ(Math.PI / 2);

  const geometries = {
    wheel: wheelGeo,
    sleeper: new THREE.BoxGeometry(2.6, 0.16, 0.32),
    contactDisc: new THREE.CircleGeometry(1.0, 16),
    pineConeBottom: new THREE.ConeGeometry(1.8, 3.2, 7),
    pineConeMid: new THREE.ConeGeometry(1.4, 2.7, 7),
    pineConeTop: new THREE.ConeGeometry(0.95, 2.1, 7),
    trunk: new THREE.CylinderGeometry(0.22, 0.35, 1.8, 7),
    rockDodeca: new THREE.DodecahedronGeometry(1.0, 1),
    boxUnit: new THREE.BoxGeometry(1, 1, 1),
    gableRoof: new THREE.ConeGeometry(0.85, 0.65, 4),
  };
  geometries.gableRoof.rotateY(Math.PI / 4);

  return {
    maxAnisotropy,
    isSoftwareGl,
    windowTexture,
    bumpTexture,
    coachStripeTexture,
    materials,
    geometries,
  };
}

/**
 * Builds the Hero High-Speed Express Locomotive as a 10-part composite THREE.Group
 * across Primary silhouette, Secondary read, and Accent detail scales.
 * Pivot is at bottom-center (rail height).
 */
export function createLocomotiveModel(assets: SharedSceneAssets): {
  group: THREE.Group;
  headlightSpot: THREE.SpotLight;
  headlightBeamMesh: THREE.Mesh;
} {
  const group = new THREE.Group();
  const { materials, geometries, isSoftwareGl } = assets;

  // Contact shadow grounding plane
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 12.6),
    materials.contactShadow
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0, 0.02, 0);
  group.add(shadowPlane);

  // 1. Primary Silhouette: Main Aerodynamic Fuselage Body
  const mainBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.95, 2.65, 8.6),
    materials.coachWindowLit
  );
  mainBody.position.set(0, 1.95, -1.1);
  mainBody.castShadow = !isSoftwareGl;
  mainBody.receiveShadow = !isSoftwareGl;
  group.add(mainBody);

  // 2. Primary Silhouette: Sculpted Aerodynamic Bullet Nose (ExtrudeGeometry with bevels)
  const noseShape = new THREE.Shape();
  noseShape.moveTo(0, 0);
  noseShape.lineTo(3.2, 0);
  noseShape.quadraticCurveTo(3.1, 1.0, 1.6, 1.65);
  noseShape.lineTo(0, 2.55);
  noseShape.closePath();

  const noseGeo = new THREE.ExtrudeGeometry(noseShape, {
    depth: 2.55,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.14,
    bevelThickness: 0.16,
  });
  noseGeo.rotateY(-Math.PI / 2);
  noseGeo.translate(1.275, 0.65, 3.15);

  const noseMesh = new THREE.Mesh(noseGeo, materials.locoBody);
  noseMesh.castShadow = !isSoftwareGl;
  noseMesh.receiveShadow = !isSoftwareGl;
  group.add(noseMesh);

  // 3. Secondary Read: Crimson Aerodynamic Side Skirts & Nose Cowcatcher
  const skirtLeft = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.55, 10.6),
    materials.locoTrim
  );
  skirtLeft.position.set(1.46, 0.72, -0.2);
  group.add(skirtLeft);

  const skirtRight = skirtLeft.clone();
  skirtRight.position.x = -1.46;
  group.add(skirtRight);

  const frontPlow = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.48, 0.55, 6, 1, false, -Math.PI / 2, Math.PI),
    materials.darkSteel
  );
  frontPlow.position.set(0, 0.42, 5.4);
  group.add(frontPlow);

  // 4. Secondary Read: Panoramic Tinted Cockpit Windshield Visor (protruding cleanly on nose slope)
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(2.58, 0.72, 1.85),
    materials.locoGlass
  );
  windshield.position.set(0, 2.46, 4.05);
  windshield.rotation.x = 0.48;
  group.add(windshield);

  // 5. Secondary Read: Dual Heavy Bogies + 8 Steel Wheelsets
  const bogieOffsets = [-3.2, 2.4];
  for (const bz of bogieOffsets) {
    const bogieFrame = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.45, 2.6),
      materials.darkSteel
    );
    bogieFrame.position.set(0, 0.52, bz);
    group.add(bogieFrame);

    for (const wz of [-0.85, 0.85]) {
      for (const wx of [-1.05, 1.05]) {
        const wheel = new THREE.Mesh(geometries.wheel, materials.railSteel);
        wheel.position.set(wx, 0.48, bz + wz);
        group.add(wheel);
      }
    }
  }

  // 6. Accent Detail: Roof High-Voltage Pantograph & Aerodynamic Shroud
  const roofShroud = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.32, 6.2),
    materials.darkSteel
  );
  roofShroud.position.set(0, 3.42, -1.2);
  group.add(roofShroud);

  const pantographArm1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8),
    materials.locoTrim
  );
  pantographArm1.position.set(0, 3.9, -2.2);
  pantographArm1.rotation.x = 0.55;
  group.add(pantographArm1);

  const pantographArm2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8),
    materials.locoTrim
  );
  pantographArm2.position.set(0, 4.45, -2.2);
  pantographArm2.rotation.x = -0.55;
  group.add(pantographArm2);

  const pantographBow = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.06, 0.18),
    materials.railSteel
  );
  pantographBow.position.set(0, 4.82, -2.2);
  group.add(pantographBow);

  // 7. Accent Detail: Twin LED Headlamps & Volumetric Light Cone + SpotLight
  const lampLeft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12),
    materials.headlightEmissive
  );
  lampLeft.rotation.x = Math.PI / 2;
  lampLeft.position.set(0.78, 1.15, 6.18);
  group.add(lampLeft);

  const lampRight = lampLeft.clone();
  lampRight.position.x = -0.78;
  group.add(lampRight);

  const beamGeo = new THREE.ConeGeometry(3.2, 18.0, 16, 1, true);
  beamGeo.rotateX(Math.PI / 2);
  beamGeo.translate(0, -0.4, 9.5);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const headlightBeamMesh = new THREE.Mesh(beamGeo, beamMat);
  headlightBeamMesh.position.set(0, 1.15, 6.2);
  group.add(headlightBeamMesh);

  const headlightSpot = new THREE.SpotLight(0xfef08a, 4.5, 65, Math.PI / 5, 0.6, 1.5);
  headlightSpot.position.set(0, 1.6, 6.2);
  headlightSpot.target.position.set(0, 0.4, 32);
  group.add(headlightSpot);
  group.add(headlightSpot.target);

  return { group, headlightSpot, headlightBeamMesh };
}

/**
 * Builds an Express Passenger Carriage as an 8-part composite THREE.Group
 */
export function createPassengerWagonModel(
  assets: SharedSceneAssets,
  isTailWagon: boolean
): THREE.Group {
  const group = new THREE.Group();
  const { materials, geometries, isSoftwareGl } = assets;

  // Contact shadow disc/plane
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 10.6),
    materials.contactShadow
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0, 0.02, 0);
  group.add(shadowPlane);

  // 1. Primary Silhouette: Carriage Hull with Lit Windows
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(2.92, 2.65, 9.8),
    materials.coachWindowLit
  );
  hull.position.set(0, 1.95, 0);
  hull.castShadow = !isSoftwareGl;
  hull.receiveShadow = !isSoftwareGl;
  group.add(hull);

  // 2. Secondary Read: Lower Chassis Skirt
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(2.65, 0.5, 9.4),
    materials.darkSteel
  );
  chassis.position.set(0, 0.72, 0);
  group.add(chassis);

  // 3. Secondary Read: Roof Climate Control Unit
  const hvacPod = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.28, 4.2),
    materials.locoBody
  );
  hvacPod.position.set(0, 3.4, 0);
  group.add(hvacPod);

  // 4. Secondary Read: Front & Rear Bogies + Wheels
  for (const bz of [-3.3, 3.3]) {
    const bogie = new THREE.Mesh(
      new THREE.BoxGeometry(2.45, 0.42, 2.3),
      materials.darkSteel
    );
    bogie.position.set(0, 0.5, bz);
    group.add(bogie);

    for (const wz of [-0.75, 0.75]) {
      for (const wx of [-1.05, 1.05]) {
        const wheel = new THREE.Mesh(geometries.wheel, materials.railSteel);
        wheel.position.set(wx, 0.48, bz + wz);
        group.add(wheel);
      }
    }
  }

  // 5. Accent Detail: Inter-car Accordions / Coupler Diaphragm
  const coupler = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 2.25, 1.35),
    materials.darkSteel
  );
  coupler.position.set(0, 1.88, 5.15);
  group.add(coupler);

  // 6. Accent Detail: Rear Red Tail Lamps on last wagon
  if (isTailWagon) {
    for (const lx of [-0.95, 0.95]) {
      const tailLamp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10),
        materials.taillightEmissive
      );
      tailLamp.rotation.x = Math.PI / 2;
      tailLamp.position.set(lx, 1.45, -4.92);
      group.add(tailLamp);
    }
  }

  return group;
}

/**
 * Composite 4-part Procedural Tree (`THREE.Group`: trunk + 3 tiered cones + snow/highlight tip)
 */
function createCompositeTree(
  assets: SharedSceneAssets,
  scale: number,
  isSnowy: boolean
): THREE.Group {
  const tree = new THREE.Group();
  const { materials, geometries } = assets;

  const shadow = new THREE.Mesh(geometries.contactDisc, materials.contactShadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.setScalar(1.8 * scale);
  shadow.position.y = 0.02;
  tree.add(shadow);

  const trunk = new THREE.Mesh(geometries.trunk, materials.woodTrunk);
  trunk.position.y = 0.9 * scale;
  trunk.scale.setScalar(scale);
  tree.add(trunk);

  const c1 = new THREE.Mesh(geometries.pineConeBottom, materials.pineFoliage);
  c1.position.y = 2.4 * scale;
  c1.scale.setScalar(scale);
  tree.add(c1);

  const c2 = new THREE.Mesh(geometries.pineConeMid, materials.pineFoliage);
  c2.position.y = 3.9 * scale;
  c2.scale.setScalar(scale);
  tree.add(c2);

  const c3 = new THREE.Mesh(
    geometries.pineConeTop,
    isSnowy ? materials.snowCap : materials.pineFoliage
  );
  c3.position.y = 5.2 * scale;
  c3.scale.setScalar(scale);
  tree.add(c3);

  return tree;
}

/**
 * Composite 4-part Procedural City Skyscraper (`THREE.Group`: podium base, glass tower, crown setback, spire)
 */
function createCompositeSkyscraper(
  assets: SharedSceneAssets,
  width: number,
  height: number,
  depth: number
): THREE.Group {
  const bldg = new THREE.Group();
  const { materials, geometries } = assets;

  // 1. Podium Base
  const podiumH = Math.min(3.5, height * 0.18);
  const podium = new THREE.Mesh(geometries.boxUnit, materials.cityPodium);
  podium.scale.set(width * 1.15, podiumH, depth * 1.15);
  podium.position.y = podiumH * 0.5;
  bldg.add(podium);

  // 2. Main Illuminated Tower
  const tower = new THREE.Mesh(geometries.boxUnit, materials.cityBuilding);
  tower.scale.set(width, height, depth);
  tower.position.y = height * 0.5;
  bldg.add(tower);

  // 3. Upper Setback Crown
  const crownH = height * 0.16;
  const crown = new THREE.Mesh(geometries.boxUnit, materials.cityPodium);
  crown.scale.set(width * 0.72, crownH, depth * 0.72);
  crown.position.y = height + crownH * 0.5;
  bldg.add(crown);

  // 4. Rooftop Spire & Beacon
  const spire = new THREE.Mesh(geometries.trunk, materials.railSteel);
  spire.scale.set(0.35, 2.2, 0.35);
  spire.position.y = height + crownH + 1.8;
  bldg.add(spire);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    materials.taillightEmissive
  );
  beacon.position.y = height + crownH + 3.6;
  bldg.add(beacon);

  return bldg;
}

/**
 * Composite 4-part Village Cottage / Chalet (`THREE.Group`: stone plinth, timber walls, gabled roof, chimney + warm window)
 */
function createCompositeCottage(
  assets: SharedSceneAssets,
  scale: number
): THREE.Group {
  const house = new THREE.Group();
  const { materials, geometries } = assets;

  const shadow = new THREE.Mesh(geometries.contactDisc, materials.contactShadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.setScalar(3.4 * scale);
  shadow.position.y = 0.02;
  house.add(shadow);

  // 1. Main Walls
  const walls = new THREE.Mesh(geometries.boxUnit, materials.villageWall);
  walls.scale.set(4.2 * scale, 2.8 * scale, 3.6 * scale);
  walls.position.y = 1.4 * scale;
  house.add(walls);

  // 2. Gabled Pitched Roof
  const roof = new THREE.Mesh(geometries.gableRoof, materials.villageRoof);
  roof.scale.set(3.9 * scale, 2.6 * scale, 3.4 * scale);
  roof.position.y = 3.55 * scale;
  house.add(roof);

  // 3. Brick Chimney
  const chimney = new THREE.Mesh(geometries.boxUnit, materials.cityPodium);
  chimney.scale.set(0.55 * scale, 1.8 * scale, 0.55 * scale);
  chimney.position.set(1.1 * scale, 3.8 * scale, -0.6 * scale);
  house.add(chimney);

  // 4. Warm Glowing Window
  const win = new THREE.Mesh(geometries.boxUnit, materials.headlightEmissive);
  win.scale.set(0.9 * scale, 0.75 * scale, 3.68 * scale);
  win.position.set(-0.7 * scale, 1.5 * scale, 0);
  house.add(win);

  return house;
}

/**
 * Composite 3-part Alpine Mountain Peak / Outcrop (`THREE.Group`: main crag, secondary boulder, snow cap)
 */
function createCompositeMountainPeak(
  assets: SharedSceneAssets,
  scale: number,
  hasSnow: boolean
): THREE.Group {
  const peak = new THREE.Group();
  const { materials, geometries } = assets;

  const baseRock = new THREE.Mesh(geometries.pineConeBottom, materials.rockCliff);
  baseRock.scale.set(scale * 1.4, scale * 1.8, scale * 1.3);
  baseRock.position.y = scale * 2.2;
  peak.add(baseRock);

  const sideCrag = new THREE.Mesh(geometries.rockDodeca, materials.rockCliff);
  sideCrag.scale.set(scale * 1.2, scale * 1.4, scale * 1.1);
  sideCrag.position.set(scale * 1.1, scale * 1.1, scale * 0.4);
  peak.add(sideCrag);

  if (hasSnow) {
    const snow = new THREE.Mesh(geometries.pineConeTop, materials.snowCap);
    snow.scale.set(scale * 1.15, scale * 1.3, scale * 1.1);
    snow.position.y = scale * 4.1;
    peak.add(snow);
  }

  return peak;
}

/**
 * Generates one complete 60m procedural chunk at `chunkIndex`
 */
export function buildWorldChunk(
  chunkIndex: number,
  biomeMode: BiomeMode,
  assets: SharedSceneAssets
): { group: THREE.Group; disposables: THREE.BufferGeometry[] } {
  const group = new THREE.Group();
  const disposables: THREE.BufferGeometry[] = [];
  const zStart = chunkIndex * CHUNK_LENGTH;

  // 1. Continuous Procedural Terrain Mesh with Vertex Colors
  const segX = 20;
  const segZ = 14;
  const widthX = 170;
  const terrainGeo = new THREE.BufferGeometry();
  const vertices = new Float32Array((segX + 1) * (segZ + 1) * 3);
  const colors = new Float32Array((segX + 1) * (segZ + 1) * 3);
  const indices: number[] = [];

  const cPrimary = new THREE.Color();
  const cSecondary = new THREE.Color();
  const cRock = new THREE.Color();
  const cSnow = new THREE.Color(0xf8fafc);
  const cWater = new THREE.Color(0x0ea5e9);
  const cBallast = new THREE.Color(0x64748b);

  let ptr = 0;
  for (let iz = 0; iz <= segZ; iz++) {
    const wz = zStart + (iz / segZ) * CHUNK_LENGTH;
    const trackPt = getTrackPointAtS(wz, biomeMode);
    const { primary, secondary, blend } = getBiomeAtDistance(wz, biomeMode);

    cPrimary.setHex(primary.groundColor).lerp(cSecondary.setHex(secondary.groundColor), blend);
    cRock.setHex(primary.rockColor);

    for (let ix = 0; ix <= segX; ix++) {
      const localX = (ix / segX - 0.5) * widthX;
      const wx = trackPt.x + localX;
      const { height, distFromTrack, isWater } = getTerrainHeightAt(wx, wz, biomeMode);

      vertices[ptr * 3] = wx;
      vertices[ptr * 3 + 1] = height;
      vertices[ptr * 3 + 2] = wz;

      const outColor = cPrimary.clone();
      if (isWater) {
        outColor.copy(cWater);
      } else if (distFromTrack < 3.8 && !trackPt.isBridge) {
        outColor.copy(cBallast);
      } else if (height > trackPt.y + 8.5) {
        outColor.copy(cSnow);
      } else if (height > trackPt.y + 3.2 || primary.id === 'mountain') {
        outColor.lerp(cRock, 0.55);
      }

      colors[ptr * 3] = outColor.r;
      colors[ptr * 3 + 1] = outColor.g;
      colors[ptr * 3 + 2] = outColor.b;
      ptr++;
    }
  }

  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * (segX + 1) + ix;
      const b = a + 1;
      const c = (iz + 1) * (segX + 1) + ix;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  terrainGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.setIndex(indices);
  terrainGeo.computeVertexNormals();
  disposables.push(terrainGeo);

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = !assets.isSoftwareGl;
  group.add(terrainMesh);

  // 2. Procedural Spline Rails, Sleepers (InstancedMesh), & Viaduct Bridges
  const railSamples = 18;
  const leftRailPts: THREE.Vector3[] = [];
  const rightRailPts: THREE.Vector3[] = [];
  const gaugeHalf = 0.78;

  for (let i = 0; i <= railSamples; i++) {
    const s = zStart + (i / railSamples) * CHUNK_LENGTH;
    const pt = getTrackPointAtS(s, biomeMode);
    const nextPt = getTrackPointAtS(s + 0.5, biomeMode);
    const dirX = nextPt.x - pt.x;
    const dirZ = nextPt.z - pt.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    const perpX = dirZ / len;
    const perpZ = -dirX / len;

    const bankLift = Math.sin(pt.banking) * gaugeHalf;
    leftRailPts.push(
      new THREE.Vector3(pt.x + perpX * gaugeHalf, pt.y + 0.16 + bankLift, pt.z + perpZ * gaugeHalf)
    );
    rightRailPts.push(
      new THREE.Vector3(pt.x - perpX * gaugeHalf, pt.y + 0.16 - bankLift, pt.z - perpZ * gaugeHalf)
    );
  }

  const leftCurve = new THREE.CatmullRomCurve3(leftRailPts);
  const rightCurve = new THREE.CatmullRomCurve3(rightRailPts);
  const leftRailGeo = new THREE.TubeGeometry(leftCurve, 18, 0.08, 6, false);
  const rightRailGeo = new THREE.TubeGeometry(rightCurve, 18, 0.08, 6, false);
  disposables.push(leftRailGeo, rightRailGeo);

  group.add(new THREE.Mesh(leftRailGeo, assets.materials.railSteel));
  group.add(new THREE.Mesh(rightRailGeo, assets.materials.railSteel));

  const sleeperCount = 32;
  const sleeperInstanced = new THREE.InstancedMesh(
    assets.geometries.sleeper,
    assets.materials.sleeperWood,
    sleeperCount
  );
  const dummy = new THREE.Object3D();

  for (let i = 0; i < sleeperCount; i++) {
    const s = zStart + ((i + 0.5) / sleeperCount) * CHUNK_LENGTH;
    const pt = getTrackPointAtS(s, biomeMode);
    const nextPt = getTrackPointAtS(s + 0.4, biomeMode);
    const yaw = Math.atan2(nextPt.x - pt.x, nextPt.z - pt.z);

    dummy.position.set(pt.x, pt.y + 0.06, pt.z);
    dummy.rotation.set(0, yaw, pt.banking);
    dummy.updateMatrix();
    sleeperInstanced.setMatrixAt(i, dummy.matrix);

    if (i % 4 === 0 && pt.isBridge) {
      const pierGroup = new THREE.Group();
      const deck = new THREE.Mesh(assets.geometries.boxUnit, assets.materials.viaductStone);
      deck.scale.set(4.4, 0.65, 7.8);
      deck.position.set(0, -0.32, 0);
      pierGroup.add(deck);

      const pillar = new THREE.Mesh(assets.geometries.boxUnit, assets.materials.viaductStone);
      pillar.scale.set(2.4, 14.0, 2.2);
      pillar.position.set(0, -7.2, 0);
      pierGroup.add(pillar);

      pierGroup.position.set(pt.x, pt.y, pt.z);
      pierGroup.rotation.y = yaw;
      group.add(pierGroup);
    }

    if (i % 8 === 0) {
      const mastSide = (i / 8) % 2 === 0 ? 1 : -1;
      const mastGroup = new THREE.Group();
      const pole = new THREE.Mesh(assets.geometries.trunk, assets.materials.darkSteel);
      pole.scale.set(0.45, 3.4, 0.45);
      pole.position.set(mastSide * 2.45, 2.9, 0);
      mastGroup.add(pole);

      const cantilever = new THREE.Mesh(assets.geometries.boxUnit, assets.materials.darkSteel);
      cantilever.scale.set(2.6, 0.12, 0.12);
      cantilever.position.set(mastSide * 1.2, 5.2, 0);
      mastGroup.add(cantilever);

      mastGroup.position.set(pt.x, pt.y, pt.z);
      mastGroup.rotation.y = yaw;
      group.add(mastGroup);
    }
  }
  sleeperInstanced.instanceMatrix.needsUpdate = true;
  sleeperInstanced.computeBoundingSphere();
  group.add(sleeperInstanced);

  // 3. Biome Props & Landmarks along Both Flanks of the Track
  const propRows = 8;
  for (let r = 0; r < propRows; r++) {
    const s = zStart + ((r + 0.5) / propRows) * CHUNK_LENGTH;
    const trackPt = getTrackPointAtS(s, biomeMode);
    const { primary } = getBiomeAtDistance(s, biomeMode);

    for (const side of [-1, 1]) {
      for (let layer = 0; layer < 2; layer++) {
        const seed = chunkIndex * 911 + r * 37 + (side > 0 ? 13 : 29) + layer * 101;
        const rand1 = seededRandom(seed);
        const rand2 = seededRandom(seed + 7);
        const lateralDist = 11.5 + layer * 16.0 + rand1 * 10.0;
        const wx = trackPt.x + side * lateralDist;
        const wz = s + (rand2 - 0.5) * 4.5;

        const terrainInfo = getTerrainHeightAt(wx, wz, biomeMode);
        if (terrainInfo.isWater) continue;

        if (primary.id === 'city') {
          if (rand1 < primary.buildingDensity) {
            const bW = 5.5 + rand2 * 5.0;
            const bD = 5.5 + seededRandom(seed + 19) * 5.0;
            const bH = 12.0 + seededRandom(seed + 31) * 26.0;
            const skyscraper = createCompositeSkyscraper(assets, bW, bH, bD);
            skyscraper.position.set(wx, terrainInfo.height - 0.3, wz);
            skyscraper.rotation.y = (rand2 - 0.5) * 0.4;
            group.add(skyscraper);
          } else if (rand2 < 0.35) {
            const tree = createCompositeTree(assets, 0.8 + rand1 * 0.3, false);
            tree.position.set(wx, terrainInfo.height - 0.1, wz);
            group.add(tree);
          }
        } else if (primary.id === 'village') {
          if (layer === 0 && rand1 < primary.buildingDensity + 0.15) {
            const cottage = createCompositeCottage(assets, 0.9 + rand2 * 0.35);
            cottage.position.set(wx, terrainInfo.height - 0.15, wz);
            cottage.rotation.y =
              side > 0
                ? -Math.PI / 2 + (rand2 - 0.5) * 0.5
                : Math.PI / 2 + (rand2 - 0.5) * 0.5;
            group.add(cottage);
          } else if (rand2 < primary.treeDensity + 0.3) {
            const tree = createCompositeTree(assets, 0.9 + rand1 * 0.45, false);
            tree.position.set(wx, terrainInfo.height - 0.1, wz);
            group.add(tree);
          }
        } else if (primary.id === 'forest') {
          const treeCount = 2;
          for (let t = 0; t < treeCount; t++) {
            const ox = wx + (seededRandom(seed + t * 11) - 0.5) * 7.0;
            const oz = wz + (seededRandom(seed + t * 23) - 0.5) * 5.0;
            const th = getTerrainHeightAt(ox, oz, biomeMode);
            if (th.distFromTrack < 7.0 || th.isWater) continue;
            const scale = 0.9 + seededRandom(seed + t * 41) * 0.75;
            const tree = createCompositeTree(assets, scale, false);
            tree.position.set(ox, th.height - 0.1, oz);
            tree.rotation.y = seededRandom(seed + t) * Math.PI * 2;
            group.add(tree);
          }
        } else if (primary.id === 'mountain') {
          if (layer === 1 || rand1 < 0.65) {
            const peakScale = 2.4 + rand2 * 3.0;
            const peak = createCompositeMountainPeak(
              assets,
              peakScale,
              terrainInfo.height > trackPt.y + 1.5
            );
            peak.position.set(wx, terrainInfo.height - 0.8, wz);
            peak.rotation.y = rand1 * Math.PI * 2;
            group.add(peak);
          }
          if (layer === 0 && rand2 < 0.45) {
            const tree = createCompositeTree(assets, 0.8 + rand1 * 0.4, true);
            tree.position.set(wx, terrainInfo.height - 0.1, wz);
            group.add(tree);
          }
        }
      }
    }
  }

  return { group, disposables };
}
