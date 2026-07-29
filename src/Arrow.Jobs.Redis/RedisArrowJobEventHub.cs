using StackExchange.Redis;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading.Channels;

namespace Arrow.Jobs.Redis;

public sealed class RedisArrowJobEventHub : IArrowJobEventHub
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IConnectionMultiplexer _redis;

    public RedisArrowJobEventHub(IConnectionMultiplexer redis)
    {
        _redis = redis ?? throw new ArgumentNullException(nameof(redis));
    }

    private static RedisChannel ChannelName(Guid jobId) =>
        RedisChannel.Literal($"arrow:job:events:{jobId:N}");

    public async ValueTask PublishAsync(
        Guid jobId,
        string eventName,
        ArrowJobEvent payload,
        CancellationToken cancellationToken = default)
    {
        ArrowJobHubMessage message = new(eventName, payload);
        string json = JsonSerializer.Serialize(message, JsonOptions);
        await _redis.GetSubscriber().PublishAsync(ChannelName(jobId), json);
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
