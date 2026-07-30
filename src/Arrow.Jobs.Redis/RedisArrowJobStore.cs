using StackExchange.Redis;
using System.Text.Json;

namespace Arrow.Jobs.Redis;

public sealed class RedisArrowJobStore<TRequest> : IArrowJobStore<TRequest>
    where TRequest : notnull
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly string TypeKey = typeof(TRequest).FullName ?? typeof(TRequest).Name;
    private readonly IConnectionMultiplexer _redis;

    public RedisArrowJobStore(IConnectionMultiplexer redis)
    {
        _redis = redis ?? throw new ArgumentNullException(nameof(redis));
    }

    private IDatabase Database => _redis.GetDatabase();

    private static string Key(Guid id) => $"arrow:job:{id:N}";

    private static string ByTimeKey() => $"arrow:jobs:{TypeKey}:bytime";

    private static string StateKey(ArrowJobState state) => $"arrow:jobs:{TypeKey}:state:{state}";

    public async Task<ArrowJob<TRequest>> CreateAsync(
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

        await SetAsync(job);
        await IndexAddAsync(job);
        return job;
    }

    public async Task<ArrowJob<TRequest>?> FindDuplicateAsync(
        TRequest request,
        string? name = null,
        TimeSpan? window = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        string hash = ArrowJobRequestHasher.ComputeHash(request);
        DateTimeOffset now = DateTimeOffset.UtcNow;

        ArrowJobListPage<TRequest> page = await ListAsync(new ArrowJobListQuery(Take: 200), cancellationToken);

        return page.Items
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
    }

    public async Task<ArrowJob<TRequest>?> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        RedisValue value = await Database.StringGetAsync(Key(id));
        if (value.IsNullOrEmpty)
            return null;

        return JsonSerializer.Deserialize<ArrowJob<TRequest>>(value.ToString(), JsonOptions);
    }

    public async Task<ArrowJobListPage<TRequest>> ListAsync(
        ArrowJobListQuery query,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);

        int take = Math.Clamp(query.Take, 1, 500);
        int skip = Math.Max(0, query.Skip);

        double maxScore = query.To?.UtcDateTime.Ticks ?? double.PositiveInfinity;
        double minScore = query.From?.UtcDateTime.Ticks ?? double.NegativeInfinity;

        RedisValue[] ids;
        if (query.State is { } state)
        {
            // State set ∩ time range: load state members, filter by score via ZSCORE
            RedisValue[] stateIds = await Database.SetMembersAsync(StateKey(state));
            var scored = new List<(Guid Id, double Score)>(stateIds.Length);
            foreach (RedisValue stateId in stateIds)
            {
                if (!Guid.TryParseExact(stateId.ToString(), "N", out Guid id))
                    continue;

                double? score = await Database.SortedSetScoreAsync(ByTimeKey(), id.ToString("N"));
                if (score is null)
                    continue;
                if (score < minScore || score > maxScore)
                    continue;

                scored.Add((id, score.Value));
            }

            scored.Sort((a, b) => b.Score.CompareTo(a.Score));
            int total = scored.Count;
            List<ArrowJob<TRequest>> items = [];
            foreach ((Guid id, _) in scored.Skip(skip).Take(take))
            {
                ArrowJob<TRequest>? job = await GetAsync(id, cancellationToken);
                if (job is not null)
                    items.Add(job);
            }

            return new ArrowJobListPage<TRequest> { Items = items, Total = total };
        }

        long totalCount = await Database.SortedSetLengthAsync(ByTimeKey(), minScore, maxScore);
        ids = await Database.SortedSetRangeByScoreAsync(
            ByTimeKey(),
            minScore,
            maxScore,
            Exclude.None,
            Order.Descending,
            skip,
            take);

        List<ArrowJob<TRequest>> page = [];
        foreach (RedisValue idValue in ids)
        {
            if (!Guid.TryParseExact(idValue.ToString(), "N", out Guid id))
                continue;

            ArrowJob<TRequest>? job = await GetAsync(id, cancellationToken);
            if (job is not null)
                page.Add(job);
        }

        return new ArrowJobListPage<TRequest>
        {
            Items = page,
            Total = (int)Math.Min(totalCount, int.MaxValue)
        };
    }

    public async Task MarkRunningAsync(Guid id, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest> job = await GetRequiredAsync(id);
        if (job.State == ArrowJobState.Cancelled)
            return;

        ArrowJobState previous = job.State;
        job.State = ArrowJobState.Running;
        await SetAsync(job);
        await IndexMoveStateAsync(job.Id, previous, job.State);
    }

    public async Task ReportProgressAsync(Guid id, int batchCount, long totalRows, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest> job = await GetRequiredAsync(id);
        job.BatchCount = batchCount;
        job.TotalRows = totalRows;
        await SetAsync(job);
    }

    public async Task MarkCompletedAsync(Guid id, string resultPath, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(resultPath);
        ArrowJob<TRequest> job = await GetRequiredAsync(id);
        if (job.State == ArrowJobState.Cancelled)
            return;

        ArrowJobState previous = job.State;
        job.State = ArrowJobState.Completed;
        job.ResultPath = resultPath;
        job.CompletedAt = DateTimeOffset.UtcNow;
        await SetAsync(job);
        await IndexMoveStateAsync(job.Id, previous, job.State);
    }

    public async Task MarkFailedAsync(Guid id, string error, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest> job = await GetRequiredAsync(id);
        if (job.State == ArrowJobState.Cancelled)
            return;

        ArrowJobState previous = job.State;
        job.State = ArrowJobState.Failed;
        job.Error = error;
        job.CompletedAt = DateTimeOffset.UtcNow;
        await SetAsync(job);
        await IndexMoveStateAsync(job.Id, previous, job.State);
    }

    public async Task<bool> TryCancelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest>? job = await GetAsync(id, cancellationToken);
        if (job is null)
            return false;

        if (job.State is not (ArrowJobState.Queued or ArrowJobState.Running))
            return false;

        ArrowJobState previous = job.State;
        job.State = ArrowJobState.Cancelled;
        job.CompletedAt = DateTimeOffset.UtcNow;
        await SetAsync(job);
        await IndexMoveStateAsync(job.Id, previous, job.State);
        return true;
    }

    public async Task<bool> TryDeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest>? job = await GetAsync(id, cancellationToken);
        if (job is null)
            return false;

        if (job.State == ArrowJobState.Running)
            return false;

        await Database.KeyDeleteAsync(Key(id));
        await IndexRemoveAsync(job);
        return true;
    }

    public async Task<ArrowJobStatus?> GetStatusAsync(Guid id, string jobsBasePath = "/api/arrow/jobs", CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest>? job = await GetAsync(id, cancellationToken);
        if (job is null)
            return null;

        string baseRoute = jobsBasePath.TrimEnd('/');
        string jobUrl = $"{baseRoute}/{id:N}";
        string downloadUrl = $"{baseRoute}/{id:N}/download";
        string eventsUrl = $"{baseRoute}/{id:N}/events";

        return new ArrowJobStatus(
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
            job.RootJobId);
    }

    public Task<bool> TryCancelJobAsync(Guid id, CancellationToken cancellationToken = default) =>
        TryCancelAsync(id, cancellationToken);

    public Task<bool> TryDeleteJobAsync(Guid id, CancellationToken cancellationToken = default) =>
        TryDeleteAsync(id, cancellationToken);

    public async Task<string?> GetResultPathAsync(Guid id, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest>? job = await GetAsync(id, cancellationToken);
        return job?.ResultPath;
    }

    private async Task<ArrowJob<TRequest>> GetRequiredAsync(Guid id)
    {
        ArrowJob<TRequest>? job = await GetAsync(id);
        return job ?? throw new KeyNotFoundException($"Job bulunamadı: {id}");
    }

    private Task SetAsync(ArrowJob<TRequest> job) =>
        Database.StringSetAsync(Key(job.Id), JsonSerializer.Serialize(job, JsonOptions));

    private async Task IndexAddAsync(ArrowJob<TRequest> job)
    {
        string id = job.Id.ToString("N");
        await Database.SortedSetAddAsync(ByTimeKey(), id, job.CreatedAt.UtcDateTime.Ticks);
        await Database.SetAddAsync(StateKey(job.State), id);
    }

    private async Task IndexMoveStateAsync(Guid id, ArrowJobState from, ArrowJobState to)
    {
        if (from == to)
            return;

        string idValue = id.ToString("N");
        await Database.SetRemoveAsync(StateKey(from), idValue);
        await Database.SetAddAsync(StateKey(to), idValue);
    }

    private async Task IndexRemoveAsync(ArrowJob<TRequest> job)
    {
        string id = job.Id.ToString("N");
        await Database.SortedSetRemoveAsync(ByTimeKey(), id);
        await Database.SetRemoveAsync(StateKey(job.State), id);
    }
}
