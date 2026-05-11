namespace SimpleFlashCards.Models;

public class LearningQueueSnapshot
{
    public Guid? ActiveSetId { get; set; }

    public List<Guid> CardIds { get; set; } = new();
}
