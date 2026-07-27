package com.cadmium.music

import android.content.Intent
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * Media3 MediaSessionService — the single Android playback renderer.
 *
 * Cadmium plays through a foreground MediaSessionService so audio survives
 * backgrounding and system media keys / lock-screen controls work. The
 * renderer is a "dumb" player: the Rust/React side computes the queue (order,
 * repeat/shuffle) and sends it here; this service renders exactly that queue,
 * honors Android audio focus, and reports state back via RustBridge.
 */
class PlaybackService : MediaSessionService(), Player.Listener {
    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null
    private var audioManager: AudioManager? = null
    private var focusRequest: AudioFocusRequest? = null
    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> pause()
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> { /* keep playing, ducked */ }
            AudioManager.AUDIOFOCUS_GAIN -> { /* regained; resume handled by caller */ }
        }
    }

    override fun onCreate() {
        super.onCreate()
        audioManager = getSystemService(AUDIO_SERVICE) as AudioManager
        val attrs = AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .setUsage(C.USAGE_MEDIA)
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

    /** Binder so the RustBridge plugin can drive this service in-process. */
    inner class LocalBinder : android.os.Binder() {
        fun getService(): PlaybackService = this@PlaybackService
    }

    override fun onBind(intent: Intent?): android.os.IBinder {
        return LocalBinder()
    }

    /** Replace the queue with the renderer-computed list and start at index. */
    fun setQueue(items: List<MediaItem>, startIndex: Int, startPositionMs: Long) {
        player?.setMediaItems(items, startIndex, startPositionMs)
        player?.prepare()
        play()
    }

    fun play() {
        requestAudioFocus()
        player?.play()
        pushState()
    }

    fun pause() {
        player?.pause()
        pushState()
    }

    fun toggle() {
        player?.let { if (it.isPlaying) it.pause() else play() }
        pushState()
    }

    fun next() { player?.seekToNextMediaItem(); pushState() }
    fun previous() { player?.seekToPreviousMediaItem(); pushState() }
    fun seek(ms: Long) { player?.seekTo(ms); pushState() }
    fun setVolume(v: Float) { player?.volume = v; pushState() }
    fun setRepeat(mode: Int) { player?.repeatMode = mode; pushState() }
    fun setShuffle(on: Boolean) { player?.shuffleModeEnabled = on; pushState() }
    fun clear() { player?.clearMediaItems(); pushState() }

    private fun requestAudioFocus() {
        val am = audioManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setOnAudioFocusChangeListener(focusListener)
                .build()
            am.requestAudioFocus(focusRequest!!)
        } else {
            @Suppress("DEPRECATION")
            am.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
        }
    }

    private fun abandonAudioFocus() {
        val am = audioManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest?.let { am.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            am.abandonAudioFocus(focusListener)
        }
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        if (!isPlaying) abandonAudioFocus()
        pushState()
    }

    override fun onPlaybackStateChanged(playbackState: Int) {
        pushState()
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
        // Auto-advance (track ended) fires here; surface the new index/state.
        pushState()
    }

    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
        val p = player ?: return
        val state = mapOf(
            "isPlaying" to false,
            "positionMs" to p.currentPosition,
            "durationMs" to (if (p.duration == C.TIME_UNSET) 0L else p.duration),
            "currentIndex" to p.currentMediaItemIndex,
            "repeatMode" to p.repeatMode,
            "isShuffle" to p.shuffleModeEnabled,
            "volume" to p.volume,
            "error" to (error.message ?: "playback error")
        )
        RustBridge.stateCallback?.invoke(state)
    }

    private fun pushState() {
        val p = player ?: return
        val state = mapOf(
            "isPlaying" to p.isPlaying,
            "positionMs" to p.currentPosition,
            "durationMs" to (if (p.duration == C.TIME_UNSET) 0L else p.duration),
            "currentIndex" to p.currentMediaItemIndex,
            "repeatMode" to p.repeatMode,
            "isShuffle" to p.shuffleModeEnabled,
            "volume" to p.volume,
            "error" to null
        )
        RustBridge.stateCallback?.invoke(state)
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Keep playing in background; only stop when explicitly paused.
        if (player?.isPlaying != true) stopSelf()
    }

    override fun onDestroy() {
        abandonAudioFocus()
        mediaSession?.run {
            player?.release()
            release()
            mediaSession = null
        }
        super.onDestroy()
    }
}
