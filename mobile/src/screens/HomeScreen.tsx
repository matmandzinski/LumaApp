import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/src/components/IconSymbol';
import { Screen } from '@/src/components/Screen';
import { AppApiError, getAppState, getSet, type ApiSetDetail } from '@/src/services/appApi';
import { getLearningCounts } from '@/src/services/learningSession';
import { theme } from '@/src/theme/theme';

const lumaLogo = require('../../assets/images/luma-logo.png');

const weekBars = [
  { label: 'Mo', height: 14, active: false, muted: false },
  { label: 'Tu', height: 24, active: false, muted: false },
  { label: 'We', height: 18, active: false, muted: false },
  { label: 'Th', height: 28, active: false, muted: false },
  { label: 'Fr', height: 31, active: true, muted: false },
  { label: 'Sa', height: 11, active: false, muted: true },
  { label: 'Su', height: 17, active: false, muted: true },
];

export function HomeScreen() {
  const [activeSet, setActiveSet] = useState<ApiSetDetail | null>(null);
  const [isLoadingActiveSet, setIsLoadingActiveSet] = useState(true);
  const [homeError, setHomeError] = useState<string | null>(null);
  const counts = useMemo(() => getLearningCounts(activeSet), [activeSet]);
  const quickLessonReadyCount = Math.min(10, counts.readyCards);
  const activeSetName = activeSet?.name ?? (isLoadingActiveSet ? 'Loading active set' : 'No active set');
  const activeSetProgressText =
    counts.totalCards > 0
      ? `${counts.totalCards} cards: ${counts.learnedCards} learned - ${counts.learningCards} learning - ${counts.difficultCards} difficult`
      : isLoadingActiveSet
        ? 'Getting cards from the local API'
        : 'Choose a set to start learning';
  const quickPillText = isLoadingActiveSet
    ? 'Loading cards'
    : quickLessonReadyCount > 0
      ? `${quickLessonReadyCount} cards - about ${quickLessonReadyCount > 5 ? 2 : 1} min`
      : 'All caught up';
  const startButtonText = activeSet ? 'Start now' : 'Choose a set';
  const practiceCountText =
    counts.readyCards > 0
      ? `${counts.readyCards} cards available`
      : activeSet
        ? 'All cards learned'
        : 'Choose an active set';
  const todayMix = [
    { label: 'known', value: String(counts.learnedCards), color: '#008C55' },
    { label: 'learning', value: String(counts.learningCards), color: '#7BD7AD' },
    { label: 'difficult', value: String(counts.difficultCards), color: '#E09435' },
  ];

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function loadActiveSet() {
        setIsLoadingActiveSet(true);
        setHomeError(null);

        try {
          const appState = await getAppState();
          const activeSetId = appState.activeSetExternalId ?? appState.activeSetId;

          if (!activeSetId) {
            if (!cancelled) setActiveSet(null);
            return;
          }

          const set = await getSet(activeSetId);
          if (!cancelled) setActiveSet(set);
        } catch (error) {
          if (cancelled) return;

          console.warn('Unable to load active set for Home.', error);
          setActiveSet(null);
          setHomeError(getApiErrorMessage(error, 'Unable to load the active set.'));
        } finally {
          if (!cancelled) setIsLoadingActiveSet(false);
        }
      }

      void loadActiveSet();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  function startQuickLesson() {
    if (isLoadingActiveSet) return;
    router.push(activeSet ? '/quick-lesson' : '/sets');
  }

  function startPracticeCards() {
    if (isLoadingActiveSet) return;
    router.push(activeSet ? '/practice-cards' : '/sets');
  }

  function openActiveSet() {
    if (activeSet) {
      router.push({
        pathname: '/set/[externalSetId]',
        params: { externalSetId: activeSet.externalId },
      });
      return;
    }

    router.push('/sets');
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.topBarSpacer} />
        <View style={styles.logoWrap}>
          <Image source={lumaLogo} style={styles.logo} resizeMode="contain" />
        </View>
        <Pressable accessibilityRole="button" style={({ pressed }) => [styles.iconChip, pressed && styles.pressed]}>
          <IconSymbol name={{ ios: 'person', android: 'person', web: 'person' }} color="#657067" size={20} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.greeting}>Good morning, Mateusz</Text>
          <Text style={styles.headline}>
            Tiny steps.{'\n'}
            Big <Text style={styles.headlineAccent}>progress.</Text>
          </Text>
        </View>

        <View style={styles.streakCard}>
          <IconSymbol
            name={{ ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' }}
            color={theme.colors.gold}
            size={20}
          />
          <Text style={styles.streakValue}>1</Text>
          <Text style={styles.streakLabel}>day</Text>
        </View>
      </View>

      <LinearGradient
        colors={[theme.colors.quickStart, theme.colors.quickMid, theme.colors.quickEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.quickCard}>
        <View style={styles.quickGlow} />
        <View style={styles.lightningBadge}>
          <IconSymbol name={{ ios: 'bolt.fill', android: 'bolt', web: 'bolt' }} color="#FFFFFF" size={30} />
        </View>

        <View style={styles.quickContent}>
          <View style={styles.quickPill}>
            <View style={styles.quickPillDot} />
            <Text style={styles.quickPillText}>{quickPillText}</Text>
          </View>

          <Text style={styles.quickTitle}>
            Quick{'\n'}
            Lesson
          </Text>
          <Text style={styles.quickDescription}>
            {homeError ?? 'Review up to 10 cards from your active deck. Calm, focused, and done fast.'}
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={isLoadingActiveSet}
            onPress={startQuickLesson}
            style={({ pressed }) => [
              styles.startButton,
              isLoadingActiveSet && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.startButtonText}>{startButtonText}</Text>
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>YOUR LEARNING</Text>
        <Text style={styles.sectionLink}>OVERVIEW</Text>
      </View>

      <View style={styles.activeSetCard}>
        <View style={styles.activeSetRail} />
        <Pressable accessibilityRole="button" onPress={openActiveSet} style={styles.activeSetMain}>
          <View style={styles.activeSetCopy}>
            <Text style={styles.premiumLabel}>ACTIVE SET</Text>
            <Text style={styles.activeSetName} numberOfLines={1}>
              {activeSetName}
            </Text>
            <Text style={styles.activeSetProgress}>{activeSetProgressText}</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/sets')}
          style={({ pressed }) => [styles.changeButton, pressed && styles.pressed]}>
          <Text style={styles.changeButtonText}>Change</Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={isLoadingActiveSet}
        onPress={startPracticeCards}
        style={({ pressed }) => [
          styles.practiceCard,
          isLoadingActiveSet && styles.disabled,
          pressed && styles.pressed,
        ]}>
        <View style={styles.practiceRail} />
        <View style={styles.practiceGlow} />
        <View style={styles.practiceCopy}>
          <Text style={styles.practiceTitle}>Practice cards</Text>
          <Text style={styles.practiceSubtitle}>Review cards from your active set at your own pace.</Text>
          <Text style={styles.practiceCount}>{practiceCountText}</Text>
        </View>
        <View style={styles.practiceIcon}>
          <IconSymbol name={{ ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }} color="#08783E" size={25} />
        </View>
      </Pressable>

      <LinearGradient
        colors={['#FCFFFC', '#F6FEF9', '#FDFEFA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.flowCard}>
        <View style={styles.flowTop}>
          <View style={styles.flowTopCopy}>
            <Text style={styles.flowLabel}>Today's flow</Text>
            <Text style={styles.flowTitle}>You're making progress.</Text>
          </View>
          <View style={styles.flowTotal}>
            <Text style={styles.flowTotalValue}>12</Text>
            <Text style={styles.flowTotalLabel}>reviewed</Text>
          </View>
        </View>

        <View style={styles.flowStats}>
          {todayMix.map((item) => (
            <View key={item.label} style={styles.flowStat}>
              <View style={[styles.flowDot, { backgroundColor: item.color }]} />
              <Text numberOfLines={1} style={styles.flowStatValue}>{item.value}</Text>
              <Text numberOfLines={1} style={styles.flowStatLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.weekBlock}>
          <View style={styles.weekHeader}>
            <Text style={styles.weekHeaderText}>This week</Text>
            <Text style={styles.weekHeaderValue}>48 cards</Text>
          </View>
          <View style={styles.weekBars}>
            {weekBars.map((day) => (
              <View key={day.label} style={[styles.weekDay, day.muted && styles.weekDayMuted]}>
                <View style={[styles.weekBar, { height: day.height }, day.active && styles.weekBarActive]} />
                <Text style={[styles.weekLabel, day.active && styles.weekLabelActive]}>{day.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </LinearGradient>
    </Screen>
  );
}

function getApiErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof AppApiError) return error.message;

  return fallbackMessage;
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
    paddingTop: 0,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 64,
    paddingBottom: 8,
    paddingHorizontal: 6,
    paddingTop: 10,
  },
  topBarSpacer: {
    height: 42,
    width: 42,
  },
  logoWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  logo: {
    height: 36,
    maxWidth: 190,
    width: 152,
  },
  iconChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderColor: 'rgba(255,255,255,0.75)',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  hero: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    marginBottom: 6,
  },
  headline: {
    color: theme.colors.text,
    fontSize: 34,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    lineHeight: 35,
    maxWidth: 256,
  },
  headlineAccent: {
    color: theme.colors.accentStrong,
  },
  streakCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(255,255,255,0.82)',
    borderRadius: 28,
    borderWidth: 1,
    height: 78,
    justifyContent: 'center',
    width: 78,
    ...theme.shadow.subtle,
  },
  streakValue: {
    color: theme.colors.text,
    fontSize: 19,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
    lineHeight: 21,
  },
  streakLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
    marginTop: 1,
  },
  quickCard: {
    borderRadius: 38,
    marginTop: 4,
    minHeight: 286,
    overflow: 'hidden',
    padding: 26,
    position: 'relative',
    ...theme.shadow.green,
  },
  quickGlow: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 115,
    bottom: -110,
    height: 230,
    position: 'absolute',
    right: -95,
    width: 230,
  },
  lightningBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 22,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    position: 'absolute',
    right: 24,
    top: 24,
    width: 64,
    zIndex: 2,
  },
  quickContent: {
    minHeight: 234,
    zIndex: 1,
  },
  quickPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 32,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  quickPillDot: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.pill,
    height: 7,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
    width: 7,
  },
  quickPillText: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
  },
  quickTitle: {
    color: '#FFFFFF',
    fontSize: 38,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    lineHeight: 38,
    maxWidth: 232,
  },
  quickDescription: {
    color: 'rgba(255,255,255,0.83)',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    marginTop: 15,
    maxWidth: 260,
  },
  startButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.pill,
    height: 60,
    justifyContent: 'center',
    marginTop: 'auto',
    shadowColor: '#102B1C',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 30,
  },
  startButtonText: {
    color: '#16633C',
    fontSize: 16,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
  },
  sectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 2,
    marginTop: 18,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 2,
  },
  sectionLink: {
    color: theme.colors.accentStrong,
    fontSize: 11,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 1.5,
  },
  activeSetCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 66,
    paddingBottom: 13,
    paddingLeft: 28,
    paddingRight: 14,
    paddingTop: 13,
    position: 'relative',
    shadowColor: '#2A261E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 2,
  },
  activeSetRail: {
    backgroundColor: theme.colors.accentBright,
    borderRadius: theme.radius.pill,
    bottom: 15,
    left: 13,
    position: 'absolute',
    top: 15,
    width: 4,
  },
  activeSetMain: {
    flex: 1,
    minWidth: 0,
  },
  activeSetCopy: {
    gap: 6,
    minWidth: 0,
  },
  premiumLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 1.8,
  },
  activeSetName: {
    color: theme.colors.text,
    fontSize: 16,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 0,
  },
  activeSetProgress: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
    lineHeight: 15,
  },
  changeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(248,252,249,0.88)',
    borderColor: 'rgba(36,122,77,0.14)',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 17,
  },
  changeButtonText: {
    color: theme.colors.accentStrong,
    fontSize: 12,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
  },
  practiceCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(178,206,190,0.45)',
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 20,
    marginLeft: 8,
    minHeight: 166,
    overflow: 'hidden',
    paddingBottom: 22,
    paddingLeft: 20,
    paddingRight: 24,
    paddingTop: 24,
    position: 'relative',
    width: 'auto',
    shadowColor: '#1F5033',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 4,
  },
  practiceRail: {
    backgroundColor: '#1B9F4E',
    borderBottomLeftRadius: 26,
    borderTopLeftRadius: 26,
    bottom: 0,
    left: -7,
    position: 'absolute',
    top: 0,
    width: 7,
  },
  practiceGlow: {
    backgroundColor: 'rgba(205,241,222,0.76)',
    borderRadius: 122,
    bottom: -66,
    height: 146,
    position: 'absolute',
    right: -44,
    width: 244,
  },
  practiceCopy: {
    flex: 1,
    minWidth: 0,
    zIndex: 1,
  },
  practiceTitle: {
    color: '#106836',
    fontSize: 24,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
    lineHeight: 26,
  },
  practiceSubtitle: {
    color: '#5F6E6C',
    fontSize: 16,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 23,
    marginTop: 9,
    maxWidth: 245,
  },
  practiceCount: {
    color: '#596865',
    fontSize: 15,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 19,
    marginTop: 22,
  },
  practiceIcon: {
    alignItems: 'center',
    backgroundColor: '#E7F8EE',
    borderRadius: 22,
    height: 62,
    justifyContent: 'center',
    width: 62,
    zIndex: 1,
  },
  flowCard: {
    borderColor: 'rgba(15,122,67,0.12)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 20,
    shadowColor: '#23372D',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.06,
    shadowRadius: 34,
    elevation: 4,
  },
  flowTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  flowTopCopy: {
    flex: 1,
    minWidth: 0,
  },
  flowLabel: {
    color: '#008C55',
    fontSize: 10,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  flowTitle: {
    color: '#06160F',
    fontSize: 21,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 23,
    marginTop: 5,
    maxWidth: 190,
  },
  flowTotal: {
    alignItems: 'center',
    backgroundColor: '#EAF9EF',
    borderRadius: 22,
    height: 64,
    justifyContent: 'center',
    minWidth: 74,
    paddingHorizontal: 12,
  },
  flowTotalValue: {
    color: '#008C55',
    fontSize: 27,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 29,
  },
  flowTotalLabel: {
    color: '#3E6C56',
    fontSize: 9,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
    lineHeight: 11,
  },
  flowStats: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(14,122,67,0.1)',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
    minHeight: 39,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  flowStat: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minWidth: 0,
  },
  flowDot: {
    borderRadius: theme.radius.pill,
    height: 7,
    width: 7,
  },
  flowStatValue: {
    color: '#06160F',
    fontSize: 15,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 18,
  },
  flowStatLabel: {
    color: '#38524A',
    fontSize: 9,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
    lineHeight: 13,
  },
  weekBlock: {
    marginTop: 17,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  weekHeaderText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
  },
  weekHeaderValue: {
    color: '#06160F',
    fontSize: 11,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
  },
  weekBars: {
    alignItems: 'flex-end',
    backgroundColor: '#F1FCF6',
    borderColor: 'rgba(14,122,67,0.1)',
    borderRadius: 23,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 62,
    justifyContent: 'space-between',
    paddingBottom: 9,
    paddingHorizontal: 20,
    paddingTop: 13,
  },
  weekDay: {
    alignItems: 'center',
    flex: 1,
    gap: 5,
    justifyContent: 'flex-end',
  },
  weekDayMuted: {
    opacity: 0.62,
  },
  weekBar: {
    backgroundColor: '#BDEFD3',
    borderRadius: theme.radius.pill,
    minHeight: 10,
    width: 7,
  },
  weekBarActive: {
    backgroundColor: '#008C55',
  },
  weekLabel: {
    color: '#61776D',
    fontSize: 9,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
    lineHeight: 11,
  },
  weekLabelActive: {
    color: '#0F7A43',
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.6,
  },
});
