namespace Arrow.Http.AspNetCore;

/// <summary>Arrow IPC echo endpoint'leri.</summary>
public static class ArrowEndpointRouteBuilderExtensions
{
    /// <summary>
    /// Arrow IPC echo route'larını ekler: <c>POST {prefix}</c>, <c>POST {prefix}/variant</c>.
    /// İstek gövdesi Arrow stream → aynı batch'ler yanıtta döner.
    /// </summary>
    public static IEndpointRouteBuilder MapArrowEchoEndpoints(
        this IEndpointRouteBuilder endpoints,
        string prefix = "/arrow")
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        endpoints.MapPost(prefix, EchoArrowAsync);
        endpoints.MapPost($"{prefix}/variant", EchoArrowAsync);
        return endpoints;
    }

    private static async Task EchoArrowAsync(HttpRequest request, HttpResponse response, CancellationToken cancellationToken)
    {
        await using ArrowBatchReader reader = request.OpenArrowReader(leaveOpen: true);
        await reader.WriteBatchesAsync(response, leaveOpen: true, cancellationToken: cancellationToken);
    }
}
