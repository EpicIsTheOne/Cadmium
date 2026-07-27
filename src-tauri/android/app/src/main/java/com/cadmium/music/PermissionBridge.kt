package com.cadmium.music

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.WebView
import androidx.activity.ComponentActivity
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
 * READ_EXTERNAL_STORAGE. The bridge injects a small `window.__CADMIUM_ANDROID__`
 * global that the renderer calls, and this plugin answers it. The runtime
 * permission prompt uses the AndroidX Activity Result API (registerForActivityResult),
 * which requires the host activity to be a ComponentActivity (TauriActivity is).
 */
@TauriPlugin
class PermissionBridge(private val activity: Activity) : Plugin(activity) {
    private var launcher: androidx.activity.result.ActivityResultLauncher<String>? = null
    private var pendingInvoke: Invoke? = null

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
                launcher!!.launch(permission)
            }
            else -> {
                // Host is not a ComponentActivity; report denied rather than crash.
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
