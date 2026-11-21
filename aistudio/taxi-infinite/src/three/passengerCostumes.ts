import * as THREE from 'three';
import type { BiomeId } from '../sim/types';
import { BIOMES } from '../sim/worldGen';

const ALL_BIOMES = Object.keys(BIOMES) as BiomeId[];

export interface BiomeHeadgearRig {
  root: THREE.Group;
  byBiome: Record<BiomeId, THREE.Group>;
  setBiome: (biome: BiomeId | null) => boolean; // returns true if headgear replaces default hair
}

export interface BiomePropRig {
  root: THREE.Group;
  byBiome: Record<BiomeId, THREE.Group>;
  setBiome: (biome: BiomeId | null) => void;
}

const HIDES_HAIR: Record<BiomeId, boolean> = {
  metropolis: false,
  riviera: false,
  canyon: false,
  alpine: true,
  sakura: true,
  mushroom: true,
  medieval: true,
  rome: true,
  egypt: true,
  candy: false,
  dino: true,
  cyberpunk: true,
  moon: true,
};

/**
 * Shared geometry & material library for all 13 crazy biome passenger costumes.
 * Instantiated once per scene manager so hero client, seated cabin passenger,
 * ambient pedestrians, and peer-taxi clients reuse the exact same GPU buffers!
 */
export class BiomeCostumeLibrary {
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];

  // Shared materials
  private redCapMat: THREE.MeshStandardMaterial;
  private whiteMat: THREE.MeshStandardMaterial;
  private creamMat: THREE.MeshStandardMaterial;
  private steelMat: THREE.MeshStandardMaterial;
  private darkSlitMat: THREE.MeshStandardMaterial;
  private goldMat: THREE.MeshStandardMaterial;
  private crimsonPlumeMat: THREE.MeshStandardMaterial;
  private royalBlueMat: THREE.MeshStandardMaterial;
  private pinkIcingMat: THREE.MeshStandardMaterial;
  private cherryMat: THREE.MeshStandardMaterial;
  private boneMat: THREE.MeshStandardMaterial;
  private woodMat: THREE.MeshStandardMaterial;
  private leatherMat: THREE.MeshStandardMaterial;
  private strawMat: THREE.MeshStandardMaterial;
  private beanieMat: THREE.MeshStandardMaterial;
  private goggleMat: THREE.MeshStandardMaterial;
  private cyberCyanMat: THREE.MeshStandardMaterial;
  private cyberPinkMat: THREE.MeshStandardMaterial;
  private goldVisorMat: THREE.MeshStandardMaterial;
  private fedoraMat: THREE.MeshStandardMaterial;
  private emeraldGlowMat: THREE.MeshStandardMaterial;
  private surfCoralMat: THREE.MeshStandardMaterial;

  // Shared geometries
  private mushCapGeo: THREE.BufferGeometry;
  private mushRimGeo: THREE.BufferGeometry;
  private spotGeo: THREE.BufferGeometry;
  private knightHelmGeo: THREE.BufferGeometry;
  private knightVisorGeo: THREE.BufferGeometry;
  private knightCrossVGeo: THREE.BufferGeometry;
  private knightPlumeGeo: THREE.BufferGeometry;
  private romeDomeGeo: THREE.BufferGeometry;
  private romeCrestGeo: THREE.BufferGeometry;
  private romeCheekGeo: THREE.BufferGeometry;
  private egyptCrownGeo: THREE.BufferGeometry;
  private egyptFlapGeo: THREE.BufferGeometry;
  private egyptStripeGeo: THREE.BufferGeometry;
  private egyptCobraGeo: THREE.BufferGeometry;
  private donutGeo: THREE.BufferGeometry;
  private cherryGeo: THREE.BufferGeometry;
  private sprinkleGeo: THREE.BufferGeometry;
  private dinoCapGeo: THREE.BufferGeometry;
  private dinoHornGeo: THREE.BufferGeometry;
  private cyberVisorGeo: THREE.BufferGeometry;
  private cyberFinGeo: THREE.BufferGeometry;
  private astroHelmGeo: THREE.BufferGeometry;
  private astroVisorGeo: THREE.BufferGeometry;
  private astroAntennaGeo: THREE.BufferGeometry;
  private kasaGeo: THREE.BufferGeometry;
  private cowboyBrimGeo: THREE.BufferGeometry;
  private cowboyCrownGeo: THREE.BufferGeometry;
  private beanieGeo: THREE.BufferGeometry;
  private pomGeo: THREE.BufferGeometry;
  private goggleGeo: THREE.BufferGeometry;
  private sunhatBrimGeo: THREE.BufferGeometry;
  private sunhatCrownGeo: THREE.BufferGeometry;
  private shadesGeo: THREE.BufferGeometry;
  private fedoraBrimGeo: THREE.BufferGeometry;
  private fedoraCrownGeo: THREE.BufferGeometry;
  private headBandGeo: THREE.BufferGeometry;
  private earCupGeo: THREE.BufferGeometry;

  // Prop geometries
  private briefcaseGeo: THREE.BufferGeometry;
  private staffGeo: THREE.BufferGeometry;
  private ankhLoopGeo: THREE.BufferGeometry;
  private ankhBarGeo: THREE.BufferGeometry;
  private shieldGeo: THREE.BufferGeometry;
  private lolliStickGeo: THREE.BufferGeometry;
  private lolliHeadGeo: THREE.BufferGeometry;
  private lolliRingGeo: THREE.BufferGeometry;
  private clubGeo: THREE.BufferGeometry;
  private lanternGeo: THREE.BufferGeometry;
  private surfGeo: THREE.BufferGeometry;
  private canisterGeo: THREE.BufferGeometry;
  private scrollGeo: THREE.BufferGeometry;
  private cyberBladeGeo: THREE.BufferGeometry;

  constructor() {
    const g = <T extends THREE.BufferGeometry>(geo: T): T => {
      this.geos.push(geo);
      return geo;
    };
    const m = <T extends THREE.Material>(mat: T): T => {
      this.mats.push(mat);
      return mat;
    };

    // --- Materials ---
    this.redCapMat = m(new THREE.MeshStandardMaterial({ color: 0xef233c, roughness: 0.45 }));
    this.whiteMat = m(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 }));
    this.creamMat = m(new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.72 }));
    this.steelMat = m(
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.88, roughness: 0.22 }),
    );
    this.darkSlitMat = m(new THREE.MeshStandardMaterial({ color: 0x090c12, roughness: 0.2 }));
    this.goldMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        metalness: 0.85,
        roughness: 0.2,
        emissive: 0x78350f,
        emissiveIntensity: 0.18,
      }),
    );
    this.crimsonPlumeMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        roughness: 0.55,
        emissive: 0x7f1d1d,
        emissiveIntensity: 0.15,
      }),
    );
    this.royalBlueMat = m(
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.42, metalness: 0.18 }),
    );
    this.pinkIcingMat = m(
      new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.26, metalness: 0.08 }),
    );
    this.cherryMat = m(
      new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.18, metalness: 0.1 }),
    );
    this.boneMat = m(new THREE.MeshStandardMaterial({ color: 0xf5efe0, roughness: 0.62 }));
    this.woodMat = m(new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.82 }));
    this.leatherMat = m(new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.7 }));
    this.strawMat = m(new THREE.MeshStandardMaterial({ color: 0xe7c985, roughness: 0.85 }));
    this.beanieMat = m(new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.85 }));
    this.goggleMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xea580c,
        emissiveIntensity: 0.35,
        metalness: 0.6,
        roughness: 0.14,
      }),
    );
    this.cyberCyanMat = m(
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x06b6d4,
        emissiveIntensity: 1.5,
        roughness: 0.15,
      }),
    );
    this.cyberPinkMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xf472b6,
        emissive: 0xec4899,
        emissiveIntensity: 1.35,
        roughness: 0.18,
      }),
    );
    this.goldVisorMat = m(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xb45309,
        emissiveIntensity: 0.35,
        metalness: 0.96,
        roughness: 0.08,
      }),
    );
    this.fedoraMat = m(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65 }));
    this.emeraldGlowMat = m(
      new THREE.MeshStandardMaterial({
        color: 0x34d399,
        emissive: 0x10b981,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    );
    this.surfCoralMat = m(
      new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.28, metalness: 0.1 }),
    );

    // --- Headgear Geometries (authored around head center 0,0,0, radius ~0.165) ---
    this.mushCapGeo = g(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56));
    this.mushRimGeo = g(new THREE.CylinderGeometry(0.39, 0.32, 0.06, 16));
    this.spotGeo = g(new THREE.SphereGeometry(0.065, 8, 8));

    this.knightHelmGeo = g(new THREE.CylinderGeometry(0.205, 0.215, 0.36, 12));
    this.knightVisorGeo = g(new THREE.BoxGeometry(0.28, 0.055, 0.06));
    this.knightCrossVGeo = g(new THREE.BoxGeometry(0.04, 0.22, 0.05));
    this.knightPlumeGeo = g(new THREE.BoxGeometry(0.07, 0.24, 0.42));

    this.romeDomeGeo = g(new THREE.SphereGeometry(0.205, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.65));
    this.romeCrestGeo = g(new THREE.TorusGeometry(0.24, 0.052, 8, 16, Math.PI * 1.05));
    this.romeCheekGeo = g(new THREE.BoxGeometry(0.04, 0.15, 0.12));

    this.egyptCrownGeo = g(new THREE.CylinderGeometry(0.23, 0.2, 0.24, 12));
    this.egyptFlapGeo = g(new THREE.BoxGeometry(0.11, 0.34, 0.24));
    this.egyptStripeGeo = g(new THREE.BoxGeometry(0.12, 0.04, 0.25));
    this.egyptCobraGeo = g(new THREE.CylinderGeometry(0.025, 0.04, 0.16, 8));

    this.donutGeo = g(new THREE.TorusGeometry(0.22, 0.09, 10, 18));
    this.donutGeo.rotateX(Math.PI * 0.5);
    this.cherryGeo = g(new THREE.SphereGeometry(0.075, 10, 8));
    this.sprinkleGeo = g(new THREE.BoxGeometry(0.05, 0.022, 0.022));

    this.dinoCapGeo = g(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6));
    this.dinoHornGeo = g(new THREE.ConeGeometry(0.055, 0.28, 8));

    this.cyberVisorGeo = g(new THREE.BoxGeometry(0.36, 0.095, 0.22));
    this.cyberFinGeo = g(new THREE.BoxGeometry(0.04, 0.22, 0.34));

    this.astroHelmGeo = g(new THREE.SphereGeometry(0.255, 16, 12));
    this.astroVisorGeo = g(
      new THREE.SphereGeometry(0.242, 14, 10, -Math.PI * 0.46, Math.PI * 0.92, Math.PI * 0.24, Math.PI * 0.46),
    );
    this.astroAntennaGeo = g(new THREE.CylinderGeometry(0.014, 0.014, 0.24, 6));

    this.kasaGeo = g(new THREE.ConeGeometry(0.46, 0.24, 16));
    this.cowboyBrimGeo = g(new THREE.CylinderGeometry(0.38, 0.4, 0.035, 16));
    this.cowboyCrownGeo = g(new THREE.CylinderGeometry(0.17, 0.2, 0.19, 12));

    this.beanieGeo = g(new THREE.SphereGeometry(0.195, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62));
    this.pomGeo = g(new THREE.SphereGeometry(0.068, 8, 8));
    this.goggleGeo = g(new THREE.BoxGeometry(0.29, 0.095, 0.1));

    this.sunhatBrimGeo = g(new THREE.CylinderGeometry(0.42, 0.44, 0.025, 18));
    this.sunhatCrownGeo = g(new THREE.CylinderGeometry(0.17, 0.19, 0.14, 14));
    this.shadesGeo = g(new THREE.BoxGeometry(0.26, 0.065, 0.07));

    this.fedoraBrimGeo = g(new THREE.CylinderGeometry(0.29, 0.3, 0.028, 16));
    this.fedoraCrownGeo = g(new THREE.CylinderGeometry(0.16, 0.19, 0.15, 12));
    this.headBandGeo = g(new THREE.TorusGeometry(0.195, 0.022, 6, 16, Math.PI));
    this.earCupGeo = g(new THREE.CylinderGeometry(0.065, 0.065, 0.045, 10));
    this.earCupGeo.rotateZ(Math.PI * 0.5);

    // --- Hand Prop Geometries ---
    this.briefcaseGeo = g(new THREE.BoxGeometry(0.15, 0.34, 0.44));
    this.staffGeo = g(new THREE.CylinderGeometry(0.026, 0.026, 1.05, 8));
    this.ankhLoopGeo = g(new THREE.TorusGeometry(0.11, 0.026, 8, 14));
    this.ankhBarGeo = g(new THREE.BoxGeometry(0.24, 0.045, 0.045));
    this.shieldGeo = g(new THREE.BoxGeometry(0.08, 0.62, 0.44));
    this.lolliStickGeo = g(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 8));
    this.lolliHeadGeo = g(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 16));
    this.lolliHeadGeo.rotateZ(Math.PI * 0.5);
    this.lolliRingGeo = g(new THREE.TorusGeometry(0.15, 0.032, 8, 16));
    this.lolliRingGeo.rotateY(Math.PI * 0.5);
    this.clubGeo = g(new THREE.CylinderGeometry(0.11, 0.04, 0.78, 8));
    this.lanternGeo = g(new THREE.CylinderGeometry(0.13, 0.11, 0.28, 10));
    this.surfGeo = g(new THREE.BoxGeometry(0.06, 0.92, 0.3));
    this.canisterGeo = g(new THREE.CylinderGeometry(0.11, 0.11, 0.36, 10));
    this.scrollGeo = g(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 8));
    this.scrollGeo.rotateX(Math.PI * 0.5);
    this.cyberBladeGeo = g(new THREE.BoxGeometry(0.035, 0.78, 0.08));
  }

  /**
   * Builds one biome's multi-part headgear mesh group (authored around head center 0,0,0).
   */
  public buildSingleHeadgear(biome: BiomeId, compactForCabin = false): THREE.Group {
    const grp = new THREE.Group();
    const s = compactForCabin ? 0.72 : 1.0;
    grp.scale.setScalar(s);

    switch (biome) {
      case 'mushroom': {
        const cap = new THREE.Mesh(this.mushCapGeo, this.redCapMat);
        cap.position.y = 0.06;
        const rim = new THREE.Mesh(this.mushRimGeo, this.creamMat);
        rim.position.y = 0.07;
        grp.add(cap, rim);
        const spotCoords: Array<[number, number, number]> = [
          [0, 0.45, 0],
          [0.26, 0.34, 0.12],
          [-0.26, 0.33, 0.14],
          [0.14, 0.32, -0.26],
          [-0.18, 0.32, -0.24],
          [0.02, 0.28, 0.33],
        ];
        for (const [sx, sy, sz] of spotCoords) {
          const sp = new THREE.Mesh(this.spotGeo, this.whiteMat);
          sp.position.set(sx, sy, sz);
          grp.add(sp);
        }
        break;
      }
      case 'medieval': {
        const helm = new THREE.Mesh(this.knightHelmGeo, this.steelMat);
        helm.position.y = 0.03;
        const visor = new THREE.Mesh(this.knightVisorGeo, this.darkSlitMat);
        visor.position.set(0, 0.05, 0.19);
        const cross = new THREE.Mesh(this.knightCrossVGeo, this.goldMat);
        cross.position.set(0, 0.03, 0.2);
        const plume = new THREE.Mesh(this.knightPlumeGeo, this.crimsonPlumeMat);
        plume.position.set(0, 0.28, -0.04);
        plume.rotation.x = -0.18;
        grp.add(helm, visor, cross, plume);
        break;
      }
      case 'rome': {
        const dome = new THREE.Mesh(this.romeDomeGeo, this.goldMat);
        dome.position.y = 0.02;
        const crest = new THREE.Mesh(this.romeCrestGeo, this.crimsonPlumeMat);
        crest.position.set(0, 0.14, -0.02);
        crest.rotation.y = Math.PI * 0.5;
        const chL = new THREE.Mesh(this.romeCheekGeo, this.goldMat);
        chL.position.set(0.18, -0.05, 0.05);
        const chR = new THREE.Mesh(this.romeCheekGeo, this.goldMat);
        chR.position.set(-0.18, -0.05, 0.05);
        grp.add(dome, crest, chL, chR);
        break;
      }
      case 'egypt': {
        const crown = new THREE.Mesh(this.egyptCrownGeo, this.goldMat);
        crown.position.y = 0.16;
        const topStripe = new THREE.Mesh(this.egyptCrownGeo, this.royalBlueMat);
        topStripe.scale.set(1.04, 0.25, 1.04);
        topStripe.position.y = 0.21;
        const flapL = new THREE.Mesh(this.egyptFlapGeo, this.goldMat);
        flapL.position.set(0.22, -0.04, -0.03);
        flapL.rotation.z = -0.18;
        const flapR = new THREE.Mesh(this.egyptFlapGeo, this.goldMat);
        flapR.position.set(-0.22, -0.04, -0.03);
        flapR.rotation.z = 0.18;
        const strL1 = new THREE.Mesh(this.egyptStripeGeo, this.royalBlueMat);
        strL1.position.set(0.22, 0.02, -0.03);
        const strL2 = new THREE.Mesh(this.egyptStripeGeo, this.royalBlueMat);
        strL2.position.set(0.23, -0.1, -0.03);
        const strR1 = new THREE.Mesh(this.egyptStripeGeo, this.royalBlueMat);
        strR1.position.set(-0.22, 0.02, -0.03);
        const strR2 = new THREE.Mesh(this.egyptStripeGeo, this.royalBlueMat);
        strR2.position.set(-0.23, -0.1, -0.03);
        const cobra = new THREE.Mesh(this.egyptCobraGeo, this.goldMat);
        cobra.position.set(0, 0.22, 0.19);
        cobra.rotation.x = 0.35;
        grp.add(crown, topStripe, flapL, flapR, strL1, strL2, strR1, strR2, cobra);
        break;
      }
      case 'candy': {
        const donut = new THREE.Mesh(this.donutGeo, this.pinkIcingMat);
        donut.position.set(0, 0.19, 0);
        const cherry = new THREE.Mesh(this.cherryGeo, this.cherryMat);
        cherry.position.set(0, 0.3, 0);
        grp.add(donut, cherry);
        const spMats = [this.cyberCyanMat, this.goldMat, this.whiteMat, this.emeraldGlowMat];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const sp = new THREE.Mesh(this.sprinkleGeo, spMats[i % spMats.length]);
          sp.position.set(Math.cos(a) * 0.22, 0.26, Math.sin(a) * 0.22);
          sp.rotation.y = a + 0.5;
          grp.add(sp);
        }
        break;
      }
      case 'dino': {
        const cap = new THREE.Mesh(this.dinoCapGeo, this.boneMat);
        cap.position.y = 0.05;
        const hornL = new THREE.Mesh(this.dinoHornGeo, this.boneMat);
        hornL.position.set(0.22, 0.22, 0.04);
        hornL.rotation.z = -0.68;
        const hornR = new THREE.Mesh(this.dinoHornGeo, this.boneMat);
        hornR.position.set(-0.22, 0.22, 0.04);
        hornR.rotation.z = 0.68;
        grp.add(cap, hornL, hornR);
        break;
      }
      case 'cyberpunk': {
        const visor = new THREE.Mesh(this.cyberVisorGeo, this.cyberCyanMat);
        visor.position.set(0, 0.03, 0.09);
        const fin1 = new THREE.Mesh(this.cyberFinGeo, this.cyberPinkMat);
        fin1.position.set(0, 0.26, -0.02);
        const fin2 = new THREE.Mesh(this.cyberFinGeo, this.cyberCyanMat);
        fin2.scale.set(0.7, 0.72, 0.75);
        fin2.position.set(0, 0.22, -0.08);
        grp.add(visor, fin1, fin2);
        break;
      }
      case 'moon': {
        const helm = new THREE.Mesh(this.astroHelmGeo, this.whiteMat);
        helm.position.y = 0.03;
        const visor = new THREE.Mesh(this.astroVisorGeo, this.goldVisorMat);
        visor.position.set(0, 0.03, 0.04);
        const collar = new THREE.Mesh(this.donutGeo, this.steelMat);
        collar.scale.set(0.95, 0.55, 0.95);
        collar.position.set(0, -0.17, 0);
        const stripe = new THREE.Mesh(this.cyberFinGeo, this.royalBlueMat);
        stripe.scale.set(1.2, 0.16, 1.05);
        stripe.position.set(0, 0.27, -0.02);
        const ant = new THREE.Mesh(this.astroAntennaGeo, this.steelMat);
        ant.position.set(0.23, 0.2, -0.04);
        const antTip = new THREE.Mesh(this.spotGeo, this.cyberCyanMat);
        antTip.scale.setScalar(0.5);
        antTip.position.set(0.23, 0.33, -0.04);
        grp.add(helm, visor, collar, stripe, ant, antTip);
        break;
      }
      case 'sakura': {
        const kasa = new THREE.Mesh(this.kasaGeo, this.strawMat);
        kasa.position.y = 0.2;
        const topKnot = new THREE.Mesh(this.spotGeo, this.crimsonPlumeMat);
        topKnot.scale.setScalar(0.7);
        topKnot.position.y = 0.32;
        grp.add(kasa, topKnot);
        break;
      }
      case 'canyon': {
        const brim = new THREE.Mesh(this.cowboyBrimGeo, this.leatherMat);
        brim.position.y = 0.14;
        const crown = new THREE.Mesh(this.cowboyCrownGeo, this.leatherMat);
        crown.position.y = 0.24;
        const band = new THREE.Mesh(this.cowboyCrownGeo, this.goldMat);
        band.scale.set(1.04, 0.22, 1.04);
        band.position.y = 0.17;
        grp.add(brim, crown, band);
        break;
      }
      case 'alpine': {
        const beanie = new THREE.Mesh(this.beanieGeo, this.beanieMat);
        beanie.position.y = 0.05;
        const pom = new THREE.Mesh(this.pomGeo, this.whiteMat);
        pom.position.y = 0.27;
        const gog = new THREE.Mesh(this.goggleGeo, this.goggleMat);
        gog.position.set(0, 0.09, 0.14);
        grp.add(beanie, pom, gog);
        break;
      }
      case 'riviera': {
        const brim = new THREE.Mesh(this.sunhatBrimGeo, this.strawMat);
        brim.position.y = 0.14;
        const crown = new THREE.Mesh(this.sunhatCrownGeo, this.strawMat);
        crown.position.y = 0.21;
        const ribbon = new THREE.Mesh(this.sunhatCrownGeo, this.cyberCyanMat);
        ribbon.scale.set(1.03, 0.22, 1.03);
        ribbon.position.y = 0.16;
        const shades = new THREE.Mesh(this.shadesGeo, this.darkSlitMat);
        shades.position.set(0, 0.03, 0.15);
        grp.add(brim, crown, ribbon, shades);
        break;
      }
      case 'metropolis':
      default: {
        const brim = new THREE.Mesh(this.fedoraBrimGeo, this.fedoraMat);
        brim.position.y = 0.14;
        const crown = new THREE.Mesh(this.fedoraCrownGeo, this.fedoraMat);
        crown.position.y = 0.22;
        const band = new THREE.Mesh(this.fedoraCrownGeo, this.goldMat);
        band.scale.set(1.03, 0.2, 1.03);
        band.position.y = 0.17;
        const hpBand = new THREE.Mesh(this.headBandGeo, this.steelMat);
        hpBand.position.y = 0.02;
        const cupL = new THREE.Mesh(this.earCupGeo, this.steelMat);
        cupL.position.set(0.18, 0.0, 0);
        const cupR = new THREE.Mesh(this.earCupGeo, this.steelMat);
        cupR.position.set(-0.18, 0.0, 0);
        grp.add(brim, crown, band, hpBand, cupL, cupR);
        break;
      }
    }

    return grp;
  }

  /**
   * Builds a toggleable set of all 13 biome headgears (zero GC allocations during runtime switches).
   */
  public createHeadgearRig(compactForCabin = false): BiomeHeadgearRig {
    const root = new THREE.Group();
    const byBiome = {} as Record<BiomeId, THREE.Group>;
    let active: BiomeId | null = null;

    for (const biome of ALL_BIOMES) {
      const grp = this.buildSingleHeadgear(biome, compactForCabin);
      grp.visible = false;
      byBiome[biome] = grp;
      root.add(grp);
    }

    return {
      root,
      byBiome,
      setBiome(biome: BiomeId | null): boolean {
        if (active !== biome) {
          if (active) byBiome[active].visible = false;
          if (biome) byBiome[biome].visible = true;
          active = biome;
        }
        return biome ? HIDES_HAIR[biome] : false;
      },
    };
  }

  /**
   * Builds toggleable crazy hand props for the hero client's left arm across all 13 biomes.
   */
  public createPropRig(): BiomePropRig {
    const root = new THREE.Group();
    const byBiome = {} as Record<BiomeId, THREE.Group>;
    let active: BiomeId | null = null;

    for (const biome of ALL_BIOMES) {
      const grp = new THREE.Group();
      switch (biome) {
        case 'mushroom': {
          const lantern = new THREE.Mesh(this.lanternGeo, this.cyberCyanMat);
          lantern.position.set(0.06, -0.08, 0.08);
          const lid = new THREE.Mesh(this.mushRimGeo, this.redCapMat);
          lid.scale.setScalar(0.45);
          lid.position.set(0.06, 0.08, 0.08);
          grp.add(lantern, lid);
          break;
        }
        case 'medieval': {
          const shield = new THREE.Mesh(this.shieldGeo, this.royalBlueMat);
          shield.position.set(0.11, -0.05, 0.08);
          const trim = new THREE.Mesh(this.shieldGeo, this.goldMat);
          trim.scale.set(0.5, 0.85, 0.18);
          trim.position.set(0.15, -0.05, 0.08);
          grp.add(shield, trim);
          break;
        }
        case 'rome': {
          const scroll = new THREE.Mesh(this.scrollGeo, this.creamMat);
          scroll.position.set(0.05, -0.02, 0.14);
          const cap1 = new THREE.Mesh(this.spotGeo, this.goldMat);
          cap1.scale.setScalar(0.75);
          cap1.position.set(0.05, -0.02, 0.36);
          const cap2 = new THREE.Mesh(this.spotGeo, this.goldMat);
          cap2.scale.setScalar(0.75);
          cap2.position.set(0.05, -0.02, -0.08);
          grp.add(scroll, cap1, cap2);
          break;
        }
        case 'egypt': {
          const staff = new THREE.Mesh(this.staffGeo, this.goldMat);
          staff.position.set(0.06, 0.12, 0.14);
          staff.rotation.x = 0.15;
          const bar = new THREE.Mesh(this.ankhBarGeo, this.goldMat);
          bar.position.set(0.06, 0.52, 0.2);
          const loop = new THREE.Mesh(this.ankhLoopGeo, this.goldMat);
          loop.position.set(0.06, 0.68, 0.22);
          grp.add(staff, bar, loop);
          break;
        }
        case 'candy': {
          const stick = new THREE.Mesh(this.lolliStickGeo, this.whiteMat);
          stick.position.set(0.06, 0.18, 0.14);
          stick.rotation.x = 0.2;
          const head = new THREE.Mesh(this.lolliHeadGeo, this.pinkIcingMat);
          head.position.set(0.06, 0.62, 0.22);
          const ring = new THREE.Mesh(this.lolliRingGeo, this.whiteMat);
          ring.position.set(0.06, 0.62, 0.22);
          grp.add(stick, head, ring);
          break;
        }
        case 'dino': {
          const club = new THREE.Mesh(this.clubGeo, this.woodMat);
          club.position.set(0.07, 0.12, 0.18);
          club.rotation.x = 0.45;
          const boneSpike = new THREE.Mesh(this.spotGeo, this.boneMat);
          boneSpike.position.set(0.14, 0.36, 0.32);
          grp.add(club, boneSpike);
          break;
        }
        case 'cyberpunk': {
          const blade = new THREE.Mesh(this.cyberBladeGeo, this.cyberCyanMat);
          blade.position.set(0.06, 0.14, 0.22);
          blade.rotation.x = 0.55;
          const hilt = new THREE.Mesh(this.scrollGeo, this.cyberPinkMat);
          hilt.scale.setScalar(0.5);
          hilt.position.set(0.06, -0.05, 0.05);
          grp.add(blade, hilt);
          break;
        }
        case 'moon': {
          const can = new THREE.Mesh(this.canisterGeo, this.steelMat);
          can.position.set(0.07, -0.08, 0.08);
          const core = new THREE.Mesh(this.canisterGeo, this.emeraldGlowMat);
          core.scale.set(1.06, 0.45, 1.06);
          core.position.set(0.07, -0.08, 0.08);
          grp.add(can, core);
          break;
        }
        case 'sakura': {
          const lantern = new THREE.Mesh(this.lanternGeo, this.crimsonPlumeMat);
          lantern.position.set(0.06, -0.1, 0.12);
          const rim = new THREE.Mesh(this.canisterGeo, this.goldMat);
          rim.scale.set(0.95, 0.15, 0.95);
          rim.position.set(0.06, 0.04, 0.12);
          grp.add(lantern, rim);
          break;
        }
        case 'canyon': {
          const lantern = new THREE.Mesh(this.lanternGeo, this.goldMat);
          lantern.position.set(0.06, -0.08, 0.1);
          const glow = new THREE.Mesh(this.canisterGeo, this.goggleMat);
          glow.scale.set(0.85, 0.48, 0.85);
          glow.position.set(0.06, -0.08, 0.1);
          grp.add(lantern, glow);
          break;
        }
        case 'alpine': {
          const pole = new THREE.Mesh(this.staffGeo, this.steelMat);
          pole.position.set(0.06, 0.05, 0.12);
          pole.rotation.x = 0.18;
          const ring = new THREE.Mesh(this.ankhLoopGeo, this.goggleMat);
          ring.scale.setScalar(0.6);
          ring.rotation.x = Math.PI * 0.5;
          ring.position.set(0.06, -0.4, 0.04);
          grp.add(pole, ring);
          break;
        }
        case 'riviera': {
          const surf = new THREE.Mesh(this.surfGeo, this.surfCoralMat);
          surf.position.set(0.11, 0.15, 0.06);
          const stripe = new THREE.Mesh(this.surfGeo, this.cyberCyanMat);
          stripe.scale.set(1.12, 0.92, 0.25);
          stripe.position.set(0.11, 0.15, 0.06);
          grp.add(surf, stripe);
          break;
        }
        case 'metropolis':
        default: {
          const bag = new THREE.Mesh(this.briefcaseGeo, this.leatherMat);
          bag.position.set(0.08, -0.02, 0.06);
          grp.add(bag);
          break;
        }
      }
      grp.visible = false;
      byBiome[biome] = grp;
      root.add(grp);
    }

    return {
      root,
      byBiome,
      setBiome(biome: BiomeId | null) {
        if (active !== biome) {
          if (active) byBiome[active].visible = false;
          if (biome) byBiome[biome].visible = true;
          active = biome;
        }
      },
    };
  }

  public dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
