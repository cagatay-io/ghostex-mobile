/**
 * Send Bug / Feedback on the phone: the computer's pop-up (apps/desktop/src/app/window/feedback_modal/)
 * as a screen. GitHub username on top, the message and its screenshots, the "Collect more data with
 * an agent" switch while a computer is connected, then the Review step that shows the exact issue
 * before it is posted.
 *
 * CDXC:Feedback 2026-10-16 DECISION:
 * User: "Yes, add it to the phone" (asked whether the phone, which had no feedback form, gets Send
 * Bug / Feedback). The phone's form matches the computer's: required GitHub username on top (same
 * shape check, remembered), the message, up to five screenshots picked from the photo library or
 * pasted, and the Review step with "Reported by @name" at the top. It posts to the feedback relay
 * itself (src/feedback/feedbackRelay.ts), so it works with no computer connected; the agent switch
 * shows only while one is, and Start Agent has that computer's gxserver start the feedback agent and
 * opens its chat. The row sits in the Sessions screen's app menu after Settings, since the phone's
 * menu has no Join Discord row.
 * SEE-ALSO: server/src/feedback/ (the draft rules, the relay post and the feedback agent),
 * src/feedback/ (the phone's copies of those rules), apps/desktop/src/app/window/feedback_modal/.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, type RouteProp, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { chatMachineLink, UNREACHABLE_MESSAGE } from '../chat/rust/machine-link';
import { ErrorBanner } from '../addProject/primitives';
import { SetupButton } from '../components/onboarding/SetupPrimitives';
import { FeedbackCopy } from '../copy';
import {
  crashReportText,
  crashSummary,
  crashTimeLabel,
  deleteCrashReport,
  listCrashReports,
  messageWithCrashReport,
  type StoredCrashReport,
} from '../feedback/crashReports';
import { draftBody, draftTitle, githubUsername } from '../feedback/feedbackDraft';
import {
  FEEDBACK_MAX_IMAGES,
  type FeedbackImage,
  pasteFeedbackImage,
  pickFeedbackImages,
  withoutImage,
} from '../feedback/feedbackImages';
import { feedbackClient, feedbackFooter, feedbackRequest, sendFeedback } from '../feedback/feedbackRelay';
import { useInventoryStore } from '../inventory/store';
import { useMachinesStore } from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import { useTerminalStore } from '../terminal/sessions';
import { GhostexPalette, GhostexRadii } from '../theme/palette';
import { useAppearance } from '../theme/useAppearance';
import { Caption, SettingsScreenLayout, ToggleRow, useSettingsStyles } from './settings/SettingsControls';

/** The GitHub username the last feedback named. */
const GITHUB_USERNAME_KEY = 'feedback.githubUsername.v1';
/** Starting the agent uploads the same screenshots a send does. */
const START_AGENT_TIMEOUT_MS = 180_000;

type Step =
  | { kind: 'compose' }
  | { kind: 'review'; title: string; body: string }
  | { kind: 'sent'; issueNumber: number; issueUrl: string };

export default function FeedbackScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Feedback'>>();
  const styles = useSettingsStyles();
  const appearance = useAppearance();
  const local = useMemo(() => createStyles(), []);

  const machineId = route.params?.machineId;
  const machine = useMachinesStore((state) => state.machines.find((entry) => entry.id === machineId));
  const connected = useInventoryStore((state) => {
    if (machineId === undefined) return false;
    const inventory = state.inventoriesByMachineId[machineId];
    return inventory !== undefined && inventory.summary !== null && inventory.lastError === null;
  });

  const [step, setStep] = useState<Step>({ kind: 'compose' });
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<FeedbackImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [collectWithAgent, setCollectWithAgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The crash report attached to this issue, as stored and as the cleaned text it adds. */
  const [crash, setCrash] = useState<{ report: StoredCrashReport; text: string } | null>(null);
  /** The newest stored report, offered as "Attach Crash Report" while none is attached. */
  const [storedCrash, setStoredCrash] = useState<StoredCrashReport | null>(null);
  const [showCrash, setShowCrash] = useState(false);
  const crashReportId = route.params?.crashReportId;

  useEffect(() => {
    void AsyncStorage.getItem(GITHUB_USERNAME_KEY)
      .then((stored) => {
        if (stored !== null) setUsername((current) => (current.length === 0 ? stored : current));
      })
      .catch(() => undefined);
  }, []);

  const attachCrash = useCallback((report: StoredCrashReport) => {
    setCrash({ report, text: crashReportText(report) });
    setMessage((current) => (current.trim().length === 0 ? crashSummary(report) : current));
  }, []);

  useEffect(() => {
    void listCrashReports()
      .then((reports) => {
        const requested = reports.find((report) => report.id === crashReportId);
        if (requested !== undefined) attachCrash(requested);
        setStoredCrash(reports[0] ?? null);
      })
      .catch(() => undefined);
  }, [attachCrash, crashReportId]);

  /** What the issue says after the reporter line: the message, then the cleaned crash report. */
  const fullMessage = crash === null ? message : messageWithCrashReport(message, crash.text);
  const forgetCrash = useCallback(() => {
    if (crash !== null) void deleteCrashReport(crash.report.id).catch(() => undefined);
  }, [crash]);

  const name = githubUsername(username);
  const withAgent = collectWithAgent && connected && machine !== undefined;
  const canContinue = !busy && typeof name === 'string' && message.trim().length > 0;
  const footer = useMemo(() => feedbackFooter(feedbackClient()), []);

  const remember = useCallback(() => {
    if (typeof name === 'string') void AsyncStorage.setItem(GITHUB_USERNAME_KEY, name).catch(() => undefined);
  }, [name]);

  const addImages = useCallback(
    async (source: 'library' | 'clipboard') => {
      setImageError(null);
      try {
        const outcome = source === 'library' ? await pickFeedbackImages(images) : await pasteFeedbackImage(images);
        setImages(outcome.images);
        setImageError(outcome.error);
      } catch (caught) {
        setImageError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [images],
  );

  const review = useCallback(() => {
    if (!canContinue || typeof name !== 'string') return;
    remember();
    setError(null);
    setStep({ kind: 'review', title: draftTitle(message), body: draftBody(fullMessage, name) });
  }, [canContinue, fullMessage, message, name, remember]);

  const startAgent = useCallback(async () => {
    if (!canContinue || typeof name !== 'string' || machine === undefined) return;
    remember();
    setBusy(true);
    setError(null);
    try {
      const link = chatMachineLink(machine);
      if ((await link.route()) !== 'socket') {
        setError(FeedbackCopy.agentUnsupported);
        return;
      }
      const sent = await link.request(
        'startFeedbackAgent',
        {
          app: 'mobile',
          message: fullMessage.trim(),
          githubUsername: name,
          images: images.map((image) => ({ name: image.name, dataBase64: image.dataBase64 })),
        },
        START_AGENT_TIMEOUT_MS,
      );
      if (sent.kind !== 'answered') {
        setError(UNREACHABLE_MESSAGE);
        return;
      }
      if (sent.answer.error !== null) {
        setError(sent.answer.error.message);
        return;
      }
      const result = (sent.answer.result ?? {}) as { projectId?: unknown; sessionId?: unknown };
      if (typeof result.sessionId !== 'string' || typeof result.projectId !== 'string') {
        setError(FeedbackCopy.agentNoSession);
        return;
      }
      forgetCrash();
      const sessionKey = useTerminalStore.getState().openChatTab(machine, {
        sessionId: result.sessionId,
        projectId: result.projectId,
        title: 'Bug / Feedback',
      });
      navigation.replace('Terminal', { sessionKey, machineId: machine.id, title: 'Bug / Feedback' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [canContinue, forgetCrash, fullMessage, images, machine, name, navigation, remember]);

  const send = useCallback(async () => {
    if (
      step.kind !== 'review' ||
      typeof name !== 'string' ||
      step.title.trim().length === 0 ||
      step.body.trim().length === 0
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const issue = await sendFeedback(feedbackRequest(step.title, step.body, images, name));
      forgetCrash();
      setStep({ kind: 'sent', ...issue });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [forgetCrash, images, name, step]);

  const input = [styles.input, local.input];
  const multiline = [styles.input, local.input, local.multiline];

  if (step.kind === 'sent') {
    return (
      <SettingsScreenLayout>
        <Text style={[styles.linkTitle, local.heading]}>{FeedbackCopy.sentTitle}</Text>
        <Caption>{FeedbackCopy.sentBody(step.issueNumber)}</Caption>
        <Caption>{step.issueUrl}</Caption>
        <View style={local.buttons}>
          <SetupButton label={FeedbackCopy.done} onPress={() => navigation.goBack()} style={local.button} />
          <SetupButton
            label={FeedbackCopy.openIssue}
            variant="primary"
            onPress={() => void Linking.openURL(step.issueUrl)}
            style={local.button}
          />
        </View>
      </SettingsScreenLayout>
    );
  }

  if (step.kind === 'review') {
    const canSend = !busy && step.title.trim().length > 0 && step.body.trim().length > 0;
    return (
      <SettingsScreenLayout intro={FeedbackCopy.reviewIntro}>
        <Text style={styles.cardLabel}>{FeedbackCopy.issueTitleLabel}</Text>
        <TextInput
          style={input}
          value={step.title}
          onChangeText={(title) => setStep({ ...step, title })}
          editable={!busy}
          placeholderTextColor={appearance.muted}
        />
        <Text style={[styles.cardLabel, local.spaced]}>{FeedbackCopy.issueBodyLabel}</Text>
        <TextInput
          style={[...multiline, local.body]}
          value={step.body}
          onChangeText={(body) => setStep({ ...step, body })}
          editable={!busy}
          multiline
          textAlignVertical="top"
          placeholderTextColor={appearance.muted}
        />
        <Caption>{FeedbackCopy.added(images.length, footer)}</Caption>
        {error !== null ? <ErrorBanner message={error} /> : null}
        <View style={local.buttons}>
          <SetupButton
            label={FeedbackCopy.back}
            disabled={busy}
            onPress={() => {
              setError(null);
              setStep({ kind: 'compose' });
            }}
            style={local.button}
          />
          <SetupButton
            label={FeedbackCopy.send}
            variant="primary"
            busy={busy}
            disabled={!canSend}
            onPress={() => void send()}
            style={local.button}
          />
        </View>
      </SettingsScreenLayout>
    );
  }

  return (
    <SettingsScreenLayout intro={withAgent ? FeedbackCopy.introAgent : FeedbackCopy.intro}>
      <Text style={styles.cardLabel}>{FeedbackCopy.usernameLabel}</Text>
      <TextInput
        style={input}
        value={username}
        onChangeText={setUsername}
        placeholder={FeedbackCopy.usernamePlaceholder}
        placeholderTextColor={appearance.muted}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        editable={!busy}
        accessibilityLabel={FeedbackCopy.usernameLabel}
      />
      {name === undefined ? (
        <Text style={[styles.caption, local.error]}>{FeedbackCopy.usernameInvalid}</Text>
      ) : (
        <Caption>{FeedbackCopy.usernameHint}</Caption>
      )}

      <Text style={[styles.cardLabel, local.spaced]}>{FeedbackCopy.messageLabel}</Text>
      <TextInput
        style={[...multiline, local.message]}
        value={message}
        onChangeText={setMessage}
        placeholder={FeedbackCopy.messagePlaceholder}
        placeholderTextColor={appearance.muted}
        multiline
        textAlignVertical="top"
        editable={!busy}
        accessibilityLabel={FeedbackCopy.messageLabel}
      />
      {images.length > 0 ? (
        <View style={local.thumbs}>
          {images.map((image) => (
            <View key={image.id} style={[local.thumb, { borderColor: appearance.border }]}>
              <Image source={{ uri: image.previewUri }} style={local.thumbImage} resizeMode="cover" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={FeedbackCopy.removeImage}
                hitSlop={8}
                disabled={busy}
                onPress={() => setImages((current) => withoutImage(current, image.id))}
                style={local.thumbRemove}
              >
                <Text style={local.thumbRemoveLabel}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={local.buttons}>
        <SetupButton
          label={FeedbackCopy.addScreenshots}
          small
          disabled={busy || images.length >= FEEDBACK_MAX_IMAGES}
          onPress={() => void addImages('library')}
        />
        <SetupButton
          label={FeedbackCopy.pasteImage}
          small
          disabled={busy || images.length >= FEEDBACK_MAX_IMAGES}
          onPress={() => void addImages('clipboard')}
        />
      </View>
      <Caption>{FeedbackCopy.imagesHint}</Caption>
      {imageError !== null ? <Text style={[styles.caption, local.error]}>{imageError}</Text> : null}

      {crash !== null ? (
        <View style={local.spaced}>
          <Text style={styles.cardLabel}>{FeedbackCopy.crashAttached}</Text>
          <Caption>{`${crashTimeLabel(crash.report.at)} · ${FeedbackCopy.crashAttachedHint}`}</Caption>
          {withAgent ? <Caption>{FeedbackCopy.crashAgentHint}</Caption> : null}
          {showCrash ? (
            <ScrollView
              style={[local.crash, { borderColor: appearance.border }]}
              nestedScrollEnabled
              accessibilityLabel={FeedbackCopy.crashAttached}
            >
              <Text style={[local.crashText, { color: appearance.muted }]} selectable>
                {crash.text}
              </Text>
            </ScrollView>
          ) : null}
          <View style={local.buttons}>
            <SetupButton
              label={showCrash ? FeedbackCopy.hideCrash : FeedbackCopy.showCrash}
              small
              disabled={busy}
              onPress={() => setShowCrash((shown) => !shown)}
            />
            <SetupButton
              label={FeedbackCopy.removeCrash}
              small
              disabled={busy}
              onPress={() => {
                setCrash(null);
                setShowCrash(false);
              }}
            />
          </View>
        </View>
      ) : storedCrash !== null ? (
        <View style={local.buttons}>
          <SetupButton
            label={FeedbackCopy.attachCrash(crashTimeLabel(storedCrash.at))}
            small
            disabled={busy}
            onPress={() => attachCrash(storedCrash)}
          />
        </View>
      ) : null}

      {connected && machine !== undefined ? (
        <View style={local.spaced}>
          <ToggleRow label={FeedbackCopy.agentLabel} value={collectWithAgent} onValueChange={setCollectWithAgent} />
          <Caption>{FeedbackCopy.agentDescription}</Caption>
        </View>
      ) : null}

      {error !== null ? <ErrorBanner message={error} /> : null}
      <View style={local.buttons}>
        <SetupButton label="Cancel" disabled={busy} onPress={() => navigation.goBack()} style={local.button} />
        <SetupButton
          label={withAgent ? FeedbackCopy.startAgent : FeedbackCopy.review}
          variant="primary"
          busy={busy}
          disabled={!canContinue}
          onPress={() => (withAgent ? void startAgent() : review())}
          style={local.button}
        />
      </View>
    </SettingsScreenLayout>
  );
}

function createStyles() {
  return StyleSheet.create({
    heading: {
      marginTop: 4,
    },
    input: {
      paddingVertical: 8,
    },
    multiline: {
      paddingTop: 10,
    },
    message: {
      minHeight: 160,
    },
    body: {
      minHeight: 240,
    },
    spaced: {
      marginTop: 10,
      gap: 6,
    },
    error: {
      color: GhostexPalette.DANGER,
    },
    crash: {
      maxHeight: 220,
      borderWidth: 1,
      borderRadius: GhostexRadii.row,
      padding: 8,
    },
    crashText: {
      fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
      fontSize: 11,
      lineHeight: 15,
    },
    thumbs: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    thumb: {
      width: 64,
      height: 64,
      borderRadius: GhostexRadii.row,
      borderWidth: 1,
      overflow: 'hidden',
    },
    thumbImage: {
      width: '100%',
      height: '100%',
    },
    thumbRemove: {
      position: 'absolute',
      top: 2,
      right: 2,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbRemoveLabel: {
      color: '#fff',
      fontSize: 14,
      lineHeight: 16,
    },
    buttons: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
    button: {
      flex: 1,
    },
  });
}
