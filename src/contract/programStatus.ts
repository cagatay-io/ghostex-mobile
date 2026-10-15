/**
 * The line a session's own program reported about itself over OSC 7501, as the phone shows it in
 * the session's long-press menu. Port of packages/gx-core/src/sidebar_view/program_status.rs
 * `program_status_hover_line` (the desktop shows the same line when the session row is hovered).
 *
 * CDXC:SessionStatus 2026-10-15 DECISION:
 * User (Q115): the phone shows the program's message "in the session's long-press menu or
 * details", never as always-visible row text (the phone's long-press rule). gxserver already
 * stripped control and direction-override characters and React Native draws it as plain text.
 */

type JsonObject = Record<string, unknown>;

function text(json: JsonObject, key: string): string {
  const value = json[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** '' when there is nothing to show or the reports do not drive the session's status. */
export function programStatusLine(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return '';
  const status = raw as JsonObject;
  if (status.governs !== true) return '';
  const message = text(status, 'message');
  const progress =
    typeof status.progress === 'number' && Number.isFinite(status.progress) ? Math.round(status.progress) : null;
  let label = '';
  switch (text(status, 'state')) {
    case 'blocked':
      switch (text(status, 'kind')) {
        case 'permission':
          label = 'Needs permission';
          break;
        case 'question':
          label = 'Needs an answer';
          break;
        case 'auth':
          label = 'Needs sign-in';
          break;
        default:
          label = 'Waiting for you';
      }
      break;
    case 'working':
      label = progress === null ? '' : `${progress}%`;
      break;
    case 'error':
      label = 'Failed';
      break;
    default:
      label = '';
  }
  if (label.length > 0 && message.length > 0) return `${label} · ${message}`;
  return label.length > 0 ? label : message;
}
