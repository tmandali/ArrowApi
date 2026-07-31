using Arrow.Data;
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
                RootJobId = _jobId,
                Request = request,
                State = ArrowJobState.Queued,
                CreatedAt = DateTimeOffset.UtcNow
            };
        }

        var statusStore = _serviceProvider.GetService<IArrowJobStore>();
        ArrowJobStatus? parentStatus = statusStore is not null
            ? await statusStore.GetStatusAsync(_jobId, cancellationToken: cancellationToken)
            : null;

        Guid rootJobId = parentStatus?.RootJobId ?? _jobId;

        ArrowJob<TNextRequest> nextJob = await store.CreateAsync(request, jobName, rootJobId: rootJobId, cancellationToken: cancellationToken);

        await queue.EnqueueAsync(nextJob.Id, cancellationToken);

        await PublishInfoAsync($"Chained next job '{jobName}' (ID: {nextJob.Id}, RootJobId: {rootJobId})", cancellationToken);

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

    public async Task<Result<ArrowBatchReader>> GetArrowReaderAsync<TNextRequest>(
        ArrowJob<TNextRequest>? job,
        CancellationToken cancellationToken = default)
        where TNextRequest : notnull
    {
        if (job is null) throw new ArgumentNullException(nameof(job));

        // Job henüz bitmediyse, okuma başlamadan önce otomatik olarak bitmesini bekle (Lazy Evaluation)
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

        if (job.State == ArrowJobState.Failed)
        {
            return Result<ArrowBatchReader>.Failure(
                $"Alt job '{job.Name ?? job.Id.ToString("N")}' (ID: {job.Id}) hata ile sonlandı: {job.Error ?? "Bilinmeyen hata."}", 500);
        }

        if (job.State == ArrowJobState.Cancelled)
        {
            return Result<ArrowBatchReader>.Conflict(
                $"Alt job '{job.Name ?? job.Id.ToString("N")}' (ID: {job.Id}) iptal edildi.");
        }

        if (job.State != ArrowJobState.Completed || string.IsNullOrWhiteSpace(job.ResultPath))
        {
            return Result<ArrowBatchReader>.NotFound(
                $"Alt job '{job.Name ?? job.Id.ToString("N")}' (ID: {job.Id}) henüz tamamlanmadı veya sonuç dosyası yok.");
        }

        var resultStorage = _serviceProvider.GetService<IArrowJobResultStorage>();
        if (resultStorage is null)
        {
            return Result<ArrowBatchReader>.Failure("IArrowJobResultStorage service is not registered in DI.", 500);
        }

        return await resultStorage.OpenBatchReaderAsync(job.ResultPath!, cancellationToken).ConfigureAwait(false);
    }
}
