using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Arrow.Jobs;

/// <summary>Bir <typeparamref name="TRequest"/> için store/queue/hub kayıt builder'ı.</summary>
public sealed class ArrowJobsBuilder<TRequest>
    where TRequest : notnull
{
    public IServiceCollection Services { get; }

    internal ArrowJobsBuilder(IServiceCollection services)
    {
        Services = services;
    }

    public void RemoveBackend()
    {
        Services.RemoveAll<IArrowJobStore<TRequest>>();
        Services.RemoveAll<IArrowJobQueue<TRequest>>();
        Services.RemoveAll<IArrowJobEventHub>();
    }
}
