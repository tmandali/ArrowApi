using StackExchange.Redis;
using System.Runtime.CompilerServices;

namespace Arrow.Jobs.Redis;

public sealed class RedisArrowJobQueue<TRequest> : IArrowJobQueue<TRequest>
    where TRequest : notnull
{
    private readonly string _queueKey =
        $"arrow:job:queue:{typeof(TRequest).FullName ?? typeof(TRequest).Name}";

    private readonly IConnectionMultiplexer _redis;

    public RedisArrowJobQueue(IConnectionMultiplexer redis)
    {
        _redis = redis ?? throw new ArgumentNullException(nameof(redis));
    }

    private IDatabase Database => _redis.GetDatabase();

    public async ValueTask EnqueueAsync(Guid jobId, CancellationToken cancellationToken = default)
    {
        await Database.ListLeftPushAsync(_queueKey, jobId.ToString());
    }

    public async IAsyncEnumerable<Guid> DequeueAllAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            RedisValue value = await Database.ListRightPopAsync(_queueKey);
            if (!value.IsNullOrEmpty)
            {
                yield return Guid.Parse(value.ToString());
                continue;
            }

            await Task.Delay(100, cancellationToken);
        }
    }
}
