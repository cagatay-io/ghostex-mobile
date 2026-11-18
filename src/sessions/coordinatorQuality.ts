/**
 * When a coordinator's model or effort may give the user a degraded experience: the phone's copy of
 * `coordinator_model_may_degrade` in packages/gx-protocol/src/coordinator.rs (the Ghostex main repo),
 * which the phone cannot link outside the chat core, for the agent step of New Coordinator. Change
 * both together.
 *
 * CDXC:Coordinators 2026-11-18 SEE-ALSO: packages/gx-protocol/src/coordinator.rs (the user's GitHub #665 decision: "You might get a degraded experience." only on a low-end model, Haiku, Sonnet or a Flash, Mini, Lite or Nano tier, or on Opus, Fable, Astra or Sol at medium effort or below; every other model, Argon included, says nothing).
 */

export const COORDINATOR_DEGRADED_TEXT = 'You might get a degraded experience.';

function modelWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

/** Haiku, Sonnet, or any Flash, Mini, Lite or Nano tier (`deepseek-v4-flash`, `gpt-6-mini`). */
export function coordinatorModelIsLowEnd(model: string): boolean {
  return modelWords(model).some((word) => ['haiku', 'sonnet', 'flash', 'mini', 'lite', 'nano'].includes(word));
}

/** Opus, Fable, Astra or Sol, any version, which warn only at medium effort or below. */
export function coordinatorModelIsTop(model: string): boolean {
  return modelWords(model).some((word) => ['opus', 'fable', 'astra', 'sol'].includes(word));
}

const MEDIUM_OR_LOWER = ['medium', 'med', 'low', 'minimal', 'min', 'none'];

/**
 * "You might get a degraded experience.", or null when the coordinator's model and effort give no
 * reason to say so. Either of the model's value and label may be empty; an unknown effort is no
 * reason on its own.
 */
export function coordinatorQualityWarning(model: { value?: string; label?: string }, effort?: string): string | null {
  const names = [model.value, model.label].map((text) => (text ?? '').trim()).filter((text) => text.length > 0);
  if (names.some(coordinatorModelIsLowEnd)) return COORDINATOR_DEGRADED_TEXT;
  const level = (effort ?? '').trim().toLowerCase();
  return names.some(coordinatorModelIsTop) && MEDIUM_OR_LOWER.includes(level) ? COORDINATOR_DEGRADED_TEXT : null;
}
