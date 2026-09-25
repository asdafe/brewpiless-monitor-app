/**
 * SimulationEngine.ts
 *
 * Provides realistic fake ESP32 responses and scenarios for:
 * - Healthy fermentation
 * - Sensor nulls (beer, fridge, room)
 * - Network timeouts and invalid JSON
 * - Temperature excursions (Beer high/low, Fridge high/low)
 * - Stale/frozen sensor values
 * - Sudden rate-of-change jumps
 * - Heap drop & sustained declining trend (possible memory leak)
 * - Filesystem 85% / 95% full
 * - Independent actuators: Heater ON, Cooler ON, Heater+Cooler ON simultaneously (asdafe fork)
 * - Recovery detection
 */

import { RawStatusDto, RawFsDto } from '../types/brewpi';

export type SimulationScenario =
  | 'HEALTHY'
  | 'BEER_NULL'
  | 'FRIDGE_NULL'
  | 'ROOM_NULL'
  | 'TIMEOUT'
  | 'INVALID_JSON'
  | 'BEER_HIGH'
  | 'BEER_LOW'
  | 'FRIDGE_HIGH'
  | 'FRIDGE_LOW'
  | 'FROZEN_TEMP'
  | 'SUDDEN_JUMP'
  | 'HEAP_DROP'
  | 'HEAP_DECLINING_TREND'
  | 'FS_FULL'
  | 'HEATER_ON'
  | 'COOLER_ON'
  | 'HEATER_AND_COOLER_ON'
  | 'RECOVERY';

export class SimulationEngine {
  private static currentScenario: SimulationScenario = 'HEALTHY';
  private static simTimeOffsetSeconds = 0;
  private static customBeerTemp: number | null = 12.1;
  private static customFridgeTemp: number | null = 3.2;
  private static customRoomTemp: number | null = 22.4;
  private static simulatedFreeHeap: number = 185420;
  private static heapDeclineSamples: number[] = [];

  public static setScenario(scenario: SimulationScenario): void {
    this.currentScenario = scenario;
    if (scenario === 'HEAP_DECLINING_TREND') {
      this.simulatedFreeHeap = 175000;
      this.heapDeclineSamples = [185000, 182000, 179000, 176000, 173000];
    } else if (scenario === 'HEAP_DROP') {
      this.simulatedFreeHeap = 65000;
    } else {
      this.simulatedFreeHeap = 185420;
    }
  }

  public static getScenario(): SimulationScenario {
    return this.currentScenario;
  }

  /**
   * Generates simulated GET /getstatus response
   */
  public static async mockGetStatus(): Promise<RawStatusDto> {
    // Artificial small delay to simulate real ESP32 network latency (150ms)
    await new Promise(r => setTimeout(r, 150));

    if (this.currentScenario === 'TIMEOUT') {
      throw new Error('Simulation: Connection timed out (ESP32 unresponsive)');
    }

    if (this.currentScenario === 'INVALID_JSON') {
      throw new SyntaxError('Simulation: Unexpected token < in JSON at position 0 (ESP32 returned HTML error page)');
    }

    const baseDto: RawStatusDto = {
      mode: 'b',
      state: 4, // Default Cooling
      beerSet: 12.0,
      beerTemp: 12.1,
      fridgeSet: 3.0,
      fridgeTemp: 3.2,
      roomTemp: 22.4,
      ih: 0,
      ic: 1, // Cooler on
      pt: Math.floor(Date.now() / 1000)
    };

    switch (this.currentScenario) {
      case 'BEER_NULL':
        return { ...baseDto, beerTemp: null };

      case 'FRIDGE_NULL':
        return { ...baseDto, fridgeTemp: null };

      case 'ROOM_NULL':
        return { ...baseDto, roomTemp: null };

      case 'BEER_HIGH':
        return { ...baseDto, beerTemp: 15.6, state: 4, ic: 1, ih: 0 }; // 3.6°C above set

      case 'BEER_LOW':
        return { ...baseDto, beerTemp: 8.8, state: 3, ic: 0, ih: 1 }; // 3.2°C below set

      case 'FRIDGE_HIGH':
        return { ...baseDto, fridgeTemp: 8.5, state: 4, ic: 1 };

      case 'FRIDGE_LOW':
        return { ...baseDto, fridgeTemp: -3.8, state: 3, ih: 1, ic: 0 };

      case 'FROZEN_TEMP':
        // Value exactly frozen while cooling is on
        return { ...baseDto, beerTemp: 14.0, state: 4, ic: 1 };

      case 'SUDDEN_JUMP':
        return { ...baseDto, beerTemp: 17.5 }; // Sudden jump from 12.1 to 17.5

      case 'HEATER_ON':
        return { ...baseDto, state: 3, ih: 1, ic: 0 };

      case 'COOLER_ON':
        return { ...baseDto, state: 4, ih: 0, ic: 1 };

      case 'HEATER_AND_COOLER_ON':
        // asdafe fork supports both ih=1 and ic=1 simultaneously (e.g. chamber tuning)
        return { ...baseDto, state: 4, ih: 1, ic: 1 };

      case 'RECOVERY':
        return { ...baseDto, beerTemp: 12.0, fridgeTemp: 3.0, roomTemp: 22.0, state: 0, ih: 0, ic: 0 };

      case 'HEALTHY':
      default:
        // Tiny natural fluctuation (±0.05 °C)
        const jitter = (Math.random() - 0.5) * 0.08;
        return {
          ...baseDto,
          beerTemp: Number((12.1 + jitter).toFixed(2)),
          fridgeTemp: Number((3.2 + jitter * 1.5).toFixed(2))
        };
    }
  }

  /**
   * Generates simulated GET /fs response
   */
  public static async mockGetFs(): Promise<RawFsDto> {
    await new Promise(r => setTimeout(r, 120));

    if (this.currentScenario === 'TIMEOUT') {
      throw new Error('Simulation: Connection timed out during /fs call');
    }

    if (this.currentScenario === 'FS_FULL') {
      return {
        totalBytes: 1500000,
        usedBytes: 1410000, // 94% used (CRITICAL)
        freeHeap: 185000,
        minFreeHeap: 140000,
        largestFreeBlock: 95000,
        wsClients: 1
      };
    }

    if (this.currentScenario === 'HEAP_DROP') {
      return {
        totalBytes: 1500000,
        usedBytes: 420000,
        freeHeap: 48000, // Very low free heap
        minFreeHeap: 42000,
        largestFreeBlock: 24000,
        wsClients: 2
      };
    }

    if (this.currentScenario === 'HEAP_DECLINING_TREND') {
      // Simulate steadily declining heap over successive calls
      this.simulatedFreeHeap = Math.max(80000, this.simulatedFreeHeap - 1800);
      return {
        totalBytes: 1500000,
        usedBytes: 420000,
        freeHeap: this.simulatedFreeHeap,
        minFreeHeap: this.simulatedFreeHeap - 12000,
        largestFreeBlock: Math.floor(this.simulatedFreeHeap * 0.45),
        wsClients: 1
      };
    }

    return {
      totalBytes: 1500000,
      usedBytes: 420000, // 28% used (HEALTHY)
      freeHeap: 185420,
      minFreeHeap: 165000,
      largestFreeBlock: 110000,
      allocatedBlocks: 1420,
      freeBlocks: 340,
      wsClients: 1
    };
  }

  /**
   * Generates simulated GET /time response
   */
  public static async mockGetTime(): Promise<{ time: number }> {
    await new Promise(r => setTimeout(r, 100));
    return { time: Math.floor(Date.now() / 1000) };
  }

  /**
   * Generates simulated GET /loglist.php response (strictly read-only)
   */
  public static async mockGetLogList(): Promise<string[]> {
    await new Promise(r => setTimeout(r, 100));
    return [
      '/log/batch_octoberfest_2026.csv',
      '/log/batch_ipa_dryhop.csv',
      '/log/batch_stout_bourbon.csv'
    ];
  }

  /**
   * Generates simulated GET /pid?fmt=text response
   */
  public static async mockGetPid(): Promise<string> {
    await new Promise(r => setTimeout(r, 200));
    return `BrewPi PID Parameters (fmt=text):
Kp: 5.000
Ki: 0.250
Kd: 1.500
iMaxErr: 0.500
idleRangeH: 1.000
idleRangeL: -1.000
heatTargetHysteresis: 0.100
coolTargetHysteresis: 0.100
maxHeatTimeForEstimate: 600
maxCoolTimeForEstimate: 1200
filteredKp: 5.000
state: cooling
activeP: 2.15
activeI: 0.12
activeD: -0.05
output: 45.2%`;
  }
}
