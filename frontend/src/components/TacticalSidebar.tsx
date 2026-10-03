import React from 'react';
import {
  ShieldAlert,
  Clock,
  Sparkles,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { StationCombobox } from './StationCombobox';
import { AIDispatcherConsole } from './AIDispatcherConsole';
import type { BlockRequest, BlockDecision, TrafficPreviewResponse, Corridor } from '../api/types';

export interface TacticalSidebarProps {
  request: BlockRequest;
  updateRequest: <K extends keyof BlockRequest>(key: K, value: BlockRequest[K]) => void;
  setFromStation: (code: string) => void;
  setToStation: (code: string) => void;
  sharedLeg: Corridor | null | undefined;
  previewTraffic: TrafficPreviewResponse | null;
  isPreviewLoading: boolean;
  analysisError: string | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  currentTime: string;
  onExecuteBlock: (req: BlockRequest, decision: BlockDecision) => void;
  onFlyTo: (lon: number, lat: number, zoom?: number, pitch?: number, bearing?: number) => void;
  onApplyDecision: (decision: BlockDecision) => void;
  activeTab?: 'manual' | 'ai';
  onTabChange?: (tab: 'manual' | 'ai') => void;
  assistantExpanded?: boolean;
  onToggleAssistantSize?: () => void;
}

export const TacticalSidebar: React.FC<TacticalSidebarProps> = ({
  request,
  updateRequest,
  setFromStation,
  setToStation,
  sharedLeg,
  previewTraffic,
  isPreviewLoading,
  analysisError,
  isAnalyzing,
  onAnalyze,
  currentTime,
  onExecuteBlock,
  onFlyTo,
  onApplyDecision,
  activeTab: controlledTab,
  onTabChange,
  assistantExpanded,
  onToggleAssistantSize,
}) => {
  const activeTab = controlledTab ?? 'manual';

  return (
    <div className="h-full w-full min-h-0 border-r border-[#2C3A35] bg-[#131A17] flex flex-col shadow-2xl">
      <header className="flex shrink-0 border-b border-[#2C3A35] bg-[#0D1311] pr-14">
        <button
          type="button"
          onClick={() => onTabChange?.('manual')}
          className={`flex-1 py-4 text-xs font-mono font-bold tracking-widest uppercase transition-colors ${
            activeTab === 'manual'
              ? 'text-[#A7F3D0] border-b-2 border-[#A7F3D0] bg-[#1A2421]'
              : 'text-[#E2EAF4]/50 hover:bg-[#1A2421]/50'
          }`}
        >
          Manual Spec
        </button>
        <button
          type="button"
          onClick={() => onTabChange?.('ai')}
          className={`flex-1 py-4 text-xs font-mono font-bold tracking-widest uppercase transition-colors ${
            activeTab === 'ai'
              ? 'text-[#A7F3D0] border-b-2 border-[#A7F3D0] bg-[#1A2421]'
              : 'text-[#E2EAF4]/50 hover:bg-[#1A2421]/50'
          }`}
        >
          AI Dispatcher
        </button>
      </header>

      {activeTab === 'manual' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4">
          {/* Spec Header */}
          <div className="flex items-center justify-between border-b border-[#2C3A35]/60 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#2C3A35] bg-[#0D1311] text-[#A7F3D0]">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.32em] text-[#A7F3D0]/80 font-mono font-bold">
                  BLOCK CONSTRAINTS
                </p>
                <h2 className="mt-0.5 text-base font-semibold text-[#E2EAF4]">Delta Window Spec</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {sharedLeg && (
                <span className="rounded-full border border-[#2C3A35] bg-[#0D1311] px-2 py-0.5 text-[9px] uppercase tracking-wider text-[#A7F3D0] font-mono">
                  {sharedLeg.leg_id}
                </span>
              )}
              <div
                className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] font-bold font-mono ${
                  request.criticality === 'EMERGENCY'
                    ? 'border-status-critical/50 bg-status-critical/15 text-status-critical animate-pulse'
                    : request.criticality === 'MAJOR'
                    ? 'border-status-caution/50 bg-status-caution/15 text-status-caution'
                    : 'border-status-nominal/50 bg-status-nominal/15 text-status-nominal'
                }`}
              >
                {request.criticality}
              </div>
            </div>
          </div>

          <div className="space-y-3.5">
            {/* Smart Searchable Autocomplete Combobox for From & To Stations */}
            <div className="grid grid-cols-2 gap-3">
              <StationCombobox
                label="from node"
                value={request.from_station}
                onChange={setFromStation}
                oppositeStationCode={request.to_station}
                placeholder="Origin code/name..."
              />
              <StationCombobox
                label="to node"
                value={request.to_station}
                onChange={setToStation}
                oppositeStationCode={request.from_station}
                placeholder="Target code/name..."
              />
            </div>

            {/* Track Direction & Target Time */}
            <div className="grid grid-cols-2 gap-3">
              <label className="group relative">
                <span className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-[#E2EAF4]/60 font-mono">
                  track direction
                </span>
                <div className="relative">
                  <select
                    value={request.track_line}
                    onChange={(e) => updateRequest('track_line', e.target.value as 'UP' | 'DOWN')}
                    className="w-full rounded-xl border border-[#2C3A35] bg-[#0D1311] px-3 py-2 font-mono text-sm text-[#E2EAF4] outline-none transition focus:border-[#A7F3D0] focus:shadow-[0_0_12px_rgba(167,243,208,0.25)]"
                  >
                    <option value="UP" className="bg-[#131A17] text-[#E2EAF4]">
                      UP (Canonical)
                    </option>
                    <option value="DOWN" className="bg-[#131A17] text-[#E2EAF4]">
                      DOWN (Reverse)
                    </option>
                  </select>
                </div>
              </label>

              <label className="group relative">
                <span className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-[#E2EAF4]/60 font-mono">
                  target time (24h)
                </span>
                <div className="relative flex items-center">
                  <Clock className="absolute left-3 h-4 w-4 text-[#A7F3D0]/70 pointer-events-none" />
                  <input
                    type="time"
                    step="60"
                    value={request.requested_time.slice(0, 5)}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        updateRequest('requested_time', val.length === 5 ? `${val}:00` : val);
                      }
                    }}
                    className="w-full rounded-xl border border-[#2C3A35] bg-[#0D1311] pl-9 pr-3 py-2 font-mono text-sm text-[#E2EAF4] outline-none transition focus:border-[#A7F3D0] focus:shadow-[0_0_12px_rgba(167,243,208,0.25)] [color-scheme:dark]"
                  />
                </div>
              </label>
            </div>

            {/* Slot Duration Slider */}
            <div className="rounded-xl border border-[#2C3A35] bg-[#0D1311] p-3">
              <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-[#E2EAF4]/60 font-mono">
                <span>slot duration</span>
                <span className="font-mono font-bold text-[#A7F3D0]">{request.duration_minutes} min</span>
              </div>
              <input
                type="range"
                min={15}
                max={240}
                step={15}
                value={request.duration_minutes}
                onChange={(e) => updateRequest('duration_minutes', Number(e.target.value))}
                className="tactical-slider w-full cursor-pointer"
              />
            </div>

            {/* System Department & Criticality Tier */}
            <div className="grid grid-cols-2 gap-3">
              <label className="group relative">
                <span className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-[#E2EAF4]/60 font-mono">
                  system
                </span>
                <select
                  value={request.department}
                  onChange={(e) => updateRequest('department', e.target.value as 'TMS' | 'SMMS' | 'TDMS')}
                  className="w-full rounded-xl border border-[#2C3A35] bg-[#0D1311] px-3 py-2 font-mono text-xs text-[#E2EAF4] outline-none transition focus:border-[#A7F3D0]"
                >
                  <option value="TMS" className="bg-[#131A17] text-[#E2EAF4]">
                    TMS (Track)
                  </option>
                  <option value="SMMS" className="bg-[#131A17] text-[#E2EAF4]">
                    SMMS (Signals)
                  </option>
                  <option value="TDMS" className="bg-[#131A17] text-[#E2EAF4]">
                    TDMS (Traction)
                  </option>
                </select>
              </label>

              <label className="group relative">
                <span className="mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-[#E2EAF4]/60 font-mono">
                  tier
                </span>
                <select
                  value={request.criticality}
                  onChange={(e) => updateRequest('criticality', e.target.value as 'NORMAL' | 'MAJOR' | 'EMERGENCY')}
                  className="w-full rounded-xl border border-[#2C3A35] bg-[#0D1311] px-3 py-2 font-mono text-xs text-[#E2EAF4] outline-none transition focus:border-[#A7F3D0] font-bold"
                >
                  <option value="NORMAL" className="bg-[#131A17] text-status-nominal font-bold">
                    NORMAL (Zero Delay)
                  </option>
                  <option value="MAJOR" className="bg-[#131A17] text-status-caution font-bold">
                    MAJOR (Regulated)
                  </option>
                  <option value="EMERGENCY" className="bg-[#131A17] text-status-critical font-bold">
                    EMERGENCY (Hold)
                  </option>
                </select>
              </label>
            </div>

            {/* Dynamic Projected Traffic Pre-Fetch Badge */}
            {request.from_station && request.to_station && (
              <div
                className={`rounded-xl border p-2.5 font-mono text-xs transition-all ${
                  isPreviewLoading
                    ? 'border-[#2C3A35] bg-[#0D1311] text-[#E2EAF4]/60'
                    : previewTraffic && previewTraffic.projected_traffic_count > 0
                    ? 'border-[#F97316]/50 bg-[#F97316]/10 text-[#F97316] shadow-[0_0_12px_rgba(249,115,22,0.15)]'
                    : 'border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399] shadow-[0_0_12px_rgba(52,211,153,0.15)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px]">
                    <Zap
                      className={`h-3.5 w-3.5 ${
                        isPreviewLoading
                          ? 'animate-pulse text-[#E2EAF4]/50'
                          : previewTraffic && previewTraffic.projected_traffic_count > 0
                          ? 'text-[#F97316]'
                          : 'text-[#34D399]'
                      }`}
                    />
                    <span>PROJECTED TRAFFIC</span>
                  </div>

                  {isPreviewLoading ? (
                    <span className="text-[10px] text-[#E2EAF4]/50 animate-pulse">PROBING TIMETABLE...</span>
                  ) : previewTraffic ? (
                    <span className="font-bold text-[10px]">
                      {previewTraffic.projected_traffic_count === 0
                        ? '0 TRAINS (CLEAR WINDOW)'
                        : `${previewTraffic.projected_traffic_count} TRAIN${previewTraffic.projected_traffic_count > 1 ? 'S' : ''} IN WINDOW`}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#E2EAF4]/40">SELECT STATIONS</span>
                  )}
                </div>

                {!isPreviewLoading && previewTraffic && previewTraffic.projected_traffic_count > 0 && (
                  <div className="mt-2 pt-2 border-t border-[#2C3A35]/60 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="text-[#E2EAF4]/50">TRAVERSING:</span>
                    {previewTraffic.trains.slice(0, 4).map((t) => (
                      <span
                        key={t.train_number}
                        className="rounded bg-[#131A17] px-1.5 py-0.5 border border-[#2C3A35] text-[#E2EAF4]/90 font-bold"
                        title={`${t.train_number} - ${t.train_name} (${t.scheduled_pass_time})`}
                      >
                        #{t.train_number}{' '}
                        <span className="text-[#A7F3D0]/80 font-normal">
                          @{t.scheduled_pass_time.slice(0, 5)}
                        </span>
                      </span>
                    ))}
                    {previewTraffic.trains.length > 4 && (
                      <span className="text-[#E2EAF4]/60">+{previewTraffic.trains.length - 4} more</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Error Banner */}
            {analysisError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/10 p-3 text-xs text-[#EF4444]">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#EF4444] mt-0.5" />
                <div className="flex-1 font-mono text-[11px] leading-relaxed">{analysisError}</div>
              </div>
            )}

            {/* Tactical Action Button: "Run Analysis" */}
            <button
              onClick={onAnalyze}
              disabled={isAnalyzing || !request.from_station || !request.to_station}
              className="tactical-button w-full py-3 hover:shadow-[0_0_12px_rgba(167,243,208,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="flex items-center justify-center gap-2">
                <Sparkles className="h-4 w-4 text-[#A7F3D0]" />
                {isAnalyzing ? 'SOLVING HEADWAY MATRIX...' : 'RUN ANALYSIS'}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
          <AIDispatcherConsole
            expanded={assistantExpanded}
            onToggleExpand={onToggleAssistantSize}
            simTime={currentTime}
            onExecuteBlock={onExecuteBlock}
            onFlyTo={onFlyTo}
            onApplyDecision={onApplyDecision}
          />
        </div>
      )}
    </div>
  );
};
