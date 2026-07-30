namespace Arrow.Jobs;

/// <summary>Tip bağımsız genel job veri deposu arayüzü.</summary>
public interface IArrowJobStore
{
    /// <summary>Belirtilen job kimliği için durum bilgilerini çeker.</summary>
    Task<ArrowJobStatus?> GetStatusAsync(Guid id, string jobsBasePath = "/api/arrow/jobs", CancellationToken cancellationToken = default);
    /// <summary>Tip bağımsız job iptal etme denemesi.</summary>
    Task<bool> TryCancelJobAsync(Guid id, CancellationToken cancellationToken = default);
    /// <summary>Tip bağımsız job silme denemesi.</summary>
    Task<bool> TryDeleteJobAsync(Guid id, CancellationToken cancellationToken = default);
    /// <summary>Job sonuç dosya yolunu çeker.</summary>
    Task<string?> GetResultPathAsync(Guid id, CancellationToken cancellationToken = default);
}

/// <summary>Jenerik job veri deposu arayüzü.</summary>
/// <typeparam name="TRequest">İstek DTO tipi.</typeparam>
public interface IArrowJobStore<TRequest> : IArrowJobStore
    where TRequest : notnull
{
    /// <summary>Yeni bir job kaydı oluşturur.</summary>
    Task<ArrowJob<TRequest>> CreateAsync(TRequest request, string? name = null, string? correlationId = null, CancellationToken cancellationToken = default);
    /// <summary>Aynı parametrelerle oluşturulmuş yinelenen job arar.</summary>
    Task<ArrowJob<TRequest>?> FindDuplicateAsync(TRequest request, string? name = null, TimeSpan? window = null, CancellationToken cancellationToken = default);
    /// <summary>Job detayını getirir.</summary>
    Task<ArrowJob<TRequest>?> GetAsync(Guid id, CancellationToken cancellationToken = default);
    /// <summary>Sorgu kriterlerine göre job'ları listeler.</summary>
    Task<ArrowJobListPage<TRequest>> ListAsync(ArrowJobListQuery query, CancellationToken cancellationToken = default);
    /// <summary>Job durumunu <see cref="ArrowJobState.Running"/> olarak günceller.</summary>
    Task MarkRunningAsync(Guid id, CancellationToken cancellationToken = default);
    /// <summary>Job ilerleme metriklerini günceller.</summary>
    Task ReportProgressAsync(Guid id, int batchCount, long totalRows, CancellationToken cancellationToken = default);
    /// <summary>Job durumunu <see cref="ArrowJobState.Completed"/> olarak günceller.</summary>
    Task MarkCompletedAsync(Guid id, string resultPath, CancellationToken cancellationToken = default);
    /// <summary>Job durumunu <see cref="ArrowJobState.Failed"/> olarak günceller.</summary>
    Task MarkFailedAsync(Guid id, string error, CancellationToken cancellationToken = default);

    /// <summary>
    /// <see cref="ArrowJobState.Queued"/> veya <see cref="ArrowJobState.Running"/> ise
    /// <see cref="ArrowJobState.Cancelled"/> yapar. Aksi halde <c>false</c>.
    /// </summary>
    Task<bool> TryCancelAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>
    /// <see cref="ArrowJobState.Running"/> dışındaki job'u siler. Running ise <c>false</c>.
    /// </summary>
    Task<bool> TryDeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
