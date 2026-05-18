using SimpleFlashCards.Models;
using System.Security.Cryptography;
using System.Text;

namespace SimpleFlashCards.Services;

/// <summary>Ensures stable GUIDs on entities deserialized from legacy JSON without ids.
/// </summary>
public static class EntityIdNormalizer
{
    public static void EnsureIds(IEnumerable<FlashcardSet> sets, bool useStableIds = false)
    {
        var setIndex = 0;

        foreach (var set in sets)
        {
            if (set.Id == Guid.Empty)
                set.Id = useStableIds
                    ? CreateStableGuid($"set:{setIndex}:{set.Name}")
                    : Guid.NewGuid();

            var cardIndex = 0;

            foreach (var card in set.Flashcards)
            {
                if (card.Id == Guid.Empty)
                    card.Id = useStableIds
                        ? CreateStableGuid($"card:{set.Id}:{cardIndex}:{card.Front}:{card.Back}")
                        : Guid.NewGuid();

                cardIndex++;
            }

            setIndex++;
        }
    }

    private static Guid CreateStableGuid(string value)
    {
        var bytes = MD5.HashData(Encoding.UTF8.GetBytes(value));
        return new Guid(bytes);
    }
}
