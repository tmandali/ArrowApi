using Apache.Arrow;
using Apache.Arrow.Ipc;

namespace Arrow.Http.AspNetCore;

internal sealed class ArrowBatchReaderResult : IResult
{
    private readonly ArrowBatchReader _reader;
    private readonly bool _disposeReader;

    public ArrowBatchReaderResult(ArrowBatchReader reader, bool disposeReader)
    {
        ArgumentNullException.ThrowIfNull(reader);
        _reader = reader;
        _disposeReader = disposeReader;
    }

    public async Task ExecuteAsync(HttpContext httpContext)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        try
        {
            httpContext.Response.ContentType = ArrowHttpExtensions.ArrowStreamMediaType;
            httpContext.Response.Headers.CacheControl = "no-cache, no-transform";
            httpContext.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpResponseBodyFeature>()?.DisableBuffering();
            httpContext.Features.Get<Microsoft.AspNetCore.Server.Kestrel.Core.Features.IHttpMinResponseDataRateFeature>()?.MinDataRate = null;

            Stream outputStream = httpContext.Response.BodyWriter.AsStream(leaveOpen: true);
            CancellationToken cancellationToken = httpContext.RequestAborted;

            ArrowStreamWriter? writer = null;
            await foreach (RecordBatch batch in _reader.ReadBatchesAsync(cancellationToken))
            {
                writer ??= new ArrowStreamWriter(outputStream, batch.Schema, leaveOpen: true);
                await writer.WriteRecordBatchAsync(batch, cancellationToken);
                // Kademeli teslimat: her batch sonrası Kestrel pipe'ını boşalt,
                // böylece client batch'leri biriktirmeden okur.
                await outputStream.FlushAsync(cancellationToken);
            }

            if (writer is null)
            {
                // Boş sonuç: şemalı, 0 batch'lik geçerli bir stream yazılır.
                using ArrowStreamWriter emptyWriter = new(outputStream, _reader.Schema, leaveOpen: true);
                await emptyWriter.WriteStartAsync(cancellationToken);
                await emptyWriter.WriteEndAsync(cancellationToken);
                return;
            }

            await writer.WriteEndAsync(cancellationToken);
            await outputStream.FlushAsync(cancellationToken);
        }
        finally
        {
            if (_disposeReader)
                await _reader.DisposeAsync();
        }
    }
}
