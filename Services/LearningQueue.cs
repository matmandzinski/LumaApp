using SimpleFlashCards.Models;

namespace SimpleFlashCards.Services;

public class LearningQueue
{
    private readonly List<Flashcard> _items;
    private readonly Random _random;

    public LearningQueue(IEnumerable<Flashcard> flashcards, Random? random = null)
    {
        _items = flashcards.ToList();
        _random = random ?? Random.Shared;
    }

    public static LearningQueue CreateShuffled(
        IEnumerable<Flashcard> flashcards,
        Random? random = null,
        int? limit = null)
    {
        random ??= Random.Shared;
        var items = flashcards
            .Where(card => !card.IsLearned)
            .ToList();

        Shuffle(items, random);

        if (limit.HasValue)
            items = items.Take(limit.Value).ToList();

        return new LearningQueue(items, random);
    }

    public bool HasCards => _items.Count > 0;

    public int Count => _items.Count;

    public Flashcard GetNext()
    {
        if (!HasCards)
            throw new InvalidOperationException("LearningQueue is empty.");

        var card = _items[0];
        _items.RemoveAt(0);
        return card;
    }

    /// <summary>Puts the card back at the front (e.g. user exited without Repeat/Know it).</summary>
    public void ReturnToFront(Flashcard card)
    {
        RemoveQueuedCopies(card);
        _items.Insert(0, card);
    }

    public void MarkAsKnown(Flashcard card)
    {
        MarkKnown(card, allowReinsert: false);
    }

    public void MarkAsUnknown(Flashcard card)
    {
        MarkReviewAgain(card, allowReinsert: true);
    }

    public void MarkKnown(Flashcard card, bool allowReinsert)
    {
        LearningReviewService.Apply(card, LearningReviewDecision.Know, DateTime.Now);

        if (card.LearningStage == 1 && allowReinsert)
        {
            InsertCardLater(card, 10, 20);
            return;
        }

        if (card.LearningStage == 2 && allowReinsert)
        {
            InsertCardLater(card, 40, 50);
            return;
        }
    }

    public void MarkReviewAgain(Flashcard card, bool allowReinsert)
    {
        var wasDifficult = card.LearningStage == -1;
        LearningReviewService.Apply(card, LearningReviewDecision.ReviewAgain, DateTime.Now);

        if (wasDifficult || card.ReviewAgainStreak >= 2)
        {
            if (allowReinsert)
                InsertCardLater(card, 3, 5);

            return;
        }

        if (allowReinsert)
            InsertCardLater(card, 5, 10);
    }

    public void InsertCardLater(Flashcard card, int min, int max)
    {
        if (min < 0)
            throw new ArgumentOutOfRangeException(nameof(min));

        if (max < min)
            throw new ArgumentOutOfRangeException(nameof(max));

        RemoveQueuedCopies(card);

        var delay = _random.Next(max - min + 1) + min;
        var insertIndex = Math.Min(delay, _items.Count);
        _items.Insert(insertIndex, card);
    }

    /// <summary>Current queue order from front to back.</summary>
    public IReadOnlyList<Flashcard> Snapshot() => _items.ToList();

    private void RemoveQueuedCopies(Flashcard card)
    {
        _items.RemoveAll(queuedCard =>
            card.Id != Guid.Empty && queuedCard.Id == card.Id ||
            ReferenceEquals(queuedCard, card));
    }

    private static void Shuffle(List<Flashcard> items, Random random)
    {
        for (var i = items.Count - 1; i > 0; i--)
        {
            var j = random.Next(i + 1);
            (items[i], items[j]) = (items[j], items[i]);
        }
    }
}
