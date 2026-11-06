//
//  GhostexShareSheet.swift
//  GhostexNative
//
//  The iOS share sheet for one file: Share… in the project file browser. Each module instance owns the
//  shares it started (`GhostexShareSheets`): a share lasts until GhostexShareSheetEnd has decided it is over, from what
//  the sheet reports, or until the module ends it at its teardown. Nothing settles when a sheet is released.
//

import UIKit

final class GhostexShareController: UIActivityViewController {
    fileprivate var end: GhostexShareSheetEnd?

    /// Where the sheet stands now, for its completion handler.
    fileprivate var presence: GhostexShareSheetEnd.Presence {
        GhostexShareSheetEnd.Presence(
            presented: presentingViewController != nil,
            beingDismissed: isBeingDismissed,
            presenterBeingDismissed: presentingViewController?.isBeingDismissed == true
        )
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // `isBeingDismissed` answers in viewDidDisappear whether this sheet itself is going away (UIKit
        // documentation); its presenter going away takes it along. An activity's full-screen view covering the
        // sheet makes it disappear too, but leaves it presented: that is no end. UIKit drops the completion handler
        // once it has run for good, so a handler still set means its call is still to come.
        end?.disappeared(GhostexShareSheetEnd.Disappearance(
            beingDismissed: isBeingDismissed,
            presented: presentingViewController != nil,
            presenterBeingDismissed: presentingViewController?.isBeingDismissed == true,
            resultPending: completionWithItemsHandler != nil
        ))
    }
}

/// The share sheets one module instance started and that are not over yet.
@MainActor
final class GhostexShareSheets {
    private var open: [ObjectIdentifier: GhostexShareController] = [:]

    nonisolated init() {}

    /// Shows the sheet for `file` over `presenter`; `settle` runs once, when the share is over (GhostexShareSheetEnd).
    func present(file: URL, from presenter: UIViewController, settle: @escaping (GhostexShareSheetOutcome) -> Void) {
        // UIKit refuses a presentation, shows nothing and reports nothing, from a presenter that is off screen,
        // already presents another controller or is itself in a transition. Checked before, because an accepted one
        // is not visible right after `present`: the adapted popover sets its presenting controller only later
        // (observed in the simulator, iOS 27.0).
        guard presenter.viewIfLoaded?.window != nil, presenter.presentedViewController == nil,
              !presenter.isBeingPresented, !presenter.isBeingDismissed else {
            settle(.unavailable)
            return
        }
        let sheet = GhostexShareController(activityItems: [file], applicationActivities: nil)
        let key = ObjectIdentifier(sheet)
        let end = GhostexShareSheetEnd { [weak self] outcome in
            self?.open[key] = nil
            settle(outcome)
        }
        sheet.end = end
        // UIKit calls the handler on the main thread.
        sheet.completionWithItemsHandler = { [weak sheet] activityType, completed, _, error in
            MainActor.assumeIsolated {
                end.activityFinished(
                    completed: completed,
                    activityType: activityType?.rawValue,
                    error: error,
                    presence: sheet?.presence ?? .gone
                )
            }
        }
        // Placed as React Native's `Share` places it without an anchor (RCTActionSheetManager.mm): a popover that
        // becomes a sheet on the iPhone; on the iPad it stands over the screen without an arrow.
        sheet.modalPresentationStyle = .popover
        sheet.popoverPresentationController?.permittedArrowDirections = []
        if UIDevice.current.userInterfaceIdiom == .pad {
            sheet.popoverPresentationController?.sourceView = presenter.view
            sheet.popoverPresentationController?.sourceRect = presenter.view.bounds
        }
        open[key] = sheet
        presenter.present(sheet, animated: true)
    }

    /// Ends every open share as interrupted and takes its sheet off the screen: the module is going away (reload or
    /// teardown), so no answer from these sheets may reach it any more.
    func endAll() {
        let sheets = Array(open.values)
        open = [:]
        for sheet in sheets {
            sheet.end?.interrupt()
            sheet.end = nil
            if sheet.presentingViewController != nil { sheet.dismiss(animated: false) }
        }
    }
}
