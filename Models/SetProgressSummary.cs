namespace SimpleFlashCards.Models;

public class SetProgressSummary
{
    public Guid SetId { get; set; }

    public string ExternalId { get; set; } = string.Empty;

    public string UserId { get; set; } = string.Empty;

    public int CardCount { get; set; }

    public int NewCount { get; set; }

    public int LearningCount { get; set; }

    public int LearnedCount { get; set; }

    public int DifficultCount { get; set; }
}
