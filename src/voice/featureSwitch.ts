/**
 * Whether a computer has its voice agent switched on: the built-in extension on its Settings >
 * Extensions (`voiceAgentHidden`, on by default), which its session summary names in
 * `builtInFeaturesOff` while it is off. The headset in the top bars, "Voice call about this chat"
 * and the long-press "Voice Call" show only while it is on; Dictate is a separate feature and does
 * not ask. A call that is running when it is turned off is ended by the computer (`ended` with
 * reason `turnedOff`).
 *
 * CDXC:VoiceMode 2026-10-25 WHY: `builtInFeatures` cannot carry it: a feature missing there counts as off, and a computer built before the voice agent had a switch leaves it out while its voice agent works. Such a computer sends no `builtInFeaturesOff`, so the phone reads the voice agent as off only when the computer says so (server/src/ghostex_cli/sessions/mobile_summary.rs).
 */

/** The voice agent's built-in feature id, as the computer lists it. */
export const VOICE_AGENT_FEATURE = 'voiceAgent';

/** Whether the voice agent is on for a computer whose session summary is `summary` (none yet: on). */
export function voiceAgentOnIn(summary: { builtInFeaturesOff?: readonly string[] } | null | undefined): boolean {
  return summary?.builtInFeaturesOff?.includes(VOICE_AGENT_FEATURE) !== true;
}
