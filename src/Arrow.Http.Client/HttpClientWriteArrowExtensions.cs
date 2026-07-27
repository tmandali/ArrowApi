using System.Data.Common;
using Apache.Arrow;
using Arrow.Data;

namespace Arrow.Http.Client;

/// <summary><see cref="HttpClient"/> için Arrow IPC yazma extension'ları.</summary>
/// <remarks>
/// Okuma: <see cref="HttpClientArrowExtensions.GetArrowReaderAsync"/> /
/// <see cref="HttpClientArrowExtensions.PostArrowReaderAsync"/>.
/// Tek seferde gönderim: <see cref="WriteArrowAsync"/>.
/// Döngü içinde batch batch gönderim: <see cref="HttpClientArrowExtensions.PostArrowWriterAsync"/> →
/// <see cref="ArrowBatchWriter.WriteBatchAsync"/>.
/// </remarks>
public static class HttpClientWriteArrowExtensions
{
    /// <summary>
    /// Arrow IPC gövdesi POST eder; yanıt gövdesi okunmaz (ingest).
    /// </summary>
    public static Task WriteArrowAsync(
        this HttpClient httpClient,
        string requestUri,
        ArrowBatchReader source,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(source);
        return httpClient.WriteArrowAsync(requestUri, source.ToArrowHttpContent(), cancellationToken);
    }

    /// <summary>
    /// Arrow IPC gövdesi POST eder; yanıt gövdesi okunmaz (ingest).
    /// </summary>
    public static Task WriteArrowAsync(
        this HttpClient httpClient,
        string requestUri,
        IAsyncEnumerable<RecordBatch> batches,
        Schema? schema = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(batches);
        return httpClient.WriteArrowAsync(requestUri, batches.ToArrowHttpContent(schema), cancellationToken);
    }

    /// <summary>
    /// Arrow IPC gövdesi POST eder; yanıt gövdesi okunmaz (ingest).
    /// </summary>
    public static Task WriteArrowAsync(
        this HttpClient httpClient,
        string requestUri,
        DbDataReader source,
        ArrowConversionOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(source);
        return httpClient.WriteArrowAsync(requestUri, source.ToArrowHttpContent(options), cancellationToken);
    }

    /// <summary>
    /// Arrow IPC gövdesi POST eder; yanıt gövdesi okunmaz (ingest).
    /// </summary>
    public static Task WriteArrowAsync(
        this HttpClient httpClient,
        string requestUri,
        Stream arrowIpcStream,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(arrowIpcStream);
        return httpClient.WriteArrowAsync(requestUri, arrowIpcStream.ToArrowHttpContent(), cancellationToken);
    }

    /// <summary>
    /// Arrow IPC gövdesi POST eder; yanıt gövdesi okunmaz (ingest).
    /// </summary>
    public static async Task WriteArrowAsync(
        this HttpClient httpClient,
        string requestUri,
        HttpContent content,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentException.ThrowIfNullOrEmpty(requestUri);
        ArgumentNullException.ThrowIfNull(content);

        using HttpResponseMessage response = await httpClient
            .PostAsync(requestUri, content, cancellationToken)
            .ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
    }
}
