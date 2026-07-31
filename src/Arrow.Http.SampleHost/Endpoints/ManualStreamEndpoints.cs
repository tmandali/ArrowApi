using Arrow.Http.AspNetCore;

namespace Arrow.Http.SampleHost.Endpoints;

public static class ManualStreamEndpoints
{
    public static IEndpointRouteBuilder MapManualStreamEndpoints(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        endpoints.MapGet("/arrow/manual", GetManualBatches).ProducesArrow();
        endpoints.MapGet("/arrow/from-reader", GetManualFromReader).ProducesArrow();

        return endpoints;
    }

    /// <summary><see cref="ArrowResults.FromBatches"/> — batch akışı → Arrow IPC.</summary>
    private static IResult GetManualBatches(CancellationToken cancellationToken) =>
        ArrowResults.FromBatches(ArrowSamples.ManualPeopleBatchesAsync(cancellationToken));

    /// <summary><see cref="ArrowResults.FromReader"/> — Pipe üzerinden IPC stream okur.</summary>
    private static IResult GetManualFromReader(CancellationToken cancellationToken) =>
        ArrowResults.FromReader(ArrowSamples.OpenManualPeoplePipeReader(cancellationToken));
}
