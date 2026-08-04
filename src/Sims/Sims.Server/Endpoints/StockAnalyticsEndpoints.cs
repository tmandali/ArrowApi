using System.Data;
using Arrow.Http.AspNetCore;
using Sims.Server.Models.StockAnalytics;
using Sims.Server.Services;

namespace Sims.Server.Endpoints;

/// <summary>
/// Stock Analytics senkron Arrow IPC endpoint'i (hızlı deneme).
/// Asıl akış: POST /api/arrow/jobs/stock-analytics + SSE /events + Accept Arrow IPC.
/// </summary>
public static class StockAnalyticsEndpoints
{
    public static IEndpointRouteBuilder MapStockAnalyticsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        endpoints.MapPost("/api/stock/analytics/arrow", GetArrowReport)
            .ProducesArrow()
            .WithTags("Stock Analytics");

        return endpoints;
    }

    private static IResult GetArrowReport(
        StockAnalyticsRequest? request,
        IStockAnalyticsService service)
    {
        try
        {
            DataTable table = service.BuildArrowTable(request ?? new StockAnalyticsRequest());
            return ArrowResults.FromDataTable(table);
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
    }
}
