import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { Screen } from '@/src/components/Screen';
import {
  AppApiError,
  deleteSet,
  getAppState,
  getSets,
  renameSet,
  resetSetProgress,
  saveActiveSet,
  type ApiSetListItem,
} from '@/src/services/appApi';
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
  internalId: string;
  isActive?: boolean;
  progress: number;
  readonly: boolean;
  source: ApiSetListItem['source'];
  tileColors: [string, string];
  title: string;
};

type SetMenuAction = 'setActive' | 'resetProgress' | 'rename' | 'delete';

type PendingAction = {
  action: SetMenuAction;
  setId: string;
} | null;

type OpenSetMenu = {
  setId: string;
  x: number;
  y: number;
} | null;

const ACTION_MENU_WIDTH = 188;
const ACTION_MENU_ROW_HEIGHT = 58;

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
  const windowSize = useWindowDimensions();
  const [activeSegment, setActiveSegment] = useState<SegmentId>('my-sets');
  const [sets, setSets] = useState<ApiSetListItem[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeSetError, setActiveSetError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenSetMenu>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [renameTarget, setRenameTarget] = useState<SetCardData | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const setCards = useMemo(
    () =>
      sets
        .filter((set) => (activeSegment === 'my-sets' ? set.source === 'User' : set.source === 'ReadyMade'))
        .map((set, index) => toSetCardData(set, activeSetId, index)),
    [activeSegment, activeSetId, sets],
  );
  const openMenuSet = setCards.find((set) => set.id === openMenu?.setId) ?? null;
  const actionMenuPosition = getActionMenuPosition(openMenu, openMenuSet, windowSize);

  const headerTitle = activeSegment === 'my-sets' ? 'My Sets' : 'Ready-made';

  const loadSets = useCallback(
    async ({ isCancelled }: { isCancelled?: () => boolean } = {}) => {
      setIsLoading(true);
      setErrorMessage(null);
      setActiveSetError(null);

      try {
        const [appState, apiSets] = await Promise.all([getAppState(), getSets()]);
        if (isCancelled?.()) return;

        const persistedActiveSetId = appState.activeSetExternalId ?? appState.activeSetId;
        const activeSetExists = apiSets.some((set) => set.externalId === persistedActiveSetId);
        const fallbackReadyMadeSet = apiSets.find((set) => set.source === 'ReadyMade');
        const nextActiveSetId = activeSetExists
          ? persistedActiveSetId
          : fallbackReadyMadeSet?.externalId ?? null;

        setSets(apiSets);
        setActiveSetId(nextActiveSetId);

        const hasUserSets = apiSets.some((set) => set.source === 'User');
        if (!hasUserSets) setActiveSegment('ready-made');

        if (nextActiveSetId && nextActiveSetId !== persistedActiveSetId) {
          void saveActiveSet(nextActiveSetId).catch((error: unknown) => {
            console.warn('Unable to persist fallback active set.', error);
            setActiveSetError(
              getApiErrorMessage(error, 'Unable to save the fallback active set.'),
            );
          });
        }
      } catch (error) {
        if (isCancelled?.()) return;

        console.warn('Unable to load sets.', error);
        setSets([]);
        setActiveSetId(null);
        setErrorMessage('Could not load sets. Make sure the local API is running.');
      } finally {
        if (!isCancelled?.()) setIsLoading(false);
      }
    },
    [],
  );

  function openSet(set: SetCardData) {
    setOpenMenu(null);
    setActiveSetError(null);

    router.push({
      pathname: '/set/[externalSetId]',
      params: { externalSetId: set.externalId },
    });
  }

  async function activateSet(set: SetCardData) {
    if (pendingAction) return;

    const previousActiveSetId = activeSetId;
    setOpenMenu(null);
    setActiveSetId(set.externalId);
    setActiveSetError(null);
    setPendingAction({ action: 'setActive', setId: set.externalId });

    try {
      await saveActiveSet(set.externalId);
    } catch (error) {
      console.warn('Unable to save active set.', error);
      setActiveSetId(previousActiveSetId);
      setActiveSetError(getApiErrorMessage(error, 'Unable to save the active set.'));
    } finally {
      setPendingAction(null);
    }
  }

  function confirmResetSetProgress(set: SetCardData) {
    setOpenMenu(null);

    Alert.alert(
      'Reset set progress?',
      `This will reset learning progress for ${set.title}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            void resetProgress(set);
          },
        },
      ],
    );
  }

  async function resetProgress(set: SetCardData) {
    if (pendingAction) return;

    setActiveSetError(null);
    setPendingAction({ action: 'resetProgress', setId: set.externalId });

    try {
      const progressSummary = await resetSetProgress(set.externalId);

      setSets((currentSets) =>
        currentSets.map((currentSet) =>
          currentSet.externalId === set.externalId
            ? {
                ...currentSet,
                cardCount: progressSummary.cardCount,
                progressSummary,
              }
            : currentSet,
        ),
      );
    } catch (error) {
      console.warn(`Unable to reset progress for ${set.title}.`, error);
      setActiveSetError(getApiErrorMessage(error, `Unable to reset progress for ${set.title}.`));
    } finally {
      setPendingAction(null);
    }
  }

  function openRenameModal(set: SetCardData) {
    if (set.source !== 'User') return;

    setOpenMenu(null);
    setRenameTarget(set);
    setRenameValue(set.title);
    setRenameError(null);
  }

  function closeRenameModal() {
    if (pendingAction?.action === 'rename') return;

    setRenameTarget(null);
    setRenameValue('');
    setRenameError(null);
  }

  async function submitRename() {
    if (!renameTarget || pendingAction) return;

    const nextName = renameValue.trim();
    if (!nextName) {
      setRenameError('Set name is required.');
      return;
    }

    setRenameError(null);
    setPendingAction({ action: 'rename', setId: renameTarget.externalId });

    try {
      const updatedSet = await renameSet(renameTarget.externalId, nextName);

      setSets((currentSets) =>
        currentSets.map((currentSet) =>
          currentSet.externalId === updatedSet.externalId
            ? {
                ...currentSet,
                cardCount: updatedSet.cardCount,
                name: updatedSet.name,
                progressSummary: updatedSet.progressSummary,
              }
            : currentSet,
        ),
      );
      setRenameTarget(null);
      setRenameValue('');
    } catch (error) {
      console.warn(`Unable to rename ${renameTarget.title}.`, error);
      setRenameError(getApiErrorMessage(error, `Unable to rename ${renameTarget.title}.`));
    } finally {
      setPendingAction(null);
    }
  }

  function confirmDeleteSet(set: SetCardData) {
    if (set.source !== 'User') return;

    setOpenMenu(null);
    Alert.alert(
      'Delete set?',
      `${set.title} will be removed from your sets.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void removeSet(set);
          },
        },
      ],
    );
  }

  async function removeSet(set: SetCardData) {
    if (pendingAction) return;

    setActiveSetError(null);
    setPendingAction({ action: 'delete', setId: set.externalId });

    try {
      const response = await deleteSet(set.externalId);
      const remainingSets = sets.filter((currentSet) => currentSet.externalId !== set.externalId);

      setSets(remainingSets);

      if (activeSetId === set.externalId) {
        const fallbackActiveSet =
          response.activeSetExternalId ??
          remainingSets.find((currentSet) => currentSet.source === 'ReadyMade')?.externalId ??
          remainingSets[0]?.externalId ??
          null;

        setActiveSetId(fallbackActiveSet);

        if (fallbackActiveSet && fallbackActiveSet !== response.activeSetExternalId) {
          await saveActiveSet(fallbackActiveSet);
        }
      }
    } catch (error) {
      console.warn(`Unable to delete ${set.title}.`, error);
      setActiveSetError(getApiErrorMessage(error, `Unable to delete ${set.title}.`));
    } finally {
      setPendingAction(null);
    }
  }

  function handleMenuAction(action: SetMenuAction, set: SetCardData) {
    if (pendingAction) return;

    if (action === 'setActive') {
      void activateSet(set);
      return;
    }

    if (action === 'resetProgress') {
      confirmResetSetProgress(set);
      return;
    }

    if (action === 'rename') {
      openRenameModal(set);
      return;
    }

    confirmDeleteSet(set);
  }

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      void loadSets({ isCancelled: () => cancelled });

      return () => {
        cancelled = true;
      };
    }, [loadSets]),
  );

  return (
    <View style={styles.root}>
      <Screen contentContainerStyle={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{headerTitle}</Text>
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
          onSegmentChange={(segment) => {
            setOpenMenu(null);
            setActiveSegment(segment);
          }}
        />

        <View style={styles.cardList}>
          {activeSetError ? <Text style={styles.inlineError}>{activeSetError}</Text> : null}
          {isLoading ? <StateCard message="Loading your decks." title="Getting sets..." /> : null}
          {errorMessage ? (
            <StateCard
              actionLabel="Retry"
              message={errorMessage}
              title="Could not load sets."
              onAction={() => void loadSets()}
            />
          ) : null}
          {!isLoading && !errorMessage && setCards.length === 0 ? (
            <StateCard
              message={
                activeSegment === 'my-sets'
                  ? 'Create your first learning set.'
                  : 'No ready-made sets are available from the local API.'
              }
              title={activeSegment === 'my-sets' ? 'No custom sets yet' : 'No ready-made sets yet'}
            />
          ) : null}
          {!isLoading && !errorMessage
            ? setCards.map((set) => (
                <SetCard
                  key={set.id}
                  isMenuOpen={openMenu?.setId === set.id}
                  onMenuAction={handleMenuAction}
                  onMenuToggle={(selectedSet, event) => {
                    const { pageX, pageY } = event.nativeEvent;
                    setOpenMenu((currentMenu) =>
                      currentMenu?.setId === selectedSet.id
                        ? null
                        : { setId: selectedSet.id, x: pageX, y: pageY },
                    );
                  }}
                  onOpen={openSet}
                  set={set}
                />
              ))
            : null}
        </View>
      </Screen>

      <FloatingActionButton />
      <SetActionMenuModal
        left={actionMenuPosition.left}
        set={openMenuSet}
        top={actionMenuPosition.top}
        visible={openMenuSet !== null}
        onClose={() => setOpenMenu(null)}
        onSelect={handleMenuAction}
      />
      <RenameSetModal
        errorMessage={renameError}
        isSubmitting={pendingAction?.action === 'rename'}
        setName={renameValue}
        visible={renameTarget !== null}
        onChangeName={setRenameValue}
        onClose={closeRenameModal}
        onSubmit={() => void submitRename()}
      />
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
  isMenuOpen: boolean;
  onMenuAction: (action: SetMenuAction, set: SetCardData) => void;
  onMenuToggle: (set: SetCardData, event: GestureResponderEvent) => void;
  onOpen: (set: SetCardData) => void;
  set: SetCardData;
};

function SetCard({ isMenuOpen, onMenuAction, onMenuToggle, onOpen, set }: SetCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(set)}
      style={({ pressed }) => [
        styles.setCard,
        set.isActive && styles.setCardActive,
        isMenuOpen && styles.setCardMenuOpen,
        pressed && styles.pressed,
      ]}>
      <LinearGradient
        colors={set.tileColors}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.iconTile}>
        <LineIcon color="#FFFFFF" name={set.icon} size={44} />
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
            <ThreeDotButton
              expanded={isMenuOpen}
              onPress={(event) => {
                event.stopPropagation();
                onMenuToggle(set, event);
              }}
            />
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

type ThreeDotButtonProps = {
  expanded: boolean;
  onPress: (event: GestureResponderEvent) => void;
};

function ThreeDotButton({ expanded, onPress }: ThreeDotButtonProps) {
  return (
    <Pressable
      accessibilityLabel="Set actions"
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}>
      <View style={styles.dot} />
      <View style={styles.dot} />
      <View style={styles.dot} />
    </Pressable>
  );
}

type SetActionMenuProps = {
  left: number;
  onClose: () => void;
  onSelect: (action: SetMenuAction, set: SetCardData) => void;
  set: SetCardData | null;
  top: number;
  visible: boolean;
};

function SetActionMenuModal({ left, onClose, onSelect, set, top, visible }: SetActionMenuProps) {
  if (!set) return null;

  const actions: Array<{ action: SetMenuAction; label: string }> = [
    { action: 'setActive', label: 'Set active' },
    { action: 'resetProgress', label: 'Reset set progress' },
  ];

  if (set.source === 'User') {
    actions.push({ action: 'rename', label: 'Rename set' });
    actions.push({ action: 'delete', label: 'Delete set' });
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable style={styles.menuModalOverlay} onPress={onClose}>
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
          }}
          style={[styles.actionMenu, { left, top }]}>
          {actions.map((item, index) => (
            <Pressable
              accessibilityRole="menuitem"
              key={item.action}
              onPress={(event) => {
                event.stopPropagation();
                onSelect(item.action, set);
              }}
              style={({ pressed }) => [
                styles.actionMenuRow,
                pressed && styles.actionMenuRowPressed,
                index < actions.length - 1 && styles.actionMenuRowDivider,
              ]}>
              <Text style={styles.actionMenuText}>{item.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
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

type RenameSetModalProps = {
  errorMessage: string | null;
  isSubmitting: boolean;
  setName: string;
  visible: boolean;
  onChangeName: (name: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

function RenameSetModal({
  errorMessage,
  isSubmitting,
  setName,
  visible,
  onChangeName,
  onClose,
  onSubmit,
}: RenameSetModalProps) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={styles.renameModal}
          onPress={(event) => {
            event.stopPropagation();
          }}>
          <Text style={styles.renameTitle}>Rename set</Text>
          <TextInput
            autoCapitalize="sentences"
            autoFocus
            editable={!isSubmitting}
            onChangeText={onChangeName}
            placeholder="Set name"
            placeholderTextColor="#8C948E"
            selectTextOnFocus
            style={styles.renameInput}
            value={setName}
          />
          {errorMessage ? <Text style={styles.renameError}>{errorMessage}</Text> : null}

          <View style={styles.renameActions}>
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={onClose}
              style={({ pressed }) => [
                styles.renameButton,
                styles.renameButtonSecondary,
                pressed && !isSubmitting && styles.pressed,
              ]}>
              <Text style={styles.renameButtonSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.renameButton,
                styles.renameButtonPrimary,
                isSubmitting && styles.disabledButton,
                pressed && !isSubmitting && styles.pressed,
              ]}>
              <Text style={styles.renameButtonPrimaryText}>
                {isSubmitting ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type StateCardProps = {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  title: string;
};

function StateCard({ actionLabel, message, onAction, title }: StateCardProps) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
          <Text style={styles.retryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
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
    id: set.externalId,
    internalId: set.id,
    isActive: activeSetId === set.externalId,
    progress,
    readonly: set.source === 'ReadyMade',
    source: set.source,
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

function getActionMenuPosition(
  menu: OpenSetMenu,
  set: SetCardData | null,
  windowSize: { width: number; height: number },
) {
  if (!menu) return { left: 0, top: 0 };

  const actionCount = set?.source === 'User' ? 4 : 2;
  const menuHeight = actionCount * ACTION_MENU_ROW_HEIGHT;
  const maxLeft = Math.max(16, windowSize.width - ACTION_MENU_WIDTH - 16);
  const maxTop = Math.max(16, windowSize.height - menuHeight - 16);

  return {
    left: Math.min(Math.max(16, menu.x - ACTION_MENU_WIDTH + 12), maxLeft),
    top: Math.min(Math.max(16, menu.y + 12), maxTop),
  };
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
    fontSize: 34,
    fontFamily: theme.typography.fontFamilyHeavy,
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
    flexShrink: 1,
    fontSize: 16,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0,
    lineHeight: 23,
  },
  cardList: {
    gap: 14,
    marginTop: 26,
  },
  setCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 118,
    overflow: 'visible',
    paddingBottom: 14,
    paddingLeft: 14,
    paddingRight: 14,
    paddingTop: 14,
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
  setCardMenuOpen: {
    zIndex: 30,
    elevation: 12,
  },
  iconTile: {
    alignItems: 'center',
    borderRadius: 17,
    height: 78,
    justifyContent: 'center',
    width: 78,
  },
  setContent: {
    flex: 1,
    gap: 14,
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
    fontSize: 18,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0,
    lineHeight: 23,
  },
  cardCount: {
    color: '#657086',
    fontSize: 16,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 21,
    marginTop: 6,
  },
  cardActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minHeight: 32,
    position: 'relative',
    zIndex: 35,
  },
  activePill: {
    alignItems: 'center',
    backgroundColor: '#EAF7EF',
    borderColor: 'rgba(47,143,89,0.1)',
    borderRadius: 13,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  activePillText: {
    color: theme.colors.accentStrong,
    fontSize: 14,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 18,
  },
  moreButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    gap: 4,
    height: 40,
    justifyContent: 'center',
    marginRight: -7,
    width: 28,
  },
  actionMenu: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(26,30,27,0.1)',
    borderRadius: 15,
    borderWidth: 1,
    minWidth: 188,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#2A261E',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    width: ACTION_MENU_WIDTH,
    zIndex: 200,
    elevation: 24,
  },
  actionMenuRow: {
    backgroundColor: '#FFFFFF',
    height: 58,
    justifyContent: 'center',
    paddingHorizontal: 19,
  },
  actionMenuRowPressed: {
    backgroundColor: '#F2F5EF',
  },
  actionMenuRowDivider: {
    borderBottomColor: 'rgba(20,21,24,0.08)',
    borderBottomWidth: 1,
  },
  actionMenuText: {
    color: '#161815',
    fontSize: 14,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
    lineHeight: 19,
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
    gap: 10,
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
    fontSize: 16,
    fontFamily: theme.typography.fontFamilySemiBold,
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
    fontSize: 21,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    lineHeight: 25,
  },
  stateMessage: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 22,
    marginTop: 8,
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accentStrong,
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 18,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
  },
  inlineError: {
    color: theme.colors.reviewRed,
    fontSize: 13,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 18,
    marginHorizontal: 2,
  },
  menuModalOverlay: {
    backgroundColor: 'transparent',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(20,24,21,0.28)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  renameModal: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    maxWidth: 390,
    padding: 22,
    shadowColor: '#2A261E',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.2,
    shadowRadius: 48,
    width: '100%',
    elevation: 18,
  },
  renameTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 27,
  },
  renameInput: {
    backgroundColor: '#F7F8F5',
    borderColor: 'rgba(36,122,77,0.16)',
    borderRadius: 16,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 17,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    height: 52,
    marginTop: 18,
    paddingHorizontal: 15,
  },
  renameError: {
    color: theme.colors.reviewRed,
    fontSize: 13,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 18,
    marginTop: 10,
  },
  renameActions: {
    flexDirection: 'row',
    gap: 11,
    marginTop: 20,
  },
  renameButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    flex: 1,
    height: 50,
    justifyContent: 'center',
  },
  renameButtonPrimary: {
    backgroundColor: theme.colors.accentStrong,
  },
  renameButtonSecondary: {
    backgroundColor: '#F7F8F5',
    borderColor: 'rgba(20,21,24,0.08)',
    borderWidth: 1,
  },
  renameButtonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
  },
  renameButtonSecondaryText: {
    color: theme.colors.text,
    fontSize: 15,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
  },
  disabledButton: {
    opacity: 0.58,
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
