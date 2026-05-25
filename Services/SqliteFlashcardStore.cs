using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
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
                external_id TEXT NULL,
                name TEXT NOT NULL,
                source TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
            """);

        if (!ColumnExists(connection, "flashcard_sets", "external_id"))
        {
            ExecuteNonQuery(connection, null, """
                ALTER TABLE flashcard_sets
                ADD COLUMN external_id TEXT NULL;
                """);
        }

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

        EnsureFlashcardSetExternalIds(connection);

        if (!HasDuplicateExternalIds(connection))
        {
            ExecuteNonQuery(connection, null, """
                CREATE UNIQUE INDEX IF NOT EXISTS ux_flashcard_sets_external_id
                ON flashcard_sets(external_id)
                WHERE external_id IS NOT NULL;
                """);
        }

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

        ExecuteNonQuery(connection, null, """
            CREATE TABLE IF NOT EXISTS web_app_state (
                key TEXT NOT NULL PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """);

        ExecuteNonQuery(connection, null, """
            CREATE TABLE IF NOT EXISTS quick_lesson_completions (
                active_set_id TEXT NOT NULL,
                local_date TEXT NOT NULL,
                completed_at TEXT NOT NULL,
                PRIMARY KEY (active_set_id, local_date),
                FOREIGN KEY (active_set_id) REFERENCES flashcard_sets(id) ON DELETE CASCADE
            );
            """);

        ExecuteNonQuery(connection, null, """
            CREATE TABLE IF NOT EXISTS lesson_snapshots (
                id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
                active_set_id TEXT NOT NULL,
                session_type TEXT NOT NULL,
                queue_card_ids_json TEXT NOT NULL,
                current_card_index INTEGER NOT NULL,
                reviewed_count INTEGER NOT NULL,
                is_revealed INTEGER NOT NULL,
                local_date TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (active_set_id) REFERENCES flashcard_sets(id) ON DELETE CASCADE
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
            SELECT id, external_id, name, source
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
                ExternalId = reader.GetString(1),
                Name = reader.GetString(2),
                Source = Enum.Parse<FlashcardSetSource>(reader.GetString(3)),
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
            EnsureExternalId(set, setIndex);
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

    public List<FlashcardSet> LoadAllSets()
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            SELECT id, external_id, name, source
            FROM flashcard_sets
            ORDER BY
                CASE source WHEN 'User' THEN 0 ELSE 1 END,
                sort_order,
                name;
            """);

        var sets = new List<FlashcardSet>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            sets.Add(new FlashcardSet
            {
                Id = Guid.Parse(reader.GetString(0)),
                ExternalId = reader.GetString(1),
                Name = reader.GetString(2),
                Source = Enum.Parse<FlashcardSetSource>(reader.GetString(3)),
                Flashcards = new List<Flashcard>()
            });
        }

        foreach (var set in sets)
            set.Flashcards = LoadCards(connection, null, set.Id);

        return sets;
    }

    public FlashcardSet? LoadSet(Guid setId)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            SELECT id, external_id, name, source
            FROM flashcard_sets
            WHERE id = $id;
            """);
        command.Parameters.AddWithValue("$id", setId.ToString("D"));

        using var reader = command.ExecuteReader();
        if (!reader.Read())
            return null;

        var set = new FlashcardSet
        {
            Id = Guid.Parse(reader.GetString(0)),
            ExternalId = reader.GetString(1),
            Name = reader.GetString(2),
            Source = Enum.Parse<FlashcardSetSource>(reader.GetString(3)),
            Flashcards = new List<Flashcard>()
        };
        reader.Close();

        set.Flashcards = LoadCards(connection, null, set.Id);
        return set;
    }

    public FlashcardSet? LoadSetByExternalId(string externalId)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        return LoadSetByExternalId(connection, null, externalId);
    }

    public FlashcardSet? LoadSetByPublicId(string setId)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        var set = LoadSetByExternalId(connection, null, setId);
        if (set != null)
            return set;

        return Guid.TryParse(setId, out var internalId)
            ? LoadSet(connection, null, internalId)
            : null;
    }

    public FlashcardSet CreateUserSet(string name, IReadOnlyList<(string Front, string Back)> cards)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        var set = new FlashcardSet
        {
            Id = Guid.NewGuid(),
            Source = FlashcardSetSource.User,
            Name = name.Trim()
        };
        EnsureExternalId(set, 0);

        var sortOrder = GetNextSetSortOrder(connection, transaction, FlashcardSetSource.User);
        UpsertSet(connection, transaction, set, sortOrder);

        for (var index = 0; index < cards.Count; index++)
        {
            var card = new Flashcard(cards[index].Front.Trim(), cards[index].Back.Trim());
            UpsertCard(connection, transaction, set.Id, card, index, preserveExistingProgress: false);
        }

        transaction.Commit();
        return LoadSet(set.Id)!;
    }

    public FlashcardSet? RenameUserSet(Guid setId, string name)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            UPDATE flashcard_sets
            SET name = $name
            WHERE id = $id
              AND source = $source;
            """);
        command.Parameters.AddWithValue("$name", name.Trim());
        command.Parameters.AddWithValue("$id", setId.ToString("D"));
        command.Parameters.AddWithValue("$source", FlashcardSetSource.User.ToString());

        return command.ExecuteNonQuery() == 0 ? null : LoadSet(setId);
    }

    public bool DeleteUserSet(Guid setId)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        ExecuteNonQuery(connection, transaction, """
            DELETE FROM lesson_snapshots
            WHERE active_set_id = $id;
            """, command => command.Parameters.AddWithValue("$id", setId.ToString("D")));

        ExecuteNonQuery(connection, transaction, """
            DELETE FROM quick_lesson_completions
            WHERE active_set_id = $id;
            """, command => command.Parameters.AddWithValue("$id", setId.ToString("D")));

        ExecuteNonQuery(connection, transaction, """
            DELETE FROM learning_queue_state
            WHERE active_set_id = $id;
            """, command => command.Parameters.AddWithValue("$id", setId.ToString("D")));

        ExecuteNonQuery(connection, transaction, """
            UPDATE learning_state
            SET active_set_id = NULL,
                active_set_name = NULL,
                is_quick_lesson_done = 0
            WHERE active_set_id = $id;
            """, command => command.Parameters.AddWithValue("$id", setId.ToString("D")));

        using var command = CreateCommand(connection, transaction, """
            DELETE FROM flashcard_sets
            WHERE id = $id
              AND source = $source;
            """);
        command.Parameters.AddWithValue("$id", setId.ToString("D"));
        command.Parameters.AddWithValue("$source", FlashcardSetSource.User.ToString());
        var deleted = command.ExecuteNonQuery() > 0;

        transaction.Commit();
        return deleted;
    }

    public SetProgressSummary ResetSetProgress(Guid setId)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        ExecuteNonQuery(connection, transaction, """
            UPDATE flashcards
            SET ease_factor = 2.5,
                repetitions = 0,
                interval_days = 0,
                next_review_utc = NULL,
                learning_stage = 0,
                review_again_streak = 0,
                is_learned = 0,
                last_reviewed_at = NULL
            WHERE set_id = $setId;
            """, command => command.Parameters.AddWithValue("$setId", setId.ToString("D")));

        ExecuteNonQuery(connection, transaction, """
            DELETE FROM learning_queue_cards
            WHERE card_id IN (
                SELECT id
                FROM flashcards
                WHERE set_id = $setId
            );
            """, command => command.Parameters.AddWithValue("$setId", setId.ToString("D")));

        ExecuteNonQuery(connection, transaction, """
            DELETE FROM learning_queue_state
            WHERE active_set_id = $setId;
            """, command => command.Parameters.AddWithValue("$setId", setId.ToString("D")));

        ExecuteNonQuery(connection, transaction, """
            DELETE FROM lesson_snapshots
            WHERE active_set_id = $setId;
            """, command => command.Parameters.AddWithValue("$setId", setId.ToString("D")));

        ExecuteNonQuery(connection, transaction, """
            DELETE FROM quick_lesson_completions
            WHERE active_set_id = $setId;
            """, command => command.Parameters.AddWithValue("$setId", setId.ToString("D")));

        ExecuteNonQuery(connection, transaction, """
            UPDATE learning_state
            SET is_quick_lesson_done = 0
            WHERE active_set_id = $setId;
            """, command => command.Parameters.AddWithValue("$setId", setId.ToString("D")));

        var summary = LoadSetProgressSummary(connection, transaction, setId);
        transaction.Commit();
        return summary;
    }

    public Flashcard CreateCard(Guid setId, string front, string back)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        var card = new Flashcard(front.Trim(), back.Trim());
        var sortOrder = GetNextCardSortOrder(connection, transaction, setId);
        UpsertCard(connection, transaction, setId, card, sortOrder, preserveExistingProgress: false);

        transaction.Commit();
        return LoadCard(setId, card.Id)!;
    }

    public Flashcard? UpdateCard(Guid setId, Guid cardId, string front, string back)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            UPDATE flashcards
            SET front = $front,
                back = $back
            WHERE set_id = $setId
              AND id = $cardId;
            """);
        command.Parameters.AddWithValue("$front", front.Trim());
        command.Parameters.AddWithValue("$back", back.Trim());
        command.Parameters.AddWithValue("$setId", setId.ToString("D"));
        command.Parameters.AddWithValue("$cardId", cardId.ToString("D"));

        return command.ExecuteNonQuery() == 0 ? null : LoadCard(setId, cardId);
    }

    public bool DeleteCard(Guid setId, Guid cardId)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        using var command = CreateCommand(connection, transaction, """
            DELETE FROM flashcards
            WHERE set_id = $setId
              AND id = $cardId;
            """);
        command.Parameters.AddWithValue("$setId", setId.ToString("D"));
        command.Parameters.AddWithValue("$cardId", cardId.ToString("D"));
        var deleted = command.ExecuteNonQuery() > 0;

        if (deleted)
        {
            ExecuteNonQuery(connection, transaction, """
                DELETE FROM lesson_snapshots
                WHERE active_set_id = $setId;
                """, snapshotCommand => snapshotCommand.Parameters.AddWithValue("$setId", setId.ToString("D")));
        }

        transaction.Commit();
        return deleted;
    }

    public string? LoadWebActiveSetId() =>
        GetWebAppStateValue("active_set_id");

    public void SaveWebActiveSetId(string activeSetId) =>
        SetWebAppStateValue("active_set_id", activeSetId);

    public void DeleteWebActiveSetId() =>
        DeleteWebAppStateValue("active_set_id");

    public string? GetWebAppStateValue(string key)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            SELECT value
            FROM web_app_state
            WHERE key = $key;
            """);
        command.Parameters.AddWithValue("$key", key);

        return command.ExecuteScalar() as string;
    }

    public void SetWebAppStateValue(string key, string value)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            INSERT INTO web_app_state(key, value, updated_at)
            VALUES($key, $value, $updatedAt)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at;
            """);
        command.Parameters.AddWithValue("$key", key);
        command.Parameters.AddWithValue("$value", value);
        command.Parameters.AddWithValue("$updatedAt", FormatDateTime(DateTime.UtcNow));
        command.ExecuteNonQuery();
    }

    public void DeleteWebAppStateValue(string key)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            DELETE FROM web_app_state
            WHERE key = $key;
            """);
        command.Parameters.AddWithValue("$key", key);
        command.ExecuteNonQuery();
    }

    public QuickLessonCompletion? LoadQuickLessonCompletion(Guid activeSetId, DateOnly localDate)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            SELECT active_set_id, local_date, completed_at
            FROM quick_lesson_completions
            WHERE active_set_id = $activeSetId
              AND local_date = $localDate;
            """);
        command.Parameters.AddWithValue("$activeSetId", activeSetId.ToString("D"));
        command.Parameters.AddWithValue("$localDate", FormatDateOnly(localDate));

        using var reader = command.ExecuteReader();
        if (!reader.Read())
            return null;

        return new QuickLessonCompletion
        {
            ActiveSetId = Guid.Parse(reader.GetString(reader.GetOrdinal("active_set_id"))),
            LocalDate = ReadDateOnly(reader, "local_date"),
            CompletedAt = ReadDateTime(reader, "completed_at")
        };
    }

    public QuickLessonCompletion SaveQuickLessonCompletion(Guid activeSetId, DateOnly localDate)
    {
        EnsureCreated();

        var completedAt = DateTime.UtcNow;

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            INSERT INTO quick_lesson_completions(active_set_id, local_date, completed_at)
            VALUES($activeSetId, $localDate, $completedAt)
            ON CONFLICT(active_set_id, local_date) DO UPDATE SET
                completed_at = excluded.completed_at;
            """);
        command.Parameters.AddWithValue("$activeSetId", activeSetId.ToString("D"));
        command.Parameters.AddWithValue("$localDate", FormatDateOnly(localDate));
        command.Parameters.AddWithValue("$completedAt", FormatDateTime(completedAt));
        command.ExecuteNonQuery();

        return new QuickLessonCompletion
        {
            ActiveSetId = activeSetId,
            LocalDate = localDate,
            CompletedAt = completedAt
        };
    }

    public LessonSnapshot? LoadLessonSnapshot()
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, """
            SELECT id, active_set_id, session_type, queue_card_ids_json,
                   current_card_index, reviewed_count, is_revealed,
                   local_date, created_at, updated_at
            FROM lesson_snapshots
            WHERE id = 1;
            """);

        using var reader = command.ExecuteReader();
        if (!reader.Read())
            return null;

        return ReadLessonSnapshot(reader);
    }

    public LessonSnapshot SaveLessonSnapshot(LessonSnapshot snapshot)
    {
        EnsureCreated();

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        DateTime? existingCreatedAt = null;
        using (var existingCommand = CreateCommand(connection, transaction, """
            SELECT created_at
            FROM lesson_snapshots
            WHERE id = 1;
            """))
        {
            var value = existingCommand.ExecuteScalar() as string;
            if (!string.IsNullOrWhiteSpace(value))
                existingCreatedAt = ParseDateTime(value);
        }

        var now = DateTime.UtcNow;
        var createdAt = snapshot.CreatedAt == default
            ? existingCreatedAt ?? now
            : snapshot.CreatedAt;
        var updatedAt = snapshot.UpdatedAt == default ? now : snapshot.UpdatedAt;
        var queueCardIdsJson = JsonSerializer.Serialize(
            snapshot.QueueCardIds.Select(id => id.ToString("D")).ToList());

        using (var command = CreateCommand(connection, transaction, """
            INSERT INTO lesson_snapshots(
                id, active_set_id, session_type, queue_card_ids_json,
                current_card_index, reviewed_count, is_revealed,
                local_date, created_at, updated_at)
            VALUES(
                1, $activeSetId, $sessionType, $queueCardIdsJson,
                $currentCardIndex, $reviewedCount, $isRevealed,
                $localDate, $createdAt, $updatedAt)
            ON CONFLICT(id) DO UPDATE SET
                active_set_id = excluded.active_set_id,
                session_type = excluded.session_type,
                queue_card_ids_json = excluded.queue_card_ids_json,
                current_card_index = excluded.current_card_index,
                reviewed_count = excluded.reviewed_count,
                is_revealed = excluded.is_revealed,
                local_date = excluded.local_date,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at;
            """))
        {
            command.Parameters.AddWithValue("$activeSetId", snapshot.ActiveSetId.ToString("D"));
            command.Parameters.AddWithValue("$sessionType", snapshot.SessionType);
            command.Parameters.AddWithValue("$queueCardIdsJson", queueCardIdsJson);
            command.Parameters.AddWithValue("$currentCardIndex", snapshot.CurrentCardIndex);
            command.Parameters.AddWithValue("$reviewedCount", snapshot.ReviewedCount);
            command.Parameters.AddWithValue("$isRevealed", snapshot.IsRevealed ? 1 : 0);
            command.Parameters.AddWithValue("$localDate", FormatDateOnly(snapshot.LocalDate));
            command.Parameters.AddWithValue("$createdAt", FormatDateTime(createdAt));
            command.Parameters.AddWithValue("$updatedAt", FormatDateTime(updatedAt));
            command.ExecuteNonQuery();
        }

        transaction.Commit();

        return new LessonSnapshot
        {
            Id = 1,
            ActiveSetId = snapshot.ActiveSetId,
            SessionType = snapshot.SessionType,
            QueueCardIds = snapshot.QueueCardIds.ToList(),
            CurrentCardIndex = snapshot.CurrentCardIndex,
            ReviewedCount = snapshot.ReviewedCount,
            IsRevealed = snapshot.IsRevealed,
            LocalDate = snapshot.LocalDate,
            CreatedAt = createdAt,
            UpdatedAt = updatedAt
        };
    }

    public void DeleteLessonSnapshot()
    {
        EnsureCreated();

        using var connection = OpenConnection();
        ExecuteNonQuery(connection, null, "DELETE FROM lesson_snapshots WHERE id = 1;");
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

    private static FlashcardSet? LoadSet(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        Guid setId)
    {
        using var command = CreateCommand(connection, transaction, """
            SELECT id, external_id, name, source
            FROM flashcard_sets
            WHERE id = $id;
            """);
        command.Parameters.AddWithValue("$id", setId.ToString("D"));

        using var reader = command.ExecuteReader();
        if (!reader.Read())
            return null;

        var set = new FlashcardSet
        {
            Id = Guid.Parse(reader.GetString(0)),
            ExternalId = reader.GetString(1),
            Name = reader.GetString(2),
            Source = Enum.Parse<FlashcardSetSource>(reader.GetString(3)),
            Flashcards = new List<Flashcard>()
        };
        reader.Close();

        set.Flashcards = LoadCards(connection, transaction, set.Id);
        return set;
    }

    private static FlashcardSet? LoadSetByExternalId(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string externalId)
    {
        using var command = CreateCommand(connection, transaction, """
            SELECT id
            FROM flashcard_sets
            WHERE external_id = $externalId;
            """);
        command.Parameters.AddWithValue("$externalId", externalId);

        var id = command.ExecuteScalar() as string;
        return Guid.TryParse(id, out var setId)
            ? LoadSet(connection, transaction, setId)
            : null;
    }

    private static Flashcard? LoadCard(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        Guid setId,
        Guid cardId)
    {
        using var command = CreateCommand(connection, transaction, """
            SELECT id, front, back, ease_factor, repetitions, interval_days, next_review_utc,
                   learning_stage, review_again_streak, is_learned, last_reviewed_at
            FROM flashcards
            WHERE set_id = $setId
              AND id = $cardId;
            """);
        command.Parameters.AddWithValue("$setId", setId.ToString("D"));
        command.Parameters.AddWithValue("$cardId", cardId.ToString("D"));

        using var reader = command.ExecuteReader();
        if (!reader.Read())
            return null;

        return ReadCard(reader);
    }

    private Flashcard? LoadCard(Guid setId, Guid cardId)
    {
        using var connection = OpenConnection();
        return LoadCard(connection, null, setId, cardId);
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
            cards.Add(ReadCard(reader));

        return cards;
    }

    private static Flashcard ReadCard(SqliteDataReader reader) =>
        new()
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
        };

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
            INSERT INTO flashcard_sets(id, external_id, name, source, sort_order)
            VALUES($id, $externalId, $name, $source, $sortOrder)
            ON CONFLICT(id) DO UPDATE SET
                external_id = excluded.external_id,
                name = excluded.name,
                source = excluded.source,
                sort_order = excluded.sort_order;
            """);
        command.Parameters.AddWithValue("$id", set.Id.ToString("D"));
        command.Parameters.AddWithValue("$externalId", set.ExternalId);
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

    private static bool ColumnExists(SqliteConnection connection, string tableName, string columnName)
    {
        using var command = CreateCommand(connection, null, $"PRAGMA table_info({tableName});");
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            if (string.Equals(reader.GetString(reader.GetOrdinal("name")), columnName, StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }

    private static void EnsureFlashcardSetExternalIds(SqliteConnection connection)
    {
        using var command = CreateCommand(connection, null, """
            SELECT id, name, source, sort_order
            FROM flashcard_sets
            WHERE external_id IS NULL
               OR trim(external_id) = '';
            """);

        var missingExternalIds = new List<(string Id, string ExternalId)>();
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                var id = reader.GetString(reader.GetOrdinal("id"));
                var name = reader.GetString(reader.GetOrdinal("name"));
                var source = Enum.Parse<FlashcardSetSource>(reader.GetString(reader.GetOrdinal("source")));
                var sortOrder = reader.GetInt32(reader.GetOrdinal("sort_order"));
                var externalId = source == FlashcardSetSource.ReadyMade
                    ? CreateReadyMadeExternalId(sortOrder, name)
                    : id;

                missingExternalIds.Add((id, externalId));
            }
        }

        foreach (var row in missingExternalIds)
        {
            using var updateCommand = CreateCommand(connection, null, """
                UPDATE flashcard_sets
                SET external_id = $externalId
                WHERE id = $id;
                """);
            updateCommand.Parameters.AddWithValue("$externalId", row.ExternalId);
            updateCommand.Parameters.AddWithValue("$id", row.Id);
            updateCommand.ExecuteNonQuery();
        }
    }

    private static bool HasDuplicateExternalIds(SqliteConnection connection)
    {
        using var command = CreateCommand(connection, null, """
            SELECT 1
            FROM flashcard_sets
            WHERE external_id IS NOT NULL
              AND trim(external_id) <> ''
            GROUP BY external_id
            HAVING COUNT(*) > 1
            LIMIT 1;
            """);

        return command.ExecuteScalar() != null;
    }

    private static void EnsureExternalId(FlashcardSet set, int sortOrder)
    {
        if (!string.IsNullOrWhiteSpace(set.ExternalId))
            return;

        set.ExternalId = set.Source == FlashcardSetSource.ReadyMade
            ? CreateReadyMadeExternalId(sortOrder, set.Name)
            : set.Id.ToString("D");
    }

    private static string CreateReadyMadeExternalId(int sortOrder, string name)
    {
        var normalizedName = Regex.Replace(name.ToLowerInvariant(), @"\s+", "-");
        return $"default-{sortOrder}-{normalizedName}";
    }

    private static int GetNextSetSortOrder(
        SqliteConnection connection,
        SqliteTransaction transaction,
        FlashcardSetSource source)
    {
        using var command = CreateCommand(connection, transaction, """
            SELECT COALESCE(MAX(sort_order), -1) + 1
            FROM flashcard_sets
            WHERE source = $source;
            """);
        command.Parameters.AddWithValue("$source", source.ToString());
        return Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture);
    }

    private static int GetNextCardSortOrder(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid setId)
    {
        using var command = CreateCommand(connection, transaction, """
            SELECT COALESCE(MAX(sort_order), -1) + 1
            FROM flashcards
            WHERE set_id = $setId;
            """);
        command.Parameters.AddWithValue("$setId", setId.ToString("D"));
        return Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture);
    }

    private static SetProgressSummary LoadSetProgressSummary(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid setId)
    {
        using var command = CreateCommand(connection, transaction, """
            SELECT s.id,
                   s.external_id,
                   COUNT(c.id) AS total_cards,
                   SUM(CASE WHEN c.is_learned = 1 THEN 1 ELSE 0 END) AS learned_cards,
                   SUM(CASE WHEN c.is_learned = 0 AND c.learning_stage = -1 THEN 1 ELSE 0 END) AS difficult_cards
            FROM flashcard_sets s
            LEFT JOIN flashcards c ON c.set_id = s.id
            WHERE s.id = $setId
            GROUP BY s.id, s.external_id;
            """);
        command.Parameters.AddWithValue("$setId", setId.ToString("D"));

        using var reader = command.ExecuteReader();
        if (!reader.Read())
            return new SetProgressSummary { SetId = setId };

        var totalCards = Convert.ToInt32(reader.GetValue(reader.GetOrdinal("total_cards")), CultureInfo.InvariantCulture);
        var learnedCards = Convert.ToInt32(reader.GetValue(reader.GetOrdinal("learned_cards")), CultureInfo.InvariantCulture);
        var difficultCards = Convert.ToInt32(reader.GetValue(reader.GetOrdinal("difficult_cards")), CultureInfo.InvariantCulture);

        return new SetProgressSummary
        {
            SetId = Guid.Parse(reader.GetString(reader.GetOrdinal("id"))),
            ExternalId = reader.GetString(reader.GetOrdinal("external_id")),
            TotalCards = totalCards,
            LearnedCards = learnedCards,
            DifficultCards = difficultCards,
            LearningCards = Math.Max(totalCards - learnedCards - difficultCards, 0)
        };
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

    private static LessonSnapshot ReadLessonSnapshot(SqliteDataReader reader)
    {
        var queueCardIdsJson = reader.GetString(reader.GetOrdinal("queue_card_ids_json"));

        return new LessonSnapshot
        {
            Id = reader.GetInt64(reader.GetOrdinal("id")),
            ActiveSetId = Guid.Parse(reader.GetString(reader.GetOrdinal("active_set_id"))),
            SessionType = reader.GetString(reader.GetOrdinal("session_type")),
            QueueCardIds = DeserializeGuidList(queueCardIdsJson),
            CurrentCardIndex = reader.GetInt32(reader.GetOrdinal("current_card_index")),
            ReviewedCount = reader.GetInt32(reader.GetOrdinal("reviewed_count")),
            IsRevealed = reader.GetInt32(reader.GetOrdinal("is_revealed")) == 1,
            LocalDate = ReadDateOnly(reader, "local_date"),
            CreatedAt = ReadDateTime(reader, "created_at"),
            UpdatedAt = ReadDateTime(reader, "updated_at")
        };
    }

    private static List<Guid> DeserializeGuidList(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<List<Guid>>(json) ?? new List<Guid>();
        }
        catch
        {
            return new List<Guid>();
        }
    }

    private static void ExecuteNonQuery(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string sql)
    {
        using var command = CreateCommand(connection, transaction, sql);
        command.ExecuteNonQuery();
    }

    private static void ExecuteNonQuery(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string sql,
        Action<SqliteCommand> configure)
    {
        using var command = CreateCommand(connection, transaction, sql);
        configure(command);
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

    private static DateTime ParseDateTime(string value) =>
        DateTime.Parse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.RoundtripKind);

    private static DateTime ReadDateTime(SqliteDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        return ParseDateTime(reader.GetString(ordinal));
    }

    private static DateOnly ReadDateOnly(SqliteDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        return DateOnly.ParseExact(
            reader.GetString(ordinal),
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture);
    }

    private static DateTime? ReadNullableDateTime(SqliteDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        if (reader.IsDBNull(ordinal))
            return null;

        return ParseDateTime(reader.GetString(ordinal));
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
