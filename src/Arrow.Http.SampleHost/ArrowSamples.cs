using Apache.Arrow;
using Apache.Arrow.Ipc;
using Apache.Arrow.Types;
using Arrow.Data;
using System.Data;
using System.Data.Common;
using System.IO.Pipelines;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace Arrow.Http.SampleHost;

internal static class ArrowSamples
{
    public static DataTable CreatePeopleTable()
    {
        var table = new DataTable("People");
        table.Columns.Add("Id", typeof(int));
        table.Columns.Add("Name", typeof(string));
        table.Rows.Add(1, "Ali");
        table.Rows.Add(2, "Ayşe");
        table.Rows.Add(3, "Veli");
        return table;
    }

    /// <summary>
    /// Demo SQL yürütme — gerçek DB yerine in-memory tablodan <see cref="DbDataReader"/> açar.
    /// Gerçek kodda: <c>return ArrowResults.FromDb(await cmd.ExecuteReaderAsync(CommandBehavior.CloseConnection, ct), options);</c>
    /// </summary>
    public static DbDataReader OpenDemoQueryReader(string query, IDictionary<string, object?> parameters)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(query);
        ArgumentNullException.ThrowIfNull(parameters);

        if (!query.Contains("People", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Sample host yalnızca People sorgularını destekler.");

        using DataTable source = CreatePeopleTable();
        DataTable result = source.Clone();

        int limit = GetIntParameter(parameters, "limit", source.Rows.Count);
        limit = Math.Clamp(limit, 0, source.Rows.Count);

        for (int i = 0; i < limit; i++)
            result.ImportRow(source.Rows[i]);

        return result.CreateDataReader();
    }

    public static ArrowConversionOptions? CreateConversionOptions(int? batchSize) =>
        batchSize is > 0 ? new ArrowConversionOptions { BatchSize = batchSize.Value } : null;

    private static int GetIntParameter(IDictionary<string, object?> parameters, string name, int defaultValue)
    {
        if (!parameters.TryGetValue(name, out object? value) || value is null)
            return defaultValue;

        return value switch
        {
            JsonElement json when json.ValueKind == JsonValueKind.Number => json.GetInt32(),
            int i => i,
            long l => (int)l,
            string s => int.Parse(s),
            _ => Convert.ToInt32(value)
        };
    }

    public static Schema PeopleSchema { get; } = new(
        [
            new Field("Id", Int32Type.Default, nullable: false),
            new Field("Name", StringType.Default, nullable: true),
        ],
        []);

    public static RecordBatch CreatePeopleBatch(Schema schema, params (int Id, string Name)[] rows)
    {
        var idBuilder = new Int32Array.Builder();
        var nameBuilder = new StringArray.Builder();

        foreach ((int id, string name) in rows)
        {
            idBuilder.Append(id);
            nameBuilder.Append(name);
        }

        return new RecordBatch(schema, [idBuilder.Build(), nameBuilder.Build()], rows.Length);
    }

    public static async IAsyncEnumerable<RecordBatch> ManualPeopleBatchesAsync(
          [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        Schema schema = PeopleSchema;
        RecordBatch batch1 = CreatePeopleBatch(schema, (1, "Ali"), (2, "Ayşe"));
        try
        {
            yield return batch1;
            RecordBatch batch2 = CreatePeopleBatch(schema, (3, "Veli"));
            try
            {
                yield return batch2;
            }
            finally
            {
                batch2.Dispose();
            }
        }
        finally
        {
            batch1.Dispose();
        }

        await Task.CompletedTask;
    }

    public static async IAsyncEnumerable<RecordBatch> VariantManualBatchesAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        RecordBatch batch = VariantBatches.CreateSingleColumn(VariantBatches.SamplePayloads(), "event_data");
        try
        {
            yield return batch;
        }
        finally
        {
            batch.Dispose();
        }

        await Task.CompletedTask;
    }

    /// <summary>
    /// <see cref="ArrowResults.FromReader"/> örneği — batch'ler Pipe üzerinden IPC stream'e akar.
    /// </summary>
    public static ArrowBatchReader OpenManualPeoplePipeReader(CancellationToken cancellationToken = default)
    {
        var pipe = new Pipe();
        _ = WriteManualPeopleBatchesToPipeAsync(pipe.Writer, cancellationToken);
        return ArrowData.OpenArrowReader(pipe.Reader.AsStream(leaveOpen: false), leaveOpen: false);
    }

    private static async Task WriteManualPeopleBatchesToPipeAsync(
        PipeWriter pipeWriter,
        CancellationToken cancellationToken)
    {
        Stream stream = pipeWriter.AsStream(leaveOpen: true);
        ArrowStreamWriter? writer = null;

        try
        {
            await foreach (RecordBatch batch in ManualPeopleBatchesAsync(cancellationToken)
                               .WithCancellation(cancellationToken)
                               )
            {
                writer ??= new ArrowStreamWriter(stream, batch.Schema, leaveOpen: true);
                await writer.WriteRecordBatchAsync(batch, cancellationToken);
            }

            if (writer is null)
                throw new InvalidOperationException("En az bir RecordBatch gerekli.");

            await writer.WriteEndAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            await pipeWriter.CompleteAsync(ex);
            return;
        }
        finally
        {
            writer?.Dispose();
        }

        await pipeWriter.CompleteAsync();
    }
}
