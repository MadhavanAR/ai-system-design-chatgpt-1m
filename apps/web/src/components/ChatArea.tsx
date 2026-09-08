'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Square,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Zap,
  Clock,
  Coins,
  Cpu,
} from 'lucide-react';
import { ChatMessage } from '../hooks/useChat';
import { MessageItem } from './MessageItem';

interface ChatAreaProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  selectedModel: string;
  currentMetrics: {
    ttftMs?: number;
    tokensPerSec?: number;
    tokensGenerated?: number;
    estimatedCostUsd?: number;
    activeModel?: string;
  } | null;
  rateLimitNotice: string | null;
  onSendMessage: (msg: string) => void;
  onStopGeneration: () => void;
  onRetryLast: () => void;
  onOpenDashboard: () => void;
}

const SUGGESTED_PROMPTS = [
  'Explain how distributed systems handle traffic spikes.',
  'Write a TypeScript rate limiter using Redis token buckets.',
  'How does Prefix/KV caching work in LLM inference clusters?',
  'Why do retry storms happen during downstream model outages?',
];

export function ChatArea({
  messages,
  isStreaming,
  selectedModel,
  currentMetrics,
  rateLimitNotice,
  onSendMessage,
  onStopGeneration,
  onRetryLast,
  onOpenDashboard,
}: ChatAreaProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <main className="flex-1 flex flex-col h-full bg-[#212121] relative overflow-hidden">
      {/* Top Header HUD */}
      <header className="h-14 border-b border-[#2d2d2d] bg-[#1a1a1a]/80 backdrop-blur-md px-4 md:px-6 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <span className="font-semibold text-sm text-gray-200">Chat Stream</span>
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded">
            {selectedModel}
          </span>
        </div>

        {/* Real-time Streaming Metrics Strip */}
        <div className="flex items-center space-x-4 text-xs font-mono">
          {currentMetrics && (
            <div className="hidden sm:flex items-center space-x-3 text-gray-400 bg-[#262626] px-2.5 py-1 rounded-md border border-[#333]">
              {currentMetrics.ttftMs !== undefined && (
                <span className="flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span className="text-gray-200">{currentMetrics.ttftMs}ms</span>
                </span>
              )}
              {currentMetrics.tokensGenerated !== undefined && (
                <span className="flex items-center space-x-1">
                  <Cpu className="w-3 h-3 text-blue-400" />
                  <span className="text-gray-200">{currentMetrics.tokensGenerated} tok</span>
                </span>
              )}
              {currentMetrics.tokensPerSec !== undefined && (
                <span className="flex items-center space-x-1">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span className="text-gray-200">{currentMetrics.tokensPerSec} t/s</span>
                </span>
              )}
            </div>
          )}

          <button
            onClick={onOpenDashboard}
            className="text-xs bg-[#2d2d2d] hover:bg-[#383838] text-gray-300 px-2.5 py-1.5 rounded-md border border-[#444] transition-colors"
          >
            System Metrics
          </button>
        </div>
      </header>

      {/* Rate Limit Alert */}
      {rateLimitNotice && (
        <div className="bg-amber-950/80 border-b border-amber-800/60 px-4 py-2 text-xs text-amber-200 flex items-center justify-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>{rateLimitNotice}</span>
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-emerald-950/80 border border-emerald-600/30 flex items-center justify-center text-emerald-400 shadow-xl">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-100">
                AI System Design — ChatGPT for 1M Users
              </h2>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                Test real-time token streaming, multi-tier model routing, sliding context management, Redis rate limiting, and circuit breaker resilience.
              </p>
            </div>

            {/* Quick Demo Prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
              {SUGGESTED_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(prompt)}
                  className="p-3 bg-[#191919] hover:bg-[#252525] border border-[#333] hover:border-[#444] rounded-lg text-xs text-gray-300 transition-all duration-150 leading-relaxed group text-left"
                >
                  <span className="font-medium text-gray-200 group-hover:text-emerald-400 transition-colors">
                    {prompt}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {messages.map((msg, idx) => (
              <MessageItem
                key={msg.id || idx}
                message={msg}
                isStreamingLast={isStreaming && idx === messages.length - 1}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Bottom Floating Input Container */}
      <div className="p-4 bg-gradient-to-t from-[#1b1b1b] via-[#1b1b1b] to-transparent">
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Action Row: Stop & Retry */}
          <div className="flex justify-center space-x-2">
            {isStreaming && (
              <button
                onClick={onStopGeneration}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#333] text-xs text-gray-200 rounded-full border border-[#444] shadow-md transition-colors"
              >
                <Square className="w-3 h-3 text-red-400 fill-red-400" />
                <span>Stop Generating</span>
              </button>
            )}

            {!isStreaming && messages.length > 0 && (
              <button
                onClick={onRetryLast}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#252525] hover:bg-[#303030] text-xs text-gray-300 rounded-full border border-[#3d3d3d] shadow-sm transition-colors"
              >
                <RotateCcw className="w-3 h-3 text-emerald-400" />
                <span>Retry Last Response</span>
              </button>
            )}
          </div>

          {/* Text Input Area */}
          <form
            onSubmit={handleSubmit}
            className="relative bg-[#2f2f2f] rounded-2xl border border-[#404040] focus-within:border-emerald-500 shadow-xl overflow-hidden transition-colors"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask an architecture question or type a message..."
              rows={2}
              className="w-full bg-transparent text-sm text-gray-100 placeholder-gray-400 px-4 py-3.5 pr-14 resize-none focus:outline-none"
            />

            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className={`absolute right-3 bottom-3 p-2 rounded-xl transition-all duration-150 ${
                input.trim() && !isStreaming
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                  : 'bg-[#3e3e3e] text-gray-500 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <div className="text-[11px] text-center text-gray-400 font-mono">
            ChatGPT-1M Reference Architecture • SSE Streaming • Sliding Context Budgeting
          </div>
        </div>
      </div>
    </main>
  );
}
