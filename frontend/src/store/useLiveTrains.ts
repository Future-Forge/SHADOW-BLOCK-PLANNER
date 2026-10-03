import { useState, useEffect, useRef, useCallback } from 'react';
import { requestApi } from '../api/api';
import type { LiveTrainState, TrainSnapshot } from '../api/types';
import { useSimulation } from './SimulationContext';

/** Retain last-known positions on failure, labelled stale. Never invent a feed. */
export function useLiveTrains() {
  const { currentTime, isPlaying, refreshRateMs, recordPacket } = useSimulation();
  const [trains, setTrains] = useState<LiveTrainState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const timeRef = useRef(currentTime);
  const packetRef = useRef(recordPacket);
  const sequence = useRef(0);
  useEffect(() => { timeRef.current = currentTime; packetRef.current = recordPacket; }, [currentTime, recordPacket]);
  const pausedTime = isPlaying ? null : currentTime;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const generation = ++sequence.current;
    const fetchSnapshot = async () => {
      const started = performance.now();
      try {
                const snapshot = await requestApi<TrainSnapshot>(
          `/api/v1/trains/snapshot?time=${encodeURIComponent(timeRef.current)}`,
          { signal: controller.signal },);
        if (!active || generation !== sequence.current) return;
        const unique = new Map(snapshot.trains.filter(t => t.corridor_leg && Number.isFinite(t.lat) && Number.isFinite(t.lon)).map(t => [t.train_number, t]));
        setTrains([...unique.values()]);
        setError(null);
        setLastUpdated(snapshot.simulation_time);
        packetRef.current(performance.now() - started);
      } catch (err) {
        if (active) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (active) {
          setLoading(false);
          if (isPlaying) timer = setTimeout(fetchSnapshot, Math.max(1000, refreshRateMs));
        }
      }
    };
    if (isPlaying) void fetchSnapshot();
    else timer = setTimeout(fetchSnapshot, 150);
    return () => {       active = false;
      controller.abort();; clearTimeout(timer); };
  }, [isPlaying, pausedTime, refreshRateMs, retryKey]);

  const retry = useCallback(() => setRetryKey(key => key + 1), []);
  return { trains, loading, error, lastUpdated, retry };
}
