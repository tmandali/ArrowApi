namespace Arrow.Jobs;

public enum ArrowJobState
{
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled
}

public sealed class ArrowJob<TRequest>
{
    public required Guid Id { get; init; }
    public string? Name { get; set; }
    public required TRequest Request { get; init; }
    public ArrowJobState State { get; set; } = ArrowJobState.Queued;
    public string? ResultPath { get; set; }
    public string? Error { get; set; }
    public int BatchCount { get; set; }
    public long TotalRows { get; set; }
    /// <summary>HTTP create isteğinin W3C <c>trace-id</c> (hex).</summary>
    public string? TraceId { get; set; }
    /// <summary>HTTP create span'inin W3C <c>span-id</c> (hex) — job span buna child olur.</summary>
    public string? ParentSpanId { get; set; }
    public byte? TraceFlags { get; set; }
    public string? RequestHash { get; set; }
    public string? CorrelationId { get; set; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

public sealed record ArrowQueryRequest(
    string CnnName,
    string Query,
    IDictionary<string, object?> Parameters,
    int? BatchSize = null) : Arrow.Http.AspNetCore.Dispatcher.IRequest<System.Collections.Generic.IAsyncEnumerable<Apache.Arrow.RecordBatch>>;

public sealed record ArrowJobStatus(
    Guid Id,
    string Status,
    string JobUrl,
    string? EventsUrl = null,
    DateTimeOffset? CreatedAt = null,
    DateTimeOffset? CompletedAt = null,
    string? Error = null,
    int? BatchCount = null,
    long? TotalRows = null,
    Guid? RetriedFrom = null,
    string? Name = null,
    string? CorrelationId = null);

public sealed record ArrowJobListQuery(
    ArrowJobState? State = null,
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    int Skip = 0,
    int Take = 50,
    string? CorrelationId = null);

public sealed class ArrowJobListPage<TRequest>
{
    public required IReadOnlyList<ArrowJob<TRequest>> Items { get; init; }
    public required int Total { get; init; }
}

public sealed record ArrowJobStatusList(
    IReadOnlyList<ArrowJobStatus> Items,
    int Total);

/// <summary>SSE <c>/events</c> endpoint'inin <c>data</c> payload'ı.</summary>
public sealed record ArrowJobEvent(
    Guid? Id = null,
    string? Status = null,
    DateTimeOffset? CreatedAt = null,
    DateTimeOffset? CompletedAt = null,
    string? Error = null,
    string? JobUrl = null,
    string? EventsUrl = null,
    int? BatchCount = null,
    long? TotalRows = null,
    string? Message = null,
    string? TraceId = null,
    string? Name = null,
    string? CorrelationId = null);

public static class ArrowJobEventNames
{
    // Job yaşam döngüsü / altyapı
    public const string Status = "status";
    public const string Progress = "progress";
    public const string Completed = "completed";
    public const string Failed = "failed";
    public const string Error = "error";

    /// <summary>Worker bilgilendirme metni (<see cref="ArrowJobEvent.Message"/>). Job state değildir.</summary>
    public const string Info = "info";

    public const string Cancelled = "cancelled";
}
