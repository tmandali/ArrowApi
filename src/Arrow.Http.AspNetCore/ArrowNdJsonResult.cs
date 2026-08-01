using Arrow.Data;
using Microsoft.AspNetCore.Http;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Arrow.Http.AspNetCore;

/// <summary>
/// <see cref="ArrowBatchReader"/> nesnesini <c>application/x-ndjson; charset=utf-8</c> akışı olarak HTTP yanıtına yazar.
/// </summary>
internal sealed class ArrowNdJsonResult(ArrowBatchReader reader, bool disposeReader = true) : IResult
{
    private static readonly byte[] NewlineBytes = "\n"u8.ToArray();
    private static readonly JsonSerializerOptions _jsonOptions = new JsonSerializerOptions
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    public async Task ExecuteAsync(HttpContext httpContext)
    {
        if (httpContext is null) throw new ArgumentNullException(nameof(httpContext));

        httpContext.Response.ContentType = "application/x-ndjson; charset=utf-8";

        try
        {
            using ArrowDataReader dbReader = reader.RequireArrowReader();
            while (await dbReader.ReadAsync(httpContext.RequestAborted).ConfigureAwait(false))
            {
                var row = new Dictionary<string, object?>(dbReader.FieldCount);
                for (int i = 0; i < dbReader.FieldCount; i++)
                {
                    row[dbReader.GetName(i)] = dbReader.IsDBNull(i) ? null : dbReader.GetValue(i);
                }

                await JsonSerializer.SerializeAsync(httpContext.Response.Body, row, _jsonOptions, httpContext.RequestAborted).ConfigureAwait(false);
                await httpContext.Response.Body.WriteAsync(NewlineBytes, httpContext.RequestAborted).ConfigureAwait(false);
            }

            await httpContext.Response.Body.FlushAsync(httpContext.RequestAborted).ConfigureAwait(false);
        }
        finally
        {
            if (disposeReader)
            {
                await reader.DisposeAsync().ConfigureAwait(false);
            }
        }
    }
}
