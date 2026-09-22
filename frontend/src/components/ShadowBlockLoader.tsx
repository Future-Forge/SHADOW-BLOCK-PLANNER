import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Terminal } from 'lucide-react';

interface ShadowBlockLoaderProps {
  isOpen: boolean;
  fromStation?: string;
  toStation?: string;
  criticality?: string;
  durationMinutes?: number;
}

const CONSOLE_LOGS = [
  'INITIALIZING MILP CONFLICT RESOLUTION MATRIX...',
  'INGESTING TIMETABLE DATA (8,512 SCHEDULED TRAINS)...',
  'QUERYING TOPOLOGY EDGES FOR GOLDEN QUADRILATERAL TRUNK...',
  'EXTRACTING TRACK OCCUPANCY & HEADWAY WINDOWS...',
  'RESOLVING CONFLICTS & DISPATCH INTERFERENCE...',
  'CALCULATING SHADOW GAPS & ZERO-DELAY SLOTS...',
  'EVALUATING PENALTY WEIGHTS: PREMIUM > SF > PASSENGER...',
  'SOLVING MILP OBJECTIVE: MIN(TOTAL_WEIGHTED_DELAY)...',
  'GENERATING OPTIMAL TRAIN REGULATION VECTORS...',
  'COMMITTING SYNTHESIZED BLOCK DECISION PAYLOAD...',
];

const ShadowBlockLoaderContent: React.FC<Omit<ShadowBlockLoaderProps, 'isOpen'>> = ({
  fromStation = 'ORIGIN',
  toStation = 'DESTINATION',
  criticality = 'NORMAL',
  durationMinutes = 60,
}) => {
  const [logIndex, setLogIndex] = useState(0);
  const [progress, setProgress] = useState(14);

  useEffect(() => {
    const logInterval = setInterval(() => {
      setLogIndex((prev) => (prev + 1) % CONSOLE_LOGS.length);
    }, 280);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return 95;
        const jump = Math.floor(Math.random() * 8) + 4;
        return Math.min(95, prev + jump);
      });
    }, 180);

    return () => {
      clearInterval(logInterval);
      clearInterval(progressInterval);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0D1311]/90 backdrop-blur-2xl select-none"
    >
      {/* Ambient tactical gradient */}
      <div className="pointer-events-none absolute h-[500px] w-[700px] rounded-full bg-[radial-gradient(ellipse_at_center,_rgba(44,58,53,0.35)_0%,_rgba(13,19,17,0.1)_50%,_transparent_75%)]" />

      <div className="relative flex flex-col items-center max-w-xl w-full px-6">
        {/* Top Tactical Badge */}
        <motion.div
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="mb-6 flex items-center gap-3 rounded-full border border-[#2C3A35] bg-[#1A2421]/90 px-4 py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.6)] backdrop-blur-md"
        >
          <div className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#A7F3D0] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#A7F3D0]" />
          </div>
          <span className="font-mono text-[11px] font-bold tracking-[0.25em] text-[#A7F3D0] uppercase">
            TACTICAL RAIL ENGINE // SOLVER ACTIVE
          </span>
        </motion.div>

        {/* Target Corridor Info */}
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold tracking-[0.15em] text-[#E2EAF4] drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            SOLVING DELTA WINDOW
          </h2>
          <div className="mt-2 flex items-center justify-center gap-3 font-mono text-xs text-[#E2EAF4]">
            <span className="rounded bg-[#0D1311] border border-[#2C3A35] px-2.5 py-1 text-[#A7F3D0] font-bold">
              {fromStation} → {toStation}
            </span>
            <span className="text-[#2C3A35]">•</span>
            <span className="text-[#E2EAF4]/60">{durationMinutes} MIN DURATION</span>
            <span className="text-[#2C3A35]">•</span>
            <span
              className={`font-bold ${
                criticality === 'EMERGENCY'
                  ? 'text-[#EF4444]'
                  : criticality === 'MAJOR'
                  ? 'text-[#F97316]'
                  : 'text-[#34D399]'
              }`}
            >
              {criticality} TIER
            </span>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            TACTICAL ANIMATION: GLOWING TRAIN ALONG MINT-ACCENTED TRACK
            ════════════════════════════════════════════════════════════════ */}
        <div className="relative w-full max-w-[540px] h-28 flex items-center justify-center overflow-hidden rounded-2xl border border-[#2C3A35] bg-[#1A2421]/80 shadow-[inset_0_0_30px_rgba(0,0,0,0.85)]">
          {/* Overhead Catenary Wire */}
          <div className="absolute top-4 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#2C3A35] to-transparent" />

          {/* The High-Tech Track System */}
          <div className="relative w-full px-4 flex flex-col justify-center items-center">
            {/* Upper Rail - Mint/Emerald #A7F3D0 Glow */}
            <div className="w-full h-[2px] bg-[#A7F3D0] shadow-[0_0_12px_rgba(167,243,208,0.85)]" />

            {/* Sleeper ties along the track */}
            <div className="w-full h-5 flex justify-between items-center opacity-40 overflow-hidden">
              {Array.from({ length: 28 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[3px] h-3 bg-[#2C3A35] rounded-sm shadow-[0_0_4px_rgba(44,58,53,0.5)]"
                />
              ))}
            </div>

            {/* Lower Rail */}
            <div className="w-full h-[2px] bg-[#A7F3D0] shadow-[0_0_12px_rgba(167,243,208,0.85)]" />

            {/* High-speed glowing train moving on infinite loop */}
            <motion.div
              className="absolute left-0 -top-1 pointer-events-none"
              animate={{ x: [-90, 560] }}
              transition={{
                repeat: Infinity,
                duration: 1.35,
                ease: [0.45, 0.05, 0.2, 0.95],
              }}
            >
              <div className="relative flex items-center">
                {/* Sleek Aerodynamic Train Body */}
                <div className="relative flex items-center h-7 w-24 rounded-full bg-gradient-to-r from-[#1A2421] via-[#34D399] to-[#E2EAF4] shadow-[0_0_20px_rgba(167,243,208,0.9)]">
                  {/* Train cockpit / windows */}
                  <div className="absolute left-4 top-1.5 flex gap-1">
                    <div className="h-1.5 w-3 rounded-sm bg-[#0D1311]/80" />
                    <div className="h-1.5 w-3 rounded-sm bg-[#0D1311]/80" />
                    <div className="h-1.5 w-4 rounded-sm bg-[#0D1311]/80" />
                  </div>

                  {/* White-hot headlight at the nose */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-[#E2EAF4] shadow-[0_0_15px_#E2EAF4,0_0_25px_#A7F3D0]" />

                  {/* Headlight Beam cast forward along track */}
                  <div className="absolute left-full top-1/2 -translate-y-1/2 w-32 h-6 bg-gradient-to-r from-[#E2EAF4]/70 via-[#A7F3D0]/25 to-transparent blur-[2px] rounded-r-full pointer-events-none" />
                </div>

                {/* Speed particle wake / trail behind train */}
                <div className="absolute right-full top-1/2 -translate-y-1/2 w-28 h-3 bg-gradient-to-l from-[#34D399]/60 via-[#2C3A35]/30 to-transparent blur-[1px] rounded-l-full" />
              </div>
            </motion.div>
          </div>

          {/* Dynamic distance telemetry markers */}
          <div className="absolute bottom-2 left-6 right-6 flex justify-between font-mono text-[9px] text-[#E2EAF4]/40">
            <span>TACTICAL GRID α-09</span>
            <span className="text-[#34D399] font-bold">VELOCITY: 160 KM/H</span>
            <span>GRID SECTOR β-14</span>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            TACTICAL CONSOLE: RAPIDLY CYCLING DEEP CALCULATION LOGS
            ════════════════════════════════════════════════════════════════ */}
        <div className="mt-6 w-full max-w-[540px] rounded-2xl border border-[#2C3A35] bg-[#1A2421]/95 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.85)] backdrop-blur-md">
          <div className="mb-2.5 flex items-center justify-between border-b border-[#2C3A35] pb-2">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-[#A7F3D0]" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[#E2EAF4]/80">
                DISPATCH TELEMETRY CONSOLE
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-[#A7F3D0] font-bold">{progress}%</span>
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-[#EF4444]" />
                <span className="h-2 w-2 rounded-full bg-[#F97316]" />
                <span className="h-2 w-2 rounded-full bg-[#34D399]" />
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[#0D1311]">
            <motion.div
              className="h-full bg-gradient-to-r from-[#2C3A35] via-[#34D399] to-[#A7F3D0] shadow-[0_0_8px_rgba(167,243,208,0.7)]"
              style={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut', duration: 0.2 }}
            />
          </div>

          {/* Cycling Monospaced Terminal Output */}
          <div className="h-16 flex flex-col justify-end font-mono text-xs">
            <div className="text-[#E2EAF4]/40 text-[11px] truncate">
              {CONSOLE_LOGS[(logIndex - 1 + CONSOLE_LOGS.length) % CONSOLE_LOGS.length]}
            </div>
            <div className="text-[#E2EAF4] font-semibold flex items-center gap-1.5 mt-1">
              <span className="text-[#A7F3D0]">&gt;</span>
              <span className="drop-shadow-[0_0_6px_rgba(167,243,208,0.5)]">
                {CONSOLE_LOGS[logIndex]}
              </span>
              <span className="inline-block h-3.5 w-1.5 animate-pulse bg-[#A7F3D0]" />
            </div>
          </div>
        </div>

        {/* Bottom Status Bar */}
        <div className="mt-4 flex items-center gap-6 font-mono text-[10px] uppercase tracking-[0.22em] text-[#E2EAF4]/50">
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3 w-3 text-[#A7F3D0]" />
            <span>FASTAPI // :8000</span>
          </div>
          <span>•</span>
          <div>KERNEL: MILP_SCIP</div>
          <span>•</span>
          <div className="text-[#34D399]">LATENCY: &lt; 850MS</div>
        </div>
      </div>
    </motion.div>
  );
};

export const ShadowBlockLoader: React.FC<ShadowBlockLoaderProps> = ({ isOpen, ...props }) => {
  return (
    <AnimatePresence>
      {isOpen && <ShadowBlockLoaderContent key="tactical-loader-content" {...props} />}
    </AnimatePresence>
  );
};
