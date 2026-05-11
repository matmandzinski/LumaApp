using System.Text.Json;
using SimpleFlashCards.Models;
using SimpleFlashCards.Services;

namespace SimpleFlashCards.Tests;

public class FlashcardSetServicePersistenceTests : IDisposable
{
    private readonly string _tempRoot;

    public FlashcardSetServicePersistenceTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), "SimpleFlashCardsTests_" + Guid.NewGuid());
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
            // ignored — temp cleanup best-effort
        }
    }

    [Fact]
    public void LoadUserSets_Assigns_Ids_For_Legacy_Json_And_Can_Save_Roundtrip()
    {
        var legacyJson = """
            [
              {
                "Name": "Legacy",
                "Flashcards": [
                  { "Front": "a", "Back": "b" }
                ]
              }
            ]
            """;

        var dataDir = Path.Combine(_tempRoot, "Data");
        File.WriteAllText(Path.Combine(dataDir, "user_sets.json"), legacyJson);

        var service = new FlashcardSetService(_tempRoot);
        service.LoadUserSets();

        var sets = service.GetUserSets();
        Assert.Single(sets);
        Assert.NotEqual(Guid.Empty, sets[0].Id);
        Assert.Equal(FlashcardSetSource.User, sets[0].Source);
        Assert.NotEqual(Guid.Empty, sets[0].Flashcards[0].Id);

        service.SaveUserSets();

        var json = File.ReadAllText(Path.Combine(dataDir, "user_sets.json"));
        var parsed = JsonSerializer.Deserialize<List<FlashcardSet>>(json);
        Assert.NotNull(parsed);
        Assert.NotEqual(Guid.Empty, parsed![0].Id);
        Assert.Equal(FlashcardSetSource.User, parsed[0].Source);
    }

    [Fact]
    public void LoadUserSets_Always_Treats_User_File_Sets_As_User_Source()
    {
        var dataDir = Path.Combine(_tempRoot, "Data");
        var set = new FlashcardSet("Mine", new[] { new Flashcard("x", "y") })
        {
            Source = FlashcardSetSource.ReadyMade
        };
        File.WriteAllText(
            Path.Combine(dataDir, "user_sets.json"),
            JsonSerializer.Serialize(new List<FlashcardSet> { set }, new JsonSerializerOptions { WriteIndented = true }));

        var service = new FlashcardSetService(_tempRoot);
        service.LoadUserSets();

        Assert.Single(service.GetUserSets());
        Assert.Equal(FlashcardSetSource.User, service.GetUserSets()[0].Source);
    }

    [Fact]
    public void AddUserSet_Forces_User_Source()
    {
        var service = new FlashcardSetService(_tempRoot);
        var set = new FlashcardSet("Mine", new[] { new Flashcard("x", "y") })
        {
            Source = FlashcardSetSource.ReadyMade
        };

        service.AddUserSet(set);

        Assert.Equal(FlashcardSetSource.User, service.GetUserSets()[0].Source);
    }

    [Fact]
    public void GetDefaultSets_Marks_Loaded_Sets_As_ReadyMade_Source()
    {
        var defaultJson = """
            [
              {
                "Name": "Built in",
                "Flashcards": [
                  { "Front": "a", "Back": "b" }
                ]
              }
            ]
            """;

        var dataDir = Path.Combine(_tempRoot, "Data");
        File.WriteAllText(Path.Combine(dataDir, "default_sets.json"), defaultJson);

        var service = new FlashcardSetService(_tempRoot);
        var sets = service.GetDefaultSets();

        Assert.Single(sets);
        Assert.Equal(FlashcardSetSource.ReadyMade, sets[0].Source);
    }

    [Fact]
    public void SaveLearningState_Writes_ActiveSetId_And_LoadLearningState_Restores_By_Id()
    {
        var dataDir = Path.Combine(_tempRoot, "Data");
        var set = new FlashcardSet("Mine", new[] { new Flashcard("x", "y") });
        File.WriteAllText(
            Path.Combine(dataDir, "user_sets.json"),
            JsonSerializer.Serialize(new List<FlashcardSet> { set }, new JsonSerializerOptions { WriteIndented = true }));

        var service = new FlashcardSetService(_tempRoot);
        service.LoadUserSets();
        service.SetActiveSet(service.GetUserSets()[0]);

        var fresh = new FlashcardSetService(_tempRoot);
        fresh.LoadUserSets();
        fresh.LoadLearningState();

        Assert.NotNull(fresh.GetActiveSet());
        Assert.Equal(set.Id, fresh.GetActiveSet()!.Id);
    }

    [Fact]
    public void GetOrCreateQueue_Shuffles_New_Queue_And_Keeps_Active_Order_Stable()
    {
        var dataDir = Path.Combine(_tempRoot, "Data");
        var set = new FlashcardSet("Shuffle", new[]
        {
            new Flashcard("a", "A"),
            new Flashcard("b", "B"),
            new Flashcard("c", "C")
        });
        File.WriteAllText(
            Path.Combine(dataDir, "user_sets.json"),
            JsonSerializer.Serialize(new List<FlashcardSet> { set }, new JsonSerializerOptions { WriteIndented = true }));

        var service = new FlashcardSetService(_tempRoot, new FixedSequenceRandom(0, 0));
        service.LoadUserSets();
        service.SetActiveSet(service.GetUserSets()[0]);

        var queue = service.GetOrCreateQueue();
        var firstSnapshot = queue.Snapshot().Select(card => card.Front).ToList();
        var secondSnapshot = service.GetOrCreateQueue().Snapshot().Select(card => card.Front).ToList();

        Assert.Equal(new[] { "b", "c", "a" }, firstSnapshot);
        Assert.Equal(firstSnapshot, secondSnapshot);
    }

    [Fact]
    public void RemoveUserSet_When_Active_Clears_State_File()
    {
        var dataDir = Path.Combine(_tempRoot, "Data");
        var set = new FlashcardSet("Del", new[] { new Flashcard("x", "y") });
        File.WriteAllText(
            Path.Combine(dataDir, "user_sets.json"),
            JsonSerializer.Serialize(new List<FlashcardSet> { set }, new JsonSerializerOptions { WriteIndented = true }));

        var service = new FlashcardSetService(_tempRoot);
        service.LoadUserSets();
        var loaded = service.GetUserSets()[0];
        service.SetActiveSet(loaded);
        service.GetOrCreateQueue();
        service.SaveLearningQueue();

        var queuePath = Path.Combine(dataDir, "learning_queue.json");
        Assert.True(File.Exists(queuePath));

        service.RemoveUserSet(loaded);
        service.SaveUserSets();

        Assert.False(File.Exists(queuePath));

        var statePath = Path.Combine(dataDir, "learning_state.json");
        Assert.True(File.Exists(statePath));
        var state = JsonSerializer.Deserialize<LearningState>(File.ReadAllText(statePath));
        Assert.NotNull(state);
        Assert.Null(state!.ActiveSetId);
        Assert.Null(state.ActiveSetName);
    }

    [Fact]
    public void SetActiveSet_Deletes_Learning_Queue_File()
    {
        var dataDir = Path.Combine(_tempRoot, "Data");
        var set1 = new FlashcardSet("One", new[] { new Flashcard("a", "A") });
        var set2 = new FlashcardSet("Two", new[] { new Flashcard("b", "B") });
        File.WriteAllText(
            Path.Combine(dataDir, "user_sets.json"),
            JsonSerializer.Serialize(new List<FlashcardSet> { set1, set2 }, new JsonSerializerOptions { WriteIndented = true }));

        var service = new FlashcardSetService(_tempRoot);
        service.LoadUserSets();
        service.SetActiveSet(service.GetUserSets()[0]);
        service.GetOrCreateQueue();
        service.SaveLearningQueue();

        var queuePath = Path.Combine(dataDir, "learning_queue.json");
        Assert.True(File.Exists(queuePath));

        service.SetActiveSet(service.GetUserSets()[1]);

        Assert.False(File.Exists(queuePath));
    }

    [Fact]
    public void Quick_Lesson_Progress_Persists_Across_Restart_For_Continue_Learning()
    {
        var dataDir = Path.Combine(_tempRoot, "Data");
        var cards = Enumerable.Range(0, 10).Select(i => new Flashcard($"f{i}", $"b{i}")).ToList();
        var set = new FlashcardSet("Big", cards);
        File.WriteAllText(
            Path.Combine(dataDir, "user_sets.json"),
            JsonSerializer.Serialize(new List<FlashcardSet> { set }, new JsonSerializerOptions { WriteIndented = true }));

        var service = new FlashcardSetService(_tempRoot);
        service.LoadUserSets();
        service.SetActiveSet(service.GetUserSets()[0]);
        var queue = service.GetOrCreateQueue();
        var session = new LearningSessionV2(queue, 5);
        for (var i = 0; i < 5; i++)
        {
            var c = session.GetNext();
            session.MarkKnown(c);
        }

        service.SaveLearningQueue();
        service.SaveLearningState();

        var fresh = new FlashcardSetService(_tempRoot);
        fresh.LoadUserSets();
        fresh.LoadDefaultSets();
        fresh.LoadLearningState();
        fresh.LoadLearningQueue();

        var q2 = fresh.GetOrCreateQueue(rebuildIfEmpty: false);
        Assert.Equal(5, q2.Count);
    }
}
