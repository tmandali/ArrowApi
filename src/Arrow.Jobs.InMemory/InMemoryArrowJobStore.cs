using System.Collections.Concurrent;

namespace Arrow.Jobs.InMemory;

public sealed class InMemoryArrowJobStore<TRequest> : IArrowJobStore<TRequest>
    where TRequest : notnull
{
    private readonly ConcurrentDictionary<Guid, ArrowJob<TRequest>> _jobs = new();

    public Task<ArrowJob<TRequest>> CreateAsync(
        TRequest request,
        string? name = null,
        Guid? rootJobId = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        Guid jobId = Guid.NewGuid();
        var job = new ArrowJob<TRequest>
        {
            Id = jobId,
            Name = name,
            RootJobId = rootJobId ?? jobId,
            Request = request,
            RequestHash = ArrowJobRequestHasher.ComputeHash(request)
        };
        ArrowJobTracePropagation.CaptureCurrent(job);

        if (!_jobs.TryAdd(job.Id, job))
            throw new InvalidOperationException("Job kimliği çakıştı.");

        return Task.FromResult(job);
    }

    public Task<ArrowJob<TRequest>?> FindDuplicateAsync(
        TRequest request,
        string? name = null,
        TimeSpan? window = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        string hash = ArrowJobRequestHasher.ComputeHash(request);
        DateTimeOffset now = DateTimeOffset.UtcNow;

        ArrowJob<TRequest>? match = _jobs.Values
            .Where(j => string.Equals(j.Name, name, StringComparison.OrdinalIgnoreCase))
            .Where(j => j.RequestHash == hash)
            .Where(j =>
            {
                if (j.State is ArrowJobState.Queued or ArrowJobState.Running)
                    return true;

                if (window.HasValue && (now - j.CreatedAt) <= window.Value)
                    return true;

                return false;
            })
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefault();

        return Task.FromResult(match);
    }

    public Task<ArrowJob<TRequest>?> GetAsync(Guid id, CancellationToken cancellationToken = default) =>
        Task.FromResult(_jobs.TryGetValue(id, out ArrowJob<TRequest>? job) ? job : null);

    public Task<ArrowJobListPage<TRequest>> ListAsync(
        ArrowJobListQuery query,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);

        int take = Math.Clamp(query.Take, 1, 500);
        int skip = Math.Max(0, query.Skip);

        IEnumerable<ArrowJob<TRequest>> filtered = _jobs.Values;

        if (query.State is { } state)
            filtered = filtered.Where(j => j.State == state);

        if (query.From is { } from)
            filtered = filtered.Where(j => j.CreatedAt >= from);

        if (query.To is { } to)
            filtered = filtered.Where(j => j.CreatedAt <= to);

        if (query.RootJobId is { } rootJobId)
            filtered = filtered.Where(j => j.RootJobId == rootJobId);

        if (!string.IsNullOrWhiteSpace(query.Name))
        {
            string name = query.Name;
            // Name henüz yazılmamış eski job'lar da bu store'da bu tipe aittir.
            filtered = filtered.Where(j =>
                string.IsNullOrEmpty(j.Name) ||
                string.Equals(j.Name, name, StringComparison.OrdinalIgnoreCase));
        }

        List<ArrowJob<TRequest>> ordered = filtered
            .OrderByDescending(j => j.CreatedAt)
            .ToList();

        return Task.FromResult(new ArrowJobListPage<TRequest>
        {
            Items = ordered.Skip(skip).Take(take).ToList(),
            Total = ordered.Count
        });
    }

    public Task MarkRunningAsync(Guid id, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest> job = GetRequired(id);
        if (job.State == ArrowJobState.Cancelled)
            return Task.CompletedTask;

        job.State = ArrowJobState.Running;
        return Task.CompletedTask;
    }

    public Task ReportProgressAsync(Guid id, int batchCount, long totalRows, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest> job = GetRequired(id);
        job.BatchCount = batchCount;
        job.TotalRows = totalRows;
        return Task.CompletedTask;
    }

    public Task MarkCompletedAsync(Guid id, string resultPath, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(resultPath);
        ArrowJob<TRequest> job = GetRequired(id);
        if (job.State == ArrowJobState.Cancelled)
            return Task.CompletedTask;

        job.State = ArrowJobState.Completed;
        job.ResultPath = resultPath;
        job.CompletedAt = DateTimeOffset.UtcNow;
        return Task.CompletedTask;
    }

    public Task MarkFailedAsync(Guid id, string error, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest> job = GetRequired(id);
        if (job.State == ArrowJobState.Cancelled)
            return Task.CompletedTask;

        job.State = ArrowJobState.Failed;
        job.Error = error;
        job.CompletedAt = DateTimeOffset.UtcNow;
        return Task.CompletedTask;
    }

    public Task<bool> TryCancelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        if (!_jobs.TryGetValue(id, out ArrowJob<TRequest>? job))
            return Task.FromResult(false);

        if (job.State is not (ArrowJobState.Queued or ArrowJobState.Running))
            return Task.FromResult(false);

        job.State = ArrowJobState.Cancelled;
        job.CompletedAt = DateTimeOffset.UtcNow;
        return Task.FromResult(true);
    }

    public Task<bool> TryDeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        if (!_jobs.TryGetValue(id, out ArrowJob<TRequest>? job))
            return Task.FromResult(false);

        if (job.State == ArrowJobState.Running)
            return Task.FromResult(false);

        return Task.FromResult(_jobs.TryRemove(id, out _));
    }

    public Task<ArrowJobStatus?> GetStatusAsync(Guid id, string jobsBasePath = "/api/arrow/jobs", CancellationToken cancellationToken = default)
    {
        if (!_jobs.TryGetValue(id, out ArrowJob<TRequest>? job))
            return Task.FromResult<ArrowJobStatus?>(null);

        string cleanBase = jobsBasePath.TrimEnd('/');
        string jobUrl = $"{cleanBase}/{id}";
        string eventsUrl = $"{cleanBase}/{id}/events";

        ArrowJobStatus status = new(
            job.Id,
            job.State.ToString(),
            jobUrl,
            eventsUrl,
            job.CreatedAt,
            job.CompletedAt,
            job.Error,
            job.BatchCount,
            job.TotalRows,
            null,
            job.Name,
            job.RootJobId,
            job.ParentJobId);

        return Task.FromResult<ArrowJobStatus?>(status);
    }

    public Task<bool> TryCancelJobAsync(Guid id, CancellationToken cancellationToken = default) =>
        TryCancelAsync(id, cancellationToken);

    public Task<bool> TryDeleteJobAsync(Guid id, CancellationToken cancellationToken = default) =>
        TryDeleteAsync(id, cancellationToken);

    public Task<string?> GetResultPathAsync(Guid id, CancellationToken cancellationToken = default)
    {
        if (!_jobs.TryGetValue(id, out ArrowJob<TRequest>? job))
            return Task.FromResult<string?>(null);

        return Task.FromResult(job.ResultPath);
    }

    private ArrowJob<TRequest> GetRequired(Guid id) =>
        _jobs.TryGetValue(id, out ArrowJob<TRequest>? job)
            ? job
            : throw new KeyNotFoundException($"Job bulunamadı: {id}");
}
