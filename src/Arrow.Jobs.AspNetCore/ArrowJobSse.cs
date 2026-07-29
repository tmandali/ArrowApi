using System.Text.Json;

namespace Arrow.Jobs.AspNetCore;

internal static class ArrowJobSse
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static async Task StreamEventsAsync<TRequest>(
        Guid jobId,
        IArrowJobStore<TRequest> store,
        IArrowJobEventHub eventHub,
        HttpResponse response,
        string jobsPath,
        CancellationToken cancellationToken)
    {
        response.Headers.ContentType = "text/event-stream";
        response.Headers.CacheControl = "no-cache";

        TimeSpan heartbeatInterval = TimeSpan.FromSeconds(15);

        await using IArrowJobEventSubscription subscription = eventHub.Subscribe(jobId);

        ArrowJob<TRequest>? job = await store.GetAsync(jobId, cancellationToken);
        if (job is null)
        {
            await WriteEventAsync(
                response,
                ArrowJobEventNames.Error,
                JsonSerializer.Serialize(new ArrowJobEvent(Error: "not_found"), JsonOptions),
                cancellationToken);
            return;
        }

        string snapshotEvent = job.State switch
        {
            ArrowJobState.Completed => ArrowJobEventNames.Completed,
            ArrowJobState.Failed => ArrowJobEventNames.Failed,
            ArrowJobState.Cancelled => ArrowJobEventNames.Cancelled,
            _ => ArrowJobEventNames.Status
        };

        await WriteEventAsync(
            response,
            snapshotEvent,
            JsonSerializer.Serialize(ToPayload(job, jobsPath), JsonOptions),
            cancellationToken);

        if (job.State is ArrowJobState.Completed or ArrowJobState.Failed or ArrowJobState.Cancelled)
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

    private static ArrowJobEvent ToPayload<TRequest>(ArrowJob<TRequest> job, string jobsPath) =>
        EnrichUrls(
            new ArrowJobEvent(
                job.Id,
                job.State.ToString(),
                job.CreatedAt,
                job.CompletedAt,
                job.Error,
                BatchCount: job.BatchCount,
                TotalRows: job.TotalRows,
                TraceId: job.TraceId),
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
