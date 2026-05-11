using SimpleFlashCards.Services;

namespace SimpleFlashCards.ConsoleUi;

public partial class ConsoleApplication
{
    private readonly FlashcardSetService _service;

    public ConsoleApplication(FlashcardSetService service) =>
        _service = service;

    public void Run()
    {
        _service.LoadUserSets();
        _service.LoadDefaultSets();
        _service.LoadLearningState();
        _service.LoadLearningQueue();

        var isRunning = true;

        while (isRunning)
        {
            Console.Clear();
            ShowMainMenu();
            var input = Console.ReadLine();

            switch (input)
            {
                case "1":
                    RunQuickLessonCase();
                    break;

                case "2":
                    RunContinueLearningCase();
                    break;

                case "3":
                    ShowUserSets();
                    break;

                case "4":
                    ShowDefaultSets();
                    break;

                case "5":
                    CreateNewSet();
                    break;

                case "0":
                    isRunning = false;
                    break;
            }
        }
    }
}
