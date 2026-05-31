using System.Globalization;
using Microsoft.Data.Sqlite;
using SimpleFlashCards.Services;

namespace SimpleFlashCards.Tests;

public class SqliteFlashcardStoreReviewTests : IDisposable
{
    private readonly string _tempRoot;
    private readonly string _databasePath;

    public SqliteFlashcardStoreReviewTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), "SimpleFlashCardsReviewTests_" + Guid.NewGuid());
        Directory.CreateDirectory(Path.Combine(_tempRoot, "Data"));
        _databasePath = Path.Combine(_tempRoot, "Data", "simple_flashcards.db");
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
            // Temp cleanup is best-effort.
        }
    }

    [Fact]
    public void ReviewCard_Know_Updates_LocalUser_Progress_And_Legacy_Card_Columns()
    {
        var store = new SqliteFlashcardStore(_databasePath);
        var set = store.CreateUserSet("Review API", new[] { ("alpha", "one") });
        var cardId = set.Flashcards[0].Id;
        var reviewedAt = DateTime.Parse(
            "2026-05-27T12:00:00.0000000Z",
            CultureInfo.InvariantCulture,
            DateTimeStyles.RoundtripKind);

        var result = store.ReviewCard(set.Id, cardId, LearningReviewDecision.Know, reviewedAt);

        Assert.NotNull(result);
        Assert.Equal(0, result.PreviousStage);
        Assert.Equal(1, result.NextStage);
        Assert.False(result.IsLearned);
        Assert.Equal(0, result.ProgressSummary.NewCount);
        Assert.Equal(1, result.ProgressSummary.LearningCount);
        Assert.Equal(0, result.ProgressSummary.LearnedCount);
        Assert.Equal(0, result.ProgressSummary.DifficultCount);

        var storedCard = store.LoadSet(set.Id)!.Flashcards[0];
        Assert.Equal(1, storedCard.LearningStage);
        Assert.Equal(0, storedCard.ReviewAgainStreak);
        Assert.False(storedCard.IsLearned);
        Assert.Equal(reviewedAt, storedCard.LastReviewedAt);

        using var connection = new SqliteConnection($"Data Source={_databasePath}");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT p.learning_stage AS progress_learning_stage,
                   c.learning_stage AS legacy_learning_stage,
                   p.last_reviewed_at AS progress_last_reviewed_at,
                   c.last_reviewed_at AS legacy_last_reviewed_at
            FROM user_card_progress p
            INNER JOIN flashcards c ON c.id = p.card_id
            WHERE p.user_id = $userId
              AND p.card_id = $cardId;
            """;
        command.Parameters.AddWithValue("$userId", SqliteFlashcardStore.DefaultLocalUserId);
        command.Parameters.AddWithValue("$cardId", cardId.ToString("D"));

        using var reader = command.ExecuteReader();
        Assert.True(reader.Read());
        Assert.Equal(1, reader.GetInt32(reader.GetOrdinal("progress_learning_stage")));
        Assert.Equal(1, reader.GetInt32(reader.GetOrdinal("legacy_learning_stage")));
        Assert.Equal(
            reviewedAt.ToString("O", CultureInfo.InvariantCulture),
            reader.GetString(reader.GetOrdinal("progress_last_reviewed_at")));
        Assert.Equal(
            reviewedAt.ToString("O", CultureInfo.InvariantCulture),
            reader.GetString(reader.GetOrdinal("legacy_last_reviewed_at")));
    }

    [Fact]
    public void ReviewCard_Second_ReviewAgain_Marks_Card_Difficult()
    {
        var store = new SqliteFlashcardStore(_databasePath);
        var set = store.CreateUserSet("Difficult Review", new[] { ("beta", "two") });
        var cardId = set.Flashcards[0].Id;

        var first = store.ReviewCard(
            set.Id,
            cardId,
            LearningReviewDecision.ReviewAgain,
            new DateTime(2026, 5, 27, 12, 0, 0, DateTimeKind.Utc));
        var second = store.ReviewCard(
            set.Id,
            cardId,
            LearningReviewDecision.ReviewAgain,
            new DateTime(2026, 5, 27, 12, 1, 0, DateTimeKind.Utc));

        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.Equal(0, first.NextStage);
        Assert.Equal(-1, second.NextStage);
        Assert.False(second.IsLearned);
        Assert.Equal(0, second.ProgressSummary.NewCount);
        Assert.Equal(0, second.ProgressSummary.LearningCount);
        Assert.Equal(0, second.ProgressSummary.LearnedCount);
        Assert.Equal(1, second.ProgressSummary.DifficultCount);

        var storedCard = store.LoadSet(set.Id)!.Flashcards[0];
        Assert.Equal(-1, storedCard.LearningStage);
        Assert.Equal(2, storedCard.ReviewAgainStreak);
        Assert.False(storedCard.IsLearned);
    }
}
