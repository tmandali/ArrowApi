using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Arrow.Http.AspNetCore;

/// <summary>Arrow ASP.NET Core servis kayıtları.</summary>
public static class ArrowAspNetCoreServiceExtensions
{
    /// <summary>
    /// <see cref="ArrowDataTableSource"/> dönüşlerini Arrow IPC'ye çeviren endpoint filter'ı ekler.
    /// </summary>
    public static IServiceCollection AddArrowResponse(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);
        services.TryAddSingleton<ArrowResponseEndpointFilter>();
        services.TryAddEnumerable(
            ServiceDescriptor.Singleton<IEndpointFilter, ArrowResponseEndpointFilter>(
                static sp => sp.GetRequiredService<ArrowResponseEndpointFilter>()));
        return services;
    }

    /// <summary>
    /// Arrow ASP.NET Core servislerini (<see cref="AddArrowResponse"/>) ve isteğe bağlı modülleri (Job vb.) kaydeder.
    /// </summary>
    public static IServiceCollection AddArrowApi(
        this IServiceCollection services,
        Action<IArrowApiBuilder>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddArrowResponse();

        if (configure is not null)
        {
            var builder = new ArrowApiBuilder(services);
            configure(builder);
        }

        return services;
    }
}
