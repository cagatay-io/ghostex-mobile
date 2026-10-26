/**
 * An error boundary for one section of a computer's Edit screen: a throw inside it shows a small
 * error card in the form's style (SetupPalette, like the other rows cards there) and the rest of
 * the form, and Save and Remove, keep working. The Settings pages use settings/SectionBoundary.tsx.
 */

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import ErrorBoundary, { errorBoundaryMessage } from '../../components/common/ErrorBoundary';
import { SetupButton } from '../../components/onboarding/SetupPrimitives';
import { SectionErrorCopy } from '../settings/SectionBoundary';
import { formStyles } from './styles';

function FormSectionErrorCard({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <View style={[formStyles.rowsCard, formStyles.stack, { paddingVertical: 12 }]}>
      <Text style={formStyles.rowLabel}>{SectionErrorCopy.title}</Text>
      <Text style={formStyles.fieldHint} numberOfLines={4}>
        {errorBoundaryMessage(error)}
      </Text>
      <SetupButton small label={SectionErrorCopy.tryAgain} onPress={retry} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

/** `name` is for the log line only, like `machine-form:tools`. */
export function FormSection({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ErrorBoundary name={name} renderFallback={(props) => <FormSectionErrorCard {...props} />}>
      {children}
    </ErrorBoundary>
  );
}
