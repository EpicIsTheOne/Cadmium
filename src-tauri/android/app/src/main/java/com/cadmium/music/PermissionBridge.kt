package com.cadmium.music

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import android.webkit.WebView

/**
 * Exposes the Android audio-permission flow to the React renderer.
 *
 * Cadmium is read-only toward source audio and must never request
 * MANAGE_EXTERNAL_STORAGE. MediaStore access on Android 13+ uses the scoped
 * READ_MEDIA_AUDIO permission; on older versions we fall back to the broad
 * READ_EXTERNAL_STORAGE. The bridge injects a small `window.__CADMIUM_ANDROID__`
 * global that the renderer calls, and this plugin answers it.
 */
@TauriPlugin
class PermissionBridge(private val activity: Activity) : Plugin(activity) {
    companion object {
        const val REQUEST_CODE = 0xCAD1
    }

    private var pendingInvoke: Invoke? = null

    override fun load(webView: WebView) {
        // Inject the bridge global so the renderer can call native permission
        // APIs without importing a Tauri plugin module. The functions simply
        // forward to this plugin's commands over the normal invoke channel.
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
            // If we should show a rationale the user can still be prompted.
            activity.shouldShowRequestPermissionRationale(permission) -> {
                pendingInvoke = invoke
                activity.requestPermissions(arrayOf(permission), REQUEST_CODE)
            }
            else -> {
                pendingInvoke = invoke
                activity.requestPermissions(arrayOf(permission), REQUEST_CODE)
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

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        if (requestCode != REQUEST_CODE) return
        val invoke = pendingInvoke ?: return
        pendingInvoke = null
        val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
        val shouldShow = permissions.isNotEmpty() &&
            activity.shouldShowRequestPermissionRationale(permissions[0])
        invoke.resolve(permissionResult(granted = granted, shouldShowRationale = shouldShow))
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
