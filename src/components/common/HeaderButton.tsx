/**
 * An icon button of a stack screen's header (`headerRight`): the file screens' Copy path, Reload and menu
 * buttons. Icon only, so it carries its label for VoiceOver; `active` marks a switch that is on, `disabled` a
 * button not available right now (drawn dimmed and not pressable, as the side bar draws its entries).
 */

import type { ReactNode, Ref } from 'react';
import { Pressable, StyleSheet, type ViewInstance } from 'react-native';

export default function HeaderButton({
  label,
  icon,
  onPress,
  active,
  disabled,
  buttonRef,
}: {
  label: string;
  icon: ReactNode;
  onPress: () => void;
  /** A switch's state; buttons that are no switch leave it out. */
  active?: boolean;
  /** Not available right now (drawn dimmed, not pressable): Share… while a share runs. */
  disabled?: boolean;
  /** The button itself, for a menu that opens at it. */
  buttonRef?: Ref<ViewInstance>;
}) {
  return (
    <Pressable
      ref={buttonRef}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={
        active === undefined && disabled !== true ? undefined : { selected: active, disabled: disabled === true }
      }
      disabled={disabled === true}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        active === true && styles.active,
        pressed && styles.pressed,
        disabled === true && styles.disabled,
      ]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  active: { backgroundColor: 'rgba(125,211,252,0.12)' },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.3 },
});
