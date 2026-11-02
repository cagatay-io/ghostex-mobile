package com.termux.terminal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;

import org.junit.Test;

/**
 * Issue #398: TerminalView drew from a scroll row taken before the transcript shrank and crashed with
 * "extRow=-6, mScreenRows=46, mActiveTranscriptRows=0". Each case shrinks the transcript under a view
 * scrolled 6 rows up, shows the old row is no longer drawable, and that the clamped row is.
 */
public class TerminalBufferTopRowTest {

    private static final int ROWS = 46;
    private static final int COLUMNS = 80;
    private static final int SCROLLED_UP_TOP_ROW = -6;

    private static final TerminalOutput NO_OUTPUT = new TerminalOutput() {
        @Override public void write(byte[] data, int offset, int count) {}
        @Override public void titleChanged(String oldTitle, String newTitle) {}
        @Override public void onCopyTextToClipboard(String text) {}
        @Override public void onPasteTextFromClipboard() {}
        @Override public void onBell() {}
        @Override public void onColorsChanged() {}
    };

    private static TerminalEmulator emulator(int columns, int rows) {
        return new TerminalEmulator(NO_OUTPUT, columns, rows, 10, 20, 2000, null);
    }

    private static void feed(TerminalEmulator emulator, String text) {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        emulator.append(bytes, bytes.length);
    }

    private static void feedLines(TerminalEmulator emulator, int lines, int width) {
        StringBuilder line = new StringBuilder();
        for (int i = 0; i < width; i++) line.append((char) ('a' + i % 26));
        for (int i = 0; i < lines; i++) feed(emulator, line + "\r\n");
    }

    /** The rows TerminalRenderer.render converts for one frame drawn at {@code topRow}. */
    private static void drawFrame(TerminalEmulator emulator, int topRow) {
        TerminalBuffer screen = emulator.getScreen();
        for (int row = topRow; row < topRow + emulator.mRows; row++) screen.externalToInternalRow(row);
    }

    private static void assertOldRowCrashesAndClampedRowDraws(TerminalEmulator emulator) {
        TerminalBuffer screen = emulator.getScreen();
        assertTrue(screen.getActiveTranscriptRows() < -SCROLLED_UP_TOP_ROW);
        IllegalArgumentException crash = assertThrows(IllegalArgumentException.class,
            () -> drawFrame(emulator, SCROLLED_UP_TOP_ROW));
        assertTrue(crash.getMessage(), crash.getMessage().startsWith("extRow=" + SCROLLED_UP_TOP_ROW));
        int clamped = screen.clampTopRow(SCROLLED_UP_TOP_ROW);
        assertEquals(-screen.getActiveTranscriptRows(), clamped);
        drawFrame(emulator, clamped);
    }

    @Test
    public void wideRestingResizeReflowsTheTranscriptAway() {
        // 30 lines of 100 columns wrap to 60 rows at 80 columns: 14+ rows of transcript.
        TerminalEmulator emulator = emulator(COLUMNS, ROWS);
        feedLines(emulator, 30, 100);
        assertTrue(emulator.getScreen().getActiveTranscriptRows() >= -SCROLLED_UP_TOP_ROW);
        drawFrame(emulator, SCROLLED_UP_TOP_ROW);

        // setTerminalGrid parks a hidden zmx client at 200 columns: the lines unwrap and fit the screen.
        emulator.resize(200, ROWS, 10, 20);
        assertEquals(0, emulator.getScreen().getActiveTranscriptRows());
        assertOldRowCrashesAndClampedRowDraws(emulator);
    }

    @Test
    public void clearScrollbackEmptiesTheTranscript() {
        TerminalEmulator emulator = emulator(COLUMNS, ROWS);
        feedLines(emulator, 80, 10);
        drawFrame(emulator, SCROLLED_UP_TOP_ROW);

        feed(emulator, "\033[3J");
        assertOldRowCrashesAndClampedRowDraws(emulator);
    }

    @Test
    public void resetEmptiesTheTranscript() {
        TerminalEmulator emulator = emulator(COLUMNS, ROWS);
        feedLines(emulator, 80, 10);
        drawFrame(emulator, SCROLLED_UP_TOP_ROW);

        feed(emulator, "\033c");
        assertOldRowCrashesAndClampedRowDraws(emulator);
    }

    @Test
    public void altScreenHasNoTranscript() {
        TerminalEmulator emulator = emulator(COLUMNS, ROWS);
        feedLines(emulator, 80, 10);
        drawFrame(emulator, SCROLLED_UP_TOP_ROW);

        feed(emulator, "\033[?1049h");
        assertTrue(emulator.isAlternateBufferActive());
        assertOldRowCrashesAndClampedRowDraws(emulator);
    }

    @Test
    public void tallerResizePullsTranscriptRowsOntoTheScreen() {
        // 50 lines + the cursor line on a 42-row screen leave 9 transcript rows; 4 more screen rows leave 5.
        TerminalEmulator emulator = emulator(COLUMNS, ROWS - 4);
        feedLines(emulator, ROWS + 4, 10);
        int transcriptBefore = emulator.getScreen().getActiveTranscriptRows();
        assertTrue(transcriptBefore >= -SCROLLED_UP_TOP_ROW);

        emulator.resize(COLUMNS, ROWS, 10, 20);
        assertTrue(emulator.getScreen().getActiveTranscriptRows() < transcriptBefore);
        assertOldRowCrashesAndClampedRowDraws(emulator);
    }

    @Test
    public void clampKeepsRowsThatStillExist() {
        TerminalEmulator emulator = emulator(COLUMNS, ROWS);
        feedLines(emulator, 80, 10);
        TerminalBuffer screen = emulator.getScreen();
        int transcript = screen.getActiveTranscriptRows();

        assertEquals(SCROLLED_UP_TOP_ROW, screen.clampTopRow(SCROLLED_UP_TOP_ROW));
        assertEquals(0, screen.clampTopRow(0));
        assertEquals(0, screen.clampTopRow(3));
        assertEquals(-transcript, screen.clampTopRow(-transcript - 50));
    }
}
