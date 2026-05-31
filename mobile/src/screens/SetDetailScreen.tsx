import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { IconSymbol } from '@/src/components/IconSymbol';
import { Screen } from '@/src/components/Screen';
import {
  AppApiError,
  addCard,
  getAppState,
  getSet,
  renameSet,
  resetSetProgress,
  saveActiveSet,
  type ApiFlashcard,
  type ApiSetDetail,
} from '@/src/services/appApi';
import { isCardLearned } from '@/src/services/learningSession';
import { theme } from '@/src/theme/theme';

type SetDetailParams = {
  externalSetId?: string | string[];
};

type CardFilter = 'all' | 'new' | 'learning' | 'learned' | 'difficult';

type SetProgressCounts = {
  difficultCards: number;
  learnedCards: number;
  learningCards: number;
  newCards: number;
  totalCards: number;
};

type TabPath = '/' | '/sets' | '/stats' | '/explore';

const cardFilters: CardFilter[] = ['all', 'new', 'learning', 'learned', 'difficult'];

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
  const [isResettingProgress, setIsResettingProgress] = useState(false);
  const [isAddCardModalVisible, setIsAddCardModalVisible] = useState(false);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [addCardError, setAddCardError] = useState<string | null>(null);
  const [isRenamingSet, setIsRenamingSet] = useState(false);
  const [isSubmittingRename, setIsSubmittingRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const lastTitleTapAt = useRef(0);
  const renameInFlight = useRef(false);
  const counts = useMemo(() => getSetProgressCounts(set), [set]);
  const learnedPercent =
    counts.totalCards > 0 ? Math.round((counts.learnedCards / counts.totalCards) * 100) : 0;
  const filteredCards = useMemo(
    () => getFilteredCards(set?.flashcards ?? [], searchQuery, cardFilter),
    [cardFilter, searchQuery, set?.flashcards],
  );
  const isActive = Boolean(set && activeSetId === set.externalId);
  const isReadonly = set?.source === 'ReadyMade';

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

    const previousActiveSetId = activeSetId;
    setIsSavingActive(true);
    setErrorMessage(null);
    setActiveSetId(set.externalId);

    try {
      const response = await saveActiveSet(set.externalId);
      setActiveSetId(response.activeSetExternalId);
      return true;
    } catch (error) {
      console.warn('Unable to set active set.', error);
      setActiveSetId(previousActiveSetId);
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

  function toggleSearch() {
    setShowSearch((currentValue) => {
      if (currentValue) setSearchQuery('');
      return !currentValue;
    });
  }

  function cycleCardFilter() {
    setCardFilter((currentFilter) => {
      const currentIndex = cardFilters.indexOf(currentFilter);
      return cardFilters[(currentIndex + 1) % cardFilters.length];
    });
  }

  function showCardEditingMessage() {
    Alert.alert(
      'Card editing',
      isReadonly
        ? 'Ready-made sets are read-only.'
        : 'Card editing is not available in the mobile app yet.',
    );
  }

  function openAddCardModal() {
    setAddCardError(null);
    setIsAddCardModalVisible(true);
  }

  function closeAddCardModal() {
    if (isAddingCard) return;

    setIsAddCardModalVisible(false);
    setAddCardError(null);
  }

  async function submitAddCard(input: { front: string; back: string }) {
    if (!set || isReadonly || isAddingCard) return;

    setIsAddingCard(true);
    setAddCardError(null);

    try {
      await addCard(set.externalId, input);
      const refreshedSet = await getSet(set.externalId);
      setSet(refreshedSet);
      setIsAddCardModalVisible(false);
    } catch (error) {
      console.warn(`Unable to add card to ${set.name}.`, error);
      setAddCardError(getApiErrorMessage(error, `Unable to add a card to ${set.name}.`));
    } finally {
      setIsAddingCard(false);
    }
  }

  function showSetOptions() {
    if (!set) return;

    Alert.alert(
      set.name,
      isReadonly ? 'Ready-made set' : isActive ? 'Active custom set' : 'Custom set',
    );
  }

  function handleTitlePress() {
    if (!set || isRenamingSet) return;

    const now = Date.now();
    const isDoubleTap = now - lastTitleTapAt.current < 360;
    lastTitleTapAt.current = now;

    if (!isDoubleTap) return;

    if (isReadonly) {
      Alert.alert('Rename set', 'Ready-made sets are read-only.');
      return;
    }

    setErrorMessage(null);
    setRenameValue(set.name);
    setIsRenamingSet(true);
  }

  async function submitRename() {
    if (!set || !isRenamingSet || renameInFlight.current) return;

    const nextName = renameValue.trim();

    if (nextName.length === 0) {
      setErrorMessage('Set name is required.');
      return;
    }

    if (nextName === set.name) {
      setIsRenamingSet(false);
      return;
    }

    renameInFlight.current = true;
    setIsSubmittingRename(true);
    setErrorMessage(null);

    try {
      const renamedSet = await renameSet(set.externalId, nextName);
      setSet(renamedSet);
      setIsRenamingSet(false);
    } catch (error) {
      console.warn(`Unable to rename ${set.name}.`, error);
      setErrorMessage(getApiErrorMessage(error, `Unable to rename ${set.name}.`));
    } finally {
      renameInFlight.current = false;
      setIsSubmittingRename(false);
    }
  }

  function confirmResetProgress() {
    if (!set || isResettingProgress) return;

    Alert.alert(
      'Reset progress?',
      `This will reset learning progress for ${set.name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            void resetProgress();
          },
        },
      ],
    );
  }

  async function resetProgress() {
    if (!set || isResettingProgress) return;

    setIsResettingProgress(true);
    setErrorMessage(null);

    try {
      await resetSetProgress(set.externalId);
      const refreshedSet = await getSet(set.externalId);
      setSet(refreshedSet);
    } catch (error) {
      console.warn(`Unable to reset progress for ${set.name}.`, error);
      setErrorMessage(getApiErrorMessage(error, `Unable to reset progress for ${set.name}.`));
    } finally {
      setIsResettingProgress(false);
    }
  }

  return (
    <View style={styles.viewport}>
      <View style={styles.appFrame}>
        <Screen contentContainerStyle={styles.screen}>
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Back to sets"
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <IconSymbol
                color={theme.colors.accentStrong}
                name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                size={25}
              />
            </Pressable>

            <View style={styles.headerTitleBlock}>
              {isRenamingSet ? (
                <TextInput
                  autoCapitalize="sentences"
                  autoFocus
                  editable={!isSubmittingRename}
                  onBlur={() => void submitRename()}
                  onChangeText={setRenameValue}
                  onSubmitEditing={() => void submitRename()}
                  returnKeyType="done"
                  selectTextOnFocus
                  style={styles.headerTitleInput}
                  value={renameValue}
                />
              ) : (
                <Pressable
                  accessibilityHint="Double tap to rename this set"
                  accessibilityRole="button"
                  onPress={handleTitlePress}
                  style={styles.headerTitlePressable}>
                  <Text numberOfLines={1} style={styles.headerTitle}>
                    {set?.name ?? 'Set Detail'}
                  </Text>
                </Pressable>
              )}
              <Text style={styles.headerSubtitle}>
                {isSubmittingRename
                  ? 'Saving name...'
                  : set
                    ? `${counts.totalCards} cards`
                    : isLoading
                      ? 'Loading cards'
                      : 'Cards'}
              </Text>
            </View>

            <Pressable
              accessibilityLabel="Set options"
              accessibilityRole="button"
              onPress={showSetOptions}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <IconSymbol
                color={theme.colors.accentStrong}
                name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
                size={25}
              />
            </Pressable>
          </View>

          {isLoading ? (
            <StateCard body="Loading cards and progress." title="Opening set..." />
          ) : errorMessage && !set ? (
            <StateCard body={errorMessage} title="Could not open set." />
          ) : set ? (
            <>
              <ProgressSummaryCard counts={counts} learnedPercent={learnedPercent} />

              <View style={styles.actionGrid}>
                <View style={styles.actionRow}>
                  <ActionButton
                    disabled={isSavingActive}
                    icon={
                      isActive
                        ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
                        : undefined
                    }
                    title={isActive ? 'Active set' : isSavingActive ? 'Setting active...' : 'Set as Active'}
                    variant="primary"
                    onPress={() => {
                      if (!isActive) void activateCurrentSet();
                    }}
                  />
                  <ActionButton
                    icon={{
                      ios: 'rectangle.stack.fill',
                      android: 'library_books',
                      web: 'library_books',
                    }}
                    title="Practice Cards"
                    variant="soft"
                    onPress={() => void startSession('/practice-cards')}
                  />
                </View>
                <View style={styles.actionRow}>
                  <ActionButton
                    compact
                    icon={{
                      ios: 'plus.circle',
                      android: 'add_circle_outline',
                      web: 'add_circle_outline',
                    }}
                    title="Add Card"
                    variant="outline"
                    onPress={openAddCardModal}
                  />
                  <ActionButton
                    compact
                    disabled={isResettingProgress}
                    icon={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
                    title={isResettingProgress ? 'Resetting' : 'Reset Progress'}
                    variant="outline"
                    onPress={confirmResetProgress}
                  />
                </View>
              </View>

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <View style={styles.cardsSection}>
                <View style={styles.cardsHeader}>
                  <Text style={styles.sectionTitle}>Cards</Text>
                  <View style={styles.cardTools}>
                    <IconButton
                      active={showSearch}
                      accessibilityLabel="Search cards"
                      icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                      onPress={toggleSearch}
                    />
                    <IconButton
                      active={cardFilter !== 'all'}
                      accessibilityLabel={`Filter cards: ${getFilterLabel(cardFilter)}`}
                      icon={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }}
                      onPress={cycleCardFilter}
                    />
                  </View>
                </View>

                {showSearch ? (
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                    onChangeText={setSearchQuery}
                    placeholder="Search cards"
                    placeholderTextColor="#8A948C"
                    style={styles.searchInput}
                    value={searchQuery}
                  />
                ) : null}

                {cardFilter !== 'all' ? (
                  <Text style={styles.filterLabel}>Showing {getFilterLabel(cardFilter)} cards</Text>
                ) : null}

                <View style={styles.cardList}>
                  {filteredCards.length > 0 ? (
                    filteredCards.map((card) => (
                      <FlashcardRow card={card} key={card.id} onEdit={showCardEditingMessage} />
                    ))
                  ) : (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyTitle}>No cards found</Text>
                      <Text style={styles.emptyBody}>Try another search or filter.</Text>
                    </View>
                  )}
                </View>
              </View>
            </>
          ) : null}
        </Screen>

        <SetDetailTabBar />
      </View>

      <AddCardModal
        errorMessage={addCardError}
        isReadOnly={isReadonly}
        isSubmitting={isAddingCard}
        setName={set?.name ?? 'This set'}
        visible={isAddCardModalVisible}
        onClose={closeAddCardModal}
        onSubmit={(input) => void submitAddCard(input)}
      />
    </View>
  );
}

type ProgressSummaryCardProps = {
  counts: SetProgressCounts;
  learnedPercent: number;
};

function ProgressSummaryCard({ counts, learnedPercent }: ProgressSummaryCardProps) {
  return (
    <LinearGradient
      colors={['#36A96A', '#279158', '#23834F']}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={styles.progressCard}>
      <GlobeMark />
      <View style={styles.progressCardTop}>
        <CircularProgress value={learnedPercent} />
        <View style={styles.progressCopy}>
          <Text style={styles.progressTitle}>Set Progress</Text>
          <Text style={styles.progressSubtitle}>{getProgressMessage(learnedPercent)}</Text>
        </View>
      </View>

      <View style={styles.progressDivider} />

      <View style={styles.statsRow}>
        <StatItem
          color="#98E68B"
          count={counts.learnedCards}
          icon={{ ios: 'checkmark.circle', android: 'check_circle_outline', web: 'check_circle_outline' }}
          label="Learned"
        />
        <StatItem
          color="#D5E63E"
          count={counts.learningCards}
          icon={{ ios: 'arrow.clockwise.circle', android: 'autorenew', web: 'autorenew' }}
          label="Learning"
        />
        <StatItem
          color="#BFE9D3"
          count={counts.newCards}
          icon={{
            ios: 'circle.circle',
            android: 'radio_button_checked',
            web: 'radio_button_checked',
          }}
          label="New"
        />
        <StatItem
          color="#DBEA37"
          count={counts.difficultCards}
          icon={{ ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' }}
          label="Difficult"
        />
      </View>
    </LinearGradient>
  );
}

type CircularProgressProps = {
  value: number;
};

function CircularProgress({ value }: CircularProgressProps) {
  const clampedValue = Math.max(0, Math.min(value, 100));
  const gapRotation = `${Math.round(clampedValue * 3.6) + 34}deg`;

  return (
    <View style={styles.circularProgress}>
      <View style={styles.circularTrack} />
      <View style={[styles.circularGap, { transform: [{ rotate: gapRotation }] }]} />
      <Text style={styles.circularText}>{clampedValue}%</Text>
    </View>
  );
}

type StatItemProps = {
  color: string;
  count: number;
  icon: Parameters<typeof IconSymbol>[0]['name'];
  label: string;
};

function StatItem({ color, count, icon, label }: StatItemProps) {
  return (
    <View style={styles.statItem}>
      <View style={styles.statValueRow}>
        <IconSymbol color={color} name={icon} size={18} />
        <Text style={styles.statValue}>{count}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

type ActionButtonProps = {
  compact?: boolean;
  disabled?: boolean;
  icon?: Parameters<typeof IconSymbol>[0]['name'];
  onPress: () => void;
  title: string;
  variant: 'primary' | 'soft' | 'outline';
};

function ActionButton({ compact, disabled, icon, onPress, title, variant }: ActionButtonProps) {
  const isPrimary = variant === 'primary';
  const isSoft = variant === 'soft';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        compact && styles.actionButtonCompact,
        isPrimary && styles.actionButtonPrimary,
        isSoft && styles.actionButtonSoft,
        variant === 'outline' && styles.actionButtonOutline,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {icon ? (
        <IconSymbol
          color={isPrimary ? '#FFFFFF' : theme.colors.accentStrong}
          name={icon}
          size={compact ? 18 : 22}
        />
      ) : null}
      <Text
        numberOfLines={1}
        style={[
          styles.actionButtonText,
          compact && styles.actionButtonTextCompact,
          isPrimary && styles.actionButtonTextPrimary,
        ]}>
        {title}
      </Text>
    </Pressable>
  );
}

type IconButtonProps = {
  accessibilityLabel: string;
  active?: boolean;
  icon: Parameters<typeof IconSymbol>[0]['name'];
  onPress: () => void;
};

function IconButton({ accessibilityLabel, active, icon, onPress }: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={active ? { selected: true } : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolButton,
        active && styles.toolButtonActive,
        pressed && styles.pressed,
      ]}>
      <IconSymbol color={theme.colors.accentStrong} name={icon} size={24} />
    </Pressable>
  );
}

type AddCardModalProps = {
  errorMessage: string | null;
  isReadOnly: boolean;
  isSubmitting: boolean;
  setName: string;
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: { front: string; back: string }) => void;
};

function AddCardModal({
  errorMessage,
  isReadOnly,
  isSubmitting,
  onClose,
  onSubmit,
  setName,
  visible,
}: AddCardModalProps) {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const canSave = front.trim().length > 0 && back.trim().length > 0 && !isReadOnly && !isSubmitting;

  useEffect(() => {
    if (!visible) {
      setFront('');
      setBack('');
    }
  }, [visible]);

  function submit() {
    if (!canSave) return;
    onSubmit({ front: front.trim(), back: back.trim() });
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.addCardKeyboardView}>
        <Pressable accessibilityRole="button" style={styles.addCardOverlay} onPress={onClose}>
          <BlurView intensity={18} pointerEvents="none" style={styles.addCardBlur} tint="dark" />
          <Pressable
            accessibilityRole="none"
            onPress={(event) => {
              event.stopPropagation();
            }}
            style={styles.addCardModal}>
            <View style={styles.addCardHeader}>
              <View style={styles.addCardTitleBlock}>
                <Text style={styles.addCardTitle}>Add card</Text>
                <Text style={styles.addCardCopy}>
                  {isReadOnly ? `${setName} is read-only.` : 'Create a clear front and back for this set.'}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close add card"
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={onClose}
                style={({ pressed }) => [
                  styles.addCardCloseButton,
                  pressed && !isSubmitting && styles.pressed,
                  isSubmitting && styles.disabled,
                ]}>
                <IconSymbol color="#63706A" name={{ ios: 'xmark', android: 'close', web: 'close' }} size={20} />
              </Pressable>
            </View>

            <Text style={styles.addCardLabel}>Front</Text>
            <TextInput
              autoCapitalize="sentences"
              editable={!isReadOnly && !isSubmitting}
              multiline
              onChangeText={setFront}
              placeholderTextColor="#8D9892"
              style={[styles.addCardInput, (isReadOnly || isSubmitting) && styles.addCardInputDisabled]}
              textAlignVertical="top"
              value={front}
            />

            <Text style={styles.addCardLabel}>Back</Text>
            <TextInput
              autoCapitalize="sentences"
              editable={!isReadOnly && !isSubmitting}
              multiline
              onChangeText={setBack}
              placeholderTextColor="#8D9892"
              style={[styles.addCardInput, (isReadOnly || isSubmitting) && styles.addCardInputDisabled]}
              textAlignVertical="top"
              value={back}
            />

            {errorMessage ? <Text style={styles.addCardError}>{errorMessage}</Text> : null}

            <View style={styles.addCardActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={onClose}
                style={({ pressed }) => [
                  styles.addCardActionButton,
                  styles.addCardCancelButton,
                  pressed && !isSubmitting && styles.pressed,
                  isSubmitting && styles.disabled,
                ]}>
                <Text style={styles.addCardCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSave }}
                disabled={!canSave}
                onPress={submit}
                style={({ pressed }) => [
                  styles.addCardActionButton,
                  styles.addCardSaveButton,
                  !canSave && styles.addCardSaveButtonDisabled,
                  pressed && canSave && styles.pressed,
                ]}>
                <Text style={styles.addCardSaveText}>{isSubmitting ? 'Saving...' : 'Save card'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type FlashcardRowProps = {
  card: ApiFlashcard;
  onEdit: () => void;
};

function FlashcardRow({ card, onEdit }: FlashcardRowProps) {
  return (
    <View style={styles.flashcardRow}>
      <Text numberOfLines={2} style={styles.cardFront}>
        {card.front}
      </Text>
      <Text numberOfLines={2} style={styles.cardBack}>
        {card.back}
      </Text>
      <Pressable
        accessibilityLabel={`Edit card ${card.front}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onEdit}
        style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
        <IconSymbol
          color="#6C947A"
          name={{ ios: 'pencil', android: 'edit', web: 'edit' }}
          size={18}
        />
      </Pressable>
    </View>
  );
}

function GlobeMark() {
  return (
    <View style={styles.globeMark}>
      <View style={styles.globeCircle} />
      <View style={styles.globeMeridian} />
      <View style={[styles.globeLatitude, styles.globeLatitudeTop]} />
      <View style={[styles.globeLatitude, styles.globeLatitudeBottom]} />
    </View>
  );
}

function SetDetailTabBar() {
  const items: Array<{
    active?: boolean;
    icon: Parameters<typeof IconSymbol>[0]['name'];
    label: string;
    path: TabPath;
  }> = [
    { label: 'Home', path: '/', icon: { ios: 'house', android: 'home', web: 'home' } },
    {
      active: true,
      label: 'My Sets',
      path: '/sets',
      icon: { ios: 'square.grid.2x2.fill', android: 'grid_view', web: 'grid_view' },
    },
    { label: 'Stats', path: '/stats', icon: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' } },
    { label: 'Profile', path: '/explore', icon: { ios: 'person', android: 'person', web: 'person' } },
  ];

  return (
    <View style={styles.tabBar}>
      {items.map((item) => {
        const color = item.active ? theme.colors.accentStrong : theme.colors.textSubtle;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={item.active ? { selected: true } : undefined}
            key={item.label}
            onPress={() => router.replace(item.path)}
            style={({ pressed }) => [
              styles.tabButton,
              item.active && styles.tabButtonActive,
              pressed && styles.pressed,
            ]}>
            <IconSymbol color={color} name={item.icon} size={19} />
            <Text numberOfLines={1} style={[styles.tabLabel, { color }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/sets')}
        style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}>
        <Text style={styles.stateButtonText}>Back to Sets</Text>
      </Pressable>
    </View>
  );
}

function getSetProgressCounts(set: ApiSetDetail | null): SetProgressCounts {
  if (!set) {
    return {
      difficultCards: 0,
      learnedCards: 0,
      learningCards: 0,
      newCards: 0,
      totalCards: 0,
    };
  }

  if (set.flashcards.length === 0) {
    return {
      difficultCards: set.progressSummary.difficultCount,
      learnedCards: set.progressSummary.learnedCount,
      learningCards: set.progressSummary.learningCount,
      newCards: set.progressSummary.newCount,
      totalCards: set.progressSummary.cardCount,
    };
  }

  const learnedCards = set.flashcards.filter((card) => getCardStatus(card) === 'learned').length;
  const difficultCards = set.flashcards.filter((card) => getCardStatus(card) === 'difficult').length;
  const learningCards = set.flashcards.filter((card) => getCardStatus(card) === 'learning').length;
  const newCards = set.flashcards.filter((card) => getCardStatus(card) === 'new').length;

  return {
    difficultCards,
    learnedCards,
    learningCards,
    newCards,
    totalCards: set.flashcards.length,
  };
}

function getFilteredCards(cards: ApiFlashcard[], query: string, filter: CardFilter) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return cards.filter((card) => {
    const matchesFilter = filter === 'all' || getCardStatus(card) === filter;
    const matchesSearch =
      normalizedQuery.length === 0 ||
      card.front.toLocaleLowerCase().includes(normalizedQuery) ||
      card.back.toLocaleLowerCase().includes(normalizedQuery);

    return matchesFilter && matchesSearch;
  });
}

function getCardStatus(card: ApiFlashcard): Exclude<CardFilter, 'all'> {
  if (isCardLearned(card)) return 'learned';
  if (card.learningStage === -1) return 'difficult';
  if (card.learningStage > 0) return 'learning';

  return 'new';
}

function getFilterLabel(filter: CardFilter) {
  if (filter === 'all') return 'All';
  if (filter === 'new') return 'New';
  if (filter === 'learning') return 'Learning';
  if (filter === 'learned') return 'Learned';

  return 'Difficult';
}

function getProgressMessage(progress: number) {
  if (progress >= 100) return 'Set mastered. Nice work!';
  if (progress > 0) return "You're making great progress!";

  return 'Start with a quick lesson.';
}

function getApiErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof AppApiError) return error.message;

  return fallbackMessage;
}

const styles = StyleSheet.create({
  viewport: {
    alignItems: 'center',
    backgroundColor: theme.colors.appBackdrop,
    flex: 1,
  },
  appFrame: {
    backgroundColor: theme.colors.background,
    flex: 1,
    maxWidth: 430,
    overflow: 'hidden',
    width: '100%',
  },
  screen: {
    gap: 15,
    paddingBottom: 142,
    paddingTop: 12,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerTitleBlock: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
    minWidth: 0,
  },
  headerTitlePressable: {
    alignItems: 'center',
    maxWidth: '100%',
    minHeight: 28,
    minWidth: 0,
  },
  headerTitle: {
    color: '#0D5631',
    fontSize: 22,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    lineHeight: 27,
    maxWidth: '100%',
    textAlign: 'center',
  },
  headerTitleInput: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(36,122,77,0.18)',
    borderRadius: 10,
    borderWidth: 1,
    color: '#0D5631',
    fontSize: 20,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    height: 36,
    lineHeight: 25,
    maxWidth: '100%',
    minWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 0,
    textAlign: 'center',
  },
  headerSubtitle: {
    color: '#6D8476',
    fontSize: 14,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 18,
    marginTop: 2,
  },
  progressCard: {
    borderRadius: 13,
    minHeight: 170,
    overflow: 'hidden',
    paddingBottom: 18,
    paddingHorizontal: 18,
    paddingTop: 18,
    shadowColor: '#1C6F45',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
    elevation: 7,
  },
  progressCardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    minHeight: 78,
  },
  progressCopy: {
    flex: 1,
    minWidth: 0,
  },
  progressTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0,
    lineHeight: 22,
  },
  progressSubtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontFamily: theme.typography.fontFamilyMedium,
    fontWeight: theme.typography.weights.medium,
    lineHeight: 19,
    marginTop: 7,
  },
  circularProgress: {
    alignItems: 'center',
    height: 78,
    justifyContent: 'center',
    position: 'relative',
    width: 78,
  },
  circularTrack: {
    borderColor: '#FFFFFF',
    borderRadius: 39,
    borderWidth: 8,
    height: 78,
    opacity: 0.96,
    position: 'absolute',
    width: 78,
  },
  circularGap: {
    backgroundColor: '#2C985D',
    borderRadius: 18,
    height: 38,
    position: 'absolute',
    right: 5,
    top: 2,
    width: 26,
  },
  circularText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    lineHeight: 22,
  },
  progressDivider: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    height: StyleSheet.hairlineWidth,
    marginTop: 17,
  },
  statsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 15,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  statValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 20,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontFamily: theme.typography.fontFamilyMedium,
    fontWeight: theme.typography.weights.medium,
    lineHeight: 16,
    marginTop: 2,
  },
  globeMark: {
    height: 88,
    opacity: 0.15,
    position: 'absolute',
    right: -5,
    top: 10,
    width: 88,
  },
  globeCircle: {
    borderColor: '#FFFFFF',
    borderRadius: 44,
    borderWidth: 4,
    height: 88,
    position: 'absolute',
    width: 88,
  },
  globeMeridian: {
    borderColor: '#FFFFFF',
    borderRadius: 44,
    borderWidth: 3,
    height: 88,
    left: 27,
    position: 'absolute',
    width: 34,
  },
  globeLatitude: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.pill,
    height: 3,
    left: 10,
    position: 'absolute',
    width: 68,
  },
  globeLatitudeTop: {
    top: 29,
  },
  globeLatitudeBottom: {
    top: 57,
  },
  actionGrid: {
    gap: 13,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 13,
    width: '100%',
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    height: 56,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 10,
  },
  actionButtonCompact: {
    height: 38,
  },
  actionButtonPrimary: {
    backgroundColor: theme.colors.accent,
    shadowColor: '#247A4D',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 5,
  },
  actionButtonSoft: {
    backgroundColor: '#EEF8F3',
    borderColor: 'rgba(36,122,77,0.11)',
    borderWidth: 1,
  },
  actionButtonOutline: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(23,67,43,0.12)',
    borderWidth: 1,
  },
  actionButtonText: {
    color: theme.colors.accentStrong,
    flexShrink: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0,
    lineHeight: 18,
  },
  actionButtonTextCompact: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
  },
  actionButtonTextPrimary: {
    color: '#FFFFFF',
  },
  errorText: {
    color: theme.colors.reviewRed,
    fontSize: 13,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 18,
    textAlign: 'center',
  },
  cardsSection: {
    gap: 10,
    marginTop: 4,
  },
  cardsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 38,
  },
  sectionTitle: {
    color: '#0D5631',
    fontSize: 19,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    lineHeight: 24,
  },
  cardTools: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  toolButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  toolButtonActive: {
    backgroundColor: theme.colors.accentSoft,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(23,67,43,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 15,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    height: 42,
    paddingHorizontal: 14,
  },
  filterLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 16,
  },
  cardList: {
    gap: 2,
  },
  flashcardRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(21,50,34,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 15,
    paddingVertical: 10,
    shadowColor: '#1E3228',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  cardFront: {
    color: '#0E5935',
    flex: 1.08,
    fontSize: 15,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0,
    lineHeight: 20,
    minWidth: 0,
  },
  cardBack: {
    color: '#0E5935',
    flex: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0,
    lineHeight: 18,
    minWidth: 0,
  },
  editButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(21,50,34,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    padding: 18,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
    lineHeight: 21,
  },
  emptyBody: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 18,
    marginTop: 4,
  },
  tabBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(255,255,255,0.86)',
    borderRadius: 28,
    borderWidth: 1,
    bottom: 16,
    elevation: 12,
    flexDirection: 'row',
    height: 74,
    justifyContent: 'space-between',
    left: 16,
    padding: 8,
    position: 'absolute',
    right: 16,
    shadowColor: '#1E3228',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.15,
    shadowRadius: 42,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: 24,
    flex: 1,
    gap: 4,
    height: 58,
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#E7F7EE',
  },
  tabLabel: {
    fontSize: theme.typography.sizes.tab,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 1.1,
    lineHeight: 11,
    textTransform: 'uppercase',
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(21,50,34,0.08)',
    borderRadius: 13,
    borderWidth: 1,
    padding: 22,
    shadowColor: '#1E3228',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.07,
    shadowRadius: 28,
    elevation: 3,
  },
  stateTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 27,
  },
  stateBody: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 22,
    marginTop: 8,
  },
  stateButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    height: 46,
    justifyContent: 'center',
    marginTop: 17,
    paddingHorizontal: 18,
  },
  stateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
  },
  addCardKeyboardView: {
    flex: 1,
  },
  addCardOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(30,34,30,0.5)',
    flex: 1,
    justifyContent: 'center',
    padding: 10,
  },
  addCardBlur: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  addCardModal: {
    backgroundColor: '#FFFFFC',
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 28,
    borderWidth: 1,
    maxWidth: 390,
    paddingBottom: 22,
    paddingHorizontal: 23,
    paddingTop: 22,
    shadowColor: '#1F2C25',
    shadowOffset: { width: 0, height: 28 },
    shadowOpacity: 0.24,
    shadowRadius: 55,
    width: '100%',
    elevation: 22,
  },
  addCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  addCardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  addCardTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    lineHeight: 29,
  },
  addCardCopy: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 18,
    marginTop: 4,
  },
  addCardCloseButton: {
    alignItems: 'center',
    backgroundColor: '#F2F4EF',
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  addCardLabel: {
    color: '#535C56',
    fontSize: 11,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 1.7,
    lineHeight: 14,
    marginBottom: 8,
    marginLeft: 2,
    textTransform: 'uppercase',
  },
  addCardInput: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(36,122,77,0.18)',
    borderRadius: 20,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 16,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    height: 90,
    lineHeight: 22,
    marginBottom: 25,
    paddingHorizontal: 16,
    paddingTop: 13,
    shadowColor: '#247A4D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 8,
  },
  addCardInputDisabled: {
    backgroundColor: '#F8FAF6',
    color: theme.colors.textMuted,
  },
  addCardError: {
    color: theme.colors.reviewRed,
    fontSize: 13,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: -8,
  },
  addCardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  addCardActionButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    flex: 1,
    height: 49,
    justifyContent: 'center',
  },
  addCardCancelButton: {
    backgroundColor: '#EDEFEB',
  },
  addCardSaveButton: {
    backgroundColor: '#2F8F59',
  },
  addCardSaveButtonDisabled: {
    backgroundColor: '#C7D7CE',
  },
  addCardCancelText: {
    color: '#505B54',
    fontSize: 14,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
  },
  addCardSaveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
  },
  disabled: {
    opacity: 0.56,
  },
  pressed: {
    opacity: 0.76,
  },
});
