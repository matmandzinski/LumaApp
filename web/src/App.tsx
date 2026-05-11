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

const QUICK_LESSON_CARD_LIMIT = 5;

type LearningSessionItem = {
  card: Flashcard;
  index: number;
};

function toLearningCard(card: Flashcard, index: number, setId: string) {
  return {
    id: `${setId}-${index}-${card.front}-${card.back}`,
    label: `Card ${index + 1}`,
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

function createSessionQueue(set: FlashcardSet, limit = set.flashcards.length): LearningSessionItem[] {
  const sessionItems = set.flashcards.map((card, index) => ({ card, index }));
  return shuffleSessionItems(sessionItems).slice(0, limit);
}

function moveActiveCardToEnd(queue: LearningSessionItem[]): LearningSessionItem[] {
  if (queue.length <= 1) return queue;

  const [repeatedCard, ...remainingCards] = queue;
  return [...remainingCards, repeatedCard];
}

export function App() {
  const initialSet = defaultSets[0];
  const [activeTab, setActiveTab] = useState<AppViewId>("home");
  const [homeRoute, setHomeRoute] = useState<HomeRoute>("dashboard");
  const [setsRoute, setSetsRoute] = useState<SetsRoute>("list");
  const [selectedSet, setSelectedSet] = useState<FlashcardSet>(initialSet);
  const [viewedSet, setViewedSet] = useState<FlashcardSet>(initialSet);
  const [quickLessonCompleted, setQuickLessonCompleted] = useState(false);
  const [quickLessonReviewedCount, setQuickLessonReviewedCount] = useState(0);
  const [quickLessonQueue, setQuickLessonQueue] = useState<LearningSessionItem[]>([]);
  const [learningPassedCount, setLearningPassedCount] = useState(0);
  const [learningQueue, setLearningQueue] = useState<LearningSessionItem[]>([]);

  const quickLessonCardTotal = Math.min(QUICK_LESSON_CARD_LIMIT, selectedSet.flashcards.length);
  const learningCardTotal = selectedSet.flashcards.length;

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
        (homeRoute === "quickLesson" || homeRoute === "continueLearning")
      ),
    [activeTab, homeRoute],
  );

  useEffect(() => {
    if (
      homeRoute !== "quickLesson" ||
      quickLessonCardTotal === 0 ||
      quickLessonReviewedCount < quickLessonCardTotal
    ) {
      return;
    }

    setQuickLessonCompleted(true);
    setHomeRoute("quickLessonCompleted");
  }, [homeRoute, quickLessonCardTotal, quickLessonReviewedCount]);

  useEffect(() => {
    if (
      homeRoute !== "continueLearning" ||
      learningCardTotal === 0 ||
      learningQueue.length > 0 ||
      learningPassedCount < learningCardTotal
    ) {
      return;
    }

    setHomeRoute("learningCompleted");
  }, [homeRoute, learningCardTotal, learningPassedCount, learningQueue.length]);

  function openTab(tab: TabId) {
    setActiveTab(tab);
    if (tab === "home") setHomeRoute("dashboard");
    if (tab === "sets") setSetsRoute("list");
  }

  function openProfileSettings() {
    setActiveTab("settings");
  }

  function selectSet(set: FlashcardSet) {
    setSelectedSet(set);
    setViewedSet(set);
    setQuickLessonCompleted(false);
    setQuickLessonReviewedCount(0);
    setQuickLessonQueue([]);
    setLearningPassedCount(0);
    setLearningQueue([]);
  }

  function openSetDetails(set: FlashcardSet) {
    setViewedSet(set);
    setSetsRoute("details");
  }

  function startQuickLesson() {
    setQuickLessonCompleted(false);
    setQuickLessonReviewedCount(0);
    setQuickLessonQueue(createSessionQueue(selectedSet, QUICK_LESSON_CARD_LIMIT));
    setHomeRoute("quickLesson");
  }

  function startContinueLearning() {
    if (learningQueue.length === 0 || learningPassedCount >= learningCardTotal) {
      setLearningPassedCount(0);
      setLearningQueue(createSessionQueue(selectedSet));
    }

    setHomeRoute("continueLearning");
  }

  function passQuickLessonCard() {
    setQuickLessonQueue((queue) => queue.slice(1));
    setQuickLessonReviewedCount((reviewedCount) =>
      Math.min(reviewedCount + 1, quickLessonCardTotal),
    );
  }

  function repeatQuickLessonCard() {
    setQuickLessonQueue(moveActiveCardToEnd);
    setQuickLessonReviewedCount((reviewedCount) =>
      Math.min(reviewedCount + 1, quickLessonCardTotal),
    );
  }

  function passContinueLearningCard() {
    setLearningQueue((queue) => queue.slice(1));
    setLearningPassedCount((passedCount) => Math.min(passedCount + 1, learningCardTotal));
  }

  function repeatContinueLearningCard() {
    setLearningQueue(moveActiveCardToEnd);
  }

  function exitToDashboard() {
    setActiveTab("home");
    setHomeRoute("dashboard");
  }

  function renderHome() {
    if (homeRoute === "quickLesson") {
      const activeQueueItem = quickLessonQueue[0];
      const nextQueueItem = quickLessonQueue[1];

      if (quickLessonReviewedCount >= quickLessonCardTotal) {
        return (
          <QuickLessonCompletedScreen
            message={`Done. You reviewed ${quickLessonReviewedCount} cards.`}
            onBackHome={() => setHomeRoute("dashboard")}
            onContinueLearning={startContinueLearning}
          />
        );
      }

      if (!activeQueueItem) {
        return (
          <SetDetailsScreen
            set={selectedSet}
            isActive
            onBack={() => setHomeRoute("dashboard")}
            onSetActive={() => selectSet(selectedSet)}
            onStartQuickLesson={startQuickLesson}
          />
        );
      }

      return (
        <LearningScreen
          title={selectedSet.name}
          subtitle="Quick lesson in progress"
          progressLabel={`${quickLessonReviewedCount} / ${quickLessonCardTotal}`}
          progressPercent={(quickLessonReviewedCount / quickLessonCardTotal) * 100}
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
      return (
          <QuickLessonCompletedScreen
          message={`Done. You reviewed ${quickLessonReviewedCount} cards.`}
          onBackHome={() => setHomeRoute("dashboard")}
          onContinueLearning={startContinueLearning}
        />
      );
    }

    if (homeRoute === "continueLearning") {
      const activeQueueItem = learningQueue[0];
      const nextQueueItem = learningQueue[1];

      if (!activeQueueItem && learningPassedCount >= learningCardTotal) {
        return (
          <QuickLessonCompletedScreen
            message={`You finished ${learningCardTotal} cards from ${selectedSet.name}.`}
            onBackHome={() => setHomeRoute("dashboard")}
            onContinueLearning={startContinueLearning}
          />
        );
      }

      return activeQueueItem ? (
        <LearningScreen
          title={selectedSet.name}
          subtitle="Longer focus session."
          progressLabel={`${learningPassedCount} / ${learningCardTotal}`}
          progressPercent={(learningPassedCount / learningCardTotal) * 100}
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
          onBack={() => setHomeRoute("dashboard")}
          onSetActive={() => selectSet(selectedSet)}
          onStartQuickLesson={startQuickLesson}
        />
      );
    }

    if (homeRoute === "learningCompleted") {
      return (
        <QuickLessonCompletedScreen
          message={`You finished ${learningCardTotal} cards from ${selectedSet.name}.`}
          onBackHome={() => setHomeRoute("dashboard")}
          onContinueLearning={startContinueLearning}
        />
      );
    }

    if (homeRoute === "setDetails") {
      return (
        <SetDetailsScreen
          set={selectedSet}
          isActive
          onBack={() => setHomeRoute("dashboard")}
          onSetActive={() => selectSet(selectedSet)}
          onStartQuickLesson={startQuickLesson}
        />
      );
    }

    if (homeRoute === "readyMade") {
      return <ReadyMadeSetsScreen onBack={() => setHomeRoute("dashboard")} />;
    }

    return (
      <HomeScreen
        activeSetName={selectedSet.name}
        activeSetCardCount={selectedSet.flashcards.length}
        continueCardCount={learningQueue.length > 0 ? learningQueue.length : learningCardTotal}
        quickLessonCardCount={quickLessonCardTotal}
        quickLessonState={quickLessonCompleted ? "completed" : "ready"}
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
          onBack={() => setSetsRoute("list")}
          onSetActive={() => selectSet(viewedSet)}
          onStartQuickLesson={() => {
            setActiveTab("home");
            startQuickLesson();
          }}
        />
      );
    }
    return (
      <SetsScreen
        sets={defaultSets}
        activeSetId={selectedSet.id}
        onOpenSetDetails={openSetDetails}
      />
    );
  }

  return (
    <AppChrome
      activeTab={activeTab}
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
