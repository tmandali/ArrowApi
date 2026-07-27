using System.Runtime.CompilerServices;
using System.Threading.Channels;

namespace Arrow.Jobs.InMemory;

public sealed class InMemoryArrowJobQueue : IArrowJobQueue
{
    private readonly Channel<Guid> _channel = Channel.CreateUnbounded<Guid>(
        new UnboundedChannelOptions { SingleReader = true });

    public ValueTask EnqueueAsync(Guid jobId, CancellationToken cancellationToken = default)
    {
        if (!_channel.Writer.TryWrite(jobId))
            throw new InvalidOperationException("Job kuyruğuna yazılamadı.");

        return ValueTask.CompletedTask;
    }

    public async IAsyncEnumerable<Guid> DequeueAllAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await foreach (Guid jobId in _channel.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
            yield return jobId;
    }
}
