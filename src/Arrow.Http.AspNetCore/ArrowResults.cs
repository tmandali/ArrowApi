using Apache.Arrow;
using System.Data;
using System.Data.Common;

namespace Arrow.Http.AspNetCore;

/// <summary>Arrow IPC <see cref="IResult"/> fabrikası.</summary>
public static class ArrowResults
{
    /// <summary>
    /// <see cref="DataTable"/> verisini Arrow IPC stream olarak yazar; tablo sahiplenilir ve dispose edilir.
    /// </summary>
    public static IResult FromDataTable(
        DataTable table,
        ArrowConversionOptions? options = null) =>
        new ArrowDataTableResult(table, options);

    /// <summary>
    /// <see cref="DbDataReader"/> verisini Arrow IPC stream olarak yazar.
    /// <paramref name="close"/> <see langword="true"/> ise yazım sonrası reader dispose edilir
    /// (<c>CommandBehavior.CloseConnection</c> benzeri). <see langword="false"/> ise çağıran
    /// <c>await using</c> ile yönetir. <see cref="DataTable"/> için <see cref="FromDataTable"/> kullanın.
    /// </summary>
    public static IResult FromDb(
        DbDataReader reader,
        ArrowConversionOptions? options = null,
        bool close = true) =>
        new ArrowDbDataReaderResult(reader, options, close);

    /// <summary>
    /// <see cref="FromDb"/> sonucunu yanıta yazar. <c>await response.WriteArrowFromDbAsync(reader)</c> kısayolu için
    /// <see cref="ArrowHttpExtensions.WriteArrowFromDbAsync"/> kullanın.
    /// </summary>
    public static Task FromDb(
        HttpResponse response,
        DbDataReader reader,
        ArrowConversionOptions? options = null,
        bool close = true) =>
        FromDb(reader, options, close).ExecuteAsync(response.HttpContext);

    /// <summary>Columnar reader verisini Arrow IPC stream olarak yazar.</summary>
    public static IResult FromReader(ArrowBatchReader reader, bool disposeReader = true) =>
        new ArrowBatchReaderResult(reader, disposeReader);

    /// <summary>Batch akışını doğrudan Arrow IPC stream olarak yazar (bellek tamponu yok).</summary>
    public static IResult FromBatches(IAsyncEnumerable<RecordBatch> batches) =>
        new ArrowBatchesResult(batches);
}
