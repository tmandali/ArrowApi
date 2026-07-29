using Apache.Arrow;

namespace Arrow.Jobs;

public interface IArrowJobWorker<TRequest>
{
    IAsyncEnumerable<RecordBatch> ExecuteJobAsync(
        IArrowJobExecutionContext<TRequest> context,
        CancellationToken cancellationToken);
}
