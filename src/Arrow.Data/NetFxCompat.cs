namespace Arrow.Data;

internal static class NetFxCompat
{
    public const long TicksPerMicrosecond = 10;

    public static Guid GuidFromBytes(ReadOnlySpan<byte> bytes)
    {
#if NET
        return new Guid(bytes);
#else
        return new Guid(bytes.ToArray());
#endif
    }

    public static void WriteGuidBytes(Guid value, Span<byte> destination)
    {
#if NET
        value.TryWriteBytes(destination);
#else
        byte[] array = value.ToByteArray();
        array.AsSpan().CopyTo(destination);
#endif
    }
}
