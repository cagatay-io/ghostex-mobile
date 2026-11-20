/**
 * Draws a gx-core-shaped sidebar menu (./sidebar-menus.ts) in the phone's
 * ContextMenu card: icon ids become glyphs, headings and separators keep
 * their places, danger rows keep their red label, and every submenu opens as
 * a page with a Back row, the way the desktop opens its `page` submenus (the
 * phone has no room for side flyouts).
 *
 * SEE-ALSO: apps/desktop/src/app/native_sidebar/menus.rs, the desktop reader of the same shape.
 */

import type { ReactElement } from 'react';

import type { ContextMenuItem } from '../../components/sessions/ContextMenu';
import { ChevronLeftGlyph } from '../../components/sessions/icons';
import { sessionMenuIcon } from '../../session-menu/glyphs';
import type { SidebarMenuCommand, SidebarMenuItem } from './sidebar-menus';

const MENU_ICON_SIZE = 14;

/** The glyph for a row (session-menu/glyphs.tsx holds the one map of icon ids every session menu shares). */
function menuIcon(item: SidebarMenuItem, foreground: string): ReactElement | undefined {
  return sessionMenuIcon(item.icon, {
    size: MENU_ICON_SIZE,
    color: foreground,
    ...(item.iconColor !== undefined ? { iconColor: item.iconColor } : {}),
  });
}

export type SidebarMenuView = {
  /** The opened submenu's label, or null at the root. */
  openedLabel: string | null;
  items: ContextMenuItem[];
};

/**
 * The rows of `menu` at `menuPath` (the labels of the submenus opened so far). A path whose
 * submenu no longer exists stops at the deepest one that does.
 */
export function sidebarMenuView(
  menu: readonly SidebarMenuItem[],
  menuPath: readonly string[],
  handlers: {
    openPath: (menuPath: string[]) => void;
    run: (command: SidebarMenuCommand) => void;
  },
  foreground: string,
  /** Rows the screen draws itself where the menu holds a `hostSlot` (the terminal ⋯'s leading rows). */
  hostSlots: Readonly<Record<string, readonly ContextMenuItem[]>> = {},
): SidebarMenuView {
  let items: readonly SidebarMenuItem[] = menu;
  const opened: string[] = [];
  for (const label of menuPath) {
    const next = items.find((item) => item.children !== undefined && item.label === label);
    if (next?.children === undefined) break;
    items = next.children;
    opened.push(label);
  }
  const prefix = opened.join('/');
  const rows: ContextMenuItem[] = [];
  if (opened.length > 0) {
    rows.push({
      kind: 'item',
      key: `${prefix}:back`,
      label: 'Back',
      icon: <ChevronLeftGlyph size={MENU_ICON_SIZE} color={foreground} />,
      onPress: () => handlers.openPath(opened.slice(0, -1)),
    });
    rows.push({ kind: 'separator', key: `${prefix}:back-separator` });
  }
  items.forEach((item, index) => {
    const key = `${prefix}:${index}`;
    if (item.hostSlot !== undefined) {
      rows.push(...(hostSlots[item.hostSlot] ?? []));
      return;
    }
    if (item.separator === true) {
      rows.push({ kind: 'separator', key });
      return;
    }
    if (item.quick !== undefined) {
      rows.push({
        kind: 'quick',
        key,
        buttons: item.quick.map((button, buttonIndex) => {
          const buttonCommand = button.command;
          return {
            key: `${key}:${buttonIndex}`,
            label: button.label ?? '',
            icon: menuIcon(button, foreground),
            disabled: button.disabled || buttonCommand === undefined,
            onPress: buttonCommand === undefined ? () => undefined : () => handlers.run(buttonCommand),
          };
        }),
      });
      return;
    }
    const label = item.label ?? '';
    if (item.heading === true) {
      rows.push({ kind: 'heading', key, label });
      return;
    }
    const children = item.children;
    const command = item.command;
    const onPress =
      children !== undefined
        ? () => handlers.openPath([...opened, label])
        : command !== undefined
          ? () => handlers.run(command)
          : () => undefined;
    const base = {
      kind: 'item' as const,
      key,
      label,
      selected: item.checked,
      submenu: children !== undefined,
      destructive: item.danger === true,
      disabled: item.disabled || (children === undefined && command === undefined),
      suffix: item.suffix,
      onPress,
    };
    if (item.color !== undefined) {
      rows.push({ ...base, swatch: item.color });
      return;
    }
    const icon = menuIcon(item, foreground);
    rows.push(icon === undefined ? base : { ...base, icon });
  });
  return { openedLabel: opened.length > 0 ? opened[opened.length - 1] : null, items: rows };
}
