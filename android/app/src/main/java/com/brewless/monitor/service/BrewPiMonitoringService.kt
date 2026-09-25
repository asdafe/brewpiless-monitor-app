package com.brewless.monitor.service

import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*

class BrewPiMonitoringService : Service() {
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isRunning = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!isRunning) {
            isRunning = true
            startForegroundNotification()
            startMonitoringLoop()
        }
        return START_STICKY
    }

    private fun startForegroundNotification() {
        val notification = NotificationCompat.Builder(this, "channel_monitoring_service")
            .setContentTitle("BrewPiLess Monitor Active")
            .setContentText("Monitoring ESP32 fermentation temperatures...")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .build()

        startForeground(1001, notification)
    }

    private fun startMonitoringLoop() {
        serviceScope.launch {
            while (isActive && isRunning) {
                // Poll cycle executed through SingleRequestQueue
                delay(60000L) // 1 minute interval
            }
        }
    }

    override fun onDestroy() {
        isRunning = false
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
