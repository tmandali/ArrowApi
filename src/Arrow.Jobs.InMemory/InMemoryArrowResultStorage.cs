using Apache.Arrow;
using Apache.Arrow.Ipc;
using Arrow.Data;
using System.Collections.Concurrent;

namespace Arrow.Jobs.InMemory;

/// <summary>
/// Arrow Job sonuçlarını diske yazmadan tamamen bellek (RAM) üzerinde Arrow IPC biçiminde saklayan depolama katmanı.
/// </summary>
public sealed class InMemoryArrowResultStorage : IArrowJobResultStorage
{
    private readonly ConcurrentDictionary<string, byte[]> _store = new(StringComparer.OrdinalIgnoreCase);

    public string GetResultPath(Guid jobId, string? name = null, Guid? rootJobId = null) =>
        $"inmemory://jobs/{jobId:N}.arrow";

    public async Task WriteBatchesAsync(
        string resultPath,
        IAsyncEnumerable<RecordBatch> batches,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(resultPath);
        ArgumentNullException.ThrowIfNull(batches);

        using var memoryStream = new MemoryStream();
        ArrowStreamWriter? writer = null;

        await foreach (RecordBatch batch in batches.WithCancellation(cancellationToken).ConfigureAwait(false))
        {
            writer ??= new ArrowStreamWriter(memoryStream, batch.Schema, leaveOpen: true);
            await writer.WriteRecordBatchAsync(batch, cancellationToken).ConfigureAwait(false);
        }

        if (writer is not null)
        {
            await writer.WriteEndAsync(cancellationToken).ConfigureAwait(false);
            writer.Dispose();
            _store[resultPath] = memoryStream.ToArray();
        }
    }

    public Task<Result<ArrowBatchReader>> OpenBatchReaderAsync(
        string resultPath,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(resultPath) || !_store.TryGetValue(resultPath, out byte[]? bytes) || bytes.Length == 0)
        {
            return Task.FromResult(Result<ArrowBatchReader>.NotFound($"Bellek içi sonuç bulunamadı veya henüz oluşturulmadı: {resultPath}"));
        }

        var stream = new MemoryStream(bytes, writable: false);
        var reader = new ArrowStreamReader(stream);
        var arrowDataReader = new ArrowDataReader(reader);
        return Task.FromResult(Result<ArrowBatchReader>.Success(ArrowBatchReader.FromArrowReader(arrowDataReader)));
    }

    public Task DeleteResultAsync(string? resultPath, CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(resultPath))
        {
            _store.TryRemove(resultPath, out _);
        }
        return Task.CompletedTask;
    }
}
