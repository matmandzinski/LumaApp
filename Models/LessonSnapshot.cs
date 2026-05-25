namespace SimpleFlashCards.Models;

public class LessonSnapshot
{
    public long Id { get; set; } = 1;

    public Guid ActiveSetId { get; set; }

    public string SessionType { get; set; } = "quickLesson";

    public List<Guid> QueueCardIds { get; set; } = new();

    public int CurrentCardIndex { get; set; }

    public int ReviewedCount { get; set; }

    public bool IsRevealed { get; set; }

    public DateOnly LocalDate { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
