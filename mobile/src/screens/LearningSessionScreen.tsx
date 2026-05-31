import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { IconSymbol } from '@/src/components/IconSymbol';
import {
  AppApiError,
  getAppState,
  getSet,
  reviewCard,
  type ApiReviewDecision,
  type ApiSetDetail,
} from '@/src/services/appApi';
import {
  advanceLearningQueue,
  applyReviewResponseToSet,
  createPracticeCardsQueue,
  createQuickLessonQueue,
  getLearningCounts,
  type LearningQueueItem,
  type LearningSessionMode,
} from '@/src/services/learningSession';
import { theme } from '@/src/theme/theme';

const lumaLogo = require('../../assets/images/luma-logo.png');

type LearningSessionScreenProps = {
  mode: LearningSessionMode;
};

type LoadStatus = 'loading' | 'ready' | 'empty' | 'noActive' | 'error';

const SESSION_COPY = {
  quickLesson: {
    completionMode: 'quick',
    emptyTitle: 'No cards for a quick lesson.',
    emptyBody: 'Your active set has no unlearned cards ready right now.',
    footer: 'Quick lesson in progress',
    sessionType: 'quickLesson',
  },
  practiceCards: {
    completionMode: 'practice',
    emptyTitle: 'All caught up.',
    emptyBody: 'There are no unlearned cards in your active set right now.',
    footer: 'Longer focus session.',
    sessionType: 'continueLearning',
  },
} as const;

export function LearningSessionScreen({ mode }: LearningSessionScreenProps) {
  const { height } = useWindowDimensions();
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [activeSet, setActiveSet] = useState<ApiSetDetail | null>(null);
  const [queue, setQueue] = useState<LearningQueueItem[]>([]);
  const [initialQueueSize, setInitialQueueSize] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = SESSION_COPY[mode];
  const isQuickLesson = mode === 'quickLesson';
  const activeItem = queue[0] ?? null;
  const counts = useMemo(() => getLearningCounts(activeSet), [activeSet]);
  const cardHeight = Math.min(360, Math.max(278, height * 0.43));
  const cardText = activeItem ? (revealed ? activeItem.card.back : activeItem.card.front) : '';
  const cardTextSize = getLearningTextSize(cardText);
  const activePosition = Math.min(reviewedCount + 1, Math.max(initialQueueSize, 1));
  const progressPercent =
    initialQueueSize > 0 ? Math.min((activePosition / initialQueueSize) * 100, 100) : 0;

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      setStatus('loading');
      setLoadError(null);
      setDecisionError(null);
      setRevealed(false);
      setReviewedCount(0);

      try {
        const appState = await getAppState();
        const activeSetId = appState.activeSetExternalId ?? appState.activeSetId;

        if (!activeSetId) {
          if (!cancelled) {
            setActiveSet(null);
            setQueue([]);
            setInitialQueueSize(0);
            setStatus('noActive');
          }

          return;
        }

        const set = await getSet(activeSetId);
        const sessionQueue =
          mode === 'quickLesson'
            ? createQuickLessonQueue(set.flashcards)
            : createPracticeCardsQueue(set.flashcards);

        if (cancelled) return;

        setActiveSet(set);
        setQueue(sessionQueue);
        setInitialQueueSize(sessionQueue.length);
        setStatus(sessionQueue.length > 0 ? 'ready' : 'empty');
      } catch (error) {
        if (cancelled) return;

        console.warn('Unable to load learning session.', error);
        setLoadError(getApiErrorMessage(error, 'Unable to load the learning session.'));
        setStatus('error');
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  function exitSession() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  }

  async function handleDecision(decision: ApiReviewDecision) {
    if (!activeSet || !activeItem || isSubmitting) return;

    setDecisionError(null);
    setIsSubmitting(true);

    try {
      const response = await reviewCard(activeSet.externalId, activeItem.card.id, {
        decision,
        sessionType: copy.sessionType,
        reviewedAt: new Date().toISOString(),
      });
      const nextReviewedCount = reviewedCount + 1;
      const nextQueue = advanceLearningQueue(
        queue,
        activeItem,
        response,
        mode === 'practiceCards',
      );

      setActiveSet((currentSet) =>
        currentSet ? applyReviewResponseToSet(currentSet, response) : currentSet,
      );
      setQueue(nextQueue);
      setReviewedCount(nextReviewedCount);
      setRevealed(false);

      if (nextQueue.length === 0) {
        router.replace({
          pathname: '/session-complete',
          params: {
            mode: copy.completionMode,
            reviewedCount: String(nextReviewedCount),
            setName: activeSet.name,
          },
        });
      }
    } catch (error) {
      console.warn('Unable to save card review.', error);
      setDecisionError(
        getApiErrorMessage(error, 'Unable to save this review. Check the API and try again.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderSessionBody() {
    if (status === 'loading') {
      return (
        <CenteredState
          body="Getting your active set ready."
          primaryActionLabel="Back to Home"
          title="Loading lesson..."
          onPrimaryAction={() => router.replace('/')}
        />
      );
    }

    if (status === 'noActive') {
      return (
        <CenteredState
          body="Choose a set first, then start a learning session from Home."
          primaryActionLabel="Go to Sets"
          title="No active set yet."
          onPrimaryAction={() => router.replace('/sets')}
        />
      );
    }

    if (status === 'error') {
      return (
        <CenteredState
          body={loadError ?? 'The session could not be loaded.'}
          primaryActionLabel="Back to Home"
          secondaryActionLabel="Go to Sets"
          title="Something got stuck."
          onPrimaryAction={() => router.replace('/')}
          onSecondaryAction={() => router.replace('/sets')}
        />
      );
    }

    if (status === 'empty') {
      return (
        <CenteredState
          body={copy.emptyBody}
          primaryActionLabel="Back to Home"
          secondaryActionLabel="Change Set"
          title={copy.emptyTitle}
          onPrimaryAction={() => router.replace('/')}
          onSecondaryAction={() => router.replace('/sets')}
        />
      );
    }

    if (!activeSet || !activeItem) return null;

    return (
      <>
        <View style={styles.cardArea}>
          <Pressable
            accessibilityHint={revealed ? 'Shows the back of the card' : 'Reveals the answer'}
            accessibilityRole="button"
            onPress={() => setRevealed((current) => !current)}
            style={({ pressed }) => [
              styles.flashcard,
              { height: cardHeight },
              pressed && styles.cardPressed,
            ]}>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              numberOfLines={revealed ? 7 : 3}
              style={[
                styles.cardText,
                { fontSize: cardTextSize, lineHeight: Math.round(cardTextSize * 1.18) },
              ]}>
              {cardText}
            </Text>
            <Text style={styles.cardHint}>{revealed ? 'Tap to view term' : 'Tap to reveal'}</Text>
          </Pressable>
        </View>

        <View style={styles.bottomBlock}>
          {decisionError ? <Text style={styles.errorText}>{decisionError}</Text> : null}
          <View style={styles.actions}>
            <SessionButton
              disabled={isSubmitting}
              label="Review again"
              variant="secondary"
              onPress={() => void handleDecision('reviewAgain')}
            />
            <SessionButton
              disabled={isSubmitting}
              label="Know it"
              variant="primary"
              onPress={() => void handleDecision('know')}
            />
          </View>
          <Text style={styles.footerText}>{copy.footer}</Text>
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={['#FFFEFC', '#F7F4EE']}
        locations={[0, 1]}
        style={styles.viewport}>
        <View style={styles.shell}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityLabel="Close lesson"
              accessibilityRole="button"
              onPress={exitSession}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <IconSymbol
                color="#52615C"
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                size={19}
              />
            </Pressable>

            <Image source={lumaLogo} style={styles.logo} resizeMode="contain" />

            <Pressable
              accessibilityLabel="Lesson options"
              accessibilityRole="button"
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <IconSymbol
                color="#52615C"
                name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
                size={24}
              />
            </Pressable>
          </View>

          <View style={styles.meta}>
            <Text numberOfLines={1} style={styles.deckName}>
              {activeSet?.name ?? 'Luma'}
            </Text>

            {isQuickLesson ? (
              <View style={styles.quickProgressBlock}>
                <View accessibilityRole="progressbar" style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                </View>
                <Text style={styles.progressLabel}>
                  Card {activePosition} of {Math.max(initialQueueSize, 1)}
                </Text>
              </View>
            ) : (
              <View style={styles.statsRow}>
                <StatCell label="Difficult" value={counts.difficultCards} />
                <View style={styles.statDivider} />
                <StatCell label="Learning" value={counts.learningCards} />
                <View style={styles.statDivider} />
                <StatCell label="Learned" value={counts.learnedCards} />
              </View>
            )}
          </View>

          {renderSessionBody()}
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

type SessionButtonProps = {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary';
};

function SessionButton({ disabled, label, onPress, variant }: SessionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sessionButton,
        variant === 'primary' ? styles.primaryButton : styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.buttonPressed,
      ]}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        style={[
          styles.sessionButtonText,
          variant === 'primary' ? styles.primaryButtonText : styles.secondaryButtonText,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

type StatCellProps = {
  label: string;
  value: number;
};

function StatCell({ label, value }: StatCellProps) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

type CenteredStateProps = {
  body: string;
  primaryActionLabel: string;
  secondaryActionLabel?: string;
  title: string;
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
};

function CenteredState({
  body,
  primaryActionLabel,
  secondaryActionLabel,
  title,
  onPrimaryAction,
  onSecondaryAction,
}: CenteredStateProps) {
  return (
    <View style={styles.stateWrap}>
      <View style={styles.statePanel}>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateBody}>{body}</Text>
        <View style={styles.stateActions}>
          <SessionButton label={primaryActionLabel} variant="primary" onPress={onPrimaryAction} />
          {secondaryActionLabel && onSecondaryAction ? (
            <SessionButton
              label={secondaryActionLabel}
              variant="secondary"
              onPress={onSecondaryAction}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function getApiErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof AppApiError) return error.message;

  return fallbackMessage;
}

function getLearningTextSize(text: string) {
  const normalizedText = text.trim();
  const longestWordLength = normalizedText
    .split(/\s+/)
    .reduce((maxLength, word) => Math.max(maxLength, word.length), 0);
  const size =
    36 -
    Math.max(0, longestWordLength - 12) * 1.1 -
    Math.max(0, normalizedText.length - 30) * 0.26;

  return Math.max(22, Math.min(38, size));
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  viewport: {
    alignItems: 'center',
    flex: 1,
  },
  shell: {
    flex: 1,
    maxWidth: 430,
    paddingBottom: 22,
    paddingHorizontal: 23,
    width: '100%',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 60,
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  logo: {
    height: 40,
    width: 130,
  },
  meta: {
    alignItems: 'center',
    minHeight: 92,
  },
  deckName: {
    color: '#53645F',
    fontSize: 13,
    fontWeight: theme.typography.weights.medium,
    letterSpacing: 4,
    lineHeight: 18,
    marginTop: 3,
    maxWidth: '92%',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  quickProgressBlock: {
    alignItems: 'center',
    gap: 10,
    marginTop: 11,
  },
  progressTrack: {
    backgroundColor: '#DDDEDA',
    borderRadius: theme.radius.pill,
    height: 5,
    overflow: 'hidden',
    width: 244,
  },
  progressFill: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: '100%',
    minWidth: 8,
  },
  progressLabel: {
    color: '#53645F',
    fontSize: 14,
    fontWeight: theme.typography.weights.medium,
    lineHeight: 18,
  },
  statsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 10,
  },
  statCell: {
    alignItems: 'center',
    minWidth: 82,
  },
  statValue: {
    color: '#101410',
    fontSize: 18,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 22,
  },
  statLabel: {
    color: '#4D574F',
    fontSize: 10,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 0.9,
    lineHeight: 13,
    marginTop: 3,
    textTransform: 'uppercase',
  },
  statDivider: {
    backgroundColor: '#D9D8D4',
    height: 36,
    width: 1,
  },
  cardArea: {
    flex: 1,
    justifyContent: 'flex-end',
    minHeight: 365,
  },
  flashcard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingVertical: 44,
    shadowColor: '#2A261E',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.08,
    shadowRadius: 52,
    width: '100%',
    elevation: 6,
  },
  cardPressed: {
    transform: [{ scale: 0.992 }],
  },
  cardText: {
    color: '#151716',
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    textAlign: 'center',
  },
  cardHint: {
    bottom: 35,
    color: '#89918C',
    fontSize: 15,
    fontWeight: theme.typography.weights.semibold,
    left: 20,
    position: 'absolute',
    right: 20,
    textAlign: 'center',
  },
  bottomBlock: {
    gap: 14,
    paddingTop: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 14,
  },
  sessionButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    flex: 1,
    height: 58,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 14,
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    shadowColor: theme.colors.accentStrong,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 5,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(20,22,19,0.04)',
    borderWidth: 1,
  },
  disabledButton: {
    opacity: 0.58,
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  sessionButtonText: {
    fontSize: 16,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 0,
    lineHeight: 20,
    textAlign: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#111815',
  },
  footerText: {
    color: '#6F766F',
    fontSize: 13,
    fontWeight: theme.typography.weights.medium,
    lineHeight: 18,
    textAlign: 'center',
  },
  errorText: {
    color: theme.colors.reviewRed,
    fontSize: 13,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 18,
    textAlign: 'center',
  },
  stateWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 64,
  },
  statePanel: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 26,
    borderWidth: 1,
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
    textAlign: 'center',
  },
  stateBody: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 22,
    marginTop: 9,
    textAlign: 'center',
  },
  stateActions: {
    gap: 12,
    marginTop: 22,
    width: '100%',
  },
  pressed: {
    opacity: 0.78,
  },
});
