using Apache.Arrow;
using Arrow.Data;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.CompilerServices;

namespace Arrow.Jobs.InMemory;

public sealed class ArrowJobHostedService<TRequest> : BackgroundService
    where TRequest : notnull
{
    private readonly IArrowJobQueue<TRequest> _queue;
    private readonly IArrowJobStore<TRequest> _store;
    private readonly IArrowJobResultStorage _resultStorage;
    private readonly IArrowJobEventHub _eventHub;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<ArrowJobHostedService<TRequest>> _logger;

    public ArrowJobHostedService(
        IArrowJobQueue<TRequest> queue,
        IArrowJobStore<TRequest> store,
        IArrowJobResultStorage resultStorage,
        IArrowJobEventHub eventHub,
        IServiceProvider serviceProvider,
        ILogger<ArrowJobHostedService<TRequest>> logger)
    {
        _queue = queue;
        _store = store;
        _resultStorage = resultStorage;
        _eventHub = eventHub;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (Guid jobId in _queue.DequeueAllAsync(stoppingToken))
            await ProcessJobAsync(jobId, stoppingToken);
    }

    private async Task ProcessJobAsync(Guid jobId, CancellationToken cancellationToken)
    {
        ArrowJob<TRequest>? job = await _store.GetAsync(jobId, cancellationToken);
        if (job is null || job.State == ArrowJobState.Cancelled)
            return;

        using Activity? activity = ArrowJobTracePropagation.StartExecuteActivity(job);
        using (_logger.BeginScope(CreateLogScope(jobId, activity)))
        {
            try
            {
                await RunJobAsync(job, activity, cancellationToken);
                ArrowJob<TRequest>? after = await _store.GetAsync(jobId, cancellationToken);
                if (after?.State == ArrowJobState.Cancelled)
                {
                    activity?.SetStatus(ActivityStatusCode.Ok);
                    return;
                }

                activity?.SetStatus(ActivityStatusCode.Ok);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                ArrowJob<TRequest>? cancelled = await _store.GetAsync(jobId, cancellationToken);
                if (cancelled is null || cancelled.State == ArrowJobState.Cancelled)
                {
                    activity?.SetStatus(ActivityStatusCode.Ok);
                    if (cancelled is not null)
                        await PublishAsync(jobId, ArrowJobEventNames.Cancelled, cancellationToken);
                    _logger.LogInformation(
                        cancelled is null
                            ? "Job silindi (işlem durduruldu): {JobId}"
                            : "Job iptal edildi: {JobId}",
                        jobId);
                    return;
                }

                throw;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                ArrowJob<TRequest>? current = await _store.GetAsync(jobId, cancellationToken);
                if (current is null || current.State == ArrowJobState.Cancelled)
                {
                    activity?.SetStatus(ActivityStatusCode.Ok);
                    if (current is not null)
                        await PublishAsync(jobId, ArrowJobEventNames.Cancelled, cancellationToken);
                    return;
                }

                activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
                activity?.AddException(ex);
                _logger.LogError(ex, "Job işlenemedi: {JobId}", jobId);
                await _store.MarkFailedAsync(jobId, ex.Message, cancellationToken);
                await PublishAsync(jobId, ArrowJobEventNames.Failed, cancellationToken);
            }
        }
    }

    private async Task RunJobAsync(ArrowJob<TRequest> job, Activity? activity, CancellationToken cancellationToken)
    {
        Guid jobId = job.Id;

        ArrowJob<TRequest>? latest = await _store.GetAsync(jobId, cancellationToken);
        if (latest is null || latest.State == ArrowJobState.Cancelled)
            return;

        await _store.MarkRunningAsync(jobId, cancellationToken);
        latest = await _store.GetAsync(jobId, cancellationToken);
        if (latest is null || latest.State == ArrowJobState.Cancelled)
        {
            await PublishAsync(jobId, ArrowJobEventNames.Cancelled, cancellationToken);
            return;
        }

        await PublishAsync(jobId, ArrowJobEventNames.Status, cancellationToken);
        _logger.LogInformation("Job başladı: {JobId}", jobId);

        using AsyncServiceScope scope = _serviceProvider.CreateAsyncScope();

        var context = new ArrowJobExecutionContext(jobId, _eventHub, scope.ServiceProvider, parentJobId: job.ParentJobId);
        ArrowJobExecutionContextHolder.Current = context;

        object? worker = null;
        if (!string.IsNullOrWhiteSpace(job.Name))
        {
            worker = scope.ServiceProvider.GetKeyedService(typeof(IArrowJobWorker<TRequest>), job.Name)
                     ?? scope.ServiceProvider.GetKeyedService<object>(job.Name);
        }
        worker ??= scope.ServiceProvider.GetService(typeof(IArrowJobWorker<TRequest>));
        if (worker is null)
            throw new InvalidOperationException($"'{job.Name}' için uygun worker servisi bulunamadı.");

        string resultPath = _resultStorage.GetResultPath(jobId, job.Name, job.RootJobId);

        try
        {
            IAsyncEnumerable<RecordBatch> rawBatches;
            if (worker is IArrowJobWorker<TRequest> streamWorker)
            {
                rawBatches = streamWorker.Handle(job.Request, cancellationToken);
            }
            else
            {
                object? response = await InvokeHandlerDynamicAsync(worker, job.Request, cancellationToken);
                rawBatches = ConvertResponseToBatches(response, cancellationToken);
            }

            IAsyncEnumerable<RecordBatch> batches = TrackProgressAsync(
                jobId,
                rawBatches,
                cancellationToken);
            await _resultStorage.WriteBatchesAsync(resultPath, batches, cancellationToken);

            latest = await _store.GetAsync(jobId, cancellationToken);
            if (latest?.State == ArrowJobState.Cancelled)
            {
                await _resultStorage.DeleteResultAsync(resultPath, cancellationToken);
                await PublishAsync(jobId, ArrowJobEventNames.Cancelled, cancellationToken);
                return;
            }

            await _store.MarkCompletedAsync(jobId, resultPath, cancellationToken);
            await PublishAsync(jobId, ArrowJobEventNames.Completed, cancellationToken);
            _logger.LogInformation("Job tamamlandı: {JobId}", jobId);
        }
        finally
        {
            ArrowJobExecutionContextHolder.Current = null;
        }

        ArrowJob<TRequest>? completed = await _store.GetAsync(jobId, cancellationToken);
        if (completed is not null)
        {
            activity?.SetTag("arrow.job.batch_count", completed.BatchCount);
            activity?.SetTag("arrow.job.total_rows", completed.TotalRows);
        }
    }

    private static Dictionary<string, object?> CreateLogScope(Guid jobId, Activity? activity) =>
        new()
        {
            ["JobId"] = jobId,
            ["RequestType"] = typeof(TRequest).Name,
            ["TraceId"] = activity?.TraceId.ToHexString(),
            ["SpanId"] = activity?.SpanId.ToHexString()
        };

    private async IAsyncEnumerable<RecordBatch> TrackProgressAsync(
        Guid jobId,
        IAsyncEnumerable<RecordBatch> batches,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        int batchCount = 0;
        long totalRows = 0;

        await foreach (RecordBatch batch in batches.WithCancellation(cancellationToken))
        {
            ArrowJob<TRequest>? current = await _store.GetAsync(jobId, cancellationToken);
            // Silinmiş job da iptal gibi davranır (Cancel→Delete yarışı).
            if (current is null || current.State == ArrowJobState.Cancelled)
                throw new OperationCanceledException();

            yield return batch;

            // Disk yazımı (yield sonrası) sırasında job silinmiş olabilir.
            current = await _store.GetAsync(jobId, cancellationToken);
            if (current is null || current.State == ArrowJobState.Cancelled)
                throw new OperationCanceledException();

            batchCount++;
            totalRows += batch.Length;
            await _store.ReportProgressAsync(jobId, batchCount, totalRows, cancellationToken);
            await PublishAsync(jobId, ArrowJobEventNames.Progress, cancellationToken);
        }
    }

    private async Task PublishAsync(Guid jobId, string eventName, CancellationToken cancellationToken)
    {
        ArrowJob<TRequest>? job = await _store.GetAsync(jobId, cancellationToken);
        if (job is null)
            return;

        ArrowJobEvent payload = new(
            job.Id,
            job.State.ToString(),
            job.CreatedAt,
            job.CompletedAt,
            job.Error,
            BatchCount: job.BatchCount,
            TotalRows: job.TotalRows,
            TraceId: job.TraceId,
            Name: job.Name,
            RootJobId: job.RootJobId);

        await _eventHub.PublishAsync(jobId, eventName, payload, cancellationToken);
    }

    private static async IAsyncEnumerable<RecordBatch> ConvertResponseToBatches(
        object? response,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        if (response is RecordBatch singleBatch)
        {
            yield return singleBatch;
        }
        else if (response is IAsyncEnumerable<RecordBatch> batchStream)
        {
            await foreach (RecordBatch b in batchStream.WithCancellation(cancellationToken))
                yield return b;
        }
        else if (response is System.Data.DataTable dataTable)
        {
            using var reader = dataTable.CreateDataReader();
            await using var arrowReader = ArrowData.OpenArrowReader(reader);
            await foreach (RecordBatch b in arrowReader.WithCancellation(cancellationToken))
                yield return b;
        }
        else if (response is System.Data.Common.DbDataReader dbReader)
        {
            await using var arrowReader = ArrowData.OpenArrowReader(dbReader);
            await foreach (RecordBatch b in arrowReader.WithCancellation(cancellationToken))
                yield return b;
        }
        else if (response is not null)
        {
            yield return CreateSingleResultBatch(response);
        }
    }

    private static RecordBatch CreateSingleResultBatch(object response)
    {
        string json = System.Text.Json.JsonSerializer.Serialize(response);
        Field[] fields = [new Field("Result", new Apache.Arrow.Types.StringType(), false)];
        Schema schema = new(fields, null);

        var builder = new StringArray.Builder();
        builder.Append(json);
        StringArray array = builder.Build();

        return new RecordBatch(schema, [array], 1);
    }

    private static async ValueTask<object?> InvokeHandlerDynamicAsync(
        object worker,
        object request,
        CancellationToken cancellationToken)
    {
        MethodInfo? method = worker.GetType().GetMethod("Handle", [request.GetType(), typeof(CancellationToken)]);
        if (method is null)
            throw new InvalidOperationException($"{worker.GetType().Name} handler üzerinde Handle metodu bulunamadı.");

        object? task = method.Invoke(worker, [request, cancellationToken]);
        if (task is null)
            return null;

        Type returnType = task.GetType();
        if (returnType.IsGenericType && returnType.GetGenericTypeDefinition() == typeof(ValueTask<>))
        {
            MethodInfo asTaskMethod = returnType.GetMethod("AsTask")!;
            Task t = (Task)asTaskMethod.Invoke(task, null)!;
            await t.ConfigureAwait(false);
            return t.GetType().GetProperty("Result")?.GetValue(t);
        }
        else if (task is Task t)
        {
            await t.ConfigureAwait(false);
            return t.GetType().GetProperty("Result")?.GetValue(t);
        }

        return task;
    }
}
