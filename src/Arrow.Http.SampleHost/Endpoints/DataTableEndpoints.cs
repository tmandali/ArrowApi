using System.Data;
using System.Data.Common;
using Arrow.Data;
using Arrow.Http.AspNetCore;

namespace Arrow.Http.SampleHost.Endpoints;

public static class DataTableEndpoints
{
    public static IEndpointRouteBuilder MapDataTableEndpoints(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        endpoints.MapGet("/arrow", GetPeopleArrow).ProducesArrow();
        endpoints.MapGet("/arrow/db-source", GetPeopleArrowDataTableSource).AcceptsArrowDataTable().ProducesArrow();
        endpoints.MapGet("/arrow/batches", GetPeopleBatches);

        return endpoints;
    }

    /// <summary><see cref="ArrowResults.FromDataTable"/> — DataTable → Arrow IPC.</summary>
    private static IResult GetPeopleArrow() =>
        ArrowResults.FromDataTable(ArrowSamples.CreatePeopleTable());

    private static ArrowDataTableSource GetPeopleArrowDataTableSource() =>
        new(ArrowSamples.CreatePeopleTable());

    /// <summary>
    /// Manuel content negotiation: <c>Accept</c> Arrow ise <see cref="ArrowResults.FromDataTable"/>, aksi halde JSON özet.
    /// </summary>
    private static async Task<IResult> GetPeopleBatches(HttpRequest request, CancellationToken cancellationToken)
    {
        if (request.AcceptsArrowStream())
            return ArrowResults.FromDataTable(ArrowSamples.CreatePeopleTable());

        return await BuildPeopleBatchSummaryJsonAsync(cancellationToken);
    }

    private static async Task<IResult> BuildPeopleBatchSummaryJsonAsync(CancellationToken cancellationToken)
    {
        using DataTable table = ArrowSamples.CreatePeopleTable();
        await using DbDataReader dbReader = table.CreateDataReader();
        await using ArrowBatchReader reader = dbReader.OpenArrowReader();

        int batchCount = 0;
        int totalRows = 0;

        while (await reader.ReadNextBatchAsync(cancellationToken) is { } batch)
        {
            batchCount++;
            totalRows += batch.Length;
        }

        return Results.Ok(new
        {
            columns = reader.Schema.FieldsList.Select(f => new { f.Name, type = f.DataType.Name }),
            batchCount,
            totalRows
        });
    }
}
