namespace Arrow.Http.AspNetCore.Dispatcher;

/// <summary>
/// Non-generic base so it can live in a single FrozenDictionary value type.
/// </summary>
internal abstract class RequestHandlerBase;

/// <summary>
/// Generic over the response so the dispatcher can downcast and call without boxing.
/// </summary>
internal abstract class RequestHandlerBase<TResponse> : RequestHandlerBase
{
    public abstract ValueTask<TResponse> Handle(
        IRequest<TResponse> request,
        IServiceProvider provider,
        CancellationToken cancellationToken);
}

/// <summary>
/// One concrete wrapper per (TRequest, TResponse) pair. Created once at registration via
/// Activator.CreateInstance and stored in the FrozenDictionary. The Handle method is a
/// strongly-typed call site - no reflection, no MakeGenericType.
/// </summary>
internal sealed class RequestHandlerWrapper<TRequest, TResponse> : RequestHandlerBase<TResponse>
    where TRequest : IRequest<TResponse>
{
    public override ValueTask<TResponse> Handle(
        IRequest<TResponse> request,
        IServiceProvider provider,
        CancellationToken cancellationToken)
    {
        var typed = (TRequest)request;
        var handler = provider.GetRequiredService<IRequestHandler<TRequest, TResponse>>();
        var behaviors = provider.GetServices<IPipelineBehavior<TRequest, TResponse>>();

        // Build the pipeline: handler at the core, behaviors wrapped outside in registration order.
        // Iterating in reverse means the first registered behavior runs outermost.
        RequestHandlerDelegate<TResponse> pipeline = () => handler.Handle(typed, cancellationToken);

        foreach (var behavior in behaviors.Reverse())
        {
            var next = pipeline;
            var current = behavior;
            pipeline = () => current.Handle(typed, next, cancellationToken);
        }

        return pipeline();
    }
}