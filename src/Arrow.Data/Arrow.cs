using Apache.Arrow;
using Apache.Arrow.Ipc;
using Apache.Arrow.Types;
using System.Data.Common;

namespace Arrow.Data;

/// <summary>
/// Unspecified DateTime değerlerinin dönüştürülme stratejisini belirler.
/// </summary>
public enum UnspecifiedDateTimeHandling
{
    /// <summary>Unspecified DateTime değerlerini UTC olarak varsayar.</summary>
    AssumeUtc = 0,
    /// <summary>Unspecified DateTime değerlerini yerel saat (Local) olarak varsayar.</summary>
    AssumeLocal = 1,
    /// <summary>Unspecified DateTime değeriyle karşılaşıldığında istisna fırlatır.</summary>
    Throw = 2
}

/// <summary>
/// GUID bayt sırasının Arrow spesifikasyonuyla olan uyumunu tanımlar.
/// </summary>
public enum GuidByteOrder
{
    /// <summary>Yerel mimari bayt sırasını kullanır.</summary>
    Native = 0,
    /// <summary>RFC 4122 standardına uygun Big-Endian bayt sırasını kullanır.</summary>
    BigEndianRfc4122 = 1
}

/// <summary>
/// DbDataReader ↔ Apache Arrow dönüştürme konfigürasyonu.
/// </summary>
public sealed class ArrowConversionOptions
{
    /// <summary>Her bir RecordBatch içinde yer alacak maksimum satır sayısı.</summary>
    public int BatchSize { get; init; } = 10_000;

    /// <summary>Zaman damgası (timestamp) hassasiyet birimi.</summary>
    public TimeUnit TimestampUnit { get; init; } = TimeUnit.Microsecond;

    /// <summary>Zaman damgası saat dilimi string bilgisi (ör. "UTC").</summary>
    public string TimestampTimezone { get; init; } = "UTC";

    /// <summary>Unspecified DateTime modunun ele alınma stratejisi.</summary>
    public UnspecifiedDateTimeHandling UnspecifiedDateTimeMode { get; init; } = UnspecifiedDateTimeHandling.AssumeUtc;

    /// <summary>GUID bayt sırası stratejisi.</summary>
    public GuidByteOrder GuidOrder { get; init; } = GuidByteOrder.Native;

    /// <summary>Metin kolonları için sözlük kodlaması (Dictionary Encoding) uygulanıp uygulanmayacağını belirler.</summary>
    public bool EnableDictionaryEncoding { get; init; } = false;

    /// <summary>
    /// Sözlük kodlaması için benzersiz değer oranı eşiği (0–1).
    /// İlk batch'te hesaplanan oran (benzersiz / null olmayan) bu değere eşit veya küçükse sözlük kodlaması uygulanır.
    /// </summary>
    public double DictionaryEncodingThreshold { get; init; } = 0.20;

    /// <summary>Desteklenmeyen bir Db tipiyle karşılaşıldığında istisna fırlatılıp fırlatılmayacağı.</summary>
    public bool ThrowOnUnsupportedType { get; init; } = true;

    /// <summary>Ardışık erişim (Sequential Access) modunda tampon eşik boyutu (bayt).</summary>
    public int SequentialAccessThresholdBytes { get; init; } = 81_920;

    /// <summary>Arrow şemasına ADO.NET metadata bilgilerinin eklenip eklenmeyeceği.</summary>
    public bool IncludeSchemaMetadata { get; init; } = true;

    /// <summary>Metin ve ikili veriler için LargeBinary/LargeString türlerinin kullanılıp kullanılmayacağı.</summary>
    public bool UseLargeBinaryAndString { get; init; } = false;

    /// <summary>Tip eşleme önbelleği için maksimum girdi sayısı.</summary>
    public int MaxCacheEntries { get; init; } = 1_000;

    /// <summary>
    /// <c>varbinary</c> olarak saklanan ve <see cref="VariantBinary"/> frame içeren kolon adları (Db → Arrow).
    /// </summary>
    public IReadOnlyCollection<string>? VariantBinaryColumnNames { get; init; }

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

    /// <summary>Varsayılan <see cref="ArrowConversionOptions"/> konfigürasyonu.</summary>
    public static ArrowConversionOptions Default { get; } = new();
}

/// <summary>Apache Arrow columnar API — IPC stream ve isteğe bağlı <see cref="DbDataReader"/> export.</summary>
public static class ArrowData
{
    /// <summary>Arrow IPC stream → columnar batch reader.</summary>
    /// <param name="stream">Arrow IPC formatındaki veri akışı.</param>
    /// <param name="leaveOpen"><see langword="true"/> ise alt akış dispose edilmez.</param>
    /// <param name="variantDbMode">Variant kolonlar için DB temsil modu.</param>
    /// <returns>Dönüştürülmüş <see cref="ArrowBatchReader"/> nesnesi.</returns>
    public static ArrowBatchReader OpenArrowReader(
        Stream stream,
        bool leaveOpen = false,
        VariantDbRepresentation variantDbMode = VariantDbRepresentation.VariantValue)
    {
        ThrowHelper.ThrowIfNull(stream);
        return ArrowBatchReader.FromArrow(
            new ArrowDataReader(new ArrowStreamReader(stream), ownsReader: !leaveOpen, variantDbMode));
    }

    /// <summary>
    /// <see cref="DbDataReader"/> → columnar batch reader.
    /// Alttaki <paramref name="reader"/> dispose edilmez; çağıran sahipliğini korur.
    /// </summary>
    /// <param name="reader">Kaynak veritabanı veri okuyucusu.</param>
    /// <param name="options">Dönüştürme seçenekleri.</param>
    /// <returns>Dönüştürülmüş <see cref="ArrowBatchReader"/> nesnesi.</returns>
    public static ArrowBatchReader OpenArrowReader(DbDataReader reader, ArrowConversionOptions? options = null)
    {
        ThrowHelper.ThrowIfNull(reader);
        options ??= ArrowConversionOptions.Default;

        Schema? schema = options.EnableDictionaryEncoding
            ? null
            : ArrowExporter.BuildArrowSchema(reader, options);

        return ArrowBatchReader.FromDb(reader, options, schema);
    }
}
