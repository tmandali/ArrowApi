using System.Diagnostics;

namespace Arrow.Jobs;

/// <summary>
/// OpenTelemetry için activity kaynağı. Host: <c>tracing.AddSource(ArrowJobActivity.SourceName)</c>.
/// </summary>
public static class ArrowJobActivity
{
    /// <summary>ActivitySource kaynağının adı.</summary>
    public const string SourceName = "Arrow.Jobs";

    /// <summary>Job etkinlik kaynağı nesnesi.</summary>
    public static ActivitySource Source { get; } = new(SourceName);
}
