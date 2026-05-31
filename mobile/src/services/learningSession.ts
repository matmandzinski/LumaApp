import type {
  ApiFlashcard,
  ApiProgressSummary,
  ApiReviewCardResponse,
  ApiSetDetail,
} from '@/src/services/appApi';

export const QUICK_LESSON_CARD_LIMIT = 10;

export type LearningSessionMode = 'quickLesson' | 'practiceCards';

export type LearningQueueItem = {
  card: ApiFlashcard;
  index: number;
  key: string;
};

export type LearningCounts = {
  totalCards: number;
  readyCards: number;
  difficultCards: number;
  learningCards: number;
  learnedCards: number;
};

export function createQuickLessonQueue(cards: ApiFlashcard[]) {
  return createSessionQueue(cards, QUICK_LESSON_CARD_LIMIT);
}

export function createPracticeCardsQueue(cards: ApiFlashcard[]) {
  return createSessionQueue(cards);
}

export function applyReviewResponseToSet(
  set: ApiSetDetail,
  response: ApiReviewCardResponse,
): ApiSetDetail {
  return {
    ...set,
    cardCount: response.progressSummary.cardCount,
    progressSummary: response.progressSummary,
    flashcards: set.flashcards.map((card) =>
      card.id === response.card.id ? response.card : card,
    ),
  };
}

export function advanceLearningQueue(
  queue: LearningQueueItem[],
  reviewedItem: LearningQueueItem,
  response: ApiReviewCardResponse,
  allowReinsert: boolean,
) {
  const remainingQueue = queue
    .slice(1)
    .filter((queuedItem) => queuedItem.card.id !== reviewedItem.card.id);

  if (!allowReinsert) return remainingQueue;

  const range = getReinsertRange(response);
  if (!range) return remainingQueue;

  return insertCardLater(
    remainingQueue,
    {
      ...reviewedItem,
      card: response.card,
    },
    range[0],
    range[1],
  );
}

export function getLearningCounts(set: ApiSetDetail | null | undefined): LearningCounts {
  if (!set) {
    return {
      totalCards: 0,
      readyCards: 0,
      difficultCards: 0,
      learningCards: 0,
      learnedCards: 0,
    };
  }

  if (set.flashcards.length > 0) {
    const totalCards = set.flashcards.length;
    const learnedCards = set.flashcards.filter(isCardLearned).length;
    const difficultCards = set.flashcards.filter(
      (card) => !isCardLearned(card) && card.learningStage === -1,
    ).length;
    const readyCards = set.flashcards.filter(isCardUnlearned).length;
    const learningCards = Math.max(totalCards - learnedCards - difficultCards, 0);

    return {
      totalCards,
      readyCards,
      difficultCards,
      learningCards,
      learnedCards,
    };
  }

  return getLearningCountsFromSummary(set.progressSummary);
}

export function getLearningCountsFromSummary(summary: ApiProgressSummary): LearningCounts {
  const totalCards = summary.cardCount;
  const learnedCards = summary.learnedCount;
  const difficultCards = summary.difficultCount;
  const readyCards = Math.max(totalCards - learnedCards, 0);
  const learningCards = Math.max(totalCards - learnedCards - difficultCards, 0);

  return {
    totalCards,
    readyCards,
    difficultCards,
    learningCards,
    learnedCards,
  };
}

export function isCardUnlearned(card: ApiFlashcard) {
  return !isCardLearned(card);
}

export function isCardLearned(card: ApiFlashcard) {
  return card.isLearned || card.learningStage >= 3;
}

function createSessionQueue(cards: ApiFlashcard[], limit = cards.length): LearningQueueItem[] {
  return shuffleSessionItems(
    cards.flatMap((card, index) =>
      isCardUnlearned(card)
        ? [
            {
              card,
              index,
              key: card.id,
            },
          ]
        : [],
    ),
  ).slice(0, limit);
}

function getReinsertRange(response: ApiReviewCardResponse): [number, number] | null {
  if (response.decision === 'know') {
    if (response.previousStage <= 0) return [10, 20];
    if (response.previousStage === 1) return [40, 50];

    return null;
  }

  if (response.previousStage === -1 || response.card.reviewAgainStreak >= 2) {
    return [3, 5];
  }

  return [5, 10];
}

function insertCardLater(
  queue: LearningQueueItem[],
  item: LearningQueueItem,
  min: number,
  max: number,
): LearningQueueItem[] {
  const queueWithoutDuplicate = queue.filter((queuedItem) => queuedItem.card.id !== item.card.id);
  const delay = getRandomDelay(min, max);
  const insertIndex = Math.min(delay, queueWithoutDuplicate.length);

  return [
    ...queueWithoutDuplicate.slice(0, insertIndex),
    item,
    ...queueWithoutDuplicate.slice(insertIndex),
  ];
}

function shuffleSessionItems<T>(items: T[]): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

function getRandomDelay(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
