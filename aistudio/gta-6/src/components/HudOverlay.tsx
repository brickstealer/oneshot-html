import { Eye, EyeOff, Pause, Radio, Volume2, VolumeX } from 'lucide-react';
import type { HudSnapshot, WeaponId } from '../sim/types';
import { MiniRadar } from './MiniRadar';

interface HudOverlayProps {
  hud: HudSnapshot;
  muted: boolean;
  hudHidden: boolean;
  dockOpen: boolean;
  onToggleMute: () => void;
  onCycleRadio: () => void;
  onPause: () => void;
  onToggleHudHidden: () => void;
}

function WeaponIconSvg({ weapon }: { weapon: WeaponId }) {
  if (weapon === 'rpg') {
    return (
      <svg viewBox="0 0 36 16" className="w-7 h-3.5 text-amber-400 shrink-0" aria-hidden="true">
        <path d="M2 7h22v3H2zM24 6l8 2.5L24 11zM8 10h4v4H8z" fill="currentColor" />
      </svg>
    );
  }
  if (weapon === 'shotgun') {
    return (
      <svg viewBox="0 0 36 16" className="w-7 h-3.5 text-amber-300 shrink-0" aria-hidden="true">
        <path d="M2 7h28v2.5H12L7 13H2zM17 9.5h8v2h-8z" fill="currentColor" />
      </svg>
    );
  }
  if (weapon === 'rifle') {
    return (
      <svg viewBox="0 0 36 16" className="w-7 h-3.5 text-slate-100 shrink-0" aria-hidden="true">
        <path d="M2 6h28v2.5H19l-2 5.5h-3l1.2-5.5H8L4 12H2z" fill="currentColor" />
      </svg>
    );
  }
  if (weapon === 'smg') {
    return (
      <svg viewBox="0 0 32 16" className="w-6 h-3.5 text-slate-100 shrink-0" aria-hidden="true">
        <path d="M4 5h19v3.5H15v6h-3v-6H8l-2 4H4z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 28 16" className="w-5 h-3.5 text-slate-100 shrink-0" aria-hidden="true">
      <path d="M4 4h16v3.5h-9l-2 6H6l1.5-6H4z" fill="currentColor" />
    </svg>
  );
}

export function HudOverlay({
  hud,
  muted,
  hudHidden,
  dockOpen,
  onToggleMute,
  onCycleRadio,
  onPause,
  onToggleHudHidden,
}: HudOverlayProps) {
  const bannerColor =
    hud.bannerTone === 'wasted'
      ? '#ef4444'
      : hud.bannerTone === 'heist'
        ? '#22c55e'
        : hud.bannerTone === 'explosion'
          ? '#f97316'
          : hud.bannerTone === 'wanted'
            ? '#3b82f6'
            : '#f59e0b';

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Subtle top-edge contrast scrim for crisp HUD legibility over bright daytime facades */}
      {!hudHidden && (
        <div
          className="fixed top-0 inset-x-0 h-28 pointer-events-none -z-10"
          style={{
            background:
              'linear-gradient(180deg, rgba(8,10,16,0.72) 0%, rgba(8,10,16,0.28) 58%, rgba(8,10,16,0) 100%)',
          }}
        />
      )}

      {/* Top Perimeter Clusters */}
      <div className="flex items-start justify-between gap-2">
        {/* Top-Left: Biome · District, Live Action, Cash, Vitality */}
        {!hudHidden ? (
          <div className="flex flex-col gap-1 max-w-[56vw] sm:max-w-sm">
            <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] sm:text-xs font-semibold text-amber-300 hud-text-shadow">
              <span>{hud.biomeName}</span>
              <span aria-hidden="true" className="text-white/50">·</span>
              <span className="text-slate-100 truncate">{hud.districtName}</span>
              <span aria-hidden="true" className="text-white/50 hidden sm:inline">·</span>
              <span className="font-mono-num text-slate-200 hidden sm:inline">{hud.timeFormatted}</span>
            </div>

            <div className="font-display text-lg sm:text-2xl font-bold tracking-wide text-white leading-tight hud-text-shadow truncate">
              {hud.actionLabel}
            </div>

            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-mono-num font-bold hud-text-shadow">
              <span className="text-emerald-400" data-testid="hud-cash">
                ${hud.cash.toLocaleString('ru-RU')}
              </span>
              <span aria-hidden="true" className="text-white/40">/</span>
              <span className="text-slate-100">
                {hud.inVehicle ? `${hud.speedKmh} км/ч` : 'Пешком'}
              </span>
              <span className="hidden md:inline text-slate-300 font-sans text-xs font-medium truncate">
                {hud.inVehicle ? hud.vehicleLabel : ''}
              </span>
            </div>

            {/* Health & Armor compact bars */}
            <div className="flex items-center gap-1.5 w-32 sm:w-48 pt-0.5">
              <div
                className="flex-1 h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)' }}
                aria-label={`Здоровье ${hud.health}%`}
              >
                <div
                  className="h-full bg-emerald-400 transition-transform duration-150 origin-left"
                  style={{ transform: `scaleX(${Math.max(0, Math.min(1, hud.health / 100))})` }}
                />
              </div>
              <div
                className="flex-1 h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)' }}
                aria-label={`Броня ${hud.armor}%`}
              >
                <div
                  className="h-full bg-sky-400 transition-transform duration-150 origin-left"
                  style={{ transform: `scaleX(${Math.max(0, Math.min(1, hud.armor / 100))})` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div />
        )}

        {/* Top-Right: GTA 5-Star Wanted Level, Active Weapon, Compact Utility Icons */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Включить звук' : 'Выключить звук'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white border border-white/15 hover:border-amber-400/70 transition-colors cursor-pointer"
              style={{ backgroundColor: 'rgba(10, 14, 22, 0.84)' }}
            >
              {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label={hudHidden ? 'Показать интерфейс' : 'Скрыть интерфейс'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleHudHidden();
              }}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white border border-white/15 hover:border-amber-400/70 transition-colors cursor-pointer"
              style={{ backgroundColor: 'rgba(10, 14, 22, 0.84)' }}
            >
              {hudHidden ? <Eye className="w-4 h-4 text-amber-400" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Пауза"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white border border-white/15 hover:border-amber-400/70 transition-colors cursor-pointer"
              style={{ backgroundColor: 'rgba(10, 14, 22, 0.84)' }}
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>

          {!hudHidden && (
            <>
              {/* 5-Star Wanted Gauge */}
              <div
                className="flex items-center gap-0.5 sm:gap-1"
                data-testid="wanted-stars"
                data-stars={hud.wantedStars}
                aria-label={`Уровень розыска: ${hud.wantedStars} из 5`}
              >
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = star <= hud.wantedStars;
                  return (
                    <svg
                      key={star}
                      viewBox="0 0 24 24"
                      className={`w-5 h-5 sm:w-6 sm:h-6 ${
                        active
                          ? 'text-amber-400 drop-shadow-[0_1px_6px_rgba(245,158,11,0.75)]'
                          : 'text-white/25'
                      }`}
                      aria-hidden="true"
                    >
                      <path
                        d="M12 2.4l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.2 6.1 20.4l1.2-6.5-4.8-4.6 6.6-.9z"
                        fill="currentColor"
                        stroke="rgba(0,0,0,0.85)"
                        strokeWidth="1.2"
                      />
                    </svg>
                  );
                })}
              </div>

              {/* Active Weapon Readout */}
              <div className="flex items-center gap-1.5 text-xs sm:text-sm text-white hud-text-shadow">
                <WeaponIconSvg weapon={hud.weapon} />
                <span className="font-semibold whitespace-nowrap">{hud.weaponName}</span>
                <span className="font-mono-num text-amber-300 font-bold">{hud.ammo}</span>
              </div>

              {/* Live Clickable GTA Radio Station Badge */}
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCycleRadio();
                }}
                aria-label={`Радиостанция: ${hud.radioStationName}. Нажмите для смены станции`}
                className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/15 text-[11px] font-semibold text-amber-300 hover:border-amber-400/70 transition-colors cursor-pointer"
                style={{ backgroundColor: 'rgba(10, 14, 22, 0.82)' }}
              >
                <Radio className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="whitespace-nowrap">{hud.radioStationName}</span>
              </button>

              <div className="text-[11px] text-slate-300/90 hud-text-shadow hidden sm:block">
                {hud.activeCameraLabel}
                {hud.policeCount > 0 ? ` · Полиция: ${hud.policeCount}` : ''}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Non-blocking Upper-Center Cinematic Event Flash Banner (never covers central 3D subject) */}
      {hud.bannerText && !hudHidden && (
        <div className="fixed top-[104px] sm:top-5 left-1/2 -translate-x-1/2 z-10 text-center pointer-events-none max-w-[90vw]">
          <div
            className="px-4 py-1.5 rounded-md border border-white/15 inline-flex flex-col items-center"
            style={{ backgroundColor: 'rgba(9, 12, 18, 0.88)' }}
          >
            <div
              className="font-display text-base sm:text-xl font-bold tracking-wider uppercase leading-tight whitespace-nowrap"
              style={{ color: bannerColor }}
            >
              {hud.bannerText}
            </div>
            {hud.bannerSubtext && (
              <div className="text-[11px] text-slate-200 font-medium truncate max-w-[82vw] sm:max-w-md">
                {hud.bannerSubtext}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom-Left Mini-Radar (hidden on narrow mobile when dock is expanded to prevent overlap) */}
      <div className={`flex items-end justify-between ${dockOpen ? 'hidden sm:flex sm:mb-2' : 'flex mb-10 sm:mb-8'}`}>
        {!hudHidden ? (
          <div className="flex items-end gap-2.5">
            <MiniRadar
              biome={hud.biome}
              playerX={hud.playerX}
              playerZ={hud.playerZ}
              playerHeading={hud.playerHeading}
              wantedStars={hud.wantedStars}
              blips={hud.radarBlips}
            />
            <div className="hidden lg:flex flex-col gap-0.5 text-[11px] text-slate-200/90 hud-text-shadow font-mono-num">
              <span>Банков: {hud.banksRobbed}</span>
              <span>Угонов: {hud.carsStolen}</span>
              <span>Взрывов: {hud.explosionsCount}</span>
            </div>
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
