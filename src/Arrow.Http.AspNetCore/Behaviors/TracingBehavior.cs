using Arrow.Http.AspNetCore.Dispatcher;
using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;

namespace Arrow.Http.AspNetCore.Behaviors;

public sealed class TracingBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    private static readonly ActivitySource Source = new("Arrow.Jobs");

    public async ValueTask<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        string requestName = typeof(TRequest).Name;
        using Activity? activity = Source.StartActivity($"Job {requestName}");
        activity?.SetTag("job.request_type", requestName);

        try
        {
            TResponse response = await next();
            activity?.SetStatus(ActivityStatusCode.Ok);
            return response;
        }
        catch (Exception ex)
        {
            activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
            activity?.AddTag("exception.type", ex.GetType().FullName);
            activity?.AddTag("exception.message", ex.Message);
            throw;
        }
    }
}
