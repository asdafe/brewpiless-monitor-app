import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BellOff,
  CheckCircle2,
  Clock,
  Filter,
  History,
  Info,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import { AlertEvent, ErrorCounters } from '../types/brewpi';
import { translations } from '../i18n/translations';
import { NotificationService } from '../services/NotificationService';

interface AlertHistoryViewProps {
  alerts: AlertEvent[];
  errorCounters?: ErrorCounters;
  onSnoozeAlert: (alert: AlertEvent, durationMs: number) => void;
  lang: 'en' | 'tr';
  onClearAlerts?: () => void;
}

export const AlertHistoryView: React.FC<AlertHistoryViewProps> = ({
  alerts,
  errorCounters,
  onSnoozeAlert,
  lang,
  onClearAlerts
}) => {
  const t = translations[lang];
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [isConfirmingClear, setIsConfirmingClear] = useState<boolean>(false);

  const hasErrors = errorCounters ? Object.values(errorCounters).some((c) => c > 0) : false;
  const canClear = Boolean(onClearAlerts && (alerts.length > 0 || hasErrors));

  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'active') return !a.isResolved;
    if (filter === 'resolved') return a.isResolved;
    return true;
  });

  const formatTimestamp = (ts: number): string => {
    return new Date(ts).toLocaleString();
  };

  const getSeverityBadge = (severity: string, isResolved: boolean) => {
    if (isResolved) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" />
          {t.resolved}
        </span>
      );
    }
    if (severity === 'critical') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <AlertCircle className="w-3 h-3" />
          CRITICAL
        </span>
      );
    }
    if (severity === 'warning') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3 h-3" />
          WARNING
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <Info className="w-3 h-3" />
        INFO
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Filter and Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 rounded-2xl border border-slate-800 p-4">
        <div className="flex items-center gap-2.5">
          <History className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-sm font-bold text-white">{t.history}</h3>
            <p className="text-xs text-slate-400">Total logged events: {alerts.length}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-800 rounded-lg p-0.5 text-xs font-medium border border-slate-700">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-md transition ${filter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              All ({alerts.length})
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-3 py-1 rounded-md transition ${filter === 'active' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Active ({alerts.filter((a) => !a.isResolved).length})
            </button>
            <button
              onClick={() => setFilter('resolved')}
              className={`px-3 py-1 rounded-md transition ${filter === 'resolved' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Resolved ({alerts.filter((a) => a.isResolved).length})
            </button>
          </div>

          {canClear && (
            <div className="flex items-center gap-1.5">
              {!isConfirmingClear ? (
                <button
                  onClick={() => setIsConfirmingClear(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/30 rounded-lg text-xs font-semibold transition cursor-pointer"
                  title={t.cleanAlertHistory}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>{t.cleanAlertHistory}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-rose-950/80 border border-rose-600/70 rounded-lg p-1">
                  <span className="text-[11px] text-rose-200 font-medium px-1">
                    {lang === 'tr' ? 'Geçmiş ve sayaçlar sıfırlansın mı?' : 'Reset history & counters?'}
                  </span>
                  <button
                    onClick={() => {
                      onClearAlerts?.();
                      setIsConfirmingClear(false);
                    }}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-bold transition cursor-pointer"
                  >
                    {lang === 'tr' ? 'Evet, Sıfırla' : 'Yes, Reset'}
                  </button>
                  <button
                    onClick={() => setIsConfirmingClear(false)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold transition cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Alert List */}
      {filteredAlerts.length === 0 ? (
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-12 text-center">
          <ShieldCheck className="w-12 h-12 text-emerald-500/50 mx-auto mb-3" />
          <h4 className="text-base font-bold text-slate-200">{t.noAlerts}</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            All sensors and connectivity within expected operating parameters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => {
            const ruleKey = `${alert.eventType}_${alert.sensor || 'general'}`;
            const snoozedUntil = NotificationService.getSnoozedUntil(ruleKey);

            return (
              <div
                key={alert.id}
                className={`bg-slate-900/90 rounded-2xl border p-4.5 transition shadow-sm ${
                  alert.isResolved
                    ? 'border-slate-800/80 bg-slate-900/40 opacity-75'
                    : alert.severity === 'critical'
                    ? 'border-rose-500/40 bg-rose-950/10'
                    : 'border-amber-500/40 bg-amber-950/10'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {getSeverityBadge(alert.severity, alert.isResolved)}
                      <h4 className="text-sm font-bold text-white">{alert.ruleDescription}</h4>
                      {snoozedUntil && (
                        <span className="text-[10px] bg-slate-800 text-amber-300 px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                          <BellOff className="w-3 h-3" />
                          {t.snoozedUntil} {new Date(snoozedUntil).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300">{alert.message}</p>
                  </div>

                  {/* Selective Snooze Action Buttons */}
                  {!alert.isResolved && (
                    <div className="flex items-center gap-1.5 self-start md:self-center shrink-0">
                      <button
                        onClick={() => onSnoozeAlert(alert, 1 * 60 * 60 * 1000)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium border border-slate-700 transition"
                      >
                        {t.snooze1h}
                      </button>
                      <button
                        onClick={() => onSnoozeAlert(alert, 5 * 60 * 60 * 1000)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium border border-slate-700 transition"
                      >
                        {t.snooze5h}
                      </button>
                      <button
                        onClick={() => onSnoozeAlert(alert, 24 * 60 * 60 * 1000)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium border border-slate-700 transition"
                      >
                        {t.snooze24h}
                      </button>
                    </div>
                  )}
                </div>

                {/* Timestamps & Measured Details */}
                <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-800/80">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>Phone Time: {formatTimestamp(alert.phoneTimestamp)}</span>
                  </div>

                  {alert.espTimestamp && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-cyan-500" />
                      <span>ESP32 Time: {formatTimestamp(alert.espTimestamp)}</span>
                    </div>
                  )}

                  {alert.measuredValue !== undefined && alert.measuredValue !== null && (
                    <div className="text-slate-300">
                      Measured: <span className="font-semibold text-white">{alert.measuredValue.toFixed(1)}°C</span>
                      {alert.expectedValue !== undefined && alert.expectedValue !== null && (
                        <span> (Target: {alert.expectedValue.toFixed(1)}°C)</span>
                      )}
                    </div>
                  )}

                  {alert.recoveryTimestamp && (
                    <div className="text-emerald-400 font-medium">
                      Recovered at: {formatTimestamp(alert.recoveryTimestamp)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
