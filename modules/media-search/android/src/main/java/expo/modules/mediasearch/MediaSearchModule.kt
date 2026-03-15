package expo.modules.mediasearch

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class MediaSearchModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MediaSearch")

    // saveToGallery(localUri, mimeType) → Promise<String>
    // Uses the correct MediaStore content URI for the MIME type so that videos
    // are inserted into content://media/external/video (not /images).
    AsyncFunction("saveToGallery") { localUri: String, mimeType: String, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) {
        promise.reject("ERR_CTX", "No React context", null)
        return@AsyncFunction
      }
      try {
        val fileUri = Uri.parse(localUri)
        val filePath = fileUri.path ?: throw Exception("Cannot resolve path from URI: $localUri")
        val file = java.io.File(filePath)
        if (!file.exists()) throw Exception("File not found: $filePath")

        val resolver = ctx.contentResolver
        val isVideo = mimeType.startsWith("video/")

        val contentUri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          if (isVideo) MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
          else MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        } else {
          @Suppress("DEPRECATION")
          if (isVideo) MediaStore.Video.Media.EXTERNAL_CONTENT_URI
          else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }

        val values = android.content.ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
          put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            put(MediaStore.MediaColumns.RELATIVE_PATH, if (isVideo) "Movies" else "Pictures")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
          }
        }

        val destUri = resolver.insert(contentUri, values)
          ?: throw Exception("MediaStore.insert returned null")

        java.io.FileInputStream(file).use { inp ->
          (resolver.openOutputStream(destUri)
            ?: throw Exception("openOutputStream returned null")).use { out ->
            inp.copyTo(out)
          }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          val pending = android.content.ContentValues()
          pending.put(MediaStore.MediaColumns.IS_PENDING, 0)
          resolver.update(destUri, pending, null, null)
        }

        promise.resolve(destUri.toString())
      } catch (e: Exception) {
        promise.reject("ERR_SAVE", e.message ?: "Failed to save to gallery", e)
      }
    }

    // searchAssets(albumId, query, mediaType, limit) → Promise<Array<Asset>>
    AsyncFunction("searchAssets") { albumId: String?, query: String, mediaType: String, limit: Int, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) {
        promise.reject("ERR_CTX", "No React context", null)
        return@AsyncFunction
      }
      try {
        val results = query(ctx, albumId, query, mediaType, limit)
        promise.resolve(results)
      } catch (e: Exception) {
        promise.reject("ERR_SEARCH", e.message ?: "Unknown error", e)
      }
    }
  }

  private fun query(
    ctx: Context,
    albumId: String?,
    query: String,
    mediaType: String,
    limit: Int,
  ): List<Bundle> {
    val resolver = ctx.contentResolver
    val results = mutableListOf<Bundle>()

    val uri: Uri = MediaStore.Files.getContentUri("external")

    val projection = arrayOf(
      MediaStore.Files.FileColumns._ID,
      MediaStore.Files.FileColumns.DISPLAY_NAME,
      MediaStore.Files.FileColumns.MEDIA_TYPE,
      MediaStore.Files.FileColumns.DURATION,
      MediaStore.Files.FileColumns.DATE_ADDED,
      MediaStore.Files.FileColumns.WIDTH,
      MediaStore.Files.FileColumns.HEIGHT,
      MediaStore.Files.FileColumns.BUCKET_ID,
    )

    val selParts  = mutableListOf<String>()
    val selArgs   = mutableListOf<String>()

    // Filename filter — case-insensitive LIKE on Android SQLite
    selParts.add("${MediaStore.Files.FileColumns.DISPLAY_NAME} LIKE ?")
    selArgs.add("%$query%")

    // Media type filter
    when (mediaType) {
      "photo" -> {
        selParts.add("${MediaStore.Files.FileColumns.MEDIA_TYPE} = ?")
        selArgs.add(MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString())
      }
      "video" -> {
        selParts.add("${MediaStore.Files.FileColumns.MEDIA_TYPE} = ?")
        selArgs.add(MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString())
      }
      else -> {
        selParts.add(
          "(${MediaStore.Files.FileColumns.MEDIA_TYPE} = ? OR ${MediaStore.Files.FileColumns.MEDIA_TYPE} = ?)"
        )
        selArgs.add(MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString())
        selArgs.add(MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString())
      }
    }

    // Album (bucket) filter
    if (!albumId.isNullOrEmpty()) {
      selParts.add("${MediaStore.Files.FileColumns.BUCKET_ID} = ?")
      selArgs.add(albumId)
    }

    val selection  = selParts.joinToString(" AND ")
    val sortOrder  = "${MediaStore.Files.FileColumns.DATE_ADDED} DESC"

    // Android 10+ supports LIMIT via Bundle query args; older versions use the
    // "ORDER BY x LIMIT n" string hack (still works on most OEM SQLite builds).
    val cursor = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val args = Bundle().apply {
        putString(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION, selection)
        putStringArray(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, selArgs.toTypedArray())
        putString(android.content.ContentResolver.QUERY_ARG_SQL_SORT_ORDER, sortOrder)
        putInt(android.content.ContentResolver.QUERY_ARG_LIMIT, limit)
      }
      resolver.query(uri, projection, args, null)
    } else {
      @Suppress("DEPRECATION")
      resolver.query(uri, projection, selection, selArgs.toTypedArray(), "$sortOrder LIMIT $limit")
    }

    cursor?.use { c ->
      val idCol    = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
      val nameCol  = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
      val typeCol  = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE)
      val durCol   = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DURATION)
      val dateCol  = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_ADDED)
      val wCol     = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.WIDTH)
      val hCol     = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.HEIGHT)

      while (c.moveToNext()) {
        val id      = c.getLong(idCol)
        val name    = c.getString(nameCol) ?: continue
        val type    = c.getInt(typeCol)
        val durMs   = c.getLong(durCol)
        val date    = c.getLong(dateCol)
        val width   = c.getInt(wCol)
        val height  = c.getInt(hCol)

        // Match the URI format expo-media-library uses on Android
        val contentUri = if (type == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO)
          Uri.withAppendedPath(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id.toString())
        else
          Uri.withAppendedPath(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id.toString())

        val isVideo = type == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO

        results.add(Bundle().apply {
          putString("id",           id.toString())
          putString("filename",     name)
          putString("uri",          contentUri.toString())
          putString("mediaType",    if (isVideo) "video" else "photo")
          putDouble("duration",     durMs / 1000.0)
          putDouble("creationTime", date * 1000.0)
          putInt("width",           width)
          putInt("height",          height)
        })
      }
    }

    return results
  }
}
