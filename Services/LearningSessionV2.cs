using SimpleFlashCards.Models;

namespace SimpleFlashCards.Services;

public class LearningSessionV2
{
    private readonly LearningQueue _queue;
    private readonly int _limit;
    private readonly bool _allowReinsert;
    private int _answeredCount;

    public LearningSessionV2(LearningQueue queue, int limit, bool allowReinsert = true)
    {
        _queue = queue;
        _limit = limit;
        _allowReinsert = allowReinsert;
    }

    public bool HasNext()
    {
        if (!_queue.HasCards)
            return false;

        if (_answeredCount >= _limit)
            return false;

        return true;
    }

    public Flashcard GetNext()
    {
        if (!HasNext())
            throw new InvalidOperationException("Session has no more cards.");

        return _queue.GetNext();
    }

    public void MarkKnown(Flashcard card)
    {
        _queue.MarkKnown(card, _allowReinsert);
        _answeredCount++;
    }

    public void MarkUnknown(Flashcard card)
    {
        _queue.MarkReviewAgain(card, _allowReinsert);
        _answeredCount++;
    }

    public void ReturnToQueue(Flashcard activeCard)
    {
        _queue.ReturnToFront(activeCard);
    }

    public void CommitDeferredReviews()
    {
        // Session queues are temporary; quick lessons intentionally skip same-session reinsertion.
    }

    public bool IsCompleted => _answeredCount >= _limit || !_queue.HasCards;

    public int AnsweredCount => _answeredCount;
}
