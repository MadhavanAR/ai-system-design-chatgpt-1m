'use client';

import React, { useState } from 'react';
import { useChat } from '../hooks/useChat';
import { Sidebar } from '../components/Sidebar';
import { ChatArea } from '../components/ChatArea';
import { TechDashboard } from '../components/TechDashboard';

export default function HomePage() {
  const {
    conversations,
    currentConvId,
    messages,
    selectedModel,
    setSelectedModel,
    models,
    isStreaming,
    currentMetrics,
    rateLimitNotice,
    selectConversation,
    startNewChat,
    deleteConversation,
    sendMessage,
    stopGeneration,
    retryLast,
    refreshModels,
  } = useChat();

  const [isDashboardOpen, setIsDashboardOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen bg-[#212121] overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        conversations={conversations}
        currentConvId={currentConvId}
        selectedModel={selectedModel}
        models={models}
        onSelectConv={selectConversation}
        onNewChat={startNewChat}
        onDeleteConv={deleteConversation}
        onSelectModel={setSelectedModel}
        onOpenDashboard={() => setIsDashboardOpen(true)}
      />

      {/* Main Chat Interface */}
      <ChatArea
        messages={messages}
        isStreaming={isStreaming}
        selectedModel={selectedModel}
        currentMetrics={currentMetrics}
        rateLimitNotice={rateLimitNotice}
        onSendMessage={sendMessage}
        onStopGeneration={stopGeneration}
        onRetryLast={retryLast}
        onOpenDashboard={() => setIsDashboardOpen(true)}
      />

      {/* System Telemetry & Resilience Control Panel */}
      <TechDashboard
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        onRefreshModels={refreshModels}
      />
    </div>
  );
}
