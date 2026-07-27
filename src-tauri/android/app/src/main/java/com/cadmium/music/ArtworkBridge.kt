package com.cadmium.music

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.webkit.WebView
import androidx.core.graphics.scale
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream

/**
 * Resolves Android MediaStore artwork (content:// URIs) into base64 data URIs
 * that the webview can render directly. The Rust side stores the raw
 * content:// reference; the renderer cannot load content:// itself, so this
 * plugin decodes and downscales the album art and returns an inline image.
 */
@TauriPlugin
class ArtworkBridge(private val activity: Activity) : Plugin(activity) {
    @Command
    fun getArtworks(invoke: Invoke) {
        val args = invoke.getArgs()
        val uris = args.getJSONArray("uris")
        val result = JSObject()
        val out = org.json.JSONArray()
        for (i in 0 until uris.length()) {
            val uri = uris.optString(i)
            out.put(decodeToDataUri(uri))
        }
        result.put("images", out)
        invoke.resolve(result)
    }

    @Command
    fun getArtwork(invoke: Invoke) {
        val args = invoke.getArgs()
        val uri = args.optString("uri", "")
        val result = JSObject()
        result.put("image", decodeToDataUri(uri))
        invoke.resolve(result)
    }

    private fun decodeToDataUri(uriString: String?): String {
        if (uriString.isNullOrBlank()) return ""
        return try {
            val uri = Uri.parse(uriString)
            activity.contentResolver.openInputStream(uri)?.use { stream ->
                val bitmap = BitmapFactory.decodeStream(stream) ?: return ""
                val scaled = if (bitmap.width > 512 || bitmap.height > 512) {
                    val ratio = 512.0 / maxOf(bitmap.width, bitmap.height)
                    val w = (bitmap.width * ratio).toInt().coerceAtLeast(1)
                    val h = (bitmap.height * ratio).toInt().coerceAtLeast(1)
                    Bitmap.createScaledBitmap(bitmap, w, h, true)
                } else {
                    bitmap
                }
                val baos = ByteArrayOutputStream()
                scaled.compress(Bitmap.CompressFormat.JPEG, 80, baos)
                val bytes = baos.toByteArray()
                "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
            } ?: ""
        } catch (e: Throwable) {
            ""
        }
    }
}
