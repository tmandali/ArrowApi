using System.Data.Common;
using Apache.Arrow;
using Apache.Arrow.Ipc;
using Apache.Arrow.Types;

namespace Arrow.Data;

/// <summary>
/// Unspecified DateTime değerlerinin dönüştürülme stratejisini belirler.
/// </summary>
public enum UnspecifiedDateTimeHandling
{
    AssumeUtc = 0,
    AssumeLocal = 1,
    Throw = 2
}

/// <summary>
/// GUID bayt sırasının Arrow spesifikasyonuyla olan uyumunu tanımlar.
/// </summary>
public enum GuidByteOrder
{
    Native = 0,
    BigEndianRfc4122 = 1
}

/// <summary>
/// DbDataReader ↔ Apache Arrow dönüştürme konfigürasyonu.
/// </summary>
public sealed class ArrowConversionOptions
{
    public int BatchSize { get; init; } = 10_000;
    public TimeUnit TimestampUnit { get; init; } = TimeUnit.Microsecond;
    public string TimestampTimezone { get; init; } = "UTC";
    public UnspecifiedDateTimeHandling UnspecifiedDateTimeMode { get; init; } = UnspecifiedDateTimeHandling.AssumeUtc;
    public GuidByteOrder GuidOrder { get; init; } = GuidByteOrder.Native;
    public bool EnableDictionaryEncoding { get; init; } = false;

    /// <summary>
    /// Sözlük kodlaması için benzersiz değer oranı eşiği (0–1).
    /// İlk batch'te hesaplanan oran (benzersiz / null olmayan) bu değere eşit veya küçükse sözlük kodlaması uygulanır.
    /// </summary>
    public double DictionaryEncodingThreshold { get; init; } = 0.20;
    public bool ThrowOnUnsupportedType { get; init; } = true;
    public int SequentialAccessThresholdBytes { get; init; } = 81_920;
    public bool IncludeSchemaMetadata { get; init; } = true;
    public bool UseLargeBinaryAndString { get; init; } = false;
    public int MaxCacheEntries { get; init; } = 1_000;

    /// <summary>
    /// <c>varbinary</c> olarak saklanan ve <see cref="VariantBinary"/> frame içeren kolon adları (Db → Arrow).
    /// </summary>
    public IReadOnlySet<string>? VariantBinaryColumnNames { get; init; }

    internal bool IsVariantBinaryColumn(string columnName)
    {
        if (VariantBinaryColumnNames is null)
            return false;

        foreach (string name in VariantBinaryColumnNames)
        {
            if (string.Equals(name, columnName, StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }

    public static ArrowConversionOptions Default { get; } = new();
}

/// <summary>Apache Arrow columnar API — IPC stream ve isteğe bağlı <see cref="DbDataReader"/> export.</summary>
public static class ArrowData
{
    /// <summary>Arrow IPC stream → columnar batch reader.</summary>
    public static ArrowBatchReader OpenArrowReader(
        Stream stream,
        bool leaveOpen = false,
        VariantDbRepresentation variantDbMode = VariantDbRepresentation.VariantValue)
    {
        ArgumentNullException.ThrowIfNull(stream);
        return ArrowBatchReader.FromArrow(
            new ArrowDataReader(new ArrowStreamReader(stream), ownsReader: !leaveOpen, variantDbMode));
    }

    /// <summary>
    /// <see cref="DbDataReader"/> → columnar batch reader.
    /// Alttaki <paramref name="reader"/> dispose edilmez; çağıran sahipliğini korur.
    /// </summary>
    public static ArrowBatchReader OpenArrowReader(DbDataReader reader, ArrowConversionOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(reader);
        options ??= ArrowConversionOptions.Default;

        Schema? schema = options.EnableDictionaryEncoding
            ? null
            : ArrowExporter.BuildArrowSchema(reader, options);

        return ArrowBatchReader.FromDb(reader, options, schema);
    }
}
