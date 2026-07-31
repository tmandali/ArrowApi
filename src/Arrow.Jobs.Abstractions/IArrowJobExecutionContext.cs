using Apache.Arrow;
using Arrow.Data;

namespace Arrow.Jobs;

/// <summary>Worker için job kimliği, canlı ilerleme ve alt job zincirleme bağlamı.</summary>
public interface IArrowJobExecutionContext
{
    Guid JobId { get; }

    /// <summary><c>info</c> event — job state değildir; yalnızca worker mesajı.</summary>
    ValueTask PublishInfoAsync(string message, CancellationToken cancellationToken = default);

    /// <summary>
    /// Bu Job tamamlandıktan veya belirli bir aşamaya geldikten sonra zincirleme (chain) olarak bir sonraki Job'ı başlatır ve anında döner.
    /// Beklenmek istendiğinde <see cref="WaitForJobCompletionAsync"/> veya <see cref="GetArrowReaderAsync"/> kullanılabilir.
    /// </summary>
    Task<ArrowJob<TNextRequest>> EnqueueNextJobAsync<TNextRequest>(
        string jobName,
        TNextRequest request,
        CancellationToken cancellationToken = default)
        where TNextRequest : notnull;

    /// <summary>
    /// Belirtilen Job'ın sonlanmasını (Completed, Failed veya Cancelled) bekler.
    /// </summary>
    Task<ArrowJobEvent> WaitForJobCompletionAsync(
        Guid targetJobId,
        TimeSpan? pollInterval = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// <see cref="ArrowJob{TRequest}"/> sonucunda oluşan RecordBatch'leri okumak için <see cref="Result{T}"/> içinde <see cref="ArrowBatchReader"/> döndürür.
    /// Job henüz tamamlanmadıysa, okuma başladığında otomatik olarak Job'ın bitmesini bekler (Lazy Evaluation).
    /// </summary>
    Task<Result<ArrowBatchReader>> GetArrowReaderAsync<TRequest>(
        ArrowJob<TRequest>? job,
        CancellationToken cancellationToken = default)
        where TRequest : notnull;
}
