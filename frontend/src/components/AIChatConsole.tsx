import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  Download,
  Sparkles,
} from 'lucide-react';
import { api } from '../api/api';
import type {
  DispatcherChatResponse,
  BlockRequest,
  BlockDecision,
  FlyToTarget,
} from '../api/types';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  action_triggered?: string;
  payload?: Record<string, any>;
  fly_to_target?: FlyToTarget | null;
}

export interface AIChatConsoleProps {
  simTime: string;
  onExecuteBlock?: (req: BlockRequest, decision: BlockDecision) => void;
  onFlyTo?: (lon: number, lat: number, zoom?: number, pitch?: number, bearing?: number) => void;
  onApplyDecision?: (decision: BlockDecision) => void;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'init-1',
    role: 'assistant',
    text: `### 👮 CHIEF AI DISPATCHER ONLINE (GEMINI AGENTIC ROUTER)

Autonomous section command link active across all 4 Golden Quadrilateral trunk corridors (**WEST**, **SOUTH_WEST**, **EAST_COAST**, **NORTH_EAST**).

I can answer operational definitions or instantly execute tactical actions:
- *"What is the difference between TMS and SMMS?"*
- *"Which trains are delayed today?"*
- *"Block Surat for 40 mins"*
- *"Emergency block Surat to Mumbai Central due to OHE wire snag"*
- *"Give me the March report"*
- *"Inspect real-time status of Train 12953"*`,
    timestamp: '12:00:00',
    action_triggered: 'NONE',
  },
];

const QUICK_DIRECTIVES = [
  { label: '💡 TMS vs SMMS Difference', prompt: 'What is the difference between TMS and SMMS?' },
  { label: '⏱️ Which trains delayed today?', prompt: 'Which trains are delayed today?' },
  { label: '📊 Block Surat for 40 mins', prompt: 'Block Surat for 40 mins' },
  { label: '🚨 Emergency OHE Snag: ST ➔ BCT', prompt: 'Emergency block Surat to Mumbai Central due to OHE wire snag' },
  { label: '📥 March Shadow Block Report', prompt: 'Give me the March report' },
  { label: '🛰️ Inspect #12953 August Kranti', prompt: 'Inspect real-time status of Train 12953' },
];

function downloadCsvReport(payload: Record<string, any>) {
  if (typeof payload?.csv_data !== 'string') return;

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

// Custom Markdown renderers tailored to the Dark-Slate Tactical UI
const tacticalMarkdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-[#E2EAF4]/95">{children}</p>,
  h1: ({ children }) => <h1 className="font-mono text-xs font-bold text-[#A7F3D0] mt-2 mb-1.5 uppercase tracking-wider">{children}</h1>,
  h2: ({ children }) => <h2 className="font-mono text-[11px] font-bold text-[#A7F3D0] mt-2 mb-1 uppercase tracking-wider">{children}</h2>,
  h3: ({ children }) => <h3 className="font-mono text-[11px] font-bold text-[#34D399] mt-1.5 mb-1">{children}</h3>,
  h4: ({ children }) => <h4 className="font-mono text-[10px] font-bold text-[#38BDF8] mt-1 mb-0.5 uppercase">{children}</h4>,
  ul: ({ children }) => <ul className="my-1.5 ml-3.5 list-disc space-y-1 text-[#E2EAF4]/90 marker:text-[#34D399]">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 ml-3.5 list-decimal space-y-1 text-[#E2EAF4]/90 marker:text-[#34D399]">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-[#A7F3D0]">{children}</strong>,
  em: ({ children }) => <em className="text-[#E2EAF4]/85 italic">{children}</em>,
  code: ({ inline, children }: any) => {
    if (inline) {
      return (
        <code className="rounded border border-[#2C3A35] bg-[#090D0B] px-1 py-0.5 font-mono text-[10.5px] text-[#A7F3D0]">
          {children}
        </code>
      );
    }
    return (
      <div className="my-2 overflow-x-auto rounded-lg border border-[#2C3A35] bg-[#090D0B] p-2">
        <code className="font-mono text-[10.5px] text-[#A7F3D0] leading-tight block">
          {children}
        </code>
      </div>
    );
  },
  pre: ({ children }) => <div className="not-prose my-1.5">{children}</div>,
  table: ({ children }) => (
    <div className="my-2.5 overflow-x-auto rounded-lg border border-[#2C3A35] bg-[#090D0B]/90 shadow-inner">
      <table className="min-w-full divide-y divide-[#2C3A35] text-[10.5px] font-mono">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#141C19] text-[#A7F3D0]">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-[#2C3A35]/50 bg-[#0D1311]/50">{children}</tbody>,
  tr: ({ children }) => <tr className="hover:bg-[#1A2421]/60 transition-colors">{children}</tr>,
  th: ({ children }) => <th className="px-2 py-1.5 text-left font-bold tracking-wider uppercase text-[9.5px] text-[#A7F3D0]">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1.5 text-[#E2EAF4]/85 leading-normal">{children}</td>,
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-[#34D399] bg-[#1A2421]/40 px-2.5 py-1 text-[#A7F3D0]/90 italic rounded-r text-[11px]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-[#2C3A35]" />,
};

export const AIChatConsole: React.FC<AIChatConsoleProps> = ({
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

      // Handle Automatic File Download Trigger
      if (response.action_triggered === 'DOWNLOAD_CSV' && response.payload) {
        downloadCsvReport(response.payload);
      }

      // Handle Map Fly-To Camera Navigation
      if (response.fly_to_target && onFlyTo) {
        onFlyTo(
          response.fly_to_target.lon,
          response.fly_to_target.lat,
          response.fly_to_target.zoom ?? 11,
          response.fly_to_target.pitch ?? 60,
          response.fly_to_target.bearing ?? -15
        );
      }

      // Backend decisions are authoritative; never fabricate approval or timing.
      const payload = response.payload;
      if (response.action_triggered === 'EXECUTE_BLOCK' && payload?.decision && payload?.request && onExecuteBlock) {
        onExecuteBlock(payload.request as BlockRequest, { ...payload.decision, block_id: payload.block_id } as BlockDecision);
      }
      if (response.action_triggered === 'ANALYZE_GAP' && payload?.decision && onApplyDecision) {
        onApplyDecision(payload.decision as BlockDecision);
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
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#A7F3D0] font-bold flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-[#A7F3D0]" />
            GEMINI AGENTIC ROUTER : DISPATCHER ONLINE
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
                  : 'border-[#2C3A35] bg-[#141C19]/85 text-[#E2EAF4]/90 backdrop-blur-md shadow-md'
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

              {/* Message Content rendered cleanly via ReactMarkdown */}
              <div className="font-sans text-xs">
                {msg.role === 'assistant' ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={tacticalMarkdownComponents}
                  >
                    {msg.text}
                  </ReactMarkdown>
                ) : (
                  <div className="whitespace-pre-wrap leading-relaxed text-[#E2EAF4]">
                    {msg.text}
                  </div>
                )}
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

                  {msg.action_triggered === 'DOWNLOAD_CSV' && msg.payload && (
                    <div className="rounded-xl border border-[#A7F3D0]/40 bg-[#A7F3D0]/10 p-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#A7F3D0]">
                        <Download className="h-3.5 w-3.5 shrink-0" />
                        <span>REPORT READY FOR DOWNLOAD</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadCsvReport(msg.payload!)}
                        className="flex items-center gap-1 rounded bg-[#A7F3D0]/20 hover:bg-[#A7F3D0]/30 px-2 py-0.5 text-[9px] font-mono text-[#A7F3D0] border border-[#A7F3D0]/40 cursor-pointer"
                      >
                        <Download className="h-3 w-3" />
                        <span>SAVE CSV</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading State: Subtle Pulsing Mint Animation */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative flex flex-col gap-1.5 rounded-2xl border border-[#A7F3D0]/50 bg-[#141C19]/90 p-3 max-w-[90%] shadow-[0_0_15px_rgba(167,243,208,0.2)] overflow-hidden"
          >
            {/* Pulsing mint ambient glow */}
            <div className="absolute inset-0 bg-[#A7F3D0]/5 animate-pulse pointer-events-none" />

            <div className="flex items-center gap-2 relative z-10">
              <div className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A7F3D0] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#A7F3D0]" />
              </div>
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-[#A7F3D0] font-bold animate-pulse">
                Gemini Engine: Processing Directive...
              </span>
            </div>

            <div className="flex items-center gap-2 pl-4 text-[9.5px] font-mono text-[#E2EAF4]/60 relative z-10">
              <Loader2 className="h-3 w-3 animate-spin text-[#A7F3D0]" />
              <span>Synthesizing Golden Quadrilateral operational matrix & routing tools...</span>
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
            placeholder="Type directive (e.g. 'Block Surat for 40 mins', 'TMS vs SMMS')..."
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

export default AIChatConsole;
