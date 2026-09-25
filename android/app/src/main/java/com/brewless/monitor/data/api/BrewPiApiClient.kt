package com.brewless.monitor.data.api

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
                if (!response.isSuccessful) throw Exception("HTTP ${response.code}")
                val body = response.body?.string() ?: throw Exception("Empty body")
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

        // asdafe fork independent actuators (ih / ic) vs vitotai state
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
}
