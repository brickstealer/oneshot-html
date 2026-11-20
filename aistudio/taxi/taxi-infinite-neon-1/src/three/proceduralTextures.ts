import * as THREE from 'three';

export interface ProceduralTexturePack {
  roadStraightMap: THREE.CanvasTexture;
  roadBumpMap: THREE.CanvasTexture;
  roadIntersectionMap: THREE.CanvasTexture;
  sidewalkMap: THREE.CanvasTexture;
  sidewalkBumpMap: THREE.CanvasTexture;
  metropolisFacadeMap: THREE.CanvasTexture;
  metropolisEmissiveMap: THREE.CanvasTexture;
  rivieraFacadeMap: THREE.CanvasTexture;
  rivieraEmissiveMap: THREE.CanvasTexture;
  canyonFacadeMap: THREE.CanvasTexture;
  canyonEmissiveMap: THREE.CanvasTexture;
  alpineFacadeMap: THREE.CanvasTexture;
  alpineEmissiveMap: THREE.CanvasTexture;
  sakuraFacadeMap: THREE.CanvasTexture;
  sakuraEmissiveMap: THREE.CanvasTexture;
  medievalFacadeMap: THREE.CanvasTexture;
  medievalEmissiveMap: THREE.CanvasTexture;
  cyberpunkFacadeMap: THREE.CanvasTexture;
  cyberpunkEmissiveMap: THREE.CanvasTexture;
  taxiSignMap: THREE.CanvasTexture;
  licensePlateMap: THREE.CanvasTexture;
  checkerStripeMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  headlightPoolMap: THREE.CanvasTexture;
  underglowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  isColor: boolean,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function drawAsphaltNoise(ctx: CanvasRenderingContext2D, w: number, h: number, baseL: number) {
  ctx.fillStyle = `rgb(${baseL}, ${baseL + 2}, ${baseL + 5})`;
  ctx.fillRect(0, 0, w, h);

  // Subtle tire wear tracks along both lanes
  const gradL = ctx.createLinearGradient(w * 0.16, 0, w * 0.42, 0);
  gradL.addColorStop(0, 'rgba(0,0,0,0)');
  gradL.addColorStop(0.5, 'rgba(0,0,0,0.16)');
  gradL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradL;
  ctx.fillRect(w * 0.14, 0, w * 0.3, h);

  const gradR = ctx.createLinearGradient(w * 0.58, 0, w * 0.84, 0);
  gradR.addColorStop(0, 'rgba(0,0,0,0)');
  gradR.addColorStop(0.5, 'rgba(0,0,0,0.16)');
  gradR.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradR;
  ctx.fillRect(w * 0.56, 0, w * 0.3, h);

  // Fine mineral aggregate speckles (deterministic pseudo-random)
  let s = 1337;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < 6500; i++) {
    const x = Math.floor(rnd() * w);
    const y = Math.floor(rnd() * h);
    const delta = Math.floor((rnd() - 0.5) * 34);
    const v = Math.max(12, Math.min(95, baseL + delta));
    ctx.fillStyle = `rgb(${v},${v + 1},${v + 2})`;
    ctx.fillRect(x, y, 2, 2);
  }
}

function createRoadStraightTextures(anisotropy: number) {
  const [c, ctx] = makeCanvas(512, 512);
  drawAsphaltNoise(ctx, 512, 512, 39);

  // Gutter edge shadows
  ctx.fillStyle = 'rgba(12,14,18,0.45)';
  ctx.fillRect(0, 0, 14, 512);
  ctx.fillRect(498, 0, 14, 512);

  // Crisp white shoulder lines
  ctx.fillStyle = 'rgba(235, 238, 244, 0.88)';
  ctx.fillRect(22, 0, 7, 512);
  ctx.fillRect(483, 0, 7, 512);

  // Double amber/yellow centerline
  ctx.fillStyle = '#eab308';
  ctx.fillRect(247, 0, 6, 512);
  ctx.fillRect(259, 0, 6, 512);

  // Dashed subtle lane guide dots / micro cracks
  ctx.strokeStyle = 'rgba(18, 20, 25, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(90, 120);
  ctx.lineTo(118, 165);
  ctx.lineTo(106, 205);
  ctx.stroke();

  // Subtle cast-iron storm cover off to the shoulder
  ctx.fillStyle = '#252a32';
  ctx.beginPath();
  ctx.arc(432, 340, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3c4350';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Crisp dashed white lane-center hints
  ctx.fillStyle = 'rgba(220, 226, 236, 0.22)';
  ctx.fillRect(132, 40, 3, 95);
  ctx.fillRect(132, 290, 3, 95);
  ctx.fillRect(377, 40, 3, 95);
  ctx.fillRect(377, 290, 3, 95);

  const roadStraightMap = configureTexture(c, anisotropy, true, 1, 3);

  // Grayscale bump map
  const [bc, bctx] = makeCanvas(256, 256);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 256, 256);
  let s = 9991;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < 9000; i++) {
    const v = 90 + Math.floor(rnd() * 80);
    bctx.fillStyle = `rgb(${v},${v},${v})`;
    bctx.fillRect(Math.floor(rnd() * 256), Math.floor(rnd() * 256), 2, 2);
  }
  const roadBumpMap = configureTexture(bc, anisotropy, false, 2, 4);

  return { roadStraightMap, roadBumpMap };
}

function createRoadIntersectionTexture(anisotropy: number) {
  const [c, ctx] = makeCanvas(512, 512);
  drawAsphaltNoise(ctx, 512, 512, 38);

  // 4 zebra crosswalks along all 4 edges
  ctx.fillStyle = 'rgba(238, 241, 246, 0.88)';
  const stripeCount = 8;
  const stripeW = 28;
  const gap = 24;
  const start = (512 - (stripeCount * stripeW + (stripeCount - 1) * gap)) * 0.5;

  for (let i = 0; i < stripeCount; i++) {
    const pos = start + i * (stripeW + gap);
    // North & South crosswalks
    ctx.fillRect(pos, 18, stripeW, 74);
    ctx.fillRect(pos, 420, stripeW, 74);
    // West & East crosswalks
    ctx.fillRect(18, pos, 74, stripeW);
    ctx.fillRect(420, pos, 74, stripeW);
  }

  // Stop bars
  ctx.fillStyle = 'rgba(242, 244, 248, 0.92)';
  ctx.fillRect(44, 102, 200, 10);
  ctx.fillRect(268, 400, 200, 10);
  ctx.fillRect(102, 268, 10, 200);
  ctx.fillRect(400, 44, 10, 200);

  return configureTexture(c, anisotropy, true, 1, 1);
}

function createSidewalkTextures(anisotropy: number) {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#c8ccd2';
  ctx.fillRect(0, 0, 256, 256);

  const [bc, bctx] = makeCanvas(256, 256);
  bctx.fillStyle = '#a0a0a0';
  bctx.fillRect(0, 0, 256, 256);

  const tile = 64;
  let s = 4242;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let gx = 0; gx < 4; gx++) {
    for (let gy = 0; gy < 4; gy++) {
      const shade = 188 + Math.floor((rnd() - 0.5) * 20);
      ctx.fillStyle = `rgb(${shade},${shade},${shade - 2})`;
      ctx.fillRect(gx * tile + 2, gy * tile + 2, tile - 4, tile - 4);

      bctx.fillStyle = '#d0d0d0';
      bctx.fillRect(gx * tile + 3, gy * tile + 3, tile - 6, tile - 6);
    }
  }
  ctx.strokeStyle = 'rgba(70, 74, 82, 0.45)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * tile, 0);
    ctx.lineTo(i * tile, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * tile);
    ctx.lineTo(256, i * tile);
    ctx.stroke();
  }

  return {
    sidewalkMap: configureTexture(c, anisotropy, true, 12, 12),
    sidewalkBumpMap: configureTexture(bc, anisotropy, false, 12, 12),
  };
}

function createFacadePair(
  anisotropy: number,
  style:
    | 'metropolis'
    | 'riviera'
    | 'canyon'
    | 'alpine'
    | 'sakura'
    | 'medieval'
    | 'cyberpunk',
) {
  const [c, ctx] = makeCanvas(512, 512);
  const [ec, ectx] = makeCanvas(512, 512);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, 512, 512);

  let s = style.charCodeAt(0) * 919 + style.length * 131;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  if (style === 'metropolis') {
    // Sleek steel & architectural glass curtain wall
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(0, 0, 512, 512);

    const cols = 8;
    const rows = 12;
    const cw = 512 / cols;
    const rh = 512 / rows;

    for (let r = 0; r < rows; r++) {
      // Concrete spandrel band
      ctx.fillStyle = '#3c4657';
      ctx.fillRect(0, r * rh, 512, 9);
      for (let col = 0; col < cols; col++) {
        const wx = col * cw + 6;
        const wy = r * rh + 11;
        const ww = cw - 12;
        const wh = rh - 15;

        const lit = rnd() > 0.44;
        const warm = rnd() > 0.35;

        // Window glass gradient
        const g = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        if (lit) {
          g.addColorStop(0, warm ? '#8ba2b8' : '#7ea8c9');
          g.addColorStop(1, warm ? '#58697c' : '#4a647c');
        } else {
          g.addColorStop(0, '#394c63');
          g.addColorStop(1, '#1f2b3a');
        }
        ctx.fillStyle = g;
        ctx.fillRect(wx, wy, ww, wh);

        // Mullion highlight
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(wx, wy, ww, wh);

        if (lit) {
          ectx.fillStyle = warm ? '#ffd58a' : '#bfe4ff';
          ectx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        }
      }
    }
  } else if (style === 'riviera') {
    // Warm sunlit Mediterranean plaster with shuttered windows
    ctx.fillStyle = '#efe2cd';
    ctx.fillRect(0, 0, 512, 512);
    // Plaster grain
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(130,100,70,0.06)';
      ctx.fillRect(rnd() * 512, rnd() * 512, 4, 4);
    }

    const cols = 4;
    const rows = 5;
    const cw = 512 / cols;
    const rh = 512 / rows;

    for (let r = 0; r < rows; r++) {
      // Decorative cornice molding
      ctx.fillStyle = '#dfd0b8';
      ctx.fillRect(0, r * rh, 512, 8);
      for (let col = 0; col < cols; col++) {
        const cx = col * cw + cw * 0.5;
        const wy = r * rh + 22;
        const ww = 46;
        const wh = 56;
        // Turquoise/teal wooden shutters
        ctx.fillStyle = '#2d7a78';
        ctx.fillRect(cx - ww * 0.5 - 16, wy, 14, wh);
        ctx.fillRect(cx + ww * 0.5 + 2, wy, 14, wh);
        // Window glass
        ctx.fillStyle = '#283e4d';
        ctx.fillRect(cx - ww * 0.5, wy, ww, wh);
        // White window muntins
        ctx.strokeStyle = '#f8f4ec';
        ctx.lineWidth = 3;
        ctx.strokeRect(cx - ww * 0.5, wy, ww, wh);
        ctx.beginPath();
        ctx.moveTo(cx, wy);
        ctx.lineTo(cx, wy + wh);
        ctx.stroke();

        if (rnd() > 0.42) {
          ectx.fillStyle = '#ffcf7d';
          ectx.fillRect(cx - ww * 0.5 + 4, wy + 4, ww - 8, wh - 8);
        }
      }
    }
  } else if (style === 'canyon') {
    // Desert sandstone / adobe stucco & retro roadside motel windows
    ctx.fillStyle = '#d49a6a';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 32) {
      ctx.fillStyle = y % 64 === 0 ? 'rgba(130,65,30,0.12)' : 'rgba(255,215,170,0.08)';
      ctx.fillRect(0, y, 512, 16);
    }
    const cols = 4;
    const rows = 4;
    const cw = 512 / cols;
    const rh = 512 / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const wx = col * cw + 22;
        const wy = r * rh + 32;
        const ww = cw - 44;
        const wh = rh - 60;
        ctx.fillStyle = '#4a3525';
        ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
        ctx.fillStyle = '#2a343d';
        ctx.fillRect(wx, wy, ww, wh);
        if (rnd() > 0.35) {
          ectx.fillStyle = rnd() > 0.25 ? '#ffbe66' : '#5eead4';
          ectx.fillRect(wx + 3, wy + 3, ww - 6, wh - 6);
        }
      }
    }
  } else if (style === 'alpine') {
    // Natural alpine timber planks + stone base
    ctx.fillStyle = '#7c5538';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 18) {
      ctx.fillStyle = y % 36 === 0 ? '#6e4a30' : '#855c3e';
      ctx.fillRect(0, y, 512, 16);
      ctx.fillStyle = 'rgba(30,18,10,0.35)';
      ctx.fillRect(0, y + 16, 512, 2);
    }
    const cols = 4;
    const rows = 4;
    const cw = 512 / cols;
    const rh = 512 / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const wx = col * cw + 28;
        const wy = r * rh + 28;
        const ww = cw - 56;
        const wh = rh - 56;
        ctx.fillStyle = '#e7e0d3';
        ctx.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
        ctx.fillStyle = '#2b323b';
        ctx.fillRect(wx, wy, ww, wh);
        if (rnd() > 0.3) {
          ectx.fillStyle = '#ffbf5e';
          ectx.fillRect(wx + 4, wy + 4, ww - 8, wh - 8);
        }
      }
    }
  } else if (style === 'medieval') {
    // Medieval fortress ashlar stone blocks + warm torchlit arched windows
    ctx.fillStyle = '#5c5852';
    ctx.fillRect(0, 0, 512, 512);
    const brickH = 32;
    const brickW = 64;
    for (let row = 0; row < 512 / brickH; row++) {
      const y = row * brickH;
      const offset = (row % 2) * (brickW * 0.5);
      for (let col = -1; col <= 512 / brickW; col++) {
        const x = col * brickW + offset;
        const shade = 74 + Math.floor(rnd() * 34);
        ctx.fillStyle = `rgb(${shade + 4}, ${shade}, ${shade - 4})`;
        ctx.fillRect(x + 2, y + 2, brickW - 4, brickH - 4);
      }
    }
    // Arched lancet castle windows
    const cols = 4;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const cx = col * 128 + 64;
        const wy = r * 128 + 34;
        ctx.fillStyle = '#1e1b18';
        ctx.beginPath();
        ctx.arc(cx, wy + 18, 16, Math.PI, 0);
        ctx.lineTo(cx + 16, wy + 68);
        ctx.lineTo(cx - 16, wy + 68);
        ctx.closePath();
        ctx.fill();
        if (rnd() > 0.28) {
          ectx.fillStyle = '#ff9d3b';
          ectx.beginPath();
          ectx.arc(cx, wy + 18, 12, Math.PI, 0);
          ectx.lineTo(cx + 12, wy + 64);
          ectx.lineTo(cx - 12, wy + 64);
          ectx.closePath();
          ectx.fill();
        }
      }
    }
  } else if (style === 'cyberpunk') {
    // Obsidian megastructure with glowing electric cyan & neon magenta data windows
    ctx.fillStyle = '#111324';
    ctx.fillRect(0, 0, 512, 512);
    const cols = 8;
    const rows = 14;
    const cw = 512 / cols;
    const rh = 512 / rows;
    for (let r = 0; r < rows; r++) {
      ctx.fillStyle = '#1b1f38';
      ctx.fillRect(0, r * rh, 512, 5);
      for (let col = 0; col < cols; col++) {
        const wx = col * cw + 6;
        const wy = r * rh + 8;
        const ww = cw - 12;
        const wh = rh - 12;
        const roll = rnd();
        ctx.fillStyle = roll > 0.6 ? '#1c2c4a' : '#181a2e';
        ctx.fillRect(wx, wy, ww, wh);
        if (roll > 0.35) {
          ectx.fillStyle = roll > 0.72 ? '#22d3ee' : roll > 0.52 ? '#f43f5e' : '#a855f7';
          ectx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        }
      }
    }
  } else {
    // Kyoto Sakura Quarter: dark yakisugi timber + warm shoji lattice
    ctx.fillStyle = '#332d2b';
    ctx.fillRect(0, 0, 512, 512);
    // Vertical cedar slats
    for (let x = 0; x < 512; x += 16) {
      ctx.fillStyle = x % 32 === 0 ? '#2b2523' : '#3a3330';
      ctx.fillRect(x, 0, 14, 512);
    }
    const cols = 4;
    const rows = 5;
    const cw = 512 / cols;
    const rh = 512 / rows;
    for (let r = 0; r < rows; r++) {
      ctx.fillStyle = '#1f1b1a';
      ctx.fillRect(0, r * rh, 512, 12);
      for (let col = 0; col < cols; col++) {
        const wx = col * cw + 14;
        const wy = r * rh + 20;
        const ww = cw - 28;
        const wh = rh - 28;
        ctx.fillStyle = '#e8dcc4';
        ctx.fillRect(wx, wy, ww, wh);
        // Shoji wood lattice grid
        ctx.strokeStyle = '#3b2e26';
        ctx.lineWidth = 3;
        ctx.strokeRect(wx, wy, ww, wh);
        ctx.beginPath();
        ctx.moveTo(wx + ww * 0.5, wy);
        ctx.lineTo(wx + ww * 0.5, wy + wh);
        ctx.moveTo(wx, wy + wh * 0.5);
        ctx.lineTo(wx + ww, wy + wh * 0.5);
        ctx.stroke();

        if (rnd() > 0.28) {
          ectx.fillStyle = '#ffb85c';
          ectx.fillRect(wx + 3, wy + 3, ww - 6, wh - 6);
        }
      }
    }
  }

  return {
    map: configureTexture(c, anisotropy, true, 1, 1),
    emissiveMap: configureTexture(ec, anisotropy, true, 1, 1),
  };
}

function createTaxiSignTexture(anisotropy: number) {
  const [c, ctx] = makeCanvas(256, 96);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(0, 0, 256, 96);

  // Checker strips top & bottom
  ctx.fillStyle = '#111827';
  const sq = 16;
  for (let x = 0; x < 256; x += sq) {
    if ((x / sq) % 2 === 0) {
      ctx.fillRect(x, 0, sq, 14);
      ctx.fillRect(x, 82, sq, 14);
    }
  }

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TAXI', 128, 50);

  return configureTexture(c, anisotropy, true, 1, 1);
}

function createContactShadowTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  const grad = ctx.createRadialGradient(64, 64, 14, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.38)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createHeadlightPoolTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  // Soft forward-spreading beam cone projected onto road surface
  const grad = ctx.createRadialGradient(128, 240, 8, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255, 246, 214, 0.92)');
  grad.addColorStop(0.4, 'rgba(255, 238, 196, 0.36)');
  grad.addColorStop(0.85, 'rgba(255, 230, 180, 0.06)');
  grad.addColorStop(1, 'rgba(255, 230, 180, 0)');

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(104, 256);
  ctx.lineTo(152, 256);
  ctx.lineTo(246, 12);
  ctx.lineTo(10, 12);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createLicensePlateTexture(anisotropy: number) {
  const [c, ctx] = makeCanvas(256, 64);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 58);

  // Yellow taxi region badge on right
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(194, 6, 56, 52);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('777', 222, 34);

  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('TAXI', 98, 34);

  return configureTexture(c, anisotropy, true, 1, 1);
}

function createCheckerStripeTexture(anisotropy: number) {
  const [c, ctx] = makeCanvas(256, 32);
  const sq = 16;
  for (let x = 0; x < 256; x += sq) {
    for (let y = 0; y < 32; y += sq) {
      const dark = ((x / sq + y / sq) % 2) === 0;
      ctx.fillStyle = dark ? '#0f172a' : '#fef3c7';
      ctx.fillRect(x, y, sq, sq);
    }
  }
  return configureTexture(c, anisotropy, true, 2, 1);
}

function createUnderglowTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);

  // Broad feathered elliptical ambient spill fading strictly to 0 well before canvas edges
  ctx.save();
  ctx.translate(128, 128);
  ctx.scale(0.88, 1.0);
  const outer = ctx.createRadialGradient(0, 0, 18, 0, 0, 118);
  outer.addColorStop(0.0, 'rgba(255, 255, 255, 0.85)');
  outer.addColorStop(0.38, 'rgba(255, 255, 255, 0.52)');
  outer.addColorStop(0.68, 'rgba(255, 255, 255, 0.16)');
  outer.addColorStop(0.88, 'rgba(255, 255, 255, 0.03)');
  outer.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(0, 0, 118, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Concentrated neon tube hotspots along left/right side skirts & front/rear bumpers
  const paintLobe = (cx: number, cy: number, rx: number, ry: number, alpha: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx / 64, ry / 64);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 64);
    g.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    g.addColorStop(0.45, `rgba(255, 255, 255, ${alpha * 0.42})`);
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  paintLobe(84, 128, 36, 76, 0.72);  // Left skirt neon tube spill
  paintLobe(172, 128, 36, 76, 0.72); // Right skirt neon tube spill
  paintLobe(128, 66, 54, 28, 0.58);  // Front bumper neon tube spill
  paintLobe(128, 190, 54, 28, 0.58); // Rear diffuser neon tube spill

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTexturePack(maxAnisotropy: number): ProceduralTexturePack {
  const aniso = Math.min(8, Math.max(1, maxAnisotropy));
  const { roadStraightMap, roadBumpMap } = createRoadStraightTextures(aniso);
  const roadIntersectionMap = createRoadIntersectionTexture(aniso);
  const { sidewalkMap, sidewalkBumpMap } = createSidewalkTextures(aniso);

  const metro = createFacadePair(aniso, 'metropolis');
  const riviera = createFacadePair(aniso, 'riviera');
  const canyon = createFacadePair(aniso, 'canyon');
  const alpine = createFacadePair(aniso, 'alpine');
  const sakura = createFacadePair(aniso, 'sakura');
  const medieval = createFacadePair(aniso, 'medieval');
  const cyberpunk = createFacadePair(aniso, 'cyberpunk');
  const taxiSignMap = createTaxiSignTexture(aniso);
  const licensePlateMap = createLicensePlateTexture(aniso);
  const checkerStripeMap = createCheckerStripeTexture(aniso);
  const contactShadowMap = createContactShadowTexture();
  const headlightPoolMap = createHeadlightPoolTexture();
  const underglowMap = createUnderglowTexture();

  const all = [
    roadStraightMap,
    roadBumpMap,
    roadIntersectionMap,
    sidewalkMap,
    sidewalkBumpMap,
    metro.map,
    metro.emissiveMap,
    riviera.map,
    riviera.emissiveMap,
    canyon.map,
    canyon.emissiveMap,
    alpine.map,
    alpine.emissiveMap,
    sakura.map,
    sakura.emissiveMap,
    medieval.map,
    medieval.emissiveMap,
    cyberpunk.map,
    cyberpunk.emissiveMap,
    taxiSignMap,
    licensePlateMap,
    checkerStripeMap,
    contactShadowMap,
    headlightPoolMap,
    underglowMap,
  ];

  return {
    roadStraightMap,
    roadBumpMap,
    roadIntersectionMap,
    sidewalkMap,
    sidewalkBumpMap,
    metropolisFacadeMap: metro.map,
    metropolisEmissiveMap: metro.emissiveMap,
    rivieraFacadeMap: riviera.map,
    rivieraEmissiveMap: riviera.emissiveMap,
    canyonFacadeMap: canyon.map,
    canyonEmissiveMap: canyon.emissiveMap,
    alpineFacadeMap: alpine.map,
    alpineEmissiveMap: alpine.emissiveMap,
    sakuraFacadeMap: sakura.map,
    sakuraEmissiveMap: sakura.emissiveMap,
    medievalFacadeMap: medieval.map,
    medievalEmissiveMap: medieval.emissiveMap,
    cyberpunkFacadeMap: cyberpunk.map,
    cyberpunkEmissiveMap: cyberpunk.emissiveMap,
    taxiSignMap,
    licensePlateMap,
    checkerStripeMap,
    contactShadowMap,
    headlightPoolMap,
    underglowMap,
    dispose: () => {
      for (const tex of all) tex.dispose();
    },
  };
}
