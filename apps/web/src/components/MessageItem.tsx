'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  User,
  Bot,
  Copy,
  Check,
  Zap,
  Clock,
  Coins,
  Cpu,
  Brain,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { ChatMessage } from '../hooks/useChat';

interface MessageItemProps {
  message: ChatMessage;
  isStreamingLast?: boolean;
}

export function MessageItem({ message, isStreamingLast }: MessageItemProps) {
  const isUser = message.role === 'user';
  const [showReasoning, setShowReasoning] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div
      className={`py-6 px-4 md:px-8 border-b border-[#2d2d2d]/60 transition-colors ${
        isUser ? 'bg-[#212121]' : 'bg-[#1b1b1b]'
      }`}
    >
      <div className="max-w-3xl mx-auto flex space-x-4">
        {/* Avatar */}
        <div className="flex-shrink-0 pt-0.5">
          {isUser ? (
            <div className="w-8 h-8 rounded-full bg-emerald-700/80 border border-emerald-500/30 flex items-center justify-center text-white shadow-sm">
              <User className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#10a37f] flex items-center justify-center text-white shadow-md shadow-emerald-950/40">
              <Bot className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Message Content Body */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-xs text-gray-300">
              {isUser ? 'You' : 'Assistant'}
            </span>
            {message.modelId && (
              <span className="text-[10px] font-mono text-gray-400 bg-[#2b2b2b] px-2 py-0.5 rounded border border-[#3b3b3b]">
                {message.modelId}
              </span>
            )}
          </div>

          {/* Collapsible Reasoning Block for Reasoning Models */}
          {message.reasoning && (
            <div className="my-2 border border-purple-900/40 bg-purple-950/20 rounded-lg p-3 text-xs">
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="flex items-center space-x-1.5 font-mono text-purple-300 hover:text-purple-200 mb-1"
              >
                <Brain className="w-3.5 h-3.5" />
                <span className="font-semibold">Reasoning Process</span>
                {showReasoning ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
              {showReasoning && (
                <div className="text-gray-300 font-mono text-[11px] whitespace-pre-wrap pl-2 border-l-2 border-purple-500/40 mt-1.5">
                  {message.reasoning}
                </div>
              )}
            </div>
          )}

          {/* Main Markdown Text */}
          <div className="prose prose-invert max-w-none text-sm leading-relaxed text-gray-200 break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeString = String(children).replace(/\n$/, '');

                  if (!inline && match) {
                    return (
                      <div className="relative group my-3 rounded-lg overflow-hidden border border-[#383838]">
                        <div className="flex items-center justify-between bg-[#191919] px-3.5 py-1.5 text-[11px] font-mono text-gray-400 border-b border-[#303030]">
                          <span>{match[1]}</span>
                          <button
                            onClick={() => copyToClipboard(codeString)}
                            className="flex items-center space-x-1 hover:text-white transition-colors"
                          >
                            {copiedCode === codeString ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="!bg-[#121212] !m-0 !p-3.5 !border-0 font-mono text-xs overflow-x-auto text-gray-200">
                          <code>{children}</code>
                        </pre>
                      </div>
                    );
                  }

                  return (
                    <code
                      className="bg-[#2a2a2a] text-emerald-300 px-1.5 py-0.5 rounded text-xs font-mono"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>

            {isStreamingLast && (
              <span className="cursor-blink" aria-hidden="true" />
            )}
          </div>

          {/* Technical Telemetry Panel for Assistant Responses */}
          {!isUser && (message.ttftMs || message.tokensGenerated) && (
            <div className="pt-3 mt-3 border-t border-[#2e2e2e] flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-mono text-gray-400">
              {message.ttftMs !== undefined && (
                <div className="flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>TTFT:</span>
                  <span className="text-gray-200 font-semibold">{message.ttftMs}ms</span>
                </div>
              )}

              {message.tokensGenerated !== undefined && (
                <div className="flex items-center space-x-1">
                  <Cpu className="w-3 h-3 text-blue-400" />
                  <span>Tokens:</span>
                  <span className="text-gray-200 font-semibold">{message.tokensGenerated}</span>
                </div>
              )}

              {message.tokensPerSec !== undefined && (
                <div className="flex items-center space-x-1">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span>Speed:</span>
                  <span className="text-gray-200 font-semibold">{message.tokensPerSec} t/s</span>
                </div>
              )}

              {message.estimatedCostUsd !== undefined && (
                <div className="flex items-center space-x-1">
                  <Coins className="w-3 h-3 text-yellow-400" />
                  <span>Cost:</span>
                  <span className="text-gray-200 font-semibold">
                    ${message.estimatedCostUsd < 0.0001 ? '<$0.0001' : message.estimatedCostUsd.toFixed(5)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
