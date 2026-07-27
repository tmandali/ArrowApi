using System.Net.Http.Headers;

namespace Arrow.Http.Client;

/// <summary>HttpResponseMessage yaşam süresini stream dispose ile bağlar.</summary>
internal sealed class HttpResponseLeaseStream : Stream
{
    private readonly HttpResponseMessage _response;
    private readonly Stream _inner;
    private bool _disposed;

    public HttpResponseLeaseStream(HttpResponseMessage response, Stream inner)
    {
        _response = response;
        _inner = inner;
    }

    public override bool CanRead => !_disposed && _inner.CanRead;
    public override bool CanSeek => !_disposed && _inner.CanSeek;
    public override bool CanWrite => !_disposed && _inner.CanWrite;
    public override long Length => _inner.Length;
    public override long Position { get => _inner.Position; set => _inner.Position = value; }

    public override void Flush() => _inner.Flush();
    public override int Read(byte[] buffer, int offset, int count) => _inner.Read(buffer, offset, count);
    public override long Seek(long offset, SeekOrigin origin) => _inner.Seek(offset, origin);
    public override void SetLength(long value) => _inner.SetLength(value);
    public override void Write(byte[] buffer, int offset, int count) => _inner.Write(buffer, offset, count);

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
        await _inner.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);

    protected override void Dispose(bool disposing)
    {
        if (!_disposed && disposing)
        {
            _inner.Dispose();
            _response.Dispose();
            _disposed = true;
        }

        base.Dispose(disposing);
    }
}
