using Microsoft.Extensions.DependencyInjection;

namespace Arrow.Jobs.InMemory;

/// <summary>
/// Job altyapısı yapılandırması — store/kuyruk ve sonuç depolama.
/// </summary>
public interface IArrowJobsConfigurer
{
    IServiceCollection Services { get; }
    Type RequestType { get; }
    void UseInMemory();
}

internal sealed class ArrowJobsConfigurer<TRequest> : IArrowJobsConfigurer
{
    private readonly ArrowJobsBuilder<TRequest> _builder;

    public ArrowJobsConfigurer(ArrowJobsBuilder<TRequest> builder)
    {
        _builder = builder;
    }

    public IServiceCollection Services => _builder.Services;
    public Type RequestType => typeof(TRequest);
    public void UseInMemory() => _builder.UseInMemory();
}
