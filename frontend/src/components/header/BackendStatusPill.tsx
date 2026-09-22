import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Radio } from 'lucide-react';
import { useSimulation } from '../../store/SimulationContext';
import { getApiBaseUrl } from '../../api/api';

interface BackendStatusPillProps {
  isBackendAlive: boolean;
  onOpenEndpointModal: () => void;
}

export const BackendStatusPill: React.FC<BackendStatusPillProps> = ({
  isBackendAlive,
  onOpenEndpointModal,
}) => {
  const { pingMs, packetsReceived } = useSimulation();
  const [isHovered, setIsHovered] = useState(false);

  // Extract clean host & port from active API Base URL
  const formatEndpointDisplay = (url: string) => {
    try {
      const parsed = new URL(url);
      return `API: ${parsed.host}`;
    } catch {
      return `API: ${url.replace(/^https?:\/\//, '')}`;
    }
  };

  const endpointDisplay = formatEndpointDisplay(getApiBaseUrl());

  return (
    <div className="relative inline-block" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <button
        type="button"
        onClick={onOpenEndpointModal}
        className={`group flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-mono transition-all duration-200 shadow-sm cursor-pointer select-none ${
          isBackendAlive
            ? 'border-[#2C3A35] bg-[#0D1311]/80 text-[#E2EAF4] hover:border-[#34D399]/60 hover:shadow-[0_0_12px_rgba(52,211,153,0.2)]'
            : 'border-[#EF4444]/40 bg-[#0D1311]/90 text-[#EF4444] hover:border-[#EF4444]'
        }`}
        title="Click to configure backend API endpoint"
      >
        {/* Pulsing Status Orb */}
        <span className="relative flex h-2 w-2">
          {isBackendAlive ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#34D399] shadow-[0_0_8px_#34D399]" />
            </>
          ) : (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EF4444] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EF4444] shadow-[0_0_8px_#EF4444]" />
            </>
          )}
        </span>

        {/* Dynamic API Endpoint Display */}
        <span className="tracking-wide font-medium">
          {isBackendAlive ? endpointDisplay : 'OFFLINE (SIMULATION)'}
        </span>

        {/* Latency Ping Badge */}
        {isBackendAlive && (
          <span className="flex items-center gap-0.5 text-[#E2EAF4]/50 group-hover:text-[#A7F3D0] transition-colors border-l border-[#2C3A35] pl-1.5 ml-0.5 text-[10px]">
            <Activity className="h-2.5 w-2.5 opacity-70" />
            {pingMs}ms
          </span>
        )}
      </button>

      {/* Sleek Hover Micro-Tooltip with Telemetry Metrics */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-full mt-2 z-50 w-56 rounded-xl border border-[#2C3A35] bg-[#0D1311]/95 p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.85)] backdrop-blur-xl pointer-events-none"
          >
            <div className="flex items-center justify-between border-b border-[#2C3A35]/60 pb-1.5 mb-1.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#A7F3D0] font-bold flex items-center gap-1">
                <Radio className="h-2.5 w-2.5 text-[#34D399] animate-pulse" />
                TELEMETRY LINK
              </span>
              <span className={`font-mono text-[9px] font-bold ${isBackendAlive ? 'text-[#34D399]' : 'text-[#EF4444]'}`}>
                {isBackendAlive ? 'ONLINE' : 'DEGRADED'}
              </span>
            </div>

            <div className="space-y-1 font-mono text-[10px]">
              <div className="flex items-center justify-between text-[#E2EAF4]/70">
                <span>CHANNEL:</span>
                <span className="text-[#E2EAF4]">{isBackendAlive ? 'WS / REST SYNC' : 'IN-MEMORY LOOP'}</span>
              </div>
              <div className="flex items-center justify-between text-[#E2EAF4]/70">
                <span>HEARTBEAT:</span>
                <span className="text-[#A7F3D0]">{pingMs}ms (NOMINAL)</span>
              </div>
              <div className="flex items-center justify-between text-[#E2EAF4]/70">
                <span>PACKETS RX:</span>
                <span className="text-[#E2EAF4]">{packetsReceived} UNITS</span>
              </div>
              <div className="flex items-center justify-between text-[#E2EAF4]/70">
                <span>UPTIME:</span>
                <span className="text-[#34D399]">99.98% AVAILABLE</span>
              </div>
            </div>

            <div className="mt-2 pt-1 border-t border-[#2C3A35]/40 text-center font-mono text-[8px] text-[#E2EAF4]/40 uppercase tracking-widest">
              CLICK PILL TO CONFIGURE URL
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
