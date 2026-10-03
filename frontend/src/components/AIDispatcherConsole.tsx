import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Loader2, ArrowUpRight, Maximize2, Minimize2, RotateCcw, Cpu, ShieldCheck, ThermometerSun, FileDown, Eye, Check, X } from 'lucide-react';
import { api } from '../api/api';
import type { BlockRequest, BlockDecision, DispatcherChatResponse } from '../api/types';
import './assistant.css';

interface Props {
  simTime: string;
  onExecuteBlock?: (request: BlockRequest, decision: BlockDecision) => void;
  onFlyTo?: (lon: number, lat: number, zoom?: number, pitch?: number, bearing?: number) => void;
  onApplyDecision?: (decision: BlockDecision, request?: BlockRequest) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onClose?: () => void;
}
type Message = Partial<DispatcherChatResponse> & { id: string; role: 'user' | 'assistant'; text: string; timestamp: string };
type Status = Awaited<ReturnType<typeof api.assistantStatus>>;
const STORAGE = 'shadow-engine-conversation-v1';
const WELCOME: Message = { id: 'welcome', role: 'assistant', timestamp: '', text: '## A clearer path to your next decision.\nRun your trained defect-risk model, investigate thermal scenarios, inspect a train or prepare a block window. Predictions and planning proposals stay separate from implemented operations.' };
const STARTERS = [
  { icon: Cpu, title: 'Assess a defect', subtitle: 'Your trained XGBoost model', prompt: 'Score a TMS defect: age 10 days, temperature 44 C, tonnage 85 MGT, speed restriction 45 km/h' },
  { icon: ThermometerSun, title: 'Explore rail stress', subtitle: 'Temperature & worksite assumptions', prompt: 'Calculate rail stress at 42 C with 15% cloud cover' },
  { icon: ShieldCheck, title: 'Plan a work window', subtitle: 'Analyze the loaded timetable', prompt: 'Analyze normal TMS block from Surat to Vadodara at 14:00 for 45 minutes' },
  { icon: FileDown, title: 'Export operations', subtitle: 'Monthly CSV from the backend ledger', prompt: "Export last month's report" },
];
function loadMessages(): Message[] {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE) || 'null');
    if (Array.isArray(saved)) return saved.filter((m) => m && typeof m.text === 'string' && typeof m.id === 'string' && ['user', 'assistant'].includes(m.role)).slice(-40);
  } catch { /* A blocked browser store must not prevent chat. */ }
  return [WELCOME];
}
function inline(text: string) {
  return text.split(/(\*\*.*?\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> :
    part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part);
}
function MessageText({ text }: { text: string }) {
  return <div className="assistant-prose">{text.split('\n').map((line, i) =>
    line.startsWith('## ') ? <h3 key={i}>{inline(line.slice(3))}</h3> :
    line.startsWith('- ') ? <div className="prose-bullet" key={i}><span>•</span><p>{inline(line.slice(2))}</p></div> :
    line ? <p key={i}>{inline(line)}</p> : <div key={i} className="prose-break" />)}</div>;
}
function download(payload: Record<string, any>) {
  if (typeof payload.csv_data !== 'string') return;
  const url = URL.createObjectURL(new Blob([payload.csv_data], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ShadowBlock_Report_${String(payload.month).replace(/[^a-z0-9_-]/gi, '_')}_${payload.year}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AIDispatcherConsole({ simTime, onExecuteBlock, onFlyTo, onApplyDecision, expanded, onToggleExpand, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState('');
  const [statusAttempt, setStatusAttempt] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const latestMessageRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const chatAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; chatAbort.current?.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api.assistantStatus(controller.signal).then((value) => { setStatus(value); setStatusError(''); })
      .catch(() => { if (!controller.signal.aborted) setStatusError('Backend unavailable'); });
    return () => controller.abort();
  }, [statusAttempt]);
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE, JSON.stringify(messages.slice(-40))); } catch { /* optional persistence */ }
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: !processing && messages.at(-1)?.role === 'assistant' ? latestMessageRef.current?.offsetTop ?? el.scrollHeight : el.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [messages, processing]);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const resize = () => {
      el.style.height = '0px';
      el.style.height = Math.min(96, Math.max(24, el.scrollHeight)) + 'px';
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (el.parentElement) observer.observe(el.parentElement);
    return () => observer.disconnect();
  }, [input]);

  function appendError(error: unknown) {
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: 'assistant', timestamp: simTime,
      text: `The request could not be confirmed: ${error instanceof Error ? error.message : String(error)}. No success result has been substituted. Check the backend before retrying a save.` }]);
  }
  async function send(raw: string) {
    const message = raw.trim();
    if (!message || busyRef.current) return;
    busyRef.current = true;
    setProcessing(true);
    setInput('');
    const controller = new AbortController();
    chatAbort.current = controller;
    const history = messages.filter((m) => m.id !== 'welcome').slice(-10).map((m) => ({ role: m.role, content: m.text.slice(0, 8000) }));
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: 'user', text: message, timestamp: simTime }]);
    try {
      const result = await api.chatDispatcher({ message, sim_time: simTime, history }, controller.signal);
      if (!mounted.current) return;
      setMessages((items) => [...items, { ...result, id: crypto.randomUUID(), role: 'assistant', text: result.response_text, timestamp: simTime }]);
      if (result.action_triggered === 'DOWNLOAD_CSV') download(result.payload);
      if (result.action_triggered === 'PLAN_PROPOSAL' && result.payload.decision) onApplyDecision?.(result.payload.decision, result.payload.request);
    } catch (error) { if (mounted.current && !controller.signal.aborted) appendError(error); }
    finally { if (mounted.current) { setProcessing(false); inputRef.current?.focus(); } busyRef.current = false; }
  }
  async function save(message: Message) {
    if (busyRef.current || message.payload?.committed_block_id || !message.payload?.request) return;
    busyRef.current = true;
    setSaving(message.id);
    try {
      const result = await api.commitAssistantBlock({ ...message.payload.request, expected_start_iso: message.payload.decision?.planning?.start_iso });
      if (!result.committed) throw new Error('Backend did not commit this block');
      onExecuteBlock?.(message.payload.request, result.decision);
      setMessages((items) => items.map((m) => m.id === message.id ? { ...m, payload: { ...m.payload, committed_block_id: result.block_id, decision: result.decision } } : m));
    } catch (error) { appendError(error); }
    finally { busyRef.current = false; setSaving(null); }
  }
  const ready = status?.model.available && !statusError;
  return <section className="assistant-workspace" aria-label="AI engine assistant">
    <header className="assistant-heading">
      <div className="assistant-emblem"><Bot size={25} /></div>
      <div><span className="assistant-kicker">SHADOW BLOCK / INTELLIGENCE</span><h2>Your operations copilot<span>.</span></h2></div>
      <div className="assistant-header-actions">
        <button aria-label="Reset conversation" disabled={processing || !!saving} onClick={() => setMessages([WELCOME])} title="Reset conversation"><RotateCcw size={17} /></button>
        {onToggleExpand && <button aria-label={expanded ? 'Reduce assistant width' : 'Expand assistant workspace'} onClick={onToggleExpand} title={expanded ? 'Reduce width' : 'Expand workspace'}>{expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>}
        {onClose && <button aria-label="Close assistant" title="Close assistant" onClick={onClose}><X size={18} /></button>}
      </div>
    </header>
    <div className="engine-strip"><span className={ready ? 'engine-light ready' : 'engine-light'} /><b>{statusError || (ready ? 'Trained model connected' : status ? 'Model unavailable' : 'Checking engine…')}</b><span>{ready ? `${status?.model.trees} trees · local inference` : 'No synthetic success responses'}</span><button aria-label="Refresh engine status" onClick={() => setStatusAttempt((v) => v + 1)}><RotateCcw size={13} /></button></div>
    <div className="assistant-scroll" ref={scrollRef} role="log" aria-label="Assistant conversation" aria-busy={processing}>
      {messages.every(m => m.id === 'welcome') && <div className="assistant-starters">{STARTERS.map((item) => <button key={item.title} disabled={processing} onClick={() => { setInput(item.prompt); inputRef.current?.focus(); }}><item.icon size={20} /><div><b>{item.title}</b><span>{item.subtitle}</span></div><ArrowUpRight size={15} /></button>)}</div>}
      {messages.map((message, index) => <article ref={index === messages.length - 1 ? latestMessageRef : undefined} key={message.id} className={`assistant-message ${message.role}`}>
        <div className="message-meta"><span>{message.role === 'user' ? 'YOU / OPERATOR' : 'SHADOW INTELLIGENCE'}</span><time>{message.timestamp}</time></div>
        <MessageText text={message.text} />
        {message.action_triggered === 'MODEL_PREDICTION' && message.payload && <div className="prediction-result"><div><span>MODEL SCORE</span><strong>{message.payload.criticality_score}<small>/ 100</small></strong></div><div><b>{message.payload.urgency_tier}</b><span>Simulation assessment · not a failure probability</span></div></div>}
        {message.payload?.features && <details className="assistant-details"><summary>Inputs & assumptions used</summary><dl>{Object.entries(message.payload.features).map(([key, value]) => <React.Fragment key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{String(value)}</dd></React.Fragment>)}</dl></details>}
        {message.action_triggered === 'PLAN_PROPOSAL' && message.payload?.decision && <div className="proposal-result">
          <div><ShieldCheck size={18} /><b>{message.payload.decision.status}</b><span>{message.payload.decision.block_window?.start} → {message.payload.decision.block_window?.end}</span></div>
          {message.payload.decision.affected_trains?.length > 0 && <details className="assistant-details"><summary>{message.payload.decision.affected_trains.length} affected trains</summary><div className="assistant-table-wrap"><table><thead><tr><th>Train</th><th>Action</th><th>Delay (min)</th></tr></thead><tbody>{message.payload.decision.affected_trains.map((t: any) => <tr key={t.train_number}><td>{t.train_number} · {t.train_name}</td><td>{t.action}</td><td>{t.delay_minutes}</td></tr>)}</tbody></table></div></details>}
          {message.payload.committed_block_id ? <p className="saved-confirmation"><Check size={16} />Saved: {message.payload.committed_block_id}</p> :
            onExecuteBlock && ['APPROVED', 'APPROVED_WITH_REGULATION'].includes(message.payload.decision.status) && <button className="assistant-primary" disabled={processing || !!saving} onClick={() => save(message)}>{saving === message.id ? <Loader2 className="assistant-spin" size={16} /> : <ShieldCheck size={16} />} Save simulation block</button>}
        </div>}
        {message.fly_to_target && onFlyTo && <button className="assistant-link" onClick={() => { const t = message.fly_to_target!; onFlyTo(t.lon, t.lat, t.zoom, t.pitch ?? 42, t.bearing ?? -12); }}><Eye size={15} /> Locate on map</button>}
        {message.action_triggered === 'DOWNLOAD_CSV' && message.payload && <button className="assistant-link" onClick={() => download(message.payload!)}><FileDown size={15} /> Download CSV again</button>}
        {message.payload?.sources && <div className="assistant-source"><Cpu size={12} /><span>{message.payload.sources.join(' · ')}</span></div>}
        {message.payload?.suggested_followups?.length > 0 && <div className="assistant-followups">{message.payload?.suggested_followups.map((prompt: string) => <button key={prompt} disabled={processing} onClick={() => { setInput(prompt); inputRef.current?.focus(); }}>{prompt}<ArrowUpRight size={13} /></button>)}</div>}
      </article>)}
      {processing && <div className="assistant-working" role="status"><Loader2 size={18} className="assistant-spin" /><div><b>Working with your engine</b><span>Checking inputs and backend results</span></div></div>}
    </div>
    <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
      <label htmlFor="assistant-message" className="assistant-input-label">Message the assistant</label>
      <div><textarea id="assistant-message" ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={8000} placeholder="Ask about a defect, train or block window…" disabled={processing || !!saving} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input); } }} /><button type="submit" aria-label="Send message" disabled={processing || !!saving || !input.trim()}>{processing ? <Loader2 size={20} className="assistant-spin" /> : <Send size={20} />}</button></div>
      <footer><span><ShieldCheck size={12} />Simulation only · controller review required</span><span>Enter to send · Shift + Enter for a new line</span></footer>
    </form>
  </section>;
}
