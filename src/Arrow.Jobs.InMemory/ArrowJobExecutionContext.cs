using Microsoft.Extensions.DependencyInjection;
using System;
using System.Threading;
using System.Threading.Tasks;

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
        bool wait = false,
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

        if (wait)
        {
            await WaitForJobCompletionAsync(nextJob.Id, cancellationToken: cancellationToken);
            ArrowJob<TNextRequest>? completedJob = await store.GetAsync(nextJob.Id, cancellationToken);
            return completedJob ?? nextJob;
        }

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
}
