using System.Collections.Concurrent;

namespace Arrow.Jobs.InMemory;

public sealed class InMemoryArrowJobStore<TRequest> : IArrowJobStore<TRequest>
{
    private readonly ConcurrentDictionary<Guid, ArrowJob<TRequest>> _jobs = new();

    public Task<ArrowJob<TRequest>> CreateAsync(TRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var job = new ArrowJob<TRequest>
        {
            Id = Guid.NewGuid(),
            Request = request
        };

        if (!_jobs.TryAdd(job.Id, job))
            throw new InvalidOperationException("Job kimliği çakıştı.");

        return Task.FromResult(job);
    }

    public Task<ArrowJob<TRequest>?> GetAsync(Guid id, CancellationToken cancellationToken = default) =>
        Task.FromResult(_jobs.TryGetValue(id, out ArrowJob<TRequest>? job) ? job : null);

    public Task MarkRunningAsync(Guid id, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest> job = GetRequired(id);
        job.State = ArrowJobState.Running;
        return Task.CompletedTask;
    }

    public Task MarkCompletedAsync(Guid id, string resultPath, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest> job = GetRequired(id);
        job.State = ArrowJobState.Completed;
        job.ResultPath = resultPath;
        job.CompletedAt = DateTimeOffset.UtcNow;
        return Task.CompletedTask;
    }

    public Task MarkFailedAsync(Guid id, string error, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest> job = GetRequired(id);
        job.State = ArrowJobState.Failed;
        job.Error = error;
        job.CompletedAt = DateTimeOffset.UtcNow;
        return Task.CompletedTask;
    }

    private ArrowJob<TRequest> GetRequired(Guid id) =>
        _jobs.TryGetValue(id, out ArrowJob<TRequest>? job)
            ? job
            : throw new KeyNotFoundException($"Job bulunamadı: {id}");
}
