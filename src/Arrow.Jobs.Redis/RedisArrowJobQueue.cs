using Microsoft.Extensions.Logging;
using StackExchange.Redis;
using System.Runtime.CompilerServices;

namespace Arrow.Jobs.Redis;

public sealed class RedisArrowJobQueue<TRequest> : IArrowJobQueue<TRequest>
    where TRequest : notnull
{
    private readonly string _queueKey =
        $"arrow:job:queue:{typeof(TRequest).Namespace}.{typeof(TRequest).Name}";

    private readonly IConnectionMultiplexer _redis;
    private readonly ILogger<RedisArrowJobQueue<TRequest>> _logger;

    public RedisArrowJobQueue(IConnectionMultiplexer redis, ILogger<RedisArrowJobQueue<TRequest>> logger)
    {
        _redis = redis ?? throw new ArgumentNullException(nameof(redis));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    private IDatabase Database => _redis.GetDatabase();

    public async ValueTask EnqueueAsync(Guid jobId, CancellationToken cancellationToken = default)
    {
        // Bağlantı kopuksa enqueue retry edilir; host çalışmaya devam eder.
        for (int attempt = 0; ; attempt++)
        {
            try
            {
                await Database.ListLeftPushAsync(_queueKey, jobId.ToString());
                return;
            }
            catch (RedisException) when (attempt < 5)
            {
                await Task.Delay(500, cancellationToken);
            }
        }
    }

    public async IAsyncEnumerable<Guid> DequeueAllAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        int consecutiveErrors = 0;
        while (!cancellationToken.IsCancellationRequested)
        {
            RedisValue[] values;
            try
            {
                // count:10 RPOP: tek komutla en fazla 10 job atomik çekilir;
                // çok instance'ta aynı job iki process'e dağıtılmaz.
                values = await Database.ListRightPopAsync(_queueKey, 10);
                consecutiveErrors = 0;
            }
            catch (RedisException ex)
            {
                // Redis geçici olarak erişilemez: host ölmeyin, backoff ile yeniden dene.
                consecutiveErrors++;
                if (consecutiveErrors == 1)
                    _logger.LogWarning(ex, "Redis erişilemiyor; 5 sn sonra yeniden denenecek.");
                await Task.Delay(5000, cancellationToken);
                continue;
            }

            if (values is null || values.Length == 0)
            {
                await Task.Delay(100, cancellationToken);
                continue;
            }

            foreach (RedisValue value in values)
            {
                if (value.IsNullOrEmpty)
                    continue;
                yield return Guid.Parse(value.ToString());
            }
        }
    }
}
