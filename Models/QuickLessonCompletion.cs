namespace SimpleFlashCards.Models;

public class QuickLessonCompletion
{
    public Guid ActiveSetId { get; set; }

    public DateOnly LocalDate { get; set; }

    public DateTime CompletedAt { get; set; }
}
