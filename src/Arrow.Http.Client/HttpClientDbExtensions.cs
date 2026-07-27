using System.Data.Common;
using Arrow.Data;

namespace Arrow.Http.Client;

/// <summary><see cref="HttpClient"/> için <see cref="DbDataReader"/> kısayol extension'ları.</summary>
public static class HttpClientDbExtensions
{
    /// <summary>
    /// Yerel <see cref="DbDataReader"/> verisini POST gövdesine akıtır.
    /// Özel gövde için <see cref="HttpContentArrowExtensions.ToArrowHttpContent(DbDataReader, ArrowConversionOptions?)"/> kullanın.
    /// </summary>
    public static Task<ArrowDataReader> PostDbDataReaderAsync(
        this HttpClient httpClient,
        string requestUri,
        DbDataReader source,
        ArrowConversionOptions? options = null,
        VariantDbRepresentation variantDbMode = VariantDbRepresentation.VariantValue,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentException.ThrowIfNullOrEmpty(requestUri);
        ArgumentNullException.ThrowIfNull(source);

        return httpClient.PostArrowDataReaderAsync(
            requestUri,
            source.ToArrowHttpContent(options),
            variantDbMode,
            cancellationToken);
    }
}
