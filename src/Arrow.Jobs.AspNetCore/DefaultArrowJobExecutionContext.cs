using Apache.Arrow;
using Arrow.Data;
using Microsoft.Extensions.DependencyInjection;
using System.Runtime.CompilerServices;

namespace Arrow.Jobs;

/// <summary>
/// Backend-agnostic <see cref="IArrowJobExecutionContext"/> implementasyonu.
/// <para>
/// <b>Gerçekleştirmesi:</b>
/// <list type="bullet">
///   <item><see cref="IArrowJobEventHub"/> üzerinden <c>info</c> event publish (worker mesajı)</item>
///   <item><see cref="IArrowJobResultStorage"/> üzerinden parent job'ın Arrow IPC akışını okuma</item>
///   <item>DI scope üzerinden aynı <see cref="IServiceProvider"/> içinde <c>PipeToAsync</c> ile
///         bir sonraki <see cref="IArrowJobWorker{TNextRequest}"/>'ı inline yürütme</item>
/// </list>
/// Backend'e göre hiçbir dependency'si yok; sadece Abstractions'ın tanımladığı
/// interface set'ini resolve eder. Bu sınıf <c>internal</c> — DI tarafından
/// <see cref="IArrowJobExecutionContext"/> implementasyonu olarak register edilir,
/// dışarıdan direkt new'lenmez.
/// </para>
/// </summary>
public sealed class DefaultArrowJobExecutionContext : IArrowJobExecutionContext
{
    private readonly Guid _jobId;
    private readonly Guid? _parentJobId;
    private readonly IArrowJobEventHub _eventHub;
    private readonly IServiceProvider _serviceProvider;

    private IAsyncEnumerable<RecordBatch>? _currentPipeSource;

    public DefaultArrowJobExecutionContext(
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
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
        where TNextRequest : notnull
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentException.ThrowIfNullOrWhiteSpace(jobName);

        var workerType = typeof(IArrowJobWorker<TNextRequest>);
        IArrowJobWorker<TNextRequest>? worker =
            TryGetKeyedWorker<TNextRequest>(workerType, jobName)
            ?? _serviceProvider.GetService(workerType) as IArrowJobWorker<TNextRequest>;

        if (worker is null)
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

    /// <summary>
    /// Keyed service resolve — netstandard2.0 uyumlu (IKeyedServiceProvider .NET 8+; yoksa plain resolve).
    /// </summary>
    private IArrowJobWorker<TNextRequest>? TryGetKeyedWorker<TNextRequest>(Type serviceType, string key)
        where TNextRequest : notnull
    {
        var keyed = _serviceProvider as Microsoft.Extensions.DependencyInjection.IKeyedServiceProvider;
        object? obj = keyed?.GetKeyedService(serviceType, key);
        return obj as IArrowJobWorker<TNextRequest>;
    }
}
