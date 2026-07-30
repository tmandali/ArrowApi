using Microsoft.Extensions.DependencyInjection;

namespace Arrow.Jobs.InMemory;

internal sealed class ArrowJobExecutionContext : IArrowJobExecutionContext
{
    private readonly Guid _jobId;
    private readonly IArrowJobEventHub _eventHub;
    private readonly IServiceProvider _serviceProvider;

    public ArrowJobExecutionContext(
        Guid jobId,
        IArrowJobEventHub eventHub,
        IServiceProvider serviceProvider)
    {
        _jobId = jobId;
        _eventHub = eventHub;
        _serviceProvider = serviceProvider;
    }

    public Guid JobId => _jobId;

    public async ValueTask PublishInfoAsync(string message, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(message);

        var statusStore = _serviceProvider.GetService<IArrowJobStore>();
        ArrowJobStatus? status = statusStore is not null
            ? await statusStore.GetStatusAsync(_jobId, cancellationToken: cancellationToken)
            : null;

        ArrowJobEvent payload = status is null
            ? new ArrowJobEvent(Id: _jobId, Message: message)
            : new ArrowJobEvent(
                status.Id,
                status.Status,
                status.CreatedAt,
                status.CompletedAt,
                status.Error,
                BatchCount: status.BatchCount,
                TotalRows: status.TotalRows,
                Message: message);

        await _eventHub.PublishAsync(_jobId, ArrowJobEventNames.Info, payload, cancellationToken);
    }

    public async Task<ArrowJob<TNextRequest>> EnqueueNextJobAsync<TNextRequest>(
        string jobName,
        TNextRequest request,
        CancellationToken cancellationToken = default)
        where TNextRequest : notnull
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentException.ThrowIfNullOrWhiteSpace(jobName);

        var store = _serviceProvider.GetService<IArrowJobStore<TNextRequest>>();
        var queue = _serviceProvider.GetService<IArrowJobQueue<TNextRequest>>();

        if (store is null || queue is null)
        {
            await PublishInfoAsync($"Skipped chaining next job '{jobName}' - request type not registered in DI.", cancellationToken);
            return new ArrowJob<TNextRequest>
            {
                Id = Guid.NewGuid(),
                Name = jobName,
                Request = request,
                State = ArrowJobState.Queued,
                CreatedAt = DateTimeOffset.UtcNow
            };
        }

        var statusStore = _serviceProvider.GetService<IArrowJobStore>();
        ArrowJobStatus? parentStatus = statusStore is not null
            ? await statusStore.GetStatusAsync(_jobId, cancellationToken: cancellationToken)
            : null;

        string? correlationId = parentStatus?.CorrelationId ?? _jobId.ToString("N");

        ArrowJob<TNextRequest> nextJob = await store.CreateAsync(request, jobName, correlationId, cancellationToken);

        await queue.EnqueueAsync(nextJob.Id, cancellationToken);

        await PublishInfoAsync($"Chained next job '{jobName}' (ID: {nextJob.Id}, CorrelationId: {correlationId})", cancellationToken);

        return nextJob;
    }

    public async Task<ArrowJobEvent> WaitForJobCompletionAsync(
        Guid targetJobId,
        TimeSpan? pollInterval = null,
        CancellationToken cancellationToken = default)
    {
        await using IArrowJobEventSubscription subscription = _eventHub.Subscribe(targetJobId);

        await foreach (ArrowJobHubMessage message in subscription.Messages.WithCancellation(cancellationToken))
        {
            if (message.EventName is ArrowJobEventNames.Completed
                or ArrowJobEventNames.Failed
                or ArrowJobEventNames.Cancelled)
            {
                return message.Payload;
            }
        }

        throw new OperationCanceledException("WaitForJobCompletionAsync sonlandırıldı.", cancellationToken);
    }

    public async IAsyncEnumerable<Apache.Arrow.RecordBatch> ReadBatchesAsync<TNextRequest>(
        ArrowJob<TNextRequest>? job,
        bool throwOnError = true,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
        where TNextRequest : notnull
    {
        if (job is null) yield break;

        // Job henüz bitmediyse, okuma döngüsü başladığında otomatik olarak bitmesini bekle (Lazy Evaluation)
        if (job.State != ArrowJobState.Completed &&
            job.State != ArrowJobState.Failed &&
            job.State != ArrowJobState.Cancelled)
        {
            ArrowJobEvent evt = await WaitForJobCompletionAsync(job.Id, cancellationToken: cancellationToken);
            if (string.Equals(evt.Status, nameof(ArrowJobState.Completed), StringComparison.OrdinalIgnoreCase))
            {
                job.State = ArrowJobState.Completed;
            }
            else if (string.Equals(evt.Status, nameof(ArrowJobState.Failed), StringComparison.OrdinalIgnoreCase))
            {
                job.State = ArrowJobState.Failed;
                job.Error = evt.Message ?? evt.Error;
            }
            else if (string.Equals(evt.Status, nameof(ArrowJobState.Cancelled), StringComparison.OrdinalIgnoreCase))
            {
                job.State = ArrowJobState.Cancelled;
            }
        }

        if (throwOnError)
        {
            if (job.State == ArrowJobState.Failed)
            {
                throw new InvalidOperationException(
                    $"Alt job '{job.Name ?? job.Id.ToString("N")}' (ID: {job.Id}) hata ile sonlandı: {job.Error ?? "Bilinmeyen hata."}");
            }

            if (job.State == ArrowJobState.Cancelled)
            {
                throw new OperationCanceledException(
                    $"Alt job '{job.Name ?? job.Id.ToString("N")}' (ID: {job.Id}) iptal edildi.", cancellationToken);
            }
        }

        if (job.State != ArrowJobState.Completed || string.IsNullOrWhiteSpace(job.ResultPath))
        {
            yield break;
        }

        string resultPath = job.ResultPath!;

        if (File.Exists(resultPath) == false && resultPath.Contains(Path.DirectorySeparatorChar.ToString()))
        {
            yield break;
        }

        var resultStorage = _serviceProvider.GetService<IArrowJobResultStorage>();
        if (resultStorage is null)
        {
            throw new InvalidOperationException("IArrowJobResultStorage service is not registered in DI.");
        }

        await foreach (Apache.Arrow.RecordBatch batch in resultStorage.ReadBatchesAsync(resultPath, cancellationToken).WithCancellation(cancellationToken))
        {
            yield return batch;
        }
    }
}
