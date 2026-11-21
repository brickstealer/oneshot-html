import type {
  AnthillMound,
  CraterData,
  FactionId,
  FoodSite,
  Fortification,
  FortificationType,
  TrenchSegment,
  TunnelChamber,
  TunnelPath,
  Vec3,
  WorldData,
} from './types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(ix: number, iz: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise2D(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smoothstep(x - ix);
  const fz = smoothstep(z - iz);

  const v00 = hash2D(ix, iz, seed);
  const v10 = hash2D(ix + 1, iz, seed);
  const v01 = hash2D(ix, iz + 1, seed);
  const v11 = hash2D(ix + 1, iz + 1, seed);

  const vx0 = v00 + (v10 - v00) * fx;
  const vx1 = v01 + (v11 - v01) * fx;
  return vx0 + (vx1 - vx0) * fz;
}

export function fbm2D(x: number, z: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += (valueNoise2D(x * freq, z * freq, seed + i * 97) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.04;
  }
  return sum / norm;
}

function distToSegmentSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) {
    const ex = px - ax;
    const ez = pz - az;
    return ex * ex + ez * ez;
  }
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + t * dx;
  const cz = az + t * dz;
  const ex = px - cx;
  const ez = pz - cz;
  return ex * ex + ez * ez;
}

function buildZigZagTrench(
  rng: () => number,
  faction: FactionId,
  line: 'front' | 'support',
  baseX: number,
  zSpan: number,
): TrenchSegment {
  const pts: Vec3[] = [];
  const segments = line === 'front' ? 9 : 7;
  const stepZ = (zSpan * 2) / segments;
  const zigAmp = line === 'front' ? 2.4 : 1.7;

  for (let i = 0; i <= segments; i++) {
    const z = -zSpan + i * stepZ;
    const zig = (i % 2 === 0 ? 1 : -1) * zigAmp * (0.65 + rng() * 0.55);
    const curveBend = Math.cos((z / zSpan) * Math.PI * 0.5) * (faction === 'red' ? 2.8 : -2.8);
    const x = baseX + zig + curveBend + (rng() - 0.5) * 1.4;
    pts.push({ x, y: 0, z });
  }

  return {
    faction,
    line,
    points: pts,
    width: line === 'front' ? 2.3 : 2.0,
    depth: line === 'front' ? 1.55 : 1.25,
  };
}

export function generateWorld(seed: number): WorldData {
  const safeSeed = (Math.floor(seed) || 1337) >>> 0;
  const rng = mulberry32(safeSeed);

  const worldRadius = 115;
  const playableRadius = 64;

  // Two opposing anthills with slight organic Z offset
  const redZ = (rng() - 0.5) * 14;
  const blackZ = (rng() - 0.5) * 14;
  const redX = -39 - rng() * 5;
  const blackX = 39 + rng() * 5;

  const redRadius = 11.5 + rng() * 2.2;
  const blackRadius = 11.5 + rng() * 2.2;
  const redHeight = 7.4 + rng() * 1.6;
  const blackHeight = 7.4 + rng() * 1.6;

  // Build WWI zig-zag trenches
  const trenches: TrenchSegment[] = [
    buildZigZagTrench(rng, 'red', 'front', -12.5 - rng() * 2.5, 32),
    buildZigZagTrench(rng, 'red', 'support', -24.5 - rng() * 2.0, 26),
    buildZigZagTrench(rng, 'black', 'front', 12.5 + rng() * 2.5, 32),
    buildZigZagTrench(rng, 'black', 'support', 24.5 + rng() * 2.0, 26),
  ];

  // Shell / formic-acid craters across No-Man's-Land and flanks
  const craters: CraterData[] = [];
  const craterCount = 22;
  for (let i = 0; i < craterCount; i++) {
    const inCenter = i < 15;
    const cx = inCenter ? (rng() - 0.5) * 24 : (rng() - 0.5) * 68;
    const cz = (rng() - 0.5) * 62;
    // Keep craters away from anthill centers
    const dRed = Math.hypot(cx - redX, cz - redZ);
    const dBlack = Math.hypot(cx - blackX, cz - blackZ);
    if (dRed < redRadius + 3 || dBlack < blackRadius + 3) continue;
    craters.push({
      x: cx,
      z: cz,
      radius: 1.9 + rng() * 2.8,
      depth: 0.75 + rng() * 0.95,
    });
  }

  // Portal locations on the front-facing slope of each anthill
  const redPortalX = redX + 4.4;
  const redPortalZ = redZ + (rng() - 0.5) * 2.0;
  const redExitX = redX - 4.8;
  const redExitZ = redZ + (rng() > 0.5 ? 5.2 : -5.2);

  const blackPortalX = blackX - 4.4;
  const blackPortalZ = blackZ + (rng() - 0.5) * 2.0;
  const blackExitX = blackX + 4.8;
  const blackExitZ = blackZ + (rng() > 0.5 ? -5.2 : 5.2);

  const portalList = [
    { x: redPortalX, z: redPortalZ, r: 2.65 },
    { x: redExitX, z: redExitZ, r: 2.4 },
    { x: blackPortalX, z: blackPortalZ, r: 2.65 },
    { x: blackExitX, z: blackExitZ, r: 2.4 },
  ];

  const portalMaskAt = (x: number, z: number): number => {
    let maxMask = 0;
    for (let i = 0; i < portalList.length; i++) {
      const p = portalList[i];
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r) {
        const m = 1 - d / p.r;
        if (m > maxMask) maxMask = m;
      }
    }
    return maxMask;
  };

  const trenchDepthAt = (x: number, z: number): { depth: number; rim: number } => {
    let maxDepth = 0;
    let maxRim = 0;
    for (let i = 0; i < trenches.length; i++) {
      const tr = trenches[i];
      const pts = tr.points;
      const w = tr.width;
      const wRim = w * 2.2;
      for (let j = 0; j < pts.length - 1; j++) {
        const a = pts[j];
        const b = pts[j + 1];
        const minX = Math.min(a.x, b.x) - wRim;
        const maxX = Math.max(a.x, b.x) + wRim;
        if (x < minX || x > maxX) continue;
        const minZ = Math.min(a.z, b.z) - wRim;
        const maxZ = Math.max(a.z, b.z) + wRim;
        if (z < minZ || z > maxZ) continue;

        const dSq = distToSegmentSq(x, z, a.x, a.z, b.x, b.z);
        if (dSq < wRim * wRim) {
          const d = Math.sqrt(dSq);
          if (d < w) {
            const k = smoothstep(1 - d / w);
            const dep = tr.depth * k;
            if (dep > maxDepth) maxDepth = dep;
          } else {
            const t = (d - w) / (wRim - w);
            const r = Math.sin(t * Math.PI) * 0.42;
            if (r > maxRim) maxRim = r;
          }
        }
      }
    }
    return { depth: maxDepth, rim: maxRim };
  };

  const baseHeightAt = (x: number, z: number): number => {
    // Organic rolling hills
    const n1 = fbm2D(x * 0.022, z * 0.022, safeSeed, 4) * 3.8;
    const n2 = fbm2D(x * 0.075, z * 0.075, safeSeed + 511, 2) * 0.65;
    let h = n1 + n2;

    // Gentle valley depression in No-Man's-Land so anthills overlook the front
    const centerFactor = Math.exp(-(x * x) / (26 * 26));
    h -= centerFactor * 1.15;

    // Natural enclosing ridges around outer perimeter (beyond playableRadius)
    const distFromOrigin = Math.hypot(x, z);
    if (distFromOrigin > playableRadius - 6) {
      const edgeT = Math.min(1, (distFromOrigin - (playableRadius - 6)) / 42);
      const ridgeNoise = 0.65 + 0.55 * valueNoise2D(x * 0.05, z * 0.05, safeSeed + 909);
      h += edgeT * edgeT * 18.0 * ridgeNoise;
    }

    // Anthill 1 (Red - West)
    const dRed = Math.hypot(x - redX, z - redZ);
    if (dRed < redRadius * 1.65) {
      const t = Math.max(0, 1 - dRed / (redRadius * 1.65));
      const dome = Math.pow(t, 1.55) * redHeight;
      const ridge = fbm2D(x * 0.25, z * 0.25, safeSeed + 201, 2) * 0.55 * t;
      h += dome + ridge;
    }

    // Anthill 2 (Black - East)
    const dBlack = Math.hypot(x - blackX, z - blackZ);
    if (dBlack < blackRadius * 1.65) {
      const t = Math.max(0, 1 - dBlack / (blackRadius * 1.65));
      const dome = Math.pow(t, 1.55) * blackHeight;
      const ridge = fbm2D(x * 0.25, z * 0.25, safeSeed + 307, 2) * 0.55 * t;
      h += dome + ridge;
    }

    // Carve craters
    for (let i = 0; i < craters.length; i++) {
      const c = craters[i];
      const dx = x - c.x;
      const dz = z - c.z;
      const dSq = dx * dx + dz * dz;
      const outerR = c.radius * 1.45;
      if (dSq < outerR * outerR) {
        const d = Math.sqrt(dSq);
        if (d < c.radius) {
          const bowl = Math.cos((d / c.radius) * Math.PI * 0.5);
          h -= bowl * c.depth;
        } else {
          const rimT = (d - c.radius) / (outerR - c.radius);
          h += Math.sin(rimT * Math.PI) * c.depth * 0.28;
        }
      }
    }

    // Carve trenches + raised earthen parapet lips
    const tr = trenchDepthAt(x, z);
    h = h - tr.depth + tr.rim;

    return h;
  };

  const heightAt = (x: number, z: number): number => {
    let h = baseHeightAt(x, z);
    // Funnel depression smoothly into tunnel portals
    const pm = portalMaskAt(x, z);
    if (pm > 0) {
      h -= smoothstep(pm) * 2.4;
    }
    return h;
  };

  const isInTrench = (x: number, z: number): boolean => {
    return trenchDepthAt(x, z).depth > 0.45;
  };

  // Fill trench point Y values
  for (const tr of trenches) {
    for (const pt of tr.points) {
      pt.y = heightAt(pt.x, pt.z);
    }
  }

  const mounds: Record<FactionId, AnthillMound> = {
    red: {
      faction: 'red',
      x: redX,
      z: redZ,
      radius: redRadius,
      height: redHeight,
      portalPos: { x: redPortalX, y: baseHeightAt(redPortalX, redPortalZ) - 0.5, z: redPortalZ },
      exitPortalPos: { x: redExitX, y: baseHeightAt(redExitX, redExitZ) - 0.5, z: redExitZ },
    },
    black: {
      faction: 'black',
      x: blackX,
      z: blackZ,
      radius: blackRadius,
      height: blackHeight,
      portalPos: {
        x: blackPortalX,
        y: baseHeightAt(blackPortalX, blackPortalZ) - 0.5,
        z: blackPortalZ,
      },
      exitPortalPos: {
        x: blackExitX,
        y: baseHeightAt(blackExitX, blackExitZ) - 0.5,
        z: blackExitZ,
      },
    },
  };

  // Generate underground chambers & navigable tunnel splines for both anthills
  const chambers: TunnelChamber[] = [];
  const tunnels: TunnelPath[] = [];

  const buildAnthillUnderground = (faction: FactionId, mound: AnthillMound) => {
    const dir = faction === 'red' ? 1 : -1;
    const mx = mound.x;
    const mz = mound.z;

    const entry = mound.portalPos;
    const exit = mound.exitPortalPos;

    // Vaulted underground chambers positioned well beneath terrain surface
    const storageCenter: Vec3 = {
      x: mx + dir * 2.2,
      y: -7.2,
      z: mz - 3.6,
    };
    const queenCenter: Vec3 = {
      x: mx - dir * 1.5,
      y: -11.5,
      z: mz + 1.2,
    };
    const broodCenter: Vec3 = {
      x: mx + dir * 3.8,
      y: -9.8,
      z: mz + 5.8,
    };
    const barracksCenter: Vec3 = {
      x: mx + dir * 11.5,
      y: -8.6,
      z: mz - 1.5,
    };

    chambers.push(
      { id: `${faction}_queen`, faction, kind: 'queen', center: queenCenter, radius: 4.2 },
      { id: `${faction}_brood`, faction, kind: 'brood', center: broodCenter, radius: 3.4 },
      { id: `${faction}_storage`, faction, kind: 'storage', center: storageCenter, radius: 3.2 },
      { id: `${faction}_barracks`, faction, kind: 'barracks', center: barracksCenter, radius: 3.3 },
    );

    // Main navigable fly-through tunnel loop:
    // Surface burrow mouth -> descends smoothly -> storage -> queen chamber -> brood chamber -> climbs out exit burrow!
    tunnels.push({
      id: `${faction}_main_loop`,
      faction,
      radius: 1.85,
      isMainShaft: true,
      points: [
        { x: entry.x, y: entry.y - 2.35, z: entry.z },
        { x: entry.x - dir * 1.1, y: entry.y - 4.4, z: entry.z - 0.6 },
        { x: storageCenter.x + dir * 1.5, y: -5.8, z: storageCenter.z - 1.0 },
        { ...storageCenter },
        { x: (storageCenter.x + queenCenter.x) * 0.5 - dir * 2.5, y: -9.8, z: mz - 2.8 },
        { ...queenCenter },
        { x: (queenCenter.x + broodCenter.x) * 0.5, y: -11.0, z: mz + 4.4 },
        { ...broodCenter },
        { x: exit.x + dir * 1.4, y: -5.6, z: exit.z * 0.6 + broodCenter.z * 0.4 },
        { x: exit.x + dir * 0.4, y: exit.y - 4.3, z: exit.z },
        { x: exit.x, y: exit.y - 2.35, z: exit.z },
      ],
    });

    // Forward sapper / barracks gallery heading toward the front trenches
    tunnels.push({
      id: `${faction}_barracks_shaft`,
      faction,
      radius: 1.75,
      isMainShaft: false,
      points: [
        { ...storageCenter },
        { x: mx + dir * 6.8, y: -7.9, z: mz - 3.2 },
        { ...barracksCenter },
        { x: mx + dir * 15.8, y: -7.2, z: mz + 3.2 },
        { x: mx + dir * 10.5, y: -9.4, z: mz + 6.4 },
        { ...broodCenter },
      ],
    });
  };

  buildAnthillUnderground('red', mounds.red);
  buildAnthillUnderground('black', mounds.black);

  // Deep secret sapper tunnel creeping beneath No-Man's-Land connecting both barracks galleries!
  const redBarracks = chambers.find((c) => c.id === 'red_barracks')!.center;
  const blackBarracks = chambers.find((c) => c.id === 'black_barracks')!.center;
  tunnels.push({
    id: 'nomansland_sapper',
    faction: 'red',
    radius: 1.65,
    isMainShaft: false,
    points: [
      { ...redBarracks },
      { x: -12, y: -9.8, z: (redZ + blackZ) * 0.35 - 5.0 },
      { x: 0, y: -10.4, z: (redZ + blackZ) * 0.5 + (rng() - 0.5) * 6 },
      { x: 12, y: -9.6, z: (redZ + blackZ) * 0.35 + 4.5 },
      { ...blackBarracks },
    ],
  });

  // Generate fortifications along trenches and mound flanks
  const initialFortifications: Fortification[] = [];
  let fortId = 1;
  const fortTypesFront: FortificationType[] = [
    'sandbags',
    'barbed_thorns',
    'bunker',
    'sandbags',
    'mortar_nest',
  ];
  const fortTypesSupport: FortificationType[] = ['mortar_nest', 'watchtower', 'bunker', 'sandbags'];

  for (const tr of trenches) {
    const dirToEnemy = tr.faction === 'red' ? 1 : -1;
    const pts = tr.points;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const prev = pts[Math.max(0, i - 1)];
      const tz = next.z - prev.z;
      const tx = next.x - prev.x;
      const baseYaw = Math.atan2(dirToEnemy, 0) + (rng() - 0.5) * 0.35;
      const typePool = tr.line === 'front' ? fortTypesFront : fortTypesSupport;
      const type = typePool[(i + Math.floor(rng() * typePool.length)) % typePool.length];

      // Place sandbags/barbed wire slightly forward of trench lip, bunkers/mortars on rim
      const forwardOffset =
        type === 'barbed_thorns' ? dirToEnemy * 3.1 : type === 'sandbags' ? dirToEnemy * 1.9 : dirToEnemy * 1.4;
      const fx = p.x + forwardOffset + (tx * 0.05);
      const fz = p.z + (tz * 0.05);
      const fy = heightAt(fx, fz);
      const initialProg = 0.55 + rng() * 0.45;
      const maxHp = type === 'bunker' ? 150 : type === 'watchtower' ? 120 : 100;

      initialFortifications.push({
        id: fortId++,
        faction: tr.faction,
        type,
        x: fx,
        y: fy,
        z: fz,
        yaw: baseYaw,
        progress: initialProg,
        hp: maxHp * initialProg,
        maxHp,
        lastFireTime: -rng() * 5,
      });
    }
  }

  // Add 2 flanking watchtowers near each anthill
  for (const faction of ['red', 'black'] as FactionId[]) {
    const mound = mounds[faction];
    const dir = faction === 'red' ? 1 : -1;
    for (const side of [-1, 1]) {
      const fx = mound.x + dir * (mound.radius * 0.72);
      const fz = mound.z + side * (mound.radius * 0.78);
      initialFortifications.push({
        id: fortId++,
        faction,
        type: 'watchtower',
        x: fx,
        y: heightAt(fx, fz),
        z: fz,
        yaw: dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
        progress: 0.9,
        hp: 110,
        maxHp: 120,
        lastFireTime: 0,
      });
    }
  }

  // Resource / Food sites on northern and southern flanks
  const foodSites: FoodSite[] = [];
  const kinds: FoodSite['kind'][] = ['seeds', 'resin', 'beetle_shell'];
  for (let i = 0; i < 12; i++) {
    const sideZ = i % 2 === 0 ? 1 : -1;
    const fx = (rng() - 0.5) * 76;
    const fz = sideZ * (28 + rng() * 20);
    foodSites.push({
      id: i + 1,
      x: fx,
      y: heightAt(fx, fz),
      z: fz,
      amount: 100,
      maxAmount: 100,
      kind: kinds[i % kinds.length],
    });
  }

  return {
    seed: safeSeed,
    worldRadius,
    playableRadius,
    mounds,
    trenches,
    craters,
    foodSites,
    initialFortifications,
    tunnels,
    chambers,
    heightAt,
    portalMaskAt,
    isInTrench,
  };
}

/**
 * Catmull-Rom spline sampler (pure math, no Three.js dependency) for tunnel paths.
 */
export function sampleSpline(points: Vec3[], tRaw: number): { pos: Vec3; tangent: Vec3 } {
  const n = points.length;
  if (n === 0) {
    return { pos: { x: 0, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 } };
  }
  if (n === 1) {
    return { pos: { ...points[0] }, tangent: { x: 1, y: 0, z: 0 } };
  }

  const t = Math.max(0, Math.min(1, tRaw));
  const scaled = t * (n - 1);
  const seg = Math.min(n - 2, Math.floor(scaled));
  const u = scaled - seg;

  const p0 = points[Math.max(0, seg - 1)];
  const p1 = points[seg];
  const p2 = points[seg + 1];
  const p3 = points[Math.min(n - 1, seg + 2)];

  const u2 = u * u;
  const u3 = u2 * u;

  const evalAxis = (a: number, b: number, c: number, d: number) =>
    0.5 *
    (2 * b +
      (-a + c) * u +
      (2 * a - 5 * b + 4 * c - d) * u2 +
      (-a + 3 * b - 3 * c + d) * u3);

  const derivAxis = (a: number, b: number, c: number, d: number) =>
    0.5 *
    ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - d) * u + 3 * (-a + 3 * b - 3 * c + d) * u2);

  const pos: Vec3 = {
    x: evalAxis(p0.x, p1.x, p2.x, p3.x),
    y: evalAxis(p0.y, p1.y, p2.y, p3.y),
    z: evalAxis(p0.z, p1.z, p2.z, p3.z),
  };

  let tx = derivAxis(p0.x, p1.x, p2.x, p3.x);
  let ty = derivAxis(p0.y, p1.y, p2.y, p3.y);
  let tz = derivAxis(p0.z, p1.z, p2.z, p3.z);
  const len = Math.hypot(tx, ty, tz) || 1;
  tx /= len;
  ty /= len;
  tz /= len;

  return { pos, tangent: { x: tx, y: ty, z: tz } };
}
