import React, { useState } from 'react';
import { LayoutGrid, MessageSquare, ShieldAlert, List } from 'lucide-react';
import { PlannerTab } from './tabs/PlannerTab';
import { AIChatTab } from './tabs/AIChatTab';
import { ActiveBlocksTab } from './tabs/ActiveBlocksTab';
import { LiveTrainsTab } from './tabs/LiveTrainsTab';

type TabId = 'planner' | 'chat' | 'blocks' | 'trains';

export const Sidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('planner');

  const tabs = [
    { id: 'planner', label: 'Planner', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'chat', label: 'AI Chat', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'blocks', label: 'Blocks', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'trains', label: 'Trains', icon: <List className="w-4 h-4" /> },
  ] as const;

  return (
    <div className="flex flex-col h-full bg-[#12161f] border-l border-[#1f2733]">
      {/* Tabs Header */}
      <div className="flex border-b border-[#1f2733] shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center py-3 px-2 border-b-2 transition-colors ${
              activeTab === tab.id 
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5' 
                : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-[#1f2733]/50'
            }`}
          >
            {tab.icon}
            <span className="text-[10px] uppercase font-bold mt-1 tracking-wider">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'planner' && <PlannerTab />}
        {activeTab === 'chat' && <AIChatTab />}
        {activeTab === 'blocks' && <ActiveBlocksTab />}
        {activeTab === 'trains' && <LiveTrainsTab />}
      </div>
    </div>
  );
};
