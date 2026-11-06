/**
 * The fold's band while the iPhone Duo is half folded like a laptop (the active division as it reaches the layout
 * layer), in window points; null in every other pose and on every other iPhone. `VerticalBarArea`
 * provides it from the system's bar layout (`laptopFoldOf`); the laptop layouts (terminal, pad, chat composer,
 * sheets, dialogs, lists) read it here. Its own module, free of the native bridge, so light views can read it.
 */

import { createContext, useContext } from 'react';

import type { LaptopFold } from './layout';

const LaptopFoldContext = createContext<LaptopFold | null>(null);

export const LaptopFoldProvider = LaptopFoldContext.Provider;

export function useLaptopFold(): LaptopFold | null {
  return useContext(LaptopFoldContext);
}
