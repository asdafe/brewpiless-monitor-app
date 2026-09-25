package com.brewless.monitor.data.api

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.delay

/**
 * Strict single-request queue for ESP32 safety.
 * Guarantees:
 * 1. Only ONE HTTP call executes at any moment (no overlapping sockets).
 * 2. Enforces configured inter-request delay after completion (default: 1000ms).
 */
class SingleRequestQueue(private var interRequestDelayMs: Long = 1000L) {
    private val mutex = Mutex()
    private var lastRequestFinishedAt: Long = 0L

    fun setInterRequestDelay(delayMs: Long) {
        this.interRequestDelayMs = delayMs.coerceIn(500L, 5000L)
    }

    suspend fun <T> execute(taskName: String, block: suspend () -> T): T {
        return mutex.withLock {
            val now = System.currentTimeMillis()
            val timeSinceLast = now - lastRequestFinishedAt
            val remainingWait = interRequestDelayMs - timeSinceLast
            if (remainingWait > 0) {
                delay(remainingWait)
            }

            try {
                block()
            } finally {
                lastRequestFinishedAt = System.currentTimeMillis()
            }
        }
    }
}
