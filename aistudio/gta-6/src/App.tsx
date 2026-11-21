import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { HudOverlay } from './components/HudOverlay';
import { PauseModal } from './components/PauseModal';
import { TitleOverlay } from './components/TitleOverlay';
import { SimulationEngine } from './engine/SimulationEngine';
import {
  DEFAULT_SETTINGS,
  type CameraMode,
  type ForcedEventType,
  type HudSnapshot,
  type SimLifecycleState,
  type SimulationSettings,
} from './sim/types';

const INITIAL_HUD: HudSnapshot = {
  biome: 'downtown',
  biomeName: 'Даунтаун Вайс',
  districtName: 'Финансовый квартал',
  action: 'driving',
  actionLabel: 'Скоростной заезд',
  wantedStars: 0,
  wantedHeat: 0,
  health: 100,
  armor: 100,
  cash: 12500,
  weapon: 'rifle',
  weaponName: 'Штурмовая М4',
  ammo: 120,
  speedKmh: 65,
  inVehicle: true,
  vehicleLabel: 'Суперкар Banshee VI',
  policeCount: 0,
  explosionsCount: 0,
  banksRobbed: 0,
  carsStolen: 1,
  activeCameraLabel: 'Авто · Погоня',
  timeFormatted: '17:36',
  radioStation: 'vrock',
  radioStationName: 'V-ROCK 106.6 FM',
  radioGenre: 'Хард-Рок & Хэви-Метал',
  radioTrackTitle: 'Sunset Distortion — Highway to Vice',
  bannerText: null,
  bannerSubtext: null,
  bannerTone: null,
  playerHeading: 0,
  playerX: 3.8,
  playerZ: 4.0,
  radarBlips: [],
};

const CAMERA_CYCLE: CameraMode[] = ['auto', 'chase', 'heli', 'hood', 'drone'];
const RADIO_CYCLE: SimulationSettings['radioStation'][] = ['vrock', 'skull', 'vice84', 'leonida', 'off'];

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SimulationEngine | null>(null);

  const [lifecycle, setLifecycle] = useState<SimLifecycleState>(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('autostart=1')) {
      return 'playing';
    }
    return 'title';
  });
  const [settings, setSettings] = useState<SimulationSettings>(DEFAULT_SETTINGS);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [dockOpen, setDockOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 640 : true,
  );
  const [hudHidden, setHudHidden] = useState(false);

  const lifecycleRef = useRef<SimLifecycleState>(lifecycle);
  lifecycleRef.current = lifecycle;

  // Sync document.body.dataset.state immediately for clean state machine parity
  useEffect(() => {
    document.body.dataset.state = lifecycle;
    engineRef.current?.setLifecycleState(lifecycle);
  }, [lifecycle]);

  // Mount Three.js WebGLRenderer & SimulationEngine strictly once
  useEffect(() => {
    const el = canvasMountRef.current;
    if (!el) return;
    const engine = new SimulationEngine(el, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;
    engine.setLifecycleState(lifecycleRef.current);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => {
    document.body.dataset.state = 'playing';
    setLifecycle('playing');
  }, []);

  const handleUpdateSettings = useCallback((partial: Partial<SimulationSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      engineRef.current?.updateSettings(partial);
      return next;
    });
  }, []);

  const handleCycleRadio = useCallback(() => {
    setSettings((prev) => {
      const nextStation = RADIO_CYCLE[(RADIO_CYCLE.indexOf(prev.radioStation) + 1) % RADIO_CYCLE.length];
      engineRef.current?.updateSettings({ radioStation: nextStation, muted: false });
      return { ...prev, radioStation: nextStation, muted: false };
    });
  }, []);

  const handleTriggerEvent = useCallback((event: ForcedEventType) => {
    engineRef.current?.triggerEvent(event);
  }, []);

  const handleRestart = useCallback(() => {
    engineRef.current?.resetSimulation();
    setLifecycle('playing');
  }, []);

  // Keyboard shortcuts: Enter/Space to start, P/Esc to pause, C to cycle camera, R to cycle radio, H to hide dock, M to mute
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (lifecycleRef.current === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStart();
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        setLifecycle((prev) => (prev === 'playing' ? 'paused' : 'playing'));
      } else if (e.code === 'KeyH') {
        setDockOpen((prev) => !prev);
      } else if (e.code === 'KeyM') {
        setSettings((prev) => {
          const muted = !prev.muted;
          engineRef.current?.updateSettings({ muted });
          return { ...prev, muted };
        });
      } else if (e.code === 'KeyR') {
        handleCycleRadio();
      } else if (e.code === 'KeyC') {
        setSettings((prev) => {
          const nextMode = CAMERA_CYCLE[(CAMERA_CYCLE.indexOf(prev.cameraMode) + 1) % CAMERA_CYCLE.length];
          engineRef.current?.updateSettings({ cameraMode: nextMode });
          return { ...prev, cameraMode: nextMode };
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStart, handleCycleRadio]);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0a0c12]">
      {/* Isolated WebGL Canvas Container (never torn down on HUD state updates) */}
      <div
        ref={canvasMountRef}
        data-testid="sim-canvas-container"
        className="fixed inset-0 w-full h-full"
      />

      {lifecycle === 'title' && <TitleOverlay onStart={handleStart} />}

      {lifecycle === 'playing' && (
        <>
          <HudOverlay
            hud={hud}
            muted={settings.muted}
            hudHidden={hudHidden}
            dockOpen={dockOpen}
            onToggleMute={() => handleUpdateSettings({ muted: !settings.muted })}
            onCycleRadio={handleCycleRadio}
            onPause={() => setLifecycle('paused')}
            onToggleHudHidden={() => setHudHidden((prev) => !prev)}
          />
          <ControlDock
            settings={settings}
            radioTrackTitle={hud.radioTrackTitle}
            open={dockOpen}
            onToggleOpen={() => setDockOpen((prev) => !prev)}
            onUpdateSettings={handleUpdateSettings}
            onTriggerEvent={handleTriggerEvent}
          />
        </>
      )}

      {lifecycle === 'paused' && (
        <PauseModal
          hud={hud}
          onResume={() => setLifecycle('playing')}
          onRestart={handleRestart}
          onTitle={() => setLifecycle('title')}
        />
      )}
    </main>
  );
}
