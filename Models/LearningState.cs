namespace SimpleFlashCards.Models;

public class LearningState
{
    public Guid? ActiveSetId { get; set; }

    public string? ActiveSetName { get; set; }

    public bool IsQuickLessonDone { get; set; }
}
