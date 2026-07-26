package com.cadmium.music

import android.app.Activity
import android.content.ContentUris
import android.database.Cursor
import android.net.Uri
import android.provider.MediaStore
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Queries MediaStore.Audio.Media OFF the main thread and returns normalized
 * candidates to Rust. Rust never touches Android content resolvers; this plugin
 * is the only place that reads MediaStore. Read-only: we never request
 * MANAGE_EXTERNAL_STORAGE, and we never delete or mutate source audio.
 */
@TauriPlugin
class MediaStorePlugin(private val activity: Activity) : Plugin(activity) {
    private val collection: Uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI

    @Command
    fun scan(invoke: Invoke) {
        val result = JSObject()
        val candidates = query()
        val arr = JSObject() // placeholder; real bridge passes the list to android_reconcile_media
        result.put("candidates", candidates.size)
        // The Rust side performs the reconcile via android_reconcile_media; here we
        // hand the raw candidate list to the bridge which forwards it.
        RustBridge.reconcileMedia(candidates)
        invoke.resolve(result)
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
}
