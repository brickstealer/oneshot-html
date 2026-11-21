/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { StuntSimulationEngine } from './sim/engine';
import { renderSimulationFrame } from './sim/renderer';
import { BiomeId, PropKind, SimulationMetrics, SimulationParams } from './sim/types';
import { PerimeterHud } from './components/PerimeterHud';
import { ControlDock } from './components/ControlDock';
import { TuningDrawer } from './components/TuningDrawer';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<StuntSimulationEngine | null>(null);

  if (!engineRef.current) {
    const urlParams =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : null;
    const seedParam = urlParams?.get('seed') ?? undefined;
    engineRef.current = new StuntSimulationEngine(undefined, seedParam);
  }

  const [paused, setPaused] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [params, setParams] = useState<SimulationParams>(() => ({
    ...engineRef.current!.params,
  }));
  const [metrics, setMetrics] = useState<SimulationMetrics>(() =>
    engineRef.current!.getMetrics()
  );

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Sync document.body.dataset.state for testability and inspection
  useEffect(() => {
    document.body.dataset.state = paused ? 'paused' : 'playing';
  }, [paused]);

  const syncMetricsNow = useCallback(() => {
    if (!engineRef.current) return;
    setMetrics(engineRef.current.getMetrics());
    setParams({ ...engineRef.current.params });
  }, []);

  const handleNewTake = useCallback(
    (customSeed?: string, forcedBiome?: BiomeId) => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.regenerateScene(customSeed, forcedBiome);
      setPaused(false);
      syncMetricsNow();
    },
    [syncMetricsNow]
  );

  const handleTriggerStunt = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.triggerHeroSignatureStunt();
    syncMetricsNow();
  }, [syncMetricsNow]);

  const handleDropProp = useCallback(
    (kind?: PropKind) => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.spawnBonusProp(kind);
      syncMetricsNow();
    },
    [syncMetricsNow]
  );

  const handleUpdateParams = useCallback(
    (patch: Partial<SimulationParams>) => {
      const eng = engineRef.current;
      if (!eng) return;
      Object.assign(eng.params, patch);
      setParams({ ...eng.params });
    },
    []
  );

  const handleCycleCamera = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const modes: SimulationParams['cameraMode'][] = [
      'cinematic',
      'wide',
      'hero_closeup',
    ];
    const next = modes[(modes.indexOf(eng.params.cameraMode) + 1) % modes.length];
    handleUpdateParams({ cameraMode: next });
  }, [handleUpdateParams]);

  // Global keyboard shortcuts (Space/Enter = New Stunt or New Take, P/Esc = Pause, M = Mute, R = New Take)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA')
      ) {
        return;
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        handleNewTake();
      } else if (e.code === 'Space') {
        e.preventDefault();
        handleTriggerStunt();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        handleUpdateParams({
          soundEnabled: !engineRef.current?.params.soundEnabled,
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNewTake, handleTriggerStunt, handleUpdateParams]);

  // Main 60 FPS Canvas2D Simulation & Render Loop (decoupled from React reconciliation)
  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    const updateCanvasSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextW = window.innerWidth;
      const nextH = window.innerHeight;
      const targetPixelW = Math.floor(nextW * dpr);
      const targetPixelH = Math.floor(nextH * dpr);
      width = nextW;
      height = nextH;
      if (canvas.width !== targetPixelW || canvas.height !== targetPixelH) {
        canvas.width = targetPixelW;
        canvas.height = targetPixelH;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    let rafId = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let lastTime = performance.now();
    let hudSyncAccumulator = 0;

    const tick = (now: number) => {
      if (cancelled) return;
      const rawDt = Math.min(0.05, Math.max(0.008, (now - lastTime) / 1000));
      lastTime = now;

      if (!pausedRef.current) {
        engine.step(rawDt);
      }

      renderSimulationFrame(ctx, engine, width, height);

      // Throttle React HUD state updates to ~4 Hz so React never slows physics
      hudSyncAccumulator += rawDt;
      if (hudSyncAccumulator >= 0.25) {
        hudSyncAccumulator = 0;
        setMetrics(engine.getMetrics());
      }

      timerId = setTimeout(() => {
        if (!cancelled) {
          rafId = requestAnimationFrame(tick);
        }
      }, 16);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (timerId !== null) clearTimeout(timerId);
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#090b10] select-none">
      {/* Full-Viewport Autonomous Ragdoll Stunt Arena */}
      <canvas
        ref={canvasRef}
        data-testid="stunt-canvas"
        onClick={(e) => {
          // Clicking directly on the stage drops a bonus stunt prop or triggers a stunt!
          const eng = engineRef.current;
          if (!eng) return;
          if (e.shiftKey) {
            eng.spawnBonusProp();
          } else {
            eng.triggerHeroSignatureStunt();
          }
          syncMetricsNow();
        }}
        className="block w-full h-full cursor-pointer"
      />

      {/* Top Non-Obstructive Telemetry HUD */}
      <PerimeterHud
        metrics={metrics}
        soundEnabled={params.soundEnabled}
        drawerOpen={drawerOpen}
        onToggleSound={() =>
          handleUpdateParams({ soundEnabled: !params.soundEnabled })
        }
        onToggleDrawer={() => setDrawerOpen((o) => !o)}
      />

      {/* Optional Collapsible Director's Physics & Prop Drawer */}
      <TuningDrawer
        open={drawerOpen}
        params={params}
        metrics={metrics}
        onClose={() => setDrawerOpen(false)}
        onUpdateParams={handleUpdateParams}
        onSelectBiome={(biomeId) => handleNewTake(undefined, biomeId)}
        onApplySeed={(seed) => handleNewTake(seed)}
        onSpawnSpecificProp={(kind) => handleDropProp(kind)}
        onSpawnEnemyWave={() => {
          engineRef.current?.spawnEnemy();
          syncMetricsNow();
        }}
      />

      {/* Paused Status Card (Only visible when user pauses simulation) */}
      {paused && (
        <div className="fixed inset-0 z-10 pointer-events-none flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-label="Пауза съёмки"
            className="pointer-events-auto w-full max-w-md rounded-xl border border-amber-500/40 p-5 shadow-2xl space-y-4"
            style={{ backgroundColor: 'rgba(10, 12, 18, 0.95)' }}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="font-display text-xl font-bold text-amber-400 uppercase tracking-wide">
                  Стоп-кадр · Дубль #{metrics.takeNumber}
                </h2>
                <p className="text-xs text-slate-400">{metrics.biomeName}</p>
              </div>
              <span className="font-mono-tabular text-xs text-slate-400">
                {metrics.seed}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">Трюки</div>
                <div className="font-display text-lg font-bold text-white tabular-nums">
                  {metrics.stuntsCount}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">Реквизит</div>
                <div className="font-display text-lg font-bold text-orange-400 tabular-nums">
                  {metrics.propsSmashed}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">Нокауты</div>
                <div className="font-display text-lg font-bold text-rose-400 tabular-nums">
                  {metrics.knockouts}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setPaused(false)}
                className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Продолжить дубль
              </button>
              <button
                type="button"
                onClick={() => handleNewTake()}
                className="flex-1 py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Снять новую сцену
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Non-Obstructive Simulation Control Dock */}
      <ControlDock
        paused={paused}
        timeScale={params.timeScale}
        cameraMode={params.cameraMode}
        onNewTake={() => handleNewTake()}
        onTriggerStunt={handleTriggerStunt}
        onDropProp={() => handleDropProp()}
        onTogglePause={() => setPaused((p) => !p)}
        onChangeTimeScale={(scale) => handleUpdateParams({ timeScale: scale })}
        onCycleCamera={handleCycleCamera}
      />
    </main>
  );
}
