//
//  GhosttyTerminalView+Selection.swift
//  GhostexNative
//
//  Native (UITextInteraction) selection, grid selection helpers, selection gestures, and the selection delegates.
//  Moved verbatim from GhosttyTerminalView.swift (no logic changes).
//

import UIKit
import GhosttyKit

@MainActor
extension GhosttyTerminalView {
    // MARK: - Native Text Selection (UITextInteraction, iPhone)

    /// CDXC:Clipboard 2026-10-21 WHY: the iPhone used UIKit's editable `UITextInteraction` for selection, but on an editable text input a long press only moves a caret (which the terminal never draws) and dragging moves that caret, so a customer reported that press and drag "does nothing" and there was no way to copy terminal text; iPad had no selection at all. Every iOS device now uses the terminal's own touch selection: a long press selects the word under the finger, the drag that follows extends it, the handles adjust it, and the edit menu offers Copy, Paste and Select All. Do not switch back to the UIKit interaction without a long press that selects.
    var usesNativeTouchSelection: Bool {
        false
    }

    var usesAppOwnedTouchSelection: Bool {
        true
    }

    func setupNativeTextSelectionInteractions() {
        // This view is both the terminal's native selection surface and its
        // UITextInput. Editable mode lets UIKit present the software keyboard
        // when the terminal becomes first responder; non-editable mode accepts
        // selection but suppresses the IME.
        let interaction = UITextInteraction(for: .editable)
        interaction.delegate = self
        interaction.textInput = self
        addInteraction(interaction)
        nativeTextInteraction = interaction
        for gesture in interaction.gesturesForFailureRequirements {
            scrollRecognizer.require(toFail: gesture)
        }
    }

    fileprivate func notifyNativeSelectionLayoutChange() {
        guard nativeSelectionInteractionActive || nativeSelectedRange != nil else { return }
        nativeTextInputDelegate?.textWillChange(self)
        nativeTextInputDelegate?.textDidChange(self)
        nativeTextInputDelegate?.selectionWillChange(self)
        nativeTextInputDelegate?.selectionDidChange(self)
    }

    func refreshNativeSelectionSnapshot(resetSelection: Bool = false) {
        guard usesNativeTouchSelection else { return }

        nativeSelectionSnapshot = buildNativeSelectionSnapshot()
        if resetSelection {
            setNativeSelectedRange(nil)
            return
        }

        guard let nativeSelectedRange else { return }
        let clamped = nativeSelectionSnapshot.clampedRange(nativeSelectedRange)
        if clamped != nativeSelectedRange {
            setNativeSelectedRange(clamped)
        } else {
            notifyNativeSelectionLayoutChange()
        }
    }

    private func buildNativeSelectionSnapshot() -> TerminalNativeTextSnapshot {
        guard let surface = surface?.unsafeCValue,
              let metrics = selectionGridMetrics() else {
            return .empty
        }

        let rows = (0..<metrics.rows).map { readNativeSelectionLine(surface: surface, row: $0, columns: metrics.cols) }
        return TerminalNativeTextSnapshot(lines: rows, cellSize: metrics.cellSize, columns: metrics.cols)
    }

    private func readNativeSelectionLine(surface: ghostty_surface_t, row: Int, columns: Int) -> String {
        guard columns > 0 else { return "" }

        var text = ghostty_text_s()
        let selection = ghostty_selection_s(
            top_left: ghostty_point_s(
                tag: GHOSTTY_POINT_VIEWPORT,
                coord: GHOSTTY_POINT_COORD_EXACT,
                x: 0,
                y: UInt32(row)
            ),
            bottom_right: ghostty_point_s(
                tag: GHOSTTY_POINT_VIEWPORT,
                coord: GHOSTTY_POINT_COORD_EXACT,
                x: UInt32(columns - 1),
                y: UInt32(row)
            ),
            rectangle: true
        )

        let rawLine: String
        if ghostty_surface_read_text(surface, selection, &text) {
            defer { ghostty_surface_free_text(surface, &text) }
            rawLine = ghosttyTextString(text)
        } else {
            rawLine = ""
        }

        var line = rawLine
        while line.last == "\n" || line.last == "\r" {
            line.removeLast()
        }

        while let scalar = line.unicodeScalars.last,
              CharacterSet.whitespaces.contains(scalar) {
            line.removeLast()
        }

        let lineNSString = line as NSString
        if lineNSString.length > columns {
            line = lineNSString.substring(to: columns)
        }

        return line
    }

    func setNativeSelectedRange(_ range: NSRange?) {
        let clampedRange = range.map { nativeSelectionSnapshot.clampedRange($0) }
        if nativeSelectedRange == clampedRange {
            notifyNativeSelectionLayoutChange()
            return
        }

        nativeTextInputDelegate?.selectionWillChange(self)
        nativeSelectedRange = clampedRange
        if clampedRange == nil, !nativeSelectionInteractionActive {
            prefersNativeSelectionFirstResponder = false
        }
        nativeTextInputDelegate?.selectionDidChange(self)
    }

    func isPointOnNativeSelectionHandleHitArea(_ point: CGPoint) -> Bool {
        guard usesNativeTouchSelection,
              let nativeSelectedRange,
              nativeSelectedRange.length > 0 else {
            return false
        }
        let clamped = nativeSelectionSnapshot.clampedRange(nativeSelectedRange)
        guard clamped.length > 0 else { return false }

        let startRect = nativeSelectionSnapshot.caretRect(for: clamped.location)
        let endRect = nativeSelectionSnapshot.caretRect(for: clamped.location + clamped.length)
        let hitSlop = max(28, nativeSelectionSnapshot.cellSize.height * 1.5)
        return startRect.insetBy(dx: -hitSlop, dy: -hitSlop).contains(point)
            || endRect.insetBy(dx: -hitSlop, dy: -hitSlop).contains(point)
    }

    private func selectedNativeSelectionText() -> String? {
        guard let nativeSelectedRange, nativeSelectedRange.length > 0 else { return nil }
        return nativeSelectionSnapshot.text(in: nativeSelectedRange)
    }

    func clearNativeSelectionStateForTerminalInput() {
        guard usesNativeTouchSelection else { return }
        prefersNativeSelectionFirstResponder = false
        nativeSelectionInteractionActive = false
        if nativeSelectedRange != nil {
            setNativeSelectedRange(nil)
        }
    }

    @discardableResult
    func exitNativeSelectionTextInputContextForTerminalInput() -> Bool {
        guard isNativeSelectionTextInputContext else { return true }
        clearNativeSelectionStateForTerminalInput()
        return !isNativeSelectionTextInputContext
    }

    func shouldRedirectNativeSelectionPressesToTerminalInput(_ presses: Set<UIPress>) -> Bool {
        guard isNativeSelectionTextInputContext else { return false }
        return presses.contains { press in
            guard let key = press.key else { return false }
            return !key.modifierFlags.contains(.command)
        }
    }

    @available(iOS 16.0, *)
    func nativeSelectionMenuElements(suggestedActions: [UIMenuElement]) -> [UIMenuElement] {
        let selectionText = normalizedSelectionMenuText()
        var actions: [UIMenuElement] = []

        if selectionText != nil {
            actions.append(UIAction(title: "Copy", image: UIImage(systemName: "doc.on.doc")) { [weak self] _ in
                self?.copy(nil)
            })
        }

        actions.append(systemPasteMenuElement(from: suggestedActions))

        if nativeSelectionSnapshot.length > 0 || selectionGridMetrics() != nil {
            actions.append(UIAction(title: "Select All", image: UIImage(systemName: "selection.pin.in.out")) { [weak self] _ in
                self?.selectAll(nil)
            })
        }

        return actions
    }

    /// CDXC:Clipboard 2026-10-16 WHY: the menus' Paste must be UIKit's own `paste:` command, never a custom `UIAction` that calls `paste(nil)`. iOS lets only its own Paste command read another app's clipboard without asking; a custom action made iOS show the "Allow Paste" prompt on every paste, and when that prompt was declined or never came up (a customer report, and the iOS 27 simulator) the clipboard read came back empty and nothing was pasted.
    func systemPasteMenuElement(from suggestedActions: [UIMenuElement]) -> UIMenuElement {
        let pasteAction = #selector(UIResponderStandardEditActions.paste(_:))
        func find(in elements: [UIMenuElement]) -> UIMenuElement? {
            for element in elements {
                if let command = element as? UICommand, command.action == pasteAction { return command }
                if let menu = element as? UIMenu, let found = find(in: menu.children) { return found }
            }
            return nil
        }
        return find(in: suggestedActions)
            ?? UICommand(title: "Paste", image: UIImage(systemName: "doc.on.clipboard"), action: pasteAction)
    }

    private func selectAllVisibleText() {
        if usesNativeTouchSelection {
            refreshNativeSelectionSnapshot()
            guard nativeSelectionSnapshot.length > 0 else { return }
            setNativeSelectedRange(NSRange(location: 0, length: nativeSelectionSnapshot.length))
            return
        }

        guard usesAppOwnedTouchSelection,
              let metrics = selectionGridMetrics() else { return }
        touchSelection = TerminalGridSelection(
            start: TerminalGridPoint(row: 0, column: 0),
            end: TerminalGridPoint(row: metrics.rows - 1, column: metrics.cols - 1)
        )
        finishTouchSelection()
    }

    // MARK: - Grid Selection Helpers

    fileprivate func selectionGridMetrics() -> (cols: Int, rows: Int, cellSize: CGSize)? {
        guard let terminalSize = terminalSize() else { return nil }
        let cols = max(Int(terminalSize.columns), 1)
        let rows = max(Int(terminalSize.rows), 1)
        let resolvedCellWidth = cellSize.width > 0 ? cellSize.width : max(bounds.width / CGFloat(cols), 1)
        let resolvedCellHeight = cellSize.height > 0 ? cellSize.height : max(bounds.height / CGFloat(rows), 1)
        return (cols, rows, CGSize(width: resolvedCellWidth, height: resolvedCellHeight))
    }

    private func gridPoint(for location: CGPoint) -> TerminalGridPoint? {
        guard let metrics = selectionGridMetrics() else { return nil }
        let column = min(max(Int(floor(location.x / metrics.cellSize.width)), 0), metrics.cols - 1)
        let row = min(max(Int(floor(location.y / metrics.cellSize.height)), 0), metrics.rows - 1)
        return TerminalGridPoint(row: row, column: column)
    }

    private func gridPoint(
        forLinearOffset offset: Int,
        metrics: (cols: Int, rows: Int, cellSize: CGSize)
    ) -> TerminalGridPoint {
        let clampedOffset = min(max(offset, 0), max(metrics.cols * metrics.rows - 1, 0))
        return TerminalGridPoint(
            row: clampedOffset / metrics.cols,
            column: clampedOffset % metrics.cols
        )
    }

    private func selectionFromViewportText(
        _ text: ghostty_text_s,
        metrics: (cols: Int, rows: Int, cellSize: CGSize)
    ) -> TerminalGridSelection? {
        guard metrics.cols > 0, metrics.rows > 0 else { return nil }
        let start = gridPoint(forLinearOffset: Int(text.offset_start), metrics: metrics)
        let end = gridPoint(
            forLinearOffset: Int(text.offset_start + text.offset_len),
            metrics: metrics
        )
        return TerminalGridSelection(start: start, end: end).normalized
    }

    private func cellFrame(for point: TerminalGridPoint, metrics: (cols: Int, rows: Int, cellSize: CGSize)) -> CGRect {
        CGRect(
            x: CGFloat(point.column) * metrics.cellSize.width,
            y: CGFloat(point.row) * metrics.cellSize.height,
            width: metrics.cellSize.width,
            height: metrics.cellSize.height
        )
    }

    private func selectionRects(
        for selection: TerminalGridSelection,
        metrics: (cols: Int, rows: Int, cellSize: CGSize)
    ) -> [CGRect] {
        let normalized = selection.normalized
        let start = normalized.start
        let end = normalized.end

        return (start.row...end.row).map { row in
            let startColumn = row == start.row ? start.column : 0
            let endColumn = row == end.row ? end.column : max(metrics.cols - 1, 0)
            let width = CGFloat(max(endColumn - startColumn + 1, 1)) * metrics.cellSize.width
            return CGRect(
                x: CGFloat(startColumn) * metrics.cellSize.width,
                y: CGFloat(row) * metrics.cellSize.height,
                width: width,
                height: metrics.cellSize.height
            )
        }
    }

    private func selectionMenuPoint(for selection: TerminalGridSelection) -> CGPoint? {
        guard let metrics = selectionGridMetrics() else { return nil }
        let rects = selectionRects(for: selection, metrics: metrics)
        guard let firstRect = rects.first else { return nil }
        let bounds = rects.dropFirst().reduce(firstRect) { partialResult, rect in
            partialResult.union(rect)
        }
        return CGPoint(x: bounds.midX, y: min(bounds.maxY + 12, self.bounds.maxY - 1))
    }

    func updateTouchSelectionOverlay() {
        guard usesAppOwnedTouchSelection,
              let touchSelection,
              let metrics = selectionGridMetrics() else {
            touchSelectionOverlay.isHidden = true
            touchSelectionOverlay.clear()
            return
        }

        let normalized = touchSelection.normalized
        let rects = selectionRects(for: normalized, metrics: metrics)
        let startFrame = cellFrame(for: normalized.start, metrics: metrics)
        let endFrame = cellFrame(for: normalized.end, metrics: metrics)
        if touchSelectionOverlay.isHidden {
            // Ghostty's render layers are siblings of the overlay's layer; keep the highlight above them.
            bringSubviewToFront(touchSelectionOverlay)
        }
        touchSelectionOverlay.isHidden = false
        touchSelectionOverlay.update(rects: rects, startCell: startFrame, endCell: endFrame)
    }

    func isPointOnTouchSelectionHandle(_ point: CGPoint) -> Bool {
        guard usesAppOwnedTouchSelection, touchSelection != nil else { return false }

        let handlePoint = touchSelectionOverlay.convert(point, from: self)
        return touchSelectionOverlay.startHandle.frame.insetBy(dx: -22, dy: -22).contains(handlePoint) ||
            touchSelectionOverlay.endHandle.frame.insetBy(dx: -22, dy: -22).contains(handlePoint)
    }

    private func dismissEditMenuIfNeeded() {
        editMenuInteraction?.dismissMenu()
    }

    func clearTouchSelection() {
        touchSelectionAnchor = nil
        touchSelectionSeed = nil
        touchSelection = nil
        touchSelectionLoupe.hideLoupe()
        isSelecting = false
    }

    private func updateTouchSelectionLoupe(at location: CGPoint) {
        guard usesAppOwnedTouchSelection else { return }

        let previousVisibility = touchSelectionLoupe.isHidden
        touchSelectionLoupe.isHidden = true
        touchSelectionLoupe.update(
            from: self,
            focusPoint: location,
            in: bounds,
            safeAreaInsets: safeAreaInsets
        )
        if previousVisibility {
            bringSubviewToFront(touchSelectionOverlay)
            bringSubviewToFront(touchSelectionLoupe)
        }
    }

    private func quickLookWordSelection(at location: CGPoint) -> TerminalGridSelection? {
        guard let metrics = selectionGridMetrics(),
              let surface,
              let cSurface = surface.unsafeCValue else { return nil }

        let pos = ghosttyPoint(location)
        surface.sendMousePos(.init(x: pos.x, y: pos.y, mods: []))

        var text = ghostty_text_s()
        guard ghostty_surface_quicklook_word(cSurface, &text) else { return nil }
        defer { ghostty_surface_free_text(cSurface, &text) }
        return selectionFromViewportText(text, metrics: metrics)
    }

    private func startTouchSelection(at location: CGPoint) {
        if let wordSelection = quickLookWordSelection(at: location) {
            let normalized = wordSelection.normalized
            touchSelectionAnchor = nil
            touchSelectionSeed = normalized
            touchSelection = normalized
            isSelecting = true
            return
        }

        guard let point = gridPoint(for: location) else { return }
        touchSelectionAnchor = point
        touchSelectionSeed = nil
        touchSelection = TerminalGridSelection(start: point, end: point)
        isSelecting = true
    }

    private func updateTouchSelection(at location: CGPoint) {
        guard let point = gridPoint(for: location) else { return }

        if touchSelectionAnchor == nil, let seed = touchSelectionSeed?.normalized {
            if point < seed.start {
                touchSelectionAnchor = seed.end
            } else if point > seed.end {
                touchSelectionAnchor = seed.start
            } else {
                touchSelection = seed
                return
            }
        }

        guard let anchor = touchSelectionAnchor else { return }
        touchSelection = TerminalGridSelection(start: anchor, end: point).normalized
    }

    private func updateTouchSelectionHandle(_ kind: TerminalTouchSelectionHandleKind, at location: CGPoint) {
        guard var selection = touchSelection?.normalized,
              let point = gridPoint(for: location) else { return }

        switch kind {
        case .start:
            selection.start = point
        case .end:
            selection.end = point
        }

        touchSelection = selection.normalized
    }

    private func finishTouchSelection() {
        isSelecting = false
        touchSelectionLoupe.hideLoupe()
        guard let touchSelection,
              let menuPoint = selectionMenuPoint(for: touchSelection) else { return }
        showEditMenu(at: menuPoint)
    }

    private func currentSelectionText() -> String? {
        if let nativeSelectionText = selectedNativeSelectionText() {
            return nativeSelectionText
        }
        if let touchSelectionText = touchSelectionText() {
            return touchSelectionText
        }
        return ghosttySelectionText()
    }

    private func touchSelectionText() -> String? {
        guard let touchSelection,
              let surface = surface?.unsafeCValue else { return nil }

        let normalized = touchSelection.normalized
        var text = ghostty_text_s()
        let selection = ghostty_selection_s(
            top_left: ghostty_point_s(
                tag: GHOSTTY_POINT_VIEWPORT,
                coord: GHOSTTY_POINT_COORD_EXACT,
                x: UInt32(normalized.start.column),
                y: UInt32(normalized.start.row)
            ),
            bottom_right: ghostty_point_s(
                tag: GHOSTTY_POINT_VIEWPORT,
                coord: GHOSTTY_POINT_COORD_EXACT,
                x: UInt32(normalized.end.column),
                y: UInt32(normalized.end.row)
            ),
            rectangle: false
        )
        guard ghostty_surface_read_text(surface, selection, &text) else { return nil }
        defer { ghostty_surface_free_text(surface, &text) }
        return ghosttyTextString(text)
    }

    private func ghosttySelectionText() -> String? {
        guard let surface = surface?.unsafeCValue else { return nil }
        var text = ghostty_text_s()
        guard ghostty_surface_read_selection(surface, &text) else { return nil }
        defer { ghostty_surface_free_text(surface, &text) }
        return ghosttyTextString(text)
    }

    private func ghosttyTextString(_ text: ghostty_text_s) -> String {
        guard let rawText = text.text else { return "" }
        let buffer = UnsafeBufferPointer(
            start: UnsafeRawPointer(rawText).assumingMemoryBound(to: UInt8.self),
            count: Int(text.text_len)
        )
        return String(decoding: buffer, as: UTF8.self)
    }

    private func copyTextToClipboard(_ text: String) {
        Clipboard.copy(text)
    }

    fileprivate func normalizedSelectionMenuText() -> String? {
        guard let text = currentSelectionText()?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else { return nil }
        return text
    }

    // MARK: - Selection Gestures

    /// Double-tap selects the word under the finger, with handles, like the long press.
    /// It no longer sends double clicks: a program that reads the mouse took them as its own clicks.
    @objc func handleDoubleTap(_ recognizer: UITapGestureRecognizer) {
        let location = recognizer.location(in: self)
        dismissEditMenuIfNeeded()
        clearTouchSelection()
        guard let word = quickLookWordSelection(at: location) else { return }
        _ = focusForEditMenu()
        touchSelection = word.normalized
        finishTouchSelection()
    }

    /// Triple-tap selects the screen row under the finger.
    @objc func handleTripleTap(_ recognizer: UITapGestureRecognizer) {
        let location = recognizer.location(in: self)
        dismissEditMenuIfNeeded()
        clearTouchSelection()
        guard let point = gridPoint(for: location), let metrics = selectionGridMetrics() else { return }
        _ = focusForEditMenu()
        touchSelection = TerminalGridSelection(
            start: TerminalGridPoint(row: point.row, column: 0),
            end: TerminalGridPoint(row: point.row, column: metrics.cols - 1)
        )
        finishTouchSelection()
    }

    /// Long press + drag for custom selection
    @objc func handleSelectionPress(_ recognizer: UILongPressGestureRecognizer) {
        if usesAppOwnedTouchSelection {
            let location = recognizer.location(in: self)

            switch recognizer.state {
            case .began:
                dismissEditMenuIfNeeded()
                startTouchSelection(at: location)
                // The edit menu's Paste goes to the first responder; take it without raising the keyboard.
                _ = focusForEditMenu()
                updateTouchSelectionLoupe(at: location)
            case .changed:
                updateTouchSelection(at: location)
                updateTouchSelectionLoupe(at: location)
            case .ended:
                updateTouchSelection(at: location)
                finishTouchSelection()
            case .cancelled, .failed:
                clearTouchSelection()
            default:
                break
            }
            return
        }

        guard let surface = surface else { return }
        let location = recognizer.location(in: self)
        let pos = ghosttyPoint(location)

        switch recognizer.state {
        case .began:
            isSelecting = true
            requestKeyboardFocus(for: .selectionGesture)
            surface.sendMousePos(.init(x: pos.x, y: pos.y, mods: []))
            surface.sendMouseButton(.init(action: .press, button: .left, mods: []))
            requestRender()
        case .changed:
            surface.sendMousePos(.init(x: pos.x, y: pos.y, mods: []))
            requestRender()
        case .ended, .cancelled, .failed:
            surface.sendMousePos(.init(x: pos.x, y: pos.y, mods: []))
            surface.sendMouseButton(.init(action: .release, button: .left, mods: []))
            isSelecting = false
            requestRender()
            showEditMenu(at: location)
        default:
            break
        }
    }

    @objc func handleSelectionHandlePan(_ recognizer: UIPanGestureRecognizer) {
        guard usesAppOwnedTouchSelection, touchSelection != nil else { return }

        let kind: TerminalTouchSelectionHandleKind
        if recognizer.view === touchSelectionOverlay.startHandle {
            kind = .start
        } else {
            kind = .end
        }

        let location = recognizer.location(in: self)
        switch recognizer.state {
        case .began:
            dismissEditMenuIfNeeded()
            isSelecting = true
            updateTouchSelectionHandle(kind, at: location)
            updateTouchSelectionLoupe(at: location)
        case .changed:
            updateTouchSelectionHandle(kind, at: location)
            updateTouchSelectionLoupe(at: location)
        case .ended:
            updateTouchSelectionHandle(kind, at: location)
            isSelecting = false
            finishTouchSelection()
        case .cancelled, .failed:
            isSelecting = false
            touchSelectionLoupe.hideLoupe()
        default:
            break
        }
    }

    private func showEditMenu(at location: CGPoint) {
        let hasGhosttySelection: Bool
        if let surface = surface?.unsafeCValue {
            hasGhosttySelection = ghostty_surface_has_selection(surface)
        } else {
            hasGhosttySelection = false
        }
        guard touchSelection != nil || hasGhosttySelection else {
            return
        }
        let config = UIEditMenuConfiguration(identifier: nil, sourcePoint: location)
        editMenuInteraction?.presentEditMenu(with: config)
    }

    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        switch action {
        case #selector(copy(_:)):
            if let nativeSelectedRange, nativeSelectedRange.length > 0 {
                return true
            }
            if touchSelection != nil {
                return true
            }
            guard let cSurface = surface?.unsafeCValue else { return false }
            return ghostty_surface_has_selection(cSurface)
        case #selector(selectAll(_:)):
            if usesNativeTouchSelection {
                return nativeSelectionSnapshot.length > 0 || selectionGridMetrics() != nil
            }
            return usesAppOwnedTouchSelection && selectionGridMetrics() != nil
        case #selector(paste(_:)):
            return true
        default:
            return super.canPerformAction(action, withSender: sender)
        }
    }

    @objc override func copy(_ sender: Any?) {
        guard let selectionText = currentSelectionText(), !selectionText.isEmpty else { return }
        copyTextToClipboard(selectionText)
    }

    @objc override func selectAll(_ sender: Any?) {
        selectAllVisibleText()
    }

    @objc override func paste(_ sender: Any?) {
        guard UIPasteboard.general.hasStrings else { return }
        guard let text = UIPasteboard.general.string else {
            presentPasteMenuAtCursor()
            return
        }
        pendingPasteText = text
        performPasteAction()
        pendingPasteText = nil
    }

    /// CDXC:Clipboard 2026-10-16 WHY: iOS can refuse a paste it does not count as the user's own (on the iOS 27 simulator a hardware-keyboard Cmd+V reads an empty clipboard, in a system text field too). A text field then shows a Paste bubble the user taps to allow it; the terminal does the same with its edit menu at the cursor, whose Paste is the system command iOS always allows, instead of pasting nothing.
    func presentPasteMenuAtCursor() {
        var x: Double = 0
        var y: Double = 0
        var width: Double = 0
        var height: Double = 0
        if let surface = surface?.unsafeCValue {
            ghostty_surface_ime_point(surface, &x, &y, &width, &height)
        }
        let config = UIEditMenuConfiguration(identifier: nil, sourcePoint: CGPoint(x: x, y: y))
        editMenuInteraction?.presentEditMenu(with: config)
    }

    /// Asks with the desktop's unsafe-paste question; `decide` gets true only for Paste.
    func askBeforeUnsafePaste(_ decide: @escaping (Bool) -> Void) {
        guard !unsafePasteQuestionOpen, var presenter = window?.rootViewController else {
            decide(false)
            return
        }
        while let presented = presenter.presentedViewController {
            presenter = presented
        }
        let alert = UIAlertController(
            title: "Paste potentially unsafe text?",
            message: "This paste contains a newline or terminal control sequence and may run commands.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in
            self?.unsafePasteQuestionOpen = false
            decide(false)
        })
        let paste = UIAlertAction(title: "Paste", style: .default) { [weak self] _ in
            self?.unsafePasteQuestionOpen = false
            decide(true)
        }
        alert.addAction(paste)
        alert.preferredAction = paste
        unsafePasteQuestionOpen = true
        presenter.present(alert, animated: true)
    }

    private func clearSelectionAfterPaste() {
        if usesNativeTouchSelection, nativeSelectedRange != nil {
            setNativeSelectedRange(nil)
            prefersNativeSelectionFirstResponder = false
        }
        if usesAppOwnedTouchSelection, touchSelection != nil {
            clearTouchSelection()
        }
    }

    func performPasteAction() {
        invalidateLocalTextInputSession()
        pasteTextFromClipboard()
        clearSelectionAfterPaste()
    }
}

// MARK: - Native Text Selection Interaction Delegate

extension GhosttyTerminalView: UITextInteractionDelegate {
    func interactionShouldBegin(_ interaction: UITextInteraction, at point: CGPoint) -> Bool {
        guard usesNativeTouchSelection else { return false }
        prefersNativeSelectionFirstResponder = true
        shouldRestoreFocusAfterNativeSelection = isFirstResponder
        refreshNativeSelectionSnapshot()
        return nativeSelectionSnapshot.length > 0
    }

    func interactionWillBegin(_ interaction: UITextInteraction) {
        shouldRestoreFocusAfterNativeSelection = shouldRestoreFocusAfterNativeSelection || isFirstResponder
        nativeSelectionInteractionActive = true
        if !isFirstResponder {
            // Same focus as the long-press Paste menu: no keyboard when the user hid it or turned it off.
            _ = focusForEditMenu()
        }
        refreshNativeSelectionSnapshot()
    }

    func interactionDidEnd(_ interaction: UITextInteraction) {
        nativeSelectionInteractionActive = false
        if nativeSelectedRange == nil {
            prefersNativeSelectionFirstResponder = false
        }
        refreshNativeSelectionSnapshot()
    }
}

// MARK: - Gesture Recognizer Delegate

extension GhosttyTerminalView: UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        if gestureRecognizer == pinchRecognizer {
            return canHandlePinchZoom
        }
        if gestureRecognizer == scrollRecognizer {
            if usesNativeTouchSelection, nativeSelectionInteractionActive || nativeSelectedRange != nil {
                return false
            }
            if touchSelection != nil,
               isPointOnTouchSelectionHandle(touch.location(in: self)) {
                return false
            }
        }
        return true
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        if usesNativeTouchSelection,
           nativeSelectionInteractionActive || nativeSelectedRange != nil,
           gestureRecognizer == scrollRecognizer || otherGestureRecognizer == scrollRecognizer {
            return false
        }
        if gestureRecognizer == pinchRecognizer || otherGestureRecognizer == pinchRecognizer {
            return false
        }
        if isTouchSelectionGesture(gestureRecognizer) || isTouchSelectionGesture(otherGestureRecognizer) {
            return isTerminalOwnedGesture(gestureRecognizer) && isTerminalOwnedGesture(otherGestureRecognizer)
        }
        // Allow pan and long press to recognize simultaneously;
        // the handlers check isSelecting/isScrolling to avoid conflicts.
        return true
    }

    /// CDXC:Clipboard 2026-10-21 WHY: every terminal gesture was allowed to run alongside every other one, including the navigation's swipe back, which on iOS 26 and later starts anywhere in the screen. A selection drag to the right then also went back to the session list (seen in the iOS 27 simulator). The hold that selects and the handle drags now run only with the terminal's own gestures, so once a selection starts nothing outside the terminal can take the drag; scrolling keeps its old behaviour.
    private func isTouchSelectionGesture(_ recognizer: UIGestureRecognizer) -> Bool {
        recognizer === selectionRecognizer || recognizer.view is TerminalTouchSelectionHandleView
    }

    private func isTerminalOwnedGesture(_ recognizer: UIGestureRecognizer) -> Bool {
        recognizer.view === self || recognizer.view is TerminalTouchSelectionHandleView
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRequireFailureOf otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        // Long press should win over pan when held long enough
        if gestureRecognizer == scrollRecognizer && otherGestureRecognizer == selectionRecognizer {
            return otherGestureRecognizer.state == .began
        }
        return false
    }
}

// MARK: - Edit Menu Interaction Delegate

extension GhosttyTerminalView: UIEditMenuInteractionDelegate {
    func editMenuInteraction(
        _ interaction: UIEditMenuInteraction,
        menuFor configuration: UIEditMenuConfiguration,
        suggestedActions: [UIMenuElement]
    ) -> UIMenu? {
        var actions: [UIMenuElement] = []

        if let selectionText = normalizedSelectionMenuText(), !selectionText.isEmpty {
            actions.append(UIAction(title: "Copy", image: UIImage(systemName: "doc.on.doc")) { [weak self] _ in
                self?.copy(nil)
            })
        }

        actions.append(systemPasteMenuElement(from: suggestedActions))

        if usesAppOwnedTouchSelection {
            actions.append(UIAction(title: "Select All", image: UIImage(systemName: "selection.pin.in.out")) { [weak self] _ in
                self?.selectAll(nil)
            })
        }

        return UIMenu(children: actions)
    }
}
