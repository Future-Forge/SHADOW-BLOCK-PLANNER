import { useState } from 'react';
import { BrainCircuit, MoreVertical, Wrench } from 'lucide-react';

interface CommandDialProps {
  activeMode: 'manual' | 'ai';
  onModeChange: (mode: 'manual' | 'ai') => void;
}

export function CommandDial({ activeMode, onModeChange }: CommandDialProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectMode = (mode: 'manual' | 'ai') => {
    onModeChange(mode);
    setIsOpen(false);
  };

  return (
    <div className="fixed bottom-8 left-8 z-[100] flex flex-col items-start gap-3">
      {isOpen && (
        <div className="flex flex-col items-start gap-2" role="menu" aria-label="Command mode">
          <button type="button" role="menuitem" onClick={() => selectMode('manual')} className={`flex items-center gap-2 rounded-full border px-5 py-3 font-mono text-sm font-bold uppercase tracking-wider shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all ${activeMode === 'manual' ? 'border-[#A7F3D0] bg-[#1A2421] text-[#A7F3D0]' : 'border-[#2C3A35] bg-[#1A2421] text-[#E2EAF4] hover:border-[#A7F3D0]'}`}>
            <Wrench size={22} />
            Manual Spec
          </button>
          <button type="button" role="menuitem" onClick={() => selectMode('ai')} className={`flex items-center gap-2 rounded-full border px-5 py-3 font-mono text-sm font-bold uppercase tracking-wider shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all ${activeMode === 'ai' ? 'border-[#A7F3D0] bg-[#1A2421] text-[#A7F3D0]' : 'border-[#2C3A35] bg-[#1A2421] text-[#E2EAF4] hover:border-[#A7F3D0]'}`}>
            <BrainCircuit size={22} />
            AI Dispatcher
          </button>
        </div>
      )}
      <button type="button" aria-label="Open command mode selector" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)} className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#2C3A35] bg-[#1A2421] text-[#E2EAF4] shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all hover:border-[#A7F3D0]">
        <MoreVertical size={22} />
      </button>
    </div>
  );
}