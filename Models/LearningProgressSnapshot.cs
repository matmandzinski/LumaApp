namespace SimpleFlashCards.Models;

public class LearningProgressSnapshot
{
    public int CurrentStreak { get; set; }

    public int LongestStreak { get; set; }

    public DateOnly? LastStudyDate { get; set; }

    public int TotalStudyDays { get; set; }

    public List<CardLearningProgress> Cards { get; set; } = new();
}

public class CardLearningProgress
{
    public Guid SetId { get; set; }

    public Guid CardId { get; set; }

    public int LearningStage { get; set; }

    public int ReviewAgainStreak { get; set; }

    public bool IsLearned { get; set; }

    public DateTime? LastReviewedAt { get; set; }
}
