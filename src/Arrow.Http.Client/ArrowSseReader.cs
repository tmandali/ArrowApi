using System.Runtime.CompilerServices;
using System.Text;

namespace Arrow.Http.Client;

/// <summary>Taşınabilir SSE öğesi (<c>System.Net.ServerSentEvents</c> bağımlılığı yok).</summary>
public readonly struct ArrowSseItem<T>
{
    /// <summary>Yeni bir <see cref="ArrowSseItem{T}"/> örneği oluşturur.</summary>
    /// <param name="data">SSE veri içeriği.</param>
    /// <param name="eventType">İsteğe bağlı SSE olay türü.</param>
    public ArrowSseItem(T data, string? eventType = null)
    {
        Data = data;
        EventType = eventType;
    }

    /// <summary>SSE veri gövdesi.</summary>
    public T Data { get; }

    /// <summary>SSE olay adı (ör. <c>status</c>, <c>completed</c>).</summary>
    public string? EventType { get; }
}

/// <summary>Minimal SSE satır parser'ı (event / data / yorum / boş satır).</summary>
internal static class ArrowSseReader
{
    public static async IAsyncEnumerable<ArrowSseItem<string>> ReadAsync(
        Stream stream,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        using StreamReader reader = new(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 1024, leaveOpen: true);

        string? eventType = null;
        StringBuilder data = new();
        bool hasData = false;

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
#if NET
            string? line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
#else
            string? line = await reader.ReadLineAsync().ConfigureAwait(false);
#endif
            if (line is null)
            {
                if (hasData)
                    yield return new ArrowSseItem<string>(data.ToString(), eventType);
                yield break;
            }

            if (line.Length == 0)
            {
                if (hasData)
                {
                    yield return new ArrowSseItem<string>(data.ToString(), eventType);
                    eventType = null;
                    data.Clear();
                    hasData = false;
                }

                continue;
            }

            if (line[0] == ':')
                continue;

            int colon = line.IndexOf(':');
            string field;
            string value;
            if (colon < 0)
            {
                field = line;
                value = string.Empty;
            }
            else
            {
                field = line.Substring(0, colon);
                value = colon + 1 < line.Length && line[colon + 1] == ' '
                    ? line.Substring(colon + 2)
                    : line.Substring(colon + 1);
            }

            if (string.Equals(field, "event", StringComparison.Ordinal))
            {
                eventType = value;
            }
            else if (string.Equals(field, "data", StringComparison.Ordinal))
            {
                if (hasData)
                    data.Append('\n');
                data.Append(value);
                hasData = true;
            }
        }
    }
}
