package expo.modules.subtitleburner

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.RectF
import android.graphics.Typeface
import android.media.MediaMetadataRetriever
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.TextPaint
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.CanvasOverlay
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.TextureOverlay
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import com.google.common.collect.ImmutableList
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import kotlin.math.min

/** Un subtítulo ya cronometrado y partido en líneas (server/subtitleCues.js). */
class SubtitleCue : Record {
  @Field val start: Double = 0.0
  @Field val end: Double = 0.0
  @Field val lines: List<String> = emptyList()
}

private class SubtitleBurnerException(message: String) : CodedException(message)

/** Ruta de archivo a partir de una URI file:// (Transformer y MediaMetadataRetriever la quieren así). */
private fun toPath(uri: String): String = if (uri.startsWith("file://")) uri.removePrefix("file://") else uri

@OptIn(markerClass = [UnstableApi::class])
class SubtitleBurnerModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("SubtitleBurner")

    Events("onProgress")

    /** Extrae el audio (para transcribirlo sin subir el vídeo) y devuelve el tamaño visible del vídeo. */
    AsyncFunction("extractAudio") { input: String, output: String, promise: Promise ->
      val (width, height) = displaySize(toPath(input))
      val item = EditedMediaItem.Builder(MediaItem.fromUri(input)).setRemoveVideo(true).build()
      runTransformer(item, toPath(output), MimeTypes.AUDIO_AAC, null, report = false) { error ->
        if (error == null) {
          promise.resolve(mapOf("uri" to "file://${toPath(output)}", "width" to width.toDouble(), "height" to height.toDouble()))
        } else {
          promise.reject(SubtitleBurnerException("No se pudo extraer el audio: $error"))
        }
      }
    }

    /** Quema los subtítulos con el codificador de hardware, sin bajar la resolución. */
    AsyncFunction("burnSubtitles") { input: String, output: String, cues: List<SubtitleCue>, promise: Promise ->
      val overlay = SubtitleOverlay(cues.filter { it.end > it.start && it.lines.isNotEmpty() })
      val item = EditedMediaItem.Builder(MediaItem.fromUri(input))
        .setEffects(Effects(emptyList(), listOf(OverlayEffect(ImmutableList.of<TextureOverlay>(overlay)))))
        .build()
      runTransformer(item, toPath(output), null, MimeTypes.VIDEO_H265, report = true) { error ->
        if (error == null) {
          promise.resolve("file://${toPath(output)}")
        } else {
          promise.reject(SubtitleBurnerException("No se pudieron quemar los subtítulos: $error"))
        }
      }
    }
  }

  /** Tamaño con el que se ve el vídeo (ancho y alto ya girados). */
  private fun displaySize(path: String): Pair<Int, Int> {
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(path)
      val w = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      val h = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      if (rotation % 180 != 0) Pair(h, w) else Pair(w, h)
    } catch (e: Exception) {
      Pair(0, 0)
    } finally {
      retriever.release()
    }
  }

  /** Transformer debe crearse y usarse en un hilo con Looper: se hace en el principal. */
  private fun runTransformer(
    item: EditedMediaItem,
    outputPath: String,
    audioMime: String?,
    videoMime: String?,
    report: Boolean,
    onDone: (String?) -> Unit,
  ) {
    mainHandler.post {
      File(outputPath).delete()
      val builder = Transformer.Builder(appContext.reactContext ?: run { onDone("sin contexto"); return@post })
      audioMime?.let { builder.setAudioMimeType(it) }
      videoMime?.let { builder.setVideoMimeType(it) }
      var finished = false
      val transformer = builder.addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, exportResult: ExportResult) {
          finished = true
          onDone(null)
        }

        override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
          finished = true
          onDone(exportException.message ?: "error desconocido")
        }
      }).build()
      transformer.start(item, outputPath)

      if (report) {
        val holder = ProgressHolder()
        val poll = object : Runnable {
          override fun run() {
            if (finished) return
            if (transformer.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) {
              sendEvent("onProgress", mapOf("progress" to holder.progress / 100.0))
            }
            mainHandler.postDelayed(this, 300)
          }
        }
        mainHandler.post(poll)
      }
    }
  }
}

/**
 * Estilo B, igual que en iOS y en el servidor: texto blanco seminegrita sobre UNA franja negra al
 * 60 % de opacidad, todo proporcional al vídeo. Solo se redibuja cuando cambia el subtítulo
 * visible (si no, el lienzo no cambia y Media3 no vuelve a subir la textura).
 */
@OptIn(markerClass = [UnstableApi::class])
private class SubtitleOverlay(private val cues: List<SubtitleCue>) : CanvasOverlay(/* useInputFrameSize= */ true) {
  private var shownIndex = -2
  private val boxPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(153, 0, 0, 0) }
  private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    textAlign = Paint.Align.CENTER
    typeface = if (Build.VERSION.SDK_INT >= 28) Typeface.create(Typeface.DEFAULT, 600, false) else Typeface.DEFAULT_BOLD
  }

  override fun onDraw(canvas: Canvas, presentationTimeUs: Long) {
    val t = presentationTimeUs / 1_000_000.0
    val index = cues.indexOfFirst { t >= it.start && t < it.end }
    if (index == shownIndex) return
    shownIndex = index
    canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
    if (index < 0) return

    val width = canvas.width.toFloat()
    val height = canvas.height.toFloat()
    val fontSize = min(width, height) * 0.046f
    textPaint.textSize = fontSize
    val lines = cues[index].lines
    val metrics = textPaint.fontMetrics
    val lineHeight = (metrics.descent - metrics.ascent) * 1.08f
    val textWidth = lines.maxOf { textPaint.measureText(it) }
    val padH = fontSize * 0.5f
    val padV = fontSize * 0.28f
    val boxWidth = min(textWidth + 2 * padH, width - 2 * width * 0.06f + 2 * padH)
    val boxHeight = lineHeight * lines.size + 2 * padV
    val bottom = height - height * 0.09f
    val box = RectF((width - boxWidth) / 2, bottom - boxHeight, (width + boxWidth) / 2, bottom)
    val radius = fontSize * 0.15f
    canvas.drawRoundRect(box, radius, radius, boxPaint)

    var baseline = box.top + padV - metrics.ascent
    for (line in lines) {
      canvas.drawText(line, width / 2, baseline, textPaint)
      baseline += lineHeight
    }
  }
}
