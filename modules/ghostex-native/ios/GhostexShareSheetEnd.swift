//
//  GhostexShareSheetEnd.swift
//  GhostexNative
//
//  When the share sheet of Share… (REQ-FILES-009 AC4) is over, and how it ended: the moment its temporary copy is
//  deleted and the next share may start. Kept free of UIKit, so its decisions can be checked on their own; the sheet
//  (GhostexShareSheet.swift) reports to it with what UIKit tells it.
//
//  A share is over when two things are known: the sheet has left the screen, and UIKit has reported the final result
//  of the last activity (`UIActivityViewController.completionWithItemsHandler`: completed, activity type, error).
//  UIKit fixes no order between the two (Apple documents the handler as running after the sheet is dismissed, and
//  `viewDidDisappear` after the transition), so neither alone settles:
//  - The handler for an activity the person picked and then cancelled inside the sheet (completed false with an
//    activity type) while iOS keeps the sheet on screen is no final result: the person may pick another activity.
//    React Native's `Share` ignores exactly that call (react-native 0.88 RCTActionSheetManager.mm:288-295), so its
//    promise can stay open forever.
//  - The sheet disappearing under an activity's own full-screen view is no end: it is still presented.
//  - The sheet's own dismissal waits for the handler while UIKit still holds it, so an activity error reported after
//    the sheet left is still reported as the error, not as a finished share. UIKit drops the handler once it has run
//    for good ("set to nil after activity performs or view controller is dismissed", UIActivityViewController.h); a
//    dismissal after that waits for nothing more and ends with the last result reported, or as closed.
//  Two ends come from outside the sheet: its presenter going away and taking it along before any result arrived, and
//  the module ending the share at its teardown (`interrupt`). A sheet UIKit would not present never gets this far
//  (GhostexShareSheets.present). The sheet being released is no signal: nothing settles from `deinit` (floor FL-NAT-04).
//

import Foundation

/// How a share sheet ended.
enum GhostexShareSheetOutcome {
    /// The sheet closed after the person shared or cancelled.
    case closed
    /// The last activity reported this error.
    case activityFailed(Error)
    /// The sheet went away before it reported a result: its presenter left, or the module ended the share.
    case interrupted
    /// UIKit would not present the sheet.
    case unavailable
}

@MainActor
final class GhostexShareSheetEnd {
    /// Where the sheet stands when its completion handler runs.
    enum Presence: Equatable {
        /// Presented, and neither it nor its presenter is being dismissed.
        case shown
        /// Still presented, but it or its presenter is being dismissed.
        case leaving
        /// No longer presented.
        case gone

        init(presented: Bool, beingDismissed: Bool, presenterBeingDismissed: Bool) {
            if !presented {
                self = .gone
            } else if beingDismissed || presenterBeingDismissed {
                self = .leaving
            } else {
                self = .shown
            }
        }
    }

    /// Why the sheet's `viewDidDisappear` ran.
    enum Disappearance: Equatable {
        /// Covered by an activity's own full-screen view; still presented.
        case covered
        /// The sheet's own dismissal (`isBeingDismissed`, which UIKit answers in `viewDidDisappear`);
        /// `resultPending`: UIKit still holds the completion handler, so its call is still to come.
        case dismissed(resultPending: Bool)
        /// Its presenter went away (no longer presented, or the presenter being dismissed) and took it along.
        case takenAlong

        init(beingDismissed: Bool, presented: Bool, presenterBeingDismissed: Bool, resultPending: Bool) {
            if beingDismissed {
                self = .dismissed(resultPending: resultPending)
            } else if !presented || presenterBeingDismissed {
                self = .takenAlong
            } else {
                self = .covered
            }
        }
    }

    private var settle: ((GhostexShareSheetOutcome) -> Void)?
    /// The sheet has left the screen.
    private var left = false
    /// The final result the completion handler reported, once it did.
    private var result: GhostexShareSheetOutcome?
    /// The result of an activity cancelled inside the sheet while it stayed on screen.
    private var lastActivity: GhostexShareSheetOutcome?

    /// `settle` runs once, when the share is over.
    init(settle: @escaping (GhostexShareSheetOutcome) -> Void) {
        self.settle = settle
    }

    /// The sheet's completion handler: `completed`, the picked activity's type (nil when the sheet was closed without
    /// one) and its error, with where the sheet stands right then.
    func activityFinished(completed: Bool, activityType: String?, error: Error?, presence: Presence) {
        guard settle != nil else { return }
        let outcome: GhostexShareSheetOutcome = error.map { .activityFailed($0) } ?? .closed
        // An activity cancelled inside a sheet that stays on screen: the person may pick another one.
        if !completed && activityType != nil && presence == .shown && !left {
            lastActivity = outcome
            return
        }
        result = outcome
        if presence == .gone { left = true }
        endIfOver()
    }

    /// The sheet's `viewDidDisappear`.
    func disappeared(_ how: Disappearance) {
        guard settle != nil else { return }
        switch how {
        case .covered:
            return
        case let .dismissed(resultPending):
            left = true
            if result == nil && !resultPending { result = lastActivity ?? .closed }
            endIfOver()
        case .takenAlong:
            left = true
            if result == nil { end(.interrupted) } else { endIfOver() }
        }
    }

    /// The module ends the share (its teardown); later reports from the sheet change nothing.
    func interrupt() {
        end(.interrupted)
    }

    private func endIfOver() {
        if left, let result { end(result) }
    }

    private func end(_ outcome: GhostexShareSheetOutcome) {
        guard let settle else { return }
        self.settle = nil
        settle(outcome)
    }
}
