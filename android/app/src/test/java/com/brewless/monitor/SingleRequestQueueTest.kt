package com.brewless.monitor

import com.brewless.monitor.data.api.SingleRequestQueue
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SingleRequestQueueTest {

    @Test
    fun testStrictSingleConcurrency() = runBlocking {
        val queue = SingleRequestQueue(50L)
        var activeCount = 0
        var maxConcurrent = 0

        val job1 = async {
            queue.execute("Req 1") {
                activeCount++
                if (activeCount > maxConcurrent) maxConcurrent = activeCount
                delay(40)
                activeCount--
            }
        }

        val job2 = async {
            queue.execute("Req 2") {
                activeCount++
                if (activeCount > maxConcurrent) maxConcurrent = activeCount
                delay(40)
                activeCount--
            }
        }

        job1.await()
        job2.await()

        assertEquals("Queue must never exceed 1 concurrent request", 1, maxConcurrent)
    }

    @Test
    fun testInterRequestDelayEnforced() = runBlocking {
        val delayMs = 150L
        val queue = SingleRequestQueue(delayMs)
        val timestamps = mutableListOf<Long>()

        queue.execute("Req 1") {
            delay(20)
            timestamps.add(System.currentTimeMillis())
        }

        queue.execute("Req 2") {
            delay(20)
            timestamps.add(System.currentTimeMillis())
        }

        val difference = timestamps[1] - timestamps[0]
        assertTrue("Inter-request delay was $difference ms, expected at least ${delayMs - 20} ms", difference >= delayMs - 20)
    }
}
