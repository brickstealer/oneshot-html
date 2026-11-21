import * as THREE from 'three';

export interface ProceduralTexturePack {
  soilAlbedo: THREE.CanvasTexture;
  soilBump: THREE.CanvasTexture;
  tunnelAlbedo: THREE.CanvasTexture;
  tunnelBump: THREE.CanvasTexture;
  woodAlbedo: THREE.CanvasTexture;
  burlapAlbedo: THREE.CanvasTexture;
  particleSprite: THREE.CanvasTexture;
  dispose: () => void;
}

function makeNoiseCanvas(
  size: number,
  drawFn: (ctx: CanvasRenderingContext2D, size: number) => void,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  drawFn(ctx, size);
  return canvas;
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTexturePack {
  const aniso = Math.max(1, Math.min(8, maxAnisotropy));

  // 1. Muddy WWI Battlefield Soil Albedo (warm earthy ochre/mud/pebble speckles; tinted by vertex colors)
  const soilAlbedoCanvas = makeNoiseCanvas(256, (ctx, s) => {
    const rng = seededRand(101);
    ctx.fillStyle = '#d8cec0';
    ctx.fillRect(0, 0, s, s);

    // Subtle clumpy dirt mottling
    for (let i = 0; i < 650; i++) {
      const x = rng() * s;
      const y = rng() * s;
      const r = 3 + rng() * 14;
      const v = Math.floor(175 + rng() * 65);
      ctx.fillStyle = `rgba(${v}, ${Math.floor(v * 0.94)}, ${Math.floor(v * 0.85)}, 0.16)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine soil grains & tiny pebbles
    for (let i = 0; i < 2400; i++) {
      const x = rng() * s;
      const y = rng() * s;
      const w = 1 + rng() * 2.5;
      const dark = rng() > 0.45;
      ctx.fillStyle = dark ? 'rgba(65, 52, 38, 0.25)' : 'rgba(245, 236, 220, 0.22)';
      ctx.fillRect(x, y, w, w);
    }
  });
  const soilAlbedo = new THREE.CanvasTexture(soilAlbedoCanvas);
  soilAlbedo.colorSpace = THREE.SRGBColorSpace;
  soilAlbedo.wrapS = soilAlbedo.wrapT = THREE.RepeatWrapping;
  soilAlbedo.repeat.set(18, 18);
  soilAlbedo.anisotropy = aniso;

  // 2. Soil Bump Map (linear grayscale)
  const soilBumpCanvas = makeNoiseCanvas(256, (ctx, s) => {
    const rng = seededRand(202);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1800; i++) {
      const x = rng() * s;
      const y = rng() * s;
      const r = 1 + rng() * 5;
      const lum = Math.floor(60 + rng() * 145);
      ctx.fillStyle = `rgba(${lum}, ${lum}, ${lum}, 0.35)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const soilBump = new THREE.CanvasTexture(soilBumpCanvas);
  soilBump.wrapS = soilBump.wrapT = THREE.RepeatWrapping;
  soilBump.repeat.set(18, 18);
  soilBump.anisotropy = aniso;

  // 3. Subterranean Clay & Fine Root Vein Albedo for Underground Anthill Tunnels
  const tunnelAlbedoCanvas = makeNoiseCanvas(256, (ctx, s) => {
    const rng = seededRand(303);
    ctx.fillStyle = '#7c5335';
    ctx.fillRect(0, 0, s, s);

    // Warm compacted clay strata bands
    for (let y = 0; y < s; y += 6) {
      const shade = Math.floor(rng() * 26 - 13);
      ctx.fillStyle = `rgba(${118 + shade}, ${76 + shade}, ${48 + Math.floor(shade * 0.7)}, 0.32)`;
      ctx.fillRect(0, y, s, 4 + rng() * 4);
    }

    // Compacted soil pockets
    for (let i = 0; i < 420; i++) {
      const x = rng() * s;
      const y = rng() * s;
      const r = 2 + rng() * 9;
      ctx.fillStyle = rng() > 0.5 ? 'rgba(54, 33, 19, 0.25)' : 'rgba(164, 114, 72, 0.22)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Organic creeping root tendrils
    ctx.strokeStyle = 'rgba(186, 138, 86, 0.38)';
    for (let i = 0; i < 24; i++) {
      ctx.lineWidth = 0.8 + rng() * 1.8;
      ctx.beginPath();
      let x = rng() * s;
      let y = rng() * s;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rng() - 0.5) * 44;
        y += 12 + rng() * 26;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  const tunnelAlbedo = new THREE.CanvasTexture(tunnelAlbedoCanvas);
  tunnelAlbedo.colorSpace = THREE.SRGBColorSpace;
  tunnelAlbedo.wrapS = tunnelAlbedo.wrapT = THREE.RepeatWrapping;
  tunnelAlbedo.repeat.set(10, 3);
  tunnelAlbedo.anisotropy = aniso;

  // 4. Tunnel Bump Map
  const tunnelBumpCanvas = makeNoiseCanvas(256, (ctx, s) => {
    const rng = seededRand(404);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) {
      const x = rng() * s;
      const y = rng() * s;
      const r = 1.5 + rng() * 7;
      const g = Math.floor(45 + rng() * 165);
      ctx.fillStyle = `rgba(${g},${g},${g},0.35)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const tunnelBump = new THREE.CanvasTexture(tunnelBumpCanvas);
  tunnelBump.wrapS = tunnelBump.wrapT = THREE.RepeatWrapping;
  tunnelBump.repeat.set(10, 3);
  tunnelBump.anisotropy = aniso;

  // 5. Weathered WWI Trench Timber / Duckboard Texture
  const woodCanvas = makeNoiseCanvas(128, (ctx, s) => {
    const rng = seededRand(505);
    ctx.fillStyle = '#755c42';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) {
      const delta = Math.floor((rng() - 0.5) * 32);
      ctx.fillStyle = `rgb(${112 + delta}, ${87 + Math.floor(delta * 0.8)}, ${61 + Math.floor(delta * 0.6)})`;
      ctx.fillRect(0, y, s, 2);
    }
    ctx.fillStyle = 'rgba(32, 24, 16, 0.45)';
    ctx.fillRect(0, 31, s, 2);
    ctx.fillRect(0, 63, s, 2);
    ctx.fillRect(0, 95, s, 2);
  });
  const woodAlbedo = new THREE.CanvasTexture(woodCanvas);
  woodAlbedo.colorSpace = THREE.SRGBColorSpace;
  woodAlbedo.wrapS = woodAlbedo.wrapT = THREE.RepeatWrapping;
  woodAlbedo.anisotropy = aniso;

  // 6. Burlap Sandbag Texture
  const burlapCanvas = makeNoiseCanvas(128, (ctx, s) => {
    const rng = seededRand(606);
    ctx.fillStyle = '#a89678';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(72, 60, 44, 0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < s; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(s, i);
      ctx.stroke();
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(65, 53, 38, 0.2)' : 'rgba(225, 212, 185, 0.16)';
      ctx.fillRect(rng() * s, rng() * s, 3, 3);
    }
  });
  const burlapAlbedo = new THREE.CanvasTexture(burlapCanvas);
  burlapAlbedo.colorSpace = THREE.SRGBColorSpace;
  burlapAlbedo.wrapS = burlapAlbedo.wrapT = THREE.RepeatWrapping;
  burlapAlbedo.anisotropy = aniso;

  // 7. Soft Radial Glow / Smoke / Dust Sprite
  const particleCanvas = makeNoiseCanvas(64, (ctx, s) => {
    const grad = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.72)');
    grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.18)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
  });
  const particleSprite = new THREE.CanvasTexture(particleCanvas);
  particleSprite.colorSpace = THREE.SRGBColorSpace;

  return {
    soilAlbedo,
    soilBump,
    tunnelAlbedo,
    tunnelBump,
    woodAlbedo,
    burlapAlbedo,
    particleSprite,
    dispose: () => {
      soilAlbedo.dispose();
      soilBump.dispose();
      tunnelAlbedo.dispose();
      tunnelBump.dispose();
      woodAlbedo.dispose();
      burlapAlbedo.dispose();
      particleSprite.dispose();
    },
  };
}
