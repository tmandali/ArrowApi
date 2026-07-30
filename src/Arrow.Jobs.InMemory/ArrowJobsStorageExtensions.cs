using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace Arrow.Jobs.InMemory;

/// <summary>Job dosya ve sonuç depolama extension'ları.</summary>
public static class ArrowJobsStorageExtensions
{
    /// <summary>Varsayılan dosya depolama klasör adı (<c>"arrow-jobs"</c>).</summary>
    public const string DefaultFileStorePath = "arrow-jobs";

    /// <summary>Özel dizin; varsayılan <see cref="DefaultFileStorePath"/> zaten <c>AddArrowJob</c> ile gelir.</summary>
    public static void UseFileStore(
        this IArrowJobsConfigurer configurer,
        string directoryPath)
    {
        ArgumentNullException.ThrowIfNull(configurer);
        RegisterFileStore(configurer.Services, directoryPath);
    }

    /// <summary>Özel dizin; varsayılan <see cref="DefaultFileStorePath"/> zaten <c>AddArrowJob</c> ile gelir.</summary>
    public static ArrowJobsBuilder<TRequest> UseFileStore<TRequest>(
        this ArrowJobsBuilder<TRequest> builder,
        string directoryPath)
        where TRequest : notnull
    {
        RegisterFileStore(builder.Services, directoryPath);
        return builder;
    }

    /// <summary>Özel <see cref="IArrowJobResultStorage"/> uygulamasını kaydeder.</summary>
    public static void UseResultStorage<TStorage>(this IArrowJobsConfigurer configurer)
        where TStorage : class, IArrowJobResultStorage
    {
        ArgumentNullException.ThrowIfNull(configurer);
        RegisterResultStorage<TStorage>(configurer.Services);
    }

    /// <summary>Özel <see cref="IArrowJobResultStorage"/> uygulamasını jenerik builder üzerinden kaydeder.</summary>
    public static ArrowJobsBuilder<TRequest> UseResultStorage<TRequest, TStorage>(this ArrowJobsBuilder<TRequest> builder)
        where TRequest : notnull
        where TStorage : class, IArrowJobResultStorage
    {
        RegisterResultStorage<TStorage>(builder.Services);
        return builder;
    }

    internal static void RegisterDefaultFileStore(IServiceCollection services) =>
        services.TryAddSingleton<IArrowJobResultStorage>(sp =>
        {
            IHostEnvironment environment = sp.GetRequiredService<IHostEnvironment>();
            return new FileArrowResultStorage(environment, DefaultFileStorePath);
        });

    private static void RegisterFileStore(IServiceCollection services, string directoryPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directoryPath);

        services.RemoveAll<IArrowJobResultStorage>();
        services.AddSingleton<IArrowJobResultStorage>(sp =>
        {
            IHostEnvironment environment = sp.GetRequiredService<IHostEnvironment>();
            return new FileArrowResultStorage(environment, directoryPath);
        });
    }

    private static void RegisterResultStorage<TStorage>(IServiceCollection services)
        where TStorage : class, IArrowJobResultStorage
    {
        services.RemoveAll<IArrowJobResultStorage>();
        services.TryAddSingleton<IArrowJobResultStorage, TStorage>();
    }
}
