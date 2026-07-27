using System.Text.Json;

namespace Arrow.Http.Client;

internal static class JsonCompat
{
    public static JsonSerializerOptions Web { get; } = CreateWebOptions();

    private static JsonSerializerOptions CreateWebOptions()
    {
#if NET
        return new JsonSerializerOptions(JsonSerializerDefaults.Web);
#else
        return new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };
#endif
    }
}
