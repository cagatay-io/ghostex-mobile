package expo.modules.ghostexnative

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Rect
import android.text.Spanned
import android.text.style.ClickableSpan
import android.text.style.ReplacementSpan
import android.view.ActionMode
import android.view.HapticFeedbackConstants
import android.view.Menu
import android.view.MenuItem
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.EditText
import android.widget.TextView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * One chat message's text on the phone (`messageSelection.tsx`): holding its words starts the
 * platform's own text selection, whose floating bar offers Copy, Add to Chat and More; holding
 * anywhere else in the message opens the message's menu (`onHold`).
 *
 * CDXC:SessionChat 2026-10-21 WHY: React Native's selectable Text claims a hold for its own
 * selection, and a JS `onLongPress` on the same message raced it (the 2026-09-25 note in
 * `TranscriptMenu.tsx`). So no JS handler holds message text any more: this view sees every touch
 * first and gives each hold one owner. Words go to the `TextView`'s selection, a link or an inline
 * pill to its JS press (the link's own rows), a field or an element marked `ghostexOwnsHold` (a
 * picture with a file) to itself, and everything else (padding, gaps, beside a short line, cards)
 * to `onHold` after the system's hold delay. The selection bar is the `TextView`'s own floating
 * ActionMode, rewritten in `startActionModeForChild` on its way up, so the handles, magnifier and
 * smart selection stay the platform's.
 */
class GhostexSelectionMenuView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onSelectionAction by EventDispatcher()
  private val onHold by EventDispatcher()

  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var downX = 0f
  private var downY = 0f
  private var holdPending = false
  private val holdTimer = Runnable {
    holdPending = false
    performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
    emitHold()
  }

  init {
    // Drawn like a React Native view, whose children may overflow it unless it says otherwise.
    // `ExpoView.dispatchDraw` clips the canvas to the view's own box while `clipToPadding` is on, which
    // `clipChildren = false` does not undo: a question form's or page card's outline, drawn 4dp outside
    // its card, lost its left side to the message view's edge (2026-10-28).
    clipChildren = false
    clipToPadding = false
  }

  // Yoga lays the children out; LinearLayout must not measure or place them again.
  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> armHold(event)
      MotionEvent.ACTION_MOVE ->
        if (holdPending && (abs(event.rawX - downX) > touchSlop || abs(event.rawY - downY) > touchSlop)) {
          cancelHold()
        }
      MotionEvent.ACTION_POINTER_DOWN -> cancelHold()
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        cancelHold()
        HoldGuard.release(this)
      }
    }
    return super.dispatchTouchEvent(event)
  }

  override fun onDetachedFromWindow() {
    cancelHold()
    HoldGuard.release(this)
    super.onDetachedFromWindow()
  }

  /** Decides, as the finger lands, who owns a hold that starts here. */
  private fun armHold(event: MotionEvent) {
    cancelHold()
    HoldGuard.release(this)
    downX = event.rawX
    downY = event.rawY
    val hits = ArrayList<View>()
    collectViewsAt(this, event.rawX.toInt(), event.rawY.toInt(), hits)
    if (hits.any { it is EditText || (it is TextView && it.onCheckIsTextEditor()) }) return
    val text = hits.lastOrNull { it is TextView && it.isTextSelectable } as TextView?
    if (text != null) {
      val character = characterAt(text, event.rawX, event.rawY)
      val mode =
        when {
          character < 0 -> HoldGuard.Mode.Menu
          isLinkOrInlineView(text, character) -> HoldGuard.Mode.Link
          else -> HoldGuard.Mode.Select
        }
      HoldGuard.arm(text, this, mode)
      return
    }
    if (hits.any { ownsHold(it) }) return
    holdPending = true
    postDelayed(holdTimer, ViewConfiguration.getLongPressTimeout().toLong())
  }

  private fun cancelHold() {
    if (!holdPending) return
    holdPending = false
    removeCallbacks(holdTimer)
  }

  internal fun emitHold() {
    onHold(emptyMap())
  }

  override fun startActionModeForChild(originalView: View, callback: ActionMode.Callback, type: Int): ActionMode? {
    if (type != ActionMode.TYPE_FLOATING || originalView !is TextView || originalView.onCheckIsTextEditor()) {
      return super.startActionModeForChild(originalView, callback, type)
    }
    return super.startActionModeForChild(originalView, SelectionBar(callback, originalView), type)
  }

  /** The selection's floating bar: the platform's Copy, then Add to Chat and More, nothing else. */
  private inner class SelectionBar(
    private val inner: ActionMode.Callback,
    private val textView: TextView,
  ) : ActionMode.Callback2() {
    override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
      val created = inner.onCreateActionMode(mode, menu)
      offerMessageItems(menu)
      return created
    }

    // The platform adds its items (smart selection, Translate, Share) here as well, so this trims
    // after it every time.
    override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
      val changed = inner.onPrepareActionMode(mode, menu)
      return offerMessageItems(menu) || changed
    }

    override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
      when (item.itemId) {
        android.R.id.copy -> {
          copyToClipboard(selectedText(textView))
          mode.finish()
        }
        R.id.ghostex_selection_add_to_chat -> {
          val selection = selectedText(textView)
          mode.finish()
          if (selection.isNotBlank()) onSelectionAction(mapOf("action" to "addToChat", "text" to selection))
        }
        R.id.ghostex_selection_more -> {
          mode.finish()
          onSelectionAction(mapOf("action" to "more", "text" to ""))
        }
        else -> return inner.onActionItemClicked(mode, item)
      }
      return true
    }

    override fun onDestroyActionMode(mode: ActionMode) = inner.onDestroyActionMode(mode)

    override fun onGetContentRect(mode: ActionMode, view: View, outRect: Rect) {
      if (inner is ActionMode.Callback2) inner.onGetContentRect(mode, view, outRect)
      else super.onGetContentRect(mode, view, outRect)
    }
  }

  private fun offerMessageItems(menu: Menu): Boolean {
    var changed = false
    var index = 0
    while (index < menu.size()) {
      val id = menu.getItem(index).itemId
      if (id == android.R.id.copy || id == R.id.ghostex_selection_add_to_chat || id == R.id.ghostex_selection_more) {
        index += 1
      } else {
        menu.removeItem(id)
        changed = true
      }
    }
    if (menu.findItem(R.id.ghostex_selection_add_to_chat) == null) {
      menu
        .add(Menu.NONE, R.id.ghostex_selection_add_to_chat, ORDER_ADD_TO_CHAT, R.string.message_selection_add_to_chat)
        .setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
      changed = true
    }
    if (menu.findItem(R.id.ghostex_selection_more) == null) {
      menu
        .add(Menu.NONE, R.id.ghostex_selection_more, ORDER_MORE, R.string.message_selection_more)
        .setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
      changed = true
    }
    return changed
  }

  private fun copyToClipboard(text: String) {
    if (text.isEmpty()) return
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    clipboard.setPrimaryClip(ClipData.newPlainText(null, text))
  }

  /**
   * The selected words as they read. React Native stands an inline view (a Q-tag pill, a link's
   * icon) in the text as U+FFFC; each one becomes the words the view shows over that spot.
   */
  private fun selectedText(view: TextView): String {
    val start = min(view.selectionStart, view.selectionEnd)
    val end = max(view.selectionStart, view.selectionEnd)
    if (start < 0 || end <= start) return ""
    val content = view.text
    val out = StringBuilder()
    for (index in start until min(end, content.length)) {
      val character = content[index]
      if (character == OBJECT_REPLACEMENT) out.append(inlineViewText(view, index)) else out.append(character)
    }
    return out.toString()
  }

  private fun inlineViewText(view: TextView, index: Int): String {
    val layout = view.layout ?: return ""
    val line = layout.getLineForOffset(index)
    val left = layout.getPrimaryHorizontal(index)
    val right =
      if (index + 1 < layout.getLineEnd(line)) layout.getPrimaryHorizontal(index + 1) else layout.getLineRight(line)
    val origin = IntArray(2).also { view.getLocationOnScreen(it) }
    val x = origin[0] + view.totalPaddingLeft - view.scrollX
    val y = origin[1] + view.totalPaddingTop - view.scrollY
    val box =
      Rect(
        x + min(left, right).toInt(),
        y + layout.getLineTop(line),
        x + max(left, right).toInt(),
        y + layout.getLineBottom(line),
      )
    box.inset(-touchSlop, -touchSlop)
    val out = StringBuilder()
    collectTextIn(view.rootView, box, view, out)
    return out.toString()
  }

  companion object {
    private const val OBJECT_REPLACEMENT = '￼'
    private const val ORDER_ADD_TO_CHAT = 100
    private const val ORDER_MORE = 101
    /** The `nativeID` of an element inside a message whose JS owns its hold (`OWNS_HOLD` in `messageSelection.tsx`). */
    private const val OWNS_HOLD = "ghostexOwnsHold"

    private fun ownsHold(view: View): Boolean = view.getTag(com.facebook.react.R.id.view_tag_native_id) == OWNS_HOLD

    private fun onScreen(view: View): Rect {
      val origin = IntArray(2).also { view.getLocationOnScreen(it) }
      return Rect(origin[0], origin[1], origin[0] + view.width, origin[1] + view.height)
    }

    /** The views under a point on screen, outermost first. */
    private fun collectViewsAt(parent: ViewGroup, x: Int, y: Int, out: MutableList<View>) {
      for (index in 0 until parent.childCount) {
        val child = parent.getChildAt(index)
        if (child.visibility != View.VISIBLE || !onScreen(child).contains(x, y)) continue
        out.add(child)
        if (child is ViewGroup) collectViewsAt(child, x, y, out)
      }
    }

    /** The words of every text view centred inside `box`, in the order they are drawn. */
    private fun collectTextIn(view: View, box: Rect, skip: View, out: StringBuilder) {
      if (view.visibility != View.VISIBLE) return
      if (view is TextView && view !== skip) {
        val frame = onScreen(view)
        if (box.contains(frame.centerX(), frame.centerY())) out.append(view.text)
        return
      }
      if (view is ViewGroup) {
        for (index in 0 until view.childCount) collectTextIn(view.getChildAt(index), box, skip, out)
      }
    }

    /** The index of the character under a point on screen, or -1 when the point is beside the text. */
    private fun characterAt(view: TextView, rawX: Float, rawY: Float): Int {
      val layout = view.layout ?: return -1
      val origin = IntArray(2).also { view.getLocationOnScreen(it) }
      val x = rawX - origin[0] - view.totalPaddingLeft + view.scrollX
      val y = rawY - origin[1] - view.totalPaddingTop + view.scrollY
      if (y < 0 || y >= layout.height) return -1
      val line = layout.getLineForVertical(y.toInt())
      if (x < layout.getLineLeft(line) || x > layout.getLineRight(line)) return -1
      val lineStart = layout.getLineStart(line)
      val lineEnd = layout.getLineEnd(line)
      var character = layout.getOffsetForHorizontal(line, x)
      // The nearest boundary can sit right of the finger; the character under it is the one before.
      if (character > lineStart && layout.getPrimaryHorizontal(character) > x) character -= 1
      if (character >= lineEnd) character = lineEnd - 1
      return if (character < lineStart) -1 else character
    }

    private fun isLinkOrInlineView(view: TextView, character: Int): Boolean {
      val spanned = view.text as? Spanned ?: return false
      return spanned.getSpans(character, character + 1, ClickableSpan::class.java).isNotEmpty() ||
        spanned.getSpans(character, character + 1, ReplacementSpan::class.java).isNotEmpty()
    }
  }
}

/**
 * Who owns a hold on a message's `TextView`, decided as the finger lands. A long-click listener
 * that answers true keeps the `TextView` from starting a selection; it is installed on the view
 * the first time a message holds it and answers false for every touch no message armed.
 */
private object HoldGuard : View.OnLongClickListener {
  enum class Mode {
    /** On words: the platform's selection. */
    Select,
    /** On a link or an inline pill: its JS long press opens the link's rows. */
    Link,
    /** Beside the words: the message's menu. */
    Menu,
  }

  private var view: WeakReference<TextView>? = null
  private var owner: WeakReference<GhostexSelectionMenuView>? = null
  private var mode = Mode.Select

  fun arm(target: TextView, by: GhostexSelectionMenuView, chosen: Mode) {
    view = WeakReference(target)
    owner = WeakReference(by)
    mode = chosen
    target.setOnLongClickListener(this)
  }

  fun release(by: GhostexSelectionMenuView) {
    if (owner?.get() !== by) return
    view = null
    owner = null
  }

  override fun onLongClick(v: View): Boolean {
    if (view?.get() !== v) return false
    return when (mode) {
      Mode.Select -> false
      Mode.Link -> true
      Mode.Menu -> {
        owner?.get()?.emitHold()
        true
      }
    }
  }
}
