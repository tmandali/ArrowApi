using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Arrow.Jobs.InMemory;

public sealed class ArrowJobsBuilder<TRequest>
{
    public IServiceCollection Services { get; }

    internal ArrowJobsBuilder(IServiceCollection services)
    {
        Services = services;
    }

    public ArrowJobsBuilder<TRequest> UseInMemory()
    {
        RemoveBackend();
        Services.TryAddSingleton<IArrowJobStore<TRequest>, InMemoryArrowJobStore<TRequest>>();
        Services.TryAddSingleton<IArrowJobQueue, InMemoryArrowJobQueue>();
        return this;
    }

    public void RemoveBackend()
    {
        Services.RemoveAll<IArrowJobStore<TRequest>>();
        Services.RemoveAll<IArrowJobQueue>();
    }
}

public static class ArrowJobsServiceExtensions
{
    /// <summary>
    /// <typeparamref name="T"/> worker ise altyapı + hosted service;
    /// request tipi ise yalnızca altyapı (API node).
    /// </summary>
    public static IServiceCollection AddArrowJobs<T>(
        this IServiceCollection services,
        Action<IArrowJobsConfigurer>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);

        Type type = typeof(T);
        Type? requestFromWorker = ArrowJobTypeResolver.TryGetRequestType(type);

        if (requestFromWorker is not null)
        {
            MethodInfo method = typeof(ArrowJobsServiceExtensions)
                .GetMethod(nameof(AddArrowJobsWorkerImpl), BindingFlags.NonPublic | BindingFlags.Static)!
                .MakeGenericMethod(requestFromWorker, type);

            return (IServiceCollection)method.Invoke(null, [services, configure])!;
        }

        MethodInfo infraMethod = typeof(ArrowJobsServiceExtensions)
            .GetMethod(nameof(AddArrowJobsInfrastructureImpl), BindingFlags.NonPublic | BindingFlags.Static)!
            .MakeGenericMethod(type);

        return (IServiceCollection)infraMethod.Invoke(null, [services, configure])!;
    }

    private static IServiceCollection AddArrowJobsInfrastructureImpl<TRequest>(
        IServiceCollection services,
        Action<IArrowJobsConfigurer>? configure)
    {
        var builder = new ArrowJobsBuilder<TRequest>(services);
        builder.UseInMemory();

        if (configure is not null)
        {
            var configurer = new ArrowJobsConfigurer<TRequest>(builder);
            configure(configurer);
        }

        ArrowJobsStorageExtensions.RegisterDefaultFileStore(services);
        return services;
    }

    private static IServiceCollection AddArrowJobsWorkerImpl<TRequest, TWorker>(
        IServiceCollection services,
        Action<IArrowJobsConfigurer>? configure)
        where TWorker : ArrowJobWorker<TRequest>
    {
        var builder = new ArrowJobsBuilder<TRequest>(services);
        builder.UseInMemory();

        if (configure is not null)
        {
            var configurer = new ArrowJobsConfigurer<TRequest>(builder);
            configure(configurer);
        }

        ArrowJobsStorageExtensions.RegisterDefaultFileStore(services);
        services.AddHostedService<TWorker>();
        return services;
    }
}
