using Apache.Arrow.Ipc;
using Arrow.Data;
using System.Net.Http.Json;

namespace Arrow.Http.Client;

/// <summary>Arrow IPC HTTP yanıt okuma extension'ları.</summary>
public static class HttpResponseArrowExtensions
{
    /// <summary>
    /// Yanıt gövdesini <see cref="ArrowDataReader"/> olarak açar.
    /// <see cref="HttpResponseMessage"/> yaşam süresi reader dispose edilene kadar reader'a devredilir — ayrıca dispose etmeyin.
    /// </summary>
    public static async Task<ArrowDataReader> ReadAsArrowDataReaderAsync(
        this HttpResponseMessage response,
        VariantDbRepresentation variantDbMode = VariantDbRepresentation.VariantValue,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(response);
        response.EnsureSuccessStatusCode();

        Stream body = await HttpContentCompat.ReadAsStreamAsync(response.Content, cancellationToken).ConfigureAwait(false);
        Stream leased = new HttpResponseLeaseStream(response, body);
        return new ArrowDataReader(new ArrowStreamReader(leased), ownsReader: true, variantDbMode);
    }

    /// <summary>Yanıt gövdesini columnar <see cref="ArrowBatchReader"/> olarak açar.</summary>
    public static async Task<ArrowBatchReader> ReadAsArrowBatchReaderAsync(
        this HttpResponseMessage response,
        VariantDbRepresentation variantDbMode = VariantDbRepresentation.VariantValue,
        CancellationToken cancellationToken = default)
    {
        ArrowDataReader dataReader = await response
            .ReadAsArrowDataReaderAsync(variantDbMode, cancellationToken)
            .ConfigureAwait(false);
        return ArrowBatchReader.FromArrowReader(dataReader);
    }

    /// <summary>JSON batch metadata yanıtını okur (ör. <c>/arrow/batches</c>).</summary>
    public static async Task<ArrowBatchSummary> ReadAsArrowBatchSummaryAsync(
        this HttpResponseMessage response,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(response);
        response.EnsureSuccessStatusCode();
        return await response.Content
            .ReadFromJsonAsync<ArrowBatchSummary>(cancellationToken: cancellationToken)
            .ConfigureAwait(false)
            ?? throw new InvalidOperationException("Boş JSON yanıtı.");
    }
}

/// <summary>JSON batch özet yanıtı.</summary>
public sealed record ArrowBatchSummary(
    IReadOnlyList<ArrowColumnSummary> Columns,
    int BatchCount,
    int TotalRows);

public sealed record ArrowColumnSummary(string Name, string Type);
