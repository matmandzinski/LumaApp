using System.Text.Json;
using Microsoft.Data.Sqlite;
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

        Assert.True(File.Exists(Path.Combine(dataDir, "simple_flashcards.db")));

        var fresh = new FlashcardSetService(_tempRoot);
        fresh.LoadUserSets();
        Assert.NotEqual(Guid.Empty, fresh.GetUserSets()[0].Id);
        Assert.Equal(FlashcardSetSource.User, fresh.GetUserSets()[0].Source);
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
    public void SaveUserSets_Persists_Card_Learning_State()
    {
        var service = new FlashcardSetService(_tempRoot);
        var card = new Flashcard("x", "y")
        {
            LearningStage = 2,
            ReviewAgainStreak = 0,
            IsLearned = false,
            LastReviewedAt = new DateTime(2026, 5, 15, 12, 30, 0)
        };
        service.AddUserSet(new FlashcardSet("Mine", new[] { card }));

        service.SaveUserSets();

        var fresh = new FlashcardSetService(_tempRoot);
        fresh.LoadUserSets();

        var loadedCard = fresh.GetUserSets()[0].Flashcards[0];
        Assert.Equal(2, loadedCard.LearningStage);
        Assert.Equal(0, loadedCard.ReviewAgainStreak);
        Assert.False(loadedCard.IsLearned);
        Assert.Equal(card.LastReviewedAt, loadedCard.LastReviewedAt);
    }

    [Fact]
    public void LoadUserSets_Treats_Missing_LocalUser_Progress_As_New_Card()
    {
        var service = new FlashcardSetService(_tempRoot);
        var card = new Flashcard("x", "y");
        var set = new FlashcardSet("Mine", new[] { card });
        service.AddUserSet(set);
        service.SaveUserSets();

        using (var connection = new SqliteConnection(
                   $"Data Source={Path.Combine(_tempRoot, "Data", "simple_flashcards.db")}"))
        {
            connection.Open();

            using var deleteProgress = connection.CreateCommand();
            deleteProgress.CommandText = """
                DELETE FROM user_card_progress
                WHERE user_id = $userId
                  AND card_id = $cardId;
                """;
            deleteProgress.Parameters.AddWithValue("$userId", SqliteFlashcardStore.DefaultLocalUserId);
            deleteProgress.Parameters.AddWithValue("$cardId", card.Id.ToString("D"));
            deleteProgress.ExecuteNonQuery();

            using var resetLegacyProgress = connection.CreateCommand();
            resetLegacyProgress.CommandText = """
                UPDATE flashcards
                SET learning_stage = 0,
                    review_again_streak = 0,
                    is_learned = 0,
                    last_reviewed_at = NULL
                WHERE id = $cardId;
                """;
            resetLegacyProgress.Parameters.AddWithValue("$cardId", card.Id.ToString("D"));
            resetLegacyProgress.ExecuteNonQuery();
        }

        var fresh = new FlashcardSetService(_tempRoot);
        fresh.LoadUserSets();

        var loadedCard = fresh.GetUserSets()[0].Flashcards[0];
        Assert.Equal(0, loadedCard.LearningStage);
        Assert.Equal(0, loadedCard.ReviewAgainStreak);
        Assert.False(loadedCard.IsLearned);
        Assert.Null(loadedCard.LastReviewedAt);
    }

    [Fact]
    public void LoadUserSets_Does_Not_Overwrite_User_File_Progress_With_Stale_LearningProgress()
    {
        var dataDir = Path.Combine(_tempRoot, "Data");
        var card = new Flashcard("x", "y")
        {
            LearningStage = 3,
            ReviewAgainStreak = 0,
            IsLearned = true,
            LastReviewedAt = new DateTime(2026, 5, 15, 12, 30, 0)
        };
        var set = new FlashcardSet("Mine", new[] { card });
        File.WriteAllText(
            Path.Combine(dataDir, "user_sets.json"),
            JsonSerializer.Serialize(new List<FlashcardSet> { set }, new JsonSerializerOptions { WriteIndented = true }));

        var staleProgress = new LearningProgressSnapshot
        {
            Cards = new List<CardLearningProgress>
            {
                new()
                {
                    SetId = set.Id,
                    CardId = card.Id,
                    LearningStage = 0,
                    ReviewAgainStreak = 0,
                    IsLearned = false,
                    LastReviewedAt = null
                }
            }
        };
        File.WriteAllText(
            Path.Combine(dataDir, "learning_progress.json"),
            JsonSerializer.Serialize(staleProgress, new JsonSerializerOptions { WriteIndented = true }));

        var service = new FlashcardSetService(_tempRoot);
        service.LoadUserSets();

        var loadedCard = service.GetUserSets()[0].Flashcards[0];
        Assert.Equal(3, loadedCard.LearningStage);
        Assert.True(loadedCard.IsLearned);
        Assert.Equal(card.LastReviewedAt, loadedCard.LastReviewedAt);
    }

    [Fact]
    public void LoadUserSets_Can_Migrate_Legacy_User_Progress_When_User_File_Has_Default_State()
    {
        var dataDir = Path.Combine(_tempRoot, "Data");
        var card = new Flashcard("x", "y");
        var set = new FlashcardSet("Mine", new[] { card });
        File.WriteAllText(
            Path.Combine(dataDir, "user_sets.json"),
            JsonSerializer.Serialize(new List<FlashcardSet> { set }, new JsonSerializerOptions { WriteIndented = true }));

        var savedProgress = new LearningProgressSnapshot
        {
            Cards = new List<CardLearningProgress>
            {
                new()
                {
                    SetId = set.Id,
                    CardId = card.Id,
                    LearningStage = -1,
                    ReviewAgainStreak = 2,
                    IsLearned = false,
                    LastReviewedAt = new DateTime(2026, 5, 15, 13, 0, 0)
                }
            }
        };
        File.WriteAllText(
            Path.Combine(dataDir, "learning_progress.json"),
            JsonSerializer.Serialize(savedProgress, new JsonSerializerOptions { WriteIndented = true }));

        var service = new FlashcardSetService(_tempRoot);
        service.LoadUserSets();

        var loadedCard = service.GetUserSets()[0].Flashcards[0];
        Assert.Equal(-1, loadedCard.LearningStage);
        Assert.Equal(2, loadedCard.ReviewAgainStreak);
        Assert.False(loadedCard.IsLearned);
        Assert.Equal(savedProgress.Cards[0].LastReviewedAt, loadedCard.LastReviewedAt);

        var fresh = new FlashcardSetService(_tempRoot);
        fresh.LoadUserSets();

        var storedCard = fresh.GetUserSets()[0].Flashcards[0];
        Assert.Equal(-1, storedCard.LearningStage);
        Assert.Equal(2, storedCard.ReviewAgainStreak);
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
    public void ReadyMade_LearningProgress_Roundtrips_Without_Modifying_DefaultSets()
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
        var defaultPath = Path.Combine(dataDir, "default_sets.json");
        File.WriteAllText(defaultPath, defaultJson);

        var service = new FlashcardSetService(_tempRoot);
        var card = service.GetDefaultSets()[0].Flashcards[0];
        var queue = new LearningQueue(Array.Empty<Flashcard>());
        queue.MarkKnown(card, allowReinsert: false);
        queue.MarkKnown(card, allowReinsert: false);
        queue.MarkKnown(card, allowReinsert: false);

        service.SaveLearningProgress();

        Assert.Equal(defaultJson, File.ReadAllText(defaultPath));

        var fresh = new FlashcardSetService(_tempRoot);
        var loadedCard = fresh.GetDefaultSets()[0].Flashcards[0];

        Assert.Equal(3, loadedCard.LearningStage);
        Assert.True(loadedCard.IsLearned);
        Assert.NotNull(loadedCard.LastReviewedAt);
    }

    [Fact]
    public void RegisterStudyActivity_Tracks_Daily_Streak_And_Persists()
    {
        var service = new FlashcardSetService(_tempRoot);

        service.RegisterStudyActivity(new DateOnly(2026, 5, 14));
        service.RegisterStudyActivity(new DateOnly(2026, 5, 14));

        var firstDay = service.GetLearningProgressSnapshot();
        Assert.Equal(1, firstDay.CurrentStreak);
        Assert.Equal(1, firstDay.LongestStreak);
        Assert.Equal(new DateOnly(2026, 5, 14), firstDay.LastStudyDate);
        Assert.Equal(1, firstDay.TotalStudyDays);

        service.RegisterStudyActivity(new DateOnly(2026, 5, 15));

        var nextDay = service.GetLearningProgressSnapshot();
        Assert.Equal(2, nextDay.CurrentStreak);
        Assert.Equal(2, nextDay.LongestStreak);
        Assert.Equal(2, nextDay.TotalStudyDays);

        service.RegisterStudyActivity(new DateOnly(2026, 5, 17));

        var afterMissedDay = service.GetLearningProgressSnapshot();
        Assert.Equal(1, afterMissedDay.CurrentStreak);
        Assert.Equal(2, afterMissedDay.LongestStreak);
        Assert.Equal(new DateOnly(2026, 5, 17), afterMissedDay.LastStudyDate);
        Assert.Equal(3, afterMissedDay.TotalStudyDays);

        var fresh = new FlashcardSetService(_tempRoot);
        var restored = fresh.GetLearningProgressSnapshot();

        Assert.Equal(afterMissedDay.CurrentStreak, restored.CurrentStreak);
        Assert.Equal(afterMissedDay.LongestStreak, restored.LongestStreak);
        Assert.Equal(afterMissedDay.LastStudyDate, restored.LastStudyDate);
        Assert.Equal(afterMissedDay.TotalStudyDays, restored.TotalStudyDays);
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
    public void CreateLearningSessionQueue_Uses_Only_Unlearned_Cards()
    {
        var learned = new Flashcard("learned", "A") { LearningStage = 3, IsLearned = true };
        var ready = new Flashcard("ready", "B");
        var service = new FlashcardSetService(_tempRoot);
        var set = new FlashcardSet("Study", new[] { learned, ready });

        service.AddUserSet(set);
        service.SetActiveSet(set);

        var queue = service.CreateLearningSessionQueue();

        Assert.Single(queue.Snapshot());
        Assert.Same(ready, queue.Snapshot()[0]);
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

        var restoredBeforeDelete = new FlashcardSetService(_tempRoot);
        restoredBeforeDelete.LoadUserSets();
        restoredBeforeDelete.LoadLearningState();
        restoredBeforeDelete.LoadLearningQueue();
        Assert.NotNull(restoredBeforeDelete.GetActiveSet());
        Assert.Single(restoredBeforeDelete.GetOrCreateQueue(rebuildIfEmpty: false).Snapshot());

        service.RemoveUserSet(loaded);
        service.SaveUserSets();

        var restoredAfterDelete = new FlashcardSetService(_tempRoot);
        restoredAfterDelete.LoadUserSets();
        restoredAfterDelete.LoadLearningState();

        Assert.Empty(restoredAfterDelete.GetUserSets());
        Assert.Null(restoredAfterDelete.GetActiveSet());
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

        var restoredBeforeSwitch = new FlashcardSetService(_tempRoot);
        restoredBeforeSwitch.LoadUserSets();
        restoredBeforeSwitch.LoadLearningState();
        restoredBeforeSwitch.LoadLearningQueue();
        Assert.Single(restoredBeforeSwitch.GetOrCreateQueue(rebuildIfEmpty: false).Snapshot());

        service.SetActiveSet(service.GetUserSets()[1]);

        var restoredAfterSwitch = new FlashcardSetService(_tempRoot);
        restoredAfterSwitch.LoadUserSets();
        restoredAfterSwitch.LoadLearningState();
        restoredAfterSwitch.LoadLearningQueue();

        Assert.Equal(set2.Id, restoredAfterSwitch.GetActiveSet()!.Id);
        Assert.Equal("b", restoredAfterSwitch.GetOrCreateQueue().GetNext().Front);
    }

    [Fact]
    public void Quick_Lesson_Progress_Persists_Across_Restart_For_Continue_Learning()
    {
        var dataDir = Path.Combine(_tempRoot, "Data");
        var cards = Enumerable.Range(0, 12).Select(i => new Flashcard($"f{i}", $"b{i}")).ToList();
        var set = new FlashcardSet("Big", cards);
        File.WriteAllText(
            Path.Combine(dataDir, "user_sets.json"),
            JsonSerializer.Serialize(new List<FlashcardSet> { set }, new JsonSerializerOptions { WriteIndented = true }));

        var service = new FlashcardSetService(_tempRoot);
        service.LoadUserSets();
        service.SetActiveSet(service.GetUserSets()[0]);
        var queue = service.GetOrCreateQueue();
        var session = new LearningSessionV2(queue, 10, allowReinsert: false);
        for (var i = 0; i < 10; i++)
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
        Assert.Equal(2, q2.Count);
    }
}
