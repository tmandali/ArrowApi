using Apache.Arrow;
using Apache.Arrow.Ipc;
using System.Data.Common;
using System.Runtime.CompilerServices;

namespace Arrow.Data;

/// <summary>Columnar batch kaynağı — Arrow IPC stream veya <see cref="DbDataReader"/>.</summary>
public sealed class ArrowBatchReader : IAsyncDisposable
{
    private readonly ArrowDataReader? _arrowReader;
    private readonly DbDataReader? _dbReader;
    private readonly ArrowConversionOptions? _dbOptions;
    private Schema? _dbSchema;
    private IAsyncEnumerator<RecordBatch>? _dbBatchEnumerator;

    private ArrowBatchReader(ArrowDataReader arrowReader)
    {
        _arrowReader = arrowReader;
    }

    private ArrowBatchReader(DbDataReader dbReader, ArrowConversionOptions options, Schema? schema)
    {
        _dbReader = dbReader;
        _dbOptions = options;
        _dbSchema = schema;
    }

    /// <summary>Arrow şeması. Dictionary encoding etkinse şema önceden bilinmeyebilir.</summary>
    public Schema Schema => _arrowReader?.Schema
        ?? _dbSchema
        ?? throw new InvalidOperationException(
            "Şema henüz belirlenmedi. EnableDictionaryEncoding etkin veya henüz batch okunmadı.");

    /// <summary>Alttaki Arrow reader (IPC stream kaynağında). Db kaynaklı reader'da <see langword="null"/>.</summary>
    public ArrowDataReader? ArrowReader => _arrowReader;

    /// <summary>IPC stream kaynağındaki ADO.NET reader. Db kaynaklı batch reader'da hata fırlatır.</summary>
    public ArrowDataReader RequireArrowReader() =>
        _arrowReader ?? throw new InvalidOperationException(
            "Bu ArrowBatchReader bir DbDataReader kaynağından oluşturuldu. " +
            "ArrowDataReader yalnızca Arrow IPC stream kaynağında kullanılabilir.");

    internal static ArrowBatchReader FromArrow(ArrowDataReader arrowReader) => new(arrowReader);

    /// <summary><see cref="ArrowDataReader"/> kaynaklı bir <see cref="ArrowBatchReader"/> oluşturur.</summary>
    public static ArrowBatchReader FromArrowReader(ArrowDataReader arrowReader) => new(arrowReader);

    internal static ArrowBatchReader FromDb(DbDataReader dbReader, ArrowConversionOptions options, Schema? schema) =>
        new(dbReader, options, schema);

    /// <summary>Batch'leri akış olarak okur. Kayıt yoksa şemalı 0 satırlık bir batch döner. Dispose otomatiktir; batch yalnızca o anki döngü gövdesinde geçerlidir.</summary>
    public IAsyncEnumerable<RecordBatch> ReadBatchesAsync(
        CancellationToken cancellationToken = default,
        ILogger? logger = null) =>
        ReadBatchesCore(cancellationToken, logger);

    /// <summary>
    /// Sonraki <see cref="RecordBatch"/>'i döndürür.
    /// Db kaynaklı reader için <see cref="ReadNextBatchAsync"/> kullanın.
    /// </summary>
    public RecordBatch? ReadNextBatch(ILogger? logger = null)
    {
        if (_arrowReader is not null)
            return _arrowReader.ReadNextBatch();

        throw new InvalidOperationException(
            "DbDataReader kaynağı için ReadNextBatchAsync kullanın.");
    }

    /// <summary><see cref="ReadNextBatch"/> asenkron karşılığı.</summary>
    public ValueTask<RecordBatch?> ReadNextBatchAsync(
        CancellationToken cancellationToken = default,
        ILogger? logger = null)
    {
        if (_arrowReader is not null)
            return _arrowReader.ReadNextBatchAsync(cancellationToken);

        return ReadNextDbBatchAsync(cancellationToken, logger);
    }

    private async IAsyncEnumerable<RecordBatch> ReadBatchesCore(
        [EnumeratorCancellation] CancellationToken cancellationToken = default,
        ILogger? logger = null)
    {
        while (true)
        {
            RecordBatch? batch = await ReadNextBatchAsync(cancellationToken, logger).ConfigureAwait(false);
            if (batch is null)
                yield break;

            yield return batch;
        }
    }

    private async ValueTask<RecordBatch?> ReadNextDbBatchAsync(
        CancellationToken cancellationToken,
        ILogger? logger)
    {
        _dbBatchEnumerator ??= ArrowExporter
            .ToRecordBatchesAsync(_dbReader!, _dbOptions, logger, cancellationToken)
            .GetAsyncEnumerator(cancellationToken);

        if (!await _dbBatchEnumerator.MoveNextAsync().ConfigureAwait(false))
            return null;

        RecordBatch batch = _dbBatchEnumerator.Current;
        _dbSchema ??= batch.Schema;
        return batch;
    }

    /// <summary>Şemayla Arrow IPC writer açar.</summary>
    public ArrowStreamWriter OpenArrowWriter(Stream stream, bool leaveOpen = false)
    {
        ThrowHelper.ThrowIfNull(stream);
        return new ArrowStreamWriter(stream, Schema, leaveOpen);
    }

    /// <summary>Batch'leri Arrow IPC stream olarak yazar.</summary>
    public async Task WriteBatchesAsync(
        Stream outputStream,
        bool leaveOpen = false,
        ILogger? logger = null,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(outputStream);

        if (_dbReader is not null && _dbOptions!.EnableDictionaryEncoding)
        {
            await WriteDictionaryEncodedDbBatchesAsync(outputStream, leaveOpen, logger, cancellationToken)
                .ConfigureAwait(false);
            return;
        }

        using ArrowStreamWriter writer = OpenArrowWriter(outputStream, leaveOpen);
        await writer.WriteBatchesAsync(ReadBatchesAsync(cancellationToken, logger), cancellationToken)
            .ConfigureAwait(false);
    }

    /// <summary>Batch'leri <see cref="ArrowStreamWriter"/>'a yazar.</summary>
    public Task WriteBatchesAsync(
        ArrowStreamWriter writer,
        ILogger? logger = null,
        CancellationToken cancellationToken = default)
    {
        ThrowHelper.ThrowIfNull(writer);
        return writer.WriteBatchesAsync(ReadBatchesAsync(cancellationToken, logger), cancellationToken);
    }

    private async Task WriteDictionaryEncodedDbBatchesAsync(
        Stream outputStream,
        bool leaveOpen,
        ILogger? logger,
        CancellationToken cancellationToken)
    {
        ArrowStreamWriter? writer = null;
        bool wroteBatch = false;

        try
        {
            await foreach (RecordBatch batch in ArrowExporter.ToRecordBatchesAsync(_dbReader!, _dbOptions, logger, cancellationToken)
                               .ConfigureAwait(false))
            {
                writer ??= new ArrowStreamWriter(outputStream, batch.Schema, leaveOpen);
                await writer.WriteRecordBatchAsync(batch, cancellationToken).ConfigureAwait(false);
                wroteBatch = true;
            }

            if (writer is null)
            {
                Schema emptySchema = ArrowExporter.BuildArrowSchema(_dbReader!, _dbOptions);
                writer = new ArrowStreamWriter(outputStream, emptySchema, leaveOpen);
                await writer.WriteBatchesAsync([], cancellationToken)
                    .ConfigureAwait(false);
                return;
            }

            await writer.WriteEndAsync(cancellationToken).ConfigureAwait(false);

            if (!wroteBatch && logger != null && logger.IsEnabled(LogLevel.Debug))
                logger.LogDebug("Boş sonuç kümesi için şema yazıldı.");
        }
        finally
        {
            writer?.Dispose();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_dbBatchEnumerator is not null)
            await _dbBatchEnumerator.DisposeAsync().ConfigureAwait(false);

        if (_arrowReader is not null)
            await _arrowReader.DisposeAsync().ConfigureAwait(false);
    }
}
