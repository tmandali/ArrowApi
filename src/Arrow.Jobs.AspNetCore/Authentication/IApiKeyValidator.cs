namespace Arrow.Jobs.AspNetCore.Authentication;

public interface IApiKeyValidator
{
    Task<ApiKeyValidationResult> ValidateAsync(string plaintextKey, CancellationToken ct);
}