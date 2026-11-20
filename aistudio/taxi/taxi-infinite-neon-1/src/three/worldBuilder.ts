import * as THREE from 'three';
import {
  BIOMES,
  BLOCK_SIZE,
  ROAD_WIDTH,
  SIDEWALK_WIDTH,
  createRng,
  getBiomeAtChunk,
  hash2D,
} from '../sim/worldGen';
import type { BiomeId } from '../sim/types';
import type { ProceduralTexturePack } from './proceduralTextures';

const ACTIVE_CHUNK_RADIUS = 2; // 5x5 = 25 chunks = 360m x 360m surrounding the taxi
const INNER_BLOCK_SIZE = BLOCK_SIZE - ROAD_WIDTH; // 58m
const HALF_BLOCK = BLOCK_SIZE * 0.5; // 36m

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

interface InstancedBucket {
  mesh: THREE.InstancedMesh;
  count: number;
  max: number;
  hasColor: boolean;
}

function makeBucket(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  max: number,
  hasColor: boolean,
  castShadow: boolean,
  receiveShadow: boolean,
): InstancedBucket {
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.count = 0;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.frustumCulled = false; // Dynamically updated around taxi
  if (hasColor) {
    // Initialize instanceColor buffer so setColorAt always works cleanly
    mesh.setColorAt(0, _color.setHex(0xffffff));
  }
  return { mesh, count: 0, max, hasColor };
}

function pushInstance(
  b: InstancedBucket,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  rx = 0,
  ry = 0,
  rz = 0,
  colorHex?: number,
): void {
  if (b.count >= b.max) return;
  _dummy.position.set(x, y, z);
  _dummy.rotation.set(rx, ry, rz);
  _dummy.scale.set(sx, sy, sz);
  _dummy.updateMatrix();
  b.mesh.setMatrixAt(b.count, _dummy.matrix);
  if (b.hasColor && colorHex !== undefined) {
    _color.setHex(colorHex);
    b.mesh.setColorAt(b.count, _color);
  }
  b.count++;
}

function finalizeBucket(b: InstancedBucket): void {
  b.mesh.count = b.count;
  b.mesh.instanceMatrix.needsUpdate = true;
  if (b.hasColor && b.mesh.instanceColor) {
    b.mesh.instanceColor.needsUpdate = true;
  }
}

type FacadeStyle =
  | 'metropolis'
  | 'riviera'
  | 'canyon'
  | 'alpine'
  | 'sakura'
  | 'medieval'
  | 'cyberpunk';

/**
 * Ultra-fast InstancedMesh infinite world manager (~21 draw calls total for 360m x 360m!)
 * generating mega-detailed streets and 13 distinct realistic, historical, surreal & sci-fi biomes.
 */
export class InfiniteWorldManager {
  public readonly root = new THREE.Group();

  private lastCenterKey = '';
  private allGeos: THREE.BufferGeometry[] = [];
  private allMats: THREE.Material[] = [];

  private roadStraightMat!: THREE.MeshStandardMaterial;
  private roadIntersectionMat!: THREE.MeshStandardMaterial;
  private facadeMats!: Record<FacadeStyle, THREE.MeshStandardMaterial>;
  private emissiveMat!: THREE.MeshBasicMaterial;

  private buckets!: {
    intersections: InstancedBucket;
    roadsNS: InstancedBucket;
    roadsEW: InstancedBucket;
    sidewalks: InstancedBucket;
    groundPads: InstancedBucket;
    facades: Record<FacadeStyle, InstancedBucket>;
    boxes: InstancedBucket;
    cylinders: InstancedBucket;
    cones: InstancedBucket;
    spheres: InstancedBucket;
    pyramids: InstancedBucket;
    domes: InstancedBucket;
    toruses: InstancedBucket;
    emissives: InstancedBucket;
    water: InstancedBucket;
  };

  constructor(textures: ProceduralTexturePack, isSoftwareGl: boolean) {
    const g = <T extends THREE.BufferGeometry>(geo: T): T => {
      this.allGeos.push(geo);
      return geo;
    };
    const m = <T extends THREE.Material>(mat: T): T => {
      this.allMats.push(mat);
      return mat;
    };

    const cast = !isSoftwareGl;

    // Shared primitive geometries
    const intersectionGeo = g(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_WIDTH));
    intersectionGeo.rotateX(-Math.PI * 0.5);

    const roadNSGeo = g(new THREE.PlaneGeometry(ROAD_WIDTH, INNER_BLOCK_SIZE));
    roadNSGeo.rotateX(-Math.PI * 0.5);

    const roadEWGeo = g(new THREE.PlaneGeometry(ROAD_WIDTH, INNER_BLOCK_SIZE));
    roadEWGeo.rotateX(-Math.PI * 0.5);
    roadEWGeo.rotateY(Math.PI * 0.5);

    const sidewalkGeo = g(new THREE.BoxGeometry(INNER_BLOCK_SIZE, 0.22, INNER_BLOCK_SIZE));
    const innerPadGeo = g(
      new THREE.PlaneGeometry(
        INNER_BLOCK_SIZE - SIDEWALK_WIDTH * 2,
        INNER_BLOCK_SIZE - SIDEWALK_WIDTH * 2,
      ),
    );
    innerPadGeo.rotateX(-Math.PI * 0.5);

    const unitBoxGeo = g(new THREE.BoxGeometry(1, 1, 1));
    const unitCylGeo = g(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
    const unitConeGeo = g(new THREE.ConeGeometry(0.5, 1, 8));
    const unitSphereGeo = g(new THREE.IcosahedronGeometry(0.5, 1));
    // Crisp 4-sided square-base pyramid (1x1 base, height 1, centered on Y)
    const unitPyramidGeo = g(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4));
    unitPyramidGeo.rotateY(Math.PI * 0.25);
    // Hemisphere dome (diameter 1, height 0.5, base at y=0) for mushroom caps, Pantheon & lunar biodomes
    const unitDomeGeo = g(
      new THREE.SphereGeometry(0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    );
    // Horizontal torus ring (outer diameter ~1.0, lying flat on XZ plane) for giant donuts & craters
    const unitTorusGeo = g(new THREE.TorusGeometry(0.36, 0.14, 8, 16));
    unitTorusGeo.rotateX(Math.PI * 0.5);
    const waterGeo = g(new THREE.PlaneGeometry(1, 1));
    waterGeo.rotateX(-Math.PI * 0.5);

    // Shared PBR materials
    this.roadStraightMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.roadStraightMap,
        bumpMap: textures.roadBumpMap,
        bumpScale: 0.06,
        roughness: 0.78,
        metalness: 0.06,
      }),
    );

    this.roadIntersectionMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.roadIntersectionMap,
        bumpMap: textures.roadBumpMap,
        bumpScale: 0.06,
        roughness: 0.78,
        metalness: 0.06,
      }),
    );

    const sidewalkMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.sidewalkMap,
        bumpMap: textures.sidewalkBumpMap,
        bumpScale: 0.04,
        roughness: 0.84,
        metalness: 0.05,
      }),
    );

    const groundMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.02,
      }),
    );

    this.facadeMats = {
      metropolis: m(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: textures.metropolisFacadeMap,
          emissive: 0xffe4b5,
          emissiveMap: textures.metropolisEmissiveMap,
          emissiveIntensity: 0.55,
          roughness: 0.28,
          metalness: 0.45,
        }),
      ),
      riviera: m(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: textures.rivieraFacadeMap,
          emissive: 0xffd599,
          emissiveMap: textures.rivieraEmissiveMap,
          emissiveIntensity: 0.4,
          roughness: 0.76,
          metalness: 0.04,
        }),
      ),
      canyon: m(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: textures.canyonFacadeMap,
          emissive: 0xffc878,
          emissiveMap: textures.canyonEmissiveMap,
          emissiveIntensity: 0.45,
          roughness: 0.84,
          metalness: 0.05,
        }),
      ),
      alpine: m(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: textures.alpineFacadeMap,
          emissive: 0xffbe6b,
          emissiveMap: textures.alpineEmissiveMap,
          emissiveIntensity: 0.5,
          roughness: 0.82,
          metalness: 0.05,
        }),
      ),
      sakura: m(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: textures.sakuraFacadeMap,
          emissive: 0xffb960,
          emissiveMap: textures.sakuraEmissiveMap,
          emissiveIntensity: 0.6,
          roughness: 0.72,
          metalness: 0.08,
        }),
      ),
      medieval: m(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: textures.medievalFacadeMap,
          emissive: 0xffa042,
          emissiveMap: textures.medievalEmissiveMap,
          emissiveIntensity: 0.65,
          roughness: 0.86,
          metalness: 0.05,
        }),
      ),
      cyberpunk: m(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: textures.cyberpunkFacadeMap,
          emissive: 0xffffff,
          emissiveMap: textures.cyberpunkEmissiveMap,
          emissiveIntensity: 1.25,
          roughness: 0.24,
          metalness: 0.55,
        }),
      ),
    };

    const archBoxMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.72,
        metalness: 0.18,
      }),
    );

    const cylMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.58,
        metalness: 0.35,
      }),
    );

    const coneMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.78,
        metalness: 0.06,
      }),
    );

    const foliageMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.82,
        metalness: 0.02,
      }),
    );

    this.emissiveMat = m(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
    );

    const waterMat = m(
      new THREE.MeshPhysicalMaterial({
        color: 0x16a3b5,
        roughness: 0.12,
        metalness: 0.18,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
      }),
    );

    const domeMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.45,
        metalness: 0.16,
      }),
    );

    const torusMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.52,
        metalness: 0.12,
      }),
    );

    // Allocate instanced buckets (generous capacities for 25 active chunks across all 13 biomes)
    this.buckets = {
      intersections: makeBucket(intersectionGeo, this.roadIntersectionMat, 36, false, false, true),
      roadsNS: makeBucket(roadNSGeo, this.roadStraightMat, 36, false, false, true),
      roadsEW: makeBucket(roadEWGeo, this.roadStraightMat, 36, false, false, true),
      sidewalks: makeBucket(sidewalkGeo, sidewalkMat, 36, true, false, true),
      groundPads: makeBucket(innerPadGeo, groundMat, 36, true, false, true),
      facades: {
        metropolis: makeBucket(unitBoxGeo, this.facadeMats.metropolis, 140, true, cast, true),
        riviera: makeBucket(unitBoxGeo, this.facadeMats.riviera, 110, true, cast, true),
        canyon: makeBucket(unitBoxGeo, this.facadeMats.canyon, 80, true, cast, true),
        alpine: makeBucket(unitBoxGeo, this.facadeMats.alpine, 90, true, cast, true),
        sakura: makeBucket(unitBoxGeo, this.facadeMats.sakura, 130, true, cast, true),
        medieval: makeBucket(unitBoxGeo, this.facadeMats.medieval, 140, true, cast, true),
        cyberpunk: makeBucket(unitBoxGeo, this.facadeMats.cyberpunk, 140, true, cast, true),
      },
      boxes: makeBucket(unitBoxGeo, archBoxMat, 2400, true, cast, true),
      cylinders: makeBucket(unitCylGeo, cylMat, 1800, true, cast, false),
      cones: makeBucket(unitConeGeo, coneMat, 1000, true, cast, true),
      spheres: makeBucket(unitSphereGeo, foliageMat, 1300, true, false, true),
      pyramids: makeBucket(unitPyramidGeo, coneMat, 280, true, cast, true),
      domes: makeBucket(unitDomeGeo, domeMat, 520, true, cast, true),
      toruses: makeBucket(unitTorusGeo, torusMat, 300, true, cast, true),
      emissives: makeBucket(unitBoxGeo, this.emissiveMat, 900, true, false, false),
      water: makeBucket(waterGeo, waterMat, 60, false, false, true),
    };

    const allMeshes = [
      this.buckets.intersections.mesh,
      this.buckets.roadsNS.mesh,
      this.buckets.roadsEW.mesh,
      this.buckets.sidewalks.mesh,
      this.buckets.groundPads.mesh,
      this.buckets.facades.metropolis.mesh,
      this.buckets.facades.riviera.mesh,
      this.buckets.facades.canyon.mesh,
      this.buckets.facades.alpine.mesh,
      this.buckets.facades.sakura.mesh,
      this.buckets.facades.medieval.mesh,
      this.buckets.facades.cyberpunk.mesh,
      this.buckets.boxes.mesh,
      this.buckets.cylinders.mesh,
      this.buckets.cones.mesh,
      this.buckets.spheres.mesh,
      this.buckets.pyramids.mesh,
      this.buckets.domes.mesh,
      this.buckets.toruses.mesh,
      this.buckets.emissives.mesh,
      this.buckets.water.mesh,
    ];
    for (const mesh of allMeshes) {
      this.root.add(mesh);
    }
  }

  public updateAtmosphere(nightFactor: number, wetness: number): void {
    const winEmissive = 0.22 + nightFactor * 1.4;
    this.facadeMats.metropolis.emissiveIntensity = winEmissive;
    this.facadeMats.riviera.emissiveIntensity = winEmissive * 0.85;
    this.facadeMats.canyon.emissiveIntensity = winEmissive * 0.95;
    this.facadeMats.alpine.emissiveIntensity = winEmissive * 1.1;
    this.facadeMats.sakura.emissiveIntensity = 0.3 + nightFactor * 1.45;
    this.facadeMats.medieval.emissiveIntensity = 0.4 + nightFactor * 1.5;
    this.facadeMats.cyberpunk.emissiveIntensity = 0.9 + nightFactor * 1.8;

    // Rain makes asphalt sleek & reflective
    const roadRough = 0.78 - wetness * 0.56;
    const roadMetal = 0.06 + wetness * 0.28;
    this.roadStraightMat.roughness = roadRough;
    this.roadStraightMat.metalness = roadMetal;
    this.roadIntersectionMat.roughness = roadRough;
    this.roadIntersectionMat.metalness = roadMetal;
  }

  public updateChunksAround(worldX: number, worldZ: number): void {
    const centerCx = Math.floor(worldX / BLOCK_SIZE);
    const centerCz = Math.floor(worldZ / BLOCK_SIZE);
    const key = `${centerCx},${centerCz}`;
    if (key === this.lastCenterKey) return;
    this.lastCenterKey = key;

    // Reset all instance counters
    const b = this.buckets;
    b.intersections.count = 0;
    b.roadsNS.count = 0;
    b.roadsEW.count = 0;
    b.sidewalks.count = 0;
    b.groundPads.count = 0;
    b.facades.metropolis.count = 0;
    b.facades.riviera.count = 0;
    b.facades.canyon.count = 0;
    b.facades.alpine.count = 0;
    b.facades.sakura.count = 0;
    b.facades.medieval.count = 0;
    b.facades.cyberpunk.count = 0;
    b.boxes.count = 0;
    b.cylinders.count = 0;
    b.cones.count = 0;
    b.spheres.count = 0;
    b.pyramids.count = 0;
    b.domes.count = 0;
    b.toruses.count = 0;
    b.emissives.count = 0;
    b.water.count = 0;

    for (let dx = -ACTIVE_CHUNK_RADIUS; dx <= ACTIVE_CHUNK_RADIUS; dx++) {
      for (let dz = -ACTIVE_CHUNK_RADIUS; dz <= ACTIVE_CHUNK_RADIUS; dz++) {
        this.emitChunk(centerCx + dx, centerCz + dz);
      }
    }

    finalizeBucket(b.intersections);
    finalizeBucket(b.roadsNS);
    finalizeBucket(b.roadsEW);
    finalizeBucket(b.sidewalks);
    finalizeBucket(b.groundPads);
    finalizeBucket(b.facades.metropolis);
    finalizeBucket(b.facades.riviera);
    finalizeBucket(b.facades.canyon);
    finalizeBucket(b.facades.alpine);
    finalizeBucket(b.facades.sakura);
    finalizeBucket(b.facades.medieval);
    finalizeBucket(b.facades.cyberpunk);
    finalizeBucket(b.boxes);
    finalizeBucket(b.cylinders);
    finalizeBucket(b.cones);
    finalizeBucket(b.spheres);
    finalizeBucket(b.pyramids);
    finalizeBucket(b.domes);
    finalizeBucket(b.toruses);
    finalizeBucket(b.emissives);
    finalizeBucket(b.water);
  }

  private emitChunk(cx: number, cz: number): void {
    const b = this.buckets;
    const ox = cx * BLOCK_SIZE;
    const oz = cz * BLOCK_SIZE;
    const biome = getBiomeAtChunk(cx, cz);
    const def = BIOMES[biome];
    const seed = Math.floor(hash2D(cx, cz, 5511) * 1_000_000_000);
    const rng = createRng(seed);

    // 1. Roads & Intersections
    pushInstance(b.intersections, ox, 0.012, oz, 1, 1, 1);
    pushInstance(b.roadsNS, ox, 0.0, oz + HALF_BLOCK, 1, 1, 1);
    pushInstance(b.roadsEW, ox + HALF_BLOCK, 0.0, oz, 1, 1, 1);

    // 2. Sidewalk & Inner Biome Ground Pad
    pushInstance(b.sidewalks, ox + HALF_BLOCK, 0.11, oz + HALF_BLOCK, 1, 1, 1, 0, 0, 0, def.sidewalkHex);
    pushInstance(b.groundPads, ox + HALF_BLOCK, 0.24, oz + HALF_BLOCK, 1, 1, 1, 0, 0, 0, def.groundHex);

    // 3. Detailed Street Furniture (streetlamps, traffic signal, benches, bollards)
    const curbMin = ROAD_WIDTH * 0.5 + 0.9; // 7.9
    const curbMax = BLOCK_SIZE - ROAD_WIDTH * 0.5 - 0.9; // 64.1
    const lampGlowByBiome: Record<BiomeId, number> = {
      metropolis: 0xffdc91,
      riviera: 0xffe4a3,
      canyon: 0xffb35c,
      alpine: 0xffe0a8,
      sakura: 0xff9b4a,
      mushroom: 0xe879f9,
      medieval: 0xff8c2b,
      rome: 0xffbf52,
      egypt: 0xfacc15,
      candy: 0xf472b6,
      dino: 0xff5722,
      cyberpunk: 0x22d3ee,
      moon: 0xbae6fd,
    };
    const lampGlowHex = lampGlowByBiome[biome];

    const lamps: Array<[number, number, number]> = [
      [curbMin, 22, -Math.PI * 0.5],
      [curbMin, 50, -Math.PI * 0.5],
      [22, curbMin, 0],
      [50, curbMin, 0],
      [curbMax, 36, Math.PI * 0.5],
      [36, curbMax, Math.PI],
    ];
    for (const [lx, lz, rotY] of lamps) {
      pushInstance(b.cylinders, ox + lx, 3.25, oz + lz, 0.2, 6.2, 0.2, 0, 0, 0, 0x262d38);
      pushInstance(
        b.boxes,
        ox + lx - Math.sin(rotY) * 0.65,
        6.25,
        oz + lz - Math.cos(rotY) * 0.65,
        1.4,
        0.1,
        0.1,
        0,
        rotY + Math.PI * 0.5,
        0,
        0x262d38,
      );
      pushInstance(
        b.emissives,
        ox + lx - Math.sin(rotY) * 1.15,
        6.15,
        oz + lz - Math.cos(rotY) * 1.15,
        0.62,
        0.14,
        0.3,
        0,
        rotY + Math.PI * 0.5,
        0,
        lampGlowHex,
      );
    }

    // Corner traffic signal
    pushInstance(b.cylinders, ox + curbMin + 0.3, 3.25, oz + curbMin + 0.3, 0.22, 6.2, 0.22, 0, 0, 0, 0x242a34);
    pushInstance(b.boxes, ox + curbMin + 0.3, 5.2, oz + curbMin + 0.3, 0.36, 0.95, 0.34, 0, 0, 0, 0x1a202c);
    const isGreen = rng() > 0.45;
    pushInstance(
      b.emissives,
      ox + curbMin + 0.3,
      isGreen ? 4.92 : 5.44,
      oz + curbMin + 0.3,
      0.4,
      0.22,
      0.38,
      0,
      0,
      0,
      isGreen ? 0x22c55e : 0xef4444,
    );

    // Sidewalk bench + bollards
    pushInstance(b.boxes, ox + curbMin + 1.4, 0.64, oz + 36, 0.52, 0.14, 1.8, 0, 0, 0, 0x744c2d);
    for (const bz of [13.5, 16, 56, 58.5]) {
      pushInstance(b.cylinders, ox + curbMin, 0.56, oz + bz, 0.17, 0.72, 0.17, 0, 0, 0, 0x94a3b8);
    }

    // 4. Biome-specific rich architecture & nature (13 biomes!)
    switch (biome) {
      case 'metropolis':
        this.emitMetropolis(ox, oz, rng);
        break;
      case 'riviera':
        this.emitRiviera(ox, oz, rng);
        break;
      case 'canyon':
        this.emitCanyon(ox, oz, rng);
        break;
      case 'alpine':
        this.emitAlpine(ox, oz, rng);
        break;
      case 'sakura':
        this.emitSakura(ox, oz, rng);
        break;
      case 'mushroom':
        this.emitMushroom(ox, oz, rng);
        break;
      case 'medieval':
        this.emitMedieval(ox, oz, rng);
        break;
      case 'rome':
        this.emitRome(ox, oz, rng);
        break;
      case 'egypt':
        this.emitEgypt(ox, oz, rng);
        break;
      case 'candy':
        this.emitCandy(ox, oz, rng);
        break;
      case 'dino':
        this.emitDino(ox, oz, rng);
        break;
      case 'cyberpunk':
        this.emitCyberpunk(ox, oz, rng);
        break;
      case 'moon':
        this.emitMoon(ox, oz, rng);
        break;
    }
  }

  private emitTree(
    x: number,
    z: number,
    style: 'urban' | 'palm' | 'pine' | 'cactus' | 'sakura',
    scale: number,
    rng: () => number,
  ): void {
    const b = this.buckets;
    const baseY = 0.24;

    if (style === 'urban') {
      pushInstance(b.boxes, x, baseY + 0.26, z, 1.5, 0.52, 1.5, 0, 0, 0, 0x475569);
      pushInstance(b.cylinders, x, baseY + 1.5 * scale, z, 0.36 * scale, 2.6 * scale, 0.36 * scale, 0, 0, 0, 0x6b442a);
      const green = rng() > 0.5 ? 0x3b7142 : 0x487d4a;
      pushInstance(b.spheres, x, baseY + 3.4 * scale, z, 2.5 * scale, 2.2 * scale, 2.5 * scale, 0, 0, 0, green);
      pushInstance(
        b.spheres,
        x + 0.6 * scale,
        baseY + 4.1 * scale,
        z - 0.35 * scale,
        1.7 * scale,
        1.6 * scale,
        1.7 * scale,
        0,
        0,
        0,
        0x528b52,
      );
    } else if (style === 'palm') {
      const leanX = (rng() - 0.5) * 0.24;
      const leanZ = (rng() - 0.5) * 0.24;
      const h = 7.4 * scale;
      pushInstance(
        b.cylinders,
        x + leanX * 2.2,
        baseY + h * 0.5,
        z + leanZ * 2.2,
        0.44 * scale,
        h,
        0.44 * scale,
        leanZ,
        0,
        -leanX,
        0x7a5738,
      );
      const topX = x + leanX * 4.4;
      const topY = baseY + h - 0.2;
      const topZ = z + leanZ * 4.4;
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + rng() * 0.25;
        const droop = i % 2 === 0 ? 0.34 : 0.16;
        const yOff = i % 2 === 0 ? -0.18 : 0.28;
        pushInstance(
          b.boxes,
          topX + Math.sin(ang) * 1.65 * scale,
          topY + yOff * scale,
          topZ + Math.cos(ang) * 1.65 * scale,
          0.62 * scale,
          0.12 * scale,
          3.4 * scale,
          droop,
          ang,
          0,
          i % 2 === 0 ? 0x3d7a37 : 0x559643,
        );
      }
    } else if (style === 'pine') {
      pushInstance(b.cylinders, x, baseY + 1.1 * scale, z, 0.45 * scale, 2.2 * scale, 0.45 * scale, 0, 0, 0, 0x5d3d27);
      const tone = rng() > 0.5 ? 0x244c34 : 0x2d5c40;
      for (let tier = 0; tier < 3; tier++) {
        const w = (3.7 - tier * 0.85) * scale;
        const ch = (3.4 - tier * 0.4) * scale;
        pushInstance(b.cones, x, baseY + (2.8 + tier * 2.0) * scale, z, w, ch, w, 0, 0, 0, tone);
      }
    } else if (style === 'cactus') {
      const h = (3.4 + rng() * 1.8) * scale;
      const green = rng() > 0.5 ? 0x4b7745 : 0x598650;
      pushInstance(b.cylinders, x, baseY + h * 0.5, z, 0.56 * scale, h, 0.56 * scale, 0, 0, 0, green);
      pushInstance(b.cylinders, x + 0.65 * scale, baseY + h * 0.62, z, 0.38 * scale, h * 0.42, 0.38 * scale, 0, 0, 0, green);
      pushInstance(b.boxes, x + 0.35 * scale, baseY + h * 0.45, z, 0.72 * scale, 0.34 * scale, 0.34 * scale, 0, 0, 0, green);
      pushInstance(b.cylinders, x - 0.62 * scale, baseY + h * 0.72, z, 0.36 * scale, h * 0.36, 0.36 * scale, 0, 0, 0, green);
      pushInstance(b.boxes, x - 0.32 * scale, baseY + h * 0.58, z, 0.68 * scale, 0.32 * scale, 0.32 * scale, 0, 0, 0, green);
    } else {
      pushInstance(b.cylinders, x, baseY + 1.6 * scale, z, 0.46 * scale, 3.2 * scale, 0.46 * scale, 0, 0, 0, 0x4d3428);
      const puffs: Array<[number, number, number, number, number]> = [
        [0, 3.8, 0, 3.1, 0xf4a4c0],
        [1.1, 3.4, 0.7, 2.25, 0xfbd0df],
        [-1.0, 3.5, -0.6, 2.35, 0xf29ab8],
        [0.2, 4.5, -0.4, 2.05, 0xfce0ea],
      ];
      for (const [px, py, pz, rad, hex] of puffs) {
        pushInstance(
          b.spheres,
          x + px * scale,
          baseY + py * scale,
          z + pz * scale,
          rad * scale,
          rad * 0.76 * scale,
          rad * scale,
          0,
          0,
          0,
          hex,
        );
      }
    }
  }

  private emitMetropolis(ox: number, oz: number, rng: () => number): void {
    const b = this.buckets;
    const slots: Array<[number, number]> = [
      [23, 23],
      [49, 23],
      [23, 49],
      [49, 49],
    ];
    const tints = [0xffffff, 0xdbeafe, 0xe2e8f0, 0xf1f5f9];

    for (const [sx, sz] of slots) {
      const w = 15 + rng() * 6;
      const d = 15 + rng() * 6;
      const h = 20 + rng() * 36;
      const wx = ox + sx;
      const wz = oz + sz;

      // Ground-floor podium + glowing retail accent band
      pushInstance(b.boxes, wx, 0.24 + 2.1, wz, w + 1.2, 4.2, d + 1.2, 0, 0, 0, 0x333c4b);
      pushInstance(
        b.emissives,
        wx,
        4.15,
        wz,
        w + 1.38,
        0.34,
        d + 1.38,
        0,
        0,
        0,
        rng() > 0.5 ? 0xf59e0b : 0x38bdf8,
      );

      // Glass skyscraper tower shaft + architectural horizontal cornice band
      const tint = tints[Math.floor(rng() * tints.length)];
      pushInstance(b.facades.metropolis, wx, 4.24 + h * 0.5, wz, w, h, d, 0, 0, 0, tint);
      pushInstance(b.boxes, wx, 4.24 + h * 0.55, wz, w + 0.55, 0.45, d + 0.55, 0, 0, 0, 0x3f4a5c);
      pushInstance(b.boxes, wx, 4.24 + h, wz, w + 0.7, 0.65, d + 0.7, 0, 0, 0, 0x2a3140);

      // Stepped crown + HVAC penthouse + spire
      const crownH = 3.2 + rng() * 5.2;
      pushInstance(b.boxes, wx, 4.24 + h + crownH * 0.5, wz, w * 0.72, crownH, d * 0.72, 0, 0, 0, 0x2a3140);
      if (h > 30) {
        pushInstance(b.cylinders, wx, 4.24 + h + crownH + 4.8, wz, 0.25, 9.6, 0.25, 0, 0, 0, 0x94a3b8);
        pushInstance(b.emissives, wx, 4.24 + h + crownH + 9.6, wz, 0.45, 0.45, 0.45, 0, 0, 0, 0xef4444);
      }
    }

    this.emitTree(ox + 10.6, oz + 36, 'urban', 0.95, rng);
    this.emitTree(ox + 36, oz + 10.6, 'urban', 0.92, rng);
  }

  private emitRiviera(ox: number, oz: number, rng: () => number): void {
    const b = this.buckets;
    // Turquoise resort pool / coastal cove
    pushInstance(b.boxes, ox + 36, 0.36, oz + 36, 17, 0.34, 13, 0, 0, 0, 0xf1ede4);
    pushInstance(b.water, ox + 36, 0.56, oz + 36, 15.2, 1, 11.2);

    const villas: Array<[number, number, number, number, number]> = [
      [21, 20, 14, 10, 8.5 + rng() * 4.5],
      [51, 21, 13, 12, 7.5 + rng() * 5],
      [50, 51, 15, 11, 9 + rng() * 4.5],
    ];
    const villaTints = [0xffffff, 0xfff0db, 0xfce7d6];

    for (let i = 0; i < villas.length; i++) {
      const [vx, vz, vw, vd, vh] = villas[i];
      pushInstance(b.facades.riviera, ox + vx, 0.24 + vh * 0.5, oz + vz, vw, vh, vd, 0, 0, 0, villaTints[i]);
      const roofW = Math.max(vw, vd) * 1.48;
      pushInstance(b.cones, ox + vx, 0.24 + vh + 1.8, oz + vz, roofW, 3.6, roofW, 0, Math.PI * 0.25, 0, 0xc2593a);
      pushInstance(b.boxes, ox + vx, 0.24 + vh * 0.55, oz + vz, vw + 0.8, 0.34, vd + 0.8, 0, 0, 0, 0xf5f0e6);
    }

    // Coastal beach parasols
    for (let i = 0; i < 3; i++) {
      const ux = ox + 21 + i * 5;
      const uz = oz + 49 + (i % 2) * 3;
      pushInstance(b.cylinders, ux, 1.45, uz, 0.1, 2.5, 0.1, 0, 0, 0, 0xe2e8f0);
      pushInstance(b.cones, ux, 2.85, uz, 3.2, 0.85, 3.2, 0, 0, 0, i % 2 === 0 ? 0x0ea5e9 : 0xf97316);
    }

    // Palms lining the sunlit boulevard
    for (const [px, pz] of [
      [11, 16],
      [11, 34],
      [11, 54],
      [28, 11],
      [48, 11],
      [22, 54],
    ]) {
      this.emitTree(ox + px, oz + pz, 'palm', 0.88 + rng() * 0.26, rng);
    }
  }

  private emitCanyon(ox: number, oz: number, rng: () => number): void {
    const b = this.buckets;
    // Layered red-rock sandstone mesa
    const tiers = [
      { w: 24, d: 22, h: 7.5, hex: 0xa64e2e },
      { w: 18, d: 16, h: 7.5, hex: 0xc67847 },
      { w: 12, d: 11, h: 6.5, hex: 0x9c4627 },
    ];
    let curY = 0.24;
    for (const t of tiers) {
      pushInstance(
        b.boxes,
        ox + 46 + (rng() - 0.5) * 1.4,
        curY + t.h * 0.5,
        oz + 44 + (rng() - 0.5) * 1.4,
        t.w,
        t.h,
        t.d,
        0,
        (rng() - 0.5) * 0.24,
        0,
        t.hex,
      );
      curY += t.h;
    }

    // Retro desert highway motel & neon pylon sign
    pushInstance(b.facades.canyon, ox + 22, 0.24 + 3.2, oz + 22, 16, 6.4, 11, 0, 0, 0, 0xffffff);
    pushInstance(b.boxes, ox + 22, 0.24 + 6.55, oz + 21, 17.2, 0.55, 13.5, 0, 0, 0, 0xc67847);
    pushInstance(b.emissives, ox + 22, 0.24 + 6.55, oz + 21, 17.4, 0.24, 13.7, 0, 0, 0, 0x22d3ee);

    pushInstance(b.cylinders, ox + 12.5, 6.0, oz + 14, 0.34, 11.5, 0.34, 0, 0, 0, 0x94a3b8);
    pushInstance(b.emissives, ox + 12.5, 10.6, oz + 14, 3.8, 1.8, 0.45, 0, 0, 0, 0xf59e0b);

    for (const [cx, cz] of [
      [15, 44],
      [25, 53],
      [48, 17],
      [56, 25],
      [33, 35],
    ]) {
      this.emitTree(ox + cx, oz + cz, 'cactus', 0.85 + rng() * 0.32, rng);
    }

    for (let i = 0; i < 4; i++) {
      const s = 1.6 + rng() * 2.2;
      pushInstance(
        b.spheres,
        ox + 15 + rng() * 38,
        0.24 + s * 0.28,
        oz + 36 + rng() * 20,
        s * 1.4,
        s * 0.72,
        s * 1.1,
        0,
        rng() * Math.PI,
        0,
        0xa64e2e,
      );
    }
  }

  private emitAlpine(ox: number, oz: number, rng: () => number): void {
    const b = this.buckets;
    // Multi-layered snow-capped alpine mountain crag (3 overlapping jagged peaks)
    const peaks: Array<[number, number, number, number]> = [
      [47, 46, 22, 26],
      [39, 51, 15, 18],
      [53, 39, 14, 17],
    ];
    for (const [px, pz, pw, ph] of peaks) {
      pushInstance(b.cones, ox + px, 0.24 + ph * 0.5, oz + pz, pw, ph, pw, 0, rng() * 1.2, 0, 0x55606b);
      pushInstance(b.cones, ox + px, 0.24 + ph * 0.76, oz + pz, pw * 0.52, ph * 0.52, pw * 0.52, 0, rng() * 1.2, 0, 0xf1f5f9);
    }

    // 2 Warm Timber Alpine Chalets
    for (const [hx, hz, rotY] of [
      [22, 22, 0],
      [23, 49, Math.PI * 0.5],
    ]) {
      pushInstance(b.facades.alpine, ox + hx, 0.24 + 3.6, oz + hz, 12, 7.2, 10, 0, rotY, 0, 0xffffff);
      pushInstance(b.cones, ox + hx, 0.24 + 9.7, oz + hz, 16.8, 5.2, 14.5, 0, rotY + Math.PI * 0.25, 0, 0xe8eff5);
      pushInstance(b.boxes, ox + hx + 2.8, 0.24 + 10.2, oz + hz - 1.6, 1.4, 4.5, 1.4, 0, rotY, 0, 0x5c6670);
    }

    for (const [px, pz] of [
      [12, 35],
      [35, 14],
      [48, 16],
      [56, 24],
      [36, 33],
      [14, 57],
      [36, 56],
      [56, 57],
    ]) {
      this.emitTree(ox + px, oz + pz, 'pine', 0.9 + rng() * 0.42, rng);
    }
  }

  private emitSakura(ox: number, oz: number, rng: () => number): void {
    const b = this.buckets;
    // Multi-tiered Kyoto pagoda
    let py = 0.24;
    for (let tier = 0; tier < 3; tier++) {
      const w = 13 - tier * 2.8;
      const h = 5.4 - tier * 0.5;
      pushInstance(b.facades.sakura, ox + 47, py + h * 0.5, oz + 45, w, h, w, 0, 0, 0, 0xffffff);
      const ew = (w + 4.2) * 1.38;
      pushInstance(b.cones, ox + 47, py + h + 0.9, oz + 45, ew, 2.2, ew, 0, Math.PI * 0.25, 0, 0x222933);
      py += h + 1.2;
    }
    pushInstance(b.emissives, ox + 47, py + 1.8, oz + 45, 0.3, 3.6, 0.3, 0, 0, 0, 0xf59e0b);

    // Traditional machiya townhouse
    pushInstance(b.facades.sakura, ox + 22, 0.24 + 3.8, oz + 22, 15, 7.6, 11, 0, 0, 0, 0xffffff);
    pushInstance(b.cones, ox + 22, 0.24 + 9.1, oz + 22, 21, 3.2, 16, 0, Math.PI * 0.25, 0, 0x222933);

    // Iconic Vermilion Torii Gate
    const tx = ox + 24;
    const tz = oz + 48;
    pushInstance(b.cylinders, tx - 2.6, 0.24 + 3.25, tz, 0.55, 6.5, 0.55, 0, 0, 0, 0xc83228);
    pushInstance(b.cylinders, tx + 2.6, 0.24 + 3.25, tz, 0.55, 6.5, 0.55, 0, 0, 0, 0xc83228);
    pushInstance(b.boxes, tx, 0.24 + 6.45, tz, 7.4, 0.55, 0.85, 0, 0, 0, 0xc83228);
    pushInstance(b.boxes, tx, 0.24 + 5.3, tz, 6.0, 0.36, 0.55, 0, 0, 0, 0xc83228);
    pushInstance(b.boxes, tx, 0.24 + 6.82, tz, 7.8, 0.26, 1.0, 0, 0, 0, 0x222933);

    // Glowing hanging chochin lanterns along the sidewalk avenue
    for (const lz of [16, 28, 44, 56]) {
      pushInstance(b.emissives, ox + 9.2, 3.6, oz + lz, 0.55, 0.8, 0.55, 0, 0, 0, 0xff7a3d);
    }

    // Lush cherry blossom trees
    for (const [sx, sz] of [
      [13, 36],
      [36, 13],
      [48, 20],
      [15, 54],
      [34, 38],
      [56, 26],
      [13, 20],
    ]) {
      this.emitTree(ox + sx, oz + sz, 'sakura', 0.96 + rng() * 0.34, rng);
    }
  }

  /** Biome 6: Лес гигантских грибов (Giant Spotted Fly Agarics & Bioluminescent Spores) */
  private emitMushroom(ox: number, oz: number, rng: () => number): void {
    const b = this.buckets;
    const baseY = 0.24;

    const mushrooms: Array<{
      x: number;
      z: number;
      stemH: number;
      stemR: number;
      capW: number;
      capH: number;
      style: 'agaric' | 'violet' | 'cyan';
    }> = [
      { x: 24, z: 24, stemH: 15 + rng() * 7, stemR: 2.8, capW: 15.5, capH: 9.2, style: 'agaric' },
      { x: 49, z: 46, stemH: 18 + rng() * 8, stemR: 3.2, capW: 17.5, capH: 10.4, style: 'agaric' },
      { x: 48, z: 22, stemH: 11 + rng() * 5, stemR: 2.1, capW: 11.5, capH: 7.4, style: 'violet' },
      { x: 22, z: 49, stemH: 12 + rng() * 5, stemR: 2.2, capW: 12.2, capH: 7.8, style: 'cyan' },
      { x: 36, z: 35, stemH: 8 + rng() * 4, stemR: 1.5, capW: 8.6, capH: 5.5, style: 'agaric' },
      { x: 14, z: 35, stemH: 6.5 + rng() * 3, stemR: 1.2, capW: 6.4, capH: 4.2, style: 'violet' },
      { x: 56, z: 34, stemH: 7 + rng() * 3.5, stemR: 1.3, capW: 7.0, capH: 4.5, style: 'cyan' },
    ];

    for (const m of mushrooms) {
      const mx = ox + m.x;
      const mz = oz + m.z;
      const leanX = (rng() - 0.5) * 0.14;
      const leanZ = (rng() - 0.5) * 0.14;

      const capHex =
        m.style === 'agaric' ? 0xd92626 : m.style === 'violet' ? 0x8b2cf5 : 0x0d9488;
      const glowHex =
        m.style === 'agaric' ? 0xfef3c7 : m.style === 'violet' ? 0xf472b6 : 0x2dd4bf;

      // Bulbous root base + curved pale stem + ruffled annulus skirt
      pushInstance(b.spheres, mx, baseY + m.stemR * 0.4, mz, m.stemR * 1.55, m.stemR * 0.9, m.stemR * 1.55, 0, 0, 0, 0xede2cf);
      pushInstance(
        b.cylinders,
        mx + leanX * m.stemH * 0.4,
        baseY + m.stemH * 0.5,
        mz + leanZ * m.stemH * 0.4,
        m.stemR,
        m.stemH,
        m.stemR,
        leanZ,
        0,
        -leanX,
        0xf5ebd6,
      );
      const topX = mx + leanX * m.stemH * 0.8;
      const topZ = mz + leanZ * m.stemH * 0.8;
      const topY = baseY + m.stemH - 0.4;

      // Underside glowing gill disc
      pushInstance(b.cylinders, topX, topY - 0.2, topZ, m.capW * 0.88, 0.55, m.capW * 0.88, 0, 0, 0, 0xfff8e7);
      pushInstance(b.emissives, topX, topY - 0.45, topZ, m.capW * 0.42, 0.25, m.capW * 0.42, 0, 0, 0, glowHex);

      // Massive domed mushroom cap
      pushInstance(b.domes, topX, topY, topZ, m.capW, m.capH, m.capW, leanZ * 0.5, 0, -leanX * 0.5, capHex);

      // Iconic white fly-agaric polka-dot spots proud on the domed cap surface!
      const spotCount = m.capW > 11 ? 9 : 6;
      for (let s = 0; s < spotCount; s++) {
        const ang = (s / spotCount) * Math.PI * 2 + rng() * 0.35;
        const elev = s === 0 ? 0.94 : 0.36 + (s % 2) * 0.28;
        const rHoriz = Math.cos(elev * Math.PI * 0.5) * m.capW * 0.505;
        const yOff = Math.sin(elev * Math.PI * 0.5) * m.capH * 0.505;
        const spotSize = m.capW * (s === 0 ? 0.18 : 0.15);
        pushInstance(
          b.spheres,
          topX + Math.cos(ang) * rHoriz,
          topY + yOff,
          topZ + Math.sin(ang) * rHoriz,
          spotSize,
          spotSize * 0.72,
          spotSize,
          0,
          0,
          0,
          m.style === 'agaric' ? 0xffffff : glowHex,
        );
      }
    }

    // Glowing fairy-ring spore lanterns on mossy ground
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const sx = ox + 36 + Math.cos(ang) * 14;
      const sz = oz + 36 + Math.sin(ang) * 14;
      pushInstance(b.cylinders, sx, baseY + 1.1, sz, 0.35, 2.2, 0.35, 0, 0, 0, 0xddd6fe);
      pushInstance(b.domes, sx, baseY + 2.1, sz, 1.9, 1.4, 1.9, 0, 0, 0, i % 2 === 0 ? 0xec4899 : 0x2dd4bf);
      pushInstance(b.emissives, sx, baseY + 2.0, sz, 0.7, 0.25, 0.7, 0, 0, 0, i % 2 === 0 ? 0xf472b6 : 0x5eead4);
    }
  }

  /** Biome 7: Долина средневековых замков (Stone Fortresses, Corner Turrets, Battlements & Moat) */
  private emitMedieval(ox: number, oz: number, rng: () => number): void {
    const b = this.buckets;
    const baseY = 0.24;
    const cx = ox + 36;
    const cz = oz + 36;

    // Castle moat water border
    pushInstance(b.boxes, cx, baseY + 0.12, cz, 44, 0.24, 44, 0, 0, 0, 0x5a564f);
    pushInstance(b.water, cx, baseY + 0.28, cz, 42, 1, 42);
    // Raised stone fortress courtyard island
    pushInstance(b.boxes, cx, baseY + 0.45, cz, 34, 0.9, 34, 0, 0, 0, 0x706a61);

    // Tall central Medieval Keep (using procedural stone castle masonry facade!)
    const keepH = 19 + rng() * 9;
    pushInstance(b.facades.medieval, cx, baseY + 0.9 + keepH * 0.5, cz, 15, keepH, 15, 0, 0, 0, 0xffffff);
    // Keep roof + tall spire + golden heraldic finial
    const roofHex = rng() > 0.5 ? 0x2c4268 : 0x7f1d1d;
    pushInstance(b.pyramids, cx, baseY + 0.9 + keepH + 4.5, cz, 16.5, 9.0, 16.5, 0, 0, 0, roofHex);
    pushInstance(b.cylinders, cx, baseY + 0.9 + keepH + 10.2, cz, 0.25, 3.2, 0.25, 0, 0, 0, 0xfbbf24);
    pushInstance(b.boxes, cx + 1.1, baseY + 0.9 + keepH + 11.0, cz, 2.2, 0.9, 0.12, 0, 0, 0, 0xdc2626);

    // 4 Corner Bastion Towers with conical spires & waving banners
    const half = 13.5;
    const towerH = 14 + rng() * 5;
    for (const [txOff, tzOff] of [
      [-half, -half],
      [half, -half],
      [-half, half],
      [half, half],
    ]) {
      const tx = cx + txOff;
      const tz = cz + tzOff;
      pushInstance(b.cylinders, tx, baseY + 0.9 + towerH * 0.5, tz, 6.2, towerH, 6.2, 0, 0, 0, 0x7c766d);
      // Machicolation stone collar
      pushInstance(b.cylinders, tx, baseY + 0.9 + towerH + 0.4, tz, 7.0, 1.0, 7.0, 0, 0, 0, 0x625d56);
      // Pointed conical slate roof
      pushInstance(b.cones, tx, baseY + 0.9 + towerH + 4.6, tz, 7.6, 7.8, 7.6, 0, 0, 0, roofHex);
      // Banner pole + crimson pennant
      pushInstance(b.cylinders, tx, baseY + 0.9 + towerH + 9.4, tz, 0.16, 2.6, 0.16, 0, 0, 0, 0xfbbf24);
      pushInstance(b.boxes, tx + 0.9, baseY + 0.9 + towerH + 10.1, tz, 1.8, 0.7, 0.1, 0, 0, 0, 0xdc2626);
    }

    // 4 Curtain Walls + Crenellated Battlements (Merlons)
    const wallH = 8.4;
    pushInstance(b.facades.medieval, cx, baseY + 0.9 + wallH * 0.5, cz - half, 22, wallH, 2.4, 0, 0, 0, 0xe8e2d8);
    pushInstance(b.facades.medieval, cx, baseY + 0.9 + wallH * 0.5, cz + half, 22, wallH, 2.4, 0, 0, 0, 0xe8e2d8);
    pushInstance(b.facades.medieval, cx - half, baseY + 0.9 + wallH * 0.5, cz, 2.4, wallH, 22, 0, 0, 0, 0xe8e2d8);
    pushInstance(b.facades.medieval, cx + half, baseY + 0.9 + wallH * 0.5, cz, 2.4, wallH, 22, 0, 0, 0, 0xe8e2d8);

    // Individual crenellation merlons along N/S & W/E walls
    for (let k = -8; k <= 8; k += 3.2) {
      pushInstance(b.boxes, cx + k, baseY + 0.9 + wallH + 0.65, cz - half, 1.5, 1.3, 2.6, 0, 0, 0, 0x857f75);
      pushInstance(b.boxes, cx + k, baseY + 0.9 + wallH + 0.65, cz + half, 1.5, 1.3, 2.6, 0, 0, 0, 0x857f75);
      pushInstance(b.boxes, cx - half, baseY + 0.9 + wallH + 0.65, cz + k, 2.6, 1.3, 1.5, 0, 0, 0, 0x857f75);
      pushInstance(b.boxes, cx + half, baseY + 0.9 + wallH + 0.65, cz + k, 2.6, 1.3, 1.5, 0, 0, 0, 0x857f75);
    }

    // Wooden drawbridge + flaming entrance torches facing the west avenue
    pushInstance(b.boxes, cx - 19, baseY + 0.5, cz, 7.0, 0.35, 5.2, 0, 0, 0, 0x6b4423);
    pushInstance(b.boxes, cx - half - 0.6, baseY + 0.9 + 3.0, cz, 1.4, 5.8, 4.4, 0, 0, 0, 0x29211b);
    for (const tz of [-3.2, 3.2]) {
      pushInstance(b.cylinders, cx - half - 1.5, baseY + 2.6, cz + tz, 0.25, 3.2, 0.25, 0, 0, 0, 0x3b3733);
      pushInstance(b.emissives, cx - half - 1.5, baseY + 4.4, cz + tz, 0.6, 0.85, 0.6, 0, 0, 0, 0xff7b1c);
    }

    // Medieval valley pines at outer corners
    for (const [px, pz] of [
      [13, 14],
      [59, 14],
      [13, 58],
      [59, 58],
    ]) {
      this.emitTree(ox + px, oz + pz, 'pine', 0.95 + rng() * 0.3, rng);
    }
  }

  /** Biome 8: Римская Империя (Colosseum Ring, Pantheon Marble Temple, Triumphal Arch & Aqueduct) */
  private emitRome(ox: number, oz: number, rng: () => number): void {
    const b = this.buckets;
    const baseY = 0.24;
    const marble = 0xe5dac3;
    const travertine = 0xcbb692;
    const terracotta = 0xb85038;

    // 1. Monumental Roman Colosseum Amphitheater (SE quadrant)
    const colX = ox + 46;
    const colZ = oz + 45;
    const colRad = 12.2;
    const bays = 12;
    // Arena sand floor
    pushInstance(b.cylinders, colX, baseY + 0.3, colZ, colRad * 1.9, 0.6, colRad * 1.9, 0, 0, 0, 0xd4b27a);
    // 2 stacked travertine arch tiers + upper colonnade rings
    for (let tier = 0; tier < 2; tier++) {
      const ty = baseY + 0.6 + tier * 5.2;
      for (let i = 0; i < bays; i++) {
        // Leave classic Roman "ruined" gap on upper tier for iconic Colosseum silhouette!
        if (tier === 1 && i >= 9) continue;
        const ang = (i / bays) * Math.PI * 2;
        const px = colX + Math.cos(ang) * colRad;
        const pz = colZ + Math.sin(ang) * colRad;
        pushInstance(b.boxes, px, ty + 2.2, pz, 1.8, 4.4, 2.2, 0, -ang, 0, travertine);
        // Arch lintel connecting bays
        const midAng = ang + Math.PI / bays;
        const lx = colX + Math.cos(midAng) * colRad;
        const lz = colZ + Math.sin(midAng) * colRad;
        pushInstance(b.boxes, lx, ty + 4.4, lz, 2.2, 1.1, 6.4, 0, -midAng, 0, marble);
      }
    }

    // 2. Classical Marble Temple / Pantheon (NW quadrant)
    const tx = ox + 22;
    const tz = oz + 22;
    // Stepped marble podium
    pushInstance(b.boxes, tx, baseY + 0.8, tz, 16, 1.6, 15, 0, 0, 0, marble);
    pushInstance(b.boxes, tx, baseY + 1.8, tz, 14.4, 0.6, 13.4, 0, 0, 0, travertine);
    // Inner cella sanctuary
    pushInstance(b.boxes, tx, baseY + 2.1 + 4.0, tz + 1.2, 10.5, 8.0, 9.2, 0, 0, 0, travertine);
    // 6 Front Fluted Corinthian Columns
    for (let c = 0; c < 5; c++) {
      const cxPos = tx - 5.2 + c * 2.6;
      pushInstance(b.cylinders, cxPos, baseY + 2.1 + 4.0, tz - 5.2, 0.9, 8.0, 0.9, 0, 0, 0, marble);
      pushInstance(b.boxes, cxPos, baseY + 2.1 + 8.1, tz - 5.2, 1.35, 0.55, 1.35, 0, 0, 0, 0xeab308);
    }
    // Classical Entablature + Pediment + Pantheon Golden Dome
    pushInstance(b.boxes, tx, baseY + 10.6, tz, 14.8, 1.1, 13.8, 0, 0, 0, marble);
    pushInstance(b.pyramids, tx, baseY + 12.6, tz, 15.2, 3.0, 14.2, 0, 0, 0, terracotta);
    pushInstance(b.domes, tx, baseY + 11.1, tz + 1.0, 10.2, 7.6, 10.2, 0, 0, 0, 0xd4a44a);

    // 3. Roman Triumphal Arch facing the West Avenue (SW quadrant)
    const ax = ox + 21;
    const az = oz + 49;
    pushInstance(b.boxes, ax, baseY + 4.2, az - 3.6, 3.2, 8.4, 3.2, 0, 0, 0, marble);
    pushInstance(b.boxes, ax, baseY + 4.2, az + 3.6, 3.2, 8.4, 3.2, 0, 0, 0, marble);
    pushInstance(b.boxes, ax, baseY + 9.4, az, 3.6, 2.6, 11.0, 0, 0, 0, marble);
    pushInstance(b.boxes, ax, baseY + 11.1, az, 2.2, 1.2, 5.4, 0, 0, 0, 0xd4a44a); // Golden quadriga crest

    // 4. Roman Aqueduct Arcade along North edge (NE quadrant)
    for (let i = 0; i < 4; i++) {
      const qx = ox + 36 + i * 6.0;
      const qz = oz + 16;
      pushInstance(b.boxes, qx, baseY + 4.5, qz, 1.8, 9.0, 2.2, 0, 0, 0, travertine);
    }
    pushInstance(b.boxes, ox + 45, baseY + 9.6, oz + 16, 22, 1.8, 2.5, 0, 0, 0, marble);

    // Tall dark Italian Cypress trees + glowing bronze fire braziers
    for (const [cxp, czp] of [
      [12, 16],
      [12, 36],
      [12, 56],
      [34, 24],
      [58, 22],
      [32, 54],
    ]) {
      const h = 7.5 + rng() * 3.5;
      pushInstance(b.cylinders, ox + cxp, baseY + 0.9, oz + czp, 0.4, 1.8, 0.4, 0, 0, 0, 0x5c4028);
      pushInstance(b.cones, ox + cxp, baseY + 1.4 + h * 0.5, oz + czp, 2.1, h, 2.1, 0, 0, 0, 0x264d2c);
    }
    pushInstance(b.emissives, ax - 2.2, baseY + 2.4, az - 3.6, 0.7, 0.8, 0.7, 0, 0, 0, 0xff8c24);
    pushInstance(b.emissives, ax - 2.2, baseY + 2.4, az + 3.6, 0.7, 0.8, 0.7, 0, 0, 0, 0xff8c24);
  }

  /** Biome 9: Египетские Пирамиды (Great Giza Pyramids, Golden Capstones, Sphinx, Obelisks & Oasis) */
  private emitEgypt(ox: number, oz: number, rng: () => number): void {
    const b = this.buckets;
    const baseY = 0.24;
    const sandstone = 0xd6a55b;
    const sandstoneDark = 0xb88642;
    const gold = 0xfacc15;

    // 1. Colossal Great Pyramid of Giza (SE quadrant) with golden pyramidion capstone!
    const px = ox + 44;
    const pz = oz + 44;
    const pW = 28 + rng() * 3;
    const pH = 24 + rng() * 4;
    pushInstance(b.pyramids, px, baseY + pH * 0.5, pz, pW, pH, pW, 0, 0, 0, sandstone);
    // Gleaming golden capstone at the apex
    pushInstance(b.pyramids, px, baseY + pH * 0.91, pz, pW * 0.19, pH * 0.19, pW * 0.19, 0, 0, 0, gold);
    pushInstance(b.emissives, px, baseY + pH + 0.25, pz, 0.9, 0.9, 0.9, 0, 0, 0, 0xffe066);

    // 2. Companion Queen's Pyramid (NE quadrant)
    const qx = ox + 49;
    const qz = oz + 20;
    pushInstance(b.pyramids, qx, baseY + 7.5, qz, 15.5, 15.0, 15.5, 0, 0, 0, sandstoneDark);
    pushInstance(b.pyramids, qx, baseY + 13.7, qz, 3.0, 3.0, 3.0, 0, 0, 0, gold);

    // 3. Sculpted Great Sphinx facing the West Avenue (NW quadrant)
    const sx = ox + 22;
    const sz = oz + 23;
    // Outstretched front lion paws
    pushInstance(b.boxes, sx - 5.2, baseY + 0.9, sz - 2.1, 6.2, 1.8, 1.9, 0, 0, 0, sandstone);
    pushInstance(b.boxes, sx - 5.2, baseY + 0.9, sz + 2.1, 6.2, 1.8, 1.9, 0, 0, 0, sandstone);
    // Recumbent lion torso & haunches
    pushInstance(b.boxes, sx + 1.4, baseY + 2.4, sz, 10.5, 4.8, 5.4, 0, 0, 0, sandstone);
    pushInstance(b.boxes, sx - 1.8, baseY + 4.4, sz, 4.6, 5.2, 4.4, 0, 0, 0, sandstone);
    // Royal Nemes striped headdress (lapis blue + gold) & proud Pharaoh head
    pushInstance(b.boxes, sx - 2.2, baseY + 7.6, sz, 3.6, 4.0, 5.4, 0, 0, 0, 0x1d4ed8);
    pushInstance(b.boxes, sx - 2.4, baseY + 8.6, sz, 3.8, 0.7, 5.5, 0, 0, 0, gold);
    pushInstance(b.boxes, sx - 3.3, baseY + 7.8, sz, 2.8, 3.2, 2.8, 0, 0, 0, sandstone);
    pushInstance(b.boxes, sx - 4.7, baseY + 6.4, sz, 0.7, 1.4, 0.7, 0, 0, 0, gold); // Pharaoh ceremonial beard

    // 4. Twin Hieroglyphic Obelisks flanking the oasis plaza (SW quadrant)
    for (const [obX, obZ] of [
      [15, 42],
      [15, 55],
    ]) {
      pushInstance(b.boxes, ox + obX, baseY + 0.8, oz + obZ, 3.2, 1.6, 3.2, 0, 0, 0, sandstoneDark);
      pushInstance(b.boxes, ox + obX, baseY + 1.6 + 6.5, oz + obZ, 1.8, 13.0, 1.8, 0, 0, 0, 0xc2956e);
      pushInstance(b.pyramids, ox + obX, baseY + 1.6 + 13.0 + 1.2, oz + obZ, 1.9, 2.4, 1.9, 0, 0, 0, gold);
      pushInstance(b.emissives, ox + obX, baseY + 16.4, oz + obZ, 0.5, 0.5, 0.5, 0, 0, 0, 0xfef08a);
    }

    // 5. Desert Oasis Pool + Date Palms
    pushInstance(b.boxes, ox + 25, baseY + 0.16, oz + 48, 12, 0.32, 10, 0, 0, 0, 0xb88642);
    pushInstance(b.water, ox + 25, baseY + 0.36, oz + 48, 10.6, 1, 8.6);
    for (const [palmX, palmZ] of [
      [19, 44],
      [29, 55],
      [32, 34],
      [13, 32],
    ]) {
      this.emitTree(ox + palmX, oz + palmZ, 'palm', 0.9 + rng() * 0.28, rng);
    }
  }

  /** Biome 10: Сладкое Королевство (Giant Lollipops, Stacked Donut Tower, Candy Canes & Gingerbread House) */
  private emitCandy(ox: number, oz: number, rng: () => number): void {
    const b = this.buckets;
    const baseY = 0.24;

    // 1. Colossal Stacked Frosted Donut Monument (SE quadrant)
    const dx = ox + 47;
    const dz = oz + 46;
    const frostings = [0xf472b6, 0x38bdf8, 0xfacc15, 0xa855f7];
    for (let i = 0; i < 4; i++) {
      const r = 14 - i * 2.1;
      const y = baseY + 1.8 + i * 3.4;
      pushInstance(b.toruses, dx, y, dz, r, r * 0.85, r, 0, i * 0.7, 0, 0xe6a15c);
      pushInstance(b.toruses, dx, y + 0.65, dz, r * 0.98, r * 0.6, r * 0.98, 0, i * 0.7, 0, frostings[i]);
    }
    // Giant glowing cherry on top!
    pushInstance(b.spheres, dx, baseY + 16.4, dz, 3.6, 3.4, 3.6, 0, 0, 0, 0xef4444);

    // 2. Gingerbread & Whipped-Cream Frosting House (NW quadrant)
    const hx = ox + 22;
    const hz = oz + 22;
    pushInstance(b.boxes, hx, baseY + 4.0, hz, 14, 8.0, 12, 0, 0, 0, 0xc27c40);
    // White piped icing corner trim
    pushInstance(b.boxes, hx, baseY + 8.2, hz, 15.2, 0.8, 13.2, 0, 0, 0, 0xffffff);
    pushInstance(b.domes, hx, baseY + 8.5, hz, 15.0, 8.5, 13.0, 0, 0, 0, 0xf472b6);
    pushInstance(b.spheres, hx, baseY + 13.2, hz, 2.4, 2.2, 2.4, 0, 0, 0, 0xef4444);
    // Glowing sugar-gumdrop windows
    pushInstance(b.emissives, hx - 7.1, baseY + 4.4, hz - 2.6, 0.3, 2.2, 2.2, 0, 0, 0, 0xfef08a);
    pushInstance(b.emissives, hx - 7.1, baseY + 4.4, hz + 2.6, 0.3, 2.2, 2.2, 0, 0, 0, 0xfef08a);

    // 3. Giant Swirl Lollipops towering along the streets!
    const lolliColors = [0xf43f5e, 0x22d3ee, 0xa855f7, 0x34d399, 0xfbbf24, 0xfb7185];
    const lolliSpots: Array<[number, number]> = [
      [14, 42],
      [26, 52],
      [48, 18],
      [56, 28],
      [34, 34],
      [13, 14],
    ];
    for (let i = 0; i < lolliSpots.length; i++) {
      const [lx, lz] = lolliSpots[i];
      const h = 9 + rng() * 8;
      const rad = 3.8 + rng() * 2.2;
      const col = lolliColors[i % lolliColors.length];
      pushInstance(b.cylinders, ox + lx, baseY + h * 0.5, oz + lz, 0.55, h, 0.55, 0, 0, 0, 0xffffff);
      // Giant vertical candy disc + concentric white swirl ring!
      const rotY = rng() * Math.PI;
      pushInstance(b.cylinders, ox + lx, baseY + h + rad * 0.35, oz + lz, rad, 1.1, rad, Math.PI * 0.5, rotY, 0, col);
      pushInstance(b.toruses, ox + lx, baseY + h + rad * 0.35, oz + lz, rad * 0.78, rad * 0.78, rad * 0.78, Math.PI * 0.5, rotY, 0, 0xffffff);
    }

    // 4. Striped Red-and-White Giant Candy Canes framing the avenue
    for (const [cxp, czp] of [
      [13, 55],
      [35, 14],
    ]) {
      for (let seg = 0; seg < 6; seg++) {
        pushInstance(
          b.cylinders,
          ox + cxp,
          baseY + 0.8 + seg * 1.4,
          oz + czp,
          1.15,
          1.4,
          1.15,
          0,
          0,
          0,
          seg % 2 === 0 ? 0xef4444 : 0xffffff,
        );
      }
      pushInstance(b.toruses, ox + cxp + 1.6, baseY + 8.8, oz + czp, 3.6, 3.6, 3.6, Math.PI * 0.5, 0, 0, 0xef4444);
    }
  }

  /** Biome 11: Эра Динозавров (Erupting Lava Volcano, Sculpted Giant Brachiosaurus & Prehistoric Ferns) */
  private emitDino(ox: number, oz: number, rng: () => number): void {
    const b = this.buckets;
    const baseY = 0.24;

    // 1. Erupting Volcanic Caldera with glowing molten lava streams (SE quadrant)
    const vx = ox + 47;
    const vz = oz + 46;
    const vH = 24 + rng() * 5;
    pushInstance(b.cones, vx, baseY + vH * 0.5, vz, 27, vH, 27, 0, 0, 0, 0x3b322f);
    // Crater rim + glowing molten lava pool & lava streaks cascading down flanks
    pushInstance(b.toruses, vx, baseY + vH * 0.88, vz, 6.2, 4.2, 6.2, 0, 0, 0, 0x262120);
    pushInstance(b.emissives, vx, baseY + vH * 0.88, vz, 3.6, 1.4, 3.6, 0, 0, 0, 0xff4500);
    for (let s = 0; s < 3; s++) {
      const ang = s * 2.1 + 0.4;
      pushInstance(
        b.emissives,
        vx + Math.cos(ang) * 5.8,
        baseY + vH * 0.48,
        vz + Math.sin(ang) * 5.8,
        1.1,
        vH * 0.72,
        1.1,
        Math.sin(ang) * 0.42,
        0,
        -Math.cos(ang) * 0.42,
        s === 0 ? 0xff6b00 : 0xff3300,
      );
    }
    // Volcanic smoke plume puffs rising above the caldera
    pushInstance(b.spheres, vx, baseY + vH + 2.8, vz, 5.2, 3.8, 5.2, 0, 0, 0, 0x57534e);
    pushInstance(b.spheres, vx + 2.2, baseY + vH + 5.6, vz - 1.5, 6.8, 4.4, 6.8, 0, 0, 0, 0x78716c);

    // 2. Giant Sculpted Brachiosaurus striding beside the highway (NW quadrant)!
    const dx = ox + 22;
    const dz = oz + 24;
    const dinoGreen = rng() > 0.5 ? 0x3f7d3a : 0x2d6a4f;
    const dinoBelly = 0x74a857;
    // 4 thick pillar legs
    for (const [lx, lz] of [
      [-2.2, -3.4],
      [2.2, -3.4],
      [-2.2, 3.2],
      [2.2, 3.2],
    ]) {
      pushInstance(b.cylinders, dx + lx, baseY + 3.4, dz + lz, 1.65, 6.8, 1.65, 0, 0, 0, dinoGreen);
    }
    // Massive torso + dorsal ridge
    pushInstance(b.boxes, dx, baseY + 7.6, dz, 5.8, 4.6, 9.6, 0, 0, 0, dinoGreen);
    pushInstance(b.boxes, dx, baseY + 5.8, dz, 4.8, 1.4, 8.2, 0, 0, 0, dinoBelly);
    // Sweeping connected long tail (2 angled segments)
    pushInstance(b.boxes, dx, baseY + 6.9, dz + 6.6, 2.8, 2.5, 6.2, -0.24, 0, 0, dinoGreen);
    pushInstance(b.boxes, dx, baseY + 5.2, dz + 11.4, 1.7, 1.6, 5.6, -0.34, 0, 0, dinoGreen);
    // Towering long neck reaching 18m skyward + proud head + crest!
    pushInstance(b.cylinders, dx, baseY + 12.8, dz - 5.9, 2.2, 10.6, 2.2, 0.34, 0, 0, dinoGreen);
    pushInstance(b.boxes, dx, baseY + 17.8, dz - 8.4, 2.3, 2.1, 3.9, 0, 0, 0, dinoGreen);
    pushInstance(b.boxes, dx, baseY + 19.0, dz - 7.8, 1.0, 1.0, 1.8, 0, 0, 0, 0xf59e0b); // Dino head crest

    // 3. Spiky Armored Stegosaurus silhouette on SW corner
    const stX = ox + 22;
    const stZ = oz + 50;
    for (const [lx, lz] of [
      [-1.8, -1.2],
      [1.8, -1.2],
      [-1.8, 1.2],
      [1.8, 1.2],
    ]) {
      pushInstance(b.cylinders, stX + lx, baseY + 1.3, stZ + lz, 0.9, 2.6, 0.9, 0, 0, 0, 0x8a5a2b);
    }
    pushInstance(b.boxes, stX, baseY + 3.1, stZ, 6.4, 2.8, 3.2, 0, 0, 0, 0x8a5a2b);
    pushInstance(b.boxes, stX - 4.2, baseY + 2.4, stZ, 2.4, 1.4, 1.4, 0, 0, 0, 0x8a5a2b); // Head
    pushInstance(b.boxes, stX + 4.4, baseY + 2.6, stZ, 3.2, 1.2, 1.2, 0, 0, 0.15, 0x8a5a2b); // Tail
    // Vivid orange diamond dorsal plates along spine!
    for (let p = -2; p <= 2; p++) {
      pushInstance(b.pyramids, stX + p * 1.3, baseY + 5.1, stZ, 1.1, 1.7, 0.45, 0, 0, 0, 0xf97316);
    }

    // Glowing prehistoric amber crystals & jungle palms
    pushInstance(b.emissives, ox + 46, baseY + 2.5, oz + 20, 2.0, 5.0, 2.0, 0.12, 0.4, 0, 0xf59e0b);
    for (const [px, pz] of [
      [13, 38],
      [35, 14],
      [56, 22],
      [33, 38],
    ]) {
      this.emitTree(ox + px, oz + pz, 'palm', 1.05 + rng() * 0.3, rng);
    }
  }

  /** Biome 12: Кибер-Неон 2099 (Obsidian Arcologies, Holographic Neon Billboards & Floating Pyramids) */
  private emitCyberpunk(ox: number, oz: number, rng: () => number): void {
    const b = this.buckets;
    const baseY = 0.24;
    const neonPalette = [0x06b6d4, 0xf43f5e, 0xa855f7, 0x84cc16, 0xec4899];

    const slots: Array<[number, number]> = [
      [23, 23],
      [49, 23],
      [23, 49],
      [49, 49],
    ];

    for (let i = 0; i < slots.length; i++) {
      const [sx, sz] = slots[i];
      const w = 15 + rng() * 5;
      const d = 15 + rng() * 5;
      const h = 24 + rng() * 30;
      const wx = ox + sx;
      const wz = oz + sz;
      const neon1 = neonPalette[(i + Math.floor(rng() * 5)) % neonPalette.length];
      const neon2 = neonPalette[(i + 2) % neonPalette.length];

      // Obsidian mega-tower shaft with cyber neon facade texture
      pushInstance(b.facades.cyberpunk, wx, baseY + h * 0.5, wz, w, h, d, 0, 0, 0, 0xffffff);
      // Glowing vertical neon edge pylons
      pushInstance(b.emissives, wx - w * 0.52, baseY + h * 0.55, wz - d * 0.52, 0.48, h * 0.88, 0.48, 0, 0, 0, neon1);
      pushInstance(b.emissives, wx + w * 0.52, baseY + h * 0.55, wz + d * 0.52, 0.48, h * 0.88, 0.48, 0, 0, 0, neon2);

      // Giant glowing vertical holographic street billboard
      pushInstance(
        b.emissives,
        wx - w * 0.54,
        baseY + Math.min(h * 0.52, 16),
        wz,
        0.38,
        10.5,
        5.8,
        0,
        0,
        0,
        neon1,
      );

      // Rooftop holographic floating inverted pyramid & neon halo ring!
      if (i % 2 === 0) {
        pushInstance(b.pyramids, wx, baseY + h + 5.5, wz, 7.5, 7.5, 7.5, Math.PI, rng() * 1.2, 0, neon2);
        pushInstance(b.toruses, wx, baseY + h + 4.8, wz, 10.5, 6.0, 10.5, 0, 0, 0, neon1);
      } else {
        pushInstance(b.emissives, wx, baseY + h + 6.0, wz, 0.55, 12.0, 0.55, 0, 0, 0, neon1);
      }
    }

    // Elevated glowing sky-bridge linking the front cyber towers
    pushInstance(b.boxes, ox + 36, baseY + 15.5, oz + 23, 18, 2.2, 3.2, 0, 0, 0, 0x1e1b4b);
    pushInstance(b.emissives, ox + 36, baseY + 14.3, oz + 23, 18.2, 0.35, 3.5, 0, 0, 0, 0x22d3ee);
  }

  /** Biome 13: Лунная База (Spaceport Launch Rockets, Geodesic Biodomes & Impact Craters) */
  private emitMoon(ox: number, oz: number, rng: () => number): void {
    const b = this.buckets;
    const baseY = 0.24;

    // 1. Towering Space Rocket on Launchpad (SE quadrant)
    const rx = ox + 47;
    const rz = oz + 45;
    // Octagonal concrete blast pad + glowing launch ring
    pushInstance(b.cylinders, rx, baseY + 0.55, rz, 16, 1.1, 16, 0, 0, 0, 0x475569);
    pushInstance(b.emissives, rx, baseY + 1.25, rz, 5.2, 0.5, 5.2, 0, 0, 0, 0x38bdf8);
    // Rocket ignition thruster glow underneath
    pushInstance(b.emissives, rx, baseY + 2.4, rz, 2.4, 2.2, 2.4, 0, 0, 0, 0xff8c1a);
    // White cylindrical fuselage + red NASA accent band + pointed nosecone
    pushInstance(b.cylinders, rx, baseY + 13.5, rz, 4.4, 19.5, 4.4, 0, 0, 0, 0xf8fafc);
    pushInstance(b.cylinders, rx, baseY + 18.5, rz, 4.55, 2.2, 4.55, 0, 0, 0, 0xef4444);
    pushInstance(b.cylinders, rx, baseY + 7.5, rz, 4.55, 1.6, 4.55, 0, 0, 0, 0x1e293b);
    pushInstance(b.cones, rx, baseY + 26.8, rz, 4.45, 7.2, 4.45, 0, 0, 0, 0xef4444);
    // 4 Swept rocket stabilizer fins
    for (let f = 0; f < 4; f++) {
      const ang = (f / 4) * Math.PI * 2;
      pushInstance(
        b.boxes,
        rx + Math.cos(ang) * 2.9,
        baseY + 5.2,
        rz + Math.sin(ang) * 2.9,
        2.4,
        4.8,
        0.45,
        0,
        -ang,
        0,
        0xdc2626,
      );
    }
    // Red steel umbilical launch gantry tower beside rocket
    pushInstance(b.boxes, rx - 5.6, baseY + 12.0, rz, 2.2, 23.0, 2.2, 0, 0, 0, 0xb91c1c);
    pushInstance(b.boxes, rx - 3.2, baseY + 19.5, rz, 3.6, 0.8, 1.0, 0, 0, 0, 0xe2e8f0);

    // 2. Twin Silver-Blue Geodesic Lunar Biodomes (NW & SW quadrants)
    for (const [bx, bz, rad] of [
      [23, 22, 14.5],
      [23, 49, 11.0],
    ]) {
      pushInstance(b.cylinders, ox + bx, baseY + 1.1, oz + bz, rad * 1.04, 2.2, rad * 1.04, 0, 0, 0, 0xe2e8f0);
      pushInstance(b.domes, ox + bx, baseY + 2.1, oz + bz, rad, rad * 0.92, rad, 0, 0, 0, 0x7dd3fc);
      // Glowing cyan pressurized airlock tunnel
      pushInstance(b.boxes, ox + bx - rad * 0.55, baseY + 1.5, oz + bz, 3.6, 2.6, 3.2, 0, 0, 0, 0xcbd5e1);
      pushInstance(b.emissives, ox + bx - rad * 0.55 - 1.85, baseY + 1.6, oz + bz, 0.25, 1.6, 1.8, 0, 0, 0, 0x22d3ee);
    }
    // Pressurized corridor connecting the two lunar habitats
    pushInstance(b.cylinders, ox + 23, baseY + 1.6, oz + 36, 2.4, 15.0, 2.4, Math.PI * 0.5, 0, 0, 0xe2e8f0);

    // 3. Lunar Impact Craters (regolith rings) + Deep-Space Radar Dish (NE quadrant)
    for (const [cxp, czp, rad] of [
      [48, 20, 11.5],
      [35, 34, 6.2],
      [55, 29, 5.4],
    ]) {
      pushInstance(b.toruses, ox + cxp, baseY + 0.45, oz + czp, rad, rad * 0.55, rad, 0, rng() * Math.PI, 0, 0x8c95a3);
    }
    // Deep-space satellite dish on a mast
    pushInstance(b.cylinders, ox + 48, baseY + 3.8, oz + 20, 0.7, 7.2, 0.7, 0, 0, 0, 0xcbd5e1);
    pushInstance(b.domes, ox + 48, baseY + 8.6, oz + 20, 6.8, 3.2, 6.8, Math.PI + 0.55, 0.5, 0, 0xf8fafc);
    pushInstance(b.emissives, ox + 48, baseY + 9.2, oz + 20, 0.65, 0.65, 0.65, 0, 0, 0, 0x38bdf8);
  }

  public dispose(): void {
    for (const g of this.allGeos) g.dispose();
    for (const m of this.allMats) m.dispose();
  }
}
