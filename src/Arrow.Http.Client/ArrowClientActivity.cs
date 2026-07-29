using System.Diagnostics;

namespace Arrow.Http.Client;

/// <summary>
/// Client ActivitySource. Host: <c>tracing.AddSource(ArrowClientActivity.SourceName)</c>
/// ve <c>AddHttpClientInstrumentation()</c> ile create isteğine W3C <c>traceparent</c> gider.
/// </summary>
public static class ArrowClientActivity
{
    public const string SourceName = "Arrow.Http.Client";

    public static ActivitySource Source { get; } = new(SourceName);
}
