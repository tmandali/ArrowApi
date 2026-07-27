using System.Threading.Channels;
using Apache.Arrow;

namespace Arrow.Http.Client;

/// <summary>
/// Tek bir HTTP POST gövdesine batch batch Arrow IPC yazar.
/// Dispose edilince stream kapatılır ve istek tamamlanır.
/// </summary>
public sealed class ArrowBatchWriter : IAsyncDisposable
{
    private readonly ChannelWriter<ArrowPushBatchItem> _batchWriter;
    private readonly Task<HttpResponseMessage> _postTask;
    private bool _completed;

    internal ArrowBatchWriter(
        HttpClient httpClient,
        string requestUri,
        Schema? emptySchema,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentException.ThrowIfNullOrEmpty(requestUri);

        Channel<ArrowPushBatchItem> channel = Channel.CreateBounded<ArrowPushBatchItem>(
            new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.Wait });

        _batchWriter = channel.Writer;
        _postTask = httpClient.PostAsync(
            requestUri,
            new ArrowPushBatchesHttpContent(channel, emptySchema),
            cancellationToken);
    }

    /// <summary>
    /// Batch'i IPC stream'e yazar. Dönüşte batch serileştirilmiştir;
    /// sonraki <see cref="Arrow.Data.ArrowBatchReader.ReadNextBatchAsync"/> güvenle çağrılabilir.
    /// </summary>
    public async Task WriteBatchAsync(RecordBatch batch, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(batch);
        ObjectDisposedException.ThrowIf(_completed, this);

        TaskCompletionSource completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
        await _batchWriter.WriteAsync(new ArrowPushBatchItem(batch, completion), cancellationToken)
            .ConfigureAwait(false);
        await completion.Task.ConfigureAwait(false);
    }

    public async ValueTask DisposeAsync()
    {
        if (_completed)
            return;

        _completed = true;
        _batchWriter.Complete();

        using HttpResponseMessage response = await _postTask.ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
    }
}
