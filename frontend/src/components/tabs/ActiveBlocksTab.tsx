import React from 'react';
import { ShieldAlert, MapPin, Clock, X } from 'lucide-react';
import { useSimulation } from '../../store/SimulationContext';

export const ActiveBlocksTab: React.FC = () => {
  const { activeBlocks, clearActiveBlock } = useSimulation();

  if (activeBlocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-500">
        <ShieldAlert className="w-8 h-8 mb-2 opacity-20" />
        <p className="text-sm">No active blocks committed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-100 flex items-center">
        <ShieldAlert className="w-5 h-5 mr-2 text-cyan-400" />
        Active Blocks
      </h2>
      
      <div className="space-y-3">
        {activeBlocks.map((block) => (
          <div key={block.id} className="bg-[#0a0e14] border border-[#1f2733] rounded p-3 relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-1" style={{ background: block.request.criticality === 'EMERGENCY' ? '#ff3366' : block.request.criticality === 'MAJOR' ? '#ff8800' : '#ffcc00' }} />
            <div className="flex justify-between items-start mb-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                block.request.criticality === 'EMERGENCY' ? 'bg-red-500/20 text-red-400' :
                block.request.criticality === 'MAJOR' ? 'bg-amber-500/20 text-amber-400' :
                'bg-green-500/20 text-green-400'
              }`}>
                {block.request.criticality}
              </span>
              <button onClick={() => clearActiveBlock(block.id)} className="text-slate-500 hover:text-red-400" title="Clear active block" aria-label="Clear active block">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex items-center text-sm text-slate-200 mb-1 font-mono">
              <MapPin className="w-3 h-3 mr-1 text-slate-500" />
              {block.request.from_station} <span className="mx-1 text-slate-600">→</span> {block.request.to_station}
            </div>
            
            <div className="flex items-center text-xs text-slate-400 font-mono">
              <Clock className="w-3 h-3 mr-1" />
              {block.request.requested_time} ({block.request.duration_minutes}m) · {block.request.department}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
