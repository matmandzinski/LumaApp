type QuickLessonState = "ready" | "completed" | "caughtUp";

type HomeScreenProps = {
  activeSetName: string;
  activeSetCardCount: number;
  currentStreak: number;
  difficultCardCount: number;
  learnedCardCount: number;
  learningCardCount: number;
  practiceCardsLabel: string;
  quickLessonCardCount: number;
  quickLessonCanReset: boolean;
  quickLessonLabel: string;
  quickLessonState: QuickLessonState;
  onBrowseSets: () => void;
  onStartQuickLesson: () => void;
  onContinueLearning: () => void;
  onOpenActiveSet: () => void;
  onResetActiveSet: () => void;
};

export function HomeScreen({
  activeSetName,
  activeSetCardCount,
  currentStreak,
  difficultCardCount,
  learnedCardCount,
  learningCardCount,
  practiceCardsLabel,
  quickLessonCardCount,
  quickLessonCanReset,
  quickLessonLabel,
  quickLessonState,
  onBrowseSets,
  onStartQuickLesson,
  onContinueLearning,
  onOpenActiveSet,
  onResetActiveSet,
}: HomeScreenProps) {
  const quickLessonIsComplete = quickLessonState === "completed";
  const quickLessonIsCaughtUp = quickLessonState === "caughtUp";
  const quickLessonCanStart = !quickLessonIsComplete && !quickLessonIsCaughtUp;
  const quickLessonActionDisabled =
    quickLessonIsComplete || (quickLessonIsCaughtUp && !quickLessonCanReset);
  const streakLabel = formatHomeStreakLabel(currentStreak);
  const quickLessonActionLabel = quickLessonIsCaughtUp
    ? quickLessonCanReset
      ? "Reset set progress"
      : "All caught up"
    : quickLessonIsComplete
      ? "Done for now"
      : "Start now";

  return (
    <div className="screen-content home-screen">
      <section className="home-hero" aria-labelledby="home-title">
        <div>
          <p className="home-greeting">Good morning, Mateusz</p>
          <h1 className="home-headline" id="home-title">
            Tiny steps.
            <br />
            Big <span>progress.</span>
          </h1>
        </div>

        <article className="streak-card" aria-label={`Learning streak: ${streakLabel}`}>
          <FlameIcon />
          <strong className={currentStreak === 0 ? "streak-card-word" : undefined}>
            {currentStreak === 0 ? "Start" : currentStreak}
          </strong>
          <span>{currentStreak === 0 ? "today" : currentStreak === 1 ? "day" : "days"}</span>
        </article>
      </section>

      <section className={`premium-quick-card ${quickLessonState}`}>
        <div className="quick-lightning-badge" aria-hidden>
          {quickLessonIsComplete || quickLessonIsCaughtUp ? <CheckIcon /> : <LightningIcon />}
        </div>

        <div className="quick-card-content">
          {quickLessonIsComplete || quickLessonIsCaughtUp ? (
            <div className="quick-complete-pill">
              <span aria-hidden>
                <CheckIcon />
              </span>
              {quickLessonIsCaughtUp ? "All caught up" : "Quick lesson completed"}
            </div>
          ) : (
            <div className="quick-meta-pill">
              <span aria-hidden />
              {quickLessonLabel}
            </div>
          )}

          {quickLessonIsComplete ? (
            <h2 className="quick-title quick-title-complete">Good work!</h2>
          ) : (
            <h2 className="quick-title">
              Quick
              <br />
              Lesson
            </h2>
          )}
          <p className="quick-description">
            {quickLessonIsCaughtUp
              ? quickLessonCanReset
                ? "All cards in this deck are learned. Change the set or reset this set to learn it again."
                : "This deck has no cards ready right now. Change the set or add cards to practice."
              : quickLessonIsComplete
                ? "Your quick lesson is complete. You can keep learning below, or take a break and come back for the next one later."
                : `Review up to ${quickLessonCardCount} cards from your active deck. Calm, focused, and done fast.`}
          </p>

          <button
            type="button"
            className="start-now-btn"
            onClick={quickLessonCanStart ? onStartQuickLesson : onResetActiveSet}
            disabled={quickLessonActionDisabled}
          >
            {quickLessonActionLabel}
          </button>
        </div>
      </section>

      <div className="section-head">
        <div className="section-label">Your learning</div>
        <div className="section-link">Overview</div>
      </div>

      <article className="active-deck-card">
        <button type="button" className="active-deck-main" onClick={onOpenActiveSet}>
          <span className="active-deck-copy">
            <span className="premium-label">Active set</span>
            <span className="active-deck-row">
              <span className="active-deck-name">{activeSetName}</span>
              <span className="active-deck-count">{activeSetCardCount} cards</span>
            </span>
            <span className="active-deck-progress">
              {learnedCardCount} learned - {learningCardCount} learning - {difficultCardCount} difficult
            </span>
          </span>
        </button>
        <button type="button" className="change-deck-btn" onClick={onBrowseSets}>
          Change
        </button>
      </article>

      <section className="dashboard-action-grid" aria-label="Learning actions">
        <button type="button" className="practice-card" onClick={onContinueLearning}>
          <span className="practice-card-copy">
            <span className="practice-card-title">Practice cards</span>
            <span className="practice-card-subtitle">
              Review cards from your active set at your own pace.
            </span>
            <span className="practice-card-count">{practiceCardsLabel}</span>
          </span>
          <span className="practice-card-icon" aria-hidden>
            <PlayIcon />
          </span>
        </button>

        <button type="button" className="mini-action-card" onClick={onBrowseSets}>
          <span className="mini-action-top">
            <span>
              <span className="mini-action-title">Browse sets</span>
              <span className="mini-action-subtitle">Explore your decks and ready-made packs.</span>
            </span>
            <span className="mini-action-icon" aria-hidden>
              <GridIcon />
            </span>
          </span>
          <span className="mini-action-subtitle">{activeSetCardCount} cards active</span>
        </button>
      </section>
    </div>
  );
}

function formatHomeStreakLabel(currentStreak: number) {
  if (currentStreak <= 0) return "Start today";
  if (currentStreak === 1) return "1 day";
  return `${currentStreak} days`;
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
      <path d="M12.4 3.7c.2 2.9 2.7 4 4 6.2 1.7 2.8.8 7.2-2.9 8.4 1-2 .2-3.4-1.1-4.7-.6 2.4-2.3 3.4-4 4 .6-1.5-.2-2.6-.8-3.6-1.3-2.3-.5-5 1.8-6.6.4 1.5 1.2 2.4 2.1 3 .4-2.3-.8-4.2.9-6.7Z" />
    </svg>
  );
}

function LightningIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
      <path d="m13 2-8 11h6l-1 9 9-12h-6l1-8Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
      <path d="M8 5v14l11-7-11-7Z" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
      <path d="M4.5 4.5h6v6h-6z" />
      <path d="M13.5 4.5h6v6h-6z" />
      <path d="M4.5 13.5h6v6h-6z" />
      <path d="M13.5 13.5h6v6h-6z" />
    </svg>
  );
}
