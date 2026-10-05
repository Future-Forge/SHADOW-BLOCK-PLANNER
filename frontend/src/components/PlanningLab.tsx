import { useEffect, useRef, useState } from 'react';
import { CalendarDays, CloudRain, History, Layers3, X } from 'lucide-react';
import type { BlockDecision, BlockRequest } from '../api/types';
import { planningFetch } from '../api/planning';
import type { Evaluation, Operation, Replay } from '../api/planning';
import { useSimulation } from '../store/SimulationContext';

import { AIBatchPlanner } from './AIBatchPlanner';

const departments = ['TMS', 'SMMS', 'TDMS'] as const;
const capacities = { TMS_crew: 2, SMMS_crew: 2, TDMS_crew: 2, equipment_sets: 3, vehicles: 2 };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const clock = (minute: number) => {
  const day = Math.floor(minute / 1440); const normalized = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(Math.floor(normalized % 60)).padStart(2, '0')}${day ? ` (${day > 0 ? '+' : ''}${day}d)` : ''}`;
};
const field = 'mt-1 w-full rounded-lg border border-slate-600 bg-[#111e1b] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-400';
const card = 'rounded-xl border border-slate-700 bg-[#13211d] p-4';

function Metrics({ value }: { value: Evaluation }) {
  return <div className="space-y-3">
    <p className="text-xs text-slate-400">Baseline: {value.baseline}. Same weather and work duration in both cases.</p>
    <div className="grid grid-cols-3 gap-3">
      {[['Requested slot', value.baseline_delay_minutes], ['Planned slot', value.planned_delay_minutes], ['Minutes saved', value.delay_minutes_saved ?? 'N/A']].map(([label, amount]) => <div key={label} className={card}><div className="text-xs text-slate-400">{label}</div><div className="mt-1 text-2xl font-semibold">{amount}</div></div>)}
    </div>
    <p className="text-xs text-slate-400">Summed incremental train-delay minutes, not elapsed wall time. Weighted cost: {value.baseline_weighted_cost} → {value.planned_weighted_cost}. {value.feasible ? 'Scenario passes configured checks.' : 'Not feasible: these figures are not achievable savings.'}</p>
    {!value.baseline_feasible && <p className="text-xs text-amber-300">The requested slot starts before a train has cleared. Baseline is infeasible; no savings claim is made.</p>}
  </div>;
}

export function PlanningLab({ initialRequest, initialDecision, initialTab = 'plan', onClose }: {
  initialRequest: BlockRequest; initialDecision?: BlockDecision | null; initialTab?: 'plan' | 'history'; onClose: () => void;
}) {
  const { corridors, refreshOperations } = useSimulation();
  const [tab, setTab] = useState<'plan' | 'history' | 'ai'>(initialTab);
  const [request, setRequest] = useState<BlockRequest>({ ...initialRequest, operation_date: initialRequest.operation_date || today(),
    resource_capacity: initialRequest.resource_capacity || capacities, weather: initialRequest.weather || { mode: 'seasonal', exposed_work: false } });
  const [decision, setDecision] = useState(initialDecision || null);
  const [history, setHistory] = useState<Operation[]>([]);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const p = decision?.planning;
  const stations = [...new Map(corridors.flatMap(c => c.stations).map(s => [s.code, s])).values()];

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key === 'Tab') {
        const elements = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); };
  }, [onClose, busy]);

  const loadHistory = async () => setHistory(await planningFetch<Operation[]>('/operations'));
  useEffect(() => {
    if (tab !== 'history') return;
    let cancelled = false;
    planningFetch<Operation[]>('/operations').then(rows => { if (!cancelled) setHistory(rows); })
      .catch(err => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [tab]);
  const change = (patch: Partial<BlockRequest>) => { setRequest(prev => ({ ...prev, ...patch })); setDecision(null); setMessage(''); setError(''); };
  const work = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  const analyze = () => work(async () => setDecision(await planningFetch<BlockDecision>('/analyze-block', request)));
  const commit = () => work(async () => {
    const result = await planningFetch<{ block_id: string; decision: BlockDecision }>('/commit-block', { ...request, expected_start_iso: p?.start_iso });
    setDecision(result.decision);
    setMessage(`Saved ${result.block_id}. Resources reserved; this is a simulation, not a train-control command.`);
    await refreshOperations();
  });

  return <div className="planning-lab fixed inset-0 z-[150] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="planning-title" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-600 bg-[#0d1714] text-slate-100 shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-700 p-5">
        <div><div className="text-xs uppercase tracking-[.2em] text-emerald-400">Shadow Block · Planning simulation</div><h2 id="planning-title" className="mt-1 text-xl font-semibold">Planning Lab</h2><p className="mt-1 text-sm text-slate-400">Shared windows, weather-aware work, and an auditable operation history.</p></div>
        <button ref={closeRef} disabled={busy} onClick={onClose} aria-label="Close Planning Lab" className="rounded-lg p-2 hover:bg-slate-700"><X size={20} /></button>
      </header>
      <nav className="flex gap-2 border-b border-slate-700 px-5 py-3" aria-label="Planning views">
        <button disabled={busy} onClick={() => setTab('plan')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm ${tab === 'ai' ? <AIBatchPlanner /> : tab === 'plan' ? 'bg-emerald-400 text-black' : 'bg-slate-800'}`}><Layers3 size={16} /> Plan & compare</button>
        <button disabled={busy} onClick={() => setTab('history')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm ${tab === 'history' ? 'bg-emerald-400 text-black' : 'bg-slate-800'}`}><History size={16} /> History & evaluation</button>
        <button disabled={busy} onClick={() => setTab('ai')} className={`rounded-lg px-4 py-2 text-sm ${tab === 'ai' ? 'bg-emerald-400 text-black' : 'bg-slate-800'}`}>AI batch proposals</button>
      </nav>
      <div className="overflow-y-auto p-5">
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-400/50 bg-red-950/50 p-3 text-sm text-red-200">{error} No offline approval was generated.</p>}
        {message && <p role="status" className="mb-4 rounded-lg border border-emerald-400/50 p-3 text-sm text-emerald-200">{message}</p>}
        {tab === 'plan' ? <div className="grid gap-5 lg:grid-cols-[330px_1fr]">
          <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
            <div className={card}>
              <h3 className="mb-3 flex items-center gap-2 font-medium"><CalendarDays size={17} /> Operation</h3>
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-300">
                <label>From station<select aria-label="From station" className={field} value={request.from_station} onChange={e => change({ from_station: e.target.value })}>{stations.map(s => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}</select></label>
                <label>To station<select aria-label="To station" className={field} value={request.to_station} onChange={e => change({ to_station: e.target.value })}>{stations.map(s => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}</select></label>
                <label>Operation date<input aria-label="Operation date" type="date" className={field} value={request.operation_date} onChange={e => change({ operation_date: e.target.value })} /></label>
                <label>Start time<input aria-label="Start time" type="time" className={field} value={request.requested_time.slice(0, 5)} onChange={e => change({ requested_time: e.target.value + ':00' })} /></label>
                <label>Track line<select className={field} value={request.track_line} onChange={e => change({ track_line: e.target.value as BlockRequest['track_line'] })}><option>UP</option><option>DOWN</option></select></label>
                <label>Priority<select className={field} value={request.criticality} onChange={e => change({ criticality: e.target.value as BlockRequest['criticality'] })}><option>NORMAL</option><option>MAJOR</option><option>EMERGENCY</option></select></label>
                <label>Lead department<select className={field} value={request.department} onChange={e => change({ department: e.target.value as BlockRequest['department'], shared_tasks: [] })}>{departments.map(d => <option key={d}>{d}</option>)}</select></label>
                <label>Work minutes<input aria-label="Work minutes" type="number" min={1} max={480} className={field} value={request.duration_minutes} onChange={e => change({ duration_minutes: Number(e.target.value) })} /></label>
              </div>
            </div>
            <div className={card}><h3 className="mb-3 font-medium">Share this window</h3><p className="mb-3 text-xs text-slate-400">Add another department. Work is sequential unless parallel compatibility is explicitly confirmed.</p>
              {departments.filter(d => d !== request.department).map(d => { const task = request.shared_tasks?.find(t => t.department === d); return <div key={d} className="mb-2 flex items-center justify-between gap-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={!!task} onChange={e => change({ shared_tasks: e.target.checked ? [...(request.shared_tasks || []), { department: d, duration_minutes: 30 }] : request.shared_tasks?.filter(t => t.department !== d) })} />{d}</label>{task && <label className="flex items-center gap-2 text-xs">Minutes<input aria-label={`${d} minutes`} type="number" min={1} max={480} className={`${field} !mt-0 !w-20`} value={task.duration_minutes} onChange={e => change({ shared_tasks: request.shared_tasks?.map(t => t.department === d ? { ...t, duration_minutes: Number(e.target.value) } : t) })} /></label>}</div>; })}
              <label className="mt-3 flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" checked={!!request.parallel_work_confirmed} onChange={e => change({ parallel_work_confirmed: e.target.checked })} />I confirm these tasks can run in parallel in this simulation.</label>
            </div>
            <div className={card}><h3 className="mb-3 flex items-center gap-2 font-medium"><CloudRain size={17} /> Weather constraints</h3>
              <label className="text-xs">Weather scenario<select aria-label="Weather scenario" className={field} value={request.weather?.mode} onChange={e => change({ weather: { ...request.weather!, mode: e.target.value as NonNullable<BlockRequest['weather']>['mode'] } })}><option value="seasonal">Automatic · month & region</option><option value="clear">Clear-weather scenario</option><option value="heavy_rain">Heavy-rain scenario</option><option value="high_wind">High-wind scenario</option><option value="severe">Severe-weather scenario</option></select></label>
              <label className="mt-3 flex gap-2 text-xs"><input type="checkbox" checked={request.weather?.exposed_work} onChange={e => change({ weather: { ...request.weather!, exposed_work: e.target.checked } })} />Exposed / elevated work</label>
              <details className="mt-3 text-xs"><summary className="cursor-pointer text-slate-300">Site-specific wind-risk months</summary><p className="my-2 text-slate-400">Select locally assessed risk months for this section. Used in Automatic mode; these are scenario inputs, not IMD wind forecasts.</p><div className="grid grid-cols-4 gap-2">{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((month, i) => <label key={month} className="flex gap-1"><input type="checkbox" checked={request.weather?.wind_risk_months?.includes(i + 1) || false} onChange={e => change({ weather: { ...request.weather!, wind_risk_months: e.target.checked ? [...(request.weather?.wind_risk_months || []), i + 1] : request.weather?.wind_risk_months?.filter(m => m !== i + 1) } })} />{month}</label>)}</div></details>
              <p className="mt-3 text-xs leading-relaxed text-amber-200/80">Seasonal assumptions, not live weather. Rain extends work and delays train arrivals. Severe weather or high-wind exposed/traction work requires review. No trains are deleted.</p>
            </div>
            <details className={card}><summary className="cursor-pointer text-sm">Scenario resource capacity</summary><p className="my-3 text-xs text-slate-400">Operator-entered teams, department equipment kits and vehicles; shared across overlapping reservations. Not connected to live inventory.</p><div className="space-y-2">{Object.entries(request.resource_capacity || capacities).map(([key, value]) => <label key={key} className="flex items-center justify-between gap-3 text-xs">{key.replaceAll('_', ' ')}<input aria-label={key} type="number" min={0} max={100} className={`${field} !mt-0 !w-20`} value={value} onChange={e => change({ resource_capacity: { ...request.resource_capacity, [key]: Number(e.target.value) } })} /></label>)}</div></details>
            <button onClick={analyze} disabled={busy || !request.operation_date || !request.requested_time} className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-black disabled:opacity-50">{busy ? 'Checking scenario…' : 'Analyze scenario'}</button>
          </fieldset>
          <div className="space-y-4">
            {!p ? <div className={`${card} py-14 text-center`}><Layers3 className="mx-auto mb-3 text-emerald-400" size={32} /><h3 className="text-lg">Review a complete work window</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-400">Analyze to see resource checks, weather-adjusted duration, train movements, and the reasons behind the decision. Nothing is committed during analysis.</p></div> : <>
              <section className={card}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className={`font-semibold ${p.blocking_reasons.length ? 'text-amber-300' : 'text-emerald-300'}`}>{decision?.status.replaceAll('_', ' ')}</h3><span className="text-xs text-slate-400">{p.corridor} · {p.effective_duration_minutes} min</span></div><p className="mt-3 text-sm">{p.start_iso.replace('T', ' ')} → {p.end_iso.replace('T', ' ')}</p><p className="mt-2 text-xs text-slate-400">Shared work saves {p.shared_minutes_saved} work-window minutes before the weather adjustment.</p>
                <button disabled={busy || !!p.blocking_reasons.length || !!message} onClick={commit} className="mt-4 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">Commit simulation block</button><p className="mt-2 text-xs text-slate-400">Commit rechecks availability and saves an audit snapshot.</p>
              </section>
              <section className={card}><h3 className="mb-2 font-medium">Why this recommendation?</h3><ul className="list-disc space-y-2 pl-4 text-sm text-slate-300">{p.explanations.map((reason, i) => <li key={i}>{reason}</li>)}</ul></section>
              <section className={card}><h3 className="font-medium">Weather · {p.weather.condition.replaceAll('_', ' ')}</h3><p className="mt-2 text-sm text-slate-300">{p.weather.region}. Work ×{p.weather.duration_multiplier}; train-arrival scenario +{p.weather.train_delay_minutes} min.</p><p className="mt-2 text-xs text-slate-400">{p.weather.basis} <a className="text-emerald-300 underline" href={p.weather.source_url} target="_blank" rel="noreferrer">IMD seasonal reference</a></p></section>
              <section className={card}><h3 className="mb-3 font-medium">Resource availability</h3><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-400"><tr><th className="pb-2">Resource</th><th>Need</th><th>Reserved</th><th>Capacity</th><th>Check</th></tr></thead><tbody>{p.resources.map(r => <tr key={r.resource} className="border-t border-slate-700"><td className="py-2">{r.resource.replaceAll('_', ' ')}</td><td>{r.required}</td><td>{r.reserved}</td><td>{r.capacity}</td><td className={r.sufficient ? 'text-emerald-300' : 'text-red-300'}>{r.sufficient ? 'Available' : 'Shortage'}</td></tr>)}</tbody></table></div><p className="mt-2 text-xs text-slate-400">{p.resource_basis}</p></section>
              <section className={card}><h3 className="mb-3 font-medium">Before / after train movements</h3><p className="mb-3 text-xs text-slate-400">No-block and with-block columns both include weather delays. +1d means next day. Scheduled movements, not live telemetry.</p><div className="max-h-72 overflow-auto"><table className="w-full min-w-[480px] text-left text-xs"><thead className="sticky top-0 bg-[#13211d] text-slate-400"><tr><th className="pb-2">Train / hold location</th><th>Timetable</th><th>No block</th><th>With block</th><th>Block delay</th></tr></thead><tbody>{p.comparison.map((r, i) => <tr key={`${r.train_number}-${i}`} className="border-t border-slate-700"><td className="py-2" title={r.train_name}>#{r.train_number}<div className="text-slate-400">{r.block_delay_minutes ? `Hold at ${r.hold_station}` : 'No hold'}</div></td><td>{clock(r.scheduled_entry_min)}</td><td>{clock(r.without_block_entry_min)}</td><td>{clock(r.with_block_entry_min)}</td><td className={r.block_delay_minutes ? 'text-amber-300' : 'text-emerald-300'}>+{r.block_delay_minutes} min</td></tr>)}</tbody></table>{!p.comparison.length && <p className="py-4 text-sm text-slate-400">No modelled movements in this comparison horizon.</p>}</div></section>
              <section className={card}><h3 className="mb-3 font-medium">Scenario evaluation</h3><Metrics value={p.evaluation} /></section>
              <details className={card}><summary className="cursor-pointer text-sm">Model limits & data assumptions</summary><ul className="mt-3 list-disc space-y-2 pl-4 text-xs text-slate-400">{p.limitations.map(t => <li key={t}>{t}</li>)}</ul></details>
            </>}
          </div>
        </div> : <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-medium">Persistent operation history</h3><p className="mt-1 text-sm text-slate-400">SQLite-backed snapshots survive restarts. Closing releases resources without deleting history.</p></div><label className="text-xs">Filter by operation month<input type="month" className={field} value={filter} onChange={e => setFilter(e.target.value)} /></label><button disabled={busy} className="rounded-lg bg-slate-700 px-3 py-2 text-sm" onClick={() => work(loadHistory)}>Refresh history</button></div>
          <div className="overflow-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-xs text-slate-400"><tr><th className="pb-3">Operation / date</th><th>Section</th><th>Departments</th><th>Window</th><th>Status</th><th>Actions</th></tr></thead><tbody>{history.filter(op => !filter || op.operation_date.startsWith(filter)).map(op => <tr key={op.block_id} className="border-t border-slate-700"><td className="py-4"><div className="text-xs">{op.block_id}</div><div className="text-slate-400">{op.operation_date}</div></td><td>{op.from_station} → {op.to_station}</td><td>{op.department}</td><td>{op.start_time.slice(0, 5)} · {op.duration_minutes} min</td><td className={op.status === 'ACTIVE' ? 'text-emerald-300' : 'text-slate-400'}>{op.status}</td><td><div className="flex gap-2"><button disabled={busy || !op.snapshot} className="rounded bg-slate-700 px-3 py-2 text-xs disabled:opacity-40" onClick={() => work(async () => setReplay(await planningFetch<Replay>(`/operations/${op.block_id}/evaluate`, {})))}>Evaluate replay</button>{op.status === 'ACTIVE' && <button disabled={busy} className="rounded border border-slate-600 px-3 py-2 text-xs" onClick={() => work(async () => { await planningFetch(`/operations/${op.block_id}/close`, {}); await loadHistory(); await refreshOperations(); })}>Close block</button>}</div></td></tr>)}</tbody></table>{!history.filter(op => !filter || op.operation_date.startsWith(filter)).length && <p className="py-12 text-center text-slate-400">No saved operations for this filter.</p>}</div>
          {replay && <section className={card}><h3 className="mb-3 font-medium">Historical scenario replay · {replay.block_id}</h3><Metrics value={replay.replay} />{replay.original && <p className="mt-3 text-xs text-slate-400">At commit: {replay.original.planned_delay_minutes} planned train-delay minutes. Replay uses today's loaded timetable and current reservations, excluding this block.</p>}<ul className="mt-4 list-disc space-y-2 pl-4 text-xs text-slate-400">{replay.explanations.concat(replay.limitations).map((reason, i) => <li key={i}>{reason}</li>)}</ul></section>}
        </div>}
      </div>
    </div>
  </div>;
}
