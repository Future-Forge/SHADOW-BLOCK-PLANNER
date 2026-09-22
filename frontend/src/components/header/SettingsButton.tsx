import React from 'react';
import { Settings } from 'lucide-react';

interface SettingsButtonProps {
  onClick: () => void;
  isOpen?: boolean;
}

export const SettingsButton: React.FC<SettingsButtonProps> = ({ onClick, isOpen = false }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-1.5 rounded-lg bg-[#0D1311]/80 border border-[#2C3A35] text-[#E2EAF4]/70 hover:text-[#A7F3D0] hover:border-[#A7F3D0]/50 transition-all shadow-sm cursor-pointer flex items-center justify-center ${
        isOpen ? 'border-[#A7F3D0] text-[#A7F3D0] bg-[#1A2421]' : ''
      }`}
      title="Open Operator System Preferences"
      aria-label="Open Operator System Preferences"
    >
      <Settings className={`h-4 w-4 transition-transform duration-300 ${isOpen ? 'rotate-90 text-[#A7F3D0]' : 'hover:rotate-45'}`} />
    </button>
  );
};
