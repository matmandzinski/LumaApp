namespace SimpleFlashCards.ConsoleUi;

public partial class ConsoleApplication
{
    private void ShowDefaultSets()
    {
        var sets = _service.GetDefaultSets();

        while (true)
        {
            Console.Clear();
            Console.WriteLine("=== READY SETS ===");
            Console.WriteLine();

            for (var i = 0; i < sets.Count; i++)
                Console.WriteLine($"{i + 1}. {sets[i].Name} ({sets[i].Flashcards.Count} flashcards)");

            Console.WriteLine();
            Console.WriteLine("0. Back");
            Console.Write("Choose a set: ");

            if (!int.TryParse(Console.ReadLine(), out var choice))
                continue;

            if (choice == 0)
                return;

            if (choice < 1 || choice > sets.Count)
                continue;

            var selectedSet = sets[choice - 1];
            _service.SetActiveSet(selectedSet);

            Console.WriteLine("Set selected as active ⭐");
            Console.ReadKey();
            return;
        }
    }
}
