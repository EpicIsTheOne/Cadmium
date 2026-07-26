package com.cadmium.music

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import app.tauri.TauriActivity

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
    }
}
