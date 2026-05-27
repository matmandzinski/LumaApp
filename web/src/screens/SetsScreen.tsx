import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { FlashcardSet } from "../data/defaultSets";
import { AppButton, Card, Heading, MetaText } from "../components/ui";

type SetsScreenProps = {
  sets: FlashcardSet[];
  activeSetId: string;
  onCreateSet: (name: string) => Promise<string | null>;
  onDeleteSet: (set: FlashcardSet) => void;
  onOpenSetDetails: (set: FlashcardSet) => void;
  onRenameSet: (set: FlashcardSet, name: string) => Promise<string | null>;
  onResetSetProgress: (set: FlashcardSet) => void;
  onSetActive: (set: FlashcardSet) => void;
};

export function SetsScreen({
  sets,
  activeSetId,
  onCreateSet,
  onDeleteSet,
  onOpenSetDetails,
  onRenameSet,
  onResetSetProgress,
  onSetActive,
}: SetsScreenProps) {
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [openOptionsSetId, setOpenOptionsSetId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<FlashcardSet | null>(null);
  const [renameCandidate, setRenameCandidate] = useState<FlashcardSet | null>(null);
  const { customSets, readyMadeSets } = getSetGroups(sets);
  const totalSetCount = sets.length;

  useEffect(() => {
    if (!openOptionsSetId) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-set-options-root]")) {
        return;
      }

      setOpenOptionsSetId(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openOptionsSetId]);

  return (
    <div className="screen-content sets-page">
      <section className="sets-hero" aria-labelledby="sets-heading">
        <div>
          <h1 className="sets-headline" id="sets-heading">
            Your sets
          </h1>
          <p className="sets-hero-copy">Choose what you want to learn today.</p>
        </div>

        <div className="sets-stat-card" aria-label={formatSetCount(totalSetCount)}>
          <strong>{totalSetCount}</strong>
          <span>{totalSetCount === 1 ? "set" : "sets"}</span>
        </div>
      </section>

      <button
        type="button"
        className="create-set-card"
        aria-label="Create new set"
        onClick={() => setIsCreateSheetOpen(true)}
      >
        <span className="create-set-plus" aria-hidden>
          <PlusIcon />
        </span>
        <span className="create-set-title">Create new set</span>
        <span className="create-set-subtitle">Build your own collection of words and phrases.</span>
      </button>

      <SetsSection
        count={customSets.length}
        helper="Your custom collections"
        title="My sets"
      >
        {customSets.length > 0 ? (
          customSets.map((set, index) => (
            <CollectionCard
              key={set.id}
              set={set}
              isActive={set.id === activeSetId}
              isOptionsOpen={set.id === openOptionsSetId}
              practiceLabel={getPracticeLabel(index)}
              showMenuHint
              onRenameRequest={
                isEditableCustomSet(set)
                  ? () => {
                      setOpenOptionsSetId(null);
                      setRenameCandidate(set);
                    }
                  : undefined
              }
              onDeleteRequest={
                isEditableCustomSet(set)
                  ? () => {
                      setOpenOptionsSetId(null);
                      setDeleteCandidate(set);
                    }
                  : undefined
              }
              onClick={() => onOpenSetDetails(set)}
              onSetActive={() => {
                onSetActive(set);
                setOpenOptionsSetId(null);
              }}
              onResetProgress={() => {
                onResetSetProgress(set);
                setOpenOptionsSetId(null);
              }}
              onToggleOptions={() =>
                setOpenOptionsSetId((currentSetId) => (currentSetId === set.id ? null : set.id))
              }
            />
          ))
        ) : (
          <EmptySetsCard />
        )}
      </SetsSection>

      <SetsSection
        count={readyMadeSets.length}
        helper="Curated sets to start quickly"
        title="Ready-made"
      >
        {readyMadeSets.map((set, index) => (
          <CollectionCard
            key={set.id}
            set={set}
            isActive={set.id === activeSetId}
            isOptionsOpen={set.id === openOptionsSetId}
            practiceLabel={getPracticeLabel(index)}
            showMenuHint
            onClick={() => onOpenSetDetails(set)}
            onSetActive={() => {
              onSetActive(set);
              setOpenOptionsSetId(null);
            }}
            onResetProgress={() => {
              onResetSetProgress(set);
              setOpenOptionsSetId(null);
            }}
            onToggleOptions={() =>
              setOpenOptionsSetId((currentSetId) => (currentSetId === set.id ? null : set.id))
            }
          />
        ))}
      </SetsSection>

      {isCreateSheetOpen ? (
        <CreateSetSheet
          onClose={() => setIsCreateSheetOpen(false)}
          onCreateSet={onCreateSet}
        />
      ) : null}

      {deleteCandidate ? (
        <DeleteSetDialog
          setName={deleteCandidate.name}
          onCancel={() => setDeleteCandidate(null)}
          onConfirm={() => {
            onDeleteSet(deleteCandidate);
            setDeleteCandidate(null);
          }}
        />
      ) : null}

      {renameCandidate ? (
        <RenameSetDialog
          set={renameCandidate}
          onCancel={() => setRenameCandidate(null)}
          onRename={onRenameSet}
        />
      ) : null}
    </div>
  );
}

type SetDetailsScreenProps = {
  isActive: boolean;
  onAddCard: (set: FlashcardSet, card: { front: string; back: string }) => void;
  onDeleteCard: (set: FlashcardSet, cardIndex: number) => void;
  onSetActive: () => void;
  onStartQuickLesson: () => void;
  onUpdateCard: (set: FlashcardSet, cardIndex: number, card: { front: string; back: string }) => void;
  set: FlashcardSet;
};

export function SetDetailsScreen({
  isActive,
  onAddCard,
  onDeleteCard,
  onSetActive,
  onStartQuickLesson,
  onUpdateCard,
  set,
}: SetDetailsScreenProps) {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [cardEditorState, setCardEditorState] = useState<
    { mode: "add" } | { mode: "edit"; cardIndex: number } | null
  >(null);
  const isReadOnly = set.readonly || set.source === "ReadyMade";
  const totalCards = getSetCardCount(set);
  const isLoadingApiCards = set.isApiBacked && totalCards > 0 && set.flashcards.length === 0;
  const editedCard =
    cardEditorState?.mode === "edit" ? set.flashcards[cardEditorState.cardIndex] : null;

  useEffect(() => {
    if (!isOptionsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-set-detail-options-root]")) {
        return;
      }

      setIsOptionsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOptionsOpen]);

  return (
    <div className="screen-content set-detail-screen">
      <section className={`set-summary-card ${isActive ? "is-active" : ""}`} aria-labelledby="set-detail-title">
        {isActive ? <span className="set-summary-indicator" aria-hidden /> : null}
        <div className="set-summary-top">
          <div className="set-summary-title-area">
            <h1 className="set-summary-title" id="set-detail-title">
              {set.name}
            </h1>
            {isActive ? (
              <span className="sets-active-pill set-summary-pill">
                <span aria-hidden />
                Active
              </span>
            ) : null}
          </div>

          <div className="set-summary-options" data-set-detail-options-root>
            <button
              type="button"
              className="set-summary-more"
              aria-label={`Options for ${set.name}`}
              aria-expanded={isOptionsOpen}
              aria-haspopup="menu"
              onClick={() => setIsOptionsOpen((isOpen) => !isOpen)}
            >
              <DotsIcon />
            </button>

            {isOptionsOpen ? (
              <div className="set-detail-options-popover" role="menu">
                <button
                  type="button"
                  className="set-options-row"
                  disabled={isActive}
                  role="menuitem"
                  onClick={() => {
                    onSetActive();
                    setIsOptionsOpen(false);
                  }}
                >
                  {isActive ? "Active set" : "Set as active"}
                </button>
                <button
                  type="button"
                  className="set-options-row"
                  disabled={!isActive || set.flashcards.length === 0}
                  role="menuitem"
                  onClick={() => {
                    onStartQuickLesson();
                    setIsOptionsOpen(false);
                  }}
                >
                  Start quick lesson
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="set-summary-stats" aria-label={`${set.name} summary`}>
          <SetSummaryStat value={totalCards.toString()} label="Cards" />
          <SetSummaryStat value={getLastPracticedLabel(set.id)} label="Practiced" />
          <SetSummaryStat value={getWaitingCount(totalCards).toString()} label="Waiting" />
        </div>
      </section>

      <section className="set-cards-section" aria-labelledby="set-cards-heading">
        <div className="set-cards-section-head">
          <h2 className="set-cards-label" id="set-cards-heading">
            Cards
          </h2>
          <span className="set-cards-count">{totalCards} cards</span>
        </div>

        <div className="set-card-list">
          <button type="button" className="set-card-row add-card-row" onClick={() => setCardEditorState({ mode: "add" })}>
            <span className="add-card-icon" aria-hidden>
              <PlusIcon />
            </span>
            <span className="set-card-row-copy">
              <span className="set-card-row-title">Add card</span>
              <span className="set-card-row-subtitle">Create front and back</span>
            </span>
            <span className="set-card-chevron" aria-hidden>
              <ChevronRightIcon />
            </span>
          </button>

          {set.flashcards.map((card, index) => (
            <button
              type="button"
              className="set-card-row flashcard-detail-row"
              key={`${card.front}-${card.back}-${index}`}
              onClick={() => setCardEditorState({ mode: "edit", cardIndex: index })}
            >
              <span className="set-card-row-copy">
                <span className="set-card-row-title">{card.front}</span>
                <span className="set-card-row-subtitle">{card.back}</span>
              </span>
              <span className="set-card-chevron" aria-hidden>
                <ChevronRightIcon />
              </span>
            </button>
          ))}

          {isLoadingApiCards ? (
            <article className="set-detail-empty-card">
              <p>Loading cards</p>
              <span>Getting this set ready.</span>
            </article>
          ) : null}

          {totalCards === 0 ? (
            <article className="set-detail-empty-card">
              <p>No cards yet</p>
              <span>Add the first front and back pair when you're ready.</span>
            </article>
          ) : null}
        </div>
      </section>

      {cardEditorState ? (
        <CardEditorDialog
          card={editedCard}
          isReadOnly={isReadOnly}
          mode={cardEditorState.mode}
          setName={set.name}
          onClose={() => setCardEditorState(null)}
          onDelete={
            cardEditorState.mode === "edit"
              ? () => {
                  onDeleteCard(set, cardEditorState.cardIndex);
                  setCardEditorState(null);
                }
              : undefined
          }
          onSave={(card) => {
            if (cardEditorState.mode === "add") {
              onAddCard(set, card);
            } else {
              onUpdateCard(set, cardEditorState.cardIndex, card);
            }

            setCardEditorState(null);
          }}
        />
      ) : null}
    </div>
  );
}

function SetSummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="set-summary-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

type CardEditorDialogProps = {
  card: { front: string; back: string } | null;
  isReadOnly: boolean;
  mode: "add" | "edit";
  onClose: () => void;
  onDelete?: () => void;
  onSave: (card: { front: string; back: string }) => void;
  setName: string;
};

function CardEditorDialog({ card, isReadOnly, mode, onClose, onDelete, onSave, setName }: CardEditorDialogProps) {
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");
  const titleId = useId();
  const descriptionId = useId();
  const frontInputId = useId();
  const backInputId = useId();
  const canSave = front.trim().length > 0 && back.trim().length > 0 && !isReadOnly;
  const canDelete = mode === "edit" && !isReadOnly && Boolean(onDelete);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;

    onSave({ front: front.trim(), back: back.trim() });
  }

  return createPortal(
    <div
      className="card-editor-layer"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="card-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onSubmit={handleSubmit}
      >
        <div className="card-editor-header">
          <div>
            <h2 className="card-editor-title" id={titleId}>
              {mode === "add" ? "Add card" : "Edit card"}
            </h2>
            <p className="card-editor-copy" id={descriptionId}>
              {isReadOnly
                ? `${setName} is read-only.`
                : "Create a clear front and back for this set."}
            </p>
          </div>

          <button type="button" className="card-editor-close" aria-label="Close card editor" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <label className="card-editor-label" htmlFor={frontInputId}>
          Front
        </label>
        <textarea
          id={frontInputId}
          className="card-editor-input"
          value={front}
          disabled={isReadOnly}
          rows={3}
          onChange={(event) => setFront(event.target.value)}
        />

        <label className="card-editor-label" htmlFor={backInputId}>
          Back
        </label>
        <textarea
          id={backInputId}
          className="card-editor-input"
          value={back}
          disabled={isReadOnly}
          rows={3}
          onChange={(event) => setBack(event.target.value)}
        />

        <div className="card-editor-actions">
          <button type="button" className="card-editor-button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="card-editor-button primary" disabled={!canSave}>
            Save card
          </button>
        </div>

        {canDelete ? (
          <button type="button" className="card-editor-delete" onClick={onDelete}>
            Delete card
          </button>
        ) : null}
      </form>
    </div>,
    document.body,
  );
}

export function ReadyMadeSetsScreen({ onBack }: { onBack?: () => void }) {
  return (
    <div className="screen-content">
      <header>
        <Heading>Ready-made Sets</Heading>
        <MetaText>Explore topics and add them when useful.</MetaText>
      </header>
      <Card as="article">
        <p className="card-title">Business English Basics</p>
        <MetaText>48 cards</MetaText>
      </Card>
      <Card as="article">
        <p className="card-title">Travel Conversation</p>
        <MetaText>35 cards</MetaText>
      </Card>
      {onBack ? (
        <AppButton variant="secondary" onClick={onBack}>
          Back
        </AppButton>
      ) : null}
    </div>
  );
}

type CollectionCardProps = {
  set: FlashcardSet;
  isActive: boolean;
  isOptionsOpen?: boolean;
  practiceLabel: string;
  showMenuHint?: boolean;
  onClick: () => void;
  onDeleteRequest?: () => void;
  onResetProgress?: () => void;
  onRenameRequest?: () => void;
  onSetActive?: () => void;
  onToggleOptions?: () => void;
};

function CollectionCard({
  set,
  isActive,
  isOptionsOpen = false,
  practiceLabel,
  showMenuHint = false,
  onClick,
  onDeleteRequest,
  onResetProgress,
  onRenameRequest,
  onSetActive,
  onToggleOptions,
}: CollectionCardProps) {
  const learnedCards = getLearnedCardCount(set);
  const totalCards = getSetCardCount(set);
  const progressPercent = totalCards > 0 ? (learnedCards / totalCards) * 100 : 0;
  const progressLabel = `${learnedCards} / ${totalCards} learned`;

  return (
    <div
      className={`sets-card-shell ${isOptionsOpen ? "has-options-open" : ""}`.trim()}
      data-set-options-root={showMenuHint ? "" : undefined}
    >
      <article className={`sets-card ${isActive ? "is-active" : ""}`}>
        <div className="sets-card-top">
          <div className="sets-card-title-wrap">
            <div className="sets-card-title-row">
              <h3 className="sets-card-title">{set.name}</h3>
              {isActive ? (
                <span className="sets-active-pill">
                  <span aria-hidden />
                  Active
                </span>
              ) : null}
            </div>
            <p className="sets-card-meta">
              {totalCards} cards - {practiceLabel}
            </p>
          </div>

          {showMenuHint ? (
            <div className="sets-card-options-zone">
              <button
                type="button"
                className="sets-card-more"
                aria-label={`Options for ${set.name}`}
                aria-expanded={isOptionsOpen}
                aria-haspopup="menu"
                onClick={onToggleOptions}
              >
                <DotsIcon />
              </button>
            </div>
          ) : null}
        </div>

        <div className="sets-card-bottom">
          <span className="sets-progress-summary">
            <span
              className="sets-progress-track"
              role="progressbar"
              aria-label={progressLabel}
              aria-valuemin={0}
              aria-valuemax={totalCards}
              aria-valuenow={learnedCards}
            >
              <span style={{ width: `${progressPercent}%` }} />
            </span>
          </span>
          <button
            type="button"
            className="sets-card-action"
            aria-label={`Open ${set.name}`}
            onClick={onClick}
          >
            <ArrowRightIcon />
          </button>
        </div>
      </article>

      {showMenuHint && isOptionsOpen ? (
        <div className="set-options-popover" role="menu">
          <button
            type="button"
            className="set-options-row"
            disabled={isActive}
            role="menuitem"
            onClick={onSetActive}
          >
            {isActive ? "Active set" : "Set as active"}
          </button>
          <button
            type="button"
            className="set-options-row"
            role="menuitem"
            onClick={onResetProgress}
          >
            Reset set progress
          </button>
          {onRenameRequest ? (
            <button
              type="button"
              className="set-options-row"
              role="menuitem"
              onClick={onRenameRequest}
            >
              Rename set
            </button>
          ) : null}
          {onDeleteRequest ? (
            <button
              type="button"
              className="set-options-row"
              role="menuitem"
              onClick={onDeleteRequest}
            >
              Delete set
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type SetsSectionProps = {
  children: ReactNode;
  count: number;
  helper: string;
  title: string;
};

function SetsSection({ children, count, helper, title }: SetsSectionProps) {
  return (
    <section className="sets-section" aria-labelledby={`sets-section-${title.toLowerCase().replace(/\W+/g, "-")}`}>
      <div className="sets-section-head">
        <div>
          <h2 className="sets-section-label" id={`sets-section-${title.toLowerCase().replace(/\W+/g, "-")}`}>
            {title}
          </h2>
          <p className="sets-section-helper">{helper}</p>
        </div>
        <span className="sets-section-count">{formatSetCount(count)}</span>
      </div>

      <div className="sets-stack">{children}</div>
    </section>
  );
}

function EmptySetsCard() {
  return (
    <article className="sets-empty-card">
      <p className="sets-empty-title">No custom sets yet</p>
      <p className="sets-empty-copy">Create your first set when you want a focused collection of your own.</p>
    </article>
  );
}

type DeleteSetDialogProps = {
  onCancel: () => void;
  onConfirm: () => void;
  setName: string;
};

function DeleteSetDialog({ onCancel, onConfirm, setName }: DeleteSetDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return createPortal(
    <div className="delete-set-dialog-layer">
      <section
        className="delete-set-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 className="delete-set-dialog-title" id={titleId}>
          Delete set?
        </h2>
        <p className="delete-set-dialog-copy" id={descriptionId}>
          This set and all its cards will be removed. This can't be undone.
        </p>
        <div className="delete-set-dialog-actions">
          <button type="button" className="delete-set-dialog-btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="delete-set-dialog-btn primary"
            aria-label={`Delete ${setName}`}
            onClick={onConfirm}
          >
            Delete set
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

type CreateSetSheetProps = {
  onClose: () => void;
  onCreateSet: (name: string) => Promise<string | null>;
};

function CreateSetSheet({ onClose, onCreateSet }: CreateSetSheetProps) {
  const [setName, setSetName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const helperId = useId();
  const errorId = useId();
  const trimmedSetName = setName.trim();
  const canSubmit = trimmedSetName.length > 0 && !isSubmitting;
  const describedBy = error ? `${descriptionId} ${helperId} ${errorId}` : `${descriptionId} ${helperId}`;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) return;

    setIsSubmitting(true);
    const createError = await onCreateSet(trimmedSetName);
    setIsSubmitting(false);

    if (createError) {
      setError(createError);
      return;
    }

    onClose();
  }

  return createPortal(
    <div
      className="create-set-sheet-layer"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="create-set-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onSubmit={handleSubmit}
      >
        <div className="create-set-sheet-handle" aria-hidden />

        <div className="create-set-sheet-header">
          <div>
            <h2 className="create-set-sheet-title" id={titleId}>
              Create new set
            </h2>
            <p className="create-set-sheet-description" id={descriptionId}>
              Give your collection a clear name. You can add cards right after creating it.
            </p>
          </div>

          <button
            type="button"
            className="create-set-sheet-close"
            aria-label="Close create set dialog"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>

        <label className="create-set-field-label" htmlFor="create-set-name">
          Set name
        </label>
        <input
          ref={inputRef}
          id="create-set-name"
          className={`create-set-name-input ${error ? "has-error" : ""}`}
          value={setName}
          placeholder="e.g. Spanish: A1 Basics"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            setSetName(event.target.value);
            setError(null);
          }}
        />
        <p className="create-set-field-helper" id={helperId}>
          Keep it short and specific.
        </p>
        {error ? (
          <p className="create-set-field-error" id={errorId}>
            {error}
          </p>
        ) : null}

        <button type="submit" className="create-set-submit" disabled={!canSubmit}>
          {isSubmitting ? "Creating" : "Create set"}
        </button>
      </form>
    </div>,
    document.body,
  );
}

type RenameSetDialogProps = {
  onCancel: () => void;
  onRename: (set: FlashcardSet, name: string) => Promise<string | null>;
  set: FlashcardSet;
};

function RenameSetDialog({ onCancel, onRename, set }: RenameSetDialogProps) {
  const [setName, setSetName] = useState(set.name);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const helperId = useId();
  const errorId = useId();
  const trimmedSetName = setName.trim();
  const canSubmit = trimmedSetName.length > 0 && trimmedSetName !== set.name && !isSubmitting;
  const describedBy = error ? `${descriptionId} ${helperId} ${errorId}` : `${descriptionId} ${helperId}`;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) return;

    setIsSubmitting(true);
    const renameError = await onRename(set, trimmedSetName);
    setIsSubmitting(false);

    if (renameError) {
      setError(renameError);
      return;
    }

    onCancel();
  }

  return createPortal(
    <div
      className="create-set-sheet-layer"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        className="create-set-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onSubmit={handleSubmit}
      >
        <div className="create-set-sheet-handle" aria-hidden />

        <div className="create-set-sheet-header">
          <div>
            <h2 className="create-set-sheet-title" id={titleId}>
              Rename set
            </h2>
            <p className="create-set-sheet-description" id={descriptionId}>
              Choose a clear name for this collection.
            </p>
          </div>

          <button
            type="button"
            className="create-set-sheet-close"
            aria-label="Close rename set dialog"
            onClick={onCancel}
          >
            <CloseIcon />
          </button>
        </div>

        <label className="create-set-field-label" htmlFor="rename-set-name">
          Set name
        </label>
        <input
          ref={inputRef}
          id="rename-set-name"
          className={`create-set-name-input ${error ? "has-error" : ""}`}
          value={setName}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            setSetName(event.target.value);
            setError(null);
          }}
        />
        <p className="create-set-field-helper" id={helperId}>
          Keep it short and specific.
        </p>
        {error ? (
          <p className="create-set-field-error" id={errorId}>
            {error}
          </p>
        ) : null}

        <button type="submit" className="create-set-submit" disabled={!canSubmit}>
          {isSubmitting ? "Saving" : "Save name"}
        </button>
      </form>
    </div>,
    document.body,
  );
}

function getSetGroups(sets: FlashcardSet[]) {
  return {
    customSets: sets.filter((set) => set.source === "User"),
    readyMadeSets: sets.filter((set) => set.source === "ReadyMade"),
  };
}

function isEditableCustomSet(set: FlashcardSet) {
  return set.source === "User" && set.isApiBacked === true && !set.readonly;
}

function formatSetCount(count: number) {
  return `${count} ${count === 1 ? "set" : "sets"}`;
}

function getPracticeLabel(index: number) {
  const labels = ["Last practiced 2h ago", "Last practiced yesterday", "Last practiced 3d ago"];
  return labels[index % labels.length];
}

function getLearnedCardCount(set: FlashcardSet) {
  if (set.flashcards.length === 0 && set.progressSummary) {
    return set.progressSummary.learnedCount;
  }

  return set.flashcards.filter((card) => card.isLearned).length;
}

function getSetCardCount(set: FlashcardSet) {
  return set.progressSummary?.cardCount ?? set.cardCount ?? set.flashcards.length;
}

function getLastPracticedLabel(setId: string) {
  const labels = ["2h", "1d", "3d"];
  const labelIndex = Array.from(setId).reduce((total, char) => total + char.charCodeAt(0), 0) % labels.length;
  return labels[labelIndex];
}

function getWaitingCount(cardCount: number) {
  return Math.min(cardCount, Math.max(0, Math.round(cardCount * 0.44)));
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M12 6.5h.01" />
      <path d="M12 12h.01" />
      <path d="M12 17.5h.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
      <path d="m7 7 10 10" />
      <path d="m17 7-10 10" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M5 12h12" />
      <path d="m13 7 5 5-5 5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
