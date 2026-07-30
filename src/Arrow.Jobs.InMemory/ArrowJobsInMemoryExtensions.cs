using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using System.Reflection;

namespace Arrow.Jobs.InMemory;

/// <summary>InMemory store/queue/hub kayıtları.</summary>
public static class ArrowJobsInMemoryExtensions
{
    public static ArrowJobsBuilder<TRequest> UseInMemory<TRequest>(this ArrowJobsBuilder<TRequest> builder)
        where TRequest : notnull
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.RemoveBackend();
        builder.Services.TryAddSingleton<IArrowJobStore<TRequest>, InMemoryArrowJobStore<TRequest>>();
        builder.Services.AddSingleton<IArrowJobStore>(sp => (IArrowJobStore)sp.GetRequiredService<IArrowJobStore<TRequest>>());
        builder.Services.TryAddSingleton<IArrowJobQueue<TRequest>, InMemoryArrowJobQueue<TRequest>>();
        builder.Services.TryAddSingleton<IArrowJobEventHub, InMemoryArrowJobEventHub>();
        return builder;
    }

    public static void UseInMemory(this IArrowJobsConfigurer configurer)
    {
        ArgumentNullException.ThrowIfNull(configurer);

        typeof(ArrowJobsInMemoryExtensions)
            .GetMethod(nameof(UseInMemoryForRequest), BindingFlags.NonPublic | BindingFlags.Static)!
            .MakeGenericMethod(configurer.RequestType)
            .Invoke(null, [configurer.Services]);
    }

    private static void UseInMemoryForRequest<TRequest>(IServiceCollection services)
        where TRequest : notnull =>
        new ArrowJobsBuilder<TRequest>(services).UseInMemory();
}
