using System.Text.Json;

namespace Arrow.Jobs.AspNetCore;

internal static class ArrowJobSse
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static async Task StreamEventsAsync<TRequest>(
        Guid jobId,
        IArrowJobStore<TRequest> store,
        HttpResponse response,
        string jobsPath,
        CancellationToken cancellationToken)
    {
        response.Headers.ContentType = "text/event-stream";
        response.Headers.CacheControl = "no-cache";

        TimeSpan pollInterval = TimeSpan.FromMilliseconds(300);
        TimeSpan heartbeatInterval = TimeSpan.FromSeconds(15);
        ArrowJobState? lastState = null;
        DateTimeOffset lastWrite = DateTimeOffset.MinValue;

        while (!cancellationToken.IsCancellationRequested)
        {
            ArrowJob<TRequest>? job = await store.GetAsync(jobId, cancellationToken).ConfigureAwait(false);
            if (job is null)
            {
                await WriteEventAsync(response, ArrowJobEventNames.Error,
                    JsonSerializer.Serialize(new ArrowJobEvent(Error: "not_found"), JsonOptions), cancellationToken)
                    .ConfigureAwait(false);
                break;
            }

            bool stateChanged = job.State != lastState;
            bool heartbeatDue = DateTimeOffset.UtcNow - lastWrite >= heartbeatInterval;

            if (stateChanged)
            {
                lastState = job.State;
                string payload = JsonSerializer.Serialize(ToPayload(job, jobsPath), JsonOptions);
                string eventName = job.State switch
                {
                    ArrowJobState.Completed => ArrowJobEventNames.Completed,
                    ArrowJobState.Failed => ArrowJobEventNames.Failed,
                    _ => ArrowJobEventNames.Status
                };

                await WriteEventAsync(response, eventName, payload, cancellationToken).ConfigureAwait(false);
                lastWrite = DateTimeOffset.UtcNow;

                if (job.State is ArrowJobState.Completed or ArrowJobState.Failed)
                    break;
            }
            else if (heartbeatDue)
            {
                await WriteHeartbeatAsync(response, cancellationToken).ConfigureAwait(false);
                lastWrite = DateTimeOffset.UtcNow;
            }

            await Task.Delay(pollInterval, cancellationToken).ConfigureAwait(false);
        }
    }

    private static ArrowJobEvent ToPayload<TRequest>(ArrowJob<TRequest> job, string jobsPath) =>
        new(
            job.Id,
            job.State.ToString(),
            job.CreatedAt,
            job.CompletedAt,
            job.Error,
            $"{jobsPath}/{job.Id:D}",
            $"{jobsPath}/{job.Id:D}/events");

    private static async Task WriteEventAsync(
        HttpResponse response,
        string eventName,
        string data,
        CancellationToken cancellationToken)
    {
        await response.WriteAsync($"event: {eventName}\n", cancellationToken).ConfigureAwait(false);
        await response.WriteAsync($"data: {data}\n\n", cancellationToken).ConfigureAwait(false);
        await response.Body.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task WriteHeartbeatAsync(HttpResponse response, CancellationToken cancellationToken)
    {
        await response.WriteAsync(": keep-alive\n\n", cancellationToken).ConfigureAwait(false);
        await response.Body.FlushAsync(cancellationToken).ConfigureAwait(false);
    }
}
