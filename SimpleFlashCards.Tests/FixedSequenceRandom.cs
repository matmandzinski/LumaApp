namespace SimpleFlashCards.Tests;

internal sealed class FixedSequenceRandom : Random
{
    private readonly Queue<int> _values;

    public FixedSequenceRandom(params int[] values)
    {
        _values = new Queue<int>(values);
    }

    public override int Next(int maxValue)
    {
        if (maxValue <= 0)
            throw new ArgumentOutOfRangeException(nameof(maxValue));

        if (_values.Count == 0)
            return 0;

        return Math.Clamp(_values.Dequeue(), 0, maxValue - 1);
    }
}
