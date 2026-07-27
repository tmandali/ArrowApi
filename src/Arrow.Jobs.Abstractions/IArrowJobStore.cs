namespace Arrow.Jobs;

public interface IArrowJobStore<TRequest>
{
    Task<ArrowJob<TRequest>> CreateAsync(TRequest request, CancellationToken cancellationToken = default);
    Task<ArrowJob<TRequest>?> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task MarkRunningAsync(Guid id, CancellationToken cancellationToken = default);
    Task MarkCompletedAsync(Guid id, string resultPath, CancellationToken cancellationToken = default);
    Task MarkFailedAsync(Guid id, string error, CancellationToken cancellationToken = default);
}
