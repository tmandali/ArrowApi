using System.Threading;
using System.Threading.Tasks;

namespace Arrow.Http.AspNetCore.Dispatcher;

/// <summary>
/// Delegate that represents the next step in a pipeline. Calling it invokes the next
/// behavior or, at the end of the chain, the handler itself.
/// </summary>
public delegate ValueTask<TResponse> RequestHandlerDelegate<TResponse>();

/// <summary>
/// A cross-cutting behavior that wraps the handler. Behaviors are composed in
/// registration order: the first registered runs outermost.
/// </summary>
public interface IPipelineBehavior<in TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    ValueTask<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken);
}
