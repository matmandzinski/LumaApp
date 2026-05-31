import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/src/components/IconSymbol';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { Screen } from '@/src/components/Screen';
import {
  AppApiError,
  getAppState,
  getSet,
  saveActiveSet,
  type ApiSetDetail,
} from '@/src/services/appApi';
import { getLearningCounts } from '@/src/services/learningSession';
import { theme } from '@/src/theme/theme';

type SetDetailParams = {
  externalSetId?: string | string[];
};

export function SetDetailScreen() {
  const params = useLocalSearchParams<SetDetailParams>();
  const externalSetId = Array.isArray(params.externalSetId)
    ? params.externalSetId[0]
    : params.externalSetId;
  const [set, setSet] = useState<ApiSetDetail | null>(null);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingActive, setIsSavingActive] = useState(false);
  const counts = useMemo(() => getLearningCounts(set), [set]);
  const learnedPercent =
    counts.totalCards > 0 ? Math.round((counts.learnedCards / counts.totalCards) * 100) : 0;
  const isActive = Boolean(set && activeSetId === set.externalId);

  useEffect(() => {
    let cancelled = false;

    async function loadSetDetail() {
      if (!externalSetId) {
        setErrorMessage('Set id is missing.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [appState, setDetail] = await Promise.all([getAppState(), getSet(externalSetId)]);

        if (cancelled) return;

        setActiveSetId(appState.activeSetExternalId ?? appState.activeSetId);
        setSet(setDetail);
      } catch (error) {
        if (cancelled) return;

        console.warn('Unable to load set detail.', error);
        setErrorMessage(getApiErrorMessage(error, 'Unable to load this set.'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadSetDetail();

    return () => {
      cancelled = true;
    };
  }, [externalSetId]);

  async function activateCurrentSet() {
    if (!set) return false;
    if (isActive) return true;
    if (isSavingActive) return false;

    setIsSavingActive(true);
    setErrorMessage(null);

    try {
      const response = await saveActiveSet(set.externalId);
      setActiveSetId(response.activeSetExternalId);
      return true;
    } catch (error) {
      console.warn('Unable to set active set.', error);
      setErrorMessage(getApiErrorMessage(error, 'Unable to make this set active.'));
      return false;
    } finally {
      setIsSavingActive(false);
    }
  }

  async function startSession(pathname: '/quick-lesson' | '/practice-cards') {
    const activated = await activateCurrentSet();
    if (activated) router.push(pathname);
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to sets"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <IconSymbol
            color="#101522"
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={24}
          />
        </Pressable>
        <Text style={styles.headerTitle}>Set Detail</Text>
        <View style={styles.iconButton} />
      </View>

      {isLoading ? (
        <StateCard body="Loading cards and progress." title="Opening set..." />
      ) : errorMessage ? (
        <StateCard body={errorMessage} title="Could not open set." />
      ) : set ? (
        <>
          <View style={styles.heroCard}>
            <Text style={styles.kicker}>{isActive ? 'Active set' : set.source}</Text>
            <Text style={styles.title}>{set.name}</Text>
            <Text style={styles.subtitle}>
              {counts.totalCards} cards: {counts.learnedCards} learned - {counts.learningCards}{' '}
              learning - {counts.difficultCards} difficult
            </Text>

            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${learnedPercent}%` }]} />
              </View>
              <Text style={styles.progressLabel}>{learnedPercent}%</Text>
            </View>
          </View>

          <View style={styles.actions}>
            {!isActive ? (
              <PrimaryButton
                title={isSavingActive ? 'Setting active...' : 'Set active'}
                onPress={() => void activateCurrentSet()}
              />
            ) : null}
            <PrimaryButton
              title="Quick Lesson"
              variant={isActive ? 'primary' : 'secondary'}
              onPress={() => void startSession('/quick-lesson')}
            />
            <PrimaryButton
              title="Practice cards"
              variant="secondary"
              onPress={() => void startSession('/practice-cards')}
            />
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.cardPreviewList}>
            <Text style={styles.sectionLabel}>Cards</Text>
            {set.flashcards.slice(0, 8).map((card) => (
              <View key={card.id} style={styles.previewCard}>
                <View style={styles.previewCopy}>
                  <Text numberOfLines={1} style={styles.previewFront}>
                    {card.front}
                  </Text>
                  <Text numberOfLines={2} style={styles.previewBack}>
                    {card.back}
                  </Text>
                </View>
                <Text style={styles.stageLabel}>{getStageLabel(card.learningStage, card.isLearned)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

type StateCardProps = {
  body: string;
  title: string;
};

function StateCard({ body, title }: StateCardProps) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
      <PrimaryButton title="Back to Sets" onPress={() => router.replace('/sets')} />
    </View>
  );
}

function getStageLabel(stage: number, isLearned: boolean) {
  if (isLearned || stage >= 3) return 'Learned';
  if (stage === -1) return 'Difficult';
  if (stage > 0) return 'Learning';

  return 'New';
}

function getApiErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof AppApiError) return error.message;

  return fallbackMessage;
}

const styles = StyleSheet.create({
  screen: {
    gap: 18,
    paddingTop: 14,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerTitle: {
    color: '#101522',
    fontSize: 16,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#2A261E',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 34,
    elevation: 4,
  },
  kicker: {
    color: theme.colors.accentStrong,
    fontSize: 11,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: 29,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    lineHeight: 33,
    marginTop: 8,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 22,
    marginTop: 10,
  },
  progressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  progressTrack: {
    backgroundColor: 'rgba(20,21,24,0.07)',
    borderRadius: theme.radius.pill,
    flex: 1,
    height: 7,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: theme.colors.accentStrong,
    borderRadius: theme.radius.pill,
    height: '100%',
  },
  progressLabel: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: theme.typography.weights.extraBold,
    minWidth: 42,
    textAlign: 'right',
  },
  actions: {
    gap: 12,
  },
  errorText: {
    color: theme.colors.reviewRed,
    fontSize: 13,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 18,
    textAlign: 'center',
  },
  cardPreviewList: {
    gap: 12,
    marginTop: 10,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 1.8,
    marginLeft: 2,
    textTransform: 'uppercase',
  },
  previewCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 78,
    padding: 16,
  },
  previewCopy: {
    flex: 1,
    minWidth: 0,
  },
  previewFront: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 0,
  },
  previewBack: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 18,
    marginTop: 5,
  },
  stageLabel: {
    color: theme.colors.accentStrong,
    fontSize: 11,
    fontWeight: theme.typography.weights.extraBold,
    minWidth: 66,
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 26,
    borderWidth: 1,
    gap: 14,
    padding: 24,
    shadowColor: '#2A261E',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 34,
    elevation: 4,
  },
  stateTitle: {
    color: theme.colors.text,
    fontSize: 23,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 28,
  },
  stateBody: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.78,
  },
});
