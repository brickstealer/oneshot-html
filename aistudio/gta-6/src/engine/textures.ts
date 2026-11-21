import * as THREE from 'three';

export interface ProceduralTexturePack {
  roadStraight: THREE.CanvasTexture;
  roadIntersection: THREE.CanvasTexture;
  roadBump: THREE.CanvasTexture;
  sidewalk: THREE.CanvasTexture;
  skyscraperGlass: THREE.CanvasTexture;
  skyscraperEmissive: THREE.CanvasTexture;
  artDecoFacade: THREE.CanvasTexture;
  artDecoEmissive: THREE.CanvasTexture;
  bankFacade: THREE.CanvasTexture;
  sandMap: THREE.CanvasTexture;
  desertRockMap: THREE.CanvasTexture;
  swampWaterMap: THREE.CanvasTexture;
  containerCorrugated: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(renderer: THREE.WebGLRenderer): ProceduralTexturePack {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const textures: THREE.CanvasTexture[] = [];

  // 1. Detailed 4-lane Asphalt Road (straight segment)
  const [roadC, rCtx] = makeCanvas(512, 512);
  rCtx.fillStyle = '#25282e';
  rCtx.fillRect(0, 0, 512, 512);
  // Subtle aggregate grain + tire wear tracks
  for (let i = 0; i < 6000; i++) {
    const x = (i * 73) % 512;
    const y = ((i * 197) ^ (i * 31)) & 511;
    const v = 30 + (i % 22);
    rCtx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    rCtx.fillRect(x, y, 2, 2);
  }
  // Tire wear lanes
  const laneTracks = [96, 178, 334, 416];
  for (const tx of laneTracks) {
    const grad = rCtx.createLinearGradient(tx - 24, 0, tx + 24, 0);
    grad.addColorStop(0, 'rgba(15,17,20,0)');
    grad.addColorStop(0.5, 'rgba(12,13,16,0.42)');
    grad.addColorStop(1, 'rgba(15,17,20,0)');
    rCtx.fillStyle = grad;
    rCtx.fillRect(tx - 24, 0, 48, 512);
  }
  // Curb gutter edges
  rCtx.fillStyle = '#5c616a';
  rCtx.fillRect(0, 0, 14, 512);
  rCtx.fillRect(498, 0, 14, 512);
  // White edge lines
  rCtx.fillStyle = 'rgba(235,240,245,0.75)';
  rCtx.fillRect(22, 0, 6, 512);
  rCtx.fillRect(484, 0, 6, 512);
  // Double amber centerline
  rCtx.fillStyle = '#e8a930';
  rCtx.fillRect(247, 0, 6, 512);
  rCtx.fillRect(259, 0, 6, 512);
  // Dashed lane dividers
  rCtx.fillStyle = 'rgba(240,244,248,0.82)';
  for (let y = 16; y < 512; y += 64) {
    rCtx.fillRect(134, y, 5, 32);
    rCtx.fillRect(373, y, 5, 32);
  }
  const roadStraight = finalizeTexture(roadC, true, maxAniso);
  textures.push(roadStraight);

  // 2. Intersection with Zebra Crosswalks & Stop Bars
  const [intC, iCtx] = makeCanvas(512, 512);
  iCtx.fillStyle = '#25282e';
  iCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4500; i++) {
    const x = (i * 89) % 512;
    const y = (i * 211) % 512;
    const v = 32 + (i % 18);
    iCtx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    iCtx.fillRect(x, y, 2, 2);
  }
  // Zebra crosswalk stripes on all 4 approaches
  iCtx.fillStyle = 'rgba(238,242,246,0.84)';
  for (let s = 44; s < 468; s += 30) {
    iCtx.fillRect(s, 14, 16, 46); // North
    iCtx.fillRect(s, 452, 16, 46); // South
    iCtx.fillRect(14, s, 46, 16); // West
    iCtx.fillRect(452, s, 46, 16); // East
  }
  // Subtle manhole cover in center
  iCtx.strokeStyle = '#3f454f';
  iCtx.lineWidth = 4;
  iCtx.beginPath();
  iCtx.arc(256, 256, 18, 0, Math.PI * 2);
  iCtx.stroke();
  const roadIntersection = finalizeTexture(intC, true, maxAniso);
  textures.push(roadIntersection);

  // 3. Asphalt Micro-Relief Bump Map (linear space)
  const [bumpC, bCtx] = makeCanvas(256, 256);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const x = (i * 53) % 256;
    const y = (i * 131) % 256;
    const g = 95 + (i % 65);
    bCtx.fillStyle = `rgb(${g},${g},${g})`;
    bCtx.fillRect(x, y, 2, 2);
  }
  const roadBump = finalizeTexture(bumpC, false, maxAniso, 2, 2);
  textures.push(roadBump);

  // 4. Sidewalk Concrete Paving Slabs
  const [swC, swCtx] = makeCanvas(256, 256);
  swCtx.fillStyle = '#b4b8be';
  swCtx.fillRect(0, 0, 256, 256);
  swCtx.strokeStyle = '#808690';
  swCtx.lineWidth = 3;
  for (let x = 0; x <= 256; x += 64) {
    swCtx.beginPath();
    swCtx.moveTo(x, 0);
    swCtx.lineTo(x, 256);
    swCtx.stroke();
  }
  for (let y = 0; y <= 256; y += 64) {
    swCtx.beginPath();
    swCtx.moveTo(0, y);
    swCtx.lineTo(256, y);
    swCtx.stroke();
  }
  for (let i = 0; i < 1600; i++) {
    const x = (i * 37) % 256;
    const y = (i * 97) % 256;
    const v = 165 + (i % 30);
    swCtx.fillStyle = `rgba(${v},${v},${v},0.35)`;
    swCtx.fillRect(x, y, 2, 2);
  }
  const sidewalk = finalizeTexture(swC, true, maxAniso, 4, 4);
  textures.push(sidewalk);

  // 5. Modern Skyscraper Curtain Wall Glass + Night Emissive Map
  const [skyC, skCtx] = makeCanvas(512, 512);
  const [skyE, skeCtx] = makeCanvas(512, 512);
  skCtx.fillStyle = '#24303e';
  skCtx.fillRect(0, 0, 512, 512);
  skeCtx.fillStyle = '#000000';
  skeCtx.fillRect(0, 0, 512, 512);

  const cols = 8;
  const rows = 16;
  const cw = 512 / cols;
  const rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    // Structural spandrel beam
    skCtx.fillStyle = '#1b222c';
    skCtx.fillRect(0, r * rh, 512, 6);
    for (let c = 0; c < cols; c++) {
      const seed = (r * 31 + c * 17) % 19;
      const lit = seed < 7;
      const x = c * cw + 5;
      const y = r * rh + 7;
      const w = cw - 10;
      const h = rh - 10;

      // Reflective glass gradient
      const g = skCtx.createLinearGradient(x, y, x, y + h);
      if (lit) {
        g.addColorStop(0, '#7294b4');
        g.addColorStop(1, '#4c6d8e');
      } else {
        g.addColorStop(0, '#364d63');
        g.addColorStop(1, '#223344');
      }
      skCtx.fillStyle = g;
      skCtx.fillRect(x, y, w, h);

      if (lit) {
        const warm = seed % 2 === 0;
        skeCtx.fillStyle = warm ? '#ffcf86' : '#a9dcff';
        skeCtx.fillRect(x + 2, y + 2, w - 4, h - 4);
      }
    }
  }
  const skyscraperGlass = finalizeTexture(skyC, true, maxAniso);
  const skyscraperEmissive = finalizeTexture(skyE, true, maxAniso);
  textures.push(skyscraperGlass, skyscraperEmissive);

  // 6. Miami Art Deco Hotel Facade + Warm Neon Emissive
  const [decoC, dCtx] = makeCanvas(512, 512);
  const [decoE, deCtx] = makeCanvas(512, 512);
  dCtx.fillStyle = '#f2e8dc';
  dCtx.fillRect(0, 0, 512, 512);
  deCtx.fillStyle = '#000000';
  deCtx.fillRect(0, 0, 512, 512);

  // Horizontal coral/teal Art Deco trim stripes
  dCtx.fillStyle = '#f48670';
  dCtx.fillRect(0, 24, 512, 16);
  dCtx.fillStyle = '#2ec4b6';
  dCtx.fillRect(0, 44, 512, 10);
  deCtx.fillStyle = '#ff6b9d';
  deCtx.fillRect(0, 28, 512, 8);
  deCtx.fillStyle = '#2ee6d6';
  deCtx.fillRect(0, 46, 512, 6);

  for (let r = 2; r < 10; r++) {
    for (let c = 0; c < 6; c++) {
      const wx = 22 + c * 82;
      const wy = r * 48 + 8;
      dCtx.fillStyle = '#33485c';
      dCtx.fillRect(wx, wy, 52, 30);
      // Balcony ledge
      dCtx.fillStyle = '#ffffff';
      dCtx.fillRect(wx - 4, wy + 28, 60, 6);
      if ((r + c * 3) % 3 === 0) {
        deCtx.fillStyle = '#ffdc9e';
        deCtx.fillRect(wx + 4, wy + 4, 44, 22);
      }
    }
  }
  const artDecoFacade = finalizeTexture(decoC, true, maxAniso);
  const artDecoEmissive = finalizeTexture(decoE, true, maxAniso);
  textures.push(artDecoFacade, artDecoEmissive);

  // 7. First Leonida Bank Marble Facade
  const [bankC, bkCtx] = makeCanvas(512, 512);
  bkCtx.fillStyle = '#e8e2d5';
  bkCtx.fillRect(0, 0, 512, 512);
  // Ashlar stone blocks
  bkCtx.strokeStyle = '#cbc2b1';
  bkCtx.lineWidth = 2;
  for (let y = 0; y < 512; y += 32) {
    bkCtx.beginPath();
    bkCtx.moveTo(0, y);
    bkCtx.lineTo(512, y);
    bkCtx.stroke();
  }
  // Tall arched bank windows
  for (let c = 0; c < 4; c++) {
    const wx = 38 + c * 116;
    bkCtx.fillStyle = '#243447';
    bkCtx.fillRect(wx, 140, 74, 240);
    bkCtx.strokeStyle = '#d4af37';
    bkCtx.lineWidth = 5;
    bkCtx.strokeRect(wx, 140, 74, 240);
  }
  // Gold frieze banner
  bkCtx.fillStyle = '#182433';
  bkCtx.fillRect(40, 42, 432, 66);
  bkCtx.strokeStyle = '#e6b84c';
  bkCtx.lineWidth = 4;
  bkCtx.strokeRect(44, 46, 424, 58);
  bkCtx.fillStyle = '#f5cb5c';
  bkCtx.font = 'bold 42px Oswald, sans-serif';
  bkCtx.textAlign = 'center';
  bkCtx.fillText('LEONIDA BANK', 256, 90);
  const bankFacade = finalizeTexture(bankC, true, maxAniso);
  textures.push(bankFacade);

  // 8. Beach Sand Ripples
  const [sandC, sCtx] = makeCanvas(256, 256);
  sCtx.fillStyle = '#e7cc98';
  sCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) {
    sCtx.fillStyle = y % 16 === 0 ? 'rgba(255,244,218,0.28)' : 'rgba(188,153,96,0.22)';
    sCtx.fillRect(0, y, 256, 4);
  }
  for (let i = 0; i < 2000; i++) {
    sCtx.fillStyle = i % 2 === 0 ? 'rgba(255,250,235,0.35)' : 'rgba(175,140,86,0.3)';
    sCtx.fillRect((i * 47) % 256, (i * 113) % 256, 2, 2);
  }
  const sandMap = finalizeTexture(sandC, true, maxAniso, 3, 3);
  textures.push(sandMap);

  // 9. Red Rock Desert Sand/Sandstone
  const [desC, dsCtx] = makeCanvas(256, 256);
  dsCtx.fillStyle = '#c47644';
  dsCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 14) {
    dsCtx.fillStyle = y % 28 === 0 ? 'rgba(155,75,38,0.34)' : 'rgba(225,156,96,0.25)';
    dsCtx.fillRect(0, y, 256, 7);
  }
  for (let i = 0; i < 2200; i++) {
    dsCtx.fillStyle = i % 3 === 0 ? 'rgba(95,45,25,0.35)' : 'rgba(232,166,105,0.25)';
    dsCtx.fillRect((i * 59) % 256, (i * 149) % 256, 3, 2);
  }
  const desertRockMap = finalizeTexture(desC, true, maxAniso, 3, 3);
  textures.push(desertRockMap);

  // 10. Everglades Swamp Marsh Water
  const [swpC, spCtx] = makeCanvas(256, 256);
  spCtx.fillStyle = '#233f31';
  spCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) {
    const x = (i * 67) % 256;
    const y = (i * 109) % 256;
    const r = 6 + (i % 14);
    spCtx.fillStyle = i % 3 === 0 ? 'rgba(54,104,68,0.45)' : 'rgba(26,56,42,0.5)';
    spCtx.beginPath();
    spCtx.arc(x, y, r, 0, Math.PI * 2);
    spCtx.fill();
  }
  const swampWaterMap = finalizeTexture(swpC, true, maxAniso, 3, 3);
  textures.push(swampWaterMap);

  // 11. Shipping Container Corrugated Steel
  const [cntC, ctCtx] = makeCanvas(256, 128);
  ctCtx.fillStyle = '#d4d8dd';
  ctCtx.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 256; x += 12) {
    ctCtx.fillStyle = 'rgba(0,0,0,0.18)';
    ctCtx.fillRect(x, 8, 5, 112);
    ctCtx.fillStyle = 'rgba(255,255,255,0.14)';
    ctCtx.fillRect(x + 5, 8, 3, 112);
  }
  ctCtx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctCtx.lineWidth = 6;
  ctCtx.strokeRect(3, 3, 250, 122);
  const containerCorrugated = finalizeTexture(cntC, true, maxAniso);
  textures.push(containerCorrugated);

  // 12. Soft Radial Contact Shadow Disc
  const [shC, shCtx] = makeCanvas(128, 128);
  const sGrad = shCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  sGrad.addColorStop(0, 'rgba(0,0,0,0.62)');
  sGrad.addColorStop(0.65, 'rgba(0,0,0,0.28)');
  sGrad.addColorStop(1, 'rgba(0,0,0,0)');
  shCtx.fillStyle = sGrad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadow = finalizeTexture(shC, false, 1);
  contactShadow.wrapS = THREE.ClampToEdgeWrapping;
  contactShadow.wrapT = THREE.ClampToEdgeWrapping;
  textures.push(contactShadow);

  return {
    roadStraight,
    roadIntersection,
    roadBump,
    sidewalk,
    skyscraperGlass,
    skyscraperEmissive,
    artDecoFacade,
    artDecoEmissive,
    bankFacade,
    sandMap,
    desertRockMap,
    swampWaterMap,
    containerCorrugated,
    contactShadow,
    dispose: () => {
      textures.forEach((t) => t.dispose());
    },
  };
}
