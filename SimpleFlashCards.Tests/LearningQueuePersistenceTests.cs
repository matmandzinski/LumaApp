using System.Text.Json;
using SimpleFlashCards.Models;
using SimpleFlashCards.Services;

namespace SimpleFlashCards.Tests;

public class LearningQueuePersistenceTests : IDisposable
{
    private readonly string _tempRoot;

    public LearningQueuePersistenceTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), "SimpleFlashCardsQueueTests_" + Guid.NewGuid());
        Directory.CreateDirectory(Path.Combine(_tempRoot, "Data"));
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_tempRoot))
                Directory.Delete(_tempRoot, recursive: true);
        }
        catch
        {
            // best-effort
        }
    }

    [Fact]
    public void Save_and_LoadLearningQueue_Preserves_Current_Queue_Order()
    {
        var dataDir = Path.Combine(_tempRoot, "Data");
        var cards = new[]
        {
            new Flashcard("a", "A"),
            new Flashcard("b", "B"),
            new Flashcard("c", "C")
        };
        var set = new FlashcardSet("Test", cards);
        File.WriteAllText(
            Path.Combine(dataDir, "user_sets.json"),
            JsonSerializer.Serialize(new List<FlashcardSet> { set }, new JsonSerializerOptions { WriteIndented = true }));

        var service = new FlashcardSetService(_tempRoot, new FixedSequenceRandom(0, 0));
        service.LoadUserSets();
        set = service.GetUserSets()[0];

        service.SetActiveSet(set);
        var queue = service.GetOrCreateQueue();
        _ = queue.GetNext(); // removes b from the shuffled order, leaving c, a

        service.SaveLearningQueue();

        var fresh = new FlashcardSetService(_tempRoot);
        fresh.LoadUserSets();
        fresh.LoadDefaultSets();
        fresh.LoadLearningState();
        fresh.LoadLearningQueue();

        var q2 = fresh.GetOrCreateQueue(rebuildIfEmpty: false);
        Assert.Equal(2, q2.Count);
        Assert.Equal("c", q2.GetNext().Front);
        Assert.Equal("a", q2.GetNext().Front);
    }

    [Fact]
    public void LoadLearningQueue_Ignores_Snapshot_When_ActiveSetId_Mismatches()
    {
        var dataDir = Path.Combine(_tempRoot, "Data");
        var setA = new FlashcardSet("A", new[] { new Flashcard("a", "A") });
        var setB = new FlashcardSet("B", new[] { new Flashcard("b", "B") });
        File.WriteAllText(
            Path.Combine(dataDir, "user_sets.json"),
            JsonSerializer.Serialize(new List<FlashcardSet> { setA, setB }, new JsonSerializerOptions { WriteIndented = true }));

        var staleSnapshot = new LearningQueueSnapshot
        {
            ActiveSetId = setA.Id,
            CardIds = setA.Flashcards.Select(c => c.Id).ToList()
        };
        File.WriteAllText(
            Path.Combine(dataDir, "learning_queue.json"),
            JsonSerializer.Serialize(staleSnapshot, new JsonSerializerOptions { WriteIndented = true }));

        var state = new LearningState { ActiveSetId = setB.Id, IsQuickLessonDone = false };
        File.WriteAllText(
            Path.Combine(dataDir, "learning_state.json"),
            JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }));

        var fresh = new FlashcardSetService(_tempRoot);
        fresh.LoadUserSets();
        fresh.LoadLearningState();
        fresh.LoadLearningQueue();

        Assert.Equal(setB.Id, fresh.GetActiveSet()!.Id);
        var q = fresh.GetOrCreateQueue();
        Assert.Single(q.Snapshot());
        Assert.Equal("b", q.GetNext().Front);
    }

    [Fact]
    public void GetOrCreateQueue_Rebuilds_When_Persisted_Queue_Is_Empty()
    {
        var dataDir = Path.Combine(_tempRoot, "Data");
        var set = new FlashcardSet("S", new[] { new Flashcard("x", "X"), new Flashcard("y", "Y") });
        File.WriteAllText(
            Path.Combine(dataDir, "user_sets.json"),
            JsonSerializer.Serialize(new List<FlashcardSet> { set }, new JsonSerializerOptions { WriteIndented = true }));

        var emptySnapshot = new LearningQueueSnapshot
        {
            ActiveSetId = set.Id,
            CardIds = new List<Guid>()
        };
        File.WriteAllText(
            Path.Combine(dataDir, "learning_queue.json"),
            JsonSerializer.Serialize(emptySnapshot, new JsonSerializerOptions { WriteIndented = true }));

        var state = new LearningState { ActiveSetId = set.Id };
        File.WriteAllText(
            Path.Combine(dataDir, "learning_state.json"),
            JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }));

        var service = new FlashcardSetService(_tempRoot);
        service.LoadUserSets();
        set = service.GetUserSets()[0];
        service.LoadLearningState();
        service.LoadLearningQueue();

        var q = service.GetOrCreateQueue();
        Assert.Equal(2, q.Count);
    }
}
