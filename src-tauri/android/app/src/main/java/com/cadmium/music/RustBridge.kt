package com.cadmium.music

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import androidx.media3.common.MediaItem
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import android.webkit.WebView

/**
 * Native bridge between the Rust/React playback commands and the Media3
 * PlaybackService.
 *
 * The React renderer computes the full queue (order, repeat/shuffle) and sends
 * it here. This plugin binds to the foreground PlaybackService (so audio keeps
 * playing in the background and system media keys work) and drives it. State
 * changes from the service are pushed back to the renderer as the
 * `android-playback-state` Tauri event consumed by the mobile engine.
 */
@TauriPlugin
class RustBridge(private val activity: Activity) : Plugin(activity) {

    private var service: PlaybackService? = null
    private var bound = false
    private val pendingActions = mutableListOf<() -> Unit>()

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            service = (binder as PlaybackService.LocalBinder).getService()
            bound = true
            // Flush any commands that arrived before the service connected.
            val actions = pendingActions.toList()
            pendingActions.clear()
            for (action in actions) action()
        }

        override fun onServiceDisconnected(name: ComponentName) {
            service = null
            bound = false
        }
    }

    override fun load(webView: WebView) {
        // Route service state changes to the renderer as a Tauri event.
        RustBridge.stateCallback = { state ->
            val payload = JSObject()
            for ((key, value) in state) {
                when (value) {
                    null -> payload.put(key, JSObject.NULL)
                    is Boolean -> payload.put(key, value)
                    is Int -> payload.put(key, value)
                    is Long -> payload.put(key, value)
                    is Double -> payload.put(key, value)
                    is Float -> payload.put(key, value.toDouble())
                    else -> payload.put(key, value.toString())
                }
            }
            trigger("android-playback-state", payload)
        }
    }

    private fun ensureService(): PlaybackService? {
        if (service != null) return service
        val intent = Intent(activity, PlaybackService::class.java)
        // Promote to a foreground media-playback service (user-initiated path).
        activity.startForegroundService(intent)
        activity.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        return service
    }

    private fun withService(action: (PlaybackService) -> Unit) {
        val existing = ensureService()
        if (existing != null) {
            action(existing)
        } else {
            // Service not bound yet; run once connected.
            pendingActions.add { withService(action) }
        }
    }

    @Command
    fun setQueue(invoke: Invoke) {
        val body = invoke.getArgs()
        val items = body.getJSONArray("items")
        val startIndex = if (body.has("startIndex")) body.getInt("startIndex") else 0
        val autoplay = if (body.has("autoplay")) body.getBoolean("autoplay") else true
        val mediaItems = (0 until items.length()).map { i ->
            val entry = items.getJSONObject(i)
            val locator = entry.optString("locator")
            val trackId = entry.optString("trackId")
            MediaItem.Builder()
                .setUri(locator)
                .setMediaId(trackId)
                .setTag(trackId)
                .build()
        }
        withService { svc ->
            svc.setQueue(mediaItems, startIndex, 0L)
            if (!autoplay) svc.pause()
            invoke.resolve(JSObject())
        }
    }

    @Command
    fun play(invoke: Invoke) { withService { it.play() }; invoke.resolve(JSObject()) }

    @Command
    fun pause(invoke: Invoke) { withService { it.pause() }; invoke.resolve(JSObject()) }

    @Command
    fun toggle(invoke: Invoke) { withService { it.toggle() }; invoke.resolve(JSObject()) }

    @Command
    fun next(invoke: Invoke) { withService { it.next() }; invoke.resolve(JSObject()) }

    @Command
    fun previous(invoke: Invoke) { withService { it.previous() }; invoke.resolve(JSObject()) }

    @Command
    fun seek(invoke: Invoke) {
        val position = invoke.getArgs().optDouble("positionMs", 0.0)
        withService { it.seek(position.toLong()) }
        invoke.resolve(JSObject())
    }

    @Command
    fun setVolume(invoke: Invoke) {
        val v = invoke.getArgs().optDouble("volume", 1.0).toFloat()
        withService { it.setVolume(v) }
        invoke.resolve(JSObject())
    }

    @Command
    fun setRepeatMode(invoke: Invoke) {
        val mode = invoke.getArgs().optString("mode", "off")
        val rm = when (mode) {
            "one" -> androidx.media3.common.Player.REPEAT_MODE_ONE
            "all" -> androidx.media3.common.Player.REPEAT_MODE_ALL
            else -> androidx.media3.common.Player.REPEAT_MODE_OFF
        }
        withService { it.setRepeat(rm) }
        invoke.resolve(JSObject())
    }

    @Command
    fun setShuffle(invoke: Invoke) {
        val on = invoke.getArgs().optBoolean("enabled", false)
        withService { it.setShuffle(on) }
        invoke.resolve(JSObject())
    }

    @Command
    fun clearQueue(invoke: Invoke) {
        withService { svc ->
            svc.pause()
            svc.clear()
        }
        invoke.resolve(JSObject())
    }

    companion object {
        var stateCallback: ((Map<String, Any?>) -> Unit)? = null
    }
}
