using System.Net;
using System.Net.Http.Headers;
using Arrow.Data;

namespace Arrow.Http.Client;

/// <summary>Arrow IPC batch'lerini HTTP gövdesine akıtan <see cref="HttpContent"/>.</summary>
internal sealed class ArrowStreamHttpContent : HttpContent
{
    private readonly ArrowBatchReader _source;

    public ArrowStreamHttpContent(ArrowBatchReader source)
    {
        ArgumentNullException.ThrowIfNull(source);
        _source = source;
        Headers.ContentType = new MediaTypeHeaderValue(ArrowMediaTypes.Stream);
    }

    protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context) =>
        _source.WriteBatchesAsync(stream, leaveOpen: true);

    protected override bool TryComputeLength(out long length)
    {
        length = 0;
        return false;
    }
}
