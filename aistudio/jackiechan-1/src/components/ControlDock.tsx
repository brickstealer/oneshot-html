import React from 'react';
import { ArenaThemeId, CameraMode, SimulationStats } from '../sim/types';

interface ControlDockProps {
  stats: SimulationStats;
  collapsed: boolean;
  onToggleCollapse: () => void;
  paused: boolean;
  onTogglePause: () => void;
  muted: boolean;
  onToggleMute: () => void;
  timeScale: number;
  onChangeTimeScale: (scale: number) => void;
  cameraMode: CameraMode;
  onChangeCameraMode: (mode: CameraMode) => void;
  selectedTheme: ArenaThemeId | 'random';
  onChangeTheme: (theme: ArenaThemeId | 'random') => void;
  enemyCount: number;
  onChangeEnemyCount: (count: number) => void;
  onNewProceduralScene: () => void;
  onTriggerStunt: () => void;
  onTriggerSpinningCombo: () => void;
  onReplenishProps: () => void;
}

const THEME_OPTIONS: { value: ArenaThemeId | 'random'; label: string }[] = [
  { value: 'random', label: 'Случайная' },
  { value: 'teahouse', label: 'Чайный дом' },
  { value: 'rooftop', label: 'Крыша' },
  { value: 'warehouse', label: 'Склад' },
  { value: 'courtyard', label: 'Храм' },
];

const CAMERA_OPTIONS: { value: CameraMode; label: string }[] = [
  { value: 'auto_director', label: 'Авто-режиссёр' },
  { value: 'close_stunt', label: 'Крупный план' },
  { value: 'orbit', label: 'Орбита 360°' },
  { value: 'wide_cinema', label: 'Общий план' },
];

const SPEED_OPTIONS: { value: number; label: string }[] = [
  { value: 0.25, label: '0.25x' },
  { value: 0.5, label: '0.5x' },
  { value: 1.0, label: '1.0x' },
  { value: 1.5, label: '1.5x' },
];

const ENEMY_OPTIONS = [3, 5, 8];

export const ControlDock: React.FC<ControlDockProps> = ({
  stats,
  collapsed,
  onToggleCollapse,
  paused,
  onTogglePause,
  muted,
  onToggleMute,
  timeScale,
  onChangeTimeScale,
  cameraMode,
  onChangeCameraMode,
  selectedTheme,
  onChangeTheme,
  enemyCount,
  onChangeEnemyCount,
  onNewProceduralScene,
  onTriggerStunt,
  onTriggerSpinningCombo,
  onReplenishProps,
}) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-between p-3 sm:p-5">
      {/* Top Perimeter Row: Left Live Stunt Telemetry + Right Utility Buttons */}
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        {/* Top-Left World-Matched Hong Kong Cinema Slate */}
        <div
          className="pointer-events-auto rounded-xl px-3 py-2 sm:px-3.5 sm:py-2.5 border border-amber-500/25 shadow-2xl max-w-[calc(100vw-142px)] sm:max-w-md"
          style={{ backgroundColor: 'rgba(12, 10, 9, 0.88)' }}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-amber-400/90 font-medium tracking-wide">
            <span className="whitespace-nowrap shrink-0">АВТО-СИМУЛЯЦИЯ 3D</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-stone-300 truncate" data-testid="seed-code">
              {stats.seed}
            </span>
          </div>

          <h1 className="text-xs sm:text-base font-bold text-stone-100 leading-tight mt-0.5 truncate">
            {stats.themeNameRu}
          </h1>

          {/* Live Strike / Stunt Action Callout */}
          <p
            className="text-[11px] sm:text-xs text-amber-300 font-medium mt-0.5 sm:mt-1 truncate"
            data-testid="active-stunt-banner"
          >
            {stats.activeStuntBanner}
          </p>

          <p className="text-[10px] text-stone-400 truncate mt-0.5" data-testid="active-combo-style">
            Связка: {stats.activeComboNameRu}
          </p>

          {/* Primary Tabular Numerals Readouts */}
          <div className="flex items-center gap-3 sm:gap-6 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-stone-800">
            <div>
              <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-stone-400">Трюки</div>
              <div
                className="text-sm sm:text-lg font-bold font-mono tabular-nums text-amber-400 leading-none mt-0.5"
                data-testid="stat-stunts"
              >
                {Math.round(stats.stuntsPerformed)}
              </div>
            </div>

            <div>
              <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-stone-400">Крушения</div>
              <div
                className="text-sm sm:text-lg font-bold font-mono tabular-nums text-orange-400 leading-none mt-0.5"
                data-testid="stat-props-broken"
              >
                {Math.round(stats.propsBroken)}
              </div>
            </div>

            <div>
              <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-stone-400">Нокауты</div>
              <div
                className="text-sm sm:text-lg font-bold font-mono tabular-nums text-red-400 leading-none mt-0.5"
                data-testid="stat-kos"
              >
                {Math.round(stats.knockouts)}
              </div>
            </div>

            <div className="hidden sm:block">
              <div className="text-[10px] uppercase tracking-wider text-stone-400">Комбо</div>
              <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-stone-100 leading-none mt-0.5">
                {Math.round(stats.comboCount)}x
              </div>
            </div>
          </div>
        </div>

        {/* Top-Right Compact Square Utility Icon Buttons */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Сгенерировать новую сцену"
            title="Новая сцена [R]"
            onClick={(e) => {
              e.currentTarget.blur();
              onNewProceduralScene();
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-amber-500/30 flex items-center justify-center text-stone-200 hover:text-amber-400 hover:border-amber-400 transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(12, 10, 9, 0.88)' }}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 fill-none stroke-current" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            title="Звук [M]"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-amber-500/30 flex items-center justify-center text-stone-200 hover:text-amber-400 hover:border-amber-400 transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(12, 10, 9, 0.88)' }}
          >
            {muted ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 fill-none stroke-current" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 fill-none stroke-current" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={paused ? 'Продолжить симуляцию' : 'Пауза симуляции'}
            title="Пауза [P]"
            onClick={(e) => {
              e.currentTarget.blur();
              onTogglePause();
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-amber-500/30 flex items-center justify-center text-stone-200 hover:text-amber-400 hover:border-amber-400 transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(12, 10, 9, 0.88)' }}
          >
            {paused ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 fill-current">
                <polygon points="6 4 20 12 6 20 6 4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 fill-current">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Unified Collapsible Bottom Control Dock (Zero Viewport Center Occlusion) */}
      <div className="flex flex-col items-center w-full">
        {/* Collapse / Expand Tab */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className="pointer-events-auto px-3.5 py-1 rounded-t-lg border border-b-0 border-amber-500/30 text-xs font-medium text-stone-300 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          style={{ backgroundColor: 'rgba(12, 10, 9, 0.9)' }}
        >
          {collapsed ? '▴ Пульт режиссёра [H]' : '▾ Скрыть пульт [H]'}
        </button>

        {!collapsed && (
          <div
            className="pointer-events-auto w-full max-w-[940px] rounded-xl border border-amber-500/30 px-2.5 py-2 sm:px-4 sm:py-3 shadow-2xl transition-transform duration-150"
            style={{ backgroundColor: 'rgba(12, 10, 9, 0.92)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2.5">
              {/* Primary Action Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={onNewProceduralScene}
                  className="px-2.5 py-1.5 sm:px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-[11px] sm:text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Новая сцена
                </button>

                <button
                  type="button"
                  onClick={onTriggerSpinningCombo}
                  className="px-2.5 py-1.5 sm:px-3 rounded-lg bg-orange-600 hover:bg-orange-500 text-stone-100 font-semibold text-[11px] sm:text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Вертушка 540°
                </button>

                <button
                  type="button"
                  onClick={onTriggerStunt}
                  className="px-2.5 py-1.5 sm:px-3 rounded-lg bg-red-700 hover:bg-red-600 text-stone-100 font-semibold text-[11px] sm:text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Коронный трюк
                </button>

                <button
                  type="button"
                  onClick={onReplenishProps}
                  className="px-2 py-1.5 sm:px-2.5 rounded-lg border border-stone-700 hover:border-amber-500/50 text-stone-200 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  + Реквизит ({stats.remainingProps})
                </button>
              </div>

              {/* Segmented Arena Theme Selector */}
              <div className="flex items-center gap-0.5 sm:gap-1 bg-stone-900/90 p-1 rounded-lg border border-stone-800 flex-wrap">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChangeTheme(opt.value)}
                    className={`px-1.5 py-1 sm:px-2 rounded-md text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedTheme === opt.value
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Camera Mode & Time Scale & Enemy Count Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap w-full sm:w-auto justify-between sm:justify-start">
                {/* Camera Selector */}
                <div className="flex items-center gap-0.5 sm:gap-1 bg-stone-900/90 p-1 rounded-lg border border-stone-800 flex-wrap">
                  {CAMERA_OPTIONS.map((cam) => (
                    <button
                      key={cam.value}
                      type="button"
                      onClick={() => onChangeCameraMode(cam.value)}
                      className={`px-1.5 py-1 sm:px-2 rounded-md text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        cameraMode === cam.value
                          ? 'bg-stone-800 text-amber-300'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {cam.label}
                    </button>
                  ))}
                </div>

                {/* Speed / Slow-Mo Selector */}
                <div
                  className="flex items-center gap-0.5 sm:gap-1 bg-stone-900/90 p-1 rounded-lg border border-stone-800"
                  role="group"
                  aria-label="Скорость симуляции"
                >
                  {SPEED_OPTIONS.map((spd) => (
                    <button
                      key={spd.value}
                      type="button"
                      onClick={() => onChangeTimeScale(spd.value)}
                      className={`px-1.5 py-1 sm:px-2 rounded-md text-[11px] sm:text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        Math.abs(timeScale - spd.value) < 0.01
                          ? 'bg-amber-500 text-stone-950 font-bold'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {spd.label}
                    </button>
                  ))}
                </div>

                {/* Fighter Density Selector */}
                <div
                  className="hidden md:flex items-center gap-1 bg-stone-900/90 p-1 rounded-lg border border-stone-800"
                  role="group"
                  aria-label="Количество врагов"
                >
                  <span className="text-[11px] text-stone-400 px-1.5 whitespace-nowrap shrink-0">
                    Враги:
                  </span>
                  {ENEMY_OPTIONS.map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => onChangeEnemyCount(cnt)}
                      className={`px-2 py-1 rounded-md text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        enemyCount === cnt
                          ? 'bg-stone-800 text-amber-300'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
