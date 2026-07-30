using Arrow.Http.AspNetCore;
using Arrow.Jobs.InMemory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Arrow.Jobs.AspNetCore;

/// <summary>
/// Job altyapısı + HTTP endpoint kaydı.
/// </summary>
public static class ArrowJobsServiceCollectionExtensions
{
    /// <summary>
    /// Bir worker/request tipi için DI + job kaydı.
    /// </summary>
    internal static IServiceCollection AddArrowJob<T>(
        this IServiceCollection services,
        string nameOrPath = "default",
        Action<IArrowJobsConfigurer>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        if (string.IsNullOrWhiteSpace(nameOrPath))
            nameOrPath = "default";

        services.AddArrowResponse();
        services.AddArrowJobServices<T>(nameOrPath, configure);
        services.AddSingleton(new ArrowJobEndpointRegistration(typeof(T), nameOrPath.Trim()));
        services.TryAddEnumerable(
            ServiceDescriptor.Singleton<IArrowApiFeature, ArrowJobsApiFeature>());
        return services;
    }
}
