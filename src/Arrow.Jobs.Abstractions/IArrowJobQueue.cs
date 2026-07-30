namespace Arrow.Jobs;

/// <summary>Job kuyruk yönetimi arayüzü.</summary>
/// <typeparam name="TRequest">İstek DTO tipi.</typeparam>
public interface IArrowJobQueue<TRequest>
    where TRequest : notnull
{
    /// <summary>Belirtilen job kimliğini kuyruğa ekler.</summary>
    /// <param name="jobId">Job kimliği.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    ValueTask EnqueueAsync(Guid jobId, CancellationToken cancellationToken = default);

    /// <summary>Kuyruktan sırayla job kimliklerini çeker.</summary>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns>Job kimlik akışı.</returns>
    IAsyncEnumerable<Guid> DequeueAllAsync(CancellationToken cancellationToken);
}
