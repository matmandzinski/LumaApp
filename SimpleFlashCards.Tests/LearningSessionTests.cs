using SimpleFlashCards.Models;
using SimpleFlashCards.Services;

namespace SimpleFlashCards.Tests;

public class LearningSessionTests
{
    [Fact]
    public void Session_Stops_After_Limit_Decisions()
    {
        var cards = Enumerable.Range(0, 10).Select(i => new Flashcard($"f{i}", $"b{i}")).ToList();
        var queue = new LearningQueue(cards);
        var session = new LearningSessionV2(queue, 3);

        var first = session.GetNext();
        session.MarkUnknown(first);

        var second = session.GetNext();
        session.MarkKnown(second);

        var third = session.GetNext();
        session.MarkUnknown(third);

        Assert.False(session.HasNext());
        Assert.True(session.IsCompleted);
        Assert.Equal(3, session.AnsweredCount);
    }

    [Fact]
    public void MarkUnknown_Increments_AnsweredCount_And_Requeues_Card()
    {
        var a = new Flashcard("a", "A");
        var b = new Flashcard("b", "B");
        var queue = new LearningQueue(new[] { a, b });
        var session = new LearningSessionV2(queue, 2);

        var card = session.GetNext();
        session.MarkUnknown(card);

        Assert.Equal(1, session.AnsweredCount);
        Assert.Equal(new[] { b, a }, queue.Snapshot());
        Assert.True(session.HasNext());
    }

    [Fact]
    public void Repeat_Does_Not_Extend_Current_Limited_Session()
    {
        var a = new Flashcard("a", "A");
        var b = new Flashcard("b", "B");
        var c = new Flashcard("c", "C");
        var queue = new LearningQueue(new[] { a, b, c });
        var session = new LearningSessionV2(queue, 2);

        Assert.Same(a, session.GetNext());
        session.MarkUnknown(a);

        Assert.Same(b, session.GetNext());
        session.MarkKnown(b);

        Assert.False(session.HasNext());
        Assert.Equal(2, session.AnsweredCount);
        Assert.Equal(new[] { c, a, b }, queue.Snapshot());
        Assert.True(session.IsCompleted);
    }

    [Fact]
    public void Quick_Lesson_Repeat_Does_Not_Reappear_In_Current_Session()
    {
        var a = new Flashcard("a", "A");
        var b = new Flashcard("b", "B");
        var queue = new LearningQueue(new[] { a, b });
        var session = new LearningSessionV2(queue, 10, allowReinsert: false);

        Assert.Same(a, session.GetNext());
        session.MarkUnknown(a);

        Assert.Same(b, session.GetNext());
        session.MarkKnown(b);

        Assert.False(session.HasNext());
        Assert.Equal(2, session.AnsweredCount);

        session.CommitDeferredReviews();

        Assert.Empty(queue.Snapshot());
    }

    [Fact]
    public void GetNext_After_Limit_Throws()
    {
        var queue = new LearningQueue(new[] { new Flashcard("a", "A") });
        var session = new LearningSessionV2(queue, 1);

        var c = session.GetNext();
        session.MarkKnown(c);

        Assert.Throws<InvalidOperationException>(() => session.GetNext());
    }
}
