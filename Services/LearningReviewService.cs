using SimpleFlashCards.Models;

namespace SimpleFlashCards.Services;

public enum LearningReviewDecision
{
    Know,
    ReviewAgain
}

public sealed record LearningReviewTransition(
    int PreviousStage,
    int NextStage,
    bool IsLearned);

public sealed record CardReviewResult(
    Flashcard Card,
    int PreviousStage,
    int NextStage,
    bool IsLearned,
    SetProgressSummary ProgressSummary);

public static class LearningReviewService
{
    public static LearningReviewTransition Apply(
        Flashcard card,
        LearningReviewDecision decision,
        DateTime reviewedAt)
    {
        var previousStage = card.LearningStage;
        card.LastReviewedAt = reviewedAt;

        if (decision == LearningReviewDecision.Know)
        {
            card.ReviewAgainStreak = 0;

            if (card.LearningStage <= 0)
            {
                card.LearningStage = 1;
                card.IsLearned = false;
            }
            else if (card.LearningStage == 1)
            {
                card.LearningStage = 2;
                card.IsLearned = false;
            }
            else
            {
                card.LearningStage = 3;
                card.IsLearned = true;
            }
        }
        else
        {
            card.ReviewAgainStreak++;

            if (card.LearningStage == -1 || card.ReviewAgainStreak >= 2)
                card.LearningStage = -1;

            card.IsLearned = false;
        }

        return new LearningReviewTransition(previousStage, card.LearningStage, card.IsLearned);
    }
}
