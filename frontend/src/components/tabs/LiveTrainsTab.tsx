import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useLiveTrains } from '../../store/useLiveTrains';

export const LiveTrainsTab: React.FC = () => {
  const { trains, loading } = useLiveTrains();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [gqOnly, setGqOnly] = useState(true);

  const filteredTrains = useMemo(() => {
    return trains.filter(t => {
      if (gqOnly && t.corridor_leg === null) return false;
      if (filterCategory !== 'ALL' && t.category !== filterCategory) return false;
      if (search && !t.train_number.includes(search) && !t.train_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [trains, search, filterCategory, gqOnly]);

  // Deterministic Sort: Enforce strict alphanumeric sorting by train_number
  const sortedTrains = useMemo(() => {
    return [...filteredTrains].sort((a, b) => a.train_number.localeCompare(b.train_number));
  }, [filteredTrains]);

  return (
    <div className="flex flex-col h-full -m-4">
      <div className="p-4 border-b border-[#1f2733] shrink-0 space-y-3 bg-[#12161f]">
        <div className="relative">
          <input
            type="text"
            placeholder="Search train..."
            className="w-full bg-[#0a0e14] border border-[#1f2733] rounded pl-8 pr-3 py-1.5 text-sm focus:border-cyan-500 focus:outline-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-2" />
        </div>
        
        <div className="flex space-x-2">
          <select 
            className="flex-1 bg-[#0a0e14] border border-[#1f2733] rounded px-2 py-1.5 text-xs focus:border-cyan-500 focus:outline-none"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            <option value="PREMIUM">Premium</option>
            <option value="SUPERFAST">Superfast</option>
            <option value="EXPRESS">Express</option>
            <option value="PASSENGER">Passenger</option>
            <option value="FREIGHT">Freight</option>
          </select>

          <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer px-2 border border-[#1f2733] rounded bg-[#0a0e14]">
            <input 
              type="checkbox" 
              checked={gqOnly} 
              onChange={e => setGqOnly(e.target.checked)}
              className="rounded border-slate-600 bg-[#12161f]"
            />
            <span>GQ Only</span>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {loading && trains.length === 0 ? (
          <div className="text-slate-500 text-sm text-center mt-4">Loading trains...</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 mb-2">Showing {sortedTrains.length} trains</div>
            {sortedTrains.slice(0, 100).map((train) => (
              <TrainCard key={train.train_number} train={train} />
            ))}
            {sortedTrains.length > 100 && (
              <div className="text-center text-xs text-slate-500 mt-4">+ {sortedTrains.length - 100} more</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface TrainCardProps {
  train: import('../../api/types').LiveTrainState;
}

export const TrainCard: React.FC<TrainCardProps> = React.memo(({ train }) => {
  const isDelayedOrHeld = train.status === 'HELD' || train.delay_minutes > 0 || train.status === 'LOOPED';

  return (
    <div className="bg-[#0a0e14] border border-[#1f2733] rounded p-2 flex justify-between items-center hover:border-slate-700 transition-colors">
      <div>
        <div className="flex items-center space-x-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isDelayedOrHeld
                ? 'bg-[#f97316]'
                : train.category === 'PREMIUM'
                ? 'bg-[#fcd34d]'
                : train.category === 'SUPERFAST'
                ? 'bg-[#38bdf8]'
                : train.category === 'EXPRESS'
                ? 'bg-[#34d399]'
                : train.category === 'FREIGHT'
                ? 'bg-[#94a3b8]'
                : 'bg-[#e2eaf4]'
            }`}
          />
          <span className="font-mono text-sm font-bold text-slate-200">{train.train_number}</span>
        </div>
        <div className="text-[10px] text-slate-500 ml-4 truncate max-w-[150px]">{train.train_name}</div>
      </div>

      <div className="text-right">
        <div className="text-xs text-slate-300 font-mono">
          {train.current_section} ({train.track_line})
        </div>
        <div className="text-[10px] font-mono">
          <span
            className={
              isDelayedOrHeld
                ? 'text-orange-400 font-semibold'
                : train.status === 'RUNNING'
                ? 'text-green-400'
                : 'text-amber-400'
            }
          >
            {train.status}
            {train.delay_minutes > 0 ? ` (+${train.delay_minutes}m)` : ''}
          </span>
          <span className="text-slate-600 mx-1">|</span>
          <span className="text-slate-400">{train.speed_kmph.toFixed(0)} km/h</span>
        </div>
      </div>
    </div>
  );
});
