namespace Arrow.Jobs;

public enum ArrowJobState
{
    Queued,
    Running,
    Completed,
    Failed
}

public sealed class ArrowJob<TRequest>
{
    public required Guid Id { get; init; }
    public required TRequest Request { get; init; }
    public ArrowJobState State { get; set; } = ArrowJobState.Queued;
    public string? ResultPath { get; set; }
    public string? Error { get; set; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

public sealed record ArrowQueryRequest(
    string CnnName,
    string Query,
    IDictionary<string, object?> Parameters,
    int? BatchSize = null);

public sealed record ArrowJobStatus(
    Guid Id,
    string Status,
    string JobUrl,
    string? EventsUrl = null,
    DateTimeOffset? CreatedAt = null,
    DateTimeOffset? CompletedAt = null,
    string? Error = null);

/// <summary>SSE <c>/events</c> endpoint'inin <c>data</c> payload'ı.</summary>
public sealed record ArrowJobEvent(
    Guid? Id = null,
    string? Status = null,
    DateTimeOffset? CreatedAt = null,
    DateTimeOffset? CompletedAt = null,
    string? Error = null,
    string? JobUrl = null,
    string? EventsUrl = null);

public static class ArrowJobEventNames
{
    public const string Status = "status";
    public const string Completed = "completed";
    public const string Failed = "failed";
    public const string Error = "error";
}
