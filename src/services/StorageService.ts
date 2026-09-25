/**
 * StorageService.ts
 *
 * Local persistence management for:
 * - App settings
 * - Active & past fermentation batches
 * - Measurement records
 * - Alert history
 * - Diagnostic error counters
 */

import {
  AppSettings,
  Batch,
  MeasurementPoint,
  AlertEvent,
  ErrorCounters
} from '../types/brewpi';

const STORAGE_KEYS = {
  SETTINGS: 'brewpi_settings_v1',
  BATCHES: 'brewpi_batches_v1',
  ACTIVE_BATCH_ID: 'brewpi_active_batch_id_v1',
  MEASUREMENTS: 'brewpi_measurements_v1',
  ALERTS: 'brewpi_alerts_v1',
  ERROR_COUNTERS: 'brewpi_error_counters_v1'
};

export const DEFAULT_SETTINGS: AppSettings = {
  deviceHost: 'orcunozden.duckdns.org',
  devicePort: 27141,
  useHttps: false,
  firmwareVariant: 'asdafe_fork',
  pollingIntervalSeconds: 60,
  interRequestDelayMs: 1000,
  requestTimeoutMs: 5000,
  consecutiveFailuresThreshold: 3,
  fsPollIntervalMinutes: 5,
  timeSyncIntervalMinutes: 10,
  sendRecoveryNotifications: true,
  enableSoundAlerts: true,
  fsWarningThresholdPercent: 80,
  fsCriticalThresholdPercent: 90,
  heapDeclineThresholdKbPerHour: 1.5,
  heapDeclineMinDurationMinutes: 30,
  beerRules: {
    sensor: 'beer',
    enabled: true,
    upperDeviation: 1.5,
    lowerDeviation: 1.5,
    absoluteMin: 0.0,
    absoluteMax: 35.0,
    abnormalDurationMinutes: 10,
    recoveryHysteresis: 0.5,
    repeatIntervalMinutes: 30
  },
  fridgeRules: {
    sensor: 'fridge',
    enabled: true,
    upperDeviation: 2.0,
    lowerDeviation: 2.0,
    absoluteMin: -2.0,
    absoluteMax: 40.0,
    abnormalDurationMinutes: 5,
    recoveryHysteresis: 0.5,
    repeatIntervalMinutes: 30
  },
  roomRules: {
    sensor: 'room',
    enabled: true,
    upperDeviation: 5.0,
    lowerDeviation: 5.0,
    absoluteMin: 5.0,
    absoluteMax: 45.0,
    abnormalDurationMinutes: 15,
    recoveryHysteresis: 1.0,
    repeatIntervalMinutes: 60
  },
  staleRules: {
    enabled: false,
    maxSameValueMinutes: 30,
    requireActuatorActive: true
  },
  suddenChangeRules: {
    enabled: true,
    maxDegreesPerMinute: 1.0,
    minSampleCount: 3
  },
  monitoringScheduleEnabled: false,
  monitoringScheduleStart: '00:00',
  monitoringScheduleEnd: '23:59',
  language: 'en',
  simulationMode: false
};

export const INITIAL_ERROR_COUNTERS: ErrorCounters = {
  networkErrors: 0,
  jsonErrors: 0,
  sensorTransientErrors: 0,
  sensorAlarms: 0,
  temperatureAlarms: 0,
  heapWarnings: 0,
  fsWarnings: 0,
  possibleLeakWarnings: 0
};

export class StorageService {
  public static getSettings(): AppSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!stored) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        beerRules: { ...DEFAULT_SETTINGS.beerRules, ...(parsed.beerRules || {}) },
        fridgeRules: { ...DEFAULT_SETTINGS.fridgeRules, ...(parsed.fridgeRules || {}) },
        roomRules: { ...DEFAULT_SETTINGS.roomRules, ...(parsed.roomRules || {}) },
        staleRules: { ...DEFAULT_SETTINGS.staleRules, ...(parsed.staleRules || {}) },
        suddenChangeRules: { ...DEFAULT_SETTINGS.suddenChangeRules, ...(parsed.suddenChangeRules || {}) }
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  public static saveSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings to localStorage', e);
    }
  }

  public static getBatches(): Batch[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.BATCHES);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  public static saveBatches(batches: Batch[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(batches));
    } catch (e) {
      console.error('Failed to save batches', e);
    }
  }

  public static getActiveBatch(): Batch | null {
    const batches = this.getBatches();
    const activeId = localStorage.getItem(STORAGE_KEYS.ACTIVE_BATCH_ID);
    if (!activeId) {
      return batches.find(b => b.isActive) || null;
    }
    return batches.find(b => b.id === activeId) || null;
  }

  public static startNewBatch(name: string, beerStyle: string, notes: string): Batch {
    const batches = this.getBatches();
    // Mark previous active batches as inactive
    const updated: Batch[] = batches.map(b => ({ ...b, isActive: false, endedAt: b.endedAt ?? Date.now() }));
    
    const newBatch: Batch = {
      id: `batch_${Date.now()}`,
      name: name.trim() || `Fermentation Batch ${batches.length + 1}`,
      beerStyle: beerStyle.trim() || 'Ale / Lager',
      notes: notes.trim(),
      startedAt: Date.now(),
      endedAt: null,
      isActive: true,
      settingsSnapshot: this.getSettings(),
      heaterTotalRuntimeMs: 0,
      coolerTotalRuntimeMs: 0,
      heaterCycleCount: 0,
      coolerCycleCount: 0
    };

    updated.unshift(newBatch);
    this.saveBatches(updated);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_BATCH_ID, newBatch.id);
    return newBatch;
  }

  public static updateBatch(batch: Batch): void {
    const batches = this.getBatches();
    const index = batches.findIndex(b => b.id === batch.id);
    if (index >= 0) {
      batches[index] = batch;
      this.saveBatches(batches);
    }
  }

  public static endActiveBatch(): void {
    const active = this.getActiveBatch();
    if (active) {
      active.isActive = false;
      active.endedAt = Date.now();
      this.updateBatch(active);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_BATCH_ID);
    }
  }

  public static getMeasurements(batchId?: string): MeasurementPoint[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.MEASUREMENTS);
      const all: MeasurementPoint[] = stored ? JSON.parse(stored) : [];
      if (batchId) {
        return all.filter(m => m.batchId === batchId);
      }
      return all;
    } catch {
      return [];
    }
  }

  public static saveMeasurement(point: MeasurementPoint): void {
    try {
      const measurements = this.getMeasurements();
      // Keep up to 2000 points in local storage to prevent quota overflow
      measurements.push(point);
      if (measurements.length > 2000) {
        measurements.shift();
      }
      localStorage.setItem(STORAGE_KEYS.MEASUREMENTS, JSON.stringify(measurements));
    } catch (e) {
      console.warn('Measurement storage limit reached', e);
    }
  }

  public static getAlerts(): AlertEvent[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ALERTS);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  public static saveAlert(alert: AlertEvent): void {
    try {
      const alerts = this.getAlerts();
      alerts.unshift(alert);
      // Keep last 200 alerts
      if (alerts.length > 200) alerts.pop();
      localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(alerts));
    } catch (e) {
      console.error('Failed to save alert', e);
    }
  }

  public static saveAlerts(alerts: AlertEvent[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(alerts));
    } catch (e) {
      console.error('Failed to save alerts', e);
    }
  }

  public static clearAlerts(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.ALERTS);
    } catch (e) {
      console.error('Failed to clear alerts', e);
    }
  }

  public static updateAlert(alert: AlertEvent): void {
    const alerts = this.getAlerts();
    const index = alerts.findIndex(a => a.id === alert.id);
    if (index >= 0) {
      alerts[index] = alert;
      localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(alerts));
    }
  }

  public static getErrorCounters(): ErrorCounters {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ERROR_COUNTERS);
      return stored ? { ...INITIAL_ERROR_COUNTERS, ...JSON.parse(stored) } : { ...INITIAL_ERROR_COUNTERS };
    } catch {
      return { ...INITIAL_ERROR_COUNTERS };
    }
  }

  public static incrementErrorCounter(counterKey: keyof ErrorCounters, by: number = 1): ErrorCounters {
    const counters = this.getErrorCounters();
    counters[counterKey] = (counters[counterKey] || 0) + by;
    try {
      localStorage.setItem(STORAGE_KEYS.ERROR_COUNTERS, JSON.stringify(counters));
    } catch (e) {
      console.error('Failed to save error counters', e);
    }
    return counters;
  }

  public static resetErrorCounters(): ErrorCounters {
    const reset = { ...INITIAL_ERROR_COUNTERS };
    try {
      localStorage.setItem(STORAGE_KEYS.ERROR_COUNTERS, JSON.stringify(reset));
    } catch (e) {
      console.error('Failed to reset error counters', e);
    }
    return reset;
  }
}
