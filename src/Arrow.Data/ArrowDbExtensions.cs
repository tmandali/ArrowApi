using System.Data.Common;

namespace Arrow.Data;

/// <summary><see cref="DbDataReader"/> için Arrow extension'ları.</summary>
public static class ArrowDbExtensions
{
    /// <summary>Columnar batch reader açar. Alttaki reader dispose edilmez.</summary>
    public static ArrowBatchReader OpenArrowReader(this DbDataReader reader, ArrowConversionOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(reader);
        return ArrowData.OpenArrowReader(reader, options);
    }

    /// <summary>DbDataReader verisini Arrow IPC stream olarak yazar.</summary>
    public static Task WriteBatchesAsync(
        this DbDataReader reader,
        Stream outputStream,
        ArrowConversionOptions? options = null,
        bool leaveOpen = false,
        ILogger? logger = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(reader);
        ArgumentNullException.ThrowIfNull(outputStream);

        ArrowBatchReader batchReader = reader.OpenArrowReader(options);
        return batchReader.WriteBatchesAsync(outputStream, leaveOpen, logger, cancellationToken);
    }
}
