import * as THREE from 'three';
import { getVehicleClassInfo, isFlightUnlocked } from '../sim/taxiEconomy';
import type { BiomeId, OrderPhase, UpgradeLevels } from '../sim/types';
import { BiomeCostumeLibrary } from './passengerCostumes';
import type { ProceduralTexturePack } from './proceduralTextures';

export interface HeroTaxiRig {
  root: THREE.Group;
  bodyTiltGroup: THREE.Group;
  triggerUpgradeBurst: () => void;
  update: (params: {
    x: number;
    z: number;
    yaw: number;
    steerAngle: number;
    wheelSpin: number;
    speedMs: number;
    braking: boolean;
    turnSignal: -1 | 0 | 1;
    doorOpenAmount: number;
    hasPassengerInCabin: boolean;
    passengerCoatHex: number;
    passengerSkinHex: number;
    passengerArchetype: BiomeId | null;
    altitude: number;
    flightBlend: number;
    verticalVelocity: number;
    nightFactor: number;
    phase: OrderPhase;
    upgrades: UpgradeLevels;
    elapsed: number;
  }) => void;
  dispose: () => void;
}

/**
 * Showroom-grade 45+ part composite 3D Autonomous Taxi (`THREE.Group`):
 * - Open-cabin transparent greenhouse revealing full 3D interior (seats, dashboard, rotating steering wheel,
 *   3D driver figure, and visible seated 3D passenger wearing the active client's coat!)
 * - Articulated curb-side passenger door (swings outward on classic tiers, lifts dihedral/scissor on GT tiers,
 *   and sweeps upward as gullwing supercar doors on Prestige/Hyper tiers!) + warm interior dome lighting
 * - Active blinking amber turn signals, LED DRL eyebrows, brake light bar, license plates, checker striping
 * - Dramatic multi-stage upgrade evolution across all 4 infinite tracks (spoilers -> double GT wing,
 *   quad titanium exhausts + turbo flames, widebody fenders + canards + underglow, LiDAR turret + side radar pods,
 *   VIP leather interior + golden crown beacon) + upgrade celebration halo ring.
 */
export function createHeroTaxi(
  textures: ProceduralTexturePack,
  isSoftwareGl: boolean,
): HeroTaxiRig {
  const root = new THREE.Group();
  const airframeGroup = new THREE.Group();
  root.add(airframeGroup);
  const bodyTiltGroup = new THREE.Group();
  airframeGroup.add(bodyTiltGroup);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // --- PBR Material Palette (distinct roughness/metalness contrast) ---
  const paintMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xf4b41a,
      metalness: 0.62,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.07,
    }),
  );

  const trimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1b202b,
      metalness: 0.72,
      roughness: 0.34,
    }),
  );

  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe6edf5,
      metalness: 0.95,
      roughness: 0.12,
    }),
  );

  const rimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdbe4ee,
      metalness: 0.92,
      roughness: 0.16,
    }),
  );

  const carbonMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161920,
      metalness: 0.36,
      roughness: 0.48,
    }),
  );

  const pillarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x11151d,
      metalness: 0.45,
      roughness: 0.25,
    }),
  );

  // Real semi-transparent smoked glass so cabin, driver, and seated passenger are clearly visible!
  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x101c2e,
      metalness: 0.15,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
    }),
  );

  const seatMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2a2f3a,
      roughness: 0.84,
      metalness: 0.04,
    }),
  );

  const dashMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x171b24,
      roughness: 0.68,
      metalness: 0.12,
    }),
  );

  const rubberMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x15171d,
      metalness: 0.04,
      roughness: 0.88,
    }),
  );

  const caliperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.55,
      roughness: 0.28,
    }),
  );

  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xfff5db,
      emissiveIntensity: 2.0,
      roughness: 0.1,
    }),
  );

  const drlMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe0f2fe,
      emissiveIntensity: 2.2,
      roughness: 0.1,
    }),
  );

  const taillightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0xef4444,
      emissiveIntensity: 1.5,
      roughness: 0.16,
    }),
  );

  const signalLeftMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb45309,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.0,
      roughness: 0.2,
    }),
  );

  const signalRightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb45309,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.0,
      roughness: 0.2,
    }),
  );

  const taxiSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.taxiSignMap,
      emissive: 0xfbbf24,
      emissiveMap: textures.taxiSignMap,
      emissiveIntensity: 1.0,
      roughness: 0.24,
    }),
  );

  const checkerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.checkerStripeMap,
      roughness: 0.35,
      metalness: 0.2,
    }),
  );

  const plateMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.licensePlateMap,
      emissive: 0xffffff,
      emissiveMap: textures.licensePlateMap,
      emissiveIntensity: 0.25,
      roughness: 0.3,
    }),
  );

  const domeLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff8e1,
      emissive: 0xffd580,
      emissiveIntensity: 0.35,
      roughness: 0.2,
    }),
  );

  const dashScreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.4,
      roughness: 0.15,
    }),
  );

  const accentGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.0,
      roughness: 0.15,
    }),
  );

  const underglowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      map: textures.underglowMap,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );

  const beamMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfff5db,
      map: textures.headlightPoolMap,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );

  const flameMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );

  const burstMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );

  const passengerCoatMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe11d48,
      roughness: 0.7,
    }),
  );

  const passengerSkinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf1c29b,
      roughness: 0.65,
    }),
  );

  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf1c29b,
      roughness: 0.65,
    }),
  );

  const driverSuitMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.78,
    }),
  );

  const hairMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x261c17,
      roughness: 0.85,
    }),
  );

  // --- Contact Shadow & Road Headlight Pool ---
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(2.6, 5.2));
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
    }),
  );
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI * 0.5;
  shadowDisc.position.set(0, 0.03, 0.02);
  root.add(shadowDisc);

  const poolGeo = trackGeo(new THREE.PlaneGeometry(4.8, 12.8));
  poolGeo.rotateX(-Math.PI * 0.5);
  const beamPool = new THREE.Mesh(poolGeo, beamMat);
  beamPool.position.set(0, 0.045, 8.8);
  root.add(beamPool);

  // --- Upgrade Celebration Burst Ring ---
  const burstGeo = trackGeo(new THREE.RingGeometry(1.4, 2.2, 32));
  burstGeo.rotateX(-Math.PI * 0.5);
  const burstRing = new THREE.Mesh(burstGeo, burstMat);
  burstRing.visible = false;
  airframeGroup.add(burstRing);

  // =========================================================================
  // 1. SCULPTED OPEN-CABIN BODY ARCHITECTURE (Hollow center for visible interior)
  // =========================================================================

  // Floorpan / lower chassis tub
  const floorGeo = trackGeo(new THREE.BoxGeometry(1.88, 0.24, 4.72));
  const floorPan = new THREE.Mesh(floorGeo, carbonMat);
  floorPan.position.set(0, 0.4, 0.0);
  floorPan.castShadow = !isSoftwareGl;
  bodyTiltGroup.add(floorPan);

  // Sculpted Front Engine Bay & Aerodynamic Hood (z: +0.74 to +2.44)
  const frontShape = new THREE.Shape();
  frontShape.moveTo(0.72, 0.36);
  frontShape.lineTo(2.38, 0.34);
  frontShape.lineTo(2.47, 0.58);
  frontShape.lineTo(2.24, 0.86);
  frontShape.lineTo(0.72, 0.96);
  frontShape.closePath();

  const frontGeo = trackGeo(
    new THREE.ExtrudeGeometry(frontShape, {
      depth: 1.82,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 3,
    }),
  );
  frontGeo.translate(0, 0, -0.91);
  frontGeo.rotateY(-Math.PI * 0.5);
  const frontBody = new THREE.Mesh(frontGeo, paintMat);
  frontBody.castShadow = !isSoftwareGl;
  frontBody.receiveShadow = true;
  bodyTiltGroup.add(frontBody);

  // Sculpted Hood Power Bulge Crease
  const hoodCreaseGeo = trackGeo(new THREE.BoxGeometry(0.92, 0.05, 1.38));
  const hoodCrease = new THREE.Mesh(hoodCreaseGeo, paintMat);
  hoodCrease.position.set(0, 0.97, 1.54);
  hoodCrease.rotation.x = 0.06;
  bodyTiltGroup.add(hoodCrease);

  // Sculpted Rear Trunk Deck & Quarter Panels (z: -2.44 to -1.04)
  const rearShape = new THREE.Shape();
  rearShape.moveTo(-2.38, 0.38);
  rearShape.lineTo(-1.04, 0.38);
  rearShape.lineTo(-1.04, 0.96);
  rearShape.lineTo(-1.95, 0.97);
  rearShape.lineTo(-2.38, 0.87);
  rearShape.lineTo(-2.45, 0.55);
  rearShape.closePath();

  const rearGeo = trackGeo(
    new THREE.ExtrudeGeometry(rearShape, {
      depth: 1.84,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 3,
    }),
  );
  rearGeo.translate(0, 0, -0.92);
  rearGeo.rotateY(-Math.PI * 0.5);
  const rearBody = new THREE.Mesh(rearGeo, paintMat);
  rearBody.castShadow = !isSoftwareGl;
  rearBody.receiveShadow = true;
  bodyTiltGroup.add(rearBody);

  // Left Side Complete Body Doors (+X driver side, z: -1.08 to +0.76)
  const leftSideGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.62, 1.88));
  const leftSideDoor = new THREE.Mesh(leftSideGeo, paintMat);
  leftSideDoor.position.set(0.91, 0.68, -0.16);
  leftSideDoor.castShadow = !isSoftwareGl;
  bodyTiltGroup.add(leftSideDoor);

  // Right Side Front Door (-X front passenger side, z: +0.02 to +0.78)
  const rightFrontDoorGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.62, 0.8));
  const rightFrontDoor = new THREE.Mesh(rightFrontDoorGeo, paintMat);
  rightFrontDoor.position.set(-0.91, 0.68, 0.38);
  bodyTiltGroup.add(rightFrontDoor);

  // Checker taxi stripes along left side and right front door
  const checkerLeftGeo = trackGeo(new THREE.BoxGeometry(0.02, 0.11, 1.84));
  const checkerLeft = new THREE.Mesh(checkerLeftGeo, checkerMat);
  checkerLeft.position.set(0.99, 0.71, -0.16);
  bodyTiltGroup.add(checkerLeft);

  const checkerRFGeo = trackGeo(new THREE.BoxGeometry(0.02, 0.11, 0.78));
  const checkerRF = new THREE.Mesh(checkerRFGeo, checkerMat);
  checkerRF.position.set(-0.99, 0.71, 0.38);
  bodyTiltGroup.add(checkerRF);

  // Chrome exterior handles on left doors & right front door
  const handleGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.045, 0.2));
  const hLF = new THREE.Mesh(handleGeo, chromeMat);
  hLF.position.set(0.99, 0.84, 0.2);
  const hLR = new THREE.Mesh(handleGeo, chromeMat);
  hLR.position.set(0.99, 0.84, -0.68);
  const hRF = new THREE.Mesh(handleGeo, chromeMat);
  hRF.position.set(-0.99, 0.84, 0.2);
  bodyTiltGroup.add(hLF, hLR, hRF);

  // =========================================================================
  // 2. ARTICULATED CURB-SIDE REAR PASSENGER DOOR (Opens during boarding/dropoff!)
  // =========================================================================
  // Hinged at the B-pillar (-0.92, 0.72, -0.02) extending backward to z = -1.08
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.92, 0.72, -0.02);
  bodyTiltGroup.add(doorPivot);

  const doorPanelGeo = trackGeo(new THREE.BoxGeometry(0.13, 0.6, 1.04));
  const doorPanel = new THREE.Mesh(doorPanelGeo, paintMat);
  doorPanel.position.set(0.01, -0.04, -0.52);
  doorPanel.castShadow = !isSoftwareGl;
  doorPivot.add(doorPanel);

  // Inner leather door trim panel
  const doorInnerGeo = trackGeo(new THREE.BoxGeometry(0.04, 0.52, 0.96));
  const doorInner = new THREE.Mesh(doorInnerGeo, dashMat);
  doorInner.position.set(0.075, -0.04, -0.52);
  doorPivot.add(doorInner);

  // Taxi checker strip on moving door
  const doorCheckerGeo = trackGeo(new THREE.BoxGeometry(0.02, 0.11, 1.0));
  const doorChecker = new THREE.Mesh(doorCheckerGeo, checkerMat);
  doorChecker.position.set(-0.068, -0.01, -0.52);
  doorPivot.add(doorChecker);

  // Chrome handle on moving door
  const doorHandle = new THREE.Mesh(handleGeo, chromeMat);
  doorHandle.position.set(-0.075, 0.12, -0.76);
  doorPivot.add(doorHandle);

  // Door window glass & slim pillar frame (moves with the door!)
  const doorGlassGeo = trackGeo(new THREE.BoxGeometry(0.04, 0.48, 0.92));
  const doorGlass = new THREE.Mesh(doorGlassGeo, glassMat);
  doorGlass.position.set(0.05, 0.46, -0.5);
  doorGlass.rotation.z = -0.18;
  doorPivot.add(doorGlass);

  const doorFrameTopGeo = trackGeo(new THREE.BoxGeometry(0.07, 0.05, 0.9));
  const doorFrameTop = new THREE.Mesh(doorFrameTopGeo, pillarMat);
  doorFrameTop.position.set(0.11, 0.71, -0.49);
  doorPivot.add(doorFrameTop);

  // Glowing door-sill accent bar (lights up when door opens!)
  const sillLightGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.035, 0.98));
  const sillLight = new THREE.Mesh(sillLightGeo, domeLightMat);
  sillLight.position.set(-0.88, 0.42, -0.54);
  bodyTiltGroup.add(sillLight);

  // =========================================================================
  // 3. GREENHOUSE PILLARS, ROOF & TRANSPARENT WINDOWS
  // =========================================================================
  const roofGeo = trackGeo(new THREE.BoxGeometry(1.42, 0.08, 1.46));
  const roofPanel = new THREE.Mesh(roofGeo, paintMat);
  roofPanel.position.set(0, 1.49, -0.22);
  roofPanel.castShadow = !isSoftwareGl;
  bodyTiltGroup.add(roofPanel);

  // Panoramic tinted glass sunroof inset
  const sunroofGeo = trackGeo(new THREE.BoxGeometry(1.06, 0.03, 0.92));
  const sunroof = new THREE.Mesh(sunroofGeo, glassMat);
  sunroof.position.set(0, 1.525, -0.26);
  bodyTiltGroup.add(sunroof);

  // Interior Dome Light Panel
  const domeGeo = trackGeo(new THREE.BoxGeometry(0.45, 0.04, 0.32));
  const domeLight = new THREE.Mesh(domeGeo, domeLightMat);
  domeLight.position.set(0, 1.43, -0.35);
  bodyTiltGroup.add(domeLight);

  // Slim Sculpted A, B, C Pillars
  const aPillarGeo = trackGeo(new THREE.BoxGeometry(0.09, 0.72, 0.09));
  for (const sx of [-0.76, 0.76]) {
    const aPillar = new THREE.Mesh(aPillarGeo, pillarMat);
    aPillar.position.set(sx, 1.22, 0.68);
    aPillar.rotation.set(-0.68, 0, sx > 0 ? 0.19 : -0.19);
    bodyTiltGroup.add(aPillar);

    const bPillar = new THREE.Mesh(aPillarGeo, pillarMat);
    bPillar.scale.set(1, 0.78, 1.15);
    bPillar.position.set(sx * 1.04, 1.23, -0.02);
    bPillar.rotation.set(0, 0, sx > 0 ? 0.2 : -0.2);
    bodyTiltGroup.add(bPillar);

    const cPillar = new THREE.Mesh(aPillarGeo, pillarMat);
    cPillar.scale.set(1.1, 1.05, 1.35);
    cPillar.position.set(sx, 1.22, -1.04);
    cPillar.rotation.set(0.66, 0, sx > 0 ? 0.19 : -0.19);
    bodyTiltGroup.add(cPillar);
  }

  // Front Windshield & Wipers
  const windshieldGeo = trackGeo(new THREE.PlaneGeometry(1.48, 0.78));
  const windshield = new THREE.Mesh(windshieldGeo, glassMat);
  windshield.position.set(0, 1.22, 0.72);
  windshield.rotation.x = -0.78;
  bodyTiltGroup.add(windshield);

  const wiperGeo = trackGeo(new THREE.BoxGeometry(0.56, 0.025, 0.03));
  const wiper1 = new THREE.Mesh(wiperGeo, carbonMat);
  wiper1.position.set(0.32, 0.99, 0.98);
  wiper1.rotation.z = 0.08;
  const wiper2 = new THREE.Mesh(wiperGeo, carbonMat);
  wiper2.position.set(-0.28, 0.99, 0.98);
  wiper2.rotation.z = 0.08;
  bodyTiltGroup.add(wiper1, wiper2);

  // Rear Window Glass (clearly shows seated passenger's shoulders/head from Chase Cam!)
  const rearGlassGeo = trackGeo(new THREE.PlaneGeometry(1.44, 0.74));
  const rearGlass = new THREE.Mesh(rearGlassGeo, glassMat);
  rearGlass.position.set(0, 1.22, -1.08);
  rearGlass.rotation.set(0.74, Math.PI, 0);
  bodyTiltGroup.add(rearGlass);

  // Left Side & Right Front Fixed Side Windows
  const leftGlassGeo = trackGeo(new THREE.PlaneGeometry(1.66, 0.48));
  const leftGlass = new THREE.Mesh(leftGlassGeo, glassMat);
  leftGlass.position.set(0.84, 1.21, -0.18);
  leftGlass.rotation.set(0, Math.PI * 0.5, 0.18);
  bodyTiltGroup.add(leftGlass);

  const rfGlassGeo = trackGeo(new THREE.PlaneGeometry(0.68, 0.48));
  const rfGlass = new THREE.Mesh(rfGlassGeo, glassMat);
  rfGlass.position.set(-0.84, 1.21, 0.34);
  rfGlass.rotation.set(0, -Math.PI * 0.5, -0.18);
  bodyTiltGroup.add(rfGlass);

  // =========================================================================
  // 4. FULL 3D CABIN INTERIOR + DRIVER + SEATED PASSENGER
  // =========================================================================
  const dashGeo = trackGeo(new THREE.BoxGeometry(1.56, 0.32, 0.46));
  const dashboard = new THREE.Mesh(dashGeo, dashMat);
  dashboard.position.set(0, 0.84, 0.66);
  bodyTiltGroup.add(dashboard);

  // Glowing digital cockpit instrument display + center infotainment screen
  const screenGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.14, 0.04));
  const centerScreen = new THREE.Mesh(screenGeo, dashScreenMat);
  centerScreen.position.set(0, 0.96, 0.52);
  centerScreen.rotation.x = -0.25;
  const clusterScreen = new THREE.Mesh(screenGeo, dashScreenMat);
  clusterScreen.scale.set(0.8, 0.75, 1);
  clusterScreen.position.set(0.42, 0.94, 0.54);
  bodyTiltGroup.add(centerScreen, clusterScreen);

  // Center console armrest tunnel
  const consoleGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.32, 1.24));
  const centerConsole = new THREE.Mesh(consoleGeo, dashMat);
  centerConsole.position.set(0, 0.64, 0.04);
  bodyTiltGroup.add(centerConsole);

  // Rotating Steering Wheel (Left driver side, x = +0.42)
  const steeringPivot = new THREE.Group();
  steeringPivot.position.set(0.42, 0.93, 0.42);
  steeringPivot.rotation.x = -0.35;
  bodyTiltGroup.add(steeringPivot);

  const wheelRimGeo = trackGeo(new THREE.TorusGeometry(0.15, 0.024, 8, 16));
  const steerRim = new THREE.Mesh(wheelRimGeo, carbonMat);
  const steerSpokeGeo = trackGeo(new THREE.BoxGeometry(0.26, 0.03, 0.02));
  const steerSpoke = new THREE.Mesh(steerSpokeGeo, chromeMat);
  steeringPivot.add(steerRim, steerSpoke);

  // Front Bucket Seats + Headrests
  const seatBaseGeo = trackGeo(new THREE.BoxGeometry(0.52, 0.14, 0.5));
  const seatBackGeo = trackGeo(new THREE.BoxGeometry(0.48, 0.52, 0.12));
  const headrestGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.18, 0.1));

  for (const sx of [0.42, -0.42]) {
    const sb = new THREE.Mesh(seatBaseGeo, seatMat);
    sb.position.set(sx, 0.58, 0.14);
    const back = new THREE.Mesh(seatBackGeo, seatMat);
    back.position.set(sx, 0.88, -0.08);
    back.rotation.x = -0.16;
    const hr = new THREE.Mesh(headrestGeo, seatMat);
    hr.position.set(sx, 1.2, -0.13);
    bodyTiltGroup.add(sb, back, hr);
  }

  // Rear Luxury Bench Seat + 2 Headrests
  const rearBenchBaseGeo = trackGeo(new THREE.BoxGeometry(1.44, 0.16, 0.52));
  const rearBenchBase = new THREE.Mesh(rearBenchBaseGeo, seatMat);
  rearBenchBase.position.set(0, 0.58, -0.58);
  const rearBenchBackGeo = trackGeo(new THREE.BoxGeometry(1.44, 0.54, 0.14));
  const rearBenchBack = new THREE.Mesh(rearBenchBackGeo, seatMat);
  rearBenchBack.position.set(0, 0.88, -0.84);
  rearBenchBack.rotation.x = -0.18;
  bodyTiltGroup.add(rearBenchBase, rearBenchBack);

  for (const sx of [0.4, -0.4]) {
    const rhr = new THREE.Mesh(headrestGeo, seatMat);
    rhr.position.set(sx, 1.2, -0.9);
    bodyTiltGroup.add(rhr);
  }

  // 3D Driver Figure seated at the wheel (+X = 0.42)
  const driverGroup = new THREE.Group();
  driverGroup.position.set(0.42, 0.68, 0.12);
  const dTorsoGeo = trackGeo(new THREE.BoxGeometry(0.36, 0.44, 0.2));
  const dHeadGeo = trackGeo(new THREE.SphereGeometry(0.12, 12, 10));
  const dCapGeo = trackGeo(new THREE.CylinderGeometry(0.125, 0.13, 0.06, 12));
  const dTorso = new THREE.Mesh(dTorsoGeo, driverSuitMat);
  dTorso.position.set(0, 0.22, -0.04);
  const dHead = new THREE.Mesh(dHeadGeo, skinMat);
  dHead.position.set(0, 0.55, -0.02);
  const dCap = new THREE.Mesh(dCapGeo, pillarMat);
  dCap.position.set(0, 0.62, -0.02);
  driverGroup.add(dTorso, dHead, dCap);
  bodyTiltGroup.add(driverGroup);

  // 3D Seated Client Passenger inside Rear Cabin (-X = -0.36, z = -0.58) with biome-themed 3D headgear!
  // Clearly visible through the rear glass, side windows, and open passenger door!
  const cabinCostumes = new BiomeCostumeLibrary();
  const cabinPassengerGroup = new THREE.Group();
  cabinPassengerGroup.position.set(-0.36, 0.68, -0.58);
  const pTorso = new THREE.Mesh(dTorsoGeo, passengerCoatMat);
  pTorso.scale.set(1.05, 1.04, 1.05);
  pTorso.position.set(0, 0.23, -0.05);
  const pHead = new THREE.Mesh(dHeadGeo, passengerSkinMat);
  pHead.position.set(0, 0.56, -0.04);
  const pHair = new THREE.Mesh(dHeadGeo, hairMat);
  pHair.scale.set(1.06, 0.72, 1.08);
  pHair.position.set(0, 0.61, -0.07);
  const cabinHeadgear = cabinCostumes.createHeadgearRig(true);
  cabinHeadgear.root.position.set(0, 0.56, -0.04);
  cabinPassengerGroup.add(pTorso, pHead, pHair, cabinHeadgear.root);
  cabinPassengerGroup.visible = false;
  bodyTiltGroup.add(cabinPassengerGroup);

  // =========================================================================
  // 5. FRONT & REAR FASCIA, LIGHTS, SIGNALS, MIRRORS, LICENSE PLATES, ROOF SIGN
  // =========================================================================
  // Front Grille with 3 horizontal chrome slats
  const grilleGeo = trackGeo(new THREE.BoxGeometry(1.16, 0.28, 0.12));
  const grille = new THREE.Mesh(grilleGeo, carbonMat);
  grille.position.set(0, 0.56, 2.44);
  bodyTiltGroup.add(grille);

  const slatGeo = trackGeo(new THREE.BoxGeometry(1.12, 0.028, 0.14));
  for (const sy of [0.49, 0.56, 0.63]) {
    const slat = new THREE.Mesh(slatGeo, chromeMat);
    slat.position.set(0, sy, 2.45);
    bodyTiltGroup.add(slat);
  }

  // Front & Rear License Plates ("TAXI 777")
  const plateGeo = trackGeo(new THREE.PlaneGeometry(0.56, 0.15));
  const rearPlate = new THREE.Mesh(plateGeo, plateMat);
  rearPlate.position.set(0, 0.54, -2.475);
  rearPlate.rotation.y = Math.PI;
  const frontPlate = new THREE.Mesh(plateGeo, plateMat);
  frontPlate.position.set(0, 0.43, 2.495);
  bodyTiltGroup.add(rearPlate, frontPlate);

  // Dual LED Headlights + Angular White DRL Eyebrows + Lower Fog Lamps
  const hlGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.12, 0.12));
  const drlGeo = trackGeo(new THREE.BoxGeometry(0.44, 0.032, 0.13));
  const fogGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.06, 0.1));
  for (const sx of [-0.68, 0.68]) {
    const hl = new THREE.Mesh(hlGeo, headlightMat);
    hl.position.set(sx, 0.68, 2.42);
    const drl = new THREE.Mesh(drlGeo, drlMat);
    drl.position.set(sx, 0.76, 2.425);
    drl.rotation.z = sx > 0 ? -0.08 : 0.08;
    const fog = new THREE.Mesh(fogGeo, drlMat);
    fog.position.set(sx * 1.06, 0.42, 2.44);
    bodyTiltGroup.add(hl, drl, fog);
  }

  // Sculpted Rear Taillight Bar + Chrome Trunk Strip + Carbon Diffuser
  const tlGeo = trackGeo(new THREE.BoxGeometry(1.76, 0.11, 0.11));
  const tlBar = new THREE.Mesh(tlGeo, taillightMat);
  tlBar.position.set(0, 0.76, -2.42);
  bodyTiltGroup.add(tlBar);

  const rearChromeGeo = trackGeo(new THREE.BoxGeometry(1.78, 0.035, 0.12));
  const rearChrome = new THREE.Mesh(rearChromeGeo, chromeMat);
  rearChrome.position.set(0, 0.84, -2.42);
  bodyTiltGroup.add(rearChrome);

  // Active Blinking Amber Turn Signals (Front & Rear corners)
  const sigGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.08, 0.12));
  const sigFL = new THREE.Mesh(sigGeo, signalLeftMat);
  sigFL.position.set(0.86, 0.68, 2.4);
  const sigRL = new THREE.Mesh(sigGeo, signalLeftMat);
  sigRL.position.set(0.84, 0.76, -2.43);
  const sigFR = new THREE.Mesh(sigGeo, signalRightMat);
  sigFR.position.set(-0.86, 0.68, 2.4);
  const sigRR = new THREE.Mesh(sigGeo, signalRightMat);
  sigRR.position.set(-0.84, 0.76, -2.43);
  bodyTiltGroup.add(sigFL, sigRL, sigFR, sigRR);

  // Sculpted Wing Mirrors with Integrated Signal Strips
  const mirrorGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.11, 0.17));
  const mirrorL = new THREE.Mesh(mirrorGeo, paintMat);
  mirrorL.position.set(1.02, 1.02, 0.62);
  const mirrorR = new THREE.Mesh(mirrorGeo, paintMat);
  mirrorR.position.set(-1.02, 1.02, 0.62);
  bodyTiltGroup.add(mirrorL, mirrorR);

  // Stock Front Lip & Rear Diffuser with Vertical Fins + Stock Twin Exhausts
  const baseSplitterGeo = trackGeo(new THREE.BoxGeometry(1.9, 0.09, 0.34));
  const baseSplitter = new THREE.Mesh(baseSplitterGeo, carbonMat);
  baseSplitter.position.set(0, 0.3, 2.34);
  const baseDiffuserGeo = trackGeo(new THREE.BoxGeometry(1.88, 0.14, 0.32));
  const baseDiffuser = new THREE.Mesh(baseDiffuserGeo, carbonMat);
  baseDiffuser.position.set(0, 0.32, -2.32);
  bodyTiltGroup.add(baseSplitter, baseDiffuser);

  const stockPipeGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 12));
  stockPipeGeo.rotateX(Math.PI * 0.5);
  for (const ex of [-0.56, 0.56]) {
    const p = new THREE.Mesh(stockPipeGeo, chromeMat);
    p.position.set(ex, 0.31, -2.46);
    bodyTiltGroup.add(p);
  }

  // Roof Illuminated TAXI Sign + Shark-fin Antenna
  const signBaseGeo = trackGeo(new THREE.BoxGeometry(0.8, 0.07, 0.34));
  const signBase = new THREE.Mesh(signBaseGeo, trimMat);
  signBase.position.set(0, 1.56, -0.08);
  const signBoxGeo = trackGeo(new THREE.BoxGeometry(0.72, 0.24, 0.24));
  const signBox = new THREE.Mesh(signBoxGeo, taxiSignMat);
  signBox.position.set(0, 1.7, -0.08);
  const sharkGeo = trackGeo(new THREE.ConeGeometry(0.05, 0.16, 4));
  const shark = new THREE.Mesh(sharkGeo, paintMat);
  shark.position.set(0, 1.59, -0.84);
  shark.rotation.x = -0.35;
  bodyTiltGroup.add(signBase, signBox, shark);

  // =========================================================================
  // 6. FOUR COMPOSITE MULTI-SPOKE WHEELS WITH BRAKE DISCS & CALIPERS
  // =========================================================================
  const tireGeo = trackGeo(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 24));
  tireGeo.rotateZ(Math.PI * 0.5);
  const rimBarrelGeo = trackGeo(new THREE.CylinderGeometry(0.26, 0.26, 0.31, 18));
  rimBarrelGeo.rotateZ(Math.PI * 0.5);
  const spokeGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.48, 0.048));
  const hubGeo = trackGeo(new THREE.CylinderGeometry(0.075, 0.075, 0.33, 12));
  hubGeo.rotateZ(Math.PI * 0.5);
  const rotorGeo = trackGeo(new THREE.CylinderGeometry(0.21, 0.21, 0.04, 16));
  rotorGeo.rotateZ(Math.PI * 0.5);
  const caliperGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.17, 0.11));

  const wheelPositions: Array<[number, number, number, boolean]> = [
    [0.95, 0.38, 1.48, true],
    [-0.95, 0.38, 1.48, true],
    [0.95, 0.38, -1.44, false],
    [-0.95, 0.38, -1.44, false],
  ];

  const steerPivots: THREE.Group[] = [];
  const spinGroups: THREE.Group[] = [];
  const hoverFoldPivots: Array<{ pivot: THREE.Group; sideSign: number; baseX: number; baseY: number }> = [];
  const hoverJetCones: THREE.Mesh[] = [];

  const hoverRingGeo = trackGeo(new THREE.TorusGeometry(0.25, 0.032, 8, 20));
  hoverRingGeo.rotateY(Math.PI * 0.5);
  const hoverRingMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.0,
      roughness: 0.15,
    }),
  );
  const hoverJetGeo = trackGeo(new THREE.ConeGeometry(0.24, 1.45, 12, 1, true));
  const hoverJetMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );

  for (const [wx, wy, wz, isFront] of wheelPositions) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wx, wy, wz);
    airframeGroup.add(steerPivot);

    const sideSign = wx > 0 ? 1 : -1;
    const hoverFoldPivot = new THREE.Group();
    steerPivot.add(hoverFoldPivot);
    hoverFoldPivots.push({ pivot: hoverFoldPivot, sideSign, baseX: wx, baseY: wy });

    const spinGroup = new THREE.Group();
    hoverFoldPivot.add(spinGroup);

    const tire = new THREE.Mesh(tireGeo, rubberMat);
    tire.castShadow = !isSoftwareGl;
    const barrel = new THREE.Mesh(rimBarrelGeo, trimMat);
    const hub = new THREE.Mesh(hubGeo, chromeMat);
    spinGroup.add(tire, barrel, hub);

    // 5 crisp dual-angle metallic alloy spokes
    for (let s = 0; s < 5; s++) {
      const sp = new THREE.Mesh(spokeGeo, rimMat);
      sp.rotation.x = (s / 5) * Math.PI;
      spinGroup.add(sp);
    }

    // Repulsor plasma ring & jet cone facing outer rim face (+X for left, -X for right);
    // when wheel folds 90 degrees underneath in flight mode, these point straight DOWNWARD!
    const repulsorRing = new THREE.Mesh(hoverRingGeo, hoverRingMat);
    repulsorRing.position.set(sideSign * 0.16, 0, 0);
    hoverFoldPivot.add(repulsorRing);

    const jetCone = new THREE.Mesh(hoverJetGeo, hoverJetMat);
    jetCone.rotation.z = sideSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    jetCone.position.set(sideSign * 0.88, 0, 0);
    jetCone.visible = false;
    hoverFoldPivot.add(jetCone);
    hoverJetCones.push(jetCone);

    const rotor = new THREE.Mesh(rotorGeo, chromeMat);
    rotor.position.set(wx > 0 ? -0.06 : 0.06, 0, 0);
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(wx > 0 ? -0.07 : 0.07, 0.06, -0.14);
    hoverFoldPivot.add(rotor, caliper);

    if (isFront) steerPivots.push(steerPivot);
    spinGroups.push(spinGroup);
  }

  // =========================================================================
  // 7. DRAMATIC PROGRESSIVE VISUAL UPGRADES (EVOLVES INFINITELY!)
  // =========================================================================

  // --- ENGINE LV 2: Carbon GT Rear Spoiler + Vented Hood Louvers ---
  const engineLv2Group = new THREE.Group();
  const wingMainGeo = trackGeo(new THREE.BoxGeometry(1.94, 0.06, 0.32));
  const wingMain = new THREE.Mesh(wingMainGeo, carbonMat);
  wingMain.position.set(0, 1.2, -2.18);
  const strutGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.28, 0.18));
  const strutL = new THREE.Mesh(strutGeo, trimMat);
  strutL.position.set(0.58, 1.05, -2.16);
  const strutR = new THREE.Mesh(strutGeo, trimMat);
  strutR.position.set(-0.58, 1.05, -2.16);
  const endplateGeo = trackGeo(new THREE.BoxGeometry(0.05, 0.2, 0.38));
  const epL = new THREE.Mesh(endplateGeo, paintMat);
  epL.position.set(0.97, 1.2, -2.18);
  const epR = new THREE.Mesh(endplateGeo, paintMat);
  epR.position.set(-0.97, 1.2, -2.18);
  const hoodVentGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.04, 0.44));
  const hvL = new THREE.Mesh(hoodVentGeo, carbonMat);
  hvL.position.set(0.46, 0.96, 1.56);
  const hvR = new THREE.Mesh(hoodVentGeo, carbonMat);
  hvR.position.set(-0.46, 0.96, 1.56);
  engineLv2Group.add(wingMain, strutL, strutR, epL, epR, hvL, hvR);
  engineLv2Group.visible = false;
  bodyTiltGroup.add(engineLv2Group);

  // --- ENGINE LV 3+: Quad Titanium Exhausts + Hood Turbo Scoop + Afterburner Flames ---
  const engineLv3Group = new THREE.Group();
  const perfPipeGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 12));
  perfPipeGeo.rotateX(Math.PI * 0.5);
  const flameConeGeo = trackGeo(new THREE.ConeGeometry(0.08, 0.72, 10, 1, true));
  flameConeGeo.rotateX(-Math.PI * 0.5);
  const exhaustFlames: THREE.Mesh[] = [];
  for (const ex of [-0.66, -0.48, 0.48, 0.66]) {
    const pipe = new THREE.Mesh(perfPipeGeo, chromeMat);
    pipe.position.set(ex, 0.31, -2.48);
    engineLv3Group.add(pipe);

    const flame = new THREE.Mesh(flameConeGeo, flameMat);
    flame.position.set(ex, 0.31, -2.92);
    exhaustFlames.push(flame);
    engineLv3Group.add(flame);
  }
  const scoopGeo = trackGeo(new THREE.BoxGeometry(0.68, 0.14, 0.74));
  const hoodScoop = new THREE.Mesh(scoopGeo, carbonMat);
  hoodScoop.position.set(0, 1.03, 1.48);
  const scoopInletGeo = trackGeo(new THREE.BoxGeometry(0.56, 0.08, 0.05));
  const scoopInlet = new THREE.Mesh(scoopInletGeo, accentGlowMat);
  scoopInlet.position.set(0, 1.04, 1.85);
  engineLv3Group.add(hoodScoop, scoopInlet);
  engineLv3Group.visible = false;
  bodyTiltGroup.add(engineLv3Group);

  // --- ENGINE LV 4+: Double-Deck Hyper-GT Upper Wing ---
  const engineLv4Group = new THREE.Group();
  const topWingGeo = trackGeo(new THREE.BoxGeometry(2.04, 0.05, 0.24));
  const topWing = new THREE.Mesh(topWingGeo, paintMat);
  topWing.position.set(0, 1.42, -2.26);
  const tallStrutGeo = trackGeo(new THREE.BoxGeometry(0.05, 0.24, 0.16));
  const tsL = new THREE.Mesh(tallStrutGeo, carbonMat);
  tsL.position.set(0.95, 1.32, -2.22);
  const tsR = new THREE.Mesh(tallStrutGeo, carbonMat);
  tsR.position.set(-0.95, 1.32, -2.22);
  engineLv4Group.add(topWing, tsL, tsR);
  engineLv4Group.visible = false;
  bodyTiltGroup.add(engineLv4Group);

  // --- CHASSIS LV 2+: Extended Race Splitter + Aero Side Skirts ---
  const chassisLv2Group = new THREE.Group();
  const bigSplitGeo = trackGeo(new THREE.BoxGeometry(2.08, 0.07, 0.44));
  const bigSplit = new THREE.Mesh(bigSplitGeo, carbonMat);
  bigSplit.position.set(0, 0.26, 2.42);
  const splitAccentGeo = trackGeo(new THREE.BoxGeometry(2.1, 0.025, 0.46));
  const splitAccent = new THREE.Mesh(splitAccentGeo, accentGlowMat);
  splitAccent.position.set(0, 0.28, 2.43);
  const skirtGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.1, 2.45));
  const skL = new THREE.Mesh(skirtGeo, carbonMat);
  skL.position.set(1.0, 0.28, 0.02);
  const skR = new THREE.Mesh(skirtGeo, carbonMat);
  skR.position.set(-1.0, 0.28, 0.02);
  chassisLv2Group.add(bigSplit, splitAccent, skL, skR);
  chassisLv2Group.visible = false;
  bodyTiltGroup.add(chassisLv2Group);

  // --- CHASSIS LV 3+: Widebody Flared Fender Arches + Canards + Diffuser Fins ---
  const chassisLv3Group = new THREE.Group();
  const archGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.36, 0.96));
  for (const [ax, az] of [
    [0.98, 1.48],
    [-0.98, 1.48],
    [0.98, -1.44],
    [-0.98, -1.44],
  ]) {
    const arch = new THREE.Mesh(archGeo, paintMat);
    arch.position.set(ax, 0.62, az);
    chassisLv3Group.add(arch);
  }
  const canardGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.04, 0.28));
  for (const cx of [-0.98, 0.98]) {
    const canard = new THREE.Mesh(canardGeo, carbonMat);
    canard.position.set(cx, 0.45, 2.26);
    canard.rotation.z = cx > 0 ? 0.25 : -0.25;
    chassisLv3Group.add(canard);
  }
  const finGeo = trackGeo(new THREE.BoxGeometry(0.04, 0.16, 0.36));
  for (const fx of [-0.42, -0.14, 0.14, 0.42]) {
    const fin = new THREE.Mesh(finGeo, carbonMat);
    fin.position.set(fx, 0.28, -2.38);
    chassisLv3Group.add(fin);
  }
  chassisLv3Group.visible = false;
  bodyTiltGroup.add(chassisLv3Group);

  // --- CHASSIS LV 4+: NFS-Style Soft Radial Neon Underglow + Physical Underbody LED Tubes ---
  const chassisLv4Group = new THREE.Group();
  const glowPlaneGeo = trackGeo(new THREE.PlaneGeometry(3.6, 6.2));
  const glowPlane = new THREE.Mesh(glowPlaneGeo, underglowMat);
  glowPlane.rotation.x = -Math.PI * 0.5;
  glowPlane.position.y = 0.048;

  const sideLedGeo = trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 2.38, 8));
  sideLedGeo.rotateX(Math.PI * 0.5);
  const ledL = new THREE.Mesh(sideLedGeo, accentGlowMat);
  ledL.position.set(0.99, 0.22, 0.02);
  const ledR = new THREE.Mesh(sideLedGeo, accentGlowMat);
  ledR.position.set(-0.99, 0.22, 0.02);

  const endLedGeo = trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 1.56, 8));
  endLedGeo.rotateZ(Math.PI * 0.5);
  const ledF = new THREE.Mesh(endLedGeo, accentGlowMat);
  ledF.position.set(0, 0.22, 2.35);
  const ledB = new THREE.Mesh(endLedGeo, accentGlowMat);
  ledB.position.set(0, 0.22, -2.35);

  chassisLv4Group.add(glowPlane, ledL, ledR, ledF, ledB);
  chassisLv4Group.visible = false;
  bodyTiltGroup.add(chassisLv4Group);

  // --- AUTOPILOT LV 2+: Roof Autonomous LiDAR Optical Array ---
  const lidarGroup = new THREE.Group();
  const lidarBarGeo = trackGeo(new THREE.BoxGeometry(0.96, 0.05, 0.2));
  const lidarBar = new THREE.Mesh(lidarBarGeo, carbonMat);
  lidarBar.position.set(0, 1.55, 0.38);
  const lidarPodGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 0.15, 16));
  const lidarPod = new THREE.Mesh(lidarPodGeo, trimMat);
  lidarPod.position.set(0, 1.65, 0.38);
  const lidarRingGeo = trackGeo(new THREE.CylinderGeometry(0.118, 0.118, 0.045, 16));
  const lidarRingMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.8,
      roughness: 0.15,
    }),
  );
  const lidarRing = new THREE.Mesh(lidarRingGeo, lidarRingMat);
  lidarRing.position.set(0, 1.66, 0.38);
  lidarGroup.add(lidarBar, lidarPod, lidarRing);
  lidarGroup.visible = false;
  bodyTiltGroup.add(lidarGroup);

  // --- AUTOPILOT LV 3+: Twin Side Radar Pods + Glowing Sensor Crest ---
  const radarGroup = new THREE.Group();
  const podGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.08, 0.24));
  for (const px of [-0.95, 0.95]) {
    const pod = new THREE.Mesh(podGeo, carbonMat);
    pod.position.set(px, 0.94, 1.15);
    const lens = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.14, 0.03, 0.14)),
      lidarRingMat,
    );
    lens.position.set(px, 0.94, 1.15);
    radarGroup.add(pod, lens);
  }
  radarGroup.visible = false;
  bodyTiltGroup.add(radarGroup);

  // --- COMFORT LV 3+: VIP Golden Roof Crown Accent + Illuminated Grille Crest ---
  const vipGroup = new THREE.Group();
  const vipGoldMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.95,
      roughness: 0.14,
      emissive: 0xd97706,
      emissiveIntensity: 0.45,
    }),
  );
  const crownTrimGeo = trackGeo(new THREE.BoxGeometry(1.48, 0.04, 1.52));
  const crownTrim = new THREE.Mesh(crownTrimGeo, vipGoldMat);
  crownTrim.position.set(0, 1.535, -0.22);
  const crestGeo = trackGeo(new THREE.OctahedronGeometry(0.08, 0));
  const hoodCrest = new THREE.Mesh(crestGeo, vipGoldMat);
  hoodCrest.position.set(0, 0.95, 2.28);
  vipGroup.add(crownTrim, hoodCrest);
  vipGroup.visible = false;
  bodyTiltGroup.add(vipGroup);

  // --- FLIGHT TRANSFORMATION KIT (Unlocks at Total Level 20 / Aero-Shuttle Tier 4+) ---
  // Deployable swept aero-wings + glowing wingtip plasma rails + twin rear ion flight nacelles!
  const aeroFlightGroup = new THREE.Group();
  const wingPivots: Array<{ pivot: THREE.Group; sideSign: number }> = [];
  const ionFlames: THREE.Mesh[] = [];

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.55);
  wingShape.lineTo(1.18, -0.35);
  wingShape.lineTo(1.18, -0.68);
  wingShape.lineTo(0, -0.45);
  wingShape.closePath();

  const wingExtrude = trackGeo(
    new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 2,
    }),
  );
  wingExtrude.rotateX(-Math.PI * 0.5);

  const wingletGeo = trackGeo(new THREE.BoxGeometry(0.055, 0.34, 0.42));
  const wingLedGeo = trackGeo(new THREE.BoxGeometry(1.16, 0.035, 0.055));

  for (const sideSign of [1, -1]) {
    const wp = new THREE.Group();
    wp.position.set(sideSign * 0.92, 0.64, -0.78);
    const wingMesh = new THREE.Mesh(wingExtrude, carbonMat);
    if (sideSign < 0) wingMesh.scale.x = -1;
    wp.add(wingMesh);

    const winglet = new THREE.Mesh(wingletGeo, paintMat);
    winglet.position.set(sideSign * 1.18, 0.16, -0.5);
    winglet.rotation.z = sideSign > 0 ? -0.18 : 0.18;
    wp.add(winglet);

    const wingLed = new THREE.Mesh(wingLedGeo, hoverRingMat);
    wingLed.position.set(sideSign * 0.58, 0.04, 0.1);
    wingLed.rotation.y = sideSign > 0 ? 0.65 : -0.65;
    wp.add(wingLed);

    aeroFlightGroup.add(wp);
    wingPivots.push({ pivot: wp, sideSign });
  }

  // Twin Rear Ion Flight Thruster Nacelles + Glowing Plasma Exhaust Plumes
  const nacelleGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.2, 0.88, 16));
  nacelleGeo.rotateX(Math.PI * 0.5);
  const nacelleCoreGeo = trackGeo(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 16));
  nacelleCoreGeo.rotateX(Math.PI * 0.5);
  const ionPlumeGeo = trackGeo(new THREE.ConeGeometry(0.16, 1.75, 12, 1, true));
  ionPlumeGeo.rotateX(-Math.PI * 0.5);

  for (const nx of [-0.64, 0.64]) {
    const nacelle = new THREE.Mesh(nacelleGeo, trimMat);
    nacelle.position.set(nx, 0.98, -2.18);
    const core = new THREE.Mesh(nacelleCoreGeo, hoverRingMat);
    core.position.set(nx, 0.98, -2.62);
    const plume = new THREE.Mesh(ionPlumeGeo, hoverJetMat);
    plume.position.set(nx, 0.98, -3.52);
    aeroFlightGroup.add(nacelle, core, plume);
    ionFlames.push(plume);
  }

  aeroFlightGroup.visible = false;
  bodyTiltGroup.add(aeroFlightGroup);

  let lastTierKey = '';
  let currentTierIndex = 0;
  let burstTimer = 0;

  const triggerUpgradeBurst = () => {
    burstTimer = 0.95;
  };

  const update: HeroTaxiRig['update'] = ({
    x,
    z,
    yaw,
    steerAngle,
    wheelSpin,
    speedMs,
    braking,
    turnSignal,
    doorOpenAmount,
    hasPassengerInCabin,
    passengerCoatHex,
    passengerSkinHex,
    passengerArchetype,
    altitude,
    flightBlend,
    verticalVelocity,
    nightFactor,
    phase,
    upgrades,
    elapsed,
  }) => {
    const fb = Math.max(0, Math.min(1, flightBlend));
    const alt = Math.max(0, altitude);

    root.position.set(x, 0, z);
    root.rotation.y = yaw;

    // Lift entire airframe smoothly to flight altitude + gentle anti-gravity hover bob
    const hoverBob = Math.sin(elapsed * 2.8) * 0.22 * fb;
    airframeGroup.position.y = alt + hoverBob;

    // Ground contact shadow fades and widens softly as taxi climbs high into the sky
    shadowMat.opacity = 0.64 * Math.max(0.1, 1 - alt / 18);
    const shadowSpread = 1 + alt * 0.045;
    shadowDisc.scale.set(shadowSpread, shadowSpread, 1);

    // Aerodynamic banking & climb/descent pitch when flying vs road suspension tilt on asphalt
    const roadRoll = -steerAngle * Math.min(1, speedMs / 18) * 0.085;
    const airRoll = -steerAngle * Math.min(1.2, speedMs / 22) * 0.36;
    const targetRoll = THREE.MathUtils.lerp(roadRoll, airRoll, fb);

    const roadPitch = braking ? 0.026 : -Math.min(0.022, speedMs * 0.00055);
    const airPitch = THREE.MathUtils.clamp(-verticalVelocity * 0.042, -0.22, 0.18);
    const targetPitch = THREE.MathUtils.lerp(roadPitch, airPitch, fb);

    const roadMicroBounce =
      Math.sin(elapsed * 19 + wheelSpin * 0.6) * Math.min(0.011, speedMs * 0.00042) * (1 - fb);

    bodyTiltGroup.rotation.z += (targetRoll - bodyTiltGroup.rotation.z) * 0.15;
    bodyTiltGroup.rotation.x += (targetPitch - bodyTiltGroup.rotation.x) * 0.14;
    bodyTiltGroup.position.y = roadMicroBounce;

    // Wheels, Hover-Wheel 90-degree Fold Transformation & Interior Steering Wheel
    for (const pivot of steerPivots) {
      pivot.rotation.y = steerAngle * (1 - fb * 0.85);
    }
    for (const spin of spinGroups) {
      spin.rotation.x = wheelSpin * (1 - fb) + elapsed * 7.5 * fb;
    }
    for (let i = 0; i < hoverFoldPivots.length; i++) {
      const hp = hoverFoldPivots[i];
      // Fold wheels 90° flat underneath chassis so alloy rims & plasma jets point straight DOWN!
      hp.pivot.rotation.z = -hp.sideSign * fb * Math.PI * 0.49;
      hp.pivot.position.set(-hp.sideSign * fb * 0.14, fb * 0.08, 0);
      const cone = hoverJetCones[i];
      cone.visible = fb > 0.06;
      if (cone.visible) {
        const flicker = 0.78 + Math.sin(elapsed * 34 + i * 1.7) * 0.22;
        cone.scale.set(1, 0.55 + fb * 0.65 * flicker, 1);
      }
    }
    steeringPivot.rotation.z = -steerAngle * 3.4;

    // Deployable Swept Aero-Wings & Rear Ion Thrusters
    const flightReady = isFlightUnlocked(upgrades) || fb > 0.01;
    aeroFlightGroup.visible = flightReady;
    if (flightReady) {
      for (const wp of wingPivots) {
        // Tuck wings back & slightly folded on the road, sweep wide open in flight!
        wp.pivot.scale.set(0.28 + fb * 0.82, 1, 0.55 + fb * 0.5);
        wp.pivot.rotation.z = wp.sideSign * (1 - fb) * 0.24;
      }
      hoverRingMat.emissiveIntensity = 0.65 + fb * 2.4 + nightFactor * 0.7;
      hoverJetMat.opacity = fb * (0.58 + Math.sin(elapsed * 28) * 0.1);
      for (let i = 0; i < ionFlames.length; i++) {
        const f = ionFlames[i];
        f.visible = fb > 0.08;
        if (f.visible) {
          const thrust = 0.65 + Math.min(1, speedMs / 30) * 0.85 + Math.sin(elapsed * 42 + i) * 0.16;
          f.scale.set(1, 1, thrust * fb);
        }
      }
    }

    // Articulated Curb-Side Passenger Door (pivoted at front-curb edge x=-0.92, z=-0.02;
    // door panel extends along -Z so +Y rotation swings the rear edge OUTWARD toward -X sidewalk!)
    const dOpen = Math.max(0, Math.min(1, doorOpenAmount));
    if (currentTierIndex >= 4) {
      // Hypercar Butterfly/Gullwing door sweeping outward (-X) and high upward (+Y)
      doorPivot.rotation.set(dOpen * 0.62, dOpen * 0.82, -dOpen * 0.65);
      doorPivot.position.set(-0.92 - dOpen * 0.38, 0.72 + dOpen * 0.42, -0.02);
    } else if (currentTierIndex >= 2) {
      // Sport GT Dihedral / Scissor door swinging outward (-X) and lifting upward (+Y)
      doorPivot.rotation.set(dOpen * 0.55, dOpen * 0.85, dOpen * 0.22);
      doorPivot.position.set(-0.92 - dOpen * 0.06, 0.72 + dOpen * 0.14, -0.02);
    } else {
      // Classic luxury coach door swinging wide outward (-X) toward the curb
      doorPivot.rotation.set(0, dOpen * 1.22, 0);
      doorPivot.position.set(-0.92, 0.72, -0.02);
    }

    // Interior Cabin Dome Light & Seated Passenger visibility + biome costume headgear
    cabinPassengerGroup.visible = hasPassengerInCabin;
    if (hasPassengerInCabin) {
      passengerCoatMat.color.setHex(passengerCoatHex);
      passengerSkinMat.color.setHex(passengerSkinHex);
      const hidesHair = cabinHeadgear.setBiome(passengerArchetype);
      pHair.visible = !hidesHair;
      cabinPassengerGroup.rotation.z = -steerAngle * 0.25;
      cabinPassengerGroup.rotation.y = Math.sin(elapsed * 1.2) * 0.14;
    }
    domeLightMat.emissiveIntensity =
      0.3 + dOpen * 2.6 + (hasPassengerInCabin ? 0.85 : 0) + nightFactor * 0.6;

    // Reactive Brake Lights, Headlights & Blinking Amber Turn Signals
    taillightMat.emissiveIntensity = braking ? 4.2 : 1.1 + nightFactor * 1.0;
    headlightMat.emissiveIntensity = 1.6 + nightFactor * 2.5;
    const nightBeam = Math.max(0, (nightFactor - 0.22) / 0.78);
    // Fade road headlight pool smoothly when soaring high above the road
    beamMat.opacity = nightBeam * 0.46 * Math.max(0, 1 - alt / 6);

    const blinkOn = Math.sin(elapsed * 11) > 0;
    signalLeftMat.emissiveIntensity = turnSignal === -1 && blinkOn ? 3.8 : 0.0;
    signalRightMat.emissiveIntensity = turnSignal === 1 && blinkOn ? 3.8 : 0.0;

    // Roof TAXI Sign clearly reflects Free (amber) vs Occupied (bright emerald)
    const occupied = hasPassengerInCabin || phase === 'en_route_dropoff' || phase === 'dropoff';
    taxiSignMat.emissive.setHex(occupied ? 0x10b981 : 0xfbbf24);
    taxiSignMat.emissiveIntensity = (occupied ? 1.15 : 1.05) + nightFactor * 0.85;

    // Spin LiDAR turret
    if (lidarGroup.visible) {
      lidarPod.rotation.y = elapsed * 5.2;
    }

    // Turbo Exhaust Afterburner flames when Engine Lv >= 3 & accelerating fast!
    if (engineLv3Group.visible) {
      const fastFactor = Math.max(0, Math.min(1, (speedMs - 14) / 16));
      const flamePower = !braking && fastFactor > 0.1 ? fastFactor * (0.4 + Math.sin(elapsed * 45) * 0.2) : 0;
      flameMat.opacity = flamePower * 0.72;
      for (const f of exhaustFlames) {
        f.scale.set(1, 1, 0.6 + flamePower * 1.1);
      }
    }

    // Soft dynamic NFS-style neon underglow intensity (fades cleanly off the asphalt when flying high)
    if (chassisLv4Group.visible) {
      const groundProximity = Math.max(0, 1 - alt / 3.2);
      const neonPulse = 0.93 + Math.sin(elapsed * 3.4) * 0.07;
      underglowMat.opacity = (0.48 + nightFactor * 0.44) * neonPulse * groundProximity;
      accentGlowMat.emissiveIntensity = 1.8 + nightFactor * 1.4;
    }

    // Upgrade Celebration Halo Burst Animation
    if (burstTimer > 0) {
      burstTimer = Math.max(0, burstTimer - 0.025);
      const p = 1 - burstTimer / 0.95;
      burstRing.visible = true;
      burstRing.position.y = 0.25 + p * 2.2;
      const s = 0.9 + p * 1.65;
      burstRing.scale.set(s, s, 1);
      burstMat.opacity = (1 - p) * 0.85;
    } else {
      burstRing.visible = false;
    }

    // Apply Visual Evolution when upgrade levels change
    const tierKey = `${upgrades.engine}-${upgrades.chassis}-${upgrades.autopilot}-${upgrades.comfort}`;
    if (tierKey !== lastTierKey) {
      lastTierKey = tierKey;
      const cls = getVehicleClassInfo(upgrades);
      currentTierIndex = cls.tierIndex;

      paintMat.color.setHex(cls.paintHex);
      trimMat.color.setHex(cls.trimHex);
      paintMat.metalness = Math.min(0.94, 0.58 + cls.tierIndex * 0.065);
      paintMat.roughness = Math.max(0.09, 0.24 - cls.tierIndex * 0.025);

      // Rims & calipers evolve to gold/titanium/cyan on higher tiers
      rimMat.color.setHex(cls.tierIndex >= 3 ? 0xfbbf24 : cls.tierIndex >= 1 ? 0xf1f5f9 : 0xcbd5e1);
      caliperMat.color.setHex(cls.tierIndex >= 4 ? 0x38bdf8 : cls.tierIndex >= 2 ? 0xf59e0b : 0xef4444);

      // Interior leather evolves with Comfort upgrades
      seatMat.color.setHex(
        upgrades.comfort >= 3 ? 0xf5e6cc : upgrades.comfort >= 2 ? 0x8b5a36 : 0x2a2f3a,
      );

      // Progressive aero, engine, autopilot & VIP attachments
      engineLv2Group.visible = upgrades.engine >= 2;
      engineLv3Group.visible = upgrades.engine >= 3;
      engineLv4Group.visible = upgrades.engine >= 4;

      chassisLv2Group.visible = upgrades.chassis >= 2;
      chassisLv3Group.visible = upgrades.chassis >= 3;
      chassisLv4Group.visible = upgrades.chassis >= 4;

      lidarGroup.visible = upgrades.autopilot >= 2;
      radarGroup.visible = upgrades.autopilot >= 3;

      vipGroup.visible = upgrades.comfort >= 3;

      // Vivid NFS-style neon accent & hover plasma palette per vehicle tier
      const neonPalette = [0xf59e0b, 0x38bdf8, 0x22d3ee, 0xfbbf24, 0x38bdf8, 0xc084fc, 0x34d399];
      const accentHex = neonPalette[cls.tierIndex % neonPalette.length];
      accentGlowMat.color.setHex(accentHex);
      accentGlowMat.emissive.setHex(accentHex);
      underglowMat.color.setHex(accentHex);
      hoverRingMat.color.setHex(accentHex);
      hoverRingMat.emissive.setHex(accentHex);
      hoverJetMat.color.setHex(accentHex);
      underglowMat.opacity = upgrades.chassis >= 4 ? 0.55 : 0;
    }
  };

  const dispose = () => {
    cabinCostumes.dispose();
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  };

  return { root, bodyTiltGroup, triggerUpgradeBurst, update, dispose };
}
