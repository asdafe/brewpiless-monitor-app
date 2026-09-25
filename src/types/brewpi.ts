/**
 * BrewPiLess Monitor - Core Domain Types and Models
 * Supports original vitotai firmware and asdafe fork
 */

export type SensorType = 'beer' | 'fridge' | 'room';

export type DeviceMode = 'b' | 'f' | 'p' | 'o' | string; // beer constant, fridge constant, beer profile, off

export type DeviceStateCode =
  | 0 // Idle
  | 1 // Off
  | 2 // Door Open
  | 3 // Heating
  | 4 // Cooling
  | 5 // Wait to Cool
  | 6 // Wait to Heat
  | 7 // Wait for Peak
  | 8 // Peak
  | 9 // Wait for Chamber to Cool
  | 10 // Wait for Chamber to Heat
  | number;

export type ConnectionHealthState =
  | 'HEALTHY'
  | 'TEMPORARY_FAILURE'
  | 'OFFLINE_ALERTED'
  | 'RECOVERED';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type NotificationChannelId =
  | 'channel_connection'
  | 'channel_beer_sensor'
  | 'channel_fridge_sensor'
  | 'channel_room_sensor'
  | 'channel_temperature_alarm'
  | 'channel_memory_filesystem'
  | 'channel_recovery'
  | 'channel_monitoring_service';

export interface DeviceCapabilities {
  supportsGetStatus: boolean;
  supportsFs: boolean;
  supportsTime: boolean;
  supportsLogList: boolean;
  supportsPid: boolean;
  supportsIndependentActuators: boolean; // ih and ic fields present
  supportsExtendedHeapStats: boolean;    // minFreeHeap, largestFreeBlock
  supportsWebSocketCount: boolean;       // wsClients
  detectedFirmware: 'asdafe_fork' | 'original_vitotai' | 'unknown';
}

/**
 * Raw status response DTO from GET /getstatus
 * Tolerant to nulls, missing fields, and custom fork extensions
 */
export interface RawStatusDto {
  mode?: string | null;
  state?: number | null;
  beerSet?: number | null;
  beerTemp?: number | null;
  fridgeSet?: number | null;
  fridgeTemp?: number | null;
  roomTemp?: number | null;
  // asdafe fork independent actuator indicators:
  ih?: number | boolean | null; // independent heater (1 or 0)
  ic?: number | boolean | null; // independent cooler (1 or 0)
  // Additional optional fields:
  pt?: number | null; // physical timer / time
  [key: string]: any;
}

/**
 * Raw response from GET /fs
 */
export interface RawFsDto {
  totalBytes?: number | null;
  usedBytes?: number | null;
  heap?: number | null;
  freeHeap?: number | null;
  minFreeHeap?: number | null;
  largestFreeBlock?: number | null;
  allocatedBlocks?: number | null;
  freeBlocks?: number | null;
  wsClients?: number | null;
  [key: string]: any;
}

/**
 * Normalized status model in application domain
 */
export interface BrewPiStatus {
  phoneTimestamp: number;
  espTimestamp: number | null;
  espTimestampIsEstimated: boolean;
  mode: DeviceMode;
  state: DeviceStateCode;
  stateDescription: string;
  beerSet: number | null;
  beerTemp: number | null;
  fridgeSet: number | null;
  fridgeTemp: number | null;
  roomTemp: number | null;
  heaterActive: boolean;
  coolerActive: boolean;
  independentActuatorsAvailable: boolean;
}

/**
 * Normalized Filesystem and Memory Model
 */
export interface SystemHealthStatus {
  phoneTimestamp: number;
  totalBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  fsUsedPercent: number | null;
  fsStatus: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'UNSUPPORTED';
  freeHeap: number | null;
  minFreeHeap: number | null;
  largestFreeBlock: number | null;
  allocatedBlocks: number | null;
  freeBlocks: number | null;
  wsClients: number | null;
  heapDeclineRateKbPerHour: number | null; // e.g. -2.4 KB/hr
  possibleMemoryLeak: boolean;
}

/**
 * Actuator runtime metrics
 */
export interface ActuatorMetrics {
  isActive: boolean;
  currentCycleStartTime: number | null;
  currentCycleDurationMs: number;
  totalBatchRuntimeMs: number;
  cycleCount: number;
  lastCycleDurationMs: number;
  averageCycleDurationMs: number;
  timeSincePreviousCycleMs: number;
  lastStateChangeTimestamp: number;
}

/**
 * Temperature rule configuration per sensor
 */
export interface TemperatureRuleConfig {
  sensor: SensorType;
  enabled: boolean;
  upperDeviation: number; // e.g. +1.5 °C from Set
  lowerDeviation: number; // e.g. -1.5 °C from Set
  absoluteMin: number;    // e.g. 0.0 °C
  absoluteMax: number;    // e.g. 35.0 °C
  abnormalDurationMinutes: number; // must remain abnormal for X mins
  recoveryHysteresis: number;      // e.g. 0.5 °C margin before clearing alarm
  repeatIntervalMinutes: number;   // don't repeat notification within X mins
}

/**
 * Stale sensor rule configuration
 */
export interface StaleSensorConfig {
  enabled: boolean;
  maxSameValueMinutes: number; // e.g. 30 mins
  requireActuatorActive: boolean; // only flag if heating/cooling is ON
}

/**
 * Rate of change rule
 */
export interface SuddenChangeConfig {
  enabled: boolean;
  maxDegreesPerMinute: number; // e.g. 1.0 °C/min
  minSampleCount: number;      // e.g. 3 samples
}

/**
 * App Settings
 */
export interface AppSettings {
  deviceHost: string;          // e.g. "orcunozden.duckdns.org" or "192.168.1.50"
  devicePort: number;          // e.g. 27141 or 80
  useHttps: boolean;           // Default false (HTTP only)
  firmwareVariant: 'asdafe_fork' | 'original_vitotai' | 'auto'; // Default: 'asdafe_fork'
  pollingIntervalSeconds: number; // 60, 120, 300, 600, etc.
  interRequestDelayMs: number; // 500, 1000, 2000, 5000 (Default: 1000ms)
  requestTimeoutMs: number;    // 3000, 5000, 10000 (Default: 5000ms)
  consecutiveFailuresThreshold: number; // Default: 3
  fsPollIntervalMinutes: number;        // Default: 5
  timeSyncIntervalMinutes: number;      // Default: 10
  sendRecoveryNotifications: boolean;   // Default: true
  enableSoundAlerts: boolean;           // Default: true
  fsWarningThresholdPercent: number;    // Default: 80
  fsCriticalThresholdPercent: number;   // Default: 90
  heapDeclineThresholdKbPerHour: number;// Default: 1.5 KB/hr
  heapDeclineMinDurationMinutes: number;// Default: 30 mins
  beerRules: TemperatureRuleConfig;
  fridgeRules: TemperatureRuleConfig;
  roomRules: TemperatureRuleConfig;
  staleRules: StaleSensorConfig;
  suddenChangeRules: SuddenChangeConfig;
  monitoringScheduleEnabled: boolean;
  monitoringScheduleStart: string; // "00:00"
  monitoringScheduleEnd: string;   // "23:59"
  language: 'en' | 'tr';
  simulationMode: boolean;
}

/**
 * Alert event entry
 */
export interface AlertEvent {
  id: string;
  batchId: string | null;
  phoneTimestamp: number;
  espTimestamp: number | null;
  eventType:
    | 'CONNECTION_OFFLINE'
    | 'CONNECTION_RECOVERED'
    | 'SENSOR_NULL'
    | 'SENSOR_RECOVERED'
    | 'TEMP_UPPER_DEVIATION'
    | 'TEMP_LOWER_DEVIATION'
    | 'TEMP_ABSOLUTE_MAX'
    | 'TEMP_ABSOLUTE_MIN'
    | 'TEMP_RECOVERED'
    | 'SENSOR_STALE'
    | 'TEMP_SUDDEN_JUMP'
    | 'HEAP_DECLINE_WARNING'
    | 'FS_WARNING'
    | 'FS_CRITICAL';
  sensor?: SensorType;
  severity: AlertSeverity;
  measuredValue?: number | null;
  expectedValue?: number | null;
  ruleDescription: string;
  message: string;
  recoveryTimestamp?: number | null;
  isResolved: boolean;
  snoozedUntil?: number | null;
}

/**
 * Batch (Fermentation Project)
 */
export interface Batch {
  id: string;
  name: string;
  beerStyle: string;
  notes: string;
  startedAt: number;
  endedAt: number | null;
  isActive: boolean;
  settingsSnapshot: Partial<AppSettings>;
  heaterTotalRuntimeMs: number;
  coolerTotalRuntimeMs: number;
  heaterCycleCount: number;
  coolerCycleCount: number;
}

/**
 * Measurement log point
 */
export interface MeasurementPoint {
  id: string;
  batchId: string;
  phoneTimestamp: number;
  espTimestamp: number | null;
  espTimestampIsEstimated: boolean;
  beerTemp: number | null;
  fridgeTemp: number | null;
  roomTemp: number | null;
  beerSet: number | null;
  fridgeSet: number | null;
  mode: string;
  state: number;
  heaterActive: boolean;
  coolerActive: boolean;
}

/**
 * Error counters for dashboard
 */
export interface ErrorCounters {
  networkErrors: number;
  jsonErrors: number;
  sensorTransientErrors: number;
  sensorAlarms: number;
  temperatureAlarms: number;
  heapWarnings: number;
  fsWarnings: number;
  possibleLeakWarnings: number;
}
