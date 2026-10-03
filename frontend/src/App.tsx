import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { ArrowRight, Check, ChevronRight, Clock3, CloudSun, Compass, Database,
  Focus, Layers3, MapPin, Network, Pause, Play, Plus, RefreshCw, Search, Settings2, ShieldCheck,
  Sparkles, TrainFront, TriangleAlert, X } from 'lucide-react';
import { NetworkMap } from "./components/NetworkMap";
import { MapBoundary } from "./components/MapBoundary";
import { PlanningLab } from './components/PlanningLab';
import { BlockClearView } from './components/BlockClearView';
import { ActiveBlocksModal } from './components/ActiveBlocksModal';
import { AIDispatcherConsole } from './components/AIDispatcherConsole';
import { SettingsModal } from './components/modals/SettingsModal';
import { api, getApiBaseUrl, setApiBaseUrl } from './api/api';
import type { ActiveBlock, BlockDecision, BlockRequest, Corridor, HealthResponse, LiveTrainState } from './api/types';
import { SimulationProvider, useSimulation } from './store/SimulationContext';
import { useLiveTrains } from './store/useLiveTrains';
import { boundsForCoordinates, getBlockPath } from './lib/mapPresentation';
import { useDialogFocus } from './lib/useDialogFocus';
import "./workspace.css";
import "./cinematic.css";

type Panel = 'overview' | 'trains' | 'blocks' | 'assistant';
const defaultRequest: BlockRequest = { from_station: 'ST', to_station: 'BCT', track_line: 'UP',
  requested_time: '12:00:00', duration_minutes: 60, department: 'TMS', criticality: 'NORMAL' };
const corridorNames: Record<string, string> = { WEST: 'Western corridor', SOUTH_WEST: 'Deccan corridor', EAST_COAST: 'East coast corridor', NORTH_EAST: 'Gangetic corridor' };
const endpoints: Record<string, string> = { WEST: 'Delhi → Mumbai', SOUTH_WEST: 'Mumbai → Chennai', EAST_COAST: 'Chennai → Kolkata', NORTH_EAST: 'Kolkata → Delhi' };
const panelTitles: Record<Panel, string> = { overview: 'Network overview', trains: 'Train explorer', blocks: 'Implemented blocks', assistant: 'AI dispatcher' };

function AppShell() {
  const { currentTime, isPlaying, togglePlay, speedMultiplier, setSpeedMultiplier, scrubToTime, activeBlocks,
    corridors, stations, flyToCoordinates, flyToBounds, commitActiveBlock, refreshCorridors, refreshOperations,
    stationsError, isLoadingStations } = useSimulation();
  const { trains, loading, error, lastUpdated, retry } = useLiveTrains();
  const [panel, setPanel] = useState<Panel>('overview');
  const [panelOpen, setPanelOpen] = useState(false);
  const [assistantExpanded, setAssistantExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [trainLimit, setTrainLimit] = useState(50);
  const [corridorFilter, setCorridorFilter] = useState('ALL');
  const [selectedTrain, setSelectedTrain] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [clearBlock, setClearBlock] = useState<ActiveBlock | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [planningTab, setPlanningTab] = useState<'plan' | 'history'>('plan');
  const [planRequest, setPlanRequest] = useState(defaultRequest);
  const [planDecision, setPlanDecision] = useState<BlockDecision | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const connectionRef = useRef<HTMLElement>(null);
  useDialogFocus(connectionOpen, connectionRef);
  const [endpoint, setEndpoint] = useState(getApiBaseUrl());
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState({ trains: true, blocks: true, stations: true });
  const closePlanning = useCallback(() => setPlanningOpen(false), []);
  const openPanel = (value: Panel) => { setPanel(value); setPanelOpen(true); };
  const checkHealth = useCallback(async () => {
    try { setHealth(await api.health()); setConnectionError(''); }
    catch (err) { setHealth(null); setConnectionError(err instanceof Error ? err.message : String(err)); }
  }, []);
  useEffect(() => { void checkHealth(); const timer = setInterval(checkHealth, 30000); return () => clearInterval(timer); }, [checkHealth]);
  useEffect(() => {
    const refresh = () => refreshOperations().then(() => setHistoryError('')).catch(() => setHistoryError('Operation history is unavailable. Showing the last loaded blocks.'));
    void refresh(); const timer = setInterval(refresh, 30000); return () => clearInterval(timer);
  }, [refreshOperations]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); document.getElementById('network-search')?.focus();
      }
      if (event.key === 'Escape') { setConnectionOpen(false); setLayersOpen(false); }
    };
    window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const scopedTrains = useMemo(() => trains.filter(t => corridorFilter === 'ALL' || t.corridor_leg === corridorFilter), [trains, corridorFilter]);
  const matchingTrains = useMemo(() => scopedTrains.filter(t => `${t.train_number} ${t.train_name} ${t.current_section}`.toLowerCase().includes(query.toLowerCase())), [scopedTrains, query]);
  const matchingStations = query.trim().length > 1 ? stations.filter(s => `${s.code} ${s.name}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5) : [];
  const train = trains.find(t => t.train_number === selectedTrain);
  const affectedBy = train ? activeBlocks.filter(b => b.decision.affected_trains.some(t => t.train_number === train.train_number)) : [];
  const connected = health?.status === 'ok' && !error;
  const allPoints = useMemo(() => corridors.flatMap(c => c.stations.map(s => [s.lon, s.lat] as [number, number])), [corridors]);
  const focusRoute = (corridor?: Corridor) => {
    setCorridorFilter(corridor?.leg_id || 'ALL');
    const bounds = boundsForCoordinates(corridor ? corridor.stations.map(s => [s.lon, s.lat]) : allPoints);
    if (bounds) flyToBounds(bounds, 42, 1000);
  };
  const inspectTrain = (value: LiveTrainState, move = true) => {
    setSelectedTrain(value.train_number); openPanel('trains');
    if (move) flyToCoordinates(value.lon, value.lat, 8.6, 25, 0, 1100);
  };
  const inspectBlock = (block: ActiveBlock) => {
    setSelectedBlock(block.id); openPanel('blocks');
    const bounds = boundsForCoordinates(getBlockPath(block, corridors));
    if (bounds) flyToBounds(bounds, 35, 1100);
  };
  const startPlan = (station?: string) => {
    setPlanningTab('plan'); setPlanDecision(null); setPlanRequest({ ...defaultRequest, requested_time: currentTime,
      ...(station ? { from_station: station } : {}) }); setPlanningOpen(true);
  };
  const handleDecision = (decision: BlockDecision, request?: BlockRequest) => {
    setPlanDecision(decision);
    if (request) setPlanRequest(request);
    // AI analysis is shown without substituting an unrelated manual request.
    openPanel('assistant');
  };
  const isStale = !!error;

  return <MotionConfig reducedMotion="user">      <div className={`rail-workspace cinematic-workspace ${panelOpen ? "details-open" : ""}`}>
    <header className="workspace-header">
      <button className="brand-lockup" onClick={() => { focusRoute();               setPanelOpen(false); }} aria-label="Shadow Block network home">
        <span className="brand-symbol"><Network size={24} strokeWidth={1.7} /></span>
        <span><strong>shadow<span>block</span><i /></strong><small>RAILWAY INTELLIGENCE</small></span>
      </button>
      <div className="header-divider" />
      <span className="workspace-location">Control workspace <ChevronRight size={13} /> <b>Golden Quadrilateral</b></span>
      <label className="global-search"><Search size={16} /><input id="network-search" aria-label="Search trains or stations" placeholder="Search trains or stations" value={query} onChange={e => { setQuery(e.target.value); setTrainLimit(50); openPanel('trains'); }} /><kbd>⌘ K</kbd>{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}</label>
      <button className={`connection-pill ${connected ? 'connected' : 'disconnected'}`} onClick={() => { setEndpoint(getApiBaseUrl()); setConnectionOpen(true); }}><span className="status-dot" />{connected ? 'Backend connected' : 'Check connection'}</button>
      <button className="icon-button header-settings" onClick={() => setSettingsOpen(true)} title="Display and accessibility settings" aria-label="Display and accessibility settings"><Settings2 size={18} /></button>
    </header>

    <div className="workspace-body">
      <nav className="workspace-rail" aria-label="Workspace sections">
        {([{ id: 'overview', icon: Compass, label: 'Overview' }, { id: 'trains', icon: TrainFront, label: 'Trains' }, { id: 'blocks', icon: ShieldCheck, label: 'Blocks' }, { id: 'assistant', icon: Sparkles, label: 'Assistant' }] as const).map(item => <button key={item.id} className={panel === item.id && panelOpen ? 'rail-item active' : 'rail-item'} aria-pressed={panel === item.id && panelOpen}                 onClick={() => {
                  if (panel === item.id && panelOpen) setPanelOpen(false);
                  else openPanel(item.id);
                }}><item.icon size={20} strokeWidth={1.6} /><span>{item.label}</span>{item.id === 'blocks' && activeBlocks.length > 0 && <i className="rail-badge">{activeBlocks.length}</i>}</button>)}
        <div className="rail-spacer" /><button className="rail-item" onClick={() => startPlan()}><Plus size={21} /><span>New plan</span></button><span className="rail-version">SB / 01</span>
      </nav>

      <main className="map-workspace">
        <div className="map-heading"><div><div className="eyebrow">                  <span /> NATIONAL OPERATIONS / INDIA</div><h1>Golden Quadrilateral<span>.</span></h1>                <p>Four corridors. One command view.</p></div>
          <button className="primary-button" onClick={() => startPlan()}><Plus size={16} /> Plan a block</button>
        </div>
        <div className="atlas-frame">
                      <MapBoundary><NetworkMap trains={scopedTrains} onTrainClick={t => inspectTrain(t, false)} onBlockClick={inspectBlock}
            selectedTrainId={selectedTrain} selectedBlockId={selectedBlock}                 focusCorridor={corridorFilter}
                detailPanelOpen={panelOpen}
            showTrains={layers.trains} showBlocks={layers.blocks} showStations={layers.stations}
            onStationClick={code => { setQuery(code); openPanel('trains'); }} /></MapBoundary>
          <div className="atlas-topbar"><div className="atlas-label"><span className="atlas-label-mark" /> GQ / {corridorFilter === 'ALL' ? 'ALL CORRIDORS' : corridorFilter.replaceAll('_', ' ')}</div>
            <div className="layer-control"><button className={`map-chip ${layersOpen ? 'active' : ''}`} onClick={() => setLayersOpen(v => !v)} aria-expanded={layersOpen}><Layers3 size={14} /> Layers</button>{layersOpen && <div className="layer-menu">{(['trains','blocks','stations'] as const).map(key => <label key={key}><input type="checkbox" checked={layers[key]} onChange={e => setLayers(v => ({ ...v, [key]: e.target.checked }))} />{key === 'blocks' ? 'Implemented blocks' : key === 'trains' ? 'Train markers' : 'Station detail'}</label>)}</div>}</div>
          </div>
          {(loading || isLoadingStations) && <div className="atlas-loading" role="status"><span className="loading-orbit" /><b>Connecting the network</b><span>Loading timetable & corridor geometry</span></div>}
          {(error || stationsError) && <div className="feed-warning" role="alert"><TriangleAlert size={15} /><span>{isStale ? 'Train feed unavailable. Last-known positions may be stale.' : 'Reference network shown; backend geometry unavailable.'}</span><button onClick={() => { retry(); void refreshCorridors(); void checkHealth(); }}>Retry</button></div>}
          <div className="map-legend"><span><i className="legend-line" />Golden Quadrilateral</span><span><i className="legend-train" />Trains <em>{scopedTrains.length}</em></span><span><i className="legend-block" />Blocks <em>{activeBlocks.length}</em></span></div>
          {!panelOpen && <motion.section className="network-pulse" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} aria-label="Network pulse">
<div className="pulse-heading"><span className="status-dot"/><span>NETWORK PULSE</span><button onClick={()=>openPanel("overview")} aria-label="Open network overview"><ArrowRight size={15}/></button></div>
<div className="pulse-metrics"><button onClick={()=>openPanel("trains")}><TrainFront size={17}/><strong>{loading?"—":trains.length}</strong><span>Modelled trains</span></button><button className="pulse-blocks" onClick={()=>openPanel("blocks")}><ShieldCheck size={17}/><strong>{historyError?"—":activeBlocks.length}</strong><span>Implemented blocks</span></button></div>
{activeBlocks.length>0 ? <button className="pulse-operation" onClick={()=>inspectBlock(activeBlocks[0])}><span className="operation-beacon"/><span><small>SAVED BLOCK · LOCATE 3D</small><b>{activeBlocks[0].request.from_station}<ArrowRight size={12}/>{activeBlocks[0].request.to_station}</b></span><Focus size={17}/></button> : <div className="pulse-empty"><ShieldCheck size={14}/><span>{historyError?"Block history unavailable":"No implemented blocks"}</span></div>}
<p>{isStale?"Last-known snapshot · feed unavailable":"Timetable simulation · not live GPS"}</p></motion.section>}
        </div>
        <footer className="playback-bar">
          <div className="playback-controls"><button className="play-button" aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'} onClick={togglePlay}>{isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><div className="simulation-clock"><small>{isPlaying ? 'SIMULATION RUNNING' : 'SIMULATION PAUSED'}</small><time>{currentTime}</time></div><select aria-label="Playback speed" value={speedMultiplier} onChange={e => setSpeedMultiplier(Number(e.target.value) as 1 | 2 | 5 | 10)}>{[1, 2, 5, 10].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></div>
          <label className="timeline-control"><span>00:00</span><input aria-label="Simulation time" type="range" min={0} max={1439} value={Number(currentTime.slice(0, 2)) * 60 + Number(currentTime.slice(3, 5))} onChange={e => { if (isPlaying) togglePlay(); const m = Number(e.target.value); scrubToTime(`${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}:00`); }} /><span>23:59</span></label>
          <div className="feed-source"><span className={isStale ? 'stale-light' : 'feed-light'} />{isStale ? 'Stale snapshot' : 'Timetable simulation'}<small>{lastUpdated ? `Snapshot ${lastUpdated}` : 'Awaiting backend'}</small></div>
        </footer>
      </main>

      <AnimatePresence initial={false}>{panelOpen && <motion.aside key="panel" className={`context-panel ${panel === 'assistant' ? `assistant-panel engine-panel ${assistantExpanded ? 'engine-expanded' : ''}` : ''}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: .2 }} aria-label={panelTitles[panel]}>
        {panel !== 'assistant' && <div className="panel-heading"><div><span className="eyebrow">WORKSPACE / {panel === 'overview' ? '01' : panel === 'trains' ? '02' : panel === 'blocks' ? '03' : '04'}</span><h2>{panelTitles[panel]}</h2></div><button className="icon-button" onClick={() => setPanelOpen(false)} aria-label="Hide detail panel"><X size={17} /></button></div>}
        <div className={`panel-body ${panel === 'assistant' ? 'panel-chat' : ''}`}>
          {panel === 'overview' && <>
            <section className="network-summary"><div className="summary-icon"><Network size={24} strokeWidth={1.4} /></div><span className="subtle-badge">{corridors.length} CONNECTED CORRIDORS</span><h3>The bigger picture.<br /><span>Every movement matters.</span></h3><p>Explore the backbone. Inspect a train. Plan a better maintenance window.</p><div className="summary-metrics"><button onClick={() => openPanel('trains')}><strong>{loading ? '—' : trains.length}</strong><span>Modelled trains <ArrowRight size={12} /></span></button><button onClick={() => openPanel('blocks')}><strong className="coral-text">{historyError ? '—' : activeBlocks.length}</strong><span>Saved blocks <ArrowRight size={12} /></span></button></div></section>
            <div className="section-heading"><h3>Corridor intelligence</h3><button onClick={() => focusRoute()}>View all</button></div>
            <div className="corridor-list">{corridors.map((c, i) => <button key={c.leg_id} className={`corridor-card ${corridorFilter === c.leg_id ? 'selected' : ''}`} onClick={() => focusRoute(c)}><span className="corridor-index">0{i + 1}</span><div><strong>{corridorNames[c.leg_id]}</strong><span>{endpoints[c.leg_id]}</span><div className="corridor-mini-line"><i /><b /><i /></div><small>{Math.round(c.total_km).toLocaleString()} km <em>·</em> {trains.filter(t => t.corridor_leg === c.leg_id).length} trains</small></div><ChevronRight size={16} /></button>)}</div>
            {!corridors.length && !isLoadingStations && <div className="empty-state">Network geometry is unavailable.<button className="secondary-button" onClick={() => void refreshCorridors()}>Reload network</button></div>}
            <button className="weather-invite" onClick={() => startPlan()}><CloudSun size={22} /><span><strong>Plan with the conditions</strong><small>Weather, crews & shared windows</small></span><ArrowRight size={16} /></button>
            <div className="data-disclosure"><Database size={14} /><p>Backend timetable simulation. Positions are interpolated, not live GPS. Saved blocks are planning overlays.</p></div>
          </>}

          {panel === 'trains' && <>
            <div className="panel-filter"><select aria-label="Filter trains by corridor" value={corridorFilter} onChange={e => { setCorridorFilter(e.target.value); setTrainLimit(50); }}><option value="ALL">All corridors</option>{corridors.map(c => <option key={c.leg_id} value={c.leg_id}>{corridorNames[c.leg_id]}</option>)}</select><span>{matchingTrains.length} trains</span></div>
            {train && <section className="train-detail"><div className="train-detail-top"><span className="train-glyph"><TrainFront size={23} /></span><div><small>SELECTED TRAIN</small><h3>#{train.train_number}</h3></div><button className="icon-button" aria-label="Clear selected train" onClick={() => setSelectedTrain(null)}><X size={15} /></button></div><h4>{train.train_name}</h4><span className="train-category">{train.category} · {train.track_line}</span><div className="train-stats"><div><strong>{Math.round(train.speed_kmph)}<small> km/h</small></strong><span>Estimated speed</span></div><div><strong>{train.status.toLowerCase()}</strong><span>Timetable state</span></div></div><div className="train-section"><MapPin size={14} />{train.current_section}</div>{affectedBy.length > 0 && <p className="plan-impact"><TriangleAlert size={14} />Included in {affectedBy.length} saved block plan(s). Planned restrictions are not executed movements.</p>}<button className="secondary-button full" onClick={() => inspectTrain(train)}><Focus size={14} /> Locate train</button></section>}
            {matchingStations.length > 0 && <section className="station-results"><div className="section-heading"><h3>Matching stations</h3></div>{matchingStations.map(s => <div key={s.code}><button onClick={() => flyToCoordinates(s.lon, s.lat, 9, 20, 0)}><MapPin size={14} /><span><b>{s.code}</b> {s.name}</span></button><button title={`Plan from ${s.code}`} aria-label={`Plan from ${s.code}`} onClick={() => startPlan(s.code)}><Plus size={14} /></button></div>)}</section>}
            <div className="section-heading"><h3>{query ? 'Search results' : 'On the network'}</h3><button onClick={retry} aria-label="Refresh train positions"><RefreshCw size={13} /></button></div>
            <div className="train-list">{matchingTrains.slice(0, trainLimit).map(t => <button key={t.train_number} className={`train-row ${t.train_number === selectedTrain ? 'selected' : ''}`} onClick={() => inspectTrain(t)}><span className="train-row-icon"><TrainFront size={16} /></span><span className="train-row-text"><b>#{t.train_number} <small>{t.category}</small></b><span>{t.train_name}</span><em>{t.current_section}</em></span><ChevronRight size={14} /></button>)}</div>
            {matchingTrains.length > trainLimit && <button className="secondary-button full" onClick={() => setTrainLimit(n => n + 50)}>Show next 50 · {matchingTrains.length - trainLimit} more</button>}
            {!matchingTrains.length && <div className="empty-state"><TrainFront size={28} /><h3>{loading ? 'Loading movements…' : error ? 'Train feed unavailable' : 'No matching movements'}</h3><p>{query ? 'Try a train number, name, or station code.' : 'Try another simulation time or corridor.'}</p></div>}
          </>}

          {panel === 'blocks' && <>
            <div className="block-panel-intro"><span className="coral-orbit"><ShieldCheck size={25} /></span><h3>Work that stands out.</h3><p>Coral segments mark saved maintenance plans. Inspect their exact route and impacted trains.</p></div>
            {historyError && <p className="inline-warning" role="alert">{historyError}</p>}
            <div className="section-heading"><h3>{activeBlocks.length} saved block{activeBlocks.length !== 1 ? 's' : ''}</h3><button onClick={() => { setPlanningTab('history'); setPlanDecision(null); setPlanningOpen(true); }}>History & replay <ArrowRight size={12} /></button></div>
            <div className="block-list">{activeBlocks.map(b => <article key={b.id} className={`block-card ${selectedBlock === b.id ? 'selected' : ''}`}><div className="block-card-top"><span><i />{b.request.criticality}</span><small>{b.request.department}</small></div><h3>{b.request.from_station}<ArrowRight size={17} />{b.request.to_station}</h3><p><Clock3 size={13} />{b.request.operation_date || 'Date not recorded'} · {b.decision.block_window.start.slice(0,5)} · {b.request.duration_minutes} min</p><div className="block-impact"><TrainFront size={14} />{b.decision.affected_trains.length} impacted trains<span>Saved plan</span></div><div className="block-actions"><button onClick={() => inspectBlock(b)}><Focus size={14} /> Locate 3D</button><button onClick={() => setClearBlock(b)}><Network size={14} /> Clear view</button></div></article>)}</div>
            {!activeBlocks.length && <div className="empty-state"><ShieldCheck size={30} /><h3>{historyError ? 'History unavailable' : 'No saved blocks yet'}</h3><p>Analyze a window, review its constraints, then commit it in Planning Lab.</p><button className="primary-button" onClick={() => startPlan()}><Plus size={14} /> Plan your first block</button></div>}
            {activeBlocks.length > 0 && <button className="secondary-button full" onClick={() => setAuditOpen(true)}>Open detailed block register <ArrowRight size={14} /></button>}
          </>}

          {panel === 'assistant' && <><div className="assistant-console"><AIDispatcherConsole onClose={() => setPanelOpen(false)} expanded={assistantExpanded} onToggleExpand={() => setAssistantExpanded(v => !v)} simTime={currentTime} onExecuteBlock={(req, decision) => { commitActiveBlock(req, decision); void refreshOperations(); }} onFlyTo={flyToCoordinates} onApplyDecision={handleDecision} /></div>{planDecision && <div className="ai-decision-note"><Check size={14} /><span>Latest analysis: {planDecision.status.replaceAll('_', ' ')}.<button className="review-ai-plan" onClick={() => { setPlanningTab('plan'); setPlanningOpen(true); }}>Review in Planning Lab <ArrowRight size={12} /></button></span></div>}</>}
        </div>
        {panel !== 'assistant' && <div className="panel-footer"><span className="status-dot" />PLANNING ENVIRONMENT <span>NOT LIVE DISPATCH</span></div>}
      </motion.aside>}</AnimatePresence>
    </div>

    {planningOpen && <PlanningLab initialRequest={planRequest} initialDecision={planningTab === 'plan' ? planDecision : null} initialTab={planningTab} onClose={closePlanning} />}
    {clearBlock && <div className="clear-view-shell"><BlockClearView block={clearBlock} corridors={corridors} stations={stations} onBack={() => setClearBlock(null)} onClose={() => setClearBlock(null)} /></div>}
    <ActiveBlocksModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} />
    <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    {connectionOpen && <div className="connection-backdrop" onClick={() => setConnectionOpen(false)}><section className="connection-dialog" ref={connectionRef} role="dialog" aria-modal="true" aria-labelledby="connection-title" onClick={e => e.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">DATA CONNECTION</span><h2 id="connection-title">Connected to the engine.</h2></div><button className="icon-button" autoFocus onClick={() => setConnectionOpen(false)} aria-label="Close connection settings"><X size={18} /></button></div><div className="connection-content"><p>Your workspace reads the timetable, network geometry and saved plans from FastAPI.</p><div className="connection-metrics"><span><b>{health?.stations_loaded?.toLocaleString() || '—'}</b>stations loaded</span><span><b>{health?.trains_loaded?.toLocaleString() || '—'}</b>timetable trains</span></div><label>Backend URL<input type="url" value={endpoint} onChange={e => setEndpoint(e.target.value)} /></label>{connectionError && <p role="alert" className="inline-warning">{connectionError}</p>}<button className="primary-button full" onClick={async () => { try { const url = new URL(endpoint); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS backend URL.'); setApiBaseUrl(endpoint); await checkHealth(); await refreshCorridors(); await refreshOperations(); retry(); } catch (err) { setConnectionError(String(err)); } }}><RefreshCw size={15} /> Save & reconnect</button><p className="connection-note">No simulated approvals are generated when the backend is unavailable.</p></div></section></div>}
  </div></MotionConfig>;
}

export default function App() { return <SimulationProvider><AppShell /></SimulationProvider>; }
