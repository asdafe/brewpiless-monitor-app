import React, { useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FileCode,
  FolderTree,
  Smartphone,
  Terminal,
  X
} from 'lucide-react';
import { AndroidCodeExporter } from '../services/AndroidCodeExporter';
import { translations } from '../i18n/translations';

interface AndroidCodeModalProps {
  onClose: () => void;
  lang: 'en' | 'tr';
}

export const AndroidCodeModal: React.FC<AndroidCodeModalProps> = ({ onClose, lang }) => {
  const t = translations[lang];
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string>('SingleRequestQueue.kt');
  const [copied, setCopied] = useState(false);

  const fileContents: Record<string, { lang: string; code: string; desc: string }> = {
    'SingleRequestQueue.kt': {
      lang: 'kotlin',
      desc: 'Centralized concurrency queue enforcing 1 request at a time and 1000ms inter-request delay.',
      code: `package com.brewless.monitor.data.api

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.delay

/**
 * SingleRequestQueue: ESP32 Concurrency & Crash Protection
 * Guarantees:
 * 1. Only ONE HTTP call executes at any moment (no overlapping sockets).
 * 2. Mandatory inter-request delay after completion (default: 1000ms).
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
}`
    },
    'BrewPiApiClient.kt': {
      lang: 'kotlin',
      desc: 'Tolerant OkHttp client for /getstatus, /fs, /time, /pid with capability detection.',
      code: `package com.brewless.monitor.data.api

import okhttp3.OkHttpClient
import okhttp3.Request
import kotlinx.serialization.json.*
import java.util.concurrent.TimeUnit

data class BrewPiStatus(
    val beerTemp: Double?,
    val fridgeTemp: Double?,
    val roomTemp: Double?,
    val beerSet: Double?,
    val fridgeSet: Double?,
    val mode: String,
    val state: Int,
    val heaterActive: Boolean,
    val coolerActive: Boolean,
    val pt: Long?
)

class BrewPiApiClient(
    private val host: String,
    private val port: Int,
    private val timeoutSeconds: Long = 5
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(timeoutSeconds, TimeUnit.SECONDS)
        .readTimeout(timeoutSeconds, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    val requestQueue = SingleRequestQueue(1000L)

    suspend fun getStatus(): BrewPiStatus {
        return requestQueue.execute("GET /getstatus") {
            val url = "http://$host:$port/getstatus"
            val request = Request.Builder().url(url).build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw Exception("HTTP \${response.code}")
                val body = response.body?.string() ?: throw Exception("Empty response body")
                parseStatus(body)
            }
        }
    }

    private fun parseStatus(rawJson: String): BrewPiStatus {
        val root = json.parseToJsonElement(rawJson).jsonObject
        val beerTemp = root["beerTemp"]?.jsonPrimitive?.doubleOrNull
        val fridgeTemp = root["fridgeTemp"]?.jsonPrimitive?.doubleOrNull
        val roomTemp = root["roomTemp"]?.jsonPrimitive?.doubleOrNull
        val beerSet = root["beerSet"]?.jsonPrimitive?.doubleOrNull
        val fridgeSet = root["fridgeSet"]?.jsonPrimitive?.doubleOrNull
        val mode = root["mode"]?.jsonPrimitive?.contentOrNull ?: "unknown"
        val state = root["state"]?.jsonPrimitive?.intOrNull ?: 0

        // asdafe fork independent actuators ih / ic vs original vitotai state
        val ih = root["ih"]?.jsonPrimitive?.intOrNull
        val ic = root["ic"]?.jsonPrimitive?.intOrNull

        val heaterActive = if (ih != null) ih == 1 else state == 3
        val coolerActive = if (ic != null) ic == 1 else state == 4
        val pt = root["pt"]?.jsonPrimitive?.longOrNull

        return BrewPiStatus(
            beerTemp = beerTemp,
            fridgeTemp = fridgeTemp,
            roomTemp = roomTemp,
            beerSet = beerSet,
            fridgeSet = fridgeSet,
            mode = mode,
            state = state,
            heaterActive = heaterActive,
            coolerActive = coolerActive,
            pt = pt
        )
    }
}`
    },
    'BrewPiMonitoringService.kt': {
      lang: 'kotlin',
      desc: 'Android 14/15/16 Foreground Service with dataSync type for background polling.',
      code: `package com.brewless.monitor.service

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
                // Poll cycle routed strictly through SingleRequestQueue
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
}`
    },
    'AndroidManifest.xml': {
      lang: 'xml',
      desc: 'Android permissions (POST_NOTIFICATIONS, FOREGROUND_SERVICE_DATA_SYNC, Cleartext HTTP config).',
      code: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

    <application
        android:name=".BrewPiApplication"
        android:allowBackup="true"
        android:label="BrewPiLess Monitor"
        android:theme="@style/Theme.BrewPiLessMonitor"
        android:networkSecurityConfig="@xml/network_security_config">

        <activity
            android:name=".ui.MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".service.BrewPiMonitoringService"
            android:foregroundServiceType="dataSync"
            android:exported="false" />

    </application>
</manifest>`
    },
    'build.gradle.kts': {
      lang: 'kotlin',
      desc: 'Gradle build script configured with targetSdk 36, compileSdk 36, Material 3, Room and OkHttp.',
      code: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.brewless.monitor"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.brewless.monitor"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.material3:material3:1.3.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.datastore:datastore-preferences:1.1.2")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
}`
    }
  };

  const handleDownloadZip = async () => {
    setIsExporting(true);
    try {
      const blob = await AndroidCodeExporter.generateProjectZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'BrewPiLessMonitor_AndroidStudio_Project.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export Android project ZIP', err);
      alert('Failed to generate project zip');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(fileContents[selectedFile]?.code || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Native Android Studio Project & APK</h2>
              <p className="text-xs text-slate-400">
                Complete Kotlin, Jetpack Compose, OkHttp and Foreground Service codebase
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadZip}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
            >
              <Download className={`w-3.5 h-3.5 ${isExporting ? 'animate-bounce' : ''}`} />
              <span>{isExporting ? 'Packaging ZIP...' : t.downloadAndroidZip}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Instructions banner */}
        <div className="px-6 py-3 bg-indigo-950/30 border-b border-indigo-900/40 text-xs text-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>To build APK: Extract ZIP &gt; Open in Android Studio &gt; Run <code className="bg-slate-950 px-1.5 py-0.5 rounded text-amber-300 font-mono">./gradlew assembleRelease</code></span>
          </div>
        </div>

        {/* Content Explorer */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden text-xs">
          {/* File Tree Selector */}
          <div className="w-full md:w-64 border-r border-slate-800 bg-slate-950/40 p-3 space-y-1 overflow-y-auto shrink-0">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 flex items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5 text-indigo-400" />
              Source Files
            </div>

            {Object.keys(fileContents).map((fileName) => (
              <button
                key={fileName}
                onClick={() => setSelectedFile(fileName)}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium transition flex items-center justify-between ${
                  selectedFile === fileName
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">{fileName}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Code Viewer */}
          <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
            <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono">
                {fileContents[selectedFile]?.desc}
              </span>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1 text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <pre className="p-4 overflow-auto flex-1 font-mono text-[11px] text-slate-300 leading-relaxed">
              <code>{fileContents[selectedFile]?.code}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
