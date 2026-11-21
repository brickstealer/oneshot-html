import type { CameraMode, SimulationConfig, Vec3, WorldData } from './types';
import type { SimHotspot } from './antSimulation';
import { mulberry32, sampleSpline } from './worldGen';

export interface CameraFrame {
  position: Vec3;
  lookAt: Vec3;
  bankAngle: number;
  fov: number;
  undergroundFactor: number; // 0 = outdoors, 1 = deep underground tunnel
  shotLabel: string;
}

type AutoPhase = 'panorama' | 'trench_run' | 'battle_orbit' | 'tunnel_dive_red' | 'tunnel_dive_black';

export function computeResponsiveFov(aspect: number): number {
  if (aspect >= 1.25) return 50;
  if (aspect <= 0.56) return 68;
  // Smoothly widen vertical FOV on narrow portrait viewports so wide trenches & mounds stay well-framed
  const t = (1.25 - aspect) / (1.25 - 0.56);
  return 50 + t * 18;
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  const k = 1 - Math.exp(-lambda * dt);
  return current + (target - current) * k;
}

export class CameraDirector {
  private world: WorldData;
  private rng: () => number;

  private pos: Vec3;
  private look: Vec3;
  private bank = 0;
  private undergroundFactor = 0;

  private phase: AutoPhase = 'panorama';
  private phaseTime = 0;
  private phaseDuration = 11;
  private sequenceIdx = 0;
  private totalTime = 0;

  // Tunnel cruise state for continuous 'tunnels' mode
  private tunnelCursor = 0.08;
  private activeTunnelIdx = 0;

  // Cached action anchor for battle orbit
  private battleAnchor: Vec3 = { x: 0, y: 1, z: 0 };

  constructor(world: WorldData) {
    this.world = world;
    this.rng = mulberry32((world.seed ^ 0x517cc1b7) >>> 0);

    // Start on an iconic hero framing showing BOTH anthills, portals, and WWI trenches clearly
    const startX = -4;
    const startZ = 48;
    const startY = Math.max(world.heightAt(startX, startZ) + 15, 22);
    this.pos = { x: startX, y: startY, z: startZ };
    this.look = { x: 0, y: world.heightAt(0, 0) + 1.8, z: -2 };
  }

  public resetForWorld(world: WorldData): void {
    this.world = world;
    this.rng = mulberry32((world.seed ^ 0x517cc1b7) >>> 0);
    this.phase = 'panorama';
    this.phaseTime = 0;
    this.phaseDuration = 11;
    this.sequenceIdx = 0;
    this.tunnelCursor = 0.24;
    this.activeTunnelIdx = 0;
    const startX = -4;
    const startZ = 48;
    const startY = Math.max(world.heightAt(startX, startZ) + 15, 22);
    this.pos = { x: startX, y: startY, z: startZ };
    this.look = { x: 0, y: world.heightAt(0, 0) + 1.8, z: -2 };
    this.undergroundFactor = 0;
  }

  public snapToMode(mode: CameraMode, hotspot: SimHotspot): void {
    if (mode === 'tunnels') {
      // Immediately enter the main tunnel chamber cruise so the user sees the subterranean world right away
      this.activeTunnelIdx = this.findMainTunnelIndex('red');
      this.tunnelCursor = 0.26;
      const curTunnel = this.world.tunnels[this.activeTunnelIdx] ?? this.world.tunnels[0];
      const here = sampleSpline(curTunnel.points, this.tunnelCursor);
      const ahead = sampleSpline(curTunnel.points, Math.min(0.99, this.tunnelCursor + 0.06));
      this.pos = { x: here.pos.x, y: here.pos.y + 0.15, z: here.pos.z };
      this.look = { x: ahead.pos.x, y: ahead.pos.y - 0.15, z: ahead.pos.z };
      this.undergroundFactor = 1;
    } else if (mode === 'trenches') {
      const zSweep = -12;
      const xSweep = -8;
      this.pos = { x: xSweep, y: this.world.heightAt(xSweep, zSweep) + 4.0, z: zSweep };
      this.look = { x: 4, y: this.world.heightAt(4, 2) + 0.8, z: 2 };
      this.undergroundFactor = 0;
    } else if (mode === 'battle') {
      this.battleAnchor = { ...hotspot };
      const px = hotspot.x + 9.5;
      const pz = hotspot.z + 9.5;
      this.pos = {
        x: px,
        y: Math.max(this.world.heightAt(px, pz) + 3.2, hotspot.y + 5.2),
        z: pz,
      };
      this.look = { x: hotspot.x, y: hotspot.y + 0.6, z: hotspot.z };
      this.undergroundFactor = 0;
    } else if (mode === 'panorama') {
      this.pos = { x: -4, y: 22, z: 48 };
      this.look = { x: 0, y: 2, z: -2 };
      this.undergroundFactor = 0;
    }
  }

  public getCurrentState(): { pos: Vec3; look: Vec3 } {
    return { pos: { ...this.pos }, look: { ...this.look } };
  }

  public syncFromManual(pos: Vec3, look: Vec3): void {
    this.pos = { ...pos };
    this.look = { ...look };
    const surfaceY = this.world.heightAt(pos.x, pos.z);
    this.undergroundFactor = pos.y < surfaceY - 1.2 ? 1 : 0;
  }

  private pickNextAutoPhase(autoDiveTunnels: boolean): AutoPhase {
    const cycle: AutoPhase[] = autoDiveTunnels
      ? ['panorama', 'trench_run', 'tunnel_dive_red', 'battle_orbit', 'trench_run', 'tunnel_dive_black']
      : ['panorama', 'trench_run', 'battle_orbit', 'panorama', 'trench_run'];
    this.sequenceIdx = (this.sequenceIdx + 1) % cycle.length;
    return cycle[this.sequenceIdx];
  }

  private findMainTunnelIndex(faction: 'red' | 'black'): number {
    const idx = this.world.tunnels.findIndex((t) => t.faction === faction && t.isMainShaft);
    return idx >= 0 ? idx : 0;
  }

  public update(
    rawDt: number,
    aspect: number,
    config: SimulationConfig,
    hotspot: SimHotspot,
  ): CameraFrame {
    const dt = Math.min(0.06, Math.max(0.001, rawDt));
    const speed = config.cameraSpeed;
    this.totalTime += dt * speed;

    const mode: CameraMode = config.cameraMode;
    const fov = computeResponsiveFov(aspect);

    // If user is in free manual mode, just return synced state
    if (mode === 'free') {
      const surfY = this.world.heightAt(this.pos.x, this.pos.z);
      const targetUg = this.pos.y < surfY - 1.5 ? 1 : 0;
      this.undergroundFactor = damp(this.undergroundFactor, targetUg, 4.0, dt);
      return {
        position: { ...this.pos },
        lookAt: { ...this.look },
        bankAngle: 0,
        fov,
        undergroundFactor: this.undergroundFactor,
        shotLabel: 'Свободный осмотр',
      };
    }

    let desiredPos: Vec3 = { ...this.pos };
    let desiredLook: Vec3 = { ...this.look };
    let desiredBank = 0;
    let isInsideTunnel = false;
    let shotLabel = 'Панорамный облет';
    let posDamp = 2.6;
    let lookDamp = 3.4;

    if (mode === 'tunnels') {
      // Continuous flythrough across all underground tunnel loops
      const tunnel = this.world.tunnels[this.activeTunnelIdx] ?? this.world.tunnels[0];
      this.tunnelCursor += dt * speed * 0.055;
      if (this.tunnelCursor >= 0.94) {
        this.tunnelCursor = 0.06;
        this.activeTunnelIdx = (this.activeTunnelIdx + 1) % this.world.tunnels.length;
      }
      const curTunnel = this.world.tunnels[this.activeTunnelIdx] ?? this.world.tunnels[0];
      const here = sampleSpline(curTunnel.points, this.tunnelCursor);
      const ahead = sampleSpline(curTunnel.points, Math.min(0.99, this.tunnelCursor + 0.055));

      desiredPos = {
        x: here.pos.x,
        y: here.pos.y + 0.15,
        z: here.pos.z,
      };
      desiredLook = {
        x: ahead.pos.x,
        y: ahead.pos.y - 0.15,
        z: ahead.pos.z,
      };
      desiredBank = Math.sin(this.totalTime * 0.9) * 0.04;
      isInsideTunnel = true;
      posDamp = 4.2;
      lookDamp = 5.2;
      shotLabel =
        curTunnel.id === 'nomansland_sapper'
          ? 'Подкоп под нейтральной полосой'
          : curTunnel.faction === 'red'
            ? 'Туннели Рыжей Империи'
            : 'Туннели Чёрного Легиона';
    } else if (mode === 'panorama') {
      const a = this.totalTime * 0.14;
      const radX = 44 + Math.sin(a * 0.7) * 8;
      const radZ = 36 + Math.cos(a * 0.5) * 6;
      const px = Math.sin(a) * radX;
      const pz = Math.cos(a) * radZ;
      const py = 15.5 + Math.sin(a * 1.4) * 7.5;
      desiredPos = { x: px, y: py, z: pz };
      desiredLook = {
        x: Math.sin(a * 0.45) * 14,
        y: this.world.heightAt(0, 0) + 1.4,
        z: Math.cos(a * 0.35) * 8,
      };
      desiredBank = Math.cos(a) * 0.03;
      shotLabel = 'Панорамный облет фронта';
    } else if (mode === 'trenches') {
      const t = this.totalTime * 0.24;
      const zSweep = Math.sin(t) * 28;
      const xSweep = Math.sin(t * 2.1) * 16;
      const groundY = this.world.heightAt(xSweep, zSweep);
      desiredPos = {
        x: xSweep,
        y: groundY + 3.4 + Math.sin(t * 1.7) * 1.6,
        z: zSweep,
      };
      const aheadZ = Math.sin(t + 0.16) * 28;
      const aheadX = Math.sin((t + 0.16) * 2.1) * 16;
      desiredLook = {
        x: aheadX,
        y: this.world.heightAt(aheadX, aheadZ) + 0.8,
        z: aheadZ,
      };
      desiredBank = Math.cos(t * 2.1) * 0.06;
      shotLabel = 'Бреющий полет над окопами';
    } else if (mode === 'battle') {
      this.battleAnchor.x = damp(this.battleAnchor.x, hotspot.x, 0.7, dt);
      this.battleAnchor.y = damp(this.battleAnchor.y, hotspot.y, 0.7, dt);
      this.battleAnchor.z = damp(this.battleAnchor.z, hotspot.z, 0.7, dt);

      const angle = this.totalTime * 0.35;
      const dist = 10.5 + Math.sin(this.totalTime * 0.6) * 2.5;
      const px = this.battleAnchor.x + Math.cos(angle) * dist;
      const pz = this.battleAnchor.z + Math.sin(angle) * dist;
      const groundY = this.world.heightAt(px, pz);
      desiredPos = {
        x: px,
        y: Math.max(groundY + 2.8, this.battleAnchor.y + 4.8 + Math.sin(angle * 1.5) * 1.6),
        z: pz,
      };
      desiredLook = {
        x: this.battleAnchor.x,
        y: this.battleAnchor.y + 0.6,
        z: this.battleAnchor.z,
      };
      shotLabel = hotspot.kind === 'build' ? 'Строительство укреплений' : 'Схватка на передовой';
    } else {
      // 'auto' — Cinematic Director cycling through varied altitudes, trenches, battles & tunnel dives
      this.phaseTime += dt * speed;
      if (this.phaseTime >= this.phaseDuration) {
        this.phase = this.pickNextAutoPhase(config.autoDiveTunnels);
        this.phaseTime = 0;
        this.phaseDuration =
          this.phase === 'tunnel_dive_red' || this.phase === 'tunnel_dive_black'
            ? 14
            : 9 + this.rng() * 5;
        if (this.phase === 'battle_orbit') {
          this.battleAnchor = { ...hotspot };
        }
      }

      const u = Math.min(1, this.phaseTime / this.phaseDuration);

      if (this.phase === 'panorama') {
        const a = this.totalTime * 0.14;
        const px = Math.sin(a) * 44;
        const pz = Math.cos(a) * 35;
        const py = 14 + Math.sin(u * Math.PI) * 10;
        desiredPos = { x: px, y: py, z: pz };
        desiredLook = { x: Math.cos(a * 0.5) * 12, y: 1.5, z: 0 };
        desiredBank = Math.cos(a) * 0.025;
        shotLabel = 'Панорамный облет долины';
      } else if (this.phase === 'trench_run') {
        const sweep = -26 + u * 52;
        const laneX = Math.sin(u * Math.PI * 2) * 15;
        const gY = this.world.heightAt(laneX, sweep);
        desiredPos = {
          x: laneX,
          y: gY + 3.2 + Math.sin(u * Math.PI) * 2.5,
          z: sweep,
        };
        const lookZ = Math.min(30, sweep + 9);
        const lookX = Math.sin((u + 0.14) * Math.PI * 2) * 13;
        desiredLook = {
          x: lookX,
          y: this.world.heightAt(lookX, lookZ) + 0.6,
          z: lookZ,
        };
        desiredBank = Math.cos(u * Math.PI * 2) * 0.055;
        shotLabel = 'Полет вдоль линии окопов';
      } else if (this.phase === 'battle_orbit') {
        this.battleAnchor.x = damp(this.battleAnchor.x, hotspot.x, 0.45, dt);
        this.battleAnchor.y = damp(this.battleAnchor.y, hotspot.y, 0.45, dt);
        this.battleAnchor.z = damp(this.battleAnchor.z, hotspot.z, 0.45, dt);

        const a = u * Math.PI * 1.4 + 0.6;
        const dist = 11.5 - Math.sin(u * Math.PI) * 3.0;
        const px = this.battleAnchor.x + Math.cos(a) * dist;
        const pz = this.battleAnchor.z + Math.sin(a) * dist;
        const gY = this.world.heightAt(px, pz);
        desiredPos = {
          x: px,
          y: Math.max(gY + 2.8, this.battleAnchor.y + 4.6),
          z: pz,
        };
        desiredLook = {
          x: this.battleAnchor.x,
          y: this.battleAnchor.y + 0.5,
          z: this.battleAnchor.z,
        };
        shotLabel = hotspot.kind === 'build' ? 'Возведение укреплений' : 'Сражение на передовой';
      } else {
        // Tunnel dive straight into the Western (Red) or Eastern (Black) anthill and back out!
        const faction = this.phase === 'tunnel_dive_red' ? 'red' : 'black';
        const tIdx = this.findMainTunnelIndex(faction);
        const tunnel = this.world.tunnels[tIdx];

        if (u < 0.14) {
          // Smooth aerial approach lining up right above the mound crater entrance
          const approachU = u / 0.14;
          const entry = tunnel.points[0];
          const nextPt = tunnel.points[1];
          const dir = faction === 'red' ? 1 : -1;
          desiredPos = {
            x: entry.x + dir * (1 - approachU) * 11,
            y: entry.y + 1.2 + (1 - approachU) * 7.5,
            z: entry.z + (1 - approachU) * 4,
          };
          desiredLook = { x: nextPt.x, y: nextPt.y, z: nextPt.z };
          posDamp = 3.2;
          shotLabel =
            faction === 'red' ? 'Заход в западный муравейник' : 'Заход в восточный муравейник';
        } else if (u < 0.88) {
          // Cruise through underground galleries & chambers
          const splineU = (u - 0.14) / 0.74;
          const here = sampleSpline(tunnel.points, splineU);
          const ahead = sampleSpline(tunnel.points, Math.min(0.99, splineU + 0.06));
          desiredPos = { x: here.pos.x, y: here.pos.y + 0.15, z: here.pos.z };
          desiredLook = { x: ahead.pos.x, y: ahead.pos.y - 0.1, z: ahead.pos.z };
          isInsideTunnel = splineU > 0.06 && splineU < 0.94;
          posDamp = 4.6;
          lookDamp = 5.4;
          shotLabel =
            faction === 'red'
              ? 'Подземные туннели Рыжей Империи'
              : 'Подземные туннели Чёрного Легиона';
        } else {
          // Climb out of the exit portal back into daylight
          const exitU = (u - 0.88) / 0.12;
          const exit = tunnel.points[tunnel.points.length - 1];
          const dir = faction === 'red' ? -1 : 1;
          desiredPos = {
            x: exit.x + dir * exitU * 14,
            y: exit.y + 2.5 + exitU * 10,
            z: exit.z + exitU * 6,
          };
          desiredLook = { x: 0, y: 2.5, z: 0 };
          posDamp = 2.8;
          shotLabel = 'Выход из муравейника на поверхность';
        }
      }
    }

    // Outdoor terrain clearance safety (never clip ground outside tunnels)
    if (!isInsideTunnel) {
      const portalMask = this.world.portalMaskAt(desiredPos.x, desiredPos.z);
      if (portalMask < 0.25) {
        const minGround = this.world.heightAt(desiredPos.x, desiredPos.z) + 1.5;
        if (desiredPos.y < minGround) {
          desiredPos.y = minGround;
        }
      }
    }

    // Smooth exponential damping
    this.pos.x = damp(this.pos.x, desiredPos.x, posDamp, dt);
    this.pos.y = damp(this.pos.y, desiredPos.y, posDamp, dt);
    this.pos.z = damp(this.pos.z, desiredPos.z, posDamp, dt);

    this.look.x = damp(this.look.x, desiredLook.x, lookDamp, dt);
    this.look.y = damp(this.look.y, desiredLook.y, lookDamp, dt);
    this.look.z = damp(this.look.z, desiredLook.z, lookDamp, dt);

    this.bank = damp(this.bank, desiredBank, 3.0, dt);

    const surfaceUnderCam = this.world.heightAt(this.pos.x, this.pos.z);
    const targetUnderground = isInsideTunnel || this.pos.y < surfaceUnderCam - 1.2 ? 1 : 0;
    this.undergroundFactor = damp(this.undergroundFactor, targetUnderground, 3.5, dt);

    return {
      position: { ...this.pos },
      lookAt: { ...this.look },
      bankAngle: this.bank,
      fov,
      undergroundFactor: this.undergroundFactor,
      shotLabel,
    };
  }
}
