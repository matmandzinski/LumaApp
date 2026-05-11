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
}
