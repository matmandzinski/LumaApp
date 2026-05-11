using System.Text.Json.Serialization;

namespace SimpleFlashCards.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FlashcardSetSource
{
    User,
    ReadyMade
}
