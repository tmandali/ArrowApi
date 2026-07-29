namespace Arrow.Jobs.InMemory;

internal sealed class ArrowJobExecutionContext<TRequest> : IArrowJobExecutionContext<TRequest>
{
    private readonly Guid _jobId;
    private readonly TRequest _request;
    private readonly IArrowJobStore<TRequest> _store;
    private readonly IArrowJobEventHub _eventHub;

    public ArrowJobExecutionContext(
        Guid jobId,
        TRequest request,
        IArrowJobStore<TRequest> store,
        IArrowJobEventHub eventHub)
    {
        _jobId = jobId;
        _request = request;
        _store = store;
        _eventHub = eventHub;
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
}
