using System;
using System.Threading;
using System.Threading.Tasks;

namespace Arrow.Http.AspNetCore.Dispatcher;

/// <summary>
/// Marker for a request that returns a response.
/// </summary>
public interface IRequest<out TResponse>;

/// <summary>
/// Marker for a request that returns no payload.
/// </summary>
public interface IRequest : IRequest<Unit>;

/// <summary>
/// Void return type for commands that have no response payload.
/// </summary>
public readonly struct Unit
{
    public static readonly Unit Value = default;
}

/// <summary>
/// Handles a request and returns a response.
/// </summary>
public interface IRequestHandler<in TRequest, TResponse>
{
    ValueTask<TResponse> Handle(TRequest request, CancellationToken cancellationToken);
}

/// <summary>
/// Handles a request that has no response payload.
/// </summary>
public interface IRequestHandler<in TRequest> : IRequestHandler<TRequest, Unit>;
