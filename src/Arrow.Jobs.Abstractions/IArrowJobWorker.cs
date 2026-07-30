using Apache.Arrow;
using Arrow.Http.AspNetCore.Dispatcher;
using System.Collections.Generic;

namespace Arrow.Jobs;

/// <summary>
/// Ortak CQRS Handler & Arrow Job Worker arayüzü.
/// </summary>
public interface IArrowJobWorker<in TRequest, TResponse> : IRequestHandler<TRequest, TResponse>
{
}

/// <summary>
/// RecordBatch akışı dönen varsayılan Arrow Job Worker arayüzü.
/// </summary>
public interface IArrowJobWorker<in TRequest> : IArrowJobWorker<TRequest, IAsyncEnumerable<RecordBatch>>;
