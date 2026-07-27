namespace Arrow.Http.Client;

internal static class HttpContentCompat
{
    public static Task<Stream> ReadAsStreamAsync(HttpContent content, CancellationToken cancellationToken)
    {
        ThrowHelper.ThrowIfNull(content);
        cancellationToken.ThrowIfCancellationRequested();
#if NET
        return content.ReadAsStreamAsync(cancellationToken);
#else
        return content.ReadAsStreamAsync();
#endif
    }
}
