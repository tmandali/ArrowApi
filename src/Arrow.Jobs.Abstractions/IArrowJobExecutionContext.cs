namespace Arrow.Jobs;

/// <summary>Worker için job kimliği, canlı ilerleme ve alt job zincirleme bağlamı.</summary>
public interface IArrowJobExecutionContext
{
    Guid JobId { get; }

    /// <summary><c>info</c> event — job state değildir; yalnızca worker mesajı.</summary>
    ValueTask PublishInfoAsync(string message, CancellationToken cancellationToken = default);

    /// <summary>
    /// Bu Job tamamlandıktan veya belirli bir aşamaya geldikten sonra zincirleme (chain) olarak bir sonraki Job'ı başlatır.
    /// <paramref name="wait"/> true ise alt job tamamlanana (Completed, Failed, Cancelled) kadar bekler.
    /// </summary>
    Task<ArrowJob<TNextRequest>> EnqueueNextJobAsync<TNextRequest>(
        string jobName,
        TNextRequest request,
        bool wait = false,
        CancellationToken cancellationToken = default)
        where TNextRequest : notnull;

    /// <summary>
    /// Belirtilen Job'ın sonlanmasını (Completed, Failed veya Cancelled) bekler.
    /// </summary>
    Task<ArrowJobEvent> WaitForJobCompletionAsync(
        Guid targetJobId,
        TimeSpan? pollInterval = null,
        CancellationToken cancellationToken = default);
}
