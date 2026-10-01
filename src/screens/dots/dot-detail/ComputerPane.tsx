/**
 * A dot's Computer (Open Dot's ComputerPane): its own browser's screen, refreshed every 2 seconds
 * while this tab is open, with Refresh (starts the browser when it is not running) and Take over,
 * which forwards your taps and typing to the page while the dot waits; then its files and where
 * it runs.
 *
 * CDXC:OpenDots 2026-10-01 WHY:
 * The phone reaches gxserver only by SSH exec, so the screen is a polled screenshot (`browserScreenshot`) and taking over sends one `browserInput` per tap or keystroke batch, in the 1280x800 page space the screenshot reports.
 */

import { useCallback, useRef, useState } from 'react';
import { AppState, Image, Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { FolderGlyph, NoteGlyph } from '../../../components/sessions/icons';
import {
  browserHandBack,
  browserInput,
  browserReset,
  browserScreenshot,
  browserTakeOver,
  listFiles,
} from '../../../dots/client';
import { DOT_STATUS_COLORS, formatBytes } from '../../../dots/status';
import { useDotsAction } from '../../../dots/store';
import type { BrowserInput, BrowserScreenshot, Dot, DotFileEntry } from '../../../dots/types';
import type { MachineRecord } from '../../../machines/store';
import type { DotsNavigation } from '../../../dots/openChat';
import { GhostexPalette } from '../../../theme/palette';
import { useAppearance } from '../../../theme/useAppearance';
import { isDocFile, remoteFilePath } from '../files';
import { Card, DotsButton, Empty, ErrorLine, Field, ListCard, Section, useDotsStyles } from '../kit';

const SCREEN_POLL_MS = 2000;

export default function ComputerPane({
  machine,
  dot,
  navigation,
}: {
  machine: MachineRecord | null;
  dot: Dot;
  navigation: DotsNavigation;
}) {
  const styles = useDotsStyles();
  const appearance = useAppearance();
  const [shot, setShot] = useState<BrowserScreenshot | null>(null);
  const [shotError, setShotError] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  const [typed, setTyped] = useState('');
  const [address, setAddress] = useState('');
  const [screenWidth, setScreenWidth] = useState(0);
  const [files, setFiles] = useState<DotFileEntry[] | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const control = useDotsAction(machine);
  const filesAction = useDotsAction(machine);
  const inFlight = useRef(false);

  const fetchShot = useCallback(
    async (wake: boolean): Promise<void> => {
      if (machine === null || (inFlight.current && !wake)) return;
      inFlight.current = true;
      try {
        const next = await browserScreenshot(machine, dot.id, wake);
        setShot(next);
        setShotError(null);
      } catch (error) {
        setShotError(error instanceof Error ? error.message : String(error));
      } finally {
        inFlight.current = false;
      }
    },
    [machine, dot.id]
  );

  useFocusEffect(
    useCallback(() => {
      const tick = (): void => {
        if (AppState.currentState === 'active') void fetchShot(false);
      };
      tick();
      const timer = setInterval(tick, SCREEN_POLL_MS);
      return () => clearInterval(timer);
    }, [fetchShot])
  );

  const takenOver = shot?.takenOver === true;
  const live = shot?.live === true;
  const pageWidth = shot?.width ?? 1280;
  const pageHeight = shot?.height ?? 800;

  /** One input to the page; it skips the snapshot refetch every other change does. */
  const send = (input: BrowserInput): void => {
    if (machine === null) return;
    void browserInput(machine, dot.id, input)
      .then(() => {
        setInputError(null);
        void fetchShot(false);
      })
      .catch((error: unknown) => setInputError(error instanceof Error ? error.message : String(error)));
  };

  const tapScreen = (event: GestureResponderEvent): void => {
    if (!takenOver || screenWidth <= 0) return;
    const scale = pageWidth / screenWidth;
    send({
      kind: 'click',
      x: Math.round(event.nativeEvent.locationX * scale),
      y: Math.round(event.nativeEvent.locationY * scale),
    });
  };

  const refresh = (): void => {
    setWaking(true);
    void fetchShot(true).finally(() => setWaking(false));
  };

  const toggleTakeOver = (): void => {
    void control
      .run((target) => (takenOver ? browserHandBack(target, dot.id) : browserTakeOver(target, dot.id)))
      .then((next) => {
        if (next !== undefined) setShot((current) => (current === null ? current : { ...current, takenOver: next }));
        void fetchShot(false);
      });
  };

  const loadFiles = (): void => {
    void filesAction
      .run((target) => listFiles(target, dot.id))
      .then((entries) => {
        if (entries !== undefined) setFiles(entries);
      });
  };

  const statusColor = takenOver ? DOT_STATUS_COLORS.waiting : live ? DOT_STATUS_COLORS.working : appearance.muted;
  const statusLabel = takenOver ? "You're in control" : live ? 'Live' : 'Idle';

  return (
    <View style={{ gap: 12 }}>
      <Section
        eyebrow='Computer'
        title={`${dot.name}'s computer`}
        description={
          takenOver
            ? `You're driving. Tap the screen to click and type below; logins stay saved in ${dot.name}'s browser.`
            : 'Its own browser and workspace. Watch it work, or take over to sign in yourself.'
        }
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <DotsButton label='Refresh' small busy={waking} onPress={refresh} />
        <DotsButton
          label={takenOver ? `Hand back to ${dot.name}` : 'Take over'}
          variant='primary'
          small
          busy={control.pending}
          disabled={machine === null || (!takenOver && shot?.image == null)}
          accessibilityLabel={
            takenOver ? `Hand back to ${dot.name}` : `Take over. ${dot.name} waits while you're in control.`
          }
          onPress={toggleTakeOver}
        />
      </View>
      <ErrorLine message={control.error ?? inputError ?? shotError} />

      <View style={[styles.listCard]}>
        <View style={[styles.listRow, { minHeight: 34, paddingVertical: 6, backgroundColor: appearance.cardActive }]}>
          <Text style={[styles.mono, { flex: 1 }]} numberOfLines={1}>
            {shot !== null && shot.url.length > 0 ? shot.url : `${dot.name.toLowerCase()}.browser`}
          </Text>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
          <Text style={styles.mono}>{statusLabel.toUpperCase()}</Text>
        </View>
        {shot?.image != null ? (
          <Pressable
            accessibilityRole={takenOver ? 'button' : 'image'}
            accessibilityLabel={`${dot.name}'s screen${shot.title.length > 0 ? `: ${shot.title}` : ''}`}
            disabled={!takenOver}
            onPress={tapScreen}
            onLayout={(event) => setScreenWidth(event.nativeEvent.layout.width)}
          >
            <Image
              source={{ uri: `data:${shot.mime};base64,${shot.image}` }}
              style={{ width: '100%', aspectRatio: pageWidth / pageHeight, backgroundColor: '#000000' }}
              resizeMode='stretch'
              fadeDuration={0}
            />
          </Pressable>
        ) : (
          <View
            style={{
              aspectRatio: pageWidth / pageHeight,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <Text style={[styles.muted, { textAlign: 'center' }]}>
              {shot === null && shotError === null
                ? 'Looking at the screen…'
                : `Nothing on screen yet. Press Refresh to start ${dot.name}'s browser, or ask it to open a website.`}
            </Text>
          </View>
        )}
      </View>

      {takenOver ? (
        <Card>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Field
              style={{ flex: 1 }}
              placeholder='Type into the page'
              value={typed}
              onChangeText={setTyped}
              autoCapitalize='none'
              autoCorrect={false}
              onSubmitEditing={() => {
                if (typed.length > 0) send({ kind: 'type', text: typed });
                setTyped('');
              }}
            />
            <DotsButton
              label='Type'
              small
              disabled={typed.length === 0}
              onPress={() => {
                send({ kind: 'type', text: typed });
                setTyped('');
              }}
            />
            <DotsButton label='Enter' small onPress={() => send({ kind: 'key', key: 'Enter' })} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <DotsButton label='Back' small onPress={() => send({ kind: 'back' })} />
            <DotsButton label='Reload' small onPress={() => send({ kind: 'reload' })} />
            <DotsButton
              label='Scroll up'
              small
              onPress={() => send({ kind: 'scroll', x: pageWidth / 2, y: pageHeight / 2, deltaX: 0, deltaY: -600 })}
            />
            <DotsButton
              label='Scroll down'
              small
              onPress={() => send({ kind: 'scroll', x: pageWidth / 2, y: pageHeight / 2, deltaX: 0, deltaY: 600 })}
            />
            <DotsButton label='Tab' small onPress={() => send({ kind: 'key', key: 'Tab' })} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Field
              style={{ flex: 1 }}
              placeholder='Go to an address'
              value={address}
              onChangeText={setAddress}
              autoCapitalize='none'
              autoCorrect={false}
              keyboardType='url'
              onSubmitEditing={() => {
                if (address.trim().length > 0) send({ kind: 'navigate', url: address.trim() });
              }}
            />
            <DotsButton
              label='Go'
              small
              disabled={address.trim().length === 0}
              onPress={() => send({ kind: 'navigate', url: address.trim() })}
            />
          </View>
        </Card>
      ) : null}

      <Section
        eyebrow='Files'
        description={`In ${dot.name}'s folder on this computer. Markdown and HTML files open here.`}
        right={
          <DotsButton
            label={files === null ? 'Show files' : 'Refresh'}
            small
            busy={filesAction.pending}
            onPress={loadFiles}
          />
        }
      >
        <ErrorLine message={filesAction.error} />
        {files === null ? null : files.length === 0 ? (
          <Empty>The folder is empty.</Empty>
        ) : (
          <ListCard>
            {files.map((file) => {
              const depth = file.path.split('/').length - 1;
              const name = file.path.split('/').pop() ?? file.path;
              const openable = !file.isDir && isDocFile(name);
              return (
                <Pressable
                  key={file.path}
                  disabled={!openable}
                  accessibilityRole={openable ? 'link' : undefined}
                  onPress={() =>
                    machine !== null &&
                    navigation.navigate('DocViewer', {
                      machineId: machine.id,
                      path: remoteFilePath(dot.folder, file.path),
                    })
                  }
                  style={({ pressed }) => [
                    styles.listRow,
                    { minHeight: 36, paddingVertical: 6, paddingLeft: 12 + depth * 14 },
                    pressed ? { backgroundColor: appearance.cardActive } : null,
                  ]}
                >
                  {file.isDir ? (
                    <FolderGlyph size={14} color={appearance.muted} />
                  ) : (
                    <NoteGlyph size={14} color={appearance.muted} />
                  )}
                  <Text
                    style={[
                      styles.text,
                      { flex: 1, fontSize: 13 },
                      file.isDir ? { color: appearance.muted } : null,
                      openable ? { color: GhostexPalette.ACCENT } : null,
                    ]}
                    numberOfLines={1}
                  >
                    {name}
                  </Text>
                  {!file.isDir ? <Text style={styles.mono}>{formatBytes(file.size)}</Text> : null}
                </Pressable>
              );
            })}
          </ListCard>
        )}
      </Section>

      <Section
        eyebrow='Where it runs'
        description={`${dot.name} works in its own folder on this computer, with its own browser.`}
      >
        <Card>
          <Text style={styles.mono} selectable>
            {dot.folder}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <DotsButton label='Reset browser' small onPress={() => setConfirmReset(true)} />
          </View>
        </Card>
      </Section>

      <ConfirmDialog
        visible={confirmReset}
        title={`Reset ${dot.name}'s browser?`}
        body={`Closes ${dot.name}'s browser and deletes its profile, so it is signed out of every website. Files stay.`}
        confirmLabel='Reset'
        destructive
        onConfirm={() => {
          setConfirmReset(false);
          void control.run((target) => browserReset(target, dot.id)).then(() => void fetchShot(false));
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </View>
  );
}
