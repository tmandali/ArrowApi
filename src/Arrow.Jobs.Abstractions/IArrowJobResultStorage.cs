using Apache.Arrow;

namespace Arrow.Jobs;

public interface IArrowJobResultStorage
{
    string GetResultPath(Guid jobId);

    /// <summary>Batch'leri Arrow IPC olarak yazar. Hiç batch yoksa dosya oluşturmaz.</summary>
    Task WriteBatchesAsync(
        string resultPath,
        IAsyncEnumerable<RecordBatch> batches,
        CancellationToken cancellationToken = default);

    IAsyncEnumerable<RecordBatch> ReadBatchesAsync(string resultPath, CancellationToken cancellationToken = default);

    /// <summary>Job sonuç dosyasını varsa siler.</summary>
    Task DeleteResultAsync(Guid jobId, CancellationToken cancellationToken = default);
}
