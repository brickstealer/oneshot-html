import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialUpgrades } from './sim/taxiEconomy';
import type {
  BiomeId,
  HudSnapshot,
  SimSettings,
  UpgradeKey,
} from './sim/types';
import { mountTaxiSceneEngine, type TaxiSceneEngineApi } from './three/sceneEngine';
import { TopHud } from './components/TopHud';
import { ControlDock, type DockTab } from './components/ControlDock';

const INITIAL_SETTINGS: SimSettings = {
  cameraMode: 'director',
  timeOfDay: 'sunset',
  weather: 'clear',
  simSpeed: 1,
  trafficDensity: 0.7,
  autoUpgrade: false,
  audioEnabled: false,
};

const INITIAL_HUD: HudSnapshot = {
  speedKmh: 0,
  maxSpeedKmh: 65,
  biome: 'metropolis',
  orderPhase: 'cruising',
  activeOrder: null,
  distanceToTargetM: 0,
  balance: 260,
  totalEarned: 0,
  tripsCompleted: 0,
  totalDistanceKm: 0,
  upgrades: createInitialUpgrades(),
  vehicleClassName: 'Классик Седан',
  vehicleTierIndex: 0,
  altitude: 0,
  flightBlend: 0,
  flightUnlocked: false,
  timeHours: 17.6,
  lastPayout: 0,
  lastPayoutId: 0,
  activeDirectorAngle: 'Широкий план погони',
  hasPassengerInCabin: false,
  doorOpenAmount: 0,
  tripProgress: 0,
  fleetActiveCount: 24,
  fleetTripsCompleted: 0,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TaxiSceneEngineApi | null>(null);

  const [settings, setSettings] = useState<SimSettings>(INITIAL_SETTINGS);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [activeTab, setActiveTab] = useState<DockTab>('camera');
  // Start compact on mobile portrait (<640px) so the 3D scene has max visibility immediately
  const [dockExpanded, setDockExpanded] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 640 : true,
  );
  const [cinemaMode, setCinemaMode] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  // Mount WebGLRenderer & 3D scene exactly once
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const api = mountTaxiSceneEngine(
      mountEl,
      INITIAL_SETTINGS,
      (snapshot) => {
        setHud(snapshot);
      },
      (err) => {
        setWebglError(err);
      },
    );
    engineRef.current = api;

    return () => {
      api.dispose();
      engineRef.current = null;
    };
  }, []);

  // Keyboard shortcuts: H toggles Cinema Mode, 1-6 switch cameras
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') {
        setCinemaMode((prev) => !prev);
      } else if (e.key >= '1' && e.key <= '6') {
        const modes: SimSettings['cameraMode'][] = [
          'director',
          'chase',
          'drone',
          'hood',
          'side',
          'orbit',
        ];
        const chosen = modes[Number(e.key) - 1];
        setSettings((prev) => {
          const next = { ...prev, cameraMode: chosen };
          engineRef.current?.updateSettings(next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleUpdateSettings = useCallback((patch: Partial<SimSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      engineRef.current?.updateSettings(next);
      return next;
    });
  }, []);

  const handleBuyUpgrade = useCallback((key: UpgradeKey) => {
    engineRef.current?.buyUpgrade(key);
  }, []);

  const handleTeleportBiome = useCallback((biome: BiomeId) => {
    engineRef.current?.teleportToBiome(biome);
  }, []);

  const handleResetProgress = useCallback(() => {
    engineRef.current?.resetProgress();
  }, []);

  const handleSelectTab = useCallback(
    (tab: DockTab) => {
      if (dockExpanded && activeTab === tab) {
        setDockExpanded(false);
      } else {
        setActiveTab(tab);
        setDockExpanded(true);
      }
    },
    [dockExpanded, activeTab],
  );

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-[#090c12]"
      data-biome={hud.biome}
      data-order-phase={hud.orderPhase}
      data-camera={settings.cameraMode}
      data-has-passenger={hud.hasPassengerInCabin ? 'true' : 'false'}
      data-door-open={hud.doorOpenAmount > 0.25 ? 'true' : 'false'}
      data-flying={hud.altitude > 1.5 ? 'true' : 'false'}
      data-altitude={Math.round(hud.altitude)}
      data-fleet-count={hud.fleetActiveCount}
      data-passenger-archetype={hud.activeOrder?.passengerArchetype ?? ''}
      data-passenger-name={hud.activeOrder?.passengerName ?? ''}
    >
      {/* Isolated WebGL canvas mount container */}
      <div
        ref={canvasMountRef}
        data-testid="webgl-viewport"
        className="absolute inset-0 h-full w-full"
      />

      {/* Graceful fallback if WebGL is unavailable */}
      {webglError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#090c12]/95 p-6 text-center">
          <div className="max-w-md rounded-2xl border border-white/12 bg-[#121722] p-6">
            <h1 className="font-display text-lg font-bold text-white">
              AutoTaxi Infinity 3D
            </h1>
            <p className="mt-2 text-sm text-slate-300">{webglError}</p>
          </div>
        </div>
      )}

      <TopHud
        hud={hud}
        audioEnabled={settings.audioEnabled}
        cinemaMode={cinemaMode}
        onToggleAudio={() =>
          handleUpdateSettings({ audioEnabled: !settings.audioEnabled })
        }
        onToggleCinema={() => setCinemaMode((prev) => !prev)}
      />

      <ControlDock
        hud={hud}
        settings={settings}
        activeTab={activeTab}
        expanded={dockExpanded}
        cinemaMode={cinemaMode}
        onSelectTab={handleSelectTab}
        onToggleExpanded={() => setDockExpanded((prev) => !prev)}
        onUpdateSettings={handleUpdateSettings}
        onBuyUpgrade={handleBuyUpgrade}
        onTeleportBiome={handleTeleportBiome}
        onResetProgress={handleResetProgress}
      />
    </main>
  );
}
