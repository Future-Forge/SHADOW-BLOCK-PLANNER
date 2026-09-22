import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User } from 'lucide-react';
import { api } from '../../api/client';
import type { BlockDecision } from '../../api/types';
import { DecisionPanel } from './PlannerTab';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  decision?: BlockDecision | null;
  entities?: any;
}

export const AIChatTab: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'assistant',
      text: 'Shadow AI Assistant initialized. Describe your block requirement (e.g. "Need a 2 hour major block near Kota at 11:00 for OHE").'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);
    setLoading(true);

    try {
      const response = await api.chatQuery(userText);
      
      let replyText = response.summary;
      if (response.clarification_needed) {
        replyText += '\n\n' + response.clarification_needed;
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: replyText,
        decision: response.decision,
        entities: response.entities
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: 'Error communicating with Shadow AI: ' + (err instanceof Error ? err.message : String(err))
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full -m-4"> {/* Negative margin to undo tab padding so we can do full height */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" ref={scrollRef}>
        {messages.map(msg => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`flex items-start max-w-[90%] space-x-2 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1 ${msg.role === 'user' ? 'bg-cyan-600' : 'bg-amber-600'}`}>
                {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
              </div>
              
              <div className={`flex flex-col space-y-3 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                  msg.role === 'user' 
                    ? 'bg-cyan-600/20 text-cyan-50 border border-cyan-500/30' 
                    : 'bg-[#1f2733] text-slate-200 border border-[#2a3441]'
                }`}>
                  {msg.text}
                </div>

                {/* Render Decision if present */}
                {msg.decision && (
                  <div className="w-full min-w-[280px]">
                    <DecisionPanel decision={msg.decision} />
                  </div>
                )}
                
                {/* Render extracted entities if clarifying */}
                {msg.entities && !msg.decision && (
                  <div className="w-full bg-[#0a0e14] border border-[#1f2733] rounded p-2 flex flex-wrap gap-1">
                    {Object.entries(msg.entities).filter(([k,v]) => k !== 'confidence' && v !== null).map(([k,v]) => (
                      <span key={k} className="text-[10px] font-mono bg-[#1f2733] text-cyan-400 px-1.5 py-0.5 rounded">
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-start space-x-2">
            <div className="w-6 h-6 rounded-full bg-amber-600 flex items-center justify-center shrink-0 mt-1">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="px-3 py-2 rounded-lg bg-[#1f2733] text-slate-400 border border-[#2a3441] flex items-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
              <span className="text-xs">Analyzing request...</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 bg-[#12161f] border-t border-[#1f2733] shrink-0">
        <form onSubmit={handleSubmit} className="flex relative">
          <input
            type="text"
            className="w-full bg-[#0a0e14] border border-[#1f2733] rounded-full pl-4 pr-10 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none placeholder-slate-600"
            placeholder="Type your block requirement..."
            value={input}
            onChange={e => setInput(e.target.value)}
          />
          <button 
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-1 top-1 bottom-1 w-8 flex items-center justify-center text-cyan-500 hover:text-cyan-400 disabled:opacity-50 disabled:hover:text-cyan-500 transition-colors bg-transparent rounded-full"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
