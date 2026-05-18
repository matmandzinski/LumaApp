using SimpleFlashCards.Models;
using SimpleFlashCards.Services;

namespace SimpleFlashCards.Tests;

public class LearningQueueTests
{
    [Fact]
    public void GetNext_Dequeues_Fifo_Order()
    {
        var a = new Flashcard("a", "A");
        var b = new Flashcard("b", "B");
        var queue = new LearningQueue(new[] { a, b });

        Assert.Same(a, queue.GetNext());
        Assert.Same(b, queue.GetNext());
        Assert.False(queue.HasCards);
    }

    [Fact]
    public void CreateShuffled_Randomizes_Initial_Order_Once()
    {
        var a = new Flashcard("a", "A");
        var b = new Flashcard("b", "B");
        var c = new Flashcard("c", "C");

        var queue = LearningQueue.CreateShuffled(new[] { a, b, c }, new FixedSequenceRandom(0, 0));

        Assert.Equal(new[] { "b", "c", "a" }, queue.Snapshot().Select(card => card.Front));
        Assert.Equal(new[] { "b", "c", "a" }, queue.Snapshot().Select(card => card.Front));
    }

    [Fact]
    public void MarkAsUnknown_Requeues_Card()
    {
        var card = new Flashcard("x", "X");
        var queue = new LearningQueue(new[] { card });

        var taken = queue.GetNext();
        queue.MarkAsUnknown(taken);

        Assert.True(queue.HasCards);
        Assert.Same(card, queue.GetNext());
    }

    [Fact]
    public void MarkAsUnknown_Moves_Card_Behind_Remaining_Cards()
    {
        var a = new Flashcard("a", "A");
        var b = new Flashcard("b", "B");
        var queue = new LearningQueue(new[] { a, b });

        var taken = queue.GetNext();
        queue.MarkAsUnknown(taken);

        Assert.Same(b, queue.GetNext());
        Assert.Same(a, queue.GetNext());
    }

    [Fact]
    public void MarkAsKnown_Does_Not_Requeue()
    {
        var card = new Flashcard("x", "X");
        var queue = new LearningQueue(new[] { card });

        var taken = queue.GetNext();
        queue.MarkAsKnown(taken);

        Assert.False(queue.HasCards);
    }

    [Fact]
    public void New_Card_Defaults_To_Neutral_Unlearned_State()
    {
        var card = new Flashcard("front", "back");

        Assert.Equal(0, card.LearningStage);
        Assert.Equal(0, card.ReviewAgainStreak);
        Assert.False(card.IsLearned);
        Assert.Null(card.LastReviewedAt);
    }

    [Fact]
    public void MarkKnown_Advances_Through_Learning_Stages()
    {
        var card = new Flashcard("x", "X");
        var queue = new LearningQueue(Array.Empty<Flashcard>());

        queue.MarkKnown(card, allowReinsert: false);
        Assert.Equal(1, card.LearningStage);
        Assert.False(card.IsLearned);

        queue.MarkKnown(card, allowReinsert: false);
        Assert.Equal(2, card.LearningStage);
        Assert.False(card.IsLearned);

        queue.MarkKnown(card, allowReinsert: false);
        Assert.Equal(3, card.LearningStage);
        Assert.True(card.IsLearned);
    }

    [Fact]
    public void Difficult_Card_MarkKnown_Jumps_To_Stage_One()
    {
        var card = new Flashcard("x", "X")
        {
            LearningStage = -1,
            ReviewAgainStreak = 4
        };
        var queue = new LearningQueue(Array.Empty<Flashcard>());

        queue.MarkKnown(card, allowReinsert: false);

        Assert.Equal(1, card.LearningStage);
        Assert.Equal(0, card.ReviewAgainStreak);
        Assert.False(card.IsLearned);
        Assert.NotNull(card.LastReviewedAt);
    }

    [Fact]
    public void First_ReviewAgain_Keeps_Current_Stage_And_Reinserts_Later()
    {
        var card = new Flashcard("x", "X");
        var remaining = Enumerable.Range(0, 7)
            .Select(i => new Flashcard($"f{i}", $"b{i}"))
            .ToList();
        var queue = new LearningQueue(remaining, new FixedSequenceRandom(0));

        queue.MarkReviewAgain(card, allowReinsert: true);

        Assert.Equal(0, card.LearningStage);
        Assert.Equal(1, card.ReviewAgainStreak);
        Assert.Equal(card, queue.Snapshot()[5]);
    }

    [Fact]
    public void Second_Consecutive_ReviewAgain_Marks_Difficult_And_Reinserts_Sooner()
    {
        var card = new Flashcard("x", "X")
        {
            ReviewAgainStreak = 1
        };
        var remaining = Enumerable.Range(0, 7)
            .Select(i => new Flashcard($"f{i}", $"b{i}"))
            .ToList();
        var queue = new LearningQueue(remaining, new FixedSequenceRandom(0));

        queue.MarkReviewAgain(card, allowReinsert: true);

        Assert.Equal(-1, card.LearningStage);
        Assert.Equal(2, card.ReviewAgainStreak);
        Assert.Equal(card, queue.Snapshot()[3]);
    }

    [Fact]
    public void Already_Difficult_Card_Stays_Difficult_On_ReviewAgain()
    {
        var card = new Flashcard("x", "X")
        {
            LearningStage = -1
        };
        var queue = new LearningQueue(Array.Empty<Flashcard>());

        queue.MarkReviewAgain(card, allowReinsert: true);

        Assert.Equal(-1, card.LearningStage);
        Assert.Same(card, queue.Snapshot().Single());
    }

    [Fact]
    public void MarkKnown_Reinserts_Stage_One_And_Stage_Two_Cards_With_Delays()
    {
        var stageOneCard = new Flashcard("stage one", "A");
        var stageTwoCard = new Flashcard("stage two", "B")
        {
            LearningStage = 1
        };
        var remaining = Enumerable.Range(0, 60)
            .Select(i => new Flashcard($"f{i}", $"b{i}"))
            .ToList();
        var queue = new LearningQueue(remaining, new FixedSequenceRandom(0, 0));

        queue.MarkKnown(stageOneCard, allowReinsert: true);
        queue.MarkKnown(stageTwoCard, allowReinsert: true);

        Assert.Equal(1, stageOneCard.LearningStage);
        Assert.Equal(2, stageTwoCard.LearningStage);
        Assert.Equal(stageOneCard, queue.Snapshot()[10]);
        Assert.Equal(stageTwoCard, queue.Snapshot()[40]);
    }
}
