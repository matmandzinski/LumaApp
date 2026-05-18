using SimpleFlashCards.Models;
using SimpleFlashCards.Services;

namespace SimpleFlashCards.ConsoleUi;

public partial class ConsoleApplication
{
    private void ShowUserSetOptions(FlashcardSet set)
    {
        while (true)
        {
            Console.Clear();
            Console.WriteLine($"=== {set.Name} ===");
            Console.WriteLine();
            Console.WriteLine("1. Start learning");
            Console.WriteLine("2. Set as active ⭐");
            Console.WriteLine("3. Edit set");
            Console.WriteLine("0. Back");
            Console.WriteLine();
            Console.Write("Choose an option: ");

            var input = Console.ReadLine();

            switch (input)
            {
                case "1":
                    _service.SetActiveSet(set);
                    var queue = _service.CreateLearningSessionQueue();
                    var session = new LearningSessionV2(queue, int.MaxValue);
                    RunLearningSession(session);
                    _service.SaveLearningQueue();
                    _service.SaveLearningState();
                    break;

                case "2":
                    _service.SetActiveSet(set);
                    Console.WriteLine("Set selected as active ⭐");
                    Console.ReadKey();
                    break;

                case "3":
                    EditSet(set);
                    break;

                case "0":
                    return;
            }
        }
    }
}
