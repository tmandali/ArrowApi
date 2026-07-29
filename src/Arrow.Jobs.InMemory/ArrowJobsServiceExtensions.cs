using Microsoft.Extensions.DependencyInjection;
using System.Reflection;

namespace Arrow.Jobs.InMemory;

public static class ArrowJobsServiceExtensions
{
    /// <summary>
    /// Job DI kaydı (store/queue/hub/file store; worker ise hosted service).
    /// Public giriş: <c>AddArrowJob&lt;T&gt;(path)</c> (<c>Arrow.Jobs.AspNetCore</c>).
    /// </summary>
    internal static IServiceCollection AddArrowJobServices<T>(
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
            configure(new ArrowJobsConfigurer<TRequest>(builder));

        ArrowJobsStorageExtensions.RegisterDefaultFileStore(services);
        return services;
    }

    private static IServiceCollection AddArrowJobsWorkerImpl<TRequest, TWorker>(
        IServiceCollection services,
        Action<IArrowJobsConfigurer>? configure)
        where TWorker : class, IArrowJobWorker<TRequest>
    {
        var builder = new ArrowJobsBuilder<TRequest>(services);
        builder.UseInMemory();

        if (configure is not null)
            configure(new ArrowJobsConfigurer<TRequest>(builder));

        ArrowJobsStorageExtensions.RegisterDefaultFileStore(services);
        services.AddSingleton<IArrowJobWorker<TRequest>, TWorker>();
        services.AddHostedService<ArrowJobHostedService<TRequest>>();
        return services;
    }
}
