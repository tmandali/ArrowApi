using Apache.Arrow;
using Arrow.Data;

namespace Arrow.Http.Client;

/// <summary><see cref="HttpClient"/> için Arrow IPC kısayol extension'ları.</summary>
/// <remarks>
/// Özel istek gövdeleri (JSON vb.) için <see cref="HttpClient.SendAsync(HttpRequestMessage, CancellationToken)"/> +
/// <see cref="HttpResponseArrowExtensions.ReadAsArrowDataReaderAsync(HttpResponseMessage, VariantDbRepresentation, CancellationToken)"/>.
/// Arrow gövde oluşturmak için <see cref="HttpContentArrowExtensions"/>.
/// Arrow göndermek için <see cref="HttpClientWriteArrowExtensions.WriteArrowAsync(HttpClient, string, ArrowBatchReader, CancellationToken)"/>.
/// </remarks>
public static class HttpClientArrowExtensions
{
    /// <summary>GET ile Arrow IPC stream açar ve <see cref="Result{T}"/> olarak döner.</summary>
    public static async Task<Result<ArrowBatchReader>> GetArrowReaderAsync(
        this HttpClient httpClient,
        string requestUri,
        VariantDbRepresentation variantDbMode = VariantDbRepresentation.VariantValue,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(httpClient);
        ThrowHelper.ThrowIfNullOrEmpty(requestUri);

        try
        {
            HttpResponseMessage response = await HttpClientArrowSend
                .SendAsync(httpClient, HttpMethod.Get, requestUri, content: null, cancellationToken)
                .ConfigureAwait(false);

            if (response.IsSuccessStatusCode)
            {
                ArrowBatchReader reader = await response.ReadAsArrowBatchReaderAsync(variantDbMode, cancellationToken).ConfigureAwait(false);
                return Result<ArrowBatchReader>.Success(reader);
            }

            return await response.ReadAsResultAsync<ArrowBatchReader>(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return Result<ArrowBatchReader>.Failure($"Arrow akışı açılırken hata oluştu: {ex.Message}", 500);
        }
    }

    /// <summary>GET ile Arrow IPC stream'i <see cref="ArrowDataReader"/> olarak açar.</summary>
    public static async Task<ArrowDataReader> GetDbDataReaderAsync(
        this HttpClient httpClient,
        string requestUri,
        VariantDbRepresentation variantDbMode = VariantDbRepresentation.VariantValue,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(httpClient);
        ThrowHelper.ThrowIfNullOrEmpty(requestUri);

        HttpResponseMessage response = await HttpClientArrowSend
            .SendAsync(httpClient, HttpMethod.Get, requestUri, content: null, cancellationToken)
            .ConfigureAwait(false);
        return await response.ReadAsArrowDataReaderAsync(variantDbMode, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// POST gövdesine batch batch Arrow IPC yazar (ingest). Dispose edilince istek tamamlanır.
    /// </summary>
    public static ArrowBatchWriter PostArrowWriterAsync(
        this HttpClient httpClient,
        string requestUri,
        Schema? emptySchema = null,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(httpClient);
        ThrowHelper.ThrowIfNullOrEmpty(requestUri);
        return new ArrowBatchWriter(httpClient, requestUri, emptySchema, cancellationToken);
    }

    /// <summary>POST ile Arrow IPC stream gönderir; yanıt columnar reader döner.</summary>
    public static Task<ArrowBatchReader> PostArrowReaderAsync(
        this HttpClient httpClient,
        string requestUri,
        Stream arrowRequestBody,
        VariantDbRepresentation variantDbMode = VariantDbRepresentation.VariantValue,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(arrowRequestBody);
        return httpClient.PostArrowReaderAsync(
            requestUri, arrowRequestBody.ToArrowHttpContent(), variantDbMode, cancellationToken);
    }

    /// <summary>POST ile Arrow batch reader gönderir; yanıt columnar reader döner.</summary>
    public static Task<ArrowBatchReader> PostArrowReaderAsync(
        this HttpClient httpClient,
        string requestUri,
        ArrowBatchReader source,
        VariantDbRepresentation variantDbMode = VariantDbRepresentation.VariantValue,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(source);
        return httpClient.PostArrowReaderAsync(
            requestUri, source.ToArrowHttpContent(), variantDbMode, cancellationToken);
    }

    /// <summary>POST ile Arrow batch reader gönderir; yanıt <see cref="ArrowDataReader"/> döner.</summary>
    public static Task<ArrowDataReader> PostArrowDataReaderAsync(
        this HttpClient httpClient,
        string requestUri,
        ArrowBatchReader source,
        VariantDbRepresentation variantDbMode = VariantDbRepresentation.VariantValue,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(source);
        return httpClient.PostArrowDataReaderAsync(
            requestUri, source.ToArrowHttpContent(), variantDbMode, cancellationToken);
    }

    /// <summary>POST ile özel <see cref="HttpContent"/> gönderir; yanıt columnar reader döner.</summary>
    public static async Task<ArrowBatchReader> PostArrowReaderAsync(
        this HttpClient httpClient,
        string requestUri,
        HttpContent content,
        VariantDbRepresentation variantDbMode = VariantDbRepresentation.VariantValue,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(httpClient);
        ThrowHelper.ThrowIfNullOrEmpty(requestUri);
        ThrowHelper.ThrowIfNull(content);

        HttpResponseMessage response = await HttpClientArrowSend
            .SendAsync(httpClient, HttpMethod.Post, requestUri, content, cancellationToken)
            .ConfigureAwait(false);
        return await response.ReadAsArrowBatchReaderAsync(variantDbMode, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>POST ile özel <see cref="HttpContent"/> gönderir; yanıt <see cref="ArrowDataReader"/> döner.</summary>
    public static async Task<ArrowDataReader> PostArrowDataReaderAsync(
        this HttpClient httpClient,
        string requestUri,
        HttpContent content,
        VariantDbRepresentation variantDbMode = VariantDbRepresentation.VariantValue,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(httpClient);
        ThrowHelper.ThrowIfNullOrEmpty(requestUri);
        ThrowHelper.ThrowIfNull(content);

        HttpResponseMessage response = await HttpClientArrowSend
            .SendAsync(httpClient, HttpMethod.Post, requestUri, content, cancellationToken)
            .ConfigureAwait(false);
        return await response.ReadAsArrowDataReaderAsync(variantDbMode, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Batch metadata JSON özeti.</summary>
    public static async Task<ArrowBatchSummary> GetArrowBatchSummaryAsync(
        this HttpClient httpClient,
        string requestUri,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(httpClient);
        ThrowHelper.ThrowIfNullOrEmpty(requestUri);

        using HttpResponseMessage response = await httpClient
            .GetAsync(requestUri, cancellationToken)
            .ConfigureAwait(false);
        return await response.ReadAsArrowBatchSummaryAsync(cancellationToken).ConfigureAwait(false);
    }
}

internal static class HttpClientArrowSend
{
    internal static Task<HttpResponseMessage> SendAsync(
        HttpClient httpClient,
        HttpMethod method,
        string requestUri,
        HttpContent? content,
        CancellationToken cancellationToken)
    {
        HttpRequestMessage request = new(method, requestUri) { Content = content };
        request.Headers.Accept.ParseAdd(ArrowMediaTypes.Stream);
        return httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
    }
}
