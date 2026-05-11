import type { ReactNode } from "react";
import type { FlashcardSet } from "../data/defaultSets";
import { AppButton, Card, Heading, MetaText } from "../components/ui";

type SetsScreenProps = {
  sets: FlashcardSet[];
  activeSetId: string;
  onOpenSetDetails: (set: FlashcardSet) => void;
};

export function SetsScreen({ sets, activeSetId, onOpenSetDetails }: SetsScreenProps) {
  const { customSets, readyMadeSets } = getSetGroups(sets);
  const totalSetCount = sets.length;

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

      <button type="button" className="create-set-card" aria-label="Create new set">
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
              progressPercent={getProgressPercent(index, set.id === activeSetId)}
              practiceLabel={getPracticeLabel(index)}
              showMenuHint
              onClick={() => onOpenSetDetails(set)}
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
            progressPercent={getProgressPercent(index, set.id === activeSetId)}
            practiceLabel={getPracticeLabel(index)}
            onClick={() => onOpenSetDetails(set)}
          />
        ))}
      </SetsSection>
    </div>
  );
}

type SetDetailsScreenProps = {
  isActive: boolean;
  onBack: () => void;
  onSetActive: () => void;
  onStartQuickLesson: () => void;
  set: FlashcardSet;
};

export function SetDetailsScreen({
  isActive,
  onBack,
  onSetActive,
  onStartQuickLesson,
  set,
}: SetDetailsScreenProps) {
  const isReadyMade = set.source === "ReadyMade";

  return (
    <div className="screen-content">
      <header className="set-detail-header">
        <div>
          <Heading>{set.name}</Heading>
          <MetaText>
            {set.flashcards.length} cards - {isReadyMade ? "Ready-made set" : "User-created set"}
          </MetaText>
        </div>
        {isReadyMade ? <span className="readonly-badge">Read-only</span> : null}
      </header>

      <Card as="article">
        <p className="card-title">Active deck</p>
        {isActive ? (
          <MetaText>Active set</MetaText>
        ) : (
          <>
            <MetaText>Make this set the source for Quick Lesson and Continue Learning.</MetaText>
            <AppButton onClick={onSetActive}>Set as active</AppButton>
          </>
        )}
      </Card>

      <Card as="article">
        <p className="card-title">Quick Lesson</p>
        <MetaText>
          {isActive
            ? "Uses up to 5 cards from this active set."
            : "Set this deck as active before starting a Quick Lesson."}
        </MetaText>
        <AppButton onClick={onStartQuickLesson} disabled={!isActive || set.flashcards.length === 0}>
          Start Quick Lesson
        </AppButton>
      </Card>

      <section className="flashcard-list" aria-label={`${set.name} flashcards`}>
        {set.flashcards.map((card, index) => (
          <article className="flashcard-row" key={`${card.front}-${index}`}>
            <span className="flashcard-index">{index + 1}</span>
            <div>
              <p className="card-title">{card.front}</p>
              <MetaText>{card.back}</MetaText>
            </div>
          </article>
        ))}
      </section>

      <AppButton variant="secondary" onClick={onBack}>
        Back
      </AppButton>
    </div>
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
  progressPercent: number;
  practiceLabel: string;
  showMenuHint?: boolean;
  onClick: () => void;
};

function CollectionCard({
  set,
  isActive,
  progressPercent,
  practiceLabel,
  showMenuHint = false,
  onClick,
}: CollectionCardProps) {
  return (
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
            {set.flashcards.length} cards - {practiceLabel}
          </p>
        </div>

        {showMenuHint && !isActive ? (
          <span className="sets-card-more" aria-hidden>
            <DotsIcon />
          </span>
        ) : null}
      </div>

      <div className="sets-card-bottom">
        <span className="sets-progress-track" aria-label={`${progressPercent}% complete`}>
          <span style={{ width: `${progressPercent}%` }} />
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
      <p className="sets-empty-copy">Create one when you want a focused collection of your own.</p>
    </article>
  );
}

function getSetGroups(sets: FlashcardSet[]) {
  return {
    customSets: sets.filter((set) => set.source === "User"),
    readyMadeSets: sets.filter((set) => set.source === "ReadyMade"),
  };
}

function formatSetCount(count: number) {
  return `${count} ${count === 1 ? "set" : "sets"}`;
}

function getPracticeLabel(index: number) {
  const labels = ["Last practiced 2h ago", "Last practiced yesterday", "Last practiced 3d ago"];
  return labels[index % labels.length];
}

function getProgressPercent(index: number, isActive: boolean) {
  if (isActive) return 58;

  const progressValues = [58, 64, 20];
  return progressValues[index % progressValues.length];
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

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M5 12h12" />
      <path d="m13 7 5 5-5 5" />
    </svg>
  );
}
