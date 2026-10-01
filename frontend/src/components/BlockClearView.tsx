import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Search, TrainFront, X } from 'lucide-react';
import type { ActiveBlock, Corridor, StationItem } from '../api/types';

interface Props {
  block: ActiveBlock;
  corridors: Corridor[];
  stations: StationItem[];
  onBack: () => void;
  onClose: () => void;
}

const actionLabels = { HOLD: 'Stopped', LOOP: 'Loop hold', CAUTION: 'Restricted speed', DIVERT: 'Diverted', NONE: 'No restriction' };

/** A schematic of the committed decision, not an additional live telemetry feed. */
export function BlockClearView({ block, corridors, stations, onBack, onClose }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [selectedNumber, setSelectedNumber] = useState(block.decision.affected_trains[0]?.train_number ?? '');
  const affected = block.decision.affected_trains;
  const selected = affected.find((train) => train.train_number === selectedNumber);
  const corridor = corridors.find((route) =>
    route.stations.some((station) => station.code === block.request.from_station) &&
    route.stations.some((station) => station.code === block.request.to_station));
  const stationName = (code: string) => stations.find((station) => station.code === code)?.name ?? code;
  const stopCode = selected?.hold_station;
  // Keep only the block boundaries and the selected train's reported stop.
  // Order these by the corridor topology when available, without inventing positions.
  const codes = [...new Set([block.request.from_station, block.request.to_station,
    ...(stopCode && corridor?.stations.some((station) => station.code === stopCode) ? [stopCode] : [])])];
  if (corridor) {
    const index = (code: string) => corridor.stations.findIndex((station) => station.code === code);
    const direction = index(block.request.from_station) <= index(block.request.to_station) ? 1 : -1;
    codes.sort((a, b) => direction * (index(a) - index(b)));
  }
  const xFor = (code: string) => 130 + (codes.length <= 1 ? 310 : codes.indexOf(code) / (codes.length - 1) * 620);
  const startX = xFor(block.request.from_station);
  const endX = xFor(block.request.to_station);
  const filtered = affected.filter((train) => `${train.train_number} ${train.train_name} ${train.hold_station ?? ''}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const panel = panelRef.current;
    panel?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !panel) return;
      const elements = [...panel.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')];
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    panel?.addEventListener('keydown', trapFocus);
    return () => panel?.removeEventListener('keydown', trapFocus);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080F0D]/95 p-3 sm:p-6">
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#34453E] bg-[#101A16] text-[#E2EAF4] shadow-2xl outline-none">
        <header className="flex items-center justify-between gap-3 border-b border-[#34453E] p-4 sm:px-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-emerald-300">Focused block diagram</p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold">{block.request.from_station} → {block.request.to_station}</h2>
            <p className="mt-1 text-xs text-slate-400">{corridor?.display_name ?? 'Block section'} · {block.request.track_line} track</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onBack} className="flex items-center gap-2 rounded-lg border border-[#34453E] px-3 py-2 text-xs hover:bg-white/10"><ArrowLeft size={15} /> Blocks</button>
            <button onClick={onClose} aria-label="Close clear block view" className="rounded-lg border border-[#34453E] p-2 hover:bg-white/10"><X size={18} /></button>
          </div>
        </header>
        <div className="overflow-y-auto p-4 sm:p-6">
          <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="text-rose-300">■ {block.request.criticality} · {block.request.department}</span>
            <span>{block.decision.block_window.start} – {block.decision.block_window.end}</span>
            <span className="text-slate-400">{block.request.duration_minutes} min · {affected.length} affected trains</span>
          </div>
          <div className="rounded-xl border border-[#34453E] bg-[#0A120F]">
            <div className="flex flex-wrap justify-between gap-2 px-4 pt-4 text-xs text-slate-400">
              <span>Section location & selected train stop</span><span>Schematic · not to scale</span>
            </div>
            <div className="overflow-x-auto">
              <svg viewBox="0 0 880 285" className="w-full min-w-[620px]" role="img" aria-label={`Blocked section ${block.request.from_station} to ${block.request.to_station}${selected ? `. Train ${selected.train_number}: ${actionLabels[selected.action]}, ${stopCode ? `reported location ${stopCode}` : 'stop location not supplied'}` : '. No affected trains reported'}`}>
                <line x1="60" y1="175" x2="820" y2="175" stroke="#42564C" strokeWidth="5" />
                <rect x={Math.min(startX, endX)} y="151" width={Math.max(8, Math.abs(endX - startX))} height="48" rx="8" fill="#FB7185" fillOpacity="0.12" stroke="#FB7185" strokeDasharray="6 5" />
                <text x={(startX + endX) / 2} y="143" textAnchor="middle" fill="#FDA4AF" fontSize="12" letterSpacing="2">BLOCKED SECTION</text>
                {codes.map((code) => <g key={code}>
                  <circle cx={xFor(code)} cy="175" r="7" fill="#0A120F" stroke="#A7F3D0" strokeWidth="3" />
                  <text x={xFor(code)} y="226" textAnchor="middle" fill="#E2EAF4" fontSize="15" fontWeight="600">{code}</text>
                  <text x={xFor(code)} y="247" textAnchor="middle" fill="#94A3B8" fontSize="11">{stationName(code).slice(0, 30)}</text>
                </g>)}
                {selected && stopCode && codes.includes(stopCode) && <g>
                  <line x1={xFor(stopCode)} y1="105" x2={xFor(stopCode)} y2="162" stroke="#FBBF24" strokeDasharray="4 4" />
                  <rect x={xFor(stopCode) - 75} y="47" width="150" height="58" rx="9" fill="#30281A" stroke="#FBBF24" />
                  <text x={xFor(stopCode)} y="70" textAnchor="middle" fill="#FDE68A" fontSize="14" fontWeight="600">#{selected.train_number}</text>
                  <text x={xFor(stopCode)} y="91" textAnchor="middle" fill="#FDE68A" fontSize="12">{actionLabels[selected.action]} · {stopCode}</text>
                </g>}
              </svg>
            </div>
            <p className="border-t border-[#34453E] px-4 py-3 text-xs text-slate-400">
              {selected ? `${selected.train_name} · ${actionLabels[selected.action]}${stopCode ? ` at ${stationName(stopCode)} (${stopCode})${!codes.includes(stopCode) ? ' — outside the displayed corridor' : ''}` : ' · Exact stop location not supplied by the decision'} · Estimated delay ${selected.delay_minutes} min.` : 'No affected trains were reported for this block.'}
            </p>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-sm font-semibold">Affected trains</h3><p className="mt-1 text-xs text-slate-400">Select a train to see its reported stop on the diagram.</p></div>
            <label className="flex items-center gap-2 rounded-lg border border-[#34453E] px-3 py-2"><Search size={14} className="text-slate-400" /><input aria-label="Search affected trains" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Train number, name or stop" className="w-52 bg-transparent text-xs outline-none" /></label>
          </div>
          <div className="mt-3 grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((train) => <button key={train.train_number} aria-pressed={selectedNumber === train.train_number} onClick={() => setSelectedNumber(train.train_number)}
              className={`rounded-lg border p-3 text-left transition-colors ${selectedNumber === train.train_number ? 'border-emerald-300 bg-emerald-300/10' : 'border-[#34453E] hover:bg-white/5'}`}>
              <span className="flex items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2"><TrainFront size={15} /> #{train.train_number}</span><span className="text-xs text-amber-200">{actionLabels[train.action]}</span></span>
              <span className="mt-1 block truncate text-xs text-slate-400" title={train.train_name}>{train.train_name}</span>
              <span className="mt-2 block text-xs">{train.hold_station ? `Location: ${train.hold_station}` : 'Stop unspecified'} · +{train.delay_minutes} min</span>
            </button>)}
            {filtered.length === 0 && <p className="py-5 text-sm text-slate-400">{affected.length ? 'No trains match your search.' : 'No train stops or restrictions reported.'}</p>}
          </div>
          <p className="mt-4 text-[11px] text-slate-500">Based on this block’s planning decision. Train markers represent reported regulation locations, not live GPS positions.</p>
        </div>
      </div>
    </div>
  );
}
