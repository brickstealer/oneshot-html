import * as THREE from 'three';
import {
  BLOCK_SIZE,
  CURB_OFFSET,
  LANE_OFFSET,
  ROAD_WIDTH,
  createRng,
  getBiomeAtWorld,
} from '../sim/worldGen';
import { DIR_DX, DIR_DZ, RIGHT_DX, RIGHT_DZ, dirToYaw } from '../sim/navigation';
import { getBiomeCrowdOutfit } from '../sim/passengers';
import type { FleetTaxiAgent } from '../sim/taxiFleet';
import type { BiomeId, OrderPhase, TaxiOrder } from '../sim/types';
import {
  BiomeCostumeLibrary,
  type BiomeHeadgearRig,
  type BiomePropRig,
} from './passengerCostumes';
import type { ProceduralTexturePack } from './proceduralTextures';

const ROAD_HALF_WIDTH = ROAD_WIDTH * 0.5;

interface TrafficCar {
  mesh: THREE.Group;
  gx: number;
  gz: number;
  dir: number;
  progressM: number;
  speedMs: number;
  baseSpeedMs: number;
}

interface AmbientPedestrian {
  root: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  hairMesh: THREE.Mesh;
  coatMat: THREE.MeshStandardMaterial;
  pantsMat: THREE.MeshStandardMaterial;
  skinMat: THREE.MeshStandardMaterial;
  headgear: BiomeHeadgearRig;
  lastBiome: BiomeId | null;
  variant: number;
  gx: number;
  gz: number;
  dir: number;
  progressM: number;
  speedMs: number;
  sidewalkOffset: number;
  phaseOffset: number;
}

interface HumanoidRig {
  root: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  hairMesh: THREE.Mesh;
  coatMat: THREE.MeshStandardMaterial;
  pantsMat: THREE.MeshStandardMaterial;
  skinMat: THREE.MeshStandardMaterial;
  headgear: BiomeHeadgearRig;
}

interface PeerTaxiVisual {
  root: THREE.Group;
  airframe: THREE.Group;
  doorPivot: THREE.Group;
  signMesh: THREE.Mesh;
  cabinPassenger: THREE.Mesh;
  spoilerMesh: THREE.Mesh;
  aeroGroup: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  ionFlames: THREE.Mesh[];
  wheelFoldPivots: Array<{ pivot: THREE.Group; sideSign: number; jet: THREE.Mesh }>;
  sidewalkClient: THREE.Group;
  sidewalkClientCoatMat: THREE.MeshStandardMaterial;
  sidewalkClientSkinMat: THREE.MeshStandardMaterial;
  sidewalkClientArmR: THREE.Mesh;
  sidewalkClientHeadgear: BiomeHeadgearRig;
  lastClientBiome: BiomeId | null;
  isAero: boolean;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Manages:
 * 1. The bustling fleet of 18 autonomous peer taxis (ground sedans, Sport GTs, Luxury GTs,
 *    and flying Aero-Shuttles with folding hover wheels, aero-wings, plasma jets, opening
 *    outward curb doors, amber/emerald TAXI signs, and their own boarding/exiting passengers!)
 * 2. Ambient multi-part civilian NPC traffic cars & strolling sidewalk pedestrians
 * 3. Hero client articulated passenger walking into/out of hero taxi + 3D beacon & chevrons
 * 4. Dynamic falling rain streaks
 */
export class DynamicWorldActors {
  public readonly root = new THREE.Group();

  private cars: TrafficCar[] = [];
  private peerTaxis: PeerTaxiVisual[] = [];
  private ambientPeds: AmbientPedestrian[] = [];

  private costumeLib = new BiomeCostumeLibrary();
  private clientRig: HumanoidRig;
  private clientPropRig: BiomePropRig;

  private beaconGroup = new THREE.Group();
  private beaconBeam!: THREE.Mesh;
  private beaconRingMat: THREE.MeshBasicMaterial;
  private beaconBeamMat: THREE.MeshBasicMaterial;
  private beaconPinMat: THREE.MeshStandardMaterial;
  private beaconPinGroup = new THREE.Group();

  private chevronGroup = new THREE.Group();
  private chevronMeshes: THREE.Mesh[] = [];
  private chevronMat: THREE.MeshBasicMaterial;

  private rainLines: THREE.LineSegments;
  private rainPositions: Float32Array;
  private rainMat: THREE.LineBasicMaterial;

  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private headlightMat: THREE.MeshStandardMaterial;
  private taillightMat: THREE.MeshStandardMaterial;
  private peerSignFreeMat: THREE.MeshStandardMaterial;
  private peerSignBusyMat: THREE.MeshStandardMaterial;
  private peerHoverJetMat: THREE.MeshBasicMaterial;
  private peerHoverRingMat: THREE.MeshStandardMaterial;
  private rng = createRng(9091);

  constructor(textures: ProceduralTexturePack, isSoftwareGl: boolean, peerFleetCount = 18) {
    const trackG = <T extends THREE.BufferGeometry>(g: T): T => {
      this.geos.push(g);
      return g;
    };
    const trackM = <T extends THREE.Material>(m: T): T => {
      this.mats.push(m);
      return m;
    };

    // Shared Vehicle Geometries & Materials
    const bodyGeo = trackG(new THREE.BoxGeometry(1.82, 0.62, 4.15));
    const cabinGeo = trackG(new THREE.BoxGeometry(1.52, 0.56, 2.15));
    const wheelGeo = trackG(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12));
    wheelGeo.rotateZ(Math.PI * 0.5);
    const lightGeo = trackG(new THREE.BoxGeometry(1.55, 0.14, 0.12));

    const glassMat = trackM(
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.12,
        metalness: 0.5,
      }),
    );
    const peerGlassMat = trackM(
      new THREE.MeshPhysicalMaterial({
        color: 0x101c2e,
        roughness: 0.08,
        metalness: 0.2,
        transparent: true,
        opacity: 0.52,
      }),
    );
    const wheelMat = trackM(
      new THREE.MeshStandardMaterial({
        color: 0x1a1d24,
        roughness: 0.85,
        metalness: 0.1,
      }),
    );
    const carbonMat = trackM(
      new THREE.MeshStandardMaterial({
        color: 0x171b24,
        roughness: 0.45,
        metalness: 0.4,
      }),
    );
    const checkerMat = trackM(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.checkerStripeMap,
        roughness: 0.35,
      }),
    );
    this.headlightMat = trackM(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xfff3cc,
        emissiveIntensity: 1.5,
      }),
    );
    this.taillightMat = trackM(
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xef4444,
        emissiveIntensity: 1.4,
      }),
    );

    // 1. Ambient Civilian NPC Traffic Pool (8 vehicles alongside our 18 peer taxis)
    const carPalette = [
      0xdbe4ee, 0x334155, 0x1e3a5f, 0x8f2d38, 0x2f5e4e, 0x9ca3af, 0x4b5563, 0xc2783a,
    ];
    const bodyMats = carPalette.map((hex) =>
      trackM(
        new THREE.MeshPhysicalMaterial({
          color: hex,
          metalness: 0.58,
          roughness: 0.28,
          clearcoat: 0.9,
          clearcoatRoughness: 0.12,
        }),
      ),
    );

    const maxCars = 8;
    for (let i = 0; i < maxCars; i++) {
      const car = new THREE.Group();
      const mat = bodyMats[i % bodyMats.length];
      const isSuv = i % 3 === 0;

      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.y = 0.62;
      body.castShadow = !isSoftwareGl;
      car.add(body);

      const cabin = new THREE.Mesh(cabinGeo, glassMat);
      cabin.scale.set(1, isSuv ? 1.18 : 0.95, isSuv ? 1.2 : 1);
      cabin.position.set(0, isSuv ? 1.18 : 1.12, -0.18);
      car.add(cabin);

      const hl = new THREE.Mesh(lightGeo, this.headlightMat);
      hl.position.set(0, 0.66, 2.08);
      const tl = new THREE.Mesh(lightGeo, this.taillightMat);
      tl.position.set(0, 0.68, -2.08);
      car.add(hl, tl);

      for (const [wx, wz] of [
        [0.86, 1.25],
        [-0.86, 1.25],
        [0.86, -1.25],
        [-0.86, -1.25],
      ]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.position.set(wx, 0.34, wz);
        car.add(w);
      }

      const dir = i % 4;
      const gx = (i % 5) - 2;
      const gz = Math.floor(i / 5) - 1;
      const baseSpeedMs = 10.5 + this.rng() * 5.0;

      this.root.add(car);
      this.cars.push({
        mesh: car,
        gx,
        gz,
        dir,
        progressM: this.rng() * BLOCK_SIZE,
        speedMs: baseSpeedMs,
        baseSpeedMs,
      });
    }

    // 2. Bustling Fleet of Autonomous Peer Taxis (Ground + Flying Aero-Shuttles!)
    this.peerSignFreeMat = trackM(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.taxiSignMap,
        emissive: 0xfbbf24,
        emissiveMap: textures.taxiSignMap,
        emissiveIntensity: 1.2,
        roughness: 0.25,
      }),
    );
    this.peerSignBusyMat = trackM(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.taxiSignMap,
        emissive: 0x10b981,
        emissiveMap: textures.taxiSignMap,
        emissiveIntensity: 1.25,
        roughness: 0.25,
      }),
    );
    this.peerHoverRingMat = trackM(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 2.0,
        roughness: 0.15,
      }),
    );
    this.peerHoverJetMat = trackM(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.56,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );

    const peerTierHexes = [
      0xf4b41a, // Tier 0: Classic Taxi Yellow
      0xe6a117, // Tier 1: Metallic Business Gold
      0xf97316, // Tier 2: Sport GT Burnt Orange
      0x10b981, // Tier 3: Luxury GT Emerald
      0x1e293b, // Tier 4: Aero-Shuttle Obsidian
    ];
    const peerBodyMats = peerTierHexes.map((hex, idx) =>
      trackM(
        new THREE.MeshPhysicalMaterial({
          color: hex,
          metalness: 0.62 + idx * 0.06,
          roughness: 0.22 - idx * 0.02,
          clearcoat: 1.0,
          clearcoatRoughness: 0.08,
        }),
      ),
    );

    // Shared peer taxi geometries
    const peerBodyGeo = trackG(new THREE.BoxGeometry(1.86, 0.58, 4.35));
    const peerRoofGeo = trackG(new THREE.BoxGeometry(1.42, 0.08, 1.56));
    const peerCabinGeo = trackG(new THREE.BoxGeometry(1.5, 0.54, 2.05));
    const peerSignGeo = trackG(new THREE.BoxGeometry(0.68, 0.22, 0.22));
    const peerCheckerGeo = trackG(new THREE.BoxGeometry(0.03, 0.12, 2.25));
    const peerDoorGeo = trackG(new THREE.BoxGeometry(0.12, 0.52, 0.96));
    const peerSpoilerGeo = trackG(new THREE.BoxGeometry(1.88, 0.06, 0.28));
    const peerWingGeo = trackG(new THREE.BoxGeometry(1.08, 0.055, 0.84));
    const peerWingLedGeo = trackG(new THREE.BoxGeometry(1.06, 0.03, 0.05));
    const peerJetGeo = trackG(new THREE.ConeGeometry(0.22, 1.25, 10, 1, true));
    const peerIonGeo = trackG(new THREE.ConeGeometry(0.14, 1.45, 10, 1, true));
    peerIonGeo.rotateX(-Math.PI * 0.5);
    const peerNacelleGeo = trackG(new THREE.CylinderGeometry(0.14, 0.17, 0.72, 10));
    peerNacelleGeo.rotateX(Math.PI * 0.5);
    const peerCabinPassGeo = trackG(new THREE.BoxGeometry(0.38, 0.52, 0.28));

    const peerClientPantsMat = trackM(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 }));
    const peerClientSkinMat = trackM(new THREE.MeshStandardMaterial({ color: 0xf1c29b, roughness: 0.65 }));
    const miniLegGeo = trackG(new THREE.BoxGeometry(0.14, 0.72, 0.14));
    const miniTorsoGeo = trackG(new THREE.BoxGeometry(0.42, 0.62, 0.24));
    const miniHeadGeo = trackG(new THREE.SphereGeometry(0.15, 10, 8));
    const miniArmGeo = trackG(new THREE.BoxGeometry(0.12, 0.52, 0.12));

    for (let i = 0; i < peerFleetCount; i++) {
      const peerRoot = new THREE.Group();
      const airframe = new THREE.Group();
      peerRoot.add(airframe);

      const tier = i % 3 === 0 ? 4 : i % 4;
      const bodyMat = peerBodyMats[tier];

      const body = new THREE.Mesh(peerBodyGeo, bodyMat);
      body.position.y = 0.62;
      body.castShadow = !isSoftwareGl;
      airframe.add(body);

      const cabin = new THREE.Mesh(peerCabinGeo, peerGlassMat);
      cabin.position.set(0, 1.15, -0.14);
      airframe.add(cabin);

      const roof = new THREE.Mesh(peerRoofGeo, bodyMat);
      roof.position.set(0, 1.44, -0.16);
      airframe.add(roof);

      const signMesh = new THREE.Mesh(peerSignGeo, this.peerSignFreeMat);
      signMesh.position.set(0, 1.59, -0.1);
      airframe.add(signMesh);

      // Taxi checker stripes on both sides
      const chL = new THREE.Mesh(peerCheckerGeo, checkerMat);
      chL.position.set(0.94, 0.66, 0.0);
      const chR = new THREE.Mesh(peerCheckerGeo, checkerMat);
      chR.position.set(-0.94, 0.66, 0.35);
      chR.scale.z = 0.52;
      airframe.add(chL, chR);

      // Headlights & Taillights
      const hl = new THREE.Mesh(lightGeo, this.headlightMat);
      hl.position.set(0, 0.66, 2.18);
      const tl = new THREE.Mesh(lightGeo, this.taillightMat);
      tl.position.set(0, 0.68, -2.18);
      airframe.add(hl, tl);

      // Visible passenger figure inside rear cabin when occupied
      const cabinPassMat = trackM(
        new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.65 }),
      );
      const cabinPassenger = new THREE.Mesh(peerCabinPassGeo, cabinPassMat);
      cabinPassenger.position.set(-0.32, 1.08, -0.52);
      cabinPassenger.visible = false;
      airframe.add(cabinPassenger);

      // Articulated outward-opening curb-side rear passenger door (-X side, hinged at z = -0.02)
      const doorPivot = new THREE.Group();
      doorPivot.position.set(-0.92, 0.66, -0.02);
      const doorPanel = new THREE.Mesh(peerDoorGeo, bodyMat);
      doorPanel.position.set(0, 0, -0.48);
      doorPivot.add(doorPanel);
      airframe.add(doorPivot);

      // Rear Sport GT Spoiler (visible on Tier 2+)
      const spoilerMesh = new THREE.Mesh(peerSpoilerGeo, carbonMat);
      spoilerMesh.position.set(0, 1.14, -2.06);
      spoilerMesh.visible = tier >= 2;
      airframe.add(spoilerMesh);

      // Wheels with 90-degree hover-fold & downward cyan plasma jets for Aero-Shuttles
      const wheelFoldPivots: Array<{ pivot: THREE.Group; sideSign: number; jet: THREE.Mesh }> = [];
      for (const [wx, wz] of [
        [0.9, 1.35],
        [-0.9, 1.35],
        [0.9, -1.32],
        [-0.9, -1.32],
      ]) {
        const sideSign = wx > 0 ? 1 : -1;
        const wPivot = new THREE.Group();
        wPivot.position.set(wx, 0.34, wz);
        const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
        wPivot.add(wMesh);

        const jet = new THREE.Mesh(peerJetGeo, this.peerHoverJetMat);
        jet.rotation.z = sideSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        jet.position.set(sideSign * 0.78, 0, 0);
        jet.visible = false;
        wPivot.add(jet);

        airframe.add(wPivot);
        wheelFoldPivots.push({ pivot: wPivot, sideSign, jet });
      }

      // Deployable Aero-Wings & Twin Rear Ion Thrusters (for flying Aero-Shuttles!)
      const aeroGroup = new THREE.Group();
      const wingL = new THREE.Group();
      wingL.position.set(0.92, 0.62, -0.68);
      const wmL = new THREE.Mesh(peerWingGeo, carbonMat);
      wmL.position.set(0.52, 0, -0.15);
      wmL.rotation.y = 0.28;
      const wlL = new THREE.Mesh(peerWingLedGeo, this.peerHoverRingMat);
      wlL.position.set(0.52, 0.04, 0.24);
      wlL.rotation.y = 0.28;
      wingL.add(wmL, wlL);

      const wingR = new THREE.Group();
      wingR.position.set(-0.92, 0.62, -0.68);
      const wmR = new THREE.Mesh(peerWingGeo, carbonMat);
      wmR.position.set(-0.52, 0, -0.15);
      wmR.rotation.y = -0.28;
      const wlR = new THREE.Mesh(peerWingLedGeo, this.peerHoverRingMat);
      wlR.position.set(-0.52, 0.04, 0.24);
      wlR.rotation.y = -0.28;
      wingR.add(wmR, wlR);

      aeroGroup.add(wingL, wingR);

      const ionFlames: THREE.Mesh[] = [];
      for (const nx of [-0.58, 0.58]) {
        const nac = new THREE.Mesh(peerNacelleGeo, carbonMat);
        nac.position.set(nx, 0.94, -2.02);
        const plume = new THREE.Mesh(peerIonGeo, this.peerHoverJetMat);
        plume.position.set(nx, 0.94, -3.08);
        aeroGroup.add(nac, plume);
        ionFlames.push(plume);
      }

      aeroGroup.visible = false;
      airframe.add(aeroGroup);

      // Dedicated Curbside Passenger NPC for this peer taxi's pickups & dropoffs (with biome headgear!)
      const sidewalkClient = new THREE.Group();
      const sidewalkClientCoatMat = trackM(
        new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.68 }),
      );
      const sidewalkClientSkinMat = trackM(
        new THREE.MeshStandardMaterial({ color: 0xf1c29b, roughness: 0.65 }),
      );
      const clLegs = new THREE.Mesh(miniLegGeo, peerClientPantsMat);
      clLegs.scale.x = 2.1;
      clLegs.position.y = 0.36;
      const clTorso = new THREE.Mesh(miniTorsoGeo, sidewalkClientCoatMat);
      clTorso.position.y = 1.03;
      const clHead = new THREE.Mesh(miniHeadGeo, sidewalkClientSkinMat);
      clHead.position.y = 1.52;
      const clArmL = new THREE.Mesh(miniArmGeo, sidewalkClientCoatMat);
      clArmL.position.set(0.27, 1.02, 0);
      const sidewalkClientArmR = new THREE.Mesh(miniArmGeo, sidewalkClientCoatMat);
      sidewalkClientArmR.position.set(-0.27, 1.24, 0);
      sidewalkClientArmR.rotation.z = -2.4;
      const sidewalkClientHeadgear = this.costumeLib.createHeadgearRig(false);
      sidewalkClientHeadgear.root.position.set(0, 1.52, 0);
      sidewalkClientHeadgear.root.scale.setScalar(0.86);
      sidewalkClient.add(
        clLegs,
        clTorso,
        clHead,
        clArmL,
        sidewalkClientArmR,
        sidewalkClientHeadgear.root,
      );
      sidewalkClient.visible = false;
      this.root.add(sidewalkClient);

      this.root.add(peerRoot);
      this.peerTaxis.push({
        root: peerRoot,
        airframe,
        doorPivot,
        signMesh,
        cabinPassenger,
        spoilerMesh,
        aeroGroup,
        wingL,
        wingR,
        ionFlames,
        wheelFoldPivots,
        sidewalkClient,
        sidewalkClientCoatMat,
        sidewalkClientSkinMat,
        sidewalkClientArmR,
        sidewalkClientHeadgear,
        lastClientBiome: null,
        isAero: tier === 4,
      });
    }

    // 3. Shared Humanoid Geometries & Materials for Hero Client + Ambient Pedestrians
    const legGeo = trackG(new THREE.CylinderGeometry(0.088, 0.072, 0.78, 8));
    legGeo.translate(0, -0.39, 0);
    const shoeGeo = trackG(new THREE.BoxGeometry(0.14, 0.1, 0.24));
    shoeGeo.translate(0, -0.78, 0.05);
    const torsoGeo = trackG(new THREE.BoxGeometry(0.46, 0.66, 0.26));
    const neckGeo = trackG(new THREE.CylinderGeometry(0.065, 0.075, 0.1, 8));
    const headGeo = trackG(new THREE.SphereGeometry(0.165, 12, 10));
    const hairGeo = trackG(new THREE.SphereGeometry(0.172, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58));
    const armGeo = trackG(new THREE.CylinderGeometry(0.065, 0.055, 0.58, 8));
    armGeo.translate(0, -0.29, 0);
    const handGeo = trackG(new THREE.SphereGeometry(0.058, 8, 8));
    handGeo.translate(0, -0.58, 0);

    const shoeMat = trackM(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.72 }));
    const hairMat = trackM(new THREE.MeshStandardMaterial({ color: 0x1e1815, roughness: 0.78 }));

    const buildHumanoid = (coatHex: number, isClient: boolean): HumanoidRig => {
      const group = new THREE.Group();
      const coatMat = trackM(
        new THREE.MeshStandardMaterial({
          color: coatHex,
          roughness: 0.65,
          emissive: isClient ? coatHex : 0x000000,
          emissiveIntensity: isClient ? 0.04 : 0,
        }),
      );
      const pantsMat = trackM(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 }));
      const skinMat = trackM(new THREE.MeshStandardMaterial({ color: 0xf1c29b, roughness: 0.65 }));

      const legL = new THREE.Group();
      legL.position.set(0.115, 0.82, 0);
      legL.add(new THREE.Mesh(legGeo, pantsMat), new THREE.Mesh(shoeGeo, shoeMat));

      const legR = new THREE.Group();
      legR.position.set(-0.115, 0.82, 0);
      legR.add(new THREE.Mesh(legGeo, pantsMat), new THREE.Mesh(shoeGeo, shoeMat));

      const torso = new THREE.Mesh(torsoGeo, coatMat);
      torso.position.set(0, 1.15, 0);
      torso.castShadow = !isSoftwareGl;

      const neck = new THREE.Mesh(neckGeo, skinMat);
      neck.position.set(0, 1.52, 0);

      const head = new THREE.Mesh(headGeo, skinMat);
      head.position.set(0, 1.69, 0);

      const hair = new THREE.Mesh(hairGeo, hairMat);
      hair.position.set(0, 1.71, -0.01);

      const headgear = this.costumeLib.createHeadgearRig(false);
      headgear.root.position.set(0, 1.69, 0);

      const armL = new THREE.Group();
      armL.position.set(0.295, 1.43, 0);
      armL.add(new THREE.Mesh(armGeo, coatMat), new THREE.Mesh(handGeo, skinMat));

      const armR = new THREE.Group();
      armR.position.set(-0.295, 1.43, 0);
      armR.add(new THREE.Mesh(armGeo, coatMat), new THREE.Mesh(handGeo, skinMat));

      group.add(legL, legR, torso, neck, head, hair, headgear.root, armL, armR);
      return {
        root: group,
        legL,
        legR,
        armL,
        armR,
        hairMesh: hair,
        coatMat,
        pantsMat,
        skinMat,
        headgear,
      };
    };

    // 3a. Articulated Hero Client Passenger with Biome Headgear + Biome Hand Prop!
    this.clientRig = buildHumanoid(0xe11d48, true);
    this.clientRig.root.scale.setScalar(1.12);
    this.clientPropRig = this.costumeLib.createPropRig();
    this.clientPropRig.root.position.set(0, -0.56, 0);
    this.clientRig.armL.add(this.clientPropRig.root);
    this.clientRig.root.visible = false;
    this.root.add(this.clientRig.root);

    // 3b. Ambient Strolling Sidewalk Pedestrians (10 walkers dressed per local biome!)
    const pedCoatColors = [
      0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b, 0x8b5cf6,
      0xec4899, 0x14b8a6, 0x64748b, 0xd97706, 0x6366f1,
    ];
    for (let i = 0; i < 10; i++) {
      const rig = buildHumanoid(pedCoatColors[i % pedCoatColors.length], false);
      rig.root.scale.setScalar(0.96 + this.rng() * 0.14);
      this.root.add(rig.root);

      this.ambientPeds.push({
        root: rig.root,
        legL: rig.legL,
        legR: rig.legR,
        armL: rig.armL,
        armR: rig.armR,
        hairMesh: rig.hairMesh,
        coatMat: rig.coatMat,
        pantsMat: rig.pantsMat,
        skinMat: rig.skinMat,
        headgear: rig.headgear,
        lastBiome: null,
        variant: i,
        gx: (i % 3) - 1,
        gz: Math.floor(i / 3) - 1,
        dir: i % 4,
        progressM: 12 + this.rng() * (BLOCK_SIZE - 24),
        speedMs: 1.25 + this.rng() * 0.65,
        sidewalkOffset: ROAD_HALF_WIDTH + 1.45 + this.rng() * 1.6,
        phaseOffset: this.rng() * Math.PI * 2,
      });
    }

    // 4. Unmistakable Pickup / Dropoff 3D Marker Beacon + Floating Bobbing Diamond Pin
    const ringGeo = trackG(new THREE.RingGeometry(1.65, 2.35, 32));
    ringGeo.rotateX(-Math.PI * 0.5);
    this.beaconRingMat = trackM(
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const ring = new THREE.Mesh(ringGeo, this.beaconRingMat);
    ring.position.y = 0.1;

    const outerRingGeo = trackG(new THREE.RingGeometry(2.65, 2.9, 32));
    outerRingGeo.rotateX(-Math.PI * 0.5);
    const outerRing = new THREE.Mesh(outerRingGeo, this.beaconRingMat);
    outerRing.position.y = 0.08;

    const beamGeo = trackG(new THREE.CylinderGeometry(1.55, 1.95, 24, 24, 1, true));
    this.beaconBeamMat = trackM(
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const beam = new THREE.Mesh(beamGeo, this.beaconBeamMat);
    beam.position.y = 12.1;
    this.beaconBeam = beam;

    this.beaconPinMat = trackM(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.4,
        metalness: 0.45,
        roughness: 0.18,
      }),
    );
    const pinGeo = trackG(new THREE.OctahedronGeometry(0.62, 0));
    pinGeo.scale(0.85, 1.45, 0.85);
    const pinMesh = new THREE.Mesh(pinGeo, this.beaconPinMat);
    const pinHaloGeo = trackG(new THREE.TorusGeometry(0.82, 0.055, 8, 24));
    pinHaloGeo.rotateX(Math.PI * 0.5);
    const pinHalo = new THREE.Mesh(pinHaloGeo, this.beaconRingMat);
    this.beaconPinGroup.add(pinMesh, pinHalo);
    this.beaconPinGroup.position.y = 4.1;

    this.beaconGroup.add(ring, outerRing, beam, this.beaconPinGroup);
    this.beaconGroup.visible = false;
    this.root.add(this.beaconGroup);

    // 5. 3D Route Guidance Chevrons
    const chevShape = new THREE.Shape();
    chevShape.moveTo(0, 0.72);
    chevShape.lineTo(0.88, -0.35);
    chevShape.lineTo(0.44, -0.35);
    chevShape.lineTo(0, 0.2);
    chevShape.lineTo(-0.44, -0.35);
    chevShape.lineTo(-0.88, -0.35);
    chevShape.closePath();
    const chevGeo = trackG(new THREE.ShapeGeometry(chevShape));
    chevGeo.rotateX(-Math.PI * 0.5);

    this.chevronMat = trackM(
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(chevGeo, this.chevronMat);
      mesh.position.y = 0.12;
      this.chevronMeshes.push(mesh);
      this.chevronGroup.add(mesh);
    }
    this.chevronGroup.visible = false;
    this.root.add(this.chevronGroup);

    // 6. Dynamic Falling Rain Streaks
    const rainCount = 320;
    this.rainPositions = new Float32Array(rainCount * 6);
    for (let i = 0; i < rainCount; i++) {
      const rx = (this.rng() - 0.5) * 84;
      const ry = this.rng() * 34;
      const rz = (this.rng() - 0.5) * 84;
      const idx = i * 6;
      this.rainPositions[idx] = rx;
      this.rainPositions[idx + 1] = ry;
      this.rainPositions[idx + 2] = rz;
      this.rainPositions[idx + 3] = rx + 0.14;
      this.rainPositions[idx + 4] = ry - 1.35;
      this.rainPositions[idx + 5] = rz + 0.08;
    }
    const rainGeo = trackG(new THREE.BufferGeometry());
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainMat = trackM(
      new THREE.LineBasicMaterial({
        color: 0xcbd5e1,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    );
    this.rainLines = new THREE.LineSegments(rainGeo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.root.add(this.rainLines);
  }

  public update(params: {
    dt: number;
    elapsed: number;
    taxiX: number;
    taxiZ: number;
    taxiYaw: number;
    taxiAltitude: number;
    trafficDensity: number;
    nightFactor: number;
    isRaining: boolean;
    phase: OrderPhase;
    phaseProgress: number;
    hasPassengerInCabin: boolean;
    activeOrder: TaxiOrder | null;
    peerAgents: FleetTaxiAgent[];
    peerActiveCount: number;
  }): void {
    const {
      dt,
      elapsed,
      taxiX,
      taxiZ,
      taxiYaw,
      taxiAltitude,
      trafficDensity,
      nightFactor,
      isRaining,
      phase,
      phaseProgress,
      activeOrder,
      peerAgents,
      peerActiveCount,
    } = params;

    this.headlightMat.emissiveIntensity = 1.0 + nightFactor * 2.2;
    this.taillightMat.emissiveIntensity = 1.0 + nightFactor * 1.8;
    this.peerSignFreeMat.emissiveIntensity = 1.05 + nightFactor * 0.9;
    this.peerSignBusyMat.emissiveIntensity = 1.15 + nightFactor * 0.9;
    this.peerHoverJetMat.opacity = 0.48 + Math.sin(elapsed * 26) * 0.09;

    const taxiGx = Math.round(taxiX / BLOCK_SIZE);
    const taxiGz = Math.round(taxiZ / BLOCK_SIZE);

    // 1. Update Autonomous Peer Taxi Fleet Visuals
    for (let i = 0; i < this.peerTaxis.length; i++) {
      const vis = this.peerTaxis[i];
      const agent = peerAgents[i];
      if (!agent || i >= peerActiveCount) {
        vis.root.visible = false;
        vis.sidewalkClient.visible = false;
        continue;
      }

      vis.root.visible = true;
      vis.root.position.set(agent.x, 0, agent.z);
      vis.root.rotation.y = agent.yaw;

      const fb = agent.flightBlend;
      const hoverBob = Math.sin(elapsed * 2.9 + i * 1.3) * 0.18 * fb;
      vis.airframe.position.y = agent.altitude + hoverBob;
      vis.airframe.rotation.x = THREE.MathUtils.clamp(-agent.verticalVelocity * 0.038, -0.2, 0.16) * fb;

      // TAXI roof sign reflects Free (amber) vs Occupied (emerald)
      vis.signMesh.material = agent.hasPassenger ? this.peerSignBusyMat : this.peerSignFreeMat;

      // Visible seated passenger inside back seat
      vis.cabinPassenger.visible = agent.hasPassenger;
      if (agent.hasPassenger) {
        (vis.cabinPassenger.material as THREE.MeshStandardMaterial).color.setHex(agent.passengerCoatHex);
      }

      // Outward-opening curb-side passenger door!
      const dOpen = agent.doorOpenAmount;
      if (agent.isAero) {
        vis.doorPivot.rotation.set(dOpen * 0.55, dOpen * 0.82, -dOpen * 0.58);
        vis.doorPivot.position.set(-0.92 - dOpen * 0.3, 0.66 + dOpen * 0.34, -0.02);
      } else {
        vis.doorPivot.rotation.set(0, dOpen * 1.18, 0);
        vis.doorPivot.position.set(-0.92, 0.66, -0.02);
      }

      // Aero-Shuttle hover-wheel fold, wings, and plasma thrusters
      vis.aeroGroup.visible = agent.isAero;
      if (agent.isAero) {
        vis.wingL.scale.set(0.25 + fb * 0.85, 1, 0.6 + fb * 0.4);
        vis.wingR.scale.set(0.25 + fb * 0.85, 1, 0.6 + fb * 0.4);
        for (const f of vis.ionFlames) {
          f.visible = fb > 0.1;
          if (f.visible) {
            f.scale.set(1, 1, (0.7 + Math.sin(elapsed * 32 + i) * 0.15) * fb);
          }
        }
      }
      for (const wp of vis.wheelFoldPivots) {
        wp.pivot.rotation.z = agent.isAero ? -wp.sideSign * fb * Math.PI * 0.48 : 0;
        wp.jet.visible = agent.isAero && fb > 0.12;
      }

      // Peer Taxi Sidewalk Client (waving at curb before pickup, walking into/out of open door!)
      const showWaiting =
        agent.phase === 'en_route_pickup' && agent.stopsRemaining <= 0;
      const showBoarding = agent.phase === 'boarding' && agent.phaseProgress < 0.66;
      const showDropoff = agent.phase === 'dropoff' && agent.phaseProgress >= 0.26;

      if (showWaiting || showBoarding || showDropoff) {
        vis.sidewalkClient.visible = true;
        const stopBiome = getBiomeAtWorld(agent.stopX, agent.stopZ);
        if (vis.lastClientBiome !== stopBiome) {
          vis.lastClientBiome = stopBiome;
          const outfit = getBiomeCrowdOutfit(stopBiome, i + agent.id);
          vis.sidewalkClientCoatMat.color.setHex(outfit.coatHex);
          vis.sidewalkClientSkinMat.color.setHex(outfit.skinHex);
          vis.sidewalkClientHeadgear.setBiome(stopBiome);
        }
        const sDir = agent.stopDir;
        let shift = 2.35;
        let yPos = 0.22;

        if (showBoarding) {
          const walkT = smoothstep(0.18, 0.64, agent.phaseProgress);
          shift = THREE.MathUtils.lerp(2.35, 0.8, walkT);
          yPos = THREE.MathUtils.lerp(0.22, 0.04, walkT);
          vis.sidewalkClientArmR.rotation.z = -0.15;
        } else if (showDropoff) {
          const walkT = smoothstep(0.26, 0.76, agent.phaseProgress);
          shift = THREE.MathUtils.lerp(0.8, 2.4, walkT);
          yPos = THREE.MathUtils.lerp(0.04, 0.22, walkT);
          vis.sidewalkClientArmR.rotation.z =
            agent.phaseProgress > 0.76 ? -2.4 + Math.sin(elapsed * 7 + i) * 0.3 : -0.15;
        } else {
          // Waving on sidewalk to hail the approaching peer taxi
          vis.sidewalkClientArmR.rotation.z = -2.55 + Math.sin(elapsed * 8 + i) * 0.35;
        }

        vis.sidewalkClient.position.set(
          agent.stopX + RIGHT_DX[sDir] * shift,
          yPos,
          agent.stopZ + RIGHT_DZ[sDir] * shift,
        );
        vis.sidewalkClient.rotation.y = Math.atan2(-RIGHT_DX[sDir], -RIGHT_DZ[sDir]);
      } else {
        vis.sidewalkClient.visible = false;
      }
    }

    // 2. Update Ambient Civilian NPC Traffic
    const activeCarCount = Math.round(this.cars.length * Math.max(0, Math.min(1, trafficDensity)));
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      if (i >= activeCarCount) {
        c.mesh.visible = false;
        continue;
      }
      c.mesh.visible = true;

      c.progressM += c.speedMs * dt;
      if (c.progressM >= BLOCK_SIZE) {
        c.progressM -= BLOCK_SIZE;
        c.gx += DIR_DX[c.dir];
        c.gz += DIR_DZ[c.dir];
        const r = this.rng();
        if (r < 0.22) c.dir = (c.dir + 1) % 4;
        else if (r < 0.44) c.dir = (c.dir + 3) % 4;
      }

      if (Math.abs(c.gx - taxiGx) > 2 || Math.abs(c.gz - taxiGz) > 2) {
        c.gx = taxiGx + Math.floor(this.rng() * 5) - 2;
        c.gz = taxiGz + Math.floor(this.rng() * 5) - 2;
        c.dir = Math.floor(this.rng() * 4);
        c.progressM = this.rng() * BLOCK_SIZE;
      }

      const cx =
        c.gx * BLOCK_SIZE + DIR_DX[c.dir] * c.progressM + RIGHT_DX[c.dir] * LANE_OFFSET;
      const cz =
        c.gz * BLOCK_SIZE + DIR_DZ[c.dir] * c.progressM + RIGHT_DZ[c.dir] * LANE_OFFSET;

      const distToTaxi = Math.hypot(cx - taxiX, cz - taxiZ);
      if (taxiAltitude < 2.8 && distToTaxi < 9.5) {
        c.speedMs = Math.max(0, c.speedMs - 25 * dt);
        if (distToTaxi < 5.5) c.mesh.visible = false;
      } else {
        c.speedMs += (c.baseSpeedMs - c.speedMs) * Math.min(1, dt * 3);
      }

      c.mesh.position.set(cx, 0, cz);
      c.mesh.rotation.y = dirToYaw(c.dir);
    }

    // 3. Update Ambient Strolling Sidewalk Pedestrians
    const pedActiveCount = Math.max(4, Math.round(this.ambientPeds.length * Math.max(0.4, trafficDensity)));
    for (let i = 0; i < this.ambientPeds.length; i++) {
      const p = this.ambientPeds[i];
      if (i >= pedActiveCount) {
        p.root.visible = false;
        continue;
      }
      p.root.visible = true;

      p.progressM += p.speedMs * dt;
      if (p.progressM > BLOCK_SIZE - 10) {
        p.progressM = 10;
        p.gx += DIR_DX[p.dir];
        p.gz += DIR_DZ[p.dir];
      }

      if (Math.abs(p.gx - taxiGx) > 1 || Math.abs(p.gz - taxiGz) > 1) {
        p.gx = taxiGx + Math.floor(this.rng() * 3) - 1;
        p.gz = taxiGz + Math.floor(this.rng() * 3) - 1;
        p.dir = Math.floor(this.rng() * 4);
        p.progressM = 12 + this.rng() * (BLOCK_SIZE - 24);
      }

      const px =
        p.gx * BLOCK_SIZE + DIR_DX[p.dir] * p.progressM + RIGHT_DX[p.dir] * p.sidewalkOffset;
      const pz =
        p.gz * BLOCK_SIZE + DIR_DZ[p.dir] * p.progressM + RIGHT_DZ[p.dir] * p.sidewalkOffset;

      const pedBiome = getBiomeAtWorld(px, pz);
      if (p.lastBiome !== pedBiome) {
        p.lastBiome = pedBiome;
        const outfit = getBiomeCrowdOutfit(pedBiome, p.variant);
        p.coatMat.color.setHex(outfit.coatHex);
        p.pantsMat.color.setHex(outfit.pantsHex);
        p.skinMat.color.setHex(outfit.skinHex);
        const hidesHair = p.headgear.setBiome(pedBiome);
        p.hairMesh.visible = !hidesHair;
      }

      p.root.position.set(px, 0.22, pz);
      p.root.rotation.y = dirToYaw(p.dir);

      const walkPhase = elapsed * 5.2 + p.phaseOffset;
      const swing = Math.sin(walkPhase) * 0.45;
      p.legL.rotation.x = swing;
      p.legR.rotation.x = -swing;
      p.armL.rotation.x = -swing * 0.65;
      p.armR.rotation.x = swing * 0.65;
    }

    // 4. Update Hero Client Passenger, Biome Costume, Beacon & Route Chevrons
    if (activeOrder && phase !== 'cruising') {
      const isPickup = phase === 'en_route_pickup' || phase === 'boarding';
      const tx = isPickup ? activeOrder.pickupX : activeOrder.dropoffX;
      const tz = isPickup ? activeOrder.pickupZ : activeOrder.dropoffZ;
      const tDir = isPickup ? activeOrder.pickupDir : activeOrder.dropoffDir;

      this.clientRig.coatMat.color.setHex(activeOrder.passengerCoatHex);
      this.clientRig.coatMat.emissive.setHex(activeOrder.passengerCoatHex);
      this.clientRig.pantsMat.color.setHex(activeOrder.passengerPantsHex);
      this.clientRig.skinMat.color.setHex(activeOrder.passengerSkinHex);
      const clientHidesHair = this.clientRig.headgear.setBiome(activeOrder.passengerArchetype);
      this.clientRig.hairMesh.visible = !clientHidesHair;
      this.clientPropRig.setBiome(activeOrder.passengerArchetype);

      const colorHex = isPickup ? 0xf59e0b : 0x10b981;
      this.beaconRingMat.color.setHex(colorHex);
      this.beaconBeamMat.color.setHex(colorHex);
      this.beaconPinMat.color.setHex(isPickup ? 0xfcd34d : 0x34d399);
      this.beaconPinMat.emissive.setHex(colorHex);
      this.chevronMat.color.setHex(colorHex);

      const beaconShift = ROAD_HALF_WIDTH - CURB_OFFSET + 0.9;
      const bx = tx + RIGHT_DX[tDir] * beaconShift;
      const bz = tz + RIGHT_DZ[tDir] * beaconShift;
      const distToBeacon = Math.hypot(bx - taxiX, bz - taxiZ);
      this.beaconGroup.visible = true;
      this.beaconGroup.position.set(bx, 0, bz);
      this.beaconGroup.rotation.y = elapsed * 1.4;
      this.beaconPinGroup.position.y = 3.85 + Math.sin(elapsed * 3.8) * 0.35;
      this.beaconPinGroup.rotation.y = elapsed * 2.2;

      // Fade out additive vertical light column up close & during boarding/dropoff so costumed passengers stay crisp!
      const beamFade =
        phase === 'boarding' || phase === 'dropoff'
          ? 0
          : smoothstep(7, 22, distToBeacon);
      this.beaconBeam.visible = beamFade > 0.02;
      this.beaconBeamMat.opacity = 0.14 * beamFade;

      this.clientRig.armL.rotation.set(0, 0, 0.08);
      this.clientRig.armR.rotation.set(0, 0, -0.08);
      this.clientRig.legL.rotation.set(0, 0, 0);
      this.clientRig.legR.rotation.set(0, 0, 0);

      const sidewalkShift = 2.45;
      const doorShift = 0.78;

      if (phase === 'en_route_pickup') {
        this.clientRig.root.visible = true;
        const px = tx + RIGHT_DX[tDir] * sidewalkShift;
        const pz = tz + RIGHT_DZ[tDir] * sidewalkShift;
        this.clientRig.root.position.set(px, 0.22, pz);
        this.clientRig.root.rotation.y = Math.atan2(-RIGHT_DX[tDir], -RIGHT_DZ[tDir]);
        this.clientRig.armR.rotation.z = -2.65 + Math.sin(elapsed * 8.2) * 0.38;
        this.clientRig.armR.rotation.x = -0.25;
      } else if (phase === 'boarding') {
        if (phaseProgress < 0.66) {
          this.clientRig.root.visible = true;
          const walkT = smoothstep(0.18, 0.64, phaseProgress);
          const curShift = THREE.MathUtils.lerp(sidewalkShift, doorShift, walkT);
          const curAlong = THREE.MathUtils.lerp(0.1, -0.45, walkT);
          const curY = THREE.MathUtils.lerp(0.22, 0.04, smoothstep(0.32, 0.52, phaseProgress));

          const px = tx + RIGHT_DX[tDir] * curShift + DIR_DX[tDir] * curAlong;
          const pz = tz + RIGHT_DZ[tDir] * curShift + DIR_DZ[tDir] * curAlong;
          this.clientRig.root.position.set(px, curY, pz);
          this.clientRig.root.rotation.y = Math.atan2(-RIGHT_DX[tDir], -RIGHT_DZ[tDir]);

          if (phaseProgress >= 0.18 && phaseProgress < 0.64) {
            const stride = Math.sin(elapsed * 11.5) * 0.58;
            this.clientRig.legL.rotation.x = stride;
            this.clientRig.legR.rotation.x = -stride;
            this.clientRig.armL.rotation.x = -stride * 0.55;
            this.clientRig.armR.rotation.x = stride * 0.55;
          } else {
            this.clientRig.armR.rotation.z = -2.4 + Math.sin(elapsed * 6.5) * 0.25;
          }
        } else {
          this.clientRig.root.visible = false;
        }
      } else if (phase === 'en_route_dropoff') {
        this.clientRig.root.visible = false;
      } else if (phase === 'dropoff') {
        if (phaseProgress >= 0.26) {
          this.clientRig.root.visible = true;
          const walkT = smoothstep(0.26, 0.76, phaseProgress);
          const curShift = THREE.MathUtils.lerp(doorShift, sidewalkShift, walkT);
          const curAlong = THREE.MathUtils.lerp(-0.45, 0.15, walkT);
          const curY = THREE.MathUtils.lerp(0.04, 0.22, smoothstep(0.42, 0.62, phaseProgress));

          const px = tx + RIGHT_DX[tDir] * curShift + DIR_DX[tDir] * curAlong;
          const pz = tz + RIGHT_DZ[tDir] * curShift + DIR_DZ[tDir] * curAlong;
          this.clientRig.root.position.set(px, curY, pz);

          if (phaseProgress < 0.76) {
            this.clientRig.root.rotation.y = Math.atan2(RIGHT_DX[tDir], RIGHT_DZ[tDir]);
            const stride = Math.sin(elapsed * 11.5) * 0.55;
            this.clientRig.legL.rotation.x = stride;
            this.clientRig.legR.rotation.x = -stride;
            this.clientRig.armL.rotation.x = -stride * 0.5;
            this.clientRig.armR.rotation.x = stride * 0.5;
          } else {
            this.clientRig.root.rotation.y = Math.atan2(-RIGHT_DX[tDir], -RIGHT_DZ[tDir]);
            this.clientRig.armR.rotation.z = -2.5 + Math.sin(elapsed * 7.8) * 0.3;
          }
        } else {
          this.clientRig.root.visible = false;
        }
      }

      const dist = Math.hypot(tx - taxiX, tz - taxiZ);
      if (dist > 14 && (phase === 'en_route_pickup' || phase === 'en_route_dropoff')) {
        this.chevronGroup.visible = true;
        const dirToTarget = Math.atan2(tx - taxiX, tz - taxiZ);
        const fwdX = Math.sin(taxiYaw);
        const fwdZ = Math.cos(taxiYaw);
        for (let i = 0; i < this.chevronMeshes.length; i++) {
          const offset = 7 + i * 4.5 + ((elapsed * 9) % 4.5);
          const cm = this.chevronMeshes[i];
          cm.position.set(taxiX + fwdX * offset, taxiAltitude + 0.14, taxiZ + fwdZ * offset);
          cm.rotation.y = dirToTarget;
        }
      } else {
        this.chevronGroup.visible = false;
      }
    } else {
      this.beaconGroup.visible = false;
      this.clientRig.root.visible = false;
      this.chevronGroup.visible = false;
    }

    // 5. Falling rain streaks centered around taxi
    this.rainLines.visible = isRaining;
    if (isRaining) {
      this.rainLines.position.set(taxiX, taxiAltitude, taxiZ);
      const posAttr = this.rainLines.geometry.attributes.position as THREE.BufferAttribute;
      const drop = 42 * dt;
      for (let i = 0; i < this.rainPositions.length; i += 6) {
        this.rainPositions[i + 1] -= drop;
        this.rainPositions[i + 4] -= drop;
        if (this.rainPositions[i + 1] < -taxiAltitude) {
          const topY = 30 + (i % 7);
          this.rainPositions[i + 1] = topY;
          this.rainPositions[i + 4] = topY - 1.35;
        }
      }
      posAttr.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.costumeLib.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
