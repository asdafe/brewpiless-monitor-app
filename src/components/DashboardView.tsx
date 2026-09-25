import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Cpu,
  Flame,
  HardDrive,
  HelpCircle,
  Info,
  RefreshCw,
  RotateCcw,
  Snowflake,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Zap
} from 'lucide-react';
import {
  BrewPiStatus,
  SystemHealthStatus,
  ActuatorMetrics,
  ErrorCounters,
  ConnectionHealthState,
  AppSettings,
  TemperatureRuleConfig
} from '../types/brewpi';
import { translations } from '../i18n/translations';

interface DashboardViewProps {
  status: BrewPiStatus | null;
  fs: SystemHealthStatus | null;
  heater: ActuatorMetrics;
  cooler: ActuatorMetrics;
  counters: ErrorCounters;
  connectionState: ConnectionHealthState;
  lastSuccessfulPoll: number | null;
  nextExpectedPoll: number | null;
  lastError: string | null;
  onFetchNow: () => void;
  isFetching: boolean;
  lang: 'en' | 'tr';
  consecutiveFailures: number;
  onPollFsNow?: () => void;
  isPollingFs?: boolean;
  onResetCounters?: () => void;
  settings?: AppSettings;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  status,
  fs,
  heater,
  cooler,
  counters,
  connectionState,
  lastSuccessfulPoll,
  nextExpectedPoll,
  lastError,
  onFetchNow,
  isFetching,
  lang,
  consecutiveFailures,
  onPollFsNow,
  isPollingFs = false,
  onResetCounters,
  settings
}) => {
  const [isConfirmingReset, setIsConfirmingReset] = React.useState<boolean>(false);
  const t = translations[lang];

  const getModeDisplay = (m?: string) => {
    if (!m) return '--';
    if (m === 'i') return 'Independent (asdafe)';
    if (m === 'b') return 'Beer Constant (b)';
    if (m === 'f') return 'Fridge Constant (f)';
    if (m === 'p') return 'Beer Profile (p)';
    if (m === 'o') return 'Off (o)';
    return m;
  };

  const formatDuration = (ms: number): string => {
    if (ms <= 0) return '0s';
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const getTempCardState = (
    temp: number | null,
    setPoint: number | null,
    rules?: TemperatureRuleConfig
  ) => {
    if (temp === null || temp === undefined) {
      return {
        status: t.noData,
        color: 'border-slate-700 bg-slate-800/40 text-slate-400',
        badgeClass: 'border-slate-700 text-slate-400',
        icon: HelpCircle
      };
    }

    if (rules && !rules.enabled) {
      return {
        status: t.disabled,
        color: 'border-slate-800 bg-slate-900/60 text-slate-400',
        badgeClass: 'border-slate-700 text-slate-400',
        icon: HelpCircle
      };
    }

    // 1. Check absolute limits first
    if (rules) {
      if (typeof rules.absoluteMax === 'number' && temp > rules.absoluteMax) {
        return {
          status: t.alarm,
          color: 'border-rose-500/60 bg-rose-950/30 text-rose-400',
          badgeClass: 'border-rose-500 text-rose-300 animate-pulse',
          icon: AlertCircle
        };
      }
      if (typeof rules.absoluteMin === 'number' && temp < rules.absoluteMin) {
        return {
          status: t.alarm,
          color: 'border-rose-500/60 bg-rose-950/30 text-rose-400',
          badgeClass: 'border-rose-500 text-rose-300 animate-pulse',
          icon: AlertCircle
        };
      }
    }

    // 2. Check setpoint deviations (if setpoint exists)
    if (setPoint !== null && setPoint !== undefined) {
      const upperDeviation = rules?.upperDeviation ?? 1.5;
      const lowerDeviation = rules?.lowerDeviation ?? 1.5;
      const diff = temp - setPoint;

      // Exceeds upper deviation threshold
      if (diff > upperDeviation) {
        const isCritical = diff > (upperDeviation * 1.75);
        return {
          status: isCritical ? t.alarm : t.warning,
          color: isCritical
            ? 'border-rose-500/60 bg-rose-950/30 text-rose-400'
            : 'border-amber-500/60 bg-amber-950/20 text-amber-400',
          badgeClass: isCritical
            ? 'border-rose-500 text-rose-300 animate-pulse'
            : 'border-amber-500 text-amber-300',
          icon: isCritical ? AlertCircle : AlertTriangle
        };
      }

      // Exceeds lower deviation threshold
      if (diff < -lowerDeviation) {
        const absDiff = Math.abs(diff);
        const isCritical = absDiff > (lowerDeviation * 1.75);
        return {
          status: isCritical ? t.alarm : t.warning,
          color: isCritical
            ? 'border-rose-500/60 bg-rose-950/30 text-rose-400'
            : 'border-amber-500/60 bg-amber-950/20 text-amber-400',
          badgeClass: isCritical
            ? 'border-rose-500 text-rose-300 animate-pulse'
            : 'border-amber-500 text-amber-300',
          icon: isCritical ? AlertCircle : AlertTriangle
        };
      }
    }

    // Within configured safe tolerance limits -> NORMAL
    return {
      status: t.normal,
      color: 'border-emerald-500/30 bg-emerald-950/10 text-emerald-400',
      badgeClass: 'border-emerald-500/40 text-emerald-400',
      icon: CheckCircle2
    };
  };

  const beerRules = settings?.beerRules;
  const fridgeRules = settings?.fridgeRules;
  const roomRules = settings?.roomRules;

  const beerState = getTempCardState(status?.beerTemp ?? null, status?.beerSet ?? null, beerRules);
  const fridgeState = getTempCardState(status?.fridgeTemp ?? null, status?.fridgeSet ?? null, fridgeRules);
  const roomState = getTempCardState(status?.roomTemp ?? null, null, roomRules);

  const formatTime = (ts: number | null): string => {
    if (!ts) return '--:--:--';
    return new Date(ts).toLocaleTimeString();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Single Request Queue & Poll Timings */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <div>
            <span className="text-slate-500 block">{t.lastSuccessfulCheck}:</span>
            <span className="font-semibold text-slate-200">{formatTime(lastSuccessfulPoll)}</span>
          </div>
          <div className="border-l border-slate-800 pl-4">
            <span className="text-slate-500 block">{t.nextCheck}:</span>
            <span className="font-semibold text-slate-200">{formatTime(nextExpectedPoll)}</span>
          </div>
          {consecutiveFailures > 0 && (
            <div className="border-l border-slate-800 pl-4">
              <span className="text-rose-500 block">{t.consecutiveFailures}:</span>
              <span className="font-bold text-rose-400">{consecutiveFailures}</span>
            </div>
          )}
          {lastError && (
            <div className="border-l border-slate-800 pl-4 max-w-xs truncate text-rose-400" title={lastError}>
              <span className="text-slate-500 block">Last Error:</span>
              <span className="truncate">{lastError}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700/60 hidden lg:inline-flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-400" />
            {t.singleQueueNotice}
          </span>
          <button
            onClick={onFetchNow}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            {t.fetchNow}
          </button>
        </div>
      </div>

      {/* Main Temperature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Beer Temp Card */}
        <div className={`rounded-2xl border p-5 shadow-sm transition relative overflow-hidden ${beerState.color}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                <Thermometer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  {t.beerTemp}
                </h3>
                <span className="text-xs text-slate-400">
                  {t.beerSet}: {status?.beerSet !== null && status?.beerSet !== undefined ? `${status.beerSet.toFixed(1)}°C` : 'null'}
                </span>
              </div>
            </div>
            <div className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${beerState.badgeClass || 'border-current'}`}>
              <beerState.icon className="w-3.5 h-3.5" />
              <span>{beerState.status}</span>
            </div>
          </div>

          <div className="my-2">
            <span className="text-4xl font-black tracking-tight text-white">
              {status?.beerTemp !== null && status?.beerTemp !== undefined ? `${status.beerTemp.toFixed(1)}°C` : 'NO DATA'}
            </span>
          </div>

          {status?.beerTemp !== null && status?.beerSet !== null && status?.beerTemp !== undefined && status?.beerSet !== undefined && (() => {
            const diff = Number((status.beerTemp - status.beerSet).toFixed(1));
            const upperDev = beerRules?.upperDeviation ?? 1.5;
            const lowerDev = beerRules?.lowerDeviation ?? 1.5;
            const isAbove = diff > 0.05;
            const isBelow = diff < -0.05;
            const isOverUpper = isAbove && diff > upperDev;
            const isUnderLower = isBelow && Math.abs(diff) > lowerDev;

            if (isAbove) {
              return (
                <div className="text-xs flex items-center gap-1.5 mt-2 flex-wrap">
                  <ArrowUpRight className={`w-3.5 h-3.5 ${isOverUpper ? 'text-rose-400' : 'text-emerald-400'}`} />
                  <span className={`font-semibold ${isOverUpper ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                    +{diff.toFixed(1)}°C
                  </span>
                  <span className="text-slate-400">{t.aboveSetpoint}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    isOverUpper
                      ? 'bg-rose-950/40 text-rose-300 border-rose-800/60 font-semibold'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700/60'
                  }`}>
                    max: +{upperDev.toFixed(1)}°C
                  </span>
                </div>
              );
            }
            if (isBelow) {
              const absDiff = Math.abs(diff);
              return (
                <div className="text-xs flex items-center gap-1.5 mt-2 flex-wrap">
                  <ArrowDownRight className={`w-3.5 h-3.5 ${isUnderLower ? 'text-rose-400' : 'text-emerald-400'}`} />
                  <span className={`font-semibold ${isUnderLower ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                    -{absDiff.toFixed(1)}°C
                  </span>
                  <span className="text-slate-400">{t.belowSetpoint}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    isUnderLower
                      ? 'bg-rose-950/40 text-rose-300 border-rose-800/60 font-semibold'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700/60'
                  }`}>
                    min: -{lowerDev.toFixed(1)}°C
                  </span>
                </div>
              );
            }
            return (
              <div className="text-xs flex items-center gap-1.5 mt-2 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="font-semibold">0.0°C</span>
                <span>{t.onTarget}</span>
              </div>
            );
          })()}
        </div>

        {/* Fridge Temp Card */}
        <div className={`rounded-2xl border p-5 shadow-sm transition relative overflow-hidden ${fridgeState.color}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                <Snowflake className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  {t.fridgeTemp}
                </h3>
                <span className="text-xs text-slate-400">
                  {t.fridgeSet}: {status?.fridgeSet !== null && status?.fridgeSet !== undefined ? `${status.fridgeSet.toFixed(1)}°C` : 'null'}
                </span>
              </div>
            </div>
            <div className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${fridgeState.badgeClass || 'border-current'}`}>
              <fridgeState.icon className="w-3.5 h-3.5" />
              <span>{fridgeState.status}</span>
            </div>
          </div>

          <div className="my-2">
            <span className="text-4xl font-black tracking-tight text-white">
              {status?.fridgeTemp !== null && status?.fridgeTemp !== undefined ? `${status.fridgeTemp.toFixed(1)}°C` : 'NO DATA'}
            </span>
          </div>

          {status?.fridgeTemp !== null && status?.fridgeSet !== null && status?.fridgeTemp !== undefined && status?.fridgeSet !== undefined && (() => {
            const diff = Number((status.fridgeTemp - status.fridgeSet).toFixed(1));
            const upperDev = fridgeRules?.upperDeviation ?? 2.0;
            const lowerDev = fridgeRules?.lowerDeviation ?? 2.0;
            const isAbove = diff > 0.05;
            const isBelow = diff < -0.05;
            const isOverUpper = isAbove && diff > upperDev;
            const isUnderLower = isBelow && Math.abs(diff) > lowerDev;

            if (isAbove) {
              return (
                <div className="text-xs flex items-center gap-1.5 mt-2 flex-wrap">
                  <ArrowUpRight className={`w-3.5 h-3.5 ${isOverUpper ? 'text-rose-400' : 'text-emerald-400'}`} />
                  <span className={`font-semibold ${isOverUpper ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                    +{diff.toFixed(1)}°C
                  </span>
                  <span className="text-slate-400">{t.aboveSetpoint}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    isOverUpper
                      ? 'bg-rose-950/40 text-rose-300 border-rose-800/60 font-semibold'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700/60'
                  }`}>
                    max: +{upperDev.toFixed(1)}°C
                  </span>
                </div>
              );
            }
            if (isBelow) {
              const absDiff = Math.abs(diff);
              return (
                <div className="text-xs flex items-center gap-1.5 mt-2 flex-wrap">
                  <ArrowDownRight className={`w-3.5 h-3.5 ${isUnderLower ? 'text-rose-400' : 'text-emerald-400'}`} />
                  <span className={`font-semibold ${isUnderLower ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                    -{absDiff.toFixed(1)}°C
                  </span>
                  <span className="text-slate-400">{t.belowSetpoint}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    isUnderLower
                      ? 'bg-rose-950/40 text-rose-300 border-rose-800/60 font-semibold'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700/60'
                  }`}>
                    min: -{lowerDev.toFixed(1)}°C
                  </span>
                </div>
              );
            }
            return (
              <div className="text-xs flex items-center gap-1.5 mt-2 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="font-semibold">0.0°C</span>
                <span>{t.onTarget}</span>
              </div>
            );
          })()}
        </div>

        {/* Room Temp Card */}
        <div className={`rounded-2xl border p-5 shadow-sm transition relative overflow-hidden ${roomState.color}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                <Thermometer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  {t.roomTemp}
                </h3>
                <span className="text-xs text-slate-400">
                  Mode: <span className="text-slate-200 font-semibold">{getModeDisplay(status?.mode)}</span> | State: <span className="text-slate-200 font-semibold">{status?.stateDescription || '--'}</span>
                </span>
              </div>
            </div>
            <div className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${roomState.badgeClass || 'border-current'}`}>
              <roomState.icon className="w-3.5 h-3.5" />
              <span>{roomState.status}</span>
            </div>
          </div>

          <div className="my-2">
            <span className="text-4xl font-black tracking-tight text-white">
              {status?.roomTemp !== null && status?.roomTemp !== undefined ? `${status.roomTemp.toFixed(1)}°C` : 'NO DATA'}
            </span>
          </div>

          <div className="text-xs text-slate-400 mt-2 flex items-center justify-between flex-wrap gap-1">
            <div className="flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-slate-500" />
              <span>Ambient room / chamber exterior</span>
            </div>
            {roomRules && typeof roomRules.absoluteMin === 'number' && typeof roomRules.absoluteMax === 'number' && (
              <span className="text-[10px] font-mono text-slate-500">
                safe: {roomRules.absoluteMin.toFixed(1)}°C - {roomRules.absoluteMax.toFixed(1)}°C
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actuator Metrics (Heater & Cooler independently) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Heater Panel */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${heater.isActive ? 'bg-amber-500/20 text-amber-400 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  {t.heaterStatus}
                  {status?.independentActuatorsAvailable && (
                    <span className="text-[10px] text-slate-400 font-normal border border-slate-700 px-1.5 py-0.5 rounded">
                      asdafe ih
                    </span>
                  )}
                </h4>
                <span className="text-xs text-slate-400">Heating Actuator Runtime</span>
              </div>
            </div>

            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              heater.isActive
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {heater.isActive ? 'HEATING ACTIVE' : 'OFF'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block">{t.currentCycle}</span>
              <span className="font-bold text-white text-sm">
                {heater.isActive ? formatDuration(heater.currentCycleDurationMs) : '--'}
              </span>
            </div>
            <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block">{t.totalRuntime}</span>
              <span className="font-bold text-white text-sm">
                {formatDuration(heater.totalBatchRuntimeMs)}
              </span>
            </div>
            <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block">{t.cycles}</span>
              <span className="font-bold text-white text-sm">{heater.cycleCount}</span>
            </div>
            <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block">{t.avgCycle}</span>
              <span className="font-bold text-white text-sm">
                {formatDuration(heater.averageCycleDurationMs)}
              </span>
            </div>
          </div>
        </div>

        {/* Cooler Panel */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${cooler.isActive ? 'bg-cyan-500/20 text-cyan-400 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
                <Snowflake className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  {t.coolerStatus}
                  {status?.independentActuatorsAvailable && (
                    <span className="text-[10px] text-slate-400 font-normal border border-slate-700 px-1.5 py-0.5 rounded">
                      asdafe ic
                    </span>
                  )}
                </h4>
                <span className="text-xs text-slate-400">Cooling Actuator Runtime</span>
              </div>
            </div>

            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              cooler.isActive
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {cooler.isActive ? 'COOLING ACTIVE' : 'OFF'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block">{t.currentCycle}</span>
              <span className="font-bold text-white text-sm">
                {cooler.isActive ? formatDuration(cooler.currentCycleDurationMs) : '--'}
              </span>
            </div>
            <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block">{t.totalRuntime}</span>
              <span className="font-bold text-white text-sm">
                {formatDuration(cooler.totalBatchRuntimeMs)}
              </span>
            </div>
            <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block">{t.cycles}</span>
              <span className="font-bold text-white text-sm">{cooler.cycleCount}</span>
            </div>
            <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block">{t.avgCycle}</span>
              <span className="font-bold text-white text-sm">
                {formatDuration(cooler.averageCycleDurationMs)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* System Health (Heap Memory & Filesystem) */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h4 className="text-sm font-bold text-white">{t.systemHealth}</h4>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Polled via /fs
            </span>
            {onPollFsNow && (
              <button
                onClick={onPollFsNow}
                disabled={isPollingFs}
                className="px-2.5 py-1 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                title={t.pollFsNow}
              >
                <RefreshCw className={`w-3 h-3 ${isPollingFs ? 'animate-spin' : ''}`} />
                <span>{isPollingFs ? (lang === 'tr' ? 'Sorgulanıyor...' : 'Polling...') : (lang === 'tr' ? 'FS Şimdi Sorgula' : 'Poll /fs Now')}</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          {/* Free Heap */}
          <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-1">{t.freeHeap}</span>
            <span className="text-xl font-bold text-white">
              {fs?.freeHeap !== null && fs?.freeHeap !== undefined ? `${(fs.freeHeap / 1024).toFixed(1)} KB` : t.unsupported}
            </span>
            <div className="space-y-0.5 mt-1.5 text-[11px] text-slate-400">
              {fs?.minFreeHeap !== null && fs?.minFreeHeap !== undefined && (
                <div>Min: {(fs.minFreeHeap / 1024).toFixed(1)} KB</div>
              )}
              {fs?.largestFreeBlock !== null && fs?.largestFreeBlock !== undefined && (
                <div>Largest Block: {(fs.largestFreeBlock / 1024).toFixed(1)} KB</div>
              )}
              {fs?.freeBlocks !== null && fs?.freeBlocks !== undefined && (
                <div>Blocks: {fs.freeBlocks} free / {fs.allocatedBlocks ?? '--'} alloc</div>
              )}
            </div>
          </div>

          {/* Heap Trend / Possible Leak */}
          <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-1">{t.heapTrend}</span>
            {fs?.possibleMemoryLeak ? (
              <div className="flex items-center gap-1.5 text-rose-400 font-bold">
                <TrendingDown className="w-4 h-4 text-rose-500" />
                <span>{t.possibleLeak}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span>{t.stableHeap}</span>
              </div>
            )}
            <span className="text-[11px] text-slate-400 block mt-1">
              Rate: {fs?.heapDeclineRateKbPerHour !== null && fs?.heapDeclineRateKbPerHour !== undefined ? `${fs.heapDeclineRateKbPerHour} KB/hr` : 'Calculating baseline...'}
            </span>
          </div>

          {/* Filesystem Capacity */}
          <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-800 md:col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-400">{t.filesystem}</span>
              <span className={`font-bold ${
                fs?.fsStatus === 'CRITICAL' ? 'text-rose-400' : (fs?.fsStatus === 'WARNING' ? 'text-amber-400' : 'text-slate-200')
              }`}>
                {fs?.fsUsedPercent !== null && fs?.fsUsedPercent !== undefined ? `${fs.fsUsedPercent}% used` : t.unsupported}
              </span>
            </div>

            {fs?.fsUsedPercent !== null && fs?.fsUsedPercent !== undefined ? (
              <>
                <div className="w-full bg-slate-700/60 rounded-full h-2 overflow-hidden my-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      fs.fsStatus === 'CRITICAL' ? 'bg-rose-500' : (fs.fsStatus === 'WARNING' ? 'bg-amber-500' : 'bg-indigo-500')
                    }`}
                    style={{ width: `${Math.min(100, fs.fsUsedPercent)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                  <span>{t.fsUsed}: {((fs.usedBytes || 0) / 1024).toFixed(0)} KB</span>
                  <span>{t.fsFree}: {((fs.freeBytes || 0) / 1024).toFixed(0)} KB</span>
                  {fs.totalBytes && (
                    <span>Total: {((fs.totalBytes || 0) / 1024).toFixed(0)} KB</span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500 mt-1">
                Firmware does not expose flash filesystem metrics.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Diagnostic Error Counters */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-cyan-400" />
            {t.errorCounters}
          </h4>

          {onResetCounters && (
            <div className="flex items-center gap-2">
              {!isConfirmingReset ? (
                <button
                  onClick={() => setIsConfirmingReset(true)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                    Object.values(counters).some((count) => count > 0)
                      ? 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border-rose-500/30'
                      : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border-slate-700/60 hover:bg-slate-800'
                  }`}
                  title={t.resetCounters}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t.resetCounters}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-rose-950/80 border border-rose-600/70 rounded-lg p-1">
                  <span className="text-[11px] text-rose-200 font-medium px-1">
                    {lang === 'tr' ? 'Sıfırlansın mı?' : 'Reset?'}
                  </span>
                  <button
                    onClick={() => {
                      onResetCounters();
                      setIsConfirmingReset(false);
                    }}
                    className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-bold transition cursor-pointer"
                  >
                    {lang === 'tr' ? 'Evet' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setIsConfirmingReset(false)}
                    className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold transition cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 text-center">
            <span className="text-slate-400 block text-[11px] truncate">{t.netErrors}</span>
            <span className={`text-base font-bold ${counters.networkErrors > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {counters.networkErrors}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 text-center">
            <span className="text-slate-400 block text-[11px] truncate">{t.jsonErrors}</span>
            <span className={`text-base font-bold ${counters.jsonErrors > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {counters.jsonErrors}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 text-center">
            <span className="text-slate-400 block text-[11px] truncate">{t.sensorTransients}</span>
            <span className="text-base font-bold text-amber-400">
              {counters.sensorTransientErrors}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 text-center">
            <span className="text-slate-400 block text-[11px] truncate">{t.sensorAlarms}</span>
            <span className={`text-base font-bold ${counters.sensorAlarms > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {counters.sensorAlarms}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 text-center">
            <span className="text-slate-400 block text-[11px] truncate">{t.tempAlarms}</span>
            <span className={`text-base font-bold ${counters.temperatureAlarms > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {counters.temperatureAlarms}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 text-center">
            <span className="text-slate-400 block text-[11px] truncate">{t.heapWarnings}</span>
            <span className="text-base font-bold text-slate-200">
              {counters.heapWarnings}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 text-center">
            <span className="text-slate-400 block text-[11px] truncate">{t.fsWarnings}</span>
            <span className="text-base font-bold text-slate-200">
              {counters.fsWarnings}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 text-center">
            <span className="text-slate-400 block text-[11px] truncate">{t.leakWarnings}</span>
            <span className={`text-base font-bold ${counters.possibleLeakWarnings > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {counters.possibleLeakWarnings}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
