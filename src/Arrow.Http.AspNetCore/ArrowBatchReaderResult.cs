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
            await _reader.WriteBatchesAsync(
                httpContext.Response,
                leaveOpen: true,
                logger: null,
                httpContext.RequestAborted).ConfigureAwait(false);
        }
        finally
        {
            if (_disposeReader)
                await _reader.DisposeAsync().ConfigureAwait(false);
        }
    }
}
