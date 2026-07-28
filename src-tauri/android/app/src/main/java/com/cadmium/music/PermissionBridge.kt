package com.cadmium.music

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * Android audio permission bridge.
 *
 * Tauri owns the Activity Result lifecycle for permissions declared through
 * @TauriPlugin. This deliberately avoids manually calling
 * registerForActivityResult from Plugin.load(), which can run after the host
 * Activity is STARTED and crash the app during startup.
 *
 * Android 13+ uses READ_MEDIA_AUDIO; Android 12 and older use
 * READ_EXTERNAL_STORAGE. The renderer requests both aliases and accepts either
 * granted result, so the platform-appropriate permission wins.
 */
@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.READ_MEDIA_AUDIO], alias = "mediaAudio"),
        Permission(strings = [Manifest.permission.READ_EXTERNAL_STORAGE], alias = "externalStorage")
    ]
)
class PermissionBridge(private val activity: Activity) : Plugin(activity) {
    @Command
    fun openAppSettings(invoke: Invoke) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", activity.packageName, null)
        }
        activity.startActivity(intent)
        invoke.resolve(JSObject())
    }
}
