import { useState, useEffect, useRef, useMemo } from "react";
import { api } from "../api/client";
import type { LiveTrainState } from "../api/types";
import { useSimulation } from "./SimulationContext";

const MAX_VISIBLE_TRAINS = 64;

function normalizeLiveTrains(data: LiveTrainState[]): LiveTrainState[] {
  const uniqueByNumber = new Map<string, LiveTrainState>();
  data.forEach((train) => {
    if (train.corridor_leg && !uniqueByNumber.has(train.train_number)) {
      uniqueByNumber.set(train.train_number, train);
    }
  });

  const categoryPriority: Record<LiveTrainState["category"], number> = {
    PREMIUM: 0,
    SUPERFAST: 1,
    EXPRESS: 2,
    PASSENGER: 3,
    FREIGHT: 4,
  };

  return Array.from(uniqueByNumber.values())
    .sort(
      (left, right) =>
        categoryPriority[left.category] - categoryPriority[right.category] ||
        left.train_number.localeCompare(right.train_number),
    )
    .slice(0, MAX_VISIBLE_TRAINS);
}

export function useLiveTrains() {
  const { currentTime, isPlaying, refreshRateMs, recordPacket } = useSimulation();
  const [rawTrains, setRawTrains] = useState<LiveTrainState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  const recordPacketRef = useRef(recordPacket);
  recordPacketRef.current = recordPacket;
  const requestInFlightRef = useRef(false);

  useEffect(() => {
    let active = true;

    const fetchTrains = async () => {
      if (requestInFlightRef.current) return;
      requestInFlightRef.current = true;
      const tStart = performance.now();
      try {
        const timeToFetch = currentTimeRef.current;
        const data = await api.getLiveTrains(timeToFetch);
        const latency = performance.now() - tStart;
        if (active) {
          setRawTrains(normalizeLiveTrains(data));
          setError(null);
          setLoading(false);
          recordPacketRef.current(latency);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      } finally {
        requestInFlightRef.current = false;
      }
    };

    // Initial fetch
    fetchTrains();

    // Game loop polling matching telemetry directive with configurable refresh rate
    const interval = setInterval(() => {
      if (isPlaying) {
        fetchTrains();
      }
    }, refreshRateMs || 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isPlaying, refreshRateMs]);

  // When currentTime is scrubbed manually (e.g. paused or user scrub), fetch immediately
  useEffect(() => {
    if (!isPlaying) {
      let active = true;
      api.getLiveTrains(currentTime).then((data) => {
        if (active) {
          setRawTrains(normalizeLiveTrains(data));
        }
      }).catch((err) => {
        if (active) setError(err);
      });
      return () => { active = false; };
    }
  }, [currentTime, isPlaying]);

  const trains = useMemo(
    () => [...rawTrains].sort((a, b) => String(a.train_number).localeCompare(String(b.train_number))),
    [rawTrains],
  );

  return { trains, loading, error };
}
