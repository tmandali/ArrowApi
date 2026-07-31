using Apache.Arrow;
using Arrow.Data;

namespace Arrow.Jobs;

/// <summary>Worker için job kimliği, canlı ilerleme ve alt job zincirleme bağlamı.</summary>
public interface IArrowJobExecutionContext
{
    Guid JobId { get; }

    /// <summary>Üst (doğrudan tetikleyen) job kimliği (kök job ise <see langword="null"/>).</summary>
    Guid? ParentJobId { get; }

    /// <summary>
    /// Üst (parent) job'ın ürettiği Arrow veri akışını okumak için <see cref="Result{T}"/> içinde <see cref="ArrowBatchReader"/> döndürür.
    /// </summary>
    Task<Result<ArrowBatchReader>> GetParentArrowReaderAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Gelen Arrow batch akışını aynı DI Scope ve DbContext içinde bir sonraki Child Worker'a Pipe (boru hattı) ile bağlar.
    /// </summary>
    IAsyncEnumerable<RecordBatch> PipeToAsync<TNextRequest>(
        string jobName,
        TNextRequest request,
        IAsyncEnumerable<RecordBatch> sourceStream,
        CancellationToken cancellationToken = default)
        where TNextRequest : notnull;

    /// <summary><c>info</c> event — job state değildir; yalnızca worker mesajı.</summary>
    ValueTask PublishInfoAsync(string message, CancellationToken cancellationToken = default);
}
