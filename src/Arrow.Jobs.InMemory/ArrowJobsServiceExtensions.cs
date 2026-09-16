using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Arrow.Jobs.InMemory;

/// <summary>
/// Arrow Job In-Memory backend (store/queue/hub) DI kayıt extension'ları.
/// <para>
/// Public yüz: <see cref="ArrowJobsInMemoryExtensions.UseInMemory{TRequest}(ArrowJobsBuilder{TRequest})"/> builder extension.
/// <c>internal</c> <c>AddInMemoryJobServices</c> yöntemi yalnızca
/// AspNetCore <c>AddArrowJob</c> tarafından reflection ile çağrılır.
/// </para>
/// </summary>
public static class ArrowJobsInMemoryServiceExtensions
{
    /// <summary>
    /// Bir worker/request tipi için InMemory backend + worker + context kayıtları.
    /// </summary>
    internal static IServiceCollection AddInMemoryJobServices<T>(
        this IServiceCollection services,
        string? name = null,
        Action<IArrowJobsConfigurer>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);

        Type type = typeof(T);
        Type? requestFromWorker = ArrowJobTypeResolver.TryGetRequestType(type);

        if (requestFromWorker is not null)
        {
            var workerMethod = typeof(ArrowJobsInMemoryServiceExtensions)
                .GetMethod(nameof(AddInMemoryJobWorkerImpl), System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
            var workerImpl = workerMethod.MakeGenericMethod(requestFromWorker, type);
            return (IServiceCollection)workerImpl.Invoke(null, [services, name, configure])!;
        }

        var infraMethod = typeof(ArrowJobsInMemoryServiceExtensions)
            .GetMethod(nameof(AddInMemoryJobInfrastructureImpl), System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        var infraImpl = infraMethod.MakeGenericMethod(type);
        return (IServiceCollection)infraImpl.Invoke(null, [services, configure])!;
    }

    private static IServiceCollection AddInMemoryJobInfrastructureImpl<TRequest>(
        IServiceCollection services,
        Action<IArrowJobsConfigurer>? configure)
        where TRequest : notnull
    {
        var builder = new ArrowJobsBuilder<TRequest>(services);
        builder.UseInMemory();

        if (configure is not null)
            configure(new ArrowJobsConfigurer<TRequest>(builder));

        services.RegisterJobExecutionContext<TRequest>();
        return services;
    }

    private static IServiceCollection AddInMemoryJobWorkerImpl<TRequest, TWorker>(
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

        if (!string.IsNullOrWhiteSpace(name))
        {
            services.AddKeyedScoped(typeof(TWorker), name);
            services.AddKeyedScoped(typeof(IArrowJobWorker<TRequest>), name, (sp, key) => sp.GetRequiredKeyedService(typeof(TWorker), key));
        }
        services.RegisterJobExecutionContext<TRequest>();

        services.AddScoped(typeof(TWorker));
        services.AddScoped(typeof(IArrowJobWorker<TRequest>), sp => sp.GetRequiredService(typeof(TWorker)));
        return services;
    }

    /// <summary>
    /// <see cref="IArrowJobExecutionContext"/> (Abstractions'taki <c>DefaultArrowJobExecutionContext</c>)
    /// scoped register + <see cref="ArrowJobExecutionContextHolder"/> AsyncLocal köprüsü.
    /// </summary>
    internal static void RegisterJobExecutionContext<TRequest>(this IServiceCollection services)
        where TRequest : notnull
    {
        services.TryAddScoped<IArrowJobExecutionContext>(sp =>
            ArrowJobExecutionContextHolder.Current
            ?? throw new InvalidOperationException("IArrowJobExecutionContext is only available during job execution."));
    }
}
