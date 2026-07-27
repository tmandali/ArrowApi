using Apache.Arrow;
using Apache.Arrow.Scalars.Variant;
using System.Buffers.Binary;

namespace Arrow.Data;

/// <summary>Paketlenmiş Variant frame'den ayrılmış metadata + value görünümü.</summary>
public readonly ref struct VariantBinaryFrame
{
    public readonly ReadOnlySpan<byte> Metadata;
    public readonly ReadOnlySpan<byte> Value;

    public VariantBinaryFrame(ReadOnlySpan<byte> metadata, ReadOnlySpan<byte> value)
    {
        Metadata = metadata;
        Value = value;
    }
}

/// <summary>
/// Parquet Variant binary satır formatı — DB <c>varbinary</c> staging için.
/// <see cref="VariantArray"/> / <see cref="VariantReader"/> span'lerinden tek kopyayla paketlenir;
/// geri okumada <see cref="VariantArray.Builder.Append(ReadOnlySpan{byte}, ReadOnlySpan{byte})"/> ile native encode kullanılır.
/// </summary>
public static class VariantBinary
{
    private static readonly byte[] MagicBytes = [(byte)'A', (byte)'R', (byte)'P', (byte)'V'];

    /// <summary>Magic: <c>ARPV</c> (Arrow Parquet Variant).</summary>
    public static ReadOnlySpan<byte> Magic => MagicBytes;

    /// <summary>Header: magic (4) + metadata length int32 LE (4).</summary>
    public const int HeaderSize = 8;

    /// <summary>Paketli <c>varbinary</c> blob mu?</summary>
    public static bool IsPacked(ReadOnlySpan<byte> data) =>
        data.Length >= HeaderSize && data[..4].SequenceEqual(Magic);

    /// <summary><see cref="VariantReader"/> span'lerinden paketler (ek kopya yok).</summary>
    public static byte[] Pack(VariantReader reader) => Pack(reader.Metadata, reader.Value);

    /// <summary><see cref="VariantArray"/> satırından paketler — <see cref="VariantArray.GetMetadataBytes"/> / <see cref="VariantArray.GetValueBytes"/>.</summary>
    public static byte[] Pack(VariantArray array, int rowIndex)
    {
        ThrowHelper.ThrowIfNull(array);
        if (array.IsNull(rowIndex))
            throw new InvalidOperationException("Null variant satırı paketlenemez.");

        return Pack(array.GetMetadataBytes(rowIndex), array.GetValueBytes(rowIndex));
    }

    /// <summary>Ham Parquet Variant metadata + value span'lerini tek <c>byte[]</c> frame'e yazar.</summary>
    public static byte[] Pack(ReadOnlySpan<byte> metadata, ReadOnlySpan<byte> value)
    {
        byte[] packed = new byte[HeaderSize + metadata.Length + value.Length];
        Magic.CopyTo(packed);
        BinaryPrimitives.WriteInt32LittleEndian(packed.AsSpan(4), metadata.Length);
        metadata.CopyTo(packed.AsSpan(HeaderSize));
        value.CopyTo(packed.AsSpan(HeaderSize + metadata.Length));
        return packed;
    }

    /// <summary>Paketli blob'u metadata + value span'lerine ayırır (view; ek decode yok).</summary>
    public static VariantBinaryFrame Unpack(ReadOnlySpan<byte> packed)
    {
        if (!IsPacked(packed))
            throw new InvalidDataException("Geçersiz Variant binary frame (ARPV magic bekleniyor).");

        int metadataLength = BinaryPrimitives.ReadInt32LittleEndian(packed.Slice(4, 4));
        if (metadataLength < 0 || HeaderSize + metadataLength > packed.Length)
            throw new InvalidDataException("Geçersiz Variant binary metadata uzunluğu.");

        return new VariantBinaryFrame(
            packed.Slice(HeaderSize, metadataLength),
            packed.Slice(HeaderSize + metadataLength));
    }

    /// <summary>Paketli blob'u doğrular ve <see cref="VariantReader"/> döndürür (zero-copy view).</summary>
    public static VariantReader OpenReader(ReadOnlySpan<byte> packed)
    {
        VariantBinaryFrame frame = Unpack(packed);
        return new VariantReader(frame.Metadata, frame.Value);
    }

    /// <summary>Paketli satırları <see cref="VariantArray"/>'e ekler.</summary>
    public static VariantArray.Builder AppendPacked(VariantArray.Builder builder, ReadOnlySpan<byte> packed)
    {
        ThrowHelper.ThrowIfNull(builder);
        VariantBinaryFrame frame = Unpack(packed);
        return builder.Append(frame.Metadata, frame.Value);
    }
}

/// <summary>
/// DbDataReader Variant kolon çıktısı: materialize <see cref="VariantValue"/> veya native binary frame.
/// </summary>
public enum VariantDbRepresentation
{
    /// <summary>Arrow içi okuma — <see cref="VariantValue"/>.</summary>
    VariantValue = 0,

    /// <summary>SqlBulkCopy / <c>varbinary</c> — <see cref="VariantBinary"/> frame (<c>byte[]</c>).</summary>
    Binary = 1,
}
