/**
 * What one camera read amounts to: a scanner reports a code's raw text and its display text
 * (ML Kit's `rawValue` and `displayValue` on Android, VisionKit's payload on iOS), and either may
 * be the one that reads as a pairing code.
 */

import { isGhostexPairingPayload, readPairingCode, type ReadPairingCodeResult } from '../../machines/pairingCodes';

export type ScanRead =
  | { kind: 'code'; parsed: Exclude<ReadPairingCodeResult, null> }
  /** `outdated`: a Ghostex code this build cannot read, from a newer computer. */
  | { kind: 'rejected'; payload: string; outdated: boolean };

/** The first payload that reads as a pairing code, the raw text first; else why none did. */
export function readScan(payloads: readonly (string | undefined)[]): ScanRead {
  const candidates = payloads.filter((text): text is string => text !== undefined && text.length > 0);
  for (const candidate of candidates) {
    const parsed = readPairingCode(candidate);
    if (parsed !== null) return { kind: 'code', parsed };
  }
  return { kind: 'rejected', payload: candidates[0] ?? '', outdated: candidates.some(isGhostexPairingPayload) };
}
