/**
 * The TestFlight goodbye card: 11.8.0 is the last TestFlight build, so switch to the App Store version
 * (src/updates/testFlightNotice.ts decides when it shows). Open the App Store is the suggested answer;
 * Later, a tap outside or the back gesture put it away until the next launch a day or more later.
 */

import { TestFlightNoticeCopy } from '../../copy';
import { laterTestFlightNotice, openAppStoreFromNotice, useTestFlightNotice } from '../../updates/testFlightNotice';
import ConfirmDialog from './ConfirmDialog';

export default function TestFlightNotice() {
  const visible = useTestFlightNotice((state) => state.visible);
  const openError = useTestFlightNotice((state) => state.openError);
  if (!visible) return null;
  return (
    <ConfirmDialog
      visible
      title={TestFlightNoticeCopy.title}
      body={openError === null ? TestFlightNoticeCopy.body : `${TestFlightNoticeCopy.body}\n\n${openError}`}
      confirmLabel={TestFlightNoticeCopy.open}
      cancelLabel={TestFlightNoticeCopy.later}
      onConfirm={() => void openAppStoreFromNotice()}
      onCancel={laterTestFlightNotice}
    />
  );
}
