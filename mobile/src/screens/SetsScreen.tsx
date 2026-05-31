import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/src/components/Screen';
import { AppApiError, getAppState, getSets, type ApiSetListItem } from '@/src/services/appApi';
import { getLearningCountsFromSummary } from '@/src/services/learningSession';
import { theme } from '@/src/theme/theme';

type SegmentId = 'my-sets' | 'ready-made';
type IconName = 'brain' | 'briefcase' | 'globe' | 'heart' | 'plus' | 'search' | 'stack' | 'suitcase';

type Segment = {
  id: SegmentId;
  icon: IconName;
  label: string;
};

type SetCardData = {
  cardCount: number;
  externalId: string;
  icon: IconName;
  id: string;
  isActive?: boolean;
  progress: number;
  tileColors: [string, string];
  title: string;
};

const segments: Segment[] = [
  {
    id: 'my-sets',
    label: 'My Sets',
    icon: 'stack',
  },
  {
    id: 'ready-made',
    label: 'Ready-made',
    icon: 'globe',
  },
];

const tilePresets: Array<{ icon: IconName; tileColors: [string, string] }> = [
  { icon: 'globe', tileColors: ['#D3B5FF', '#A879E7'] },
  { icon: 'suitcase', tileColors: ['#BFDFFF', '#6EA8F3'] },
  { icon: 'briefcase', tileColors: ['#C6EBC0', '#7FBE7A'] },
  { icon: 'brain', tileColors: ['#FFE39A', '#FFC34A'] },
  { icon: 'heart', tileColors: ['#FF95AE', '#F47796'] },
];

export function SetsScreen() {
  const [activeSegment, setActiveSegment] = useState<SegmentId>('my-sets');
  const [sets, setSets] = useState<ApiSetListItem[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const setCards = useMemo(
    () =>
      sets
        .filter((set) => (activeSegment === 'my-sets' ? set.source === 'User' : set.source === 'ReadyMade'))
        .map((set, index) => toSetCardData(set, activeSetId, index)),
    [activeSegment, activeSetId, sets],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function loadSets() {
        setIsLoading(true);
        setErrorMessage(null);

        try {
          const [appState, apiSets] = await Promise.all([getAppState(), getSets()]);

          if (cancelled) return;

          setActiveSetId(appState.activeSetExternalId ?? appState.activeSetId);
          setSets(apiSets);

          const hasUserSets = apiSets.some((set) => set.source === 'User');
          if (!hasUserSets) setActiveSegment('ready-made');
        } catch (error) {
          if (cancelled) return;

          console.warn('Unable to load sets.', error);
          setErrorMessage(getApiErrorMessage(error, 'Unable to load sets from the local API.'));
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      }

      void loadSets();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <View style={styles.root}>
      <Screen contentContainerStyle={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>My Sets</Text>
          <Pressable
            accessibilityLabel="Search sets"
            accessibilityRole="button"
            style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}>
            <LineIcon color="#101522" name="search" size={33} />
          </Pressable>
        </View>

        <SegmentedControl
          activeSegment={activeSegment}
          segments={segments}
          onSegmentChange={setActiveSegment}
        />

        <View style={styles.cardList}>
          {isLoading ? <StateCard message="Loading your decks." title="Getting sets..." /> : null}
          {errorMessage ? <StateCard message={errorMessage} title="Could not load sets." /> : null}
          {!isLoading && !errorMessage && setCards.length === 0 ? (
            <StateCard
              message={
                activeSegment === 'my-sets'
                  ? 'User-created sets will appear here after you add them in the API-backed app.'
                  : 'No ready-made sets are available from the local API.'
              }
              title="No sets here yet."
            />
          ) : null}
          {!isLoading && !errorMessage
            ? setCards.map((set) => <SetCard key={set.id} set={set} />)
            : null}
        </View>
      </Screen>

      <FloatingActionButton />
    </View>
  );
}

type SegmentedControlProps = {
  activeSegment: SegmentId;
  onSegmentChange: (segment: SegmentId) => void;
  segments: Segment[];
};

function SegmentedControl({ activeSegment, onSegmentChange, segments }: SegmentedControlProps) {
  return (
    <View style={styles.segmentedControl}>
      {segments.map((segment) => {
        const active = segment.id === activeSegment;
        const color = active ? theme.colors.accentStrong : '#7C8494';

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={segment.id}
            onPress={() => onSegmentChange(segment.id)}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              pressed && styles.pressed,
            ]}>
            <LineIcon color={color} name={segment.icon} size={24} />
            <Text numberOfLines={1} style={[styles.segmentLabel, { color }]}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type SetCardProps = {
  set: SetCardData;
};

function SetCard({ set }: SetCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: '/set/[externalSetId]',
          params: { externalSetId: set.externalId },
        })
      }
      style={({ pressed }) => [
        styles.setCard,
        set.isActive && styles.setCardActive,
        pressed && styles.pressed,
      ]}>
      <LinearGradient
        colors={set.tileColors}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.iconTile}>
        <LineIcon color="#FFFFFF" name={set.icon} size={52} />
      </LinearGradient>

      <View style={styles.setContent}>
        <View style={styles.setHeader}>
          <View style={styles.setTitleBlock}>
            <Text numberOfLines={1} style={styles.setTitle}>
              {set.title}
            </Text>
            <Text style={styles.cardCount}>{set.cardCount} cards</Text>
          </View>

          <View style={styles.cardActions}>
            {set.isActive ? <ActivePill /> : null}
            <ThreeDotButton />
          </View>
        </View>

        <View style={styles.progressRow}>
          <ProgressBar value={set.progress} />
          <Text style={styles.progressLabel}>{set.progress}%</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ActivePill() {
  return (
    <View style={styles.activePill}>
      <Text style={styles.activePillText}>Active</Text>
    </View>
  );
}

function ThreeDotButton() {
  return (
    <View style={styles.moreButton}>
      <View style={styles.dot} />
      <View style={styles.dot} />
      <View style={styles.dot} />
    </View>
  );
}

type ProgressBarProps = {
  value: number;
};

function ProgressBar({ value }: ProgressBarProps) {
  return (
    <View
      accessibilityLabel={`${value}% complete`}
      accessibilityRole="progressbar"
      style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${value}%` }]} />
    </View>
  );
}

function FloatingActionButton() {
  return (
    <Pressable
      accessibilityLabel="Create set"
      accessibilityRole="button"
      style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
      <LineIcon color="#FFFFFF" name="plus" size={34} />
    </Pressable>
  );
}

type StateCardProps = {
  message: string;
  title: string;
};

function StateCard({ message, title }: StateCardProps) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
    </View>
  );
}

function toSetCardData(
  set: ApiSetListItem,
  activeSetId: string | null,
  index: number,
): SetCardData {
  const counts = getLearningCountsFromSummary(set.progressSummary);
  const preset = tilePresets[index % tilePresets.length];
  const progress =
    counts.totalCards > 0 ? Math.round((counts.learnedCards / counts.totalCards) * 100) : 0;

  return {
    cardCount: set.cardCount,
    externalId: set.externalId,
    icon: getSetIcon(set.name, preset.icon),
    id: set.id,
    isActive: activeSetId === set.externalId,
    progress,
    tileColors: preset.tileColors,
    title: set.name,
  };
}

function getSetIcon(name: string, fallback: IconName): IconName {
  const normalizedName = name.toLocaleLowerCase();

  if (normalizedName.includes('business') || normalizedName.includes('work')) return 'briefcase';
  if (normalizedName.includes('travel')) return 'suitcase';
  if (normalizedName.includes('medical') || normalizedName.includes('health')) return 'heart';
  if (normalizedName.includes('psychology') || normalizedName.includes('brain')) return 'brain';
  if (normalizedName.includes('english') || normalizedName.includes('spanish')) return 'globe';

  return fallback;
}

function getApiErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof AppApiError) return error.message;

  return fallbackMessage;
}

type LineIconProps = {
  color: string;
  name: IconName;
  size: number;
};

function LineIcon({ color, name, size }: LineIconProps) {
  if (name === 'plus') {
    return (
      <View style={[styles.lineIcon, { height: size, width: size }]}>
        <View style={[styles.plusLine, { backgroundColor: color, width: size * 0.7 }]} />
        <View style={[styles.plusLineVertical, { backgroundColor: color, height: size * 0.7 }]} />
      </View>
    );
  }

  if (name === 'search') {
    return (
      <View style={[styles.lineIcon, { height: size, width: size }]}>
        <View
          style={[
            styles.searchCircle,
            {
              borderColor: color,
              borderRadius: size * 0.31,
              height: size * 0.62,
              width: size * 0.62,
            },
          ]}
        />
        <View
          style={[
            styles.searchHandle,
            {
              backgroundColor: color,
              height: size * 0.35,
              left: size * 0.68,
              top: size * 0.66,
            },
          ]}
        />
      </View>
    );
  }

  if (name === 'stack') {
    return (
      <View style={[styles.lineIcon, { height: size, width: size }]}>
        <View style={[styles.stackBox, styles.stackBoxBack, { borderColor: color }]} />
        <View style={[styles.stackBox, styles.stackBoxMid, { borderColor: color }]} />
        <View style={[styles.stackBox, styles.stackBoxFront, { borderColor: color }]} />
      </View>
    );
  }

  if (name === 'globe') {
    return (
      <View style={[styles.lineIcon, { height: size, width: size }]}>
        <View style={[styles.globeCircle, { borderColor: color, borderRadius: size / 2 }]} />
        <View style={[styles.globeMeridian, { borderColor: color, borderRadius: size / 2 }]} />
        <View style={[styles.globeLine, styles.globeLineTop, { backgroundColor: color }]} />
        <View style={[styles.globeLine, styles.globeLineMiddle, { backgroundColor: color }]} />
      </View>
    );
  }

  if (name === 'suitcase' || name === 'briefcase') {
    return (
      <View style={[styles.lineIcon, { height: size, width: size }]}>
        <View style={[styles.bagHandle, { borderColor: color }]} />
        <View style={[styles.bagBody, { borderColor: color }]}>
          {name === 'briefcase' ? <View style={[styles.bagLatch, { borderColor: color }]} /> : null}
        </View>
      </View>
    );
  }

  if (name === 'brain') {
    return (
      <View style={[styles.lineIcon, { height: size, width: size }]}>
        <View style={[styles.brainLobe, styles.brainLobeTopLeft, { borderColor: color }]} />
        <View style={[styles.brainLobe, styles.brainLobeTopRight, { borderColor: color }]} />
        <View style={[styles.brainLobe, styles.brainLobeBottomLeft, { borderColor: color }]} />
        <View style={[styles.brainLobe, styles.brainLobeBottomRight, { borderColor: color }]} />
        <View style={[styles.brainStem, { backgroundColor: color }]} />
      </View>
    );
  }

  if (name === 'heart') {
    return (
      <View style={[styles.lineIcon, { height: size, width: size }]}>
        <View style={[styles.heartLoop, styles.heartLoopLeft, { borderColor: color }]} />
        <View style={[styles.heartLoop, styles.heartLoopRight, { borderColor: color }]} />
        <View style={[styles.heartLine, styles.heartLineLeft, { backgroundColor: color }]} />
        <View style={[styles.heartLine, styles.heartLineRight, { backgroundColor: color }]} />
      </View>
    );
  }

  return (
    <View style={[styles.lineIcon, { height: size, width: size }]}>
      <View style={[styles.medicalVertical, { backgroundColor: color }]} />
      <View style={[styles.medicalHorizontal, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: theme.colors.appBackdrop,
    flex: 1,
  },
  screen: {
    paddingBottom: 178,
    paddingTop: 18,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 60,
    width: '100%',
  },
  title: {
    color: '#101522',
    fontFamily: theme.typography.fontFamily,
    fontSize: 34,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    lineHeight: 35,
  },
  searchButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  segmentedControl: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderColor: 'rgba(225,228,223,0.86)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 64,
    marginTop: 31,
    overflow: 'hidden',
    padding: 5,
    shadowColor: '#2A261E',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 3,
    width: '100%',
  },
  segment: {
    alignItems: 'center',
    borderRadius: 20,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    height: 52,
    justifyContent: 'center',
    minWidth: 0,
  },
  segmentActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#247A4D',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.09,
    shadowRadius: 19,
    elevation: 3,
  },
  segmentLabel: {
    fontFamily: theme.typography.fontFamily,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0,
    lineHeight: 23,
  },
  cardList: {
    gap: 18,
    marginTop: 30,
  },
  setCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 15,
    minHeight: 138,
    overflow: 'hidden',
    paddingBottom: 18,
    paddingLeft: 15,
    paddingRight: 16,
    paddingTop: 18,
    shadowColor: '#2A261E',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 34,
    elevation: 4,
    width: '100%',
  },
  setCardActive: {
    borderColor: 'rgba(47,143,89,0.38)',
    shadowColor: '#247A4D',
    shadowOpacity: 0.13,
  },
  iconTile: {
    alignItems: 'center',
    borderRadius: 19,
    height: 92,
    justifyContent: 'center',
    width: 92,
  },
  setContent: {
    flex: 1,
    gap: 20,
    minWidth: 0,
  },
  setHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  setTitleBlock: {
    flex: 1,
    minWidth: 0,
    paddingTop: 3,
  },
  setTitle: {
    color: '#101522',
    fontFamily: theme.typography.fontFamily,
    fontSize: 18,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0,
    lineHeight: 23,
  },
  cardCount: {
    color: '#657086',
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 21,
    marginTop: 10,
  },
  cardActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minHeight: 38,
  },
  activePill: {
    alignItems: 'center',
    backgroundColor: '#EAF7EF',
    borderColor: 'rgba(47,143,89,0.1)',
    borderRadius: 13,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  activePillText: {
    color: theme.colors.accentStrong,
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: theme.typography.weights.extraBold,
    lineHeight: 18,
  },
  moreButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    gap: 4,
    height: 34,
    justifyContent: 'center',
    width: 15,
  },
  dot: {
    backgroundColor: '#778197',
    borderRadius: theme.radius.pill,
    height: 3.5,
    width: 3.5,
  },
  progressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 13,
  },
  progressTrack: {
    backgroundColor: 'rgba(20,21,24,0.07)',
    borderRadius: theme.radius.pill,
    flex: 1,
    height: 6,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: theme.colors.accentStrong,
    borderRadius: theme.radius.pill,
    height: '100%',
  },
  progressLabel: {
    color: '#657086',
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 20,
    minWidth: 42,
    textAlign: 'right',
  },
  fab: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentStrong,
    borderRadius: theme.radius.pill,
    bottom: 108,
    height: 68,
    justifyContent: 'center',
    position: 'absolute',
    right: 22,
    shadowColor: '#247A4D',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.32,
    shadowRadius: 32,
    width: 68,
    zIndex: 25,
    elevation: 10,
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    shadowColor: '#2A261E',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 34,
    elevation: 4,
  },
  stateTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.fontFamily,
    fontSize: 21,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    lineHeight: 25,
  },
  stateMessage: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.fontFamily,
    fontSize: 15,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 22,
    marginTop: 8,
  },
  lineIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  plusLine: {
    borderRadius: theme.radius.pill,
    height: 3,
    position: 'absolute',
  },
  plusLineVertical: {
    borderRadius: theme.radius.pill,
    position: 'absolute',
    width: 3,
  },
  searchCircle: {
    borderWidth: 3,
    left: 2,
    position: 'absolute',
    top: 2,
  },
  searchHandle: {
    borderRadius: theme.radius.pill,
    position: 'absolute',
    transform: [{ rotate: '-45deg' }],
    width: 3,
  },
  stackBox: {
    borderRadius: 3,
    borderWidth: 2.4,
    height: 12,
    position: 'absolute',
    width: 17,
  },
  stackBoxBack: {
    left: 3,
    top: 4,
  },
  stackBoxMid: {
    left: 6,
    top: 8,
  },
  stackBoxFront: {
    left: 9,
    top: 12,
  },
  globeCircle: {
    borderWidth: 3.2,
    height: '100%',
    position: 'absolute',
    width: '100%',
  },
  globeMeridian: {
    borderWidth: 2.5,
    height: '100%',
    position: 'absolute',
    width: '45%',
  },
  globeLine: {
    borderRadius: theme.radius.pill,
    height: 2.6,
    position: 'absolute',
    width: '78%',
  },
  globeLineTop: {
    top: '31%',
  },
  globeLineMiddle: {
    top: '62%',
  },
  bagHandle: {
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderWidth: 3,
    height: '24%',
    position: 'absolute',
    top: '9%',
    width: '36%',
  },
  bagBody: {
    alignItems: 'center',
    borderRadius: 7,
    borderWidth: 3,
    height: '58%',
    justifyContent: 'center',
    position: 'absolute',
    top: '29%',
    width: '82%',
  },
  bagLatch: {
    borderRadius: 4,
    borderWidth: 3,
    height: '18%',
    width: '22%',
  },
  brainLobe: {
    borderRadius: 14,
    borderWidth: 3,
    height: '38%',
    position: 'absolute',
    width: '34%',
  },
  brainLobeTopLeft: {
    left: '17%',
    top: '14%',
  },
  brainLobeTopRight: {
    right: '17%',
    top: '14%',
  },
  brainLobeBottomLeft: {
    left: '19%',
    top: '41%',
  },
  brainLobeBottomRight: {
    right: '19%',
    top: '41%',
  },
  brainStem: {
    borderRadius: theme.radius.pill,
    bottom: '12%',
    height: '26%',
    position: 'absolute',
    width: 3,
  },
  heartLoop: {
    borderRadius: 999,
    borderWidth: 3,
    height: '40%',
    position: 'absolute',
    top: '18%',
    width: '38%',
  },
  heartLoopLeft: {
    left: '17%',
  },
  heartLoopRight: {
    right: '17%',
  },
  heartLine: {
    borderRadius: theme.radius.pill,
    height: '46%',
    position: 'absolute',
    top: '45%',
    width: 3,
  },
  heartLineLeft: {
    left: '34%',
    transform: [{ rotate: '-38deg' }],
  },
  heartLineRight: {
    right: '34%',
    transform: [{ rotate: '38deg' }],
  },
  medicalVertical: {
    borderRadius: theme.radius.pill,
    height: '76%',
    position: 'absolute',
    width: 8,
  },
  medicalHorizontal: {
    borderRadius: theme.radius.pill,
    height: 8,
    position: 'absolute',
    width: '76%',
  },
  pressed: {
    opacity: 0.82,
  },
});
