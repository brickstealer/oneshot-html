import type {
  AntAgent,
  AntRole,
  BurstEffect,
  CargoType,
  FactionId,
  Fortification,
  Projectile,
  SimulationConfig,
  Vec3,
  WorldData,
} from './types';
import { mulberry32, sampleSpline } from './worldGen';

export interface SimHotspot {
  x: number;
  y: number;
  z: number;
  kind: 'battle' | 'build' | 'trench';
}

export class AntSimulation {
  public readonly world: WorldData;
  public ants: AntAgent[] = [];
  public fortifications: Fortification[] = [];
  public projectiles: Projectile[] = [];
  public bursts: BurstEffect[] = [];
  public simTime = 0;

  private rng: () => number;
  private nextAntId = 1;
  private nextProjId = 1;
  private nextBurstId = 1;
  private waveCooldown = 4;
  private activeWaveFaction: FactionId | null = null;
  private activeWaveTimer = 0;

  constructor(world: WorldData, initialConfig: SimulationConfig) {
    this.world = world;
    this.rng = mulberry32((world.seed ^ 0x9e3779b9) >>> 0);
    this.fortifications = world.initialFortifications.map((f) => ({ ...f }));
    this.syncPopulation(initialConfig.antsPerFaction);
  }

  public syncPopulation(targetPerFaction: number): void {
    const clamped = Math.max(30, Math.min(260, Math.round(targetPerFaction)));

    for (const faction of ['red', 'black'] as FactionId[]) {
      const factionAnts = this.ants.filter((a) => a.faction === faction);
      if (factionAnts.length < clamped) {
        const toAdd = clamped - factionAnts.length;
        for (let i = 0; i < toAdd; i++) {
          this.ants.push(this.spawnAnt(faction, true));
        }
      } else if (factionAnts.length > clamped) {
        let toRemove = factionAnts.length - clamped;
        this.ants = this.ants.filter((a) => {
          if (a.faction === faction && toRemove > 0) {
            toRemove--;
            return false;
          }
          return true;
        });
      }
    }
  }

  private pickRole(): AntRole {
    const r = this.rng();
    if (r < 0.44) return 'soldier';
    if (r < 0.62) return 'engineer';
    if (r < 0.76) return 'forager';
    if (r < 0.92) return 'tunnel_worker';
    return 'scout';
  }

  private pickTrenchPoint(faction: FactionId, preferFront = true): Vec3 {
    const candidates = this.world.trenches.filter(
      (t) => t.faction === faction && (preferFront ? t.line === 'front' : true),
    );
    const trench = candidates[Math.floor(this.rng() * candidates.length)] ?? this.world.trenches[0];
    const idx = Math.floor(this.rng() * (trench.points.length - 1));
    const a = trench.points[idx];
    const b = trench.points[idx + 1];
    const u = this.rng();
    const x = a.x + (b.x - a.x) * u + (this.rng() - 0.5) * 1.4;
    const z = a.z + (b.z - a.z) * u + (this.rng() - 0.5) * 1.4;
    return { x, y: this.world.heightAt(x, z), z };
  }

  private findTunnelsForFaction(faction: FactionId): number[] {
    const indices: number[] = [];
    for (let i = 0; i < this.world.tunnels.length; i++) {
      const t = this.world.tunnels[i];
      if (t.faction === faction || t.id === 'nomansland_sapper') {
        indices.push(i);
      }
    }
    return indices.length > 0 ? indices : [0];
  }

  private spawnAnt(faction: FactionId, spreadInitial = false): AntAgent {
    const role = this.pickRole();
    const mound = this.world.mounds[faction];
    const id = this.nextAntId++;
    const scaleBase =
      role === 'soldier' ? 1.18 : role === 'engineer' ? 1.05 : role === 'scout' ? 0.92 : 0.96;
    const scale = scaleBase * (0.9 + this.rng() * 0.22);
    const maxHp = role === 'soldier' ? 42 : role === 'engineer' ? 28 : 22;

    if (role === 'tunnel_worker') {
      const tunnelIds = this.findTunnelsForFaction(faction);
      const tunnelIndex = tunnelIds[Math.floor(this.rng() * tunnelIds.length)];
      const tunnel = this.world.tunnels[tunnelIndex];
      const tunnelT = spreadInitial ? 0.1 + this.rng() * 0.8 : 0.08;
      const tunnelAngle = (this.rng() - 0.5) * 1.1; // walk on lower tunnel floor arc
      const sampled = sampleSpline(tunnel.points, tunnelT);
      const cargoOptions: CargoType[] = ['larva', 'seed', 'soil', 'none'];
      const cargo = cargoOptions[Math.floor(this.rng() * cargoOptions.length)];

      return {
        id,
        faction,
        role,
        state: 'tunnel_crawl',
        x: sampled.pos.x,
        y: sampled.pos.y - tunnel.radius * 0.72,
        z: sampled.pos.z,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: Math.atan2(sampled.tangent.x, sampled.tangent.z),
        pitch: 0,
        hp: maxHp,
        maxHp,
        speed: 2.8 + this.rng() * 1.3,
        scale,
        cargo,
        targetX: sampled.pos.x,
        targetY: sampled.pos.y,
        targetZ: sampled.pos.z,
        targetFortId: null,
        targetFoodId: null,
        targetEnemyId: null,
        stateTimer: 1.5 + this.rng() * 4,
        animPhase: this.rng() * Math.PI * 2,
        underground: true,
        tunnelIndex,
        tunnelT,
        tunnelDir: this.rng() > 0.5 ? 1 : -1,
        tunnelAngle,
      };
    }

    // Surface ant spawn
    let x = mound.portalPos.x + (this.rng() - 0.5) * 3.5;
    let z = mound.portalPos.z + (this.rng() - 0.5) * 3.5;
    let state: AntAgent['state'] = 'patrol_trench';
    let cargo: CargoType = 'none';
    let target = this.pickTrenchPoint(faction, role === 'soldier');

    if (spreadInitial) {
      if (role === 'soldier') {
        const pt = this.pickTrenchPoint(faction, this.rng() < 0.78);
        x = pt.x + (this.rng() - 0.5) * 3;
        z = pt.z + (this.rng() - 0.5) * 3;
        if (this.rng() < 0.28) {
          state = 'charge';
          target = this.pickTrenchPoint(faction === 'red' ? 'black' : 'red', true);
        }
      } else if (role === 'engineer') {
        const ownForts = this.fortifications.filter((f) => f.faction === faction);
        if (ownForts.length > 0) {
          const fort = ownForts[Math.floor(this.rng() * ownForts.length)];
          x = fort.x + (this.rng() - 0.5) * 6;
          z = fort.z + (this.rng() - 0.5) * 6;
          target = { x: fort.x, y: fort.y, z: fort.z };
          state = 'build_fort';
          cargo = this.rng() > 0.5 ? 'pebble' : 'twig';
        }
      } else if (role === 'forager') {
        const food = this.world.foodSites[Math.floor(this.rng() * this.world.foodSites.length)];
        const u = this.rng();
        x = mound.portalPos.x + (food.x - mound.portalPos.x) * u;
        z = mound.portalPos.z + (food.z - mound.portalPos.z) * u;
        state = this.rng() > 0.5 ? 'forage_out' : 'forage_return';
        cargo = state === 'forage_return' ? 'seed' : 'none';
        target = state === 'forage_out' ? { x: food.x, y: food.y, z: food.z } : { ...mound.portalPos };
      } else if (role === 'scout') {
        x = (this.rng() - 0.5) * 36;
        z = (this.rng() - 0.5) * 52;
        state = 'scout_roam';
        target = {
          x: (this.rng() - 0.5) * 44,
          y: 0,
          z: (this.rng() - 0.5) * 56,
        };
      }
    } else {
      if (role === 'engineer') state = 'fetch_material';
      else if (role === 'forager') state = 'forage_out';
      else if (role === 'scout') state = 'scout_roam';
    }

    const y = this.world.heightAt(x, z);
    const yaw = Math.atan2(target.x - x, target.z - z);

    return {
      id,
      faction,
      role,
      state,
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw,
      pitch: 0,
      hp: maxHp,
      maxHp,
      speed:
        role === 'scout'
          ? 5.2 + this.rng() * 1.4
          : role === 'soldier'
            ? 3.7 + this.rng() * 1.1
            : 3.1 + this.rng() * 0.9,
      scale,
      cargo,
      targetX: target.x,
      targetY: target.y,
      targetZ: target.z,
      targetFortId: null,
      targetFoodId: null,
      targetEnemyId: null,
      stateTimer: 2 + this.rng() * 5,
      animPhase: this.rng() * Math.PI * 2,
      underground: false,
      tunnelIndex: 0,
      tunnelT: 0,
      tunnelDir: 1,
      tunnelAngle: 0,
    };
  }

  public step(rawDt: number, config: SimulationConfig): void {
    if (config.paused) return;
    const dt = Math.min(0.06, Math.max(0.001, rawDt)) * config.timeScale;
    this.simTime += dt;

    // Keep population synced with slider
    this.syncPopulation(config.antsPerFaction);

    // Random unpredictable WWI "Over-the-Top" offensive waves
    this.waveCooldown -= dt * config.battleIntensity;
    if (this.waveCooldown <= 0) {
      this.activeWaveFaction = this.rng() > 0.5 ? 'red' : 'black';
      this.activeWaveTimer = 6 + this.rng() * 6;
      this.waveCooldown = 11 + this.rng() * 10;
    }
    if (this.activeWaveTimer > 0) {
      this.activeWaveTimer -= dt;
      if (this.activeWaveTimer <= 0) this.activeWaveFaction = null;
    }

    // Mortar artillery firing from built mortar nests
    this.updateArtillery(dt, config);

    // Update projectiles & bursts
    this.updateProjectiles(dt);
    this.updateBursts(dt);

    // Quick spatial buckets for surface combat checks
    const redSurface: AntAgent[] = [];
    const blackSurface: AntAgent[] = [];
    for (let i = 0; i < this.ants.length; i++) {
      const a = this.ants[i];
      if (!a.underground && a.hp > 0) {
        if (a.faction === 'red') redSurface.push(a);
        else blackSurface.push(a);
      }
    }

    // Update every ant
    for (let i = 0; i < this.ants.length; i++) {
      const ant = this.ants[i];
      if (ant.hp <= 0) continue;

      if (ant.underground) {
        this.updateTunnelAnt(ant, dt);
      } else {
        const enemies = ant.faction === 'red' ? blackSurface : redSurface;
        this.updateSurfaceAnt(ant, dt, config, enemies);
      }
    }

    // Respawn fallen ants at their anthill portals so the war is truly endless
    for (let i = 0; i < this.ants.length; i++) {
      if (this.ants[i].hp <= 0) {
        const faction = this.ants[i].faction;
        this.ants[i] = this.spawnAnt(faction, false);
      }
    }
  }

  private updateTunnelAnt(ant: AntAgent, dt: number): void {
    const tunnel = this.world.tunnels[ant.tunnelIndex];
    if (!tunnel) return;

    ant.stateTimer -= dt;
    if (ant.state === 'tunnel_work') {
      // Pausing briefly in a chamber to tend larvae/food or dig wall
      ant.animPhase += dt * 7;
      if (ant.stateTimer <= 0) {
        ant.state = 'tunnel_crawl';
        ant.stateTimer = 3 + this.rng() * 6;
        if (this.rng() < 0.45) {
          const cargoPool: CargoType[] = ['larva', 'seed', 'soil', 'none'];
          ant.cargo = cargoPool[Math.floor(this.rng() * cargoPool.length)];
        }
      }
      return;
    }

    // Crawl along tunnel spline
    const speedT = (ant.speed * 0.0155) * dt;
    ant.tunnelT += speedT * ant.tunnelDir;

    if (ant.tunnelT >= 0.94) {
      ant.tunnelT = 0.94;
      ant.tunnelDir = -1;
      ant.state = 'tunnel_work';
      ant.stateTimer = 1.2 + this.rng() * 2.5;
    } else if (ant.tunnelT <= 0.06) {
      ant.tunnelT = 0.06;
      ant.tunnelDir = 1;
      ant.state = 'tunnel_work';
      ant.stateTimer = 1.2 + this.rng() * 2.5;
    } else if (ant.stateTimer <= 0 && this.rng() < 0.35) {
      ant.state = 'tunnel_work';
      ant.stateTimer = 1.5 + this.rng() * 3.0;
    }

    const sampled = sampleSpline(tunnel.points, ant.tunnelT);
    const tx = sampled.tangent.x * ant.tunnelDir;
    const ty = sampled.tangent.y * ant.tunnelDir;
    const tz = sampled.tangent.z * ant.tunnelDir;

    // Right vector orthogonal to tangent and world Up
    let rx = -tz;
    let rz = tx;
    const rLen = Math.hypot(rx, rz) || 1;
    rx /= rLen;
    rz /= rLen;

    const radialOffset = tunnel.radius * 0.72;
    const sinA = Math.sin(ant.tunnelAngle);
    const cosA = Math.cos(ant.tunnelAngle);

    ant.x = sampled.pos.x + rx * sinA * radialOffset;
    ant.y = sampled.pos.y - cosA * radialOffset;
    ant.z = sampled.pos.z + rz * sinA * radialOffset;

    ant.yaw = Math.atan2(tx, tz);
    ant.pitch = Math.asin(Math.max(-0.85, Math.min(0.85, ty)));
    ant.animPhase += dt * ant.speed * 4.5;
  }

  private updateSurfaceAnt(
    ant: AntAgent,
    dt: number,
    config: SimulationConfig,
    enemies: AntAgent[],
  ): void {
    ant.stateTimer -= dt;
    const mound = this.world.mounds[ant.faction];
    const enemyFaction: FactionId = ant.faction === 'red' ? 'black' : 'red';

    // Check for nearby enemy for combat engagement (soldiers aggressively, others defensively)
    const engageRadius = ant.role === 'soldier' ? 4.8 : 2.1;
    let nearestEnemy: AntAgent | null = null;
    let nearestDistSq = engageRadius * engageRadius;

    // Sample stride to keep O(N) ultra-fast even with 500 ants
    const stepStride = enemies.length > 120 ? 2 : 1;
    const startIdx = (ant.id + Math.floor(this.simTime * 10)) % stepStride;
    for (let j = startIdx; j < enemies.length; j += stepStride) {
      const e = enemies[j];
      if (e.hp <= 0) continue;
      const dx = e.x - ant.x;
      const dz = e.z - ant.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < nearestDistSq) {
        nearestDistSq = dSq;
        nearestEnemy = e;
      }
    }

    if (nearestEnemy && ant.state !== 'retreat') {
      if (nearestDistSq < 1.65 * 1.65) {
        ant.state = 'fight';
        ant.targetEnemyId = nearestEnemy.id;
        ant.yaw = Math.atan2(nearestEnemy.x - ant.x, nearestEnemy.z - ant.z);
        ant.animPhase += dt * 16;

        // Deal mandible combat damage
        const dmg = (ant.role === 'soldier' ? 16 : 7) * config.battleIntensity * dt;
        nearestEnemy.hp -= dmg;

        if (this.rng() < dt * 2.4 && this.bursts.length < 48) {
          this.spawnBurst(
            (ant.x + nearestEnemy.x) * 0.5,
            ant.y + 0.35,
            (ant.z + nearestEnemy.z) * 0.5,
            'clash',
            0.7,
          );
        }

        // Slight jostle in melee
        ant.x += (this.rng() - 0.5) * dt * 1.4;
        ant.z += (this.rng() - 0.5) * dt * 1.4;
        ant.y = this.world.heightAt(ant.x, ant.z);

        if (ant.hp < ant.maxHp * 0.25 && this.rng() < 0.2) {
          ant.state = 'retreat';
          ant.targetX = mound.portalPos.x;
          ant.targetZ = mound.portalPos.z;
          ant.stateTimer = 5;
        }
        return;
      } else if (ant.role === 'soldier') {
        ant.targetX = nearestEnemy.x;
        ant.targetZ = nearestEnemy.z;
      }
    } else if (ant.state === 'fight') {
      ant.state = ant.role === 'soldier' ? 'patrol_trench' : 'scout_roam';
      ant.stateTimer = 0;
    }

    // Role-specific AI transitions
    const distToTarget = Math.hypot(ant.targetX - ant.x, ant.targetZ - ant.z);

    if (ant.role === 'soldier') {
      if (
        this.activeWaveFaction === ant.faction &&
        ant.state === 'patrol_trench' &&
        this.rng() < dt * 0.85 * config.battleIntensity
      ) {
        ant.state = 'charge';
        const enemyPt = this.pickTrenchPoint(enemyFaction, true);
        ant.targetX = enemyPt.x + (this.rng() - 0.5) * 4;
        ant.targetZ = enemyPt.z + (this.rng() - 0.5) * 4;
        ant.stateTimer = 9 + this.rng() * 6;
      } else if (distToTarget < 1.8 || ant.stateTimer <= 0) {
        if (ant.state === 'retreat') {
          ant.hp = Math.min(ant.maxHp, ant.hp + 15);
          ant.state = 'patrol_trench';
        }
        const shouldCharge = this.rng() < 0.26 * config.battleIntensity;
        if (shouldCharge) {
          ant.state = 'charge';
          const enemyPt = this.pickTrenchPoint(enemyFaction, true);
          ant.targetX = enemyPt.x * 0.65 + (this.rng() - 0.5) * 8;
          ant.targetZ = enemyPt.z + (this.rng() - 0.5) * 6;
          ant.stateTimer = 7 + this.rng() * 6;
        } else {
          ant.state = 'patrol_trench';
          const pt = this.pickTrenchPoint(ant.faction, this.rng() < 0.8);
          ant.targetX = pt.x;
          ant.targetZ = pt.z;
          ant.stateTimer = 4 + this.rng() * 6;
        }
      }
    } else if (ant.role === 'engineer') {
      if (ant.state === 'build_fort') {
        const fort = this.fortifications.find((f) => f.id === ant.targetFortId);
        if (!fort) {
          ant.state = 'fetch_material';
          ant.targetX = mound.portalPos.x;
          ant.targetZ = mound.portalPos.z;
        } else if (distToTarget < 2.2) {
          // Actively build/repair fortification
          const deltaProg = 0.14 * config.buildSpeed * dt;
          fort.progress = Math.min(1, fort.progress + deltaProg);
          fort.hp = Math.min(fort.maxHp, fort.hp + fort.maxHp * deltaProg);
          ant.animPhase += dt * 11;

          if (this.rng() < dt * 1.4 && this.bursts.length < 48) {
            this.spawnBurst(fort.x, fort.y + 0.5, fort.z, 'build', 0.65);
          }

          if (fort.progress >= 0.99 || ant.stateTimer <= 0) {
            ant.cargo = 'none';
            ant.state = 'fetch_material';
            ant.targetX = mound.portalPos.x + (this.rng() - 0.5) * 3;
            ant.targetZ = mound.portalPos.z + (this.rng() - 0.5) * 3;
            ant.stateTimer = 8;
          }
          return;
        }
      } else {
        // fetch_material
        if (distToTarget < 2.6 || ant.stateTimer <= 0) {
          // Pick most damaged or incomplete own fortification
          const ownForts = this.fortifications.filter((f) => f.faction === ant.faction);
          ownForts.sort((a, b) => a.progress - b.progress);
          const pickIdx = Math.min(ownForts.length - 1, Math.floor(this.rng() * 5));
          const chosen = ownForts[pickIdx];
          if (chosen) {
            ant.targetFortId = chosen.id;
            ant.targetX = chosen.x + (this.rng() - 0.5) * 1.8;
            ant.targetZ = chosen.z + (this.rng() - 0.5) * 1.8;
            ant.cargo = chosen.type === 'barbed_thorns' || chosen.type === 'watchtower' ? 'twig' : 'pebble';
            ant.state = 'build_fort';
            ant.stateTimer = 8 + this.rng() * 6;
          }
        }
      }
    } else if (ant.role === 'forager') {
      if (ant.state === 'forage_out') {
        if (distToTarget < 2.2 || ant.stateTimer <= 0) {
          ant.cargo = 'seed';
          ant.state = 'forage_return';
          ant.targetX = mound.portalPos.x;
          ant.targetZ = mound.portalPos.z;
          ant.stateTimer = 18;
        }
      } else {
        if (distToTarget < 2.5 || ant.stateTimer <= 0) {
          ant.cargo = 'none';
          ant.state = 'forage_out';
          const food = this.world.foodSites[Math.floor(this.rng() * this.world.foodSites.length)];
          ant.targetFoodId = food.id;
          ant.targetX = food.x + (this.rng() - 0.5) * 3;
          ant.targetZ = food.z + (this.rng() - 0.5) * 3;
          ant.stateTimer = 18;
        }
      }
    } else {
      // scout
      if (distToTarget < 2.2 || ant.stateTimer <= 0) {
        ant.state = 'scout_roam';
        ant.targetX = (this.rng() - 0.5) * 58;
        ant.targetZ = (this.rng() - 0.5) * 60;
        ant.stateTimer = 5 + this.rng() * 6;
      }
    }

    // Move smoothly toward target with gentle organic wander
    const dx = ant.targetX - ant.x;
    const dz = ant.targetZ - ant.z;
    const len = Math.hypot(dx, dz) || 1;
    const wander = Math.sin(this.simTime * 2.1 + ant.id * 1.7) * 0.28;
    const desiredYaw = Math.atan2(dx / len, dz / len) + wander;

    // Shortest-angle turn interpolation
    let diff = desiredYaw - ant.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ant.yaw += diff * Math.min(1, dt * 6.5);

    const speedMult = ant.state === 'charge' ? 1.28 : ant.state === 'retreat' ? 1.2 : 1.0;
    const stepDist = ant.speed * speedMult * dt;
    const nx = ant.x + Math.sin(ant.yaw) * stepDist;
    const nz = ant.z + Math.cos(ant.yaw) * stepDist;

    // Keep inside playable valley
    const maxR = this.world.playableRadius - 3;
    const r = Math.hypot(nx, nz);
    if (r > maxR) {
      ant.x = (nx / r) * maxR;
      ant.z = (nz / r) * maxR;
    } else {
      ant.x = nx;
      ant.z = nz;
    }

    const prevY = ant.y;
    ant.y = this.world.heightAt(ant.x, ant.z);
    const dy = ant.y - prevY;
    ant.pitch = Math.max(-0.55, Math.min(0.55, Math.atan2(dy, Math.max(0.02, stepDist))));
    ant.animPhase += dt * ant.speed * speedMult * 4.8;
  }

  private updateArtillery(dt: number, config: SimulationConfig): void {
    const fireInterval = Math.max(1.8, 5.5 / Math.max(0.25, config.battleIntensity));
    for (let i = 0; i < this.fortifications.length; i++) {
      const fort = this.fortifications[i];
      if (fort.type !== 'mortar_nest' || fort.progress < 0.55) continue;
      if (this.simTime - fort.lastFireTime < fireInterval) continue;
      if (this.rng() > dt * 0.9) continue;
      if (this.projectiles.length >= 16) continue;

      fort.lastFireTime = this.simTime;
      const enemyFaction: FactionId = fort.faction === 'red' ? 'black' : 'red';
      const enemyForts = this.fortifications.filter((f) => f.faction === enemyFaction);
      let tx: number;
      let tz: number;
      if (enemyForts.length > 0 && this.rng() < 0.72) {
        const targetFort = enemyForts[Math.floor(this.rng() * enemyForts.length)];
        tx = targetFort.x + (this.rng() - 0.5) * 4.5;
        tz = targetFort.z + (this.rng() - 0.5) * 4.5;
      } else {
        tx = (this.rng() - 0.5) * 24;
        tz = (this.rng() - 0.5) * 44;
      }
      const ty = this.world.heightAt(tx, tz);
      const dist = Math.hypot(tx - fort.x, tz - fort.z);

      this.projectiles.push({
        id: this.nextProjId++,
        faction: fort.faction,
        startX: fort.x,
        startY: fort.y + 0.9,
        startZ: fort.z,
        targetX: tx,
        targetY: ty,
        targetZ: tz,
        x: fort.x,
        y: fort.y + 0.9,
        z: fort.z,
        progress: 0,
        duration: 1.5 + dist * 0.032,
        arcHeight: 6.5 + dist * 0.16,
      });

      this.spawnBurst(fort.x, fort.y + 0.8, fort.z, 'dust', 0.9);
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.progress += dt / p.duration;
      if (p.progress >= 1) {
        // Impact!
        this.spawnBurst(p.targetX, p.targetY + 0.25, p.targetZ, 'acid', 1.8);
        this.spawnBurst(p.targetX, p.targetY + 0.4, p.targetZ, 'dust', 2.2);

        // Damage nearby fortifications and ants so engineers always have real work
        for (let j = 0; j < this.fortifications.length; j++) {
          const f = this.fortifications[j];
          const d = Math.hypot(f.x - p.targetX, f.z - p.targetZ);
          if (d < 5.5) {
            const falloff = 1 - d / 5.5;
            f.hp = Math.max(f.maxHp * 0.18, f.hp - 36 * falloff);
            f.progress = Math.max(0.18, f.hp / f.maxHp);
          }
        }
        for (let j = 0; j < this.ants.length; j++) {
          const a = this.ants[j];
          if (a.underground || a.faction === p.faction) continue;
          const d = Math.hypot(a.x - p.targetX, a.z - p.targetZ);
          if (d < 4.2) {
            a.hp -= 28 * (1 - d / 4.2);
          }
        }
        this.projectiles.splice(i, 1);
      } else {
        const t = p.progress;
        p.x = p.startX + (p.targetX - p.startX) * t;
        p.z = p.startZ + (p.targetZ - p.startZ) * t;
        const linearY = p.startY + (p.targetY - p.startY) * t;
        p.y = linearY + 4 * p.arcHeight * t * (1 - t);
      }
    }
  }

  private spawnBurst(x: number, y: number, z: number, kind: BurstEffect['kind'], scale: number): void {
    if (this.bursts.length >= 60) {
      this.bursts.shift();
    }
    this.bursts.push({
      id: this.nextBurstId++,
      x,
      y,
      z,
      kind,
      age: 0,
      maxAge: kind === 'dust' ? 1.4 : kind === 'acid' ? 1.1 : 0.55,
      scale,
    });
  }

  private updateBursts(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      if (b.age >= b.maxAge) {
        this.bursts.splice(i, 1);
      }
    }
  }

  public getActionHotspot(): SimHotspot {
    // Prefer an active combat clash
    for (let i = 0; i < this.ants.length; i++) {
      const a = this.ants[i];
      if (!a.underground && a.state === 'fight') {
        return { x: a.x, y: a.y, z: a.z, kind: 'battle' };
      }
    }
    // Otherwise an engineer building a fortification
    for (let i = 0; i < this.ants.length; i++) {
      const a = this.ants[i];
      if (!a.underground && a.state === 'build_fort') {
        return { x: a.x, y: a.y, z: a.z, kind: 'build' };
      }
    }
    // Fallback to center No-Man's-Land
    return { x: 0, y: this.world.heightAt(0, 0), z: 0, kind: 'trench' };
  }

  public getStats(): {
    redAlive: number;
    blackAlive: number;
    redBuilt: number;
    blackBuilt: number;
    activeFights: number;
    undergroundAnts: number;
  } {
    let redAlive = 0;
    let blackAlive = 0;
    let activeFights = 0;
    let undergroundAnts = 0;

    for (let i = 0; i < this.ants.length; i++) {
      const a = this.ants[i];
      if (a.faction === 'red') redAlive++;
      else blackAlive++;
      if (a.state === 'fight') activeFights++;
      if (a.underground) undergroundAnts++;
    }

    let redBuilt = 0;
    let blackBuilt = 0;
    for (let i = 0; i < this.fortifications.length; i++) {
      const f = this.fortifications[i];
      if (f.progress >= 0.75) {
        if (f.faction === 'red') redBuilt++;
        else blackBuilt++;
      }
    }

    return {
      redAlive,
      blackAlive,
      redBuilt,
      blackBuilt,
      activeFights,
      undergroundAnts,
    };
  }
}
