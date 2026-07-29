using Microsoft.AspNetCore.Authentication;

namespace Arrow.Jobs.AspNetCore.Authentication;

public sealed class StaticApiKeyAuthenticationOptions : AuthenticationSchemeOptions
{
    public const string DefaultScheme = "StaticApiKey";
    public const string HeaderName = "X-API-Key";

    /// <summary>Beklenen düz metin API key. Boşsa tüm istekler reddedilir.</summary>
    public string ApiKey { get; set; } = "";

    /// <summary>Başarılı auth sonrası <see cref="System.Security.Claims.ClaimTypes.Name"/> / client_id.</summary>
    public string ClientId { get; set; } = "static-client";
}
