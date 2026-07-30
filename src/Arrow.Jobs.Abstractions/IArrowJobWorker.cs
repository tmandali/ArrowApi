using Apache.Arrow;
using Arrow.Http.AspNetCore.Dispatcher;

namespace Arrow.Jobs;

/// <summary>
/// Ortak CQRS Handler & Arrow Job Worker arayüzü.
/// </summary>
public interface IArrowJobWorker<in TRequest, TResponse> : IRequestHandler<TRequest, TResponse>
    where TRequest : notnull
{
}

/// <summary>
/// RecordBatch akışı dönen varsayılan Arrow Job Worker arayüzü.
/// </summary>
public interface IArrowJobWorker<in TRequest> : IRequestHandler<TRequest, IAsyncEnumerable<RecordBatch>>
    where TRequest : notnull
{
#if NETCOREAPP || NETSTANDARD2_1_OR_GREATER || NET6_0_OR_GREATER
    new IAsyncEnumerable<RecordBatch> Handle(TRequest request, CancellationToken cancellationToken);

    ValueTask<IAsyncEnumerable<RecordBatch>> IRequestHandler<TRequest, IAsyncEnumerable<RecordBatch>>.Handle(
        TRequest request,
        CancellationToken cancellationToken)
    {
        return new ValueTask<IAsyncEnumerable<RecordBatch>>(Handle(request, cancellationToken));
    }
#endif
}
