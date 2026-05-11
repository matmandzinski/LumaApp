namespace SimpleFlashCards.Models;

/// <summary>
/// Represents a review outcome queued while offline (future: persisted in IndexedDB / SQLite
/// and replayed to Supabase when online). Not yet used by the console host.
/// </summary>
public class PendingReviewEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CardId { get; set; }

    public bool Known { get; set; }

    public DateTime QueuedUtc { get; set; } = DateTime.UtcNow;
}
