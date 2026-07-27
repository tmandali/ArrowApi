using System.Collections;
using System.Collections.ObjectModel;
using System.Data;
using System.Data.Common;
using System.Runtime.CompilerServices;
using Apache.Arrow;
using Apache.Arrow.Arrays;
using Apache.Arrow.Ipc;
using Apache.Arrow.Scalars.Variant;
using Apache.Arrow.Types;

namespace Arrow.Data;

/// <summary>
/// Apache Arrow IPC Stream'lerini ADO.NET <see cref="DbDataReader"/> arayüzüne bağlayan,
/// bellek tahsisini ve boxing işlemlerini minimize eden üretim seviyesi DataReader.
/// </summary>
/// <remarks>
/// THREAD SAFETY: Bu sınıf Thread-Safe DEĞİLDİR (Thread-Compatible). Standart DbDataReader davranışına uygun olarak
/// aynı eşzamanlı örnek (instance) üzerinde birden fazla thread üzerinden okuma yapılmamalıdır.
/// </remarks>
public sealed class ArrowDataReader : DbDataReader, IDbColumnSchemaGenerator
{
    private readonly ArrowStreamReader _reader;
    private readonly Schema _schema;
    private readonly Dictionary<string, int> _ordinals;
    private readonly bool _ownsReader;

    private RecordBatch? _batch;
    private RecordBatch? _columnarBatch;
    private IArrowArray[] _columns = [];

    private int _rowIndex = -1;
    private bool _isClosed;
    private bool _endOfStream;
    private bool _initialized;
    private bool _columnarMode;
    private bool _rowMode;

    // Immutable Şema Önbelleği
    private DataTable? _cachedSchemaTable;
    private ReadOnlyCollection<DbColumn>? _cachedColumnSchema;

    /// <summary>Variant kolonları DbDataReader'da nasıl yüzeye çıkarılır.</summary>
    public VariantDbRepresentation VariantDbMode { get; }

    /// <summary>
    /// <see cref="ArrowDataReader"/> sınıfının yeni bir örneğini oluşturur.
    /// Tamamen gecikmeli (Lazy) çalışır; yapıcı metod içerisinde I/O işlemi yapılmaz.
    /// </summary>
    public ArrowDataReader(
        ArrowStreamReader reader,
        bool ownsReader = true,
        VariantDbRepresentation variantDbMode = VariantDbRepresentation.VariantValue)
    {
        ArgumentNullException.ThrowIfNull(reader);

        _reader = reader;
        _ownsReader = ownsReader;
        VariantDbMode = variantDbMode;
        _schema = reader.Schema ?? throw new InvalidOperationException("Arrow şeması null olamaz.");

        _ordinals = new Dictionary<string, int>(_schema.FieldsList.Count, StringComparer.OrdinalIgnoreCase);

        for (int i = 0; i < _schema.FieldsList.Count; i++)
        {
            _ordinals[_schema.FieldsList[i].Name] = i;
        }
    }

    #region Lazy Initialization & Validation Helpers

    private void EnsureOpen()
    {
        if (_isClosed)
            ThrowHelper.ThrowDataReaderClosed();
    }

    private void EnsureRow()
    {
        EnsureOpen();
        if (_batch == null || _rowIndex < 0 || _rowIndex >= _batch.Length)
            ThrowHelper.ThrowNoActiveRow();
    }

    private void EnsureOrdinal(int ordinal)
    {
        if (ordinal < 0 || ordinal >= FieldCount)
            ThrowHelper.ThrowOrdinalOutOfRange(ordinal, FieldCount);
    }

    private void EnsureInitialized()
    {
        EnsureOpen();
        if (_initialized) return;
        FetchNextBatch();
        _initialized = true;
    }

    private async ValueTask EnsureInitializedAsync(CancellationToken cancellationToken)
    {
        EnsureOpen();
        if (!_initialized)
        {
            await FetchNextBatchAsync(cancellationToken).ConfigureAwait(false);
            _initialized = true;
        }
    }

    private void CacheColumns()
    {
        _columns = new IArrowArray[_batch!.ColumnCount];
        for (int i = 0; i < _columns.Length; i++)
        {
            Field field = _schema.GetFieldByIndex(i);
            _columns[i] = VariantColumn.WrapIfVariant(field, _batch.Column(i));
        }
    }

    private bool IsVariantBinaryField(int ordinal)
    {
        if (VariantDbMode != VariantDbRepresentation.Binary)
            return false;

        Field field = _schema.GetFieldByIndex(ordinal);
        return field.DataType is VariantType || VariantColumn.IsVariantField(field);
    }

    #endregion

    #region Columnar Batch Reading

    /// <summary>Arrow şeması.</summary>
    public Schema Schema => _schema;

    /// <summary>
    /// Sonraki <see cref="RecordBatch"/>'i döndürür. Önceki batch otomatik dispose edilir.
    /// Dönen batch bir sonraki çağrıya veya reader kapatılana kadar geçerlidir; çağıran dispose etmemelidir.
    /// Stream bittiğinde <see langword="null"/>. Satır okuma (<see cref="DbDataReader.Read"/>) ile birlikte kullanılamaz.
    /// </summary>
    public RecordBatch? ReadNextBatch()
    {
        EnsureOpen();
        EnsureColumnarMode();

        _columnarBatch?.Dispose();
        _columnarBatch = null;

        while (!_endOfStream)
        {
            RecordBatch? batch = _reader.ReadNextRecordBatch();
            if (batch is null)
            {
                _endOfStream = true;
                return null;
            }

            if (batch.Length > 0)
            {
                _columnarBatch = batch;
                return batch;
            }

            batch.Dispose();
        }

        return null;
    }

    /// <summary>
    /// <see cref="ReadNextBatch"/> asenkron karşılığı.
    /// </summary>
    public async ValueTask<RecordBatch?> ReadNextBatchAsync(CancellationToken cancellationToken = default)
    {
        EnsureOpen();
        EnsureColumnarMode();

        _columnarBatch?.Dispose();
        _columnarBatch = null;

        while (!_endOfStream)
        {
            RecordBatch? batch = await _reader.ReadNextRecordBatchAsync(cancellationToken).ConfigureAwait(false);
            if (batch is null)
            {
                _endOfStream = true;
                return null;
            }

            if (batch.Length > 0)
            {
                _columnarBatch = batch;
                return batch;
            }

            batch.Dispose();
        }

        return null;
    }

    /// <summary>
    /// Batch'leri akış olarak okur. Dispose otomatiktir; batch yalnızca o anki döngü gövdesinde geçerlidir.
    /// </summary>
    internal IAsyncEnumerable<RecordBatch> ReadBatchesAsync(CancellationToken cancellationToken = default) =>
        ReadBatchesCore(cancellationToken);

    private async IAsyncEnumerable<RecordBatch> ReadBatchesCore(
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        while (true)
        {
            RecordBatch? batch = await ReadNextBatchAsync(cancellationToken).ConfigureAwait(false);
            if (batch is null)
                yield break;

            yield return batch;
        }
    }

    private void EnsureColumnarMode()
    {
        if (_rowMode)
        {
            throw new InvalidOperationException(
                "Satır okuma (Read) başlatıldıktan sonra columnar okuma (ReadNextBatch) kullanılamaz.");
        }

        _columnarMode = true;
        _initialized = true;
    }

    private void EnsureRowMode()
    {
        if (_columnarMode)
        {
            throw new InvalidOperationException(
                "Columnar okuma (ReadNextBatch) başlatıldıktan sonra satır okuma (Read) kullanılamaz.");
        }

        _rowMode = true;
    }

    #endregion

    #region Read & Iteration

    private bool FetchNextBatch()
    {
        while (!_endOfStream)
        {
            _batch?.Dispose();
            _batch = _reader.ReadNextRecordBatch();

            if (_batch == null)
            {
                _endOfStream = true;
                _rowIndex = -1;
                return false;
            }

            if (_batch.Length == 0)
                continue;

            CacheColumns();
            _rowIndex = -1;
            return true;
        }

        return false;
    }

    private async ValueTask<bool> FetchNextBatchAsync(CancellationToken cancellationToken)
    {
        while (!_endOfStream)
        {
            _batch?.Dispose();
            _batch = await _reader.ReadNextRecordBatchAsync(cancellationToken).ConfigureAwait(false);

            if (_batch == null)
            {
                _endOfStream = true;
                _rowIndex = -1;
                return false;
            }

            if (_batch.Length == 0)
                continue;

            CacheColumns();
            _rowIndex = -1;
            return true;
        }

        return false;
    }

    public override bool Read()
    {
        EnsureRowMode();
        EnsureInitialized();

        if (_endOfStream && (_batch == null || _rowIndex >= _batch.Length - 1))
            return false;

        if (_batch != null && _rowIndex < _batch.Length - 1)
        {
            _rowIndex++;
            return true;
        }

        if (FetchNextBatch())
        {
            _rowIndex = 0;
            return true;
        }

        return false;
    }

    public override async Task<bool> ReadAsync(CancellationToken cancellationToken)
    {
        EnsureRowMode();
        await EnsureInitializedAsync(cancellationToken).ConfigureAwait(false);

        if (_endOfStream && (_batch == null || _rowIndex >= _batch.Length - 1))
            return false;

        if (_batch != null && _rowIndex < _batch.Length - 1)
        {
            _rowIndex++;
            return true;
        }

        if (await FetchNextBatchAsync(cancellationToken).ConfigureAwait(false))
        {
            _rowIndex = 0;
            return true;
        }

        return false;
    }

    #endregion

    #region DbDataReader Base & ADO.NET Overrides

    public override int FieldCount => _schema.FieldsList.Count;
    public override int VisibleFieldCount => FieldCount;

    public override bool HasRows
    {
        get
        {
            EnsureInitialized();
            return _batch != null && _batch.Length > 0;
        }
    }

    public override bool IsClosed => _isClosed;
    public override int Depth => 0;
    public override int RecordsAffected => -1;

    public override bool NextResult() => false;
    public override Task<bool> NextResultAsync(CancellationToken cancellationToken) => Task.FromResult(false);

    public override object this[int ordinal] => GetValue(ordinal);
    public override object this[string name] => GetValue(GetOrdinal(name));

    public override string GetName(int ordinal)
    {
        EnsureOrdinal(ordinal);
        return _schema.GetFieldByIndex(ordinal).Name;
    }

    public override int GetOrdinal(string name)
    {
        ArgumentNullException.ThrowIfNull(name);

        if (_ordinals.TryGetValue(name, out var ordinal))
            return ordinal;

        throw new IndexOutOfRangeException($"'{name}' adında bir sütun bulunamadı.");
    }

    public override string GetDataTypeName(int ordinal)
    {
        EnsureOrdinal(ordinal);
        return _schema.GetFieldByIndex(ordinal).DataType.TypeId.ToString();
    }

    public override bool IsDBNull(int ordinal)
    {
        EnsureRow();
        EnsureOrdinal(ordinal);
        return ArrowTypeDispatcher.IsDbNull(_columns[ordinal], _rowIndex);
    }

    public override Stream GetStream(int ordinal)
    {
        EnsureRow();
        EnsureOrdinal(ordinal);
        if (IsDBNull(ordinal)) ThrowHelper.ThrowColumnIsNull(ColumnName(ordinal));

        ReadOnlySpan<byte> bytes = _columns[ordinal] switch
        {
            VariantArray variant when IsVariantBinaryField(ordinal) =>
                VariantBinary.Pack(variant, _rowIndex),
            BinaryArray bin => bin.GetBytes(_rowIndex),
            LargeBinaryArray lbin => lbin.GetBytes(_rowIndex),
            FixedSizeBinaryArray fbin => fbin.GetBytes(_rowIndex),
            _ => throw new InvalidCastException($"Sütun '{ColumnName(ordinal)}' ikili (Binary) türde değil.")
        };

        return new MemoryStream(bytes.ToArray(), writable: false);
    }

    public override TextReader GetTextReader(int ordinal)
    {
        EnsureRow();
        EnsureOrdinal(ordinal);
        string text = GetString(ordinal);
        return new StringReader(text);
    }

    public override object GetProviderSpecificValue(int ordinal) => GetValue(ordinal);

    public override int GetProviderSpecificValues(object[] values) => GetValues(values);

    public override Type GetProviderSpecificFieldType(int ordinal) => GetFieldType(ordinal);

    #endregion

    #region Strongly-Typed & Unboxed Accessors

    public override T GetFieldValue<T>(int ordinal)
    {
        EnsureRow();
        EnsureOrdinal(ordinal);

        IArrowArray array = _columns[ordinal];
        if (ArrowTypeDispatcher.IsDbNull(array, _rowIndex))
            ThrowHelper.ThrowColumnIsNull(ColumnName(ordinal));

        if (array is DictionaryArray dictArray)
        {
            int dictIndex = ArrowTypeDispatcher.GetDictionaryIndex(dictArray.Indices, _rowIndex);
            array = dictArray.Dictionary;
            return ExtractTypedValue<T>(array, dictIndex, ordinal);
        }

        return ExtractTypedValue<T>(array, _rowIndex, ordinal);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private string ColumnName(int ordinal) => _schema.GetFieldByIndex(ordinal).Name;

    private T ExtractTypedValue<T>(IArrowArray array, int index, int ordinal)
    {
        // Zero-Boxing Unboxed Hot Path
        if (typeof(T) == typeof(bool) && array is BooleanArray b)
            return (T)(object)b.GetValue(index)!.Value;

        if (typeof(T) == typeof(byte) && array is UInt8Array u8)
            return (T)(object)u8.GetValue(index)!.Value;

        if (typeof(T) == typeof(sbyte) && array is Int8Array i8)
            return (T)(object)i8.GetValue(index)!.Value;

        if (typeof(T) == typeof(short) && array is Int16Array i16)
            return (T)(object)i16.GetValue(index)!.Value;

        if (typeof(T) == typeof(ushort) && array is UInt16Array u16)
            return (T)(object)u16.GetValue(index)!.Value;

        if (typeof(T) == typeof(int) && array is Int32Array i32)
            return (T)(object)i32.GetValue(index)!.Value;

        if (typeof(T) == typeof(uint) && array is UInt32Array u32)
            return (T)(object)u32.GetValue(index)!.Value;

        if (typeof(T) == typeof(long) && array is Int64Array i64)
            return (T)(object)i64.GetValue(index)!.Value;

        if (typeof(T) == typeof(ulong) && array is UInt64Array u64)
            return (T)(object)u64.GetValue(index)!.Value;

        if (typeof(T) == typeof(float) && array is FloatArray flt)
            return (T)(object)flt.GetValue(index)!.Value;

        if (typeof(T) == typeof(double) && array is DoubleArray dbl)
            return (T)(object)dbl.GetValue(index)!.Value;

        if (typeof(T) == typeof(decimal) && array is Decimal128Array dec128)
            return (T)(object)dec128.GetValue(index)!.Value;

        if (typeof(T) == typeof(decimal) && array is Decimal256Array dec256)
            return (T)(object)PrimitiveArrayReader.ConvertDecimal256ToDecimal(dec256, index);

        if (typeof(T) == typeof(string) && array is StringArray str)
            return (T)(object)str.GetString(index)!;

        if (typeof(T) == typeof(string) && array is LargeStringArray lstr)
            return (T)(object)lstr.GetString(index)!;

        if (typeof(T) == typeof(byte[]) && array is VariantArray variantArray && IsVariantBinaryField(ordinal))
            return (T)(object)VariantBinary.Pack(variantArray, index);

        if (typeof(T) == typeof(DateTime) && array is Date32Array d32)
            return (T)(object)d32.GetDateTime(index)!.Value;

        if (typeof(T) == typeof(DateTime) && array is Date64Array d64)
            return (T)(object)d64.GetDateTime(index)!.Value;

        if (typeof(T) == typeof(DateTime) && array is TimestampArray ts)
            return (T)(object)TemporalArrayReader.GetTimestampDateTime(ts, index);

        if (typeof(T) == typeof(DateTimeOffset) && array is TimestampArray tsDto)
            return (T)(object)tsDto.GetTimestamp(index)!.Value;

        if (typeof(T) == typeof(DateOnly) && array is Date32Array date32)
            return (T)(object)DateOnly.FromDateTime(date32.GetDateTime(index)!.Value);

        if (typeof(T) == typeof(TimeOnly) && array is Time64Array time64Only)
            return (T)(object)TimeOnly.FromTimeSpan(TemporalArrayReader.ConvertTime64ToTimeSpan(time64Only, index));

        if (typeof(T) == typeof(TimeSpan) && array is Time32Array t32)
            return (T)(object)TemporalArrayReader.ConvertTime32ToTimeSpan(t32, index);

        if (typeof(T) == typeof(TimeSpan) && array is Time64Array t64)
            return (T)(object)TemporalArrayReader.ConvertTime64ToTimeSpan(t64, index);

        if (typeof(T) == typeof(TimeSpan) && array is DurationArray dur)
            return (T)(object)TemporalArrayReader.ConvertDurationToTimeSpan(dur, index);

        // Fallback for complex/unmatched object structures
        object val = ArrowTypeDispatcher.ExtractValue(array, index);
        if (val is T typedVal)
            return typedVal;

        try
        {
            return (T)Convert.ChangeType(val, typeof(T));
        }
        catch (Exception ex) when (ex is FormatException or InvalidCastException or OverflowException)
        {
            throw new InvalidCastException($"Sütun '{ColumnName(ordinal)}' ({val.GetType().Name}) istenen {typeof(T).Name} türüne dönüştürülemedi.", ex);
        }
    }

    #endregion

    #region Primitive Data Getters

    public override bool GetBoolean(int ordinal) => GetFieldValue<bool>(ordinal);
    public override byte GetByte(int ordinal) => GetFieldValue<byte>(ordinal);
    public override short GetInt16(int ordinal) => GetFieldValue<short>(ordinal);
    public override int GetInt32(int ordinal) => GetFieldValue<int>(ordinal);
    public override long GetInt64(int ordinal) => GetFieldValue<long>(ordinal);
    public override float GetFloat(int ordinal) => GetFieldValue<float>(ordinal);
    public override double GetDouble(int ordinal) => GetFieldValue<double>(ordinal);
    public override decimal GetDecimal(int ordinal) => GetFieldValue<decimal>(ordinal);
    public override string GetString(int ordinal) => GetFieldValue<string>(ordinal);
    public override DateTime GetDateTime(int ordinal) => GetFieldValue<DateTime>(ordinal);

    public override Guid GetGuid(int ordinal)
    {
        EnsureRow();
        EnsureOrdinal(ordinal);
        if (IsDBNull(ordinal)) ThrowHelper.ThrowColumnIsNull(ColumnName(ordinal));

        var array = _columns[ordinal];

        if (array is FixedSizeBinaryArray fixedArray)
        {
            ReadOnlySpan<byte> bytes = fixedArray.GetBytes(_rowIndex);
            if (bytes.Length != 16)
                throw new InvalidCastException($"'{ColumnName(ordinal)}' sütununun ikili boyutu 16 bayt (Guid) olmalıdır.");

            return new Guid(bytes);
        }

        if (array is ExtensionArray extArray)
        {
            return ExtensionArrayReader.ExtractGuidFromExtension(extArray, _rowIndex);
        }

        if (array is StringArray strArray)
            return Guid.Parse(strArray.GetString(_rowIndex)!);

        if (array is LargeStringArray lStrArray)
            return Guid.Parse(lStrArray.GetString(_rowIndex)!);

        throw new InvalidCastException($"'{ColumnName(ordinal)}' sütunu ({array.Data.DataType.Name}) Guid türüne dönüştürülemez.");
    }

    public override char GetChar(int ordinal)
    {
        ReadOnlySpan<char> span = GetString(ordinal).AsSpan();
        if (span.IsEmpty)
            throw new InvalidOperationException($"'{ColumnName(ordinal)}' sütunundaki metin boş olduğu için char okunamadı.");

        return span[0];
    }

    public override long GetBytes(int ordinal, long dataOffset, byte[]? buffer, int bufferOffset, int length)
    {
        EnsureRow();
        EnsureOrdinal(ordinal);
        if (IsDBNull(ordinal)) return 0;

        ReadOnlySpan<byte> data = _columns[ordinal] switch
        {
            VariantArray variant when IsVariantBinaryField(ordinal) =>
                VariantBinary.Pack(variant, _rowIndex),
            BinaryArray bin => bin.GetBytes(_rowIndex),
            LargeBinaryArray lbin => lbin.GetBytes(_rowIndex),
            FixedSizeBinaryArray fbin => fbin.GetBytes(_rowIndex),
            _ => throw new InvalidCastException($"Sütun '{ColumnName(ordinal)}' ikili (Binary) türde değil.")
        };

        if (dataOffset >= data.Length)
            return 0;

        int available = data.Length - (int)dataOffset;
        int count = Math.Min(length, available);

        if (buffer != null)
        {
            data.Slice((int)dataOffset, count).CopyTo(buffer.AsSpan(bufferOffset, count));
        }

        return count;
    }

    public override long GetChars(int ordinal, long dataOffset, char[]? buffer, int bufferOffset, int length)
    {
        ReadOnlySpan<char> value = GetString(ordinal).AsSpan();

        if (dataOffset >= value.Length)
            return 0;

        int available = value.Length - (int)dataOffset;
        int count = Math.Min(length, available);

        if (buffer != null)
        {
            value.Slice((int)dataOffset, count).CopyTo(buffer.AsSpan(bufferOffset, count));
        }

        return count;
    }

    #endregion

    #region Complex / Generic Object Accessors

    public override object GetValue(int ordinal) =>
        GetValueOrNull(ordinal) ?? DBNull.Value;

    /// <summary>Null değerleri <see langword="null"/> olarak döndürür; tek null kontrolü yapar.</summary>
    private object? GetValueOrNull(int ordinal)
    {
        EnsureRow();
        EnsureOrdinal(ordinal);

        IArrowArray array = _columns[ordinal];
        if (ArrowTypeDispatcher.IsDbNull(array, _rowIndex))
            return null;

        if (array is VariantArray variantArray && IsVariantBinaryField(ordinal))
            return VariantBinary.Pack(variantArray, _rowIndex);

        return ArrowTypeDispatcher.ExtractValue(array, _rowIndex);
    }

    public override int GetValues(object[] values)
    {
        EnsureRow();
        ArgumentNullException.ThrowIfNull(values);

        int count = Math.Min(values.Length, FieldCount);
        for (int i = 0; i < count; i++)
        {
            values[i] = GetValue(i);
        }
        return count;
    }

    public override Type GetFieldType(int ordinal)
    {
        EnsureOrdinal(ordinal);
        Field field = _schema.GetFieldByIndex(ordinal);
        IArrowType type = field.DataType;

        if (type is DictionaryType dictType)
            type = dictType.ValueType;

        if (type is VariantType || VariantColumn.IsVariantField(field))
            return VariantDbMode == VariantDbRepresentation.Binary ? typeof(byte[]) : typeof(VariantValue);

        return type switch
        {
            BooleanType => typeof(bool),
            Int8Type => typeof(sbyte),
            UInt8Type => typeof(byte),
            Int16Type => typeof(short),
            UInt16Type => typeof(ushort),
            Int32Type => typeof(int),
            UInt32Type => typeof(uint),
            Int64Type => typeof(long),
            UInt64Type => typeof(ulong),
            FloatType => typeof(float),
            DoubleType => typeof(double),
            Decimal128Type or Decimal256Type => typeof(decimal),
            StringType or LargeStringType => typeof(string),
            BinaryType or LargeBinaryType or FixedSizeBinaryType => typeof(byte[]),
            Date32Type or Date64Type or TimestampType => typeof(DateTime),
            Time32Type or Time64Type or DurationType => typeof(TimeSpan),
            ListType or LargeListType => typeof(IReadOnlyList<object>),
            StructType => typeof(IReadOnlyDictionary<string, object>),
            MapType => typeof(IReadOnlyDictionary<object, object>),
            _ => typeof(object)
        };
    }

    #endregion

    #region Schema Metadata

    public override DataTable? GetSchemaTable()
    {
        EnsureOpen();

        if (_cachedSchemaTable == null)
        {
            var table = new DataTable("SchemaTable");
            table.Columns.Add(SchemaTableColumn.ColumnName, typeof(string));
            table.Columns.Add(SchemaTableColumn.ColumnOrdinal, typeof(int));
            table.Columns.Add(SchemaTableColumn.ColumnSize, typeof(int));
            table.Columns.Add(SchemaTableColumn.NumericPrecision, typeof(short));
            table.Columns.Add(SchemaTableColumn.NumericScale, typeof(short));
            table.Columns.Add(SchemaTableColumn.DataType, typeof(Type));
            table.Columns.Add(SchemaTableColumn.AllowDBNull, typeof(bool));
            table.Columns.Add(SchemaTableColumn.IsLong, typeof(bool));
            table.Columns.Add(SchemaTableColumn.ProviderType, typeof(string));

            for (int i = 0; i < _schema.FieldsList.Count; i++)
            {
                Field field = _schema.FieldsList[i];
                DataRow row = table.NewRow();
                row[SchemaTableColumn.ColumnName] = field.Name;
                row[SchemaTableColumn.ColumnOrdinal] = i;
                row[SchemaTableColumn.DataType] = GetFieldType(i);
                row[SchemaTableColumn.AllowDBNull] = field.IsNullable;
                row[SchemaTableColumn.ProviderType] = field.DataType.TypeId.ToString();
                row[SchemaTableColumn.IsLong] = field.DataType is LargeStringType or LargeBinaryType or LargeListType;

                if (field.DataType is Decimal128Type dec128)
                {
                    row[SchemaTableColumn.NumericPrecision] = (short)dec128.Precision;
                    row[SchemaTableColumn.NumericScale] = (short)dec128.Scale;
                }
                else if (field.DataType is Decimal256Type dec256)
                {
                    row[SchemaTableColumn.NumericPrecision] = (short)dec256.Precision;
                    row[SchemaTableColumn.NumericScale] = (short)dec256.Scale;
                }
                else if (field.DataType is FixedSizeBinaryType fixedBin)
                {
                    row[SchemaTableColumn.ColumnSize] = fixedBin.ByteWidth;
                }

                table.Rows.Add(row);
            }

            // DataTable değişikliklerini engellemek için ReadOnly olarak işaretlenir
            foreach (DataColumn col in table.Columns)
            {
                col.ReadOnly = true;
            }

            _cachedSchemaTable = table;
        }

        return _cachedSchemaTable;
    }

    public ReadOnlyCollection<DbColumn> GetColumnSchema()
    {
        EnsureOpen();

        if (_cachedColumnSchema == null)
        {
            var columns = new List<DbColumn>(_schema.FieldsList.Count);

            for (int i = 0; i < _schema.FieldsList.Count; i++)
            {
                Field field = _schema.FieldsList[i];
                columns.Add(new ReadOnlyDbColumn(field, i, GetFieldType(i)));
            }

            _cachedColumnSchema = columns.AsReadOnly();
        }

        return _cachedColumnSchema;
    }

    private sealed class ReadOnlyDbColumn : DbColumn
    {
        public ReadOnlyDbColumn(Field field, int ordinal, Type dataType)
        {
            ColumnName = field.Name;
            ColumnOrdinal = ordinal;
            DataType = dataType;
            DataTypeName = field.DataType.TypeId.ToString();
            AllowDBNull = field.IsNullable;
            IsLong = field.DataType is LargeStringType or LargeBinaryType or LargeListType;

            if (field.DataType is Decimal128Type dec128)
            {
                NumericPrecision = dec128.Precision;
                NumericScale = dec128.Scale;
            }
            else if (field.DataType is Decimal256Type dec256)
            {
                NumericPrecision = dec256.Precision;
                NumericScale = dec256.Scale;
            }
            else if (field.DataType is FixedSizeBinaryType fixedBin)
            {
                ColumnSize = fixedBin.ByteWidth;
            }
        }
    }

    #endregion

    #region Resource Cleanup

    public override void Close()
    {
        if (_isClosed)
            return;

        _batch?.Dispose();
        _batch = null;
        _columnarBatch?.Dispose();
        _columnarBatch = null;

        if (_ownsReader)
            _reader.Dispose();

        _columns = [];
        _cachedSchemaTable = null;
        _cachedColumnSchema = null;
        _isClosed = true;
    }

    public override async ValueTask DisposeAsync()
    {
        if (_isClosed)
            return;

        _batch?.Dispose();
        _batch = null;
        _columnarBatch?.Dispose();
        _columnarBatch = null;

        _columns = [];
        _cachedSchemaTable = null;
        _cachedColumnSchema = null;
        _isClosed = true;

        if (_ownsReader)
        {
            if (_reader is IAsyncDisposable asyncDisposable)
            {
                await asyncDisposable.DisposeAsync().ConfigureAwait(false);
            }
            else
            {
                _reader.Dispose();
            }
        }

        await base.DisposeAsync().ConfigureAwait(false);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            Close();
        }
        base.Dispose(disposing);
    }

    public override IEnumerator GetEnumerator()
    {
        return new DbEnumerator(this, closeReader: false);
    }

    #endregion

    #region Internal Throw Helpers

    private static class ThrowHelper
    {
        public static void ThrowDataReaderClosed() =>
            throw new InvalidOperationException("DataReader kapalı.");

        public static void ThrowNoActiveRow() =>
            throw new InvalidOperationException("Aktif satır yok. Önce Read() çağırın.");

        public static void ThrowColumnIsNull(string columnName) =>
            throw new InvalidOperationException($"'{columnName}' sütunu NULL değer içeriyor.");

        public static void ThrowOrdinalOutOfRange(int ordinal, int max) =>
            throw new IndexOutOfRangeException($"Sütun indeksi ({ordinal}) geçersiz. İzin verilen aralık: 0 - {max - 1}.");
    }

    #endregion
}

#region Modüler Okuyucu Katmanı (Exhaustive & Unboxed)

internal static class ArrowTypeDispatcher
{
    public static bool IsDbNull(IArrowArray array, int rowIndex)
    {
        if (array is DictionaryArray dictArray)
        {
            if (dictArray.Indices.IsNull(rowIndex))
                return true;

            int dictIndex = GetDictionaryIndex(dictArray.Indices, rowIndex);
            return dictIndex < 0 || dictIndex >= dictArray.Dictionary.Length || dictArray.Dictionary.IsNull(dictIndex);
        }

        return array.IsNull(rowIndex);
    }

    public static object ExtractValue(IArrowArray array, int rowIndex)
    {
        if (array is DictionaryArray dictArray)
        {
            return UnwrapDictionaryValue(dictArray, rowIndex) ?? DBNull.Value;
        }

        if (array is ExtensionArray extArray)
        {
            return ExtensionArrayReader.ExtractValue(extArray, rowIndex);
        }

        return array switch
        {
            BooleanArray or Int8Array or UInt8Array or Int16Array or UInt16Array or
            Int32Array or UInt32Array or Int64Array or UInt64Array or FloatArray or
            DoubleArray or Decimal128Array or Decimal256Array or StringArray or
            LargeStringArray or BinaryArray or LargeBinaryArray or FixedSizeBinaryArray
                => PrimitiveArrayReader.ExtractValue(array, rowIndex),

            Date32Array or Date64Array or TimestampArray or Time32Array or Time64Array or DurationArray
                => TemporalArrayReader.ExtractValue(array, rowIndex),

            ListArray list when list.Data.DataType is MapType
                => ComplexArrayReader.ExtractMapValues(list, rowIndex),

            ListArray list => ComplexArrayReader.ExtractListValues(list, rowIndex),
            StructArray st => ComplexArrayReader.ExtractStructValues(st, rowIndex),

            _ => throw new NotSupportedException(
                $"Desteklenmeyen Arrow veri tipi '{array.Data.DataType.Name}' (TypeId: {array.Data.DataType.TypeId}).")
        };
    }

    private static object? UnwrapDictionaryValue(DictionaryArray dictArray, int rowIndex)
    {
        if (dictArray.Indices.IsNull(rowIndex))
            return null;

        int dictionaryIndex = GetDictionaryIndex(dictArray.Indices, rowIndex);
        IArrowArray dictionaryValues = dictArray.Dictionary;

        if (dictionaryIndex < 0 || dictionaryIndex >= dictionaryValues.Length || dictionaryValues.IsNull(dictionaryIndex))
            return null;

        return ExtractValue(dictionaryValues, dictionaryIndex);
    }

    public static int GetDictionaryIndex(IArrowArray indices, int rowIndex)
    {
        long idx = indices switch
        {
            Int32Array i32 => i32.GetValue(rowIndex)!.Value,
            Int16Array i16 => i16.GetValue(rowIndex)!.Value,
            Int8Array i8 => i8.GetValue(rowIndex)!.Value,
            UInt8Array u8 => u8.GetValue(rowIndex)!.Value,
            UInt16Array u16 => u16.GetValue(rowIndex)!.Value,
            UInt32Array u32 => u32.GetValue(rowIndex)!.Value,
            Int64Array i64 => i64.GetValue(rowIndex)!.Value,
            UInt64Array u64 => checked((long)u64.GetValue(rowIndex)!.Value),
            _ => throw new NotSupportedException($"Sözlük indeks tipi '{indices.Data.DataType.Name}' desteklenmiyor.")
        };

        if (idx < 0 || idx > int.MaxValue)
            throw new OverflowException($"Sözlük indeksi {idx}, 32-bit tamsayı sınırlarını aşıyor.");

        return (int)idx;
    }
}

internal static class PrimitiveArrayReader
{
    public static object ExtractValue(IArrowArray array, int rowIndex)
    {
        return array switch
        {
            BooleanArray a => a.GetValue(rowIndex)!.Value,
            Int8Array a => a.GetValue(rowIndex)!.Value,
            UInt8Array a => a.GetValue(rowIndex)!.Value,
            Int16Array a => a.GetValue(rowIndex)!.Value,
            UInt16Array a => a.GetValue(rowIndex)!.Value,
            Int32Array a => a.GetValue(rowIndex)!.Value,
            UInt32Array a => a.GetValue(rowIndex)!.Value,
            Int64Array a => a.GetValue(rowIndex)!.Value,
            UInt64Array a => a.GetValue(rowIndex)!.Value,
            FloatArray a => a.GetValue(rowIndex)!.Value,
            DoubleArray a => a.GetValue(rowIndex)!.Value,
            Decimal128Array a => a.GetValue(rowIndex)!.Value,
            Decimal256Array a => ConvertDecimal256ToDecimal(a, rowIndex),
            StringArray a => a.GetString(rowIndex)!,
            LargeStringArray a => a.GetString(rowIndex)!,
            BinaryArray a => a.GetBytes(rowIndex).ToArray(),
            LargeBinaryArray a => a.GetBytes(rowIndex).ToArray(),
            FixedSizeBinaryArray a => a.GetBytes(rowIndex).ToArray(),
            _ => throw new InvalidOperationException($"Geçersiz ilkel tip okuması: '{array.Data.DataType.Name}'.")
        };
    }

    public static decimal ConvertDecimal256ToDecimal(Decimal256Array array, int index)
    {
        try
        {
            checked
            {
                return (decimal)array.GetValue(index)!.Value;
            }
        }
        catch (OverflowException ex)
        {
            throw new OverflowException("Decimal256 değeri .NET decimal (128-bit) kapasitesini aşıyor.", ex);
        }
    }
}

internal static class TemporalArrayReader
{
    public static object ExtractValue(IArrowArray array, int rowIndex)
    {
        return array switch
        {
            Date32Array a => a.GetDateTime(rowIndex)!.Value,
            Date64Array a => a.GetDateTime(rowIndex)!.Value,
            TimestampArray a => GetTimestampDateTime(a, rowIndex),
            Time32Array a => ConvertTime32ToTimeSpan(a, rowIndex),
            Time64Array a => ConvertTime64ToTimeSpan(a, rowIndex),
            DurationArray a => ConvertDurationToTimeSpan(a, rowIndex),
            _ => throw new InvalidOperationException($"Geçersiz zaman tipi okuması: '{array.Data.DataType.Name}'.")
        };
    }

    public static DateTime GetTimestampDateTime(TimestampArray array, int index)
    {
        DateTimeOffset dto = array.GetTimestamp(index)!.Value;
        var type = (TimestampType)array.Data.DataType;

        if (string.IsNullOrEmpty(type.Timezone))
        {
            return DateTime.SpecifyKind(dto.DateTime, DateTimeKind.Unspecified);
        }

        return dto.UtcDateTime;
    }

    public static TimeSpan ConvertTime32ToTimeSpan(Time32Array array, int index)
    {
        int val = array.GetValue(index)!.Value;
        var unit = ((Time32Type)array.Data.DataType).Unit;

        return unit switch
        {
            TimeUnit.Second => TimeSpan.FromSeconds(val),
            TimeUnit.Millisecond => TimeSpan.FromMilliseconds(val),
            _ => TimeSpan.FromMilliseconds(val)
        };
    }

    public static TimeSpan ConvertTime64ToTimeSpan(Time64Array array, int index)
    {
        long val = array.GetValue(index)!.Value;
        var unit = ((Time64Type)array.Data.DataType).Unit;

        return unit switch
        {
            TimeUnit.Second => TimeSpan.FromSeconds(val),
            TimeUnit.Millisecond => TimeSpan.FromMilliseconds(val),
            TimeUnit.Microsecond => TimeSpan.FromTicks(checked(val * TimeSpan.TicksPerMicrosecond)),
            TimeUnit.Nanosecond => TimeSpan.FromTicks(val / 100),
            _ => throw new ArgumentOutOfRangeException(nameof(unit), unit, "Desteklenmeyen TimeUnit birimi.")
        };
    }

    public static TimeSpan ConvertDurationToTimeSpan(DurationArray array, int index)
    {
        long val = array.GetValue(index)!.Value;
        var unit = ((DurationType)array.Data.DataType).Unit;

        return unit switch
        {
            TimeUnit.Second => TimeSpan.FromSeconds(val),
            TimeUnit.Millisecond => TimeSpan.FromMilliseconds(val),
            TimeUnit.Microsecond => TimeSpan.FromTicks(checked(val * TimeSpan.TicksPerMicrosecond)),
            TimeUnit.Nanosecond => TimeSpan.FromTicks(val / 100),
            _ => throw new ArgumentOutOfRangeException(nameof(unit), unit, "Desteklenmeyen TimeUnit birimi.")
        };
    }
}

internal static class ComplexArrayReader
{
    public static IReadOnlyList<object?> ExtractListValues(ListArray listArray, int rowIndex)
    {
        int offset = listArray.ValueOffsets[rowIndex];
        int length = listArray.ValueOffsets[rowIndex + 1] - offset;
        IArrowArray values = listArray.Values;

        var list = new object?[length];
        for (int i = 0; i < length; i++)
        {
            int targetIndex = offset + i;
            list[i] = values.IsNull(targetIndex) ? null : ArrowTypeDispatcher.ExtractValue(values, targetIndex);
        }

        return list;
    }

    public static IReadOnlyDictionary<string, object?> ExtractStructValues(StructArray structArray, int rowIndex)
    {
        var structType = (StructType)structArray.Data.DataType;
        var dict = new Dictionary<string, object?>(structType.Fields.Count);

        for (int i = 0; i < structType.Fields.Count; i++)
        {
            Field field = structType.Fields[i];
            IArrowArray childArray = structArray.Fields[i];

            dict[field.Name] = childArray.IsNull(rowIndex) ? null : ArrowTypeDispatcher.ExtractValue(childArray, rowIndex);
        }

        return dict;
    }

    public static IReadOnlyDictionary<object, object?> ExtractMapValues(ListArray mapListArray, int rowIndex)
    {
        int offset = mapListArray.ValueOffsets[rowIndex];
        int length = mapListArray.ValueOffsets[rowIndex + 1] - offset;

        if (mapListArray.Values is not StructArray entriesStruct)
            throw new InvalidCastException("Map verisi beklenen StructArray yapısında değil.");

        IArrowArray keys = entriesStruct.Fields[0];
        IArrowArray values = entriesStruct.Fields[1];

        var map = new Dictionary<object, object?>(length);
        for (int i = 0; i < length; i++)
        {
            int targetIndex = offset + i;
            object key = ArrowTypeDispatcher.ExtractValue(keys, targetIndex);
            object? val = values.IsNull(targetIndex) ? null : ArrowTypeDispatcher.ExtractValue(values, targetIndex);

            map[key] = val;
        }

        return map;
    }
}

internal static class ExtensionArrayReader
{
    public static Guid ExtractGuidFromExtension(ExtensionArray extArray, int rowIndex)
    {
        IArrowArray storage = extArray.Storage;

        if (storage is FixedSizeBinaryArray fixedArray && ((FixedSizeBinaryType)fixedArray.Data.DataType).ByteWidth == 16)
        {
            ReadOnlySpan<byte> bytes = fixedArray.GetBytes(rowIndex);
            return new Guid(bytes);
        }

        throw new InvalidCastException("ExtensionArray sütunu 16-baytlık Guid veri yapısına dönüştürülemedi.");
    }

    public static object ExtractValue(ExtensionArray extArray, int rowIndex)
    {
        if (extArray is VariantArray variantArray)
            return VariantColumn.GetValue(variantArray, rowIndex);

        if (extArray.Data.DataType is ExtensionType &&
            extArray.Storage is FixedSizeBinaryArray fixedArray &&
            ((FixedSizeBinaryType)fixedArray.Data.DataType).ByteWidth == 16)
        {
            return ExtractGuidFromExtension(extArray, rowIndex);
        }

        return ArrowTypeDispatcher.ExtractValue(extArray.Storage, rowIndex);
    }
}

#endregion