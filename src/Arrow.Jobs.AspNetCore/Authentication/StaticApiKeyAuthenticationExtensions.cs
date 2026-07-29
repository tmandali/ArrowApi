using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection;

namespace Arrow.Jobs.AspNetCore.Authentication;

public static class StaticApiKeyAuthenticationExtensions
{
    public static AuthenticationBuilder AddStaticApiKey(
        this AuthenticationBuilder builder,
        Action<StaticApiKeyAuthenticationOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(builder);

        return builder.AddScheme<StaticApiKeyAuthenticationOptions, StaticApiKeyAuthenticationHandler>(
            StaticApiKeyAuthenticationOptions.DefaultScheme,
            configure);
    }

    /// <summary>
    /// Varsayılan scheme olarak static API key auth kaydeder.
    /// </summary>
    public static IServiceCollection AddStaticApiKeyAuthentication(
        this IServiceCollection services,
        Action<StaticApiKeyAuthenticationOptions> configure)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configure);

        services
            .AddAuthentication(StaticApiKeyAuthenticationOptions.DefaultScheme)
            .AddStaticApiKey(configure);

        services.AddAuthorization();
        return services;
    }
}
