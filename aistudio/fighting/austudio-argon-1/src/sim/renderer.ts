import { StuntSimulationEngine } from './engine';
import { Fighter, InteractiveProp, Platform } from './types';

/**
 * High-Craft Canvas2D Hong Kong Action Cinema Renderer
 * Renders multi-plane Hong Kong backdrops, neon signage, springy platforms,
 * breakable interactive props, anatomical articulated ragdoll fighters with clothing,
 * facial expressions, flowing belt sashes, particles, and stunt callouts.
 */
export function renderSimulationFrame(
  ctx: CanvasRenderingContext2D,
  engine: StuntSimulationEngine,
  viewportW: number,
  viewportH: number
): void {
  const { arena } = engine;
  const { biome } = arena;

  ctx.save();

  // 1. Sky & Atmospheric Backdrop
  const skyGrad = ctx.createLinearGradient(0, 0, 0, viewportH);
  skyGrad.addColorStop(0, biome.skyTop);
  skyGrad.addColorStop(1, biome.skyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, viewportW, viewportH);

  // Compute responsive world-to-screen transform
  const baseScale = Math.min(
    viewportW / arena.worldWidth,
    viewportH / arena.worldHeight
  );
  // On tall mobile screens, zoom in slightly on the action center so characters are large and clear
  const aspectBoost = viewportW < 640 ? 1.38 : 1.04;
  const zoom = baseScale * engine.camZoom * aspectBoost;

  const shakeMag = engine.cameraTrauma * engine.cameraTrauma * 16;
  const shakeX =
    shakeMag > 0.1 ? Math.sin(engine.time * 55) * shakeMag : 0;
  const shakeY =
    shakeMag > 0.1 ? Math.cos(engine.time * 63) * shakeMag : 0;

  ctx.translate(viewportW * 0.5 + shakeX, viewportH * 0.52 + shakeY);
  ctx.scale(zoom, zoom);
  ctx.translate(-engine.camX, -engine.camY);

  // 2. Parallax Hong Kong Skyline & Architectural Pillars
  renderBackdropArchitecture(ctx, engine);

  // 3. Platforms (Main floor, balconies, springy awnings, bamboo scaffolding)
  for (const plat of arena.platforms) {
    renderPlatform(ctx, plat, biome.floorColor, biome.floorTrimColor, biome.platformColor, biome.platformAccent);
  }

  // 4. Interactive Props behind fighters (tables, ladders, crates, hanging lanterns)
  for (const prop of arena.props) {
    if (!prop.broken && !prop.isHeldBy) {
      renderProp(ctx, prop);
    }
  }

  // 5. Articulated Ragdoll Fighters (Enemies first, then Hero Master Chan on top)
  const sortedFighters = [...engine.fighters].sort((a, b) =>
    a.isHero === b.isHero ? 0 : a.isHero ? 1 : -1
  );
  for (const f of sortedFighters) {
    renderArticulatedFighter(ctx, f, engine);
  }

  // 6. Held Props in fighter hands
  for (const prop of arena.props) {
    if (!prop.broken && prop.isHeldBy) {
      renderProp(ctx, prop);
    }
  }

  // 7. Pooled Particles (sparks, ceramic shards, wood splinters, shockwave rings)
  for (const p of engine.particles) {
    if (!p.active) continue;
    const alpha = Math.max(0, 1 - p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);

    if (p.shape === 'ring') {
      const r = 10 + (p.life / p.maxLife) * 58;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.shape === 'splinter') {
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size * 1.4, -p.size * 0.35, p.size * 2.8, p.size * 0.7);
    } else if (p.shape === 'shard') {
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size * 0.9, p.size * 0.8);
      ctx.lineTo(-p.size * 0.8, p.size * 0.5);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size);
    }
    ctx.restore();
  }

  // 8. Dynamic Stunt Callouts ("МЕЛЬНИЦА СО СТРЕМЯНКОЙ!", "КУВЫРОК ЧЕРЕЗ СТОЛ!")
  for (const c of engine.callouts) {
    const progress = c.life / c.maxLife;
    const alpha = progress < 0.75 ? 1 : Math.max(0, (1 - progress) * 4);
    const popScale =
      progress < 0.12 ? 0.6 + (progress / 0.12) * 0.5 : 1.0;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(c.x, c.y);
    ctx.scale(c.scale * popScale, c.scale * popScale);
    ctx.font = '700 18px "Oswald", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#090b10';
    ctx.strokeText(c.text, 0, 0);
    ctx.fillStyle = c.color;
    ctx.fillText(c.text, 0, 0);
    ctx.restore();
  }

  ctx.restore();

  // 9. Slow-Motion / New Take Clapperboard Vignette
  if (engine.slowMoTimer > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, viewportW - 6, viewportH - 6);
    ctx.restore();
  }
}

function renderBackdropArchitecture(
  ctx: CanvasRenderingContext2D,
  engine: StuntSimulationEngine
): void {
  const { arena } = engine;
  const { biome } = arena;

  // Distant Hong Kong silhouette buildings
  ctx.fillStyle = 'rgba(9, 12, 20, 0.55)';
  const bWidths = [110, 150, 95, 140, 125, 160, 115, 130, 145];
  let bx = 20;
  for (let i = 0; i < bWidths.length; i++) {
    const bw = bWidths[i];
    const bh = 220 + ((i * 67) % 170);
    ctx.fillRect(bx, arena.floorY - bh, bw - 12, bh);

    // Lit apartment / warehouse windows
    ctx.fillStyle = 'rgba(251, 191, 36, 0.12)';
    for (let wy = arena.floorY - bh + 22; wy < arena.floorY - 40; wy += 28) {
      for (let wx = bx + 14; wx < bx + bw - 28; wx += 24) {
        if ((wx + wy) % 3 !== 0) {
          ctx.fillRect(wx, wy, 10, 14);
        }
      }
    }
    ctx.fillStyle = 'rgba(9, 12, 20, 0.55)';
    bx += bw;
  }

  // Arena side boundary walls with wooden/bamboo trim
  ctx.fillStyle = '#141821';
  ctx.fillRect(0, 60, 38, arena.floorY - 60);
  ctx.fillRect(arena.worldWidth - 38, 60, 38, arena.floorY - 60);
  ctx.fillStyle = biome.platformAccent;
  ctx.fillRect(34, 60, 4, arena.floorY - 60);
  ctx.fillRect(arena.worldWidth - 38, 60, 4, arena.floorY - 60);

  // Structural Pillars & Vertical Hong Kong Neon Signs
  for (let i = 0; i < arena.pillars.length; i++) {
    const pil = arena.pillars[i];
    const px = pil.x - pil.width * 0.5;
    const ph = arena.floorY - pil.topY;

    // Pillar shaft
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(px, pil.topY, pil.width, ph);
    ctx.strokeStyle = biome.platformAccent;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, pil.topY, pil.width, ph);

    // Vertical Neon Signboard mounted on the pillar
    const signW = 34;
    const signH = 132;
    const sx = pil.x - signW * 0.5;
    const sy = pil.topY + 26;

    ctx.fillStyle = 'rgba(10, 12, 18, 0.92)';
    ctx.fillRect(sx, sy, signW, signH);
    ctx.strokeStyle = i % 2 === 0 ? biome.accentNeon : biome.secondaryNeon;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(sx, sy, signW, signH);

    ctx.fillStyle = i % 2 === 0 ? biome.accentNeon : biome.secondaryNeon;
    ctx.font = '700 18px sans-serif';
    ctx.textAlign = 'center';
    const chars = pil.label.split('');
    for (let c = 0; c < chars.length; c++) {
      ctx.fillText(chars[c], pil.x, sy + 28 + c * 28);
    }
  }
}

function renderPlatform(
  ctx: CanvasRenderingContext2D,
  plat: Platform,
  floorColor: string,
  floorTrimColor: string,
  platformColor: string,
  platformAccent: string
): void {
  const py = plat.y + plat.flexOffset;

  if (plat.kind === 'floor') {
    const deepHeight = Math.max(plat.height, 640);
    ctx.fillStyle = floorColor;
    ctx.fillRect(plat.x - 400, py, plat.width + 800, deepHeight);
    ctx.fillStyle = floorTrimColor;
    ctx.fillRect(plat.x - 400, py, plat.width + 800, 8);

    // Subtle floorboards / tiles perspective lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1.5;
    for (let x = 60; x < plat.width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x + (x - plat.width * 0.5) * 0.35, py + deepHeight);
      ctx.stroke();
    }
    return;
  }

  // Support brackets under elevated platforms
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(plat.x + 18, py + plat.height);
  ctx.lineTo(plat.x + 6, py + plat.height + 36);
  ctx.moveTo(plat.x + plat.width - 18, py + plat.height);
  ctx.lineTo(plat.x + plat.width - 6, py + plat.height + 36);
  ctx.stroke();

  if (plat.kind === 'awning') {
    // Striped Hong Kong street market springy canopy!
    const stripeCount = 8;
    const sw = plat.width / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#dc2626' : '#f8fafc';
      ctx.fillRect(plat.x + i * sw, py, sw, plat.height);
    }
    ctx.strokeStyle = '#090b10';
    ctx.lineWidth = 2;
    ctx.strokeRect(plat.x, py, plat.width, plat.height);
    return;
  }

  ctx.fillStyle = platformColor;
  ctx.fillRect(plat.x, py, plat.width, plat.height);
  ctx.fillStyle = platformAccent;
  ctx.fillRect(plat.x, py, plat.width, 5);
  ctx.strokeStyle = '#090b10';
  ctx.lineWidth = 2;
  ctx.strokeRect(plat.x, py, plat.width, plat.height);
}

function renderProp(ctx: CanvasRenderingContext2D, p: InteractiveProp): void {
  // Draw tether rope/chain first if hanging lantern
  if (p.tetherX !== undefined && p.tetherY !== undefined) {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.tetherX, p.tetherY);
    ctx.lineTo(p.x, p.y - p.height * 0.45);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle + (p.flipped ? Math.PI * 0.5 : 0));

  const w = p.width;
  const h = p.height;
  const flash = p.hitFlash > 0;
  const primary = flash ? '#ffffff' : p.colorPrimary;
  const secondary = flash ? '#fef08a' : p.colorSecondary;

  switch (p.kind) {
    case 'ladder': {
      // Iconic A-frame / stunt step-ladder with rungs!
      ctx.strokeStyle = primary;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-w * 0.42, h * 0.5);
      ctx.lineTo(-w * 0.2, -h * 0.5);
      ctx.lineTo(w * 0.2, -h * 0.5);
      ctx.lineTo(w * 0.42, h * 0.5);
      ctx.stroke();

      ctx.strokeStyle = secondary;
      ctx.lineWidth = 3.5;
      for (let ry = -h * 0.35; ry <= h * 0.38; ry += 16) {
        const spread = 0.28 + ((ry + h * 0.5) / h) * 0.14;
        ctx.beginPath();
        ctx.moveTo(-w * spread, ry);
        ctx.lineTo(w * spread, ry);
        ctx.stroke();
      }
      break;
    }

    case 'table': {
      // Wooden restaurant table with top and sturdy legs
      ctx.fillStyle = secondary;
      ctx.fillRect(-w * 0.42, -h * 0.3, 8, h * 0.8);
      ctx.fillRect(w * 0.42 - 8, -h * 0.3, 8, h * 0.8);
      ctx.fillStyle = primary;
      ctx.fillRect(-w * 0.5, -h * 0.5, w, 12);
      ctx.strokeStyle = '#090b10';
      ctx.lineWidth = 2;
      ctx.strokeRect(-w * 0.5, -h * 0.5, w, 12);
      break;
    }

    case 'chair': {
      ctx.strokeStyle = primary;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      // Backrest + seat + legs
      ctx.moveTo(-w * 0.35, -h * 0.5);
      ctx.lineTo(-w * 0.35, h * 0.5);
      ctx.moveTo(w * 0.35, 0);
      ctx.lineTo(w * 0.35, h * 0.5);
      ctx.moveTo(-w * 0.4, 0);
      ctx.lineTo(w * 0.4, 0);
      ctx.stroke();
      break;
    }

    case 'vase': {
      // Blue-and-white Ming Dynasty porcelain vase
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.ellipse(0, 4, w * 0.48, h * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-w * 0.22, -h * 0.48, w * 0.44, h * 0.32);
      ctx.strokeStyle = secondary;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 4, w * 0.26, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'bamboo_pole': {
      ctx.fillStyle = primary;
      ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
      ctx.strokeStyle = secondary;
      ctx.lineWidth = 2;
      for (let gx = -w * 0.35; gx <= w * 0.35; gx += 22) {
        ctx.beginPath();
        ctx.moveTo(gx, -h * 0.5);
        ctx.lineTo(gx, h * 0.5);
        ctx.stroke();
      }
      break;
    }

    case 'lantern': {
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.5, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = secondary;
      ctx.fillRect(-w * 0.24, -h * 0.48, w * 0.48, 5);
      ctx.fillRect(-w * 0.24, h * 0.42, w * 0.48, 5);
      break;
    }

    case 'wok': {
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.arc(0, -4, w * 0.5, 0, Math.PI);
      ctx.fill();
      ctx.strokeStyle = secondary;
      ctx.lineWidth = 3;
      ctx.stroke();
      break;
    }

    default: {
      // Crate / Barrel / Steamer / Bottle
      ctx.fillStyle = primary;
      ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
      ctx.strokeStyle = secondary;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, -h * 0.45);
      ctx.lineTo(w * 0.45, h * 0.45);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

function renderArticulatedFighter(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  engine: StuntSimulationEngine
): void {
  const n = f.nodes;
  const p = f.palette;
  const flash = f.hitFlashTimer > 0;
  const s = f.scale;

  // 1. Ground Shadow under fighter
  const shadowY = engine.arena.floorY;
  const heightAboveFloor = Math.max(0, shadowY - f.y);
  const shadowScale = Math.max(0.3, 1 - heightAboveFloor / 420);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.beginPath();
  ctx.ellipse(f.x, f.y + 2, 24 * shadowScale * s, 6 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Flowing Kung-Fu Belt Sash
  if (f.sash.length > 1) {
    ctx.strokeStyle = flash ? '#ffffff' : p.sash;
    ctx.lineWidth = 5 * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(f.sash[0].x, f.sash[0].y);
    for (let i = 1; i < f.sash.length; i++) {
      ctx.lineTo(f.sash[i].x, f.sash[i].y);
    }
    ctx.stroke();
  }

  // Helper to draw an anatomical clothed/muscular limb capsule
  const drawLimb = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width: number,
    color: string
  ) => {
    ctx.strokeStyle = '#090b10';
    ctx.lineWidth = width + 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = flash ? '#ffffff' : color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  // 3. Back Arm & Back Leg
  drawLimb(n.pelvis.x, n.pelvis.y, n.lKnee.x, n.lKnee.y, 12 * s, p.pants);
  drawLimb(n.lKnee.x, n.lKnee.y, n.lFoot.x, n.lFoot.y, 10 * s, p.pants);
  drawLimb(
    n.lFoot.x,
    n.lFoot.y,
    n.lFoot.x + f.facing * 7 * s,
    n.lFoot.y + 2,
    8 * s,
    p.shoes
  );

  drawLimb(n.neck.x, n.neck.y, n.lElbow.x, n.lElbow.y, 9.5 * s, p.shirt);
  drawLimb(n.lElbow.x, n.lElbow.y, n.lHand.x, n.lHand.y, 8 * s, p.skin);

  // 4. Muscular / Tunic Torso Polygon (Neck -> Pelvis)
  const torsoAngle = Math.atan2(n.pelvis.y - n.neck.y, n.pelvis.x - n.neck.x);
  const torsoLen = Math.hypot(n.pelvis.x - n.neck.x, n.pelvis.y - n.neck.y);
  ctx.save();
  ctx.translate(n.neck.x, n.neck.y);
  ctx.rotate(torsoAngle - Math.PI * 0.5);

  // Outer dark silhouette
  ctx.fillStyle = flash ? '#ffffff' : p.shirt;
  ctx.strokeStyle = '#090b10';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-11 * s, -2);
  ctx.lineTo(11 * s, -2);
  ctx.lineTo(8.5 * s, torsoLen);
  ctx.lineTo(-8.5 * s, torsoLen);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Hong Kong Kung-Fu Open Vest / Collar detail
  if (!flash) {
    ctx.fillStyle = p.vest;
    ctx.fillRect(-10 * s, 0, 5 * s, torsoLen * 0.85);
    ctx.fillRect(5 * s, 0, 5 * s, torsoLen * 0.85);
    // Sash waist band
    ctx.fillStyle = p.sash;
    ctx.fillRect(-9 * s, torsoLen - 6, 18 * s, 6);
  }
  ctx.restore();

  // 5. Front Leg & Front Arm
  drawLimb(n.pelvis.x, n.pelvis.y, n.rKnee.x, n.rKnee.y, 12.5 * s, p.pants);
  drawLimb(n.rKnee.x, n.rKnee.y, n.rFoot.x, n.rFoot.y, 10.5 * s, p.pants);
  drawLimb(
    n.rFoot.x,
    n.rFoot.y,
    n.rFoot.x + f.facing * 8 * s,
    n.rFoot.y + 2,
    8.5 * s,
    p.shoes
  );

  drawLimb(n.neck.x, n.neck.y, n.rElbow.x, n.rElbow.y, 10 * s, p.shirt);
  drawLimb(n.rElbow.x, n.rElbow.y, n.rHand.x, n.rHand.y, 8.5 * s, p.skin);

  // Taped fists / knuckles
  ctx.fillStyle = flash ? '#ffffff' : f.isHero ? '#f8fafc' : p.skin;
  ctx.beginPath();
  ctx.arc(n.rHand.x, n.rHand.y, 5 * s, 0, Math.PI * 2);
  ctx.arc(n.lHand.x, n.lHand.y, 4.5 * s, 0, Math.PI * 2);
  ctx.fill();

  // 6. Expressive Head, Martial-Arts Hair & Facial Reactions
  const hx = n.head.x;
  const hy = n.head.y;
  const hr = n.head.radius;

  ctx.save();
  ctx.translate(hx, hy);

  // Head circle
  ctx.fillStyle = flash ? '#ffffff' : p.skin;
  ctx.strokeStyle = '#090b10';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Iconic thick 80s Hong Kong Jackie Chan hairstyle / headband
  if (!flash) {
    ctx.fillStyle = p.hair;
    ctx.beginPath();
    ctx.arc(-f.facing * 2, -2, hr * 1.05, Math.PI * 0.85, Math.PI * 2.15);
    ctx.fill();

    if (f.isHero) {
      // Subtle crimson hero headband
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-hr * 0.9, -4);
      ctx.lineTo(hr * 0.9, -4);
      ctx.stroke();
    }

    // Expressive eyes & mouth based on current stunt/pain state
    const eyeX = f.facing * (hr * 0.38);
    ctx.fillStyle = '#090b10';
    if (f.expression === 'shocked') {
      // Wide shocked eyes + O-mouth ("Ой, ваза!")
      ctx.beginPath();
      ctx.arc(eyeX, -1, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(eyeX + f.facing * 1, 5, 3.2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.expression === 'pain_grimace' || f.expression === 'ko_dizzy') {
      // X / squinted eyes
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(eyeX - 2.5, -3);
      ctx.lineTo(eyeX + 2.5, 1);
      ctx.moveTo(eyeX + 2.5, -3);
      ctx.lineTo(eyeX - 2.5, 1);
      ctx.stroke();
    } else {
      // Focused kung-fu brow + eye
      ctx.beginPath();
      ctx.arc(eyeX, -1, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(eyeX - 3, -4);
      ctx.lineTo(eyeX + 3, -3 + f.facing);
      ctx.stroke();
    }
  }
  ctx.restore();

  // 7. Compact On-Character Role Badge / Health Pip & Speech Quip Bubble
  if (f.isHero) {
    // Subtle Golden Crown/Marker above Master Chan so the viewer's eye always tracks him immediately
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(hx, hy - hr - 14);
    ctx.lineTo(hx - 6, hy - hr - 22);
    ctx.lineTo(hx + 6, hy - hr - 22);
    ctx.closePath();
    ctx.fill();
  } else if (f.action !== 'ko' && f.hp < f.maxHp) {
    // Enemy mini health bar above head when damaged
    const bw = 34;
    const bx = hx - bw * 0.5;
    const by = hy - hr - 14;
    ctx.fillStyle = 'rgba(9, 11, 16, 0.85)';
    ctx.fillRect(bx, by, bw, 4.5);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(bx, by, bw * Math.max(0, f.hp / f.maxHp), 4.5);
  }

  // Comedic Cantonese-style Stunt Quip Bubble ("Ой! Простите за вазу!", "Стиль Пьяного Мастера!")
  if (f.quips && f.quipTimer > 0) {
    ctx.save();
    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    const textW = ctx.measureText(f.quips).width + 18;
    const bx = hx - textW * 0.5;
    const by = hy - hr - 44;

    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#090b10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, textW, 24, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#090b10';
    ctx.textAlign = 'center';
    ctx.fillText(f.quips, hx, by + 16);
    ctx.restore();
  }
}
