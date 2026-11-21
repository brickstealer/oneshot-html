import React, { useState } from 'react';
import { X, Shuffle, Sparkles, Users } from 'lucide-react';
import { BIOMES, BIOME_IDS } from '../sim/biomes';
import {
  BiomeId,
  PropKind,
  SimulationMetrics,
  SimulationParams,
} from '../sim/types';

interface TuningDrawerProps {
  open: boolean;
  params: SimulationParams;
  metrics: SimulationMetrics;
  onClose: () => void;
  onUpdateParams: (patch: Partial<SimulationParams>) => void;
  onSelectBiome: (biomeId: BiomeId) => void;
  onApplySeed: (seed: string) => void;
  onSpawnSpecificProp: (kind: PropKind) => void;
  onSpawnEnemyWave: () => void;
}

const PROP_BUTTONS: { kind: PropKind; label: string }[] = [
  { kind: 'ladder', label: 'Стремянка' },
  { kind: 'vase', label: 'Ваза Мин' },
  { kind: 'table', label: 'Стол' },
  { kind: 'chair', label: 'Стул' },
  { kind: 'bamboo_pole', label: 'Шест' },
  { kind: 'wok', label: 'Вок' },
];

export const TuningDrawer: React.FC<TuningDrawerProps> = ({
  open,
  params,
  metrics,
  onClose,
  onUpdateParams,
  onSelectBiome,
  onApplySeed,
  onSpawnSpecificProp,
  onSpawnEnemyWave,
}) => {
  const [customSeed, setCustomSeed] = useState('');

  if (!open) return null;

  return (
    <aside
      aria-label="Режиссёрский пульт симуляции"
      className="fixed top-16 right-3 bottom-18 z-30 w-80 sm:w-92 rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl"
      style={{ backgroundColor: 'rgba(11, 14, 21, 0.96)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <h2 className="font-display text-sm font-bold tracking-wide text-amber-400 uppercase">
            Режиссёрский пульт физики
          </h2>
          <p className="text-[11px] text-slate-400">
            Настройка рэгдолла, реквизита и генератора сцен
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть панель настроек"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        {/* 1. Procedural Biome / Movie Set Selector */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">
              Кинопавильон (Локация)
            </span>
            <span className="font-mono-tabular text-[11px] text-amber-400">
              Сид: {metrics.seed}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {BIOME_IDS.map((id) => {
              const b = BIOMES[id];
              const isCurrent = metrics.biomeId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectBiome(id)}
                  className={`px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between ${
                    isCurrent
                      ? 'border-amber-400 bg-amber-500/15 text-amber-300 font-semibold'
                      : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span className="truncate">{b.nameRu}</span>
                  {isCurrent && (
                    <span className="text-[10px] font-mono-tabular text-amber-400 shrink-0 ml-2">
                      АКТИВЕН
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Physics & Ragdoll Sliders */}
        <section className="space-y-3 pt-2 border-t border-slate-800/80">
          <div className="space-y-1">
            <div className="flex justify-between text-slate-300">
              <label htmlFor="slider-elasticity">
                Тонус мышц рэгдолла (Упругость)
              </label>
              <span className="font-mono-tabular text-amber-400">
                {Math.round(params.ragdollElasticity * 100)}%
              </span>
            </div>
            <input
              id="slider-elasticity"
              type="range"
              min="0.3"
              max="1.0"
              step="0.05"
              value={params.ragdollElasticity}
              onChange={(e) =>
                onUpdateParams({ ragdollElasticity: parseFloat(e.target.value) })
              }
              className="w-full sim-slider"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-slate-300">
              <label htmlFor="slider-gravity">Гравитация сцены</label>
              <span className="font-mono-tabular text-amber-400">
                {params.gravityScale.toFixed(2)}g
              </span>
            </div>
            <input
              id="slider-gravity"
              type="range"
              min="0.55"
              max="1.4"
              step="0.05"
              value={params.gravityScale}
              onChange={(e) =>
                onUpdateParams({ gravityScale: parseFloat(e.target.value) })
              }
              className="w-full sim-slider"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-slate-300">
              <label htmlFor="slider-enemies">
                Одновременных каскадёров в бою
              </label>
              <span className="font-mono-tabular text-amber-400">
                {params.enemyCount} бойца
              </span>
            </div>
            <input
              id="slider-enemies"
              type="range"
              min="2"
              max="7"
              step="1"
              value={params.enemyCount}
              onChange={(e) =>
                onUpdateParams({ enemyCount: parseInt(e.target.value, 10) })
              }
              className="w-full sim-slider"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-slate-300">
              <label htmlFor="slider-stunts">
                Частота акробатики и реквизита
              </label>
              <span className="font-mono-tabular text-amber-400">
                {Math.round(params.stuntFrequency * 100)}%
              </span>
            </div>
            <input
              id="slider-stunts"
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={params.stuntFrequency}
              onChange={(e) =>
                onUpdateParams({ stuntFrequency: parseFloat(e.target.value) })
              }
              className="w-full sim-slider"
            />
          </div>
        </section>

        {/* 3. Instant Stunt Prop Spawner & Crowd Reinforcement */}
        <section className="space-y-2 pt-2 border-t border-slate-800/80">
          <span className="font-semibold text-slate-200 block">
            Быстрый сброс реквизита на площадку
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {PROP_BUTTONS.map((p) => (
              <button
                key={p.kind}
                type="button"
                onClick={() => onSpawnSpecificProp(p.kind)}
                className="px-2 py-1.5 rounded-md border border-slate-800 bg-slate-900 hover:border-amber-500/50 hover:text-amber-300 text-slate-300 font-medium transition-colors cursor-pointer whitespace-nowrap truncate"
              >
                + {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onSpawnEnemyWave}
            className="w-full mt-1.5 py-2 px-3 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-rose-400" />
            <span>Выпустить дополнительного каскадёра</span>
          </button>
        </section>

        {/* 4. Custom Seed Input */}
        <section className="space-y-2 pt-2 border-t border-slate-800/80">
          <label
            htmlFor="seed-input"
            className="font-semibold text-slate-200 block"
          >
            Код генерации (Seed)
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onApplySeed(customSeed);
              setCustomSeed('');
            }}
            className="flex gap-1.5"
          >
            <input
              id="seed-input"
              type="text"
              value={customSeed}
              onChange={(e) => setCustomSeed(e.target.value)}
              placeholder={metrics.seed}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 font-mono-tabular text-xs focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Применить</span>
            </button>
          </form>
        </section>

        {/* 5. Live Stunt Choreography Log */}
        <section className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Хроника трюков дубля</span>
          </div>
          <div className="space-y-1.5">
            {metrics.recentEvents.map((ev) => (
              <div
                key={ev.id}
                className="px-2.5 py-1.5 rounded-md border border-slate-800/90 bg-slate-900/60"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-amber-300">
                    {ev.title}
                  </span>
                  {ev.points > 0 && (
                    <span className="font-mono-tabular text-emerald-400">
                      +{ev.points}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  {ev.detail}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
};
