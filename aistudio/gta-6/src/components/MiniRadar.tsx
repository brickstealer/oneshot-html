import { useEffect, useRef } from 'react';
import { BIOME_DEFS, CHUNK_SIZE } from '../sim/biomes';
import type { BiomeId, RadarBlip } from '../sim/types';

interface MiniRadarProps {
  biome: BiomeId;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  wantedStars: number;
  blips: RadarBlip[];
}

export function MiniRadar({
  biome,
  playerX,
  playerZ,
  playerHeading,
  wantedStars,
  blips,
}: MiniRadarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const range = 92; // meters visible from center to edge
    const scale = (w * 0.48) / range;

    // Background block tint matching current biome
    ctx.clearRect(0, 0, w, h);
    const biomeColorHex = BIOME_DEFS[biome].groundColor.toString(16).padStart(6, '0');
    ctx.fillStyle = `#${biomeColorHex}`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8, 12, 20, 0.56)';
    ctx.fillRect(0, 0, w, h);

    // Draw procedural road grid lines relative to player
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.34)';
    ctx.lineWidth = Math.max(4, 15 * scale);
    const minGx = Math.floor((playerX - range) / CHUNK_SIZE) - 1;
    const maxGx = Math.ceil((playerX + range) / CHUNK_SIZE) + 1;
    const minGz = Math.floor((playerZ - range) / CHUNK_SIZE) - 1;
    const maxGz = Math.ceil((playerZ + range) / CHUNK_SIZE) + 1;

    ctx.beginPath();
    for (let gx = minGx; gx <= maxGx; gx++) {
      const rx = cx + (gx * CHUNK_SIZE - playerX) * scale;
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx, h);
    }
    for (let gz = minGz; gz <= maxGz; gz++) {
      const rz = cy + (gz * CHUNK_SIZE - playerZ) * scale;
      ctx.moveTo(0, rz);
      ctx.lineTo(w, rz);
    }
    ctx.stroke();

    // Draw entities & landmarks
    const flash = Math.floor(performance.now() / 220) % 2 === 0;
    for (const b of blips) {
      const px = cx + b.dx * scale;
      const pz = cy + b.dz * scale;
      if (px < 4 || px > w - 4 || pz < 4 || pz > h - 4) continue;

      if (b.kind === 'bank') {
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', px, pz);
      } else if (b.kind === 'police' || b.kind === 'chopper') {
        ctx.fillStyle = flash ? '#ef4444' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(px, pz, b.kind === 'chopper' ? 4.2 : 3.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === 'tanker') {
        ctx.fillStyle = '#f97316';
        ctx.fillRect(px - 3, pz - 3, 6, 6);
      } else if (b.kind === 'bus') {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(px - 2.5, pz - 2.5, 5, 5);
      } else {
        ctx.fillStyle = 'rgba(241,245,249,0.72)';
        ctx.beginPath();
        ctx.arc(px, pz, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Protagonist directional arrow in center
    ctx.save();
    ctx.translate(cx, cy);
    // Heading 0 = +Z (down on north-up map), heading +PI/2 = +X (right)
    ctx.rotate(-playerHeading + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#090b10';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.8, 5.2);
    ctx.lineTo(0, 2.8);
    ctx.lineTo(-4.8, 5.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Police alert border tint when wanted
    if (wantedStars > 0) {
      ctx.strokeStyle = flash ? 'rgba(239,68,68,0.85)' : 'rgba(59,130,246,0.85)';
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    }
  }, [biome, playerX, playerZ, playerHeading, wantedStars, blips]);

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-white/25"
      style={{
        backgroundColor: 'rgba(9, 12, 18, 0.86)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.55)',
      }}
      aria-label="Мини-карта города"
    >
      <canvas
        ref={canvasRef}
        width={128}
        height={104}
        className="block w-[92px] h-[74px] sm:w-[128px] sm:h-[104px]"
      />
      <div className="absolute top-1 left-1.5 text-[9px] font-mono-num font-bold text-slate-300/90 pointer-events-none">
        N
      </div>
    </div>
  );
}
