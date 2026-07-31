using System.Data.Common;

namespace Arrow.Http.AspNetCore;

/// <summary>ASP.NET Core HTTP için Arrow extension'ları.</summary>
public static class ArrowHttpExtensions
{
    public const string ArrowStreamMediaType = ArrowMediaTypes.Stream;

    /// <summary>İstek <c>Accept</c> başlığında Arrow IPC stream istiyor mu?</summary>
    public static bool AcceptsArrowStream(this HttpRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!request.Headers.TryGetValue("Accept", out var values))
            return false;

        foreach (string? value in values)
        {
            if (string.IsNullOrEmpty(value))
                continue;

            if (value.Contains(ArrowStreamMediaType, StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }

    /// <summary>İstek gövdesinden Arrow batch reader açar.</summary>
    public static ArrowBatchReader OpenArrowReader(this HttpRequest request, bool leaveOpen = true)
    {
        ArgumentNullException.ThrowIfNull(request);
        return ArrowData.OpenArrowReader(request.BodyReader.AsStream(leaveOpen), leaveOpen);
    }

    /// <summary>Batch'leri HTTP yanıt gövdesine Arrow IPC stream olarak yazar.</summary>
    public static Task WriteBatchesAsync(
        this ArrowBatchReader reader,
        HttpResponse response,
        bool leaveOpen = true,
        ILogger? logger = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(reader);
        ArgumentNullException.ThrowIfNull(response);

        response.ContentType = ArrowStreamMediaType;
        return reader.WriteBatchesAsync(response.BodyWriter.AsStream(leaveOpen), leaveOpen, logger, cancellationToken);
    }

    /// <summary>
    /// <see cref="DbDataReader"/> verisini Arrow IPC yanıtına yazar.
    /// </summary>
    /// <param name="response">HTTP yanıtı.</param>
    /// <param name="reader">Okunacak veri okuyucu.</param>
    /// <param name="options">Dönüştürme seçenekleri.</param>
    /// <param name="close">
    /// <see langword="true"/> (varsayılan) — yazım sonrası reader dispose edilir.
    /// <see langword="false"/> — çağıran <c>await using</c> ile yönetir.
    /// </param>
    public static Task WriteArrowFromDbAsync(
        this HttpResponse response,
        DbDataReader reader,
        ArrowConversionOptions? options = null,
        bool close = true) =>
        ArrowResults.FromDb(response, reader, options, close);
}
