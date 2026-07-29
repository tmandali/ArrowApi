using Microsoft.Extensions.DependencyInjection;

namespace Arrow.Jobs;

internal sealed class ArrowJobsConfigurer<TRequest> : IArrowJobsConfigurer
{
    private readonly ArrowJobsBuilder<TRequest> _builder;

    public ArrowJobsConfigurer(ArrowJobsBuilder<TRequest> builder)
    {
        _builder = builder;
    }

    public IServiceCollection Services => _builder.Services;
    public Type RequestType => typeof(TRequest);
}
