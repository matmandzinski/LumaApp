import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
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

const CARD_EXIT_DURATION_MS = 440;
const CARD_RETURN_DURATION_MS = 260;
const SWIPE_TRIGGER_THRESHOLD_PX = 104;
const TAP_MOVEMENT_THRESHOLD_PX = 8;
const MAX_SWIPE_ROTATION_DEG = 4.5;

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
  const { height, width } = useWindowDimensions();
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [activeSet, setActiveSet] = useState<ApiSetDetail | null>(null);
  const [queue, setQueue] = useState<LearningQueueItem[]>([]);
  const [initialQueueSize, setInitialQueueSize] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCardAnimating, setIsCardAnimating] = useState(false);
  const [isCardExiting, setIsCardExiting] = useState(false);
  const flipProgress = useRef(new Animated.Value(0)).current;
  const swipeX = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const actionLockedRef = useRef(false);
  const copy = SESSION_COPY[mode];
  const isQuickLesson = mode === 'quickLesson';
  const activeItem = queue[0] ?? null;
  const nextItem = queue[1] ?? null;
  const counts = useMemo(() => getLearningCounts(activeSet), [activeSet]);
  const cardHeight = Math.min(510, Math.max(390, height * 0.6));
  const contentWidth = Math.max(292, Math.min(width, 430) - theme.spacing.xl * 2);
  const actionButtonWidth = (contentWidth - 11) / 2;
  const frontText = activeItem?.card.front ?? '';
  const backText = activeItem?.card.back ?? '';
  const nextFrontText = nextItem?.card.front ?? '';
  const frontTextSize = getLearningTextSize(frontText);
  const backTextSize = getLearningTextSize(backText);
  const nextFrontTextSize = getLearningTextSize(nextFrontText);
  const frontFaceRotation = flipProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backFaceRotation = flipProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });
  const cardShadowOpacity = flipProgress.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 0.35, 0, 0.35, 1],
  });
  const swipeRotation = swipeX.interpolate({
    inputRange: [-SWIPE_TRIGGER_THRESHOLD_PX, 0, SWIPE_TRIGGER_THRESHOLD_PX],
    outputRange: [`-${MAX_SWIPE_ROTATION_DEG}deg`, '0deg', `${MAX_SWIPE_ROTATION_DEG}deg`],
    extrapolate: 'clamp',
  });
  const passFeedbackOpacity = swipeX.interpolate({
    inputRange: [0, SWIPE_TRIGGER_THRESHOLD_PX * 0.18, SWIPE_TRIGGER_THRESHOLD_PX],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });
  const repeatFeedbackOpacity = swipeX.interpolate({
    inputRange: [-SWIPE_TRIGGER_THRESHOLD_PX, -SWIPE_TRIGGER_THRESHOLD_PX * 0.18, 0],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });
  const passTintOpacity = swipeX.interpolate({
    inputRange: [0, SWIPE_TRIGGER_THRESHOLD_PX * 0.04, SWIPE_TRIGGER_THRESHOLD_PX],
    outputRange: [0, 0, 0.18],
    extrapolate: 'clamp',
  });
  const repeatTintOpacity = swipeX.interpolate({
    inputRange: [-SWIPE_TRIGGER_THRESHOLD_PX, -SWIPE_TRIGGER_THRESHOLD_PX * 0.04, 0],
    outputRange: [0.16, 0, 0],
    extrapolate: 'clamp',
  });
  const isInteractionPaused = isSubmitting || isCardAnimating;
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
      flipProgress.setValue(0);
      swipeX.setValue(0);
      cardOpacity.setValue(1);
      actionLockedRef.current = false;
      setIsCardAnimating(false);
      setIsCardExiting(false);
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
  }, [mode, cardOpacity, flipProgress, swipeX]);

  useEffect(() => {
    setRevealed(false);
    flipProgress.setValue(0);
    swipeX.setValue(0);
    cardOpacity.setValue(1);
    actionLockedRef.current = false;
    setIsCardAnimating(false);
    setIsCardExiting(false);
  }, [activeItem?.card.id, cardOpacity, flipProgress, swipeX]);

  function exitSession() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  }

  async function submitDecision(decision: ApiReviewDecision) {
    if (!activeSet || !activeItem || isSubmitting) return false;

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
      flipProgress.setValue(0);

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

      return true;
    } catch (error) {
      console.warn('Unable to save card review.', error);
      setDecisionError(
        getApiErrorMessage(error, 'Unable to save this review. Check the API and try again.'),
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  function returnCardToCenter() {
    actionLockedRef.current = true;
    setIsCardExiting(false);
    setIsCardAnimating(true);
    Animated.parallel([
      Animated.timing(swipeX, {
        duration: CARD_RETURN_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        duration: CARD_RETURN_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start(() => {
      actionLockedRef.current = false;
      setIsCardAnimating(false);
    });
  }

  function handleCardAction(decision: ApiReviewDecision, exitStartX = 0) {
    if (!activeSet || !activeItem || isInteractionPaused || actionLockedRef.current) return;

    const direction = decision === 'know' ? 1 : -1;
    const targetX = direction * (contentWidth + 160);

    actionLockedRef.current = true;
    setIsCardAnimating(true);
    setIsCardExiting(true);
    setDecisionError(null);
    swipeX.stopAnimation();
    cardOpacity.stopAnimation();
    swipeX.setValue(exitStartX);

    Animated.parallel([
      Animated.timing(swipeX, {
        duration: CARD_EXIT_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        toValue: targetX,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        duration: CARD_EXIT_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start(() => {
      void (async () => {
        const didSubmit = await submitDecision(decision);

        if (didSubmit) {
          swipeX.setValue(0);
          cardOpacity.setValue(1);
          actionLockedRef.current = false;
          setIsCardAnimating(false);
          setIsCardExiting(false);
          return;
        }

        cardOpacity.setValue(1);
        setIsCardExiting(false);
        returnCardToCenter();
      })();
    });
  }

  function toggleReveal() {
    if (isInteractionPaused) return;

    const nextRevealed = !revealed;
    setRevealed(nextRevealed);

    Animated.timing(flipProgress, {
      duration: 360,
      easing: Easing.out(Easing.cubic),
      toValue: nextRevealed ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) => {
          if (isInteractionPaused || actionLockedRef.current) return false;

          const deltaX = gestureState.dx;
          const deltaY = gestureState.dy;

          return (
            Math.abs(deltaX) >= TAP_MOVEMENT_THRESHOLD_PX &&
            Math.abs(deltaX) > Math.abs(deltaY) * 0.65
          );
        },
        onMoveShouldSetPanResponderCapture: (_event, gestureState) => {
          if (isInteractionPaused || actionLockedRef.current) return false;

          const deltaX = gestureState.dx;
          const deltaY = gestureState.dy;

          return (
            Math.abs(deltaX) >= TAP_MOVEMENT_THRESHOLD_PX &&
            Math.abs(deltaX) > Math.abs(deltaY) * 0.65
          );
        },
        onPanResponderGrant: () => {
          swipeX.stopAnimation();
          cardOpacity.stopAnimation();
        },
        onPanResponderMove: (_event, gestureState) => {
          swipeX.setValue(gestureState.dx);
        },
        onPanResponderRelease: (_event, gestureState) => {
          const deltaX = gestureState.dx;

          if (Math.abs(deltaX) < SWIPE_TRIGGER_THRESHOLD_PX) {
            returnCardToCenter();
            return;
          }

          handleCardAction(deltaX > 0 ? 'know' : 'reviewAgain', deltaX);
        },
        onPanResponderTerminate: () => {
          returnCardToCenter();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [activeItem, activeSet, cardOpacity, contentWidth, isInteractionPaused, swipeX],
  );

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
          <View style={[styles.cardStack, { height: cardHeight, width: contentWidth }]}>
            {isCardExiting && nextItem ? (
              <View pointerEvents="none" style={[styles.nextCardPreview, styles.flashcard]}>
                <View style={styles.cardFace}>
                  <Text
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                    numberOfLines={3}
                    style={[
                      styles.cardText,
                      {
                        fontSize: nextFrontTextSize,
                        lineHeight: Math.round(nextFrontTextSize * 1.18),
                      },
                    ]}>
                    {nextFrontText}
                  </Text>
                </View>
                <Text style={styles.cardHint}>Tap to reveal</Text>
              </View>
            ) : null}

            <Animated.View
              {...panResponder.panHandlers}
              style={[
                styles.cardSwipeFrame,
                {
                  opacity: cardOpacity,
                  transform: [{ translateX: swipeX }, { rotate: swipeRotation }],
                },
              ]}>
              <Pressable
                accessibilityHint={revealed ? 'Shows the back of the card' : 'Reveals the answer'}
                accessibilityRole="button"
                disabled={isInteractionPaused}
                onPress={toggleReveal}
                style={({ pressed }) => [
                  styles.cardTapTarget,
                  pressed && !isInteractionPaused && styles.cardPressed,
                ]}>
                <Animated.View
                  pointerEvents="none"
                  style={[styles.cardShadowLayer, { opacity: cardShadowOpacity }]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[styles.swipeFeedback, styles.swipeFeedbackRepeat, { opacity: repeatFeedbackOpacity }]}>
                  <Text style={[styles.swipeFeedbackText, styles.swipeFeedbackRepeatText]}>
                    Review again
                  </Text>
                </Animated.View>
                <Animated.View
                  pointerEvents="none"
                  style={[styles.swipeFeedback, styles.swipeFeedbackPass, { opacity: passFeedbackOpacity }]}>
                  <Text style={[styles.swipeFeedbackText, styles.swipeFeedbackPassText]}>
                    Know it
                  </Text>
                </Animated.View>
                <Animated.View
                  style={[
                    styles.flashcard,
                    styles.cardFlipFace,
                    { transform: [{ perspective: 1000 }, { rotateY: frontFaceRotation }] },
                  ]}>
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.cardSwipeTint, styles.cardPassTint, { opacity: passTintOpacity }]}
                  />
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.cardSwipeTint,
                      styles.cardRepeatTint,
                      { opacity: repeatTintOpacity },
                    ]}
                  />
                  <View pointerEvents="none" style={styles.cardDecorations}>
                    <View style={[styles.cardGlow, styles.cardGlowTop]} />
                    <View style={[styles.cardGlow, styles.cardGlowBottom]} />
                    <Text style={[styles.sparkle, styles.sparkleTop]}>✦</Text>
                    <Text style={[styles.sparkle, styles.sparkleTopSmall]}>✦</Text>
                    <Text style={[styles.sparkle, styles.sparkleBottom]}>✦</Text>
                    <Text style={[styles.sparkle, styles.sparkleBottomLarge]}>✦</Text>
                  </View>
                  <View style={styles.cardFace}>
                    <Text
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                      numberOfLines={3}
                      style={[
                        styles.cardText,
                        { fontSize: frontTextSize, lineHeight: Math.round(frontTextSize * 1.18) },
                      ]}>
                      {frontText}
                    </Text>
                  </View>
                  <Text style={styles.cardHint}>Tap to reveal</Text>
                </Animated.View>
                <Animated.View
                  style={[
                    styles.flashcard,
                    styles.cardFlipFace,
                    { transform: [{ perspective: 1000 }, { rotateY: backFaceRotation }] },
                  ]}>
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.cardSwipeTint, styles.cardPassTint, { opacity: passTintOpacity }]}
                  />
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.cardSwipeTint,
                      styles.cardRepeatTint,
                      { opacity: repeatTintOpacity },
                    ]}
                  />
                  <View pointerEvents="none" style={styles.cardDecorations}>
                    <View style={[styles.cardGlow, styles.cardGlowTop]} />
                    <View style={[styles.cardGlow, styles.cardGlowBottom]} />
                    <Text style={[styles.sparkle, styles.sparkleTop]}>✦</Text>
                    <Text style={[styles.sparkle, styles.sparkleTopSmall]}>✦</Text>
                    <Text style={[styles.sparkle, styles.sparkleBottom]}>✦</Text>
                    <Text style={[styles.sparkle, styles.sparkleBottomLarge]}>✦</Text>
                  </View>
                  <View style={styles.cardFace}>
                    <Text
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                      numberOfLines={7}
                      style={[
                        styles.cardText,
                        { fontSize: backTextSize, lineHeight: Math.round(backTextSize * 1.18) },
                      ]}>
                      {backText}
                    </Text>
                  </View>
                  <Text style={styles.cardHint}>Tap to view term</Text>
                </Animated.View>
              </Pressable>
            </Animated.View>
          </View>
        </View>

        <View style={styles.bottomBlock}>
          {decisionError ? <Text style={styles.errorText}>{decisionError}</Text> : null}
          <View style={[styles.actions, { width: contentWidth }]}>
            <SessionButton
              buttonWidth={actionButtonWidth}
              disabled={isInteractionPaused}
              iconName={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
              label="Review again"
              variant="secondary"
              onPress={() => handleCardAction('reviewAgain')}
            />
            <SessionButton
              buttonWidth={actionButtonWidth}
              disabled={isInteractionPaused}
              iconName={{ ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' }}
              label="Know it"
              variant="primary"
              onPress={() => handleCardAction('know')}
            />
          </View>
          <View style={styles.footerRow}>
            <Text style={styles.footerSparkle}>✦</Text>
            <Text style={styles.footerText}>{copy.footer}</Text>
          </View>
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={['#FFFFFF', '#FFFEFC']}
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
              <Text style={styles.moreText}>...</Text>
            </Pressable>
          </View>

          <View style={[styles.meta, { width: contentWidth }]}>
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
  buttonWidth?: number;
  disabled?: boolean;
  iconName?: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary';
};

function SessionButton({
  buttonWidth,
  disabled,
  iconName,
  label,
  onPress,
  variant,
}: SessionButtonProps) {
  const isPrimary = variant === 'primary';
  const iconColor = isPrimary ? '#EAF7EE' : theme.colors.accent;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sessionButton,
        buttonWidth
          ? { flexBasis: buttonWidth, flexGrow: 0, flexShrink: 0, width: buttonWidth }
          : null,
        isPrimary ? styles.primaryButton : styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.buttonPressed,
      ]}>
      {iconName ? <IconSymbol color={iconColor} name={iconName} size={18} /> : null}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        style={[
          styles.sessionButtonText,
          isPrimary ? styles.primaryButtonText : styles.secondaryButtonText,
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
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  viewport: {
    alignItems: 'center',
    flex: 1,
  },
  shell: {
    flex: 1,
    maxWidth: 430,
    paddingBottom: 18,
    paddingHorizontal: 0,
    width: '100%',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 58,
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: 2,
    width: '100%',
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  logo: {
    height: 36,
    maxWidth: 190,
    width: 152,
  },
  moreText: {
    color: '#52615C',
    fontFamily: theme.typography.fontFamilyHeavy,
    fontSize: 18,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 1.6,
    lineHeight: 18,
    marginTop: -7,
  },
  meta: {
    alignItems: 'center',
    alignSelf: 'center',
    minHeight: 104,
  },
  deckName: {
    color: '#52645F',
    fontSize: 12,
    fontFamily: theme.typography.fontFamilyMedium,
    fontWeight: theme.typography.weights.medium,
    letterSpacing: 4.3,
    lineHeight: 18,
    marginTop: 10,
    maxWidth: '92%',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  quickProgressBlock: {
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
  },
  progressTrack: {
    backgroundColor: '#DDEFE2',
    borderRadius: theme.radius.pill,
    height: 7,
    overflow: 'hidden',
    width: 268,
  },
  progressFill: {
    backgroundColor: '#2FAA56',
    borderRadius: theme.radius.pill,
    height: '100%',
    minWidth: 10,
  },
  progressLabel: {
    color: '#7F9288',
    fontSize: 14,
    fontFamily: theme.typography.fontFamilyMedium,
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
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 22,
  },
  statLabel: {
    color: '#4D574F',
    fontSize: 10,
    fontFamily: theme.typography.fontFamilyExtraBold,
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
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 390,
  },
  cardStack: {
    position: 'relative',
  },
  cardSwipeFrame: {
    ...StyleSheet.absoluteFill,
  },
  nextCardPreview: {
    ...StyleSheet.absoluteFill,
    opacity: 0.88,
    shadowColor: '#102219',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    transform: [{ scale: 0.99 }],
    elevation: 4,
  },
  cardTapTarget: {
    borderRadius: 30,
    flex: 1,
    position: 'relative',
  },
  cardShadowLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    zIndex: 0,
    shadowColor: '#102219',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 34,
    elevation: 10,
  },
  swipeFeedback: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -62,
    paddingHorizontal: 13,
    position: 'absolute',
    top: 22,
    width: 124,
    zIndex: 4,
  },
  swipeFeedbackPass: {
    backgroundColor: 'rgba(229, 246, 236, 0.9)',
    borderColor: 'rgba(36, 122, 77, 0.16)',
  },
  swipeFeedbackRepeat: {
    backgroundColor: 'rgba(255, 244, 239, 0.92)',
    borderColor: 'rgba(156, 87, 56, 0.14)',
  },
  swipeFeedbackText: {
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 11,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 1,
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  swipeFeedbackPassText: {
    color: '#246D46',
  },
  swipeFeedbackRepeatText: {
    color: '#94563E',
  },
  cardSwipeTint: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  cardPassTint: {
    backgroundColor: '#2F8F59',
  },
  cardRepeatTint: {
    backgroundColor: '#C05646',
  },
  cardDecorations: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  cardGlow: {
    backgroundColor: 'transparent',
    position: 'absolute',
  },
  cardGlowTop: {
    borderBottomLeftRadius: 190,
    height: 174,
    right: -70,
    top: -42,
    transform: [{ rotate: '-19deg' }],
    width: 170,
  },
  cardGlowBottom: {
    borderTopRightRadius: 240,
    bottom: -74,
    height: 228,
    left: -72,
    transform: [{ rotate: '9deg' }],
    width: 238,
  },
  sparkle: {
    color: '#D8DEDA',
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 28,
    position: 'absolute',
    textAlign: 'center',
  },
  sparkleTop: {
    fontSize: 25,
    right: 18,
    top: 18,
  },
  sparkleTopSmall: {
    color: '#E2E6E3',
    fontSize: 15,
    right: 8,
    top: 41,
  },
  sparkleBottom: {
    bottom: 54,
    color: '#E2E6E3',
    fontSize: 16,
    left: 14,
  },
  sparkleBottomLarge: {
    bottom: 29,
    fontSize: 27,
    left: 25,
  },
  cardPressed: {
    transform: [{ scale: 0.992 }],
  },
  flashcard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardFlipFace: {
    ...StyleSheet.absoluteFill,
    backfaceVisibility: 'hidden',
    zIndex: 1,
  },
  cardFace: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingVertical: 30,
    zIndex: 2,
  },
  cardText: {
    color: '#041613',
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    textAlign: 'center',
  },
  cardHint: {
    bottom: 33,
    color: '#739182',
    fontSize: 15,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    left: 20,
    position: 'absolute',
    right: 20,
    textAlign: 'center',
    zIndex: 2,
  },
  bottomBlock: {
    alignItems: 'center',
    gap: 18,
    paddingTop: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 11,
    justifyContent: 'space-between',
  },
  sessionButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    height: 60,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 12,
  },
  primaryButton: {
    backgroundColor: '#2FAA56',
    shadowColor: theme.colors.accentStrong,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.26,
    shadowRadius: 28,
    elevation: 7,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCEFE2',
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
    fontSize: 15,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0,
    lineHeight: 20,
    textAlign: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  secondaryButtonText: {
    color: theme.colors.accent,
  },
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  footerSparkle: {
    color: '#CFEAD6',
    fontFamily: theme.typography.fontFamilyHeavy,
    fontSize: 15,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 18,
  },
  footerText: {
    color: '#809087',
    fontSize: 13,
    fontFamily: theme.typography.fontFamilyMedium,
    fontWeight: theme.typography.weights.medium,
    lineHeight: 18,
    textAlign: 'center',
  },
  errorText: {
    color: theme.colors.reviewRed,
    fontSize: 13,
    fontFamily: theme.typography.fontFamilySemiBold,
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
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 28,
    textAlign: 'center',
  },
  stateBody: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontFamily: theme.typography.fontFamilySemiBold,
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
