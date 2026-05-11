using SimpleFlashCards.Models;
using SimpleFlashCards.Services;

namespace SimpleFlashCards.Tests;

public class SpacedRepetitionSm2Tests
{
    [Fact]
    public void Binary_Lapse_Resets_Repetitions_And_Sets_Short_Interval()
    {
        var card = new Flashcard("q", "a")
        {
            Repetitions = 3,
            IntervalDays = 10,
            EaseFactor = 2.5
        };

        SpacedRepetitionSm2.ApplyBinaryReview(card, known: false);

        Assert.Equal(0, card.Repetitions);
        Assert.Equal(1, card.IntervalDays);
        Assert.NotNull(card.NextReviewUtc);
    }

    [Fact]
    public void Binary_Known_Progresses_Intervals()
    {
        var card = new Flashcard("q", "a");

        SpacedRepetitionSm2.ApplyBinaryReview(card, known: true);
        Assert.Equal(1, card.Repetitions);
        Assert.Equal(1, card.IntervalDays);

        SpacedRepetitionSm2.ApplyBinaryReview(card, known: true);
        Assert.Equal(2, card.Repetitions);
        Assert.Equal(6, card.IntervalDays);

        SpacedRepetitionSm2.ApplyBinaryReview(card, known: true);
        Assert.Equal(3, card.Repetitions);
        Assert.True(card.IntervalDays >= 6);
    }
}
