using SimpleFlashCards.Models;

namespace SimpleFlashCards.ConsoleUi;

public partial class ConsoleApplication
{
    private void CreateNewSet()
    {
        Console.Clear();
        Console.Write("Enter set name: ");
        var name = Console.ReadLine();

        if (string.IsNullOrWhiteSpace(name))
            return;

        var set = new FlashcardSet(name, Enumerable.Empty<Flashcard>());

        while (true)
        {
            Console.Write("Front (ENTER = finish): ");
            var front = Console.ReadLine();

            if (string.IsNullOrWhiteSpace(front))
                break;

            Console.Write("Back: ");
            var back = Console.ReadLine();

            if (!string.IsNullOrWhiteSpace(back))
                set.Flashcards.Add(new Flashcard(front, back));
            else
                Console.WriteLine("Flashcard cannot be empty.");
        }

        if (set.Flashcards.Count > 0)
        {
            _service.AddUserSet(set);
            _service.SaveUserSets();
            Console.WriteLine("Set added!");
        }

        Console.ReadKey();
    }
}
