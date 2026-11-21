import type { HudSnapshot } from '../sim/types';

interface PauseModalProps {
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
}

export function PauseModal({ hud, onResume, onRestart, onTitle }: PauseModalProps) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 9, 15, 0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <div
        className="w-full max-w-sm rounded-xl border border-white/15 p-6 flex flex-col gap-5"
        style={{
          backgroundColor: '#101520',
          boxShadow: '0 20px 50px rgba(0,0,0,0.75)',
        }}
      >
        <div>
          <h2 id="pause-title" className="font-display text-3xl font-bold tracking-wide text-white uppercase">
            Пауза
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {hud.biomeName} · {hud.districtName}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 py-3 border-y border-white/10 text-center">
          <div>
            <div className="font-mono-num text-xl font-bold text-emerald-400">
              {hud.banksRobbed}
            </div>
            <div className="text-[11px] text-slate-400">Банки</div>
          </div>
          <div>
            <div className="font-mono-num text-xl font-bold text-amber-400">
              {hud.carsStolen}
            </div>
            <div className="text-[11px] text-slate-400">Угоны</div>
          </div>
          <div>
            <div className="font-mono-num text-xl font-bold text-orange-400">
              {hud.explosionsCount}
            </div>
            <div className="text-[11px] text-slate-400">Взрывы</div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3 min-h-[44px] rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-base font-bold tracking-wider uppercase transition-colors cursor-pointer"
          >
            Продолжить
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 min-h-[44px] rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            Сбросить симуляцию
          </button>
          <button
            type="button"
            onClick={onTitle}
            className="w-full py-2.5 min-h-[44px] rounded-lg border border-white/15 hover:bg-white/5 text-slate-300 text-sm font-semibold transition-colors cursor-pointer"
          >
            На главный экран
          </button>
        </div>
      </div>
    </div>
  );
}
