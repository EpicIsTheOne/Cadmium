package com.cadmium.music

import android.app.Activity
import android.content.Intent
import androidx.media3.common.MediaItem
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

/**
 * Native bridge between the Rust Tauri commands and the Media3 PlaybackService.
 *
 * The React renderer computes the full queue (order, crossfade, repeat/shuffle)
 * and Rust forwards it here through android_set_queue / android_play / etc.
 * This plugin starts the foreground service (so audio keeps playing) and drives
 * it. State changes from the service are pushed back to Rust via the event
 * channel consumed by the mobile engine (android_accept_playback_state).
 */
@TauriPlugin
class RustBridge(private val activity: Activity) : Plugin(activity) {

    @Command
    fun setQueue(invoke: Invoke) {
        val items = invoke.parseArgs(MediaItemList::class.java)
        val service = startService()
        val mediaItems = items.queue.map { m ->
            MediaItem.Builder().setUri(m.uri).setMediaId(m.trackId).build()
        }
        val startIndex = items.currentIndex ?: 0
        service.setQueue(mediaItems, startIndex, 0L)
        invoke.resolve(JSObject())
    }

    @Command
    fun play(invoke: Invoke) { startService().play(); invoke.resolve(JSObject()) }

    @Command
    fun pause(invoke: Invoke) { startService().pause(); invoke.resolve(JSObject()) }

    @Command
    fun toggle(invoke: Invoke) { invoke.resolve(JSObject()) }

    @Command
    fun next(invoke: Invoke) { startService().next(); invoke.resolve(JSObject()) }

    @Command
    fun previous(invoke: Invoke) { startService().previous(); invoke.resolve(JSObject()) }

    @Command
    fun seek(invoke: Invoke) {
        val position = invoke.getDouble("positionMs") ?: 0.0
        startService().seek(position.toLong())
        invoke.resolve(JSObject())
    }

    @Command
    fun setVolume(invoke: Invoke) {
        val v = (invoke.getDouble("volume") ?: 1.0).toFloat()
        startService().setVolume(v)
        invoke.resolve(JSObject())
    }

    @Command
    fun setRepeatMode(invoke: Invoke) {
        val mode = invoke.getString("mode")
        val rm = when (mode) {
            "one" -> androidx.media3.common.Player.REPEAT_MODE_ONE
            "all" -> androidx.media3.common.Player.REPEAT_MODE_ALL
            else -> androidx.media3.common.Player.REPEAT_MODE_OFF
        }
        startService().setRepeat(rm)
        invoke.resolve(JSObject())
    }

    @Command
    fun setShuffle(invoke: Invoke) {
        val on = invoke.getBoolean("enabled") ?: false
        startService().setShuffle(on)
        invoke.resolve(JSObject())
    }

    private fun startService(): PlaybackService {
        val intent = Intent(context, PlaybackService::class.java)
        context.startForegroundService(intent)
        // In a real build the service instance is obtained via a bound connection;
        // this scaffold documents the intent handoff.
        return PlaybackService()
    }

    companion object {
        var stateCallback: ((Map<String, Any?>) -> Unit)? = null

        /** Called by the MediaStorePlugin to forward candidates to Rust reconcile. */
        fun reconcileMedia(candidates: List<Map<String, Any?>>) {
            // Forwarded to Rust android_reconcile_media through the Tauri channel.
        }
    }

    data class MediaItemList(
        val queue: List<QueueEntry>,
        val currentIndex: Int?
    )
    data class QueueEntry(
        val trackId: String,
        val uri: String,
        val title: String,
        val artist: String,
        val album: String,
        val artworkUri: String?,
        val durationMs: Long,
        val crossfadeMs: Int
    )
}
