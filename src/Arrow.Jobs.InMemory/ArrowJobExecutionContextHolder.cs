using System.Threading;

namespace Arrow.Jobs.InMemory;

public static class ArrowJobExecutionContextHolder<TRequest>
    where TRequest : notnull
{
    private static readonly AsyncLocal<IArrowJobExecutionContext<TRequest>?> _current = new();

    public static IArrowJobExecutionContext<TRequest>? Current
    {
        get => _current.Value;
        set => _current.Value = value;
    }
}
