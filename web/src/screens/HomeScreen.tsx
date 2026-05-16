type QuickLessonState = "ready" | "completed";

type HomeScreenProps = {
  activeSetName: string;
  activeSetCardCount: number;
  quickLessonCardCount: number;
  quickLessonState: QuickLessonState;
  onBrowseSets: () => void;
  onStartQuickLesson: () => void;
  onContinueLearning: () => void;
  onOpenActiveSet: () => void;
};

export function HomeScreen({
  activeSetName,
  activeSetCardCount,
  quickLessonCardCount,
  quickLessonState,
  onBrowseSets,
  onStartQuickLesson,
  onContinueLearning,
  onOpenActiveSet,
}: HomeScreenProps) {
  const quickLessonIsComplete = quickLessonState === "completed";

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

        <article className="streak-card" aria-label="12 day streak">
          <FlameIcon />
          <strong>12</strong>
          <span>days</span>
        </article>
      </section>

      <section className={`premium-quick-card ${quickLessonState}`}>
        <div className="quick-lightning-badge" aria-hidden>
          {quickLessonIsComplete ? <CheckIcon /> : <LightningIcon />}
        </div>

        <div className="quick-card-content">
          {quickLessonIsComplete ? (
            <div className="quick-complete-pill">
              <span aria-hidden>
                <CheckIcon />
              </span>
              Quick lesson completed
            </div>
          ) : (
            <div className="quick-meta-pill">
              <span aria-hidden />
              {quickLessonCardCount} cards - about 2 min
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
            {quickLessonIsComplete
              ? "Your quick lesson is complete. You can keep learning below, or take a break and come back for the next one later."
              : "Review five cards from your active deck. Calm, focused, and done fast."}
          </p>

          <button
            type="button"
            className="start-now-btn"
            onClick={onStartQuickLesson}
            disabled={quickLessonIsComplete}
          >
            {quickLessonIsComplete ? "Done for now" : "Start now"}
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
            <span className="premium-label">Active deck</span>
            <span className="active-deck-row">
              <span className="active-deck-name">{activeSetName}</span>
              <span className="active-deck-count">{activeSetCardCount} cards</span>
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
            <span className="practice-card-count">{activeSetCardCount} cards ready</span>
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
