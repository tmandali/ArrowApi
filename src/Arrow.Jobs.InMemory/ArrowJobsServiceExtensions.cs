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
        string? name = null,
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

            return (IServiceCollection)method.Invoke(null, [services, name, configure])!;
        }

        MethodInfo infraMethod = typeof(ArrowJobsServiceExtensions)
            .GetMethod(nameof(AddArrowJobsInfrastructureImpl), BindingFlags.NonPublic | BindingFlags.Static)!
            .MakeGenericMethod(type);

        return (IServiceCollection)infraMethod.Invoke(null, [services, configure])!;
    }

    private static IServiceCollection AddArrowJobsInfrastructureImpl<TRequest>(
        IServiceCollection services,
        Action<IArrowJobsConfigurer>? configure)
        where TRequest : notnull
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
        string? name,
        Action<IArrowJobsConfigurer>? configure)
        where TRequest : notnull
        where TWorker : class
    {
        var builder = new ArrowJobsBuilder<TRequest>(services);
        builder.UseInMemory();

        if (configure is not null)
            configure(new ArrowJobsConfigurer<TRequest>(builder));

        ArrowJobsStorageExtensions.RegisterDefaultFileStore(services);
        if (!string.IsNullOrWhiteSpace(name))
        {
            services.AddKeyedScoped(typeof(TWorker), name);
            services.AddKeyedScoped(typeof(IArrowJobWorker<TRequest>), name, (sp, key) => sp.GetRequiredKeyedService(typeof(TWorker), key));
        }
        services.AddScoped<IArrowJobExecutionContext<TRequest>>(sp =>
            ArrowJobExecutionContextHolder<TRequest>.Current
            ?? throw new InvalidOperationException($"IArrowJobExecutionContext<{typeof(TRequest).Name}> is only available during job execution."));

        services.AddScoped(typeof(TWorker));
        services.AddScoped(typeof(IArrowJobWorker<TRequest>), sp => sp.GetRequiredService(typeof(TWorker)));
        services.AddHostedService<ArrowJobHostedService<TRequest>>();
        return services;
    }
}
