/**
 * Whether New session offers Cloud Box: once the user has set Cloud Boxes up, that is a cloud
 * provider (Instabox or Boat) is connected (or its sign-in expired, so the choice can explain it),
 * or they have a box. A port of gx-core `cloud_boxes_set_up` (packages/gx-core/src/cloud_boxes.rs).
 *
 * CDXC:CloudBoxes 2026-11-04 DECISION:
 * User (Q1224, randomsand: "hide the Cloud Box option for people who don't use cloud boxes"): Cloud Boxes is on by default, so everybody saw a Cloud Box choice they had never set up. It now waits until Cloud Boxes is in use. The local Docker provider alone doesn't count: its "connected" only means Docker is there; a box made with it does.
 */

export type CloudProviderRow = { id?: string; state?: string; debugOnly?: boolean };

export function cloudBoxesSetUp(providers: readonly CloudProviderRow[], hasBoxes: boolean): boolean {
  return (
    hasBoxes ||
    providers.some(
      (provider) =>
        provider.debugOnly !== true &&
        provider.id !== 'local' &&
        (provider.state === 'connected' || provider.state === 'expired'),
    )
  );
}
