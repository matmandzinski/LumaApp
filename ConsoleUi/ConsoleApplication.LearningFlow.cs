using SimpleFlashCards.Models;
using SimpleFlashCards.Services;

namespace SimpleFlashCards.ConsoleUi;

public enum LearningSessionExitKind
{
    CompletedNaturally,
    UserExitedToHome
}

public partial class ConsoleApplication
{
    private LearningSessionExitKind RunLearningSession(LearningSessionV2 session)
    {
        var active = _service.GetActiveSet();

        while (session.HasNext())
        {
            var card = session.GetNext();

            Console.Clear();
            if (active != null)
                Console.WriteLine(active.Name);
            Console.WriteLine();
            Console.WriteLine(card.Front);
            Console.WriteLine();
            Console.WriteLine("Tap any key to reveal answer...");
            Console.ReadKey(true);

            Console.Clear();
            if (active != null)
                Console.WriteLine(active.Name);
            Console.WriteLine();
            Console.WriteLine(card.Back);
            Console.WriteLine();

            string? input;
            do
            {
                Console.WriteLine("Know it (y) / Repeat (n) / Exit to home (x)");
                input = Console.ReadLine()?.Trim().ToLowerInvariant();
            } while (input != "y" && input != "n" && input != "x");

            if (input == "x")
            {
                session.ReturnToQueue(card);
                _service.SaveLearningQueue();
                _service.SaveLearningState();
                return LearningSessionExitKind.UserExitedToHome;
            }

            if (input == "n")
            {
                SpacedRepetitionSm2.ApplyBinaryReview(card, false);
                session.MarkUnknown(card);
            }
            else
            {
                SpacedRepetitionSm2.ApplyBinaryReview(card, true);
                session.MarkKnown(card);
            }

            if (active != null && _service.IsUserOwnedSet(active))
                _service.SaveUserSets();

            _service.SaveLearningQueue();
            _service.SaveLearningState();
        }

        return LearningSessionExitKind.CompletedNaturally;
    }

    private void RunQuickLessonCase()
    {
        if (_service.GetActiveSet() == null)
        {
            Console.WriteLine("Set an active set first.");
            Console.ReadKey(true);
            return;
        }

        if (_service.IsQuickLessonDone)
        {
            Console.WriteLine("Quick lesson already completed.");
            Console.ReadKey(true);
            return;
        }

        var queue = _service.GetOrCreateQueue();
        var session = new LearningSessionV2(queue, 5);

        var exit = RunLearningSession(session);

        if (exit == LearningSessionExitKind.CompletedNaturally && session.IsCompleted)
        {
            _service.MarkQuickLessonDone();
            _service.SaveLearningState();
            _service.SaveLearningQueue();

            ShowQuickLessonCompletionScreen(session.AnsweredCount);
        }
    }

    private void ShowQuickLessonCompletionScreen(int reviewedCount)
    {
        while (true)
        {
            Console.Clear();
            Console.WriteLine("Done!");
            Console.WriteLine();
            Console.WriteLine($"You reviewed {reviewedCount} cards.");
            Console.WriteLine();
            Console.WriteLine("C. Continue Learning");
            Console.WriteLine("H. Back to Home");
            Console.WriteLine();
            Console.Write("Choose: ");

            var choice = Console.ReadLine()?.Trim().ToLowerInvariant();

            switch (choice)
            {
                case "c":
                    RunContinueLearningCase();
                    return;

                case "h":
                    return;
            }
        }
    }

    private void RunContinueLearningCase()
    {
        if (_service.GetActiveSet() == null)
        {
            Console.WriteLine("Set an active set first.");
            Console.ReadKey(true);
            return;
        }

        var queue = _service.GetOrCreateQueue();
        var session = new LearningSessionV2(queue, int.MaxValue);

        RunLearningSession(session);

        _service.SaveLearningQueue();
        _service.SaveLearningState();
    }
}
