/**
 * Which agent a dot runs on and with which model, from gxserver's agent catalog
 * (`snapshot.settings.agents`). Replaces Open Dot's OpenAI ModelPicker: a dot runs on the agent
 * CLIs Ghostex already runs, and "Default" leaves the model to the agent.
 */

import { View } from 'react-native';

import type { DotAgentOption } from '../../dots/types';
import { Chip, ChipRow, Labeled } from './kit';

export default function AgentPicker({
  agents,
  agentId,
  model,
  onChange,
}: {
  agents: readonly DotAgentOption[];
  agentId: string;
  model: string | null;
  onChange: (agentId: string, model: string | null) => void;
}) {
  const selected = agents.find((agent) => agent.id === agentId) ?? null;
  if (agents.length === 0) return null;
  return (
    <View style={{ gap: 12 }}>
      <Labeled label='Agent'>
        <ChipRow>
          {agents.map((agent) => (
            <Chip
              key={agent.id}
              label={agent.name}
              selected={agent.id === agentId}
              onPress={() => {
                if (agent.id !== agentId) onChange(agent.id, null);
              }}
            />
          ))}
        </ChipRow>
      </Labeled>
      {selected !== null && selected.models.length > 0 ? (
        <Labeled label='Model'>
          <ChipRow>
            <Chip label='Default' selected={model === null} onPress={() => onChange(agentId, null)} />
            {selected.models.map((entry) => (
              <Chip
                key={entry.id}
                label={entry.label}
                selected={entry.id === model}
                onPress={() => onChange(agentId, entry.id)}
              />
            ))}
          </ChipRow>
        </Labeled>
      ) : null}
    </View>
  );
}
