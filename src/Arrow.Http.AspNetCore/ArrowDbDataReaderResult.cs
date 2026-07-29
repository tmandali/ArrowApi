using System.Data.Common;

namespace Arrow.Http.AspNetCore;

internal sealed class ArrowDbDataReaderResult : IResult
{
    private readonly DbDataReader _reader;
    private readonly ArrowConversionOptions? _options;
    private readonly bool _close;

    public ArrowDbDataReaderResult(DbDataReader reader, ArrowConversionOptions? options, bool close)
    {
        ArgumentNullException.ThrowIfNull(reader);
        _reader = reader;
        _options = options;
        _close = close;
    }

    public async Task ExecuteAsync(HttpContext httpContext)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        try
        {
            await using ArrowBatchReader batchReader = _reader.OpenArrowReader(_options);
            await batchReader.WriteBatchesAsync(
                httpContext.Response,
                leaveOpen: true,
                logger: null,
                httpContext.RequestAborted);
        }
        finally
        {
            if (_close)
            {
                if (_reader is IAsyncDisposable asyncDisposable)
                    await asyncDisposable.DisposeAsync();
                else
                    _reader.Dispose();
            }
        }
    }
}
