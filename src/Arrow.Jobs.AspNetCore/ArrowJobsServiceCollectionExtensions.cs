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

        services.AddArrowResponse();
<<<<<<< HEAD
        services.AddArrowJobServices<T>(name, configure);
        services.AddSingleton(new ArrowJobEndpointRegistration(typeof(T), name));
=======
        services.AddArrowJobServices<T>(nameOrPath, configure);
        services.AddSingleton(new ArrowJobEndpointRegistration(typeof(T), nameOrPath.Trim()));
>>>>>>> 5c09fda62d674ed3d7cb9330460ad7d9bcf2705c
        services.TryAddEnumerable(
            ServiceDescriptor.Singleton<IArrowApiFeature, ArrowJobsApiFeature>());
        return services;
    }
}
