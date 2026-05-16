import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { AppButton } from "../components/ui";

type LearningCard = {
  id: string;
  label: string;
  term: string;
  prompt: string;
  answer: string;
};

type LearningScreenProps = {
  title: string;
  subtitle: string;
  progressLabel: string;
  progressPercent: number;
  card: LearningCard;
  nextCard?: LearningCard | null;
  passLabel: string;
  onPass: () => void;
  onExit: () => void;
  onRepeat?: () => void;
};

type ExitAction = "pass" | "repeat";

const CARD_EXIT_DURATION_MS = 440;
const REDUCED_MOTION_CARD_EXIT_DURATION_MS = 120;
const MAX_PROGRESS_PILLS = 8;

function getCardExitDuration() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? REDUCED_MOTION_CARD_EXIT_DURATION_MS
    : CARD_EXIT_DURATION_MS;
}

function getProgressParts(progressLabel: string) {
  const [completedText, totalText] = progressLabel.split("/").map((part) => part.trim());
  const completed = Number.parseInt(completedText, 10);
  const total = Number.parseInt(totalText, 10);

  return {
    completed: Number.isFinite(completed) ? completed : 0,
    total: Number.isFinite(total) ? total : 0,
  };
}

export function LearningScreen({
  title,
  subtitle,
  progressLabel,
  progressPercent,
  card,
  nextCard,
  passLabel,
  onPass,
  onExit,
  onRepeat,
}: LearningScreenProps) {
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [displayCard, setDisplayCard] = useState(card);
  const [displayNextCard, setDisplayNextCard] = useState<LearningCard | null>(nextCard ?? null);
  const [processingAction, setProcessingAction] = useState<ExitAction | null>(null);
  const [exitAction, setExitAction] = useState<ExitAction | null>(null);
  const actionLockedRef = useRef(false);
  const exitTimeoutRef = useRef<number | null>(null);
  const exitFrameRef = useRef<number | null>(null);
  const transitionNextCardRef = useRef<LearningCard | null>(null);
  const boundedProgress = Math.min(Math.max(progressPercent, 0), 100);
  const { completed, total } = getProgressParts(progressLabel);
  const activeCardPosition = total > 0 ? Math.min(completed + 1, total) : 1;
  const progressPillCount = total > 0 ? Math.min(total, MAX_PROGRESS_PILLS) : MAX_PROGRESS_PILLS;
  const activePillCount =
    total > MAX_PROGRESS_PILLS
      ? Math.max(1, Math.ceil((activeCardPosition / total) * progressPillCount))
      : activeCardPosition;
  const lessonProgressLabel = total > 0 ? `Card ${activeCardPosition} of ${total}` : progressLabel;
  const isProcessingAction = processingAction !== null;
  const isDisplayCardRevealed = revealedCardId === displayCard.id;
  const nextCardId = nextCard?.id ?? null;

  useEffect(() => {
    if (card.id === displayCard.id) {
      if (!actionLockedRef.current) {
        const incomingNextCard = nextCard ?? null;

        setDisplayNextCard((currentNextCard) =>
          currentNextCard?.id === incomingNextCard?.id ? currentNextCard : incomingNextCard,
        );
      }

      return;
    }

    setDisplayCard(card);
    setDisplayNextCard(nextCard ?? null);
    setRevealedCardId(null);
    setProcessingAction(null);
    setExitAction(null);
    transitionNextCardRef.current = null;
    actionLockedRef.current = false;

    if (exitFrameRef.current !== null) {
      window.cancelAnimationFrame(exitFrameRef.current);
      exitFrameRef.current = null;
    }

    if (exitTimeoutRef.current !== null) {
      window.clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = null;
    }
  }, [card.id, nextCardId]);

  useEffect(
    () => () => {
      if (exitFrameRef.current !== null) {
        window.cancelAnimationFrame(exitFrameRef.current);
      }

      if (exitTimeoutRef.current !== null) {
        window.clearTimeout(exitTimeoutRef.current);
      }
    },
    [],
  );

  function handleCardAction(action: ExitAction, onComplete?: () => void) {
    if (!onComplete || actionLockedRef.current) return;

    actionLockedRef.current = true;
    transitionNextCardRef.current = displayNextCard;
    setProcessingAction(action);

    exitFrameRef.current = window.requestAnimationFrame(() => {
      exitFrameRef.current = null;
      setExitAction(action);

      exitTimeoutRef.current = window.setTimeout(() => {
        exitTimeoutRef.current = null;
        const promotedCard = transitionNextCardRef.current;

        if (promotedCard) {
          setDisplayCard(promotedCard);
          setDisplayNextCard(null);
        }

        setRevealedCardId(null);
        setProcessingAction(null);
        setExitAction(null);
        transitionNextCardRef.current = null;
        onComplete();
        actionLockedRef.current = false;
      }, getCardExitDuration());
    });
  }

  function handlePass() {
    handleCardAction("pass", onPass);
  }

  function handleRepeat() {
    handleCardAction("repeat", onRepeat);
  }

  function handleExit() {
    if (actionLockedRef.current) return;

    setRevealedCardId(null);
    onExit();
  }

  return (
    <div className="screen-content lesson-screen">
      <header className="learning-top">
        <button
          type="button"
          className="lesson-icon-button"
          aria-label="Close lesson"
          onClick={handleExit}
          disabled={isProcessingAction}
        >
          &times;
        </button>
        <div className="lesson-brand">LingoFlow</div>
        <button
          type="button"
          className="lesson-icon-button"
          aria-label="Lesson options"
          disabled={isProcessingAction}
        >
          &#8943;
        </button>
      </header>

      <section className="lesson-meta">
        <div className="set-name">{title}</div>
        <div
          className="progress-pills"
          aria-label={`Progress ${progressLabel}, ${Math.round(boundedProgress)} percent complete`}
        >
          {Array.from({ length: progressPillCount }, (_, index) => (
            <span
              className={`pill ${index < activePillCount ? "done" : ""}`}
              key={`progress-pill-${index}`}
            />
          ))}
        </div>
        <div className="progress-label">{lessonProgressLabel}</div>
      </section>

      <section className="lesson-main">
        <div className="flashcard-stack">
          {displayNextCard ? (
            <div
              key={`next-${displayNextCard.id}`}
              className={`card learning-card flashcard next-card ${
                isProcessingAction ? "preview-ready" : ""
              }`.trim()}
              aria-hidden="true"
            >
              <span className="flashcard-inner">
                {isProcessingAction ? (
                  <FlashcardFaces card={displayNextCard} isRevealed={false} />
                ) : null}
              </span>
            </div>
          ) : null}

          <button
            key={`current-${displayCard.id}`}
            type="button"
            className={`card learning-card flashcard current-card ${
              isDisplayCardRevealed ? "revealed" : ""
            } ${
              processingAction ? `processing-${processingAction}` : ""
            } ${
              exitAction ? `is-exiting exiting-${exitAction}` : ""
            }`.trim()}
            onClick={() => {
              if (!isProcessingAction) {
                setRevealedCardId((revealedId) =>
                  revealedId === displayCard.id ? null : displayCard.id,
                );
              }
            }}
            aria-pressed={isDisplayCardRevealed}
            disabled={isProcessingAction}
          >
            <span className="flashcard-inner">
              <FlashcardFaces card={displayCard} isRevealed={isDisplayCardRevealed} />
            </span>
          </button>
        </div>

        <div className="learning-actions">
          <AppButton
            variant="secondary"
            onClick={handleRepeat}
            disabled={!onRepeat || isProcessingAction}
          >
            Review again
          </AppButton>
          <AppButton onClick={handlePass} disabled={isProcessingAction}>
            {passLabel}
          </AppButton>
        </div>

        <div className="bottom-note">{subtitle}</div>
      </section>
    </div>
  );
}

type FlashcardFacesProps = {
  card: LearningCard;
  isRevealed: boolean;
};

const FlashcardFaces = memo(function FlashcardFaces({ card, isRevealed }: FlashcardFacesProps) {
  const termStyle = getLearningTextStyle(card.term);

  return (
    <>
      <span className="flashcard-face flashcard-front" aria-hidden={isRevealed}>
        <span className="card-number">{card.label}</span>
        <span className="learning-term" style={termStyle}>{card.term}</span>
        <span className="learning-answer">
          <span className="hint-dot" />
          {card.prompt}
        </span>
      </span>
      <span className="flashcard-face flashcard-back" aria-hidden={!isRevealed}>
        <span className="card-number">{card.label}</span>
        <span className="learning-definition">{card.answer}</span>
        <span className="learning-answer">Tap to view term</span>
      </span>
    </>
  );
});

function getLearningTextStyle(text: string): CSSProperties {
  const normalizedText = text.trim();
  const longestWordLength = normalizedText
    .split(/\s+/)
    .reduce((maxLength, word) => Math.max(maxLength, word.length), 0);
  const size = 2.35 - Math.max(0, longestWordLength - 12) * 0.09 - Math.max(0, normalizedText.length - 28) * 0.025;

  return {
    "--learning-term-size": `${Math.max(1.48, size).toFixed(2)}rem`,
  } as CSSProperties;
}
