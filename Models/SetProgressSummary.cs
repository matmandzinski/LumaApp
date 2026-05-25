namespace SimpleFlashCards.Models;

public class SetProgressSummary
{
    public Guid SetId { get; set; }

    public string ExternalId { get; set; } = string.Empty;

    public int TotalCards { get; set; }

    public int LearnedCards { get; set; }

    public int LearningCards { get; set; }

    public int DifficultCards { get; set; }
}
