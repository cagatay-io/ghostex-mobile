/**
 * OpenDots settings on the phone (Open Dot's SettingsView): saved logins, rules for every dot, and
 * the state of the apps, triggers and browser the dots use. Signing in to Composio and connecting
 * apps stay on the computer, where its sign-in pages can reach Ghostex.
 */

import { useLayoutEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { addPassword, composioRefresh, deletePassword } from '../../dots/client';
import { useDotsAction } from '../../dots/store';
import type { RootStackParamList } from '../../navigation/types';
import { GhostexPalette } from '../../theme/palette';
import RuleEditor from './RuleEditor';
import {
  Card,
  DotsButton,
  DotsPage,
  Empty,
  ErrorLine,
  Field,
  ListCard,
  RemoveButton,
  Section,
  useDotsStyles,
} from './kit';
import { useDotsScreen } from './useDotsScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'DotsSettings'>;

export default function DotsSettingsScreen({ navigation, route }: Props) {
  const { machineId } = route.params;
  const { machine, snapshot, loading, refresh, gate } = useDotsScreen(machineId);
  const styles = useDotsStyles();
  const [login, setLogin] = useState({ site: '', username: '', password: '' });
  const logins = useDotsAction(machine);
  const apps = useDotsAction(machine);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'OpenDots settings' });
  }, [navigation]);

  if (gate !== null || snapshot === null) return gate;
  const { settings } = snapshot;
  const connected = settings.composio.apps.filter((app) => app.connected);

  const saveLogin = (): void => {
    const site = login.site.trim();
    const username = login.username.trim();
    if (site.length === 0 || username.length === 0 || login.password.length === 0) {
      logins.setError('Fill in the site, the username and the password.');
      return;
    }
    void logins
      .run(async (target) => {
        await addPassword(target, { site, username, password: login.password });
        return true;
      })
      .then((saved) => {
        if (saved === true) setLogin({ site: '', username: '', password: '' });
      });
  };

  return (
    <DotsPage refreshing={loading} onRefresh={refresh}>
      <Section
        eyebrow='Passwords'
        title='Saved logins'
        description={`Your dots can use these to sign in to websites in their browser. ${
          settings.vault === 'keychain'
            ? "Encrypted with a key in your computer's Keychain"
            : 'Encrypted with a key in a private file on your computer'
        }, typed straight into the page, and never shown to the agent.`}
      >
        {snapshot.passwords.length > 0 ? (
          <ListCard>
            {snapshot.passwords.map((entry) => (
              <View key={entry.id} style={styles.listRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.text} numberOfLines={1}>
                    {entry.site}
                  </Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {entry.username}
                  </Text>
                </View>
                <Text style={[styles.mono, { letterSpacing: 2 }]}>••••••••</Text>
                <RemoveButton
                  label={`Delete the login for ${entry.site}`}
                  onPress={() => void logins.run((target) => deletePassword(target, entry.id))}
                />
              </View>
            ))}
          </ListCard>
        ) : (
          <Empty>No saved logins yet.</Empty>
        )}
        <Card>
          <Field
            placeholder='Site, for example github.com'
            autoCapitalize='none'
            autoCorrect={false}
            keyboardType='url'
            value={login.site}
            onChangeText={(site) => setLogin({ ...login, site })}
          />
          <Field
            placeholder='Username or email'
            autoCapitalize='none'
            autoCorrect={false}
            textContentType='username'
            value={login.username}
            onChangeText={(username) => setLogin({ ...login, username })}
          />
          <Field
            placeholder='Password'
            secureTextEntry
            autoCapitalize='none'
            autoCorrect={false}
            textContentType='password'
            value={login.password}
            onChangeText={(password) => setLogin({ ...login, password })}
          />
          <ErrorLine message={logins.error} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <DotsButton label='Save login' variant='primary' small busy={logins.pending} onPress={saveLogin} />
          </View>
        </Card>
      </Section>

      <Section
        eyebrow='Approvals'
        title='Rules for all dots'
        description="These apply to every dot, on top of each dot's own rules."
      >
        <RuleEditor machine={machine} dotId={null} name='a dot' rules={snapshot.rules} />
      </Section>

      <Section
        eyebrow='Apps'
        title='Your apps, via Composio'
        description='Give your dots Gmail, Calendar, Slack, Notion, GitHub and more. Dots read on their own and ask before sending, posting, or changing anything. Sign in and connect apps from OpenDots in Ghostex on your computer.'
        right={
          <DotsButton
            label='Refresh'
            small
            busy={apps.pending}
            onPress={() => void apps.run((target) => composioRefresh(target))}
          />
        }
      >
        <Card>
          <Text style={styles.text}>
            {settings.composio.signedIn
              ? connected.length > 0
                ? `Signed in. Your dots can use ${connected.length} app${connected.length === 1 ? '' : 's'}.`
                : 'Signed in. No apps are connected yet.'
              : 'Not signed in.'}
          </Text>
          {connected.length > 0 ? (
            <Text style={styles.muted}>{connected.map((app) => app.name).join(', ')}</Text>
          ) : null}
          <ErrorLine message={apps.error} />
        </Card>
      </Section>

      <Section eyebrow='Triggers' title='Wake dots from your apps'>
        <Card>
          <Text style={styles.text}>
            {settings.triggersKey === 'settings'
              ? 'A Composio project key is set, so dots can have triggers.'
              : settings.triggersKey === 'env'
                ? "A Composio project key comes from the computer's environment, so dots can have triggers."
                : 'Triggers need a Composio project key. Add it from OpenDots in Ghostex on your computer.'}
          </Text>
        </Card>
      </Section>

      <Section eyebrow='Browser' title="Your dots' browser">
        <Card>
          {settings.chrome !== null ? (
            <Text style={styles.text}>Each dot browses in its own Google Chrome profile on your computer.</Text>
          ) : (
            <Text style={[styles.text, { color: GhostexPalette.STATUS_WORKING }]}>
              Google Chrome wasn't found on your computer. Install it so your dots can browse.
            </Text>
          )}
        </Card>
      </Section>
    </DotsPage>
  );
}
