import React from 'react';
import { FlaskConical, Play, Power, Radio, ShieldCheck } from 'lucide-react';
import { SimulationScenario, SimulationEngine } from '../services/SimulationEngine';
import { translations } from '../i18n/translations';

interface SimulationBarProps {
  currentScenario: SimulationScenario;
  onSelectScenario: (scenario: SimulationScenario) => void;
  lang: 'en' | 'tr';
  onTriggerNow: () => void;
  isSimMode: boolean;
  onToggleSimMode: (enabled: boolean) => void;
}

export const SimulationBar: React.FC<SimulationBarProps> = ({
  currentScenario,
  onSelectScenario,
  lang,
  onTriggerNow,
  isSimMode,
  onToggleSimMode
}) => {
  const t = translations[lang];

  const scenarios: { id: SimulationScenario; label: string; desc: string }[] = [
    { id: 'HEALTHY', label: 'Healthy Fermentation', desc: 'Beer 12.1°C, Fridge 3.2°C, Room 22.4°C' },
    { id: 'BEER_NULL', label: 'BeerTemp is NULL (Probe Missing)', desc: 'Tests 2x retries then Beer Sensor Alarm' },
    { id: 'FRIDGE_NULL', label: 'FridgeTemp is NULL', desc: 'Tests Fridge Sensor Alarm' },
    { id: 'ROOM_NULL', label: 'RoomTemp is NULL', desc: 'Tests Room Sensor Alarm' },
    { id: 'TIMEOUT', label: 'ESP32 Connection Timeout', desc: 'Tests 3x consecutive failure detection' },
    { id: 'INVALID_JSON', label: 'Invalid / Malformed JSON', desc: 'Tests parser tolerance' },
    { id: 'BEER_HIGH', label: 'Beer High Deviation (+3.6°C)', desc: 'Beer 15.6°C vs Set 12.0°C' },
    { id: 'BEER_LOW', label: 'Beer Low Deviation (-3.2°C)', desc: 'Beer 8.8°C vs Set 12.0°C' },
    { id: 'FRIDGE_HIGH', label: 'Fridge High (+5.5°C)', desc: 'Fridge 8.5°C vs Set 3.0°C' },
    { id: 'FRIDGE_LOW', label: 'Fridge Low (-3.8°C)', desc: 'Freezing hazard condition' },
    { id: 'FROZEN_TEMP', label: 'Frozen / Stale Temperature', desc: 'Temp unchanged while cooling is ON' },
    { id: 'SUDDEN_JUMP', label: 'Sudden Jump (+5.4°C / min)', desc: 'Tests rate-of-change anomaly detector' },
    { id: 'HEAP_DECLINING_TREND', label: 'Sustained Heap Decline', desc: 'Simulates possible memory leak over time' },
    { id: 'HEAP_DROP', label: 'Severe Heap Drop (< 50KB)', desc: 'Tests low free memory warning' },
    { id: 'FS_FULL', label: 'Flash Filesystem 94% Full', desc: 'Tests critical storage warning' },
    { id: 'HEATER_ON', label: 'Heater ON (ih=1)', desc: 'Tests heating actuator timer' },
    { id: 'COOLER_ON', label: 'Cooler ON (ic=1)', desc: 'Tests cooling actuator timer' },
    { id: 'HEATER_AND_COOLER_ON', label: 'Heater + Cooler ON Simultaneously', desc: 'asdafe fork valid state (no fault)' },
    { id: 'RECOVERY', label: 'Normal Recovery State', desc: 'Restores target 12.0°C and tests hysteresis' }
  ];

  if (!isSimMode) {
    return (
      <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-2xl p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-2">
              {t.liveEspActive}
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                LIVE HARDWARE
              </span>
            </h4>
            <p className="text-[11px] text-slate-400">
              {t.simModeDesc}
            </p>
          </div>
        </div>

        <button
          onClick={() => onToggleSimMode(true)}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-950/80 hover:bg-purple-900/80 text-purple-300 border border-purple-800/60 transition shadow-sm self-start sm:self-center"
        >
          <FlaskConical className="w-3.5 h-3.5 text-purple-400" />
          <span>{t.enableSimulation}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-purple-950/40 border border-purple-800/60 rounded-2xl p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">
                {t.simulationMode}
              </h4>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30">
                ON
              </span>
            </div>
            <p className="text-xs text-purple-200/80">
              {t.simActive}: <span className="font-semibold text-white">{currentScenario}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={currentScenario}
            onChange={(e) => onSelectScenario(e.target.value as SimulationScenario)}
            className="bg-slate-900 border border-purple-700/80 text-white rounded-lg text-xs px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          <button
            onClick={onTriggerNow}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition shadow-sm"
            title="Execute poll cycle with selected scenario"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Apply</span>
          </button>

          {/* Explicit Turn OFF Simulation Mode button */}
          <button
            onClick={() => onToggleSimMode(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 transition shadow-sm"
            title="Switch back to real live ESP32"
          >
            <Power className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t.disableSimulation}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
