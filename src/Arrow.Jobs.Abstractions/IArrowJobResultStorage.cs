using Apache.Arrow;
using Arrow.Data;
using System.Data.Common;

namespace Arrow.Jobs;

public interface IArrowJobResultStorage
{
    string GetResultPath(Guid jobId);
    Task WriteDbReaderAsync(
        DbDataReader reader,
        string resultPath,
        ArrowConversionOptions? options,
        CancellationToken cancellationToken = default);
    IAsyncEnumerable<RecordBatch> ReadBatchesAsync(string resultPath, CancellationToken cancellationToken = default);
}
