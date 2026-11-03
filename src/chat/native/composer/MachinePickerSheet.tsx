/**
 * The tray's machine chip list: the computers that have the draft's project. One that can't be
 * reached keeps its row, dimmed and not pressable (gx-core `default_machine` never starts there).
 */

import { FlatList, Pressable, Text } from 'react-native';

import type { UnifiedChoiceMachine } from '../../../contract/unified/choices';
import { themedStyles } from '../transcript/theme';
import { Sheet } from './Sheet';

export function MachinePickerSheet({
  visible,
  machines,
  currentMachineId,
  onClose,
  onPick,
}: {
  visible: boolean;
  machines: UnifiedChoiceMachine[];
  currentMachineId: string | null;
  onClose: () => void;
  onPick: (machine: UnifiedChoiceMachine) => void;
}) {
  const styles = useStyles();
  return (
    <Sheet visible={visible} onClose={onClose} title="Run on" maxHeight="50%">
      <FlatList
        data={machines}
        keyExtractor={(machine) => machine.machineId}
        renderItem={({ item }) => {
          const on = item.machineId === currentMachineId;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ disabled: !item.connected, selected: on }}
              disabled={!item.connected}
              onPress={() => onPick(item)}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null, item.connected ? null : styles.away]}
            >
              <Text numberOfLines={1} style={[styles.label, on ? styles.labelOn : null]}>
                {item.label}
              </Text>
              {item.connected ? null : <Text style={styles.note}>Not connected</Text>}
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}

const useStyles = themedStyles((P) => ({
  row: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pressed: { backgroundColor: P.border },
  away: { opacity: 0.45 },
  label: { flex: 1, minWidth: 0, color: P.muted, fontSize: 14 },
  labelOn: { color: P.primary, fontWeight: '600' },
  note: { color: P.muted, fontSize: 12 },
}));
