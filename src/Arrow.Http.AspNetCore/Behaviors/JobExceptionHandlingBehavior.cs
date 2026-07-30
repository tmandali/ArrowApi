using Arrow.Http.AspNetCore.Dispatcher;
using Microsoft.Extensions.Logging;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace Arrow.Http.AspNetCore.Behaviors;

public sealed class JobExceptionHandlingBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    private readonly ILogger<JobExceptionHandlingBehavior<TRequest, TResponse>> _logger;

    public JobExceptionHandlingBehavior(ILogger<JobExceptionHandlingBehavior<TRequest, TResponse>> logger)
    {
        _logger = logger;
    }

    public async ValueTask<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        try
        {
            return await next();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "{RequestType} işlenirken hata oluştu: {ErrorMessage}", typeof(TRequest).Name, ex.Message);
            throw;
        }
    }
}
