package com.cadmium.music

import android.app.Activity
import android.content.ContentUris
import android.content.ContentResolver
import android.content.Intent
import android.database.Cursor
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Queries MediaStore.Audio.Media OFF the main thread and returns normalized
 * candidates to the Rust side, which writes them via android_reconcile_media.
 * Rust never touches Android content resolvers; this plugin is the only place
 * that reads MediaStore. Read-only: we never request MANAGE_EXTERNAL_STORAGE,
 * and we never delete or mutate source audio.
 */
@TauriPlugin
class MediaStorePlugin(private val activity: Activity) : Plugin(activity) {
    private val collection: Uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
    private val scope = CoroutineScope(Dispatchers.Default + Job())


    @Command
    fun scan(invoke: Invoke) {
        // Run the query off the main thread, then hand the candidate list back to
        // JS. The renderer invokes android_reconcile_media (a Rust command) with it.
        scope.launch {
            val candidates = withContext(Dispatchers.IO) { query() }
            val result = JSObject()
            result.put("candidates", candidates.toTypedArray())
            invoke.resolve(result)
        }
    }

    private fun query(): List<Map<String, Any?>> {
        val projection = arrayOf(
            MediaStore.Audio.Media.VOLUME_NAME,
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.TRACK,
            MediaStore.Audio.Media.YEAR,
            MediaStore.Audio.Media.GENRE,
            MediaStore.Audio.Media.MIME_TYPE,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.DATE_MODIFIED
        )
        val list = mutableListOf<Map<String, Any?>>()
        val selection = "${MediaStore.Audio.Media.IS_MUSIC} = ?"
        val selectionArgs = arrayOf("1")
        val cursor: Cursor? = activity.contentResolver.query(
            collection, projection, selection, selectionArgs, null
        )
        cursor?.use {
            val volIdx = it.getColumnIndexOrThrow(MediaStore.Audio.Media.VOLUME_NAME)
            val idIdx = it.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
            val titleIdx = it.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
            val artistIdx = it.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
            val albumIdx = it.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
            val albumIdIdx = it.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
            val durIdx = it.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
            val trackIdx = it.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK)
            val yearIdx = it.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR)
            val genreIdx = it.getColumnIndexOrThrow(MediaStore.Audio.Media.GENRE)
            val mimeIdx = it.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE)
            val sizeIdx = it.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
            val modIdx = it.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
            while (it.moveToNext()) {
                val id = it.getLong(idIdx)
                val uri = ContentUris.withAppendedId(collection, id)
                list.add(
                    mapOf(
                        "volumeName" to it.getString(volIdx),
                        "mediaId" to id.toString(),
                        "contentUri" to uri.toString(),
                        "title" to it.getString(titleIdx),
                        "artist" to it.getString(artistIdx),
                        "album" to it.getString(albumIdx),
                        "albumId" to it.getString(albumIdIdx),
                        "durationMs" to it.getLong(durIdx),
                        "trackNumber" to it.getLong(trackIdx),
                        "year" to it.getLong(yearIdx),
                        "genre" to it.getString(genreIdx),
                        "format" to it.getString(mimeIdx),
                        "byteLength" to it.getLong(sizeIdx),
                        "modifiedAtMs" to it.getLong(modIdx) * 1000L
                    )
                )
            }
        }
        return list
    }

    // ── Storage Access Framework picker ──────────────────────────────────────
    //
    // Launches ACTION_OPEN_DOCUMENT with EXTRA_ALLOW_MULTIPLE so the user can
    // pick the exact audio files MediaStore missed. This is SAF (not the Photo
    // Picker, which is visual-media-only) and does NOT require
    // MANAGE_EXTERNAL_STORAGE. Long-term read access is persisted via
    // takePersistableUriPermission so the selected files keep playing across
    // reboots and device reboots. The native MediaStore identity
    // (volume + media id) is unavailable for arbitrary document URIs, so the
    // Rust side derives a deterministic, collision-free id from the URI.
    //
    // Tauri routes the system picker result to the @ActivityCallback below; the
    // user cancelling (RESULT_CANCELED, no data) resolves with
    // { candidates: [], cancelled: true } rather than rejecting.

    @Command
    fun pickAudio(invoke: Invoke) {
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "audio/*"
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                // Persist read access past process death / reboot.
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            }
            startActivityForResult(invoke, intent, "pickAudioResult")
        } catch (error: Throwable) {
            invoke.reject("Could not open the file picker: ${error.message ?: error.javaClass.simpleName}")
        }
    }

    @ActivityCallback
    fun pickAudioResult(invoke: Invoke, result: ActivityResult) {
        val data = result.data
        // Cancellation: the user dismissed the picker with no selection.
        if (result.resultCode != Activity.RESULT_OK || data == null) {
            val result = JSObject()
            result.put("candidates", emptyArray<Any>())
            result.put("cancelled", true)
            invoke.resolve(result)
            return
        }

        scope.launch {
            try {
                val candidates = withContext(Dispatchers.IO) {
                    val uris = collectUris(data)
                    persistReadGrants(data, uris)
                    uris.map { readDocumentMetadata(it) }
                }
                val callResult = JSObject()
                callResult.put("candidates", candidates.toTypedArray())
                callResult.put("cancelled", false)
                invoke.resolve(callResult)
            } catch (error: Throwable) {
                invoke.reject(
                    "Could not read the selected audio files: ${error.message ?: error.javaClass.simpleName}"
                )
            }
        }
    }

    /** Gather clipData + single data URI into one ordered list of document URIs. */
    private fun collectUris(data: Intent): List<Uri> {
        val uris = linkedSetOf<Uri>()
        val clip = data.clipData
        if (clip != null) {
            for (i in 0 until clip.itemCount) {
                clip.getItemAt(i)?.uri?.let { uris.add(it) }
            }
        } else {
            data.data?.let { uris.add(it) }
        }
        return uris.toList()
    }

    /** Persist returned SAF grants so Media3 playback survives process death/reboot. */
    private fun persistReadGrants(data: Intent, uris: List<Uri>) {
        val readFlags = data.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION
        if (readFlags == 0) return
        for (uri in uris) {
            // Some third-party providers decline persistable grants. Keep their
            // current-session URI usable while persisting every supported grant.
            runCatching {
                activity.contentResolver.takePersistableUriPermission(uri, readFlags)
            }
        }
    }

    /**
     * Reads metadata for an arbitrary content:// document using
     * OpenableColumns (display name / size / last-modified) and
     * MediaMetadataRetriever (title / artist / album / duration / year).
     * Every call is defensive: a missing field falls back to a safe default so
     * one unreadable file never aborts the whole selection.
     */
    private fun readDocumentMetadata(uri: Uri): Map<String, Any?> {
        val contentResolver = activity.contentResolver
        var displayName: String? = null
        var size: Long = 0L
        var lastModified: Long = 0L
        try {
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
                val modIdx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
                if (cursor.moveToFirst()) {
                    if (nameIdx >= 0) displayName = cursor.getString(nameIdx)
                    if (sizeIdx >= 0) size = cursor.getLong(sizeIdx)
                    if (modIdx >= 0) lastModified = cursor.getLong(modIdx)
                }
            }
        } catch (_: Throwable) {
            // OpenableColumns unavailable for this provider; fall back below.
        }

        var title: String? = null
        var artist: String? = null
        var album: String? = null
        var durationMs: Long = 0L
        var year: Long = 0L
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(activity, uri)
            title = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)
            artist = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)
            album = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM)
            val dur = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            durationMs = dur?.toLongOrNull() ?: 0L
            val yr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_YEAR)
            year = yr?.toLongOrNull() ?: 0L
        } catch (_: Throwable) {
            // Metadata extraction failed (unsupported codec / DRM); keep nulls.
        } finally {
            try {
                retriever.release()
            } catch (_: Throwable) {
            }
        }

        val fallbackTitle = displayName
            ?.substringBeforeLast('.')
            ?.takeIf { it.isNotBlank() }
            ?: uri.lastPathSegment
            ?: "Unknown title"

        // SAF selections have no MediaStore volume/media id. Leave them blank;
        // Rust derives a deterministic id from the URI + provider identity.
        return mapOf(
            "contentUri" to uri.toString(),
            "volumeName" to "",
            "mediaId" to "",
            "title" to (title?.takeIf { it.isNotBlank() } ?: fallbackTitle),
            "artist" to (artist ?: "Unknown artist"),
            "album" to (album ?: "Unknown album"),
            "albumId" to null,
            "durationMs" to durationMs,
            "trackNumber" to null,
            "year" to if (year > 0) year else null,
            "genre" to null,
            "format" to guessFormat(contentResolver, uri, displayName),
            "byteLength" to size,
            "modifiedAtMs" to lastModified,
            "artworkCachePath" to null
        )
    }

    private fun guessFormat(
        contentResolver: ContentResolver,
        uri: Uri,
        displayName: String?,
    ): String {
        val mime = runCatching { contentResolver.getType(uri) }.getOrNull()
        if (!mime.isNullOrBlank()) {
            if (mime.contains("flac")) return "flac"
            if (mime.contains("mpeg") || mime.contains("mp3")) return "mp3"
            if (mime.contains("ogg") || mime.contains("opus")) return "ogg"
            if (mime.contains("wav")) return "wav"
            if (mime.contains("m4a") || mime.contains("aac")) return "m4a"
        }
        val ext = displayName?.substringAfterLast('.', "")?.lowercase()
            ?.takeIf { it.length in 2..4 }
            ?: uri.lastPathSegment?.substringAfterLast('.', "")?.lowercase()
                ?.takeIf { it.length in 2..4 }
        return ext ?: "unknown"
    }
}
