package expo.modules.ghostexnative

import android.content.ClipData
import android.content.ClipDescription
import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.view.DragAndDropPermissions
import android.view.DragEvent
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.webkit.MimeTypeMap
import android.widget.EditText
import androidx.core.view.ContentInfoCompat
import androidx.core.view.OnReceiveContentListener
import androidx.core.view.ViewCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.io.InputStream
import java.util.concurrent.Executors

/**
 * Where images reach the phone's chat composer without the attach button (`imageIntake.ts`):
 *
 * - The composer's field (an `EditText` child of this view) takes an image the keyboard inserts
 *   (Gboard's clipboard and image suggestions, Samsung's keyboard: the input connection's
 *   `commitContent`) or the long-press Paste puts in, through its `OnReceiveContentListener`.
 *   Text in the same paste goes on to the field as before.
 * - With `dropTarget`, the whole chat view takes an image dropped on it from another app (split
 *   screen, a desktop mode) and reports `onDropActive` while one is held over it, for the highlight.
 *
 * Each image is copied into the app's cache while its URI permission holds (the keyboard's and a
 * drop's grants end with the call) and `onImages` hands the copies to the chat's `attachFiles`, the
 * attach button's own path.
 *
 * CDXC:SessionChat 2026-10-24 DECISION:
 * User: "Also please i want to be able to paste image from my keyboard clipboard on android not just using the attach thingy. Also want to be able to drop image on chat view to paste image they're". A React Native `TextInput` drops both the keyboard's rich content and an image on the clipboard, and nothing on the chat view takes a drop, so this view uses Android's own receivers: `OnReceiveContentListener` (one listener for the keyboard, Paste and a drop on the field) and the view's `OnDragListener` with `requestDragAndDropPermissions`. No library: androidx `DropHelper` draws its own highlight and needs every inner field registered up front, and this is all it would do.
 */
class GhostexImageIntakeView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onImages by EventDispatcher()
  private val onDropActive by EventDispatcher()

  private var dropActive = false

  /** The chat view takes dropped images (the composer is shown). */
  var dropTarget: Boolean = false
    set(value) {
      if (field == value) return
      field = value
      setOnDragListener(if (value) dragListener else null)
      if (!value) setDropActive(false)
    }

  init {
    // Drawn like a React Native view, whose children may overflow it unless it says otherwise.
    clipChildren = false
  }

  // Yoga lays the children out; LinearLayout must not measure or place them again.
  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit

  override fun onViewAdded(child: View) {
    super.onViewAdded(child)
    if (child !is EditText) return
    ViewCompat.setOnReceiveContentListener(child, IMAGE_MIME_TYPES, fieldReceiver)
    // The keyboard reads the field's content types when its input starts.
    if (child.hasFocus()) {
      (context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)?.restartInput(child)
    }
  }

  override fun onViewRemoved(child: View) {
    super.onViewRemoved(child)
    if (child is EditText) ViewCompat.setOnReceiveContentListener(child, null, null)
  }

  private val fieldReceiver = OnReceiveContentListener { _, payload ->
    val resolver = context.contentResolver
    val description = payload.clip.description
    val split = payload.partition { item -> item.uri?.let { isImage(resolver, it, description) } == true }
    val images = split.first ?: return@OnReceiveContentListener payload
    val via =
      when (payload.source) {
        ContentInfoCompat.SOURCE_INPUT_METHOD -> "keyboard"
        ContentInfoCompat.SOURCE_DRAG_AND_DROP -> "drop"
        else -> "paste"
      }
    receive(openImages(resolver, images.clip, description), via, null)
    split.second
  }

  private val dragListener = View.OnDragListener { _, event ->
    when (event.action) {
      DragEvent.ACTION_DRAG_STARTED -> event.clipDescription?.hasMimeType("image/*") == true
      DragEvent.ACTION_DRAG_ENTERED -> {
        setDropActive(true)
        true
      }
      DragEvent.ACTION_DRAG_LOCATION -> true
      DragEvent.ACTION_DRAG_EXITED, DragEvent.ACTION_DRAG_ENDED -> {
        setDropActive(false)
        true
      }
      DragEvent.ACTION_DROP -> {
        setDropActive(false)
        drop(event)
      }
      else -> false
    }
  }

  private fun drop(event: DragEvent): Boolean {
    val clip = event.clipData ?: return false
    // Another app's URIs open only under the permission the drop grants this activity.
    val permissions = appContext.currentActivity?.requestDragAndDropPermissions(event)
    val opened = openImages(context.contentResolver, clip, event.clipDescription ?: clip.description)
    receive(opened, "drop", permissions)
    return opened.images.isNotEmpty()
  }

  private fun setDropActive(active: Boolean) {
    if (dropActive == active) return
    dropActive = active
    onDropActive(mapOf("active" to active))
  }

  /** One image whose bytes are open (the open stream outlives the URI grant). */
  private class OpenedImage(val stream: InputStream, val name: String, val mimeType: String)

  /** The images of one paste or drop, and how many of them could not be opened. */
  private class OpenedImages(val images: List<OpenedImage>, val failed: Int)

  /** Opens every image in `clip` now, while its grant holds. */
  private fun openImages(resolver: ContentResolver, clip: ClipData, description: ClipDescription): OpenedImages {
    val opened = mutableListOf<OpenedImage>()
    var failed = 0
    for (index in 0 until clip.itemCount) {
      val uri = clip.getItemAt(index).uri ?: continue
      if (!isImage(resolver, uri, description)) continue
      val mimeType = imageMimeType(resolver, uri, description)
      val stream = runCatching { resolver.openInputStream(uri) }.getOrNull()
      if (stream == null) {
        failed += 1
        continue
      }
      opened += OpenedImage(stream, displayName(resolver, uri, mimeType, opened.size), mimeType)
    }
    return OpenedImages(opened, failed)
  }

  /** Copies the open images into the cache off the UI thread and reports them (and any it lost). */
  private fun receive(batch: OpenedImages, via: String, permissions: DragAndDropPermissions?) {
    val opened = batch.images
    if (opened.isEmpty() && batch.failed == 0) {
      permissions?.release()
      return
    }
    val directory = File(context.cacheDir, INTAKE_DIRECTORY)
    copier.execute {
      val files = mutableListOf<Map<String, String>>()
      var failed = batch.failed
      try {
        directory.mkdirs()
        pruneOld(directory)
        val stamp = System.currentTimeMillis()
        opened.forEachIndexed { index, image ->
          val target = File(directory, "$stamp-$index-${safeFileName(image.name)}")
          val copied =
            runCatching {
              image.stream.use { input -> target.outputStream().use { output -> input.copyTo(output) } }
            }.isSuccess
          if (copied) {
            files += mapOf("uri" to Uri.fromFile(target).toString(), "name" to image.name, "mimeType" to image.mimeType)
          } else {
            failed += 1
            target.delete()
          }
        }
      } finally {
        opened.forEach { runCatching { it.stream.close() } }
        permissions?.release()
      }
      post { onImages(mapOf("via" to via, "files" to files, "failed" to failed)) }
    }
  }

  companion object {
    private val IMAGE_MIME_TYPES = arrayOf("image/*")
    private const val INTAKE_DIRECTORY = "chat-image-intake"
    /** Copies the host has long since uploaded. */
    private const val STALE_AFTER_MS = 24L * 60 * 60 * 1000
    private val copier = Executors.newSingleThreadExecutor { runnable ->
      Thread(runnable, "GhostexImageIntake").apply { isDaemon = true }
    }

    private fun typeOf(resolver: ContentResolver, uri: Uri): String? = runCatching { resolver.getType(uri) }.getOrNull()

    private fun isImage(resolver: ContentResolver, uri: Uri, description: ClipDescription): Boolean =
      typeOf(resolver, uri)?.startsWith("image/") ?: description.hasMimeType("image/*")

    private fun imageMimeType(resolver: ContentResolver, uri: Uri, description: ClipDescription): String {
      typeOf(resolver, uri)?.takeIf { it.startsWith("image/") }?.let { return it }
      for (index in 0 until description.mimeTypeCount) {
        val type = description.getMimeType(index)
        if (type.startsWith("image/") && type != "image/*") return type
      }
      return "image/png"
    }

    private fun displayName(resolver: ContentResolver, uri: Uri, mimeType: String, index: Int): String {
      val queried =
        runCatching {
          resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
          }
        }.getOrNull()
      val name = queried?.trim().orEmpty().ifEmpty { uri.lastPathSegment?.substringAfterLast('/')?.trim().orEmpty() }
      if (name.isNotEmpty() && name.contains('.')) return name
      val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType) ?: "png"
      return "${name.ifEmpty { "pasted-image-${index + 1}" }}.$extension"
    }

    private fun safeFileName(name: String): String = name.replace(Regex("[^A-Za-z0-9._-]"), "_").takeLast(80)

    private fun pruneOld(directory: File) {
      val cutoff = System.currentTimeMillis() - STALE_AFTER_MS
      directory.listFiles()?.forEach { if (it.lastModified() < cutoff) it.delete() }
    }
  }
}
