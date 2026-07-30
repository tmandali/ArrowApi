namespace Arrow.Jobs.InMemory;

/// <summary>Çalışan job yürütme bağlamını (AsyncLocal) tutan yardımcı sınıf.</summary>
public static class ArrowJobExecutionContextHolder
{
    private static readonly AsyncLocal<IArrowJobExecutionContext?> _current = new();

    /// <summary>Mevcut async yürütme bağlamı.</summary>
    public static IArrowJobExecutionContext? Current
    {
        get => _current.Value;
        set => _current.Value = value;
    }
}
