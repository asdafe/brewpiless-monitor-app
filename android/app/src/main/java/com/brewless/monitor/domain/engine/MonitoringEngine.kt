package com.brewless.monitor.domain.engine

import com.brewless.monitor.data.api.BrewPiApiClient
import com.brewless.monitor.data.api.BrewPiStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.delay

enum class ConnectionState { HEALTHY, TEMPORARY_FAILURE, OFFLINE_ALERTED, RECOVERED }

class MonitoringEngine(private val apiClient: BrewPiApiClient) {
    private val _connectionState = MutableStateFlow(ConnectionState.HEALTHY)
    val connectionState = _connectionState.asStateFlow()

    private var consecutiveFailures = 0
    private val failureThreshold = 3

    suspend fun pollCycle(): BrewPiStatus? {
        return try {
            var status = apiClient.getStatus()

            // Sensor null retries: 2 sequential retries
            if (status.beerTemp == null || status.fridgeTemp == null || status.roomTemp == null) {
                delay(1000)
                try { status = apiClient.getStatus() } catch (_: Exception) {}
            }

            consecutiveFailures = 0
            _connectionState.value = ConnectionState.HEALTHY
            status
        } catch (e: Exception) {
            consecutiveFailures++
            if (consecutiveFailures >= failureThreshold) {
                _connectionState.value = ConnectionState.OFFLINE_ALERTED
            } else {
                _connectionState.value = ConnectionState.TEMPORARY_FAILURE
            }
            null
        }
    }
}
