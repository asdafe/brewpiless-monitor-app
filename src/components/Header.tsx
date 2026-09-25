import React from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  FlaskConical,
  Globe,
  Play,
  Square,
  Wifi,
  WifiOff
} from 'lucide-react';
import { ConnectionHealthState } from '../types/brewpi';
import { translations } from '../i18n/translations';
import { NotificationService } from '../services/NotificationService';

interface HeaderProps {
  connectionState: ConnectionHealthState;
  isMonitoring: boolean;
  onToggleMonitoring: () => void;
  lang: 'en' | 'tr';
  onToggleLang: () => void;
  activeBatchName: string | null;
  onOpenBatchModal: () => void;
  onOpenTestsModal: () => void;
  onOpenAndroidModal: () => void;
  isSimMode: boolean;
  onToggleSimMode?: (enabled: boolean) => void;
  onTestConnection: () => void;
  isTestingConnection: boolean;
  queueBusy: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  connectionState,
  isMonitoring,
  onToggleMonitoring,
  lang,
  onToggleLang,
  activeBatchName,
  onOpenBatchModal,
  onOpenTestsModal,
  onOpenAndroidModal,
  isSimMode,
  onToggleSimMode,
  onTestConnection,
  isTestingConnection,
  queueBusy
}) => {
  const t = translations[lang];

  const getConnectionBadge = () => {
    switch (connectionState) {
      case 'HEALTHY':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <Wifi className="w-3.5 h-3.5" />
            {t.online}
          </span>
        );
      case 'RECOVERED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t.recovered}
          </span>
        );
      case 'TEMPORARY_FAILURE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
            {t.temporaryFailure}
          </span>
        );
      case 'OFFLINE_ALERTED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
            <WifiOff className="w-3.5 h-3.5" />
            {t.offline}
          </span>
        );
    }
  };

  const handleRequestNotifPermission = async () => {
    const granted = await NotificationService.requestPermission();
    if (granted) {
      NotificationService.playAlertSound('chime');
    }
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Logo & Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-white font-black text-xl">
                BP
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-white tracking-tight leading-none">
                    {t.appTitle}
                  </h1>
                  {getConnectionBadge()}
                  {isSimMode ? (
                    <button
                      onClick={() => onToggleSimMode && onToggleSimMode(false)}
                      title={lang === 'tr' ? 'Simülasyon modunu kapatıp gerçek ESP32\'ye geçmek için tıklayın' : 'Click to disable simulation mode and switch to live ESP32'}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/25 hover:bg-purple-500/40 text-purple-200 border border-purple-500/40 uppercase tracking-wider flex items-center gap-1 transition cursor-pointer"
                    >
                      <FlaskConical className="w-2.5 h-2.5 text-purple-300" />
                      SIM: ON (Kapat ✕)
                    </button>
                  ) : (
                    <button
                      onClick={() => onToggleSimMode && onToggleSimMode(true)}
                      title={lang === 'tr' ? 'Simülasyon modunu açmak için tıklayın' : 'Click to enable simulation mode'}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider flex items-center gap-1 transition cursor-pointer"
                    >
                      LIVE ESP32
                    </button>
                  )}
                  {queueBusy && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1 animate-pulse">
                      <Clock className="w-2.5 h-2.5" />
                      QUEUE
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t.appSubtitle}
                </p>
              </div>
            </div>
          </div>

          {/* Controls & Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Active Batch */}
            <button
              onClick={onOpenBatchModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Manage fermentation batches"
            >
              <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
              <span className="max-w-[130px] truncate">
                {activeBatchName || t.noActiveBatch}
              </span>
            </button>

            {/* Test Connection */}
            <button
              onClick={onTestConnection}
              disabled={isTestingConnection}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
            >
              <Activity className={`w-3.5 h-3.5 text-cyan-400 ${isTestingConnection ? 'animate-spin' : ''}`} />
              <span>{t.testConnection}</span>
            </button>

            {/* Notification Permission */}
            <button
              onClick={handleRequestNotifPermission}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title={t.enableNotifications}
            >
              <Bell className="w-4 h-4" />
            </button>

            {/* Automated Tests Button */}
            <button
              onClick={onOpenTestsModal}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/60 transition"
            >
              {t.tests}
            </button>

            {/* Android Studio Project / APK Exporter */}
            <button
              onClick={onOpenAndroidModal}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/60 transition"
            >
              {t.androidCode}
            </button>

            {/* Language Toggle */}
            <button
              onClick={onToggleLang}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition uppercase"
            >
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span>{lang}</span>
            </button>

            {/* Monitoring ON / OFF Toggle */}
            <button
              onClick={onToggleMonitoring}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${
                isMonitoring
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isMonitoring ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  {t.stopMonitoring}
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {t.startMonitoring}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
