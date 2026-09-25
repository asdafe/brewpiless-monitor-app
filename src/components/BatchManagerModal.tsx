import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Plus,
  X
} from 'lucide-react';
import { Batch } from '../types/brewpi';
import { StorageService } from '../services/StorageService';
import { translations } from '../i18n/translations';

interface BatchManagerModalProps {
  onClose: () => void;
  lang: 'en' | 'tr';
  onBatchUpdated: () => void;
}

export const BatchManagerModal: React.FC<BatchManagerModalProps> = ({
  onClose,
  lang,
  onBatchUpdated
}) => {
  const t = translations[lang];
  const [batches, setBatches] = useState<Batch[]>(StorageService.getBatches());
  const [isCreating, setIsCreating] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [beerStyle, setBeerStyle] = useState('');
  const [notes, setNotes] = useState('');

  const activeBatch = batches.find((b) => b.isActive);

  const handleStartBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchName.trim()) return;

    StorageService.startNewBatch(batchName, beerStyle, notes);
    setBatches(StorageService.getBatches());
    setIsCreating(false);
    setBatchName('');
    setBeerStyle('');
    setNotes('');
    onBatchUpdated();
  };

  const handleEndBatch = () => {
    StorageService.endActiveBatch();
    setBatches(StorageService.getBatches());
    onBatchUpdated();
  };

  const handleExportCsv = (batch: Batch) => {
    const measurements = StorageService.getMeasurements(batch.id);
    if (measurements.length === 0) {
      alert('No measurements recorded for this batch yet.');
      return;
    }

    const headers = [
      'PhoneTime',
      'EspTime',
      'BeerTemp',
      'FridgeTemp',
      'RoomTemp',
      'BeerSet',
      'FridgeSet',
      'Mode',
      'State',
      'HeaterActive',
      'CoolerActive'
    ];

    const rows = measurements.map((m) => [
      new Date(m.phoneTimestamp).toISOString(),
      m.espTimestamp ? new Date(m.espTimestamp).toISOString() : 'estimated',
      m.beerTemp ?? '',
      m.fridgeTemp ?? '',
      m.roomTemp ?? '',
      m.beerSet ?? '',
      m.fridgeSet ?? '',
      m.mode,
      m.state,
      m.heaterActive ? '1' : '0',
      m.coolerActive ? '1' : '0'
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${batch.name.replace(/\s+/g, '_')}_measurements.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = (batch: Batch) => {
    const measurements = StorageService.getMeasurements(batch.id);
    const alerts = StorageService.getAlerts().filter((a) => a.batchId === batch.id);

    const exportData = {
      batch,
      measurements,
      alerts,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${batch.name.replace(/\s+/g, '_')}_full_session.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Fermentation Batches (Projects)</h2>
              <p className="text-xs text-slate-400">Isolated fermentation logging and data capture</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
          {/* Active Batch Summary Card */}
          {activeBatch ? (
            <div className="bg-amber-950/20 border border-amber-500/40 rounded-2xl p-4.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Active Fermentation Batch
                  </span>
                </div>
                <button
                  onClick={handleEndBatch}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-300 rounded border border-slate-700 text-[11px] font-semibold transition"
                >
                  End Active Batch
                </button>
              </div>

              <h3 className="text-lg font-bold text-white">{activeBatch.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Style: {activeBatch.beerStyle}</p>
              {activeBatch.notes && (
                <p className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 mt-2">
                  {activeBatch.notes}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 mt-3 pt-3 border-t border-amber-500/20">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-amber-400" />
                  Started: {new Date(activeBatch.startedAt).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  Logged points: {StorageService.getMeasurements(activeBatch.id).length}
                </span>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => handleExportCsv(activeBatch)}
                    className="flex items-center gap-1 text-[11px] text-cyan-400 hover:underline"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    CSV
                  </button>
                  <button
                    onClick={() => handleExportJson(activeBatch)}
                    className="flex items-center gap-1 text-[11px] text-purple-400 hover:underline"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    JSON
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl p-6 text-center">
              <FlaskConical className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-xs text-slate-400 mb-3">{t.noActiveBatch}</p>
              {!isCreating && (
                <button
                  onClick={() => setIsCreating(true)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md transition"
                >
                  {t.startNewBatch}
                </button>
              )}
            </div>
          )}

          {/* New Batch Creation Form */}
          {isCreating && (
            <form onSubmit={handleStartBatch} className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Create New Fermentation Batch
              </h4>

              <div>
                <label className="block text-slate-400 mb-1">Batch Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Batch #14 - West Coast IPA"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Beer Style</label>
                <input
                  type="text"
                  placeholder="e.g. American IPA, Munich Helles, Stout"
                  value={beerStyle}
                  onChange={(e) => setBeerStyle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Notes / Target Specific Gravity</label>
                <textarea
                  rows={2}
                  placeholder="Yeast strain, dry hop schedule, target gravity..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow transition"
                >
                  Start Batch
                </button>
              </div>
            </form>
          )}

          {/* Past Batches List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                All Fermentation Batches ({batches.length})
              </h4>
              {!isCreating && activeBatch && (
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:underline"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Batch</span>
                </button>
              )}
            </div>

            <div className="space-y-2">
              {batches.map((b) => (
                <div
                  key={b.id}
                  className="p-3 bg-slate-800/40 rounded-xl border border-slate-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{b.name}</span>
                      {b.isActive && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-semibold">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 text-[11px]">{b.beerStyle} • {new Date(b.startedAt).toLocaleDateString()}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleExportCsv(b)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium border border-slate-700 transition"
                      title="Download CSV"
                    >
                      CSV
                    </button>
                    <button
                      onClick={() => handleExportJson(b)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium border border-slate-700 transition"
                      title="Download JSON"
                    >
                      JSON
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
