package com.cadmium.music

import android.app.Application
import android.util.Log

/**
 * Application entry point. Registers the Cadmium playback service channel so
 * the Rust side can hand queue/transport commands to the Media3 service.
 */
class CadmiumApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Log.i("Cadmium", "CadmiumApplication started")
    }
}
