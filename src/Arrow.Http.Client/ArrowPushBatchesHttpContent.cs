using System.Net;
using System.Net.Http.Headers;
using System.Threading.Channels;
using Apache.Arrow;
using Apache.Arrow.Ipc;
using Arrow.Data;

namespace Arrow.Http.Client;

internal readonly record struct ArrowPushBatchItem(RecordBatch Batch, TaskCompletionSource Completion);

/// <summary>
/// Channel üzerinden gelen batch'leri HTTP gövdesine Arrow IPC olarak yazar.
/// Her batch IPC'ye yazıldıktan sonra tamamlanma sinyali verilir.
/// </summary>
internal sealed class ArrowPushBatchesHttpContent : HttpContent
{
    private readonly ChannelReader<ArrowPushBatchItem> _batchReader;
    private readonly Schema? _emptySchema;

    public ArrowPushBatchesHttpContent(Channel<ArrowPushBatchItem> channel, Schema? emptySchema)
    {
        ArgumentNullException.ThrowIfNull(channel);
        _batchReader = channel.Reader;
        _emptySchema = emptySchema;
        Headers.ContentType = new MediaTypeHeaderValue(ArrowMediaTypes.Stream);
    }

    protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context) =>
        SerializeBatchesAsync(stream, CancellationToken.None);

    private async Task SerializeBatchesAsync(Stream stream, CancellationToken cancellationToken)
    {
        if (!await _batchReader.WaitToReadAsync(cancellationToken).ConfigureAwait(false))
        {
            await WriteEmptyStreamAsync(stream, cancellationToken).ConfigureAwait(false);
            return;
        }

        if (!_batchReader.TryRead(out ArrowPushBatchItem first))
        {
            await WriteEmptyStreamAsync(stream, cancellationToken).ConfigureAwait(false);
            return;
        }

        using ArrowStreamWriter writer = new(stream, first.Batch.Schema, leaveOpen: true);
        await WriteAndCompleteAsync(writer, first, cancellationToken).ConfigureAwait(false);

        while (await _batchReader.WaitToReadAsync(cancellationToken).ConfigureAwait(false))
        {
            while (_batchReader.TryRead(out ArrowPushBatchItem item))
                await WriteAndCompleteAsync(writer, item, cancellationToken).ConfigureAwait(false);
        }

        await writer.WriteEndAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task WriteAndCompleteAsync(
        ArrowStreamWriter writer,
        ArrowPushBatchItem item,
        CancellationToken cancellationToken)
    {
        try
        {
            await writer.WriteRecordBatchAsync(item.Batch, cancellationToken).ConfigureAwait(false);
            item.Completion.TrySetResult();
        }
        catch (Exception ex)
        {
            item.Completion.TrySetException(ex);
            throw;
        }
    }

    private async Task WriteEmptyStreamAsync(Stream stream, CancellationToken cancellationToken)
    {
        if (_emptySchema is null)
        {
            throw new InvalidOperationException(
                "Hiç batch yazılmadı. Boş gönderim için şema belirtin.");
        }

        using ArrowStreamWriter writer = new(stream, _emptySchema, leaveOpen: true);
        await writer.WriteBatchesAsync(Enumerable.Empty<RecordBatch>(), cancellationToken).ConfigureAwait(false);
    }

    protected override bool TryComputeLength(out long length)
    {
        length = 0;
        return false;
    }
}
