import { useEffect, useRef, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { StuntSimulationEngine } from './sim/engine';
import { ArenaThemeId, CameraMode, SimulationStats } from './sim/types';
import { StuntScene3D } from './three/StuntScene3D';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<StuntScene3D | null>(null);

  const [collapsed, setCollapsed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [timeScale, setTimeScale] = useState(1.0);
  const [cameraMode, setCameraMode] = useState<CameraMode>('auto_director');
  const [selectedTheme, setSelectedTheme] = useState<ArenaThemeId | 'random'>('random');
  const [enemyCount, setEnemyCount] = useState(5);

  const [stats, setStats] = useState<SimulationStats>(() => {
    const initialEngine = new StuntSimulationEngine(undefined, undefined, 5);
    return initialEngine.getStats();
  });

  useEffect(() => {
    document.body.dataset.state = paused ? 'paused' : 'playing';
  }, [paused]);

  // Mount Three.js WebGL scene once in dedicated ref container
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const engine = new StuntSimulationEngine(undefined, undefined, 5);
    setStats(engine.getStats());

    const scene3d = new StuntScene3D(container, engine, (liveStats) => {
      setStats(liveStats);
    });
    sceneRef.current = scene3d;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'h') {
        setCollapsed((prev) => !prev);
      } else if (key === 'p' || e.key === 'Escape') {
        setPaused((prev) => {
          const next = !prev;
          if (sceneRef.current) sceneRef.current.paused = next;
          return next;
        });
      } else if (key === 'm') {
        setMuted((prev) => {
          const next = !prev;
          if (sceneRef.current) sceneRef.current.audio.muted = next;
          return next;
        });
      } else if (key === 'r') {
        if (sceneRef.current) {
          sceneRef.current.engine.generateScene();
          sceneRef.current.syncSceneWithEngine(true);
          setStats(sceneRef.current.engine.getStats());
        }
      } else if (key === ' ') {
        e.preventDefault();
        if (sceneRef.current) {
          sceneRef.current.engine.triggerShowcaseStunt();
          setStats(sceneRef.current.engine.getStats());
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      scene3d.dispose();
      sceneRef.current = null;
    };
  }, []);

  const handleNewProceduralScene = (themeOverride?: ArenaThemeId | 'random') => {
    const sc = sceneRef.current;
    if (!sc) return;
    const activeTheme = themeOverride !== undefined ? themeOverride : selectedTheme;
    const resolvedTheme = activeTheme === 'random' ? undefined : activeTheme;
    sc.engine.generateScene(undefined, resolvedTheme);
    sc.syncSceneWithEngine(true);
    setStats(sc.engine.getStats());
  };

  const handleChangeTheme = (theme: ArenaThemeId | 'random') => {
    setSelectedTheme(theme);
    handleNewProceduralScene(theme);
  };

  const handleTogglePause = () => {
    setPaused((prev) => {
      const next = !prev;
      if (sceneRef.current) sceneRef.current.paused = next;
      return next;
    });
  };

  const handleToggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      if (sceneRef.current) sceneRef.current.audio.muted = next;
      return next;
    });
  };

  const handleChangeTimeScale = (scale: number) => {
    setTimeScale(scale);
    if (sceneRef.current) {
      sceneRef.current.timeScale = scale;
    }
  };

  const handleChangeCameraMode = (mode: CameraMode) => {
    setCameraMode(mode);
    if (sceneRef.current) {
      sceneRef.current.cameraMode = mode;
    }
  };

  const handleChangeEnemyCount = (count: number) => {
    setEnemyCount(count);
    if (sceneRef.current) {
      sceneRef.current.engine.targetEnemyCount = count;
    }
  };

  const handleTriggerStunt = () => {
    if (sceneRef.current) {
      sceneRef.current.engine.triggerShowcaseStunt();
      setStats(sceneRef.current.engine.getStats());
    }
  };

  const handleTriggerSpinningCombo = () => {
    if (sceneRef.current) {
      sceneRef.current.engine.triggerSpinningCombo();
      setStats(sceneRef.current.engine.getStats());
    }
  };

  const handleReplenishProps = () => {
    if (sceneRef.current) {
      sceneRef.current.engine.replenishProps(6);
      sceneRef.current.syncSceneWithEngine(false);
      setStats(sceneRef.current.engine.getStats());
    }
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-stone-950 select-none">
      {/* Dedicated WebGL Canvas Container */}
      <div
        ref={canvasMountRef}
        data-testid="stunt-canvas-container"
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Non-Obtrusive Simulation HUD & Collapsible Director Dock */}
      <ControlDock
        stats={stats}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        paused={paused}
        onTogglePause={handleTogglePause}
        muted={muted}
        onToggleMute={handleToggleMute}
        timeScale={timeScale}
        onChangeTimeScale={handleChangeTimeScale}
        cameraMode={cameraMode}
        onChangeCameraMode={handleChangeCameraMode}
        selectedTheme={selectedTheme}
        onChangeTheme={handleChangeTheme}
        enemyCount={enemyCount}
        onChangeEnemyCount={handleChangeEnemyCount}
        onNewProceduralScene={() => handleNewProceduralScene()}
        onTriggerStunt={handleTriggerStunt}
        onTriggerSpinningCombo={handleTriggerSpinningCombo}
        onReplenishProps={handleReplenishProps}
      />

      {/* Focused Pause Modal Card when simulation is paused */}
      {paused && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center p-4 pointer-events-auto"
          style={{ backgroundColor: 'rgba(12, 10, 9, 0.72)' }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-modal-title"
            className="w-full max-w-md rounded-2xl border border-amber-500/40 p-6 shadow-2xl text-stone-100"
            style={{ backgroundColor: 'rgba(20, 16, 14, 0.96)' }}
          >
            <div className="text-xs font-mono text-amber-400 uppercase tracking-wider">
              Пауза симуляции · {stats.seed}
            </div>
            <h2 id="pause-modal-title" className="text-2xl font-bold mt-1">
              {stats.themeNameRu}
            </h2>
            <p className="text-sm text-stone-300 mt-1">
              Автономная хореография кунг-фу и физика активного рэгдолла приостановлены.
            </p>

            <div className="grid grid-cols-3 gap-3 my-5 p-3 rounded-xl bg-stone-900/90 border border-stone-800">
              <div>
                <div className="text-[11px] text-stone-400">Трюки</div>
                <div className="text-xl font-bold font-mono tabular-nums text-amber-400">
                  {Math.round(stats.stuntsPerformed)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-stone-400">Крушения</div>
                <div className="text-xl font-bold font-mono tabular-nums text-orange-400">
                  {Math.round(stats.propsBroken)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-stone-400">Нокауты</div>
                <div className="text-xl font-bold font-mono tabular-nums text-red-400">
                  {Math.round(stats.knockouts)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                data-start="true"
                onClick={handleTogglePause}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm transition-colors cursor-pointer"
              >
                Продолжить бой
              </button>
              <button
                type="button"
                onClick={() => {
                  handleNewProceduralScene();
                  handleTogglePause();
                }}
                className="py-2.5 px-4 rounded-xl border border-stone-700 hover:border-amber-500/50 text-stone-200 font-semibold text-sm transition-colors cursor-pointer"
              >
                Новая сцена
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
