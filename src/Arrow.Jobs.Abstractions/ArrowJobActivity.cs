using System.Diagnostics;

namespace Arrow.Jobs;

/// <summary>
/// OpenTelemetry için activity kaynağı. Host: <c>tracing.AddSource(ArrowJobActivity.SourceName)</c>.
/// </summary>
public static class ArrowJobActivity
{
    public const string SourceName = "Arrow.Jobs";

    public static ActivitySource Source { get; } = new(SourceName);
}
