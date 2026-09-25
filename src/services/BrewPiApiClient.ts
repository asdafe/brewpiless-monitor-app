/**
 * BrewPiApiClient.ts
 *
 * Dedicated API client for BrewPiLess ESP32.
 * Key invariants:
 * 1. ALL requests flow through the centralized esp32RequestQueue (NO concurrent requests).
 * 2. Tolerant JSON parsing: null temperature is NEVER converted to 0.0°C.
 * 3. Fork compatibility:
 *    - asdafe fork: supports independent actuators `ih` and `ic`
 *    - original vitotai: derives heating/cooling from standard `state`
 * 4. Capability detection matrix.
 * 5. Strictly read-only: prohibited write/delete query parameters are rejected.
 */

import {
  RawStatusDto,
  RawFsDto,
  BrewPiStatus,
  SystemHealthStatus,
  DeviceCapabilities,
  DeviceStateCode
} from '../types/brewpi';
import { esp32RequestQueue, RequestPriority } from './SingleRequestQueue';
import { SimulationEngine } from './SimulationEngine';

export interface EndpointProbeResult {
  endpoint: string;
  name: string;
  ok: boolean;
  httpStatus: number | null;
  durationMs: number | null;
  summary: string;
  rawPreview?: string | null;
  lastChecked: number | null;
  error?: string | null;
}

export interface ApiDiagnosticsInfo {
  url: string;
  httpStatus: number | null;
  lastSuccessTimestamp: number | null;
  lastErrorTimestamp: number | null;
  lastErrorMessage: string | null;
  requestDurationMs: number | null;
  consecutiveFailures: number;
  rawStatusJson: string | null;
  rawFsJson: string | null;
  rawPidText: string | null;
  rawTimeJson: string | null;
  rawLogListJson: string | null;
  endpointProbes: Record<string, EndpointProbeResult>;
}

export class BrewPiApiClient {
  private host: string;
  private port: number;
  private useHttps: boolean;
  private timeoutMs: number;
  private simulationMode: boolean = false;

  private diagnostics: ApiDiagnosticsInfo = {
    url: '',
    httpStatus: null,
    lastSuccessTimestamp: null,
    lastErrorTimestamp: null,
    lastErrorMessage: null,
    requestDurationMs: null,
    consecutiveFailures: 0,
    rawStatusJson: null,
    rawFsJson: null,
    rawPidText: null,
    rawTimeJson: null,
    rawLogListJson: null,
    endpointProbes: {
      '/getstatus': {
        endpoint: '/getstatus',
        name: 'Device Status & Temps',
        ok: true,
        httpStatus: 200,
        durationMs: null,
        summary: 'Primary status endpoint (Mode, Beer & Fridge Temps)',
        lastChecked: null
      },
      '/fs': {
        endpoint: '/fs',
        name: 'Filesystem & Free Heap',
        ok: true,
        httpStatus: 200,
        durationMs: null,
        summary: 'Storage capacity & Free Heap memory stats',
        lastChecked: null
      },
      '/time': {
        endpoint: '/time',
        name: 'Time Synchronization',
        ok: true,
        httpStatus: 200,
        durationMs: null,
        summary: 'ESP32 Real-Time Clock & Epoch timestamp',
        lastChecked: null
      },
      '/loglist.php': {
        endpoint: '/loglist.php',
        name: 'Log Profiles (Read-Only)',
        ok: true,
        httpStatus: 200,
        durationMs: null,
        summary: 'Active fermentation log & recording state',
        lastChecked: null
      },
      '/pid?fmt=text': {
        endpoint: '/pid?fmt=text',
        name: 'PID Controller Parameters',
        ok: true,
        httpStatus: 200,
        durationMs: null,
        summary: 'Kp, Ki, Kd, predictive cooling & heating cycles',
        lastChecked: null
      }
    }
  };

  private firmwareVariantConfig: 'asdafe_fork' | 'original_vitotai' | 'auto' = 'asdafe_fork';

  private capabilities: DeviceCapabilities = {
    supportsGetStatus: true,
    supportsFs: true,
    supportsTime: true,
    supportsLogList: true,
    supportsPid: true,
    supportsIndependentActuators: true,
    supportsExtendedHeapStats: true,
    supportsWebSocketCount: true,
    detectedFirmware: 'asdafe_fork'
  };

  constructor(host: string = 'orcunozden.duckdns.org', port: number = 27141, useHttps: boolean = false, timeoutMs: number = 5000) {
    this.host = host;
    this.port = port;
    this.useHttps = useHttps;
    this.timeoutMs = timeoutMs;
    this.updateBaseUrl();
  }

  public updateConfig(
    host: string,
    port: number,
    useHttps: boolean,
    timeoutMs: number,
    simulationMode: boolean,
    firmwareVariant: 'asdafe_fork' | 'original_vitotai' | 'auto' = 'asdafe_fork'
  ): void {
    this.host = host;
    this.port = port;
    this.useHttps = useHttps;
    this.timeoutMs = timeoutMs;
    this.simulationMode = simulationMode;
    this.firmwareVariantConfig = firmwareVariant;
    this.updateBaseUrl();

    if (firmwareVariant === 'asdafe_fork') {
      this.capabilities.detectedFirmware = 'asdafe_fork';
      this.capabilities.supportsIndependentActuators = true;
    } else if (firmwareVariant === 'original_vitotai') {
      this.capabilities.detectedFirmware = 'original_vitotai';
      this.capabilities.supportsIndependentActuators = false;
    }
  }

  private updateBaseUrl(): void {
    const proto = this.useHttps ? 'https' : 'http';
    this.diagnostics.url = `${proto}://${this.host}:${this.port}`;
  }

  public getBaseUrl(): string {
    return this.diagnostics.url;
  }

  public getDiagnostics(): ApiDiagnosticsInfo {
    return { ...this.diagnostics };
  }

  public getCapabilities(): DeviceCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Internal HTTP execution helper routed through server proxy or direct
   */
  private async executeHttpRequest(path: string): Promise<{ data: any; rawText: string; status: number; durationMs: number }> {
    const targetUrl = `${this.getBaseUrl()}${path}`;
    const startTime = Date.now();

    // Use backend proxy endpoint to avoid browser Mixed Content and CORS errors
    const proxyUrl = `/api/esp32/proxy?url=${encodeURIComponent(targetUrl)}&timeout=${this.timeoutMs}`;

    const res = await fetch(proxyUrl);
    const durationMs = Date.now() - startTime;
    const json = await res.json();

    if (!res.ok || !json.ok) {
      const errMsg = json.error || `HTTP ${res.status}: ${res.statusText}`;
      const err = new Error(errMsg);
      (err as any).status = res.status;
      (err as any).durationMs = durationMs;
      throw err;
    }

    return {
      data: json.data,
      rawText: json.rawText || JSON.stringify(json.data),
      status: json.status || 200,
      durationMs: json.durationMs || durationMs
    };
  }

  /**
   * GET /getstatus
   * High Priority: Essential for temperature monitoring & sensor retries
   */
  public async getStatus(priority: RequestPriority = 'HIGH'): Promise<BrewPiStatus> {
    return esp32RequestQueue.enqueue<BrewPiStatus>('GET /getstatus', priority, async () => {
      const startTime = Date.now();
      try {
        let rawDto: RawStatusDto;
        let rawJsonStr: string;
        let durationMs: number;
        let httpStatus = 200;

        if (this.simulationMode) {
          rawDto = await SimulationEngine.mockGetStatus();
          rawJsonStr = JSON.stringify(rawDto, null, 2);
          durationMs = 150;
        } else {
          const result = await this.executeHttpRequest('/getstatus');
          rawDto = result.data;
          rawJsonStr = result.rawText;
          durationMs = result.durationMs;
          httpStatus = result.status;
        }

        // Update capabilities
        this.capabilities.supportsGetStatus = true;
        const hasIh = rawDto.ih !== undefined && rawDto.ih !== null;
        const hasIc = rawDto.ic !== undefined && rawDto.ic !== null;
        const isIndependentMode = rawDto.mode === 'i';

        if (this.firmwareVariantConfig === 'original_vitotai') {
          this.capabilities.detectedFirmware = 'original_vitotai';
          this.capabilities.supportsIndependentActuators = false;
        } else if (this.firmwareVariantConfig === 'asdafe_fork') {
          this.capabilities.detectedFirmware = 'asdafe_fork';
          this.capabilities.supportsIndependentActuators = true;
        } else {
          // 'auto'
          if (hasIh || hasIc || isIndependentMode) {
            this.capabilities.supportsIndependentActuators = true;
            this.capabilities.detectedFirmware = 'asdafe_fork';
          } else if (this.capabilities.detectedFirmware === 'unknown') {
            this.capabilities.detectedFirmware = 'asdafe_fork';
          }
        }

        // Update diagnostics
        this.diagnostics.httpStatus = httpStatus;
        this.diagnostics.lastSuccessTimestamp = Date.now();
        this.diagnostics.requestDurationMs = durationMs;
        this.diagnostics.consecutiveFailures = 0;
        this.diagnostics.lastErrorMessage = null;
        this.diagnostics.rawStatusJson = rawJsonStr;

        this.diagnostics.endpointProbes['/getstatus'] = {
          endpoint: '/getstatus',
          name: 'Device Status & Temps',
          ok: true,
          httpStatus,
          durationMs,
          summary: `Mode: ${rawDto.mode ?? 'unknown'}, Fridge: ${rawDto.fridgeTemp ?? '--'}°C, Room: ${rawDto.roomTemp ?? '--'}°C`,
          rawPreview: rawJsonStr.slice(0, 120),
          lastChecked: Date.now()
        };

        // Parse and normalize into Domain Model
        return this.normalizeStatus(rawDto);
      } catch (err: any) {
        this.diagnostics.consecutiveFailures++;
        this.diagnostics.lastErrorTimestamp = Date.now();
        this.diagnostics.lastErrorMessage = err.message || 'Unknown network error';
        this.diagnostics.requestDurationMs = Date.now() - startTime;
        this.diagnostics.httpStatus = err.status || null;

        this.diagnostics.endpointProbes['/getstatus'] = {
          endpoint: '/getstatus',
          name: 'Device Status & Temps',
          ok: false,
          httpStatus: err.status || null,
          durationMs: Date.now() - startTime,
          summary: 'Status query failed',
          error: err.message,
          lastChecked: Date.now()
        };
        throw err;
      }
    });
  }

  /**
   * Helper to parse /fs response whether returned as JSON or space-separated key:value text
   */
  private parseFsPayload(data: any, text: string): RawFsDto {
    const obj: any = {};
    if (data && typeof data === 'object') {
      Object.assign(obj, data);
    }
    if (text) {
      const pairs = text.trim().split(/\s+/);
      for (const pair of pairs) {
        const splitIdx = pair.indexOf(':');
        if (splitIdx > 0) {
          const k = pair.slice(0, splitIdx).trim();
          const v = pair.slice(splitIdx + 1).trim();
          const n = Number(v);
          if (obj[k] === undefined || obj[k] === null) {
            obj[k] = isNaN(n) ? v : n;
          }
        }
      }
    }
    if (obj.freeHeap === undefined && obj.heap !== undefined) {
      obj.freeHeap = obj.heap;
    }
    return obj;
  }

  /**
   * GET /fs
   * Normal Priority: Filesystem & Heap Memory Monitoring (Polled every ~5 minutes)
   */
  public async getFs(priority: RequestPriority = 'NORMAL'): Promise<SystemHealthStatus> {
    return esp32RequestQueue.enqueue<SystemHealthStatus>('GET /fs', priority, async () => {
      const startTime = Date.now();
      try {
        let rawFs: RawFsDto;
        let rawJsonStr: string;
        let durationMs = 120;
        let httpStatus = 200;

        if (this.simulationMode) {
          rawFs = await SimulationEngine.mockGetFs();
          rawJsonStr = JSON.stringify(rawFs, null, 2);
        } else {
          const result = await this.executeHttpRequest('/fs');
          rawJsonStr = result.rawText;
          rawFs = this.parseFsPayload(result.data, result.rawText);
          durationMs = result.durationMs;
          httpStatus = result.status;
        }

        this.capabilities.supportsFs = true;
        if (rawFs.minFreeHeap !== undefined || rawFs.largestFreeBlock !== undefined) {
          this.capabilities.supportsExtendedHeapStats = true;
        }
        if (rawFs.wsClients !== undefined) {
          this.capabilities.supportsWebSocketCount = true;
        }

        this.diagnostics.rawFsJson = rawJsonStr;

        this.diagnostics.endpointProbes['/fs'] = {
          endpoint: '/fs',
          name: 'Filesystem & Free Heap',
          ok: true,
          httpStatus,
          durationMs,
          summary: `FS: ${rawFs.totalBytes ? Math.round(rawFs.totalBytes / 1024) + ' KB' : 'OK'}, Heap: ${rawFs.freeHeap ?? rawFs.heap ?? '--'} bytes`,
          rawPreview: rawJsonStr.slice(0, 120),
          lastChecked: Date.now()
        };

        return this.normalizeFs(rawFs);
      } catch (err: any) {
        // If /fs is missing (e.g. older firmware), we don't mark ESP32 as offline!
        this.diagnostics.rawFsJson = `Unsupported / Error: ${err.message}`;

        this.diagnostics.endpointProbes['/fs'] = {
          endpoint: '/fs',
          name: 'Filesystem & Free Heap',
          ok: false,
          httpStatus: err.status || null,
          durationMs: Date.now() - startTime,
          summary: 'FS query failed',
          error: err.message,
          lastChecked: Date.now()
        };

        return {
          phoneTimestamp: Date.now(),
          totalBytes: null,
          usedBytes: null,
          freeBytes: null,
          fsUsedPercent: null,
          fsStatus: 'UNSUPPORTED',
          freeHeap: null,
          minFreeHeap: null,
          largestFreeBlock: null,
          allocatedBlocks: null,
          freeBlocks: null,
          wsClients: null,
          heapDeclineRateKbPerHour: null,
          possibleMemoryLeak: false
        };
      }
    });
  }

  /**
   * GET /time
   * Normal Priority: Periodic Time Synchronization
   */
  public async getTime(priority: RequestPriority = 'NORMAL'): Promise<number | null> {
    return esp32RequestQueue.enqueue<number | null>('GET /time', priority, async () => {
      try {
        if (this.simulationMode) {
          const res = await SimulationEngine.mockGetTime();
          this.capabilities.supportsTime = true;
          const nowIso = new Date(res.time * 1000).toISOString();
          this.diagnostics.rawTimeJson = JSON.stringify({ t: nowIso, e: res.time, o: 10800 });
          this.diagnostics.endpointProbes['/time'] = {
            endpoint: '/time',
            name: 'Time Synchronization',
            ok: true,
            httpStatus: 200,
            durationMs: 95,
            summary: `Simulated Time: ${nowIso} (Epoch: ${res.time})`,
            rawPreview: this.diagnostics.rawTimeJson,
            lastChecked: Date.now()
          };
          return res.time;
        }

        const result = await this.executeHttpRequest('/time');
        this.capabilities.supportsTime = true;
        this.diagnostics.rawTimeJson = result.rawText;

        let epoch: number | null = null;
        let iso: string | null = null;
        let offset: number | null = null;

        if (typeof result.data === 'number') {
          epoch = result.data;
        } else if (result.data && typeof result.data === 'object') {
          if (typeof result.data.e === 'number') epoch = result.data.e;
          else if (typeof result.data.time === 'number') epoch = result.data.time;
          if (typeof result.data.t === 'string') iso = result.data.t;
          if (typeof result.data.o === 'number') offset = result.data.o;
        }

        if (epoch === null) {
          const parsed = parseInt(result.rawText.trim(), 10);
          if (!isNaN(parsed)) epoch = parsed;
        }

        if (epoch && !iso) {
          iso = new Date(epoch * 1000).toISOString();
        }

        this.diagnostics.endpointProbes['/time'] = {
          endpoint: '/time',
          name: 'Time Synchronization',
          ok: true,
          httpStatus: result.status,
          durationMs: result.durationMs,
          summary: `ESP32 Time: ${iso || epoch || 'synced'} (Offset: ${offset ?? 0}s)`,
          rawPreview: result.rawText.slice(0, 100),
          lastChecked: Date.now()
        };

        return epoch;
      } catch (err: any) {
        this.diagnostics.endpointProbes['/time'] = {
          endpoint: '/time',
          name: 'Time Synchronization',
          ok: false,
          httpStatus: err.status || null,
          durationMs: err.durationMs || null,
          summary: 'Time request failed',
          error: err.message,
          lastChecked: Date.now()
        };
        return null;
      }
    });
  }

  /**
   * GET /loglist.php (Read-Only)
   * Low Priority
   */
  public async getLogList(priority: RequestPriority = 'LOW'): Promise<string[]> {
    return esp32RequestQueue.enqueue<string[]>('GET /loglist.php', priority, async () => {
      try {
        if (this.simulationMode) {
          this.capabilities.supportsLogList = true;
          const list = await SimulationEngine.mockGetLogList();
          this.diagnostics.rawLogListJson = JSON.stringify(list);
          this.diagnostics.endpointProbes['/loglist.php'] = {
            endpoint: '/loglist.php',
            name: 'Log Profiles (Read-Only)',
            ok: true,
            httpStatus: 200,
            durationMs: 110,
            summary: `Simulated logs: ${list.length} files available`,
            rawPreview: JSON.stringify(list),
            lastChecked: Date.now()
          };
          return list;
        }

        const result = await this.executeHttpRequest('/loglist.php');
        this.capabilities.supportsLogList = true;
        this.diagnostics.rawLogListJson = result.rawText;

        let list: string[] = [];
        let activeLog: string | null = null;
        let isRecording = false;

        if (Array.isArray(result.data)) {
          list = result.data;
        } else if (result.data && typeof result.data === 'object') {
          if (Array.isArray(result.data.list)) {
            list = [...result.data.list];
          }
          if (typeof result.data.log === 'string' && result.data.log) {
            const logName: string = result.data.log;
            activeLog = logName;
            if (!list.includes(logName)) list.unshift(logName);
          }
          if (result.data.rec === 1) isRecording = true;
        } else {
          list = result.rawText.split('\n').map(s => s.trim()).filter(Boolean);
        }

        const summary = activeLog
          ? `Active Log: "${activeLog}" (${isRecording ? 'RECORDING' : 'IDLE'}, ${list.length} logs)`
          : `Log list: ${list.length} available files`;

        this.diagnostics.endpointProbes['/loglist.php'] = {
          endpoint: '/loglist.php',
          name: 'Log Profiles (Read-Only)',
          ok: true,
          httpStatus: result.status,
          durationMs: result.durationMs,
          summary,
          rawPreview: result.rawText.slice(0, 120),
          lastChecked: Date.now()
        };

        return list;
      } catch (err: any) {
        this.diagnostics.endpointProbes['/loglist.php'] = {
          endpoint: '/loglist.php',
          name: 'Log Profiles (Read-Only)',
          ok: false,
          httpStatus: err.status || null,
          durationMs: err.durationMs || null,
          summary: 'Log list query failed',
          error: err.message,
          lastChecked: Date.now()
        };
        return [];
      }
    });
  }

  /**
   * GET /pid?fmt=text
   * Low Priority: Diagnostic parameter retrieval, ONLY called on explicit user request
   */
  public async getPidDiagnostics(): Promise<string> {
    return esp32RequestQueue.enqueue<string>('GET /pid?fmt=text', 'LOW', async () => {
      try {
        if (this.simulationMode) {
          this.capabilities.supportsPid = true;
          const text = await SimulationEngine.mockGetPid();
          this.diagnostics.rawPidText = text;
          this.diagnostics.endpointProbes['/pid?fmt=text'] = {
            endpoint: '/pid?fmt=text',
            name: 'PID Controller Parameters',
            ok: true,
            httpStatus: 200,
            durationMs: 120,
            summary: 'Simulated PID Parameters (Kp, Ki, Kd)',
            rawPreview: text.slice(0, 120),
            lastChecked: Date.now()
          };
          return text;
        }

        const result = await this.executeHttpRequest('/pid?fmt=text');
        this.capabilities.supportsPid = true;
        const text = result.rawText;
        this.diagnostics.rawPidText = text;

        const firstLine = text.split('\n')[0] || text.slice(0, 60);

        this.diagnostics.endpointProbes['/pid?fmt=text'] = {
          endpoint: '/pid?fmt=text',
          name: 'PID Controller Parameters',
          ok: true,
          httpStatus: result.status,
          durationMs: result.durationMs,
          summary: `PID Active: ${firstLine.trim().slice(0, 65)}`,
          rawPreview: text.slice(0, 120),
          lastChecked: Date.now()
        };

        return text;
      } catch (err: any) {
        const text = `PID Diagnostics unavailable: ${err.message}`;
        this.diagnostics.rawPidText = text;
        this.diagnostics.endpointProbes['/pid?fmt=text'] = {
          endpoint: '/pid?fmt=text',
          name: 'PID Controller Parameters',
          ok: false,
          httpStatus: err.status || null,
          durationMs: err.durationMs || null,
          summary: 'PID parameters query failed',
          error: err.message,
          lastChecked: Date.now()
        };
        return text;
      }
    });
  }

  /**
   * Sequential Probe of All 5 Endpoints
   * Safe execution via Single Request Queue (no simultaneous requests to ESP32)
   */
  public async probeAllEndpoints(): Promise<ApiDiagnosticsInfo> {
    await this.getStatus('NORMAL').catch(() => {});
    await this.getFs('NORMAL').catch(() => {});
    await this.getTime('NORMAL').catch(() => {});
    await this.getLogList('LOW').catch(() => {});
    await this.getPidDiagnostics().catch(() => {});
    return this.getDiagnostics();
  }

  /**
   * Tolerant normalization of /getstatus
   */
  private normalizeStatus(dto: RawStatusDto): BrewPiStatus {
    const parseTemp = (val: any): number | null => {
      if (val === null || val === undefined) return null;
      const num = Number(val);
      return isNaN(num) ? null : num;
    };

    const mode = (dto.mode || 'unknown').toString();
    const state = typeof dto.state === 'number' ? dto.state : 0;

    // Independent Actuator Detection (asdafe fork)
    const hasIh = dto.ih !== undefined && dto.ih !== null;
    const hasIc = dto.ic !== undefined && dto.ic !== null;
    const independentActuatorsAvailable = hasIh || hasIc;

    let heaterActive = false;
    let coolerActive = false;

    if (independentActuatorsAvailable) {
      heaterActive = Boolean(Number(dto.ih) === 1);
      coolerActive = Boolean(Number(dto.ic) === 1);
    } else {
      // Original vitotai state-based extraction
      // State 3: Heating, State 4: Cooling
      heaterActive = state === 3;
      coolerActive = state === 4;
    }

    const stateDescriptions: Record<number, string> = {
      0: 'Idle',
      1: 'Off',
      2: 'Door Open',
      3: 'Heating',
      4: 'Cooling',
      5: 'Wait to Cool',
      6: 'Wait to Heat',
      7: 'Wait for Peak',
      8: 'Peak',
      9: 'Wait Chamber Cool',
      10: 'Wait Chamber Heat'
    };

    const espTimestamp = dto.pt ? Number(dto.pt) * 1000 : null;

    return {
      phoneTimestamp: Date.now(),
      espTimestamp,
      espTimestampIsEstimated: espTimestamp === null,
      mode,
      state,
      stateDescription: stateDescriptions[state] || `State ${state}`,
      beerSet: parseTemp(dto.beerSet),
      beerTemp: parseTemp(dto.beerTemp),
      fridgeSet: parseTemp(dto.fridgeSet),
      fridgeTemp: parseTemp(dto.fridgeTemp),
      roomTemp: parseTemp(dto.roomTemp),
      heaterActive,
      coolerActive,
      independentActuatorsAvailable
    };
  }

  /**
   * Tolerant normalization of /fs
   */
  private normalizeFs(dto: RawFsDto): SystemHealthStatus {
    const parseNum = (v: any): number | null => {
      if (v === null || v === undefined) return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };

    const totalBytes = parseNum(dto.totalBytes);
    const usedBytes = parseNum(dto.usedBytes);
    let freeBytes: number | null = null;
    let fsUsedPercent: number | null = null;
    let fsStatus: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'UNSUPPORTED' = 'NORMAL';

    if (totalBytes !== null && usedBytes !== null && totalBytes > 0) {
      freeBytes = Math.max(0, totalBytes - usedBytes);
      fsUsedPercent = Math.round((usedBytes / totalBytes) * 100);

      if (fsUsedPercent >= 90) {
        fsStatus = 'CRITICAL';
      } else if (fsUsedPercent >= 80) {
        fsStatus = 'WARNING';
      }
    } else {
      fsStatus = 'UNSUPPORTED';
    }

    const freeHeap = parseNum(dto.freeHeap ?? dto.heap);

    return {
      phoneTimestamp: Date.now(),
      totalBytes,
      usedBytes,
      freeBytes,
      fsUsedPercent,
      fsStatus,
      freeHeap,
      minFreeHeap: parseNum(dto.minFreeHeap),
      largestFreeBlock: parseNum(dto.largestFreeBlock),
      allocatedBlocks: parseNum(dto.allocatedBlocks),
      freeBlocks: parseNum(dto.freeBlocks),
      wsClients: parseNum(dto.wsClients),
      heapDeclineRateKbPerHour: null, // calculated in MonitoringEngine over time
      possibleMemoryLeak: false
    };
  }
}
