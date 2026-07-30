namespace Arrow.Jobs;

public interface IArrowJobQueue<TRequest>
    where TRequest : notnull
{
    ValueTask EnqueueAsync(Guid jobId, CancellationToken cancellationToken = default);
    IAsyncEnumerable<Guid> DequeueAllAsync(CancellationToken cancellationToken);
}
