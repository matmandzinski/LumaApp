using SimpleFlashCards.Models;

namespace SimpleFlashCards.ConsoleUi;

public partial class ConsoleApplication
{
    private void EditSet(FlashcardSet set)
    {
        while (true)
        {
            Console.Clear();
            Console.WriteLine("=== EDIT SET ===");
            Console.WriteLine($"Name: {set.Name}");
            Console.WriteLine($"Flashcards count: {set.Flashcards.Count}");
            Console.WriteLine();

            Console.WriteLine("1. Edit flashcards");
            Console.WriteLine("2. Change set name");
            Console.WriteLine("3. Delete set");
            Console.WriteLine("0. Back");
            Console.WriteLine();
            Console.Write("Choose an option: ");

            var input = Console.ReadLine();

            switch (input)
            {
                case "1":
                    EditFlashcardsList(set);
                    break;

                case "2":
                    RenameSet(set);
                    break;

                case "3":
                    if (DeleteSet(set))
                        return;
                    break;

                case "0":
                    return;
            }
        }
    }

    private void EditFlashcardsList(FlashcardSet set)
    {
        while (true)
        {
            Console.Clear();
            Console.WriteLine($"=== FLASHCARDS: {set.Name} ===");
            Console.WriteLine();

            if (set.Flashcards.Count == 0)
            {
                Console.WriteLine("No flashcards.");
                Console.ReadKey();
                return;
            }

            for (var i = 0; i < set.Flashcards.Count; i++)
                Console.WriteLine($"{i + 1}. {set.Flashcards[i].Front} → {set.Flashcards[i].Back}");

            Console.WriteLine();
            Console.WriteLine("0. Back");
            Console.Write("Choose a flashcard: ");

            if (!int.TryParse(Console.ReadLine(), out var choice))
                continue;

            if (choice == 0)
                return;

            if (choice < 1 || choice > set.Flashcards.Count)
                continue;

            var selectedCard = set.Flashcards[choice - 1];
            EditFlashcard(set, selectedCard);
        }
    }

    private void RenameSet(FlashcardSet set)
    {
        Console.Clear();
        Console.WriteLine("=== CHANGE SET NAME ===");
        Console.WriteLine($"Current name: {set.Name}");
        Console.WriteLine();
        Console.Write("New name (ENTER = cancel): ");

        var newName = Console.ReadLine();

        if (string.IsNullOrWhiteSpace(newName))
            return;

        set.Name = newName.Trim();
        _service.SaveUserSets();

        if (_service.GetActiveSet()?.Id == set.Id)
            _service.SaveLearningState();

        Console.WriteLine("✅ Set name updated.");
        Console.ReadKey();
    }

    private bool DeleteSet(FlashcardSet set)
    {
        Console.Clear();
        Console.WriteLine("(!) DELETE SET (!)");
        Console.WriteLine();
        Console.WriteLine("Are you sure you want to delete set:");
        Console.WriteLine($"\"{set.Name}\"");
        Console.WriteLine();
        Console.WriteLine("1. Yes, delete");
        Console.WriteLine("0. Cancel");
        Console.Write("Choose an option: ");

        var input = Console.ReadLine();

        if (input != "1")
            return false;

        _service.RemoveUserSet(set);
        _service.SaveUserSets();

        Console.WriteLine(" Set deleted.");
        Console.ReadKey();
        return true;
    }

    private void EditFlashcard(FlashcardSet set, Flashcard card)
    {
        while (true)
        {
            Console.Clear();
            Console.WriteLine("=== FLASHCARD ===");
            Console.WriteLine();
            Console.WriteLine($"Front: {card.Front}");
            Console.WriteLine($"Back : {card.Back}");
            Console.WriteLine();
            Console.WriteLine("1. Edit Front");
            Console.WriteLine("2. Edit Back");
            Console.WriteLine("3. Delete flashcard");
            Console.WriteLine("0. Back");
            Console.Write("Choose an option: ");

            var input = Console.ReadLine();

            switch (input)
            {
                case "1":
                    Console.Write("New Front: ");
                    var newFront = Console.ReadLine();
                    if (!string.IsNullOrWhiteSpace(newFront))
                    {
                        card.Front = newFront;
                        _service.SaveUserSets();
                    }

                    return;

                case "2":
                    Console.Write("New Back: ");
                    var newBack = Console.ReadLine();
                    if (!string.IsNullOrWhiteSpace(newBack))
                    {
                        card.Back = newBack;
                        _service.SaveUserSets();
                    }

                    return;

                case "3":
                    set.Flashcards.Remove(card);
                    _service.SaveUserSets();
                    Console.WriteLine("Flashcard deleted.");
                    Console.ReadKey();
                    return;

                case "0":
                    return;
            }
        }
    }
}
