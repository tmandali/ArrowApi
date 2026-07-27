using StackExchange.Redis;
using System.Text.Json;

namespace Arrow.Jobs.Redis;

public sealed class RedisArrowJobStore<TRequest> : IArrowJobStore<TRequest>
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IConnectionMultiplexer _redis;

    public RedisArrowJobStore(IConnectionMultiplexer redis)
    {
        _redis = redis ?? throw new ArgumentNullException(nameof(redis));
    }

    private IDatabase Database => _redis.GetDatabase();

    private static string Key(Guid id) => $"arrow:job:{id:N}";

    public async Task<ArrowJob<TRequest>> CreateAsync(TRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var job = new ArrowJob<TRequest>
        {
            Id = Guid.NewGuid(),
            Request = request
        };

        await SetAsync(job).ConfigureAwait(false);
        return job;
    }

    public async Task<ArrowJob<TRequest>?> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        RedisValue value = await Database.StringGetAsync(Key(id)).ConfigureAwait(false);
        if (value.IsNullOrEmpty)
            return null;

        return JsonSerializer.Deserialize<ArrowJob<TRequest>>(value.ToString(), JsonOptions);
    }

    public async Task MarkRunningAsync(Guid id, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest> job = await GetRequiredAsync(id).ConfigureAwait(false);
        job.State = ArrowJobState.Running;
        await SetAsync(job).ConfigureAwait(false);
    }

    public async Task MarkCompletedAsync(Guid id, string resultPath, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest> job = await GetRequiredAsync(id).ConfigureAwait(false);
        job.State = ArrowJobState.Completed;
        job.ResultPath = resultPath;
        job.CompletedAt = DateTimeOffset.UtcNow;
        await SetAsync(job).ConfigureAwait(false);
    }

    public async Task MarkFailedAsync(Guid id, string error, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest> job = await GetRequiredAsync(id).ConfigureAwait(false);
        job.State = ArrowJobState.Failed;
        job.Error = error;
        job.CompletedAt = DateTimeOffset.UtcNow;
        await SetAsync(job).ConfigureAwait(false);
    }

    private async Task<ArrowJob<TRequest>> GetRequiredAsync(Guid id)
    {
        ArrowJob<TRequest>? job = await GetAsync(id).ConfigureAwait(false);
        return job ?? throw new KeyNotFoundException($"Job bulunamadı: {id}");
    }

    private Task SetAsync(ArrowJob<TRequest> job) =>
        Database.StringSetAsync(Key(job.Id), JsonSerializer.Serialize(job, JsonOptions));
}
