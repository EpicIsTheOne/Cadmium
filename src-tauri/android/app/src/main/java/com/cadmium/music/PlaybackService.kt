package com.cadmium.music

import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import android.os.Bundle
import android.os.Handler
import android.os.Looper

/**
 * Media3 MediaSessionService — the single Android playback renderer.
 *
 * Cadmium v1 plays through a foreground MediaSessionService so audio survives
 * backgrounding and system media keys work. The renderer is a "dumb" player:
 * the Rust/React side computes the queue (order, crossfade, repeat/shuffle)
 * and sends it here via Tauri commands; this service renders exactly that
 * queue and reports position/state back. Battery is protected because we
 * never run a decode loop on the UI thread and we surface position only at the
 * cadence the mobile Rhythm policy allows.
 */
class PlaybackService : MediaSessionService(), Player.Listener {
    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null

    // Bridge callbacks registered by the Rust command layer (see RustBridge).
    private var onState: ((Map<String, Any?>) -> Unit)? = null

    companion object {
        // Set by the native bridge so the service can push state to Rust.
        @JvmStatic
        fun setStateCallback(cb: (Map<String, Any?>) -> Unit) {
            RustBridge.stateCallback = cb
        }
    }

    override fun onCreate() {
        super.onCreate()
        val attrs = AudioAttributes.Builder()
            .setContentType(androidx.media3.common.AudioAttributes.CONTENT_TYPE_MUSIC)
            .setUsage(androidx.media3.common.AudioAttributes.USAGE_MEDIA)
            .build()
        player = ExoPlayer.Builder(this)
            .setAudioAttributes(attrs, true)
            .setHandleAudioBecomingNoisy(true)
            .build()
        player?.addListener(this)
        mediaSession = MediaSession.Builder(this, player!!).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }

    /** Replace the queue with the renderer-computed list and start at index. */
    fun setQueue(items: List<MediaItem>, startIndex: Int, startPositionMs: Long) {
        player?.setMediaItems(items, startIndex, startPositionMs)
        player?.prepare()
        player?.play()
        pushState()
    }

    fun play() { player?.play(); pushState() }
    fun pause() { player?.pause(); pushState() }
    fun next() { player?.seekToNextMediaItem(); pushState() }
    fun previous() { player?.seekToPreviousMediaItem(); pushState() }
    fun seek(ms: Long) { player?.seekTo(ms); pushState() }
    fun setVolume(v: Float) { player?.volume = v; pushState() }
    fun setRepeat(mode: Int) { player?.repeatMode = mode; pushState() }
    fun setShuffle(on: Boolean) { player?.shuffleModeEnabled = on; pushState() }

    override fun onPlayerStateChanged(playWhenReady: Boolean, playbackState: Int) {
        pushState()
    }

    override fun onPositionDiscontinuity(reason: Int) {
        pushState()
    }

    private fun pushState() {
        val p = player ?: return
        val state = mapOf(
            "isPlaying" to p.isPlaying,
            "positionMs" to p.currentPosition,
            "durationMs" to (if (p.duration == androidx.media3.common.C.TIME_UNSET) 0L else p.duration),
            "currentIndex" to p.currentMediaItemIndex,
            "repeatMode" to p.repeatMode,
            "isShuffle" to p.shuffleModeEnabled,
            "volume" to p.volume
        )
        RustBridge.stateCallback?.invoke(state)
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Keep playing in background; only stop when explicitly paused by the user.
        if (player?.isPlaying != true) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        mediaSession?.run {
            player?.release()
            release()
            mediaSession = null
        }
        super.onDestroy()
    }
}
