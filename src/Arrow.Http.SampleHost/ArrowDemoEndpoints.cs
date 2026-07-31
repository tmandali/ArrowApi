using Arrow.Http.AspNetCore;
using Arrow.Http.SampleHost.Endpoints;

namespace Arrow.Http.SampleHost;

internal static class ArrowDemoEndpoints
{
    public static IEndpointRouteBuilder MapArrowDemoEndpoints(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        endpoints.MapArrowEchoEndpoints();
        endpoints.MapDataTableEndpoints();
        endpoints.MapDbQueryEndpoints();
        endpoints.MapVariantEndpoints();
        endpoints.MapManualStreamEndpoints();
        endpoints.MapResultPatternEndpoints();

        return endpoints;
    }
}
