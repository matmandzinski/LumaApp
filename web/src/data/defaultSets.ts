import defaultSetsJson from "../../../Data/default_sets.json";

export type Flashcard = {
  front: string;
  back: string;
  learningStage: number;
  reviewAgainStreak: number;
  isLearned: boolean;
  lastReviewedAt: string | null;
};

export type FlashcardSetSource = "User" | "ReadyMade";

export type FlashcardSet = {
  id: string;
  name: string;
  source: FlashcardSetSource;
  flashcards: Flashcard[];
  readonly: boolean;
};

type DefaultFlashcardJson = {
  Front: string;
  Back: string;
};

type DefaultSetJson = {
  Name: string;
  Flashcards: DefaultFlashcardJson[];
};

export const defaultSets: FlashcardSet[] = (defaultSetsJson as DefaultSetJson[]).map(
  (set, setIndex) => ({
    id: `default-${setIndex}-${set.Name.toLowerCase().replace(/\s+/g, "-")}`,
    name: set.Name,
    source: "ReadyMade",
    readonly: true,
    flashcards: set.Flashcards.map((card) => ({
      front: card.Front,
      back: card.Back,
      learningStage: 0,
      reviewAgainStreak: 0,
      isLearned: false,
      lastReviewedAt: null,
    })),
  }),
);
