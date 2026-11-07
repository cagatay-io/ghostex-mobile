package com.termux.view;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.termux.terminal.TerminalEmulator;
import com.termux.terminal.TerminalOutput;

import org.junit.Test;

/**
 * Issue #477: a fling's queued frame ran after Easy Connect reconnected and the view had dropped its
 * session, and called isMouseTrackingActive() on a null emulator. A frame may only scroll the emulator
 * the fling started on.
 */
public class TerminalViewFlingTest {

    private static final TerminalOutput NO_OUTPUT = new TerminalOutput() {
        @Override public void write(byte[] data, int offset, int count) {}
        @Override public void titleChanged(String oldTitle, String newTitle) {}
        @Override public void onCopyTextToClipboard(String text) {}
        @Override public void onPasteTextFromClipboard() {}
        @Override public void onBell() {}
        @Override public void onColorsChanged() {}
    };

    private static TerminalEmulator emulator() {
        return new TerminalEmulator(NO_OUTPUT, 80, 24, 10, 20, 2000, null);
    }

    @Test
    public void flingKeepsScrollingTheEmulatorItStartedOn() {
        TerminalEmulator shown = emulator();
        assertTrue(TerminalView.flingStillOwnsEmulator(shown, shown));
    }

    @Test
    public void flingStopsWhenTheSessionWasDetached() {
        assertFalse(TerminalView.flingStillOwnsEmulator(emulator(), null));
    }

    @Test
    public void flingStopsWhenAnotherSessionIsShown() {
        assertFalse(TerminalView.flingStillOwnsEmulator(emulator(), emulator()));
    }
}
