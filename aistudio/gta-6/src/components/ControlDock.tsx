import { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Compass,
  Flame,
  Radio,
  SkipForward,
  Sun,
} from 'lucide-react';
import {
  RADIO_ORDER,
  RADIO_STATIONS,
  type BiomeFilter,
  type CameraMode,
  type ForcedEventType,
  type SimulationSettings,
  type TimePreset,
  type WeatherMode,
} from '../sim/types';

interface ControlDockProps {
  settings: SimulationSettings;
  radioTrackTitle: string;
  open: boolean;
  onToggleOpen: () => void;
  onUpdateSettings: (partial: Partial<SimulationSettings>) => void;
  onTriggerEvent: (event: ForcedEventType) => void;
}

type DockTab = 'camera' | 'radio' | 'world' | 'chaos';

const CAMERA_OPTIONS: { id: CameraMode; label: string }[] = [
  { id: 'auto', label: 'Авто-Кино' },
  { id: 'chase', label: 'Погоня' },
  { id: 'heli', label: 'Вертолёт' },
  { id: 'hood', label: 'Капот' },
  { id: 'drone', label: 'Дрон' },
];

const TIME_PRESETS: { id: TimePreset; label: string; hour: number }[] = [
  { id: 'sunset', label: 'Закат Вайс', hour: 17.6 },
  { id: 'noon', label: 'Полдень', hour: 13.0 },
  { id: 'night', label: 'Ночь', hour: 22.8 },
  { id: 'dawn', label: 'Рассвет', hour: 6.4 },
];

const WEATHER_OPTIONS: { id: WeatherMode; label: string }[] = [
  { id: 'clear', label: 'Ясно' },
  { id: 'rain', label: 'Ливень' },
  { id: 'fog', label: 'Туман' },
];

const BIOME_OPTIONS: { id: BiomeFilter; label: string }[] = [
  { id: 'auto', label: 'Все биомы' },
  { id: 'downtown', label: 'Мегаполис' },
  { id: 'beach', label: 'Пляж Вайс' },
  { id: 'everglades', label: 'Эверглейдс' },
  { id: 'desert', label: 'Пустыня' },
  { id: 'port', label: 'Порт' },
];

const SPEED_OPTIONS = [0.5, 1.0, 1.5, 2.0];

export function ControlDock({
  settings,
  radioTrackTitle,
  open,
  onToggleOpen,
  onUpdateSettings,
  onTriggerEvent,
}: ControlDockProps) {
  const [tab, setTab] = useState<DockTab>('camera');
  const activeStation = RADIO_STATIONS[settings.radioStation];

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-20 w-[min(860px,95vw)] flex flex-col items-center pointer-events-none">
      {/* Collapse / Expand toggle handle attached to top edge of dock */}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Скрыть панель управления' : 'Открыть панель управления'}
        onClick={(e) => {
          e.currentTarget.blur();
          onToggleOpen();
        }}
        className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-1.5 min-h-[36px] rounded-t-lg border border-b-0 border-white/15 text-xs font-semibold text-slate-100 hover:text-amber-300 transition-colors cursor-pointer"
        style={{ backgroundColor: 'rgba(10, 14, 22, 0.9)' }}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        <span>{open ? 'Скрыть панель' : 'Параметры симуляции'}</span>
      </button>

      {/* Main Unified Collapsible Dock */}
      {open && (
        <div
          className="pointer-events-auto w-full rounded-xl border border-white/15 p-2.5 sm:p-3 flex flex-col gap-2.5"
          style={{
            backgroundColor: 'rgba(10, 14, 22, 0.92)',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65)',
          }}
        >
          {/* Compact Top Tab Bar + Speed Switch (responsive for 390px mobile & desktop) */}
          <div className="flex items-center justify-between gap-1.5 border-b border-white/10 pb-2">
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar" role="tablist" aria-label="Разделы управления">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'camera'}
                onClick={() => setTab('camera')}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  tab === 'camera'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Camera className="w-3.5 h-3.5 shrink-0" />
                <span>Камера</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'radio'}
                onClick={() => setTab('radio')}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  tab === 'radio'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Radio className="w-3.5 h-3.5 shrink-0" />
                <span>Радио FM</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'world'}
                onClick={() => setTab('world')}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  tab === 'world'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Sun className="w-3.5 h-3.5 shrink-0" />
                <span>Мир</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'chaos'}
                onClick={() => setTab('chaos')}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  tab === 'chaos'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span>События</span>
              </button>
            </div>

            {/* Mobile: single clean cycle button; Desktop: all 4 speed options */}
            <button
              type="button"
              aria-label={`Скорость симуляции ${settings.simSpeed}x`}
              onClick={() => {
                const idx = SPEED_OPTIONS.indexOf(settings.simSpeed);
                onUpdateSettings({ simSpeed: SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length] });
              }}
              className="sm:hidden px-2.5 py-1.5 rounded-md bg-white text-slate-950 text-xs font-mono-num font-bold shrink-0 cursor-pointer"
            >
              {settings.simSpeed}x
            </button>
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              {SPEED_OPTIONS.map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => onUpdateSettings({ simSpeed: spd })}
                  className={`px-2 py-1 rounded text-[11px] font-mono-num font-bold transition-colors cursor-pointer ${
                    settings.simSpeed === spd
                      ? 'bg-white text-slate-950'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* TAB 1: CAMERA & QUICK ACTION STRIP */}
          {tab === 'camera' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {CAMERA_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateSettings({ cameraMode: opt.id })}
                    className={`px-3 py-2 min-h-[38px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      settings.cameraMode === opt.id
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/60'
                        : 'bg-white/5 text-slate-200 border border-transparent hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => onTriggerEvent('rob_bank')}
                  className="px-3 py-2 min-h-[38px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 bg-emerald-600/25 text-emerald-300 border border-emerald-400/40 hover:bg-emerald-600/40 transition-colors cursor-pointer"
                >
                  Ограбить банк
                </button>
                <button
                  type="button"
                  onClick={() => onTriggerEvent('explode_tanker')}
                  className="px-3 py-2 min-h-[38px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 bg-orange-600/25 text-orange-300 border border-orange-400/40 hover:bg-orange-600/40 transition-colors cursor-pointer"
                >
                  Взорвать бензовоз
                </button>
                <button
                  type="button"
                  onClick={() => onTriggerEvent('max_wanted')}
                  className="px-3 py-2 min-h-[38px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 bg-rose-600/25 text-rose-300 border border-rose-400/40 hover:bg-rose-600/40 transition-colors cursor-pointer"
                >
                  5★ Погоня
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: GTA RADIO STATIONS (ROCK, THRASH METAL, SYNTHWAVE, PHONK) */}
          {tab === 'radio' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1.5">
                  {RADIO_ORDER.map((stId) => {
                    const st = RADIO_STATIONS[stId];
                    const isSelected = settings.radioStation === stId;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => onUpdateSettings({ radioStation: st.id, muted: false })}
                        className={`px-3 py-1.5 min-h-[38px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-amber-500/25 text-amber-200 border border-amber-400/70'
                            : 'bg-white/5 text-slate-200 border border-transparent hover:bg-white/10'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: st.accentColor }}
                        />
                        <span>{st.shortName}</span>
                        {st.id !== 'off' && (
                          <span className="text-[10px] font-mono-num text-slate-400 hidden sm:inline">
                            {st.freq}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => onTriggerEvent('next_radio_track')}
                  className="px-3 py-1.5 min-h-[38px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 bg-white/10 text-amber-300 border border-amber-400/30 hover:bg-white/15 flex items-center gap-1 cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Сменить рифф</span>
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-300 px-1">
                <div className="truncate">
                  <span className="font-bold text-amber-300">{activeStation.genre}</span>
                  <span className="mx-1.5 text-white/30">·</span>
                  <span className="text-slate-100">{radioTrackTitle}</span>
                </div>
                <span className="text-slate-400 hidden sm:inline shrink-0">
                  Клавиша R — переключить станцию
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: WORLD, TIME, WEATHER & BIOME */}
          {tab === 'world' && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Time of day presets */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {TIME_PRESETS.map((tp) => {
                    const active = Math.abs(settings.timeOfDay - tp.hour) < 1.8;
                    return (
                      <button
                        key={tp.id}
                        type="button"
                        onClick={() => onUpdateSettings({ timeOfDay: tp.hour })}
                        className={`px-2.5 py-1.5 min-h-[36px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          active
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-400/60'
                            : 'bg-white/5 text-slate-200 border border-transparent hover:bg-white/10'
                        }`}
                      >
                        {tp.label}
                      </button>
                    );
                  })}
                </div>

                {/* Weather switcher */}
                <div className="flex items-center gap-1">
                  <CloudRain className="w-3.5 h-3.5 text-slate-400 mr-0.5 hidden sm:block" />
                  {WEATHER_OPTIONS.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => onUpdateSettings({ weather: w.id })}
                      className={`px-2.5 py-1.5 min-h-[36px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        settings.weather === w.id
                          ? 'bg-sky-500/25 text-sky-300 border border-sky-400/60'
                          : 'bg-white/5 text-slate-200 border border-transparent hover:bg-white/10'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Biome selector strip */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                <Compass className="w-3.5 h-3.5 text-slate-400 mr-1 shrink-0" />
                {BIOME_OPTIONS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onUpdateSettings({ biomeLock: b.id })}
                    className={`px-2.5 py-1.5 min-h-[34px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      settings.biomeLock === b.id
                        ? 'bg-white text-slate-950'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: CHAOS SLIDERS & EVENT TRIGGERS */}
          {tab === 'chaos' && (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center justify-between gap-3 text-xs text-slate-200">
                  <span className="whitespace-nowrap font-semibold">Уровень хаоса</span>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={settings.chaosLevel}
                    onChange={(e) => onUpdateSettings({ chaosLevel: Number(e.target.value) })}
                    className="sim-slider flex-1"
                  />
                  <span className="font-mono-num w-9 text-right text-amber-300">
                    {Math.round(settings.chaosLevel * 100)}%
                  </span>
                </label>

                <label className="flex items-center justify-between gap-3 text-xs text-slate-200">
                  <span className="whitespace-nowrap font-semibold">Трафик</span>
                  <input
                    type="range"
                    min={0.3}
                    max={1}
                    step={0.05}
                    value={settings.trafficDensity}
                    onChange={(e) => onUpdateSettings({ trafficDensity: Number(e.target.value) })}
                    className="sim-slider flex-1"
                  />
                  <span className="font-mono-num w-9 text-right text-amber-300">
                    {Math.round(settings.trafficDensity * 100)}%
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => onTriggerEvent('hijack_car')}
                  className="px-3 py-1.5 min-h-[36px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 bg-white/10 text-white hover:bg-white/15 cursor-pointer"
                >
                  Угнать авто
                </button>
                <button
                  type="button"
                  onClick={() => onTriggerEvent('next_weapon')}
                  className="px-3 py-1.5 min-h-[36px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 bg-white/10 text-white hover:bg-white/15 cursor-pointer"
                >
                  Сменить оружие
                </button>
                <button
                  type="button"
                  onClick={() => onTriggerEvent('rob_bank')}
                  className="px-3 py-1.5 min-h-[36px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 bg-emerald-600/25 text-emerald-300 border border-emerald-400/40 hover:bg-emerald-600/40 cursor-pointer"
                >
                  Ограбить банк
                </button>
                <button
                  type="button"
                  onClick={() => onTriggerEvent('explode_tanker')}
                  className="px-3 py-1.5 min-h-[36px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 bg-orange-600/25 text-orange-300 border border-orange-400/40 hover:bg-orange-600/40 cursor-pointer"
                >
                  Взорвать бензовоз
                </button>
                <button
                  type="button"
                  onClick={() => onTriggerEvent('clear_wanted')}
                  className="px-3 py-1.5 min-h-[36px] rounded-md text-xs font-semibold whitespace-nowrap shrink-0 bg-sky-600/25 text-sky-300 border border-sky-400/40 hover:bg-sky-600/40 cursor-pointer"
                >
                  Снять звёзды
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
