/**
 * Settings › Voice agent: the call mode of the selected computer's voice agent (`voiceAgentCallMode`),
 * with what each mode costs. The setting lives on the computer, so it is read and saved through
 * gxserver; the voice screen's gear changes the same setting.
 */

import { useEffect, useState } from 'react';

import { useInventoryStore } from '../../inventory/store';
import { useMachinesStore } from '../../machines/store';
import {
  readComputerCallMode,
  saveComputerCallMode,
  VOICE_CALL_MODE_NOTE,
  VOICE_CALL_MODES,
  type VoiceCallMode,
} from '../../voice/conversation';
import { voiceAgentOnIn } from '../../voice/featureSwitch';
import { SettingsSection } from './SectionBoundary';
import { Caption, ChoiceRow, SectionHeader, SettingsScreenLayout } from './SettingsControls';

export default function VoicePage() {
  const machine = useMachinesStore(
    (state) => state.machines.find((entry) => entry.id === state.selectedMachineId) ?? null,
  );
  // The computer's voice agent switch (Settings > Extensions there); its call mode means nothing while it is off.
  const switchedOn = useInventoryStore((state) =>
    machine === null ? true : voiceAgentOnIn(state.inventoriesByMachineId[machine.id]?.summary),
  );
  const [mode, setMode] = useState<VoiceCallMode | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (machine === null) return;
    let live = true;
    setMode(null);
    setProblem(null);
    void readComputerCallMode(machine).then((answer) => {
      if (!live) return;
      if ('mode' in answer) setMode(answer.mode);
      else setProblem(answer.error);
    });
    return () => {
      live = false;
    };
  }, [machine]);

  const choose = (next: VoiceCallMode) => {
    if (machine === null || next === mode) return;
    const previous = mode;
    setMode(next);
    setProblem(null);
    void saveComputerCallMode(machine, next).then((error) => {
      if (error === null) return;
      setMode(previous);
      setProblem(`Couldn't save it on your computer: ${error}`);
    });
  };

  if (machine === null) {
    return (
      <SettingsScreenLayout>
        <Caption>Connect a computer first: the voice agent and its settings live on your computer.</Caption>
      </SettingsScreenLayout>
    );
  }
  if (!switchedOn) {
    return (
      <SettingsScreenLayout>
        <Caption>
          The voice agent is turned off on your computer. Turn it on in Ghostex Settings › Extensions there to change
          how calls work.
        </Caption>
      </SettingsScreenLayout>
    );
  }
  return (
    <SettingsScreenLayout>
      <SettingsSection name="settings:voice:call-mode">
        <SectionHeader title="Call mode" />
        {VOICE_CALL_MODES.map((choice) => (
          <ChoiceRow
            key={choice.mode}
            label={choice.label}
            selected={mode === choice.mode}
            onPress={() => choose(choice.mode)}
          />
        ))}
        {VOICE_CALL_MODES.map((choice) => (
          <Caption key={choice.mode}>{`${choice.label}: ${choice.detail}`}</Caption>
        ))}
        <Caption>{VOICE_CALL_MODE_NOTE}</Caption>
        {mode === null && problem === null ? <Caption>Reading the setting from your computer…</Caption> : null}
        {problem !== null ? <Caption>{problem}</Caption> : null}
      </SettingsSection>
    </SettingsScreenLayout>
  );
}
