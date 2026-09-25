/**
 * SingleRequestQueue.ts
 *
 * CRITICAL ESP32 PROTECTION GUARANTEE:
 * 1. Strict single-request concurrency: NEVER sends more than 1 HTTP request to BrewPiLess at the same time.
 * 2. Enforces a mandatory inter-request delay (default: 1000ms) AFTER any request completes before firing the next.
 * 3. Priority levels:
 *    - HIGH: Monitoring /getstatus, Sensor null retries
 *    - NORMAL: Periodic /fs, /time sync, standard health checks
 *    - LOW: Manual diagnostics, /pid?fmt=text
 * 4. Transparent logging, queue depth inspection, and testability.
 */

export type RequestPriority = 'HIGH' | 'NORMAL' | 'LOW';

export interface QueuedTask<T> {
  id: string;
  name: string;
  priority: RequestPriority;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  enqueuedAt: number;
}

export interface QueueState {
  isBusy: boolean;
  activeTaskName: string | null;
  queueDepth: number;
  lastRequestCompletedAt: number | null;
  interRequestDelayMs: number;
  totalRequestsCompleted: number;
  totalTimeWaitedForDelayMs: number;
}

export class SingleRequestQueue {
  private queue: QueuedTask<any>[] = [];
  private isProcessing = false;
  private activeTaskName: string | null = null;
  private lastRequestCompletedAt: number | null = null;
  private interRequestDelayMs: number = 1000;
  private totalRequestsCompleted = 0;
  private totalTimeWaitedForDelayMs = 0;

  // Listeners for UI state updates
  private stateListeners: ((state: QueueState) => void)[] = [];

  constructor(defaultInterRequestDelayMs: number = 1000) {
    this.interRequestDelayMs = defaultInterRequestDelayMs;
  }

  public setInterRequestDelay(delayMs: number): void {
    // Clamped between 500ms and 5000ms
    this.interRequestDelayMs = Math.max(500, Math.min(5000, delayMs));
    this.notifyState();
  }

  public getInterRequestDelay(): number {
    return this.interRequestDelayMs;
  }

  public getState(): QueueState {
    return {
      isBusy: this.isProcessing,
      activeTaskName: this.activeTaskName,
      queueDepth: this.queue.length,
      lastRequestCompletedAt: this.lastRequestCompletedAt,
      interRequestDelayMs: this.interRequestDelayMs,
      totalRequestsCompleted: this.totalRequestsCompleted,
      totalTimeWaitedForDelayMs: this.totalTimeWaitedForDelayMs
    };
  }

  public subscribe(listener: (state: QueueState) => void): () => void {
    this.stateListeners.push(listener);
    listener(this.getState());
    return () => {
      this.stateListeners = this.stateListeners.filter(l => l !== listener);
    };
  }

  private notifyState(): void {
    const state = this.getState();
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('Error in queue state listener', err);
      }
    }
  }

  /**
   * Enqueue a request to be executed safely
   */
  public enqueue<T>(name: string, priority: RequestPriority, execute: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name,
        priority,
        execute,
        resolve,
        reject,
        enqueuedAt: Date.now()
      };

      // Insert based on priority: HIGH at top of its band, NORMAL in middle, LOW at end
      const priorityOrder: Record<RequestPriority, number> = {
        HIGH: 1,
        NORMAL: 2,
        LOW: 3
      };

      let insertIndex = this.queue.length;
      for (let i = 0; i < this.queue.length; i++) {
        if (priorityOrder[task.priority] < priorityOrder[this.queue[i].priority]) {
          insertIndex = i;
          break;
        }
      }

      this.queue.splice(insertIndex, 0, task);
      this.notifyState();
      this.processNext();
    });
  }

  /**
   * Process the next task in the queue if not already processing
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    if (this.queue.length === 0) {
      this.activeTaskName = null;
      this.notifyState();
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift()!;
    this.activeTaskName = task.name;
    this.notifyState();

    try {
      // 1. Mandatory Inter-Request Delay Check:
      // If a previous request completed recently, wait until the configured delay has elapsed
      if (this.lastRequestCompletedAt !== null) {
        const timeSinceLast = Date.now() - this.lastRequestCompletedAt;
        const remainingWait = this.interRequestDelayMs - timeSinceLast;

        if (remainingWait > 0) {
          this.totalTimeWaitedForDelayMs += remainingWait;
          await new Promise(resolve => setTimeout(resolve, remainingWait));
        }
      }

      // 2. Execute the single request
      const result = await task.execute();
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
      // 3. Mark completion timestamp for the next task's delay calculation
      this.lastRequestCompletedAt = Date.now();
      this.totalRequestsCompleted++;
      this.isProcessing = false;
      this.activeTaskName = null;
      this.notifyState();

      // 4. Continue with next task in queue
      if (this.queue.length > 0) {
        // Small async tick so callers can receive promise resolution before next starts
        setTimeout(() => this.processNext(), 0);
      }
    }
  }

  /**
   * Clear all pending non-executing requests
   */
  public clear(): void {
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      task.reject(new Error('Request cancelled: Queue was cleared'));
    }
    this.notifyState();
  }
}

// Global shared singleton instance for the entire application
export const esp32RequestQueue = new SingleRequestQueue(1000);
