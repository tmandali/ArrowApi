namespace Arrow.Http.AspNetCore;

/// <summary>Minimal API route builder Arrow extension'ları.</summary>
public static class ArrowRouteHandlerBuilderExtensions
{
    /// <summary>Endpoint'in Arrow IPC üretebileceğini belirtir (OpenAPI / metadata).</summary>
    public static RouteHandlerBuilder ProducesArrow(this RouteHandlerBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.Produces(StatusCodes.Status200OK, contentType: ArrowHttpExtensions.ArrowStreamMediaType);
        return builder;
    }

    /// <summary><see cref="ArrowDataTableSource"/> dönüşünü Arrow IPC'ye çeviren filter ekler.</summary>
    public static RouteHandlerBuilder AcceptsArrowDataTable(this RouteHandlerBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        return builder.AddEndpointFilter<ArrowResponseEndpointFilter>();
    }
}
