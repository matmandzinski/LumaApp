using SimpleFlashCards.Models;

namespace SimpleFlashCards.Services;

public class LearningSession
{
    private readonly LearningQueue _queue;
    private readonly int _limit;
    private readonly Queue<Flashcard> _retryItems = new();
    private int _completedCount;
    private int _drawnCount;

    public LearningSession(LearningQueue queue, int limit)
    {
        _queue = queue;
        _limit = limit;
        _completedCount = 0;
    }

    public bool HasNext()
    {
        return CanDrawNewCard() || _retryItems.Count > 0;
    }

    public Flashcard GetNext()
    {
        if (!HasNext())
            throw new InvalidOperationException("Session has no more cards.");

        if (CanDrawNewCard())
        {
            _drawnCount++;
            return _queue.GetNext();
        }

        return _retryItems.Dequeue();
    }

    public void MarkKnown(Flashcard card)
    {
        _queue.MarkAsKnown(card);
        _completedCount++;
    }

    public void MarkUnknown(Flashcard card)
    {
        _retryItems.Enqueue(card);
    }

    public void ReturnToQueue(Flashcard activeCard)
    {
        _queue.ReturnToFront(activeCard);

        while (_retryItems.Count > 0)
            _queue.MarkAsUnknown(_retryItems.Dequeue());
    }

    public bool IsCompleted => !HasNext();

    public int CompletedCount => _completedCount;

    private bool CanDrawNewCard() => _drawnCount < _limit && _queue.HasCards;
}
