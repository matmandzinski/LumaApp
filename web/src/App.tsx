import { useEffect, useMemo, useState } from "react";
import { AppChrome } from "./components/AppChrome";
import {
  defaultSets,
  type Flashcard,
  type FlashcardSet,
  type FlashcardSetSource,
  type SetProgressSummary,
} from "./data/defaultSets";
import { HomeScreen } from "./screens/HomeScreen";
import { LearningScreen } from "./screens/LearningScreen";
import { QuickLessonCompletedScreen } from "./screens/QuickLessonCompletedScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SetDetailsScreen, ReadyMadeSetsScreen, SetsScreen } from "./screens/SetsScreen";
import {
  addCard as addApiCard,
  createSet as createApiSet,
  deleteCard as deleteApiCard,
  deleteSet as deleteApiSet,
  AppApiError,
  getAppState,
  getSet,
  getSets,
  renameSet as renameApiSet,
  resetSetProgress as resetApiSetProgress,
  saveActiveSet,
  updateCard as updateApiCard,
  type ApiFlashcard,
  type ApiProgressSummary,
  type ApiSetDetail,
  type ApiSetListItem,
} from "./services/appApi";
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
const API_UNAVAILABLE_ERROR =
  "The local API is unavailable. Start SimpleFlashCards.Api and try again.";
const LEGACY_LOCAL_SET_ERROR =
  "This local-only set needs to be imported before it can be edited.";

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
  id?: unknown;
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

function resetFlashcardLearningState(card: Flashcard): Flashcard {
  return {
    ...card,
    learningStage: 0,
    reviewAgainStreak: 0,
    isLearned: false,
    lastReviewedAt: null,
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
    ...(typeof card.id === "string" ? { id: card.id } : {}),
    front: card.front,
    back: card.back,
    learningStage: isLearned && learningStage < 3 ? 3 : learningStage,
    reviewAgainStreak: normalizeReviewAgainStreak(card.reviewAgainStreak),
    isLearned,
    lastReviewedAt: typeof card.lastReviewedAt === "string" ? card.lastReviewedAt : null,
  };
}

function getSetCardCount(set: FlashcardSet) {
  return set.progressSummary?.cardCount ?? set.cardCount ?? set.flashcards.length;
}

function createProgressSummaryFromCards(cards: Flashcard[]): SetProgressSummary {
  const learnedCount = cards.filter((card) => card.isLearned || card.learningStage >= 3).length;
  const difficultCount = cards.filter((card) => !card.isLearned && card.learningStage === -1).length;
  const learningCount = cards.filter((card) => !card.isLearned && card.learningStage > 0 && card.learningStage < 3).length;
  const newCount = cards.filter((card) => !card.isLearned && card.learningStage === 0).length;

  return {
    cardCount: cards.length,
    newCount,
    learningCount,
    learnedCount,
    difficultCount,
  };
}

function getLearningCounts(set: FlashcardSet) {
  if (set.flashcards.length === 0 && set.progressSummary) {
    const totalCards = set.progressSummary.cardCount;
    const learnedCards = set.progressSummary.learnedCount;
    const difficultCards = set.progressSummary.difficultCount;
    const learningCards = Math.max(totalCards - learnedCards - difficultCards, 0);
    const readyCards = Math.max(totalCards - learnedCards, 0);

    return {
      totalCards,
      learnedCards,
      learningCards,
      difficultCards,
      readyCards,
    };
  }

  const totalCards = getSetCardCount(set);
  const learnedCards = set.flashcards.filter((card) => card.isLearned || card.learningStage >= 3).length;
  const difficultCards = set.flashcards.filter((card) => !card.isLearned && card.learningStage === -1).length;
  const learningCards = Math.max(totalCards - learnedCards - difficultCards, 0);
  const readyCards = Math.max(totalCards - learnedCards, 0);

  return {
    totalCards,
    learnedCards,
    learningCards,
    difficultCards,
    readyCards,
  };
}

function getLearningStatusSummary(set: FlashcardSet) {
  const { learnedCards, difficultCards, learningCards } = getLearningCounts(set);

  return [
    { label: "Difficult", value: difficultCards, tone: "difficult" as const },
    { label: "Learning", value: learningCards, tone: "learning" as const },
    { label: "Learned", value: learnedCards, tone: "learned" as const },
  ];
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
  return sets.map((set) => {
    if (set.source !== "ReadyMade") {
      return set;
    }

    const flashcards = set.flashcards.map((card, index) =>
      normalizeFlashcard({
        ...card,
        ...progress[getCardProgressKey(set.id, card, index)],
      }),
    );

    return {
      ...set,
      flashcards,
      progressSummary:
        flashcards.length > 0 ? createProgressSummaryFromCards(flashcards) : set.progressSummary,
    };
  });
}

function mapApiProgressSummary(summary: ApiProgressSummary | undefined): SetProgressSummary | undefined {
  if (!summary) return undefined;

  return {
    cardCount: summary.cardCount,
    newCount: summary.newCount,
    learningCount: summary.learningCount,
    learnedCount: summary.learnedCount,
    difficultCount: summary.difficultCount,
  };
}

function normalizeApiSource(source: string): FlashcardSetSource {
  return source === "User" ? "User" : "ReadyMade";
}

function mapApiFlashcard(card: ApiFlashcard): Flashcard {
  return normalizeFlashcard({
    id: card.id,
    front: card.front,
    back: card.back,
    learningStage: card.learningStage,
    reviewAgainStreak: card.reviewAgainStreak,
    isLearned: card.isLearned,
    lastReviewedAt: card.lastReviewedAt,
  });
}

function mapApiSetSummary(set: ApiSetListItem): FlashcardSet {
  const source = normalizeApiSource(set.source);

  return {
    id: set.externalId,
    internalId: set.id,
    ownerUserId: set.ownerUserId,
    name: set.name,
    source,
    readonly: source === "ReadyMade",
    flashcards: [],
    cardCount: set.cardCount,
    progressSummary: mapApiProgressSummary(set.progressSummary),
    isApiBacked: true,
  };
}

function mapApiSetDetail(set: ApiSetDetail): FlashcardSet {
  const summary = mapApiSetSummary(set);
  const flashcards = set.flashcards.map(mapApiFlashcard);

  return {
    ...summary,
    flashcards,
    cardCount: set.cardCount,
    progressSummary: flashcards.length > 0
      ? createProgressSummaryFromCards(flashcards)
      : mapApiProgressSummary(set.progressSummary),
  };
}

function upsertSet(sets: FlashcardSet[], updatedSet: FlashcardSet) {
  const existingIndex = sets.findIndex((set) => set.id === updatedSet.id);
  if (existingIndex === -1) return [updatedSet, ...sets];

  return sets.map((set, index) => (index === existingIndex ? updatedSet : set));
}

function removeSet(sets: FlashcardSet[], setId: string) {
  return sets.filter((set) => set.id !== setId);
}

function withUpdatedCard(set: FlashcardSet, updatedCard: Flashcard) {
  const flashcards = set.flashcards.map((card) => (card.id === updatedCard.id ? updatedCard : card));

  return {
    ...set,
    flashcards,
    cardCount: flashcards.length,
    progressSummary: createProgressSummaryFromCards(flashcards),
  };
}

function withoutCard(set: FlashcardSet, cardId: string) {
  const flashcards = set.flashcards.filter((card) => card.id !== cardId);

  return {
    ...set,
    flashcards,
    cardCount: flashcards.length,
    progressSummary: createProgressSummaryFromCards(flashcards),
  };
}

function withPrependedCard(set: FlashcardSet, card: Flashcard) {
  const flashcards = [card, ...set.flashcards];

  return {
    ...set,
    flashcards,
    cardCount: flashcards.length,
    progressSummary: createProgressSummaryFromCards(flashcards),
  };
}

function isEditableApiUserSet(set: FlashcardSet) {
  return set.isApiBacked === true && set.source === "User" && !set.readonly;
}

function getSetMutationBlockedMessage(set: FlashcardSet) {
  if (set.source !== "User") return "This set is read-only.";
  if (!set.isApiBacked) return LEGACY_LOCAL_SET_ERROR;

  return "This set is read-only.";
}

function getApiActionErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof AppApiError) {
    if (error.status === undefined) return API_UNAVAILABLE_ERROR;
    if (error.status === 403) return "This set is read-only.";
    if (error.status === 404) return "That set or card no longer exists. Refresh and try again.";

    return error.message;
  }

  return fallbackMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStoredFlashcard(value: unknown): Flashcard | null {
  if (!isRecord(value) || typeof value.front !== "string" || typeof value.back !== "string") {
    return null;
  }

  return normalizeFlashcard({
    id: value.id,
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
          readonly: true,
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

// TODO(api migration): Import existing simple-flashcards:user-sets records into SQLite.
// TODO(api migration): Move learning progress writes to the local API.
// TODO(api migration): Move quick lesson completion to the local API.
// TODO(api migration): Move lesson snapshots to the local API.
// TODO(api migration): Move streak/study progress to the local API.
// TODO(api migration): Remove simple-flashcards:user-sets reads after import is implemented.

export function App() {
  const [userSets, setUserSets] = useState<FlashcardSet[]>(loadUserSets);
  const [apiSets, setApiSets] = useState<FlashcardSet[] | null>(null);
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

  const localReadyMadeSets = useMemo(
    () => applyReadyMadeProgress(defaultSets, learningProgress),
    [learningProgress],
  );
  const apiBackedSets = useMemo(
    () => (apiSets ? applyReadyMadeProgress(apiSets, learningProgress) : null),
    [apiSets, learningProgress],
  );
  const allSets = useMemo(() => {
    if (!apiBackedSets) return [...userSets, ...localReadyMadeSets];

    const apiSetIds = new Set(apiBackedSets.map((set) => set.id));
    const localOnlyUserSets = userSets.filter((set) => !apiSetIds.has(set.id));

    return [...localOnlyUserSets, ...apiBackedSets];
  }, [apiBackedSets, localReadyMadeSets, userSets]);
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
  const activeSetCanReset =
    activeSetCounts.totalCards > 0 && activeSetCounts.learnedCards === activeSetCounts.totalCards;

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
    let isCancelled = false;

    async function loadApiSetsAndState() {
      try {
        const [setResponses, appState] = await Promise.all([
          getSets(),
          getAppState().catch((error: unknown) => {
            console.warn("Unable to load local API app state; using API set fallback.", error);
            return null;
          }),
        ]);

        const summarySets = setResponses.map(mapApiSetSummary);
        const persistedActiveSetId = appState?.activeSetExternalId ?? appState?.activeSetId;
        const fallbackSet =
          summarySets.find((set) => set.source === "ReadyMade") ?? summarySets[0] ?? null;
        const activeSet =
          (persistedActiveSetId
            ? summarySets.find((set) => set.id === persistedActiveSetId)
            : undefined) ?? fallbackSet;

        let nextApiSets = summarySets;

        if (activeSet) {
          try {
            const activeSetDetail = mapApiSetDetail(await getSet(activeSet.id));
            nextApiSets = upsertSet(nextApiSets, activeSetDetail);
          } catch (error) {
            console.warn(`Unable to load cards for ${activeSet.name} from the local API.`, error);
          }
        }

        if (isCancelled) return;

        setApiSets(nextApiSets);

        if (activeSet) {
          setSelectedSetId(activeSet.id);
          setViewedSetId(activeSet.id);
        }
      } catch (error) {
        if (!isCancelled) {
          console.warn("Local API unavailable; using local/default flashcard sets.", error);
        }
      }
    }

    void loadApiSetsAndState();

    return () => {
      isCancelled = true;
    };
  }, []);

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

  async function hydrateApiSet(set: FlashcardSet) {
    if (!set.isApiBacked) return;

    try {
      await refreshApiSet(set.id);
    } catch (error) {
      console.warn(`Unable to load cards for ${set.name} from the local API.`, error);
    }
  }

  function hydrateApiSetIfNeeded(set: FlashcardSet) {
    if (!set.isApiBacked || set.flashcards.length > 0 || getSetCardCount(set) === 0) return;

    void hydrateApiSet(set);
  }

  async function refreshApiSet(externalSetId: string) {
    const detail = mapApiSetDetail(await getSet(externalSetId));
    setApiSets((currentSets) => (currentSets ? upsertSet(currentSets, detail) : [detail]));

    return detail;
  }

  function clearStoredLearningProgressForSet(set: FlashcardSet) {
    setLearningProgress((currentProgress) => {
      const nextProgress = { ...currentProgress };

      set.flashcards.forEach((card, index) => {
        delete nextProgress[getCardProgressKey(set.id, card, index)];
      });

      saveLearningProgress(nextProgress);
      return nextProgress;
    });
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
    if (!isEditableApiUserSet(set)) {
      console.warn(getSetMutationBlockedMessage(set));
      return;
    }

    void addApiCard(set.id, {
      front: card.front.trim(),
      back: card.back.trim(),
    })
      .then((createdCard) => {
        const flashcard = mapApiFlashcard(createdCard);

        setApiSets((currentSets) =>
          currentSets
            ? currentSets.map((currentSet) =>
                currentSet.id === set.id ? withPrependedCard(currentSet, flashcard) : currentSet,
              )
            : currentSets,
        );

        return refreshApiSet(set.id);
      })
      .catch((error: unknown) => {
        console.warn(
          getApiActionErrorMessage(error, `Unable to add a card to ${set.name}.`),
          error,
        );
      });
  }

  function updateCardInSet(
    set: FlashcardSet,
    cardIndex: number,
    card: Pick<Flashcard, "front" | "back">,
  ) {
    if (!isEditableApiUserSet(set)) {
      console.warn(getSetMutationBlockedMessage(set));
      return;
    }

    const cardId = set.flashcards[cardIndex]?.id;
    if (!cardId) {
      console.warn(`Unable to update a card in ${set.name}: missing API card id.`);
      return;
    }

    void updateApiCard(set.id, cardId, {
      front: card.front.trim(),
      back: card.back.trim(),
    })
      .then((updatedCard) => {
        const flashcard = mapApiFlashcard(updatedCard);
        setApiSets((currentSets) =>
          currentSets
            ? currentSets.map((currentSet) =>
                currentSet.id === set.id ? withUpdatedCard(currentSet, flashcard) : currentSet,
              )
            : currentSets,
        );
      })
      .catch((error: unknown) => {
        console.warn(
          getApiActionErrorMessage(error, `Unable to update a card in ${set.name}.`),
          error,
        );
      });
  }

  function deleteCardFromSet(set: FlashcardSet, cardIndex: number) {
    if (!isEditableApiUserSet(set)) {
      console.warn(getSetMutationBlockedMessage(set));
      return;
    }

    const cardId = set.flashcards[cardIndex]?.id;
    if (!cardId) {
      console.warn(`Unable to delete a card from ${set.name}: missing API card id.`);
      return;
    }

    void deleteApiCard(set.id, cardId)
      .then(() => {
        setApiSets((currentSets) =>
          currentSets
            ? currentSets.map((currentSet) =>
                currentSet.id === set.id ? withoutCard(currentSet, cardId) : currentSet,
              )
            : currentSets,
        );
      })
      .catch((error: unknown) => {
        console.warn(
          getApiActionErrorMessage(error, `Unable to delete a card from ${set.name}.`),
          error,
        );
      });
  }

  function selectSet(set: FlashcardSet) {
    setSelectedSetId(set.id);
    setViewedSetId(set.id);
    hydrateApiSetIfNeeded(set);

    if (set.isApiBacked) {
      void saveActiveSet(set.id).catch((error: unknown) => {
        console.warn(`Unable to save active set ${set.name} to the local API.`, error);
      });
    }

    setQuickLessonCompleted(false);
    setQuickLessonReviewedCount(0);
    setQuickLessonDecisionLimit(0);
    setQuickLessonQueue([]);
    setLearningDecisionCount(0);
    setLearningSessionCardTotal(0);
    setLearningQueue([]);
  }

  function openSetDetails(set: FlashcardSet) {
    hydrateApiSetIfNeeded(set);
    setViewedSetId(set.id);
    setSetsRoute("details");
  }

  async function createUserSet(name: string) {
    const setName = name.trim();
    const normalizedName = setName.toLocaleLowerCase();
    const hasDuplicateName = allSets.some(
      (set) => set.name.trim().toLocaleLowerCase() === normalizedName,
    );

    if (hasDuplicateName) {
      return DUPLICATE_SET_NAME_ERROR;
    }

    try {
      const newSet = mapApiSetDetail(await createApiSet({ name: setName }));
      const latestSets = (await getSets()).map(mapApiSetSummary);
      setApiSets(upsertSet(latestSets, newSet));

      return null;
    } catch (error) {
      const message = getApiActionErrorMessage(error, API_UNAVAILABLE_ERROR);
      console.warn(message, error);

      return message;
    }
  }

  async function renameUserSet(setToRename: FlashcardSet, name: string) {
    if (!isEditableApiUserSet(setToRename)) {
      const message = getSetMutationBlockedMessage(setToRename);
      console.warn(message);
      return message;
    }

    const setName = name.trim();
    const normalizedName = setName.toLocaleLowerCase();
    const hasDuplicateName = allSets.some(
      (set) =>
        set.id !== setToRename.id &&
        set.name.trim().toLocaleLowerCase() === normalizedName,
    );

    if (hasDuplicateName) {
      return DUPLICATE_SET_NAME_ERROR;
    }

    try {
      const updatedSet = mapApiSetDetail(await renameApiSet(setToRename.id, { name: setName }));
      setApiSets((currentSets) => (currentSets ? upsertSet(currentSets, updatedSet) : [updatedSet]));

      return null;
    } catch (error) {
      const message = getApiActionErrorMessage(error, `Unable to rename ${setToRename.name}.`);
      console.warn(message, error);

      return message;
    }
  }

  function deleteUserSet(setToDelete: FlashcardSet) {
    if (!isEditableApiUserSet(setToDelete)) {
      console.warn(getSetMutationBlockedMessage(setToDelete));
      return;
    }

    void deleteApiSet(setToDelete.id)
      .then((response) => {
        setApiSets((currentSets) =>
          currentSets ? removeSet(currentSets, setToDelete.id) : currentSets,
        );

        const remainingSets = allSets.filter((set) => set.id !== setToDelete.id);
        const fallbackSet =
          (response.activeSetExternalId
            ? remainingSets.find((set) => set.id === response.activeSetExternalId)
            : undefined) ??
          remainingSets.find((set) => set.source === "ReadyMade") ??
          remainingSets[0];

        if (selectedSetId === setToDelete.id && fallbackSet) {
          selectSet(fallbackSet);
          return;
        }

        if (viewedSetId === setToDelete.id) {
          setViewedSetId(fallbackSet?.id ?? selectedSetId);
          setSetsRoute("list");
        }
      })
      .catch((error: unknown) => {
        console.warn(
          getApiActionErrorMessage(error, `Unable to delete ${setToDelete.name}.`),
          error,
        );
      });
  }

  function resetSetLearningState(setToReset: FlashcardSet) {
    if (setToReset.id === selectedSetId) {
      setQuickLessonCompleted(false);
      setQuickLessonReviewedCount(0);
      setQuickLessonDecisionLimit(0);
      setQuickLessonQueue([]);
      setLearningDecisionCount(0);
      setLearningSessionCardTotal(0);
      setLearningQueue([]);
    }

    if (setToReset.isApiBacked) {
      void resetApiSetProgress(setToReset.id)
        .then((progressSummary) => {
          setApiSets((currentSets) =>
            currentSets
              ? currentSets.map((set) =>
                  set.id === setToReset.id
                    ? {
                        ...set,
                        progressSummary: mapApiProgressSummary(progressSummary),
                        flashcards: set.flashcards.map(resetFlashcardLearningState),
                      }
                    : set,
                )
              : currentSets,
          );

          return refreshApiSet(setToReset.id);
        })
        .then((refreshedSet) => {
          if (refreshedSet.source === "ReadyMade") {
            clearStoredLearningProgressForSet(refreshedSet);
          }
        })
        .catch((error: unknown) => {
          console.warn(
            getApiActionErrorMessage(error, `Unable to reset progress for ${setToReset.name}.`),
            error,
          );
        });
      return;
    }

    if (setToReset.source === "User") {
      console.warn(LEGACY_LOCAL_SET_ERROR);
      return;
    }

    setLearningProgress((currentProgress) => {
      const nextProgress = { ...currentProgress };

      setToReset.flashcards.forEach((card, index) => {
        delete nextProgress[getCardProgressKey(setToReset.id, card, index)];
      });

      saveLearningProgress(nextProgress);
      return nextProgress;
    });
  }

  function resetSelectedSetLearningState() {
    resetSetLearningState(selectedSet);
  }

  function persistCardLearningState(set: FlashcardSet, item: LearningSessionItem) {
    if (set.isApiBacked && set.source === "User") {
      setApiSets((currentSets) =>
        currentSets
          ? currentSets.map((currentSet) =>
              currentSet.id === set.id
                ? withUpdatedCard(currentSet, normalizeFlashcard(item.card))
                : currentSet,
            )
          : currentSets,
      );
      return;
    }

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
      const learningStatusSummary = getLearningStatusSummary(selectedSet);

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
          statusSummary={learningStatusSummary}
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
        quickLessonCanReset={activeSetCanReset}
        quickLessonLabel={quickLessonCardLabel}
        quickLessonState={
          activeSetCounts.readyCards === 0 ? "caughtUp" : quickLessonCompleted ? "completed" : "ready"
        }
        onBrowseSets={() => openTab("sets")}
        onStartQuickLesson={startQuickLesson}
        onContinueLearning={startContinueLearning}
        onOpenActiveSet={() => {
          hydrateApiSetIfNeeded(selectedSet);
          setHomeRoute("setDetails");
        }}
        onResetActiveSet={resetSelectedSetLearningState}
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
        onRenameSet={renameUserSet}
        onResetSetProgress={resetSetLearningState}
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
