package com.cadmium.music

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * Exposes the Android audio-permission flow to the React renderer.
 *
 * Cadmium is read-only toward source audio and must never request
 * MANAGE_EXTERNAL_STORAGE. MediaStore access on Android 13+ uses the scoped
 * READ_MEDIA_AUDIO permission; on older versions we fall back to the broad
 * READ_EXTERNAL_STORAGE.
 *
 * The permission prompt uses the AndroidX Activity Result API. registerForActivityResult
 * is only valid during the activity's initialization window, so we register it in
 * load() and always invoke launch() on the main thread. If launch() cannot show the
 * system dialog (launcher unavailable, or it throws), we never leave the JS promise
 * hanging: we resolve a real denial and, where possible, route the user to system
 * settings so they can grant manually.
 */
@TauriPlugin
class PermissionBridge(private val activity: Activity) : Plugin(activity) {
    private var launcher: ActivityResultLauncher<String>? = null
    private var pendingInvoke: Invoke? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun load(webView: WebView) {
        if (activity is ComponentActivity) {
            launcher = activity.registerForActivityResult(
                ActivityResultContracts.RequestPermission()
            ) { isGranted ->
                val invoke = pendingInvoke ?: return@registerForActivityResult
                pendingInvoke = null
                val permission = audioPermission()
                val shouldShow = activity.shouldShowRequestPermissionRationale(permission)
                invoke.resolve(permissionResult(granted = isGranted, shouldShowRationale = shouldShow))
            }
        }
        // Inject the bridge global so the renderer can call native permission
        // APIs without importing a Tauri plugin module.
        val script = """
            (function() {
              if (window.__CADMIUM_ANDROID__) return;
              window.__CADMIUM_ANDROID__ = {
                requestAudioPermission: function() {
                  return window.__TAURI__.core.invoke('plugin:permissionbridge|requestAudioPermission');
                },
                openAppSettings: function() {
                  return window.__TAURI__.core.invoke('plugin:permissionbridge|openAppSettings');
                }
              };
            })();
        """.trimIndent()
        activity.runOnUiThread {
            webView.evaluateJavascript(script, null)
        }
    }

    @Command
    fun requestAudioPermission(invoke: Invoke) {
        val permission = audioPermission()
        when {
            ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED -> {
                invoke.resolve(permissionResult(granted = true, shouldShowRationale = false))
            }
            launcher != null -> {
                pendingInvoke = invoke
                // launch() MUST run on the main thread; if the activity result
                // machinery can't show the dialog it throws — resolve a real
                // denial instead of hanging the JS promise forever.
                mainHandler.post {
                    try {
                        launcher!!.launch(permission)
                    } catch (e: Exception) {
                        pendingInvoke = null
                        invoke.resolve(permissionResult(granted = false, shouldShowRationale = false))
                    }
                }
            }
            else -> {
                // Host is not a ComponentActivity; report denied (settings fallback).
                invoke.resolve(permissionResult(granted = false, shouldShowRationale = false))
            }
        }
    }

    @Command
    fun openAppSettings(invoke: Invoke) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", activity.packageName, null)
        }
        activity.startActivity(intent)
        invoke.resolve(JSObject())
    }

    private fun audioPermission(): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            android.Manifest.permission.READ_MEDIA_AUDIO
        } else {
            android.Manifest.permission.READ_EXTERNAL_STORAGE
        }
    }

    private fun permissionResult(granted: Boolean, shouldShowRationale: Boolean): JSObject {
        val result = JSObject()
        result.put("granted", granted)
        result.put("shouldShowRationale", shouldShowRationale)
        return result
    }
}
