using Microsoft.AspNetCore.Authentication;

namespace Arrow.Jobs.AspNetCore.Authentication;

public sealed class ApiKeyAuthenticationOptions : AuthenticationSchemeOptions
{
    public const string DefaultScheme = "ApiKey";
    public const string HeaderName = "X-API-Key";
}
