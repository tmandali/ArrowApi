using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;

namespace Arrow.Jobs.AspNetCore.Authentication;

/// <summary>
/// Yapılandırılmış tek bir API key ile <c>X-API-Key</c> header'ını sabit zamanlı karşılaştırır.
/// </summary>
public sealed class StaticApiKeyAuthenticationHandler(
    IOptionsMonitor<StaticApiKeyAuthenticationOptions> options,
    ILoggerFactory loggerFactory,
    UrlEncoder encoder)
    : AuthenticationHandler<StaticApiKeyAuthenticationOptions>(options, loggerFactory, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(
                StaticApiKeyAuthenticationOptions.HeaderName, out var providedKey))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        string expectedKey = Options.ApiKey;
        if (string.IsNullOrEmpty(expectedKey))
        {
            Logger.LogError("StaticApiKey AuthenticationOptions.ApiKey yapılandırılmamış.");
            return Task.FromResult(AuthenticateResult.Fail("API key is not configured."));
        }

        byte[] providedBytes = Encoding.UTF8.GetBytes(providedKey.ToString());
        byte[] expectedBytes = Encoding.UTF8.GetBytes(expectedKey);

        if (providedBytes.Length != expectedBytes.Length ||
            !CryptographicOperations.FixedTimeEquals(providedBytes, expectedBytes))
        {
            return Task.FromResult(AuthenticateResult.Fail("Invalid API key."));
        }

        string clientId = string.IsNullOrWhiteSpace(Options.ClientId)
            ? "static-client"
            : Options.ClientId;

        Claim[] claims =
        [
            new Claim(ClaimTypes.Name, clientId),
            new Claim("client_id", clientId)
        ];
        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, Scheme.Name);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }

    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        Response.ContentType = "application/problem+json";

        var problemDetails = new ProblemDetails
        {
            Status = StatusCodes.Status401Unauthorized,
            Title = "Unauthorized",
            Detail = $"A valid API key is required. Send it in the {StaticApiKeyAuthenticationOptions.HeaderName} header.",
            Type = "https://tools.ietf.org/html/rfc9110#section-15.5.2"
        };

        await Results.Problem(problemDetails).ExecuteAsync(Context);
    }

    protected override async Task HandleForbiddenAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status403Forbidden;
        Response.ContentType = "application/problem+json";

        var problemDetails = new ProblemDetails
        {
            Status = StatusCodes.Status403Forbidden,
            Title = "Forbidden",
            Detail = "The API key is valid, but it does not have permission for this resource.",
            Type = "https://tools.ietf.org/html/rfc9110#section-15.5.4"
        };

        await Results.Problem(problemDetails).ExecuteAsync(Context);
    }
}
