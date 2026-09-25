/**
 * MonitoringEngine.ts
 *
 * The brain of BrewPiLess Monitor:
 * - Connection State Machine (HEALTHY, TEMPORARY_FAILURE, OFFLINE_ALERTED, RECOVERED)
 * - Sensor Null Retry Logic (2 sequential retries via request queue before alerting)
 * - Temperature Rules & Hysteresis
 * - Stale Sensor & Sudden Jump Detectors
 * - Heap Trend & Possible Memory Leak Detection
 * - Filesystem Monitor
 * - Actuator Runtime Tracking (Heater & Cooler independently)
 * - Measurement Logging & Alert Storage
 */

import {
  AppSettings,
  BrewPiStatus,
  SystemHealthStatus,
  ConnectionHealthState,
  AlertEvent,
  ActuatorMetrics,
  ErrorCounters,
  SensorType,
  TemperatureRuleConfig
} from '../types/brewpi';
import { BrewPiApiClient } from './BrewPiApiClient';
import { StorageService } from './StorageService';
import { NotificationService } from './NotificationService';

interface TempHistoryItem {
  timestamp: number;
  temp: number;
}

interface ActiveAlarmState {
  ruleKey: string;
  sensor: SensorType;
  type: string;
  firstDetectedAt: number;
  lastNotifiedAt: number;
  triggerValue: number;
}

interface HeapSample {
  timestamp: number;
  freeHeap: number;
}

export class MonitoringEngine {
  private apiClient: BrewPiApiClient;
  private settings: AppSettings;
  private isRunning: boolean = false;
  private pollTimerId: any = null;
  private fsTimerId: any = null;

  // Connection State Machine
  private connectionState: ConnectionHealthState = 'HEALTHY';
  private consecutiveFailures: number = 0;
  private lastSuccessfulPollTime: number | null = null;
  private nextExpectedPollTime: number | null = null;

  // Active alarms (tracking abnormal duration & hysteresis)
  private activeAlarms: Map<string, ActiveAlarmState> = new Map();

  // History buffers for anomaly detection
  private beerTempHistory: TempHistoryItem[] = [];
  private fridgeTempHistory: TempHistoryItem[] = [];
  private roomTempHistory: TempHistoryItem[] = [];
  private heapSamples: HeapSample[] = [];

  // Actuator runtimes
  private heaterMetrics: ActuatorMetrics = {
    isActive: false,
    currentCycleStartTime: null,
    currentCycleDurationMs: 0,
    totalBatchRuntimeMs: 0,
    cycleCount: 0,
    lastCycleDurationMs: 0,
    averageCycleDurationMs: 0,
    timeSincePreviousCycleMs: 0,
    lastStateChangeTimestamp: Date.now()
  };

  private coolerMetrics: ActuatorMetrics = {
    isActive: false,
    currentCycleStartTime: null,
    currentCycleDurationMs: 0,
    totalBatchRuntimeMs: 0,
    cycleCount: 0,
    lastCycleDurationMs: 0,
    averageCycleDurationMs: 0,
    timeSincePreviousCycleMs: 0,
    lastStateChangeTimestamp: Date.now()
  };

  // State listeners for UI updates
  private listeners: (() => void)[] = [];

  // Latest snapshot data
  public latestStatus: BrewPiStatus | null = null;
  public latestFs: SystemHealthStatus | null = null;

  constructor(apiClient: BrewPiApiClient, settings: AppSettings) {
    this.apiClient = apiClient;
    this.settings = settings;
  }

  public updateSettings(settings: AppSettings): void {
    this.settings = settings;
    this.apiClient.updateConfig(
      settings.deviceHost,
      settings.devicePort,
      settings.useHttps,
      settings.requestTimeoutMs,
      settings.simulationMode,
      settings.firmwareVariant || 'asdafe_fork'
    );

    // Update periodic /fs check timer if monitoring is running
    if (this.isRunning && this.fsTimerId) {
      clearInterval(this.fsTimerId);
      const fsIntervalMs = (this.settings.fsPollIntervalMinutes || 5) * 60 * 1000;
      this.fsTimerId = setInterval(() => {
        if (this.isRunning) {
          this.pollFilesystemAndHeap();
        }
      }, fsIntervalMs);
    }

    // Immediately re-evaluate temperature rules against latest status with new thresholds
    if (this.latestStatus) {
      this.evaluateTemperatureRules(this.latestStatus);
    }

    this.notify();
  }

  public getActiveAlarms(): Map<string, ActiveAlarmState> {
    return new Map(this.activeAlarms);
  }

  public clearActiveAlarms(): void {
    this.activeAlarms.clear();
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('Error in monitoring engine listener', err);
      }
    }
  }

  public getConnectionState(): ConnectionHealthState {
    return this.connectionState;
  }

  public getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  public getLastSuccessfulPoll(): number | null {
    return this.lastSuccessfulPollTime;
  }

  public getNextExpectedPoll(): number | null {
    return this.nextExpectedPollTime;
  }

  public getHeaterMetrics(): ActuatorMetrics {
    return { ...this.heaterMetrics };
  }

  public getCoolerMetrics(): ActuatorMetrics {
    return { ...this.coolerMetrics };
  }

  public isMonitoringActive(): boolean {
    return this.isRunning;
  }

  /**
   * Start periodic background monitoring
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNextPoll(0); // Poll immediately

    // Schedule periodic /fs check (every X minutes)
    const fsIntervalMs = (this.settings.fsPollIntervalMinutes || 5) * 60 * 1000;
    this.fsTimerId = setInterval(() => {
      if (this.isRunning) {
        this.pollFilesystemAndHeap();
      }
    }, fsIntervalMs);

    this.notify();
  }

  /**
   * Stop monitoring
   */
  public stop(): void {
    this.isRunning = false;
    if (this.pollTimerId) {
      clearTimeout(this.pollTimerId);
      this.pollTimerId = null;
    }
    if (this.fsTimerId) {
      clearInterval(this.fsTimerId);
      this.fsTimerId = null;
    }
    this.nextExpectedPollTime = null;
    this.notify();
  }

  private scheduleNextPoll(delayMs: number): void {
    if (!this.isRunning) return;
    this.nextExpectedPollTime = Date.now() + delayMs;
    this.notify();

    this.pollTimerId = setTimeout(async () => {
      await this.executePollCycle();
      if (this.isRunning) {
        const intervalMs = (this.settings.pollingIntervalSeconds || 60) * 1000;
        this.scheduleNextPoll(intervalMs);
      }
    }, delayMs);
  }

  /**
   * Single Poll Cycle for GET /getstatus
   */
  public async executePollCycle(): Promise<void> {
    try {
      let status = await this.apiClient.getStatus('HIGH');

      // Check if any sensor is null -> Run sequential retries before alarming
      if (status.beerTemp === null || status.fridgeTemp === null || status.roomTemp === null) {
        status = await this.handleSensorNullRetries(status);
      }

      // Success: process healthy response
      this.handleSuccessfulPoll(status);
    } catch (err: any) {
      this.handleFailedPoll(err);
    }
  }

  /**
   * Sensor Null Sequential Retries
   * If any sensor is null:
   * 1. Waits inter-request delay
   * 2. Retry #1
   * 3. Retry #2
   * If recovered -> logs transient note, increments counter, no alarm
   * If persistent -> raises specific sensor alarm
   */
  private async handleSensorNullRetries(initialStatus: BrewPiStatus): Promise<BrewPiStatus> {
    let currentStatus = initialStatus;
    const hadNullBeer = initialStatus.beerTemp === null;
    const hadNullFridge = initialStatus.fridgeTemp === null;
    const hadNullRoom = initialStatus.roomTemp === null;

    // Retry #1
    try {
      currentStatus = await this.apiClient.getStatus('HIGH');
    } catch {
      // Ignored during retry loop
    }

    // Check if still null -> Retry #2
    if ((hadNullBeer && currentStatus.beerTemp === null) ||
        (hadNullFridge && currentStatus.fridgeTemp === null) ||
        (hadNullRoom && currentStatus.roomTemp === null)) {
      try {
        currentStatus = await this.apiClient.getStatus('HIGH');
      } catch {
        // Ignored
      }
    }

    // Evaluation after retries
    const recoveredBeer = hadNullBeer && currentStatus.beerTemp !== null;
    const recoveredFridge = hadNullFridge && currentStatus.fridgeTemp !== null;
    const recoveredRoom = hadNullRoom && currentStatus.roomTemp !== null;

    if (recoveredBeer || recoveredFridge || recoveredRoom) {
      // Transient error was resolved by retry!
      StorageService.incrementErrorCounter('sensorTransientErrors');
    }

    return currentStatus;
  }

  /**
   * Successful Poll Handling
   */
  private handleSuccessfulPoll(status: BrewPiStatus): void {
    this.lastSuccessfulPollTime = Date.now();
    this.latestStatus = status;

    // Connection State Machine Transition
    if (this.connectionState === 'OFFLINE_ALERTED' || this.connectionState === 'TEMPORARY_FAILURE') {
      const wasOffline = this.connectionState === 'OFFLINE_ALERTED';
      this.connectionState = 'RECOVERED';
      this.consecutiveFailures = 0;

      if (wasOffline && this.settings.sendRecoveryNotifications) {
        const recoveryAlert: AlertEvent = {
          id: `rec_${Date.now()}`,
          batchId: StorageService.getActiveBatch()?.id || null,
          phoneTimestamp: Date.now(),
          espTimestamp: status.espTimestamp,
          eventType: 'CONNECTION_RECOVERED',
          severity: 'info',
          ruleDescription: 'ESP32 Connection Restored',
          message: 'BrewPiLess ESP32 is back online and communicating normally.',
          isResolved: true
        };
        StorageService.saveAlert(recoveryAlert);
        NotificationService.notify(recoveryAlert, 'channel_recovery');
      }
    } else {
      this.connectionState = 'HEALTHY';
      this.consecutiveFailures = 0;
    }

    // Update Actuator Runtimes
    this.updateActuatorMetrics(status);

    // Evaluate Sensor Null Alarms
    this.evaluateSensorNullAlarms(status);

    // Evaluate Temperature Limits & Hysteresis
    this.evaluateTemperatureRules(status);

    // Evaluate Stale Sensor
    if (this.settings.staleRules.enabled) {
      this.evaluateStaleSensor(status);
    }

    // Evaluate Sudden Temperature Jumps
    if (this.settings.suddenChangeRules.enabled) {
      this.evaluateSuddenJump(status);
    }

    // Append to Measurement Log if an active batch exists
    const activeBatch = StorageService.getActiveBatch();
    if (activeBatch) {
      StorageService.saveMeasurement({
        id: `meas_${Date.now()}`,
        batchId: activeBatch.id,
        phoneTimestamp: status.phoneTimestamp,
        espTimestamp: status.espTimestamp,
        espTimestampIsEstimated: status.espTimestampIsEstimated,
        beerTemp: status.beerTemp,
        fridgeTemp: status.fridgeTemp,
        roomTemp: status.roomTemp,
        beerSet: status.beerSet,
        fridgeSet: status.fridgeSet,
        mode: status.mode,
        state: status.state,
        heaterActive: status.heaterActive,
        coolerActive: status.coolerActive
      });
    }

    this.notify();
  }

  /**
   * Failed Poll Handling
   */
  private handleFailedPoll(err: any): void {
    this.consecutiveFailures++;
    StorageService.incrementErrorCounter('networkErrors');

    const threshold = this.settings.consecutiveFailuresThreshold || 3;

    if (this.consecutiveFailures < threshold) {
      this.connectionState = 'TEMPORARY_FAILURE';
    } else if (this.connectionState !== 'OFFLINE_ALERTED') {
      this.connectionState = 'OFFLINE_ALERTED';

      const alert: AlertEvent = {
        id: `conn_fail_${Date.now()}`,
        batchId: StorageService.getActiveBatch()?.id || null,
        phoneTimestamp: Date.now(),
        espTimestamp: null,
        eventType: 'CONNECTION_OFFLINE',
        severity: 'critical',
        ruleDescription: 'BrewPiLess Connection Lost',
        message: `ESP32 is unreachable after ${this.consecutiveFailures} consecutive attempts. (${err.message || 'Network timeout'})`,
        isResolved: false
      };

      StorageService.saveAlert(alert);
      NotificationService.notify(alert, 'channel_connection', this.settings.beerRules.repeatIntervalMinutes);
    }

    this.notify();
  }

  /**
   * Actuator Runtime Tracking (Heater & Cooler independently)
   * Supports independent actuators ih & ic simultaneously!
   */
  private updateActuatorMetrics(status: BrewPiStatus): void {
    const now = Date.now();

    // Heater Tracking
    if (status.heaterActive) {
      if (!this.heaterMetrics.isActive) {
        // Just turned ON
        this.heaterMetrics.isActive = true;
        this.heaterMetrics.currentCycleStartTime = now;
        this.heaterMetrics.cycleCount++;
        if (this.heaterMetrics.lastStateChangeTimestamp) {
          this.heaterMetrics.timeSincePreviousCycleMs = now - this.heaterMetrics.lastStateChangeTimestamp;
        }
        this.heaterMetrics.lastStateChangeTimestamp = now;
      } else if (this.heaterMetrics.currentCycleStartTime) {
        this.heaterMetrics.currentCycleDurationMs = now - this.heaterMetrics.currentCycleStartTime;
      }
    } else {
      if (this.heaterMetrics.isActive) {
        // Just turned OFF
        this.heaterMetrics.isActive = false;
        if (this.heaterMetrics.currentCycleStartTime) {
          const duration = now - this.heaterMetrics.currentCycleStartTime;
          this.heaterMetrics.lastCycleDurationMs = duration;
          this.heaterMetrics.totalBatchRuntimeMs += duration;
          this.heaterMetrics.averageCycleDurationMs =
            this.heaterMetrics.totalBatchRuntimeMs / Math.max(1, this.heaterMetrics.cycleCount);
        }
        this.heaterMetrics.currentCycleStartTime = null;
        this.heaterMetrics.currentCycleDurationMs = 0;
        this.heaterMetrics.lastStateChangeTimestamp = now;
      }
    }

    // Cooler Tracking
    if (status.coolerActive) {
      if (!this.coolerMetrics.isActive) {
        // Just turned ON
        this.coolerMetrics.isActive = true;
        this.coolerMetrics.currentCycleStartTime = now;
        this.coolerMetrics.cycleCount++;
        if (this.coolerMetrics.lastStateChangeTimestamp) {
          this.coolerMetrics.timeSincePreviousCycleMs = now - this.coolerMetrics.lastStateChangeTimestamp;
        }
        this.coolerMetrics.lastStateChangeTimestamp = now;
      } else if (this.coolerMetrics.currentCycleStartTime) {
        this.coolerMetrics.currentCycleDurationMs = now - this.coolerMetrics.currentCycleStartTime;
      }
    } else {
      if (this.coolerMetrics.isActive) {
        // Just turned OFF
        this.coolerMetrics.isActive = false;
        if (this.coolerMetrics.currentCycleStartTime) {
          const duration = now - this.coolerMetrics.currentCycleStartTime;
          this.coolerMetrics.lastCycleDurationMs = duration;
          this.coolerMetrics.totalBatchRuntimeMs += duration;
          this.coolerMetrics.averageCycleDurationMs =
            this.coolerMetrics.totalBatchRuntimeMs / Math.max(1, this.coolerMetrics.cycleCount);
        }
        this.coolerMetrics.currentCycleStartTime = null;
        this.coolerMetrics.currentCycleDurationMs = 0;
        this.coolerMetrics.lastStateChangeTimestamp = now;
      }
    }
  }

  /**
   * Evaluate Sensor Null Alarms per sensor
   */
  private evaluateSensorNullAlarms(status: BrewPiStatus): void {
    const sensors: { type: SensorType; val: number | null; name: string }[] = [
      { type: 'beer', val: status.beerTemp, name: 'BeerTemp' },
      { type: 'fridge', val: status.fridgeTemp, name: 'FridgeTemp' },
      { type: 'room', val: status.roomTemp, name: 'RoomTemp' }
    ];

    for (const s of sensors) {
      const alarmKey = `NULL_SENSOR_${s.type}`;
      if (s.val === null) {
        if (!this.activeAlarms.has(alarmKey)) {
          this.activeAlarms.set(alarmKey, {
            ruleKey: alarmKey,
            sensor: s.type,
            type: 'SENSOR_NULL',
            firstDetectedAt: Date.now(),
            lastNotifiedAt: Date.now(),
            triggerValue: 0
          });

          StorageService.incrementErrorCounter('sensorAlarms');

          const alert: AlertEvent = {
            id: `null_${s.type}_${Date.now()}`,
            batchId: StorageService.getActiveBatch()?.id || null,
            phoneTimestamp: Date.now(),
            espTimestamp: status.espTimestamp,
            eventType: 'SENSOR_NULL',
            sensor: s.type,
            severity: 'critical',
            ruleDescription: `${s.name} Sensor Missing Data`,
            message: `${s.name} sensor returned null after 2 sequential verification retries. Check probe wiring.`,
            isResolved: false
          };

          StorageService.saveAlert(alert);
          const channel = s.type === 'beer' ? 'channel_beer_sensor' : (s.type === 'fridge' ? 'channel_fridge_sensor' : 'channel_room_sensor');
          NotificationService.notify(alert, channel);
        }
      } else {
        // Recovered from null
        if (this.activeAlarms.has(alarmKey)) {
          this.activeAlarms.delete(alarmKey);

          if (this.settings.sendRecoveryNotifications) {
            const alert: AlertEvent = {
              id: `rec_${s.type}_${Date.now()}`,
              batchId: StorageService.getActiveBatch()?.id || null,
              phoneTimestamp: Date.now(),
              espTimestamp: status.espTimestamp,
              eventType: 'SENSOR_RECOVERED',
              sensor: s.type,
              severity: 'info',
              measuredValue: s.val,
              ruleDescription: `${s.name} Sensor Recovered`,
              message: `${s.name} sensor is back online reading ${s.val.toFixed(1)}°C.`,
              isResolved: true
            };
            StorageService.saveAlert(alert);
            NotificationService.notify(alert, 'channel_recovery');
          }
        }
      }
    }
  }

  /**
   * Evaluate Temperature Limits, Deviation and Hysteresis
   */
  private evaluateTemperatureRules(status: BrewPiStatus): void {
    this.checkSingleSensorRules(status.beerTemp, status.beerSet, this.settings.beerRules, 'beer', status.espTimestamp);
    this.checkSingleSensorRules(status.fridgeTemp, status.fridgeSet, this.settings.fridgeRules, 'fridge', status.espTimestamp);
    this.checkSingleSensorRules(status.roomTemp, null, this.settings.roomRules, 'room', status.espTimestamp);
  }

  private checkSingleSensorRules(
    temp: number | null,
    setPoint: number | null,
    rules: TemperatureRuleConfig,
    sensor: SensorType,
    espTimestamp: number | null
  ): void {
    if (!rules || !rules.enabled) {
      // Clear any pending alarms for this sensor if rules were disabled
      this.activeAlarms.delete(`UPPER_DEV_${sensor}`);
      this.activeAlarms.delete(`LOWER_DEV_${sensor}`);
      this.activeAlarms.delete(`ABS_MAX_${sensor}`);
      this.activeAlarms.delete(`ABS_MIN_${sensor}`);
      return;
    }

    if (temp === null || temp === undefined) return;

    const sensorName = sensor === 'beer' ? 'BeerTemp' : (sensor === 'fridge' ? 'FridgeTemp' : 'RoomTemp');
    const now = Date.now();

    // 1. Deviation Check (Only if setpoint is valid and not null)
    if (setPoint !== null) {
      const upperLimit = setPoint + rules.upperDeviation;
      const lowerLimit = setPoint - rules.lowerDeviation;
      const alarmKeyUpper = `UPPER_DEV_${sensor}`;
      const alarmKeyLower = `LOWER_DEV_${sensor}`;

      // Upper Deviation
      if (temp > upperLimit) {
        this.handleAbnormalCondition(alarmKeyUpper, sensor, 'TEMP_UPPER_DEVIATION', temp, setPoint, rules, espTimestamp,
          `${sensorName} High Deviation`,
          `${sensorName} is ${temp.toFixed(1)}°C (${(temp - setPoint).toFixed(1)}°C above target ${setPoint.toFixed(1)}°C)`);
      } else {
        // Hysteresis Recovery: Must drop below (upperLimit - hysteresis)
        const recoveryTarget = upperLimit - rules.recoveryHysteresis;
        if (temp <= recoveryTarget && this.activeAlarms.has(alarmKeyUpper)) {
          this.resolveAlarm(alarmKeyUpper, sensor, temp, setPoint, espTimestamp, `${sensorName} returned within upper target range.`);
        }
      }

      // Lower Deviation
      if (temp < lowerLimit) {
        this.handleAbnormalCondition(alarmKeyLower, sensor, 'TEMP_LOWER_DEVIATION', temp, setPoint, rules, espTimestamp,
          `${sensorName} Low Deviation`,
          `${sensorName} is ${temp.toFixed(1)}°C (${(setPoint - temp).toFixed(1)}°C below target ${setPoint.toFixed(1)}°C)`);
      } else {
        // Hysteresis Recovery: Must rise above (lowerLimit + hysteresis)
        const recoveryTarget = lowerLimit + rules.recoveryHysteresis;
        if (temp >= recoveryTarget && this.activeAlarms.has(alarmKeyLower)) {
          this.resolveAlarm(alarmKeyLower, sensor, temp, setPoint, espTimestamp, `${sensorName} returned within lower target range.`);
        }
      }
    }

    // 2. Absolute Limits (Active regardless of setpoint)
    const alarmKeyAbsMax = `ABS_MAX_${sensor}`;
    const alarmKeyAbsMin = `ABS_MIN_${sensor}`;

    if (temp > rules.absoluteMax) {
      this.handleAbnormalCondition(alarmKeyAbsMax, sensor, 'TEMP_ABSOLUTE_MAX', temp, rules.absoluteMax, rules, espTimestamp,
        `${sensorName} Above Absolute Max`,
        `${sensorName} is ${temp.toFixed(1)}°C, exceeding safe maximum limit of ${rules.absoluteMax.toFixed(1)}°C!`);
    } else if (temp <= (rules.absoluteMax - rules.recoveryHysteresis) && this.activeAlarms.has(alarmKeyAbsMax)) {
      this.resolveAlarm(alarmKeyAbsMax, sensor, temp, rules.absoluteMax, espTimestamp, `${sensorName} returned below safe absolute max.`);
    }

    if (temp < rules.absoluteMin) {
      this.handleAbnormalCondition(alarmKeyAbsMin, sensor, 'TEMP_ABSOLUTE_MIN', temp, rules.absoluteMin, rules, espTimestamp,
        `${sensorName} Below Absolute Min`,
        `${sensorName} is ${temp.toFixed(1)}°C, below safe minimum limit of ${rules.absoluteMin.toFixed(1)}°C!`);
    } else if (temp >= (rules.absoluteMin + rules.recoveryHysteresis) && this.activeAlarms.has(alarmKeyAbsMin)) {
      this.resolveAlarm(alarmKeyAbsMin, sensor, temp, rules.absoluteMin, espTimestamp, `${sensorName} returned above safe absolute min.`);
    }
  }

  private handleAbnormalCondition(
    alarmKey: string,
    sensor: SensorType,
    eventType: any,
    currentTemp: number,
    expectedVal: number | null,
    rules: TemperatureRuleConfig,
    espTimestamp: number | null,
    ruleTitle: string,
    message: string
  ): void {
    const now = Date.now();
    let state = this.activeAlarms.get(alarmKey);

    if (!state) {
      // First detected
      state = {
        ruleKey: alarmKey,
        sensor,
        type: eventType,
        firstDetectedAt: now,
        lastNotifiedAt: 0,
        triggerValue: currentTemp
      };
      this.activeAlarms.set(alarmKey, state);
    }

    // Check abnormal duration threshold
    const requiredDurationMs = (rules.abnormalDurationMinutes || 0) * 60 * 1000;
    const isAbnormalLongEnough = (now - state.firstDetectedAt) >= requiredDurationMs;

    if (isAbnormalLongEnough) {
      const repeatIntervalMs = (rules.repeatIntervalMinutes || 30) * 60 * 1000;
      const shouldNotify = (now - state.lastNotifiedAt) >= repeatIntervalMs;

      if (shouldNotify) {
        state.lastNotifiedAt = now;
        StorageService.incrementErrorCounter('temperatureAlarms');

        const alert: AlertEvent = {
          id: `temp_${Date.now()}`,
          batchId: StorageService.getActiveBatch()?.id || null,
          phoneTimestamp: now,
          espTimestamp,
          eventType,
          sensor,
          severity: 'warning',
          measuredValue: currentTemp,
          expectedValue: expectedVal,
          ruleDescription: ruleTitle,
          message,
          isResolved: false
        };

        StorageService.saveAlert(alert);
        NotificationService.notify(alert, 'channel_temperature_alarm', rules.repeatIntervalMinutes);
      }
    }
  }

  private resolveAlarm(
    alarmKey: string,
    sensor: SensorType,
    temp: number,
    expectedVal: number | null,
    espTimestamp: number | null,
    message: string
  ): void {
    const existing = this.activeAlarms.get(alarmKey);
    this.activeAlarms.delete(alarmKey);

    if (existing && this.settings.sendRecoveryNotifications) {
      const alert: AlertEvent = {
        id: `rec_temp_${Date.now()}`,
        batchId: StorageService.getActiveBatch()?.id || null,
        phoneTimestamp: Date.now(),
        espTimestamp,
        eventType: 'TEMP_RECOVERED',
        sensor,
        severity: 'info',
        measuredValue: temp,
        expectedValue: expectedVal,
        ruleDescription: 'Temperature Normalised',
        message,
        isResolved: true
      };
      StorageService.saveAlert(alert);
      NotificationService.notify(alert, 'channel_recovery');
    }
  }

  /**
   * Stale / Frozen Sensor Detection
   */
  private evaluateStaleSensor(status: BrewPiStatus): void {
    if (!this.settings.staleRules?.enabled || status.beerTemp === null) {
      this.activeAlarms.delete('STALE_SENSOR_BEER');
      return;
    }
    const now = Date.now();

    this.beerTempHistory.push({ timestamp: now, temp: status.beerTemp });
    // Keep last 60 minutes
    const cutoff = now - (this.settings.staleRules.maxSameValueMinutes * 60 * 1000);
    this.beerTempHistory = this.beerTempHistory.filter(h => h.timestamp >= cutoff);

    if (this.beerTempHistory.length >= 5) {
      const allSame = this.beerTempHistory.every(h => Math.abs(h.temp - status.beerTemp!) < 0.01);
      const actuatorCondition = !this.settings.staleRules.requireActuatorActive || (status.heaterActive || status.coolerActive);

      if (allSame && actuatorCondition) {
        const alarmKey = 'STALE_SENSOR_BEER';
        if (!this.activeAlarms.has(alarmKey)) {
          this.activeAlarms.set(alarmKey, {
            ruleKey: alarmKey,
            sensor: 'beer',
            type: 'SENSOR_STALE',
            firstDetectedAt: now,
            lastNotifiedAt: now,
            triggerValue: status.beerTemp
          });

          const alert: AlertEvent = {
            id: `stale_${Date.now()}`,
            batchId: StorageService.getActiveBatch()?.id || null,
            phoneTimestamp: now,
            espTimestamp: status.espTimestamp,
            eventType: 'SENSOR_STALE',
            sensor: 'beer',
            severity: 'warning',
            measuredValue: status.beerTemp,
            ruleDescription: 'Sensor Appears Stale',
            message: `BeerTemp has remained identical at ${status.beerTemp.toFixed(1)}°C for ${this.settings.staleRules.maxSameValueMinutes} mins while actuators are running.`,
            isResolved: false
          };
          StorageService.saveAlert(alert);
          NotificationService.notify(alert, 'channel_beer_sensor');
        }
      }
    }
  }

  /**
   * Sudden Temperature Jump Detection (°C/min)
   */
  private evaluateSuddenJump(status: BrewPiStatus): void {
    if (!this.settings.suddenChangeRules?.enabled || status.beerTemp === null) return;
    const now = Date.now();

    const minSamples = this.settings.suddenChangeRules.minSampleCount || 3;
    if (this.beerTempHistory.length >= minSamples) {
      const oldest = this.beerTempHistory[0];
      const deltaMinutes = (now - oldest.timestamp) / (60 * 1000);

      if (deltaMinutes >= 1.0) {
        const deltaTemp = Math.abs(status.beerTemp - oldest.temp);
        const ratePerMinute = deltaTemp / deltaMinutes;

        if (ratePerMinute > this.settings.suddenChangeRules.maxDegreesPerMinute) {
          const alert: AlertEvent = {
            id: `jump_${Date.now()}`,
            batchId: StorageService.getActiveBatch()?.id || null,
            phoneTimestamp: now,
            espTimestamp: status.espTimestamp,
            eventType: 'TEMP_SUDDEN_JUMP',
            sensor: 'beer',
            severity: 'warning',
            measuredValue: status.beerTemp,
            ruleDescription: 'Suspicious Temperature Change',
            message: `BeerTemp jumped by ${deltaTemp.toFixed(1)}°C in ${deltaMinutes.toFixed(1)} min (${ratePerMinute.toFixed(1)}°C/min rate of change).`,
            isResolved: false
          };
          StorageService.saveAlert(alert);
          NotificationService.notify(alert, 'channel_temperature_alarm');
        }
      }
    }
  }

  /**
   * Poll /fs (Heap & Filesystem)
   * Runs on a relaxed 5-minute interval through the single request queue
   */
  public async pollFilesystemAndHeap(): Promise<void> {
    try {
      const fsData = await this.apiClient.getFs('NORMAL');
      this.latestFs = fsData;

      // 1. Filesystem capacity warning
      if (fsData.fsUsedPercent !== null) {
        if (fsData.fsUsedPercent >= this.settings.fsCriticalThresholdPercent) {
          StorageService.incrementErrorCounter('fsWarnings');
          const alert: AlertEvent = {
            id: `fs_crit_${Date.now()}`,
            batchId: StorageService.getActiveBatch()?.id || null,
            phoneTimestamp: Date.now(),
            espTimestamp: null,
            eventType: 'FS_CRITICAL',
            severity: 'critical',
            measuredValue: fsData.fsUsedPercent,
            ruleDescription: 'Filesystem Storage Critical',
            message: `ESP32 flash filesystem is ${fsData.fsUsedPercent}% full! Only ${(fsData.freeBytes! / 1024).toFixed(0)} KB remaining.`,
            isResolved: false
          };
          StorageService.saveAlert(alert);
          NotificationService.notify(alert, 'channel_memory_filesystem');
        } else if (fsData.fsUsedPercent >= this.settings.fsWarningThresholdPercent) {
          StorageService.incrementErrorCounter('fsWarnings');
        }
      }

      // 2. Heap decline / possible leak analysis
      if (fsData.freeHeap !== null) {
        this.analyzeHeapTrend(fsData.freeHeap);
      }

      this.notify();
    } catch {
      // Ignored for relaxed /fs
    }
  }

  private analyzeHeapTrend(currentFreeHeap: number): void {
    const now = Date.now();
    this.heapSamples.push({ timestamp: now, freeHeap: currentFreeHeap });

    // Keep up to 2 hours of heap history
    const cutoff = now - (2 * 60 * 60 * 1000);
    this.heapSamples = this.heapSamples.filter(s => s.timestamp >= cutoff);

    const minDurationMs = (this.settings.heapDeclineMinDurationMinutes || 30) * 60 * 1000;
    if (this.heapSamples.length >= 4) {
      const oldest = this.heapSamples[0];
      const durationHours = (now - oldest.timestamp) / (60 * 60 * 1000);

      if ((now - oldest.timestamp) >= minDurationMs && durationHours > 0) {
        const dropBytes = oldest.freeHeap - currentFreeHeap;
        const dropKbPerHour = (dropBytes / 1024) / durationHours;

        if (this.latestFs) {
          this.latestFs.heapDeclineRateKbPerHour = Number(dropKbPerHour.toFixed(1));
        }

        // Reboot check: If heap jumped by more than 20KB, reset baseline!
        if (dropBytes < -20000) {
          this.heapSamples = [{ timestamp: now, freeHeap: currentFreeHeap }];
          return;
        }

        if (dropKbPerHour >= this.settings.heapDeclineThresholdKbPerHour) {
          if (this.latestFs) {
            this.latestFs.possibleMemoryLeak = true;
          }
          StorageService.incrementErrorCounter('possibleLeakWarnings');

          const alarmKey = 'HEAP_DECLINE_ALERT';
          if (!this.activeAlarms.has(alarmKey)) {
            this.activeAlarms.set(alarmKey, {
              ruleKey: alarmKey,
              sensor: 'beer',
              type: 'HEAP_DECLINE_WARNING',
              firstDetectedAt: now,
              lastNotifiedAt: now,
              triggerValue: currentFreeHeap
            });

            const alert: AlertEvent = {
              id: `heap_${Date.now()}`,
              batchId: StorageService.getActiveBatch()?.id || null,
              phoneTimestamp: now,
              espTimestamp: null,
              eventType: 'HEAP_DECLINE_WARNING',
              severity: 'warning',
              measuredValue: currentFreeHeap,
              ruleDescription: 'Possible Memory Leak / Sustained Heap Decline',
              message: `ESP32 free heap is steadily declining at ${dropKbPerHour.toFixed(1)} KB/hr over the last ${(durationHours * 60).toFixed(0)} minutes.`,
              isResolved: false
            };
            StorageService.saveAlert(alert);
            NotificationService.notify(alert, 'channel_memory_filesystem');
          }
        }
      }
    }
  }
}
