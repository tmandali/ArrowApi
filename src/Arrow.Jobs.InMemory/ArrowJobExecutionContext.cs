using Microsoft.Extensions.DependencyInjection;

namespace Arrow.Jobs.InMemory;

internal sealed class ArrowJobExecutionContext<TRequest> : IArrowJobExecutionContext<TRequest>
{
    private readonly Guid _jobId;
    private readonly TRequest _request;
    private readonly IArrowJobStore<TRequest> _store;
    private readonly IArrowJobEventHub _eventHub;
    private readonly IServiceProvider _serviceProvider;

    public ArrowJobExecutionContext(
        Guid jobId,
        TRequest request,
        IArrowJobStore<TRequest> store,
        IArrowJobEventHub eventHub,
        IServiceProvider serviceProvider)
    {
        _jobId = jobId;
        _request = request;
        _store = store;
        _eventHub = eventHub;
        _serviceProvider = serviceProvider;
    }

    public Guid JobId => _jobId;

    public TRequest Request => _request;

    public async ValueTask PublishInfoAsync(string message, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(message);

        ArrowJob<TRequest>? job = await _store.GetAsync(_jobId, cancellationToken);
        ArrowJobEvent payload = job is null
            ? new ArrowJobEvent(Id: _jobId, Message: message)
            : new ArrowJobEvent(
                job.Id,
                job.State.ToString(),
                job.CreatedAt,
                job.CompletedAt,
                job.Error,
                BatchCount: job.BatchCount,
                TotalRows: job.TotalRows,
                Message: message,
                TraceId: job.TraceId);

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

        ArrowJob<TRequest>? parentJob = await _store.GetAsync(_jobId, cancellationToken);
        string? correlationId = parentJob?.CorrelationId ?? _jobId.ToString("N");

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
