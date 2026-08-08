namespace Arrow.Jobs;

/// <summary>Job SSE event hub mesajı.</summary>
/// <param name="EventName">Olay adı.</param>
/// <param name="Payload">Olay yükü.</param>
public sealed record ArrowJobHubMessage(string EventName, ArrowJobEvent Payload);

/// <summary>Job SSE olayları için pub/sub (+ isteğe bağlı geçmiş).</summary>
public interface IArrowJobEventHub
{
    /// <summary>Olay yayınlar.</summary>
    ValueTask PublishAsync(
        Guid jobId,
        string eventName,
        ArrowJobEvent payload,
        CancellationToken cancellationToken = default);

    /// <summary>Abonelik hemen kaydedilir; ilk mesajdan önce store snapshot alınabilir.</summary>
    IArrowJobEventSubscription Subscribe(Guid jobId);

    /// <summary>Job için yayınlanmış olay geçmişini döner (yoksa boş).</summary>
    ValueTask<IReadOnlyList<ArrowJobHubMessage>> GetHistoryAsync(
        Guid jobId,
        CancellationToken cancellationToken = default);
}

/// <summary>SSE olay aboneliği arayüzü.</summary>
public interface IArrowJobEventSubscription : IAsyncDisposable
{
    /// <summary>Gelen SSE mesaj akışı.</summary>
    IAsyncEnumerable<ArrowJobHubMessage> Messages { get; }
}
