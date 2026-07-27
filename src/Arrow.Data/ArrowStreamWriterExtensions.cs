using Apache.Arrow;
using Apache.Arrow.Ipc;

namespace Arrow.Data;

/// <summary><see cref="ArrowStreamWriter"/> için Arrow IPC stream yazma extension'ları.</summary>
public static class ArrowStreamWriterExtensions
{
    /// <summary>Batch'leri yazar ve stream'i <c>WriteEnd</c> ile kapatır.</summary>
    public static async Task WriteBatchesAsync(
        this ArrowStreamWriter writer,
        IEnumerable<RecordBatch> batches,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(writer);
        ThrowHelper.ThrowIfNull(batches);

        bool wroteBatch = false;

        foreach (RecordBatch batch in batches)
        {
            ThrowHelper.ThrowIfNull(batch);
            await writer.WriteRecordBatchAsync(batch, cancellationToken).ConfigureAwait(false);
            wroteBatch = true;
        }

        if (!wroteBatch)
            await writer.WriteStartAsync(cancellationToken).ConfigureAwait(false);

        await writer.WriteEndAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Batch'leri yazar ve stream'i <c>WriteEnd</c> ile kapatır.</summary>
    public static async Task WriteBatchesAsync(
        this ArrowStreamWriter writer,
        IAsyncEnumerable<RecordBatch> batches,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(writer);
        ThrowHelper.ThrowIfNull(batches);

        bool wroteBatch = false;

        await foreach (RecordBatch batch in batches.WithCancellation(cancellationToken).ConfigureAwait(false))
        {
            ThrowHelper.ThrowIfNull(batch);
            await writer.WriteRecordBatchAsync(batch, cancellationToken).ConfigureAwait(false);
            wroteBatch = true;
        }

        if (!wroteBatch)
            await writer.WriteStartAsync(cancellationToken).ConfigureAwait(false);

        await writer.WriteEndAsync(cancellationToken).ConfigureAwait(false);
    }
}
