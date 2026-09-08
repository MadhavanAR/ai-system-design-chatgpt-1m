'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Server,
  Database,
  Layers,
} from 'lucide-react';

interface TechDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshModels: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function TechDashboard({
  isOpen,
  onClose,
  onRefreshModels,
}: TechDashboardProps) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStats();
      const interval = setInterval(fetchStats, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleSimulate = async (action: string, targetModel = 'mock-fast') => {
    try {
      setActionStatus(`Executing simulation: ${action}...`);
      const res = await fetch(`${API_BASE}/api/simulate-failure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetModel }),
      });
      const data = await res.json();
      setActionStatus(data.message || 'Action executed successfully');
      await fetchStats();
      onRefreshModels();
      setTimeout(() => setActionStatus(null), 4000);
    } catch (err: any) {
      setActionStatus(`Action failed: ${err.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end">
      <div className="w-full max-w-2xl bg-[#171717] border-l border-[#2e2e2e] h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-[#2e2e2e] flex items-center justify-between bg-[#1f1f1f]">
          <div className="flex items-center space-x-2.5">
            <Activity className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                Architecture & Resilience Telemetry HUD
              </h2>
              <p className="text-[11px] text-gray-400 font-mono">
                Real-time metrics, circuit breaker states & local failure injection
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchStats}
              title="Refresh Stats"
              className="p-1.5 hover:bg-[#2e2e2e] text-gray-400 hover:text-white rounded-md transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-[#2e2e2e] text-gray-400 hover:text-white rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Status Toast */}
        {actionStatus && (
          <div className="bg-emerald-950/90 border-b border-emerald-700/60 px-4 py-2 text-xs font-mono text-emerald-200 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{actionStatus}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
          {/* 1. Infrastructure State */}
          <div>
            <h3 className="font-semibold text-gray-300 uppercase tracking-wider text-[11px] font-mono mb-2.5 flex items-center space-x-1.5">
              <Server className="w-3.5 h-3.5 text-blue-400" />
              <span>Storage & Cache Dependency State</span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#212121] p-3 rounded-lg border border-[#333] flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span className="text-gray-300 font-medium">PostgreSQL 16</span>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                    stats?.infrastructure?.postgres === 'connected'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}
                >
                  {stats?.infrastructure?.postgres === 'connected' ? 'CONNECTED' : 'IN-MEMORY STORE'}
                </span>
              </div>

              <div className="bg-[#212121] p-3 rounded-lg border border-[#333] flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-red-400" />
                  <span className="text-gray-300 font-medium">Redis Cluster</span>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                    stats?.infrastructure?.redis === 'connected'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}
                >
                  {stats?.infrastructure?.redis === 'connected' ? 'CONNECTED' : 'IN-MEMORY CACHE'}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Real-Time Telemetry Counters */}
          <div>
            <h3 className="font-semibold text-gray-300 uppercase tracking-wider text-[11px] font-mono mb-2.5 flex items-center space-x-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Live Traffic & Empirical Latency (Last 500 Requests)</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
              <div className="bg-[#212121] p-3 rounded-lg border border-[#333]">
                <div className="text-gray-400 text-[10px]">Active Streams</div>
                <div className="text-lg font-bold text-emerald-400 mt-1">
                  {stats?.live?.activeStreams ?? 0}
                </div>
              </div>

              <div className="bg-[#212121] p-3 rounded-lg border border-[#333]">
                <div className="text-gray-400 text-[10px]">Total Requests</div>
                <div className="text-lg font-bold text-gray-200 mt-1">
                  {stats?.live?.totalRequests ?? 0}
                </div>
              </div>

              <div className="bg-[#212121] p-3 rounded-lg border border-[#333]">
                <div className="text-gray-400 text-[10px]">Average TTFT</div>
                <div className="text-lg font-bold text-amber-400 mt-1">
                  {stats?.live?.latency?.avgTtftMs ?? 0}ms
                </div>
              </div>

              <div className="bg-[#212121] p-3 rounded-lg border border-[#333]">
                <div className="text-gray-400 text-[10px]">Error Rate</div>
                <div className="text-lg font-bold text-gray-200 mt-1">
                  {stats?.live?.errorRatePct ?? 0}%
                </div>
              </div>
            </div>

            {/* Empirical Percentiles */}
            <div className="mt-2.5 bg-[#212121] p-3 rounded-lg border border-[#333] flex items-center justify-between font-mono text-xs text-gray-300">
              <span className="text-gray-400 text-[11px]">Measured Latency Percentiles:</span>
              <div className="flex space-x-4">
                <span>p50: <strong className="text-emerald-400">{stats?.live?.latency?.p50Ms || 0}ms</strong></span>
                <span>p95: <strong className="text-amber-400">{stats?.live?.latency?.p95Ms || 0}ms</strong></span>
                <span>p99: <strong className="text-purple-400">{stats?.live?.latency?.p99Ms || 0}ms</strong></span>
              </div>
            </div>
          </div>

          {/* 3. Circuit Breaker States */}
          <div>
            <h3 className="font-semibold text-gray-300 uppercase tracking-wider text-[11px] font-mono mb-2.5 flex items-center space-x-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
              <span>Circuit Breaker State Machine</span>
            </h3>
            <div className="space-y-2">
              {(stats?.live?.circuitBreakers || []).map((cb: any) => {
                const isOpen = cb.state === 'OPEN';
                const isHalf = cb.state === 'HALF_OPEN';
                return (
                  <div
                    key={cb.service}
                    className={`p-3 rounded-lg border flex items-center justify-between font-mono ${
                      isOpen
                        ? 'bg-red-950/40 border-red-800/60'
                        : isHalf
                        ? 'bg-amber-950/40 border-amber-800/60'
                        : 'bg-[#212121] border-[#333]'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-gray-200">{cb.service}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        Failures: {cb.failureCount} / {cb.failureThreshold}
                        {isOpen && ` • Probe in ${Math.round(cb.nextAttemptInMs / 1000)}s`}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        isOpen
                          ? 'bg-red-900 text-red-200 border border-red-700'
                          : isHalf
                          ? 'bg-amber-900 text-amber-200 border border-amber-700'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}
                    >
                      {cb.state}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Interactive Failure Simulation (Local Demo) */}
          <div>
            <h3 className="font-semibold text-gray-300 uppercase tracking-wider text-[11px] font-mono mb-2.5 flex items-center space-x-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>[LOCAL DEMO] Fault Injection Scenarios</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={() => handleSimulate('trip_circuit', 'mock-fast')}
                className="p-3 bg-red-950/50 hover:bg-red-900/60 border border-red-800/60 rounded-lg text-left transition-colors"
              >
                <div className="font-semibold text-red-200 flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span>Trip Fast-Model Circuit</span>
                </div>
                <div className="text-[10px] text-red-300/80 mt-1">
                  Forces circuit OPEN to test automatic model fallback routing
                </div>
              </button>

              <button
                onClick={() => handleSimulate('enable_model_error')}
                className="p-3 bg-amber-950/50 hover:bg-amber-900/60 border border-amber-800/60 rounded-lg text-left transition-colors"
              >
                <div className="font-semibold text-amber-200 flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Simulate 503 Provider Outage</span>
                </div>
                <div className="text-[10px] text-amber-300/80 mt-1">
                  Injects upstream 503 errors on the next request
                </div>
              </button>

              <button
                onClick={() => handleSimulate('reset_circuits')}
                className="p-3 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-800/60 rounded-lg text-left transition-colors"
              >
                <div className="font-semibold text-emerald-200 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Reset All Faults & Circuits</span>
                </div>
                <div className="text-[10px] text-emerald-300/80 mt-1">
                  Restores all circuit breakers and providers to healthy CLOSED state
                </div>
              </button>

              <button
                onClick={() => handleSimulate('flush_cache')}
                className="p-3 bg-[#262626] hover:bg-[#303030] border border-[#3e3e3e] rounded-lg text-left transition-colors"
              >
                <div className="font-semibold text-gray-200 flex items-center space-x-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                  <span>Flush Rate Limits & Cache</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                  Clears active Redis RPM/TPM and concurrency quotas
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
