using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Threading.Channels;

namespace Arrow.Jobs.InMemory;

public sealed class InMemoryArrowJobEventHub : IArrowJobEventHub
{
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, ChannelWriter<ArrowJobHubMessage>>> _subs = new();

    public ValueTask PublishAsync(
        Guid jobId,
        string eventName,
        ArrowJobEvent payload,
        CancellationToken cancellationToken = default)
    {
        if (!_subs.TryGetValue(jobId, out ConcurrentDictionary<Guid, ChannelWriter<ArrowJobHubMessage>>? writers))
            return default;

        ArrowJobHubMessage message = new(eventName, payload);
        foreach (ChannelWriter<ArrowJobHubMessage> writer in writers.Values)
            writer.TryWrite(message);

        return default;
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

        Guid subscriptionId = Guid.NewGuid();
        ConcurrentDictionary<Guid, ChannelWriter<ArrowJobHubMessage>> writers =
            _subs.GetOrAdd(jobId, static _ => new ConcurrentDictionary<Guid, ChannelWriter<ArrowJobHubMessage>>());
        writers[subscriptionId] = channel.Writer;

        return new Subscription(channel.Reader, () =>
        {
            if (_subs.TryGetValue(jobId, out ConcurrentDictionary<Guid, ChannelWriter<ArrowJobHubMessage>>? current))
            {
                current.TryRemove(subscriptionId, out _);
                if (current.IsEmpty)
                    _subs.TryRemove(jobId, out _);
            }

            channel.Writer.TryComplete();
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
