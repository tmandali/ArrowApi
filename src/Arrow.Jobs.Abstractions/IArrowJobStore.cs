namespace Arrow.Jobs;

public interface IArrowJobStore<TRequest>
{
    Task<ArrowJob<TRequest>> CreateAsync(TRequest request, string? name = null, CancellationToken cancellationToken = default);
    Task<ArrowJob<TRequest>?> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<ArrowJobListPage<TRequest>> ListAsync(ArrowJobListQuery query, CancellationToken cancellationToken = default);
    Task MarkRunningAsync(Guid id, CancellationToken cancellationToken = default);
    Task ReportProgressAsync(Guid id, int batchCount, long totalRows, CancellationToken cancellationToken = default);
    Task MarkCompletedAsync(Guid id, string resultPath, CancellationToken cancellationToken = default);
    Task MarkFailedAsync(Guid id, string error, CancellationToken cancellationToken = default);

    /// <summary>
    /// <see cref="ArrowJobState.Queued"/> veya <see cref="ArrowJobState.Running"/> ise
    /// <see cref="ArrowJobState.Cancelled"/> yapar. Aksi halde <c>false</c>.
    /// </summary>
    Task<bool> TryCancelAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>
    /// <see cref="ArrowJobState.Running"/> dışındaki job'u siler. Running ise <c>false</c>.
    /// </summary>
    Task<bool> TryDeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
