import React from 'react';
import { Volume2, VolumeX, SlidersHorizontal, Sparkles } from 'lucide-react';
import { SimulationMetrics } from '../sim/types';

interface PerimeterHudProps {
  metrics: SimulationMetrics;
  soundEnabled: boolean;
  drawerOpen: boolean;
  onToggleSound: () => void;
  onToggleDrawer: () => void;
}

export const PerimeterHud: React.FC<PerimeterHudProps> = ({
  metrics,
  soundEnabled,
  drawerOpen,
  onToggleSound,
  onToggleDrawer,
}) => {
  const hpPercent = Math.max(
    0,
    Math.min(100, Math.round((metrics.heroHp / metrics.heroMaxHp) * 100))
  );

  return (
    <div className="fixed inset-x-0 top-0 z-20 pointer-events-none p-2.5 sm:px-5 sm:py-3.5 flex items-start justify-between gap-3">
      {/* Top-Left Cluster: Procedural Scene Identity, Master Chan Vitality & Live Stunt Ticker */}
      <div
        className="pointer-events-auto flex flex-col gap-1.5 px-3.5 py-2.5 rounded-lg border border-amber-500/25 max-w-[calc(100vw-110px)] sm:max-w-none"
        style={{ backgroundColor: 'rgba(10, 12, 18, 0.92)' }}
      >
        <div className="flex items-center gap-2 text-xs text-slate-300 whitespace-nowrap overflow-hidden">
          <span className="font-display font-bold tracking-wider text-amber-400 uppercase shrink-0">
            ДУБЛЬ #{metrics.takeNumber}
          </span>
          <span aria-hidden="true" className="text-slate-600 shrink-0">
            ·
          </span>
          <span className="font-semibold text-white truncate max-w-[150px] sm:max-w-[260px]">
            {metrics.biomeName}
          </span>
          <span
            aria-hidden="true"
            className="hidden md:inline text-slate-600 shrink-0"
          >
            ·
          </span>
          <span className="hidden md:inline font-mono-tabular text-[11px] text-slate-400 shrink-0">
            СИД: {metrics.seed}
          </span>
        </div>

        {/* Hero Vitality Bar + Current Martial Arts Stunt Readout */}
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-bold tracking-wider text-amber-400/90 uppercase whitespace-nowrap">
              ЧАН
            </span>
            <div className="w-14 sm:w-28 h-2 bg-slate-800 rounded-sm overflow-hidden border border-slate-700">
              <div
                className="h-full bg-amber-400 origin-left"
                style={{ transform: `scaleX(${hpPercent / 100})` }}
              />
            </div>
            <span className="font-mono-tabular text-[11px] text-slate-300 whitespace-nowrap">
              {hpPercent}%
            </span>
          </div>

          <span aria-hidden="true" className="hidden sm:inline text-slate-600">
            /
          </span>
          <span className="hidden sm:inline text-xs text-emerald-400 font-medium truncate max-w-[210px] whitespace-nowrap">
            {metrics.currentActionLabel}
          </span>
          <span className="sm:hidden font-mono-tabular text-[11px] text-amber-300 whitespace-nowrap truncate">
            · Очки: {metrics.score} · Трюки: {metrics.stuntsCount}
          </span>
        </div>

        {/* Integrated Latest Stunt Event Line (Never overflows viewport) */}
        {metrics.recentEvents.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5 pt-1 border-t border-slate-800/80 text-[11px] text-slate-300 whitespace-nowrap overflow-hidden">
            <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="font-semibold text-amber-300 shrink-0">
              {metrics.recentEvents[0].title}
            </span>
            <span aria-hidden="true" className="text-slate-600 shrink-0">
              —
            </span>
            <span className="text-slate-400 truncate max-w-[280px]">
              {metrics.recentEvents[0].detail}
            </span>
          </div>
        )}
      </div>

      {/* Top-Right Cluster: Live Stunt Score, Props Smashed & Utility Buttons */}
      <div className="pointer-events-auto flex items-center gap-2 shrink-0">
        <div
          className="hidden sm:flex items-center gap-3.5 px-3.5 py-2 rounded-lg border border-slate-800"
          style={{ backgroundColor: 'rgba(10, 12, 18, 0.92)' }}
        >
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase whitespace-nowrap">
              ОЧКИ ЗРЕЛИЩНОСТИ
            </span>
            <span
              data-testid="stunt-score"
              className="font-display text-lg font-bold text-amber-400 tabular-nums leading-tight"
            >
              {metrics.score}
            </span>
          </div>

          <div className="h-6 w-px bg-slate-800" />

          <div className="flex items-center gap-2.5 text-xs text-slate-300 tabular-nums whitespace-nowrap">
            <div>
              <span className="text-slate-400">Трюки: </span>
              <span className="font-mono-tabular font-bold text-white">
                {metrics.stuntsCount}
              </span>
            </div>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <div>
              <span className="text-slate-400">Реквизит: </span>
              <span className="font-mono-tabular font-bold text-orange-400">
                {metrics.propsSmashed}
              </span>
            </div>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <div>
              <span className="text-slate-400">Нокауты: </span>
              <span className="font-mono-tabular font-bold text-rose-400">
                {metrics.knockouts}
              </span>
            </div>
          </div>
        </div>

        {/* Utility Icon Buttons */}
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleSound();
          }}
          aria-label={soundEnabled ? 'Выключить звук' : 'Включить звук'}
          title={soundEnabled ? 'Звук включён [M]' : 'Звук выключен [M]'}
          className="h-10 w-10 flex items-center justify-center rounded-lg border border-slate-800 text-slate-200 hover:text-amber-400 hover:border-amber-500/40 transition-colors cursor-pointer shrink-0"
          style={{ backgroundColor: 'rgba(10, 12, 18, 0.92)' }}
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4" />
          ) : (
            <VolumeX className="w-4 h-4 text-slate-500" />
          )}
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleDrawer();
          }}
          aria-label="Параметры симуляции и лог трюков"
          aria-expanded={drawerOpen}
          className={`h-10 px-3 flex items-center gap-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            drawerOpen
              ? 'border-amber-400 text-slate-950 bg-amber-400'
              : 'border-slate-800 text-slate-200 hover:border-amber-500/40 hover:text-amber-400'
          }`}
          style={
            drawerOpen ? undefined : { backgroundColor: 'rgba(10, 12, 18, 0.92)' }
          }
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden md:inline">Режиссёрский пульт</span>
        </button>
      </div>
    </div>
  );
};
