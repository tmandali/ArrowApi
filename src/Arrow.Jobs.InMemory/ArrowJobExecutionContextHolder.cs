namespace Arrow.Jobs.InMemory;

public static class ArrowJobExecutionContextHolder
{
    private static readonly AsyncLocal<IArrowJobExecutionContext?> _current = new();

    public static IArrowJobExecutionContext? Current
    {
        get => _current.Value;
        set => _current.Value = value;
    }
}
