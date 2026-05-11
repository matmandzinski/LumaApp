namespace SimpleFlashCards.ConsoleUi;

public partial class ConsoleApplication
{
    private void ShowUserSets()
    {
        var userSets = _service.GetUserSets();

        Console.Clear();
        Console.WriteLine("=== MY SETS ===");
        Console.WriteLine();

        if (userSets.Count == 0)
        {
            Console.WriteLine("You don't have any sets yet.");
            Console.WriteLine("Press any key...");
            Console.ReadKey();
            return;
        }

        for (var i = 0; i < userSets.Count; i++)
            Console.WriteLine($"{i + 1}. {userSets[i].Name} ({userSets[i].Flashcards.Count} flashcards)");

        Console.WriteLine();
        Console.WriteLine("0. Back");
        Console.Write("Choose a set: ");

        if (!int.TryParse(Console.ReadLine(), out var choice))
            return;

        if (choice == 0)
            return;

        if (choice < 1 || choice > userSets.Count)
            return;

        var selectedSet = userSets[choice - 1];
        ShowUserSetOptions(selectedSet);
    }
}
