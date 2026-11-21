import * as THREE from 'three';
import type { VehicleKind, WeaponId } from '../sim/types';
import type { ProceduralTexturePack } from './textures';

export interface VehicleRig {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  bodyMeshes: THREE.Mesh[];
  driverGroup: THREE.Group;
  protagonistDriverMesh: THREE.Group;
  npcDriverMesh: THREE.Group;
  steeringWheel: THREE.Object3D;
  lightBarRed?: THREE.Mesh;
  lightBarBlue?: THREE.Mesh;
  headlights: THREE.Mesh[];
  taillights: THREE.Mesh[];
  length: number;
  width: number;
  height: number;
}

export interface HumanoidRig {
  group: THREE.Group;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  weaponAnchor: THREE.Group;
  weaponMeshes: Record<WeaponId, THREE.Group>;
}

export interface ChopperRig {
  group: THREE.Group;
  mainRotor: THREE.Object3D;
  tailRotor: THREE.Object3D;
  searchlightCone: THREE.Mesh;
}

const SPORTS_PALETTE = [0xff245b, 0x00c8f8, 0xff9214, 0x7c3aed, 0x10b981, 0xf1f5f9, 0xdc2626];
const MUSCLE_PALETTE = [0xd97706, 0x1d4ed8, 0x991b1b, 0x18181b, 0x047857, 0xbe123c];
const SEDAN_PALETTE = [0x94a3b8, 0x334155, 0x475569, 0x1e3a5f, 0x581c87, 0xd6d3d1];

// ---------------------------------------------------------------------------
// Shared High-Poly PBR Materials
// ---------------------------------------------------------------------------
const tireMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.88, metalness: 0.06 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xdbe3ec, roughness: 0.2, metalness: 0.9 });
const brakeDiscMat = new THREE.MeshStandardMaterial({ color: 0x7a828e, roughness: 0.38, metalness: 0.85 });
const caliperMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.45 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe8eef5, roughness: 0.14, metalness: 0.94 });
const darkTrimMat = new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.58, metalness: 0.28 });
const interiorFloorMat = new THREE.MeshStandardMaterial({ color: 0x13161c, roughness: 0.85, metalness: 0.08 });
const leatherSeatMat = new THREE.MeshStandardMaterial({ color: 0x262932, roughness: 0.52, metalness: 0.12 });
const dashClusterMat = new THREE.MeshStandardMaterial({
  color: 0x0ea5e9,
  emissive: 0x0284c7,
  emissiveIntensity: 0.9,
  roughness: 0.2,
});
const grilleMat = new THREE.MeshStandardMaterial({ color: 0x0d1016, roughness: 0.72, metalness: 0.45 });

// Crystal-clear transparent automotive glass (depthWrite: false so drivers & interiors render crisply inside!)
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x99d5ff,
  roughness: 0.06,
  metalness: 0.1,
  clearcoat: 1.0,
  clearcoatRoughness: 0.04,
  transparent: true,
  opacity: 0.32,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const headlightMat = new THREE.MeshStandardMaterial({
  color: 0xfff8e1,
  emissive: 0xffefc2,
  emissiveIntensity: 1.45,
  roughness: 0.12,
});
const taillightMat = new THREE.MeshStandardMaterial({
  color: 0xff2236,
  emissive: 0xff162b,
  emissiveIntensity: 1.25,
  roughness: 0.18,
});
const amberLightMat = new THREE.MeshStandardMaterial({
  color: 0xf59e0b,
  emissive: 0xd97706,
  emissiveIntensity: 0.9,
  roughness: 0.22,
});
const hazardStripeMat = new THREE.MeshStandardMaterial({
  color: 0xf59e0b,
  roughness: 0.4,
  metalness: 0.22,
});
const gunMetalMat = new THREE.MeshStandardMaterial({ color: 0x252a32, roughness: 0.3, metalness: 0.86 });
const gunWoodMat = new THREE.MeshStandardMaterial({ color: 0x7a4724, roughness: 0.7, metalness: 0.06 });
const rpgGreenMat = new THREE.MeshStandardMaterial({ color: 0x426119, roughness: 0.62, metalness: 0.26 });

// ---------------------------------------------------------------------------
// Sculpted Shared Geometry Helpers (Cached once for high-poly detail + 60fps)
// ---------------------------------------------------------------------------

/**
 * Extrudes a 2D automotive side profile (z = forward, y = up) across X width
 * with smooth multi-segment bevels so car bodies have realistic curved fenders,
 * sloped hoods, and recessed open cockpit wells for visible seated drivers.
 */
function createCarSilhouetteGeometry(
  buildShape: (s: THREE.Shape) => void,
  width: number,
  bevelSize: number,
  bevelThickness: number,
  bevelSegments = 4,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  buildShape(shape);
  const innerDepth = Math.max(0.05, width - bevelThickness * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerDepth,
    bevelEnabled: true,
    bevelSegments,
    steps: 1,
    bevelSize,
    bevelThickness,
    curveSegments: 14,
  });
  // Extrude runs along +Z; rotate so shape-X becomes world +Z (forward) and extrusion depth centers on world X
  geo.translate(0, 0, -innerDepth * 0.5);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function mergeBufferGeometriesSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let totalVerts = 0;
  for (const g of nonIndexed) {
    totalVerts += g.attributes.position.count;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const g of nonIndexed) {
    const pos = g.attributes.position.array as Float32Array;
    const norm = g.attributes.normal.array as Float32Array;
    positions.set(pos, offset);
    normals.set(norm, offset);
    offset += pos.length;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return merged;
}

/**
 * Builds a true 4-sided hollow open-window roof & pillar greenhouse:
 * - Left & right side pillar arches (A/B/C pillars with cut-out side window holes)
 * - Thin top roof panel connecting the left and right rails at the top
 * This keeps the front windshield, rear window, and left/right side windows 100% open!
 */
function createOpenWindowFrameGeometry(params: {
  zRear: number;
  zFront: number;
  yBase: number;
  yRoof: number;
  zRoofRear: number;
  zRoofFront: number;
  width: number;
  twoWindows?: boolean;
}): THREE.BufferGeometry {
  const { zRear, zFront, yBase, yRoof, zRoofRear, zRoofFront, width, twoWindows = true } = params;
  const s = new THREE.Shape();
  s.moveTo(zRear, yBase);
  s.lineTo(zFront, yBase);
  s.quadraticCurveTo((zFront + zRoofFront) * 0.52, yRoof, zRoofFront, yRoof);
  s.lineTo(zRoofRear, yRoof);
  s.quadraticCurveTo((zRear + zRoofRear) * 0.52, yRoof * 0.96, zRear, yBase);

  // Cut out open side window holes in the side pillar rails
  const yWinBot = yBase + 0.04;
  const yWinTop = yRoof - 0.075;

  if (twoWindows) {
    const zMid = (zRoofFront + zRoofRear) * 0.5 - 0.05;
    const holeFront = new THREE.Path();
    holeFront.moveTo(zMid + 0.055, yWinBot);
    holeFront.lineTo(zFront - 0.16, yWinBot);
    holeFront.quadraticCurveTo(zRoofFront + 0.12, yWinTop, zRoofFront - 0.04, yWinTop);
    holeFront.lineTo(zMid + 0.055, yWinTop);
    holeFront.closePath();
    s.holes.push(holeFront);

    const holeRear = new THREE.Path();
    holeRear.moveTo(zRear + 0.18, yWinBot);
    holeRear.lineTo(zMid - 0.055, yWinBot);
    holeRear.lineTo(zMid - 0.055, yWinTop);
    holeRear.lineTo(zRoofRear + 0.08, yWinTop);
    holeRear.quadraticCurveTo(zRear + 0.26, yWinTop * 0.96, zRear + 0.18, yWinBot);
    holeRear.closePath();
    s.holes.push(holeRear);
  } else {
    const hole = new THREE.Path();
    hole.moveTo(zRear + 0.2, yWinBot);
    hole.lineTo(zFront - 0.18, yWinBot);
    hole.quadraticCurveTo(zRoofFront + 0.08, yWinTop, zRoofFront - 0.05, yWinTop);
    hole.lineTo(zRoofRear + 0.08, yWinTop);
    hole.quadraticCurveTo(zRear + 0.24, yWinTop * 0.96, zRear + 0.2, yWinBot);
    hole.closePath();
    s.holes.push(hole);
  }

  const railThickness = 0.075;
  const xOffset = width * 0.5 - railThickness * 0.5 - 0.015;
  const leftRail = createCarSilhouetteGeometry(
    (targetShape) => {
      targetShape.copy(s);
    },
    railThickness,
    0.015,
    0.02,
    2,
  );
  leftRail.translate(-xOffset, 0, 0);

  const rightRail = createCarSilhouetteGeometry(
    (targetShape) => {
      targetShape.copy(s);
    },
    railThickness,
    0.015,
    0.02,
    2,
  );
  rightRail.translate(xOffset, 0, 0);

  // Thin top roof cap spanning between left and right rails (leaving front windshield & rear glass open!)
  const roofCap = createCarSilhouetteGeometry(
    (rs) => {
      rs.moveTo(zRoofRear - 0.06, yRoof - 0.07);
      rs.lineTo(zRoofFront + 0.06, yRoof - 0.07);
      rs.lineTo(zRoofFront, yRoof);
      rs.lineTo(zRoofRear, yRoof);
      rs.closePath();
    },
    width - 0.06,
    0.02,
    0.03,
    2,
  );

  return mergeBufferGeometriesSimple([leftRail, rightRail, roofCap]);
}

/**
 * Builds a high-poly curved sidewall tire + deep alloy rim via LatheGeometry.
 */
function buildSculptedTireGeometry(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.24, -0.155),
    new THREE.Vector2(0.32, -0.165),
    new THREE.Vector2(0.382, -0.145),
    new THREE.Vector2(0.405, -0.105),
    new THREE.Vector2(0.41, 0),
    new THREE.Vector2(0.405, 0.105),
    new THREE.Vector2(0.382, 0.145),
    new THREE.Vector2(0.32, 0.165),
    new THREE.Vector2(0.24, 0.155),
  ];
  const geo = new THREE.LatheGeometry(pts, 26);
  geo.rotateZ(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function buildSculptedRimBarrelGeometry(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.01, -0.09),
    new THREE.Vector2(0.255, -0.12),
    new THREE.Vector2(0.255, -0.155),
    new THREE.Vector2(0.23, -0.155),
    new THREE.Vector2(0.22, 0.11),
    new THREE.Vector2(0.255, 0.155),
    new THREE.Vector2(0.23, 0.155),
    new THREE.Vector2(0.08, 0.12),
    new THREE.Vector2(0.01, 0.14),
  ];
  const geo = new THREE.LatheGeometry(pts, 22);
  geo.rotateZ(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

const wheelTireGeo = buildSculptedTireGeometry();
const wheelRimBarrelGeo = buildSculptedRimBarrelGeometry();
const wheelSpokeGeo = new THREE.BoxGeometry(0.045, 0.43, 0.055);
const wheelHubCapGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.31, 14);
wheelHubCapGeo.rotateZ(Math.PI / 2);
const brakeDiscGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.04, 18);
brakeDiscGeo.rotateZ(Math.PI / 2);
const caliperGeo = new THREE.BoxGeometry(0.075, 0.14, 0.09);

const wheelArchGeo = new THREE.TorusGeometry(0.46, 0.055, 10, 18, Math.PI);
wheelArchGeo.rotateY(Math.PI / 2);

const sideMirrorGeo = new THREE.SphereGeometry(0.09, 12, 10);
sideMirrorGeo.scale(1.35, 0.72, 1.0);

const exhaustTipGeo = new THREE.CylinderGeometry(0.055, 0.062, 0.24, 12);
exhaustTipGeo.rotateX(Math.PI / 2);

const lensSphereGeo = new THREE.SphereGeometry(0.12, 14, 10);
const lightBarDomeGeo = new THREE.CapsuleGeometry(0.065, 0.38, 6, 12);
lightBarDomeGeo.rotateZ(Math.PI / 2);

// Shared Interior Geometries (Seats, Steering Wheel, Dashboard, Door Sill)
const seatCushionGeo = new THREE.CapsuleGeometry(0.11, 0.26, 5, 10);
seatCushionGeo.rotateZ(Math.PI / 2);
seatCushionGeo.scale(1.0, 0.55, 1.35);
const seatBackGeo = new THREE.CapsuleGeometry(0.12, 0.44, 6, 12);
seatBackGeo.scale(1.45, 1.0, 0.48);
const headrestGeo = new THREE.CapsuleGeometry(0.065, 0.12, 5, 10);
headrestGeo.rotateZ(Math.PI / 2);
const steeringRimGeo = new THREE.TorusGeometry(0.165, 0.024, 10, 20);
const steeringHubGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.18, 10);
steeringHubGeo.rotateX(Math.PI / 2);

// ---------------------------------------------------------------------------
// Pre-Built Sculpted Vehicle Silhouette Geometries (With Recessed Cockpit Tub!)
// ---------------------------------------------------------------------------

// 1. Sports Supercar (Banshee VI) — low wedge nose, recessed cockpit well at y=0.54, fastback rear deck
const sportsBodyGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(-2.32, 0.36);
    s.lineTo(2.12, 0.34);
    s.quadraticCurveTo(2.4, 0.38, 2.34, 0.62);
    s.quadraticCurveTo(2.05, 0.88, 1.16, 0.93);
    // Drop into recessed cockpit floor so driver's chest, arms, wheel & seats are visible
    s.lineTo(0.84, 0.54);
    s.lineTo(-0.88, 0.54);
    s.lineTo(-1.18, 0.97);
    s.lineTo(-1.82, 0.99);
    s.quadraticCurveTo(-2.3, 0.96, -2.38, 0.76);
    s.quadraticCurveTo(-2.42, 0.45, -2.32, 0.36);
  },
  2.14,
  0.09,
  0.12,
  4,
);

const sportsPillarFrameGeo = createOpenWindowFrameGeometry({
  zRear: -1.32,
  zFront: 1.06,
  yBase: 0.9,
  yRoof: 1.38,
  zRoofRear: -0.54,
  zRoofFront: 0.32,
  width: 1.66,
  twoWindows: false,
});

const sportsGlassGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(-1.26, 0.91);
    s.lineTo(1.02, 0.91);
    s.quadraticCurveTo(0.4, 1.35, -0.05, 1.35);
    s.lineTo(-0.5, 1.34);
    s.quadraticCurveTo(-0.98, 1.22, -1.26, 0.91);
  },
  1.61,
  0.03,
  0.05,
  3,
);

// 2. Muscle Car (Dominator GT) — long bold hood, recessed cabin well, muscular rear haunches
const muscleBodyGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(-2.36, 0.38);
    s.lineTo(2.26, 0.38);
    s.quadraticCurveTo(2.44, 0.46, 2.4, 0.82);
    s.quadraticCurveTo(2.26, 1.02, 1.98, 1.03);
    s.lineTo(0.92, 1.04);
    s.lineTo(0.68, 0.58);
    s.lineTo(-1.05, 0.58);
    s.lineTo(-1.38, 1.06);
    s.lineTo(-1.75, 1.08);
    s.quadraticCurveTo(-2.34, 1.05, -2.42, 0.86);
    s.quadraticCurveTo(-2.44, 0.5, -2.36, 0.38);
  },
  2.06,
  0.08,
  0.11,
  4,
);

const musclePillarFrameGeo = createOpenWindowFrameGeometry({
  zRear: -1.52,
  zFront: 0.86,
  yBase: 0.98,
  yRoof: 1.48,
  zRoofRear: -0.68,
  zRoofFront: 0.24,
  width: 1.68,
  twoWindows: true,
});

const muscleGlassGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(-1.45, 1.0);
    s.lineTo(0.81, 1.0);
    s.quadraticCurveTo(0.3, 1.45, -0.08, 1.45);
    s.lineTo(-0.65, 1.44);
    s.quadraticCurveTo(-1.1, 1.3, -1.45, 1.0);
  },
  1.63,
  0.03,
  0.05,
  3,
);

// 3. Sedan / Police Interceptor — 4-door saloon with open cockpit tub & two side windows
const sedanBodyGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(-2.36, 0.38);
    s.lineTo(2.24, 0.38);
    s.quadraticCurveTo(2.42, 0.46, 2.38, 0.78);
    s.quadraticCurveTo(2.15, 0.98, 1.18, 1.02);
    s.lineTo(0.88, 0.58);
    s.lineTo(-1.12, 0.58);
    s.lineTo(-1.44, 1.04);
    s.lineTo(-1.82, 1.06);
    s.quadraticCurveTo(-2.32, 1.02, -2.4, 0.82);
    s.quadraticCurveTo(-2.42, 0.5, -2.36, 0.38);
  },
  2.04,
  0.08,
  0.11,
  4,
);

const sedanPillarFrameGeo = createOpenWindowFrameGeometry({
  zRear: -1.56,
  zFront: 1.12,
  yBase: 0.98,
  yRoof: 1.54,
  zRoofRear: -0.78,
  zRoofFront: 0.36,
  width: 1.68,
  twoWindows: true,
});

const sedanGlassGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(-1.48, 1.0);
    s.lineTo(1.06, 1.0);
    s.quadraticCurveTo(0.6, 1.5, 0.16, 1.51);
    s.lineTo(-0.74, 1.5);
    s.quadraticCurveTo(-1.18, 1.42, -1.48, 1.0);
  },
  1.63,
  0.03,
  0.05,
  3,
);

// 4. Modern Luxury SUV — sculpted rounded hood, tall panoramic glass greenhouse, open cabin well
const suvBodyGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(-2.45, 0.46);
    s.lineTo(2.34, 0.46);
    s.quadraticCurveTo(2.5, 0.54, 2.48, 0.95);
    s.quadraticCurveTo(2.38, 1.18, 1.36, 1.22);
    s.lineTo(1.05, 0.68);
    s.lineTo(-1.82, 0.68);
    s.lineTo(-2.12, 1.22);
    s.lineTo(-2.32, 1.24);
    s.quadraticCurveTo(-2.5, 1.2, -2.5, 0.9);
    s.quadraticCurveTo(-2.5, 0.55, -2.45, 0.46);
  },
  2.12,
  0.09,
  0.11,
  4,
);

const suvPillarFrameGeo = createOpenWindowFrameGeometry({
  zRear: -2.28,
  zFront: 1.3,
  yBase: 1.16,
  yRoof: 1.86,
  zRoofRear: -1.96,
  zRoofFront: 0.52,
  width: 1.84,
  twoWindows: true,
});

const suvGlassGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(-2.2, 1.18);
    s.lineTo(1.24, 1.18);
    s.quadraticCurveTo(0.8, 1.81, 0.34, 1.82);
    s.lineTo(-1.92, 1.81);
    s.quadraticCurveTo(-2.16, 1.74, -2.2, 1.18);
  },
  1.79,
  0.03,
  0.05,
  3,
);

// 5. SWAT Tactical Armored Vehicle (BearCat silhouette with recessed armored front cab well)
const swatHullGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(-3.0, 0.52);
    s.lineTo(2.92, 0.52);
    s.lineTo(3.08, 0.95);
    s.lineTo(2.96, 1.44);
    s.lineTo(1.86, 1.54);
    // Recessed front crew cab well so tactical driver is visible through armored windshield & side ports
    s.lineTo(1.62, 1.05);
    s.lineTo(0.32, 1.05);
    s.lineTo(0.18, 2.28);
    s.lineTo(-2.82, 2.28);
    s.lineTo(-3.08, 1.98);
    s.lineTo(-3.08, 0.85);
    s.closePath();
  },
  2.36,
  0.07,
  0.09,
  3,
);

const swatCabFrameGeo = createOpenWindowFrameGeometry({
  zRear: 0.16,
  zFront: 1.86,
  yBase: 1.48,
  yRoof: 2.28,
  zRoofRear: 0.18,
  zRoofFront: 1.24,
  width: 2.24,
  twoWindows: false,
});

const swatCabGlassGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(0.22, 1.5);
    s.lineTo(1.8, 1.5);
    s.lineTo(1.22, 2.22);
    s.lineTo(0.22, 2.22);
    s.closePath();
  },
  2.18,
  0.02,
  0.04,
  2,
);

// 6. Modern Aerodynamic Transit Bus (lower body below window beltline + open pillar frame + clear glass + driver & passengers!)
const busLowerBodyGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(-5.15, 0.52);
    s.lineTo(5.05, 0.52);
    s.quadraticCurveTo(5.35, 0.58, 5.32, 1.45);
    s.lineTo(5.26, 1.72);
    // Drop into front driver & passenger deck floor so seated bus driver and riders are clearly visible!
    s.lineTo(4.92, 1.15);
    s.lineTo(-4.65, 1.15);
    s.lineTo(-4.82, 3.02);
    s.lineTo(-4.95, 3.02);
    s.quadraticCurveTo(-5.26, 3.0, -5.28, 2.55);
    s.lineTo(-5.28, 0.72);
    s.quadraticCurveTo(-5.25, 0.54, -5.15, 0.52);
  },
  2.54,
  0.09,
  0.1,
  3,
);

const busGlassGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(-4.72, 1.72);
    s.lineTo(5.22, 1.72);
    s.quadraticCurveTo(5.16, 2.74, 4.72, 2.82);
    s.lineTo(-4.72, 2.82);
    s.closePath();
  },
  2.46,
  0.02,
  0.04,
  2,
);

// 7. Semi-Truck Tractor Cab (lower hood/fenders + recessed cab floor + open cab roof frame + clear windshield)
const truckLowerCabGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(2.42, 0.68);
    s.lineTo(5.42, 0.68);
    s.quadraticCurveTo(5.68, 0.74, 5.65, 1.56);
    s.quadraticCurveTo(5.55, 1.88, 4.42, 1.94);
    // Drop into tractor cab floor well so trucker is visible through windshield & side door windows
    s.lineTo(4.2, 1.38);
    s.lineTo(2.68, 1.38);
    s.lineTo(2.62, 2.92);
    s.lineTo(2.42, 2.92);
    s.closePath();
  },
  2.36,
  0.08,
  0.1,
  3,
);

const truckCabFrameGeo = createOpenWindowFrameGeometry({
  zRear: 2.56,
  zFront: 4.42,
  yBase: 1.9,
  yRoof: 2.92,
  zRoofRear: 2.6,
  zRoofFront: 3.68,
  width: 2.22,
  twoWindows: false,
});

const truckCabGlassGeo = createCarSilhouetteGeometry(
  (s) => {
    s.moveTo(2.62, 1.92);
    s.lineTo(4.36, 1.92);
    s.quadraticCurveTo(4.02, 2.76, 3.66, 2.86);
    s.lineTo(2.62, 2.86);
    s.closePath();
  },
  2.16,
  0.02,
  0.04,
  2,
);

function buildDomedFuelTankGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const R = 1.18;
  const halfStraight = 3.25;
  const capLen = 0.78;
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(t) * R, -halfStraight - Math.cos(t) * capLen));
  }
  pts.push(new THREE.Vector2(R, halfStraight));
  for (let i = 1; i <= 8; i++) {
    const t = (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(t) * R, halfStraight + Math.sin(t) * capLen));
  }
  const geo = new THREE.LatheGeometry(pts, 28);
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

const tankerVesselGeo = buildDomedFuelTankGeometry();
const tankerRibGeo = new THREE.TorusGeometry(1.195, 0.045, 10, 28);
const tankerBandGeo = new THREE.CylinderGeometry(1.205, 1.205, 1.55, 28, 1, true);
tankerBandGeo.rotateX(Math.PI / 2);
const tankerRedStripeGeo = new THREE.CylinderGeometry(1.212, 1.212, 0.56, 28, 1, true);
tankerRedStripeGeo.rotateX(Math.PI / 2);

const exhaustStackCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 2.0, 0),
  new THREE.Vector3(0, 2.42, -0.14),
  new THREE.Vector3(0, 2.6, -0.34),
]);
const exhaustStackGeo = new THREE.TubeGeometry(exhaustStackCurve, 14, 0.072, 10, false);

// Police curved tubular bullbar
const bullbarCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.72, 0.44, 0),
  new THREE.Vector3(-0.68, 0.92, 0.06),
  new THREE.Vector3(0, 0.96, 0.1),
  new THREE.Vector3(0.68, 0.92, 0.06),
  new THREE.Vector3(0.72, 0.44, 0),
]);
const bullbarGeo = new THREE.TubeGeometry(bullbarCurve, 18, 0.045, 10, false);

// ---------------------------------------------------------------------------
// Pre-Built Sculpted Anatomical Humanoid Geometries
// ---------------------------------------------------------------------------
function buildAnatomicalTorsoGeometry(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.01, -0.29),
    new THREE.Vector2(0.18, -0.28),
    new THREE.Vector2(0.195, -0.2),
    new THREE.Vector2(0.172, -0.06),
    new THREE.Vector2(0.215, 0.14),
    new THREE.Vector2(0.245, 0.24),
    new THREE.Vector2(0.18, 0.295),
    new THREE.Vector2(0.075, 0.31),
    new THREE.Vector2(0.01, 0.31),
  ];
  const geo = new THREE.LatheGeometry(pts, 18);
  geo.scale(1.0, 1.0, 0.62);
  geo.computeVertexNormals();
  return geo;
}

const humanTorsoGeo = buildAnatomicalTorsoGeometry();
const humanPelvisGeo = new THREE.SphereGeometry(0.19, 14, 12);
humanPelvisGeo.scale(1.02, 0.62, 0.68);
const humanNeckGeo = new THREE.CylinderGeometry(0.056, 0.068, 0.12, 12);
const humanHeadGeo = new THREE.SphereGeometry(0.132, 18, 16);
humanHeadGeo.scale(0.92, 1.08, 0.98);
const humanHairCapGeo = new THREE.SphereGeometry(0.138, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56);
humanHairCapGeo.scale(0.95, 1.06, 1.02);
const policeCapCrownGeo = new THREE.CylinderGeometry(0.138, 0.128, 0.095, 18);
const policeCapBrimGeo = new THREE.CylinderGeometry(0.145, 0.145, 0.022, 14, 1, false, -Math.PI * 0.42, Math.PI * 0.84);
const humanShoulderGeo = new THREE.SphereGeometry(0.088, 12, 10);
const humanUpperArmGeo = new THREE.CapsuleGeometry(0.066, 0.16, 6, 12);
const humanForearmGeo = new THREE.CapsuleGeometry(0.054, 0.19, 6, 12);
const humanHandGeo = new THREE.SphereGeometry(0.052, 10, 8);
const humanThighGeo = new THREE.CapsuleGeometry(0.086, 0.25, 6, 12);
const humanShinGeo = new THREE.CapsuleGeometry(0.068, 0.26, 6, 12);
const humanShoeGeo = new THREE.CapsuleGeometry(0.072, 0.14, 6, 12);
humanShoeGeo.rotateX(Math.PI / 2);
humanShoeGeo.scale(1.0, 0.72, 1.0);

const sunglassesCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.105, 0, 0.09),
  new THREE.Vector3(-0.045, 0.005, 0.128),
  new THREE.Vector3(0.045, 0.005, 0.128),
  new THREE.Vector3(0.105, 0, 0.09),
]);
const sunglassesGeo = new THREE.TubeGeometry(sunglassesCurve, 12, 0.024, 8, false);

// ---------------------------------------------------------------------------
// Seated Driver & Cabin Interior Builder (Visible through Transparent Windows!)
// ---------------------------------------------------------------------------

function buildSeatedDriverFigure(
  role: 'protagonist' | 'police' | 'civilian',
  seed: number,
): THREE.Group {
  const g = new THREE.Group();

  const skinColor = role === 'protagonist' ? 0xd9a07b : [0xe0ac88, 0xc6865c, 0x8d5524, 0xf1c29b][Math.abs(seed) % 4];
  const shirtColor =
    role === 'protagonist'
      ? 0x0ea5e9
      : role === 'police'
        ? 0x1e3a8a
        : [0xf43f5e, 0xf59e0b, 0x10b981, 0xe2e8f0, 0x8b5cf6][Math.abs(seed) % 5];

  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.65 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.72 });
  const hairMat = new THREE.MeshStandardMaterial({
    color: role === 'protagonist' ? 0x241712 : [0x1c1917, 0x451a03, 0x78350f, 0x27272a][Math.abs(seed) % 4],
    roughness: 0.76,
  });

  // Seated anatomical torso (slightly reclined against bucket seat)
  const torso = new THREE.Mesh(humanTorsoGeo, shirtMat);
  torso.position.set(0, 0.24, 0);
  torso.rotation.x = -0.14;
  g.add(torso);

  if (role === 'police') {
    const vest = new THREE.Mesh(humanTorsoGeo, darkTrimMat);
    vest.position.set(0, 0.25, 0.01);
    vest.rotation.x = -0.14;
    vest.scale.set(1.06, 0.75, 1.14);
    g.add(vest);
  } else if (role === 'protagonist') {
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.105, 0.03, 8, 14, Math.PI * 1.45),
      new THREE.MeshStandardMaterial({ color: 0xff4fa3, roughness: 0.6 }),
    );
    collar.rotation.x = Math.PI / 2 - 0.14;
    collar.rotation.z = Math.PI * 0.78;
    collar.position.set(0, 0.49, -0.02);
    g.add(collar);
  }

  // Seated thighs extending forward onto seat cushion
  for (const side of [-1, 1] as const) {
    const thigh = new THREE.Mesh(humanThighGeo, darkTrimMat);
    thigh.rotation.x = Math.PI * 0.46;
    thigh.position.set(side * 0.1, 0.02, 0.18);
    g.add(thigh);
  }

  // Neck + Head + Hair/Cap + Sunglasses
  const neck = new THREE.Mesh(humanNeckGeo, skinMat);
  neck.position.set(0, 0.54, -0.03);
  g.add(neck);

  const head = new THREE.Mesh(humanHeadGeo, skinMat);
  head.position.set(0, 0.69, -0.03);
  g.add(head);

  if (role === 'police') {
    const capMat = new THREE.MeshStandardMaterial({ color: 0x172554, roughness: 0.48 });
    const crown = new THREE.Mesh(policeCapCrownGeo, capMat);
    crown.position.set(0, 0.8, -0.04);
    const brim = new THREE.Mesh(policeCapBrimGeo, darkTrimMat);
    brim.position.set(0, 0.76, 0.04);
    brim.rotation.x = 0.14;
    g.add(crown, brim);
  } else {
    const hair = new THREE.Mesh(humanHairCapGeo, hairMat);
    hair.position.set(0, 0.71, -0.04);
    g.add(hair);
  }

  if (role === 'protagonist' || (role === 'civilian' && seed % 2 === 0)) {
    const shades = new THREE.Mesh(
      sunglassesGeo,
      new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.08, metalness: 0.9 }),
    );
    shades.position.set(0, 0.705, -0.02);
    g.add(shades);
  }

  // Arms reaching forward to grip the steering wheel at 9-and-3 o'clock
  for (const side of [-1, 1] as const) {
    const shoulder = new THREE.Mesh(humanShoulderGeo, shirtMat);
    shoulder.position.set(side * 0.24, 0.44, -0.02);
    g.add(shoulder);

    const upperArm = new THREE.Mesh(humanUpperArmGeo, shirtMat);
    upperArm.position.set(side * 0.23, 0.36, 0.13);
    upperArm.rotation.x = -1.08;
    upperArm.rotation.z = side * 0.12;
    g.add(upperArm);

    const forearm = new THREE.Mesh(humanForearmGeo, role === 'police' ? shirtMat : skinMat);
    forearm.position.set(side * 0.18, 0.34, 0.33);
    forearm.rotation.x = -1.48;
    forearm.rotation.z = -side * 0.22;
    g.add(forearm);

    const hand = new THREE.Mesh(humanHandGeo, skinMat);
    hand.position.set(side * 0.15, 0.36, 0.46);
    g.add(hand);
  }

  g.scale.setScalar(0.86);
  return g;
}

function buildBucketSeat(): THREE.Group {
  const seat = new THREE.Group();
  const cushion = new THREE.Mesh(seatCushionGeo, leatherSeatMat);
  cushion.position.set(0, 0.04, 0.08);
  const back = new THREE.Mesh(seatBackGeo, leatherSeatMat);
  back.position.set(0, 0.28, -0.1);
  back.rotation.x = -0.16;
  const headrest = new THREE.Mesh(headrestGeo, leatherSeatMat);
  headrest.position.set(0, 0.62, -0.15);
  seat.add(cushion, back, headrest);
  return seat;
}

// ---------------------------------------------------------------------------
// Wheel Factory
// ---------------------------------------------------------------------------
function createWheel(scale = 1, sporty = false, xSign: -1 | 1 = 1): THREE.Group {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(wheelTireGeo, tireMat);
  tire.castShadow = true;
  const barrel = new THREE.Mesh(wheelRimBarrelGeo, rimMat);
  const hub = new THREE.Mesh(wheelHubCapGeo, chromeMat);
  const disc = new THREE.Mesh(brakeDiscGeo, brakeDiscMat);
  g.add(tire, barrel, hub, disc);

  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(wheelSpokeGeo, rimMat);
    spoke.rotation.x = (i / 5) * Math.PI;
    spoke.position.x = xSign * 0.055;
    g.add(spoke);
  }

  if (sporty) {
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(xSign * 0.03, 0.06, 0.13);
    g.add(caliper);
  }

  g.scale.setScalar(scale);
  return g;
}

function addContactShadow(parent: THREE.Group, width: number, length: number, tex: THREE.CanvasTexture) {
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.38, length * 1.24),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.54,
      depthWrite: false,
    }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.03;
  parent.add(shadowPlane);
}

/**
 * Builds a realistic multi-polygon composite PBR vehicle rig with transparent glass windows,
 * sculpted interior cockpit (dashboard, steering wheel, bucket seats), and a visible 3D driver!
 */
export function buildVehicleModel(
  kind: VehicleKind,
  seed: number,
  textures: ProceduralTexturePack,
): VehicleRig {
  const group = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const bodyMeshes: THREE.Mesh[] = [];
  const headlights: THREE.Mesh[] = [];
  const taillights: THREE.Mesh[] = [];

  let length = 4.75;
  let width = 2.08;
  let height = 1.48;
  let wheelScale = 1.0;

  let paintHex = SPORTS_PALETTE[Math.abs(seed) % SPORTS_PALETTE.length];
  if (kind === 'muscle') paintHex = MUSCLE_PALETTE[Math.abs(seed) % MUSCLE_PALETTE.length];
  else if (kind === 'sedan' || kind === 'suv') paintHex = SEDAN_PALETTE[Math.abs(seed) % SEDAN_PALETTE.length];
  else if (kind === 'police') paintHex = 0xf8fafc;
  else if (kind === 'swat') paintHex = 0x16202e;
  else if (kind === 'bus') paintHex = 0x0284c7;
  else if (kind === 'tanker') paintHex = 0xc81e1e;

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: paintHex,
    roughness: kind === 'swat' ? 0.52 : 0.2,
    metalness: kind === 'swat' ? 0.42 : 0.62,
    clearcoat: kind === 'swat' ? 0.2 : 0.95,
    clearcoatRoughness: 0.06,
  });

  // Interior driver & steering wheel rig (positioned per vehicle class below)
  const driverGroup = new THREE.Group();
  const npcRole: 'police' | 'civilian' = kind === 'police' || kind === 'swat' ? 'police' : 'civilian';
  const protagonistDriverMesh = buildSeatedDriverFigure('protagonist', 0);
  const npcDriverMesh = buildSeatedDriverFigure(npcRole, seed);
  protagonistDriverMesh.visible = false;
  npcDriverMesh.visible = true;
  driverGroup.add(protagonistDriverMesh, npcDriverMesh);

  const steeringWheel = new THREE.Group();
  const sRim = new THREE.Mesh(steeringRimGeo, darkTrimMat);
  const sHub = new THREE.Mesh(steeringHubGeo, darkTrimMat);
  sHub.position.z = 0.08;
  const sSpokeH = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.025), chromeMat);
  const sSpokeV = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.025), chromeMat);
  sSpokeV.position.y = -0.07;
  steeringWheel.add(sRim, sHub, sSpokeH, sSpokeV);
  steeringWheel.rotation.x = -0.45;

  if (kind === 'bus') {
    length = 10.6;
    width = 2.55;
    height = 3.18;
    wheelScale = 1.28;

    const body = new THREE.Mesh(busLowerBodyGeo, paintMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    bodyMeshes.push(body);

    // White upper beltline & roof cap + vertical window pillars so windows are genuinely see-through!
    const whiteCoachMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3, metalness: 0.15 });
    const upperStripe = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.26, length - 0.5), whiteCoachMat);
    upperStripe.position.set(0, 1.56, -0.05);
    group.add(upperStripe);
    bodyMeshes.push(upperStripe);

    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(width - 0.14, 0.22, length - 0.6), paintMat);
    roofCap.position.set(0, 2.94, -0.06);
    roofCap.castShadow = true;
    group.add(roofCap);
    bodyMeshes.push(roofCap);

    // Window vertical mullions along both sides
    for (const xSide of [-1, 1]) {
      for (const pz of [-4.6, -2.8, -1.0, 0.8, 2.6, 4.4, 5.1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.16, 0.12), darkTrimMat);
        pillar.position.set(xSide * (width * 0.5 - 0.06), 2.28, pz);
        group.add(pillar);
      }
      // Low exterior door sill panels
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.65, length - 1.1), paintMat);
      sill.position.set(xSide * (width * 0.5 - 0.06), 1.38, -0.05);
      group.add(sill);
      bodyMeshes.push(sill);
    }

    // Interior bus deck floor, dashboard, driver seat, and passenger seats with seated riders!
    const deckFloor = new THREE.Mesh(new THREE.BoxGeometry(width - 0.24, 0.12, length - 1.1), interiorFloorMat);
    deckFloor.position.set(0, 1.16, 0.1);
    group.add(deckFloor);

    const busDash = new THREE.Mesh(new THREE.BoxGeometry(width - 0.32, 0.52, 0.55), darkTrimMat);
    busDash.position.set(0, 1.48, 4.86);
    group.add(busDash);

    const driverSeat = buildBucketSeat();
    driverSeat.position.set(0.68, 1.24, 4.18);
    group.add(driverSeat);

    driverGroup.position.set(0.68, 1.26, 4.2);
    steeringWheel.position.set(0.68, 1.66, 4.65);
    group.add(driverGroup, steeringWheel);

    // Add 6 passenger seats + 4 visible seated bus passengers along the aisle!
    for (let row = 0; row < 3; row++) {
      const rz = 2.2 - row * 2.1;
      for (const sx of [-0.74, 0.74]) {
        const pSeat = buildBucketSeat();
        pSeat.position.set(sx, 1.24, rz);
        group.add(pSeat);
        if ((row + (sx > 0 ? 1 : 0)) % 2 === 0) {
          const pax = buildSeatedDriverFigure('civilian', seed + row * 7 + (sx > 0 ? 3 : 1));
          pax.position.set(sx, 1.26, rz + 0.02);
          group.add(pax);
        }
      }
    }

    // Transparent wraparound bus glass (renderOrder = 2 so interior renders cleanly behind it)
    const glass = new THREE.Mesh(busGlassGeo, glassMat);
    glass.renderOrder = 2;
    group.add(glass);

    // Aerodynamic rounded roof HVAC pods
    for (const zOff of [-2.4, 1.9]) {
      const ac = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.25, 6, 14), darkTrimMat);
      ac.rotation.x = Math.PI / 2;
      ac.scale.set(1.55, 1, 0.42);
      ac.position.set(0, 3.16, zOff);
      group.add(ac);
    }

    const fBumper = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, width - 0.16, 6, 12), darkTrimMat);
    fBumper.rotation.z = Math.PI / 2;
    fBumper.position.set(0, 0.64, length * 0.5 + 0.04);
    group.add(fBumper);

    for (const xSide of [-1, 1]) {
      const mirror = new THREE.Mesh(sideMirrorGeo, darkTrimMat);
      mirror.position.set(xSide * (width * 0.5 + 0.16), 2.15, length * 0.44);
      mirror.scale.set(0.8, 1.6, 0.8);
      group.add(mirror);
    }
  } else if (kind === 'tanker') {
    length = 11.4;
    width = 2.6;
    height = 3.35;
    wheelScale = 1.34;

    for (const rx of [-0.55, 0.55]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, length - 0.6), darkTrimMat);
      rail.position.set(rx, 0.72, 0);
      group.add(rail);
    }

    // Sculpted long-nose semi tractor lower body + open-window cab pillar arch + roof cap
    const cab = new THREE.Mesh(truckLowerCabGeo, paintMat);
    cab.castShadow = true;
    cab.receiveShadow = true;
    group.add(cab);
    bodyMeshes.push(cab);

    const cabFrame = new THREE.Mesh(truckCabFrameGeo, paintMat);
    cabFrame.castShadow = true;
    group.add(cabFrame);
    bodyMeshes.push(cabFrame);

    for (const xSide of [-1, 1]) {
      const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 1.65), paintMat);
      doorPanel.position.set(xSide * 1.12, 1.62, 3.45);
      group.add(doorPanel);
      bodyMeshes.push(doorPanel);
    }

    // Tractor cab interior: dashboard, seats, steering wheel, and visible seated trucker!
    const dash = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.48, 0.46), darkTrimMat);
    dash.position.set(0, 1.78, 4.15);
    group.add(dash);

    for (const sx of [-0.54, 0.54]) {
      const seat = buildBucketSeat();
      seat.position.set(sx, 1.48, 3.32);
      group.add(seat);
    }
    driverGroup.position.set(0.54, 1.5, 3.34);
    steeringWheel.position.set(0.54, 1.9, 3.82);
    group.add(driverGroup, steeringWheel);

    // Crystal-clear transparent cab glass
    const cabGlass = new THREE.Mesh(truckCabGlassGeo, glassMat);
    cabGlass.renderOrder = 2;
    group.add(cabGlass);

    // Chrome radiator grille & front bumper
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.92, 0.12), chromeMat);
    grille.position.set(0, 1.3, 5.66);
    group.add(grille);

    const bumper = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 2.24, 6, 12), chromeMat);
    bumper.rotation.z = Math.PI / 2;
    bumper.position.set(0, 0.66, 5.72);
    group.add(bumper);

    for (const xSide of [-1.24, 1.24]) {
      const stack = new THREE.Mesh(exhaustStackGeo, chromeMat);
      stack.position.set(xSide, 0.85, 2.55);
      group.add(stack);

      const saddle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.35, 16), chromeMat);
      saddle.rotation.x = Math.PI / 2;
      saddle.position.set(xSide * 0.82, 0.78, 3.2);
      group.add(saddle);
    }

    // Pressurized stainless steel fuel vessel with elliptical domed endcaps
    const tankMat = new THREE.MeshPhysicalMaterial({
      color: 0xdce4ee,
      roughness: 0.22,
      metalness: 0.88,
      clearcoat: 0.55,
    });
    const tank = new THREE.Mesh(tankerVesselGeo, tankMat);
    tank.position.set(0, 2.08, -1.65);
    tank.castShadow = true;
    group.add(tank);
    bodyMeshes.push(tank);

    for (const rz of [-4.2, -2.5, -0.8, 0.9]) {
      const rib = new THREE.Mesh(tankerRibGeo, chromeMat);
      rib.position.set(0, 2.08, rz);
      group.add(rib);
    }
    for (const hz of [-3.4, -1.65, 0.1]) {
      const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.18, 14), darkTrimMat);
      hatch.position.set(0, 3.3, hz);
      group.add(hatch);
    }

    const band = new THREE.Mesh(tankerBandGeo, hazardStripeMat);
    band.position.set(0, 2.08, -1.65);
    const redBand = new THREE.Mesh(
      tankerRedStripeGeo,
      new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x7f1d1d, emissiveIntensity: 0.45, roughness: 0.3 }),
    );
    redBand.position.set(0, 2.08, -1.65);
    group.add(band, redBand);
  } else if (kind === 'swat') {
    length = 6.2;
    width = 2.38;
    height = 2.48;
    wheelScale = 1.24;

    const hull = new THREE.Mesh(swatHullGeo, paintMat);
    hull.castShadow = true;
    hull.receiveShadow = true;
    group.add(hull);
    bodyMeshes.push(hull);

    const cabFrame = new THREE.Mesh(swatCabFrameGeo, paintMat);
    cabFrame.castShadow = true;
    group.add(cabFrame);
    bodyMeshes.push(cabFrame);

    for (const xSide of [-1, 1]) {
      const doorArmor = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 1.5), paintMat);
      doorArmor.position.set(xSide * 1.1, 1.28, 1.0);
      group.add(doorArmor);
      bodyMeshes.push(doorArmor);
    }

    // SWAT armored cockpit interior + visible tactical driver & co-driver
    const swatDash = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.45, 0.48), darkTrimMat);
    swatDash.position.set(0, 1.42, 1.65);
    group.add(swatDash);

    for (const sx of [-0.55, 0.55]) {
      const seat = buildBucketSeat();
      seat.position.set(sx, 1.12, 0.85);
      group.add(seat);
    }
    const coDriver = buildSeatedDriverFigure('police', seed + 11);
    coDriver.position.set(-0.55, 1.14, 0.88);
    driverGroup.position.set(0.55, 1.14, 0.88);
    steeringWheel.position.set(0.55, 1.54, 1.36);
    group.add(coDriver, driverGroup, steeringWheel);

    const visorGlass = new THREE.Mesh(swatCabGlassGeo, glassMat);
    visorGlass.renderOrder = 2;
    group.add(visorGlass);

    for (const xSide of [-1, 1]) {
      for (const pz of [-1.9, -0.7]) {
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.62), glassMat);
        port.position.set(xSide * (width * 0.5 + 0.01), 1.82, pz);
        port.renderOrder = 2;
        group.add(port);
      }
      const board = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 3.4, 5, 10), darkTrimMat);
      board.rotation.x = Math.PI / 2;
      board.position.set(xSide * (width * 0.5 + 0.08), 0.58, -0.2);
      group.add(board);
    }

    const ram = new THREE.Mesh(bullbarGeo, darkTrimMat);
    ram.scale.set(1.42, 1.35, 1.4);
    ram.position.set(0, 0.08, length * 0.5 - 0.02);
    group.add(ram);

    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.62, 0.28, 18), darkTrimMat);
    cupola.position.set(0, 2.46, -0.65);
    group.add(cupola);
  } else {
    // Sculpted passenger vehicles: Sports, Muscle, Sedan, SUV, Police Cruiser
    const isSports = kind === 'sports';
    const isMuscle = kind === 'muscle';
    const isSuv = kind === 'suv';
    const isPolice = kind === 'police';

    length = isSports ? 4.76 : isSuv ? 5.0 : 4.8;
    width = isSports ? 2.14 : isSuv ? 2.12 : 2.04;
    height = isSports ? 1.38 : isSuv ? 1.9 : 1.55;
    wheelScale = isSuv ? 1.15 : 0.98;

    const bodyGeo = isSports ? sportsBodyGeo : isMuscle ? muscleBodyGeo : isSuv ? suvBodyGeo : sedanBodyGeo;
    const frameGeo = isSports
      ? sportsPillarFrameGeo
      : isMuscle
        ? musclePillarFrameGeo
        : isSuv
          ? suvPillarFrameGeo
          : sedanPillarFrameGeo;
    const glassGeo = isSports ? sportsGlassGeo : isMuscle ? muscleGlassGeo : isSuv ? suvGlassGeo : sedanGlassGeo;

    // 1. Main sculpted lower body with open recessed cockpit floor tub
    const lower = new THREE.Mesh(bodyGeo, paintMat);
    lower.castShadow = true;
    lower.receiveShadow = true;
    group.add(lower);
    bodyMeshes.push(lower);

    // 2. Side door skins (closing the left & right door flanks up to the window beltline)
    const beltY = isSports ? 0.91 : isSuv ? 1.18 : 1.0;
    const floorY = isSports ? 0.54 : isSuv ? 0.68 : 0.58;
    const doorH = beltY - floorY + 0.04;
    const doorLen = isSuv ? 2.85 : isSports ? 1.85 : 2.1;
    const doorZ = isSuv ? -0.38 : -0.1;
    for (const xSide of [-1, 1]) {
      const doorSkin = new THREE.Mesh(new THREE.BoxGeometry(0.11, doorH, doorLen), paintMat);
      doorSkin.position.set(xSide * (width * 0.5 - 0.08), floorY + doorH * 0.5, doorZ);
      doorSkin.castShadow = true;
      group.add(doorSkin);
      bodyMeshes.push(doorSkin);
    }

    // 3. Open-window A/B/C pillar frame + roof arch (with side window holes cut out!)
    const pillarMat = isPolice ? darkTrimMat : paintMat;
    const pillarFrame = new THREE.Mesh(frameGeo, pillarMat);
    pillarFrame.castShadow = true;
    group.add(pillarFrame);
    bodyMeshes.push(pillarFrame);

    // 4. Detailed Cockpit Interior: Carpet floor, dashboard, glowing instrument cluster, center console, 2 bucket seats, steering wheel, and Seated Driver!
    const seatY = floorY + 0.05;
    const seatZ = isSports ? -0.22 : isSuv ? -0.12 : -0.16;
    const driverX = 0.43; // Left-hand drive in +Z forward vehicle coordinate frame

    const dashZ = isSports ? 0.62 : isSuv ? 0.85 : 0.72;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(width - 0.42, 0.34, 0.42), darkTrimMat);
    dash.position.set(0, beltY - 0.1, dashZ);
    group.add(dash);

    const cluster = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.08), dashClusterMat);
    cluster.position.set(driverX, beltY + 0.04, dashZ - 0.14);
    group.add(cluster);

    const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.15), darkTrimMat);
    consoleBox.position.set(0, floorY + 0.11, seatZ + 0.2);
    group.add(consoleBox);

    // Driver & Passenger sculpted bucket seats
    for (const sx of [-driverX, driverX]) {
      const seat = buildBucketSeat();
      seat.position.set(sx, seatY, seatZ);
      group.add(seat);
    }

    // Rear bench seat in Sedans, Police Cruisers, and SUVs
    if (!isSports) {
      const rearBench = new THREE.Mesh(new THREE.BoxGeometry(width - 0.52, 0.45, 0.52), leatherSeatMat);
      rearBench.position.set(0, seatY + 0.18, seatZ - 0.88);
      group.add(rearBench);
    }

    // Position the visible 3D Driver & Steering Wheel inside the driver's bucket seat
    driverGroup.position.set(driverX, seatY + 0.03, seatZ + 0.02);
    steeringWheel.position.set(driverX, seatY + 0.41, seatZ + 0.48);
    group.add(driverGroup, steeringWheel);

    // Police partner officer in passenger seat for 2-man patrol units
    if (isPolice && seed % 2 === 0) {
      const partner = buildSeatedDriverFigure('police', seed + 5);
      partner.position.set(-driverX, seatY + 0.03, seatZ + 0.02);
      group.add(partner);
    }

    // 5. Crystal-clear transparent wraparound glass windshield & side windows
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.renderOrder = 2;
    group.add(glass);

    // Front recessed intake grille
    const grilleH = isSports ? 0.24 : isSuv ? 0.42 : 0.3;
    const grille = new THREE.Mesh(new THREE.CapsuleGeometry(grilleH * 0.45, width * 0.46, 5, 10), grilleMat);
    grille.rotation.z = Math.PI / 2;
    grille.position.set(0, isSuv ? 0.8 : 0.62, length * 0.5 - 0.02);
    group.add(grille);

    // Sculpted aerodynamic side mirrors
    for (const xSide of [-1, 1]) {
      const mirror = new THREE.Mesh(sideMirrorGeo, isPolice ? darkTrimMat : paintMat);
      mirror.position.set(xSide * (width * 0.5 + 0.06), isSuv ? 1.3 : 1.06, isSports ? 0.45 : 0.58);
      group.add(mirror);
    }

    // Twin chrome exhaust pipes
    for (const ex of [-0.54, 0.54]) {
      const pipe = new THREE.Mesh(exhaustTipGeo, chromeMat);
      pipe.position.set(ex, 0.42, -length * 0.5 - 0.02);
      group.add(pipe);
    }

    // Police livery accents + curved tubular push bar
    if (isPolice) {
      const noseWrap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.46, 1.32), darkTrimMat);
      noseWrap.position.set(0, 0.74, length * 0.5 - 0.72);
      group.add(noseWrap);
      const rearWrap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.46, 1.1), darkTrimMat);
      rearWrap.position.set(0, 0.76, -length * 0.5 + 0.62);
      group.add(rearWrap);

      const bullbar = new THREE.Mesh(bullbarGeo, darkTrimMat);
      bullbar.position.set(0, 0.02, length * 0.5 + 0.04);
      group.add(bullbar);
    }

    if (isSports) {
      const wingBlade = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, width - 0.22, 4, 10), darkTrimMat);
      wingBlade.rotation.z = Math.PI / 2;
      wingBlade.scale.set(1, 0.65, 2.8);
      wingBlade.position.set(0, 1.24, -length * 0.5 + 0.34);
      group.add(wingBlade);
      for (const sx of [-0.62, 0.62]) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.28, 8), darkTrimMat);
        strut.position.set(sx, 1.08, -length * 0.5 + 0.36);
        strut.rotation.x = 0.22;
        group.add(strut);
      }
    }

    if (isMuscle) {
      const scoop = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.78, 6, 12), darkTrimMat);
      scoop.rotation.x = Math.PI / 2;
      scoop.scale.set(1.4, 0.55, 1.0);
      scoop.position.set(0, 1.08, 1.18);
      group.add(scoop);
    }

    if (isSuv) {
      for (const rx of [-0.74, 0.74]) {
        const rail = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 2.5, 5, 8), chromeMat);
        rail.rotation.x = Math.PI / 2;
        rail.position.set(rx, 1.94, -0.55);
        group.add(rail);
      }
    }
  }

  // Flashing curved polycarbonate police lightbar for police & SWAT
  let lightBarRed: THREE.Mesh | undefined;
  let lightBarBlue: THREE.Mesh | undefined;
  if (kind === 'police' || kind === 'swat') {
    const barY = kind === 'swat' ? 2.38 : 1.66;
    const barZ = kind === 'swat' ? 0.95 : -0.18;
    const base = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 1.18, 4, 10), darkTrimMat);
    base.rotation.z = Math.PI / 2;
    base.position.set(0, barY, barZ);
    group.add(base);

    const redMat = new THREE.MeshStandardMaterial({
      color: 0xff2233,
      emissive: 0xff1122,
      emissiveIntensity: 3.4,
      roughness: 0.14,
    });
    const blueMat = new THREE.MeshStandardMaterial({
      color: 0x2277ff,
      emissive: 0x1166ff,
      emissiveIntensity: 3.4,
      roughness: 0.14,
    });
    lightBarRed = new THREE.Mesh(lightBarDomeGeo, redMat);
    lightBarRed.position.set(-0.34, barY + 0.06, barZ);
    lightBarBlue = new THREE.Mesh(lightBarDomeGeo, blueMat);
    lightBarBlue.position.set(0.34, barY + 0.06, barZ);
    group.add(lightBarRed, lightBarBlue);
  }

  // Sculpted curved projector headlights & LED taillight blades
  const lightY = kind === 'bus' ? 1.05 : kind === 'tanker' ? 1.12 : kind === 'suv' ? 0.96 : kind === 'swat' ? 1.2 : 0.76;
  const lightX = width * 0.35;
  const frontZ = kind === 'tanker' ? 5.6 : length * 0.5 - 0.02;
  const rearZ = kind === 'tanker' ? -5.55 : -length * 0.5 + 0.02;

  for (const xSign of [-1, 1]) {
    const hl = new THREE.Mesh(lensSphereGeo, headlightMat);
    hl.scale.set(1.45, 0.7, 0.55);
    hl.position.set(xSign * lightX, lightY, frontZ);
    group.add(hl);
    headlights.push(hl);

    const tl = new THREE.Mesh(lensSphereGeo, taillightMat);
    tl.scale.set(1.65, 0.65, 0.5);
    tl.position.set(xSign * lightX, lightY + 0.05, rearZ);
    group.add(tl);
    taillights.push(tl);
  }

  if (kind === 'bus' || kind === 'tanker') {
    for (const xSign of [-1, 1]) {
      const marker = new THREE.Mesh(lensSphereGeo, amberLightMat);
      marker.scale.set(0.35, 0.45, 0.9);
      marker.position.set(xSign * (width * 0.5), 1.1, 0);
      group.add(marker);
    }
  }

  // Multi-spoke sculpted wheels + flared wheel-arch moldings
  const wheelY = 0.41 * wheelScale;
  const wheelX = width * 0.5 - 0.05;
  const wheelZs =
    kind === 'tanker'
      ? [length * 0.38, -length * 0.18, -length * 0.38]
      : kind === 'bus'
        ? [length * 0.34, -length * 0.32]
        : [length * 0.31, -length * 0.31];

  const isSportyWheel = kind === 'sports' || kind === 'muscle' || kind === 'police';
  for (const wz of wheelZs) {
    for (const xSign of [-1, 1] as const) {
      const w = createWheel(wheelScale, isSportyWheel, xSign);
      w.position.set(xSign * wheelX, wheelY, wz);
      group.add(w);
      wheels.push(w);

      const arch = new THREE.Mesh(wheelArchGeo, darkTrimMat);
      arch.scale.setScalar(wheelScale * 1.04);
      arch.position.set(xSign * (width * 0.5 - 0.01), wheelY, wz);
      group.add(arch);
    }
  }

  addContactShadow(group, width, length, textures.contactShadow);

  return {
    group,
    wheels,
    bodyMeshes,
    driverGroup,
    protagonistDriverMesh,
    npcDriverMesh,
    steeringWheel,
    lightBarRed,
    lightBarBlue,
    headlights,
    taillights,
    length,
    width,
    height,
  };
}

/**
 * Builds a realistic, smoothly contoured multi-polygon humanoid (Protagonist, Police, or Civilian)
 * with anatomical torso, rounded limbs, hair/cap, and sculpted 3D weapons.
 */
export function buildHumanoidModel(
  role: 'protagonist' | 'police' | 'civilian',
  textures: ProceduralTexturePack,
  seed = 0,
): HumanoidRig {
  const group = new THREE.Group();

  const skinColor = role === 'protagonist' ? 0xd9a07b : [0xe0ac88, 0xc6865c, 0x8d5524, 0xf1c29b][Math.abs(seed) % 4];
  const shirtColor =
    role === 'protagonist'
      ? 0x0ea5e9
      : role === 'police'
        ? 0x1e3a8a
        : [0xf43f5e, 0xf59e0b, 0x10b981, 0xe2e8f0, 0x8b5cf6][Math.abs(seed) % 5];
  const pantsColor = role === 'protagonist' ? 0x1e293b : role === 'police' ? 0x0f172a : 0x334155;

  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.68 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.74 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.82 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.58 });
  const hairMat = new THREE.MeshStandardMaterial({
    color: role === 'protagonist' ? 0x241712 : [0x1c1917, 0x451a03, 0x78350f, 0x27272a][Math.abs(seed) % 4],
    roughness: 0.76,
  });

  const torso = new THREE.Mesh(humanTorsoGeo, shirtMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);

  const pelvis = new THREE.Mesh(humanPelvisGeo, pantsMat);
  pelvis.position.y = 0.87;
  group.add(pelvis);

  const neck = new THREE.Mesh(humanNeckGeo, skinMat);
  neck.position.y = 1.48;
  group.add(neck);

  if (role === 'police') {
    const vest = new THREE.Mesh(humanTorsoGeo, darkTrimMat);
    vest.position.y = 1.17;
    vest.scale.set(1.07, 0.76, 1.16);
    group.add(vest);
    const badge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.015, 10),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.88 }),
    );
    badge.rotation.x = Math.PI / 2;
    badge.position.set(-0.08, 1.25, 0.16);
    group.add(badge);
  } else if (role === 'protagonist') {
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.032, 8, 16, Math.PI * 1.45),
      new THREE.MeshStandardMaterial({ color: 0xff4fa3, roughness: 0.6 }),
    );
    collar.rotation.x = Math.PI / 2;
    collar.rotation.z = Math.PI * 0.78;
    collar.position.set(0, 1.43, 0.01);
    group.add(collar);
  }

  const head = new THREE.Mesh(humanHeadGeo, skinMat);
  head.position.y = 1.64;
  head.castShadow = true;
  group.add(head);

  if (role === 'police') {
    const capMat = new THREE.MeshStandardMaterial({ color: 0x172554, roughness: 0.48 });
    const crown = new THREE.Mesh(policeCapCrownGeo, capMat);
    crown.position.set(0, 1.76, -0.01);
    const brim = new THREE.Mesh(policeCapBrimGeo, darkTrimMat);
    brim.position.set(0, 1.72, 0.06);
    brim.rotation.x = 0.14;
    group.add(crown, brim);
  } else {
    const hair = new THREE.Mesh(humanHairCapGeo, hairMat);
    hair.position.set(0, 1.66, -0.01);
    group.add(hair);
  }

  if (role === 'protagonist') {
    const shades = new THREE.Mesh(
      sunglassesGeo,
      new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.08, metalness: 0.9 }),
    );
    shades.position.set(0, 1.655, 0.01);
    group.add(shades);
  }

  const buildLeg = (side: -1 | 1): THREE.Group => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.115, 0.86, 0);
    const thigh = new THREE.Mesh(humanThighGeo, pantsMat);
    thigh.position.y = -0.2;
    thigh.castShadow = true;
    const shin = new THREE.Mesh(humanShinGeo, pantsMat);
    shin.position.y = -0.54;
    shin.castShadow = true;
    const shoe = new THREE.Mesh(humanShoeGeo, shoeMat);
    shoe.position.set(0, -0.79, 0.045);
    leg.add(thigh, shin, shoe);
    return leg;
  };
  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  group.add(leftLeg, rightLeg);

  const buildArm = (side: -1 | 1): THREE.Group => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.275, 1.38, 0);
    const shoulder = new THREE.Mesh(humanShoulderGeo, shirtMat);
    const upper = new THREE.Mesh(humanUpperArmGeo, shirtMat);
    upper.position.y = -0.14;
    upper.castShadow = true;
    const forearm = new THREE.Mesh(humanForearmGeo, role === 'police' ? shirtMat : skinMat);
    forearm.position.y = -0.39;
    const hand = new THREE.Mesh(humanHandGeo, skinMat);
    hand.position.y = -0.54;
    arm.add(shoulder, upper, forearm, hand);
    return arm;
  };
  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  group.add(leftArm, rightArm);

  const weaponAnchor = new THREE.Group();
  weaponAnchor.position.set(0, -0.52, 0.12);
  rightArm.add(weaponAnchor);

  const makeWeapon = (id: WeaponId): THREE.Group => {
    const wg = new THREE.Group();
    if (id === 'pistol') {
      const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.22, 4, 10), gunMetalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.04, 0.09);
      const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.09, 4, 8), darkTrimMat);
      grip.position.set(0, -0.03, 0);
      grip.rotation.x = 0.22;
      wg.add(barrel, grip);
    } else if (id === 'smg') {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.26, 4, 10), gunMetalMat);
      body.rotation.x = Math.PI / 2;
      body.position.set(0, 0.04, 0.1);
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 10), gunMetalMat);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(0, 0.04, 0.28);
      const mag = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.18, 4, 8), darkTrimMat);
      mag.position.set(0, -0.09, 0.16);
      mag.rotation.x = -0.18;
      wg.add(body, muzzle, mag);
    } else if (id === 'rifle') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.78, 12), gunMetalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.055, 0.28);
      const receiver = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.3, 4, 10), gunMetalMat);
      receiver.rotation.x = Math.PI / 2;
      receiver.position.set(0, 0.04, 0.12);
      const stock = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.2, 4, 8), darkTrimMat);
      stock.rotation.x = Math.PI / 2;
      stock.position.set(0, 0.02, -0.16);
      const mag = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.19, 4, 8), darkTrimMat);
      mag.position.set(0, -0.08, 0.2);
      mag.rotation.x = -0.26;
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 10), darkTrimMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.1, 0.12);
      wg.add(barrel, receiver, stock, mag, scope);
    } else if (id === 'shotgun') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.72, 12), gunMetalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.06, 0.25);
      const pump = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.18, 4, 10), gunWoodMat);
      pump.rotation.x = Math.PI / 2;
      pump.position.set(0, 0.02, 0.34);
      const stock = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.24, 4, 10), gunWoodMat);
      stock.rotation.x = Math.PI / 2;
      stock.position.set(0, 0.01, -0.14);
      wg.add(barrel, pump, stock);
    } else {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 1.16, 16), rpgGreenMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, 0.1, 0.14);
      const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.085, 0.2, 14), darkTrimMat);
      flare.rotation.x = Math.PI / 2;
      flare.position.set(0, 0.1, -0.52);
      const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.32, 14), rpgGreenMat);
      warhead.rotation.x = Math.PI / 2;
      warhead.position.set(0, 0.1, 0.88);
      wg.add(tube, flare, warhead);
    }
    wg.visible = false;
    return wg;
  };

  const weaponMeshes: Record<WeaponId, THREE.Group> = {
    pistol: makeWeapon('pistol'),
    smg: makeWeapon('smg'),
    rifle: makeWeapon('rifle'),
    shotgun: makeWeapon('shotgun'),
    rpg: makeWeapon('rpg'),
  };
  Object.values(weaponMeshes).forEach((m) => weaponAnchor.add(m));
  if (role === 'police') weaponMeshes.pistol.visible = true;

  addContactShadow(group, 0.85, 0.85, textures.contactShadow);

  return { group, leftLeg, rightLeg, leftArm, rightArm, weaponAnchor, weaponMeshes };
}

/**
 * Builds a sleek, aerodynamic multi-polygon Police Helicopter (Bell/Airbus H145 silhouette)
 * with curved transparent bubble cockpit, visible seated pilot, tapered tail boom, and Fenestron tail duct.
 */
export function buildPoliceChopper(): ChopperRig {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.24,
    metalness: 0.64,
    clearcoat: 0.88,
  });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.22 });

  // Sculpted fuselage (leaving front cockpit open for pilot + transparent bubble canopy)
  const hullPts = [
    new THREE.Vector2(0.01, -2.2),
    new THREE.Vector2(0.42, -2.05),
    new THREE.Vector2(0.82, -1.25),
    new THREE.Vector2(1.04, 0.0),
    new THREE.Vector2(1.02, 0.95),
    new THREE.Vector2(0.75, 1.15),
    new THREE.Vector2(0.01, 1.15),
  ];
  const hullGeo = new THREE.LatheGeometry(hullPts, 24);
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.scale(0.95, 0.86, 1.0);
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, bodyMat);
  hull.castShadow = true;
  group.add(hull);

  // Lower chin tub beneath bubble cockpit + visible seated helicopter pilot!
  const chin = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.4, 6, 14), bodyMat);
  chin.rotation.x = Math.PI / 2;
  chin.scale.set(1.3, 0.48, 1.0);
  chin.position.set(0, -0.42, 1.65);
  group.add(chin);

  const pilot = buildSeatedDriverFigure('police', 99);
  pilot.position.set(0.28, -0.35, 1.55);
  const coPilot = buildSeatedDriverFigure('police', 101);
  coPilot.position.set(-0.28, -0.35, 1.55);
  group.add(pilot, coPilot);

  // Curved wraparound transparent bubble glass cockpit
  const canopyGeo = new THREE.SphereGeometry(0.96, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.58);
  canopyGeo.scale(0.96, 0.82, 1.42);
  const canopy = new THREE.Mesh(canopyGeo, glassMat);
  canopy.position.set(0, 0.1, 1.45);
  canopy.rotation.x = 0.24;
  canopy.renderOrder = 2;
  group.add(canopy);

  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.01, 0.96, 2.2, 22), whiteMat);
  stripe.rotation.x = Math.PI / 2;
  stripe.scale.set(0.96, 1.0, 0.28);
  stripe.position.set(0, -0.18, 0.0);
  group.add(stripe);

  const cowl = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 1.55, 8, 16), bodyMat);
  cowl.rotation.x = Math.PI / 2;
  cowl.scale.set(1.15, 0.8, 1.0);
  cowl.position.set(0, 0.82, -0.3);
  group.add(cowl);

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.44, 4.9, 16), bodyMat);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0.2, -4.1);
  group.add(tail);

  const finShape = new THREE.Shape();
  finShape.moveTo(0, -0.5);
  finShape.lineTo(0.85, -0.5);
  finShape.lineTo(0.35, 1.15);
  finShape.lineTo(-0.25, 1.15);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.03,
    bevelSegments: 2,
  });
  finGeo.translate(0, 0, -0.06);
  finGeo.rotateY(Math.PI / 2);
  const fin = new THREE.Mesh(finGeo, whiteMat);
  fin.position.set(0, 0.45, -6.1);
  group.add(fin);

  const tailDuct = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.09, 10, 20), bodyMat);
  tailDuct.rotation.y = Math.PI / 2;
  tailDuct.position.set(0, 0.42, -6.32);
  group.add(tailDuct);

  const hStab = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 1.8, 4, 8), whiteMat);
  hStab.rotation.z = Math.PI / 2;
  hStab.scale.set(1, 0.65, 3.2);
  hStab.position.set(0, 0.24, -4.75);
  group.add(hStab);

  const skidCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, -1.9),
    new THREE.Vector3(0, 0, 1.5),
    new THREE.Vector3(0, 0.14, 2.05),
    new THREE.Vector3(0, 0.38, 2.35),
  ]);
  const skidGeo = new THREE.TubeGeometry(skidCurve, 16, 0.055, 10, false);
  for (const sx of [-1.02, 1.02]) {
    const skid = new THREE.Mesh(skidGeo, darkTrimMat);
    skid.position.set(sx, -1.16, 0.15);
    group.add(skid);
    for (const sz of [-0.7, 0.95]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 8), darkTrimMat);
      strut.position.set(sx * 0.78, -0.82, sz);
      strut.rotation.z = sx > 0 ? 0.36 : -0.36;
      group.add(strut);
    }
  }

  const flir = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), darkTrimMat);
  flir.position.set(0, -0.68, 2.25);
  group.add(flir);

  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 1.24, 0.05);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.45, 14), darkTrimMat);
  const hubCap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), chromeMat);
  hubCap.scale.set(1, 0.55, 1);
  hubCap.position.y = 0.22;
  mainRotor.add(mast, hubCap);

  const bladeGeo = new THREE.CapsuleGeometry(0.06, 4.3, 4, 8);
  bladeGeo.rotateZ(Math.PI / 2);
  bladeGeo.scale(1, 0.38, 1.8);
  for (let b = 0; b < 4; b++) {
    const holder = new THREE.Group();
    holder.rotation.y = (b / 4) * Math.PI * 2;
    const blade = new THREE.Mesh(bladeGeo, darkTrimMat);
    blade.position.x = 2.28;
    blade.position.y = 0.16;
    holder.add(blade);
    mainRotor.add(holder);
  }
  group.add(mainRotor);

  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.08, 0.42, -6.32);
  for (let t = 0; t < 2; t++) {
    const tBlade = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.86, 4, 8), darkTrimMat);
    tBlade.rotation.x = (t / 2) * Math.PI;
    tailRotor.add(tBlade);
  }
  group.add(tailRotor);

  const coneGeo = new THREE.ConeGeometry(5.5, 26, 16, 1, true);
  coneGeo.translate(0, -13, 0);
  const searchlightCone = new THREE.Mesh(
    coneGeo,
    new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.05, depthWrite: false }),
  );
  searchlightCone.visible = false;
  group.add(searchlightCone);

  return { group, mainRotor, tailRotor, searchlightCone };
}
