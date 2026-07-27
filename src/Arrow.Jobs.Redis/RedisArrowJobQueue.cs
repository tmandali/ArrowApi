using System.Runtime.CompilerServices;
using StackExchange.Redis;

namespace Arrow.Jobs.Redis;

public sealed class RedisArrowJobQueue : IArrowJobQueue
{
    private const string QueueKey = "arrow:job:queue";
    private readonly IConnectionMultiplexer _redis;

    public RedisArrowJobQueue(IConnectionMultiplexer redis)
    {
        _redis = redis ?? throw new ArgumentNullException(nameof(redis));
    }

    private IDatabase Database => _redis.GetDatabase();

    public async ValueTask EnqueueAsync(Guid jobId, CancellationToken cancellationToken = default)
    {
        await Database.ListLeftPushAsync(QueueKey, jobId.ToString()).ConfigureAwait(false);
    }

    public async IAsyncEnumerable<Guid> DequeueAllAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            RedisValue value = await Database.ListRightPopAsync(QueueKey).ConfigureAwait(false);
            if (!value.IsNullOrEmpty)
            {
                yield return Guid.Parse(value.ToString());
                continue;
            }

            await Task.Delay(100, cancellationToken).ConfigureAwait(false);
        }
    }
}
