using System.Globalization;
using SimpleFlashCards.Models;
using SimpleFlashCards.Services;

const string viteDevCorsPolicy = "ViteDev";

var builder = WebApplication.CreateBuilder(args);
var dataRoot = ResolveDataRoot(builder.Environment.ContentRootPath, builder.Configuration);
var databasePath = Path.Combine(dataRoot, "Data", "simple_flashcards.db");

BootstrapDatabase(dataRoot);

builder.Services.AddSingleton(new SqliteFlashcardStore(databasePath));
builder.Services.AddCors(options =>
{
    options.AddPolicy(
        viteDevCorsPolicy,
        policy => policy
            .WithOrigins("http://localhost:5173", "http://localhost:8081", "http://127.0.0.1:8081")
            .AllowAnyHeader()
            .AllowAnyMethod());
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.MapGet("/", () => Results.Redirect("/swagger")).ExcludeFromDescription();
}

app.UseCors(viteDevCorsPolicy);

var api = app.MapGroup("/api")
    .WithTags("Local SQLite API");

api.MapGet("/app-state", (SqliteFlashcardStore store) =>
    {
        var localDate = DateOnly.FromDateTime(DateTime.Now);
        var activeSet = ResolveActiveSetFromState(store);
        QuickLessonCompletionStatusResponse? todaysCompletion = null;

        if (activeSet != null)
        {
            var completion = store.LoadQuickLessonCompletion(activeSet.Id, localDate);
            todaysCompletion = ToCompletionStatus(activeSet, localDate, completion);
        }

        return Results.Ok(new AppStateResponse(
            activeSet?.ExternalId,
            activeSet?.Id.ToString("D"),
            activeSet?.ExternalId,
            FormatDate(localDate),
            todaysCompletion,
            ToLessonSnapshotResponse(store.LoadLessonSnapshot(), store)));
    })
    .WithSummary("Read the small web app state payload.")
    .WithDescription("activeSetId is the public external set id. activeSetInternalId is included for diagnostics.");

api.MapGet("/sets", (SqliteFlashcardStore store) =>
    {
        var sets = store.LoadAllSets()
            .Select(ToSummaryResponse)
            .ToList();

        return Results.Ok(sets);
    })
    .WithSummary("List flashcard sets stored in SQLite.")
    .WithDescription("Use externalId from this response in public set endpoints.");

api.MapGet("/sets/{externalSetId}", (string externalSetId, SqliteFlashcardStore store) =>
    {
        var set = store.LoadSetByPublicId(externalSetId);
        return set == null ? Results.NotFound() : Results.Ok(ToSetResponse(set));
    })
    .WithSummary("Read one flashcard set by external id.")
    .WithDescription("The route prefers externalId and also accepts the internal GUID during migration.");

api.MapGet("/sets/{externalSetId}/progress", (string externalSetId, SqliteFlashcardStore store) =>
    {
        if (!TryLoadSet(store, externalSetId, out var set, out var error))
            return error;

        return Results.Ok(ToProgressSummaryResponse(store.LoadSetProgressSummary(set!.Id)));
    })
    .WithSummary("Read local-user progress for one flashcard set.")
    .WithDescription("Progress is currently scoped to the placeholder local-user until real authentication exists.");

api.MapPost("/sets", (CreateSetRequest request, SqliteFlashcardStore store) =>
    {
        var name = NormalizeRequiredText(request.Name);
        if (name == null)
            return ValidationError("name", "Set name is required.");

        if (!TryNormalizeCardInputs(request.Cards ?? Array.Empty<CardInputRequest>(), out var cards, out var validationError))
            return validationError;

        var set = store.CreateUserSet(name, cards);
        return Results.Created($"/api/sets/{set.ExternalId}", ToSetResponse(set));
    })
    .WithSummary("Create a user flashcard set.")
    .WithDescription("Creates a custom User set. Its externalId is the generated internal GUID string.");

api.MapPut("/sets/{externalSetId}", (string externalSetId, UpdateSetRequest request, SqliteFlashcardStore store) =>
    {
        if (!TryLoadSet(store, externalSetId, out var set, out var error))
            return error;

        if (!EnsureUserSet(set!, out var readOnlyError))
            return readOnlyError;

        var name = NormalizeRequiredText(request.Name);
        if (name == null)
            return ValidationError("name", "Set name is required.");

        var updatedSet = store.RenameUserSet(set!.Id, name);
        return updatedSet == null ? Results.NotFound() : Results.Ok(ToSetResponse(updatedSet));
    })
    .WithSummary("Rename a user set.")
    .WithDescription("Ready-made sets are read-only and return 403.");

api.MapDelete("/sets/{externalSetId}", (string externalSetId, SqliteFlashcardStore store) =>
    {
        if (!TryLoadSet(store, externalSetId, out var set, out var error))
            return error;

        if (!EnsureUserSet(set!, out var readOnlyError))
            return readOnlyError;

        var activeSet = ResolveActiveSetFromState(store);
        var deleted = store.DeleteUserSet(set!.Id);
        if (!deleted)
            return Results.NotFound();

        string? activeSetExternalId = activeSet?.ExternalId;
        if (activeSet?.Id == set.Id)
        {
            var fallback = store.LoadSets(FlashcardSetSource.ReadyMade).FirstOrDefault();
            if (fallback == null)
            {
                store.DeleteWebActiveSetId();
                activeSetExternalId = null;
            }
            else
            {
                store.SaveWebActiveSetId(fallback.ExternalId);
                activeSetExternalId = fallback.ExternalId;
            }
        }

        return Results.Ok(new DeleteSetResponse(set.ExternalId, true, activeSetExternalId));
    })
    .WithSummary("Delete a user set.")
    .WithDescription("Ready-made sets are read-only and return 403. If the deleted set is active, the API falls back to the first ready-made set when available.");

api.MapPost("/sets/{externalSetId}/reset-progress", (string externalSetId, SqliteFlashcardStore store) =>
    {
        if (!TryLoadSet(store, externalSetId, out var set, out var error))
            return error;

        var summary = store.ResetSetProgress(set!.Id);
        return Results.Ok(ToProgressSummaryResponse(summary));
    })
    .WithSummary("Reset learning progress for a set.")
    .WithDescription("This keeps set and card text intact. It is allowed for both User and ReadyMade sets because it only resets local learning progress.");

api.MapPost("/sets/{externalSetId}/cards", (string externalSetId, CardInputRequest request, SqliteFlashcardStore store) =>
    {
        if (!TryLoadSet(store, externalSetId, out var set, out var error))
            return error;

        if (!EnsureUserSet(set!, out var readOnlyError))
            return readOnlyError;

        var front = NormalizeRequiredText(request.Front);
        var back = NormalizeRequiredText(request.Back);
        if (front == null)
            return ValidationError("front", "Card front is required.");

        if (back == null)
            return ValidationError("back", "Card back is required.");

        var card = store.CreateCard(set!.Id, front, back);
        return Results.Created($"/api/sets/{set.ExternalId}/cards/{card.Id:D}", ToCardResponse(card));
    })
    .WithSummary("Add a card to a user set.")
    .WithDescription("Ready-made sets are read-only and return 403.");

api.MapPut("/sets/{externalSetId}/cards/{cardId}", (string externalSetId, string cardId, CardInputRequest request, SqliteFlashcardStore store) =>
    {
        if (!TryLoadSet(store, externalSetId, out var set, out var error))
            return error;

        if (!EnsureUserSet(set!, out var readOnlyError))
            return readOnlyError;

        if (!Guid.TryParse(cardId, out var parsedCardId))
            return ValidationError("cardId", "Use a card id returned by GET /api/sets/{externalSetId}.");

        var front = NormalizeRequiredText(request.Front);
        var back = NormalizeRequiredText(request.Back);
        if (front == null)
            return ValidationError("front", "Card front is required.");

        if (back == null)
            return ValidationError("back", "Card back is required.");

        var card = store.UpdateCard(set!.Id, parsedCardId, front, back);
        return card == null ? Results.NotFound() : Results.Ok(ToCardResponse(card));
    })
    .WithSummary("Edit a card in a user set.")
    .WithDescription("Ready-made sets are read-only and return 403.");

api.MapDelete("/sets/{externalSetId}/cards/{cardId}", (string externalSetId, string cardId, SqliteFlashcardStore store) =>
    {
        if (!TryLoadSet(store, externalSetId, out var set, out var error))
            return error;

        if (!EnsureUserSet(set!, out var readOnlyError))
            return readOnlyError;

        if (!Guid.TryParse(cardId, out var parsedCardId))
            return ValidationError("cardId", "Use a card id returned by GET /api/sets/{externalSetId}.");

        var deleted = store.DeleteCard(set!.Id, parsedCardId);
        return deleted ? Results.Ok(new DeleteCardResponse(set.ExternalId, cardId, true)) : Results.NotFound();
    })
    .WithSummary("Delete a card from a user set.")
    .WithDescription("Ready-made sets are read-only and return 403.");

api.MapPost("/sets/{externalSetId}/cards/{cardId}/review", (string externalSetId, string cardId, ReviewCardRequest request, SqliteFlashcardStore store) =>
    {
        if (!TryLoadSet(store, externalSetId, out var set, out var error))
            return error;

        if (!Guid.TryParse(cardId, out var parsedCardId))
            return ValidationError("cardId", "Use a card id returned by GET /api/sets/{externalSetId}.");

        if (!TryParseReviewDecision(request.Decision, out var decision))
            return ValidationError("decision", "Use know or reviewAgain.");

        if (!IsSupportedReviewSessionType(request.SessionType))
            return ValidationError("sessionType", "Use quickLesson or continueLearning.");

        var reviewedAt = request.ReviewedAt ?? DateTime.UtcNow;
        var result = store.ReviewCard(set!.Id, parsedCardId, decision, reviewedAt);

        return result == null
            ? Results.NotFound(new ErrorResponse("Card not found."))
            : Results.Ok(ToReviewCardResponse(set, result, request.Decision!, request.SessionType!, reviewedAt));
    })
    .WithSummary("Apply one learning review decision to a card.")
    .WithDescription("Updates local-user progress in user_card_progress. Ready-made set content is read-only, but local learning progress is writable for both ready-made and user sets.");

api.MapPut("/active-set", (ActiveSetRequest request, SqliteFlashcardStore store) =>
    {
        if (!TryLoadSet(store, request.ActiveSetId, out var set, out var error))
            return error;

        store.SaveWebActiveSetId(set!.ExternalId);
        return Results.Ok(new ActiveSetResponse(set.ExternalId, set.Id.ToString("D"), set.ExternalId));
    })
    .WithSummary("Persist the selected active set id for the web app.")
    .WithDescription("Request activeSetId accepts externalId. Internal GUIDs are accepted only for migration/manual testing.");

api.MapGet("/lesson-snapshot", (SqliteFlashcardStore store) =>
    {
        var snapshot = store.LoadLessonSnapshot();
        return snapshot == null ? Results.NotFound() : Results.Ok(ToLessonSnapshotResponse(snapshot, store));
    })
    .WithSummary("Read the current in-progress quick lesson snapshot.");

api.MapPut("/lesson-snapshot", (LessonSnapshotRequest request, SqliteFlashcardStore store) =>
    {
        if (!TryLoadSet(store, request.ActiveSetId, out var set, out var error))
            return error;

        if (!string.Equals(request.SessionType, "quickLesson", StringComparison.Ordinal))
            return ValidationError("sessionType", "Only the quickLesson session type is supported.");

        if (!TryParseDate(request.LocalDate, out var localDate))
            return ValidationError("localDate", "Use YYYY-MM-DD.");

        if (request.QueueCardIds == null)
            return ValidationError("queueCardIds", "Queue card ids are required.");

        var queueCardIds = new List<Guid>();
        foreach (var cardId in request.QueueCardIds)
        {
            if (!Guid.TryParse(cardId, out var parsedCardId))
                return ValidationError("queueCardIds", $"Invalid card id: {cardId}");

            queueCardIds.Add(parsedCardId);
        }

        if (request.CurrentCardIndex < 0 || request.CurrentCardIndex > queueCardIds.Count)
            return ValidationError("currentCardIndex", "Current card index must be inside the queue bounds.");

        if (request.ReviewedCount < 0)
            return ValidationError("reviewedCount", "Reviewed count must be zero or greater.");

        var setCardIds = set!.Flashcards.Select(card => card.Id).ToHashSet();
        if (queueCardIds.Any(cardId => !setCardIds.Contains(cardId)))
            return ValidationError("queueCardIds", "Every queued card id must belong to the active set.");

        var snapshot = store.SaveLessonSnapshot(new LessonSnapshot
        {
            ActiveSetId = set.Id,
            SessionType = request.SessionType,
            QueueCardIds = queueCardIds,
            CurrentCardIndex = request.CurrentCardIndex,
            ReviewedCount = request.ReviewedCount,
            IsRevealed = request.IsRevealed,
            LocalDate = localDate,
            CreatedAt = request.CreatedAt ?? default,
            UpdatedAt = DateTime.UtcNow
        });

        return Results.Ok(ToLessonSnapshotResponse(snapshot, store));
    })
    .WithSummary("Save the current in-progress quick lesson snapshot.")
    .WithDescription("Request activeSetId accepts externalId. Internal GUIDs are accepted only for migration/manual testing.");

api.MapDelete("/lesson-snapshot", (SqliteFlashcardStore store) =>
    {
        store.DeleteLessonSnapshot();
        return Results.NoContent();
    })
    .WithSummary("Clear the current in-progress quick lesson snapshot.");

api.MapGet("/quick-lesson-completion", (string activeSetId, string date, SqliteFlashcardStore store) =>
    {
        if (!TryLoadSet(store, activeSetId, out var set, out var error))
            return error;

        if (!TryParseDate(date, out var localDate))
            return ValidationError("date", "Use YYYY-MM-DD.");

        var completion = store.LoadQuickLessonCompletion(set!.Id, localDate);
        return Results.Ok(ToCompletionStatus(set, localDate, completion));
    })
    .WithSummary("Read whether quick lesson is complete for a set and date.")
    .WithDescription("Query activeSetId accepts externalId. Internal GUIDs are accepted only for migration/manual testing.");

api.MapPut("/quick-lesson-completion", (QuickLessonCompletionRequest request, SqliteFlashcardStore store) =>
    {
        if (!TryLoadSet(store, request.ActiveSetId, out var set, out var error))
            return error;

        if (!TryParseDate(request.Date, out var localDate))
            return ValidationError("date", "Use YYYY-MM-DD.");

        var completion = store.SaveQuickLessonCompletion(set!.Id, localDate);
        return Results.Ok(ToCompletionStatus(set, localDate, completion));
    })
    .WithSummary("Mark quick lesson complete for a set and date.")
    .WithDescription("Request activeSetId accepts externalId. Internal GUIDs are accepted only for migration/manual testing.");

app.Run();

static string ResolveDataRoot(string contentRootPath, IConfiguration configuration)
{
    var configuredRoot = configuration["SimpleFlashCards:DataRoot"]
        ?? Environment.GetEnvironmentVariable("SIMPLE_FLASHCARDS_DATA_ROOT");

    if (!string.IsNullOrWhiteSpace(configuredRoot))
        return Path.GetFullPath(configuredRoot);

    var parent = Directory.GetParent(contentRootPath)?.FullName;
    if (!string.IsNullOrWhiteSpace(parent) &&
        File.Exists(Path.Combine(parent, "Data", "default_sets.json")))
    {
        return parent;
    }

    return contentRootPath;
}

static void BootstrapDatabase(string dataRoot)
{
    var service = new FlashcardSetService(dataRoot);
    service.LoadUserSets();
    service.LoadDefaultSets();
}

static FlashcardSet? ResolveActiveSetFromState(SqliteFlashcardStore store)
{
    var activeSetId = store.LoadWebActiveSetId();
    if (!string.IsNullOrWhiteSpace(activeSetId))
    {
        var set = store.LoadSetByPublicId(activeSetId);
        if (set != null)
            return set;
    }

    var legacyState = store.LoadLearningState();
    return legacyState?.ActiveSetId == null ? null : store.LoadSet(legacyState.ActiveSetId.Value);
}

static bool TryLoadSet(
    SqliteFlashcardStore store,
    string? setId,
    out FlashcardSet? set,
    out IResult error)
{
    set = null;
    error = Results.Ok();

    if (string.IsNullOrWhiteSpace(setId))
    {
        error = ValidationError("setId", "Use an externalId returned by GET /api/sets.");
        return false;
    }

    set = store.LoadSetByPublicId(setId);
    if (set == null)
    {
        error = Results.NotFound(new ErrorResponse("Set not found."));
        return false;
    }

    return true;
}

static bool EnsureUserSet(FlashcardSet set, out IResult error)
{
    if (set.Source == FlashcardSetSource.User)
    {
        error = Results.Ok();
        return true;
    }

    error = Results.Problem(
        title: "Ready-made sets are read-only.",
        detail: "Only user-created sets can be renamed, deleted, or have cards modified.",
        statusCode: StatusCodes.Status403Forbidden);
    return false;
}

static bool TryNormalizeCardInputs(
    IReadOnlyList<CardInputRequest> inputs,
    out List<(string Front, string Back)> cards,
    out IResult error)
{
    cards = new List<(string Front, string Back)>();
    error = Results.Ok();

    for (var index = 0; index < inputs.Count; index++)
    {
        var front = NormalizeRequiredText(inputs[index].Front);
        var back = NormalizeRequiredText(inputs[index].Back);

        if (front == null)
        {
            error = ValidationError($"cards[{index}].front", "Card front is required.");
            return false;
        }

        if (back == null)
        {
            error = ValidationError($"cards[{index}].back", "Card back is required.");
            return false;
        }

        cards.Add((front, back));
    }

    return true;
}

static string? NormalizeRequiredText(string? value)
{
    var normalized = value?.Trim();
    return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
}

static bool TryParseDate(string? value, out DateOnly localDate) =>
    DateOnly.TryParseExact(
        value,
        "yyyy-MM-dd",
        CultureInfo.InvariantCulture,
        DateTimeStyles.None,
        out localDate);

static bool TryParseReviewDecision(string? value, out LearningReviewDecision decision)
{
    decision = default;

    if (string.Equals(value, "know", StringComparison.Ordinal))
    {
        decision = LearningReviewDecision.Know;
        return true;
    }

    if (string.Equals(value, "reviewAgain", StringComparison.Ordinal))
    {
        decision = LearningReviewDecision.ReviewAgain;
        return true;
    }

    return false;
}

static bool IsSupportedReviewSessionType(string? value) =>
    string.Equals(value, "quickLesson", StringComparison.Ordinal) ||
    string.Equals(value, "continueLearning", StringComparison.Ordinal);

static IResult ValidationError(string field, string message) =>
    Results.ValidationProblem(new Dictionary<string, string[]>
    {
        [field] = new[] { message }
    });

static string FormatDate(DateOnly value) =>
    value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

static string FormatId(Guid value) =>
    value.ToString("D");

static FlashcardSetSummaryResponse ToSummaryResponse(FlashcardSet set) =>
    new(
        FormatId(set.Id),
        set.ExternalId,
        set.OwnerUserId,
        set.Name,
        set.Source.ToString(),
        set.Flashcards.Count,
        ToProgressSummaryResponse(CreateProgressSummary(set)));

static FlashcardSetResponse ToSetResponse(FlashcardSet set) =>
    new(
        FormatId(set.Id),
        set.ExternalId,
        set.OwnerUserId,
        set.Name,
        set.Source.ToString(),
        set.Flashcards.Count,
        ToProgressSummaryResponse(CreateProgressSummary(set)),
        set.Flashcards.Select(ToCardResponse).ToList());

static FlashcardResponse ToCardResponse(Flashcard card) =>
    new(
        FormatId(card.Id),
        card.Front,
        card.Back,
        card.LearningStage,
        card.ReviewAgainStreak,
        card.IsLearned,
        card.LastReviewedAt,
        card.EaseFactor,
        card.Repetitions,
        card.IntervalDays,
        card.NextReviewUtc);

static SetProgressSummary CreateProgressSummary(FlashcardSet set)
{
    var learnedCount = set.Flashcards.Count(card => card.IsLearned || card.LearningStage >= 3);
    var difficultCount = set.Flashcards.Count(card => card.LearningStage == -1);
    var learningCount = set.Flashcards.Count(card => card.LearningStage is 1 or 2);
    var newCount = set.Flashcards.Count(card => !card.IsLearned && card.LearningStage == 0);

    return new SetProgressSummary
    {
        SetId = set.Id,
        ExternalId = set.ExternalId,
        UserId = SqliteFlashcardStore.DefaultLocalUserId,
        CardCount = set.Flashcards.Count,
        NewCount = newCount,
        LearningCount = learningCount,
        LearnedCount = learnedCount,
        DifficultCount = difficultCount
    };
}

static SetProgressSummaryResponse ToProgressSummaryResponse(SetProgressSummary summary) =>
    new(
        summary.ExternalId,
        FormatId(summary.SetId),
        summary.UserId,
        summary.CardCount,
        summary.NewCount,
        summary.LearningCount,
        summary.LearnedCount,
        summary.DifficultCount);

static ReviewCardResponse ToReviewCardResponse(
    FlashcardSet set,
    CardReviewResult result,
    string decision,
    string sessionType,
    DateTime reviewedAt) =>
    new(
        set.ExternalId,
        FormatId(set.Id),
        FormatId(result.Card.Id),
        decision,
        sessionType,
        reviewedAt,
        ToCardResponse(result.Card),
        result.PreviousStage,
        result.NextStage,
        result.IsLearned,
        ToProgressSummaryResponse(result.ProgressSummary));

static LessonSnapshotResponse? ToLessonSnapshotResponse(LessonSnapshot? snapshot, SqliteFlashcardStore store)
{
    if (snapshot == null)
        return null;

    var set = store.LoadSet(snapshot.ActiveSetId);
    var activeSetExternalId = set?.ExternalId ?? snapshot.ActiveSetId.ToString("D");

    return new LessonSnapshotResponse(
        activeSetExternalId,
        snapshot.ActiveSetId.ToString("D"),
        activeSetExternalId,
        snapshot.SessionType,
        snapshot.QueueCardIds.Select(FormatId).ToList(),
        snapshot.CurrentCardIndex,
        snapshot.ReviewedCount,
        snapshot.IsRevealed,
        FormatDate(snapshot.LocalDate),
        snapshot.CreatedAt,
        snapshot.UpdatedAt);
}

static QuickLessonCompletionStatusResponse ToCompletionStatus(
    FlashcardSet set,
    DateOnly localDate,
    QuickLessonCompletion? completion) =>
    new(
        set.ExternalId,
        set.Id.ToString("D"),
        set.ExternalId,
        FormatDate(localDate),
        completion != null,
        completion?.CompletedAt);

public sealed record ErrorResponse(string Message);

public sealed record AppStateResponse(
    string? ActiveSetId,
    string? ActiveSetInternalId,
    string? ActiveSetExternalId,
    string LocalDate,
    QuickLessonCompletionStatusResponse? TodaysQuickLessonCompletion,
    LessonSnapshotResponse? LessonSnapshot);

public sealed record FlashcardSetSummaryResponse(
    string Id,
    string ExternalId,
    string? OwnerUserId,
    string Name,
    string Source,
    int CardCount,
    SetProgressSummaryResponse ProgressSummary);

public sealed record FlashcardSetResponse(
    string Id,
    string ExternalId,
    string? OwnerUserId,
    string Name,
    string Source,
    int CardCount,
    SetProgressSummaryResponse ProgressSummary,
    IReadOnlyList<FlashcardResponse> Flashcards);

public sealed record FlashcardResponse(
    string Id,
    string Front,
    string Back,
    int LearningStage,
    int ReviewAgainStreak,
    bool IsLearned,
    DateTime? LastReviewedAt,
    double EaseFactor,
    int Repetitions,
    int IntervalDays,
    DateTime? NextReviewAt);

public sealed record CreateSetRequest(
    string? Name,
    IReadOnlyList<CardInputRequest>? Cards = null);

public sealed record UpdateSetRequest(string? Name);

public sealed record CardInputRequest(string? Front, string? Back);

public sealed record DeleteSetResponse(
    string ExternalId,
    bool Deleted,
    string? ActiveSetExternalId);

public sealed record DeleteCardResponse(
    string SetExternalId,
    string CardId,
    bool Deleted);

public sealed record ReviewCardRequest(
    string? Decision,
    string? SessionType,
    DateTime? ReviewedAt = null);

public sealed record ReviewCardResponse(
    string ExternalSetId,
    string InternalSetId,
    string CardId,
    string Decision,
    string SessionType,
    DateTime ReviewedAt,
    FlashcardResponse Card,
    int PreviousStage,
    int NextStage,
    bool IsLearned,
    SetProgressSummaryResponse ProgressSummary);

public sealed record SetProgressSummaryResponse(
    string ExternalSetId,
    string InternalSetId,
    string UserId,
    int CardCount,
    int NewCount,
    int LearningCount,
    int LearnedCount,
    int DifficultCount);

public sealed record ActiveSetRequest(string ActiveSetId);

public sealed record ActiveSetResponse(
    string ActiveSetId,
    string ActiveSetInternalId,
    string ActiveSetExternalId);

public sealed record LessonSnapshotRequest(
    string ActiveSetId,
    string SessionType,
    IReadOnlyList<string> QueueCardIds,
    int CurrentCardIndex,
    int ReviewedCount,
    bool IsRevealed,
    string LocalDate,
    DateTime? CreatedAt = null);

public sealed record LessonSnapshotResponse(
    string ActiveSetId,
    string ActiveSetInternalId,
    string ActiveSetExternalId,
    string SessionType,
    IReadOnlyList<string> QueueCardIds,
    int CurrentCardIndex,
    int ReviewedCount,
    bool IsRevealed,
    string LocalDate,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record QuickLessonCompletionRequest(
    string ActiveSetId,
    string Date);

public sealed record QuickLessonCompletionStatusResponse(
    string ActiveSetId,
    string ActiveSetInternalId,
    string ActiveSetExternalId,
    string Date,
    bool Completed,
    DateTime? CompletedAt);
