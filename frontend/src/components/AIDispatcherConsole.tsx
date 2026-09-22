import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  Send,
  Loader2,
  AlertOctagon,
  Radar,
  Eye,
  CheckCircle,
  RotateCcw,
  TrendingUp,
} from 'lucide-react';
import { api } from '../api/api';
import type {
  DispatcherChatResponse,
  BlockRequest,
  BlockDecision,
  FlyToTarget,
} from '../api/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  action_triggered?: string;
  payload?: Record<string, any>;
  fly_to_target?: FlyToTarget | null;
}

interface AIDispatcherConsoleProps {
  simTime: string;
  onExecuteBlock?: (req: BlockRequest, decision: BlockDecision) => void;
  onFlyTo?: (lon: number, lat: number, zoom?: number, pitch?: number, bearing?: number) => void;
  onApplyDecision?: (decision: BlockDecision) => void;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'init-1',
    role: 'assistant',
    text: `👮 **AI CHIEF DISPATCHER ONLINE (GEMINI ENGINE ACTIVE)**

Autonomous section control link established across all 4 Golden Quadrilateral trunk corridors. In-memory timetable index and MILP solvers synced.

You can transmit natural language commands or tactical directives:
- *"Emergency block Surat to Mumbai Central due to OHE wire snag"*
- *"Analyze 60min TMS maintenance block between Vadodara and Surat"*
- *"Inspect real-time status of Train 12953"*
- *"Resequence corridor traffic according to P1 priority hierarchy"*`,
    timestamp: '12:00:00',
    action_triggered: 'NONE',
  },
];

const QUICK_DIRECTIVES = [
  { label: '🚨 Emergency OHE Snag: ST ➔ BCT', prompt: 'Emergency block Surat to Mumbai Central due to OHE wire snag' },
  { label: '📊 Analyze 60m TMS: BRC ➔ ST', prompt: 'Analyze 60min TMS maintenance block between Vadodara and Surat' },
  { label: '🛰️ Inspect #12953 August Kranti', prompt: 'Inspect real-time status of Train 12953' },
  { label: '🔄 Resequence West Corridor', prompt: 'Resequence corridor traffic according to P1 hierarchy' },
];

function downloadCsvReport(payload: Record<string, any>) {
  if (typeof payload.csv_data !== 'string') return;

  const blob = new Blob([payload.csv_data], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const month = String(payload.month || 'Monthly').replace(/[^a-z0-9_-]/gi, '_');
  const year = String(payload.year || new Date().getFullYear()).replace(/[^0-9]/g, '');

  link.setAttribute('href', url);
  link.setAttribute('download', `ShadowBlock_Report_${month}_${year}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const AIDispatcherConsole: React.FC<AIDispatcherConsoleProps> = ({
  simTime,
  onExecuteBlock,
  onFlyTo,
  onApplyDecision,
}) => {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  const handleSendDirective = async (directiveText: string) => {
    const text = directiveText.trim();
    if (!text || isProcessing) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: simTime,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);

    try {
      const response: DispatcherChatResponse = await api.chatDispatcher({
        message: text,
        session_id: 'active_session',
        sim_time: simTime,
      });

      const assistantMsg: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: response.response_text,
        timestamp: simTime,
        action_triggered: response.action_triggered,
        payload: response.payload,
        fly_to_target: response.fly_to_target,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (response.action_triggered === 'DOWNLOAD_CSV') {
        downloadCsvReport(response.payload);
      }

      // Trigger side-effects based on Gemini action
      if (response.fly_to_target && onFlyTo) {
        onFlyTo(
          response.fly_to_target.lon,
          response.fly_to_target.lat,
          response.fly_to_target.zoom ?? 11,
          response.fly_to_target.pitch ?? 60,
          response.fly_to_target.bearing ?? -15
        );
      }

      // If Emergency Block was executed, automatically extrude on 3D Deck.gl Map!
      if (response.action_triggered === 'EXECUTE_BLOCK' && response.payload && onExecuteBlock) {
        const p = response.payload;
        const blockReq: BlockRequest = {
          from_station: p.from_station || 'ST',
          to_station: p.to_station || 'BCT',
          track_line: p.track_line || 'UP',
          requested_time: simTime,
          duration_minutes: p.duration_minutes || 60,
          department: p.department || 'TMS',
          criticality: 'EMERGENCY',
        };

        const decision: BlockDecision = {
          status: 'APPROVED',
          block_window: {
            start: simTime,
            end: '13:00:00',
          },
          affected_trains: (p.affected_trains || []).map((t: any) => ({
            train_number: t.train_number,
            train_name: t.train_name,
            category: 'PREMIUM',
            action: t.action || 'HOLD',
            hold_station: t.location || p.from_station,
            delay_minutes: t.delay_minutes || 20,
          })),
          max_available_gap_nearby: null,
          asset_availability_index: 78.0,
          total_weighted_delay_cost: p.total_cascade_delay_minutes || 56.0,
          notes: `EMERGENCY BLOCK ENFORCED VIA AI DISPATCHER. Reason: ${p.reason || 'Hazard containment'}`,
          block_geometry: p.block_geometry || undefined,
        };

        onExecuteBlock(blockReq, decision);
      }

      // If Gap Analysis was performed, update solver card
      if (response.action_triggered === 'ANALYZE_GAP' && response.payload && onApplyDecision) {
        const p = response.payload;
        const decision: BlockDecision = {
          status: p.status === 'APPROVED' ? 'APPROVED' : 'APPROVED_WITH_REGULATION',
          block_window: p.block_window || { start: simTime, end: '13:00:00' },
          affected_trains: p.affected_trains || [],
          max_available_gap_nearby: {
            start: p.block_window?.start || simTime,
            end: p.block_window?.end || '13:00:00',
            duration_minutes: p.duration_minutes || 60,
          },
          asset_availability_index: p.asset_availability_index || 96.5,
          total_weighted_delay_cost: 0,
          notes: p.shadow_merging_opportunity || 'Shadow gap validated by Gemini.',
        };
        onApplyDecision(decision);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          text: `⚠️ **COMMUNICATION EXCEPTION**: ${err?.message || String(err)}. Controller link operating in autonomous degraded mode.`,
          timestamp: simTime,
          action_triggered: 'NONE',
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearHistory = () => {
    setMessages(INITIAL_MESSAGES);
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Tactical Sub-Header */}
      <div className="mb-2 flex items-center justify-between border-b border-[#2C3A35] pb-2">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#34D399]" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#A7F3D0] font-bold">
            GEMINI ENGINE : DISPATCHER ONLINE
          </span>
        </div>
        <button
          type="button"
          onClick={handleClearHistory}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-[#E2EAF4]/50 hover:bg-[#0D1311] hover:text-[#A7F3D0] transition cursor-pointer"
          title="Reset tactical conversation"
        >
          <RotateCcw className="h-2.5 w-2.5" />
          <span>RESET</span>
        </button>
      </div>

      {/* Quick Tactical Directives (Pills) */}
      <div className="mb-2.5 flex flex-wrap gap-1.5 shrink-0">
        {QUICK_DIRECTIVES.map((qd, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendDirective(qd.prompt)}
            disabled={isProcessing}
            className="rounded-lg border border-[#2C3A35] bg-[#0D1311]/90 px-2 py-1 text-[10px] font-mono text-[#E2EAF4]/80 transition hover:border-[#A7F3D0] hover:text-[#A7F3D0] hover:bg-[#1A2421] disabled:opacity-50 text-left cursor-pointer"
          >
            {qd.label}
          </button>
        ))}
      </div>

      {/* Conversation Thread */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar text-xs leading-relaxed">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[95%] rounded-2xl p-3 border transition-all ${
                msg.role === 'user'
                  ? 'border-[#2C3A35] bg-[#0D1311]/95 text-[#E2EAF4]'
                  : 'border-[#2C3A35] bg-[#141C19]/80 text-[#E2EAF4]/90 backdrop-blur-md shadow-md'
              }`}
            >
              {/* Message Role Indicator */}
              <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-[#2C3A35]/60 pb-1 text-[9px] font-mono uppercase tracking-wider">
                <span className={msg.role === 'user' ? 'text-[#34D399]' : 'text-[#A7F3D0] font-bold flex items-center gap-1'}>
                  {msg.role === 'user' ? 'SECTION OPERATOR' : (
                    <>
                      <Bot className="h-3 w-3 text-[#A7F3D0]" />
                      AI CHIEF DISPATCHER
                    </>
                  )}
                </span>
                <span className="text-[#E2EAF4]/40">{msg.timestamp}</span>
              </div>

              {/* Message Content with Tactical Formatting */}
              <div className="space-y-1.5 whitespace-pre-wrap font-sans text-xs">
                {msg.text.split('\n').map((line, lIdx) => {
                  if (line.startsWith('### ') || line.startsWith('## ')) {
                    return (
                      <div key={lIdx} className="font-mono font-bold text-[#A7F3D0] pt-1">
                        {line.replace(/^#+\s*/, '')}
                      </div>
                    );
                  }
                  if (line.startsWith('- **') || line.startsWith('  - **')) {
                    const clean = line.replace(/^\s*-\s*/, '');
                    return (
                      <div key={lIdx} className="flex items-start gap-1.5 text-[#E2EAF4]/90 pl-1">
                        <span className="text-[#34D399] font-mono">•</span>
                        <span>{renderFormattedLine(clean)}</span>
                      </div>
                    );
                  }
                  return <div key={lIdx}>{renderFormattedLine(line)}</div>;
                })}
              </div>

              {/* Action Trigger Badge & Interactive Focus */}
              {msg.action_triggered && msg.action_triggered !== 'NONE' && (
                <div className="mt-2.5 pt-2 border-t border-[#2C3A35]/80">
                  {msg.action_triggered === 'EXECUTE_BLOCK' && (
                    <div className="rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/15 p-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#EF4444]">
                        <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
                        <span>EMERGENCY 3D BLOCK EXTRUDED</span>
                      </div>
                      {msg.fly_to_target && onFlyTo && (
                        <button
                          type="button"
                          onClick={() =>
                            onFlyTo(
                              msg.fly_to_target!.lon,
                              msg.fly_to_target!.lat,
                              msg.fly_to_target!.zoom ?? 11,
                              60,
                              -15
                            )
                          }
                          className="flex items-center gap-1 rounded bg-[#EF4444]/20 hover:bg-[#EF4444]/30 px-2 py-0.5 text-[9px] font-mono text-[#EF4444] border border-[#EF4444]/40 cursor-pointer"
                        >
                          <Eye className="h-3 w-3" />
                          <span>FOCUS 3D</span>
                        </button>
                      )}
                    </div>
                  )}

                  {msg.action_triggered === 'ANALYZE_GAP' && (
                    <div className="rounded-xl border border-[#34D399]/40 bg-[#34D399]/10 p-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#34D399]">
                        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>ZERO-DELAY GAP VALIDATED</span>
                      </div>
                      {msg.fly_to_target && onFlyTo && (
                        <button
                          type="button"
                          onClick={() =>
                            onFlyTo(
                              msg.fly_to_target!.lon,
                              msg.fly_to_target!.lat,
                              msg.fly_to_target!.zoom ?? 11,
                              60,
                              -15
                            )
                          }
                          className="flex items-center gap-1 rounded bg-[#34D399]/20 hover:bg-[#34D399]/30 px-2 py-0.5 text-[9px] font-mono text-[#34D399] border border-[#34D399]/40 cursor-pointer"
                        >
                          <Eye className="h-3 w-3" />
                          <span>INSPECT</span>
                        </button>
                      )}
                    </div>
                  )}

                  {msg.action_triggered === 'TRAIN_INSPECT' && (
                    <div className="rounded-xl border border-[#38BDF8]/40 bg-[#38BDF8]/10 p-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#38BDF8]">
                        <Radar className="h-3.5 w-3.5 shrink-0" />
                        <span>TELEMETRY VECTOR ACQUIRED</span>
                      </div>
                      {msg.fly_to_target && onFlyTo && (
                        <button
                          type="button"
                          onClick={() =>
                            onFlyTo(
                              msg.fly_to_target!.lon,
                              msg.fly_to_target!.lat,
                              msg.fly_to_target!.zoom ?? 11,
                              60,
                              -15
                            )
                          }
                          className="flex items-center gap-1 rounded bg-[#38BDF8]/20 hover:bg-[#38BDF8]/30 px-2 py-0.5 text-[9px] font-mono text-[#38BDF8] border border-[#38BDF8]/40 cursor-pointer"
                        >
                          <Eye className="h-3 w-3" />
                          <span>TRACK</span>
                        </button>
                      )}
                    </div>
                  )}

                  {msg.action_triggered === 'RESEQUENCE' && (
                    <div className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#F59E0B]">
                        <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                        <span>P1-PRIORITY MATRIX DISPATCHED</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 rounded-2xl border border-[#2C3A35] bg-[#141C19]/80 p-3 max-w-[85%]"
          >
            <Loader2 className="h-4 w-4 animate-spin text-[#A7F3D0]" />
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#A7F3D0] font-bold">
                SOLVING TELEMETRY & TIMETABLE MATRIX...
              </span>
              <span className="font-mono text-[9px] text-[#E2EAF4]/50">
                Gemini function call in progress
              </span>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Directive Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendDirective(input);
        }}
        className="mt-3 flex items-center gap-2 border-t border-[#2C3A35] pt-2.5 shrink-0"
      >
        <div className="relative flex-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            placeholder="Type directive (e.g. 'Emergency block Surat to Mumbai')..."
            className="w-full rounded-xl border border-[#2C3A35] bg-[#0D1311] px-3.5 py-2 font-mono text-xs text-[#E2EAF4] placeholder-[#E2EAF4]/30 outline-none transition focus:border-[#A7F3D0] focus:shadow-[0_0_12px_rgba(167,243,208,0.2)] disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || isProcessing}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#A7F3D0] text-[#0D1311] transition hover:bg-[#34D399] disabled:opacity-40 disabled:hover:bg-[#A7F3D0] shrink-0 shadow-[0_0_10px_rgba(167,243,208,0.3)] cursor-pointer"
          title="Transmit Directive"
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#0D1311]" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>
    </div>
  );
};

// Helper to format inline markdown like **bold**, `code`, and highlights
function renderFormattedLine(text: string): React.ReactNode {
  // Regex to split on `code` and **bold**
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-[#E2EAF4]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      const codeVal = part.slice(1, -1);
      return (
        <span
          key={index}
          className="rounded border border-[#2C3A35] bg-[#0D1311] px-1 py-0.5 font-mono text-[11px] text-[#A7F3D0]"
        >
          {codeVal}
        </span>
      );
    }
    return part;
  });
}
