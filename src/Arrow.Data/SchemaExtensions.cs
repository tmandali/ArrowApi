using Apache.Arrow;
using Apache.Arrow.Types;

namespace Arrow.Data;

/// <summary><see cref="Schema"/> için boş <see cref="RecordBatch"/> yardımcıları.</summary>
public static class SchemaExtensions
{
    /// <summary>Şemaya uygun 0 satırlık batch oluşturur.</summary>
    public static RecordBatch EmptyBatch(this Schema schema)
    {
        ThrowHelper.ThrowIfNull(schema);

        IArrowArray[] arrays = new IArrowArray[schema.FieldsList.Count];
        for (int i = 0; i < arrays.Length; i++)
            arrays[i] = CreateEmptyArray(schema.FieldsList[i].DataType);

        return new RecordBatch(schema, arrays, length: 0);
    }

    private static IArrowArray CreateEmptyArray(IArrowType dataType) =>
        dataType switch
        {
            BooleanType => new BooleanArray.Builder().Build(),
            Int8Type => new Int8Array.Builder().Build(),
            UInt8Type => new UInt8Array.Builder().Build(),
            Int16Type => new Int16Array.Builder().Build(),
            UInt16Type => new UInt16Array.Builder().Build(),
            Int32Type => new Int32Array.Builder().Build(),
            UInt32Type => new UInt32Array.Builder().Build(),
            Int64Type => new Int64Array.Builder().Build(),
            UInt64Type => new UInt64Array.Builder().Build(),
            FloatType => new FloatArray.Builder().Build(),
            DoubleType => new DoubleArray.Builder().Build(),
            Date32Type => new Date32Array.Builder().Build(),
            Time64Type t64 => new Time64Array.Builder(t64).Build(),
            TimestampType ts => new TimestampArray.Builder(ts).Build(),
            Decimal128Type d128 => new Decimal128Array.Builder(d128).Build(),
            Decimal256Type d256 => new Decimal256Array.Builder(d256).Build(),
            StringType => new StringArray.Builder().Build(),
            LargeStringType => new LargeStringArray.Builder().Build(),
            BinaryType => new BinaryArray.Builder().Build(),
            LargeBinaryType => new LargeBinaryArray.Builder().Build(),
            _ => throw new NotSupportedException($"Boş dizi oluşturulamadı: '{dataType.Name}'.")
        };
}
