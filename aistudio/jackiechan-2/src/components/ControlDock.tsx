import React from 'react';
import {
  Clapperboard,
  Flame,
  PackagePlus,
  Pause,
  Play,
  Camera,
} from 'lucide-react';
import { SimulationParams } from '../sim/types';

interface ControlDockProps {
  paused: boolean;
  timeScale: number;
  cameraMode: SimulationParams['cameraMode'];
  onNewTake: () => void;
  onTriggerStunt: () => void;
  onDropProp: () => void;
  onTogglePause: () => void;
  onChangeTimeScale: (scale: number) => void;
  onCycleCamera: () => void;
}

const SPEED_OPTIONS = [
  { label: '0.25x', value: 0.25 },
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1.0 },
  { label: '1.5x', value: 1.5 },
];

const CAMERA_LABELS: Record<SimulationParams['cameraMode'], string> = {
  cinematic: 'Камера: Кино',
  wide: 'Камера: Общий',
  hero_closeup: 'Камера: Герой',
};

export const ControlDock: React.FC<ControlDockProps> = ({
  paused,
  timeScale,
  cameraMode,
  onNewTake,
  onTriggerStunt,
  onDropProp,
  onTogglePause,
  onChangeTimeScale,
  onCycleCamera,
}) => {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 pointer-events-none p-2 sm:px-5 sm:pb-3.5 flex items-center justify-center">
      <div
        className="pointer-events-auto flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-2.5 py-2 rounded-xl border border-slate-800 shadow-2xl max-w-full"
        style={{ backgroundColor: 'rgba(10, 12, 18, 0.94)' }}
      >
        {/* Primary Action: Generate Brand-New Procedural Scene ("Новый дубль") */}
        <button
          type="button"
          data-start="true"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onNewTake();
          }}
          className="h-10 px-2.5 sm:px-3.5 bg-amber-500 hover:bg-amber-400 active:translate-y-px text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Clapperboard className="w-4 h-4 shrink-0" />
          <span>Новый дубль</span>
        </button>

        {/* Trigger Immediate Jackie Chan Stunt */}
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onTriggerStunt();
          }}
          className="h-10 px-2.5 sm:px-3 bg-slate-800/90 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Flame className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Коронный трюк</span>
        </button>

        {/* Drop Interactive Prop into the Fight */}
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onDropProp();
          }}
          aria-label="Сбросить реквизит"
          className="h-10 px-2.5 sm:px-3 bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <PackagePlus className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="hidden sm:inline">Сбросить реквизит</span>
        </button>

        <div className="h-6 w-px bg-slate-800 hidden sm:block shrink-0" />

        {/* Pause / Resume Toggle */}
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onTogglePause();
          }}
          aria-label={paused ? 'Продолжить симуляцию' : 'Пауза симуляции'}
          className={`h-10 px-2.5 sm:px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            paused
              ? 'bg-emerald-500 text-slate-950 border-emerald-400'
              : 'bg-slate-900 text-slate-200 border-slate-800 hover:border-slate-700'
          }`}
        >
          {paused ? (
            <>
              <Play className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>Мотор!</span>
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">Пауза</span>
            </>
          )}
        </button>

        {/* Segmented Speed Control */}
        <div
          className="hidden sm:flex items-center p-1 rounded-lg border border-slate-800 shrink-0"
          style={{ backgroundColor: '#121620' }}
          role="group"
          aria-label="Скорость симуляции"
        >
          {SPEED_OPTIONS.map((opt) => {
            const active = Math.abs(timeScale - opt.value) < 0.02;
            return (
              <button
                key={opt.label}
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onChangeTimeScale(opt.value);
                }}
                className={`px-2.5 py-1 text-xs font-mono-tabular font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Camera Framing Cycle */}
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onCycleCamera();
          }}
          className="hidden lg:flex h-10 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium rounded-lg items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Camera className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{CAMERA_LABELS[cameraMode]}</span>
        </button>
      </div>
    </div>
  );
};
