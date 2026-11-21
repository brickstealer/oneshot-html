import * as THREE from 'three';
import {
  BIOME_DEFS,
  CHUNK_SIZE,
  ROAD_WIDTH,
  SIDEWALK_WIDTH,
  chunkHasBank,
  getBankEntryPosition,
  getBiomeAt,
  hash2D,
} from '../sim/biomes';
import type { BiomeFilter, BiomeId } from '../sim/types';
import type { ProceduralTexturePack } from './textures';

export interface ActiveBank {
  key: string;
  x: number;
  z: number;
  cooldown: number; // seconds until next robbery allowed
  beacon: THREE.Mesh;
}

interface ChunkEntry {
  key: string;
  cx: number;
  cz: number;
  biome: BiomeId;
  group: THREE.Group;
  bank?: ActiveBank;
}

const BLOCK_INNER = CHUNK_SIZE - ROAD_WIDTH; // 48m interior block
const ROAD_LEN = BLOCK_INNER;

// ---------------------------------------------------------------------------
// High-Poly Sculpted Environment Geometry Builders (Shared across all chunks)
// ---------------------------------------------------------------------------

function createRoundedRectExtrude(
  w: number,
  d: number,
  h: number,
  radius: number,
  bevel = 0.22,
): THREE.BufferGeometry {
  const hw = w * 0.5;
  const hd = d * 0.5;
  const r = Math.min(radius, hw * 0.45, hd * 0.45);
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.2, h - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  // Normalize clean architectural UVs so facade glass/Art Deco textures tile naturally on vertical walls
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(norm.getX(i));
    const nz = Math.abs(norm.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (nx > nz) {
      uv.setXY(i, (z + hd) / 14, y / 16);
    } else {
      uv.setXY(i, (x + hw) / 14, y / 16);
    }
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an arched, gracefully tapering palm frond with natural droop & V-fold cross section.
 */
function createPalmFrondGeometry(): THREE.BufferGeometry {
  const segs = 10;
  const len = 3.2;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = t * len;
    // Parabolic arch up then graceful tropical droop
    const y = Math.sin(t * Math.PI * 0.82) * 0.62 - t * t * 0.72;
    // Tapered leaf width: narrow at stem, wide in middle, pointed at tip
    const halfW = Math.sin(Math.pow(t, 0.72) * Math.PI) * 0.46;
    const droopEdge = y - halfW * 0.35;

    // 3 vertices per cross section: left edge, raised center spine, right edge
    positions.push(x, droopEdge, -halfW);
    positions.push(x, y + 0.04, 0);
    positions.push(x, droopEdge, halfW);
  }

  for (let i = 0; i < segs; i++) {
    const row = i * 3;
    const next = (i + 1) * 3;
    // Left half blade
    indices.push(row, next, row + 1, row + 1, next, next + 1);
    // Right half blade
    indices.push(row + 1, next + 1, row + 2, row + 2, next + 1, next + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a continuously curved, organically tapered palm trunk (normalized height = 1).
 */
function createCurvedPalmTrunkGeometry(): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.06, 0.32, 0.02),
    new THREE.Vector3(0.18, 0.68, 0.04),
    new THREE.Vector3(0.28, 1.0, 0.05),
  ]);
  const geo = new THREE.TubeGeometry(curve, 16, 1.0, 10, false);
  const pos = geo.attributes.position;
  const center = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = THREE.MathUtils.clamp(v.y, 0, 1);
    curve.getPoint(t, center);
    // Taper from flared base (0.31) to slender crown (0.14) with subtle bark ring ridges
    const ringRipple = 1 + Math.sin(t * Math.PI * 24) * 0.06;
    const radius = THREE.MathUtils.lerp(0.31, 0.14, Math.pow(t, 0.75)) * ringRipple;
    v.sub(center).multiplyScalar(radius).add(center);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an organic displaced foliage crown (smooth sculpted canopy, not a chunky dodecahedron).
 */
function createOrganicFoliageGeometry(radius: number, seedOffset = 0): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n =
      Math.sin(v.x * 1.9 + seedOffset) * Math.cos(v.z * 1.7 - seedOffset) * 0.18 +
      Math.sin(v.y * 2.4 + v.x * 1.3) * 0.11;
    v.multiplyScalar(1 + n);
    v.y *= 0.76;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a stratified, weathered red-rock sandstone mesa / desert butte with realistic erosion ledges.
 */
function createSculptedMesaGeometry(topR: number, botR: number, height: number, seed = 0): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(topR, botR, height, 28, 10, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.01) continue;
    const ang = Math.atan2(z, x);
    const hNorm = (y + height * 0.5) / height; // 0 at base, 1 at plateau
    // Horizontal sedimentary strata ledges + vertical canyon flutes
    const strata = Math.sin(hNorm * Math.PI * 7) * 0.32;
    const flutes =
      Math.sin(ang * 3 + seed) * 0.75 +
      Math.cos(ang * 5 - seed * 1.7) * 0.45 +
      Math.sin(ang * 8 + hNorm * 3) * 0.2;
    const newR = Math.max(0.5, r + strata + flutes * (1 - hNorm * 0.32));
    const scale = newR / r;
    pos.setXYZ(i, x * scale, y, z * scale);
  }
  geo.translate(0, height * 0.5, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a domed industrial refinery silo via LatheGeometry.
 */
function createDomedSiloGeometry(radius: number, height: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(radius * 1.04, 0),
    new THREE.Vector2(radius * 1.04, 0.45),
    new THREE.Vector2(radius, 0.55),
    new THREE.Vector2(radius, height * 0.82),
  ];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * radius, height * 0.82 + Math.sin(a) * (radius * 0.48)));
  }
  const geo = new THREE.LatheGeometry(pts, 28);
  geo.computeVertexNormals();
  return geo;
}

export class WorldChunkManager {
  public readonly root = new THREE.Group();
  private chunks = new Map<string, ChunkEntry>();
  private textures: ProceduralTexturePack;
  private biomeLock: BiomeFilter = 'auto';

  // Shared materials updated dynamically with day/night cycle
  private roadStraightMat: THREE.MeshStandardMaterial;
  private roadInterMat: THREE.MeshStandardMaterial;
  private sidewalkMat: THREE.MeshStandardMaterial;
  private skyscraperMat: THREE.MeshStandardMaterial;
  private artDecoMat: THREE.MeshStandardMaterial;
  private bankMat: THREE.MeshStandardMaterial;
  private sandMat: THREE.MeshStandardMaterial;
  private desertGroundMat: THREE.MeshStandardMaterial;
  private desertRockMat: THREE.MeshStandardMaterial;
  private swampMat: THREE.MeshPhysicalMaterial;
  private oceanMat: THREE.MeshPhysicalMaterial;
  private portGroundMat: THREE.MeshStandardMaterial;
  private metalPoleMat: THREE.MeshStandardMaterial;
  private streetLampBulbMat: THREE.MeshStandardMaterial;
  private neonPinkMat: THREE.MeshStandardMaterial;
  private neonCyanMat: THREE.MeshStandardMaterial;
  private neonAmberMat: THREE.MeshStandardMaterial;
  private woodMat: THREE.MeshStandardMaterial;
  private palmTrunkMat: THREE.MeshStandardMaterial;
  private palmLeafMat: THREE.MeshStandardMaterial;
  private coconutMat: THREE.MeshStandardMaterial;
  private cypressTrunkMat: THREE.MeshStandardMaterial;
  private cypressLeafMat: THREE.MeshStandardMaterial;
  private cactusMat: THREE.MeshStandardMaterial;
  private marbleColMat: THREE.MeshStandardMaterial;
  private domeCopperMat: THREE.MeshStandardMaterial;
  private goldMat: THREE.MeshStandardMaterial;
  private craneMat: THREE.MeshStandardMaterial;
  private hydrantMat: THREE.MeshStandardMaterial;
  private siloMat: THREE.MeshStandardMaterial;
  private containerMats: THREE.MeshStandardMaterial[];

  // Shared High-Poly Geometries (Allocated once, reused everywhere)
  private roadNSGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LEN);
  private roadEWGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LEN);
  private interGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_WIDTH);
  private blockBaseGeo: THREE.BufferGeometry;
  private innerLotGeo = new THREE.PlaneGeometry(BLOCK_INNER - SIDEWALK_WIDTH * 2, BLOCK_INNER - SIDEWALK_WIDTH * 2);

  // Curved swan-neck streetlight & sculpted hydrant
  private lampBaseGeo: THREE.BufferGeometry;
  private lampCurveGeo: THREE.BufferGeometry;
  private lampHeadGeo: THREE.BufferGeometry;
  private hydrantGeo: THREE.BufferGeometry;

  // Sculpted foliage & nature
  private palmTrunkGeo: THREE.BufferGeometry;
  private palmFrondGeo: THREE.BufferGeometry;
  private coconutGeo = new THREE.SphereGeometry(0.14, 10, 8);
  private cypressTrunkGeo: THREE.BufferGeometry;
  private cypressCanopyA: THREE.BufferGeometry;
  private cypressCanopyB: THREE.BufferGeometry;
  private mesaBaseGeo: THREE.BufferGeometry;
  private mesaTopGeo: THREE.BufferGeometry;
  private boulderGeo: THREE.BufferGeometry;
  private cactusArmGeo: THREE.BufferGeometry;

  // Sculpted architecture & props
  private bankColGeo: THREE.BufferGeometry;
  private bankDomeGeo: THREE.BufferGeometry;
  private bankPedimentGeo: THREE.BufferGeometry;
  private umbrellaCanopyGeo: THREE.BufferGeometry;
  private siloGeo: THREE.BufferGeometry;
  private towerRoundedGeo: THREE.BufferGeometry;
  private towerOctGeo: THREE.BufferGeometry;
  private towerCylGeo: THREE.BufferGeometry;
  private balconyRingGeo: THREE.BufferGeometry;
  private containerBevelGeo: THREE.BufferGeometry;

  constructor(textures: ProceduralTexturePack) {
    this.textures = textures;
    this.roadNSGeo.rotateX(-Math.PI / 2);
    this.roadEWGeo.rotateX(-Math.PI / 2);
    this.roadEWGeo.rotateY(Math.PI / 2);
    this.interGeo.rotateX(-Math.PI / 2);
    this.innerLotGeo.rotateX(-Math.PI / 2);

    // Beveled rounded-corner sidewalk island
    this.blockBaseGeo = createRoundedRectExtrude(BLOCK_INNER, BLOCK_INNER, 0.24, 2.2, 0.06);

    // Curved gooseneck tubular streetlight
    this.lampBaseGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.28, 0),
        new THREE.Vector2(0.24, 0.18),
        new THREE.Vector2(0.18, 0.85),
        new THREE.Vector2(0.11, 1.05),
      ],
      14,
    );
    const lampCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.9, 0),
      new THREE.Vector3(0, 5.2, 0),
      new THREE.Vector3(0.35, 6.25, 0),
      new THREE.Vector3(1.25, 6.55, 0),
      new THREE.Vector3(2.05, 6.45, 0),
    ]);
    this.lampCurveGeo = new THREE.TubeGeometry(lampCurve, 22, 0.085, 10, false);
    this.lampHeadGeo = new THREE.CapsuleGeometry(0.14, 0.45, 6, 12);
    this.lampHeadGeo.rotateZ(Math.PI / 2);
    this.lampHeadGeo.scale(1, 0.48, 1.15);

    // Lathe-sculpted classic American fire hydrant
    this.hydrantGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.22, 0),
        new THREE.Vector2(0.21, 0.1),
        new THREE.Vector2(0.15, 0.14),
        new THREE.Vector2(0.15, 0.56),
        new THREE.Vector2(0.19, 0.6),
        new THREE.Vector2(0.16, 0.64),
        new THREE.Vector2(0.12, 0.74),
        new THREE.Vector2(0.05, 0.82),
        new THREE.Vector2(0.01, 0.82),
      ],
      16,
    );

    // Sculpted palm tree & cypress & desert rock
    this.palmTrunkGeo = createCurvedPalmTrunkGeometry();
    this.palmFrondGeo = createPalmFrondGeometry();

    this.cypressTrunkGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.95, 0),
        new THREE.Vector2(0.68, 0.14),
        new THREE.Vector2(0.46, 0.35),
        new THREE.Vector2(0.34, 0.72),
        new THREE.Vector2(0.22, 1.0),
      ],
      14,
    );
    this.cypressCanopyA = createOrganicFoliageGeometry(2.8, 1.1);
    this.cypressCanopyB = createOrganicFoliageGeometry(2.0, 3.7);
    this.mesaBaseGeo = createSculptedMesaGeometry(7.2, 10.2, 7.8, 1.3);
    this.mesaTopGeo = createSculptedMesaGeometry(4.4, 6.8, 6.2, 4.1);
    this.boulderGeo = createOrganicFoliageGeometry(1.5, 2.4);

    // Curved Saguaro cactus arm via TubeGeometry
    const cactusArmCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.45, 0.04, 0),
      new THREE.Vector3(0.72, 0.32, 0),
      new THREE.Vector3(0.74, 1.35, 0),
    ]);
    this.cactusArmGeo = new THREE.TubeGeometry(cactusArmCurve, 14, 0.18, 10, false);

    // Fluted classical bank column + neoclassical dome + triangular pediment
    this.bankColGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.62, 0),
        new THREE.Vector2(0.62, 0.38),
        new THREE.Vector2(0.5, 0.55),
        new THREE.Vector2(0.44, 4.8),
        new THREE.Vector2(0.39, 8.9),
        new THREE.Vector2(0.58, 9.3),
        new THREE.Vector2(0.62, 9.6),
      ],
      18,
    );

    const domePts: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * (Math.PI / 2);
      domePts.push(new THREE.Vector2(Math.cos(a) * 4.4, Math.sin(a) * 3.8));
    }
    this.bankDomeGeo = new THREE.LatheGeometry(domePts, 24);

    const pedShape = new THREE.Shape();
    pedShape.moveTo(-7.8, 0);
    pedShape.lineTo(7.8, 0);
    pedShape.lineTo(0, 3.1);
    pedShape.closePath();
    this.bankPedimentGeo = new THREE.ExtrudeGeometry(pedShape, {
      depth: 13.4,
      bevelEnabled: true,
      bevelSize: 0.18,
      bevelThickness: 0.18,
      bevelSegments: 2,
    });
    this.bankPedimentGeo.translate(0, 0, -6.7);

    // Scalloped curved beach umbrella dome
    const umbPts: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      umbPts.push(new THREE.Vector2(t * 1.55, Math.cos(t * Math.PI * 0.5) * 0.55));
    }
    this.umbrellaCanopyGeo = new THREE.LatheGeometry(umbPts, 18);

    // Domed industrial refinery silo
    this.siloGeo = createDomedSiloGeometry(5.1, 12.6);

    // Reusable normalized architectural tower shells (scaled cleanly per building lot)
    this.towerRoundedGeo = createRoundedRectExtrude(1, 1, 1, 0.14, 0.025);
    this.towerOctGeo = new THREE.CylinderGeometry(0.52, 0.58, 1, 8, 1);
    this.towerOctGeo.translate(0, 0.5, 0);
    this.towerCylGeo = new THREE.CylinderGeometry(0.5, 0.52, 1, 24, 1);
    this.towerCylGeo.translate(0, 0.5, 0);
    this.balconyRingGeo = new THREE.TorusGeometry(0.54, 0.032, 8, 24);
    this.balconyRingGeo.rotateX(Math.PI / 2);
    this.containerBevelGeo = createRoundedRectExtrude(12.2, 2.7, 2.7, 0.12, 0.08);

    // Materials
    this.roadStraightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.roadStraight,
      bumpMap: textures.roadBump,
      bumpScale: 0.08,
      roughness: 0.78,
      metalness: 0.06,
    });
    this.roadInterMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.roadIntersection,
      bumpMap: textures.roadBump,
      bumpScale: 0.08,
      roughness: 0.78,
      metalness: 0.06,
    });
    this.sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.sidewalk,
      roughness: 0.88,
      metalness: 0.04,
    });
    this.skyscraperMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.skyscraperGlass,
      emissive: new THREE.Color(0xfff1d6),
      emissiveMap: textures.skyscraperEmissive,
      emissiveIntensity: 0.7,
      roughness: 0.18,
      metalness: 0.74,
    });
    this.artDecoMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.artDecoFacade,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: textures.artDecoEmissive,
      emissiveIntensity: 0.85,
      roughness: 0.48,
      metalness: 0.14,
    });
    this.bankMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.bankFacade,
      roughness: 0.44,
      metalness: 0.14,
    });
    this.sandMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.sandMap,
      roughness: 0.94,
      metalness: 0.02,
    });
    this.desertGroundMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.desertRockMap,
      roughness: 0.92,
      metalness: 0.04,
    });
    this.desertRockMat = new THREE.MeshStandardMaterial({
      color: 0xb65a33,
      roughness: 0.88,
      metalness: 0.04,
    });
    this.swampMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: textures.swampWaterMap,
      roughness: 0.18,
      metalness: 0.15,
      clearcoat: 0.85,
      clearcoatRoughness: 0.14,
    });
    this.oceanMat = new THREE.MeshPhysicalMaterial({
      color: 0x0ea5b7,
      roughness: 0.12,
      metalness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    });
    this.portGroundMat = new THREE.MeshStandardMaterial({
      color: 0x4b515a,
      roughness: 0.86,
      metalness: 0.12,
    });
    this.metalPoleMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.36,
      metalness: 0.78,
    });
    this.streetLampBulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff7db,
      emissive: 0xffd27d,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });
    this.neonPinkMat = new THREE.MeshStandardMaterial({
      color: 0xff4fa3,
      emissive: 0xff3b94,
      emissiveIntensity: 1.3,
      roughness: 0.2,
    });
    this.neonCyanMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.3,
      roughness: 0.2,
    });
    this.neonAmberMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.2,
      roughness: 0.2,
    });
    this.woodMat = new THREE.MeshStandardMaterial({ color: 0x78553a, roughness: 0.86, metalness: 0.04 });
    this.palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x876747, roughness: 0.9, metalness: 0.02 });
    this.palmLeafMat = new THREE.MeshStandardMaterial({
      color: 0x2d7a47,
      roughness: 0.64,
      metalness: 0.06,
      side: THREE.DoubleSide,
    });
    this.coconutMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.82 });
    this.cypressTrunkMat = new THREE.MeshStandardMaterial({ color: 0x4f4033, roughness: 0.92, metalness: 0.02 });
    this.cypressLeafMat = new THREE.MeshStandardMaterial({ color: 0x355a39, roughness: 0.82, metalness: 0.04 });
    this.cactusMat = new THREE.MeshStandardMaterial({ color: 0x3b7a42, roughness: 0.76, metalness: 0.04 });
    this.marbleColMat = new THREE.MeshStandardMaterial({ color: 0xebe5d9, roughness: 0.42, metalness: 0.08 });
    this.domeCopperMat = new THREE.MeshStandardMaterial({ color: 0x4c8c78, roughness: 0.36, metalness: 0.58 });
    this.goldMat = new THREE.MeshStandardMaterial({ color: 0xe6b84c, roughness: 0.24, metalness: 0.86 });
    this.craneMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.42, metalness: 0.58 });
    this.hydrantMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.36, metalness: 0.38 });
    this.siloMat = new THREE.MeshStandardMaterial({ color: 0xdbe2ea, roughness: 0.34, metalness: 0.64 });

    const containerPalette = [0xc83e37, 0x2563eb, 0xd97706, 0x0f766e, 0x475569];
    this.containerMats = containerPalette.map(
      (hex) =>
        new THREE.MeshStandardMaterial({
          color: hex,
          map: textures.containerCorrugated,
          roughness: 0.58,
          metalness: 0.38,
        }),
    );
  }

  public setBiomeLock(lock: BiomeFilter, centerX: number, centerZ: number) {
    if (this.biomeLock === lock) return;
    this.biomeLock = lock;
    this.clearAllChunks();
    this.updateAround(centerX, centerZ);
  }

  public setRainWetness(wetness: number) {
    const r = THREE.MathUtils.lerp(0.78, 0.24, wetness);
    this.roadStraightMat.roughness = r;
    this.roadInterMat.roughness = r;
    this.sidewalkMat.roughness = THREE.MathUtils.lerp(0.88, 0.38, wetness);
  }

  public updateAtmosphere(nightFactor: number, elapsedTime: number) {
    this.skyscraperMat.emissiveIntensity = 0.08 + nightFactor * 0.95;
    this.artDecoMat.emissiveIntensity = 0.12 + nightFactor * 1.05;
    this.streetLampBulbMat.emissiveIntensity = 0.15 + nightFactor * 1.4;
    this.neonPinkMat.emissiveIntensity = 0.28 + nightFactor * 1.25;
    this.neonCyanMat.emissiveIntensity = 0.28 + nightFactor * 1.25;
    this.neonAmberMat.emissiveIntensity = 0.25 + nightFactor * 1.15;

    this.oceanMat.roughness = 0.1 + Math.sin(elapsedTime * 1.8) * 0.03;
    for (const chunk of this.chunks.values()) {
      if (chunk.bank) {
        chunk.bank.beacon.rotation.y = elapsedTime * 1.8;
        chunk.bank.beacon.position.y = 1.65 + Math.sin(elapsedTime * 3.2) * 0.25;
        chunk.bank.beacon.visible = chunk.bank.cooldown <= 0;
      }
    }
  }

  public tickCooldowns(dt: number) {
    for (const chunk of this.chunks.values()) {
      if (chunk.bank && chunk.bank.cooldown > 0) {
        chunk.bank.cooldown = Math.max(0, chunk.bank.cooldown - dt);
      }
    }
  }

  public getActiveBanks(): ActiveBank[] {
    const list: ActiveBank[] = [];
    for (const chunk of this.chunks.values()) {
      if (chunk.bank) list.push(chunk.bank);
    }
    return list;
  }

  public updateAround(worldX: number, worldZ: number, radius = 2) {
    const pcx = Math.floor(worldX / CHUNK_SIZE);
    const pcz = Math.floor(worldZ / CHUNK_SIZE);
    const keepKeys = new Set<string>();

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = `${cx},${cz}`;
        keepKeys.add(key);
        if (!this.chunks.has(key)) {
          const entry = this.buildChunk(cx, cz, key);
          this.chunks.set(key, entry);
          this.root.add(entry.group);
        }
      }
    }

    for (const [key, entry] of this.chunks.entries()) {
      if (!keepKeys.has(key)) {
        this.root.remove(entry.group);
        this.chunks.delete(key);
      }
    }
  }

  private clearAllChunks() {
    for (const entry of this.chunks.values()) {
      this.root.remove(entry.group);
    }
    this.chunks.clear();
  }

  private buildChunk(cx: number, cz: number, key: string): ChunkEntry {
    const biome = getBiomeAt(cx, cz, this.biomeLock);
    const group = new THREE.Group();
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    group.position.set(ox, 0, oz);

    // 1. Road Network (Intersection + NS Avenue + EW Avenue)
    const inter = new THREE.Mesh(this.interGeo, this.roadInterMat);
    inter.position.set(0, 0.03, 0);
    inter.receiveShadow = true;
    group.add(inter);

    const roadNS = new THREE.Mesh(this.roadNSGeo, this.roadStraightMat);
    roadNS.position.set(0, 0.025, CHUNK_SIZE * 0.5);
    roadNS.receiveShadow = true;
    group.add(roadNS);

    const roadEW = new THREE.Mesh(this.roadEWGeo, this.roadStraightMat);
    roadEW.position.set(CHUNK_SIZE * 0.5, 0.025, 0);
    roadEW.receiveShadow = true;
    group.add(roadEW);

    // 2. Rounded Beveled Sidewalk Island centered at (32, 0, 32)
    const blockBase = new THREE.Mesh(this.blockBaseGeo, this.sidewalkMat);
    blockBase.position.set(CHUNK_SIZE * 0.5, 0, CHUNK_SIZE * 0.5);
    blockBase.receiveShadow = true;
    group.add(blockBase);

    // Curved gooseneck streetlights & sculpted curb props
    this.addStreetFurniture(group, cx, cz, biome);

    // 3. Biome-specific interior terrain & high-poly architecture
    let bank: ActiveBank | undefined;
    const hasBank = chunkHasBank(cx, cz, biome);

    if (biome === 'downtown') {
      bank = this.populateDowntown(group, cx, cz, key, hasBank);
    } else if (biome === 'beach') {
      bank = this.populateBeach(group, cx, cz, key, hasBank);
    } else if (biome === 'everglades') {
      this.populateEverglades(group, cx, cz);
    } else if (biome === 'desert') {
      bank = this.populateDesert(group, cx, cz, key, hasBank);
    } else {
      bank = this.populatePort(group, cx, cz, key, hasBank);
    }

    return { key, cx, cz, biome, group, bank };
  }

  private addStreetFurniture(group: THREE.Group, cx: number, cz: number, biome: BiomeId) {
    // 2 curved gooseneck tubular streetlights facing avenues
    const lampSpots: [number, number, number][] = [
      [ROAD_WIDTH * 0.5 + 1.35, ROAD_WIDTH * 0.5 + 1.35, Math.PI],
      [CHUNK_SIZE - ROAD_WIDTH * 0.5 - 1.35, ROAD_WIDTH * 0.5 + 1.35, Math.PI * 0.5],
    ];
    for (const [lx, lz, rot] of lampSpots) {
      const lamp = new THREE.Group();
      lamp.position.set(lx, 0.24, lz);
      lamp.rotation.y = rot;
      const base = new THREE.Mesh(this.lampBaseGeo, this.metalPoleMat);
      const neck = new THREE.Mesh(this.lampCurveGeo, this.metalPoleMat);
      const head = new THREE.Mesh(this.lampHeadGeo, this.streetLampBulbMat);
      head.position.set(2.1, 6.42, 0);
      lamp.add(base, neck, head);
      group.add(lamp);
    }

    // Curved realistic tropical palms & lathe fire hydrants
    if (biome === 'downtown' || biome === 'beach') {
      const palmPos: [number, number][] = [
        [ROAD_WIDTH * 0.5 + 1.7, 24],
        [ROAD_WIDTH * 0.5 + 1.7, 42],
        [28, ROAD_WIDTH * 0.5 + 1.7],
      ];
      palmPos.forEach(([px, pz], idx) => {
        if (hash2D(cx + idx, cz, 313) > 0.25 || biome === 'beach') {
          const palm = this.createPalmTree(7.8 + hash2D(cx, cz + idx, 411) * 3.4);
          palm.position.set(px, 0.24, pz);
          palm.rotation.y = hash2D(cx + idx, cz - idx, 521) * Math.PI * 2;
          group.add(palm);
        }
      });

      const hydrant = new THREE.Mesh(this.hydrantGeo, this.hydrantMat);
      hydrant.position.set(14.5, 0.24, ROAD_WIDTH * 0.5 + 1.15);
      group.add(hydrant);
    }
  }

  private createPalmTree(height: number): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(this.palmTrunkGeo, this.palmTrunkMat);
    trunk.scale.set(1, height, 1);
    trunk.castShadow = true;
    g.add(trunk);

    // Crown positioned at top of curved trunk (0.28, height, 0.05)
    const crown = new THREE.Group();
    crown.position.set(0.28, height, 0.05);

    // Cluster of 3 coconuts tucked beneath fronds
    for (let c = 0; c < 3; c++) {
      const ca = (c / 3) * Math.PI * 2;
      const nut = new THREE.Mesh(this.coconutGeo, this.coconutMat);
      nut.position.set(Math.cos(ca) * 0.24, -0.22, Math.sin(ca) * 0.24);
      crown.add(nut);
    }

    // Two lush tiers of arching tapered palm fronds (10 fronds total)
    for (let f = 0; f < 10; f++) {
      const upper = f >= 6;
      const count = upper ? 4 : 6;
      const idx = upper ? f - 6 : f;
      const angle = (idx / count) * Math.PI * 2 + (upper ? 0.5 : 0);
      const frond = new THREE.Mesh(this.palmFrondGeo, this.palmLeafMat);
      frond.rotation.y = angle;
      frond.rotation.z = upper ? 0.28 : -0.08;
      frond.scale.setScalar(upper ? 0.78 : 1.04);
      frond.castShadow = true;
      crown.add(frond);
    }
    g.add(crown);
    return g;
  }

  private createBankBuilding(
    group: THREE.Group,
    cx: number,
    cz: number,
    key: string,
  ): ActiveBank {
    const bankGroup = new THREE.Group();
    bankGroup.position.set(19.5, 0.24, 19.5);

    // Stepped marble grand plinth stairs
    for (let st = 0; st < 3; st++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(16.6 - st * 0.7, 0.24, 15.6 - st * 0.7),
        this.marbleColMat,
      );
      step.position.y = 0.12 + st * 0.24;
      step.receiveShadow = true;
      bankGroup.add(step);
    }

    // Main neoclassical hall
    const hall = new THREE.Mesh(new THREE.BoxGeometry(14.2, 10.2, 12.2), this.bankMat);
    hall.position.set(0, 5.8, 0.6);
    hall.castShadow = true;
    hall.receiveShadow = true;
    bankGroup.add(hall);

    // 6 Sculpted fluted classical columns (LatheGeometry with plinth & flared capital)
    for (let i = 0; i < 6; i++) {
      const col = new THREE.Mesh(this.bankColGeo, this.marbleColMat);
      col.position.set(-5.8 + i * 2.32, 0.72, -6.15);
      col.castShadow = true;
      bankGroup.add(col);
    }

    // Classical entablature cornice + sculpted triangular pediment
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.95, 14.2), this.marbleColMat);
    cornice.position.set(0, 10.8, -0.1);
    bankGroup.add(cornice);

    const pediment = new THREE.Mesh(this.bankPedimentGeo, this.marbleColMat);
    pediment.position.set(0, 11.25, -0.1);
    pediment.castShadow = true;
    bankGroup.add(pediment);

    // Grand neoclassical ribbed dome + golden spire finial
    const domeDrum = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.7, 1.5, 24), this.marbleColMat);
    domeDrum.position.set(0, 12.2, 0.4);
    const dome = new THREE.Mesh(this.bankDomeGeo, this.domeCopperMat);
    dome.position.set(0, 12.9, 0.4);
    dome.castShadow = true;
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 12), this.goldMat);
    finial.position.set(0, 17.5, 0.4);
    bankGroup.add(domeDrum, dome, finial);

    // Illuminated bank frieze trim + arched bronze vault entrance
    const roofSign = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 9.4, 5, 10), this.neonAmberMat);
    roofSign.rotation.z = Math.PI / 2;
    roofSign.position.set(0, 11.15, -7.15);
    bankGroup.add(roofSign);

    const vaultArch = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.45, 18, 1, false, 0, Math.PI), this.goldMat);
    vaultArch.rotation.z = Math.PI / 2;
    vaultArch.rotation.y = Math.PI / 2;
    vaultArch.position.set(0, 3.8, -5.55);
    const vaultDoor = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.2, 0.4), this.goldMat);
    vaultDoor.position.set(0, 2.2, -5.55);
    bankGroup.add(vaultArch, vaultDoor);

    group.add(bankGroup);

    // Floating rotating gold diamond marker outside the bank entrance
    const entry = getBankEntryPosition(cx, cz);
    const beacon = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.82, 0),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.6,
        roughness: 0.2,
        metalness: 0.85,
      }),
    );
    beacon.position.set(entry.x - cx * CHUNK_SIZE, 1.65, entry.z - cz * CHUNK_SIZE);
    group.add(beacon);

    return {
      key,
      x: entry.x,
      z: entry.z,
      cooldown: 0,
      beacon,
    };
  }

  private populateDowntown(
    group: THREE.Group,
    cx: number,
    cz: number,
    key: string,
    hasBank: boolean,
  ): ActiveBank | undefined {
    let bank: ActiveBank | undefined;

    const lots: [number, number][] = [
      [20, 20],
      [44, 20],
      [20, 44],
      [44, 44],
    ];

    lots.forEach(([lx, lz], idx) => {
      if (idx === 0 && hasBank) {
        bank = this.createBankBuilding(group, cx, cz, key);
        return;
      }

      const hSeed = hash2D(cx * 3 + idx, cz * 5 - idx, 811);
      const styleRoll = Math.floor(hash2D(cx + idx * 7, cz - idx * 3, 877) * 4);
      const isArtDeco = styleRoll === 1;
      const w = 13.5 + hash2D(cx + idx, cz, 821) * 5;
      const d = 13.5 + hash2D(cx, cz + idx, 829) * 5;
      const h = isArtDeco ? 15 + hSeed * 20 : 24 + hSeed * 46;

      const bGroup = new THREE.Group();
      bGroup.position.set(lx, 0.24, lz);
      const mainMat = isArtDeco ? this.artDecoMat : this.skyscraperMat;
      const neonMat = idx % 2 === 0 ? this.neonPinkMat : this.neonCyanMat;

      if (styleRoll === 0) {
        // Archetype 1: Curved-corner modern glass skyscraper with stepped setbacks & spire
        const tower = new THREE.Mesh(this.towerRoundedGeo, mainMat);
        tower.scale.set(w, h, d);
        tower.castShadow = true;
        tower.receiveShadow = true;
        bGroup.add(tower);

        const crownH = 4 + hSeed * 6.5;
        const crown = new THREE.Mesh(this.towerRoundedGeo, mainMat);
        crown.scale.set(w * 0.66, crownH, d * 0.66);
        crown.position.y = h - 0.1;
        crown.castShadow = true;
        bGroup.add(crown);

        // Curved horizontal sky-ledge band
        const ledge = new THREE.Mesh(this.towerRoundedGeo, neonMat);
        ledge.scale.set(w + 0.45, 0.42, d + 0.45);
        ledge.position.y = h - 0.7;
        bGroup.add(ledge);

        if (h > 34) {
          const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.48, 10.5, 14), this.metalPoleMat);
          spire.position.y = h + crownH + 5.1;
          bGroup.add(spire);
        }
      } else if (styleRoll === 2) {
        // Archetype 2: Smooth cylindrical/oval luxury condo high-rise with wraparound balcony rings
        const cyl = new THREE.Mesh(this.towerCylGeo, mainMat);
        cyl.scale.set(w, h, d * 0.92);
        cyl.castShadow = true;
        cyl.receiveShadow = true;
        bGroup.add(cyl);

        // Wraparound sculpted balcony bands every 7m
        for (let by = 7; by < h - 2; by += 7.5) {
          const ring = new THREE.Mesh(this.balconyRingGeo, this.marbleColMat);
          ring.scale.set(w, d * 0.92, 1);
          ring.position.y = by;
          bGroup.add(ring);
        }

        // Curved penthouse crown dome
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(w * 0.34, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
          this.domeCopperMat,
        );
        cap.position.y = h;
        bGroup.add(cap);
      } else if (styleRoll === 3) {
        // Archetype 3: Tapered octagonal financial tower with crystalline roof crown
        const oct = new THREE.Mesh(this.towerOctGeo, mainMat);
        oct.scale.set(w * 1.06, h, d * 1.06);
        oct.rotation.y = Math.PI / 8;
        oct.castShadow = true;
        oct.receiveShadow = true;
        bGroup.add(oct);

        const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.46, 7.5, 8), this.metalPoleMat);
        cap.rotation.y = Math.PI / 8;
        cap.position.y = h + 3.7;
        bGroup.add(cap);

        const ring = new THREE.Mesh(this.balconyRingGeo, neonMat);
        ring.scale.set(w * 1.02, d * 1.02, 1);
        ring.position.y = h - 0.5;
        bGroup.add(ring);
      } else {
        // Archetype 4: Streamline Moderne Vice Art Deco Hotel with rounded corner bays & eyebrow fins
        const body = new THREE.Mesh(this.towerRoundedGeo, this.artDecoMat);
        body.scale.set(w, h, d);
        body.castShadow = true;
        body.receiveShadow = true;
        bGroup.add(body);

        // Rounded corner turret bay + sculpted eyebrow ledges
        for (let ey = 4.5; ey < h - 1; ey += 4.8) {
          const fin = new THREE.Mesh(this.towerRoundedGeo, this.marbleColMat);
          fin.scale.set(w + 0.7, 0.32, d + 0.7);
          fin.position.y = ey;
          bGroup.add(fin);
        }
        const neonRibbon = new THREE.Mesh(this.towerRoundedGeo, neonMat);
        neonRibbon.scale.set(w + 0.4, 0.48, d + 0.4);
        neonRibbon.position.y = h - 0.55;
        bGroup.add(neonRibbon);

        // Rooftop cylindrical Art Deco cupola
        const decoTop = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.24, w * 0.28, 3.6, 20), this.marbleColMat);
        decoTop.position.y = h + 1.8;
        bGroup.add(decoTop);
      }

      group.add(bGroup);
    });

    return bank;
  }

  private populateBeach(
    group: THREE.Group,
    cx: number,
    cz: number,
    key: string,
    hasBank: boolean,
  ): ActiveBank | undefined {
    let bank: ActiveBank | undefined;

    const sand = new THREE.Mesh(this.innerLotGeo, this.sandMat);
    sand.position.set(CHUNK_SIZE * 0.5, 0.26, CHUNK_SIZE * 0.5);
    sand.receiveShadow = true;
    group.add(sand);

    const water = new THREE.Mesh(new THREE.PlaneGeometry(20, 38), this.oceanMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(44, 0.285, 32);
    group.add(water);

    if (hasBank) {
      bank = this.createBankBuilding(group, cx, cz, key);
    } else {
      // Rounded Streamline Moderne Oceanfront Resort Hotel with terrace ledges
      const resortH = 13 + hash2D(cx, cz, 619) * 14;
      const resort = new THREE.Mesh(this.towerRoundedGeo, this.artDecoMat);
      resort.scale.set(14, resortH, 24);
      resort.position.set(20, 0.24, 32);
      resort.castShadow = true;
      resort.receiveShadow = true;
      group.add(resort);

      for (let ly = 4.2; ly < resortH - 1; ly += 4.2) {
        const terrace = new THREE.Mesh(this.towerRoundedGeo, this.marbleColMat);
        terrace.scale.set(14.8, 0.28, 24.8);
        terrace.position.set(20, 0.24 + ly, 32);
        group.add(terrace);
      }

      const neon = new THREE.Mesh(this.towerRoundedGeo, this.neonCyanMat);
      neon.scale.set(14.5, 0.42, 24.5);
      neon.position.set(20, 0.24 + resortH - 0.5, 32);
      group.add(neon);
    }

    // Detailed Lifeguard Tower on 4 round timber stilts with hipped roof & lifebuoy
    const tower = new THREE.Group();
    tower.position.set(32, 0.26, 22);
    for (const sx of [-0.95, 0.95]) {
      for (const sz of [-0.95, 0.95]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.3, 10), this.woodMat);
        post.position.set(sx, 1.15, sz);
        post.rotation.z = sx > 0 ? 0.08 : -0.08;
        tower.add(post);
      }
    }
    const deck = new THREE.Mesh(this.towerRoundedGeo, this.woodMat);
    deck.scale.set(3.2, 0.22, 3.2);
    deck.position.y = 2.2;
    const cabin = new THREE.Mesh(
      this.towerRoundedGeo,
      new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.45 }),
    );
    cabin.scale.set(2.4, 2.0, 2.4);
    cabin.position.y = 2.4;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.35, 1.15, 16),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 }),
    );
    roof.position.y = 4.95;
    const buoy = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.09, 10, 18),
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5 }),
    );
    buoy.position.set(1.24, 3.2, 0);
    buoy.rotation.y = Math.PI / 2;
    tower.add(deck, cabin, roof, buoy);
    group.add(tower);

    // Sculpted scalloped dome beach umbrellas
    const umbrellaColors = [0xef4444, 0x06b6d4, 0xf59e0b, 0xec4899];
    for (let i = 0; i < 4; i++) {
      const umb = new THREE.Group();
      umb.position.set(31 + (i % 2) * 3.5, 0.26, 30 + i * 5);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.35, 10), this.woodMat);
      stick.position.y = 1.15;
      const top = new THREE.Mesh(
        this.umbrellaCanopyGeo,
        new THREE.MeshStandardMaterial({ color: umbrellaColors[i], roughness: 0.65, side: THREE.DoubleSide }),
      );
      top.position.y = 1.92;
      umb.add(stick, top);
      group.add(umb);
    }

    return bank;
  }

  private populateEverglades(group: THREE.Group, cx: number, cz: number) {
    const swamp = new THREE.Mesh(this.innerLotGeo, this.swampMat);
    swamp.position.set(CHUNK_SIZE * 0.5, 0.26, CHUNK_SIZE * 0.5);
    swamp.receiveShadow = true;
    group.add(swamp);

    // Elevated boardwalk with round timber pilings
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.22, 38), this.woodMat);
    deck.position.set(26, 0.68, 32);
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);
    for (let pz = 15; pz <= 49; pz += 6.8) {
      for (const px of [24.1, 27.9]) {
        const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 1.35, 10), this.cypressTrunkMat);
        piling.position.set(px, 0.65, pz);
        group.add(piling);
      }
    }

    // Rustic stilt shack on round pilings with rounded hanging lantern
    const shack = new THREE.Group();
    shack.position.set(38, 0.26, 26);
    const cabin = new THREE.Mesh(this.towerRoundedGeo, this.woodMat);
    cabin.scale.set(8, 4.1, 7);
    cabin.position.y = 0.85;
    cabin.castShadow = true;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(6.5, 2.7, 12),
      new THREE.MeshStandardMaterial({ color: 0x3b4d3f, roughness: 0.86 }),
    );
    roof.position.y = 6.2;
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), this.neonAmberMat);
    lantern.position.set(-4.2, 3.2, 0);
    shack.add(cabin, roof, lantern);
    group.add(shack);

    // Organic sculpted cypress trees with flared buttress trunks & smooth multi-lobe canopies
    for (let i = 0; i < 8; i++) {
      const tx = 14 + hash2D(cx + i, cz, 211) * 34;
      const tz = 14 + hash2D(cx, cz + i, 223) * 34;
      if (Math.abs(tx - 26) < 4 || (Math.abs(tx - 38) < 6 && Math.abs(tz - 26) < 6)) continue;

      const tree = new THREE.Group();
      tree.position.set(tx, 0.26, tz);
      const h = 7.2 + hash2D(cx * 2 + i, cz - i, 229) * 4.8;
      const trunk = new THREE.Mesh(this.cypressTrunkGeo, this.cypressTrunkMat);
      trunk.scale.set(1, h, 1);
      trunk.castShadow = true;
      const canopy1 = new THREE.Mesh(this.cypressCanopyA, this.cypressLeafMat);
      canopy1.position.y = h + 0.3;
      canopy1.rotation.y = i * 1.1;
      const canopy2 = new THREE.Mesh(this.cypressCanopyB, this.cypressLeafMat);
      canopy2.position.set(1.1, h - 0.9, 0.7);
      const canopy3 = new THREE.Mesh(this.cypressCanopyB, this.cypressLeafMat);
      canopy3.position.set(-1.0, h - 1.1, -0.6);
      tree.add(trunk, canopy1, canopy2, canopy3);
      group.add(tree);
    }
  }

  private populateDesert(
    group: THREE.Group,
    cx: number,
    cz: number,
    key: string,
    hasBank: boolean,
  ): ActiveBank | undefined {
    let bank: ActiveBank | undefined;

    const desertFloor = new THREE.Mesh(this.innerLotGeo, this.desertGroundMat);
    desertFloor.position.set(CHUNK_SIZE * 0.5, 0.26, CHUNK_SIZE * 0.5);
    desertFloor.receiveShadow = true;
    group.add(desertFloor);

    if (hasBank) {
      bank = this.createBankBuilding(group, cx, cz, key);
    } else {
      // Retro Streamline Desert Gas Canopy with rounded corners & cylindrical pillars
      const station = new THREE.Group();
      station.position.set(22, 0.26, 22);
      const canopy = new THREE.Mesh(
        this.towerRoundedGeo,
        new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.42, metalness: 0.32 }),
      );
      canopy.scale.set(12.2, 0.72, 9.2);
      canopy.position.y = 4.55;
      canopy.castShadow = true;
      station.add(canopy);
      for (const px of [-4.4, 4.4]) {
        for (const pz of [-2.9, 2.9]) {
          const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 4.7, 14), this.metalPoleMat);
          pillar.position.set(px, 2.35, pz);
          station.add(pillar);
        }
      }
      const sign = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 8.6, 5, 10), this.neonAmberMat);
      sign.rotation.z = Math.PI / 2;
      sign.position.set(0, 4.9, -4.68);
      station.add(sign);
      group.add(station);
    }

    // High-poly stratified weathered red sandstone mesa + organic boulders
    const mesa = new THREE.Group();
    mesa.position.set(42, 0.26, 40);
    mesa.rotation.y = hash2D(cx, cz, 457) * Math.PI * 2;
    const tier1 = new THREE.Mesh(this.mesaBaseGeo, this.desertRockMat);
    tier1.castShadow = true;
    tier1.receiveShadow = true;
    const tier2 = new THREE.Mesh(this.mesaTopGeo, this.desertRockMat);
    tier2.position.set(-0.5, 7.2, 0.4);
    tier2.castShadow = true;
    mesa.add(tier1, tier2);
    group.add(mesa);

    for (let b = 0; b < 3; b++) {
      const boulder = new THREE.Mesh(this.boulderGeo, this.desertRockMat);
      const ang = b * 2.1 + hash2D(cx + b, cz, 463);
      boulder.position.set(42 + Math.cos(ang) * 10.5, 0.65, 40 + Math.sin(ang) * 10.5);
      boulder.scale.setScalar(0.6 + hash2D(cx, cz + b, 467) * 0.7);
      group.add(boulder);
    }

    // Smooth curved Saguaro Cacti (CapsuleGeometry + curved TubeGeometry elbow arms)
    for (let i = 0; i < 6; i++) {
      const x = 14 + hash2D(cx + i, cz, 401) * 34;
      const z = 14 + hash2D(cx, cz + i, 409) * 34;
      if (x > 32 && z > 30) continue;
      if (x < 30 && z < 30) continue;

      const cactus = new THREE.Group();
      cactus.position.set(x, 0.26, z);
      cactus.rotation.y = hash2D(cx + i, cz, 421) * Math.PI * 2;
      const h = 3.0 + hash2D(cx + i, cz - i, 419) * 2.2;
      const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, h, 8, 14), this.cactusMat);
      stem.position.y = h * 0.5 + 0.2;
      stem.castShadow = true;
      const arm1 = new THREE.Mesh(this.cactusArmGeo, this.cactusMat);
      arm1.position.set(0.12, h * 0.48, 0);
      const tip1 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), this.cactusMat);
      tip1.position.set(0.86, h * 0.48 + 1.35, 0);
      cactus.add(stem, arm1, tip1);

      if (i % 2 === 0) {
        const arm2 = new THREE.Mesh(this.cactusArmGeo, this.cactusMat);
        arm2.scale.set(-0.85, 0.8, 0.85);
        arm2.position.set(-0.12, h * 0.36, 0);
        const tip2 = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), this.cactusMat);
        tip2.position.set(-0.75, h * 0.36 + 1.08, 0);
        cactus.add(arm2, tip2);
      }
      group.add(cactus);
    }

    return bank;
  }

  private populatePort(
    group: THREE.Group,
    cx: number,
    cz: number,
    key: string,
    hasBank: boolean,
  ): ActiveBank | undefined {
    let bank: ActiveBank | undefined;

    const yard = new THREE.Mesh(this.innerLotGeo, this.portGroundMat);
    yard.position.set(CHUNK_SIZE * 0.5, 0.26, CHUNK_SIZE * 0.5);
    yard.receiveShadow = true;
    group.add(yard);

    if (hasBank) {
      bank = this.createBankBuilding(group, cx, cz, key);
    } else {
      // Twin domed industrial refinery storage silos + overhead pipe bridge
      for (let i = 0; i < 2; i++) {
        const silo = new THREE.Mesh(this.siloGeo, this.siloMat);
        silo.position.set(19 + i * 11.5, 0.24, 20);
        silo.castShadow = true;
        silo.receiveShadow = true;
        group.add(silo);
      }
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 11.5, 14), this.metalPoleMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(24.75, 9.8, 20);
      group.add(pipe);
    }

    // Beveled corrugated shipping containers
    for (let row = 0; row < 2; row++) {
      const stacks = 1 + (Math.floor(hash2D(cx + row, cz, 701) * 3) % 3);
      for (let s = 0; s < stacks; s++) {
        const mat = this.containerMats[Math.abs(cx + cz + row + s) % this.containerMats.length];
        const box = new THREE.Mesh(this.containerBevelGeo, mat);
        box.position.set(41, 0.26 + s * 2.72, 34 + row * 4.2);
        box.castShadow = true;
        box.receiveShadow = true;
        group.add(box);
      }
    }

    // Tapered A-Frame Port Gantry Crane with angled tubular legs & operator cab
    const crane = new THREE.Group();
    crane.position.set(22, 0.26, 44);
    for (const lx of [-3.8, 3.8]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.54, 22.2, 12), this.craneMat);
      leg.position.set(lx, 11, 0);
      leg.rotation.z = lx > 0 ? 0.08 : -0.08;
      leg.castShadow = true;
      crane.add(leg);
    }
    const crossBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 7.2, 10), this.craneMat);
    crossBeam.rotation.z = Math.PI / 2;
    crossBeam.position.set(0, 12.5, 0);
    const boom = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 21, 6, 12), this.craneMat);
    boom.rotation.z = Math.PI / 2;
    boom.scale.set(1, 0.9, 1.15);
    boom.position.set(3, 21.5, 0);
    boom.castShadow = true;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), this.neonPinkMat);
    beacon.position.set(13.5, 22.5, 0);
    crane.add(crossBeam, boom, beacon);
    group.add(crane);

    return bank;
  }

  public dispose() {
    this.clearAllChunks();
    this.roadNSGeo.dispose();
    this.roadEWGeo.dispose();
    this.interGeo.dispose();
    this.blockBaseGeo.dispose();
    this.innerLotGeo.dispose();
    this.lampBaseGeo.dispose();
    this.lampCurveGeo.dispose();
    this.lampHeadGeo.dispose();
    this.hydrantGeo.dispose();
    this.palmTrunkGeo.dispose();
    this.palmFrondGeo.dispose();
    this.coconutGeo.dispose();
    this.cypressTrunkGeo.dispose();
    this.cypressCanopyA.dispose();
    this.cypressCanopyB.dispose();
    this.mesaBaseGeo.dispose();
    this.mesaTopGeo.dispose();
    this.boulderGeo.dispose();
    this.cactusArmGeo.dispose();
    this.bankColGeo.dispose();
    this.bankDomeGeo.dispose();
    this.bankPedimentGeo.dispose();
    this.umbrellaCanopyGeo.dispose();
    this.siloGeo.dispose();
    this.towerRoundedGeo.dispose();
    this.towerOctGeo.dispose();
    this.towerCylGeo.dispose();
    this.balconyRingGeo.dispose();
    this.containerBevelGeo.dispose();
  }
}

export function getBiomePaletteAccent(biome: BiomeId): number {
  return BIOME_DEFS[biome].accentColor;
}
