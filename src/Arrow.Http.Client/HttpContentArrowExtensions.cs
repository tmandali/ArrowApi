using Apache.Arrow;
using Arrow.Data;
using System.Data.Common;
using System.Net.Http.Headers;

namespace Arrow.Http.Client;

/// <summary>Arrow IPC istek gövdesi oluşturma extension'ları.</summary>
public static class HttpContentArrowExtensions
{
    /// <summary>Hazır Arrow IPC byte stream'inden istek gövdesi oluşturur.</summary>
    public static HttpContent ToArrowHttpContent(this Stream arrowIpcStream)
    {
        ThrowHelper.ThrowIfNull(arrowIpcStream);
        StreamContent content = new(arrowIpcStream);
        content.Headers.ContentType = new MediaTypeHeaderValue(ArrowMediaTypes.Stream);
        return content;
    }

    /// <summary>
    /// Batch akışından Arrow IPC istek gövdesi oluşturur.
    /// Şema ilk batch'ten alınır; batch yoksa <paramref name="schema"/> gerekir.
    /// </summary>
    public static HttpContent ToArrowHttpContent(
        this IAsyncEnumerable<RecordBatch> batches,
        Schema? schema = null)
    {
        ThrowHelper.ThrowIfNull(batches);
        return new ArrowBatchesHttpContent(batches, schema);
    }

    /// <summary>Batch reader'dan akışlı Arrow IPC istek gövdesi oluşturur.</summary>
    public static HttpContent ToArrowHttpContent(this ArrowBatchReader source)
    {
        ThrowHelper.ThrowIfNull(source);
        return new ArrowStreamHttpContent(source);
    }

    /// <summary><see cref="DbDataReader"/> verisinden akışlı Arrow IPC istek gövdesi oluşturur.</summary>
    public static HttpContent ToArrowHttpContent(
        this DbDataReader source,
        ArrowConversionOptions? options = null)
    {
        ThrowHelper.ThrowIfNull(source);
        return source.OpenArrowReader(options).ToArrowHttpContent();
    }
}
