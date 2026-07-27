using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Arrow.Jobs.InMemory;

public abstract class ArrowJobWorker<TRequest> : BackgroundService, IArrowJobWorker<TRequest>
{
    private readonly IArrowJobQueue _queue;
    private readonly IArrowJobStore<TRequest> _store;
    private readonly ILogger _logger;

    protected IArrowJobResultStorage ResultStorage { get; }

    protected ArrowJobWorker(
        IArrowJobQueue queue,
        IArrowJobStore<TRequest> store,
        IArrowJobResultStorage resultStorage,
        ILogger logger)
    {
        _queue = queue;
        _store = store;
        ResultStorage = resultStorage;
        _logger = logger;
    }

    protected abstract Task ExecuteJobAsync(
        ArrowJob<TRequest> job,
        string resultPath,
        CancellationToken cancellationToken);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (Guid jobId in _queue.DequeueAllAsync(stoppingToken).ConfigureAwait(false))
        {
            try
            {
                await ProcessJobAsync(jobId, stoppingToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Job işlenemedi: {JobId}", jobId);
                await _store.MarkFailedAsync(jobId, ex.Message, stoppingToken).ConfigureAwait(false);
            }
        }
    }

    private async Task ProcessJobAsync(Guid jobId, CancellationToken cancellationToken)
    {
        ArrowJob<TRequest>? job = await _store.GetAsync(jobId, cancellationToken).ConfigureAwait(false);
        if (job is null)
            return;

        await _store.MarkRunningAsync(jobId, cancellationToken).ConfigureAwait(false);
        _logger.LogInformation("Job başladı: {JobId}", jobId);

        string resultPath = ResultStorage.GetResultPath(jobId);
        await ExecuteJobAsync(job, resultPath, cancellationToken).ConfigureAwait(false);
        await _store.MarkCompletedAsync(jobId, resultPath, cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Job tamamlandı: {JobId}", jobId);
    }
}
