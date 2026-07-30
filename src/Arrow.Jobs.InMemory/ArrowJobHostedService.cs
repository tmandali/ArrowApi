using Apache.Arrow;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Diagnostics;
using System.Runtime.CompilerServices;

namespace Arrow.Jobs.InMemory;

public sealed class ArrowJobHostedService<TRequest> : BackgroundService
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
                if (cancelled?.State == ArrowJobState.Cancelled)
                {
                    activity?.SetStatus(ActivityStatusCode.Ok);
                    await PublishAsync(jobId, ArrowJobEventNames.Cancelled, cancellationToken);
                    _logger.LogInformation("Job iptal edildi: {JobId}", jobId);
                    return;
                }

                throw;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                ArrowJob<TRequest>? current = await _store.GetAsync(jobId, cancellationToken);
                if (current?.State == ArrowJobState.Cancelled)
                {
                    activity?.SetStatus(ActivityStatusCode.Ok);
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
        IArrowJobWorker<TRequest>? worker = null;
        if (!string.IsNullOrWhiteSpace(job.Name))
        {
            worker = scope.ServiceProvider.GetKeyedService<IArrowJobWorker<TRequest>>(job.Name);
        }
        worker ??= scope.ServiceProvider.GetService<IArrowJobWorker<TRequest>>();
        if (worker is null)
            throw new InvalidOperationException($"'{job.Name}' için uygun worker servisi bulunamadı.");

        var context = new ArrowJobExecutionContext<TRequest>(jobId, job.Request, _store, _eventHub);
        string resultPath = _resultStorage.GetResultPath(jobId);
        IAsyncEnumerable<RecordBatch> batches = TrackProgressAsync(
            jobId,
            worker.ExecuteJobAsync(context, cancellationToken),
            cancellationToken);
        await _resultStorage.WriteBatchesAsync(resultPath, batches, cancellationToken);

        latest = await _store.GetAsync(jobId, cancellationToken);
        if (latest?.State == ArrowJobState.Cancelled)
        {
            await _resultStorage.DeleteResultAsync(jobId, cancellationToken);
            await PublishAsync(jobId, ArrowJobEventNames.Cancelled, cancellationToken);
            return;
        }

        await _store.MarkCompletedAsync(jobId, resultPath, cancellationToken);
        await PublishAsync(jobId, ArrowJobEventNames.Completed, cancellationToken);

        ArrowJob<TRequest>? completed = await _store.GetAsync(jobId, cancellationToken);
        if (completed is not null)
        {
            activity?.SetTag("arrow.job.batch_count", completed.BatchCount);
            activity?.SetTag("arrow.job.total_rows", completed.TotalRows);
        }

        _logger.LogInformation("Job tamamlandı: {JobId}", jobId);
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
            if (current?.State == ArrowJobState.Cancelled)
                throw new OperationCanceledException();

            yield return batch;

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
            TraceId: job.TraceId);

        await _eventHub.PublishAsync(jobId, eventName, payload, cancellationToken);
    }
}
