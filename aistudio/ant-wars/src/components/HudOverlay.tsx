import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  AtmospherePreset,
  CameraMode,
  HudSnapshot,
  SimulationConfig,
} from '../sim/types';

interface HudOverlayProps {
  config: SimulationConfig;
  hud: HudSnapshot;
  controlsCollapsed: boolean;
  settingsOpen: boolean;
  onToggleCollapse: () => void;
  onToggleSettings: () => void;
  onUpdateConfig: (patch: Partial<SimulationConfig>) => void;
  onRegenerateWorld: () => void;
}

const CAMERA_MODES: { id: CameraMode; label: string; shortLabel: string }[] = [
  { id: 'auto', label: 'Автополёт', shortLabel: 'Авто' },
  { id: 'panorama', label: 'Панорама', shortLabel: 'Обзор' },
  { id: 'trenches', label: 'Окопы', shortLabel: 'Окопы' },
  { id: 'tunnels', label: 'Туннели', shortLabel: 'Туннели' },
  { id: 'battle', label: 'Схватка', shortLabel: 'Бой' },
  { id: 'free', label: 'Свободно', shortLabel: 'Своб.' },
];

const ATMOSPHERES: { id: AtmospherePreset; label: string }[] = [
  { id: 'sunset', label: 'Закат' },
  { id: 'mist', label: 'Туман' },
  { id: 'overcast', label: 'Пасмурно' },
];

export const HudOverlay: React.FC<HudOverlayProps> = ({
  config,
  hud,
  controlsCollapsed,
  settingsOpen,
  onToggleCollapse,
  onToggleSettings,
  onUpdateConfig,
  onRegenerateWorld,
}) => {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between">
      {/* Subtle top readability scrim + unboxed editorial header & live counts */}
      <header
        className="w-full px-4 pt-3 pb-6 sm:px-6 sm:pt-4"
        style={{
          background:
            'linear-gradient(180deg, rgba(14,13,11,0.72) 0%, rgba(14,13,11,0.32) 55%, rgba(14,13,11,0) 100%)',
        }}
      >
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-lg font-semibold tracking-wide text-[#f5efe4] sm:text-xl whitespace-nowrap">
              Муравьиный Фронт
            </h1>
            <span
              className="text-xs text-[#d8cfc0] truncate max-w-[58vw] sm:max-w-none"
              data-testid="shot-label"
            >
              {hud.shotLabel}
            </span>
          </div>

          {/* Clean unboxed tabular colony telemetry separated by typographic dots */}
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#dfd6c6] font-mono-tabular"
            aria-label="Сводка фронта"
          >
            <span className="text-[#ef7b5b]" data-testid="red-count">
              Рыжие {hud.redAlive}
            </span>
            <span aria-hidden="true" className="text-[#968c7c]">
              ·
            </span>
            <span className="text-[#e6be72]" data-testid="black-count">
              Чёрные {hud.blackAlive}
            </span>
            <span aria-hidden="true" className="hidden sm:inline text-[#968c7c]">
              ·
            </span>
            <span className="hidden sm:inline text-[#cfc5b4]">
              Укрепления {hud.redBuilt}/{hud.blackBuilt}
            </span>
            <span aria-hidden="true" className="hidden md:inline text-[#968c7c]">
              ·
            </span>
            <span className="hidden md:inline text-[#b5aa98]" data-testid="world-seed">
              Мир #{hud.seed}
            </span>
          </div>
        </div>
      </header>

      {/* Bottom-center unified collapsible control dock (zero side panels, unobstructed center) */}
      <div className="pointer-events-none flex w-full flex-col items-center px-3 pb-3 sm:pb-5">
        {/* Collapse / Expand Cinema Mode Tab */}
        <div className="pointer-events-auto mb-1.5 flex justify-center">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!controlsCollapsed}
            aria-label={controlsCollapsed ? 'Показать управление' : 'Скрыть управление'}
            className="flex items-center gap-1.5 rounded-t-lg rounded-b-md border border-[#f2ece1]/15 bg-[#151310]/90 px-3 py-1.5 text-xs font-medium text-[#e6dfd1] transition-colors hover:bg-[#23201b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d99b43] whitespace-nowrap"
          >
            {controlsCollapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 text-[#d99b43]" aria-hidden="true" />
                <span>Управление</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 text-[#d99b43]" aria-hidden="true" />
                <span>Скрыть</span>
              </>
            )}
          </button>
        </div>

        {/* Dock Container */}
        {!controlsCollapsed && (
          <section
            aria-label="Панель управления симуляцией"
            className="pointer-events-auto w-full max-w-[820px] rounded-xl border border-[#f2ece1]/14 bg-[#14120f]/92 shadow-2xl"
          >
            {/* Expandable Simulation Parameters Drawer */}
            {settingsOpen && (
              <div
                data-testid="parameters-drawer"
                className="border-b border-[#f2ece1]/12 px-4 py-3.5 sm:px-5 sm:py-4"
              >
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Simulation Time Scale */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-timescale" className="text-[#d6ccbc]">
                        Скорость времени
                      </label>
                      <span className="font-mono-tabular text-[#f2ece1]">
                        {config.timeScale.toFixed(2)}×
                      </span>
                    </div>
                    <input
                      id="slider-timescale"
                      type="range"
                      min={0.25}
                      max={3.0}
                      step={0.25}
                      value={config.timeScale}
                      onChange={(e) => onUpdateConfig({ timeScale: Number(e.target.value) })}
                      className="sim-slider"
                    />
                  </div>

                  {/* Ants per faction */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-ants" className="text-[#d6ccbc]">
                        Муравьёв в фракции
                      </label>
                      <span className="font-mono-tabular text-[#f2ece1]">
                        {config.antsPerFaction}
                      </span>
                    </div>
                    <input
                      id="slider-ants"
                      type="range"
                      min={40}
                      max={220}
                      step={10}
                      value={config.antsPerFaction}
                      onChange={(e) => onUpdateConfig({ antsPerFaction: Number(e.target.value) })}
                      className="sim-slider"
                    />
                  </div>

                  {/* Battle Intensity */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-battle" className="text-[#d6ccbc]">
                        Накал сражений
                      </label>
                      <span className="font-mono-tabular text-[#f2ece1]">
                        {Math.round(config.battleIntensity * 100)}%
                      </span>
                    </div>
                    <input
                      id="slider-battle"
                      type="range"
                      min={0.3}
                      max={1.8}
                      step={0.1}
                      value={config.battleIntensity}
                      onChange={(e) => onUpdateConfig({ battleIntensity: Number(e.target.value) })}
                      className="sim-slider"
                    />
                  </div>

                  {/* Build Speed */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-build" className="text-[#d6ccbc]">
                        Темп стройки
                      </label>
                      <span className="font-mono-tabular text-[#f2ece1]">
                        {config.buildSpeed.toFixed(1)}×
                      </span>
                    </div>
                    <input
                      id="slider-build"
                      type="range"
                      min={0.3}
                      max={2.0}
                      step={0.1}
                      value={config.buildSpeed}
                      onChange={(e) => onUpdateConfig({ buildSpeed: Number(e.target.value) })}
                      className="sim-slider"
                    />
                  </div>

                  {/* Camera Flight Speed */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-camspeed" className="text-[#d6ccbc]">
                        Скорость полёта
                      </label>
                      <span className="font-mono-tabular text-[#f2ece1]">
                        {config.cameraSpeed.toFixed(1)}×
                      </span>
                    </div>
                    <input
                      id="slider-camspeed"
                      type="range"
                      min={0.4}
                      max={2.2}
                      step={0.1}
                      value={config.cameraSpeed}
                      onChange={(e) => onUpdateConfig({ cameraSpeed: Number(e.target.value) })}
                      className="sim-slider"
                    />
                  </div>

                  {/* Atmosphere & Auto-dive Toggle */}
                  <div className="flex flex-col justify-between gap-2">
                    <div className="flex items-center gap-1" role="group" aria-label="Атмосфера">
                      {ATMOSPHERES.map((a) => {
                        const active = config.atmosphere === a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => onUpdateConfig({ atmosphere: a.id })}
                            aria-pressed={active}
                            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#d99b43] ${
                              active
                                ? 'bg-[#d99b43] text-[#14120f]'
                                : 'bg-[#221f1a] text-[#d6ccbc] hover:bg-[#2d2922]'
                            }`}
                          >
                            {a.label}
                          </button>
                        );
                      })}
                    </div>

                    <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-[#d6ccbc]">
                      <span>Залетать в туннели (Авто)</span>
                      <input
                        type="checkbox"
                        checked={config.autoDiveTunnels}
                        onChange={(e) => onUpdateConfig({ autoDiveTunnels: e.target.checked })}
                        className="h-4 w-4 accent-[#d99b43] cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Primary Single-Row Compact Control Bar */}
            <div className="flex flex-col gap-1.5 p-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-3 sm:py-2.5">
              {/* Camera Director Modes (Fits cleanly on 390px mobile without clipping) */}
              <div
                className="grid grid-cols-6 gap-0.5 sm:flex sm:items-center sm:gap-1"
                role="group"
                aria-label="Режимы камеры"
              >
                {CAMERA_MODES.map((m) => {
                  const active = config.cameraMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onUpdateConfig({ cameraMode: m.id })}
                      aria-label={m.label}
                      aria-pressed={active}
                      className={`min-h-[36px] sm:min-h-[38px] shrink-0 rounded-lg px-1 py-1 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap text-center focus-visible:outline-2 focus-visible:outline-[#d99b43] sm:px-3 ${
                        active
                          ? 'bg-[#d99b43] text-[#14120f] font-semibold'
                          : 'text-[#dfd7c8] hover:bg-[#26221c]'
                      }`}
                    >
                      <span className="sm:hidden">{m.shortLabel}</span>
                      <span className="hidden sm:inline">{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Action Buttons (Pause, Parameters, New Random World) */}
              <div className="grid grid-cols-3 gap-1.5 border-t border-[#f2ece1]/10 pt-1.5 sm:flex sm:items-center sm:justify-end sm:border-t-0 sm:pt-0 shrink-0">
                <button
                  type="button"
                  onClick={() => onUpdateConfig({ paused: !config.paused })}
                  aria-label={config.paused ? 'Продолжить симуляцию' : 'Пауза симуляции'}
                  aria-pressed={config.paused}
                  className="flex min-h-[36px] sm:min-h-[38px] items-center justify-center gap-1.5 rounded-lg bg-[#221f1a] px-2.5 py-1 text-xs font-medium text-[#f2ece1] transition-colors hover:bg-[#2f2b24] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#d99b43]"
                >
                  {config.paused ? (
                    <>
                      <Play className="h-3.5 w-3.5 text-[#d99b43]" aria-hidden="true" />
                      <span>Старт</span>
                    </>
                  ) : (
                    <>
                      <Pause className="h-3.5 w-3.5 text-[#d99b43]" aria-hidden="true" />
                      <span>Пауза</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onToggleSettings}
                  aria-expanded={settingsOpen}
                  aria-label="Параметры симуляции"
                  className={`flex min-h-[36px] sm:min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#d99b43] ${
                    settingsOpen
                      ? 'bg-[#332c22] text-[#f5efe4] border border-[#d99b43]/50'
                      : 'bg-[#221f1a] text-[#f2ece1] hover:bg-[#2f2b24]'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-[#d99b43]" aria-hidden="true" />
                  <span>Параметры</span>
                </button>

                <button
                  type="button"
                  onClick={onRegenerateWorld}
                  aria-label="Сгенерировать новый случайный мир"
                  className="flex min-h-[36px] sm:min-h-[38px] items-center justify-center gap-1.5 rounded-lg bg-[#221f1a] px-2.5 py-1 text-xs font-medium text-[#f2ece1] transition-colors hover:bg-[#2f2b24] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#d99b43]"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-[#d99b43]" aria-hidden="true" />
                  <span>Новый мир</span>
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
