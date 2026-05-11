using SimpleFlashCards.Models;

namespace SimpleFlashCards.Services;

/// <summary>Classic SM-2 scheduler (binary reviews mapped to quality 2 / 4).</summary>
public static class SpacedRepetitionSm2
{
    private const double MinEaseFactor = 1.3;

    /// <param name="quality">SM-2 quality 0–5 (use <see cref="ApplyBinaryReview"/> for y/n flows).</param>
    public static void ApplyReview(Flashcard card, int quality)
    {
        quality = Math.Clamp(quality, 0, 5);

        if (quality < 3)
        {
            card.Repetitions = 0;
            card.IntervalDays = 1;
        }
        else
        {
            if (card.Repetitions == 0)
                card.IntervalDays = 1;
            else if (card.Repetitions == 1)
                card.IntervalDays = 6;
            else
                card.IntervalDays = Math.Max(1, (int)Math.Round(card.IntervalDays * card.EaseFactor));

            card.Repetitions++;
        }

        card.EaseFactor += 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
        if (card.EaseFactor < MinEaseFactor)
            card.EaseFactor = MinEaseFactor;

        card.NextReviewUtc = DateTime.UtcNow.AddDays(card.IntervalDays);
    }

    public static void ApplyBinaryReview(Flashcard card, bool known) =>
        ApplyReview(card, known ? 4 : 2);
}
