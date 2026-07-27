using System.Data;
using System.Data.Common;

namespace Arrow.Http.AspNetCore;

internal sealed class ArrowDataTableResult : IResult
{
    private readonly DataTable _table;
    private readonly ArrowConversionOptions? _options;

    public ArrowDataTableResult(DataTable table, ArrowConversionOptions? options)
    {
        ArgumentNullException.ThrowIfNull(table);
        _table = table;
        _options = options;
    }

    public async Task ExecuteAsync(HttpContext httpContext)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        try
        {
            await using DbDataReader dbReader = _table.CreateDataReader();
            await using ArrowBatchReader batchReader = dbReader.OpenArrowReader(_options);
            await batchReader.WriteBatchesAsync(
                httpContext.Response,
                leaveOpen: true,
                logger: null,
                httpContext.RequestAborted).ConfigureAwait(false);
        }
        finally
        {
            _table.Dispose();
        }
    }
}
