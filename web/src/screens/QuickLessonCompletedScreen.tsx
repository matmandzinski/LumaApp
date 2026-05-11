import { AppButton, Card, Heading, MetaText } from "../components/ui";

type QuickLessonCompletedScreenProps = {
  message?: string;
  onBackHome: () => void;
  onContinueLearning: () => void;
};

export function QuickLessonCompletedScreen({
  message = "Quick lesson completed.",
  onBackHome,
  onContinueLearning,
}: QuickLessonCompletedScreenProps) {
  return (
    <div className="screen-content completion-screen">
      <div className="completion-badge" aria-hidden>
        ✓
      </div>
      <header className="centered-header">
        <Heading>Done!</Heading>
        <MetaText>{message}</MetaText>
      </header>

      <Card as="article">
        <p className="card-title">14 Day Streak</p>
        <MetaText>You are in the top 5% of learners this week.</MetaText>
      </Card>
      <Card as="article">
        <p className="card-title">12 New Words</p>
        <MetaText>Mastered nuanced terms related to editorial design and composition.</MetaText>
      </Card>

      <AppButton fullWidth onClick={onBackHome}>
        Back to home
      </AppButton>
      <AppButton variant="secondary" fullWidth onClick={onContinueLearning}>
        Continue learning
      </AppButton>
      <p className="session-duration">Session duration: 4m 12s</p>
    </div>
  );
}
