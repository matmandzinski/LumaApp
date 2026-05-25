using System.Globalization;
using Microsoft.Data.Sqlite;
using SimpleFlashCards.Models;

namespace SimpleFlashCards.Services;

public class SqliteFlashcardStore
{
    private const string MigrationMetadataKey = "legacy_json_migration_v1";

    private readonly string _databasePath;

    public SqliteFlashcardStore(string databasePath)
    {
        _databasePath = databasePath;
    }

    public string DatabasePath => _databasePath;

    public void EnsureCreated()
    {
        var directory = Path.GetDirectoryName(_databasePath);
        if (!string.IsNullOrWhiteSpace(directory))
            Directory.CreateDirectory(directory);

        using var connection = OpenConnection();
        ExecuteNonQuery(connection, null, """
            CREATE TABLE IF NOT EXISTS app_metadata (
                key TEXT NOT NULL PRIMARY KEY,
                value TEXT NOT NULL
            );
            """);

        ExecuteNonQuery(connection, null, """
            CREATE TABLE IF NOT EXISTS flashcard_sets (
                id TEXT NOT NULL PRIMARY KEY,
                name TEXT NOT NULL,
                source TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
            """);

        ExecuteNonQuery(connection, null, """
            CREATE TABLE IF NOT EXISTS flashcards (
                id TEXT NOT NULL PRIMARY KEY,
                set_id TEXT NOT NULL,
                front TEXT NOT NULL,
                back TEXT NOT NULL,
                ease_factor REAL NOT NULL,
                repetitions INTEGER NOT NULL,
                interval_days INTEGER NOT NULL,
                next_review_utc TEXT NULL,
                learning_stage INTEGER NOT NULL,
                review_again_streak INTEGER NOT NULL,
                is_learned INTEGER NOT NULL,
                last_reviewed_at TEXT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (set_id) REFERENCES flashcard_sets(id) ON DELETE CASCADE
            );
            """);

        ExecuteNonQuery(connection, null, """
            CREATE INDEX IF NOT EXISTS ix_flashcards_set_order
            ON flashcards(set_id, sort_order);
            """);

        ExecuteNonQuery(connection, null, """
            CREATE TABLE IF NOT EXISTS learning_state (
                id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
                active_set_id TEXT NULL,
                active_set_name TEXT NULL,
                is_quick_lesson_done INTEGER NOT NULL DEFAULT 0
            );
            """);

        ExecuteNonQuery(connection, null, """
            CREATE TABLE IF NOT EXISTS learning_stats (
                id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
                current_streak INTEGER NOT NULL DEFAULT 0,
                longest_streak INTEGER NOT NULL DEFAULT 0,
                last_study_date TEXT NULL,
                total_study_days INTEGER NOT NULL DEFAULT 0
            );
            """);

        ExecuteNonQuery(connection, null, """
            CREATE TABLE IF NOT EXISTS learning_queue_state (
                id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
                active_set_id TEXT NULL
            );
            """);

        ExecuteNonQuery(connection, null, """
            CREATE TABLE IF NOT EXISTS learning_queue_cards (
                position INTEGER NOT NULL PRIMARY KEY,
                card_id TEXT NOT NULL,
                FOREIGN KEY (card_id) REFERENCES flashcards(id) ON DELETE CASCADE
            );
            """);
    }

    public bool IsLegacyJsonMigrationComplete() =>
        GetMetadata(MigrationMetadataKey) == "complete";

    public void MarkLegacyJsonMigrationComplete() =>
        SetMetadata(MigrationMetadataKey, "complete");

    public string? GetMetadata(string key)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            SELECT value
            FROM app_metadata
            WHERE key = $key;
            """);
        command.Parameters.AddWithValue("$key", key);

        return command.ExecuteScalar() as string;
    }

    public void SetMetadata(string key, string value)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            INSERT INTO app_metadata(key, value)
            VALUES($key, $value)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value;
            """);
        command.Parameters.AddWithValue("$key", key);
        command.Parameters.AddWithValue("$value", value);
        command.ExecuteNonQuery();
    }

    public List<FlashcardSet> LoadSets(FlashcardSetSource source)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            SELECT id, name, source
            FROM flashcard_sets
            WHERE source = $source
            ORDER BY sort_order, name;
            """);
        command.Parameters.AddWithValue("$source", source.ToString());

        var sets = new List<FlashcardSet>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            sets.Add(new FlashcardSet
            {
                Id = Guid.Parse(reader.GetString(0)),
                Name = reader.GetString(1),
                Source = Enum.Parse<FlashcardSetSource>(reader.GetString(2)),
                Flashcards = new List<Flashcard>()
            });
        }

        foreach (var set in sets)
            set.Flashcards = LoadCards(connection, null, set.Id);

        return sets;
    }

    public void SaveSets(
        IReadOnlyList<FlashcardSet> sets,
        FlashcardSetSource source,
        bool preserveExistingCardProgress = false)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        var desiredSetIds = sets.Select(set => set.Id.ToString("D")).ToHashSet();
        foreach (var existingId in LoadSetIds(connection, transaction, source))
        {
            if (!desiredSetIds.Contains(existingId))
                DeleteSet(connection, transaction, existingId);
        }

        for (var setIndex = 0; setIndex < sets.Count; setIndex++)
        {
            var set = sets[setIndex];
            set.Source = source;
            UpsertSet(connection, transaction, set, setIndex);

            var desiredCardIds = set.Flashcards.Select(card => card.Id.ToString("D")).ToHashSet();
            foreach (var existingCardId in LoadCardIds(connection, transaction, set.Id))
            {
                if (!desiredCardIds.Contains(existingCardId))
                    DeleteCard(connection, transaction, existingCardId);
            }

            for (var cardIndex = 0; cardIndex < set.Flashcards.Count; cardIndex++)
                UpsertCard(
                    connection,
                    transaction,
                    set.Id,
                    set.Flashcards[cardIndex],
                    cardIndex,
                    preserveExistingCardProgress);
        }

        transaction.Commit();
    }

    public LearningState? LoadLearningState()
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            SELECT active_set_id, active_set_name, is_quick_lesson_done
            FROM learning_state
            WHERE id = 1;
            """);

        using var reader = command.ExecuteReader();
        if (!reader.Read())
            return null;

        return new LearningState
        {
            ActiveSetId = ReadNullableGuid(reader, "active_set_id"),
            ActiveSetName = ReadNullableString(reader, "active_set_name"),
            IsQuickLessonDone = reader.GetInt32(reader.GetOrdinal("is_quick_lesson_done")) == 1
        };
    }

    public void SaveLearningState(LearningState state)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            INSERT INTO learning_state(id, active_set_id, active_set_name, is_quick_lesson_done)
            VALUES(1, $activeSetId, $activeSetName, $isQuickLessonDone)
            ON CONFLICT(id) DO UPDATE SET
                active_set_id = excluded.active_set_id,
                active_set_name = excluded.active_set_name,
                is_quick_lesson_done = excluded.is_quick_lesson_done;
            """);
        AddNullable(command, "$activeSetId", state.ActiveSetId?.ToString("D"));
        AddNullable(command, "$activeSetName", state.ActiveSetName);
        command.Parameters.AddWithValue("$isQuickLessonDone", state.IsQuickLessonDone ? 1 : 0);
        command.ExecuteNonQuery();
    }

    public LearningQueueSnapshot? LoadLearningQueue()
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            SELECT active_set_id
            FROM learning_queue_state
            WHERE id = 1;
            """);

        using var reader = command.ExecuteReader();
        if (!reader.Read())
            return null;

        var snapshot = new LearningQueueSnapshot
        {
            ActiveSetId = ReadNullableGuid(reader, "active_set_id")
        };
        reader.Close();

        using var cardsCommand = CreateCommand(connection, null, """
            SELECT card_id
            FROM learning_queue_cards
            ORDER BY position;
            """);
        using var cardsReader = cardsCommand.ExecuteReader();
        while (cardsReader.Read())
            snapshot.CardIds.Add(Guid.Parse(cardsReader.GetString(0)));

        return snapshot;
    }

    public void SaveLearningQueue(LearningQueueSnapshot snapshot)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        ExecuteNonQuery(connection, transaction, "DELETE FROM learning_queue_cards;");

        using (var stateCommand = CreateCommand(connection, transaction, """
            INSERT INTO learning_queue_state(id, active_set_id)
            VALUES(1, $activeSetId)
            ON CONFLICT(id) DO UPDATE SET active_set_id = excluded.active_set_id;
            """))
        {
            AddNullable(stateCommand, "$activeSetId", snapshot.ActiveSetId?.ToString("D"));
            stateCommand.ExecuteNonQuery();
        }

        for (var index = 0; index < snapshot.CardIds.Count; index++)
        {
            using var cardCommand = CreateCommand(connection, transaction, """
                INSERT INTO learning_queue_cards(position, card_id)
                VALUES($position, $cardId);
                """);
            cardCommand.Parameters.AddWithValue("$position", index);
            cardCommand.Parameters.AddWithValue("$cardId", snapshot.CardIds[index].ToString("D"));
            cardCommand.ExecuteNonQuery();
        }

        transaction.Commit();
    }

    public void ClearLearningQueue()
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        ExecuteNonQuery(connection, transaction, "DELETE FROM learning_queue_cards;");
        ExecuteNonQuery(connection, transaction, "DELETE FROM learning_queue_state WHERE id = 1;");
        transaction.Commit();
    }

    public LearningProgressSnapshot LoadLearningProgressSnapshot()
    {
        EnsureCreated();

        using var connection = OpenConnection();
        var snapshot = LoadLearningStats(connection);

        using var command = CreateCommand(connection, null, """
            SELECT set_id, id, learning_stage, review_again_streak, is_learned, last_reviewed_at
            FROM flashcards
            WHERE learning_stage <> 0
               OR review_again_streak <> 0
               OR is_learned <> 0
               OR last_reviewed_at IS NOT NULL
            ORDER BY set_id, sort_order;
            """);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            snapshot.Cards.Add(new CardLearningProgress
            {
                SetId = Guid.Parse(reader.GetString(reader.GetOrdinal("set_id"))),
                CardId = Guid.Parse(reader.GetString(reader.GetOrdinal("id"))),
                LearningStage = reader.GetInt32(reader.GetOrdinal("learning_stage")),
                ReviewAgainStreak = reader.GetInt32(reader.GetOrdinal("review_again_streak")),
                IsLearned = reader.GetInt32(reader.GetOrdinal("is_learned")) == 1,
                LastReviewedAt = ReadNullableDateTime(reader, "last_reviewed_at")
            });
        }

        return snapshot;
    }

    public void SaveLearningProgressSnapshot(LearningProgressSnapshot snapshot)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        using (var statsCommand = CreateCommand(connection, transaction, """
            INSERT INTO learning_stats(id, current_streak, longest_streak, last_study_date, total_study_days)
            VALUES(1, $currentStreak, $longestStreak, $lastStudyDate, $totalStudyDays)
            ON CONFLICT(id) DO UPDATE SET
                current_streak = excluded.current_streak,
                longest_streak = excluded.longest_streak,
                last_study_date = excluded.last_study_date,
                total_study_days = excluded.total_study_days;
            """))
        {
            statsCommand.Parameters.AddWithValue("$currentStreak", snapshot.CurrentStreak);
            statsCommand.Parameters.AddWithValue("$longestStreak", snapshot.LongestStreak);
            AddNullable(statsCommand, "$lastStudyDate", FormatDateOnly(snapshot.LastStudyDate));
            statsCommand.Parameters.AddWithValue("$totalStudyDays", snapshot.TotalStudyDays);
            statsCommand.ExecuteNonQuery();
        }

        foreach (var card in snapshot.Cards)
        {
            using var cardCommand = CreateCommand(connection, transaction, """
                UPDATE flashcards
                SET learning_stage = $learningStage,
                    review_again_streak = $reviewAgainStreak,
                    is_learned = $isLearned,
                    last_reviewed_at = $lastReviewedAt
                WHERE set_id = $setId
                  AND id = $cardId;
                """);
            cardCommand.Parameters.AddWithValue("$learningStage", card.LearningStage);
            cardCommand.Parameters.AddWithValue("$reviewAgainStreak", card.ReviewAgainStreak);
            cardCommand.Parameters.AddWithValue("$isLearned", card.IsLearned ? 1 : 0);
            AddNullable(cardCommand, "$lastReviewedAt", FormatDateTime(card.LastReviewedAt));
            cardCommand.Parameters.AddWithValue("$setId", card.SetId.ToString("D"));
            cardCommand.Parameters.AddWithValue("$cardId", card.CardId.ToString("D"));
            cardCommand.ExecuteNonQuery();
        }

        transaction.Commit();
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection($"Data Source={_databasePath}");
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_keys = ON;";
        command.ExecuteNonQuery();

        return connection;
    }

    private static List<Flashcard> LoadCards(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        Guid setId)
    {
        using var command = CreateCommand(connection, transaction, """
            SELECT id, front, back, ease_factor, repetitions, interval_days, next_review_utc,
                   learning_stage, review_again_streak, is_learned, last_reviewed_at
            FROM flashcards
            WHERE set_id = $setId
            ORDER BY sort_order;
            """);
        command.Parameters.AddWithValue("$setId", setId.ToString("D"));

        var cards = new List<Flashcard>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            cards.Add(new Flashcard
            {
                Id = Guid.Parse(reader.GetString(reader.GetOrdinal("id"))),
                Front = reader.GetString(reader.GetOrdinal("front")),
                Back = reader.GetString(reader.GetOrdinal("back")),
                EaseFactor = reader.GetDouble(reader.GetOrdinal("ease_factor")),
                Repetitions = reader.GetInt32(reader.GetOrdinal("repetitions")),
                IntervalDays = reader.GetInt32(reader.GetOrdinal("interval_days")),
                NextReviewUtc = ReadNullableDateTime(reader, "next_review_utc"),
                LearningStage = reader.GetInt32(reader.GetOrdinal("learning_stage")),
                ReviewAgainStreak = reader.GetInt32(reader.GetOrdinal("review_again_streak")),
                IsLearned = reader.GetInt32(reader.GetOrdinal("is_learned")) == 1,
                LastReviewedAt = ReadNullableDateTime(reader, "last_reviewed_at")
            });
        }

        return cards;
    }

    private static List<string> LoadSetIds(
        SqliteConnection connection,
        SqliteTransaction transaction,
        FlashcardSetSource source)
    {
        using var command = CreateCommand(connection, transaction, """
            SELECT id
            FROM flashcard_sets
            WHERE source = $source;
            """);
        command.Parameters.AddWithValue("$source", source.ToString());

        var ids = new List<string>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
            ids.Add(reader.GetString(0));

        return ids;
    }

    private static List<string> LoadCardIds(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid setId)
    {
        using var command = CreateCommand(connection, transaction, """
            SELECT id
            FROM flashcards
            WHERE set_id = $setId;
            """);
        command.Parameters.AddWithValue("$setId", setId.ToString("D"));

        var ids = new List<string>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
            ids.Add(reader.GetString(0));

        return ids;
    }

    private static void UpsertSet(
        SqliteConnection connection,
        SqliteTransaction transaction,
        FlashcardSet set,
        int sortOrder)
    {
        using var command = CreateCommand(connection, transaction, """
            INSERT INTO flashcard_sets(id, name, source, sort_order)
            VALUES($id, $name, $source, $sortOrder)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                source = excluded.source,
                sort_order = excluded.sort_order;
            """);
        command.Parameters.AddWithValue("$id", set.Id.ToString("D"));
        command.Parameters.AddWithValue("$name", set.Name);
        command.Parameters.AddWithValue("$source", set.Source.ToString());
        command.Parameters.AddWithValue("$sortOrder", sortOrder);
        command.ExecuteNonQuery();
    }

    private static void UpsertCard(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid setId,
        Flashcard card,
        int sortOrder,
        bool preserveExistingProgress)
    {
        var conflictUpdate = preserveExistingProgress
            ? """
                set_id = excluded.set_id,
                front = excluded.front,
                back = excluded.back,
                sort_order = excluded.sort_order
                """
            : """
                set_id = excluded.set_id,
                front = excluded.front,
                back = excluded.back,
                ease_factor = excluded.ease_factor,
                repetitions = excluded.repetitions,
                interval_days = excluded.interval_days,
                next_review_utc = excluded.next_review_utc,
                learning_stage = excluded.learning_stage,
                review_again_streak = excluded.review_again_streak,
                is_learned = excluded.is_learned,
                last_reviewed_at = excluded.last_reviewed_at,
                sort_order = excluded.sort_order
                """;

        using var command = CreateCommand(connection, transaction, $"""
            INSERT INTO flashcards(
                id, set_id, front, back, ease_factor, repetitions, interval_days, next_review_utc,
                learning_stage, review_again_streak, is_learned, last_reviewed_at, sort_order)
            VALUES(
                $id, $setId, $front, $back, $easeFactor, $repetitions, $intervalDays, $nextReviewUtc,
                $learningStage, $reviewAgainStreak, $isLearned, $lastReviewedAt, $sortOrder)
            ON CONFLICT(id) DO UPDATE SET
                {conflictUpdate};
            """);
        command.Parameters.AddWithValue("$id", card.Id.ToString("D"));
        command.Parameters.AddWithValue("$setId", setId.ToString("D"));
        command.Parameters.AddWithValue("$front", card.Front);
        command.Parameters.AddWithValue("$back", card.Back);
        command.Parameters.AddWithValue("$easeFactor", card.EaseFactor);
        command.Parameters.AddWithValue("$repetitions", card.Repetitions);
        command.Parameters.AddWithValue("$intervalDays", card.IntervalDays);
        AddNullable(command, "$nextReviewUtc", FormatDateTime(card.NextReviewUtc));
        command.Parameters.AddWithValue("$learningStage", card.LearningStage);
        command.Parameters.AddWithValue("$reviewAgainStreak", card.ReviewAgainStreak);
        command.Parameters.AddWithValue("$isLearned", card.IsLearned ? 1 : 0);
        AddNullable(command, "$lastReviewedAt", FormatDateTime(card.LastReviewedAt));
        command.Parameters.AddWithValue("$sortOrder", sortOrder);
        command.ExecuteNonQuery();
    }

    private static void DeleteSet(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string id)
    {
        using var command = CreateCommand(connection, transaction, """
            DELETE FROM flashcard_sets
            WHERE id = $id;
            """);
        command.Parameters.AddWithValue("$id", id);
        command.ExecuteNonQuery();
    }

    private static void DeleteCard(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string id)
    {
        using var command = CreateCommand(connection, transaction, """
            DELETE FROM flashcards
            WHERE id = $id;
            """);
        command.Parameters.AddWithValue("$id", id);
        command.ExecuteNonQuery();
    }

    private static LearningProgressSnapshot LoadLearningStats(SqliteConnection connection)
    {
        using var command = CreateCommand(connection, null, """
            SELECT current_streak, longest_streak, last_study_date, total_study_days
            FROM learning_stats
            WHERE id = 1;
            """);

        using var reader = command.ExecuteReader();
        if (!reader.Read())
            return new LearningProgressSnapshot();

        return new LearningProgressSnapshot
        {
            CurrentStreak = reader.GetInt32(reader.GetOrdinal("current_streak")),
            LongestStreak = reader.GetInt32(reader.GetOrdinal("longest_streak")),
            LastStudyDate = ReadNullableDateOnly(reader, "last_study_date"),
            TotalStudyDays = reader.GetInt32(reader.GetOrdinal("total_study_days"))
        };
    }

    private static void ExecuteNonQuery(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string sql)
    {
        using var command = CreateCommand(connection, transaction, sql);
        command.ExecuteNonQuery();
    }

    private static SqliteCommand CreateCommand(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string sql)
    {
        var command = connection.CreateCommand();
        command.CommandText = sql;
        if (transaction != null)
            command.Transaction = transaction;

        return command;
    }

    private static void AddNullable(SqliteCommand command, string name, string? value) =>
        command.Parameters.AddWithValue(name, value ?? (object)DBNull.Value);

    private static string? FormatDateTime(DateTime? value) =>
        value?.ToString("O", CultureInfo.InvariantCulture);

    private static string? FormatDateOnly(DateOnly? value) =>
        value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static DateTime? ReadNullableDateTime(SqliteDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        if (reader.IsDBNull(ordinal))
            return null;

        return DateTime.Parse(
            reader.GetString(ordinal),
            CultureInfo.InvariantCulture,
            DateTimeStyles.RoundtripKind);
    }

    private static DateOnly? ReadNullableDateOnly(SqliteDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        if (reader.IsDBNull(ordinal))
            return null;

        return DateOnly.ParseExact(
            reader.GetString(ordinal),
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture);
    }

    private static Guid? ReadNullableGuid(SqliteDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        if (reader.IsDBNull(ordinal))
            return null;

        return Guid.Parse(reader.GetString(ordinal));
    }

    private static string? ReadNullableString(SqliteDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    }
}
