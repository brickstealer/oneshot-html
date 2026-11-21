import {
  Camera,
  ChevronDown,
  ChevronUp,
  Compass,
  Gauge,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import { BIOMES, BIOME_LIST } from '../sim/worldGen';
import {
  FLIGHT_UNLOCK_TOTAL_LEVEL,
  UPGRADE_ORDER,
  UPGRADE_SPECS,
  formatMoney,
  getTotalUpgradeLevel,
  getUpgradeCost,
} from '../sim/taxiEconomy';
import type {
  BiomeId,
  CameraMode,
  HudSnapshot,
  SimSettings,
  TimeOfDayMode,
  UpgradeKey,
  WeatherMode,
} from '../sim/types';

export type DockTab = 'camera' | 'garage' | 'world' | 'stats';

interface ControlDockProps {
  hud: HudSnapshot;
  settings: SimSettings;
  activeTab: DockTab;
  expanded: boolean;
  cinemaMode: boolean;
  onSelectTab: (tab: DockTab) => void;
  onToggleExpanded: () => void;
  onUpdateSettings: (patch: Partial<SimSettings>) => void;
  onBuyUpgrade: (key: UpgradeKey) => void;
  onTeleportBiome: (biome: BiomeId) => void;
  onResetProgress: () => void;
}

const CAMERA_OPTIONS: Array<{ id: CameraMode; label: string }> = [
  { id: 'director', label: 'Кино-микс' },
  { id: 'chase', label: 'Погоня' },
  { id: 'drone', label: 'Дрон' },
  { id: 'hood', label: 'Капот' },
  { id: 'side', label: 'Кино-борт' },
  { id: 'orbit', label: 'Орбита' },
];

const TIME_OPTIONS: Array<{ id: TimeOfDayMode; label: string }> = [
  { id: 'auto', label: 'Авто' },
  { id: 'dawn', label: 'Рассвет' },
  { id: 'day', label: 'День' },
  { id: 'sunset', label: 'Закат' },
  { id: 'night', label: 'Ночь' },
];

const WEATHER_OPTIONS: Array<{ id: WeatherMode; label: string }> = [
  { id: 'clear', label: 'Ясно' },
  { id: 'rain', label: 'Дождь' },
  { id: 'fog', label: 'Туман' },
];

const SPEED_OPTIONS = [0.5, 1, 2, 4];

const TABS: Array<{ id: DockTab; label: string; Icon: typeof Camera }> = [
  { id: 'camera', label: 'Камера', Icon: Camera },
  { id: 'garage', label: 'Гараж', Icon: Wrench },
  { id: 'world', label: 'Мир', Icon: Compass },
  { id: 'stats', label: 'Сводка', Icon: Gauge },
];

export function ControlDock({
  hud,
  settings,
  activeTab,
  expanded,
  cinemaMode,
  onSelectTab,
  onToggleExpanded,
  onUpdateSettings,
  onBuyUpgrade,
  onTeleportBiome,
  onResetProgress,
}: ControlDockProps) {
  if (cinemaMode) {
    return null;
  }

  return (
    <section
      aria-label="Панель управления симуляцией"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center px-2.5 pb-2.5 sm:px-4 sm:pb-4"
    >
      <div className="pointer-events-auto w-full max-w-[880px] overflow-hidden rounded-2xl border border-white/12 bg-[#0a0d14]/90 shadow-2xl">
        {/* Expanded panel content above the compact tab bar */}
        {expanded && (
          <div className="border-b border-white/10 px-3.5 py-3 sm:px-5 sm:py-3.5">
            {activeTab === 'camera' && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-300">
                    Режим кинематографической камеры
                  </span>
                  <span className="text-xs text-slate-400">
                    {settings.cameraMode === 'director'
                      ? `Ракурс: ${hud.activeDirectorAngle}`
                      : settings.cameraMode === 'orbit'
                        ? 'Тяните экран для вращения · колесо для зума'
                        : 'Адаптивный кадр для ПК и мобильного'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 sm:grid sm:grid-cols-6 sm:overflow-visible">
                  {CAMERA_OPTIONS.map((cam) => {
                    const active = settings.cameraMode === cam.id;
                    return (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => onUpdateSettings({ cameraMode: cam.id })}
                        aria-pressed={active}
                        className={`min-h-[40px] shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                          active
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'bg-white/6 text-slate-200 hover:bg-white/12'
                        }`}
                      >
                        {cam.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'garage' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                    <span className="font-semibold text-white">{hud.vehicleClassName}</span>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    {hud.flightUnlocked ? (
                      <span className="font-medium text-sky-400">
                        Аэро-полёт активен
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        Аэро-полёт с ур. {FLIGHT_UNLOCK_TOTAL_LEVEL} (сейчас{' '}
                        <span className="font-mono-num text-slate-200">
                          {getTotalUpgradeLevel(hud.upgrades)}/{FLIGHT_UNLOCK_TOTAL_LEVEL}
                        </span>
                        )
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ autoUpgrade: !settings.autoUpgrade })}
                    aria-pressed={settings.autoUpgrade}
                    className={`min-h-[34px] rounded-lg border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                      settings.autoUpgrade
                        ? 'border-amber-400/60 bg-amber-500/20 text-amber-300'
                        : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    Авто-апгрейд: {settings.autoUpgrade ? 'Вкл' : 'Выкл'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {UPGRADE_ORDER.map((key) => {
                    const spec = UPGRADE_SPECS[key];
                    const lvl = hud.upgrades[key];
                    const cost = getUpgradeCost(key, lvl);
                    const canAfford = hud.balance >= cost;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onBuyUpgrade(key)}
                        disabled={!canAfford}
                        data-testid={`upgrade-${key}`}
                        className={`flex flex-col items-start justify-between rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                          canAfford
                            ? 'border-amber-500/40 bg-white/6 hover:bg-white/12 cursor-pointer'
                            : 'border-white/8 bg-white/[0.03] opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-white truncate">
                            {spec.shortRu}
                          </span>
                          <span className="font-mono-num text-[11px] text-amber-400 whitespace-nowrap">
                            Ур. {lvl}
                          </span>
                        </div>
                        <span className="mt-0.5 text-[11px] text-slate-400 truncate w-full">
                          {spec.effectLabel(lvl)}
                        </span>
                        <span
                          className={`font-mono-num mt-2 text-xs font-semibold whitespace-nowrap ${
                            canAfford ? 'text-amber-400' : 'text-slate-500'
                          }`}
                        >
                          Улучшить · {formatMoney(cost)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'world' && (
              <div className="space-y-3">
                {/* Row 1: Time of Day + Weather */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <div className="mb-1.5 text-[11px] font-medium text-slate-400">
                      Время суток
                    </div>
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                      {TIME_OPTIONS.map((t) => {
                        const active = settings.timeOfDay === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => onUpdateSettings({ timeOfDay: t.id })}
                            aria-pressed={active}
                            className={`min-h-[36px] flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                              active
                                ? 'bg-amber-500 text-slate-950 font-semibold'
                                : 'bg-white/6 text-slate-200 hover:bg-white/12'
                            }`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <div className="mb-1.5 text-[11px] font-medium text-slate-400">
                        Погода
                      </div>
                      <div className="flex items-center gap-1">
                        {WEATHER_OPTIONS.map((w) => {
                          const active = settings.weather === w.id;
                          return (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => onUpdateSettings({ weather: w.id })}
                              aria-pressed={active}
                              className={`min-h-[36px] flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                                active
                                  ? 'bg-amber-500 text-slate-950 font-semibold'
                                  : 'bg-white/6 text-slate-200 hover:bg-white/12'
                              }`}
                            >
                              {w.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 text-[11px] font-medium text-slate-400">
                        Скорость симуляции
                      </div>
                      <div className="flex items-center gap-1">
                        {SPEED_OPTIONS.map((sp) => {
                          const active = settings.simSpeed === sp;
                          return (
                            <button
                              key={sp}
                              type="button"
                              onClick={() => onUpdateSettings({ simSpeed: sp })}
                              aria-pressed={active}
                              className={`font-mono-num min-h-[36px] flex-1 rounded-lg px-1.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                                active
                                  ? 'bg-amber-500 text-slate-950 font-semibold'
                                  : 'bg-white/6 text-slate-200 hover:bg-white/12'
                              }`}
                            >
                              {sp}×
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 2: Biome quick jump + Traffic density slider */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_200px] sm:items-end">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-400">
                        Переместиться в биом ({BIOME_LIST.length})
                      </span>
                      <span className="hidden sm:inline text-slate-500">
                        {BIOMES[hud.biome].subtitleRu}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible">
                      {BIOME_LIST.map((bId) => {
                        const active = hud.biome === bId;
                        const bDef = BIOMES[bId];
                        return (
                          <button
                            key={bId}
                            type="button"
                            onClick={() => onTeleportBiome(bId)}
                            data-testid={`biome-btn-${bId}`}
                            className={`flex min-h-[30px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                              active
                                ? 'bg-white/22 text-white font-semibold'
                                : 'bg-white/6 text-slate-300 hover:bg-white/12'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: bDef.accentHex }}
                            />
                            <span>{bDef.nameRu}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[11px]">
                      <label htmlFor="traffic-slider" className="font-medium text-slate-400">
                        Плотность трафика
                      </label>
                      <span className="font-mono-num text-slate-200">
                        {Math.round(settings.trafficDensity * 100)}%
                      </span>
                    </div>
                    <input
                      id="traffic-slider"
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={settings.trafficDensity}
                      onChange={(e) =>
                        onUpdateSettings({ trafficDensity: Number(e.target.value) })
                      }
                      className="sim-slider w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'stats' && (
              <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
                <div className="grid flex-1 grid-cols-2 gap-x-5 gap-y-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[11px] text-slate-400">Ваших заказов</div>
                    <div
                      className="font-mono-num text-sm font-semibold text-white"
                      data-testid="stat-trips"
                    >
                      {hud.tripsCompleted}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Заработано всего</div>
                    <div className="font-mono-num text-sm font-semibold text-amber-400">
                      {formatMoney(hud.totalEarned)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Пробег</div>
                    <div className="font-mono-num text-sm font-semibold text-white">
                      {hud.totalDistanceKm.toFixed(2)} км
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Макс. скорость</div>
                    <div className="font-mono-num text-sm font-semibold text-white">
                      {hud.maxSpeedKmh} км/ч
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 whitespace-nowrap">Автопарк рядом</div>
                    <div
                      className="font-mono-num text-sm font-semibold text-sky-400 whitespace-nowrap"
                      data-testid="stat-fleet"
                    >
                      {hud.fleetActiveCount} авто · {hud.fleetTripsCompleted} рейс.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onResetProgress}
                  className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-red-500/20 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-amber-400 whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Сбросить прогресс</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Always-accessible compact bottom tab bar */}
        <nav
          aria-label="Разделы управления"
          className="flex items-center justify-between gap-1 px-2 py-1.5 sm:px-3"
        >
          <div className="flex flex-1 items-center gap-1">
            {TABS.map(({ id, label, Icon }) => {
              const isSelected = expanded && activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectTab(id)}
                  aria-expanded={isSelected}
                  className={`flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 sm:flex-none sm:px-4 ${
                    isSelected
                      ? 'bg-white/14 text-amber-400 font-semibold'
                      : 'text-slate-300 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onToggleExpanded}
            aria-label={expanded ? 'Свернуть панель управления' : 'Развернуть панель управления'}
            className="flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400 whitespace-nowrap"
          >
            {expanded ? (
              <>
                <ChevronDown className="h-4 w-4" />
                <span className="hidden sm:inline">Свернуть</span>
              </>
            ) : (
              <>
                <ChevronUp className="h-4 w-4" />
                <span className="hidden sm:inline">Параметры</span>
              </>
            )}
          </button>
        </nav>
      </div>
    </section>
  );
}
