import { useState } from 'react';
import { requestApi } from '../api/api';

type BatchPlan = {
  engine: string; mode: string; safety_status: string; solver_status: string;
  summary: { total_defects_evaluated: number; total_shadow_hours_saved: number };
  limitations: string[];
  blocks: { block_plan_id: number; gq_corridor: string; block_section: string;
    primary_department: string; shadow_departments: string[]; start_time: string;
    end_time: string; duration_hours: number; shadow_hours_saved: number; urgency_score: number }[];
};

export function AIBatchPlanner() {
  const [result, setResult] = useState<BatchPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await requestApi<BatchPlan>('/api/v1/ai/plan', { method: 'POST', signal: AbortSignal.timeout(75000) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };
  return <section className="space-y-4">
    <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4">
      <h3 className="font-semibold">AI batch planning · Demo dataset</h3>
      <p className="mt-2 text-sm text-slate-300">Generate proposals from the supplied October 2026 TMS, SMMS, TDMS and COA records.
        This uses a separate dataset from the manual station/time simulation. Running it replaces the previous demo batch proposals.</p>
      <p className="mt-2 text-xs text-amber-200">Controller approval required. No physical possession, train stop or electrical isolation is performed.</p>
    </div>
    <button disabled={busy} onClick={run} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
      {busy ? 'Generating batch proposals…' : 'Generate AI batch proposals'}
    </button>
    {error && <p role="alert" className="text-sm text-red-300">{error} No fallback plan was generated.</p>}
    {result && <>
      <p role="status" className="text-sm">{result.solver_status} · {result.blocks.length} proposed blocks · {result.summary.total_defects_evaluated} defects evaluated · {result.summary.total_shadow_hours_saved} shadow hours saved in this dataset</p>
      <p className="text-xs text-amber-200">{result.safety_status.replaceAll('_', ' ')}</p>
      <div className="overflow-auto"><table className="w-full min-w-[750px] text-left text-sm">
        <caption className="mb-3 text-left text-slate-400">Batch proposals — solver output, not an approved operating schedule</caption>
        <thead className="text-xs text-slate-400"><tr><th>Corridor / section</th><th>Departments</th><th>Start / end</th><th>Hours</th><th>Saved hours</th><th>Priority</th></tr></thead>
        <tbody>{result.blocks.map(b => <tr key={b.block_plan_id} className="border-t border-slate-700">
          <td className="py-3">{b.gq_corridor}<div className="text-xs text-slate-400">{b.block_section}</div></td>
          <td>{[b.primary_department, ...b.shadow_departments].join(' + ')}</td>
          <td className="text-xs">{b.start_time}<br />{b.end_time}</td>
          <td>{b.duration_hours}</td><td>{b.shadow_hours_saved}</td><td>{b.urgency_score}</td>
        </tr>)}</tbody>
      </table></div>
      {!result.blocks.length && <p>No blocks were selected by the optimizer.</p>}
      <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">{result.limitations.map(l => <li key={l}>{l}</li>)}</ul>
    </>}
  </section>;
}
