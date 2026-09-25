import React, { useState } from 'react';
import {
  CheckCircle2,
  Clipboard,
  Clock,
  Code2,
  Cpu,
  FileCode,
  HardDrive,
  Info,
  Layers,
  RefreshCw,
  Terminal,
  Wifi,
  XCircle
} from 'lucide-react';
import { ApiDiagnosticsInfo } from '../services/BrewPiApiClient';
import { DeviceCapabilities } from '../types/brewpi';
import { translations } from '../i18n/translations';

interface DiagnosticsViewProps {
  diagnostics: ApiDiagnosticsInfo;
  capabilities: DeviceCapabilities;
  lang: 'en' | 'tr';
  onFetchPid: () => Promise<void>;
  isFetchingPid: boolean;
  onProbeAll?: () => Promise<void>;
  isProbingAll?: boolean;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({
  diagnostics,
  capabilities,
  lang,
  onFetchPid,
  isFetchingPid,
  onProbeAll,
  isProbingAll = false
}) => {
  const t = translations[lang];
  const [copied, setCopied] = useState(false);
  const [rawTab, setRawTab] = useState<'/getstatus' | '/fs' | '/time' | '/loglist.php' | '/pid'>('/getstatus');

  const handleCopyDiagnostics = () => {
    const report = {
      timestamp: new Date().toISOString(),
      url: diagnostics.url,
      httpStatus: diagnostics.httpStatus,
      requestDurationMs: diagnostics.requestDurationMs,
      consecutiveFailures: diagnostics.consecutiveFailures,
      lastSuccess: diagnostics.lastSuccessTimestamp ? new Date(diagnostics.lastSuccessTimestamp).toISOString() : null,
      lastError: diagnostics.lastErrorTimestamp ? new Date(diagnostics.lastErrorTimestamp).toISOString() : null,
      lastErrorMessage: diagnostics.lastErrorMessage,
      capabilities,
      endpointProbes: diagnostics.endpointProbes,
      appVersion: '1.0.0 (Native Android & Web Core)',
      targetSdk: 36
    };

    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderCap = (name: string, supported: boolean, details?: string) => (
    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 text-xs">
      <div className="flex items-center gap-2">
        {supported ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-slate-500 shrink-0" />
        )}
        <span className="text-slate-200 font-medium">{name}</span>
      </div>
      <span className="text-[11px] text-slate-400 font-mono">
        {supported ? (details || 'SUPPORTED') : 'NOT DETECTED'}
      </span>
    </div>
  );

  const endpointsList = [
    { ep: '/getstatus', label: 'GET /getstatus', title: 'Status & Temperatures' },
    { ep: '/fs', label: 'GET /fs', title: 'Filesystem & Free Heap' },
    { ep: '/time', label: 'GET /time', title: 'Time Sync & Epoch' },
    { ep: '/loglist.php', label: 'GET /loglist.php', title: 'Log Profiles (Read-Only)' },
    { ep: '/pid?fmt=text', label: 'GET /pid?fmt=text', title: 'PID Controller Parameters' }
  ];

  return (
    <div className="space-y-6">
      {/* Top Bar: Network Info, Probe Action & Copy */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            {t.diagnostics} & Network Status
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Endpoint: <span className="text-cyan-400">{diagnostics.url || 'Not configured'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onProbeAll && (
            <button
              onClick={onProbeAll}
              disabled={isProbingAll}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition disabled:opacity-50"
              title={t.probeEndpointsDesc}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProbingAll ? 'animate-spin' : ''}`} />
              <span>{isProbingAll ? t.probingEndpoints : t.probeAllEndpoints}</span>
            </button>
          )}

          <button
            onClick={handleCopyDiagnostics}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <Clipboard className="w-3.5 h-3.5 text-cyan-400" />
            <span>{copied ? 'Copied!' : t.copyDiagnostics}</span>
          </button>
        </div>
      </div>

      {/* HTTP Connection Details */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800 shadow-sm">
          <span className="text-slate-400 block mb-1">HTTP Status Code</span>
          <span className={`text-xl font-bold font-mono ${
            diagnostics.httpStatus === 200 ? 'text-emerald-400' : (diagnostics.httpStatus ? 'text-rose-400' : 'text-slate-400')
          }`}>
            {diagnostics.httpStatus || '--'}
          </span>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800 shadow-sm">
          <span className="text-slate-400 block mb-1">Request Latency</span>
          <span className="text-xl font-bold font-mono text-cyan-400">
            {diagnostics.requestDurationMs !== null ? `${diagnostics.requestDurationMs} ms` : '--'}
          </span>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800 shadow-sm">
          <span className="text-slate-400 block mb-1">Consecutive Errors</span>
          <span className={`text-xl font-bold font-mono ${diagnostics.consecutiveFailures > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
            {diagnostics.consecutiveFailures}
          </span>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800 shadow-sm">
          <span className="text-slate-400 block mb-1">Firmware Family</span>
          <span className="text-sm font-bold text-amber-400 uppercase tracking-wider block mt-1">
            {capabilities.detectedFirmware === 'asdafe_fork'
              ? 'asdafe fork (ih/ic & FS Heap)'
              : (capabilities.detectedFirmware === 'original_vitotai' ? 'Original VitoTai' : 'Auto-Detecting')}
          </span>
        </div>
      </div>

      {/* Live Endpoint Reachability & Health Status */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Wifi className="w-4 h-4 text-emerald-400" />
              Live Endpoint Reachability Matrix (5 Endpoints)
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified live on ESP32 device via safe Single Request Queue.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {endpointsList.map(({ ep, label, title }) => {
            const probe = diagnostics.endpointProbes?.[ep];
            const isOk = probe?.ok ?? true;
            const httpStatus = probe?.httpStatus ?? 200;
            const duration = probe?.durationMs;
            const summary = probe?.summary || (isOk ? 'Endpoint is reachable and verified' : probe?.error || 'Unavailable');

            return (
              <div
                key={ep}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 gap-2 text-xs"
              >
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  {isOk ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-white">{label}</span>
                      <span className="text-[11px] text-slate-400">({title})</span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-mono truncate mt-0.5">
                      {summary}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {duration !== null && duration !== undefined && (
                    <span className="text-[10px] text-cyan-400 font-mono bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                      {duration} ms
                    </span>
                  )}
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                    isOk && httpStatus === 200
                      ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                      : 'bg-rose-950/60 text-rose-400 border-rose-800/50'
                  }`}>
                    {httpStatus ? `HTTP ${httpStatus} OK` : 'ACTIVE'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Firmware Capability Detection Matrix */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-sm">
        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-400" />
          Firmware Capabilities Matrix
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {renderCap('GET /getstatus', capabilities.supportsGetStatus, 'Status & Temp (OK)')}
          {renderCap('GET /fs', capabilities.supportsFs, 'Filesystem & Heap (OK)')}
          {renderCap('GET /time', capabilities.supportsTime, 'Time Synchronization (OK)')}
          {renderCap('GET /loglist.php', capabilities.supportsLogList, 'Read-only logs (OK)')}
          {renderCap('GET /pid?fmt=text', capabilities.supportsPid, 'PID parameters (OK)')}
          {renderCap('Independent Actuators (ih/ic)', capabilities.supportsIndependentActuators, 'asdafe fork (OK)')}
          {renderCap('Extended Heap Stats', capabilities.supportsExtendedHeapStats, 'minFreeHeap/blocks (OK)')}
          {renderCap('WebSocket Clients Count', capabilities.supportsWebSocketCount, 'wsClients (OK)')}
        </div>
      </div>

      {/* PID Diagnostics On-Demand Runner */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              PID Controller Parameters (GET /pid?fmt=text)
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Only executed on-demand through single request queue to safeguard ESP32 memory.
            </p>
          </div>

          <button
            onClick={onFetchPid}
            disabled={isFetchingPid}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
          >
            <Terminal className={`w-3.5 h-3.5 ${isFetchingPid ? 'animate-spin' : ''}`} />
            <span>{isFetchingPid ? 'Fetching...' : t.pidDiagnostics}</span>
          </button>
        </div>

        {diagnostics.rawPidText ? (
          <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-purple-300 overflow-x-auto whitespace-pre-wrap max-h-48">
            {diagnostics.rawPidText}
          </pre>
        ) : (
          <div className="p-4 text-center border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
            Press &quot;Fetch PID Diagnostics&quot; or &quot;Probe All Endpoints&quot; to inspect active PID values.
          </div>
        )}
      </div>

      {/* Raw Response Inspect Tabs */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5 text-blue-400" />
            Raw Device Responses Inspector
          </h4>

          <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
            {(['/getstatus', '/fs', '/time', '/loglist.php', '/pid'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setRawTab(tab)}
                className={`px-2.5 py-1 rounded-lg transition border ${
                  rawTab === tab
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
          <div className="text-[10px] text-slate-400 mb-2 font-mono flex items-center justify-between">
            <span>ENDPOINT: {rawTab}</span>
            <span>FORMAT: {rawTab === '/pid' || rawTab === '/fs' ? 'TEXT / JSON' : 'JSON'}</span>
          </div>
          <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto max-h-60 whitespace-pre-wrap">
            {rawTab === '/getstatus' && (diagnostics.rawStatusJson || '// No /getstatus response received yet')}
            {rawTab === '/fs' && (diagnostics.rawFsJson || '// No /fs response received yet')}
            {rawTab === '/time' && (diagnostics.rawTimeJson || '// No /time response received yet')}
            {rawTab === '/loglist.php' && (diagnostics.rawLogListJson || '// No /loglist.php response received yet')}
            {rawTab === '/pid' && (diagnostics.rawPidText || '// No /pid response received yet')}
          </pre>
        </div>
      </div>
    </div>
  );
};
