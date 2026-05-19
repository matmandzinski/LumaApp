import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AppButton } from "../components/ui";
import appLogoUrl from "../../../Resources/AppLogo/LUMA-logo.png";

type LearningCard = {
  id: string;
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
const CARD_RETURN_DURATION_MS = 260;
const REDUCED_MOTION_CARD_RETURN_DURATION_MS = 80;
const MAX_PROGRESS_PILLS = 8;
const SWIPE_TRIGGER_THRESHOLD_PX = 104;
const TAP_MOVEMENT_THRESHOLD_PX = 8;
const MAX_SWIPE_ROTATION_DEG = 4.5;

type DragState = {
  x: number;
  isDragging: boolean;
  isReturning: boolean;
};

type DragTracking = {
  hasDragged: boolean;
  pointerId: number;
  startX: number;
  startY: number;
};

function getCardExitDuration() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? REDUCED_MOTION_CARD_EXIT_DURATION_MS
    : CARD_EXIT_DURATION_MS;
}

function getCardReturnDuration() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? REDUCED_MOTION_CARD_RETURN_DURATION_MS
    : CARD_RETURN_DURATION_MS;
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
  const [dragState, setDragState] = useState<DragState>({
    x: 0,
    isDragging: false,
    isReturning: false,
  });
  const actionLockedRef = useRef(false);
  const dragTrackingRef = useRef<DragTracking | null>(null);
  const suppressClickRef = useRef(false);
  const exitTimeoutRef = useRef<number | null>(null);
  const exitFrameRef = useRef<number | null>(null);
  const returnTimeoutRef = useRef<number | null>(null);
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
  const isInteractionPaused = isProcessingAction || dragState.isReturning;
  const isDisplayCardRevealed = revealedCardId === displayCard.id;
  const nextCardId = nextCard?.id ?? null;
  const swipeDirection = dragState.x > 0 ? "pass" : dragState.x < 0 ? "repeat" : null;
  const swipeProgress = Math.min(Math.abs(dragState.x) / SWIPE_TRIGGER_THRESHOLD_PX, 1);
  const swipeIndicatorOpacity = Math.max(0, (swipeProgress - 0.18) / 0.82);
  const swipeTintProgress = Math.min(Math.max((swipeProgress - 0.04) / 0.96, 0), 1);
  const swipeTintStrength = Math.pow(swipeTintProgress, 1.18);
  const passTintStrength = swipeDirection === "pass" ? swipeTintStrength : 0;
  const repeatTintStrength = swipeDirection === "repeat" ? swipeTintStrength : 0;
  const swipeRotation =
    Math.max(-1, Math.min(1, dragState.x / SWIPE_TRIGGER_THRESHOLD_PX)) *
    MAX_SWIPE_ROTATION_DEG;
  const swipeReadyClass =
    dragState.x >= SWIPE_TRIGGER_THRESHOLD_PX
      ? "swipe-ready-pass"
      : dragState.x <= -SWIPE_TRIGGER_THRESHOLD_PX
        ? "swipe-ready-repeat"
        : "";
  const currentCardStyle = {
    "--swipe-x": `${dragState.x}px`,
    "--swipe-rotate": `${swipeRotation.toFixed(2)}deg`,
    "--swipe-exit-start-x": `${dragState.x}px`,
    "--swipe-exit-start-rotate": `${swipeRotation.toFixed(2)}deg`,
    "--swipe-pass-opacity": swipeDirection === "pass" ? swipeIndicatorOpacity : 0,
    "--swipe-repeat-opacity": swipeDirection === "repeat" ? swipeIndicatorOpacity : 0,
    "--swipe-pass-face-alpha": (passTintStrength * 0.18).toFixed(3),
    "--swipe-repeat-face-alpha": (repeatTintStrength * 0.16).toFixed(3),
    "--swipe-pass-border-alpha": (passTintStrength * 0.32).toFixed(3),
    "--swipe-repeat-border-alpha": (repeatTintStrength * 0.3).toFixed(3),
    "--swipe-pass-glow-alpha": (passTintStrength * 0.18).toFixed(3),
    "--swipe-repeat-glow-alpha": (repeatTintStrength * 0.15).toFixed(3),
  } as CSSProperties;

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
    setDragState({ x: 0, isDragging: false, isReturning: false });
    transitionNextCardRef.current = null;
    actionLockedRef.current = false;
    dragTrackingRef.current = null;
    suppressClickRef.current = false;

    if (exitFrameRef.current !== null) {
      window.cancelAnimationFrame(exitFrameRef.current);
      exitFrameRef.current = null;
    }

    if (exitTimeoutRef.current !== null) {
      window.clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = null;
    }

    if (returnTimeoutRef.current !== null) {
      window.clearTimeout(returnTimeoutRef.current);
      returnTimeoutRef.current = null;
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

      if (returnTimeoutRef.current !== null) {
        window.clearTimeout(returnTimeoutRef.current);
      }
    },
    [],
  );

  function clearReturnTimeout() {
    if (returnTimeoutRef.current === null) return;

    window.clearTimeout(returnTimeoutRef.current);
    returnTimeoutRef.current = null;
  }

  function returnCardToCenter() {
    clearReturnTimeout();
    setDragState({ x: 0, isDragging: false, isReturning: true });

    returnTimeoutRef.current = window.setTimeout(() => {
      returnTimeoutRef.current = null;
      suppressClickRef.current = false;
      setDragState({ x: 0, isDragging: false, isReturning: false });
    }, getCardReturnDuration());
  }

  function handleCardAction(action: ExitAction, onComplete?: () => void, exitStartX = 0) {
    if (!onComplete || actionLockedRef.current) return;

    clearReturnTimeout();
    actionLockedRef.current = true;
    transitionNextCardRef.current = displayNextCard;
    setDragState({ x: exitStartX, isDragging: false, isReturning: false });
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
        setDragState({ x: 0, isDragging: false, isReturning: false });
        transitionNextCardRef.current = null;
        suppressClickRef.current = false;
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

  function releasePointerCapture(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleCardPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (isInteractionPaused || actionLockedRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    clearReturnTimeout();
    suppressClickRef.current = false;
    dragTrackingRef.current = {
      hasDragged: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCardPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const tracking = dragTrackingRef.current;
    if (!tracking || tracking.pointerId !== event.pointerId || isInteractionPaused) return;

    const deltaX = event.clientX - tracking.startX;
    const deltaY = event.clientY - tracking.startY;
    const isHorizontalDrag =
      Math.abs(deltaX) >= TAP_MOVEMENT_THRESHOLD_PX &&
      Math.abs(deltaX) > Math.abs(deltaY) * 0.65;

    if (!tracking.hasDragged && !isHorizontalDrag) return;

    tracking.hasDragged = true;
    suppressClickRef.current = true;
    event.preventDefault();
    setDragState({ x: deltaX, isDragging: true, isReturning: false });
  }

  function handleCardPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const tracking = dragTrackingRef.current;
    if (!tracking || tracking.pointerId !== event.pointerId) return;

    releasePointerCapture(event);
    dragTrackingRef.current = null;

    if (!tracking.hasDragged) {
      setDragState({ x: 0, isDragging: false, isReturning: false });
      return;
    }

    const deltaX = event.clientX - tracking.startX;
    const action = deltaX > 0 ? "pass" : "repeat";
    const onComplete = action === "pass" ? onPass : onRepeat;
    suppressClickRef.current = true;

    if (Math.abs(deltaX) < SWIPE_TRIGGER_THRESHOLD_PX || !onComplete) {
      returnCardToCenter();
      return;
    }

    handleCardAction(action, onComplete, deltaX);
  }

  function handleCardPointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    const tracking = dragTrackingRef.current;
    if (!tracking || tracking.pointerId !== event.pointerId) return;

    releasePointerCapture(event);
    dragTrackingRef.current = null;

    if (tracking.hasDragged) {
      returnCardToCenter();
      return;
    }

    setDragState({ x: 0, isDragging: false, isReturning: false });
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
        <div className="lesson-brand">
          <img className="lesson-brand-logo" src={appLogoUrl} alt="LumaApp" />
        </div>
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
            } ${
              dragState.isDragging ? "is-dragging" : ""
            } ${
              dragState.isReturning ? "is-returning" : ""
            } ${
              swipeReadyClass
            }`.trim()}
            style={currentCardStyle}
            onPointerDown={handleCardPointerDown}
            onPointerMove={handleCardPointerMove}
            onPointerUp={handleCardPointerUp}
            onPointerCancel={handleCardPointerCancel}
            onClick={(event) => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                event.preventDefault();
                return;
              }

              if (!isInteractionPaused) {
                setRevealedCardId((revealedId) =>
                  revealedId === displayCard.id ? null : displayCard.id,
                );
              }
            }}
            aria-pressed={isDisplayCardRevealed}
            disabled={isProcessingAction}
          >
            <span className="swipe-feedback swipe-feedback-repeat" aria-hidden="true">
              Review again
            </span>
            <span className="swipe-feedback swipe-feedback-pass" aria-hidden="true">
              Know it
            </span>
            <span className="flashcard-inner">
              <FlashcardFaces card={displayCard} isRevealed={isDisplayCardRevealed} />
            </span>
          </button>
        </div>

        <div className="learning-actions">
          <AppButton
            variant="secondary"
            onClick={handleRepeat}
            disabled={!onRepeat || isInteractionPaused}
          >
            Review again
          </AppButton>
          <AppButton onClick={handlePass} disabled={isInteractionPaused}>
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
        <span className="learning-term" style={termStyle}>{card.term}</span>
        <span className="learning-answer">{card.prompt}</span>
      </span>
      <span className="flashcard-face flashcard-back" aria-hidden={!isRevealed}>
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
