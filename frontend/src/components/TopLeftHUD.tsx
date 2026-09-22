import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Radar } from 'lucide-react';
import { BackendStatusPill } from './header/BackendStatusPill';
import { SettingsButton } from './header/SettingsButton';
import { SettingsModal } from './modals/SettingsModal';

interface TopLeftHUDProps {
  isBackendAlive: boolean;
  onOpenEndpointModal: () => void;
  className?: string;
}

export const TopLeftHUD: React.FC<TopLeftHUDProps> = ({
  isBackendAlive,
  onOpenEndpointModal,
  className,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        className={
          className ||
          "pointer-events-auto flex items-center gap-4 rounded-[22px] border border-[#2C3A35] bg-[#1A2421]/60 px-5 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.65)] backdrop-blur-xl"
        }
      >
        {/* Radar Console Icon */}
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#2C3A35] bg-[#0D1311]/80 text-[#A7F3D0] shadow-[0_0_12px_rgba(167,243,208,0.2)] shrink-0">
          <Radar className="h-5 w-5" />
        </div>

        {/* Title & Branding */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.38em] text-[#A7F3D0]/80 font-mono font-bold">
            TACTICAL RAIL ENGINE
          </p>
          <div className="mt-0.5 flex items-center gap-3">
            <span className="text-xl font-semibold tracking-[0.16em] text-[#E2EAF4] drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              SHADOW BLOCK
            </span>
          </div>
        </div>

        {/* Decoupled Header Controls (Separated Telemetry Pill + Operator Settings Button) */}
        <div className="ml-auto flex items-center gap-2 pl-2">
          {/* Control A: Dedicated Backend Status & Ping Pill */}
          <BackendStatusPill
            isBackendAlive={isBackendAlive}
            onOpenEndpointModal={onOpenEndpointModal}
          />

          {/* Control B: Dedicated Operator Preferences Trigger */}
          <SettingsButton
            onClick={() => setIsSettingsOpen(true)}
            isOpen={isSettingsOpen}
          />
        </div>
      </motion.header>

      {/* Unclipped Portal-based Operator Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
};
