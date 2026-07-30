using Arrow.Http.AspNetCore.Dispatcher;
using Microsoft.Extensions.Caching.Hybrid;

namespace Arrow.Http.AspNetCore.Behaviors;

/// <summary>
/// Opt-in marker. Queries that implement this get a HybridCache lookup wrapped around them.
/// </summary>
public interface ICacheable
{
    string CacheKey { get; }
    TimeSpan? Expiration => null;
}


public sealed class CachingBehavior<TRequest, TResponse>(
    HybridCache cache,
    ILogger<CachingBehavior<TRequest, TResponse>> logger)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    public async ValueTask<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (request is not ICacheable cacheable)
        {
            return await next();
        }

        var options = cacheable.Expiration is { } expiration
            ? new HybridCacheEntryOptions { Expiration = expiration }
            : null;

        return await cache.GetOrCreateAsync(
            cacheable.CacheKey,
            async ct =>
            {
                logger.LogInformation("Cache miss for {Key}", cacheable.CacheKey);
                return await next();
            },
            options,
            cancellationToken: cancellationToken);
    }
}
