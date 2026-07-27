using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace Arrow.Jobs.InMemory;

public static class ArrowJobsStorageExtensions
{
    public const string DefaultFileStorePath = "arrow-jobs";

    public static void UseFileStore(this IArrowJobsConfigurer configurer, string directoryPath)
    {
        ArgumentNullException.ThrowIfNull(configurer);
        RegisterFileStore(configurer.Services, directoryPath);
    }

    public static ArrowJobsBuilder<TRequest> UseFileStore<TRequest>(
        this ArrowJobsBuilder<TRequest> builder,
        string directoryPath)
    {
        RegisterFileStore(builder.Services, directoryPath);
        return builder;
    }

    public static void UseResultStorage<TStorage>(this IArrowJobsConfigurer configurer)
        where TStorage : class, IArrowJobResultStorage
    {
        ArgumentNullException.ThrowIfNull(configurer);
        RegisterResultStorage<TStorage>(configurer.Services);
    }

    public static ArrowJobsBuilder<TRequest> UseResultStorage<TRequest, TStorage>(this ArrowJobsBuilder<TRequest> builder)
        where TStorage : class, IArrowJobResultStorage
    {
        RegisterResultStorage<TStorage>(builder.Services);
        return builder;
    }

    internal static void RegisterDefaultFileStore(IServiceCollection services) =>
        RegisterFileStore(services, DefaultFileStorePath);

    private static void RegisterFileStore(IServiceCollection services, string directoryPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directoryPath);

        services.RemoveAll<IArrowJobResultStorage>();
        services.AddSingleton<IArrowJobResultStorage>(sp =>
        {
            IHostEnvironment environment = sp.GetRequiredService<IHostEnvironment>();
            return new FileParquetResultStorage(environment, directoryPath);
        });
    }

    private static void RegisterResultStorage<TStorage>(IServiceCollection services)
        where TStorage : class, IArrowJobResultStorage
    {
        services.RemoveAll<IArrowJobResultStorage>();
        services.TryAddSingleton<IArrowJobResultStorage, TStorage>();
    }
}
