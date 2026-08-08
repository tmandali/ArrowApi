using StackExchange.Redis;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading.Channels;

namespace Arrow.Jobs.Redis;

public sealed class RedisArrowJobEventHub : IArrowJobEventHub
{
    private const int MaxHistoryPerJob = 200;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IConnectionMultiplexer _redis;

    public RedisArrowJobEventHub(IConnectionMultiplexer redis)
    {
        _redis = redis ?? throw new ArgumentNullException(nameof(redis));
    }

    private static RedisChannel ChannelName(Guid jobId) =>
        RedisChannel.Literal($"arrow:job:events:{jobId:N}");

    private static RedisKey HistoryKey(Guid jobId) =>
        $"arrow:job:event-log:{jobId:N}";

    public async ValueTask PublishAsync(
        Guid jobId,
        string eventName,
        ArrowJobEvent payload,
        CancellationToken cancellationToken = default)
    {
        ArrowJobEvent stamped = payload.OccurredAt is null
            ? payload with { OccurredAt = DateTimeOffset.UtcNow }
            : payload;
        ArrowJobHubMessage message = new(eventName, stamped);
        string json = JsonSerializer.Serialize(message, JsonOptions);

        IDatabase db = _redis.GetDatabase();
        await db.ListRightPushAsync(HistoryKey(jobId), json);
        await db.ListTrimAsync(HistoryKey(jobId), -MaxHistoryPerJob, -1);
        await _redis.GetSubscriber().PublishAsync(ChannelName(jobId), json);
    }

    public async ValueTask<IReadOnlyList<ArrowJobHubMessage>> GetHistoryAsync(
        Guid jobId,
        CancellationToken cancellationToken = default)
    {
        RedisValue[] values = await _redis.GetDatabase().ListRangeAsync(HistoryKey(jobId));
        if (values.Length == 0)
            return Array.Empty<ArrowJobHubMessage>();

        var list = new List<ArrowJobHubMessage>(values.Length);
        foreach (RedisValue value in values)
        {
            if (value.IsNullOrEmpty)
                continue;
            try
            {
                ArrowJobHubMessage? message =
                    JsonSerializer.Deserialize<ArrowJobHubMessage>(value.ToString(), JsonOptions);
                if (message is not null)
                    list.Add(message);
            }
            catch (JsonException)
            {
                // bozuk kaydı atla
            }
        }

        return list;
    }

    public IArrowJobEventSubscription Subscribe(Guid jobId)
    {
        Channel<ArrowJobHubMessage> channel = Channel.CreateUnbounded<ArrowJobHubMessage>(
            new UnboundedChannelOptions
            {
                SingleReader = true,
                SingleWriter = false,
                AllowSynchronousContinuations = false
            });

        ISubscriber subscriber = _redis.GetSubscriber();
        RedisChannel redisChannel = ChannelName(jobId);

        Action<RedisChannel, RedisValue> handler = (_, value) =>
        {
            if (value.IsNullOrEmpty)
                return;

            try
            {
                ArrowJobHubMessage? message = JsonSerializer.Deserialize<ArrowJobHubMessage>(value.ToString(), JsonOptions);
                if (message is not null)
                    channel.Writer.TryWrite(message);
            }
            catch (JsonException)
            {
                // bozuk mesajı yut
            }
        };

        subscriber.Subscribe(redisChannel, handler);

        return new Subscription(channel.Reader, () =>
        {
            try
            {
                subscriber.Unsubscribe(redisChannel, handler);
            }
            finally
            {
                channel.Writer.TryComplete();
            }
        });
    }

    private sealed class Subscription : IArrowJobEventSubscription
    {
        private readonly ChannelReader<ArrowJobHubMessage> _reader;
        private readonly Action _dispose;
        private int _disposed;

        public Subscription(ChannelReader<ArrowJobHubMessage> reader, Action dispose)
        {
            _reader = reader;
            _dispose = dispose;
        }

        public IAsyncEnumerable<ArrowJobHubMessage> Messages => ReadAllAsync();

        private async IAsyncEnumerable<ArrowJobHubMessage> ReadAllAsync(
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            await foreach (ArrowJobHubMessage message in _reader.ReadAllAsync(cancellationToken))
                yield return message;
        }

        public ValueTask DisposeAsync()
        {
            if (Interlocked.Exchange(ref _disposed, 1) == 0)
                _dispose();

            return default;
        }
    }
}
