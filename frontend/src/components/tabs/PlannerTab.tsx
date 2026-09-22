import React, { useState } from 'react';
import type { BlockRequest, BlockDecision } from '../../api/types';
import { api } from '../../api/client';
import { useCorridors } from '../../store/useCorridors';
import { Loader2, AlertTriangle, ShieldCheck, Navigation } from 'lucide-react';
import { useSimulation } from '../../store/SimulationContext';
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';

export const PlannerTab: React.FC = () => {
  const corridors = useCorridors();
  const { currentTime, commitActiveBlock } = useSimulation();
  
  const [request, setRequest] = useState<BlockRequest>({
    from_station: '',
    to_station: '',
    track_line: 'UP',
    requested_time: currentTime,
    duration_minutes: 60,
    department: 'TMS',
    criticality: 'NORMAL',
  });

  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<BlockDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedLeg, setSelectedLeg] = useState<string>('');

  const { prefillStation, setPrefillStation } = useSimulation();

  React.useEffect(() => {
    if (prefillStation) {
      const corridor = corridors.find(c => c.stations.some(s => s.code === prefillStation));
      if (corridor) {
        if (selectedLeg !== corridor.leg_id) {
          setSelectedLeg(corridor.leg_id);
        }
        setRequest(prev => {
          if (!prev.from_station) return { ...prev, from_station: prefillStation };
          if (!prev.to_station && prev.from_station !== prefillStation) return { ...prev, to_station: prefillStation };
          return { ...prev, from_station: prefillStation, to_station: '' };
        });
      }
      setPrefillStation(null);
    }
  }, [prefillStation, corridors, selectedLeg, setPrefillStation]);

  const activeCorridor = corridors.find(c => c.leg_id === selectedLeg);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDecision(null);
    
    try {
      const result = await api.analyzeBlock(request);
      setDecision(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!decision) return;
    try {
      await api.commitBlock(request);
      commitActiveBlock(request, decision);
    } catch (err) {
      setError(`Failed to commit block: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-100 flex items-center">
          <Navigation className="w-5 h-5 mr-2 text-cyan-400" />
          Block Request
        </h2>
        <p className="text-xs text-slate-400 mt-1">Submit maintenance constraints to the MILP solver.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Corridor</label>
          <select 
            className="w-full bg-[#0a0e14] border border-[#1f2733] rounded px-3 py-2 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 focus:outline-none transition-colors"
            value={selectedLeg}
            onChange={e => {
              setSelectedLeg(e.target.value);
              setRequest(prev => ({ ...prev, from_station: '', to_station: '' }));
            }}
          >
            <option value="">Select a corridor...</option>
            {corridors.map(c => (
              <option key={c.leg_id} value={c.leg_id}>{c.display_name}</option>
            ))}
          </select>
        </div>

        {activeCorridor && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">From</label>
              <select 
                className="w-full bg-[#0a0e14] border border-[#1f2733] rounded px-3 py-2 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 focus:outline-none"
                value={request.from_station}
                onChange={e => setRequest(prev => ({ ...prev, from_station: e.target.value }))}
                required
              >
                <option value="">Select...</option>
                {activeCorridor.stations.map(s => (
                  <option key={s.code} value={s.code}>{s.code} - {s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">To</label>
              <select 
                className="w-full bg-[#0a0e14] border border-[#1f2733] rounded px-3 py-2 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 focus:outline-none"
                value={request.to_station}
                onChange={e => setRequest(prev => ({ ...prev, to_station: e.target.value }))}
                required
              >
                <option value="">Select...</option>
                {activeCorridor.stations.map(s => (
                  <option key={s.code} value={s.code}>{s.code} - {s.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Time</label>
            <input 
              type="time" step="1"
              className="w-full bg-[#0a0e14] border border-[#1f2733] rounded px-3 py-2 text-sm font-mono focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 focus:outline-none"
              value={request.requested_time}
              onChange={e => setRequest(prev => ({ ...prev, requested_time: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Duration (min)</label>
            <input 
              type="number" min="1" max="480"
              className="w-full bg-[#0a0e14] border border-[#1f2733] rounded px-3 py-2 text-sm font-mono focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 focus:outline-none"
              value={request.duration_minutes}
              onChange={e => setRequest(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 0 }))}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Department</label>
            <select 
              className="w-full bg-[#0a0e14] border border-[#1f2733] rounded px-3 py-2 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 focus:outline-none"
              value={request.department}
              onChange={e => setRequest(prev => ({ ...prev, department: e.target.value as any }))}
            >
              <option value="TMS">TMS (Track)</option>
              <option value="SMMS">SMMS (Signal)</option>
              <option value="TDMS">TDMS (Traction)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Criticality</label>
            <select 
              className={`w-full bg-[#0a0e14] border rounded px-3 py-2 text-sm font-bold focus:ring-1 focus:ring-cyan-500/50 focus:outline-none
                ${request.criticality === 'NORMAL' ? 'border-green-500/50 text-green-400' : ''}
                ${request.criticality === 'MAJOR' ? 'border-amber-500/50 text-amber-400' : ''}
                ${request.criticality === 'EMERGENCY' ? 'border-red-500/50 text-red-400 animate-pulse' : ''}
              `}
              value={request.criticality}
              onChange={e => setRequest(prev => ({ ...prev, criticality: e.target.value as any }))}
            >
              <option value="NORMAL" className="text-green-400 bg-[#0a0e14]">NORMAL</option>
              <option value="MAJOR" className="text-amber-400 bg-[#0a0e14]">MAJOR</option>
              <option value="EMERGENCY" className="text-red-400 bg-[#0a0e14]">EMERGENCY</option>
            </select>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading || !request.from_station || !request.to_station}
          className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 px-4 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Run Analysis'}
        </button>
      </form>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-xs p-3 rounded">
          {error}
        </div>
      )}

      {decision && (
        <div className="border-t border-[#1f2733] pt-6 animate-in slide-in-from-bottom-2 fade-in duration-200">
          <DecisionPanel decision={decision} onCommit={handleCommit} />
        </div>
      )}
    </div>
  );
};



export const DecisionPanel: React.FC<{ decision: BlockDecision, onCommit?: () => void }> = ({ decision, onCommit }) => {
  
  const statusColors = {
    APPROVED: 'bg-green-500/20 text-green-400 border-green-500/50',
    APPROVED_WITH_REGULATION: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
    REJECTED: 'bg-red-500/20 text-red-400 border-red-500/50',
    PENDING_REVIEW: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'HOLD': return <span className="text-amber-400 text-xs font-bold px-1.5 py-0.5 border border-amber-500/30 bg-amber-500/10 rounded">HOLD</span>;
      case 'CAUTION': return <span className="text-yellow-400 text-xs font-bold px-1.5 py-0.5 border border-yellow-500/30 bg-yellow-500/10 rounded">CAUTION</span>;
      case 'DIVERT': return <span className="text-purple-400 text-xs font-bold px-1.5 py-0.5 border border-purple-500/30 bg-purple-500/10 rounded">DIVERT</span>;
      default: return <span className="text-slate-400 text-xs">{action}</span>;
    }
  };

  const chartData = [{ name: 'Asset Index', value: decision.asset_availability_index, fill: '#22d3ee' }];

  return (
    <div className="space-y-4">
      <div className={`px-3 py-2 rounded border ${statusColors[decision.status]} flex items-center justify-between`}>
        <div className="flex items-center space-x-2">
          {decision.status === 'APPROVED' ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <span className="font-bold text-sm tracking-wide">{decision.status.replace(/_/g, ' ')}</span>
        </div>
        <div className="font-mono text-sm bg-black/20 px-2 py-1 rounded">
          {decision.block_window.start} - {decision.block_window.end}
        </div>
      </div>

      {decision.notes && (
        <p className="text-xs text-slate-400 italic">
          "{decision.notes}"
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {decision.total_weighted_delay_cost !== null && (
          <div className="flex flex-col justify-center bg-[#0a0e14] p-3 rounded border border-[#1f2733]">
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">MILP Objective Value</div>
            <div className="text-xs text-slate-300 mb-2">Total weighted delay</div>
            <div className="font-mono text-xl text-amber-400">
              {decision.total_weighted_delay_cost.toFixed(1)}
            </div>
          </div>
        )}
        
        <div className="flex flex-col items-center justify-center bg-[#0a0e14] p-3 rounded border border-[#1f2733] relative h-24">
          <div className="absolute top-2 left-3 text-[10px] uppercase font-bold text-slate-500">Asset Index</div>
          <div className="absolute inset-0 flex items-center justify-center mt-3">
             <RadialBarChart 
               width={80} 
               height={80} 
               innerRadius="70%" 
               outerRadius="100%" 
               data={chartData} 
               startAngle={180} 
               endAngle={0}
             >
               <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
               <RadialBar background={{ fill: '#1f2733' }} dataKey="value" cornerRadius={10} />
             </RadialBarChart>
             <div className="absolute font-mono text-sm font-bold text-cyan-400 mt-2">
               {decision.asset_availability_index.toFixed(0)}%
             </div>
          </div>
        </div>
      </div>

      {decision.affected_trains.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Affected Traffic ({decision.affected_trains.length})</h3>
          <div className="border border-[#1f2733] rounded overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#0a0e14] border-b border-[#1f2733]">
                <tr>
                  <th className="px-3 py-2 text-slate-400 font-medium">Train</th>
                  <th className="px-3 py-2 text-slate-400 font-medium">Action</th>
                  <th className="px-3 py-2 text-slate-400 font-medium text-right">Delay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2733] bg-[#12161f]">
                {[...decision.affected_trains]
                  .sort((a, b) => a.train_number.localeCompare(b.train_number))
                  .map((t) => (
                    <tr key={t.train_number} className="hover:bg-[#1f2733]/50 transition-colors">
                    <td className="px-3 py-2">
                      <div className="font-mono text-cyan-400">{t.train_number}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{t.train_name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center space-x-2">
                        {getActionIcon(t.action)}
                        {t.hold_station && <span className="font-mono text-[10px] text-slate-500">@ {t.hold_station}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {t.delay_minutes > 0 ? (
                        <span className="font-mono text-red-400">+{t.delay_minutes}m</span>
                      ) : (
                        <span className="font-mono text-slate-500">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {onCommit && (decision.status.startsWith('APPROVED')) && (
        <button 
          onClick={onCommit}
          className="w-full mt-4 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/50 font-bold py-2.5 px-4 rounded text-sm transition-colors"
        >
          Confirm & Commit Block
        </button>
      )}
    </div>
  );
};
