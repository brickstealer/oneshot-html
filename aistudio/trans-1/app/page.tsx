'use client';

import React, { useCallback, useState } from 'react';
import TrainCanvas, { TelemetrySnapshot } from '@/components/TrainCanvas';
import ControlOverlay from '@/components/ControlOverlay';
import { BIOMES, SimulationConfig } from '@/lib/train-sim';

export default function HomePage() {
  const [config, setConfig] = useState<SimulationConfig>({
    speedKmh: 120,
    targetSpeedKmh: 120,
    wagonCount: 5,
    biomeMode: 'auto',
    cameraMode: 'free',
    freeCamDistance: 22,
    freeCamResetCount: 0,
    timeOfDay: 'day',
    weather: 'clear',
    headlightOn: true,
    soundEnabled: false,
    cinematicAutoSwitch: true,
  });

  const [hornTriggerCount, setHornTriggerCount] = useState(0);

  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>({
    speedKmh: 120,
    distanceMeters: 0,
    altitudeMeters: 1.5,
    activeBiome: BIOMES.city,
    nextBiome: BIOMES.village,
    biomeBlend: 0,
    isBridge: false,
  });

  const handleTelemetryUpdate = useCallback((snapshot: TelemetrySnapshot) => {
    setTelemetry(snapshot);
  }, []);

  const handleTriggerHorn = useCallback(() => {
    setHornTriggerCount((c) => c + 1);
  }, []);

  const handleFreeCamGesture = useCallback((newDistance: number, switchToFree: boolean) => {
    setConfig((prev) => ({
      ...prev,
      cameraMode: switchToFree ? 'free' : prev.cameraMode,
      freeCamDistance: newDistance,
    }));
  }, []);

  return (
    <main
      data-state="simulating"
      className="relative w-screen h-dvh overflow-hidden bg-slate-950 select-none"
    >
      <TrainCanvas
        config={config}
        hornTriggerCount={hornTriggerCount}
        onTelemetryUpdate={handleTelemetryUpdate}
        onFreeCamGesture={handleFreeCamGesture}
      />

      <ControlOverlay
        config={config}
        telemetry={telemetry}
        onChangeConfig={setConfig}
        onTriggerHorn={handleTriggerHorn}
      />
    </main>
  );
}
