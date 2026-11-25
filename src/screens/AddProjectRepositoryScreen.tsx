/**
 * Add Project clone branch, step 1: one input plus a
 * "Continue" (Git URL) or "Lookup repository" (provider) button. A lookup
 * failure stays on this screen with an inline banner and the typed value
 * preserved.
 *
 * With GitHub as the source, a computer that answers `listRepositories` also
 * lists the signed-in account's repositories under the field, grouped by owner;
 * the field filters them. Tapping one proceeds exactly as typing its
 * `owner/name` and pressing Lookup repository. Older computers keep the plain
 * field.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lookupRepository, type AddProjectListedRepository } from '../addProject/client';
import {
  AddProjectShell,
  ErrorBanner,
  MutedText,
  PrimaryActionButton,
  ProjectPathInput,
  SectionTitle,
} from '../addProject/primitives';
import {
  exactListedRepository,
  groupRepositories,
  repositoryFullName,
  singleFilteredRepository,
  type RepositoryGroup,
} from '../addProject/repositoryList';
import {
  RepositoryGroupHeader,
  RepositoryListNotice,
  RepositoryRow,
  useGithubRepositoryList,
} from '../addProject/RepositoryPicker';
import {
  addProjectRepositoryActionLabel,
  addProjectRepositoryPlaceholder,
  isLookupProvider,
} from '../addProject/sources';
import KeyboardAvoidingContainer from '../components/common/keyboard/KeyboardAvoidingContainer';
import { useScrollToBarEdges } from '../components/common/verticalBar/VerticalBarArea';
import { AddProjectCopy } from '../copy';
import { machineName, useMachinesStore } from '../machines/store';
import type { RootStackParamList } from '../navigation/types';
import { useAppearance } from '../theme/useAppearance';

type Props = NativeStackScreenProps<RootStackParamList, 'AddProjectRepository'>;

const NO_GROUPS: RepositoryGroup[] = [];
/** Re-read the clock for the "time since last push" labels this often. */
const AGE_TICK_MS = 60000;

export default function AddProjectRepositoryScreen({ navigation, route }: Props): ReactElement {
  const appearance = useAppearance();
  const { machineId, source } = route.params;
  const machine = useMachinesStore((state) => state.machines.find((entry) => entry.id === machineId) ?? null);

  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const isGithub = source === 'github';
  const list = useGithubRepositoryList(machine, isGithub);
  const ready = list.view.kind === 'answer' && list.view.answer.status === 'ready' ? list.view.answer : null;
  const repositories = ready?.repositories ?? null;
  const viewer = ready?.viewer;

  const groups = useMemo(
    () => (repositories === null ? NO_GROUPS : groupRepositories(repositories, viewer, value)),
    [repositories, viewer, value],
  );

  // The page reaches under the iPhone Duo's side bar, its content keeps clear of it.
  const headerEdges = useScrollToBarEdges(styles.header);
  const listEdges = useScrollToBarEdges(styles.listContent);

  useEffect(() => {
    if (repositories === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), AGE_TICK_MS);
    return () => clearInterval(timer);
  }, [repositories]);

  const submitText = useCallback(
    async (text: string): Promise<void> => {
      if (machine === null || pending) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        setError(source === 'url' ? AddProjectCopy.emptyUrlError : AddProjectCopy.emptyRepositoryError);
        return;
      }
      if (source === 'url') {
        navigation.navigate('AddProjectDestination', {
          machineId,
          remoteUrl: trimmed,
          repositoryTitle: trimmed,
          repositoryUrl: trimmed,
        });
        return;
      }
      if (!isLookupProvider(source)) {
        // The source picker never enables these rows; guard the route anyway.
        setError(AddProjectCopy.providerUnavailableHint);
        return;
      }
      setPending(true);
      setError(null);
      try {
        const repository = await lookupRepository(machine, source, trimmed);
        setPending(false);
        navigation.navigate('AddProjectDestination', {
          machineId,
          remoteUrl: repository.sshUrl.length > 0 ? repository.sshUrl : repository.url,
          repositoryTitle: repository.nameWithOwner.length > 0 ? repository.nameWithOwner : trimmed,
          repositoryUrl: repository.url,
        });
      } catch (failure) {
        setPending(false);
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    },
    [machine, machineId, navigation, pending, source],
  );

  /** A listed repository goes through the same lookup as typing its `owner/name`. */
  const pickRepository = useCallback(
    (repository: AddProjectListedRepository): void => {
      if (pending) return;
      const fullName = repositoryFullName(repository);
      setValue(fullName);
      setError(null);
      void submitText(fullName);
    },
    [pending, submitText],
  );

  const onChangeText = useCallback((next: string) => {
    setValue(next);
    setError(null);
  }, []);

  if (machine === null) {
    return (
      <AddProjectShell>
        <ErrorBanner message={AddProjectCopy.machineMissing} />
      </AddProjectShell>
    );
  }

  const field = (onSubmit: () => void, onAction: () => void): ReactElement => (
    <>
      {error === null ? null : <ErrorBanner message={error} />}
      <SectionTitle>{AddProjectCopy.repositorySection}</SectionTitle>
      <ProjectPathInput
        testID="add-project-repository-input"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={addProjectRepositoryPlaceholder(source)}
      />
      <PrimaryActionButton
        testID="add-project-repository-action"
        label={addProjectRepositoryActionLabel(source)}
        loading={pending}
        disabled={value.trim().length === 0}
        onPress={onAction}
      />
    </>
  );

  if (!isGithub) {
    return <AddProjectShell>{field(() => void submitText(value), () => void submitText(value))}</AddProjectShell>;
  }

  const exact = repositories === null ? null : exactListedRepository(repositories, value);
  // The action button picks a listed repository the text names exactly; anything else is looked up as typed.
  const onAction = (): void => {
    if (exact !== null) pickRepository(exact);
    else void submitText(value);
  };
  // The keyboard's submit also picks the one repository the filter leaves.
  const onSubmit = (): void => {
    const only = exact ?? (value.trim().length > 0 ? singleFilteredRepository(groups) : null);
    if (only !== null) pickRepository(only);
    else void submitText(value);
  };
  const noMatches = repositories !== null && repositories.length > 0 && value.trim().length > 0 && groups.length === 0;

  // GitHub keeps the field and its action at the top and the repository list (virtualized; it can
  // hold hundreds of rows) scrolling under them. Until a list arrives, or on a computer that does
  // not offer one, the list is empty and the screen reads as the plain field.
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: appearance.background }]} edges={['bottom']}>
      <KeyboardAvoidingContainer style={styles.container}>
        <View style={[styles.header, headerEdges.scroll, headerEdges.content]}>{field(onSubmit, onAction)}</View>
        <SectionList
          style={[styles.list, listEdges.scroll]}
          contentContainerStyle={[styles.listContent, listEdges.content]}
          sections={groups}
          keyExtractor={(repository) => repositoryFullName(repository)}
          renderSectionHeader={({ section }) => <RepositoryGroupHeader group={section} />}
          renderItem={({ item, index, section }) => (
            <RepositoryRow
              repository={item}
              first={index === 0}
              last={index === section.data.length - 1}
              now={now}
              showOwner={section.kind === 'shared'}
              disabled={pending}
              onPress={pickRepository}
            />
          )}
          ListHeaderComponent={
            <RepositoryListNotice list={list} machineLabel={machineName(machine)} noMatches={noMatches} />
          }
          ListFooterComponent={
            ready?.truncated === true && groups.length > 0 ? (
              <View style={styles.footer}>
                <MutedText>{AddProjectCopy.repositoryListTruncated}</MutedText>
              </View>
            ) : undefined
          }
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={20}
        />
      </KeyboardAvoidingContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 10,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 32,
  },
  footer: {
    marginTop: 12,
  },
});
