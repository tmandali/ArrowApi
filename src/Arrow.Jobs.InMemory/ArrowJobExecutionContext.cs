using Apache.Arrow;
using Arrow.Data;
using Microsoft.Extensions.DependencyInjection;

namespace Arrow.Jobs.InMemory;

internal sealed class ArrowJobExecutionContext : IArrowJobExecutionContext
{
    private readonly Guid _jobId;
    private readonly Guid? _parentJobId;
    private readonly IArrowJobEventHub _eventHub;
    private readonly IServiceProvider _serviceProvider;

    private IAsyncEnumerable<RecordBatch>? _currentPipeSource;

    public ArrowJobExecutionContext(
        Guid jobId,
        IArrowJobEventHub eventHub,
        IServiceProvider serviceProvider,
        Guid? parentJobId = null)
    {
        _jobId = jobId;
        _parentJobId = parentJobId;
        _eventHub = eventHub;
        _serviceProvider = serviceProvider;
    }

    public Guid JobId => _jobId;
    public Guid? ParentJobId => _parentJobId;

    public async Task<Result<ArrowBatchReader>> GetParentArrowReaderAsync(CancellationToken cancellationToken = default)
    {
        if (_currentPipeSource is not null)
        {
            ArrowBatchReader pipeReader = ArrowBatchReader.FromBatches(_currentPipeSource);
            return Result<ArrowBatchReader>.Success(pipeReader);
        }

        Guid? pId = _parentJobId;

        if (!pId.HasValue)
        {
            var statusStore = _serviceProvider.GetService<IArrowJobStore>();
            ArrowJobStatus? currentStatus = statusStore is not null
                ? await statusStore.GetStatusAsync(_jobId, cancellationToken: cancellationToken)
                : null;
            pId = currentStatus?.ParentJobId;
        }

        if (!pId.HasValue)
        {
            return Result<ArrowBatchReader>.NotFound($"Mevcut job (ID: {_jobId}) için üst job (ParentJobId) bulunamadı.");
        }

        var store = _serviceProvider.GetService<IArrowJobStore>();
        ArrowJobStatus? parentStatus = store is not null
            ? await store.GetStatusAsync(pId.Value, cancellationToken: cancellationToken)
            : null;

        var resultStorage = _serviceProvider.GetService<IArrowJobResultStorage>();
        string? resultPath = resultStorage?.GetResultPath(pId.Value, parentStatus?.Name, parentStatus?.RootJobId);

        if (string.IsNullOrEmpty(resultPath) || resultStorage is null)
        {
            return Result<ArrowBatchReader>.NotFound($"Üst job (ID: {pId.Value}) sonuç verisi bulunamadı.");
        }

        return await resultStorage.OpenBatchReaderAsync(resultPath, cancellationToken).ConfigureAwait(false);
    }

    public async IAsyncEnumerable<RecordBatch> PipeToAsync<TNextRequest>(
        string jobName,
        TNextRequest request,
        IAsyncEnumerable<RecordBatch>? sourceStream = null,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
        where TNextRequest : notnull
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentException.ThrowIfNullOrWhiteSpace(jobName);

        object? workerObj = _serviceProvider.GetKeyedService(typeof(IArrowJobWorker<TNextRequest>), jobName)
                 ?? _serviceProvider.GetKeyedService<object>(jobName)
                 ?? _serviceProvider.GetService(typeof(IArrowJobWorker<TNextRequest>));

        if (workerObj is not IArrowJobWorker<TNextRequest> worker)
        {
            throw new InvalidOperationException($"Pipe alt işçi '{jobName}' ({typeof(TNextRequest).Name}) için uygun worker servisi bulunamadı.");
        }

        var previousPipe = _currentPipeSource;
        _currentPipeSource = sourceStream;
        try
        {
            await foreach (RecordBatch batch in worker.Handle(request, cancellationToken).WithCancellation(cancellationToken).ConfigureAwait(false))
            {
                yield return batch;
            }
        }
        finally
        {
            _currentPipeSource = previousPipe;
        }
    }

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
}
