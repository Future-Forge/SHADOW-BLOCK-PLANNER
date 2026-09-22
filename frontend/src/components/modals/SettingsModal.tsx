import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sliders,
  Eye,
  Check,
  Zap,
  Clock,
  Gauge,
  ShieldCheck,
} from 'lucide-react';
import { useSimulation } from '../../store/SimulationContext';
import { COLOR_MODE_OPTIONS } from '../../lib/accessibility';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    colorMode,
    setColorMode,
    highPerformanceVfx,
    setHighPerformanceVfx,
    refreshRateMs,
    setRefreshRateMs,
  } = useSimulation();

  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen && typeof document !== 'undefined') {
    return null;
  }

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop with military-grade blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
            aria-hidden="true"
          />

          {/* Modal Container Window */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="w-full max-w-lg bg-[#0D1311]/95 border border-[#2C3A35] rounded-2xl shadow-2xl p-6 relative backdrop-blur-2xl text-[#E2EAF4] overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#2C3A35] pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#2C3A35] bg-[#1A2421] text-[#A7F3D0]">
                  <Sliders className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-mono text-base font-bold tracking-wide uppercase text-[#E2EAF4]">
                    OPERATOR SYSTEM PREFERENCES
                  </h2>
                  <p className="font-mono text-[10px] text-[#A7F3D0]/80 tracking-wider">
                    TACTICAL RAIL ENGINE // SYSTEM CALIBRATION
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-[#E2EAF4]/50 hover:bg-[#1A2421] hover:text-[#E2EAF4] transition cursor-pointer"
                title="Close settings (Esc)"
                aria-label="Close settings"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
              {/* SECTION 1: Visual Accessibility & CVD Profiles */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold tracking-wider text-[#A7F3D0] uppercase">
                    <Eye className="h-3.5 w-3.5" />
                    <span>Visual Accessibility & CVD Profiles</span>
                  </div>
                  <span className="font-mono text-[9px] text-[#E2EAF4]/40 uppercase tracking-widest">
                    LIVE WEBGL SYNC
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {COLOR_MODE_OPTIONS.map((opt) => {
                    const isSelected = colorMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setColorMode(opt.id)}
                        className={`group relative flex flex-col justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#34D399] bg-[#1A2421]/90 shadow-[0_0_16px_rgba(52,211,153,0.15)] ring-1 ring-[#34D399]/50'
                            : 'border-[#2C3A35] bg-[#0D1311]/80 hover:border-[#A7F3D0]/50 hover:bg-[#1A2421]/50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-mono text-xs font-bold tracking-wide text-[#E2EAF4] group-hover:text-[#A7F3D0] transition-colors">
                              {opt.label}
                            </div>
                            <div className="font-mono text-[10px] text-[#E2EAF4]/50 mt-0.5">
                              {opt.sublabel}
                            </div>
                          </div>

                          <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            isSelected ? 'border-[#34D399] bg-[#34D399] text-[#0D1311]' : 'border-[#2C3A35]'
                          }`}>
                            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                          </div>
                        </div>

                        {/* Live Color Swatches Preview */}
                        <div className="mt-3 flex items-center justify-between border-t border-[#2C3A35]/50 pt-2 text-[9px] font-mono text-[#E2EAF4]/60">
                          <span>INDICATORS:</span>
                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-1">
                              <span
                                className="h-2.5 w-2.5 rounded-full border border-black/40 shadow-sm"
                                style={{ backgroundColor: opt.colors.critical }}
                                title="Critical status preview"
                              />
                              <span
                                className="h-2.5 w-2.5 rounded-full border border-black/40 shadow-sm"
                                style={{ backgroundColor: opt.colors.caution }}
                                title="Caution status preview"
                              />
                              <span
                                className="h-2.5 w-2.5 rounded-full border border-black/40 shadow-sm"
                                style={{ backgroundColor: opt.colors.nominal }}
                                title="Nominal status preview"
                              />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 2: Operator Utility & Performance */}
              <div className="border-t border-[#2C3A35] pt-5">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold tracking-wider text-[#A7F3D0] uppercase mb-3">
                  <Gauge className="h-3.5 w-3.5" />
                  <span>Engine & Telemetry Performance</span>
                </div>

                <div className="space-y-3.5">
                  {/* High-Performance Bloom & VFX Toggle */}
                  <div className="flex items-center justify-between rounded-xl border border-[#2C3A35] bg-[#0D1311]/80 p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2C3A35] bg-[#1A2421] text-[#FCD34D]">
                        <Zap className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="font-mono text-xs font-semibold text-[#E2EAF4]">
                          High-Performance WebGL Shader Bloom
                        </div>
                        <div className="font-mono text-[10px] text-[#E2EAF4]/50">
                          Enhanced visual glow and dynamic 3D pillar refraction
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setHighPerformanceVfx(!highPerformanceVfx)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        highPerformanceVfx ? 'bg-[#34D399]' : 'bg-[#2C3A35]'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          highPerformanceVfx ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Telemetry Refresh Rate Selector */}
                  <div className="rounded-xl border border-[#2C3A35] bg-[#0D1311]/80 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-[#38BDF8]" />
                        <span className="font-mono text-xs font-semibold text-[#E2EAF4]">
                          Telemetry Stream Cadence
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-[#38BDF8]">
                        {refreshRateMs / 1000}s ({refreshRateMs}ms)
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {[1000, 2000, 5000].map((ms) => (
                        <button
                          key={ms}
                          type="button"
                          onClick={() => setRefreshRateMs(ms)}
                          className={`rounded-lg py-1.5 text-center font-mono text-[11px] transition-all cursor-pointer ${
                            refreshRateMs === ms
                              ? 'border border-[#38BDF8] bg-[#38BDF8]/15 text-[#38BDF8] font-bold shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                              : 'border border-[#2C3A35] text-[#E2EAF4]/60 hover:bg-[#1A2421] hover:text-[#E2EAF4]'
                          }`}
                        >
                          {ms === 1000 ? '1s (TURBO)' : ms === 2000 ? '2s (DEFAULT)' : '5s (ECO)'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="mt-6 flex items-center justify-between border-t border-[#2C3A35] pt-4 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-[#34D399] text-[10px]">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>STATE PERSISTED TO LOCAL STORAGE</span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="tactical-button px-5 py-2 text-xs"
              >
                APPLY & CLOSE
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};
