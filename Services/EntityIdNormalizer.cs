using SimpleFlashCards.Models;

namespace SimpleFlashCards.Services;

/// <summary>Ensures stable GUIDs on entities deserialized from legacy JSON without ids.
/// </summary>
public static class EntityIdNormalizer
{
    public static void EnsureIds(IEnumerable<FlashcardSet> sets)
    {
        foreach (var set in sets)
        {
            if (set.Id == Guid.Empty)
                set.Id = Guid.NewGuid();

            foreach (var card in set.Flashcards)
            {
                if (card.Id == Guid.Empty)
                    card.Id = Guid.NewGuid();
            }
        }
    }
}
