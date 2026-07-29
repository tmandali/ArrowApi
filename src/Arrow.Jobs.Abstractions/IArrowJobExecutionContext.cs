namespace Arrow.Jobs;

/// <summary>Worker <c>ExecuteJobAsync</c> için job kimliği, request ve bilgilendirme.</summary>
public interface IArrowJobExecutionContext<TRequest>
{
    Guid JobId { get; }

    TRequest Request { get; }

    /// <summary><c>info</c> event — job state değildir; yalnızca worker mesajı.</summary>
    ValueTask PublishInfoAsync(string message, CancellationToken cancellationToken = default);
}
