using Arrow.Http.AspNetCore;
using Arrow.Jobs.InMemory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Arrow.Jobs.AspNetCore;

/// <summary>
/// Job altyapısı + HTTP endpoint kaydı.
/// Host: <c>services.AddArrowJob&lt;T&gt;(path, configure?)</c> sonra <c>app.UseArrowApi()</c>.
/// </summary>
public static class ArrowJobsServiceCollectionExtensions
{
    /// <summary>
    /// Bir worker/request tipi için DI + <paramref name="path"/> altında job API.
    /// <paramref name="configure"/> isteğe bağlı (Redis vb.).
    /// Endpoint'ler <see cref="ArrowAspNetCoreApplicationExtensions.UseArrowApi"/> ile map edilir.
    /// </summary>
    /// <param name="path">Job route prefix (ör. <c>/api/arrow/jobs</c>). Zorunlu.</param>
    public static IServiceCollection AddArrowJob<T>(
        this IServiceCollection services,
        string path,
        Action<IArrowJobsConfigurer>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentException.ThrowIfNullOrWhiteSpace(path);

        services.AddArrowJobServices<T>(configure);
        services.AddSingleton(new ArrowJobEndpointRegistration(typeof(T), path.Trim()));
        services.TryAddEnumerable(
            ServiceDescriptor.Singleton<IArrowApiFeature, ArrowJobsApiFeature>());
        return services;
    }
}
