import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Cpu,
  FileCode,
  FlaskConical,
  HardDrive,
  History,
  LayoutDashboard,
  Play,
  RotateCcw,
  Sliders,
  Smartphone,
  Square,
  Terminal,
  TestTube2,
  Wifi,
  WifiOff
} from 'lucide-react';
import {
  AppSettings,
  BrewPiStatus,
  SystemHealthStatus,
  ConnectionHealthState,
  AlertEvent,
  ActuatorMetrics,
  ErrorCounters
} from './types/brewpi';
import { StorageService, DEFAULT_SETTINGS } from './services/StorageService';
import { BrewPiApiClient } from './services/BrewPiApiClient';
import { MonitoringEngine } from './services/MonitoringEngine';
import { esp32RequestQueue } from './services/SingleRequestQueue';
import { SimulationEngine, SimulationScenario } from './services/SimulationEngine';
import { NotificationService } from './services/NotificationService';
import { translations } from './i18n/translations';

// Components
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { SimulationBar } from './components/SimulationBar';
import { AlertHistoryView } from './components/AlertHistoryView';
import { DiagnosticsView } from './components/DiagnosticsView';
import { SettingsModal } from './components/SettingsModal';
import { BatchManagerModal } from './components/BatchManagerModal';
import { TestRunnerModal } from './components/TestRunnerModal';
import { AndroidCodeModal } from './components/AndroidCodeModal';

export default function App() {
  // Load initial settings
  const [settings, setSettings] = useState<AppSettings>(() => StorageService.getSettings());
  const [lang, setLang] = useState<'en' | 'tr'>(settings.language || 'en');

  // Core singletons initialized once
  const apiClient = useMemo(() => {
    const client = new BrewPiApiClient(
      settings.deviceHost,
      settings.devicePort,
      settings.useHttps,
      settings.requestTimeoutMs
    );
    client.updateConfig(
      settings.deviceHost,
      settings.devicePort,
      settings.useHttps,
      settings.requestTimeoutMs,
      settings.simulationMode,
      settings.firmwareVariant || 'asdafe_fork'
    );
    return client;
  }, []);

  const engine = useMemo(() => {
    return new MonitoringEngine(apiClient, settings);
  }, [apiClient]);

  // UI Reactive States
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'diagnostics'>('dashboard');
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [connectionState, setConnectionState] = useState<ConnectionHealthState>('HEALTHY');
  const [latestStatus, setLatestStatus] = useState<BrewPiStatus | null>(null);
  const [latestFs, setLatestFs] = useState<SystemHealthStatus | null>(null);
  const [heaterMetrics, setHeaterMetrics] = useState<ActuatorMetrics>(engine.getHeaterMetrics());
  const [coolerMetrics, setCoolerMetrics] = useState<ActuatorMetrics>(engine.getCoolerMetrics());
  const [errorCounters, setErrorCounters] = useState<ErrorCounters>(StorageService.getErrorCounters());
  const [alerts, setAlerts] = useState<AlertEvent[]>(StorageService.getAlerts());
  const [activeBatchName, setActiveBatchName] = useState<string | null>(
    StorageService.getActiveBatch()?.name || null
  );

  // Poll timings
  const [lastSuccessfulPoll, setLastSuccessfulPoll] = useState<number | null>(null);
  const [nextExpectedPoll, setNextExpectedPoll] = useState<number | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState<number>(0);
  const [lastError, setLastError] = useState<string | null>(null);

  // Queue state
  const [queueBusy, setQueueBusy] = useState<boolean>(false);

  // Modals
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showBatchModal, setShowBatchModal] = useState<boolean>(false);
  const [showTestsModal, setShowTestsModal] = useState<boolean>(false);
  const [showAndroidModal, setShowAndroidModal] = useState<boolean>(false);

  // Simulation & Manual Action States
  const [currentScenario, setCurrentScenario] = useState<SimulationScenario>('HEALTHY');
  const [isFetchingNow, setIsFetchingNow] = useState<boolean>(false);
  const [isPollingFs, setIsPollingFs] = useState<boolean>(false);
  const [isFetchingPid, setIsFetchingPid] = useState<boolean>(false);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [isProbingAll, setIsProbingAll] = useState<boolean>(false);

  const t = translations[lang];

  // Subscribe to queue state
  useEffect(() => {
    const unsubQueue = esp32RequestQueue.subscribe((state) => {
      setQueueBusy(state.isBusy);
    });
    return unsubQueue;
  }, []);

  // Sync with engine updates
  const syncWithEngine = useCallback(() => {
    setConnectionState(engine.getConnectionState());
    setLatestStatus(engine.latestStatus);
    setLatestFs(engine.latestFs);
    setHeaterMetrics(engine.getHeaterMetrics());
    setCoolerMetrics(engine.getCoolerMetrics());
    setLastSuccessfulPoll(engine.getLastSuccessfulPoll());
    setNextExpectedPoll(engine.getNextExpectedPoll());
    setConsecutiveFailures(engine.getConsecutiveFailures());
    setLastError(apiClient.getDiagnostics().lastErrorMessage);
    setErrorCounters(StorageService.getErrorCounters());
    setAlerts(StorageService.getAlerts());
  }, [engine, apiClient]);

  useEffect(() => {
    const unsubscribe = engine.subscribe(syncWithEngine);
    // Initial fetch
    engine.executePollCycle();
    engine.pollFilesystemAndHeap();
    return () => {
      unsubscribe();
      engine.stop();
    };
  }, [engine, syncWithEngine]);

  // Monitoring toggle
  const handleToggleMonitoring = () => {
    if (isMonitoring) {
      engine.stop();
      setIsMonitoring(false);
    } else {
      engine.start();
      setIsMonitoring(true);
    }
  };

  // Language toggle
  const handleToggleLang = () => {
    const nextLang: 'en' | 'tr' = lang === 'en' ? 'tr' : 'en';
    setLang(nextLang);
    const updated: AppSettings = { ...settings, language: nextLang };
    setSettings(updated);
    StorageService.saveSettings(updated);
  };

  // Save Settings
  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    StorageService.saveSettings(newSettings);
    esp32RequestQueue.setInterRequestDelay(newSettings.interRequestDelayMs);
    engine.updateSettings(newSettings);
    setLang(newSettings.language);
  };

  // Immediate Fetch Now
  const handleFetchNow = async () => {
    setIsFetchingNow(true);
    try {
      await engine.executePollCycle();
    } finally {
      setIsFetchingNow(false);
    }
  };

  // Test Connection
  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      await engine.executePollCycle();
      NotificationService.playAlertSound('chime');
    } catch {
      NotificationService.playAlertSound('warning');
    } finally {
      setIsTestingConnection(false);
    }
  };

  // On-demand PID diagnostics fetch
  const handleFetchPid = async () => {
    setIsFetchingPid(true);
    try {
      await apiClient.getPidDiagnostics();
    } finally {
      setIsFetchingPid(false);
    }
  };

  // Full Diagnostics Probe of All 5 Endpoints
  const handleProbeAll = async () => {
    setIsProbingAll(true);
    try {
      await apiClient.probeAllEndpoints();
      NotificationService.playAlertSound('chime');
    } catch {
      NotificationService.playAlertSound('warning');
    } finally {
      setIsProbingAll(false);
    }
  };

  // Auto probe on switching to diagnostics if not yet probed
  useEffect(() => {
    if (activeTab === 'diagnostics') {
      const diag = apiClient.getDiagnostics();
      if (!diag.endpointProbes['/time']?.lastChecked) {
        handleProbeAll();
      }
    }
  }, [activeTab]);

  // Scenario selection
  const handleSelectScenario = (scenario: SimulationScenario) => {
    setCurrentScenario(scenario);
    SimulationEngine.setScenario(scenario);
    if (!settings.simulationMode) {
      const updated = { ...settings, simulationMode: true };
      setSettings(updated);
      StorageService.saveSettings(updated);
      engine.updateSettings(updated);
    }
  };

  // Toggle Simulation Mode ON/OFF
  const handleToggleSimMode = (enabled: boolean) => {
    const updated = { ...settings, simulationMode: enabled };
    setSettings(updated);
    StorageService.saveSettings(updated);
    engine.updateSettings(updated);
    // If turning off, immediately trigger a fresh poll from live ESP32
    if (!enabled) {
      engine.executePollCycle().catch(() => {});
    }
  };

  // Snooze alert
  const handleSnoozeAlert = (alert: AlertEvent, durationMs: number) => {
    const ruleKey = `${alert.eventType}_${alert.sensor || 'general'}`;
    NotificationService.snoozeRule(ruleKey, durationMs);
    setAlerts([...StorageService.getAlerts()]);
  };

  // Poll FS & Heap Now
  const handlePollFsNow = async () => {
    setIsPollingFs(true);
    try {
      await engine.pollFilesystemAndHeap();
    } catch {
      // handled in engine
    } finally {
      setIsPollingFs(false);
    }
  };

  // Clean all alert history & diagnostic error counters
  const handleClearAlerts = () => {
    StorageService.clearAlerts();
    const resetCounters = StorageService.resetErrorCounters();
    setErrorCounters(resetCounters);
    engine.clearActiveAlarms();
    setAlerts([]);
  };

  // Reset diagnostic error counters directly
  const handleResetErrorCounters = () => {
    const resetCounters = StorageService.resetErrorCounters();
    setErrorCounters(resetCounters);
    engine.clearActiveAlarms();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Application Header */}
      <Header
        connectionState={connectionState}
        isMonitoring={isMonitoring}
        onToggleMonitoring={handleToggleMonitoring}
        lang={lang}
        onToggleLang={handleToggleLang}
        activeBatchName={activeBatchName}
        onOpenBatchModal={() => setShowBatchModal(true)}
        onOpenTestsModal={() => setShowTestsModal(true)}
        onOpenAndroidModal={() => setShowAndroidModal(true)}
        isSimMode={settings.simulationMode}
        onToggleSimMode={handleToggleSimMode}
        onTestConnection={handleTestConnection}
        isTestingConnection={isTestingConnection}
        queueBusy={queueBusy}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Simulation Bar (Quick scenario switcher) */}
        <SimulationBar
          currentScenario={currentScenario}
          onSelectScenario={handleSelectScenario}
          lang={lang}
          onTriggerNow={handleFetchNow}
          isSimMode={settings.simulationMode}
          onToggleSimMode={handleToggleSimMode}
        />

        {/* Navigation Tabs Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>{t.dashboard}</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition relative ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <History className="w-4 h-4" />
              <span>{t.history}</span>
              {alerts.filter((a) => !a.isResolved).length > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('diagnostics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'diagnostics'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>{t.diagnostics}</span>
            </button>
          </div>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold border border-slate-800 transition"
          >
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">{t.settings}</span>
          </button>
        </div>

        {/* Tab Views */}
        {activeTab === 'dashboard' && (
          <DashboardView
            status={latestStatus}
            fs={latestFs}
            heater={heaterMetrics}
            cooler={coolerMetrics}
            counters={errorCounters}
            connectionState={connectionState}
            lastSuccessfulPoll={lastSuccessfulPoll}
            nextExpectedPoll={nextExpectedPoll}
            lastError={lastError}
            onFetchNow={handleFetchNow}
            isFetching={isFetchingNow}
            lang={lang}
            consecutiveFailures={consecutiveFailures}
            onPollFsNow={handlePollFsNow}
            isPollingFs={isPollingFs}
            onResetCounters={handleResetErrorCounters}
            settings={settings}
          />
        )}

        {activeTab === 'history' && (
          <AlertHistoryView
            alerts={alerts}
            errorCounters={errorCounters}
            onSnoozeAlert={handleSnoozeAlert}
            lang={lang}
            onClearAlerts={handleClearAlerts}
          />
        )}

        {activeTab === 'diagnostics' && (
          <DiagnosticsView
            diagnostics={apiClient.getDiagnostics()}
            capabilities={apiClient.getCapabilities()}
            lang={lang}
            onFetchPid={handleFetchPid}
            isFetchingPid={isFetchingPid}
            onProbeAll={handleProbeAll}
            isProbingAll={isProbingAll}
          />
        )}
      </main>

      {/* Modals */}
      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettingsModal(false)}
          lang={lang}
        />
      )}

      {showBatchModal && (
        <BatchManagerModal
          onClose={() => setShowBatchModal(false)}
          lang={lang}
          onBatchUpdated={() => {
            setActiveBatchName(StorageService.getActiveBatch()?.name || null);
          }}
        />
      )}

      {showTestsModal && (
        <TestRunnerModal
          onClose={() => setShowTestsModal(false)}
          lang={lang}
        />
      )}

      {showAndroidModal && (
        <AndroidCodeModal
          onClose={() => setShowAndroidModal(false)}
          lang={lang}
        />
      )}
    </div>
  );
}
