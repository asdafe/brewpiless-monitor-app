import React, { useState } from 'react';
import {
  CheckCircle2,
  Play,
  RotateCcw,
  ShieldCheck,
  TestTube2,
  X,
  XCircle
} from 'lucide-react';
import { AutomatedTestSuite, TestResult } from '../tests/testSuite';

interface TestRunnerModalProps {
  onClose: () => void;
  lang: 'en' | 'tr';
}

export const TestRunnerModal: React.FC<TestRunnerModalProps> = ({ onClose, lang }) => {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  const handleRunTests = async () => {
    setIsRunning(true);
    setResults([]);
    try {
      const finalResults = await AutomatedTestSuite.runAllTests((res, index, total) => {
        setResults((prev) => [...prev, res]);
        setProgress({ current: index, total });
      });
      setResults(finalResults);
    } finally {
      setIsRunning(false);
    }
  };

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <TestTube2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Automated Verification Test Suite</h2>
              <p className="text-xs text-slate-400">
                End-to-end unit and safety assertions (Concurrency, Inter-Request Delay, Hysteresis, Heap)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs">
            {results.length > 0 && (
              <>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {passedCount} Passed
                </span>
                {failedCount > 0 && (
                  <span className="text-rose-400 font-bold flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    {failedCount} Failed
                  </span>
                )}
                {isRunning && (
                  <span className="text-slate-400">
                    Running test {progress.current} of {progress.total}...
                  </span>
                )}
              </>
            )}
            {results.length === 0 && !isRunning && (
              <span className="text-slate-400">Press &quot;Run Test Suite&quot; to execute all 16 test cases.</span>
            )}
          </div>

          <button
            onClick={handleRunTests}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Test Suite</span>
              </>
            )}
          </button>
        </div>

        {/* Results List */}
        <div className="p-6 overflow-y-auto space-y-2.5 flex-1 text-xs">
          {results.length === 0 && !isRunning ? (
            <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl">
              <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-300 font-semibold mb-1">Zero-Failure Verification</p>
              <p className="text-slate-500 text-[11px] max-w-sm mx-auto">
                Executes all concurrency, parser tolerance, null retry, state machine and rate-of-change assertions.
              </p>
            </div>
          ) : (
            results.map((res, i) => (
              <div
                key={i}
                className={`p-3.5 rounded-xl border flex flex-col gap-1 transition ${
                  res.passed
                    ? 'bg-emerald-950/15 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-950/20 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {res.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="font-bold text-white text-xs">{res.name}</span>
                    <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                      {res.category}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">{res.durationMs}ms</span>
                </div>
                <p className="text-[11px] text-slate-300 pl-6">{res.message}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
