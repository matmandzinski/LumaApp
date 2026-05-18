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
            var counts = _service.GetActiveSetLearningCounts();
            Console.WriteLine($"Active set:");
            Console.WriteLine(activeSet.Name);
            Console.WriteLine($"{counts.LearnedCards}/{counts.TotalCards} learned, {counts.DifficultCards} difficult");
            Console.WriteLine();
        }
        else
        {
            Console.WriteLine("Active set: (none — pick one from Ready-made Sets)");
            Console.WriteLine();
        }

        Console.WriteLine("Quick Lesson:");
        var readyCards = activeSet == null ? 0 : _service.GetActiveSetLearningCounts().ReadyCards;
        if (activeSet == null)
            Console.WriteLine("[ ] Pick a deck first");
        else if (readyCards == 0)
            Console.WriteLine("All caught up");
        else if (_service.IsQuickLessonDone)
            Console.WriteLine("[x] Completed");
        else if (readyCards >= 10)
            Console.WriteLine("[ ] 10 cards - about 2 min");
        else
            Console.WriteLine($"[ ] {readyCards} cards ready");
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
