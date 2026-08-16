using Apache.Arrow;
using Apache.Arrow.Ipc;

namespace Arrow.Http.AspNetCore;

internal sealed class ArrowBatchesResult : IResult
{
    private readonly IAsyncEnumerable<RecordBatch> _batches;

    public ArrowBatchesResult(IAsyncEnumerable<RecordBatch> batches)
    {
        ArgumentNullException.ThrowIfNull(batches);
        _batches = batches;
    }

    public async Task ExecuteAsync(HttpContext httpContext)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        httpContext.Response.ContentType = ArrowHttpExtensions.ArrowStreamMediaType;
        httpContext.Response.Headers.CacheControl = "no-cache, no-transform";
        httpContext.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpResponseBodyFeature>()?.DisableBuffering();
        httpContext.Features.Get<Microsoft.AspNetCore.Server.Kestrel.Core.Features.IHttpMinResponseDataRateFeature>()?.MinDataRate = null;

        Stream outputStream = httpContext.Response.BodyWriter.AsStream(leaveOpen: true);
        CancellationToken cancellationToken = httpContext.RequestAborted;

        ArrowStreamWriter? writer = null;

        try
        {
            await foreach (RecordBatch batch in _batches.WithCancellation(cancellationToken))
            {
                writer ??= new ArrowStreamWriter(outputStream, batch.Schema, leaveOpen: true);
                await writer.WriteRecordBatchAsync(batch, cancellationToken);
            }

            if (writer is null)
                throw new InvalidOperationException("En az bir RecordBatch gerekli.");

            await writer.WriteEndAsync(cancellationToken);
        }
        finally
        {
            writer?.Dispose();
        }
    }
}
