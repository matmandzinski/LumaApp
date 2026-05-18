using System.Text.Json.Serialization;

namespace SimpleFlashCards.Models;

public class Flashcard
{
    public Guid Id { get; set; }

    public string Front { get; set; } = string.Empty;

    public string Back { get; set; } = string.Empty;

    /// <summary>SM-2 ease factor (typically >= 1.3).</summary>
    public double EaseFactor { get; set; } = 2.5;

    /// <summary>Successful repetitions in a row after last lapse.</summary>
    public int Repetitions { get; set; }

    /// <summary>Current interval in days until next review.</summary>
    public int IntervalDays { get; set; }

    /// <summary>UTC instant when the card is due (nullable if never reviewed).</summary>
    public DateTime? NextReviewUtc { get; set; }

    public int LearningStage { get; set; }

    public int ReviewAgainStreak { get; set; }

    public bool IsLearned { get; set; }

    public DateTime? LastReviewedAt { get; set; }

    [JsonIgnore]
    public bool HasScheduling =>
        NextReviewUtc.HasValue || Repetitions > 0 || IntervalDays > 0;

    public Flashcard() { }

    public Flashcard(string front, string back)
    {
        Id = Guid.NewGuid();
        Front = front;
        Back = back;
    }
}
