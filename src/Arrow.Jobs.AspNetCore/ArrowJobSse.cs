using System.Text.Json;

namespace Arrow.Jobs.AspNetCore;

internal static class ArrowJobSse
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static async Task StreamEventsAsync(
        Guid jobId,
        IArrowJobStore? store,
        IArrowJobEventHub eventHub,
        HttpResponse response,
        string jobsPath,
        CancellationToken cancellationToken)
    {
        response.Headers.ContentType = "text/event-stream";
        response.Headers.CacheControl = "no-cache";

        TimeSpan heartbeatInterval = TimeSpan.FromSeconds(15);

        await using IArrowJobEventSubscription subscription = eventHub.Subscribe(jobId);

        ArrowJobStatus? status = store is null ? null : await store.GetStatusAsync(jobId, jobsPath, cancellationToken);
        if (status is null)
        {
            await WriteEventAsync(
                response,
                ArrowJobEventNames.Error,
                JsonSerializer.Serialize(new ArrowJobEvent(Error: "not_found"), JsonOptions),
                cancellationToken);
            return;
        }

        string snapshotEvent = status.Status switch
        {
            nameof(ArrowJobState.Completed) => ArrowJobEventNames.Completed,
            nameof(ArrowJobState.Failed) => ArrowJobEventNames.Failed,
            nameof(ArrowJobState.Cancelled) => ArrowJobEventNames.Cancelled,
            _ => ArrowJobEventNames.Status
        };

        await WriteEventAsync(
            response,
            snapshotEvent,
            JsonSerializer.Serialize(ToPayload(status, jobsPath), JsonOptions),
            cancellationToken);

        if (string.Equals(status.Status, nameof(ArrowJobState.Completed), StringComparison.OrdinalIgnoreCase) ||
            string.Equals(status.Status, nameof(ArrowJobState.Failed), StringComparison.OrdinalIgnoreCase) ||
            string.Equals(status.Status, nameof(ArrowJobState.Cancelled), StringComparison.OrdinalIgnoreCase))
            return;

        await using IAsyncEnumerator<ArrowJobHubMessage> enumerator =
            subscription.Messages.GetAsyncEnumerator(cancellationToken);

        Task<bool>? pendingMove = null;
        while (!cancellationToken.IsCancellationRequested)
        {
            pendingMove ??= enumerator.MoveNextAsync().AsTask();
            Task delayTask = Task.Delay(heartbeatInterval, cancellationToken);
            Task completed = await Task.WhenAny(pendingMove, delayTask);

            if (completed == delayTask)
            {
                await WriteHeartbeatAsync(response, cancellationToken);
                continue;
            }

            bool hasNext = await pendingMove;
            pendingMove = null;
            if (!hasNext)
                break;

            ArrowJobHubMessage message = enumerator.Current;
            ArrowJobEvent payload = EnrichUrls(message.Payload, jobsPath);
            await WriteEventAsync(
                response,
                message.EventName,
                JsonSerializer.Serialize(payload, JsonOptions),
                cancellationToken);

            if (message.EventName is ArrowJobEventNames.Completed
                or ArrowJobEventNames.Failed
                or ArrowJobEventNames.Cancelled)
                break;
        }
    }

    private static ArrowJobEvent ToPayload(ArrowJobStatus status, string jobsPath) =>
        EnrichUrls(
            new ArrowJobEvent(
                status.Id,
                status.Status,
                status.CreatedAt,
                status.CompletedAt,
                status.Error,
                BatchCount: status.BatchCount,
                TotalRows: status.TotalRows,
                Name: status.Name,
                RootJobId: status.RootJobId),
            jobsPath);

    private static ArrowJobEvent EnrichUrls(ArrowJobEvent payload, string jobsPath)
    {
        if (payload.Id is null)
            return payload;

        Guid id = payload.Id.Value;
        return payload with
        {
            JobUrl = $"{jobsPath}/{id:D}",
            EventsUrl = $"{jobsPath}/{id:D}/events"
        };
    }

    private static async Task WriteEventAsync(
        HttpResponse response,
        string eventName,
        string data,
        CancellationToken cancellationToken)
    {
        await response.WriteAsync($"event: {eventName}\n", cancellationToken);
        await response.WriteAsync($"data: {data}\n\n", cancellationToken);
        await response.Body.FlushAsync(cancellationToken);
    }

    private static async Task WriteHeartbeatAsync(HttpResponse response, CancellationToken cancellationToken)
    {
        await response.WriteAsync(": keep-alive\n\n", cancellationToken);
        await response.Body.FlushAsync(cancellationToken);
    }
}
