import UIKit
import ExpoModulesCore

/// One chat message's text on the phone (`messageSelection.tsx`; Android twin
/// `GhostexSelectionMenuView.kt`): holding its words selects them, with Copy, Add to Chat and More
/// in the edit menu; holding anywhere else in the message opens the message's menu (`onHold`).
///
/// CDXC:SessionChat 2026-10-21 WHY: React Native's iOS Text draws like a label and can only copy a
/// whole block, so a held paragraph gets a selectable copy of itself laid over it for as long as
/// the selection lasts: a TextKit 1 `UITextView` with React Native's own attributed string and
/// layout settings (no line padding, no font leading) and every colour cleared, so React Native
/// keeps drawing the words, pills and code backgrounds and the overlay only adds the highlight,
/// handles and menu. A text-view renderer for every message (react-native-uitextview) was
/// rejected: it cannot add Add to Chat or More to the menu and swaps React Native's text drawing
/// for its own layout. Like Android, a link or inline pill keeps its JS hold (the link's rows), an
/// element marked `ghostexOwnsHold` (a picture with a file) keeps its own, and a hold off the
/// words opens the menu.
final class GhostexSelectionMenuView: ExpoView, UIGestureRecognizerDelegate, UITextViewDelegate,
    UIEditMenuInteractionDelegate
{
    let onSelectionAction = EventDispatcher()
    let onHold = EventDispatcher()

    private static let ownsHold = "ghostexOwnsHold"
    private static let attachmentCharacter: unichar = 0xFFFC
    /// The overlay on screen, app-wide: one selection at a time, as on Android.
    private static weak var active: SelectionOverlay?

    private lazy var hold: UILongPressGestureRecognizer = {
        let recognizer = UILongPressGestureRecognizer(target: self, action: #selector(handleHold(_:)))
        recognizer.cancelsTouchesInView = false
        recognizer.delegate = self
        return recognizer
    }()

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        addGestureRecognizer(hold)
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }

    // A hold inside the open selection belongs to the text view (it moves the selection).
    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === hold, let overlay = Self.active, overlay.isDescendant(of: self) else {
            return true
        }
        return !overlay.bounds.contains(gestureRecognizer.location(in: overlay))
    }

    @objc private func handleHold(_ recognizer: UILongPressGestureRecognizer) {
        guard recognizer.state == .began else { return }
        Self.active?.dismiss()
        let point = recognizer.location(in: self)
        var hits: [UIView] = []
        collectViews(at: point, in: self, into: &hits)
        if hits.contains(where: { ($0 as? UITextView)?.isEditable == true || $0 is UITextField }) { return }
        if let paragraph = hits.first(where: Self.isParagraph) {
            // A paragraph inside the paragraph is an inline view (a Q-tag pill): its JS press owns it.
            if hits.contains(where: { $0 !== paragraph && Self.isParagraph($0) && $0.isDescendant(of: paragraph) }) {
                return
            }
            guard let text = Self.attributedText(of: paragraph) else { return }
            let local = convert(point, to: paragraph)
            switch characterAt(local, in: text, size: paragraph.bounds.size) {
            case .beside:
                break
            case .link:
                return
            case .word(let index):
                showSelection(over: paragraph, text: text, at: index)
                return
            }
        } else if hits.contains(where: Self.ownsHold) {
            return
        }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        onHold([:])
    }

    // MARK: Hit testing

    /// The views under `point`, outermost first.
    private func collectViews(at point: CGPoint, in parent: UIView, into hits: inout [UIView]) {
        for child in parent.subviews where !child.isHidden && child.alpha > 0.01 {
            let local = parent.convert(point, to: child)
            guard child.point(inside: local, with: nil) else { continue }
            hits.append(child)
            collectViews(at: point, in: child, into: &hits)
        }
    }

    static func isParagraph(_ view: UIView) -> Bool {
        guard let paragraphClass = NSClassFromString("RCTParagraphComponentView") else { return false }
        return view.isKind(of: paragraphClass)
    }

    static func attributedText(of paragraph: UIView) -> NSAttributedString? {
        guard isParagraph(paragraph), let text = paragraph.value(forKey: "attributedText") as? NSAttributedString, text.length > 0 else {
            return nil
        }
        return text
    }

    private static func ownsHold(_ view: UIView) -> Bool {
        guard view.responds(to: NSSelectorFromString("nativeId")) else { return false }
        return (view.value(forKey: "nativeId") as? String) == ownsHold
    }

    private enum HoldTarget {
        case word(Int)
        case link
        case beside
    }

    /// Which character React Native drew under `point` (paragraph coordinates), with its layout.
    private func characterAt(_ point: CGPoint, in text: NSAttributedString, size: CGSize) -> HoldTarget {
        let layout = SelectionOverlay.layout(for: text, size: size)
        let glyph = layout.manager.glyphIndex(for: point, in: layout.container)
        guard glyph < layout.manager.numberOfGlyphs else { return .beside }
        let box = layout.manager.boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: layout.container)
        guard box.insetBy(dx: -2, dy: -2).contains(point) else { return .beside }
        let index = layout.manager.characterIndexForGlyph(at: glyph)
        guard index < text.length else { return .beside }
        if (text.string as NSString).character(at: index) == Self.attachmentCharacter { return .link }
        let attributes = text.attributes(at: index, effectiveRange: nil)
        if attributes[.link] != nil { return .link }
        if (attributes[NSAttributedString.Key("AccessibilityRole")] as? String) == "link" { return .link }
        return .word(index)
    }

    // MARK: Selection

    private func showSelection(over paragraph: UIView, text: NSAttributedString, at index: Int) {
        let overlay = SelectionOverlay(text: text, frame: paragraph.bounds)
        overlay.delegate = self
        overlay.addInteraction(UIEditMenuInteraction(delegate: self))
        paragraph.addSubview(overlay)
        Self.active = overlay
        overlay.becomeFirstResponder()
        overlay.selectedRange = overlay.wordRange(at: index)
        overlay.watchTapsOutside()
        let rect = overlay.selectionRect()
        let configuration = UIEditMenuConfiguration(
            identifier: nil,
            sourcePoint: CGPoint(x: rect.midX, y: rect.minY)
        )
        overlay.interactions.compactMap { $0 as? UIEditMenuInteraction }.first?.presentEditMenu(with: configuration)
    }

    /// The selection's menu: Copy, Add to Chat and More, nothing else (user decision, Q371).
    private func menu(for overlay: SelectionOverlay, range: NSRange) -> UIMenu {
        let selection = overlay.text(in: range)
        let copy = UIAction(title: "Copy", image: UIImage(systemName: "doc.on.doc")) { _ in
            UIPasteboard.general.string = selection
            overlay.dismiss()
        }
        let addToChat = UIAction(title: "Add to Chat", image: UIImage(systemName: "text.quote")) { [weak self] _ in
            overlay.dismiss()
            if !selection.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                self?.onSelectionAction(["action": "addToChat", "text": selection])
            }
        }
        let more = UIAction(title: "More", image: UIImage(systemName: "ellipsis")) { [weak self] _ in
            overlay.dismiss()
            self?.onSelectionAction(["action": "more", "text": ""])
        }
        return UIMenu(children: [copy, addToChat, more])
    }

    func textView(
        _ textView: UITextView,
        editMenuForTextIn range: NSRange,
        suggestedActions: [UIMenuElement]
    ) -> UIMenu? {
        guard let overlay = textView as? SelectionOverlay else { return nil }
        return menu(for: overlay, range: range)
    }

    func editMenuInteraction(
        _ interaction: UIEditMenuInteraction,
        menuFor configuration: UIEditMenuConfiguration,
        suggestedActions: [UIMenuElement]
    ) -> UIMenu? {
        guard let overlay = interaction.view as? SelectionOverlay else { return nil }
        return menu(for: overlay, range: overlay.selectedRange)
    }

    func textViewDidChangeSelection(_ textView: UITextView) {
        guard let overlay = textView as? SelectionOverlay, textView.selectedRange.length == 0 else { return }
        // After the current event, so a menu action already under way reads its words first.
        DispatchQueue.main.async { if overlay.selectedRange.length == 0 { overlay.dismiss() } }
    }

    override func removeFromSuperview() {
        if let overlay = Self.active, overlay.isDescendant(of: self) { overlay.dismiss() }
        super.removeFromSuperview()
    }
}

/// The selectable, invisible copy of one React Native paragraph (see `GhostexSelectionMenuView`).
final class SelectionOverlay: UITextView {
    private var outsideTap: UITapGestureRecognizer?
    /// A layout manager holds its text storage weakly, so the overlay keeps it.
    private let storage: NSTextStorage

    init(text: NSAttributedString, frame: CGRect) {
        let layout = Self.layout(for: Self.invisible(text), size: frame.size)
        storage = layout.storage
        super.init(frame: frame, textContainer: layout.container)
        isEditable = false
        isSelectable = true
        isScrollEnabled = false
        backgroundColor = .clear
        textContainerInset = .zero
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// React Native's TextKit 1 setup (`RCTTextLayoutManager.mm`): no line padding, no font leading.
    static func layout(for text: NSAttributedString, size: CGSize)
        -> (storage: NSTextStorage, manager: NSLayoutManager, container: NSTextContainer)
    {
        let storage = NSTextStorage(attributedString: text)
        let manager = NSLayoutManager()
        manager.usesFontLeading = false
        storage.addLayoutManager(manager)
        let container = NSTextContainer(size: CGSize(width: size.width, height: .greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        manager.addTextContainer(container)
        return (storage, manager, container)
    }

    /// The paragraph's text with nothing of its own drawn: React Native still draws the words.
    private static func invisible(_ text: NSAttributedString) -> NSAttributedString {
        let copy = NSMutableAttributedString(attributedString: text)
        let whole = NSRange(location: 0, length: copy.length)
        copy.removeAttribute(.backgroundColor, range: whole)
        copy.removeAttribute(.shadow, range: whole)
        copy.addAttribute(.foregroundColor, value: UIColor.clear, range: whole)
        copy.addAttribute(.underlineColor, value: UIColor.clear, range: whole)
        copy.addAttribute(.strikethroughColor, value: UIColor.clear, range: whole)
        copy.enumerateAttribute(.attachment, in: whole) { value, range, _ in
            guard let attachment = value as? NSTextAttachment else { return }
            let blank = NSTextAttachment()
            blank.bounds = attachment.bounds
            blank.image = UIGraphicsImageRenderer(size: CGSize(width: max(attachment.bounds.width, 1), height: max(attachment.bounds.height, 1)))
                .image { _ in }
            copy.addAttribute(.attachment, value: blank, range: range)
        }
        return copy
    }

    func wordRange(at index: Int) -> NSRange {
        guard let position = position(from: beginningOfDocument, offset: index),
              let word = tokenizer.rangeEnclosingPosition(position, with: .word, inDirection: .storage(.forward))
        else {
            return NSRange(location: index, length: 1)
        }
        return NSRange(
            location: offset(from: beginningOfDocument, to: word.start),
            length: offset(from: word.start, to: word.end)
        )
    }

    func selectionRect() -> CGRect {
        let glyphs = layoutManager.glyphRange(forCharacterRange: selectedRange, actualCharacterRange: nil)
        return layoutManager.boundingRect(forGlyphRange: glyphs, in: textContainer)
    }

    /// The words in `range` as they read; an inline view (a Q-tag pill, a link's icon) stands in the
    /// text as U+FFFC and becomes the words React Native draws over that spot.
    func text(in range: NSRange) -> String {
        let string = textStorage.string as NSString
        let end = min(range.location + range.length, string.length)
        guard range.location >= 0, range.location < end else { return "" }
        var out = ""
        var index = range.location
        while index < end {
            let character = string.character(at: index)
            if character == 0xFFFC {
                out += inlineViewText(at: index)
                index += 1
            } else {
                let composed = string.rangeOfComposedCharacterSequence(at: index)
                out += string.substring(with: composed)
                index = composed.location + composed.length
            }
        }
        return out
    }

    private func inlineViewText(at index: Int) -> String {
        guard let paragraph = superview else { return "" }
        let glyphs = layoutManager.glyphRange(forCharacterRange: NSRange(location: index, length: 1), actualCharacterRange: nil)
        let box = layoutManager.boundingRect(forGlyphRange: glyphs, in: textContainer).insetBy(dx: -4, dy: -6)
        var out = ""
        collectText(in: paragraph, box: convert(box, to: paragraph), into: &out)
        return out
    }

    private func collectText(in view: UIView, box: CGRect, into out: inout String) {
        for child in view.subviews where child !== self && !child.isHidden {
            if let text = GhostexSelectionMenuView.attributedText(of: child) {
                let frame = child.convert(child.bounds, to: superview)
                if box.contains(CGPoint(x: frame.midX, y: frame.midY)) { out += text.string }
            } else {
                collectText(in: child, box: box, into: &out)
            }
        }
    }

    /// A tap anywhere outside the selection ends it, as on Android.
    func watchTapsOutside() {
        guard let window else { return }
        let tap = UITapGestureRecognizer(target: self, action: #selector(tappedSomewhere(_:)))
        tap.cancelsTouchesInView = false
        tap.delegate = TapPassthrough.shared
        window.addGestureRecognizer(tap)
        outsideTap = tap
    }

    // Later than the tap itself, so a tap on the edit menu runs its action before the overlay goes.
    @objc private func tappedSomewhere(_ recognizer: UITapGestureRecognizer) {
        guard !bounds.contains(recognizer.location(in: self)) else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in self?.dismiss() }
    }

    func dismiss() {
        guard superview != nil else { return }
        if let outsideTap { outsideTap.view?.removeGestureRecognizer(outsideTap) }
        outsideTap = nil
        if isFirstResponder { resignFirstResponder() }
        removeFromSuperview()
    }

    // The overlay's copy of the text is invisible, so the system's own Copy would only copy that.
    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        action == #selector(copy(_:)) && selectedRange.length > 0
    }

    override func copy(_ sender: Any?) {
        UIPasteboard.general.string = text(in: selectedRange)
    }
}

/// Lets the outside-tap watcher see taps every other recognizer also handles.
private final class TapPassthrough: NSObject, UIGestureRecognizerDelegate {
    static let shared = TapPassthrough()

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }
}
