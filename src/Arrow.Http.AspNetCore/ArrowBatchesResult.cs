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
