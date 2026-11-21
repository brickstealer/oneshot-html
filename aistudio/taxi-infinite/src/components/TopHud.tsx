import { useEffect, useRef, useState } from 'react';
import {
  Compass,
  DoorOpen,
  Eye,
  EyeOff,
  Navigation,
  Plane,
  UserCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BIOMES } from '../sim/worldGen';
import { formatMoney, getOrderTierInfo } from '../sim/taxiEconomy';
import type { HudSnapshot } from '../sim/types';

interface TopHudProps {
  hud: HudSnapshot;
  audioEnabled: boolean;
  cinemaMode: boolean;
  onToggleAudio: () => void;
  onToggleCinema: () => void;
}

function formatClock(hours: number): string {
  const wrapped = ((hours % 24) + 24) % 24;
  const h = Math.floor(wrapped);
  const m = Math.floor((wrapped - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function TopHud({
  hud,
  audioEnabled,
  cinemaMode,
  onToggleAudio,
  onToggleCinema,
}: TopHudProps) {
  const [recentPayout, setRecentPayout] = useState<number | null>(null);
  const lastSeenPayoutIdRef = useRef(hud.lastPayoutId);

  useEffect(() => {
    if (hud.lastPayoutId > lastSeenPayoutIdRef.current && hud.lastPayout > 0) {
      lastSeenPayoutIdRef.current = hud.lastPayoutId;
      setRecentPayout(hud.lastPayout);
      const timer = window.setTimeout(() => {
        setRecentPayout(null);
      }, 3200);
      return () => window.clearTimeout(timer);
    }
  }, [hud.lastPayoutId, hud.lastPayout]);

  if (cinemaMode) {
    return (
      <div className="pointer-events-none fixed top-3 right-3 z-20">
        <button
          type="button"
          onClick={onToggleCinema}
          aria-label="Показать интерфейс"
          className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/15 bg-[#0a0d14]/88 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#151b28] focus-visible:outline-2 focus-visible:outline-amber-400 whitespace-nowrap"
        >
          <Eye className="h-4 w-4 text-amber-400" />
          <span>Интерфейс</span>
        </button>
      </div>
    );
  }

  const biomeInfo = BIOMES[hud.biome];

  let statusTag = 'Свободен';
  let statusTone = 'text-slate-300';
  let orderLine = 'Поиск пассажира поблизости';
  let orderMeta = hud.vehicleClassName;
  let StatusIcon = Compass;

  if (hud.activeOrder) {
    const tier = getOrderTierInfo(hud.activeOrder.tier);
    const destBiome = BIOMES[hud.activeOrder.dropoffBiome].nameRu;

    if (hud.orderPhase === 'en_route_pickup') {
      statusTag = 'Еду к клиенту';
      statusTone = 'text-amber-300';
      StatusIcon = Navigation;
      orderLine = `${hud.activeOrder.passengerName} · ${hud.distanceToTargetM} м впереди`;
      orderMeta = `${tier.labelRu} · оценка ${formatMoney(hud.activeOrder.baseFare)}`;
    } else if (hud.orderPhase === 'boarding') {
      statusTag = hud.doorOpenAmount > 0.25 ? 'Посадка · дверь открыта' : 'Посадка клиента';
      statusTone = 'text-amber-300';
      StatusIcon = DoorOpen;
      orderLine = `${hud.activeOrder.passengerName} садится в салон`;
      orderMeta = `Маршрут → ${destBiome}`;
    } else if (hud.orderPhase === 'en_route_dropoff') {
      statusTag = 'Пассажир в салоне';
      statusTone = 'text-emerald-400';
      StatusIcon = UserCheck;
      orderLine = `${hud.activeOrder.passengerName} → ${destBiome} · ${hud.distanceToTargetM} м`;
      orderMeta = `${tier.labelRu} · счётчик ${formatMoney(hud.activeOrder.currentFare)}`;
    } else if (hud.orderPhase === 'dropoff') {
      statusTag = hud.doorOpenAmount > 0.25 ? 'Высадка · дверь открыта' : 'Прибытие';
      statusTone = 'text-emerald-300';
      StatusIcon = DoorOpen;
      orderLine = `${hud.activeOrder.passengerName} выходит · ${formatMoney(hud.activeOrder.baseFare)}`;
      orderMeta = 'Поездка завершена';
    }
  }

  const showTripBar =
    hud.orderPhase === 'en_route_dropoff' ||
    (hud.orderPhase === 'dropoff' && hud.tripProgress > 0);
  const progressPct = Math.round(Math.max(4, Math.min(100, hud.tripProgress * 100)));

  return (
    <header
      className="pointer-events-none fixed inset-x-0 top-0 z-20 px-3 pt-3 sm:px-5 sm:pt-4"
      data-testid="top-hud"
    >
      <div className="mx-auto flex max-w-[1380px] items-start justify-between gap-3">
        {/* Left: Compact telemetry & unmistakable passenger cabin occupancy readout */}
        <div className="pointer-events-auto flex min-w-0 flex-col items-start gap-1.5">
          <div className="relative overflow-hidden rounded-xl border border-white/12 bg-[#0a0d14]/90 px-3.5 py-2 sm:px-4 sm:py-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className="font-display text-sm font-bold tracking-tight text-white whitespace-nowrap sm:text-base">
                AutoTaxi
              </span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span
                className="font-mono-num text-sm font-semibold text-amber-400 whitespace-nowrap sm:text-base"
                data-testid="hud-balance"
              >
                {formatMoney(hud.balance)}
              </span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span
                className="font-mono-num text-xs font-medium text-slate-200 whitespace-nowrap sm:text-sm"
                data-testid="hud-speed"
              >
                {hud.speedKmh} км/ч
              </span>
              {hud.altitude >= 0.8 && (
                <>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span
                    className="inline-flex items-center gap-1 font-mono-num text-xs font-semibold text-sky-400 whitespace-nowrap sm:text-sm"
                    data-testid="hud-altitude"
                  >
                    <Plane className="h-3.5 w-3.5 shrink-0" />
                    <span>{Math.round(hud.altitude)} м</span>
                  </span>
                </>
              )}
              <span aria-hidden="true" className="hidden text-slate-600 sm:inline">
                ·
              </span>
              <span
                className="text-xs font-medium text-slate-300 truncate max-w-[150px] sm:max-w-none sm:text-sm"
                data-testid="hud-biome"
              >
                {biomeInfo.nameRu}
              </span>
              <span aria-hidden="true" className="hidden text-slate-600 md:inline">
                ·
              </span>
              <span className="font-mono-num hidden text-xs text-slate-400 md:inline whitespace-nowrap">
                {formatClock(hud.timeHours)}
              </span>
            </div>

            <div
              className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs"
              data-testid="hud-order-status"
            >
              <span
                className={`inline-flex items-center gap-1.5 font-semibold whitespace-nowrap ${statusTone}`}
                data-testid="hud-passenger-state"
              >
                <StatusIcon className="h-3.5 w-3.5 shrink-0" />
                <span>{statusTag}</span>
              </span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="text-slate-200 truncate max-w-[210px] sm:max-w-[330px]">
                {orderLine}
              </span>
              <span aria-hidden="true" className="hidden text-slate-600 md:inline">
                /
              </span>
              <span className="hidden text-slate-400 md:inline truncate max-w-[240px]">
                {orderMeta}
              </span>
            </div>

            {hud.activeOrder?.passengerQuote && (
              <p
                className="mt-1 text-[11px] italic text-amber-200/85 truncate max-w-[300px] sm:max-w-[540px]"
                data-testid="hud-passenger-quote"
              >
                {hud.activeOrder.passengerQuote}
              </p>
            )}

            {/* Clean 2px emerald trip progress bar when passenger is aboard */}
            {showTripBar && (
              <div className="absolute inset-x-0 bottom-0 h-[2.5px] bg-white/8">
                <div
                  className="h-full bg-emerald-400 transition-[width] duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>

          {recentPayout !== null && (
            <div
              className="rounded-lg border border-emerald-400/35 bg-[#0a0d14]/92 px-3 py-1 text-xs font-semibold text-emerald-300 font-mono-num"
              data-testid="hud-payout-toast"
            >
              +{formatMoney(recentPayout)} · оплата получена
            </div>
          )}
        </div>

        {/* Right: Minimal single-row utility actions */}
        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onToggleAudio}
            aria-label={audioEnabled ? 'Выключить звук' : 'Включить звук'}
            aria-pressed={audioEnabled}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-[#0a0d14]/90 text-slate-200 transition-colors hover:bg-[#151b28] focus-visible:outline-2 focus-visible:outline-amber-400 sm:h-10 sm:w-auto sm:gap-2 sm:px-3.5"
          >
            {audioEnabled ? (
              <Volume2 className="h-4 w-4 text-amber-400" />
            ) : (
              <VolumeX className="h-4 w-4 text-slate-400" />
            )}
            <span className="hidden text-xs font-medium sm:inline whitespace-nowrap">
              {audioEnabled ? 'Звук вкл' : 'Звук'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleCinema}
            aria-label="Скрыть интерфейс (Кино-режим)"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-[#0a0d14]/90 text-slate-200 transition-colors hover:bg-[#151b28] focus-visible:outline-2 focus-visible:outline-amber-400 sm:h-10 sm:w-auto sm:gap-2 sm:px-3.5"
          >
            <EyeOff className="h-4 w-4 text-slate-300" />
            <span className="hidden text-xs font-medium sm:inline whitespace-nowrap">
              Кино
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
