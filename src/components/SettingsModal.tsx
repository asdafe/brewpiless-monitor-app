import React, { useState } from 'react';
import {
  Bell,
  Clock,
  Cpu,
  HardDrive,
  Info,
  RotateCcw,
  Save,
  Server,
  Sliders,
  Thermometer,
  Volume2,
  X,
  Zap
} from 'lucide-react';
import { AppSettings, TemperatureRuleConfig } from '../types/brewpi';
import { DEFAULT_SETTINGS } from '../services/StorageService';
import { NotificationService } from '../services/NotificationService';
import { translations } from '../i18n/translations';

interface SettingsModalProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  onClose: () => void;
  lang: 'en' | 'tr';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onSave,
  onClose,
  lang
}) => {
  const t = translations[lang];
  const [formData, setFormData] = useState<AppSettings>({ ...settings });
  const [activeTab, setActiveTab] = useState<'network' | 'beer' | 'fridge' | 'room' | 'system'>('network');

  const handleTestAlert = () => {
    NotificationService.playAlertSound('warning');
    NotificationService.notify({
      id: `test_${Date.now()}`,
      batchId: null,
      phoneTimestamp: Date.now(),
      espTimestamp: null,
      eventType: 'TEMP_UPPER_DEVIATION',
      severity: 'warning',
      ruleDescription: 'Test Alert Notification',
      message: 'This is a test notification verifying sound and visual alerts.',
      isResolved: false
    }, 'channel_temperature_alarm');
  };

  const handleSave = () => {
    const sanitized: AppSettings = {
      ...formData,
      pollingIntervalSeconds: Number(formData.pollingIntervalSeconds) || 60,
      interRequestDelayMs: Number(formData.interRequestDelayMs) || 1000,
      requestTimeoutMs: Number(formData.requestTimeoutMs) || 5000,
      consecutiveFailuresThreshold: Number(formData.consecutiveFailuresThreshold) || 3,
      beerRules: {
        ...formData.beerRules,
        upperDeviation: isNaN(Number(formData.beerRules.upperDeviation)) ? 1.5 : Number(formData.beerRules.upperDeviation),
        lowerDeviation: isNaN(Number(formData.beerRules.lowerDeviation)) ? 1.5 : Number(formData.beerRules.lowerDeviation),
        absoluteMin: isNaN(Number(formData.beerRules.absoluteMin)) ? 0.0 : Number(formData.beerRules.absoluteMin),
        absoluteMax: isNaN(Number(formData.beerRules.absoluteMax)) ? 35.0 : Number(formData.beerRules.absoluteMax),
        abnormalDurationMinutes: Number(formData.beerRules.abnormalDurationMinutes) || 0,
        recoveryHysteresis: isNaN(Number(formData.beerRules.recoveryHysteresis)) ? 0.5 : Number(formData.beerRules.recoveryHysteresis),
        repeatIntervalMinutes: Number(formData.beerRules.repeatIntervalMinutes) || 30
      },
      fridgeRules: {
        ...formData.fridgeRules,
        upperDeviation: isNaN(Number(formData.fridgeRules.upperDeviation)) ? 2.0 : Number(formData.fridgeRules.upperDeviation),
        lowerDeviation: isNaN(Number(formData.fridgeRules.lowerDeviation)) ? 2.0 : Number(formData.fridgeRules.lowerDeviation),
        absoluteMin: isNaN(Number(formData.fridgeRules.absoluteMin)) ? -2.0 : Number(formData.fridgeRules.absoluteMin),
        absoluteMax: isNaN(Number(formData.fridgeRules.absoluteMax)) ? 40.0 : Number(formData.fridgeRules.absoluteMax),
        abnormalDurationMinutes: Number(formData.fridgeRules.abnormalDurationMinutes) || 0,
        recoveryHysteresis: isNaN(Number(formData.fridgeRules.recoveryHysteresis)) ? 0.5 : Number(formData.fridgeRules.recoveryHysteresis),
        repeatIntervalMinutes: Number(formData.fridgeRules.repeatIntervalMinutes) || 30
      },
      roomRules: {
        ...formData.roomRules,
        upperDeviation: isNaN(Number(formData.roomRules.upperDeviation)) ? 5.0 : Number(formData.roomRules.upperDeviation),
        lowerDeviation: isNaN(Number(formData.roomRules.lowerDeviation)) ? 5.0 : Number(formData.roomRules.lowerDeviation),
        absoluteMin: isNaN(Number(formData.roomRules.absoluteMin)) ? 5.0 : Number(formData.roomRules.absoluteMin),
        absoluteMax: isNaN(Number(formData.roomRules.absoluteMax)) ? 45.0 : Number(formData.roomRules.absoluteMax),
        abnormalDurationMinutes: Number(formData.roomRules.abnormalDurationMinutes) || 0,
        recoveryHysteresis: isNaN(Number(formData.roomRules.recoveryHysteresis)) ? 1.0 : Number(formData.roomRules.recoveryHysteresis),
        repeatIntervalMinutes: Number(formData.roomRules.repeatIntervalMinutes) || 60
      }
    };
    onSave(sanitized);
    onClose();
  };

  const handleReset = () => {
    setFormData({ ...DEFAULT_SETTINGS });
  };

  const updateRule = (sensorKey: 'beerRules' | 'fridgeRules' | 'roomRules', field: keyof TemperatureRuleConfig, val: any) => {
    setFormData(prev => ({
      ...prev,
      [sensorKey]: {
        ...prev[sensorKey],
        [field]: val
      }
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{t.settings}</h2>
              <p className="text-xs text-slate-400">BrewPiLess Connection & Alarms Configuration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex px-6 pt-3 border-b border-slate-800 gap-2 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab('network')}
            className={`pb-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'network' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Connection & Queue</span>
          </button>

          <button
            onClick={() => setActiveTab('beer')}
            className={`pb-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'beer' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Thermometer className="w-3.5 h-3.5" />
            <span>BeerTemp Rules</span>
          </button>

          <button
            onClick={() => setActiveTab('fridge')}
            className={`pb-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'fridge' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Thermometer className="w-3.5 h-3.5" />
            <span>FridgeTemp Rules</span>
          </button>

          <button
            onClick={() => setActiveTab('room')}
            className={`pb-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'room' ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Thermometer className="w-3.5 h-3.5" />
            <span>RoomTemp Rules</span>
          </button>

          <button
            onClick={() => setActiveTab('system')}
            className={`pb-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'system' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>System & Alarms</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-300">
          {activeTab === 'network' && (
            <div className="space-y-4">
              {/* Simulation Mode Toggle Card */}
              <div className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                formData.simulationMode
                  ? 'bg-purple-950/30 border-purple-700/80 text-purple-200'
                  : 'bg-slate-800/40 border-slate-700 text-slate-300'
              }`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">
                      {formData.simulationMode ? 'Simulation Mode Active (Mock)' : 'Live ESP32 Mode Active'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      formData.simulationMode ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}>
                      {formData.simulationMode ? 'SIM / MOCK' : 'LIVE ESP32'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {formData.simulationMode
                      ? 'Emulating fake sensor readings and faults without sending real network requests.'
                      : 'Connecting directly to real ESP32 BrewPiLess hardware via network.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, simulationMode: !formData.simulationMode })}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm self-start sm:self-center shrink-0 ${
                    formData.simulationMode
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-purple-600 hover:bg-purple-500 text-white'
                  }`}
                >
                  {formData.simulationMode ? t.disableSimulation : t.enableSimulation}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1 font-medium">{t.deviceAddress}</label>
                  <input
                    type="text"
                    value={formData.deviceHost}
                    onChange={(e) => setFormData({ ...formData, deviceHost: e.target.value.trim() })}
                    placeholder="e.g. orcunozden.duckdns.org or 192.168.1.50"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">{t.devicePort}</label>
                  <input
                    type="number"
                    value={formData.devicePort}
                    onChange={(e) => setFormData({ ...formData, devicePort: Number(e.target.value) || 80 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Inter-Request Delay Setting */}
              <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/80">
                <div className="flex items-center gap-2 text-amber-400 font-bold mb-1">
                  <Zap className="w-4 h-4" />
                  <span>{t.interRequestDelay} (ESP32 Concurrency Protection)</span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  Minimum idle time between any two HTTP calls to prevent crashing the ESP32 network stack.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[500, 1000, 2000, 5000].map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      onClick={() => setFormData({ ...formData, interRequestDelayMs: ms })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition ${
                        formData.interRequestDelayMs === ms
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {ms} ms {ms === 1000 && '(Default)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Firmware Variant Selector */}
              <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/80">
                <div className="flex items-center gap-2 text-indigo-400 font-bold mb-1">
                  <Cpu className="w-4 h-4" />
                  <span>{t.firmwareVariant} (BrewPiLess Flavor)</span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  {lang === 'tr'
                    ? 'Bağlanılan ESP32 cihazının firmware çatalı. asdafe fork; bağımsız ısıtıcı/soğutucu (ih/ic) kontrolleri, mod "i" ve gelişmiş bellek sorgularını tam destekler.'
                    : 'BrewPiLess firmware flavor running on ESP32. asdafe fork supports independent actuators (ih/ic), mode "i", and extended heap statistics.'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'asdafe_fork', label: 'asdafe fork (Önerilen)' },
                    { id: 'auto', label: 'Otomatik (Auto-Detect)' },
                    { id: 'original_vitotai', label: 'Original VitoTai' },
                  ].map((fw) => (
                    <button
                      key={fw.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, firmwareVariant: fw.id as any })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition text-center ${
                        (formData.firmwareVariant || 'asdafe_fork') === fw.id
                          ? 'bg-indigo-500/25 border-indigo-500 text-indigo-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {fw.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Polling Interval */}
              <div>
                <label className="block text-slate-400 mb-1 font-medium">{t.pollingInterval}</label>
                <select
                  value={formData.pollingIntervalSeconds}
                  onChange={(e) => setFormData({ ...formData, pollingIntervalSeconds: Number(e.target.value) })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value={60}>1 minute (Frequent - Recommended for active fermentation)</option>
                  <option value={120}>2 minutes</option>
                  <option value={300}>5 minutes (Balanced battery & responsiveness)</option>
                  <option value={600}>10 minutes</option>
                  <option value={900}>15 minutes (Standard WorkManager threshold)</option>
                  <option value={1800}>30 minutes</option>
                  <option value={3600}>60 minutes (Ultra battery-saving)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">{t.requestTimeout}</label>
                  <select
                    value={formData.requestTimeoutMs}
                    onChange={(e) => setFormData({ ...formData, requestTimeoutMs: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={3000}>3 seconds</option>
                    <option value={5000}>5 seconds (Default)</option>
                    <option value={10000}>10 seconds</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Consecutive Failures Before Offline Alarm</label>
                  <select
                    value={formData.consecutiveFailuresThreshold}
                    onChange={(e) => setFormData({ ...formData, consecutiveFailuresThreshold: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={1}>1 failure (Immediate - may cause false alarms)</option>
                    <option value={2}>2 failures</option>
                    <option value={3}>3 failures (Recommended Default)</option>
                    <option value={5}>5 failures</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Beer Rules */}
          {activeTab === 'beer' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-white font-bold text-sm">Enable BeerTemp Rules</span>
                <input
                  type="checkbox"
                  checked={formData.beerRules.enabled}
                  onChange={(e) => updateRule('beerRules', 'enabled', e.target.checked)}
                  className="w-4 h-4 text-amber-500 rounded bg-slate-800 border-slate-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">{t.upperDeviation}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.beerRules.upperDeviation}
                    onChange={(e) => updateRule('beerRules', 'upperDeviation', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.lowerDeviation}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.beerRules.lowerDeviation}
                    onChange={(e) => updateRule('beerRules', 'lowerDeviation', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Absolute Minimum (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.beerRules.absoluteMin}
                    onChange={(e) => updateRule('beerRules', 'absoluteMin', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Absolute Maximum (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.beerRules.absoluteMax}
                    onChange={(e) => updateRule('beerRules', 'absoluteMax', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">{t.abnormalDuration} (mins)</label>
                  <input
                    type="number"
                    value={formData.beerRules.abnormalDurationMinutes}
                    onChange={(e) => updateRule('beerRules', 'abnormalDurationMinutes', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.recoveryHysteresis} (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.beerRules.recoveryHysteresis}
                    onChange={(e) => updateRule('beerRules', 'recoveryHysteresis', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.repeatInterval} (mins)</label>
                  <input
                    type="number"
                    value={formData.beerRules.repeatIntervalMinutes}
                    onChange={(e) => updateRule('beerRules', 'repeatIntervalMinutes', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Fridge Rules */}
          {activeTab === 'fridge' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-white font-bold text-sm">Enable FridgeTemp Rules</span>
                <input
                  type="checkbox"
                  checked={formData.fridgeRules.enabled}
                  onChange={(e) => updateRule('fridgeRules', 'enabled', e.target.checked)}
                  className="w-4 h-4 text-cyan-500 rounded bg-slate-800 border-slate-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">{t.upperDeviation}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.fridgeRules.upperDeviation}
                    onChange={(e) => updateRule('fridgeRules', 'upperDeviation', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.lowerDeviation}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.fridgeRules.lowerDeviation}
                    onChange={(e) => updateRule('fridgeRules', 'lowerDeviation', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Absolute Minimum (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.fridgeRules.absoluteMin}
                    onChange={(e) => updateRule('fridgeRules', 'absoluteMin', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Absolute Maximum (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.fridgeRules.absoluteMax}
                    onChange={(e) => updateRule('fridgeRules', 'absoluteMax', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">{t.abnormalDuration} (mins)</label>
                  <input
                    type="number"
                    value={formData.fridgeRules.abnormalDurationMinutes}
                    onChange={(e) => updateRule('fridgeRules', 'abnormalDurationMinutes', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.recoveryHysteresis} (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.fridgeRules.recoveryHysteresis}
                    onChange={(e) => updateRule('fridgeRules', 'recoveryHysteresis', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.repeatInterval} (mins)</label>
                  <input
                    type="number"
                    value={formData.fridgeRules.repeatIntervalMinutes}
                    onChange={(e) => updateRule('fridgeRules', 'repeatIntervalMinutes', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Room Rules */}
          {activeTab === 'room' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-white font-bold text-sm">Enable RoomTemp Rules</span>
                <input
                  type="checkbox"
                  checked={formData.roomRules.enabled}
                  onChange={(e) => updateRule('roomRules', 'enabled', e.target.checked)}
                  className="w-4 h-4 text-purple-500 rounded bg-slate-800 border-slate-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Absolute Minimum (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.roomRules.absoluteMin}
                    onChange={(e) => updateRule('roomRules', 'absoluteMin', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Absolute Maximum (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.roomRules.absoluteMax}
                    onChange={(e) => updateRule('roomRules', 'absoluteMax', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* System & Anomaly Rules */}
          {activeTab === 'system' && (
            <div className="space-y-5">
              {/* Stale sensor */}
              <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-xs">{t.staleDetection}</span>
                  <input
                    type="checkbox"
                    checked={formData.staleRules.enabled}
                    onChange={(e) => setFormData({
                      ...formData,
                      staleRules: { ...formData.staleRules, enabled: e.target.checked }
                    })}
                    className="w-4 h-4 text-indigo-500 rounded bg-slate-800 border-slate-700"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mb-2">
                  Warns if temperature reading stays identical while cooling or heating is actively engaged.
                </p>
                <div className="flex items-center gap-3">
                  <label className="text-[11px] text-slate-400">Duration (mins):</label>
                  <input
                    type="number"
                    value={formData.staleRules.maxSameValueMinutes}
                    onChange={(e) => setFormData({
                      ...formData,
                      staleRules: { ...formData.staleRules, maxSameValueMinutes: Number(e.target.value) }
                    })}
                    className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                  />
                </div>
              </div>

              {/* Sudden Change */}
              <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-xs">{t.suddenChangeDetection}</span>
                  <input
                    type="checkbox"
                    checked={formData.suddenChangeRules.enabled}
                    onChange={(e) => setFormData({
                      ...formData,
                      suddenChangeRules: { ...formData.suddenChangeRules, enabled: e.target.checked }
                    })}
                    className="w-4 h-4 text-indigo-500 rounded bg-slate-800 border-slate-700"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-[11px] text-slate-400">Max rate (°C/min):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.suddenChangeRules.maxDegreesPerMinute}
                    onChange={(e) => setFormData({
                      ...formData,
                      suddenChangeRules: { ...formData.suddenChangeRules, maxDegreesPerMinute: Number(e.target.value) }
                    })}
                    className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                  />
                </div>
              </div>

              {/* Notifications & Sound */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
                <div>
                  <span className="font-bold text-white text-xs block">Audio Chimes & Notification Test</span>
                  <span className="text-[11px] text-slate-400">Plays synthesized web audio alerts on critical alarm events.</span>
                </div>
                <button
                  type="button"
                  onClick={handleTestAlert}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t.testNotification}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/60">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-slate-400 hover:text-white rounded-lg text-xs font-semibold transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.resetSettings}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white rounded-lg text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t.saveSettings}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
