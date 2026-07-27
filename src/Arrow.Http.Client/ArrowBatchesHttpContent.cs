using System.Net;
using System.Net.Http.Headers;
using Apache.Arrow;
using Apache.Arrow.Ipc;
using Arrow.Data;

namespace Arrow.Http.Client;

/// <summary>
/// Batch akışını HTTP gövdesine Arrow IPC olarak yazar.
/// Şema ilk batch'ten alınır; batch yoksa ctor'da verilen şema kullanılır.
/// </summary>
internal sealed class ArrowBatchesHttpContent : HttpContent
{
    private readonly IAsyncEnumerable<RecordBatch> _batches;
    private readonly Schema? _schema;

    public ArrowBatchesHttpContent(IAsyncEnumerable<RecordBatch> batches, Schema? schema)
    {
        ArgumentNullException.ThrowIfNull(batches);
        _batches = batches;
        _schema = schema;
        Headers.ContentType = new MediaTypeHeaderValue(ArrowMediaTypes.Stream);
    }

    protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context) =>
        SerializeBatchesAsync(stream, CancellationToken.None);

    private async Task SerializeBatchesAsync(Stream stream, CancellationToken cancellationToken)
    {
        await using IAsyncEnumerator<RecordBatch> enumerator =
            _batches.GetAsyncEnumerator(cancellationToken);

        if (!await enumerator.MoveNextAsync().ConfigureAwait(false))
        {
            if (_schema is null)
            {
                throw new InvalidOperationException(
                    "Batch akışı boş. Şema belirtin veya en az bir RecordBatch sağlayın.");
            }

            using ArrowStreamWriter emptyWriter = new(stream, _schema, leaveOpen: true);
            await emptyWriter.WriteBatchesAsync(Enumerable.Empty<RecordBatch>(), cancellationToken)
                .ConfigureAwait(false);
            return;
        }

        RecordBatch first = enumerator.Current;
        using ArrowStreamWriter writer = new(stream, first.Schema, leaveOpen: true);
        await writer.WriteRecordBatchAsync(first, cancellationToken).ConfigureAwait(false);

        while (await enumerator.MoveNextAsync().ConfigureAwait(false))
        {
            RecordBatch batch = enumerator.Current;
            await writer.WriteRecordBatchAsync(batch, cancellationToken).ConfigureAwait(false);
        }

        await writer.WriteEndAsync(cancellationToken).ConfigureAwait(false);
    }

    protected override bool TryComputeLength(out long length)
    {
        length = 0;
        return false;
    }
}
