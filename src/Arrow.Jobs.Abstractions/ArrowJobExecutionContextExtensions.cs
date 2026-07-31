using Arrow.Data;

namespace Arrow.Jobs;

/// <summary>
/// <see cref="ArrowJob{TRequest}"/> nesneleri için worker bağlamı extension metodları.
/// </summary>
public static class ArrowJobExecutionContextExtensions
{
    /// <summary>
    /// Worker bağlamında (<see cref="IArrowJobExecutionContext"/>) alt job sonucunu <see cref="ArrowBatchReader"/> olarak okur.
    /// </summary>
    public static Task<ArrowBatchReader> GetArrowReaderAsync<TRequest>(
        this ArrowJob<TRequest> job,
        IArrowJobExecutionContext context,
        bool throwOnError = true,
        CancellationToken cancellationToken = default)
        where TRequest : notnull
    {
        if (job is null) throw new ArgumentNullException(nameof(job));
        if (context is null) throw new ArgumentNullException(nameof(context));
        return context.GetArrowReaderAsync(job, throwOnError, cancellationToken);
    }
}
