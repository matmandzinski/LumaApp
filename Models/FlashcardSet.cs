namespace SimpleFlashCards.Models;

public class FlashcardSet
{
    public Guid Id { get; set; }

    public string ExternalId { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public FlashcardSetSource Source { get; set; } = FlashcardSetSource.User;

    public List<Flashcard> Flashcards { get; set; } = new();

    public FlashcardSet()
    {
    }

    public FlashcardSet(string name, IEnumerable<Flashcard> flashcards)
    {
        Id = Guid.NewGuid();
        Name = name;
        Flashcards = new List<Flashcard>(flashcards);
    }
}
