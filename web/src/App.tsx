import { useEffect, useMemo, useState } from "react";
import { AppChrome } from "./components/AppChrome";
import { defaultSets, type Flashcard, type FlashcardSet } from "./data/defaultSets";
import { HomeScreen } from "./screens/HomeScreen";
import { LearningScreen } from "./screens/LearningScreen";
import { QuickLessonCompletedScreen } from "./screens/QuickLessonCompletedScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SetDetailsScreen, ReadyMadeSetsScreen, SetsScreen } from "./screens/SetsScreen";
import { StatsScreen } from "./screens/StatsScreen";
import type { AppViewId, TabId } from "./theme/tokens";

type HomeRoute =
  | "dashboard"
  | "setDetails"
  | "quickLesson"
  | "quickLessonCompleted"
  | "continueLearning"
  | "learningCompleted"
  | "readyMade";
type SetsRoute = "list" | "details";

const QUICK_LESSON_CARD_LIMIT = 10;
const USER_SETS_STORAGE_KEY = "simple-flashcards:user-sets";
const LEARNING_PROGRESS_STORAGE_KEY = "simple-flashcards:learning-progress";
const STUDY_PROGRESS_STORAGE_KEY = "simple-flashcards:study-progress";
const DUPLICATE_SET_NAME_ERROR = "A set with this name already exists.";

type LearningSessionItem = {
  card: Flashcard;
  index: number;
  key: string;
};

type LearningProgress = Pick<
  Flashcard,
  "learningStage" | "reviewAgainStreak" | "isLearned" | "lastReviewedAt"
>;

type LearningProgressStore = Record<string, LearningProgress>;

type StudyProgress = {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  totalStudyDays: number;
};

type FlashcardDraft = Pick<Flashcard, "front" | "back"> & {
  learningStage?: unknown;
  reviewAgainStreak?: unknown;
  isLearned?: unknown;
  lastReviewedAt?: unknown;
};

function toLearningCard(card: Flashcard, index: number, setId: string) {
  return {
    id: `${setId}-${index}-${card.front}-${card.back}`,
    term: card.front,
    prompt: "Tap to reveal",
    answer: card.back,
  };
}

function shuffleSessionItems<T>(items: T[]): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

function getCardProgressKey(setId: string, card: Pick<Flashcard, "front" | "back">, index: number) {
  return `${setId}:${index}:${card.front}:${card.back}`;
}

function createSessionQueue(set: FlashcardSet, limit = set.flashcards.length): LearningSessionItem[] {
  const sessionItems = set.flashcards.flatMap((card, index) =>
    card.isLearned
      ? []
      : [
          {
            card,
            index,
            key: getCardProgressKey(set.id, card, index),
          },
        ],
  );

  return shuffleSessionItems(sessionItems).slice(0, limit);
}

function getQuickLessonCompletionMessage(reviewedCount: number, decisionLimit: number) {
  return reviewedCount >= decisionLimit
    ? `${decisionLimit} cards reviewed.`
    : `${reviewedCount} cards reviewed.`;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDateKeyWithOffset(dateKey: string, offsetDays: number) {
  const [yearText, monthText, dayText] = dateKey.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return getLocalDateKey();
  }

  return getLocalDateKey(new Date(year, month - 1, day + offsetDays));
}

function normalizeNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function normalizeStudyDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function createEmptyStudyProgress(): StudyProgress {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastStudyDate: null,
    totalStudyDays: 0,
  };
}

function normalizeStudyProgress(value: unknown): StudyProgress {
  if (!isRecord(value)) return createEmptyStudyProgress();

  const lastStudyDate = normalizeStudyDate(value.lastStudyDate);
  const currentStreak = lastStudyDate ? normalizeNonNegativeInteger(value.currentStreak) : 0;
  const longestStreak = Math.max(currentStreak, normalizeNonNegativeInteger(value.longestStreak));
  const totalStudyDays = normalizeNonNegativeInteger(value.totalStudyDays);

  return {
    currentStreak,
    longestStreak,
    lastStudyDate,
    totalStudyDays: lastStudyDate && totalStudyDays === 0 ? 1 : totalStudyDays,
  };
}

function getNextStudyProgress(currentProgress: StudyProgress, today = getLocalDateKey()) {
  if (currentProgress.lastStudyDate === today) {
    return currentProgress;
  }

  const yesterday = getDateKeyWithOffset(today, -1);
  const currentStreak =
    currentProgress.lastStudyDate === yesterday ? Math.max(currentProgress.currentStreak, 0) + 1 : 1;
  const totalStudyDays = currentProgress.lastStudyDate
    ? currentProgress.totalStudyDays + 1
    : 1;

  return {
    currentStreak,
    longestStreak: Math.max(currentProgress.longestStreak, currentStreak),
    lastStudyDate: today,
    totalStudyDays,
  };
}

function getRandomDelay(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function insertCardLater(
  queue: LearningSessionItem[],
  item: LearningSessionItem,
  min: number,
  max: number,
): LearningSessionItem[] {
  const queueWithoutDuplicate = queue.filter((queuedItem) => queuedItem.key !== item.key);
  const delay = getRandomDelay(min, max);
  const insertIndex = Math.min(delay, queueWithoutDuplicate.length);

  return [
    ...queueWithoutDuplicate.slice(0, insertIndex),
    item,
    ...queueWithoutDuplicate.slice(insertIndex),
  ];
}

function getLearningProgress(card: Flashcard): LearningProgress {
  return {
    learningStage: card.learningStage,
    reviewAgainStreak: card.reviewAgainStreak,
    isLearned: card.isLearned,
    lastReviewedAt: card.lastReviewedAt,
  };
}

function normalizeLearningStage(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function normalizeReviewAgainStreak(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function normalizeFlashcard(card: FlashcardDraft): Flashcard {
  const learningStage = normalizeLearningStage(card.learningStage);
  const isLearned = Boolean(card.isLearned) || learningStage >= 3;

  return {
    front: card.front,
    back: card.back,
    learningStage: isLearned && learningStage < 3 ? 3 : learningStage,
    reviewAgainStreak: normalizeReviewAgainStreak(card.reviewAgainStreak),
    isLearned,
    lastReviewedAt: typeof card.lastReviewedAt === "string" ? card.lastReviewedAt : null,
  };
}

function getLearningCounts(set: FlashcardSet) {
  const totalCards = set.flashcards.length;
  const learnedCards = set.flashcards.filter((card) => card.isLearned).length;
  const learningCards = set.flashcards.filter((card) => !card.isLearned).length;
  const difficultCards = set.flashcards.filter((card) => card.learningStage === -1).length;

  return {
    totalCards,
    learnedCards,
    learningCards,
    difficultCards,
    readyCards: learningCards,
  };
}

function loadLearningProgress(): LearningProgressStore {
  try {
    const rawProgress = window.localStorage.getItem(LEARNING_PROGRESS_STORAGE_KEY);
    if (!rawProgress) return {};

    const parsedProgress: unknown = JSON.parse(rawProgress);
    if (!isRecord(parsedProgress)) return {};

    return Object.fromEntries(
      Object.entries(parsedProgress).flatMap(([key, value]) => {
        if (!isRecord(value)) return [];
        const progress = normalizeFlashcard({
          front: "",
          back: "",
          learningStage: value.learningStage,
          reviewAgainStreak: value.reviewAgainStreak,
          isLearned: value.isLearned,
          lastReviewedAt: value.lastReviewedAt,
        });

        return [[key, getLearningProgress(progress)]];
      }),
    );
  } catch {
    return {};
  }
}

function saveLearningProgress(progress: LearningProgressStore) {
  try {
    window.localStorage.setItem(LEARNING_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Persisting ready-made set progress is best-effort in browser storage.
  }
}

function loadStudyProgress(): StudyProgress {
  try {
    const rawProgress = window.localStorage.getItem(STUDY_PROGRESS_STORAGE_KEY);
    if (!rawProgress) return createEmptyStudyProgress();

    return normalizeStudyProgress(JSON.parse(rawProgress));
  } catch {
    return createEmptyStudyProgress();
  }
}

function saveStudyProgress(progress: StudyProgress) {
  try {
    window.localStorage.setItem(STUDY_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Persisting streak progress is best-effort in browser storage.
  }
}

function applyReadyMadeProgress(sets: FlashcardSet[], progress: LearningProgressStore) {
  return sets.map((set) => ({
    ...set,
    flashcards: set.flashcards.map((card, index) =>
      normalizeFlashcard({
        ...card,
        ...progress[getCardProgressKey(set.id, card, index)],
      }),
    ),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStoredFlashcard(value: unknown): Flashcard | null {
  if (!isRecord(value) || typeof value.front !== "string" || typeof value.back !== "string") {
    return null;
  }

  return normalizeFlashcard({
    front: value.front,
    back: value.back,
    learningStage: value.learningStage,
    reviewAgainStreak: value.reviewAgainStreak,
    isLearned: value.isLearned,
    lastReviewedAt: value.lastReviewedAt,
  });
}

function loadUserSets() {
  try {
    const rawSets = window.localStorage.getItem(USER_SETS_STORAGE_KEY);
    if (!rawSets) return [];

    const parsedSets: unknown = JSON.parse(rawSets);
    if (!Array.isArray(parsedSets)) return [];

    return parsedSets.flatMap((set): FlashcardSet[] => {
      if (!isRecord(set) || typeof set.id !== "string" || typeof set.name !== "string") {
        return [];
      }

      return [
        {
          id: set.id,
          name: set.name,
          source: "User",
          readonly: false,
          flashcards: Array.isArray(set.flashcards)
            ? set.flashcards.flatMap((card) => {
                const flashcard = toStoredFlashcard(card);
                return flashcard ? [flashcard] : [];
              })
            : [],
        },
      ];
    });
  } catch {
    return [];
  }
}

function saveUserSets(sets: FlashcardSet[]) {
  try {
    window.localStorage.setItem(USER_SETS_STORAGE_KEY, JSON.stringify(sets));
  } catch {
    // Persisting user-created sets is best-effort in browser storage.
  }
}

function createUserSetId() {
  return `user-${crypto.randomUUID?.() ?? Date.now().toString(36)}`;
}

export function App() {
  const [userSets, setUserSets] = useState<FlashcardSet[]>(loadUserSets);
  const [learningProgress, setLearningProgress] = useState<LearningProgressStore>(
    loadLearningProgress,
  );
  const [studyProgress, setStudyProgress] = useState<StudyProgress>(loadStudyProgress);
  const [activeTab, setActiveTab] = useState<AppViewId>("home");
  const [homeRoute, setHomeRoute] = useState<HomeRoute>("dashboard");
  const [setsRoute, setSetsRoute] = useState<SetsRoute>("list");
  const [selectedSetId, setSelectedSetId] = useState(defaultSets[0].id);
  const [viewedSetId, setViewedSetId] = useState(defaultSets[0].id);
  const [quickLessonCompleted, setQuickLessonCompleted] = useState(false);
  const [quickLessonReviewedCount, setQuickLessonReviewedCount] = useState(0);
  const [quickLessonDecisionLimit, setQuickLessonDecisionLimit] = useState(0);
  const [quickLessonQueue, setQuickLessonQueue] = useState<LearningSessionItem[]>([]);
  const [learningDecisionCount, setLearningDecisionCount] = useState(0);
  const [learningSessionCardTotal, setLearningSessionCardTotal] = useState(0);
  const [learningQueue, setLearningQueue] = useState<LearningSessionItem[]>([]);

  const readyMadeSets = useMemo(
    () => applyReadyMadeProgress(defaultSets, learningProgress),
    [learningProgress],
  );
  const allSets = useMemo(() => [...userSets, ...readyMadeSets], [readyMadeSets, userSets]);
  const selectedSet = allSets.find((set) => set.id === selectedSetId) ?? allSets[0];
  const viewedSet = allSets.find((set) => set.id === viewedSetId) ?? selectedSet;
  const activeSetCounts = getLearningCounts(selectedSet);
  const quickLessonReadyCount = Math.min(QUICK_LESSON_CARD_LIMIT, activeSetCounts.readyCards);
  const quickLessonCardLabel =
    activeSetCounts.readyCards >= QUICK_LESSON_CARD_LIMIT
      ? "10 cards - about 2 min"
      : activeSetCounts.readyCards > 0
        ? `${activeSetCounts.readyCards} cards ready`
        : "All caught up";
  const practiceCardsLabel =
    activeSetCounts.readyCards > 0 ? `${activeSetCounts.readyCards} cards ready` : "All caught up";

  const showBottomNav = useMemo(
    () =>
      !(
        activeTab === "home" &&
        (homeRoute === "quickLesson" ||
          homeRoute === "continueLearning" ||
          homeRoute === "learningCompleted" ||
          homeRoute === "quickLessonCompleted")
      ),
    [activeTab, homeRoute],
  );
  const showTopBar = useMemo(
    () =>
      !(
        activeTab === "home" &&
        (homeRoute === "quickLesson" ||
          homeRoute === "continueLearning" ||
          homeRoute === "quickLessonCompleted" ||
          homeRoute === "learningCompleted")
      ),
    [activeTab, homeRoute],
  );

  useEffect(() => {
    if (
      homeRoute !== "quickLesson" ||
      quickLessonDecisionLimit === 0 ||
      quickLessonReviewedCount < quickLessonDecisionLimit
    ) {
      return;
    }

    setQuickLessonCompleted(true);
    setHomeRoute("quickLessonCompleted");
  }, [homeRoute, quickLessonDecisionLimit, quickLessonReviewedCount]);

  useEffect(() => {
    if (
      homeRoute !== "continueLearning" ||
      learningSessionCardTotal === 0 ||
      learningQueue.length > 0
    ) {
      return;
    }

    setHomeRoute("learningCompleted");
  }, [homeRoute, learningQueue.length, learningSessionCardTotal]);

  function openTab(tab: TabId) {
    setActiveTab(tab);
    if (tab === "home") setHomeRoute("dashboard");
    if (tab === "sets") setSetsRoute("list");
  }

  function openProfileSettings() {
    setActiveTab("settings");
  }

  function updateUserSet(setId: string, updateSet: (set: FlashcardSet) => FlashcardSet) {
    setUserSets((currentSets) => {
      let updatedSet: FlashcardSet | null = null;
      const updatedSets = currentSets.map((set) => {
        if (set.id !== setId) return set;

        updatedSet = updateSet(set);
        return updatedSet;
      });

      if (!updatedSet) return currentSets;

      saveUserSets(updatedSets);
      return updatedSets;
    });
  }

  function addCardToSet(set: FlashcardSet, card: Pick<Flashcard, "front" | "back">) {
    if (set.source !== "User") return;

    updateUserSet(set.id, (currentSet) => ({
      ...currentSet,
      flashcards: [normalizeFlashcard(card), ...currentSet.flashcards],
    }));
  }

  function updateCardInSet(
    set: FlashcardSet,
    cardIndex: number,
    card: Pick<Flashcard, "front" | "back">,
  ) {
    if (set.source !== "User") return;

    updateUserSet(set.id, (currentSet) => ({
      ...currentSet,
      flashcards: currentSet.flashcards.map((currentCard, index) =>
        index === cardIndex ? normalizeFlashcard({ ...currentCard, ...card }) : currentCard,
      ),
    }));
  }

  function deleteCardFromSet(set: FlashcardSet, cardIndex: number) {
    if (set.source !== "User") return;

    updateUserSet(set.id, (currentSet) => ({
      ...currentSet,
      flashcards: currentSet.flashcards.filter((_, index) => index !== cardIndex),
    }));
  }

  function selectSet(set: FlashcardSet) {
    setSelectedSetId(set.id);
    setViewedSetId(set.id);
    setQuickLessonCompleted(false);
    setQuickLessonReviewedCount(0);
    setQuickLessonDecisionLimit(0);
    setQuickLessonQueue([]);
    setLearningDecisionCount(0);
    setLearningSessionCardTotal(0);
    setLearningQueue([]);
  }

  function openSetDetails(set: FlashcardSet) {
    setViewedSetId(set.id);
    setSetsRoute("details");
  }

  function createUserSet(name: string) {
    const setName = name.trim();
    const normalizedName = setName.toLocaleLowerCase();
    const hasDuplicateName = allSets.some(
      (set) => set.name.trim().toLocaleLowerCase() === normalizedName,
    );

    if (hasDuplicateName) {
      return DUPLICATE_SET_NAME_ERROR;
    }

    const newSet: FlashcardSet = {
      id: createUserSetId(),
      name: setName,
      source: "User",
      readonly: false,
      flashcards: [],
    };

    setUserSets((currentSets) => {
      const updatedSets = [newSet, ...currentSets];
      saveUserSets(updatedSets);
      return updatedSets;
    });

    return null;
  }

  function deleteUserSet(setToDelete: FlashcardSet) {
    if (setToDelete.source !== "User") return;

    setUserSets((currentSets) => {
      const updatedSets = currentSets.filter((set) => set.id !== setToDelete.id);
      saveUserSets(updatedSets);
      return updatedSets;
    });

    if (selectedSetId === setToDelete.id) {
      selectSet(readyMadeSets[0]);
      return;
    }

    if (viewedSetId === setToDelete.id) {
      setViewedSetId(selectedSetId);
    }
  }

  function persistCardLearningState(set: FlashcardSet, item: LearningSessionItem) {
    if (set.source === "User") {
      updateUserSet(set.id, (currentSet) => ({
        ...currentSet,
        flashcards: currentSet.flashcards.map((currentCard, index) =>
          index === item.index ? normalizeFlashcard(item.card) : currentCard,
        ),
      }));
      return;
    }

    setLearningProgress((currentProgress) => {
      const nextProgress = {
        ...currentProgress,
        [item.key]: getLearningProgress(item.card),
      };

      saveLearningProgress(nextProgress);
      return nextProgress;
    });
  }

  function registerStudyActivity() {
    setStudyProgress((currentProgress) => {
      const nextProgress = getNextStudyProgress(currentProgress);

      if (nextProgress === currentProgress) {
        return currentProgress;
      }

      saveStudyProgress(nextProgress);
      return nextProgress;
    });
  }

  function markKnown(item: LearningSessionItem, queue: LearningSessionItem[], allowReinsert: boolean) {
    const card = item.card;
    card.lastReviewedAt = new Date().toISOString();
    card.reviewAgainStreak = 0;

    if (card.learningStage <= 0) {
      card.learningStage = 1;
      card.isLearned = false;
      persistCardLearningState(selectedSet, item);
      return allowReinsert ? insertCardLater(queue, item, 10, 20) : queue;
    }

    if (card.learningStage === 1) {
      card.learningStage = 2;
      card.isLearned = false;
      persistCardLearningState(selectedSet, item);
      return allowReinsert ? insertCardLater(queue, item, 40, 50) : queue;
    }

    card.learningStage = 3;
    card.isLearned = true;
    persistCardLearningState(selectedSet, item);
    return queue;
  }

  function markReviewAgain(item: LearningSessionItem, queue: LearningSessionItem[], allowReinsert: boolean) {
    const card = item.card;
    card.lastReviewedAt = new Date().toISOString();
    card.reviewAgainStreak += 1;

    if (card.learningStage === -1 || card.reviewAgainStreak >= 2) {
      card.learningStage = -1;
      card.isLearned = false;
      persistCardLearningState(selectedSet, item);
      return allowReinsert ? insertCardLater(queue, item, 3, 5) : queue;
    }

    persistCardLearningState(selectedSet, item);
    return allowReinsert ? insertCardLater(queue, item, 5, 10) : queue;
  }

  function startQuickLesson() {
    const queue = createSessionQueue(selectedSet, QUICK_LESSON_CARD_LIMIT);
    if (queue.length === 0) return;

    setQuickLessonCompleted(false);
    setQuickLessonReviewedCount(0);
    setQuickLessonDecisionLimit(queue.length);
    setQuickLessonQueue(queue);
    setHomeRoute("quickLesson");
  }

  function startContinueLearning() {
    const queue = createSessionQueue(selectedSet);

    setLearningDecisionCount(0);
    setLearningSessionCardTotal(queue.length);
    setLearningQueue(queue);

    if (queue.length === 0) {
      setHomeRoute("learningCompleted");
      return;
    }

    setHomeRoute("continueLearning");
  }

  function passQuickLessonCard() {
    if (!quickLessonQueue[0]) return;

    registerStudyActivity();
    setQuickLessonQueue((queue) => {
      const [activeItem, ...remainingItems] = queue;
      if (!activeItem) return queue;

      return markKnown(activeItem, remainingItems, false);
    });
    setQuickLessonReviewedCount((reviewedCount) =>
      Math.min(reviewedCount + 1, quickLessonDecisionLimit),
    );
  }

  function repeatQuickLessonCard() {
    if (!quickLessonQueue[0]) return;

    registerStudyActivity();
    setQuickLessonQueue((queue) => {
      const [activeItem, ...remainingItems] = queue;
      if (!activeItem) return queue;

      return markReviewAgain(activeItem, remainingItems, false);
    });
    setQuickLessonReviewedCount((reviewedCount) =>
      Math.min(reviewedCount + 1, quickLessonDecisionLimit),
    );
  }

  function passContinueLearningCard() {
    if (!learningQueue[0]) return;

    registerStudyActivity();
    setLearningQueue((queue) => {
      const [activeItem, ...remainingItems] = queue;
      if (!activeItem) return queue;

      return markKnown(activeItem, remainingItems, true);
    });
    setLearningDecisionCount((decisionCount) => decisionCount + 1);
  }

  function repeatContinueLearningCard() {
    if (!learningQueue[0]) return;

    registerStudyActivity();
    setLearningQueue((queue) => {
      const [activeItem, ...remainingItems] = queue;
      if (!activeItem) return queue;

      return markReviewAgain(activeItem, remainingItems, true);
    });
    setLearningDecisionCount((decisionCount) => decisionCount + 1);
  }

  function exitToDashboard() {
    setActiveTab("home");
    setHomeRoute("dashboard");
  }

  function getTopBarBackHandler() {
    if (activeTab === "sets" && setsRoute === "details") {
      return () => setSetsRoute("list");
    }

    if (activeTab === "home" && homeRoute === "setDetails") {
      return () => setHomeRoute("dashboard");
    }

    if (activeTab === "home" && homeRoute === "readyMade") {
      return () => setHomeRoute("dashboard");
    }

    return undefined;
  }

  function renderHome() {
    if (homeRoute === "quickLesson") {
      const activeQueueItem = quickLessonQueue[0];
      const nextQueueItem = quickLessonQueue[1];
      const quickLessonCompletionMessage = getQuickLessonCompletionMessage(
        quickLessonReviewedCount,
        quickLessonDecisionLimit,
      );

      if (
        quickLessonDecisionLimit > 0 &&
        (quickLessonReviewedCount >= quickLessonDecisionLimit || !activeQueueItem)
      ) {
        return (
          <QuickLessonCompletedScreen
            currentStreak={studyProgress.currentStreak}
            lastStudyDate={studyProgress.lastStudyDate}
            longestStreak={studyProgress.longestStreak}
            message={quickLessonCompletionMessage}
            onBackHome={() => setHomeRoute("dashboard")}
            onContinueLearning={startContinueLearning}
            totalStudyDays={studyProgress.totalStudyDays}
          />
        );
      }

      if (!activeQueueItem) {
        return (
          <SetDetailsScreen
            set={selectedSet}
            isActive
            onAddCard={addCardToSet}
            onDeleteCard={deleteCardFromSet}
            onSetActive={() => selectSet(selectedSet)}
            onStartQuickLesson={startQuickLesson}
            onUpdateCard={updateCardInSet}
          />
        );
      }

      return (
        <LearningScreen
          title={selectedSet.name}
          subtitle="Quick lesson in progress"
          progressLabel={`${quickLessonReviewedCount} / ${quickLessonDecisionLimit}`}
          progressPercent={(quickLessonReviewedCount / Math.max(quickLessonDecisionLimit, 1)) * 100}
          card={toLearningCard(activeQueueItem.card, activeQueueItem.index, selectedSet.id)}
          nextCard={
            nextQueueItem ? toLearningCard(nextQueueItem.card, nextQueueItem.index, selectedSet.id) : null
          }
          passLabel="Know it"
          onPass={passQuickLessonCard}
          onExit={exitToDashboard}
          onRepeat={repeatQuickLessonCard}
        />
      );
    }

    if (homeRoute === "quickLessonCompleted") {
      const quickLessonCompletionMessage = getQuickLessonCompletionMessage(
        quickLessonReviewedCount,
        quickLessonDecisionLimit,
      );

      return (
        <QuickLessonCompletedScreen
          currentStreak={studyProgress.currentStreak}
          lastStudyDate={studyProgress.lastStudyDate}
          longestStreak={studyProgress.longestStreak}
          message={quickLessonCompletionMessage}
          onBackHome={() => setHomeRoute("dashboard")}
          onContinueLearning={startContinueLearning}
          totalStudyDays={studyProgress.totalStudyDays}
        />
      );
    }

    if (homeRoute === "continueLearning") {
      const activeQueueItem = learningQueue[0];
      const nextQueueItem = learningQueue[1];
      const cappedLearningProgress = Math.min(learningDecisionCount, learningSessionCardTotal);

      if (!activeQueueItem) {
        return (
          <QuickLessonCompletedScreen
            currentStreak={studyProgress.currentStreak}
            lastStudyDate={studyProgress.lastStudyDate}
            longestStreak={studyProgress.longestStreak}
            message={
              learningSessionCardTotal === 0
                ? "All caught up."
                : `You finished ${learningDecisionCount} decisions from ${selectedSet.name}.`
            }
            onBackHome={() => setHomeRoute("dashboard")}
            onContinueLearning={startContinueLearning}
            totalStudyDays={studyProgress.totalStudyDays}
          />
        );
      }

      return activeQueueItem ? (
        <LearningScreen
          title={selectedSet.name}
          subtitle="Longer focus session."
          progressLabel={`${cappedLearningProgress} / ${Math.max(learningSessionCardTotal, 1)}`}
          progressPercent={
            (cappedLearningProgress / Math.max(learningSessionCardTotal, 1)) * 100
          }
          card={toLearningCard(activeQueueItem.card, activeQueueItem.index, selectedSet.id)}
          nextCard={
            nextQueueItem ? toLearningCard(nextQueueItem.card, nextQueueItem.index, selectedSet.id) : null
          }
          passLabel="Know it"
          onPass={passContinueLearningCard}
          onExit={exitToDashboard}
          onRepeat={repeatContinueLearningCard}
        />
      ) : (
        <SetDetailsScreen
          set={selectedSet}
          isActive
          onAddCard={addCardToSet}
          onDeleteCard={deleteCardFromSet}
          onSetActive={() => selectSet(selectedSet)}
          onStartQuickLesson={startQuickLesson}
          onUpdateCard={updateCardInSet}
        />
      );
    }

    if (homeRoute === "learningCompleted") {
      return (
        <QuickLessonCompletedScreen
          currentStreak={studyProgress.currentStreak}
          lastStudyDate={studyProgress.lastStudyDate}
          longestStreak={studyProgress.longestStreak}
          message={
            learningSessionCardTotal === 0
              ? "All caught up."
              : `You finished ${learningDecisionCount} decisions from ${selectedSet.name}.`
          }
          onBackHome={() => setHomeRoute("dashboard")}
          onContinueLearning={startContinueLearning}
          totalStudyDays={studyProgress.totalStudyDays}
        />
      );
    }

    if (homeRoute === "setDetails") {
      return (
        <SetDetailsScreen
          set={selectedSet}
          isActive
          onAddCard={addCardToSet}
          onDeleteCard={deleteCardFromSet}
          onSetActive={() => selectSet(selectedSet)}
          onStartQuickLesson={startQuickLesson}
          onUpdateCard={updateCardInSet}
        />
      );
    }

    if (homeRoute === "readyMade") {
      return <ReadyMadeSetsScreen onBack={() => setHomeRoute("dashboard")} />;
    }

    return (
      <HomeScreen
        activeSetName={selectedSet.name}
        activeSetCardCount={activeSetCounts.totalCards}
        currentStreak={studyProgress.currentStreak}
        difficultCardCount={activeSetCounts.difficultCards}
        learnedCardCount={activeSetCounts.learnedCards}
        learningCardCount={activeSetCounts.learningCards}
        practiceCardsLabel={practiceCardsLabel}
        quickLessonCardCount={quickLessonReadyCount}
        quickLessonLabel={quickLessonCardLabel}
        quickLessonState={
          activeSetCounts.readyCards === 0 ? "caughtUp" : quickLessonCompleted ? "completed" : "ready"
        }
        onBrowseSets={() => openTab("sets")}
        onStartQuickLesson={startQuickLesson}
        onContinueLearning={startContinueLearning}
        onOpenActiveSet={() => setHomeRoute("setDetails")}
      />
    );
  }

  function renderSets() {
    if (setsRoute === "details") {
      return (
        <SetDetailsScreen
          set={viewedSet}
          isActive={viewedSet.id === selectedSet.id}
          onAddCard={addCardToSet}
          onDeleteCard={deleteCardFromSet}
          onSetActive={() => selectSet(viewedSet)}
          onStartQuickLesson={() => {
            setActiveTab("home");
            startQuickLesson();
          }}
          onUpdateCard={updateCardInSet}
        />
      );
    }
    return (
      <SetsScreen
        sets={allSets}
        activeSetId={selectedSet.id}
        onCreateSet={createUserSet}
        onDeleteSet={deleteUserSet}
        onOpenSetDetails={openSetDetails}
        onSetActive={selectSet}
      />
    );
  }

  return (
    <AppChrome
      activeTab={activeTab}
      onBack={getTopBarBackHandler()}
      onProfileOpen={openProfileSettings}
      onTabChange={openTab}
      showBottomNav={showBottomNav}
      showTopBar={showTopBar}
    >
      {activeTab === "home" && renderHome()}
      {activeTab === "sets" && renderSets()}
      {activeTab === "explore" && <ReadyMadeSetsScreen />}
      {activeTab === "stats" && <StatsScreen />}
      {activeTab === "settings" && <SettingsScreen />}
    </AppChrome>
  );
}
