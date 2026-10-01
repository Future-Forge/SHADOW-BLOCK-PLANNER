import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  MapPinned,
  Radio,
  RefreshCw,
  Server,
  Sparkles,
  TrainFront,
  Zap,
} from 'lucide-react';
import { NetworkMap } from './components/NetworkMap';
import { TacticalSidebar } from './components/TacticalSidebar';
import { ShadowBlockLoader } from './components/ShadowBlockLoader';
import { ActiveBlocksModal } from './components/ActiveBlocksModal';
import { PlanningLab } from './components/PlanningLab';
import { TopLeftHUD } from './components/TopLeftHUD';
import { api, getApiBaseUrl, setApiBaseUrl, isConnectedToBackend } from './api/api';
import type {
  BlockDecision,
  BlockRequest,
  TrafficPreviewResponse,
} from './api/types';
import { SimulationProvider, useSimulation } from './store/SimulationContext';
import { useLiveTrains } from './store/useLiveTrains';

const defaultRequest: BlockRequest = {
  from_station: 'ST',
  to_station: 'BCT',
  track_line: 'UP',
  requested_time: '12:00:00',
  duration_minutes: 60,
  department: 'TMS',
  criticality: 'NORMAL',
};

function AppShell() {
  const {
    currentTime,
    activeBlocks,
    commitActiveBlock,
    stations,
    corridors,
    flyToCoordinates,
    flyToBounds,
    refreshCorridors,
  } = useSimulation();

  const { trains, loading } = useLiveTrains();
  const [request, setRequest] = useState<BlockRequest>(defaultRequest);
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('manual');
  const [lastDecision, setLastDecision] = useState<BlockDecision | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isPlanningLabOpen, setIsPlanningLabOpen] = useState(false);
  const closePlanningLab = useCallback(() => setIsPlanningLabOpen(false), []);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Dynamic Traffic Pre-Fetch State
  const [previewTraffic, setPreviewTraffic] = useState<TrafficPreviewResponse | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Endpoint connection settings
  const [showEndpointModal, setShowEndpointModal] = useState(false);
  const [endpointInput, setEndpointInput] = useState(getApiBaseUrl());
  const [isBackendAlive, setIsBackendAlive] = useState(isConnectedToBackend());

  const checkConnection = async () => {
    try {
      await api.health();
      setIsBackendAlive(true);
    } catch {
      setIsBackendAlive(false);
    }
  };

  const handleSaveEndpoint = async () => {
    setApiBaseUrl(endpointInput);
    await checkConnection();
    await refreshCorridors();
    setShowEndpointModal(false);
  };

  const liveTrainCount = useMemo(() => trains.filter((train) => train.corridor_leg).length, [trains]);
  const sortedTrains = useMemo(
    () => [...trains].sort((a, b) => a.train_number.localeCompare(b.train_number)),
    [trains],
  );
  const activeBlockCount = activeBlocks.length;

  const updateRequest = <K extends keyof BlockRequest>(key: K, value: BlockRequest[K]) => {
    setRequest((prev) => ({ ...prev, [key]: value }));
  };

  // Debounced dynamic traffic pre-fetch (300ms)
  useEffect(() => {
    if (!request.from_station || !request.to_station) {
      setPreviewTraffic(null);
      return;
    }

    setIsPreviewLoading(true);
    const handler = setTimeout(async () => {
      try {
        const preview = await api.previewTraffic({
          from_station: request.from_station,
          to_station: request.to_station,
          track_line: request.track_line,
          requested_time: request.requested_time,
          duration_minutes: request.duration_minutes,
        });
        setPreviewTraffic(preview);
      } catch (err) {
        console.warn('Traffic pre-fetch error:', err);
        setPreviewTraffic(null);
      } finally {
        setIsPreviewLoading(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [
    request.from_station,
    request.to_station,
    request.track_line,
    request.requested_time,
    request.duration_minutes,
  ]);

  // Check which corridor leg contains both stations and auto-align track_line
  const sharedLeg = useMemo(() => {
    if (!request.from_station || !request.to_station) return null;
    return corridors.find(
      (c) =>
        c.stations.some((s) => s.code === request.from_station) &&
        c.stations.some((s) => s.code === request.to_station)
    );
  }, [corridors, request.from_station, request.to_station]);

  const setFromStation = (code: string) => {
    setRequest((prev) => {
      let newLine = prev.track_line;
      if (code && prev.to_station) {
        const leg = corridors.find(
          (c) => c.stations.some((s) => s.code === code) && c.stations.some((s) => s.code === prev.to_station)
        );
        if (leg) {
          const fromIdx = leg.stations.findIndex((s) => s.code === code);
          const toIdx = leg.stations.findIndex((s) => s.code === prev.to_station);
          if (fromIdx !== -1 && toIdx !== -1) {
            newLine = fromIdx < toIdx ? 'UP' : 'DOWN';
          }
        }
      }
      return { ...prev, from_station: code, track_line: newLine };
    });
  };

  const setToStation = (code: string) => {
    setRequest((prev) => {
      let newLine = prev.track_line;
      if (prev.from_station && code) {
        const leg = corridors.find(
          (c) => c.stations.some((s) => s.code === prev.from_station) && c.stations.some((s) => s.code === code)
        );
        if (leg) {
          const fromIdx = leg.stations.findIndex((s) => s.code === prev.from_station);
          const toIdx = leg.stations.findIndex((s) => s.code === code);
          if (fromIdx !== -1 && toIdx !== -1) {
            newLine = fromIdx < toIdx ? 'UP' : 'DOWN';
          }
        }
      }
      return { ...prev, to_station: code, track_line: newLine };
    });
  };

  const handleAnalyze = async () => {
    if (!request.from_station || !request.to_station) {
      setAnalysisError('Please select both Origin and Destination stations.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    const startTime = Date.now();

    try {
      const decision = await api.analyzeBlock(request);
      setLastDecision(decision);
      setIsPlanningLabOpen(true);

      // Cinematic Camera FlyTo: Sweep to the midpoint of the block section
      // Zoom tightly (11) and pitch 60 degrees for 3D extrusion perspective
      const fromSt = stations.find((s) => s.code === request.from_station);
      const toSt = stations.find((s) => s.code === request.to_station);
      if (fromSt && toSt) {
        const bounds: [[number, number], [number, number]] = [
          [Math.min(fromSt.lon, toSt.lon), Math.min(fromSt.lat, toSt.lat)],
          [Math.max(fromSt.lon, toSt.lon), Math.max(fromSt.lat, toSt.lat)],
        ];
        flyToBounds(bounds, 60, 2000);
      }
    } catch (err: any) {
      console.error('Block analysis error:', err);
      setAnalysisError(err instanceof Error ? err.message : String(err));
    } finally {
      // Keep tactical loading screen visible for at least 950ms for low-fatigue visual feedback
      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, 950 - elapsed);
      setTimeout(() => {
        setIsAnalyzing(false);
      }, delay);
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0D1311] text-[#E2EAF4]">
      <div
        className="fixed left-0 top-0 z-40 h-screen w-8"
        onMouseEnter={() => setIsSidebarOpen(true)}
        aria-hidden="true"
      />

      <motion.aside
        initial={{ x: '-100%' }}
        animate={{ x: isSidebarOpen ? 0 : '-100%' }}
        transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        onMouseEnter={() => setIsSidebarOpen(true)}
        onMouseLeave={() => setIsSidebarOpen(false)}
        className="fixed left-0 top-0 z-50 h-screen w-[420px] max-w-[calc(100vw-2rem)] border-r border-[#2C3A35] bg-[#0D1311]/95 shadow-[20px_0_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
      >
        <TacticalSidebar
          request={request}
          updateRequest={updateRequest}
          setFromStation={setFromStation}
          setToStation={setToStation}
          sharedLeg={sharedLeg}
          previewTraffic={previewTraffic}
          isPreviewLoading={isPreviewLoading}
          analysisError={analysisError}
          isAnalyzing={isAnalyzing}
          onAnalyze={handleAnalyze}
          currentTime={currentTime}
          onExecuteBlock={(blockReq, decision) => {
            commitActiveBlock(blockReq, decision);
            setLastDecision(decision);
          }}
          onFlyTo={(lon, lat, zoom, pitch, bearing) => {
            flyToCoordinates(lon, lat, zoom ?? 11, pitch ?? 60, bearing ?? -15, 2000);
          }}
          onApplyDecision={(decision) => {
            setLastDecision(decision);
          }}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </motion.aside>

      {/* Full-viewport map surface; tactical panels float above it. */}
      <main className="relative h-full w-full">
        <button onClick={() => { setLastDecision(null); setIsPlanningLabOpen(true); }} className="absolute right-6 top-[100px] z-40 rounded-xl border border-emerald-400/50 bg-[#13211d]/95 px-4 py-3 text-sm font-semibold text-emerald-300 shadow-xl">Planning Lab · Weather & history</button>
        {isPlanningLabOpen && <PlanningLab initialRequest={request} initialDecision={lastDecision} onClose={closePlanningLab} />}
        {/* 3D WebGL / Deck.gl Map */}
        <NetworkMap trains={trains} onBlockClick={() => setIsBlockModalOpen(true)} />

        {/* Deep desaturated slate-green vignette for military-grade low fatigue */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(26,36,33,0.02),_rgba(13,19,17,0.12)_50%,_rgba(13,19,17,0.42)_100%)]" />

        {/* Tactical Shadow Block Loader */}
        <ShadowBlockLoader
          isOpen={isAnalyzing}
          fromStation={request.from_station}
          toStation={request.to_station}
          criticality={request.criticality}
          durationMinutes={request.duration_minutes}
        />

        {/* Header widgets use independent anchors so their widths cannot collide. */}
        <div className="pointer-events-none absolute left-6 top-6 z-40">
          <TopLeftHUD
            isBackendAlive={isBackendAlive}
            onOpenEndpointModal={() => {
              setEndpointInput(getApiBaseUrl());
              checkConnection();
              setShowEndpointModal(true);
            }}
          />
        </div>

        <div className="pointer-events-auto absolute left-1/2 top-[108px] z-40 -translate-x-1/2">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-[22px] border border-[#2C3A35] bg-[#1A2421]/60 px-5 py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.65)] backdrop-blur-xl"
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-[#E2EAF4]/60 font-mono font-bold">
                <Radio className="h-4 w-4 text-[#34D399] animate-pulse" />
                LIVE TELEMETRY
              </div>

              <div className="h-4 w-px bg-[#2C3A35]" />

              <div className="font-mono text-2xl font-semibold tracking-[0.16em] text-[#E2EAF4] drop-shadow-[0_0_12px_rgba(52,211,153,0.35)]">
                {currentTime}
              </div>

              {/* Pulsing SYNCED Indicator */}
              <div className="flex items-center gap-2 rounded-full border border-[#34D399]/40 bg-[#34D399]/10 px-2.5 py-1 shadow-[0_0_10px_rgba(52,211,153,0.2)]">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#34D399] shadow-[0_0_8px_#34D399]" />
                </span>
                <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#34D399]">
                  SYNCED
                </span>
              </div>
            </div>
          </motion.div>

        </div>

        <div className="pointer-events-auto absolute right-6 top-6 z-40">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[20px] border border-[#2C3A35] bg-[#1A2421]/60 px-4 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-xl"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#2C3A35] bg-[#0D1311]/80 text-[#34D399]">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#E2EAF4]/50 font-mono">traction load</div>
                <div className="font-mono text-base text-[#34D399] font-bold">86.4 MW</div>
              </div>
            </div>
          </motion.div>
        </div>

      {/* Right Bottom Panel: Network State & Decision Output */}
      <motion.aside
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="pointer-events-auto absolute right-6 bottom-6 w-[420px] rounded-[24px] border border-[#2C3A35] bg-[#1A2421]/60 p-6 shadow-[0_4px_32px_rgba(0,0,0,0.7)] backdrop-blur-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#2C3A35] bg-[#0D1311]/80 text-[#A7F3D0]">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.32em] text-[#A7F3D0]/80 font-mono font-bold">
                TELEMETRY STATE
              </p>
              <h3 className="mt-0.5 text-lg font-semibold text-[#E2EAF4]">Network Pulse</h3>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<TrainFront className="h-4 w-4" />}
              label="Active Trains"
              value={String(liveTrainCount)}
              accent="cyan"
            />
            {/* Interactive Shadow Blocks Hub Button */}
            <button
              type="button"
              onClick={() => setIsBlockModalOpen((prev) => !prev)}
              className="group text-left rounded-xl border border-[#2C3A35] p-3 bg-[#0D1311]/80 hover:bg-tactical-panel/80 hover:ring-1 hover:ring-accent-maintenance cursor-pointer transition-all outline-none"
              title="Open Active Blocks Command Console"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2C3A35] bg-[#1A2421] text-[#FCD34D] group-hover:border-[#A7F3D0] group-hover:text-[#A7F3D0] transition-colors">
                  <MapPinned className="h-4 w-4" />
                </div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#A7F3D0] opacity-0 group-hover:opacity-100 transition-opacity">
                  COMMAND ➔
                </span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-[#E2EAF4]/50 font-mono group-hover:text-[#E2EAF4]/80 transition-colors">
                Shadow Blocks
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="font-mono text-xl font-bold text-[#E2EAF4] drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                  {activeBlockCount}
                </span>
                {activeBlockCount > 0 && (
                  <span className="rounded-full border border-[#34D399]/40 bg-[#34D399]/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#34D399]">
                    ACTIVE
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* Block Decision Output Card */}
          <div className="rounded-xl border border-[#2C3A35] bg-[#0D1311]/80 p-3.5">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-[#E2EAF4]/50 font-mono">
              <span>SOLVER RESOLUTION</span>
              <span className="font-mono text-[#34D399]">{lastDecision ? 'SOLVED' : 'AWAITING'}</span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={lastDecision ? lastDecision.status : 'idle'}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-2 text-xs"
              >
                {lastDecision ? (
                  <>
                    <div className="flex items-center justify-between border-b border-[#2C3A35] pb-1.5">
                      <span className="text-[#E2EAF4]/60">Status</span>
                      <span className="flex items-center gap-1.5 font-mono font-bold text-[#A7F3D0]">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#34D399]" />
                        {lastDecision.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-[#2C3A35] pb-1.5">
                      <span className="text-[#E2EAF4]/60">Window</span>
                      <span className="font-mono text-[#E2EAF4] font-semibold">
                        {lastDecision.block_window.start} — {lastDecision.block_window.end}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-[#2C3A35] pb-1.5">
                      <span className="text-[#E2EAF4]/60">Asset Availability</span>
                      <span className="font-mono text-[#34D399] font-bold">
                        {Math.round(lastDecision.asset_availability_index)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#E2EAF4]/60">Affected Traffic</span>
                      <span className="font-mono text-[#F97316] font-bold">
                        {lastDecision.affected_trains.length} units
                      </span>
                    </div>
                    {lastDecision.notes && (
                      <p className="mt-2 text-[10px] italic text-[#E2EAF4]/60 border-t border-[#2C3A35] pt-1.5 leading-relaxed">
                        &ldquo;{lastDecision.notes}&rdquo;
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-[#E2EAF4]/50 py-2">
                    <Sparkles className="h-4 w-4 text-[#A7F3D0]" />
                    <span>Awaiting segment directive submission.</span>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Telemetry Feed */}
          <div className="rounded-xl border border-[#2C3A35] bg-[#0D1311]/80 p-3">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-[#E2EAF4]/50 font-mono">
              <span>ACTIVE TELEMETRY</span>
              <span className="font-mono text-[#A7F3D0]">{loading ? 'SYNCING' : 'ONLINE'}</span>
            </div>
            <ul className="space-y-1.5 text-xs text-[#E2EAF4]/85">
              {sortedTrains.slice(0, 3).map((train) => (
                <li
                  key={train.train_number}
                  className="flex items-center justify-between border-b border-[#2C3A35]/60 pb-1.5 last:border-none last:pb-0"
                >
                  <span className="font-mono text-[#E2EAF4] font-semibold">{train.train_number}</span>
                  <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[#E2EAF4]/50 font-mono">
                    <Gauge className="h-3 w-3 text-[#FCD34D]" />
                    {Math.round(train.speed_kmph)} km/h
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.aside>

      {/* Active interference notification */}
      {activeBlocks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-auto absolute left-1/2 top-[196px] z-30 -translate-x-1/2 rounded-[20px] border border-[#EF4444]/40 bg-[#1A2421]/90 px-4 py-2 text-xs shadow-[0_4px_24px_rgba(0,0,0,0.8)] backdrop-blur-xl"
        >
          <div className="flex items-center gap-2 text-[#EF4444]">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-mono uppercase tracking-[0.22em] text-[10px] font-bold">
              {activeBlocks.length} ACTIVE INFRASTRUCTURE SHADOW BLOCK{activeBlocks.length > 1 ? 'S' : ''} ENFORCED
            </span>
          </div>
        </motion.div>
      )}
      </main>

      {/* Endpoint Configuration Modal - Tactical Specification */}
      <AnimatePresence>
        {showEndpointModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-md rounded-2xl border border-[#2C3A35] bg-[#1A2421] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.9)] backdrop-blur-xl text-[#E2EAF4]"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Server className="h-5 w-5 text-[#A7F3D0]" />
                  <h3 className="text-base font-bold tracking-wide text-[#E2EAF4]">Backend Dispatch Endpoint</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEndpointModal(false)}
                  className="rounded-lg p-1 text-[#E2EAF4]/50 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <p className="mb-4 text-xs text-[#E2EAF4]/70 leading-relaxed">
                Configure your FastAPI base URL. If <code className="text-[#A7F3D0] bg-[#0D1311] px-1 py-0.5 rounded border border-[#2C3A35]">localhost</code> is disabled or restricted in your environment, use <code className="text-[#A7F3D0] bg-[#0D1311] px-1 py-0.5 rounded border border-[#2C3A35]">http://127.0.0.1:8000</code> or your Wi-Fi LAN IP.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.24em] text-[#E2EAF4]/60 font-mono">
                    API Base URL
                  </label>
                  <input
                    type="text"
                    value={endpointInput}
                    onChange={(e) => setEndpointInput(e.target.value)}
                    placeholder="http://127.0.0.1:8000"
                    className="w-full rounded-xl border border-[#2C3A35] bg-[#0D1311] px-3.5 py-2 font-mono text-sm text-[#E2EAF4] focus:border-[#A7F3D0] focus:outline-none"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEndpointInput('http://127.0.0.1:8000')}
                    className="rounded-lg border border-[#2C3A35] bg-[#0D1311] px-2.5 py-1 text-[10px] font-mono text-[#A7F3D0] hover:border-[#A7F3D0]"
                  >
                    127.0.0.1:8000
                  </button>
                  <button
                    type="button"
                    onClick={() => setEndpointInput('http://localhost:8000')}
                    className="rounded-lg border border-[#2C3A35] bg-[#0D1311] px-2.5 py-1 text-[10px] font-mono text-[#E2EAF4]/70 hover:border-[#A7F3D0]"
                  >
                    localhost:8000
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-[#2C3A35] bg-[#0D1311] p-3">
                  <span className="text-xs text-[#E2EAF4]/60 font-mono">STATUS:</span>
                  <span
                    className={`font-mono text-xs font-bold ${
                      isBackendAlive ? 'text-[#34D399]' : 'text-[#A7F3D0]'
                    }`}
                  >
                    {isBackendAlive ? '● CONNECTED (LIVE FASTAPI)' : '○ AUTONOMOUS SIMULATION ACTIVE'}
                  </span>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={checkConnection}
                    className="flex items-center gap-1.5 rounded-xl border border-[#2C3A35] bg-[#0D1311] px-4 py-2 text-xs text-[#E2EAF4] transition hover:border-[#A7F3D0]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Test Link
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEndpoint}
                    className="rounded-xl bg-[#A7F3D0] hover:bg-[#34D399] px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#0D1311] shadow-[0_0_12px_rgba(167,243,208,0.35)] transition"
                  >
                    Apply Target
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Blocks Command Modal */}
      <ActiveBlocksModal
        isOpen={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: 'cyan' | 'amber';
}) {
  const accentBorder = accent === 'cyan' ? 'border-[#2C3A35]' : 'border-[#2C3A35]';
  const iconColor = accent === 'cyan' ? 'text-[#A7F3D0]' : 'text-[#FCD34D]';

  return (
    <div className={`rounded-xl border p-3 bg-[#0D1311]/80 ${accentBorder}`}>
      <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-lg border border-[#2C3A35] bg-[#1A2421] ${iconColor}`}>
        {icon}
      </div>
      <div className="text-[10px] uppercase tracking-[0.22em] text-[#E2EAF4]/50 font-mono">{label}</div>
      <div className="mt-1 font-mono text-xl font-bold text-[#E2EAF4] drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
        {value}
      </div>
    </div>
  );
}

function App() {
  return (
    <SimulationProvider>
      <AppShell />
    </SimulationProvider>
  );
}

export default App;
