import {
  BIOMES,
  generateProceduralArena,
  PROP_BLUEPRINTS,
  ProceduralArena,
} from './biomes';
import { SeededRandom } from './prng';
import {
  applyRagdollImpulse,
  createFighter,
  stepFighterRagdoll,
} from './ragdoll';
import { stuntSound } from './sound';
import {
  BiomeId,
  Fighter,
  FighterRole,
  InteractiveProp,
  PooledParticle,
  PropKind,
  SimulationMetrics,
  SimulationParams,
  StuntCallout,
  StuntFeedEvent,
} from './types';

const ACTION_LABELS_RU: Record<Fighter['action'], string> = {
  idle: 'Кунг-фу стойка',
  run: 'Сближение и манёвр',
  jump: 'Акробатический прыжок',
  wall_flip: 'Сальто от стены',
  table_vault: 'Кувырок через стол',
  ladder_spin: 'Мельница со стремянкой',
  punch_combo: 'Серия ударов Вин-Чун',
  flying_kick: 'Удар ногой в полёте',
  sweep_kick: 'Подсечка хвостом дракона',
  prop_swing: 'Удар подручным предметом',
  prop_throw: 'Прицельный бросок реквизита',
  duck_evade: 'Уход нырком («Пьяный мастер»)',
  drunken_sway: 'Уклонение «Пьяный кулак»',
  hand_shake_pain: 'Комедия: «Ай, больно руку!»',
  stagger: 'Потеря равновесия',
  ragdoll_fall: 'Полет рэгдолла',
  get_up: 'Подъём разгибом (Kip-Up)',
  ko: 'Нокаут',
};

export class StuntSimulationEngine {
  public rng: SeededRandom;
  public arena: ProceduralArena;
  public fighters: Fighter[] = [];
  public particles: PooledParticle[] = [];
  public callouts: StuntCallout[] = [];
  public recentEvents: StuntFeedEvent[] = [];
  public params: SimulationParams;

  public takeNumber = 1;
  public score = 0;
  public stuntsCount = 0;
  public propsSmashed = 0;
  public knockouts = 0;
  public totalSpawnedEnemies = 0;
  public maxWaveEnemies = 8;

  public time = 0;
  public hitstopTimer = 0;
  public slowMoTimer = 0;
  public cameraTrauma = 0;
  public camX = 640;
  public camY = 360;
  public camZoom = 1.0;
  public sceneClearTimer = 0;
  public clapperFlashTimer = 0;

  private particleCursor = 0;
  private eventCounter = 0;

  constructor(initialParams?: Partial<SimulationParams>, seed?: string) {
    this.params = {
      timeScale: 1.0,
      ragdollElasticity: 0.78,
      gravityScale: 1.0,
      propDensity: 1.15,
      enemyCount: 4,
      stuntFrequency: 1.25,
      cameraMode: 'cinematic',
      slowMoOnStunts: true,
      autoNextScene: true,
      soundEnabled: true,
      ...initialParams,
    };

    // Pre-allocate zero-GC pooled particle ring buffer
    for (let i = 0; i < 160; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 4,
        angle: 0,
        vAngle: 0,
        life: 0,
        maxLife: 0.5,
        color: '#f59e0b',
        shape: 'spark',
      });
    }

    this.rng = new SeededRandom(seed);
    this.arena = generateProceduralArena(this.rng, this.params.propDensity);
    this.setupCast();
  }

  public regenerateScene(customSeed?: string, forcedBiomeId?: BiomeId): void {
    this.rng = new SeededRandom(customSeed);
    this.takeNumber += 1;
    this.arena = generateProceduralArena(
      this.rng,
      this.params.propDensity,
      forcedBiomeId
    );
    this.callouts = [];
    this.sceneClearTimer = 0;
    this.clapperFlashTimer = 0.55;
    this.totalSpawnedEnemies = 0;
    this.maxWaveEnemies = Math.max(5, this.params.enemyCount * 2);
    for (const p of this.particles) {
      p.active = false;
    }
    this.setupCast();
    stuntSound.enabled = this.params.soundEnabled;
    stuntSound.playClapperboard();
    this.recordEvent(
      `Дубль #${this.takeNumber}: ${this.arena.biome.nameRu}`,
      `Сцена сгенерирована (Сид: ${this.rng.seedString})`,
      0,
      'stunt'
    );
  }

  private setupCast(): void {
    this.fighters = [];
    const hero = createFighter(
      'hero_chan',
      'hero',
      this.arena.worldWidth * 0.45,
      this.arena.floorY,
      1,
      this.rng
    );
    this.fighters.push(hero);

    const initialEnemies = Math.max(2, Math.min(6, this.params.enemyCount));
    const roles: Exclude<FighterRole, 'hero'>[] = [
      'brawler',
      'acrobat',
      'weapon_master',
      'bruiser',
    ];

    for (let i = 0; i < initialEnemies; i++) {
      const role = roles[i % roles.length];
      const side = i % 2 === 0 ? 1 : -1;
      const ex =
        side > 0
          ? this.rng.range(760, this.arena.worldWidth - 110)
          : this.rng.range(110, 480);
      this.spawnEnemy(role, ex, this.arena.floorY);
    }
  }

  public spawnEnemy(
    forcedRole?: Exclude<FighterRole, 'hero'>,
    customX?: number,
    customY?: number
  ): Fighter {
    const roles: Exclude<FighterRole, 'hero'>[] = [
      'brawler',
      'acrobat',
      'bruiser',
      'weapon_master',
    ];
    const role = forcedRole ?? this.rng.pick(roles);
    const side = this.rng.chance(0.5) ? 1 : -1;
    const x =
      customX ??
      (side > 0
        ? this.rng.range(860, this.arena.worldWidth - 90)
        : this.rng.range(90, 400));
    const y = customY ?? this.arena.floorY;
    const enemy = createFighter(
      `enemy_${this.totalSpawnedEnemies}_${Date.now().toString(36)}`,
      role,
      x,
      y,
      x > this.arena.worldWidth * 0.5 ? -1 : 1,
      this.rng
    );
    this.totalSpawnedEnemies += 1;
    this.fighters.push(enemy);
    return enemy;
  }

  public spawnBonusProp(kind?: PropKind): InteractiveProp {
    const hero = this.getHero();
    const chosenKind =
      kind ??
      this.rng.pick([
        'ladder',
        'vase',
        'chair',
        'table',
        'bamboo_pole',
        'barrel',
        'wok',
      ] as PropKind[]);
    const bp = PROP_BLUEPRINTS[chosenKind];
    const dropX = hero
      ? Math.max(120, Math.min(this.arena.worldWidth - 120, hero.x + hero.facing * 95))
      : this.arena.worldWidth * 0.5;
    const prop: InteractiveProp = {
      id: `prop_bonus_${Date.now()}_${this.rng.int(10, 99)}`,
      kind: chosenKind,
      nameRu: bp.nameRu,
      x: dropX,
      y: 120,
      vx: this.rng.range(-40, 40),
      vy: 140,
      angle: this.rng.range(-0.2, 0.2),
      vAngle: this.rng.range(-2, 2),
      width: bp.width,
      height: bp.height,
      hp: bp.hp,
      maxHp: bp.hp,
      mass: bp.mass,
      bounciness: bp.bounciness,
      isHeldBy: null,
      isThrownBy: null,
      broken: false,
      hitFlash: 0.25,
      colorPrimary: bp.colorPrimary,
      colorSecondary: bp.colorSecondary,
    };
    this.arena.props.push(prop);
    this.addCallout(dropX, 160, `Реквизит: ${bp.nameRu}!`, '#38bdf8', 1.0);
    return prop;
  }

  public triggerHeroSignatureStunt(): void {
    const hero = this.getHero();
    if (!hero) return;

    // Wake hero up if staggered/falling
    hero.ragdollBlend = 0;
    hero.composure = 100;

    // Try to grab nearby intact prop first
    const nearbyProp = this.findNearestAvailableProp(hero.x, hero.y, 260);
    if (nearbyProp && !hero.heldPropId) {
      hero.heldPropId = nearbyProp.id;
      nearbyProp.isHeldBy = hero.id;
    }

    if (hero.heldPropId) {
      const held = this.arena.props.find((p) => p.id === hero.heldPropId);
      if (held && held.kind === 'ladder') {
        this.startAction(hero, 'ladder_spin', 0.65);
        hero.vx = hero.facing * 260;
        this.addCallout(hero.x, hero.y - 110, 'МЕЛЬНИЦА СО СТРЕМЯНКОЙ!', '#f59e0b', 1.25);
        this.recordEvent(
          'Мельница со стремянкой!',
          'Мастер Чан раскрутил лестницу против толпы',
          250,
          'stunt'
        );
        if (this.params.slowMoOnStunts) this.slowMoTimer = 0.45;
        return;
      }
    }

    // Otherwise execute high-flying acrobatic somersault kick!
    this.startAction(hero, 'wall_flip', 0.62);
    hero.vy = -520;
    hero.vx = hero.facing * 310;
    hero.grounded = false;
    hero.scaleX = 0.84;
    hero.scaleY = 1.2;
    if (this.params.slowMoOnStunts) this.slowMoTimer = 0.45;
    stuntSound.playWhoosh(1.25);
    this.addCallout(hero.x, hero.y - 115, 'КОРОННОЕ САЛЬТО ДРАКОНА!', '#f59e0b', 1.28);
    this.recordEvent(
      'Коронное сальто Дракона!',
      'Экстремальный акробатический удар в прыжке',
      220,
      'stunt'
    );
  }

  public getHero(): Fighter | undefined {
    return this.fighters.find((f) => f.isHero);
  }

  public step(rawDt: number): void {
    const clampedDt = Math.min(Math.max(rawDt, 0.001), 0.05);
    stuntSound.enabled = this.params.soundEnabled;

    if (this.clapperFlashTimer > 0) {
      this.clapperFlashTimer = Math.max(0, this.clapperFlashTimer - clampedDt);
    }

    // Decay camera trauma and hitstop in real-time
    this.cameraTrauma = Math.max(0, this.cameraTrauma - clampedDt * 1.9);
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - clampedDt);
      this.updateCamera(clampedDt);
      return;
    }

    let timeMultiplier = this.params.timeScale;
    if (this.slowMoTimer > 0) {
      this.slowMoTimer = Math.max(0, this.slowMoTimer - clampedDt);
      timeMultiplier *= 0.35;
    }

    const dt = clampedDt * timeMultiplier;
    this.time += dt;
    const gravity = 980 * this.params.gravityScale;

    // 1. Update platforms spring physics (awnings, bamboo boards)
    for (const plat of this.arena.platforms) {
      if (Math.abs(plat.flexOffset) > 0.01 || Math.abs(plat.flexVelocity) > 0.01) {
        const springK = 180;
        const damp = 11;
        const accel = -springK * plat.flexOffset - damp * plat.flexVelocity;
        plat.flexVelocity += accel * dt;
        plat.flexOffset += plat.flexVelocity * dt;
      }
    }

    // 2. Update autonomous AI & fighter physics
    let activeAttackers = 0;
    for (const f of this.fighters) {
      if (!f.isHero && f.action !== 'ko' && f.action !== 'ragdoll_fall') {
        if (
          f.action === 'punch_combo' ||
          f.action === 'flying_kick' ||
          f.action === 'prop_swing'
        ) {
          activeAttackers += 1;
        }
      }
    }

    for (const f of this.fighters) {
      this.stepFighterLogic(f, dt, gravity, activeAttackers);
      stepFighterRagdoll(
        f,
        dt,
        this.time,
        gravity,
        this.params.ragdollElasticity,
        this.arena.platforms,
        this.arena.worldWidth,
        this.arena.floorY
      );
    }

    // 3. Step interactive props (tables, ladders, thrown bottles, hanging lanterns)
    this.stepProps(dt, gravity);

    // 4. Resolve combat hits & stunt interactions
    this.resolveCombatAndStunts();

    // 5. Step pooled particles & floating stunt callouts
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.shape !== 'ring') {
        p.vy += gravity * 0.55 * dt;
      }
      p.angle += p.vAngle * dt;
    }

    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      c.life += dt;
      c.y += c.vy * dt;
      if (c.life >= c.maxLife) {
        this.callouts.splice(i, 1);
      }
    }

    // 6. Manage enemy wave reinforcements & auto-scene transition
    this.manageWavesAndScenes(dt);

    // 7. Update smart stunt director camera
    this.updateCamera(clampedDt);
  }

  private stepFighterLogic(
    f: Fighter,
    dt: number,
    gravity: number,
    activeAttackers: number
  ): void {
    f.actionTimer += dt;
    f.attackCooldown = Math.max(0, f.attackCooldown - dt);
    f.stuntCooldown = Math.max(0, f.stuntCooldown - dt);
    f.hitFlashTimer = Math.max(0, f.hitFlashTimer - dt);
    f.invulnTimer = Math.max(0, f.invulnTimer - dt);

    if (f.expressionTimer > 0) {
      f.expressionTimer -= dt;
      if (f.expressionTimer <= 0) {
        f.expression = f.action === 'ko' ? 'ko_dizzy' : 'focused';
      }
    }

    if (f.quipTimer > 0) {
      f.quipTimer = Math.max(0, f.quipTimer - dt);
      if (f.quipTimer <= 0) f.quips = null;
    }

    // Hero slowly regenerates stamina and composure; never stays permanently dead in autonomous simulation
    if (f.isHero && f.hp < f.maxHp * 0.35) {
      // Second wind ("Второе дыхание Джеки!")
      f.hp = Math.min(f.maxHp, f.hp + dt * 28);
    }

    if (f.action === 'ko') {
      f.ragdollBlend = 1.0;
      f.vx *= Math.pow(0.15, dt);
      // After 4.5s in KO, enemy either gets replaced or kip-ups if wave still active
      return;
    }

    // Recover from ragdoll fall into Kip-Up!
    if (f.action === 'ragdoll_fall') {
      f.vx *= Math.pow(0.25, dt);
      if (f.actionTimer >= f.actionDuration && f.grounded) {
        if (f.hp <= 0 && !f.isHero) {
          f.action = 'ko';
          f.expression = 'ko_dizzy';
          this.knockouts += 1;
          this.score += 150;
          this.addCallout(f.x, f.y - 75, 'НОКАУТ!', '#ef4444', 1.15);
          this.recordEvent('Нокаут каскадёра!', `${f.name} выбит из боя`, 150, 'ko');
          return;
        }
        this.startAction(f, 'get_up', 0.36);
        f.ragdollBlend = 0.25;
        f.vy = -210; // Kip-up hop!
        if (f.isHero) {
          this.setQuip(f, 'Фух, цел!', 1.1);
        }
      }
    } else {
      f.ragdollBlend = Math.max(0, f.ragdollBlend - dt * 2.8);
      f.composure = Math.min(100, f.composure + dt * 22);
    }

    // Horizontal & vertical root motion
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.gaitPhase += Math.abs(f.vx) * dt * 0.065;

    if (!f.grounded) {
      f.vy += gravity * dt;
    }

    // Arena walls + Hero Wall-Run Backflip trigger!
    const wallMargin = 54;
    if (f.x < wallMargin) {
      f.x = wallMargin;
      if (f.isHero && f.stuntCooldown <= 0 && Math.abs(f.vx) > 90) {
        this.executeWallFlip(f, 1);
      } else {
        f.vx = Math.abs(f.vx) * 0.4;
      }
    } else if (f.x > this.arena.worldWidth - wallMargin) {
      f.x = this.arena.worldWidth - wallMargin;
      if (f.isHero && f.stuntCooldown <= 0 && Math.abs(f.vx) > 90) {
        this.executeWallFlip(f, -1);
      } else {
        f.vx = -Math.abs(f.vx) * 0.4;
      }
    }

    // Platform & floor landing detection
    let landedPlat = this.arena.platforms[0];
    let groundedNow = false;

    if (f.vy >= 0) {
      for (const plat of this.arena.platforms) {
        if (plat.kind === 'floor') continue;
        const prevY = f.y - f.vy * dt;
        if (
          f.x >= plat.x + 12 &&
          f.x <= plat.x + plat.width - 12 &&
          prevY <= plat.y + 14 &&
          f.y >= plat.y
        ) {
          landedPlat = plat;
          groundedNow = true;
          break;
        }
      }
    }

    if (!groundedNow && f.y >= this.arena.floorY) {
      landedPlat = this.arena.platforms[0];
      groundedNow = true;
    }

    if (groundedNow) {
      const wasAirborne = !f.grounded && f.vy > 220;
      f.y = landedPlat.y + landedPlat.flexOffset;
      f.grounded = true;
      f.onPlatformId = landedPlat.id;

      if (wasAirborne) {
        f.scaleX = 1.18;
        f.scaleY = 0.82;
        if (landedPlat.bounciness > 0.6) {
          // Springboard awning / bamboo bounce!
          landedPlat.flexVelocity = 190;
          if (f.isHero && this.rng.chance(0.55 * this.params.stuntFrequency)) {
            f.vy = -510;
            f.grounded = false;
            this.startAction(f, 'flying_kick', 0.55);
            stuntSound.playPropBreak('bounce');
            this.addCallout(f.x, f.y - 90, 'ПРУЖИННЫЙ ТРАМПЛИН!', '#22d3ee', 1.1);
            this.stuntsCount += 1;
            this.score += 140;
          } else {
            f.vy = -160;
          }
        } else {
          f.vy = 0;
        }
      } else {
        f.vy = 0;
      }
    } else {
      f.grounded = false;
    }

    // Wait for current committed action to finish before choosing next AI decision
    if (
      f.action !== 'idle' &&
      f.action !== 'run' &&
      f.actionTimer < f.actionDuration
    ) {
      return;
    }

    if (f.action !== 'idle' && f.action !== 'run') {
      f.action = 'idle';
      f.actionTimer = 0;
      f.actionDuration = 0.25;
    }

    // Autonomous AI Choreography
    if (f.isHero) {
      this.decideHeroChoreography(f);
    } else {
      this.decideEnemyChoreography(f, activeAttackers);
    }
  }

  private decideHeroChoreography(hero: Fighter): void {
    const aliveEnemies = this.fighters.filter(
      (e) => !e.isHero && e.action !== 'ko'
    );
    if (aliveEnemies.length === 0) {
      hero.vx *= 0.8;
      hero.action = 'idle';
      return;
    }

    // Sort enemies by distance
    aliveEnemies.sort(
      (a, b) =>
        Math.hypot(a.x - hero.x, a.y - hero.y) -
        Math.hypot(b.x - hero.x, b.y - hero.y)
    );
    const nearest = aliveEnemies[0];
    const dx = nearest.x - hero.x;
    const dist = Math.abs(dx);
    hero.facing = dx >= 0 ? 1 : -1;

    // 1. Check if two enemies are sandwiching Jackie -> Duck Evade for Friendly Fire!
    if (aliveEnemies.length >= 2 && hero.stuntCooldown <= 0) {
      const second = aliveEnemies[1];
      const d1 = nearest.x - hero.x;
      const d2 = second.x - hero.x;
      if (
        d1 * d2 < 0 &&
        Math.abs(d1) < 130 &&
        Math.abs(d2) < 130 &&
        this.rng.chance(0.45 * this.params.stuntFrequency)
      ) {
        this.startAction(hero, 'duck_evade', 0.48);
        hero.stuntCooldown = 1.6;
        hero.invulnTimer = 0.5;
        hero.vx = 0;
        this.setQuip(hero, 'Оп! Мимо!', 1.2);
        this.addCallout(hero.x, hero.y - 95, 'НЫРОК: СВОЙ БЬЁТ СВОЕГО!', '#10b981', 1.15);
        this.recordEvent(
          'Трюк: Свой бьёт своего!',
          'Мастер Чан нырнул, столкнув двух врагов лбами',
          180,
          'comedy'
        );
        // Knock the two enemies into each other!
        applyRagdollImpulse(nearest, 'head', -Math.sign(d1) * 260, -180, 0.55);
        applyRagdollImpulse(second, 'head', -Math.sign(d2) * 260, -180, 0.55);
        nearest.hp -= 24;
        second.hp -= 24;
        stuntSound.playKungFuHit(true);
        this.stuntsCount += 1;
        this.score += 180;
        return;
      }
    }

    // 2. Check for nearby interactive environment stunt (Table Vault / Prop Grab / Pillar Kick)
    if (!hero.heldPropId && hero.stuntCooldown <= 0) {
      const prop = this.findNearestAvailableProp(hero.x, hero.y, 115);
      if (prop) {
        if (prop.kind === 'table' && dist < 240) {
          if (this.rng.chance(0.55)) {
            // Acrobatic Vault over the table into flying kick!
            this.startAction(hero, 'table_vault', 0.54);
            hero.vx = hero.facing * 320;
            hero.vy = -380;
            hero.grounded = false;
            hero.stuntCooldown = 1.4;
            this.stuntsCount += 1;
            this.score += 160;
            stuntSound.playWhoosh(1.15);
            this.addCallout(prop.x, prop.y - 70, 'КУВЫРОК ЧЕРЕЗ СТОЛ!', '#f59e0b', 1.15);
            this.recordEvent(
              'Кувырок через стол',
              'Акробатический перекат через банкетный стол',
              160,
              'stunt'
            );
            return;
          } else {
            // Flip the table upright as a shield & slam nearest enemy!
            prop.flipped = !prop.flipped;
            prop.vx = hero.facing * 340;
            prop.vy = -170;
            prop.vAngle = hero.facing * 6;
            prop.isThrownBy = hero.id;
            this.startAction(hero, 'punch_combo', 0.38);
            hero.stuntCooldown = 1.3;
            this.stuntsCount += 1;
            this.score += 150;
            stuntSound.playPropBreak('wood');
            this.addCallout(prop.x, prop.y - 75, 'ЩИТ ИЗ СТОЛА!', '#f59e0b', 1.15);
            this.recordEvent(
              'Опрокидывание стола!',
              'Стол использован как живой таран',
              150,
              'prop'
            );
            return;
          }
        }

        // Pick up portable prop (ladder, chair, vase, bamboo pole, bottle, wok, steamer)
        if (
          prop.kind !== 'table' &&
          prop.kind !== 'lantern' &&
          this.rng.chance(0.68 * this.params.stuntFrequency)
        ) {
          hero.heldPropId = prop.id;
          prop.isHeldBy = hero.id;
          this.setQuip(
            hero,
            prop.kind === 'vase'
              ? 'Осторожно, династия Мин!'
              : prop.kind === 'ladder'
              ? 'О, стремянка!'
              : `Взял: ${prop.nameRu}!`,
            1.3
          );
        }
      }
    }

    // 3. If holding a prop, use it in Jackie Chan fashion!
    if (hero.heldPropId) {
      const held = this.arena.props.find((p) => p.id === hero.heldPropId);
      if (!held || held.broken) {
        hero.heldPropId = null;
      } else if (dist < 135) {
        if (held.kind === 'ladder') {
          this.startAction(hero, 'ladder_spin', 0.62);
          hero.vx = hero.facing * 240;
          this.stuntsCount += 1;
          this.score += 210;
          stuntSound.playWhoosh(0.85);
          this.addCallout(hero.x, hero.y - 105, 'МЕЛЬНИЦА СО СТРЕМЯНКОЙ!', '#eab308', 1.2);
          this.recordEvent(
            'Трюк со стремянкой',
            'Круговая оборона складной лестницей',
            210,
            'stunt'
          );
          if (this.params.slowMoOnStunts) this.slowMoTimer = 0.35;
          return;
        }
        this.startAction(hero, 'prop_swing', 0.42);
        hero.vx = hero.facing * 170;
        stuntSound.playWhoosh(1.0);
        return;
      } else if (dist > 190 && this.rng.chance(0.45)) {
        // Throw the prop at a distant enemy!
        this.throwHeldProp(hero, nearest);
        return;
      }
    }

    // 4. Pillar Wall-Flip if near a pillar and enemy is close
    if (hero.stuntCooldown <= 0 && dist < 165) {
      for (const pillar of this.arena.pillars) {
        if (Math.abs(hero.x - pillar.x) < 55 && this.rng.chance(0.5 * this.params.stuntFrequency)) {
          this.executeWallFlip(hero, hero.facing);
          return;
        }
      }
    }

    // 5. Close-range Martial Arts Combos vs Approach
    if (dist < 92 && Math.abs(nearest.y - hero.y) < 75) {
      const roll = this.rng.next();
      if (roll < 0.42) {
        this.startAction(hero, 'punch_combo', 0.38);
        hero.vx = hero.facing * 120;
        stuntSound.playWhoosh(1.1);
      } else if (roll < 0.68) {
        this.startAction(hero, 'sweep_kick', 0.44);
        hero.vx = hero.facing * 150;
        stuntSound.playWhoosh(0.95);
      } else if (roll < 0.86) {
        this.startAction(hero, 'flying_kick', 0.48);
        hero.vx = hero.facing * 260;
        hero.vy = -290;
        hero.grounded = false;
        stuntSound.playWhoosh(1.2);
      } else {
        this.startAction(hero, 'drunken_sway', 0.52);
        hero.vx = -hero.facing * 90;
        hero.invulnTimer = 0.45;
        this.setQuip(hero, 'Стиль Пьяного Мастера!', 1.2);
      }
      return;
    }

    // 6. Jump onto elevated platform if target enemy is up high
    if (nearest.y < hero.y - 90 && hero.grounded && this.rng.chance(0.45)) {
      hero.vy = -520;
      hero.vx = hero.facing * 250;
      hero.grounded = false;
      hero.scaleX = 0.85;
      hero.scaleY = 1.18;
      this.startAction(hero, 'jump', 0.45);
      stuntSound.playWhoosh(1.1);
      return;
    }

    // 7. Run toward nearest enemy or prop
    hero.action = 'run';
    hero.vx = hero.facing * 255;
  }

  private decideEnemyChoreography(enemy: Fighter, activeAttackers: number): void {
    const hero = this.getHero();
    if (!hero) return;

    const dx = hero.x - enemy.x;
    const dist = Math.abs(dx);
    enemy.facing = dx >= 0 ? 1 : -1;

    // Distinct policies per enemy archetype (>= 4 policies)
    switch (enemy.role) {
      case 'weapon_master': {
        // Policy 1: Seeks out bamboo poles/chairs/bottles first, keeps mid-range
        if (!enemy.heldPropId) {
          const prop = this.findNearestAvailableProp(enemy.x, enemy.y, 170);
          if (prop && prop.kind !== 'table' && prop.kind !== 'lantern') {
            if (Math.abs(prop.x - enemy.x) < 55) {
              enemy.heldPropId = prop.id;
              prop.isHeldBy = enemy.id;
              return;
            }
            enemy.facing = prop.x >= enemy.x ? 1 : -1;
            enemy.action = 'run';
            enemy.vx = enemy.facing * 210;
            return;
          }
        } else if (dist > 220 && this.rng.chance(0.25)) {
          this.throwHeldProp(enemy, hero);
          return;
        }
        break;
      }

      case 'acrobat': {
        // Policy 2: Flanker & high-jumper — vaults onto platforms and performs flying kicks
        if (dist > 130 && dist < 270 && enemy.grounded && this.rng.chance(0.32)) {
          this.startAction(enemy, 'flying_kick', 0.52);
          enemy.vx = enemy.facing * 290;
          enemy.vy = -340;
          enemy.grounded = false;
          return;
        }
        break;
      }

      case 'bruiser': {
        // Policy 3: Heavy charger — slower movement, throws heavy crates/barrels
        if (!enemy.heldPropId && this.rng.chance(0.25)) {
          const heavy = this.findNearestAvailableProp(enemy.x, enemy.y, 90);
          if (heavy && (heavy.kind === 'crate' || heavy.kind === 'barrel')) {
            enemy.heldPropId = heavy.id;
            heavy.isHeldBy = enemy.id;
            return;
          }
        }
        if (enemy.heldPropId && dist < 280) {
          this.throwHeldProp(enemy, hero);
          return;
        }
        break;
      }

      case 'brawler':
      default:
        // Policy 4: Direct close-quarters pressure
        break;
    }

    // Crowd Attack Token Pool: Max 2 simultaneous enemy attackers so fights look like authentic HK choreography!
    const canAttack = activeAttackers < 2 && enemy.attackCooldown <= 0;

    if (dist < 88 && Math.abs(hero.y - enemy.y) < 70) {
      if (canAttack) {
        this.startAction(
          enemy,
          enemy.heldPropId ? 'prop_swing' : 'punch_combo',
          0.45
        );
        enemy.vx = enemy.facing * 95;
        enemy.attackCooldown = this.rng.range(0.55, 1.15);
      } else {
        // Circle/feint at martial-arts distance waiting for turn!
        enemy.action = 'idle';
        enemy.vx = -enemy.facing * 45;
      }
      return;
    }

    if (dist > 95) {
      enemy.action = 'run';
      const speed =
        enemy.role === 'bruiser' ? 155 : enemy.role === 'acrobat' ? 235 : 195;
      enemy.vx = enemy.facing * speed;
    } else {
      enemy.action = 'idle';
      enemy.vx *= 0.6;
    }
  }

  private executeWallFlip(f: Fighter, pushDir: 1 | -1): void {
    f.facing = pushDir;
    this.startAction(f, 'wall_flip', 0.56);
    f.vx = pushDir * 295;
    f.vy = -440;
    f.grounded = false;
    f.stuntCooldown = 1.5;
    f.scaleX = 0.85;
    f.scaleY = 1.18;
    this.stuntsCount += 1;
    this.score += 175;
    if (this.params.slowMoOnStunts) this.slowMoTimer = 0.38;
    stuntSound.playWhoosh(1.3);
    this.addCallout(f.x, f.y - 90, 'САЛЬТО ОТ СТЕНЫ!', '#f59e0b', 1.2);
    this.recordEvent(
      'Сальто от стены!',
      'Прыжок с отталкиванием от колонны в стиле Джеки',
      175,
      'stunt'
    );
  }

  private throwHeldProp(thrower: Fighter, target: Fighter): void {
    const prop = this.arena.props.find((p) => p.id === thrower.heldPropId);
    thrower.heldPropId = null;
    if (!prop) return;

    prop.isHeldBy = null;
    prop.isThrownBy = thrower.id;
    const dx = target.x - thrower.x;
    const dir = dx >= 0 ? 1 : -1;
    prop.vx = dir * 470;
    prop.vy = -165;
    prop.vAngle = dir * 9.5;
    this.startAction(thrower, 'prop_throw', 0.32);
    stuntSound.playWhoosh(1.15);
  }

  private stepProps(dt: number, gravity: number): void {
    for (const p of this.arena.props) {
      if (p.broken) continue;
      if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);

      if (p.isHeldBy) {
        const holder = this.fighters.find((f) => f.id === p.isHeldBy);
        if (!holder || holder.action === 'ko' || holder.action === 'ragdoll_fall') {
          p.isHeldBy = null;
        } else {
          const hand = holder.nodes.rHand;
          p.x = hand.x + holder.facing * 14;
          p.y = hand.y - 6;
          p.vx = holder.vx;
          p.vy = holder.vy;
          p.angle =
            holder.action === 'ladder_spin'
              ? this.time * 14 * holder.facing
              : holder.facing * 0.35;
          continue;
        }
      }

      // Tethered pendulum props (Hanging red lanterns)
      if (
        p.tetherX !== undefined &&
        p.tetherY !== undefined &&
        p.tetherLength !== undefined
      ) {
        p.vy += gravity * 0.6 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const dx = p.x - p.tetherX;
        const dy = p.y - p.tetherY;
        const dist = Math.hypot(dx, dy) || 0.001;
        if (dist > p.tetherLength) {
          p.x = p.tetherX + (dx / dist) * p.tetherLength;
          p.y = p.tetherY + (dy / dist) * p.tetherLength;
          const nx = dx / dist;
          const ny = dy / dist;
          const dot = p.vx * nx + p.vy * ny;
          if (dot > 0) {
            p.vx = (p.vx - nx * dot) * 0.98;
            p.vy = (p.vy - ny * dot) * 0.98;
          }
        }
        p.angle = Math.atan2(p.x - p.tetherX, p.y - p.tetherY) * 0.6;
        continue;
      }

      // Free rigid-body prop motion
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += gravity * 0.85 * dt;
      p.angle += p.vAngle * dt;

      // Wall bounce
      const margin = 42;
      if (p.x < margin) {
        p.x = margin;
        p.vx = Math.abs(p.vx) * 0.55;
      } else if (p.x > this.arena.worldWidth - margin) {
        p.x = this.arena.worldWidth - margin;
        p.vx = -Math.abs(p.vx) * 0.55;
      }

      // Platform & floor rest
      const halfH = p.height * 0.5;
      let restingY = this.arena.floorY;
      for (const plat of this.arena.platforms) {
        if (plat.kind === 'floor') continue;
        if (
          p.x >= plat.x &&
          p.x <= plat.x + plat.width &&
          p.y - p.vy * dt <= plat.y &&
          p.y + halfH >= plat.y
        ) {
          restingY = plat.y + plat.flexOffset;
          break;
        }
      }

      if (p.y + halfH >= restingY) {
        p.y = restingY - halfH;
        if (Math.abs(p.vy) > 95) {
          p.vy = -p.vy * p.bounciness;
          p.vx *= 0.72;
          p.vAngle *= 0.65;
        } else {
          p.vy = 0;
          p.vx *= Math.pow(0.08, dt);
          p.vAngle *= Math.pow(0.05, dt);
          p.angle *= Math.pow(0.2, dt);
          if (Math.hypot(p.vx, p.vy) < 45) {
            p.isThrownBy = null;
          }
        }
      }
    }
  }

  private resolveCombatAndStunts(): void {
    // 1. Thrown / Spinning props hitting fighters
    for (const p of this.arena.props) {
      if (p.broken) continue;
      const speed = Math.hypot(p.vx, p.vy);
      if (!p.isThrownBy && speed < 170) continue;

      for (const f of this.fighters) {
        if (f.id === p.isThrownBy || f.action === 'ko' || f.invulnTimer > 0) {
          continue;
        }
        if (
          Math.abs(p.x - f.x) < p.width * 0.55 + 24 &&
          Math.abs(p.y - (f.y - 42)) < p.height * 0.55 + 38
        ) {
          // If Hero is approached by a thrown bottle/vase, 55% chance he catches it mid-air!
          if (
            f.isHero &&
            !f.heldPropId &&
            (p.kind === 'vase' || p.kind === 'bottle' || p.kind === 'chair') &&
            this.rng.chance(0.55)
          ) {
            f.heldPropId = p.id;
            p.isHeldBy = f.id;
            p.isThrownBy = null;
            this.stuntsCount += 1;
            this.score += 170;
            this.setQuip(f, 'Поймал на лету!', 1.2);
            this.addCallout(f.x, f.y - 95, 'ПЕРЕХВАТ НА ЛЕТУ!', '#10b981', 1.15);
            this.recordEvent(
              'Перехват предмета на лету!',
              `Мастер Чан поймал летящий предмет (${p.nameRu})`,
              170,
              'stunt'
            );
            continue;
          }

          // Impact!
          const dir = p.vx >= 0 ? 1 : -1;
          const dmg = f.isHero ? 12 : 38;
          f.hp -= dmg;
          f.invulnTimer = 0.35;
          f.hitFlashTimer = 0.12;
          f.expression = 'shocked';
          f.expressionTimer = 0.6;
          applyRagdollImpulse(f, 'head', dir * 320, -230, 0.58);
          this.damageProp(p, 35, p.x, p.y);
          this.hitstopTimer = 0.045;
          this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.42);
          p.vx = -p.vx * 0.4;
          p.vy = -140;
          p.isThrownBy = null;
          break;
        }
      }
    }

    // 2. Active melee & weapon attacks between fighters
    for (const attacker of this.fighters) {
      if (attacker.action === 'ko' || attacker.action === 'ragdoll_fall') continue;
      const isAttacking =
        attacker.action === 'punch_combo' ||
        attacker.action === 'flying_kick' ||
        attacker.action === 'sweep_kick' ||
        attacker.action === 'wall_flip' ||
        attacker.action === 'table_vault' ||
        attacker.action === 'ladder_spin' ||
        attacker.action === 'prop_swing';

      if (!isAttacking) continue;

      const t =
        attacker.actionDuration > 0
          ? attacker.actionTimer / attacker.actionDuration
          : 0;
      if (t < 0.2 || t > 0.85) continue;

      const reach =
        attacker.action === 'ladder_spin'
          ? 125
          : attacker.heldPropId
          ? 105
          : attacker.action === 'flying_kick' || attacker.action === 'wall_flip'
          ? 92
          : 76;

      for (const target of this.fighters) {
        if (
          target.id === attacker.id ||
          target.isHero === attacker.isHero ||
          target.action === 'ko' ||
          target.invulnTimer > 0
        ) {
          continue;
        }

        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        const inFront =
          attacker.action === 'ladder_spin' || dx * attacker.facing >= -18;

        if (inFront && Math.abs(dx) <= reach && Math.abs(dy) <= 72) {
          this.applyCombatStrike(attacker, target);
        }
      }
    }
  }

  private applyCombatStrike(attacker: Fighter, target: Fighter): void {
    const dir = target.x >= attacker.x ? 1 : -1;
    const isHeavy =
      attacker.action === 'flying_kick' ||
      attacker.action === 'wall_flip' ||
      attacker.action === 'ladder_spin' ||
      attacker.action === 'prop_swing';

    const dmg = attacker.isHero ? (isHeavy ? 36 : 22) : 10;
    target.hp -= dmg;
    target.invulnTimer = isHeavy ? 0.36 : 0.24;
    target.hitFlashTimer = 0.1;
    target.expression = isHeavy ? 'shocked' : 'pain_grimace';
    target.expressionTimer = 0.55;

    if (attacker.isHero) {
      attacker.comboCount += 1;
      this.score += isHeavy ? 85 : 40;
    } else {
      target.comboCount = 0;
    }

    const hitX = (attacker.x + target.x) * 0.5;
    const hitY = target.y - 52;
    this.emitImpactParticles(hitX, hitY, isHeavy ? 18 : 9, '#fbbf24', 'spark');

    // Damage held prop on swing and trigger ceramic/wood/metal FX!
    if (attacker.heldPropId) {
      const prop = this.arena.props.find((p) => p.id === attacker.heldPropId);
      if (prop) {
        this.damageProp(prop, 26, hitX, hitY);
        if (prop.broken) {
          attacker.heldPropId = null;
        }
      }
    } else {
      stuntSound.playKungFuHit(isHeavy);
    }

    // Ragdoll knockback vs stagger
    if (isHeavy || target.hp <= 0 || !target.isHero) {
      const targetJoint =
        attacker.action === 'sweep_kick'
          ? 'lKnee'
          : attacker.action === 'flying_kick'
          ? 'head'
          : 'neck';
      const impulseX = dir * (isHeavy ? 340 : 210);
      const impulseY = attacker.action === 'sweep_kick' ? -290 : isHeavy ? -250 : -140;
      applyRagdollImpulse(
        target,
        targetJoint,
        impulseX,
        impulseY,
        isHeavy ? 0.65 : 0.42
      );
      this.hitstopTimer = isHeavy ? 0.055 : 0.03;
      this.cameraTrauma = Math.min(1, this.cameraTrauma + (isHeavy ? 0.45 : 0.2));

      // Also check if knocked enemy smashes into any nearby background prop!
      for (const prop of this.arena.props) {
        if (
          !prop.broken &&
          !prop.isHeldBy &&
          Math.abs(prop.x - target.x) < 75 &&
          Math.abs(prop.y - (target.y - 35)) < 65
        ) {
          prop.vx = dir * 260;
          prop.vy = -150;
          this.damageProp(prop, 45, prop.x, prop.y);
        }
      }
    } else {
      this.startAction(target, 'stagger', 0.26);
      target.vx = dir * 130;
    }

    // Signature Jackie Chan Comedy: Hand-shake pain after punching a heavy Bruiser with bare hands!
    if (
      attacker.isHero &&
      !attacker.heldPropId &&
      target.role === 'bruiser' &&
      attacker.action === 'punch_combo' &&
      this.rng.chance(0.35)
    ) {
      this.startAction(attacker, 'hand_shake_pain', 0.58);
      attacker.expression = 'pain_grimace';
      attacker.expressionTimer = 0.65;
      this.setQuip(attacker, 'Ай-яй-яй! Каменный лоб!', 1.4);
      this.addCallout(attacker.x, attacker.y - 95, 'АЙ, БОЛЬНО РУКУ!', '#fbbf24', 1.1);
      this.recordEvent(
        'Комедийный момент!',
        'Мастер Чан отбил кулак о железного громилу и трясёт рукой',
        110,
        'comedy'
      );
    }
  }

  private damageProp(
    prop: InteractiveProp,
    amount: number,
    hitX: number,
    hitY: number
  ): void {
    prop.hp -= amount;
    prop.hitFlash = 0.15;

    const isCeramic = prop.kind === 'vase' || prop.kind === 'bottle';
    const isMetal = prop.kind === 'wok' || prop.kind === 'ladder';
    stuntSound.playPropBreak(isCeramic ? 'ceramic' : isMetal ? 'metal' : 'wood');

    if (prop.hp <= 0 && !prop.broken) {
      prop.broken = true;
      prop.isHeldBy = null;
      this.propsSmashed += 1;
      this.score += 120;
      this.emitImpactParticles(
        hitX,
        hitY,
        24,
        prop.colorPrimary,
        isCeramic ? 'shard' : 'splinter'
      );
      this.addCallout(
        prop.x,
        prop.y - 45,
        `ВДРЕБЕЗГИ: ${prop.nameRu.toUpperCase()}!`,
        '#fb923c',
        1.15
      );
      this.recordEvent(
        `Разбит реквизит: ${prop.nameRu}`,
        prop.kind === 'vase'
          ? 'Бесценная ваза разлетелась на осколки!'
          : 'Эффектное разрушение интерактивного окружения',
        120,
        'prop'
      );

      const hero = this.getHero();
      if (hero && prop.kind === 'vase') {
        hero.expression = 'shocked';
        hero.expressionTimer = 0.9;
        this.setQuip(hero, 'Ой! Простите за вазу!', 1.5);
      }
    } else {
      this.emitImpactParticles(
        hitX,
        hitY,
        8,
        prop.colorPrimary,
        isCeramic ? 'shard' : 'splinter'
      );
    }
  }

  private manageWavesAndScenes(dt: number): void {
    const aliveEnemies = this.fighters.filter(
      (f) => !f.isHero && f.action !== 'ko'
    );

    // Clean up old KO'd enemies if crowd is full
    const koEnemies = this.fighters.filter((f) => !f.isHero && f.action === 'ko');
    if (koEnemies.length > 3) {
      const oldestKo = koEnemies[0];
      const idx = this.fighters.indexOf(oldestKo);
      if (idx !== -1) this.fighters.splice(idx, 1);
    }

    // Spawn reinforcement stuntmen until wave budget is reached
    if (
      aliveEnemies.length < this.params.enemyCount &&
      this.totalSpawnedEnemies < this.maxWaveEnemies
    ) {
      if (this.rng.chance(dt * 1.4)) {
        const spawned = this.spawnEnemy();
        this.addCallout(
          spawned.x,
          spawned.y - 85,
          `ВРЫВАЕТСЯ: ${spawned.name}!`,
          '#38bdf8',
          0.95
        );
      }
    }

    // When all enemies in the scene are KO'd, celebrate & auto-advance to a fresh procedural scene!
    if (
      aliveEnemies.length === 0 &&
      this.totalSpawnedEnemies >= this.maxWaveEnemies
    ) {
      this.sceneClearTimer += dt;
      const hero = this.getHero();
      if (hero && this.sceneClearTimer < 0.2) {
        this.setQuip(hero, 'Снято! Все каскадёры целы!', 2.2);
        this.addCallout(
          hero.x,
          hero.y - 115,
          'СЦЕНА СНЯТА! ГОТОВИМ НОВЫЙ ДУБЛЬ...',
          '#10b981',
          1.3
        );
      }
      if (this.sceneClearTimer >= 2.6) {
        if (this.params.autoNextScene) {
          this.regenerateScene();
        } else {
          // Spawn a fresh wave in the current arena
          this.totalSpawnedEnemies = 0;
          this.sceneClearTimer = 0;
          this.spawnEnemy();
          this.spawnEnemy();
        }
      }
    }
  }

  private updateCamera(dt: number): void {
    const hero = this.getHero();
    if (!hero) return;

    if (this.params.cameraMode === 'wide') {
      this.camX += (this.arena.worldWidth * 0.5 - this.camX) * Math.min(1, dt * 5);
      this.camY += (this.arena.worldHeight * 0.5 - this.camY) * Math.min(1, dt * 5);
      this.camZoom += (0.94 - this.camZoom) * Math.min(1, dt * 5);
      return;
    }

    if (this.params.cameraMode === 'hero_closeup') {
      this.camX += (hero.x - this.camX) * Math.min(1, dt * 7);
      this.camY += (hero.y - 85 - this.camY) * Math.min(1, dt * 7);
      this.camZoom += (1.18 - this.camZoom) * Math.min(1, dt * 5);
      return;
    }

    // Cinematic Director Camera: frames Hero + nearest active fighters
    let focusX = hero.x;
    let focusY = hero.y - 60;
    let maxSpan = 260;

    for (const f of this.fighters) {
      if (f.isHero || f.action === 'ko') continue;
      const dist = Math.abs(f.x - hero.x);
      if (dist < 420) {
        focusX = (focusX * 2 + f.x) / 3;
        focusY = (focusY * 2 + (f.y - 60)) / 3;
        maxSpan = Math.max(maxSpan, dist);
      }
    }

    const targetZoom =
      this.slowMoTimer > 0
        ? 1.14
        : Math.max(0.92, Math.min(1.08, 620 / (maxSpan + 240)));

    this.camX += (focusX - this.camX) * Math.min(1, dt * 5.5);
    this.camY += (Math.min(370, Math.max(270, focusY)) - this.camY) * Math.min(1, dt * 5.5);
    this.camZoom += (targetZoom - this.camZoom) * Math.min(1, dt * 4.5);
  }

  private findNearestAvailableProp(
    x: number,
    y: number,
    maxDist: number
  ): InteractiveProp | null {
    let best: InteractiveProp | null = null;
    let bestDist = maxDist;
    for (const p of this.arena.props) {
      if (p.broken || p.isHeldBy || p.tetherX !== undefined) continue;
      const d = Math.hypot(p.x - x, p.y - (y - 30));
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  private startAction(
    f: Fighter,
    action: Fighter['action'],
    duration: number
  ): void {
    f.action = action;
    f.actionTimer = 0;
    f.actionDuration = duration;
  }

  private setQuip(f: Fighter, text: string, duration = 1.3): void {
    f.quips = text;
    f.quipTimer = duration;
  }

  public addCallout(
    x: number,
    y: number,
    text: string,
    color: string,
    scale = 1.0
  ): void {
    // Shift any nearby existing callouts upward so text never overlaps
    for (const existing of this.callouts) {
      if (Math.abs(existing.x - x) < 280 && Math.abs(existing.y - y) < 32) {
        existing.y -= 30;
      }
    }
    if (this.callouts.length > 5) {
      this.callouts.shift();
    }
    this.callouts.push({
      id: `call_${++this.eventCounter}`,
      text,
      x,
      y: Math.max(110, y),
      vy: -34,
      life: 0,
      maxLife: 1.15,
      color,
      scale,
    });
  }

  private recordEvent(
    title: string,
    detail: string,
    points: number,
    category: StuntFeedEvent['category']
  ): void {
    this.recentEvents.unshift({
      id: `evt_${++this.eventCounter}`,
      timestamp: this.time,
      title,
      detail,
      points,
      category,
    });
    if (this.recentEvents.length > 10) {
      this.recentEvents.pop();
    }
  }

  private emitImpactParticles(
    x: number,
    y: number,
    count: number,
    color: string,
    shape: PooledParticle['shape']
  ): void {
    // Also emit 1 expanding shockwave ring
    const ring = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % this.particles.length;
    ring.active = true;
    ring.x = x;
    ring.y = y;
    ring.vx = 0;
    ring.vy = 0;
    ring.size = 12;
    ring.angle = 0;
    ring.vAngle = 0;
    ring.life = 0;
    ring.maxLife = 0.24;
    ring.color = color;
    ring.shape = 'ring';

    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.particles.length;
      const angle = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(90, 360);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 90;
      p.size = this.rng.range(3.5, 8.5);
      p.angle = this.rng.range(0, Math.PI * 2);
      p.vAngle = this.rng.range(-12, 12);
      p.life = 0;
      p.maxLife = this.rng.range(0.32, 0.68);
      p.color = color;
      p.shape = shape;
    }
  }

  public getMetrics(): SimulationMetrics {
    const hero = this.getHero();
    const aliveEnemies = this.fighters.filter(
      (f) => !f.isHero && f.action !== 'ko'
    ).length;

    return {
      seed: this.rng.seedString,
      takeNumber: this.takeNumber,
      biomeId: this.arena.biome.id,
      biomeName: this.arena.biome.nameRu,
      biomeSubtitle: this.arena.biome.subtitleRu,
      score: Math.round(this.score),
      stuntsCount: this.stuntsCount,
      propsSmashed: this.propsSmashed,
      knockouts: this.knockouts,
      activeEnemies: aliveEnemies,
      totalWaveEnemies: this.maxWaveEnemies,
      heroHp: hero ? Math.round(hero.hp) : 0,
      heroMaxHp: hero ? hero.maxHp : 260,
      heroCombo: hero ? hero.comboCount : 0,
      currentActionLabel: hero
        ? ACTION_LABELS_RU[hero.action]
        : 'Подготовка дубля',
      recentEvents: this.recentEvents.slice(0, 5),
    };
  }
}

export { BIOMES };
