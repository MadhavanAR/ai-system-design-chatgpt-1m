'use client';

import React from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Cpu,
  Activity,
  Layers,
  Sparkles,
  Zap,
  Brain,
} from 'lucide-react';
import { ConversationItem, ModelItem } from '../hooks/useChat';

interface SidebarProps {
  conversations: ConversationItem[];
  currentConvId: string | null;
  selectedModel: string;
  models: ModelItem[];
  onSelectConv: (id: string) => void;
  onNewChat: () => void;
  onDeleteConv: (id: string, e: React.MouseEvent) => void;
  onSelectModel: (modelId: string) => void;
  onOpenDashboard: () => void;
}

export function Sidebar({
  conversations,
  currentConvId,
  selectedModel,
  models,
  onSelectConv,
  onNewChat,
  onDeleteConv,
  onSelectModel,
  onOpenDashboard,
}: SidebarProps) {
  const getModelIcon = (tier: string) => {
    switch (tier) {
      case 'simple':
        return <Zap className="w-3.5 h-3.5 text-emerald-400" />;
      case 'reasoning':
        return <Brain className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-blue-400" />;
    }
  };

  return (
    <aside className="w-64 md:w-72 bg-[#171717] border-r border-[#2d2d2d] flex flex-col h-full select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-[#2d2d2d] flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white shadow-lg shadow-emerald-900/30">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-sm text-white tracking-wide">
              ChatGPT-1M
            </h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-mono">
              1M User Architecture
            </p>
          </div>
        </div>
        <button
          onClick={onOpenDashboard}
          title="Open Architecture & Resilience Dashboard"
          className="p-1.5 hover:bg-[#2d2d2d] text-emerald-400 rounded-md transition-colors"
        >
          <Activity className="w-4 h-4" />
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-between px-3.5 py-2.5 bg-[#212121] hover:bg-[#2a2a2a] text-sm text-gray-200 rounded-lg border border-[#333] transition-all duration-150 font-medium group"
        >
          <span className="flex items-center space-x-2">
            <Plus className="w-4 h-4 text-gray-400 group-hover:text-white" />
            <span>New Chat</span>
          </span>
          <span className="text-[10px] font-mono bg-[#333] px-1.5 py-0.5 rounded text-gray-400">
            ⌘K
          </span>
        </button>
      </div>

      {/* Model Selection Selector */}
      <div className="px-3 py-2 border-b border-[#262626]">
        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5 flex items-center space-x-1">
          <Layers className="w-3 h-3 text-gray-400" />
          <span>Active Model Tier</span>
        </label>
        <select
          value={selectedModel}
          onChange={(e) => onSelectModel(e.target.value)}
          className="w-full bg-[#212121] text-xs text-gray-200 border border-[#333] rounded-md px-2.5 py-2 focus:outline-none focus:border-emerald-500 font-mono cursor-pointer"
        >
          {models.map((m) => (
            <option key={m.modelId} value={m.modelId}>
              {m.name} {m.status !== 'CLOSED' ? `(${m.status})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <div className="px-2 py-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider font-mono">
          Recent Sessions
        </div>
        {conversations.length === 0 ? (
          <div className="text-xs text-gray-500 px-3 py-4 text-center">
            No active conversations. Start a new prompt!
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = currentConvId === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => onSelectConv(conv.id)}
                className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-all duration-150 ${
                  isActive
                    ? 'bg-[#2a2a2a] text-white font-medium border border-[#3d3d3d]'
                    : 'text-gray-400 hover:bg-[#212121] hover:text-gray-200'
                }`}
              >
                <div className="flex items-center space-x-2.5 truncate mr-2">
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                  <span className="truncate">{conv.title}</span>
                </div>
                <button
                  onClick={(e) => onDeleteConv(conv.id, e)}
                  title="Delete Session"
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 rounded transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer System Status */}
      <div className="p-3 border-t border-[#2d2d2d] bg-[#141414]">
        <button
          onClick={onOpenDashboard}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-[#212121] text-left transition-colors"
        >
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-medium text-gray-300">
              System Health
            </span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.5 rounded">
            Live Metrics
          </span>
        </button>
      </div>
    </aside>
  );
}
