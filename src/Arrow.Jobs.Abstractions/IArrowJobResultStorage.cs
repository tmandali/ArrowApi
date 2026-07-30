using Apache.Arrow;

namespace Arrow.Jobs;

/// <summary>Job sonuç verilerinin (Arrow IPC) saklandığı depolama katmanı arayüzü.</summary>
public interface IArrowJobResultStorage
{
    /// <summary>Job sonuç dosya/depo yolunu oluşturur.</summary>
    string GetResultPath(Guid jobId, string? name = null, Guid? rootJobId = null);

    /// <summary>Batch'leri Arrow IPC olarak yazar. Hiç batch yoksa dosya oluşturmaz.</summary>
    Task WriteBatchesAsync(
        string resultPath,
        IAsyncEnumerable<RecordBatch> batches,
        CancellationToken cancellationToken = default);

    /// <summary>Belirtilen yoldan RecordBatch akışını okur.</summary>
    IAsyncEnumerable<RecordBatch> ReadBatchesAsync(string resultPath, CancellationToken cancellationToken = default);

    /// <summary>Job sonuç dosyasını varsa siler.</summary>
    Task DeleteResultAsync(string? resultPath, CancellationToken cancellationToken = default);
}
