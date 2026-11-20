import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FactionId, FortificationType } from '../sim/types';

function prepGeo(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!nonIndexed.attributes.normal) {
    nonIndexed.computeVertexNormals();
  }
  // Remove UV mismatches so mergeGeometries never fails
  if (nonIndexed.attributes.uv) {
    nonIndexed.deleteAttribute('uv');
  }
  return nonIndexed;
}

/**
 * Primary glossy chitin silhouette of an ant:
 * Bulbous tapered gaster (abdomen) + narrow petiole + arched thorax + head + curved mandibles.
 * Bottom-center pivoted at y = 0, facing +Z.
 */
export function createAntBodyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 1. Gaster (rear abdomen) - slightly angled up
  const gaster = new THREE.SphereGeometry(0.27, 7, 5);
  gaster.scale(0.95, 0.85, 1.5);
  gaster.rotateX(0.18);
  gaster.translate(0, 0.38, -0.5);
  parts.push(prepGeo(gaster));

  // 2. Petiole (narrow waist node)
  const petiole = new THREE.SphereGeometry(0.11, 5, 4);
  petiole.scale(0.85, 0.85, 1.2);
  petiole.translate(0, 0.3, -0.1);
  parts.push(prepGeo(petiole));

  // 3. Thorax (muscular mid-body)
  const thorax = new THREE.SphereGeometry(0.18, 7, 5);
  thorax.scale(0.9, 0.92, 1.44);
  thorax.translate(0, 0.35, 0.16);
  parts.push(prepGeo(thorax));

  // 4. Head (angled forward)
  const head = new THREE.SphereGeometry(0.185, 7, 5);
  head.scale(1.06, 0.92, 1.1);
  head.rotateX(-0.22);
  head.translate(0, 0.37, 0.5);
  parts.push(prepGeo(head));

  // 5. Left & Right curved mandibles
  for (const side of [-1, 1]) {
    const mandible = new THREE.ConeGeometry(0.048, 0.24, 4);
    mandible.rotateX(Math.PI * 0.48);
    mandible.rotateY(side * -0.34);
    mandible.translate(side * 0.095, 0.3, 0.72);
    parts.push(prepGeo(mandible));
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Secondary matte chitin appendages & WWI crest of an ant:
 * 6 jointed legs (femur + tibia touching y = 0) + 2 bent antennae + WWI helmet dome.
 */
export function createAntAppendagesGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 6 jointed legs (3 pairs)
  const legAnchors = [
    { z: 0.28, splayZ: 0.28 },
    { z: 0.13, splayZ: 0.0 },
    { z: -0.02, splayZ: -0.28 },
  ];

  for (const anchor of legAnchors) {
    for (const side of [-1, 1]) {
      const femur = new THREE.CylinderGeometry(0.026, 0.03, 0.32, 4);
      femur.rotateZ(side * 1.15);
      femur.rotateY(side * anchor.splayZ * 1.15);
      femur.translate(side * 0.2, 0.34, anchor.z + anchor.splayZ * 0.3);
      parts.push(prepGeo(femur));

      const tibia = new THREE.CylinderGeometry(0.018, 0.026, 0.39, 4);
      tibia.rotateZ(side * -0.38);
      tibia.rotateY(side * anchor.splayZ * 0.85);
      tibia.translate(side * 0.4, 0.18, anchor.z + anchor.splayZ * 0.75);
      parts.push(prepGeo(tibia));
    }
  }

  // 2 sweeping antennae
  for (const side of [-1, 1]) {
    const antBase = new THREE.CylinderGeometry(0.014, 0.02, 0.28, 4);
    antBase.rotateX(1.05);
    antBase.rotateZ(side * -0.42);
    antBase.translate(side * 0.12, 0.5, 0.68);
    parts.push(prepGeo(antBase));
  }

  // Subtle WWI miniature helmet dome crest on head for faction silhouette readability
  const helm = new THREE.SphereGeometry(0.18, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.55);
  helm.scale(1.15, 0.65, 1.16);
  helm.translate(0, 0.44, 0.49);
  parts.push(prepGeo(helm));

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Faceted organic cargo chunk carried between an ant's mandibles (seed, pebble, larva, soil clod).
 */
export function createCargoGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.14, 1);
  geo.scale(1.15, 0.82, 1.35);
  return geo;
}

export interface FortMaterialSet {
  wood: THREE.MeshStandardMaterial;
  burlap: THREE.MeshStandardMaterial;
  darkSteel: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  redFlag: THREE.MeshStandardMaterial;
  blackFlag: THREE.MeshStandardMaterial;
  resinGlow: THREE.MeshStandardMaterial;
}

function buildMergedMesh(
  geos: THREE.BufferGeometry[],
  mat: THREE.Material,
  castShadow = true,
  receiveShadow = true,
): THREE.Mesh | null {
  if (geos.length === 0) return null;
  const nonIndexed = geos.map((g) => {
    const ni = g.index ? g.toNonIndexed() : g;
    if (!ni.attributes.normal) ni.computeVertexNormals();
    if (!ni.attributes.uv) {
      const count = ni.attributes.position.count;
      ni.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    return ni;
  });
  const merged = mergeGeometries(nonIndexed, false);
  geos.forEach((g) => g.dispose());
  nonIndexed.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

/**
 * Builds composite 4–11 part WWI fortifications pivoted at bottom-center (y = 0),
 * merging same-material parts per fortification for crisp, low-draw-call rendering.
 */
export function createFortificationGroup(
  type: FortificationType,
  faction: FactionId,
  mats: FortMaterialSet,
): THREE.Group {
  const group = new THREE.Group();
  const flagMat = faction === 'red' ? mats.redFlag : mats.blackFlag;

  const woodGeos: THREE.BufferGeometry[] = [];
  const burlapGeos: THREE.BufferGeometry[] = [];
  const steelGeos: THREE.BufferGeometry[] = [];
  const stoneGeos: THREE.BufferGeometry[] = [];
  const flagGeos: THREE.BufferGeometry[] = [];
  const glowGeos: THREE.BufferGeometry[] = [];

  if (type === 'sandbags') {
    for (let row = 0; row < 2; row++) {
      const count = row === 0 ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 0.85;
        const curveZ = -Math.abs(offset) * 0.16;
        const bag = new THREE.SphereGeometry(0.32, 6, 5);
        bag.scale(1.55, 0.58, 0.85);
        bag.rotateY(offset * 0.14);
        bag.translate(offset, 0.18 + row * 0.31, curveZ);
        burlapGeos.push(bag);
      }
    }
    for (const sx of [-1.1, 0, 1.1]) {
      const stake = new THREE.CylinderGeometry(0.06, 0.08, 0.95, 5);
      stake.rotateX(0.1);
      stake.translate(sx, 0.45, -0.35);
      woodGeos.push(stake);
    }
  } else if (type === 'bunker') {
    const leftWall = new THREE.BoxGeometry(0.55, 1.1, 1.8);
    leftWall.translate(-1.05, 0.55, 0);
    stoneGeos.push(leftWall);

    const rightWall = new THREE.BoxGeometry(0.55, 1.1, 1.8);
    rightWall.translate(1.05, 0.55, 0);
    stoneGeos.push(rightWall);

    const backWall = new THREE.BoxGeometry(2.6, 1.1, 0.45);
    backWall.translate(0, 0.55, -0.78);
    stoneGeos.push(backWall);

    const sill = new THREE.BoxGeometry(2.1, 0.52, 0.45);
    sill.translate(0, 0.26, 0.72);
    burlapGeos.push(sill);

    for (let i = 0; i < 4; i++) {
      const log = new THREE.CylinderGeometry(0.18, 0.19, 2.95, 6);
      log.rotateZ(Math.PI * 0.5);
      log.translate(0, 1.22, -0.7 + i * 0.46);
      woodGeos.push(log);
    }

    const scope = new THREE.CylinderGeometry(0.05, 0.05, 0.65, 5);
    scope.translate(0.55, 1.55, 0.15);
    steelGeos.push(scope);

    const pole = new THREE.CylinderGeometry(0.03, 0.035, 0.9, 5);
    pole.translate(-1.05, 1.55, -0.35);
    woodGeos.push(pole);

    const flag = new THREE.BoxGeometry(0.65, 0.32, 0.05);
    flag.translate(-0.72, 1.75, -0.35);
    flagGeos.push(flag);
  } else if (type === 'barbed_thorns') {
    for (const xPos of [-1.25, 0, 1.25]) {
      const a = new THREE.CylinderGeometry(0.05, 0.06, 1.25, 4);
      a.rotateX(0.62);
      a.translate(xPos, 0.46, 0);
      woodGeos.push(a);

      const b = new THREE.CylinderGeometry(0.05, 0.06, 1.25, 4);
      b.rotateX(-0.62);
      b.translate(xPos, 0.46, 0);
      woodGeos.push(b);
    }
    const spine = new THREE.CylinderGeometry(0.05, 0.055, 3.1, 5);
    spine.rotateZ(Math.PI * 0.5);
    spine.translate(0, 0.48, 0);
    woodGeos.push(spine);

    for (let i = 0; i < 4; i++) {
      const coil = new THREE.TorusGeometry(0.38, 0.035, 4, 9);
      coil.rotateX(0.25);
      coil.rotateY(Math.PI * 0.35 + i * 0.3);
      coil.translate(-1.05 + i * 0.7, 0.48, (i % 2 === 0 ? 1 : -1) * 0.08);
      steelGeos.push(coil);
    }
  } else if (type === 'mortar_nest') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const bag = new THREE.SphereGeometry(0.28, 6, 4);
      bag.scale(1.4, 0.6, 0.85);
      bag.rotateY(-a + Math.PI * 0.5);
      bag.translate(Math.cos(a) * 1.05, 0.2, Math.sin(a) * 1.05);
      burlapGeos.push(bag);
    }

    const base = new THREE.CylinderGeometry(0.65, 0.75, 0.16, 6);
    base.translate(0, 0.08, 0);
    woodGeos.push(base);

    const barrel = new THREE.CylinderGeometry(0.18, 0.24, 1.35, 8);
    barrel.rotateX(0.52);
    barrel.translate(0, 0.68, 0.12);
    steelGeos.push(barrel);

    const pod = new THREE.SphereGeometry(0.24, 6, 5);
    pod.translate(0.55, 0.26, -0.32);
    glowGeos.push(pod);
  } else {
    // watchtower
    for (const sx of [-0.62, 0.62]) {
      for (const sz of [-0.62, 0.62]) {
        const leg = new THREE.CylinderGeometry(0.07, 0.095, 2.9, 5);
        leg.rotateZ(sx * 0.09);
        leg.rotateX(-sz * 0.09);
        leg.translate(sx * 0.88, 1.4, sz * 0.88);
        woodGeos.push(leg);
      }
    }
    const deck = new THREE.BoxGeometry(1.55, 0.18, 1.55);
    deck.translate(0, 2.55, 0);
    woodGeos.push(deck);

    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const rail = new THREE.BoxGeometry(1.55, 0.42, 0.12);
      rail.rotateY(a);
      rail.translate(Math.sin(a) * 0.72, 2.86, Math.cos(a) * 0.72);
      burlapGeos.push(rail);
    }

    const pole = new THREE.CylinderGeometry(0.035, 0.045, 1.6, 5);
    pole.translate(0.62, 3.35, 0.62);
    woodGeos.push(pole);

    const pennant = new THREE.BoxGeometry(1.05, 0.5, 0.05);
    pennant.translate(1.12, 3.85, 0.62);
    flagGeos.push(pennant);
  }

  const mWood = buildMergedMesh(woodGeos, mats.wood);
  const mBurlap = buildMergedMesh(burlapGeos, mats.burlap);
  const mSteel = buildMergedMesh(steelGeos, mats.darkSteel);
  const mStone = buildMergedMesh(stoneGeos, mats.stone);
  const mFlag = buildMergedMesh(flagGeos, flagMat);
  const mGlow = buildMergedMesh(glowGeos, mats.resinGlow, false, false);

  if (mWood) group.add(mWood);
  if (mBurlap) group.add(mBurlap);
  if (mSteel) group.add(mSteel);
  if (mStone) group.add(mStone);
  if (mFlag) group.add(mFlag);
  if (mGlow) group.add(mGlow);

  return group;
}

/**
 * Composite Queen Ant sculpture resting inside each underground Queen Chamber,
 * surrounded by glistening egg clusters.
 */
export function createQueenAntGroup(
  faction: FactionId,
  eggMaterial: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group();
  const chitinMat = new THREE.MeshStandardMaterial({
    color: faction === 'red' ? 0x8f2414 : 0x222024,
    roughness: 0.22,
    metalness: 0.18,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: faction === 'red' ? 0xc96228 : 0x5c4b34,
    roughness: 0.62,
    metalness: 0.08,
  });

  // Regal elongated gaster
  const gaster = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 12), chitinMat);
  gaster.scale.set(1.0, 0.88, 1.85);
  gaster.position.set(0, 0.75, -1.25);
  group.add(gaster);

  // Golden-amber abdominal bands
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.66 - i * 0.08, 0.06, 6, 16), trimMat);
    band.position.set(0, 0.76, -0.8 - i * 0.45);
    group.add(band);
  }

  // Thorax & Head
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10), chitinMat);
  thorax.scale.set(0.9, 0.95, 1.4);
  thorax.position.set(0, 0.78, 0.35);
  group.add(thorax);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), chitinMat);
  head.position.set(0, 0.85, 1.15);
  group.add(head);

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.05, 0.07, 1.1, 6);
  for (const z of [-0.15, 0.3, 0.75]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, trimMat);
      leg.position.set(side * 0.65, 0.42, z);
      leg.rotation.z = side * -0.58;
      group.add(leg);
    }
  }

  // Pearlescent egg cluster beside the queen
  const eggGeo = new THREE.SphereGeometry(0.18, 8, 6);
  eggGeo.scale(0.85, 0.8, 1.35);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rad = 1.25 + (i % 3) * 0.32;
    const egg = new THREE.Mesh(eggGeo, eggMaterial);
    egg.position.set(Math.cos(a) * rad, 0.16 + (i % 2) * 0.14, -0.5 + Math.sin(a) * rad * 0.7);
    egg.rotation.set(i * 0.5, a, 0.3);
    group.add(egg);
  }

  return group;
}

/**
 * Composite shattered WWI dead tree stump with jagged branches (perimeter & no-man's-land landmark).
 */
export function createShatteredTreeStump(
  woodMat: THREE.MeshStandardMaterial,
  barkMat: THREE.MeshStandardMaterial,
  scale = 1,
): THREE.Group {
  const group = new THREE.Group();

  // Flared root base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.78, 1.1, 7), barkMat);
  base.position.y = 0.52;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Splintered main trunk
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.44, 2.7, 7), barkMat);
  trunk.position.y = 2.15;
  trunk.rotation.z = 0.08;
  trunk.castShadow = true;
  group.add(trunk);

  // Exposed splinter tip
  const splinter = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.05, 5), woodMat);
  splinter.position.set(-0.14, 3.8, 0.04);
  splinter.rotation.z = 0.16;
  group.add(splinter);

  // Broken side limbs
  const limb1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.16, 1.6, 6), barkMat);
  limb1.position.set(0.52, 2.35, 0.18);
  limb1.rotation.z = -0.95;
  limb1.rotation.y = 0.3;
  limb1.castShadow = true;
  group.add(limb1);

  const limb2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.13, 1.25, 6), barkMat);
  limb2.position.set(-0.46, 1.85, -0.22);
  limb2.rotation.z = 1.05;
  limb2.rotation.y = -0.4;
  group.add(limb2);

  group.scale.setScalar(scale);
  return group;
}

/**
 * Composite multi-blade bent dried meadow grass tuft (5 splayed blades merged).
 */
export function createGrassTuftGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  const specs = [
    { angle: 0.0, tilt: 0.28, h: 1.9, r: 0.09 },
    { angle: 1.25, tilt: 0.42, h: 1.55, r: 0.08 },
    { angle: 2.5, tilt: 0.34, h: 1.75, r: 0.085 },
    { angle: 3.8, tilt: 0.46, h: 1.35, r: 0.075 },
    { angle: 5.1, tilt: 0.32, h: 1.65, r: 0.08 },
  ];
  for (const s of specs) {
    const b = new THREE.ConeGeometry(s.r, s.h, 3);
    b.translate(0, s.h * 0.5, 0);
    b.rotateZ(s.tilt);
    b.rotateY(s.angle);
    blades.push(prepGeo(b));
  }
  const merged = mergeGeometries(blades, false);
  blades.forEach((b) => b.dispose());
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Angular faceted battlefield boulder geometry (perturbed dodecahedron, flat-faceted organic look).
 */
export function createSculptedRockGeometry(): THREE.BufferGeometry {
  const raw = new THREE.DodecahedronGeometry(0.85, 0);
  const pos = raw.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const n = 0.82 + 0.32 * Math.sin(vx * 3.7 + vz * 2.9) * Math.cos(vy * 4.1);
    pos.setXYZ(i, vx * n, vy * n * (vy < 0 ? 0.65 : 1.0), vz * n);
  }
  const nonIndexed = raw.toNonIndexed();
  raw.dispose();
  nonIndexed.computeVertexNormals();
  nonIndexed.computeBoundingSphere();
  return nonIndexed;
}
