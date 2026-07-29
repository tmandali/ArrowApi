using Apache.Arrow;
using Apache.Arrow.Arrays;
using Apache.Arrow.Types;
using System.Buffers;
using System.Collections.Concurrent;
using System.Collections.ObjectModel;
using System.Data.Common;
using System.Data.SqlTypes;
using System.Net;
using System.Net.NetworkInformation;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Xml;
using System.Xml.Linq;

namespace Arrow.Data;

/// <summary>DbDataReader → Arrow dönüştürme motoru. <see cref="Arrow"/> üzerinden kullanın.</summary>
internal static class ArrowExporter
{
    private static BoundedLruCache<string, ArrowTypeMapResult>? _typeCache;
    private static readonly object CacheInitLock = new();

    private static BoundedLruCache<string, ArrowTypeMapResult> GetCache(int capacity)
    {
        if (_typeCache == null || _typeCache.Capacity != capacity)
        {
            lock (CacheInitLock)
            {
                if (_typeCache == null || _typeCache.Capacity != capacity)
                    _typeCache = new BoundedLruCache<string, ArrowTypeMapResult>(capacity);
            }
        }
        return _typeCache;
    }

    /// <summary>
    /// DbDataReader verisini Arrow RecordBatch akışı olarak dönüştürür.
    /// Dispose otomatiktir; batch yalnızca o anki döngü gövdesinde geçerlidir.
    /// </summary>
    internal static IAsyncEnumerable<RecordBatch> ToRecordBatchesAsync(
        DbDataReader reader,
        ArrowConversionOptions? options = null,
        ILogger? logger = null,
        CancellationToken cancellationToken = default) =>
        ToRecordBatchesCore(reader, options, logger, cancellationToken);

    private static async IAsyncEnumerable<RecordBatch> ToRecordBatchesCore(
        DbDataReader reader,
        ArrowConversionOptions? options,
        ILogger? logger,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        RecordBatch? current = null;

        try
        {
            ThrowHelper.ThrowIfNull(reader);
            options ??= ArrowConversionOptions.Default;

            if (options.BatchSize <= 0)
                throw new ArgumentOutOfRangeException(nameof(options.BatchSize), "BatchSize 0'dan büyük olmalıdır.");

            if (options.EnableDictionaryEncoding)
                ValidateDictionaryEncodingThreshold(options.DictionaryEncodingThreshold);

            ReadOnlyCollection<DbColumn> columnSchema = DbDataReaderSchema.GetColumnSchema(reader);
            int fieldCount = columnSchema.Count;

            if (logger != null && logger.IsEnabled(LogLevel.Debug))
                logger.LogDebug("Arrow şeması oluşturuluyor...");

            bool[]? dictionaryDecisions = null;
            Schema schema;
            IColumnAccessor[] accessors;
            RecordBatch firstBatch;

            if (options.EnableDictionaryEncoding)
            {
                (dictionaryDecisions, schema, accessors, firstBatch) =
                    await BuildFirstBatchWithDictionaryProfilingAsync(reader, columnSchema, options, logger, cancellationToken)
                        .ConfigureAwait(false);
            }
            else
            {
                schema = BuildArrowSchema(columnSchema, options);
                accessors = BuildColumnAccessors(reader, schema, options);
                firstBatch = await BuildBatchAsync(reader, schema, accessors, fieldCount, options.BatchSize, cancellationToken, firstRowAlreadyRead: false)
                    .ConfigureAwait(false);
            }

            if (firstBatch.Length == 0)
            {
                current = firstBatch;
                yield return firstBatch;
                yield break;
            }

            if (logger != null && logger.IsEnabled(LogLevel.Debug))
                logger.LogDebug("Arrow şeması üretildi. Toplam alan: {FieldCount}", fieldCount);

            int batchCount = 1;
            long totalRowsRead = firstBatch.Length;

            current?.Dispose();
            current = firstBatch;
            yield return firstBatch;

            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                batchCount++;
                RecordBatch batch = await BuildBatchAsync(reader, schema, accessors, fieldCount, options.BatchSize, cancellationToken, firstRowAlreadyRead: true)
                    .ConfigureAwait(false);

                totalRowsRead += batch.Length;

                if (logger != null && logger.IsEnabled(LogLevel.Debug))
                {
                    logger.LogDebug("Batch {BatchNumber} tamamlandı. Satır sayısı: {RowCount}, Toplam okunan: {TotalRows}",
                        batchCount, batch.Length, totalRowsRead);
                }

                current?.Dispose();
                current = batch;
                yield return batch;
            }

            if (logger != null && logger.IsEnabled(LogLevel.Information))
            {
                logger.LogInformation("Dönüştürme tamamlandı. Toplam Batch: {BatchCount}, Toplam Satır: {TotalRows}", batchCount, totalRowsRead);
            }
        }
        finally
        {
            current?.Dispose();
        }
    }

    private static async Task<RecordBatch> BuildBatchAsync(
        DbDataReader reader,
        Schema schema,
        IColumnAccessor[] accessors,
        int fieldCount,
        int batchSize,
        CancellationToken cancellationToken,
        bool firstRowAlreadyRead = false)
    {
        if (!(firstRowAlreadyRead || await reader.ReadAsync(cancellationToken).ConfigureAwait(false)))
            return schema.EmptyBatch();

        IArrowArrayBuilderWrapper[] wrappers = CreateBuilderWrappers(schema, batchSize);
        int rowsInBatch = 0;

        do
        {
            for (int i = 0; i < fieldCount; i++)
                accessors[i].AppendValue(reader, wrappers[i], i);

            rowsInBatch++;
            if (rowsInBatch >= batchSize)
                break;
        } while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false));

        IArrowArray[] arrays = new IArrowArray[fieldCount];
        for (int i = 0; i < fieldCount; i++)
            arrays[i] = wrappers[i].BuildAndReset();

        return new RecordBatch(schema, arrays, rowsInBatch);
    }

    private static async Task<(bool[] DictionaryDecisions, Schema Schema, IColumnAccessor[] Accessors, RecordBatch Batch)>
        BuildFirstBatchWithDictionaryProfilingAsync(
            DbDataReader reader,
            ReadOnlyCollection<DbColumn> columnSchema,
            ArrowConversionOptions options,
            ILogger? logger,
            CancellationToken cancellationToken)
    {
        int fieldCount = columnSchema.Count;
        IArrowType[] baseTypes = new IArrowType[fieldCount];
        bool[] isStringCandidate = new bool[fieldCount];
        IColumnAccessor[] profileAccessors = new IColumnAccessor[fieldCount];

        for (int i = 0; i < fieldCount; i++)
        {
            DbColumn col = columnSchema[i];
            baseTypes[i] = ResolveBaseArrowType(col, options).ArrowType;
            isStringCandidate[i] = IsDictionaryEncodingCandidate(baseTypes[i]);
            profileAccessors[i] = CreateAccessor(col, baseTypes[i], options);
        }

        StringColumnProfiler?[] profilers = new StringColumnProfiler?[fieldCount];
        IArrowArrayBuilderWrapper[] wrappers = new IArrowArrayBuilderWrapper[fieldCount];

        for (int i = 0; i < fieldCount; i++)
        {
            if (isStringCandidate[i])
                profilers[i] = new StringColumnProfiler();
            else
                wrappers[i] = CreateWrapperForType(baseTypes[i], options.BatchSize);
        }

        int rowsInBatch = 0;
        if (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            do
            {
                for (int i = 0; i < fieldCount; i++)
                {
                    if (isStringCandidate[i])
                        AppendStringValueToProfiler(profilers[i]!, profileAccessors[i], reader, i);
                    else
                        profileAccessors[i].AppendValue(reader, wrappers[i], i);
                }

                rowsInBatch++;
                if (rowsInBatch >= options.BatchSize)
                    break;
            } while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false));
        }

        bool[] useDictionary = new bool[fieldCount];
        for (int i = 0; i < fieldCount; i++)
        {
            if (!isStringCandidate[i])
                continue;

            useDictionary[i] = profilers[i]!.ShouldUseDictionaryEncoding(options.DictionaryEncodingThreshold);

            if (logger != null && logger.IsEnabled(LogLevel.Debug))
            {
                StringColumnProfiler profiler = profilers[i]!;
                logger.LogDebug(
                    "Sütun '{ColumnName}': benzersiz={UniqueCount}, null olmayan={NonNullCount}, oran={Ratio:P1}, sözlük={UseDictionary}",
                    columnSchema[i].ColumnName,
                    profiler.UniqueCount,
                    profiler.NonNullCount,
                    profiler.CardinalityRatio,
                    useDictionary[i]);
            }
        }

        Schema schema = BuildArrowSchema(columnSchema, options, useDictionary);
        IColumnAccessor[] accessors = BuildColumnAccessors(reader, schema, options);

        if (rowsInBatch == 0)
            return (useDictionary, schema, accessors, schema.EmptyBatch());

        IArrowArray[] arrays = new IArrowArray[fieldCount];
        for (int i = 0; i < fieldCount; i++)
        {
            arrays[i] = isStringCandidate[i]
                ? profilers[i]!.BuildArray(useDictionary[i])
                : wrappers[i].BuildAndReset();
        }

        if (logger != null && logger.IsEnabled(LogLevel.Debug))
        {
            logger.LogDebug(
                "İlk batch tamamlandı. Satır: {RowCount}, sözlük kodlu sütun: {DictionaryColumnCount}",
                rowsInBatch,
                useDictionary.Count(static x => x));
        }

        return (useDictionary, schema, accessors, new RecordBatch(schema, arrays, rowsInBatch));
    }

    internal static Schema BuildArrowSchema(
        DbDataReader reader,
        ArrowConversionOptions? options = null,
        ReadOnlySpan<bool> dictionaryEncodingByColumn = default)
    {
        ThrowHelper.ThrowIfNull(reader);
        options ??= ArrowConversionOptions.Default;

        if (options.EnableDictionaryEncoding)
            ValidateDictionaryEncodingThreshold(options.DictionaryEncodingThreshold);

        ReadOnlyCollection<DbColumn> columnSchema = DbDataReaderSchema.GetColumnSchema(reader);

        if (!dictionaryEncodingByColumn.IsEmpty && dictionaryEncodingByColumn.Length != columnSchema.Count)
        {
            throw new ArgumentException(
                $"dictionaryEncodingByColumn uzunluğu ({dictionaryEncodingByColumn.Length}) sütun sayısıyla ({columnSchema.Count}) eşleşmiyor.",
                nameof(dictionaryEncodingByColumn));
        }

        return BuildArrowSchema(columnSchema, options, dictionaryEncodingByColumn);
    }

    private static Schema BuildArrowSchema(
        ReadOnlyCollection<DbColumn> columnSchema,
        ArrowConversionOptions options,
        ReadOnlySpan<bool> dictionaryEncodingByColumn = default)
    {
        Field[] fields = new Field[columnSchema.Count];

        for (int i = 0; i < columnSchema.Count; i++)
        {
            DbColumn col = columnSchema[i];
            IArrowType arrowType = ResolveBaseArrowType(col, options).ArrowType;

            if (options.EnableDictionaryEncoding
                && !dictionaryEncodingByColumn.IsEmpty
                && dictionaryEncodingByColumn[i]
                && IsDictionaryEncodingCandidate(arrowType))
            {
                arrowType = ToDictionaryStringType(arrowType);
            }

            fields[i] = CreateSchemaField(col, arrowType, options);
        }

        return new Schema(fields, CreateSchemaMetadata(options));
    }

    private static void ValidateDictionaryEncodingThreshold(double threshold)
    {
        if (threshold is < 0 or > 1)
        {
            throw new ArgumentOutOfRangeException(
                nameof(ArrowConversionOptions.DictionaryEncodingThreshold),
                threshold,
                "DictionaryEncodingThreshold 0 ile 1 arasında olmalıdır.");
        }
    }

    private static bool IsDictionaryEncodingCandidate(IArrowType arrowType) =>
        arrowType is StringType;

    private static IArrowType ToDictionaryStringType(IArrowType baseType) =>
        baseType is StringType ? new DictionaryType(Int32Type.Default, StringType.Default, false) : baseType;

    private static void AppendStringValueToProfiler(
        StringColumnProfiler profiler,
        IColumnAccessor accessor,
        DbDataReader reader,
        int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            profiler.AppendNull();
            return;
        }

        if (accessor is StringColumnAccessor)
        {
            profiler.Append(reader.GetString(ordinal));
            return;
        }

        object value = reader.GetValue(ordinal);
        profiler.Append(value switch
        {
            string s => s,
            char[] chars => new string(chars),
            null => string.Empty,
            _ => value.ToString() ?? string.Empty
        });
    }

    private sealed class StringColumnProfiler
    {
        private readonly HashSet<string> _distinct = new(StringComparer.Ordinal);
        private readonly List<string?> _values = [];
        private int _nullCount;

        public int UniqueCount => _distinct.Count;
        public int NonNullCount => _values.Count - _nullCount;
        public double CardinalityRatio => NonNullCount == 0 ? 1.0 : (double)UniqueCount / NonNullCount;

        public void Append(string value)
        {
            _distinct.Add(value);
            _values.Add(value);
        }

        public void AppendNull()
        {
            _nullCount++;
            _values.Add(null);
        }

        public bool ShouldUseDictionaryEncoding(double threshold) =>
            NonNullCount > 0 && CardinalityRatio <= threshold;

        public IArrowArray BuildArray(bool useDictionary)
        {
            if (useDictionary)
            {
                var wrapper = new DictionaryStringArrayBuilderWrapper(_values.Count);
                foreach (string? value in _values)
                {
                    if (value is null)
                        wrapper.AppendNull();
                    else
                        wrapper.Append(value);
                }

                return wrapper.BuildAndReset();
            }

            var stringWrapper = new StringArrayBuilderWrapper(_values.Count);
            foreach (string? value in _values)
            {
                if (value is null)
                    stringWrapper.AppendNull();
                else
                    stringWrapper.Append(value);
            }

            return stringWrapper.BuildAndReset();
        }
    }

    private static Field CreateSchemaField(DbColumn col, IArrowType arrowType, ArrowConversionOptions options)
    {
        Dictionary<string, string>? fieldMetadata = null;
        if (options.IncludeSchemaMetadata)
        {
            fieldMetadata = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["ProviderType"] = col.DataTypeName ?? "Unknown",
                ["AllowDBNull"] = (col.AllowDBNull ?? true).ToString(),
                ["OriginalDbType"] = col.DataType?.FullName ?? "Unknown"
            };

            if (col.NumericPrecision.HasValue)
                fieldMetadata["Precision"] = col.NumericPrecision.Value.ToString();

            if (col.NumericScale.HasValue)
                fieldMetadata["Scale"] = col.NumericScale.Value.ToString();
        }

        if (arrowType is VariantType)
            fieldMetadata ??= new Dictionary<string, string>(StringComparer.Ordinal);
        if (arrowType is VariantType)
            fieldMetadata!["ARROW:extension:name"] = VariantBatches.ExtensionName;

        ReadOnlyDictionary<string, string>? readOnlyFieldMeta = fieldMetadata != null
            ? new ReadOnlyDictionary<string, string>(fieldMetadata)
            : null;

        bool isNullable = col.AllowDBNull ?? true;
        return new Field(col.ColumnName, arrowType, isNullable, readOnlyFieldMeta);
    }

    private static ReadOnlyDictionary<string, string>? CreateSchemaMetadata(ArrowConversionOptions options)
    {
        if (!options.IncludeSchemaMetadata)
            return null;

        var schemaMeta = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["CreatedBy"] = "Arrow.Data.ArrowData",
            ["ExportTime"] = DateTimeOffset.UtcNow.ToString("o"),
            ["GeneratorVersion"] = "2.0.0-Production",
            ["ArrowVersion"] = "23.0.0"
        };

        return new ReadOnlyDictionary<string, string>(schemaMeta);
    }

    #region Internal Type Mapping Engine

    private sealed record ArrowTypeMapResult(IArrowType ArrowType, Type EffectiveClrType);

    private static ArrowTypeMapResult ResolveBaseArrowType(DbColumn col, ArrowConversionOptions options)
    {
        string providerTypeName = col.DataTypeName ?? string.Empty;
        Type clrType = col.DataType != null ? Nullable.GetUnderlyingType(col.DataType) ?? col.DataType : typeof(object);

        if (clrType == typeof(byte[]) && options.IsVariantBinaryColumn(col.ColumnName))
            return new ArrowTypeMapResult(VariantType.Default, clrType);

        string cacheKey = $"{col.ColumnName}_{providerTypeName}_{clrType.FullName}_{col.NumericPrecision}_{col.NumericScale}_{options.TimestampUnit}_{options.TimestampTimezone}_{options.UseLargeBinaryAndString}";

        BoundedLruCache<string, ArrowTypeMapResult> cache = GetCache(options.MaxCacheEntries);

        return cache.GetOrAdd(cacheKey, _ =>
        {
            IArrowType? providerType = MapByProviderTypeName(providerTypeName, col, options);
            if (providerType != null)
                return new ArrowTypeMapResult(providerType, clrType);

            IArrowType clrMappedType = MapByClrType(clrType, col, options);
            return new ArrowTypeMapResult(clrMappedType, clrType);
        });
    }

    private static IArrowType? MapByProviderTypeName(string providerTypeName, DbColumn col, ArrowConversionOptions options)
    {
        return providerTypeName.ToLowerInvariant() switch
        {
            "uniqueidentifier" or "uuid" => new FixedSizeBinaryType(16),
            "money" or "smallmoney" => new Decimal128Type(19, 4),
            "smallint" => Int16Type.Default,
            "tinyint" => UInt8Type.Default,
            "bit" => BooleanType.Default,
            "real" => FloatType.Default,
            "float" => DoubleType.Default,
            "datetime" or "smalldatetime" => new TimestampType(options.TimestampUnit, options.TimestampTimezone),
            "datetime2" or "datetimeoffset" or "timestamp with time zone" => new TimestampType(TimeUnit.Nanosecond, options.TimestampTimezone),
            "date" => Date32Type.Default,
            "time" or "interval day to second" => Time64Type.Default,
            "rowversion" or "timestamp" when col.DataType == typeof(byte[]) => new FixedSizeBinaryType(8),
            "xml" or "json" or "jsonb" or "text" or "ntext" or "mediumtext" or "longtext" or "clob" or "nclob" or "sql_variant" or "jsonpath" or "geography" or "geometry" or "hierarchyid"
                => options.UseLargeBinaryAndString ? LargeStringType.Default : StringType.Default,
            "image" or "bytea" or "blob" or "longblob" or "mediumblob" or "tinyblob" or "varbinary" or "raw" or "long raw"
                => options.UseLargeBinaryAndString ? LargeBinaryType.Default : BinaryType.Default,
            "inet" or "cidr" or "oid" or "macaddr" or "macaddr8" or "varbit" or "set" or "enum" => StringType.Default,
            "numeric" => col.NumericPrecision.HasValue && col.NumericPrecision.Value > 38
                ? new Decimal256Type(col.NumericPrecision.Value, col.NumericScale ?? 10)
                : new Decimal128Type(col.NumericPrecision ?? 38, col.NumericScale ?? 10),
            "year" => Int16Type.Default,
            _ => null
        };
    }

    private static IArrowType MapByClrType(Type type, DbColumn col, ArrowConversionOptions options)
    {
        if (type == typeof(bool)) return BooleanType.Default;
        if (type == typeof(byte)) return UInt8Type.Default;
        if (type == typeof(sbyte)) return Int8Type.Default;
        if (type == typeof(short)) return Int16Type.Default;
        if (type == typeof(ushort)) return UInt16Type.Default;
        if (type == typeof(int)) return Int32Type.Default;
        if (type == typeof(uint)) return UInt32Type.Default;
        if (type == typeof(long)) return Int64Type.Default;
        if (type == typeof(ulong)) return UInt64Type.Default;
        if (type == typeof(float)) return FloatType.Default;
        if (type == typeof(double)) return DoubleType.Default;
        if (type.IsEnum) return Int32Type.Default;

        if (type == typeof(decimal) || type == typeof(SqlDecimal) || type == typeof(SqlMoney))
        {
            int precision = col.NumericPrecision ?? 38;
            int scale = col.NumericScale ?? 10;
            return precision > 38 ? new Decimal256Type(precision, scale) : new Decimal128Type(precision, scale);
        }

        if (type == typeof(string) || type == typeof(char) || type == typeof(char[]) ||
            type == typeof(XmlDocument) || type == typeof(XDocument) || type == typeof(IPAddress) ||
            type == typeof(PhysicalAddress) || type == typeof(JsonDocument) || type == typeof(JsonElement) ||
            type == typeof(Uri) || type == typeof(Version) || type == typeof(SqlString) || type == typeof(SqlChars))
        {
            return options.UseLargeBinaryAndString ? LargeStringType.Default : StringType.Default;
        }

        if (type == typeof(Guid) || type == typeof(SqlGuid)) return new FixedSizeBinaryType(16);
        if (type == typeof(DateTime)) return new TimestampType(options.TimestampUnit, options.TimestampTimezone);
        if (type == typeof(DateTimeOffset)) return new TimestampType(options.TimestampUnit, "UTC");
        if (type == typeof(TimeSpan)
#if NET
            || type == typeof(TimeOnly)
#endif
            ) return Time64Type.Default;
#if NET
        if (type == typeof(DateOnly)) return Date32Type.Default;
#endif
        if (type == typeof(byte[]) || type == typeof(SqlBinary) || type == typeof(SqlBytes)) return options.UseLargeBinaryAndString ? LargeBinaryType.Default : BinaryType.Default;

        if (options.ThrowOnUnsupportedType)
        {
            throw new NotSupportedException($"Sütun '{col.ColumnName}' için desteklenmeyen CLR tipi '{type.FullName}' (ProviderType: {col.DataTypeName}).");
        }

        return StringType.Default;
    }

    #endregion

    #region Direct Non-Reflection Native Builders Wrappers

    private interface IArrowArrayBuilderWrapper
    {
        void AppendNull();
        IArrowArray BuildAndReset();
    }

    private interface IArrowArrayBuilderWrapper<in TValue> : IArrowArrayBuilderWrapper
    {
        void Append(TValue value);
    }

    private interface IBinaryArrowArrayBuilderWrapper : IArrowArrayBuilderWrapper
    {
        void Append(ReadOnlySpan<byte> value);
    }

    private sealed class BooleanBuilderWrapper : IArrowArrayBuilderWrapper<bool>
    {
        private readonly BooleanArray.Builder _builder;
        public BooleanBuilderWrapper(int capacity) { _builder = new BooleanArray.Builder(); _builder.Reserve(capacity); }
        public void Append(bool value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class Int8BuilderWrapper : IArrowArrayBuilderWrapper<sbyte>
    {
        private readonly Int8Array.Builder _builder;
        public Int8BuilderWrapper(int capacity) { _builder = new Int8Array.Builder(); _builder.Reserve(capacity); }
        public void Append(sbyte value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class UInt8BuilderWrapper : IArrowArrayBuilderWrapper<byte>
    {
        private readonly UInt8Array.Builder _builder;
        public UInt8BuilderWrapper(int capacity) { _builder = new UInt8Array.Builder(); _builder.Reserve(capacity); }
        public void Append(byte value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class Int16BuilderWrapper : IArrowArrayBuilderWrapper<short>
    {
        private readonly Int16Array.Builder _builder;
        public Int16BuilderWrapper(int capacity) { _builder = new Int16Array.Builder(); _builder.Reserve(capacity); }
        public void Append(short value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class UInt16BuilderWrapper : IArrowArrayBuilderWrapper<ushort>
    {
        private readonly UInt16Array.Builder _builder;
        public UInt16BuilderWrapper(int capacity) { _builder = new UInt16Array.Builder(); _builder.Reserve(capacity); }
        public void Append(ushort value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class Int32BuilderWrapper : IArrowArrayBuilderWrapper<int>
    {
        private readonly Int32Array.Builder _builder;
        public Int32BuilderWrapper(int capacity) { _builder = new Int32Array.Builder(); _builder.Reserve(capacity); }
        public void Append(int value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class UInt32BuilderWrapper : IArrowArrayBuilderWrapper<uint>
    {
        private readonly UInt32Array.Builder _builder;
        public UInt32BuilderWrapper(int capacity) { _builder = new UInt32Array.Builder(); _builder.Reserve(capacity); }
        public void Append(uint value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class Int64BuilderWrapper : IArrowArrayBuilderWrapper<long>
    {
        private readonly Int64Array.Builder _builder;
        public Int64BuilderWrapper(int capacity) { _builder = new Int64Array.Builder(); _builder.Reserve(capacity); }
        public void Append(long value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class UInt64BuilderWrapper : IArrowArrayBuilderWrapper<ulong>
    {
        private readonly UInt64Array.Builder _builder;
        public UInt64BuilderWrapper(int capacity) { _builder = new UInt64Array.Builder(); _builder.Reserve(capacity); }
        public void Append(ulong value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class FloatBuilderWrapper : IArrowArrayBuilderWrapper<float>
    {
        private readonly FloatArray.Builder _builder;
        public FloatBuilderWrapper(int capacity) { _builder = new FloatArray.Builder(); _builder.Reserve(capacity); }
        public void Append(float value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class DoubleBuilderWrapper : IArrowArrayBuilderWrapper<double>
    {
        private readonly DoubleArray.Builder _builder;
        public DoubleBuilderWrapper(int capacity) { _builder = new DoubleArray.Builder(); _builder.Reserve(capacity); }
        public void Append(double value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class Date32BuilderWrapper : IArrowArrayBuilderWrapper<DateTime>
    {
        private readonly Date32Array.Builder _builder;
        public Date32BuilderWrapper(int capacity) { _builder = new Date32Array.Builder(); _builder.Reserve(capacity); }
        public void Append(DateTime value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class Time64BuilderWrapper : IArrowArrayBuilderWrapper<long>
    {
        private readonly Time64Array.Builder _builder;
        public Time64BuilderWrapper(Time64Type type, int capacity) { _builder = new Time64Array.Builder(type); _builder.Reserve(capacity); }
        public void Append(long value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class StringArrayBuilderWrapper : IArrowArrayBuilderWrapper<string>
    {
        private readonly StringArray.Builder _builder;
        public StringArrayBuilderWrapper(int capacity) { _builder = new StringArray.Builder(); _builder.Reserve(capacity); }
        public void Append(string value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class LargeStringArrayBuilderWrapper : IArrowArrayBuilderWrapper<string>
    {
        private readonly LargeStringArray.Builder _builder;
        public LargeStringArrayBuilderWrapper(int capacity) { _builder = new LargeStringArray.Builder(); _builder.Reserve(capacity); }
        public void Append(string value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class BinaryArrayBuilderWrapper : IBinaryArrowArrayBuilderWrapper
    {
        private readonly BinaryArray.Builder _builder;
        public BinaryArrayBuilderWrapper(int capacity) { _builder = new BinaryArray.Builder(); _builder.Reserve(capacity); }
        public void Append(ReadOnlySpan<byte> value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class LargeBinaryArrayBuilderWrapper : IBinaryArrowArrayBuilderWrapper
    {
        private readonly LargeBinaryArray.Builder _builder;
        public LargeBinaryArrayBuilderWrapper(int capacity) { _builder = new LargeBinaryArray.Builder(); _builder.Reserve(capacity); }
        public void Append(ReadOnlySpan<byte> value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class FixedSizeBinaryArrayBuilder : FixedSizeBinaryArray.BuilderBase<FixedSizeBinaryArray, FixedSizeBinaryArrayBuilder>
    {
        public FixedSizeBinaryArrayBuilder(FixedSizeBinaryType type) : base(type, type.ByteWidth) { }
        protected override FixedSizeBinaryArray Build(ArrayData data) => new(data);
    }

    private sealed class FixedSizeBinaryArrayBuilderWrapper : IBinaryArrowArrayBuilderWrapper
    {
        private readonly FixedSizeBinaryArrayBuilder _builder;
        public FixedSizeBinaryArrayBuilderWrapper(FixedSizeBinaryType type, int capacity) { _builder = new FixedSizeBinaryArrayBuilder(type); _builder.Reserve(capacity); }
        public void Append(ReadOnlySpan<byte> value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class VariantBinaryBuilderWrapper : IArrowArrayBuilderWrapper
    {
        private readonly VariantArray.Builder _builder = new();

        public void AppendNull() => _builder.AppendNull();

        public void AppendPacked(ReadOnlySpan<byte> packed)
        {
            VariantBinaryFrame frame = VariantBinary.Unpack(packed);
            _builder.Append(frame.Metadata, frame.Value);
        }

        public IArrowArray BuildAndReset() => _builder.Build();
    }

    private sealed class Decimal128ArrayBuilderWrapper : IArrowArrayBuilderWrapper<decimal>
    {
        private readonly Decimal128Array.Builder _builder;
        public Decimal128ArrayBuilderWrapper(Decimal128Type type, int capacity) { _builder = new Decimal128Array.Builder(type); _builder.Reserve(capacity); }
        public void Append(decimal value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class Decimal256ArrayBuilderWrapper : IArrowArrayBuilderWrapper<decimal>
    {
        private readonly Decimal256Array.Builder _builder;
        public Decimal256ArrayBuilderWrapper(Decimal256Type type, int capacity) { _builder = new Decimal256Array.Builder(type); _builder.Reserve(capacity); }
        public void Append(decimal value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class TimestampArrayBuilderWrapper : IArrowArrayBuilderWrapper<DateTimeOffset>
    {
        private readonly TimestampArray.Builder _builder;
        public TimestampArrayBuilderWrapper(TimestampType type, int capacity) { _builder = new TimestampArray.Builder(type); _builder.Reserve(capacity); }
        public void Append(DateTimeOffset value) => _builder.Append(value);
        public void AppendNull() => _builder.AppendNull();
        public IArrowArray BuildAndReset() => _builder.Build(null);
    }

    private sealed class DictionaryStringArrayBuilderWrapper : IArrowArrayBuilderWrapper<string>
    {
        private readonly Dictionary<string, int> _valueToIndex = new(StringComparer.Ordinal);
        private readonly List<string> _dictionaryValues = [];
        private readonly List<int> _indices = [];
        private readonly List<bool> _isNull = [];

        public DictionaryStringArrayBuilderWrapper(int capacity)
        {
            _dictionaryValues.Capacity = Math.Min(capacity, 1024);
            _indices.Capacity = capacity;
            _isNull.Capacity = capacity;
        }

        public void Append(string value)
        {
            if (!_valueToIndex.TryGetValue(value, out int index))
            {
                index = _dictionaryValues.Count;
                _dictionaryValues.Add(value);
                _valueToIndex[value] = index;
            }

            _indices.Add(index);
            _isNull.Add(false);
        }

        public void AppendNull()
        {
            _indices.Add(0);
            _isNull.Add(true);
        }

        public IArrowArray BuildAndReset()
        {
            var dictionaryBuilder = new StringArray.Builder();
            dictionaryBuilder.Reserve(_dictionaryValues.Count);
            foreach (string value in _dictionaryValues)
                dictionaryBuilder.Append(value);

            var indexBuilder = new Int32Array.Builder();
            indexBuilder.Reserve(_indices.Count);
            for (int i = 0; i < _indices.Count; i++)
            {
                if (_isNull[i])
                    indexBuilder.AppendNull();
                else
                    indexBuilder.Append(_indices[i]);
            }

            var dictionaryType = new DictionaryType(Int32Type.Default, StringType.Default, false);
            return new DictionaryArray(dictionaryType, indexBuilder.Build(null), dictionaryBuilder.Build(null));
        }
    }

    private static IArrowArrayBuilderWrapper[] CreateBuilderWrappers(Schema schema, int batchSize)
    {
        int count = schema.FieldsList.Count;
        IArrowArrayBuilderWrapper[] wrappers = new IArrowArrayBuilderWrapper[count];

        for (int i = 0; i < count; i++)
        {
            wrappers[i] = CreateWrapperForType(schema.FieldsList[i].DataType, batchSize);
        }

        return wrappers;
    }

    private static IArrowArrayBuilderWrapper CreateWrapperForType(IArrowType dataType, int capacity)
    {
        return dataType switch
        {
            BooleanType => new BooleanBuilderWrapper(capacity),
            Int8Type => new Int8BuilderWrapper(capacity),
            UInt8Type => new UInt8BuilderWrapper(capacity),
            Int16Type => new Int16BuilderWrapper(capacity),
            UInt16Type => new UInt16BuilderWrapper(capacity),
            Int32Type => new Int32BuilderWrapper(capacity),
            UInt32Type => new UInt32BuilderWrapper(capacity),
            Int64Type => new Int64BuilderWrapper(capacity),
            UInt64Type => new UInt64BuilderWrapper(capacity),
            FloatType => new FloatBuilderWrapper(capacity),
            DoubleType => new DoubleBuilderWrapper(capacity),
            Date32Type => new Date32BuilderWrapper(capacity),
            Time64Type t64 => new Time64BuilderWrapper(t64, capacity),
            TimestampType ts => new TimestampArrayBuilderWrapper(ts, capacity),
            Decimal128Type d128 => new Decimal128ArrayBuilderWrapper(d128, capacity),
            Decimal256Type d256 => new Decimal256ArrayBuilderWrapper(d256, capacity),
            StringType => new StringArrayBuilderWrapper(capacity),
            LargeStringType => new LargeStringArrayBuilderWrapper(capacity),
            BinaryType => new BinaryArrayBuilderWrapper(capacity),
            LargeBinaryType => new LargeBinaryArrayBuilderWrapper(capacity),
            FixedSizeBinaryType fbin => new FixedSizeBinaryArrayBuilderWrapper(fbin, capacity),
            DictionaryType dt when dt.ValueType is StringType => new DictionaryStringArrayBuilderWrapper(capacity),
            VariantType => new VariantBinaryBuilderWrapper(),
            _ => throw new NotSupportedException($"'{dataType.Name}' türü için Arrow Builder sarmalayıcısı oluşturulamadı.")
        };
    }

    #endregion

    #region Direct Column Accessors

    private interface IColumnAccessor
    {
        void AppendValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal);
    }

    private static IColumnAccessor[] BuildColumnAccessors(DbDataReader reader, Schema schema, ArrowConversionOptions options)
    {
        ReadOnlyCollection<DbColumn> columnSchema = DbDataReaderSchema.GetColumnSchema(reader);
        IColumnAccessor[] accessors = new IColumnAccessor[schema.FieldsList.Count];

        for (int i = 0; i < accessors.Length; i++)
        {
            DbColumn col = columnSchema[i];
            IArrowType arrowType = schema.FieldsList[i].DataType;
            accessors[i] = CreateAccessor(col, arrowType, options);
        }

        return accessors;
    }

    private static IColumnAccessor CreateAccessor(DbColumn col, IArrowType arrowType, ArrowConversionOptions options)
    {
        Type type = col.DataType != null ? Nullable.GetUnderlyingType(col.DataType) ?? col.DataType : typeof(object);
        string colName = col.ColumnName;
        string providerType = col.DataTypeName ?? "Unknown";

        if (arrowType is DictionaryType) return new GenericToStringColumnAccessor(colName, providerType, type);
        if (arrowType is BooleanType) return new BooleanColumnAccessor(colName, providerType, type);
        if (arrowType is Int8Type) return new Int8ColumnAccessor(colName, providerType, type);
        if (arrowType is UInt8Type) return new UInt8ColumnAccessor(colName, providerType, type);
        if (arrowType is Int16Type) return new Int16ColumnAccessor(colName, providerType, type);
        if (arrowType is UInt16Type) return new UInt16ColumnAccessor(colName, providerType, type);
        if (arrowType is Int32Type) return new Int32ColumnAccessor(colName, providerType, type);
        if (arrowType is UInt32Type) return new UInt32ColumnAccessor(colName, providerType, type);
        if (arrowType is Int64Type) return new Int64ColumnAccessor(colName, providerType, type);
        if (arrowType is UInt64Type) return new UInt64ColumnAccessor(colName, providerType, type);
        if (arrowType is FloatType) return new FloatColumnAccessor(colName, providerType, type);
        if (arrowType is DoubleType) return new DoubleColumnAccessor(colName, providerType, type);
        if (arrowType is Decimal128Type) return new Decimal128ColumnAccessor(colName, providerType, type);
        if (arrowType is Decimal256Type) return new Decimal256ColumnAccessor(colName, providerType, type);
        if (arrowType is StringType or LargeStringType)
        {
            if (type == typeof(string)) return new StringColumnAccessor(colName, providerType, type);
            return new GenericToStringColumnAccessor(colName, providerType, type);
        }
        if (arrowType is Date32Type) return new Date32ColumnAccessor(colName, providerType, type);
        if (arrowType is Time64Type) return new Time64ColumnAccessor(colName, providerType, type);
        if (arrowType is TimestampType) return new TimestampColumnAccessor(colName, providerType, type, options.UnspecifiedDateTimeMode);
        if (arrowType is FixedSizeBinaryType) return new FixedSizeBinaryColumnAccessor(colName, providerType, type, options.GuidOrder);
        if (arrowType is BinaryType or LargeBinaryType) return new BinaryColumnAccessor(colName, providerType, type, options.SequentialAccessThresholdBytes);
        if (arrowType is VariantType) return new VariantBinaryColumnAccessor(colName, providerType, type);

        return new FallbackColumnAccessor(colName, providerType, type, options.ThrowOnUnsupportedType);
    }

    private abstract class BaseColumnAccessor : IColumnAccessor
    {
        protected readonly string ColumnName;
        protected readonly string ProviderTypeName;
        protected readonly Type ClrType;

        protected BaseColumnAccessor(string columnName, string providerTypeName, Type clrType)
        {
            ColumnName = columnName;
            ProviderTypeName = providerTypeName;
            ClrType = clrType;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public void AppendValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            if (reader.IsDBNull(ordinal))
            {
                builder.AppendNull();
                return;
            }

            try
            {
                AppendTypedValue(reader, builder, ordinal);
            }
            catch (Exception ex) when (ex is not NotSupportedException)
            {
                throw new InvalidOperationException(
                    $"Sütun '{ColumnName}' (Ordinal: {ordinal}, ProviderType: {ProviderTypeName}, CLRType: {ClrType.FullName}) dönüştürülürken hata oluştu.", ex);
            }
        }

        protected abstract void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal);
    }

    private sealed class Int32ColumnAccessor : BaseColumnAccessor
    {
        public Int32ColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            int value = ClrType.IsEnum ? Convert.ToInt32(reader.GetValue(ordinal)) : reader.GetInt32(ordinal);
            ((IArrowArrayBuilderWrapper<int>)builder).Append(value);
        }
    }

    private sealed class Int64ColumnAccessor : BaseColumnAccessor
    {
        public Int64ColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            ((IArrowArrayBuilderWrapper<long>)builder).Append(reader.GetInt64(ordinal));
        }
    }

    private sealed class DoubleColumnAccessor : BaseColumnAccessor
    {
        public DoubleColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            ((IArrowArrayBuilderWrapper<double>)builder).Append(reader.GetDouble(ordinal));
        }
    }

    private sealed class FloatColumnAccessor : BaseColumnAccessor
    {
        public FloatColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            ((IArrowArrayBuilderWrapper<float>)builder).Append(reader.GetFloat(ordinal));
        }
    }

    private sealed class BooleanColumnAccessor : BaseColumnAccessor
    {
        public BooleanColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            ((IArrowArrayBuilderWrapper<bool>)builder).Append(reader.GetBoolean(ordinal));
        }
    }

    private sealed class Int16ColumnAccessor : BaseColumnAccessor
    {
        public Int16ColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            ((IArrowArrayBuilderWrapper<short>)builder).Append(reader.GetInt16(ordinal));
        }
    }

    private sealed class UInt8ColumnAccessor : BaseColumnAccessor
    {
        public UInt8ColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            ((IArrowArrayBuilderWrapper<byte>)builder).Append(reader.GetByte(ordinal));
        }
    }

    private sealed class Int8ColumnAccessor : BaseColumnAccessor
    {
        public Int8ColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            ((IArrowArrayBuilderWrapper<sbyte>)builder).Append(reader.GetFieldValue<sbyte>(ordinal));
        }
    }

    private sealed class UInt16ColumnAccessor : BaseColumnAccessor
    {
        public UInt16ColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            ((IArrowArrayBuilderWrapper<ushort>)builder).Append(reader.GetFieldValue<ushort>(ordinal));
        }
    }

    private sealed class UInt32ColumnAccessor : BaseColumnAccessor
    {
        public UInt32ColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            ((IArrowArrayBuilderWrapper<uint>)builder).Append(reader.GetFieldValue<uint>(ordinal));
        }
    }

    private sealed class UInt64ColumnAccessor : BaseColumnAccessor
    {
        public UInt64ColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            ((IArrowArrayBuilderWrapper<ulong>)builder).Append(reader.GetFieldValue<ulong>(ordinal));
        }
    }

    private sealed class StringColumnAccessor : BaseColumnAccessor
    {
        public StringColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            ((IArrowArrayBuilderWrapper<string>)builder).Append(reader.GetString(ordinal));
        }
    }

    private sealed class GenericToStringColumnAccessor : BaseColumnAccessor
    {
        public GenericToStringColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            object val = reader.GetValue(ordinal);
            string? strVal = val switch
            {
                char[] ca => new string(ca),
                XmlDocument xml => xml.OuterXml,
                XDocument xdoc => xdoc.ToString(),
                IPAddress ip => ip.ToString(),
                JsonDocument json => json.RootElement.GetRawText(),
                JsonElement jsonElem => jsonElem.GetRawText(),
                Uri uri => uri.ToString(),
                Version ver => ver.ToString(),
                SqlString sqlStr => sqlStr.Value,
                SqlChars sqlChars => new string(sqlChars.Value),
                _ => val.ToString()
            };

            if (strVal == null) builder.AppendNull();
            else ((IArrowArrayBuilderWrapper<string>)builder).Append(strVal);
        }
    }

    private sealed class Decimal128ColumnAccessor : BaseColumnAccessor
    {
        public Decimal128ColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            decimal value = ClrType switch
            {
                Type t when t == typeof(SqlMoney) => ((SqlMoney)reader.GetValue(ordinal)).Value,
                Type t when t == typeof(SqlDecimal) => ((SqlDecimal)reader.GetValue(ordinal)).Value,
                _ => reader.GetDecimal(ordinal)
            };

            ((IArrowArrayBuilderWrapper<decimal>)builder).Append(value);
        }
    }

    private sealed class Decimal256ColumnAccessor : BaseColumnAccessor
    {
        public Decimal256ColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            decimal decVal = reader.GetDecimal(ordinal);
            ((IArrowArrayBuilderWrapper<decimal>)builder).Append(decVal);
        }
    }

    private sealed class TimestampColumnAccessor : BaseColumnAccessor
    {
        private readonly UnspecifiedDateTimeHandling _handling;

        public TimestampColumnAccessor(string columnName, string providerTypeName, Type clrType, UnspecifiedDateTimeHandling handling)
            : base(columnName, providerTypeName, clrType)
        {
            _handling = handling;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            DateTimeOffset dto;

            if (ClrType == typeof(DateTimeOffset))
            {
                dto = reader.GetFieldValue<DateTimeOffset>(ordinal);
            }
            else
            {
                DateTime dt = reader.GetDateTime(ordinal);
                if (dt.Kind == DateTimeKind.Unspecified)
                {
                    dt = _handling switch
                    {
                        UnspecifiedDateTimeHandling.AssumeUtc => DateTime.SpecifyKind(dt, DateTimeKind.Utc),
                        UnspecifiedDateTimeHandling.AssumeLocal => DateTime.SpecifyKind(dt, DateTimeKind.Local).ToUniversalTime(),
                        UnspecifiedDateTimeHandling.Throw => throw new InvalidOperationException($"Sütun '{ColumnName}' DateTimeKind.Unspecified değerine sahip."),
                        _ => DateTime.SpecifyKind(dt, DateTimeKind.Utc)
                    };
                }
                dto = new DateTimeOffset(dt.ToUniversalTime());
            }

            ((IArrowArrayBuilderWrapper<DateTimeOffset>)builder).Append(dto);
        }
    }

    private sealed class Date32ColumnAccessor : BaseColumnAccessor
    {
        public Date32ColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            DateTime dt =
#if NET
                ClrType == typeof(DateOnly)
                ? reader.GetFieldValue<DateOnly>(ordinal).ToDateTime(TimeOnly.MinValue)
                :
#endif
                reader.GetDateTime(ordinal);

            ((IArrowArrayBuilderWrapper<DateTime>)builder).Append(dt.Date);
        }
    }

    private sealed class Time64ColumnAccessor : BaseColumnAccessor
    {
        public Time64ColumnAccessor(string columnName, string providerTypeName, Type clrType) : base(columnName, providerTypeName, clrType) { }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            long ticks =
#if NET
                ClrType == typeof(TimeOnly)
                ? reader.GetFieldValue<TimeOnly>(ordinal).Ticks
                :
#endif
                reader.GetFieldValue<TimeSpan>(ordinal).Ticks;

            // Time64Type.Default birimi nanosaniye; .NET TimeSpan tick'leri 100 ns birimindedir.
            ((IArrowArrayBuilderWrapper<long>)builder).Append(checked(ticks * 100));
        }
    }

    private sealed class FixedSizeBinaryColumnAccessor : BaseColumnAccessor
    {
        private readonly GuidByteOrder _guidOrder;

        public FixedSizeBinaryColumnAccessor(string columnName, string providerTypeName, Type clrType, GuidByteOrder guidOrder)
            : base(columnName, providerTypeName, clrType)
        {
            _guidOrder = guidOrder;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            if (ClrType == typeof(Guid) || ClrType == typeof(SqlGuid))
            {
                Guid g = ClrType == typeof(SqlGuid) ? ((SqlGuid)reader.GetValue(ordinal)).Value : reader.GetGuid(ordinal);
                Span<byte> bytes = stackalloc byte[16];
                NetFxCompat.WriteGuidBytes(g, bytes);

                if (_guidOrder == GuidByteOrder.BigEndianRfc4122)
                {
                    SwapGuidByteOrder(bytes);
                }

                ((IBinaryArrowArrayBuilderWrapper)builder).Append(bytes);
            }
            else
            {
                byte[] val = (byte[])reader.GetValue(ordinal);
                ((IBinaryArrowArrayBuilderWrapper)builder).Append(val);
            }
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static void SwapGuidByteOrder(Span<byte> bytes)
        {
            (bytes[0], bytes[3]) = (bytes[3], bytes[0]);
            (bytes[1], bytes[2]) = (bytes[2], bytes[1]);
            (bytes[4], bytes[5]) = (bytes[5], bytes[4]);
            (bytes[6], bytes[7]) = (bytes[7], bytes[6]);
        }
    }

    private sealed class BinaryColumnAccessor : BaseColumnAccessor
    {
        private readonly int _chunkThreshold;

        public BinaryColumnAccessor(string columnName, string providerTypeName, Type clrType, int chunkThreshold)
            : base(columnName, providerTypeName, clrType)
        {
            _chunkThreshold = chunkThreshold;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            if (ClrType == typeof(SqlBytes) || ClrType == typeof(SqlBinary))
            {
                byte[] sqlBytesVal = ClrType == typeof(SqlBytes) ? ((SqlBytes)reader.GetValue(ordinal)).Value! : ((SqlBinary)reader.GetValue(ordinal)).Value!;
                ((IBinaryArrowArrayBuilderWrapper)builder).Append(sqlBytesVal);
                return;
            }

            long blobLength = reader.GetBytes(ordinal, 0, null, 0, 0);

            if (blobLength > _chunkThreshold)
            {
                byte[] poolBuffer = ArrayPool<byte>.Shared.Rent((int)blobLength);
                try
                {
                    reader.GetBytes(ordinal, 0, poolBuffer, 0, (int)blobLength);
                    ((IBinaryArrowArrayBuilderWrapper)builder).Append(poolBuffer.AsSpan(0, (int)blobLength));
                }
                finally
                {
                    ArrayPool<byte>.Shared.Return(poolBuffer, clearArray: false);
                }
            }
            else
            {
                byte[] data = (byte[])reader.GetValue(ordinal);
                ((IBinaryArrowArrayBuilderWrapper)builder).Append(data);
            }
        }
    }

    private sealed class VariantBinaryColumnAccessor : BaseColumnAccessor
    {
        public VariantBinaryColumnAccessor(string columnName, string providerTypeName, Type clrType)
            : base(columnName, providerTypeName, clrType)
        {
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            var variantBuilder = (VariantBinaryBuilderWrapper)builder;

            if (reader.IsDBNull(ordinal))
            {
                variantBuilder.AppendNull();
                return;
            }

            byte[] packed = (byte[])reader.GetValue(ordinal);
            if (!VariantBinary.IsPacked(packed))
            {
                throw new InvalidDataException(
                    $"Sütun '{ColumnName}' Variant binary (ARPV) frame bekliyor; magic bulunamadı.");
            }

            variantBuilder.AppendPacked(packed);
        }
    }

    private sealed class FallbackColumnAccessor : BaseColumnAccessor
    {
        private readonly bool _throwOnUnsupported;

        public FallbackColumnAccessor(string columnName, string providerTypeName, Type clrType, bool throwOnUnsupported)
            : base(columnName, providerTypeName, clrType)
        {
            _throwOnUnsupported = throwOnUnsupported;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        protected override void AppendTypedValue(DbDataReader reader, IArrowArrayBuilderWrapper builder, int ordinal)
        {
            if (_throwOnUnsupported)
            {
                throw new NotSupportedException(
                    $"Sütun '{ColumnName}' (Ordinal: {ordinal}, ProviderType: {ProviderTypeName}, CLRType: {ClrType.FullName}) Arrow veri tipine dönüştürülemedi.");
            }

            builder.AppendNull();
        }
    }

    #endregion

    #region Thread-Safe LRU Cache

    private sealed class BoundedLruCache<TKey, TValue> where TKey : notnull
    {
        private readonly int _capacity;
        private readonly ConcurrentDictionary<TKey, LinkedListNode<CacheItem>> _cache;
        private readonly LinkedList<CacheItem> _lruList = new();
        private readonly object _lock = new();

        public int Capacity => _capacity;

        public BoundedLruCache(int capacity)
        {
            _capacity = capacity;
            _cache = new ConcurrentDictionary<TKey, LinkedListNode<CacheItem>>();
        }

        public TValue GetOrAdd(TKey key, Func<TKey, TValue> valueFactory)
        {
            if (_cache.TryGetValue(key, out LinkedListNode<CacheItem>? node))
            {
                lock (_lock)
                {
                    _lruList.Remove(node);
                    _lruList.AddFirst(node);
                }
                return node.Value.Value;
            }

            TValue newValue = valueFactory(key);
            CacheItem newItem = new(key, newValue);
            LinkedListNode<CacheItem> newNode = new(newItem);

            lock (_lock)
            {
                if (_cache.Count >= _capacity)
                {
                    LinkedListNode<CacheItem>? lastNode = _lruList.Last;
                    if (lastNode != null)
                    {
                        _cache.TryRemove(lastNode.Value.Key, out _);
                        _lruList.RemoveLast();
                    }
                }

                _lruList.AddFirst(newNode);
                _cache[key] = newNode;
            }

            return newValue;
        }

        private sealed record CacheItem(TKey Key, TValue Value);
    }

    #endregion
}