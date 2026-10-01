import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import type { ActiveBlock, BlockDecision, BlockRequest, Corridor, StationItem, CorridorLeg } from "../api/types";
import { api } from "../api/api";
import { planningFetch } from "../api/planning";
import type { Operation } from "../api/planning";
import type { ColorBlindnessMode } from "../lib/accessibility";

type SpeedMultiplier = 1 | 2 | 5 | 10;

import { INITIAL_GQ_STATIONS } from "../data/initialStations";

export interface CameraTarget {
  lon: number;
  lat: number;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  transitionDuration?: number;
  timestamp: number;
  bounds?: [[number, number], [number, number]];
}

interface SimulationContextType {
  currentTime: string; // "HH:MM:SS"
  isPlaying: boolean;
  speedMultiplier: SpeedMultiplier;
  togglePlay: () => void;
  setSpeedMultiplier: (speed: SpeedMultiplier) => void;
  scrubToTime: (time: string) => void;
  activeBlocks: ActiveBlock[];
  commitActiveBlock: (request: BlockRequest, decision: BlockDecision, id?: string) => void;
  refreshOperations: () => Promise<void>;
  clearActiveBlock: (id: string) => void;
  prefillStation: string | null;
  setPrefillStation: (code: string | null) => void;
  // Accessibility Profile
  colorMode: ColorBlindnessMode;
  setColorMode: (mode: ColorBlindnessMode) => void;
  // Operator System Settings & Telemetry
  highPerformanceVfx: boolean;
  setHighPerformanceVfx: (enabled: boolean) => void;
  refreshRateMs: number;
  setRefreshRateMs: (rate: number) => void;
  pingMs: number;
  setPingMs: (ms: number) => void;
  packetsReceived: number;
  recordPacket: (latency?: number) => void;
  // Corridors & Stations State
  corridors: Corridor[];
  stations: StationItem[];
  globalStationList: StationItem[];
  isLoadingStations: boolean;
  stationsError: string | null;
  refreshCorridors: () => Promise<void>;
  // Camera Navigation
  cameraTarget: CameraTarget | null;
  flyToStation: (code: string) => void;
  flyToCoordinates: (
    lon: number,
    lat: number,
    zoom?: number,
    pitch?: number,
    bearing?: number,
    duration?: number
  ) => void;
  flyToBounds: (bounds: [[number, number], [number, number]], pitch?: number, duration?: number) => void;
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

export const SimulationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTime, setCurrentTime] = useState<string>(() => format(new Date(), "HH:mm:ss"));
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<SpeedMultiplier>(1);
  const [activeBlocks, setActiveBlocks] = useState<ActiveBlock[]>([]);
  const [prefillStation, setPrefillStation] = useState<string | null>(null);

  // Accessibility Color Blindness Mode
  const [colorMode, setColorModeState] = useState<ColorBlindnessMode>(() => {
    try {
      const saved = localStorage.getItem("SHADOW_BLOCK_COLOR_MODE");
      if (saved && ["standard", "protanopia", "deuteranopia", "tritanopia"].includes(saved)) {
        return saved as ColorBlindnessMode;
      }
    } catch {
      // ignore
    }
    return "standard";
  });

  const setColorMode = useCallback((mode: ColorBlindnessMode) => {
    setColorModeState(mode);
    try {
      localStorage.setItem("SHADOW_BLOCK_COLOR_MODE", mode);
    } catch {
      // ignore
    }
    document.body.setAttribute("data-theme", mode);
    document.documentElement.setAttribute("data-theme", mode);
  }, []);

  useEffect(() => {
    document.body.setAttribute("data-theme", colorMode);
    document.documentElement.setAttribute("data-theme", colorMode);
  }, [colorMode]);

  // Operator System Settings & Telemetry
  const [highPerformanceVfx, setHighPerformanceVfxState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("SHADOW_BLOCK_VFX");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const setHighPerformanceVfx = useCallback((enabled: boolean) => {
    setHighPerformanceVfxState(enabled);
    try {
      localStorage.setItem("SHADOW_BLOCK_VFX", String(enabled));
    } catch {
      // ignore
    }
  }, []);

  const [refreshRateMs, setRefreshRateMsState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("SHADOW_BLOCK_REFRESH_RATE");
      if (saved) return Number(saved);
    } catch {
      // ignore
    }
    return 2000;
  });

  const setRefreshRateMs = useCallback((rate: number) => {
    setRefreshRateMsState(rate);
    try {
      localStorage.setItem("SHADOW_BLOCK_REFRESH_RATE", String(rate));
    } catch {
      // ignore
    }
  }, []);

  const [pingMs, setPingMs] = useState<number>(14);
  const [packetsReceived, setPacketsReceived] = useState<number>(142);

  const recordPacket = useCallback((latency?: number) => {
    setPacketsReceived((prev) => prev + 1);
    if (latency !== undefined && latency > 0) {
      setPingMs(Math.round(latency));
    }
  }, []);

  // Corridors & Stations State (National & Cross-Corridor)
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [globalStationList, setGlobalStationList] = useState<StationItem[]>(INITIAL_GQ_STATIONS);
  const [stations, setStations] = useState<StationItem[]>(INITIAL_GQ_STATIONS);
  const [isLoadingStations, setIsLoadingStations] = useState<boolean>(true);
  const [stationsError, setStationsError] = useState<string | null>(null);

  // Camera Navigation
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);

  // Helper to map and flatten station records from either grouped dictionary or flat array
  const flattenStations = useCallback((raw: Record<string, StationItem[]> | StationItem[]): StationItem[] => {
    const stationMap = new Map<string, StationItem>();

    const mergeStation = (st: StationItem, legFallback?: string) => {
      if (!st || !st.code) return;
      const code = st.code.toUpperCase();
      const rawLegs = (st.legs && st.legs.length > 0 ? st.legs : legFallback ? [legFallback] : []) as CorridorLeg[];
      const existing = stationMap.get(code);

      if (!existing) {
        stationMap.set(code, {
          code,
          name: st.name || code,
          lat: st.lat,
          lon: st.lon,
          cumulative_km: st.cumulative_km,
          legs: [...new Set(rawLegs)],
          adjacentCodes: st.adjacentCodes ? [...st.adjacentCodes] : [],
          zone: st.zone,
          is_junction: rawLegs.length > 1 || (st.adjacentCodes && st.adjacentCodes.length > 2),
        });
      } else {
        rawLegs.forEach((leg) => {
          if (!existing.legs.includes(leg)) existing.legs.push(leg);
        });
        if (st.adjacentCodes) {
          st.adjacentCodes.forEach((adj) => {
            if (!existing.adjacentCodes.includes(adj)) existing.adjacentCodes.push(adj);
          });
        }
        if (st.cumulative_km !== undefined && existing.cumulative_km === undefined) {
          existing.cumulative_km = st.cumulative_km;
        }
        existing.is_junction = existing.legs.length > 1 || existing.adjacentCodes.length > 2;
      }
    };

    if (Array.isArray(raw)) {
      raw.forEach((s) => mergeStation(s));
    } else if (raw && typeof raw === "object") {
      Object.entries(raw).forEach(([legKey, stationList]) => {
        if (Array.isArray(stationList)) {
          stationList.forEach((s) => mergeStation(s, legKey));
        }
      });
    }

    return Array.from(stationMap.values());
  }, []);

  const loadCorridors = useCallback(async () => {
    setIsLoadingStations(true);
    try {
      const [corridorData, groupedStations, flatStations] = await Promise.all([
        api.getCorridors().catch(() => [] as Corridor[]),
        api.getStationsByCorridor().catch(() => null),
        api.getStations().catch(() => [] as StationItem[]),
      ]);

      if (corridorData.length > 0) {
        setCorridors(corridorData);
      }

      let mergedList: StationItem[] = [];

      // 1. If backend returns data grouped by corridor (e.g. { WEST: [...], EAST_COAST: [...] }), map & flatten
      if (groupedStations && typeof groupedStations === "object" && Object.keys(groupedStations).length > 0) {
        mergedList = flattenStations(groupedStations);
      } else if (flatStations && flatStations.length > 0) {
        mergedList = flattenStations(flatStations);
      } else if (corridorData.length > 0) {
        // Fallback: extract from corridors
        const corridorGrouped: Record<string, StationItem[]> = {};
        corridorData.forEach((c) => {
          corridorGrouped[c.leg_id] = c.stations.map((s, idx) => ({
            code: s.code,
            name: s.name,
            lat: s.lat,
            lon: s.lon,
            cumulative_km: s.cumulative_km,
            legs: [c.leg_id],
            adjacentCodes: [
              idx > 0 ? c.stations[idx - 1].code : null,
              idx < c.stations.length - 1 ? c.stations[idx + 1].code : null,
            ].filter(Boolean) as string[],
          }));
        });
        mergedList = flattenStations(corridorGrouped);
      }

      if (mergedList.length > 0) {
        setGlobalStationList(mergedList);
        setStations(mergedList);
      } else {
        setGlobalStationList(INITIAL_GQ_STATIONS);
        setStations(INITIAL_GQ_STATIONS);
      }

      setStationsError(null);
    } catch (err: any) {
      console.warn("Failed to load corridors from backend, falling back to full GQ dataset:", err);
      setStationsError(err.message || "Failed to load corridors");
      setGlobalStationList(INITIAL_GQ_STATIONS);
      setStations(INITIAL_GQ_STATIONS);
    } finally {
      setIsLoadingStations(false);
    }
  }, [flattenStations]);

  useEffect(() => {
    loadCorridors();
  }, [loadCorridors]);

  // Real-time Operator Clock: Ticks every second in HH:MM:SS
  useEffect(() => {
    const updateRealTimeClock = () => {
      setCurrentTime(format(new Date(), "HH:mm:ss"));
    };

    updateRealTimeClock();
    const intervalId = setInterval(updateRealTimeClock, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const togglePlay = () => setIsPlaying((prev) => !prev);

  const scrubToTime = (timeStr: string) => {
    setCurrentTime(timeStr);
  };

  const refreshOperations = useCallback(async () => {
    const records = await planningFetch<Operation[]>('/operations');
    setActiveBlocks(records.filter(op => op.status === 'ACTIVE' && op.snapshot).map(op => ({
      id: op.block_id, request: op.snapshot!.request, decision: op.snapshot!.decision, committedAt: op.created_at,
    })));
  }, []);

  useEffect(() => {
    refreshOperations().catch(error => console.warn('Persistent block history unavailable:', error));
  }, [refreshOperations]);

  const commitActiveBlock = (request: BlockRequest, decision: BlockDecision, id?: string) => {
    setActiveBlocks((blocks) => [
      ...blocks,
      {
        id: id || decision.block_id || `${request.from_station}-${request.to_station}-${Date.now()}`,
        request,
        decision,
        committedAt: new Date().toISOString(),
      },
    ]);
  };

  const clearActiveBlock = async (id: string) => {
    if (id.startsWith('BLK-')) {
      try { await planningFetch(`/operations/${encodeURIComponent(id)}/close`, {}); }
      catch (error) { window.alert(`Block was not closed: ${error instanceof Error ? error.message : error}`); return; }
    }
    setActiveBlocks((blocks) => blocks.filter((block) => block.id !== id));
  };

  const flyToCoordinates = useCallback(
    (
      lon: number,
      lat: number,
      zoom = 6.8,
      pitch = 55,
      bearing = -12,
      duration = 1800
    ) => {
      setCameraTarget({
        lon,
        lat,
        zoom,
        pitch,
        bearing,
        transitionDuration: duration,
        timestamp: Date.now(),
      });
    },
    []
  );

  const flyToStation = useCallback(
    (code: string) => {
      const target = stations.find((s) => s.code.toUpperCase() === code.toUpperCase());
      if (target) {
        flyToCoordinates(target.lon, target.lat, 6.8, 55, -12, 1800);
      }
    },
    [stations, flyToCoordinates]
  );

  const flyToBounds = useCallback(
    (bounds: [[number, number], [number, number]], pitch = 60, duration = 2000) => {
      const [[minLon, minLat], [maxLon, maxLat]] = bounds;
      setCameraTarget({
        lon: (minLon + maxLon) / 2,
        lat: (minLat + maxLat) / 2,
        pitch,
        bearing: -15,
        transitionDuration: duration,
        timestamp: Date.now(),
        bounds,
      });
    },
    [],
  );

  return (
    <SimulationContext.Provider
      value={{
        currentTime,
        isPlaying,
        speedMultiplier,
        togglePlay,
        setSpeedMultiplier,
        scrubToTime,
        activeBlocks,
        commitActiveBlock,
        refreshOperations,
        clearActiveBlock,
        prefillStation,
        setPrefillStation,
        colorMode,
        setColorMode,
        highPerformanceVfx,
        setHighPerformanceVfx,
        refreshRateMs,
        setRefreshRateMs,
        pingMs,
        setPingMs,
        packetsReceived,
        recordPacket,
        corridors,
        stations,
        globalStationList,
        isLoadingStations,
        stationsError,
        refreshCorridors: loadCorridors,
        cameraTarget,
        flyToStation,
        flyToCoordinates,
        flyToBounds,
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
};

export const useSimulation = () => {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error("useSimulation must be used within a SimulationProvider");
  }
  return context;
};
