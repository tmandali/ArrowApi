namespace Arrow.Http.AspNetCore.Dispatcher;

/// <summary>
/// Sends a request to its single handler through the pipeline behavior chain.
/// MediatR-12 compatible name so existing endpoint code keeps working.
/// </summary>
public interface ISender
{
    ValueTask<TResponse> Send<TResponse>(
        IRequest<TResponse> request,
        CancellationToken cancellationToken = default);
}
