/**
 * The latest opening of a session from an entry path (a tap in the Sessions list or a new session there, Find's
 * Resume or Fork, a tapped notification, a link from outside the app, an attention-list row), and whether the person
 * moved on since it began. An attach whose terminal open ended at its time limit (`TerminalOpenTimedOut` in
 * src/terminal/sessions.ts) opens the Terminal screen, where its tab shows the failure with Retry, only while its
 * opening is current: no later opening began, and every navigation and every change of the Terminal screen's selected
 * tab since went to that opening's own session. `deepLinks.ts` reports both (`noteNavigation`), except the first
 * screen at launch.
 *
 * Only the latest opening can be current, so one record is kept and the next opening replaces it. A check holds no
 * listener: it is still valid when a navigation that waited until the screens were ready runs.
 *
 * A new opening is the person's new choice: once its session is known it ends that tab's terminal hold
 * (`src/terminal/terminalHold.ts`), so it opens as its view says; its own attach, should it end at the time limit,
 * holds the tab again.
 */

import { endTerminalHold } from '../terminal/terminalHold';

type Opening = { sessionKey: string | null; moved: boolean };

let latest: Opening | null = null;

export type OpeningCheck = {
  /** True while no later opening began and the person has not moved on since this one began. */
  current: () => boolean;
  /** Names the session this opening opens, once it is known (Find learns it from the computer first). */
  opens: (sessionKey: string) => void;
};

/** An opening of `sessionKey`'s session (null while not known yet) begins; every earlier one stops being current. */
export function beginOpening(sessionKey: string | null): OpeningCheck {
  const opening: Opening = { sessionKey, moved: false };
  latest = opening;
  if (sessionKey !== null) endTerminalHold(sessionKey);
  return {
    current: () => latest === opening && !opening.moved,
    opens: (key) => {
      opening.sessionKey = key;
      endTerminalHold(key);
    },
  };
}

/**
 * A navigation, or a change of the Terminal screen's selected tab, to `sessionKey`'s terminal (undefined: any other
 * screen, or no tab). Going to, or selecting, the latest opening's own session is that opening's doing; anything else
 * means the person moved on.
 */
export function noteNavigation(sessionKey: string | undefined): void {
  if (latest !== null && (sessionKey === undefined || sessionKey !== latest.sessionKey)) latest.moved = true;
}
