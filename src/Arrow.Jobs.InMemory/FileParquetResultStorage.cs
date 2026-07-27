using System.Runtime.CompilerServices;
using Apache.Arrow;
using Apache.Arrow.Types;
using Parquet;
using Parquet.Serialization;
using ArrowField = Apache.Arrow.Field;
using ArrowSchema = Apache.Arrow.Schema;

namespace Arrow.Jobs.InMemory;

public sealed class FileParquetResultStorage : IArrowJobResultStorage
{
    private readonly string _workDirectory;

    public FileParquetResultStorage(
        Microsoft.Extensions.Hosting.IHostEnvironment environment,
        string directoryPath = ArrowJobsStorageExtensions.DefaultFileStorePath)
    {
        ArgumentNullException.ThrowIfNull(environment);
        _workDirectory = ArrowJobFileStorePaths.Resolve(environment, directoryPath);
        Directory.CreateDirectory(_workDirectory);
    }

    public string GetResultPath(Guid jobId) => Path.Combine(_workDirectory, $"{jobId:N}.parquet");

    public async Task WriteDbReaderAsync(
        System.Data.Common.DbDataReader reader,
        string resultPath,
        Arrow.Data.ArrowConversionOptions? options,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(resultPath);
        ArgumentNullException.ThrowIfNull(reader);

        var rows = new List<PersonParquetRow>();
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            rows.Add(new PersonParquetRow
            {
                Id = reader.GetInt32(reader.GetOrdinal("Id")),
                Name = reader.IsDBNull(reader.GetOrdinal("Name"))
                    ? null
                    : reader.GetString(reader.GetOrdinal("Name"))
            });
        }

        await using FileStream stream = File.Create(resultPath);
        await ParquetSerializer.SerializeAsync(rows, stream, cancellationToken: cancellationToken).ConfigureAwait(false);
    }

    public async IAsyncEnumerable<RecordBatch> ReadBatchesAsync(
        string resultPath,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(resultPath);

        await using FileStream stream = File.OpenRead(resultPath);
        DeserializationResult<PersonParquetRow> result = await ParquetSerializer
            .DeserializeAsync<PersonParquetRow>(stream, cancellationToken: cancellationToken)
            .ConfigureAwait(false);

        IList<PersonParquetRow> rows = result.Data;
        if (rows.Count == 0)
            yield break;

        ArrowSchema schema = new(
        [
            new ArrowField("Id", Int32Type.Default, nullable: false),
            new ArrowField("Name", StringType.Default, nullable: true),
        ],
        []);

        var idBuilder = new Int32Array.Builder();
        var nameBuilder = new StringArray.Builder();

        foreach (PersonParquetRow row in rows)
        {
            idBuilder.Append(row.Id);
            nameBuilder.Append(row.Name);
        }

        yield return new RecordBatch(
            schema,
            [idBuilder.Build(), nameBuilder.Build()],
            rows.Count);
    }

    private sealed class PersonParquetRow
    {
        public int Id { get; set; }
        public string? Name { get; set; }
    }
}
