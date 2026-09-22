import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ShieldAlert,
  Clock,
  ChevronDown,
  ChevronUp,
  X,
  MapPin,
  LocateFixed,
  Trash2,
  TrainFront,
  CheckCircle2,
  Check,
  FileDown,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { api } from '../api/api';
import { useSimulation } from '../store/SimulationContext';
import type { ActiveBlock, BlockResourceData, EquipmentCategory } from '../api/types';

interface ActiveBlocksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ActiveBlocksModal: React.FC<ActiveBlocksModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { activeBlocks, clearActiveBlock, stations, corridors, flyToBounds, flyToCoordinates } = useSimulation();
  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Record<string, boolean>>({});
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(() => Date.now());
  const [resourceExpandedIds, setResourceExpandedIds] = useState<Record<string, boolean>>({});
  const [resourceDataByBlockId, setResourceDataByBlockId] = useState<Record<string, BlockResourceData>>({});
  const [resourceLoadingIds, setResourceLoadingIds] = useState<Record<string, boolean>>({});
  const [checkedResourceItems, setCheckedResourceItems] = useState<Record<string, Record<string, boolean>>>({});
  const [allocatedBlockIds, setAllocatedBlockIds] = useState<Record<string, boolean>>({});

  // Dynamically tick live countdown timer every second
  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleExpand = (id: string) => {
    setCollapsedBlockIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleLocate = (block: ActiveBlock) => {
    const fromSt = stations.find((s) => s.code === block.request.from_station);
    const toSt = stations.find((s) => s.code === block.request.to_station);

    const geometry = block.decision.block_geometry;
    const corridor = corridors.find(
      (candidate) =>
        candidate.stations.some((station) => station.code === block.request.from_station) &&
        candidate.stations.some((station) => station.code === block.request.to_station),
    );
    const fromIndex = corridor?.stations.findIndex((station) => station.code === block.request.from_station) ?? -1;
    const toIndex = corridor?.stations.findIndex((station) => station.code === block.request.to_station) ?? -1;
    const corridorPath = corridor && fromIndex >= 0 && toIndex >= 0
      ? corridor.stations
          .slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex) + 1)
          .map((station) => [station.lon, station.lat] as [number, number])
      : [];
    const positions = geometry && geometry.length >= 2
      ? geometry
      : corridorPath.length >= 2
      ? corridorPath
      : fromSt && toSt
      ? [[fromSt.lon, fromSt.lat], [toSt.lon, toSt.lat]] as [number, number][]
      : [];

    if (positions.length >= 2) {
      const longitudes = positions.map(([lon]) => lon);
      const latitudes = positions.map(([, lat]) => lat);
      flyToBounds(
        [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]],
        60,
        2000,
      );
    } else if (fromSt) {
      flyToCoordinates(fromSt.lon, fromSt.lat, 11, 60, -15, 2000);
    }

    onClose();
  };

  const getResourceParams = (block: ActiveBlock) => {
    const corridor = corridors.find(
      (candidate) =>
        candidate.stations.some((station) => station.code === block.request.from_station) &&
        candidate.stations.some((station) => station.code === block.request.to_station),
    );
    const from = corridor?.stations.find((station) => station.code === block.request.from_station);
    const to = corridor?.stations.find((station) => station.code === block.request.to_station);
    const corridorArm: BlockResourceData['corridorArm'] =
      corridor?.leg_id === 'WEST'
        ? 'WESTERN'
        : corridor?.leg_id === 'NORTH_EAST'
        ? 'GANGETIC'
        : corridor?.leg_id === 'EAST_COAST'
        ? 'EAST_COASTAL'
        : 'DECCAN';

    return {
      blockId: block.id,
      department: block.request.department,
      defectType: block.request.criticality === 'EMERGENCY' ? 'Rail Fracture' : 'Track Geometry Deviation',
      corridorArm,
      lengthKm: Math.min(
        50,
        Math.max(0.2, Math.abs((to?.cumulative_km ?? 1) - (from?.cumulative_km ?? 0))),
      ),
    };
  };

  const toggleResourceAccordion = async (block: ActiveBlock) => {
    const willOpen = !resourceExpandedIds[block.id];
    setResourceExpandedIds((prev) => ({ ...prev, [block.id]: willOpen }));
    if (!willOpen || resourceDataByBlockId[block.id]) return;

    setResourceLoadingIds((prev) => ({ ...prev, [block.id]: true }));
    try {
      const resourceData = await api.getBlockResources(getResourceParams(block));
      setResourceDataByBlockId((prev) => ({ ...prev, [block.id]: resourceData }));
    } finally {
      setResourceLoadingIds((prev) => ({ ...prev, [block.id]: false }));
    }
  };

  const toggleResourceItem = (blockId: string, itemId: string) => {
    setCheckedResourceItems((prev) => ({
      ...prev,
      [blockId]: { ...prev[blockId], [itemId]: !prev[blockId]?.[itemId] },
    }));
  };

  const formatCountdown = (committedAt: string, durationMinutes: number) => {
    const startMs = new Date(committedAt).getTime();
    const durationMs = (durationMinutes || 60) * 60 * 1000;
    const endMs = startMs + durationMs;
    const diffSec = Math.max(0, Math.floor((endMs - currentTimeMs) / 1000));

    const hours = Math.floor(diffSec / 3600)
      .toString()
      .padStart(2, '0');
    const mins = Math.floor((diffSec % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const secs = (diffSec % 60).toString().padStart(2, '0');

    return {
      formatted: `${hours}:${mins}:${secs}`,
      isExpired: diffSec === 0,
      totalSeconds: diffSec,
    };
  };

  const getStationName = (code: string) => {
    const st = stations.find((s) => s.code === code);
    return st ? st.name : code;
  };

  const getCriticalityBadge = (criticality: string) => {
    switch (criticality) {
      case 'EMERGENCY':
        return 'border-[#EF4444]/60 bg-[#EF4444]/15 text-[#EF4444] shadow-[0_0_10px_rgba(239,68,68,0.3)]';
      case 'MAJOR':
        return 'border-[#F97316]/60 bg-[#F97316]/15 text-[#F97316] shadow-[0_0_10px_rgba(249,115,22,0.25)]';
      default:
        return 'border-[#34D399]/60 bg-[#34D399]/15 text-[#34D399] shadow-[0_0_10px_rgba(52,211,153,0.2)]';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop with 2xl tactical blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#0D1311]/80 backdrop-blur-2xl"
          />

          {/* Centered glassmorphic command modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-[24px] border border-[#2C3A35] bg-[#0D1311]/90 shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl text-[#E2EAF4] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#2C3A35] px-6 py-4 bg-[#1A2421]/60">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#2C3A35] bg-[#0D1311]/90 text-[#A7F3D0] shadow-[0_0_12px_rgba(167,243,208,0.25)]">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-[0.32em] text-[#A7F3D0]">
                      TACTICAL COMMAND
                    </span>
                    <span className="inline-flex items-center rounded-full bg-[#1A2421] px-2 py-0.5 text-[9px] font-mono text-[#E2EAF4]/70 border border-[#2C3A35]">
                      {activeBlocks.length} ACTIVE ENFORCED
                    </span>
                  </div>
                  <h2 className="text-lg font-bold tracking-wide text-[#E2EAF4]">
                    Active Shadow Blocks Matrix
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[#2C3A35] bg-[#0D1311]/80 p-2 text-[#E2EAF4]/60 transition hover:border-[#A7F3D0] hover:text-[#E2EAF4] hover:shadow-[0_0_10px_rgba(167,243,208,0.2)]"
                title="Close Command Modal (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {activeBlocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#2C3A35] bg-[#1A2421]/40 text-[#A7F3D0]/60 mb-4">
                    <CheckCircle2 className="h-8 w-8 text-[#34D399]" />
                  </div>
                  <h3 className="text-base font-bold text-[#E2EAF4] font-mono tracking-wider">
                    NO ACTIVE SHADOW BLOCKS ENFORCED
                  </h3>
                  <p className="mt-1 text-xs text-[#E2EAF4]/60 max-w-sm">
                    All Golden Quadrilateral trunk corridors are operating under nominal headway. Submit a delta window spec on the planner console to enforce a new shadow block.
                  </p>
                </div>
              ) : (
                activeBlocks.map((block) => {
                  const countdown = formatCountdown(
                    block.committedAt,
                    block.request.duration_minutes
                  );
                  const isExpanded = !collapsedBlockIds[block.id];
                  const affectedTrains = block.decision?.affected_trains || [];
                  const resourceData = resourceDataByBlockId[block.id];
                  const checkedItems = checkedResourceItems[block.id] || {};
                  const mandatoryItems = resourceData?.equipmentList.filter((item) => item.isMandatory) || [];
                  const checkedMandatoryItems = mandatoryItems.filter((item) => checkedItems[item.id]).length;
                  const mandatoryProgress = mandatoryItems.length
                    ? Math.round((checkedMandatoryItems / mandatoryItems.length) * 100)
                    : 0;

                  return (
                    <motion.div
                      key={block.id}
                      layout
                      className="rounded-2xl border border-[#2C3A35] bg-[#1A2421]/70 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.5)] transition hover:border-[#2C3A35]/90"
                    >
                      {/* Top Row: Location & Criticality */}
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#2C3A35]/70 pb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase ${getCriticalityBadge(
                                block.request.criticality
                              )}`}
                            >
                              {block.request.department} — {block.request.criticality}
                            </span>
                            <span className="rounded-md border border-[#2C3A35] bg-[#0D1311]/80 px-2 py-0.5 font-mono text-[10px] text-[#A7F3D0]">
                              TRK {block.request.track_line}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 font-mono text-base font-bold text-[#E2EAF4] pt-1">
                            <MapPin className="h-4 w-4 text-[#A7F3D0] shrink-0" />
                            <span>{block.request.from_station}</span>
                            <span className="text-[#E2EAF4]/40 font-normal">
                              ({getStationName(block.request.from_station)})
                            </span>
                            <span className="text-[#A7F3D0] px-1">➔</span>
                            <span>{block.request.to_station}</span>
                            <span className="text-[#E2EAF4]/40 font-normal">
                              ({getStationName(block.request.to_station)})
                            </span>
                          </div>
                        </div>

                        {/* Live Countdown Timer Badge */}
                        <div className="flex flex-col items-end gap-1.5">
                          <div
                            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-xs font-bold ${
                              countdown.isExpired
                                ? 'border-[#EF4444]/60 bg-[#EF4444]/15 text-[#EF4444]'
                                : 'border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399] shadow-[0_0_12px_rgba(52,211,153,0.15)]'
                            }`}
                          >
                            <Clock className="h-3.5 w-3.5 text-[#34D399] animate-spin" style={{ animationDuration: '6s' }} />
                            <span>
                              {countdown.isExpired
                                ? 'EXPIRED'
                                : `Time Remaining: ${countdown.formatted}`}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#E2EAF4]/50 font-mono">
                            Allocated: {block.request.duration_minutes}m · Window:{' '}
                            {block.decision.block_window.start} - {block.decision.block_window.end}
                          </span>
                        </div>
                      </div>

                      {/* Middle Row: Quick Stats & Actions */}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-4 font-mono text-[11px] text-[#E2EAF4]/70">
                          <div>
                            <span>Asset Index: </span>
                            <span className="text-[#34D399] font-bold">
                              {Math.round(block.decision.asset_availability_index)}%
                            </span>
                          </div>
                          <div className="h-3 w-px bg-[#2C3A35]" />
                          <div>
                            <span>Impact: </span>
                            <span
                              className={
                                affectedTrains.length > 0
                                  ? 'text-[#F97316] font-bold'
                                  : 'text-[#34D399] font-bold'
                              }
                            >
                              {affectedTrains.length}{' '}
                              {affectedTrains.length === 1 ? 'train' : 'trains'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleLocate(block)}
                            className="flex items-center gap-1.5 rounded-lg border border-[#2C3A35] bg-[#0D1311]/90 px-3 py-1.5 text-[11px] font-mono text-[#A7F3D0] transition hover:border-[#A7F3D0] hover:bg-[#1A2421] hover:shadow-[0_0_8px_rgba(167,243,208,0.2)]"
                          >
                            <LocateFixed className="h-3.5 w-3.5" />
                            <span>LOCATE 3D</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => clearActiveBlock(block.id)}
                            className="flex items-center gap-1.5 rounded-lg border border-[#EF4444]/40 bg-[#0D1311]/90 px-3 py-1.5 text-[11px] font-mono text-[#EF4444] transition hover:border-[#EF4444] hover:bg-[#EF4444]/15 hover:shadow-[0_0_8px_rgba(239,68,68,0.25)]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>DE-ESCALATE</span>
                          </button>
                        </div>
                      </div>

                      {/* Collapsible Affected Traffic Sub-panel */}
                      <div className="mt-4 rounded-xl border border-[#2C3A35] bg-[#0D1311]/80 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleExpand(block.id)}
                          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-mono transition hover:bg-[#1A2421]/50"
                        >
                          <div className="flex items-center gap-2">
                            <TrainFront className="h-4 w-4 text-[#A7F3D0]" />
                            <span className="font-bold tracking-wider uppercase text-[#E2EAF4]">
                              AFFECTED TRAFFIC MATRIX
                            </span>
                            <span className="rounded-full bg-[#1A2421] px-2 py-0.2 text-[10px] text-[#A7F3D0] border border-[#2C3A35]">
                              {affectedTrains.length}
                            </span>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-[#E2EAF4]/50" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-[#E2EAF4]/50" />
                          )}
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="border-t border-[#2C3A35]/60 px-3.5 py-3 space-y-2"
                            >
                              {affectedTrains.length === 0 ? (
                                <div className="flex items-center gap-2 text-xs font-mono text-[#34D399] py-1">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>ZERO DELAY TRAFFIC IMPACT · Headway slot clear</span>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {affectedTrains.map((train) => {
                                    const statusText =
                                      train.action === 'HOLD'
                                        ? `CONFLICT (HELD AT ${train.hold_station || block.request.from_station})`
                                        : train.action === 'CAUTION'
                                        ? 'RESTRICTED (SPEED LIMIT)'
                                        : train.action === 'DIVERT'
                                        ? 'CONFLICT (DIVERT LOOP)'
                                        : train.action === 'LOOP'
                                        ? 'REGULATED (IN LOOP)'
                                        : 'SCHEDULE ADJUSTED';

                                    const isCritical =
                                      train.action === 'HOLD' || train.delay_minutes > 15;

                                    return (
                                      <div
                                        key={train.train_number}
                                        className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-[#2C3A35]/70 bg-[#1A2421]/50 px-3.5 py-2.5 text-xs transition hover:border-[#A7F3D0]/30"
                                      >
                                        <div className="flex flex-wrap items-center gap-2.5">
                                          <div className="flex items-center gap-1.5 font-mono font-bold text-[#E2EAF4]">
                                            <span className="text-[#A7F3D0]">[</span>
                                            <span>{train.train_number}</span>
                                            <span className="text-[#E2EAF4]/40">-</span>
                                            <span className="text-[#E2EAF4]/90">{train.train_name}</span>
                                            <span className="text-[#A7F3D0]">]</span>
                                          </div>
                                          <span className="rounded bg-[#0D1311] px-1.5 py-0.5 text-[9px] font-mono text-[#E2EAF4]/60 border border-[#2C3A35]">
                                            {train.category}
                                          </span>

                                          {/* Scheduled Pass Time through micro-section */}
                                          <div className="flex items-center gap-1.5 rounded-md border border-[#2C3A35] bg-[#0D1311]/80 px-2 py-0.5 text-[11px] font-mono">
                                            <Clock className="h-3 w-3 text-[#A7F3D0]" />
                                            <span className="text-[#E2EAF4]/50">Scheduled Pass:</span>
                                            <span className="font-bold text-[#A7F3D0]">
                                              {train.scheduled_pass_time || 'TRAVERSING WINDOW'}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-2.5 font-mono text-[11px]">
                                          <span
                                            className={`rounded px-2 py-0.5 font-bold tracking-wide uppercase ${
                                              isCritical
                                                ? 'bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/40 shadow-[0_0_8px_rgba(239,68,68,0.2)]'
                                                : 'bg-[#F97316]/15 text-[#F97316] border border-[#F97316]/40 shadow-[0_0_8px_rgba(249,115,22,0.15)]'
                                            }`}
                                          >
                                            Status: {statusText}
                                          </span>
                                          <span
                                            className={`font-bold ${
                                              isCritical ? 'text-status-critical' : 'text-status-caution'
                                            }`}
                                          >
                                            +{train.delay_minutes}M
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Compact resource and manpower logistics accordion */}
                      <div className="mt-2 rounded-md border border-[#2C3A35] bg-[#1A2421]/50">
                        <button
                          type="button"
                          onClick={() => toggleResourceAccordion(block)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-mono transition hover:bg-[#1A2421]"
                        >
                          <span className="flex items-center gap-2 font-bold tracking-wider text-[#E2EAF4]">
                            <Wrench className="h-3.5 w-3.5 text-[#A7F3D0]" />
                            [ RESOURCE &amp; MANPOWER LOGISTICS ]
                          </span>
                          {resourceExpandedIds[block.id] ? (
                            <ChevronUp className="h-4 w-4 text-[#E2EAF4]/50" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-[#E2EAF4]/50" />
                          )}
                        </button>

                        <AnimatePresence>
                          {resourceExpandedIds[block.id] && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="border-t border-[#2C3A35]/60"
                            >
                              {resourceLoadingIds[block.id] ? (
                                <div className="p-4 text-center text-[10px] font-mono uppercase tracking-widest text-[#A7F3D0] animate-pulse">
                                  CALCULATING RESOURCE MATRIX...
                                </div>
                              ) : resourceData ? (
                                <>
                                  <div className="grid grid-cols-2 gap-4 p-3">
                                    <div className="min-w-0 space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#A7F3D0]">
                                          EQUIPMENT CHECKLIST
                                        </span>
                                        <span className="text-[9px] font-mono text-[#E2EAF4]/60">
                                          {checkedMandatoryItems}/{mandatoryItems.length} · {mandatoryProgress}%
                                        </span>
                                      </div>
                                      <div className="h-1 overflow-hidden rounded-full bg-[#0D1311]">
                                        <div
                                          className="h-full bg-[#A7F3D0] transition-all"
                                          style={{ width: `${mandatoryProgress}%` }}
                                        />
                                      </div>

                                      {(['Tools', 'Heavy Machinery', 'Safety/Climate Gear'] as EquipmentCategory[]).map(
                                        (category) => {
                                          const items = resourceData.equipmentList.filter(
                                            (item) => item.category === category,
                                          );
                                          if (!items.length) return null;
                                          return (
                                            <div key={category} className="space-y-1.5">
                                              <div className="border-b border-[#2C3A35] pb-1 text-[9px] font-mono uppercase text-[#E2EAF4]/50">
                                                {category}
                                              </div>
                                              {items.map((item) => (
                                                <label
                                                  key={item.id}
                                                  className="flex cursor-pointer items-center justify-between gap-2 rounded border border-[#2C3A35]/70 bg-[#0D1311]/70 px-2 py-1.5 text-[10px] font-mono hover:border-[#A7F3D0]/50"
                                                >
                                                  <span className="flex min-w-0 items-center gap-1.5">
                                                    <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                                                      <input
                                                        type="checkbox"
                                                        checked={!!checkedItems[item.id]}
                                                        onChange={() => toggleResourceItem(block.id, item.id)}
                                                        className="h-3.5 w-3.5 appearance-none rounded border border-[#2C3A35] bg-[#0D1311] checked:border-[#A7F3D0] checked:bg-[#A7F3D0]"
                                                      />
                                                      {checkedItems[item.id] && (
                                                        <Check className="pointer-events-none absolute h-2.5 w-2.5 text-[#0D1311]" />
                                                      )}
                                                    </span>
                                                    <span className="truncate text-[#E2EAF4]">{item.name}</span>
                                                  </span>
                                                  <span className="shrink-0 text-right text-[#A7F3D0]">
                                                    {item.requiredQty} {item.unit}
                                                  </span>
                                                </label>
                                              ))}
                                            </div>
                                          );
                                        },
                                      )}
                                    </div>

                                    <div className="min-w-0 space-y-3">
                                      <div
                                        className={`rounded border px-2 py-1.5 text-[9px] font-mono font-bold uppercase tracking-wider ${
                                          resourceData.severity === 'RED'
                                            ? 'animate-pulse border-[#EF4444]/60 bg-[#EF4444]/15 text-[#EF4444]'
                                            : resourceData.severity === 'AMBER'
                                            ? 'border-[#F97316]/60 bg-[#F97316]/15 text-[#F97316]'
                                            : 'border-[#FCD34D]/60 bg-[#FCD34D]/15 text-[#FCD34D]'
                                        }`}
                                      >
                                        HAZARD: {resourceData.hazardBadge}
                                      </div>
                                      <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-[#E2EAF4]/50">
                                        <span>MANPOWER MATRIX</span>
                                        <span className="text-[#A7F3D0]">
                                          {resourceData.manpower.reduce((total, role) => total + role.quantity, 0)} PERSONNEL
                                        </span>
                                      </div>
                                      <div className="overflow-hidden rounded border border-[#2C3A35]">
                                        <table className="w-full text-left text-[10px] font-mono">
                                          <thead className="bg-[#0D1311] text-[9px] uppercase text-[#E2EAF4]/50">
                                            <tr>
                                              <th className="px-2 py-1.5">Role</th>
                                              <th className="px-2 py-1.5">Cert</th>
                                              <th className="px-2 py-1.5 text-right">Qty</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-[#2C3A35]/60">
                                            {resourceData.manpower.map((role) => (
                                              <tr key={role.roleId} className="text-[#E2EAF4]">
                                                <td className="px-2 py-1.5">
                                                  <div className="truncate">{role.designation}</div>
                                                  <div className="text-[9px] text-[#E2EAF4]/40">{role.shiftHours}h shift</div>
                                                </td>
                                                <td className="max-w-[100px] px-2 py-1.5 text-[#E2EAF4]/70">
                                                  <span className="flex items-center gap-1">
                                                    <ShieldCheck className="h-3 w-3 shrink-0 text-[#A7F3D0]" />
                                                    <span className="truncate">{role.certification}</span>
                                                  </span>
                                                </td>
                                                <td className="px-2 py-1.5 text-right text-base font-bold text-[#A7F3D0]">
                                                  {role.quantity}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-end gap-2 border-t border-[#2C3A35] px-3 py-2">
                                    <button
                                      type="button"
                                      onClick={() => window.print()}
                                      className="flex items-center gap-1 rounded border border-[#2C3A35] bg-transparent px-2 py-1 text-[9px] font-mono font-bold uppercase text-[#E2EAF4]/70 hover:border-[#A7F3D0] hover:text-[#A7F3D0]"
                                    >
                                      <FileDown className="h-3 w-3" />
                                      EXPORT PDF
                                    </button>
                                    <button
                                      type="button"
                                      disabled={mandatoryProgress < 100}
                                      onClick={() => setAllocatedBlockIds((prev) => ({ ...prev, [block.id]: true }))}
                                      className="rounded bg-[#A7F3D0] px-2.5 py-1 text-[9px] font-mono font-bold uppercase text-[#0D1311] shadow-[0_0_10px_rgba(167,243,208,0.25)] hover:bg-[#34D399] disabled:cursor-not-allowed disabled:bg-[#2C3A35] disabled:text-[#E2EAF4]/40"
                                    >
                                      {allocatedBlockIds[block.id] ? 'ALLOCATED' : 'ALLOCATE'}
                                    </button>
                                  </div>
                                </>
                              ) : null}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[#2C3A35] px-6 py-3 bg-[#1A2421]/50 text-xs font-mono text-[#E2EAF4]/50">
              <span>TACTICAL RAIL ENGINE · OPERATIONAL SHADOW OVERLAY</span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#2C3A35] bg-[#0D1311] px-4 py-1.5 font-mono text-xs text-[#E2EAF4] hover:border-[#A7F3D0] hover:text-[#A7F3D0] transition"
              >
                Close Console
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
