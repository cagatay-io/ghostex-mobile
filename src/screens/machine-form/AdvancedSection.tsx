/**
 * The Advanced collapsible of the machine form. Tailscale (mobile-04): SSH
 * port, SSH key (generate / copy public key), Tailscale SSH switch, host key
 * with Reset. Easy Connect (mobile-08): pairing address (copy), Ghostex port,
 * this phone's key (copy public key), SSH port. Test connection deliberately
 * lives outside this component so it is tappable whether or not it is open.
 */

import { useAppearance } from '../../theme/useAppearance';
import { useEffect, useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import Collapsible from '../../components/common/Collapsible';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { SwitchRow } from '../../components/common/SwitchRow';
import { SetupButton } from '../../components/onboarding/SetupPrimitives';
import { TailscaleFormCopy } from '../../copy';
import type { MachineTransport } from '../../machines/store';

import { useFormStyles } from './styles';
import { FormField } from './TailscaleFields';

export type AdvancedSectionProps = {
  transport: MachineTransport;
  editing: boolean;
  sshPort: string;
  onSshPortChange: (value: string) => void;
  sshPortError?: string;
  /** Public half of the phone's key, or null when there is none. */
  publicKey: string | null;
  /**
   * Whether the saved key has been read: `reading` until the secure store answers, `failed` when it could
   * not be read. Neither shows "None" or offers Generate, so a key that is there is never replaced unseen.
   */
  keyRead: 'reading' | 'failed' | 'done';
  /** What the confirms call the computer. */
  computerName: string;
  /** Remove and Replace for a key stored for this computer; null hides the row. */
  onRemoveKey: (() => Promise<void>) | null;
  onReplaceKey: (() => Promise<void>) | null;
  /** Passphrase of an encrypted key; shown only while a key exists. */
  keyPassphrase: string;
  onKeyPassphraseChange: (value: string) => void;
  /** `keyStored`: a private key is stored with no public key beside it, so the row asks before replacing it. */
  onGenerateKey: () => Promise<'generated' | 'keyStored'>;
  generatingKey: boolean;
  tailscaleSsh: boolean;
  onTailscaleSshChange: (value: boolean) => void;
  /** Null while the machine has no pinned identity to reset (unsaved form). */
  onResetHostKey: (() => Promise<void>) | null;
  /** Easy Connect only. */
  pairingAddress: string | null;
  gxserverPort: string;
  onGxserverPortChange: (value: string) => void;
  /** Ports the Browser tab forwards for this machine; null omits the row. */
  webPreviewPorts: string | null;
};

function useCopied(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const copy = (text: string): void => {
    void Clipboard.setStringAsync(text).then(() => {
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    });
  };
  return [copied, copy];
}

/** `tc1q8w3v…8e3f`: enough of the address to recognise it, never the whole secret. */
function abbreviateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}…${address.slice(-4)}`;
}

function Row({
  label,
  detail,
  mono = false,
  first = false,
  trailing,
  toggle,
  children,
}: {
  label: string;
  detail?: string;
  mono?: boolean;
  first?: boolean;
  trailing?: React.ReactNode;
  /** Set when `trailing` is a switch: a tap anywhere on the row flips it. */
  toggle?: { value: boolean; onValueChange: (value: boolean) => void };
  children?: React.ReactNode;
}) {
  const formStyles = useFormStyles();
  const content = (
    <>
      <View style={formStyles.rowMain}>
        <Text style={formStyles.rowLabel}>{label}</Text>
        {detail !== undefined ? (
          <Text style={[formStyles.rowDetail, mono ? formStyles.rowDetailMono : null]}>{detail}</Text>
        ) : null}
        {children}
      </View>
      {trailing}
    </>
  );
  const style = [formStyles.row, first ? formStyles.rowFirst : null];
  if (toggle === undefined) {
    return <View style={style}>{content}</View>;
  }
  return (
    <SwitchRow value={toggle.value} onValueChange={toggle.onValueChange} label={label} style={style}>
      {content}
    </SwitchRow>
  );
}

export default function AdvancedSection(props: AdvancedSectionProps) {
  const copy = TailscaleFormCopy.advanced;
  const easyConnect = props.transport === 'tailcat';
  return (
    <Collapsible title={copy.title} hint={easyConnect ? copy.hintEasyConnect : copy.hintTailscale}>
      {easyConnect ? <EasyConnectRows {...props} /> : <TailscaleRows {...props} />}
    </Collapsible>
  );
}

function SshPortField({ sshPort, onSshPortChange, sshPortError }: AdvancedSectionProps) {
  return (
    <FormField
      label={TailscaleFormCopy.advanced.sshPort}
      value={sshPort}
      onChangeText={onSshPortChange}
      error={sshPortError}
      mono
      keyboardType="number-pad"
    />
  );
}

function SshKeyRow({
  publicKey,
  keyRead,
  editing,
  onGenerateKey,
  generatingKey,
  computerName,
  onReplaceKey,
  first = false,
}: AdvancedSectionProps & { first?: boolean }) {
  const copy = TailscaleFormCopy.advanced;
  const [copied, copyText] = useCopied();
  const [askReplace, setAskReplace] = useState(false);
  const generate = (): void => {
    void onGenerateKey().then((outcome) => {
      if (outcome === 'keyStored' && onReplaceKey !== null) setAskReplace(true);
    });
  };
  const hasKey = publicKey !== null && publicKey.length > 0;
  // Until the saved key is read (or when it can't be), the row says nothing rather than "None".
  const known = hasKey || keyRead === 'done';
  return (
    <>
      <Row
        first={first}
        label={copy.sshKey}
        detail={hasKey ? copy.sshKeyPresent : !known ? undefined : editing ? copy.sshKeyNoneEdit : copy.sshKeyNone}
        trailing={
          hasKey ? (
            <SetupButton small label={copied ? copy.copied : copy.copyPublicKey} onPress={() => copyText(publicKey)} />
          ) : known ? (
            <SetupButton small label={copy.generate} busy={generatingKey} onPress={generate} />
          ) : undefined
        }
      />
      <ConfirmDialog
        visible={askReplace}
        title={copy.replaceKeyConfirm.title}
        body={copy.replaceKeyConfirm.body(computerName)}
        confirmLabel={copy.replaceKeyConfirm.confirm}
        destructive
        onConfirm={() => {
          setAskReplace(false);
          if (onReplaceKey !== null) void onReplaceKey();
        }}
        onCancel={() => setAskReplace(false)}
      />
    </>
  );
}

/** Remove or Replace the key stored for this computer, each behind a confirm. */
function ChangeKeyRow({ computerName, onRemoveKey, onReplaceKey }: AdvancedSectionProps) {
  const copy = TailscaleFormCopy.advanced;
  const [asking, setAsking] = useState<'remove' | 'replace' | null>(null);
  const [busy, setBusy] = useState<'remove' | 'replace' | null>(null);
  if (onRemoveKey === null || onReplaceKey === null) return null;
  const run = (which: 'remove' | 'replace'): void => {
    setAsking(null);
    if (busy !== null) return;
    setBusy(which);
    void (which === 'remove' ? onRemoveKey() : onReplaceKey()).finally(() => setBusy(null));
  };
  const confirm = asking === 'replace' ? copy.replaceKeyConfirm : copy.removeKeyConfirm;
  return (
    <>
      <Row
        label={copy.changeKey}
        detail={copy.changeKeyDetail}
        trailing={
          <View style={styles.buttons}>
            <SetupButton
              small
              label={copy.replaceKey}
              busy={busy === 'replace'}
              disabled={busy !== null}
              onPress={() => setAsking('replace')}
            />
            <SetupButton
              small
              label={copy.removeKey}
              busy={busy === 'remove'}
              disabled={busy !== null}
              onPress={() => setAsking('remove')}
            />
          </View>
        }
      />
      <ConfirmDialog
        visible={asking !== null}
        title={confirm.title}
        body={confirm.body(computerName)}
        confirmLabel={confirm.confirm}
        destructive
        onConfirm={() => run(asking ?? 'remove')}
        onCancel={() => setAsking(null)}
      />
    </>
  );
}

function HostKeyRow({ onResetHostKey }: AdvancedSectionProps) {
  const formStyles = useFormStyles();
  const copy = TailscaleFormCopy.advanced;
  const [resetDone, setResetDone] = useState(false);
  const [resetting, setResetting] = useState(false);
  const reset = (): void => {
    if (onResetHostKey === null || resetting) return;
    setResetting(true);
    void onResetHostKey().then(
      () => {
        setResetting(false);
        setResetDone(true);
      },
      () => setResetting(false),
    );
  };
  const detail =
    onResetHostKey === null ? copy.hostKeyNewDetail : resetDone ? copy.hostKeyResetDone : copy.hostKeyPinned;
  return (
    <Row
      label={copy.hostKey}
      detail={detail}
      trailing={
        onResetHostKey === null ? (
          <Text style={formStyles.rowValue}>{copy.hostKeyNew}</Text>
        ) : (
          <SetupButton small label={copy.hostKeyReset} busy={resetting} onPress={reset} />
        )
      }
    />
  );
}

function TailscaleRows(props: AdvancedSectionProps) {
  const appearance = useAppearance();
  const formStyles = useFormStyles();
  const copy = TailscaleFormCopy.advanced;
  const hasKey = props.publicKey !== null && props.publicKey.length > 0;
  return (
    <>
      <SshPortField {...props} />
      <View style={formStyles.rowsCard}>
        <SshKeyRow {...props} first />
        <ChangeKeyRow {...props} />
        {hasKey ? (
          <Row label={copy.passphrase}>
            <FormField
              label=""
              value={props.keyPassphrase}
              onChangeText={props.onKeyPassphraseChange}
              placeholder={copy.passphrasePlaceholder}
              secureTextEntry
            />
          </Row>
        ) : null}
        <Row
          label={copy.tailscaleSsh}
          detail={copy.tailscaleSshDetail}
          toggle={{ value: props.tailscaleSsh, onValueChange: props.onTailscaleSshChange }}
          trailing={
            <Switch
              value={props.tailscaleSsh}
              onValueChange={props.onTailscaleSshChange}
              trackColor={{ false: appearance.cardActive, true: appearance.accent }}
              thumbColor={appearance.foreground}
            />
          }
        />
        <HostKeyRow {...props} />
      </View>
    </>
  );
}

function EasyConnectRows(props: AdvancedSectionProps) {
  const formStyles = useFormStyles();
  const copy = TailscaleFormCopy.advanced;
  const [addressCopied, copyAddress] = useCopied();
  const [keyCopied, copyKey] = useCopied();
  const address = props.pairingAddress ?? '';
  const hasKey = props.publicKey !== null && props.publicKey.length > 0;
  return (
    <>
      <View style={formStyles.rowsCard}>
        <Row
          first
          label={copy.pairingAddress}
          detail={address.length > 0 ? abbreviateAddress(address) : undefined}
          mono
          trailing={
            address.length > 0 ? (
              <SetupButton
                small
                label={addressCopied ? copy.copied : copy.copyAddress}
                onPress={() => copyAddress(address)}
              />
            ) : undefined
          }
        />
        <Row label={copy.ghostexPort} detail={copy.ghostexPortDetail}>
          <FormField
            label=""
            value={props.gxserverPort}
            onChangeText={props.onGxserverPortChange}
            mono
            keyboardType="number-pad"
          />
        </Row>
        <Row
          label={copy.phoneKey}
          detail={hasKey ? copy.phoneKeyDetail : props.keyRead === 'done' ? copy.phoneKeyNone : undefined}
          trailing={
            hasKey ? (
              <SetupButton
                small
                label={keyCopied ? copy.copied : copy.copyPublicKey}
                onPress={() => copyKey(props.publicKey ?? '')}
              />
            ) : undefined
          }
        />
        {props.webPreviewPorts !== null ? (
          <Row
            label={copy.webPreviewPorts}
            detail={copy.webPreviewPortsDetail}
            trailing={<Text style={formStyles.rowValue}>{props.webPreviewPorts}</Text>}
          />
        ) : null}
      </View>
    </>
  );
}

const styles = {
  buttons: { flexDirection: 'row' as const, gap: 8 },
};
