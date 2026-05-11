using SimpleFlashCards.Models;

namespace SimpleFlashCards.Services;

public class LearningQueue
{
    private readonly List<Flashcard> _items;

    public LearningQueue(IEnumerable<Flashcard> flashcards)
    {
        _items = flashcards.ToList();
    }

    public static LearningQueue CreateShuffled(IEnumerable<Flashcard> flashcards, Random? random = null)
    {
        var items = flashcards.ToList();
        Shuffle(items, random ?? Random.Shared);
        return new LearningQueue(items);
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
        _items.Insert(0, card);
    }

    public void MarkAsKnown(Flashcard card)
    {
        // Card already removed by GetNext — nothing to do.
    }

    public void MarkAsUnknown(Flashcard card)
    {
        _items.Add(card);
    }

    /// <summary>Current queue order from front to back.</summary>
    public IReadOnlyList<Flashcard> Snapshot() => _items.ToList();

    private static void Shuffle(List<Flashcard> items, Random random)
    {
        for (var i = items.Count - 1; i > 0; i--)
        {
            var j = random.Next(i + 1);
            (items[i], items[j]) = (items[j], items[i]);
        }
    }
}
