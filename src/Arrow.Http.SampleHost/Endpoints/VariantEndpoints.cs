using System.Data;
using System.Data.Common;
using Apache.Arrow;
using Arrow.Data;
using Arrow.Http.AspNetCore;

namespace Arrow.Http.SampleHost.Endpoints;

public static class VariantEndpoints
{
    public static IEndpointRouteBuilder MapVariantEndpoints(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        endpoints.MapGet("/arrow/variant/manual", GetVariantManual).ProducesArrow();
        endpoints.MapGet("/arrow/variant/batches", GetVariantBatchSummaryAsync);
        endpoints.MapGet("/arrow/variant/staging", GetVariantStagingAsync);

        return endpoints;
    }

    private static IResult GetVariantManual(CancellationToken cancellationToken) =>
        ArrowResults.FromBatches(ArrowSamples.VariantManualBatchesAsync(cancellationToken));

    private static Task<IResult> GetVariantBatchSummaryAsync(CancellationToken cancellationToken)
    {
        using RecordBatch batch = VariantBatches.CreateSingleColumn(VariantBatches.SamplePayloads(), "event_data");
        VariantArray eventData = VariantBatches.GetVariantColumn(batch, "event_data");

        var rows = new List<object?>(batch.Length);
        for (int row = 0; row < batch.Length; row++)
            rows.Add(VariantBatches.ToJsonObject(eventData.GetVariantValue(row)));

        return Task.FromResult<IResult>(Results.Ok(new
        {
            extension = VariantBatches.ExtensionName,
            columns = batch.Schema.FieldsList.Select(f => new { f.Name, type = f.DataType.Name }),
            batchCount = 1,
            totalRows = batch.Length,
            rows
        }));
    }

    private static async Task<IResult> GetVariantStagingAsync(CancellationToken cancellationToken)
    {
        using RecordBatch source = VariantBatches.CreateSingleColumn(VariantBatches.SamplePayloads(), "event_data");
        VariantArray eventData = VariantBatches.GetVariantColumn(source, "event_data");

        var staging = new DataTable("staging");
        staging.Columns.Add("event_data", typeof(byte[]));
        for (int row = 0; row < source.Length; row++)
            staging.Rows.Add(VariantBinary.Pack(eventData, row));

        var exportOptions = new ArrowConversionOptions
        {
            VariantBinaryColumnNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "event_data" },
        };

        var rows = new List<object?>();
        await using DbDataReader dbReader = staging.CreateDataReader();
        await using ArrowBatchReader arrowReader = dbReader.OpenArrowReader(exportOptions);

        await foreach (RecordBatch batch in arrowReader.ReadBatchesAsync(cancellationToken))
        {
            VariantArray exported = VariantBatches.GetVariantColumn(batch, "event_data");
            for (int row = 0; row < batch.Length; row++)
                rows.Add(VariantBatches.ToJsonObject(exported.GetVariantValue(row)));
        }

        return Results.Ok(new
        {
            column = "event_data",
            stagingFormat = "ARPV varbinary",
            rowCount = rows.Count,
            rows
        });
    }
}
