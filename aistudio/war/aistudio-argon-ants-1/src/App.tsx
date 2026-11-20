import { useCallback, useEffect, useRef, useState } from 'react';
import { HudOverlay } from './components/HudOverlay';
import { AntWarScene } from './scene/AntWarScene';
import type { HudSnapshot, SimulationConfig } from './sim/types';

function pickInitialSeed(): number {
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get('seed');
  if (seedParam) {
    const parsed = Number(seedParam);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return Math.floor(1000 + Math.random() * 89999);
}

const INITIAL_CONFIG: SimulationConfig = {
  timeScale: 1.0,
  antsPerFaction: 110,
  battleIntensity: 1.0,
  buildSpeed: 1.0,
  cameraSpeed: 1.0,
  cameraMode: 'auto',
  autoDiveTunnels: true,
  atmosphere: 'sunset',
  paused: false,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<AntWarScene | null>(null);

  const [initialSeed] = useState<number>(() => pickInitialSeed());
  const [config, setConfig] = useState<SimulationConfig>(INITIAL_CONFIG);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [webglError, setWebglError] = useState<string>('');

  const [hud, setHud] = useState<HudSnapshot>({
    seed: initialSeed,
    redAlive: INITIAL_CONFIG.antsPerFaction,
    blackAlive: INITIAL_CONFIG.antsPerFaction,
    redBuilt: 12,
    blackBuilt: 12,
    activeFights: 0,
    undergroundAnts: 28,
    shotLabel: 'Панорамный облет долины',
    isUnderground: false,
    cameraAltitude: 14,
  });

  const handleHudUpdate = useCallback((snapshot: HudSnapshot) => {
    setHud(snapshot);
  }, []);

  const handleUserManualControl = useCallback(() => {
    setConfig((prev) => (prev.cameraMode === 'free' ? prev : { ...prev, cameraMode: 'free' }));
  }, []);

  const callbacksRef = useRef({
    onHudUpdate: handleHudUpdate,
    onUserManualControl: handleUserManualControl,
    onWebglError: (msg: string) => setWebglError(msg),
  });
  callbacksRef.current = {
    onHudUpdate: handleHudUpdate,
    onUserManualControl: handleUserManualControl,
    onWebglError: (msg: string) => setWebglError(msg),
  };

  // Mount WebGL canvas & Three.js engine once
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    try {
      const scene = new AntWarScene(mountEl, initialSeed, INITIAL_CONFIG, {
        onHudUpdate: (s) => callbacksRef.current.onHudUpdate(s),
        onUserManualControl: () => callbacksRef.current.onUserManualControl(),
        onWebglError: (m) => callbacksRef.current.onWebglError(m),
      });
      sceneRef.current = scene;
    } catch (err) {
      setWebglError(
        err instanceof Error
          ? err.message
          : 'Не удалось инициализировать WebGL для 3D-симуляции.',
      );
    }

    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [initialSeed]);

  // Push config updates into running Three.js scene without recreating WebGL
  useEffect(() => {
    sceneRef.current?.updateConfig(config);
  }, [config]);

  const handleUpdateConfig = useCallback((patch: Partial<SimulationConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleRegenerateWorld = useCallback(() => {
    const nextSeed = Math.floor(1000 + Math.random() * 89999);
    sceneRef.current?.regenerateWorld(nextSeed);
    setHud((prev) => ({ ...prev, seed: nextSeed }));
  }, []);

  // Keyboard shortcuts: H = hide/show HUD, Space = pause/play, R = new random world
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') {
        setControlsCollapsed((v) => !v);
      } else if (e.code === 'Space') {
        e.preventDefault();
        setConfig((prev) => ({ ...prev, paused: !prev.paused }));
      } else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        handleRegenerateWorld();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRegenerateWorld]);

  return (
    <main
      className="relative h-full w-full overflow-hidden bg-[#11100e]"
      data-state={config.paused ? 'paused' : 'running'}
      data-camera-mode={config.cameraMode}
      data-underground={hud.isUnderground ? 'true' : 'false'}
    >
      {/* Isolated WebGL canvas mount container */}
      <div ref={canvasMountRef} className="h-full w-full" />

      {/* Graceful WebGL fallback banner if context fails */}
      {webglError && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#14120f]/95 p-6 text-center">
          <div className="max-w-md rounded-xl border border-[#f2ece1]/15 bg-[#1d1a16] p-6">
            <h2 className="font-display text-xl text-[#f5efe4]">Ошибка 3D-рендера</h2>
            <p className="mt-2 text-sm text-[#cfc5b4]">{webglError}</p>
          </div>
        </div>
      )}

      {/* Non-obstructive HUD & collapsible bottom dock */}
      <HudOverlay
        config={config}
        hud={hud}
        controlsCollapsed={controlsCollapsed}
        settingsOpen={settingsOpen}
        onToggleCollapse={() => setControlsCollapsed((v) => !v)}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
        onUpdateConfig={handleUpdateConfig}
        onRegenerateWorld={handleRegenerateWorld}
      />
    </main>
  );
}
