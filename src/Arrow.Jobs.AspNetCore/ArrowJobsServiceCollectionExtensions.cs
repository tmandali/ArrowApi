using Arrow.Http.AspNetCore;
using Arrow.Jobs.InMemory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace Arrow.Jobs.AspNetCore;

/// <summary>
/// Job altyapısı + HTTP endpoint kaydı. Backend-dışı (store/queue/hub) registration'ı,
/// <see cref="IArrowJobsConfigurer"/> (örn. <c>UseRedis</c> / <c>UseInMemory</c>) extension
/// extension'larına devredilir. Bu sınıf yalnızca:
/// <list type="bullet">
///   <item>Worker + keyed service kayıtları</item>
///   <item><see cref="IArrowJobExecutionContext"/> scoped kayıt (default impl)</item>
///   <item>Hosted service (request tipine göre backend'den bağımsız)</item>
///   <item>Varsayılan dosya-based result storage (disk) + retention</item>
/// </list>
/// </summary>
public static class ArrowJobsServiceCollectionExtensions
{
    /// <summary>
    /// Bir worker/request tipi için DI + job kaydı.
    /// Backend (store/queue/event-hub), <paramref name="configure"/> içinden
    /// sağlanmalıdır (örn. <c>c.UseRedis(conn)</c> veya <c>c.UseInMemory()</c>).
    /// </summary>
    public static IServiceCollection AddArrowJob<T>(
        this IServiceCollection services,
        string nameOrPath = "default",
        Action<IArrowJobsConfigurer>? configure = null)
        where T : notnull
    {
        string name = nameOrPath.Trim();

        bool exists = services.Any(d =>
            d.ServiceType == typeof(ArrowJobEndpointRegistration) &&
            d.ImplementationInstance is ArrowJobEndpointRegistration reg &&
            string.Equals(reg.NameOrPath, name, StringComparison.OrdinalIgnoreCase));

        if (exists)
        {
            throw new InvalidOperationException(
                $"'{name}' ismiyle birden fazla Arrow Job kaydı bulunuyor. Her Job ismi (name) benzersiz (unique) olmalıdır.");
        }

        AddArrowJobCore<T>(services, name, configure);

        // Hosted service: request tipini worker'dan çözerek, backend'den bağımsız kaydeder
        Type requestType = ArrowJobTypeResolver.TryGetRequestType(typeof(T)) ?? typeof(T);
        services.AddSingleton(typeof(Microsoft.Extensions.Hosting.IHostedService),
            sp => CreateHostedService(sp, requestType));

        services.AddSingleton(new ArrowJobEndpointRegistration(typeof(T), name));
        services.TryAddEnumerable(
            ServiceDescriptor.Singleton<IArrowApiFeature, ArrowJobsApiFeature>());
        return services;
    }

    private static void AddArrowJobCore<T>(IServiceCollection services, string name, Action<IArrowJobsConfigurer>? configure)
        where T : notnull
    {
        Type type = typeof(T);
        Type? requestFromWorker = ArrowJobTypeResolver.TryGetRequestType(type);

        if (requestFromWorker is not null)
        {
            var workerMethod = typeof(ArrowJobsServiceCollectionExtensions)
                .GetMethod(nameof(AddArrowJobWorkerImpl), System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
            workerMethod.MakeGenericMethod(requestFromWorker, type)
                .Invoke(null, [services, name, configure]);
            return;
        }

        var infraMethod = typeof(ArrowJobsServiceCollectionExtensions)
            .GetMethod(nameof(AddArrowJobInfrastructureImpl), System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        infraMethod.MakeGenericMethod(type)
            .Invoke(null, [services, configure]);
    }

    private static void AddArrowJobInfrastructureImpl<TRequest>(
        IServiceCollection services,
        Action<IArrowJobsConfigurer>? configure)
        where TRequest : notnull
    {
        // Varsayılan backend: InMemory (configure verilmezse). Backend extension'ları
        // (UseRedis vb.) kendi RegisterXxx'leri içinde RemoveBackend() çağırarak
        // InMemory store/queue/hub kayıtlarını temizleyip yerine kendi register eder.
        new ArrowJobsBuilder<TRequest>(services).UseInMemory();

        if (configure is not null)
            configure(new ArrowJobsConfigurer<TRequest>(new ArrowJobsBuilder<TRequest>(services)));

        services.RegisterDefaultJobExecutionContext();
        ArrowJobsStorageExtensions.RegisterDefaultFileStore(services);
    }

    private static void AddArrowJobWorkerImpl<TRequest, TWorker>(
        IServiceCollection services,
        string? name,
        Action<IArrowJobsConfigurer>? configure)
        where TRequest : notnull
        where TWorker : class
    {
        // Varsayılan backend: InMemory — configure'deki backend extension (UseRedis vb.)
        // RemoveBackend() ile InMemory kayıtlarını temizleyip kendi implementation'larını register eder.
        new ArrowJobsBuilder<TRequest>(services).UseInMemory();

        if (configure is not null)
            configure(new ArrowJobsConfigurer<TRequest>(new ArrowJobsBuilder<TRequest>(services)));

        if (!string.IsNullOrWhiteSpace(name))
        {
            services.AddKeyedScoped(typeof(TWorker), name);
            services.AddKeyedScoped(typeof(IArrowJobWorker<TRequest>), name, (sp, key) => sp.GetRequiredKeyedService(typeof(TWorker), key));
        }
        services.RegisterDefaultJobExecutionContext();

        services.AddScoped(typeof(TWorker));
        services.AddScoped(typeof(IArrowJobWorker<TRequest>), sp => sp.GetRequiredService(typeof(TWorker)));
        ArrowJobsStorageExtensions.RegisterDefaultFileStore(services);
    }

    /// <summary>
    /// <see cref="IArrowJobExecutionContext"/> — backend-dışı default impl (Abstractions) kaydı.
    /// Instance'ı runtime'ta <see cref="ArrowJobExecutionContextHolder" /> AsyncLocal'dan
    /// çözülür; DI yalnızca scoped resolve'ü sağlamaktır.
    /// </summary>
    internal static void RegisterDefaultJobExecutionContext(this IServiceCollection services)
    {
        services.TryAddScoped<IArrowJobExecutionContext>(sp =>
            ArrowJobExecutionContextHolder.Current
            ?? throw new InvalidOperationException(
                "IArrowJobExecutionContext is only available during job execution " +
                "(ArrowJobExecutionContextHolder.Current'un set edilmemiş olduğu durumda resolve edilirse fırlatılır)."));
    }

    /// <summary>Reflective helper: create the right <c>ArrowJobHostedService&lt;TRequest&gt;</c> instance.</summary>
    private static IHostedService CreateHostedService(IServiceProvider sp, Type requestType)
    {
        Type hostedType = typeof(ArrowJobHostedService<>).MakeGenericType(requestType);
        return (IHostedService)ActivatorUtilities.CreateInstance(sp, hostedType)!;
    }
}
