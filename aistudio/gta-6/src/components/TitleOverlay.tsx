interface TitleOverlayProps {
  onStart: () => void;
}

export function TitleOverlay({ onStart }: TitleOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-10 pointer-events-none"
      style={{
        background:
          'linear-gradient(180deg, rgba(8,10,16,0.64) 0%, rgba(8,10,16,0.08) 45%, rgba(8,10,16,0.78) 100%)',
      }}
    >
      {/* Top safe-margin Vice Horizon VI emblem + crisp HTML display lockup */}
      <div className="flex items-center gap-3.5 sm:gap-5 pt-1 sm:pt-3 max-w-2xl">
        <svg
          viewBox="0 0 88 88"
          className="w-14 h-14 sm:w-20 sm:h-20 shrink-0 drop-shadow-[0_4px_16px_rgba(0,0,0,0.75)]"
          role="img"
          aria-label="Эмблема Vice Horizon VI"
        >
          <defs>
            <linearGradient id="vhSunGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fde047" />
              <stop offset="52%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>
          </defs>
          <circle cx="44" cy="44" r="38" fill="url(#vhSunGrad)" />
          <rect x="4" y="45" width="80" height="4.5" fill="#0a0c12" fillOpacity="0.62" />
          <rect x="6" y="56" width="76" height="5" fill="#0a0c12" fillOpacity="0.72" />
          <rect x="10" y="67" width="68" height="5.5" fill="#0a0c12" fillOpacity="0.82" />
          <path
            d="M39 84 C40 64, 46 49, 53 31 C55 31, 56 33, 54 36 C49 51, 46 66, 45 84 Z"
            fill="#0a0c12"
          />
          <path
            d="M53 31 C39 24, 28 26, 21 34 C32 30, 42 32, 52 35 Z M53 31 C45 17, 34 14, 26 16 C36 20, 44 24, 51 33 Z M53 31 C63 18, 74 17, 81 22 C72 23, 63 26, 55 34 Z M53 31 C66 29, 76 35, 81 44 C72 38, 63 36, 54 35 Z"
            fill="#0a0c12"
          />
        </svg>

        <div className="min-w-0">
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-wider text-white leading-none hud-text-shadow whitespace-nowrap">
            VICE HORIZON <span className="text-amber-400">VI</span>
          </h1>
          <p className="text-[11px] sm:text-sm font-semibold tracking-widest text-slate-200 uppercase mt-1.5 hud-text-shadow">
            Автономная 3D симуляция · Бесконечный мир
          </p>
        </div>
      </div>

      {/* Bottom negative-space Start CTA + clean flat control hint */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
        <div className="flex flex-col items-start gap-3 pointer-events-auto">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="px-7 py-3.5 min-h-[48px] rounded-lg bg-[#f59e0b] hover:bg-[#fbbf24] active:scale-[0.98] text-[#090b10] font-display text-lg font-bold tracking-wider uppercase transition-transform duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            style={{ boxShadow: '0 8px 28px rgba(245, 158, 11, 0.35)' }}
          >
            Запустить симуляцию
          </button>
          <p className="text-xs sm:text-sm text-slate-200/95 hud-text-shadow max-w-md leading-relaxed">
            5 биомов · Автономные угоны, ограбления банков, погони до 5★, взрывы автобусов и бензовозов
          </p>
        </div>

        <div className="text-xs text-slate-300/90 hud-text-shadow">
          Enter — старт · C — камера · H — панель · P — пауза · M — звук
        </div>
      </div>
    </div>
  );
}
