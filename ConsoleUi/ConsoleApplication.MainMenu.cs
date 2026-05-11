namespace SimpleFlashCards.ConsoleUi;

public partial class ConsoleApplication
{
    private void ShowMainMenu()
    {
        Console.Clear();
        Console.WriteLine("=== SIMPLE FLASHCARDS ===");
        Console.WriteLine();

        var activeSet = _service.GetActiveSet();
        if (activeSet != null)
        {
            Console.WriteLine($"Active set:");
            Console.WriteLine(activeSet.Name);
            Console.WriteLine();
        }
        else
        {
            Console.WriteLine("Active set: (none — pick one from Ready-made Sets)");
            Console.WriteLine();
        }

        Console.WriteLine("Quick Lesson:");
        if (_service.IsQuickLessonDone)
            Console.WriteLine("[x] Completed");
        else
            Console.WriteLine("[ ] Your 5 cards are ready");
        Console.WriteLine();

        Console.WriteLine("1. Start Quick Lesson");
        Console.WriteLine("2. Continue Learning");
        Console.WriteLine("3. My Sets");
        Console.WriteLine("4. Ready-made Sets");
        Console.WriteLine("5. Create new set");
        Console.WriteLine("0. Exit");
        Console.WriteLine();
        Console.Write("Choose an option: ");
    }
}
