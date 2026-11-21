'use client';

import React, { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  CloudFog,
  CloudRain,
  CloudSnow,
  Compass,
  Gauge,
  Lightbulb,
  Moon,
  Mountain,
  Pause,
  Play,
  Sliders,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Train,
  Trees,
  Volume2,
  VolumeX,
  Building2,
  Home,
  Megaphone,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  BiomeMode,
  CameraMode,
  clampFreeCamDistance,
  formatTelemetry,
  MAX_FREE_CAM_DISTANCE,
  MIN_FREE_CAM_DISTANCE,
  SimulationConfig,
  TimeOfDay,
  WeatherType,
} from '@/lib/train-sim';
import { TelemetrySnapshot } from './TrainCanvas';

interface ControlOverlayProps {
  config: SimulationConfig;
  telemetry: TelemetrySnapshot;
  onChangeConfig: (updater: (prev: SimulationConfig) => SimulationConfig) => void;
  onTriggerHorn: () => void;
}

type DockTab = 'drive' | 'world' | 'train';

export default function ControlOverlay({
  config,
  telemetry,
  onChangeConfig,
  onTriggerHorn,
}: ControlOverlayProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<DockTab>('drive');

  const formatted = formatTelemetry(
    telemetry.speedKmh,
    telemetry.distanceMeters,
    telemetry.altitudeMeters
  );

  const isPaused = config.targetSpeedKmh === 0;

  const cameraModes: { id: CameraMode; label: string }[] = [
    { id: 'cinematic', label: 'Кино' },
    { id: 'free', label: 'Свободная' },
    { id: 'chase', label: 'Погоня' },
    { id: 'cabin', label: 'Кабина' },
    { id: 'side', label: 'Профиль' },
    { id: 'drone', label: 'Дрон' },
  ];

  const biomeModes: { id: BiomeMode; label: string; icon: React.ReactNode }[] = [
    { id: 'auto', label: 'Авто-маршрут', icon: <Compass className="w-3.5 h-3.5" /> },
    { id: 'city', label: 'Мегаполис', icon: <Building2 className="w-3.5 h-3.5" /> },
    { id: 'village', label: 'Деревня', icon: <Home className="w-3.5 h-3.5" /> },
    { id: 'forest', label: 'Тайга', icon: <Trees className="w-3.5 h-3.5" /> },
    { id: 'mountain', label: 'Серпантин', icon: <Mountain className="w-3.5 h-3.5" /> },
  ];

  const timeModes: { id: TimeOfDay; label: string; icon: React.ReactNode }[] = [
    { id: 'dawn', label: 'Рассвет', icon: <Sunrise className="w-3.5 h-3.5" /> },
    { id: 'day', label: 'День', icon: <Sun className="w-3.5 h-3.5" /> },
    { id: 'sunset', label: 'Закат', icon: <Sunset className="w-3.5 h-3.5" /> },
    { id: 'night', label: 'Ночь', icon: <Moon className="w-3.5 h-3.5" /> },
  ];

  const weatherModes: { id: WeatherType; label: string; icon: React.ReactNode }[] = [
    { id: 'clear', label: 'Ясно', icon: <Sun className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'fog', label: 'Туман', icon: <CloudFog className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'rain', label: 'Дождь', icon: <CloudRain className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'snow', label: 'Снег', icon: <CloudSnow className="w-3.5 h-3.5 shrink-0" /> },
  ];

  return (
    <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-between p-2.5 sm:p-5">
      {/* Top Minimal Telemetry & Biome Header (Compact, zero central viewport occlusion) */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between gap-2 sm:gap-6 px-3.5 py-2 rounded-2xl bg-slate-950/90 border border-slate-800/80 shadow-lg pointer-events-auto">
        {/* Left: Brand & Active Biome Context */}
        <div className="min-w-0 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <span className="font-display font-bold text-xs sm:text-base tracking-tight text-white whitespace-nowrap">
              TransBiome Express
            </span>
            <span aria-hidden="true" className="text-slate-600 hidden sm:inline">
              ·
            </span>
            <span
              data-testid="active-biome-label"
              className="text-xs sm:text-sm font-medium text-amber-400 whitespace-nowrap"
            >
              {telemetry.activeBiome.nameRu}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate hidden md:block">
            {telemetry.activeBiome.subtitleRu}
            {telemetry.isBridge ? ' · Проезд по горному виадуку' : ''}
          </p>
        </div>

        {/* Center/Right: Clean Tabular Telemetry */}
        <div className="flex items-center gap-2.5 sm:gap-5 shrink-0 font-mono tabular-nums text-xs sm:text-sm">
          <div className="flex items-baseline gap-1">
            <span
              data-testid="telemetry-speed"
              className="text-base sm:text-xl font-semibold text-white"
            >
              {formatted.speedText}
            </span>
            <span className="text-[11px] text-slate-400">км/ч</span>
          </div>

          <span aria-hidden="true" className="text-slate-700 hidden sm:inline">
            /
          </span>

          <div className="hidden sm:flex items-baseline gap-1">
            <span data-testid="telemetry-distance" className="text-slate-200 font-medium">
              {formatted.distanceKmText}
            </span>
            <span className="text-[11px] text-slate-400">км</span>
          </div>

          <span aria-hidden="true" className="text-slate-700 hidden md:inline">
            /
          </span>

          <div className="hidden md:flex items-baseline gap-1">
            <span className="text-slate-200 font-medium">{formatted.altitudeText}</span>
          </div>
        </div>

        {/* Right: Quick Action Buttons (44x44px ergonomic touch hitboxes) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onTriggerHorn}
            aria-label="Подать гудок поезда"
            title="Подать гудок (Пробел)"
            className="min-h-[42px] min-w-[42px] px-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 text-amber-300 border border-amber-500/30 flex items-center justify-center gap-1.5 text-xs font-medium transition-transform cursor-pointer"
          >
            <Megaphone className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline whitespace-nowrap">Гудок</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeConfig((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))
            }
            aria-label={config.soundEnabled ? 'Выключить звук' : 'Включить звук стука колёс'}
            title={config.soundEnabled ? 'Звук включён' : 'Включить звук'}
            className={`min-h-[42px] min-w-[42px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
              config.soundEnabled
                ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {config.soundEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Bottom Unified Collapsible Control Dock (Pinned to bottom center, mobile & desktop friendly) */}
      <div className="w-full max-w-3xl mx-auto flex flex-col items-center pointer-events-auto">
        {/* Collapse / Expand Zen Mode Handle */}
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          aria-expanded={!isCollapsed}
          aria-label={
            isCollapsed ? 'Показать панель управления' : 'Скрыть панель управления'
          }
          className="mb-1.5 px-4 py-1.5 min-h-[38px] rounded-full bg-slate-950/90 hover:bg-slate-900 text-slate-200 border border-slate-800 shadow-md flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer"
        >
          {isCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
              <span className="whitespace-nowrap">Показать управление</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              <span className="whitespace-nowrap">Скрыть панель (Чистый вид)</span>
            </>
          )}
        </button>

        {/* Collapsible Drawer Body */}
        {!isCollapsed && (
          <section
            aria-label="Панель параметров симуляции поезда"
            className="w-full rounded-2xl bg-slate-950/92 border border-slate-800/90 shadow-2xl p-2.5 sm:p-4 transition-all"
          >
            {/* Segmented Tab Switcher for Mobile & Desktop Ergonomics */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800/70 mb-2.5">
              <button
                type="button"
                onClick={() => setActiveTab('drive')}
                className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'drive'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Camera className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>Камера и Ход</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('world')}
                className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'world'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Compass className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                <span>Биомы и Среда</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('train')}
                className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'train'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span>Состав и Свет</span>
              </button>
            </div>

            {/* TAB 1: CAMERA & SPEED */}
            {activeTab === 'drive' && (
              <div className="space-y-2.5">
                {/* Camera Presets Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                    Ракурс камеры:
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 w-full sm:w-auto">
                    {cameraModes.map((cm) => (
                      <button
                        key={cm.id}
                        type="button"
                        onClick={() =>
                          onChangeConfig((prev) => ({ ...prev, cameraMode: cm.id }))
                        }
                        className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          config.cameraMode === cm.id
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                        }`}
                      >
                        {cm.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Free Camera Zoom & 360 Orbit Bar */}
                {config.cameraMode === 'free' && (
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <label htmlFor="zoom-slider" className="text-sky-300 font-medium truncate">
                        Зум (360° вращение мышью/пальцем)
                      </label>
                      <span
                        data-testid="free-cam-zoom-value"
                        className="font-mono tabular-nums text-white font-semibold shrink-0"
                      >
                        {Math.round(config.freeCamDistance)} м
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onChangeConfig((prev) => ({
                            ...prev,
                            cameraMode: 'free',
                            freeCamDistance: clampFreeCamDistance(prev.freeCamDistance - 10),
                          }))
                        }
                        aria-label="Приблизить камеру"
                        title="Приблизить (+)"
                        className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 flex items-center justify-center cursor-pointer shrink-0"
                      >
                        <ZoomIn className="w-4 h-4 text-sky-400" />
                      </button>

                      <input
                        id="zoom-slider"
                        type="range"
                        min={MIN_FREE_CAM_DISTANCE}
                        max={MAX_FREE_CAM_DISTANCE}
                        step={2}
                        value={config.freeCamDistance}
                        onChange={(e) =>
                          onChangeConfig((prev) => ({
                            ...prev,
                            cameraMode: 'free',
                            freeCamDistance: Number(e.target.value),
                          }))
                        }
                        aria-label="Дистанция зума свободной камеры"
                        className="flex-1 accent-sky-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          onChangeConfig((prev) => ({
                            ...prev,
                            cameraMode: 'free',
                            freeCamDistance: clampFreeCamDistance(prev.freeCamDistance + 10),
                          }))
                        }
                        aria-label="Отдалить камеру"
                        title="Отдалить (-)"
                        className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 flex items-center justify-center cursor-pointer shrink-0"
                      >
                        <ZoomOut className="w-4 h-4 text-sky-400" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onChangeConfig((prev) => ({
                            ...prev,
                            freeCamDistance: 22,
                            freeCamResetCount: prev.freeCamResetCount + 1,
                          }))
                        }
                        aria-label="Сбросить ракурс свободной камеры"
                        title="Сбросить ракурс и зум"
                        className="min-h-[38px] px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 flex items-center gap-1 text-xs font-medium cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Сброс</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Speed Slider + Pause/Resume */}
                <div className="flex items-center gap-3 pt-1 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        targetSpeedKmh: prev.targetSpeedKmh === 0 ? 120 : 0,
                      }))
                    }
                    aria-label={isPaused ? 'Запустить поезд' : 'Остановить поезд'}
                    className={`min-h-[42px] px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer whitespace-nowrap ${
                      isPaused
                        ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                        : 'bg-slate-900 text-slate-200 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    {isPaused ? (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Старт</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Стоп</span>
                      </>
                    )}
                  </button>

                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="speed-slider" className="text-slate-400 flex items-center gap-1">
                        <Gauge className="w-3.5 h-3.5 text-amber-400" />
                        <span>Крейсерская скорость</span>
                      </label>
                      <span className="font-mono tabular-nums text-white font-medium">
                        {config.targetSpeedKmh} км/ч
                      </span>
                    </div>
                    <input
                      id="speed-slider"
                      type="range"
                      min={0}
                      max={240}
                      step={10}
                      value={config.targetSpeedKmh}
                      onChange={(e) =>
                        onChangeConfig((prev) => ({
                          ...prev,
                          targetSpeedKmh: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-amber-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: BIOMES, TIME OF DAY & WEATHER */}
            {activeTab === 'world' && (
              <div className="space-y-3">
                {/* Biome Selector */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {biomeModes.map((bm) => (
                    <button
                      key={bm.id}
                      type="button"
                      onClick={() =>
                        onChangeConfig((prev) => ({ ...prev, biomeMode: bm.id }))
                      }
                      className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap truncate ${
                        config.biomeMode === bm.id
                          ? 'bg-sky-500 text-slate-950 font-semibold'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                    >
                      {bm.icon}
                      <span className="truncate">{bm.label}</span>
                    </button>
                  ))}
                </div>

                {/* Time of Day & Weather Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                  <div className="grid grid-cols-4 gap-1">
                    {timeModes.map((tm) => (
                      <button
                        key={tm.id}
                        type="button"
                        onClick={() =>
                          onChangeConfig((prev) => ({ ...prev, timeOfDay: tm.id }))
                        }
                        className={`min-h-[40px] px-2 py-1 rounded-xl text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                          config.timeOfDay === tm.id
                            ? 'bg-amber-500/25 border border-amber-400/60 text-amber-200 font-semibold'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
                        }`}
                      >
                        {tm.icon}
                        <span className="truncate">{tm.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-4 gap-1">
                    {weatherModes.map((wm) => (
                      <button
                        key={wm.id}
                        type="button"
                        onClick={() =>
                          onChangeConfig((prev) => ({ ...prev, weather: wm.id }))
                        }
                        className={`min-h-[40px] px-2 py-1 rounded-xl text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                          config.weather === wm.id
                            ? 'bg-sky-500/25 border border-sky-400/60 text-sky-200 font-semibold'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
                        }`}
                      >
                        {wm.icon}
                        <span className="truncate">{wm.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: TRAIN COMPOSITION & OPTIONS */}
            {activeTab === 'train' && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Wagon Count Control */}
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="wagon-slider" className="text-slate-300 flex items-center gap-1.5">
                        <Train className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Количество пассажирских вагонов</span>
                      </label>
                      <span
                        data-testid="wagon-count-value"
                        className="font-mono tabular-nums text-white font-semibold"
                      >
                        {config.wagonCount} ваг.
                      </span>
                    </div>
                    <input
                      id="wagon-slider"
                      type="range"
                      min={2}
                      max={8}
                      step={1}
                      value={config.wagonCount}
                      onChange={(e) =>
                        onChangeConfig((prev) => ({
                          ...prev,
                          wagonCount: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Toggles for Headlight & Auto-Director */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onChangeConfig((prev) => ({
                          ...prev,
                          headlightOn: !prev.headlightOn,
                        }))
                      }
                      className={`min-h-[42px] px-3 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        config.headlightOn
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span>Прожектор</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onChangeConfig((prev) => ({
                          ...prev,
                          cinematicAutoSwitch: !prev.cinematicAutoSwitch,
                        }))
                      }
                      className={`min-h-[42px] px-3 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        config.cinematicAutoSwitch
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Авто-планы</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
