using Apache.Arrow;
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

    private static async Task<IResult> GetArrowReport(
        StockAnalyticsRequest? request,
        IStockAnalyticsService service,
        CancellationToken cancellationToken)
    {
        try
        {
            var req = request ?? new StockAnalyticsRequest();
            int batchSize = req.BatchSize is > 0 ? req.BatchSize.Value : 12;
            IAsyncEnumerable<RecordBatch> batches = service.StreamBatchesAsync(req, batchSize, cancellationToken);
            return ArrowResults.FromBatches(batches);
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
    }
}
