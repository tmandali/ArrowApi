namespace Arrow.Jobs;

public sealed record ArrowJobHubMessage(string EventName, ArrowJobEvent Payload);

/// <summary>Job SSE olayları için pub/sub.</summary>
public interface IArrowJobEventHub
{
    ValueTask PublishAsync(
        Guid jobId,
        string eventName,
        ArrowJobEvent payload,
        CancellationToken cancellationToken = default);

    /// <summary>Abonelik hemen kaydedilir; ilk mesajdan önce store snapshot alınabilir.</summary>
    IArrowJobEventSubscription Subscribe(Guid jobId);
}

public interface IArrowJobEventSubscription : IAsyncDisposable
{
    IAsyncEnumerable<ArrowJobHubMessage> Messages { get; }
}
