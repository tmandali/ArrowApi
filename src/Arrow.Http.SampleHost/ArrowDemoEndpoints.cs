using Apache.Arrow;
using Arrow.Data;
using Arrow.Http.AspNetCore;
using Arrow.Jobs;
using System.Data;
using System.Data.Common;

namespace Arrow.Http.SampleHost;

internal static class ArrowDemoEndpoints
{
    public static IEndpointRouteBuilder MapArrowDemoEndpoints(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        endpoints.MapArrowEchoEndpoints();

        endpoints.MapGet("/arrow", GetPeopleArrow).ProducesArrow();
        endpoints.MapGet("/arrow/db-source", GetPeopleArrowDataTableSource).AcceptsArrowDataTable().ProducesArrow();
        endpoints.MapGet("/arrow/batches", GetPeopleBatches);
        endpoints.MapGet("/arrow/manual", GetManualBatches).ProducesArrow();
        endpoints.MapGet("/arrow/from-reader", GetManualFromReader).ProducesArrow();
        endpoints.MapGet("/arrow/from-db", GetPeopleFromDbClose).ProducesArrow();
        endpoints.MapGet("/arrow/from-db-await", GetPeopleFromDbAwait).ProducesArrow();
        endpoints.MapGet("/arrow/variant/manual", GetVariantManual).ProducesArrow();
        endpoints.MapGet("/arrow/variant/batches", GetVariantBatchSummaryAsync);
        endpoints.MapGet("/arrow/variant/staging", GetVariantStagingAsync);
        endpoints.MapPost("/arrow/query", PostQueryAsync)
            .Accepts<ArrowQueryRequest>("application/json")
            .ProducesArrow();

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

    /// <summary><see cref="ArrowResults.FromBatches"/> — batch akışı → Arrow IPC.</summary>
    private static IResult GetManualBatches(CancellationToken cancellationToken) =>
        ArrowResults.FromBatches(ArrowSamples.ManualPeopleBatchesAsync(cancellationToken));

    /// <summary><see cref="ArrowResults.FromReader"/> — Pipe üzerinden IPC stream okur.</summary>
    private static IResult GetManualFromReader(CancellationToken cancellationToken) =>
        ArrowResults.FromReader(ArrowSamples.OpenManualPeoplePipeReader(cancellationToken));

    /// <summary>
    /// <see cref="ArrowResults.FromDb"/> — <c>close: true</c> (varsayılan); reader üzerinde <c>using</c> kullanmayın.
    /// Gerçek kodda: <c>DbDataReader reader = await cmd.ExecuteReaderAsync(ct); return ArrowResults.FromDb(reader);</c>
    /// </summary>
    private static IResult GetPeopleFromDbClose()
    {
        DataTable table = ArrowSamples.CreatePeopleTable();
        return ArrowResults.FromDb(table.CreateDataReader(), close: true);
    }

    /// <summary>
    /// <see cref="ArrowHttpExtensions.WriteArrowFromDbAsync"/> — <c>await using</c> + <c>close: false</c>.
    /// Gerçek kodda: <c>await using var reader = await cmd.ExecuteReaderAsync(ct);</c>
    /// </summary>
    private static async Task GetPeopleFromDbAwait(HttpResponse response, CancellationToken cancellationToken)
    {
        using DataTable table = ArrowSamples.CreatePeopleTable();
        await using DbDataReader reader = table.CreateDataReader();
        await response.WriteArrowFromDbAsync(reader, close: false);
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

    /// <summary>
    /// Parametreli sorgu → Arrow IPC (<see cref="ArrowResults.FromDb"/> + <see cref="ArrowConversionOptions.BatchSize"/>).
    /// </summary>
    private static IResult PostQueryAsync(ArrowQueryRequest request)
    {
        DbDataReader reader = ArrowSamples.OpenDemoQueryReader(request.Query, request.Parameters);
        ArrowConversionOptions? options = ArrowSamples.CreateConversionOptions(request.BatchSize);
        return ArrowResults.FromDb(reader, options, close: true);
    }
}
