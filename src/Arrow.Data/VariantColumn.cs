using Apache.Arrow;
using Apache.Arrow.Scalars.Variant;

namespace Arrow.Data;

/// <summary>Unshredded <see cref="VariantArray"/> okuma yardımcıları.</summary>
internal static class VariantColumn
{
    internal const string ExtensionName = "arrow.parquet.variant";

    private const string ShreddedMessage =
        "Shredded Variant kolonlar bu sürümde desteklenmiyor. Apache.Arrow.Operations.Shredding gerekir.";

    internal static bool IsVariantField(Field field) =>
        field.DataType is VariantType ||
        field.HasMetadata &&
        field.Metadata.TryGetValue("ARROW:extension:name", out string? name) &&
        name == ExtensionName;

    /// <summary>IPC sonrası <see cref="StructArray"/> storage'ı <see cref="VariantArray"/>'e sarar.</summary>
    internal static IArrowArray WrapIfVariant(Field field, IArrowArray column)
    {
        if (column is VariantArray)
            return column;

        if (!IsVariantField(field))
            return column;

        return VariantType.Default.CreateArray(column);
    }

    internal static VariantArray AsVariantArray(Field field, IArrowArray column) =>
        (VariantArray)WrapIfVariant(field, column);

    /// <summary>Materialize edilmiş <see cref="VariantValue"/> döndürür.</summary>
    public static VariantValue GetValue(VariantArray array, int rowIndex)
    {
        ThrowHelper.ThrowIfNull(array);

        if (array.IsShredded)
            throw new NotSupportedException(ShreddedMessage);

        return array.IsNull(rowIndex) ? VariantValue.Null : array.GetVariantValue(rowIndex);
    }

    /// <summary>Zero-copy <see cref="VariantReader"/> döndürür; array yaşam süresi boyunca geçerlidir.</summary>
    public static VariantReader GetReader(VariantArray array, int rowIndex)
    {
        ThrowHelper.ThrowIfNull(array);

        if (array.IsShredded)
            throw new NotSupportedException(ShreddedMessage);

        return array.GetVariantReader(rowIndex);
    }
}

/// <summary>Elle oluşturulmuş Variant kolonlu <see cref="RecordBatch"/> yardımcıları.</summary>
public static class VariantBatches
{
    public const string ExtensionName = "arrow.parquet.variant";

    public static VariantValue[] SamplePayloads() =>
    [
        VariantValue.FromObject(new Dictionary<string, VariantValue>
        {
            ["user_id"] = VariantValue.FromInt64(42),
            ["action"] = VariantValue.FromString("login"),
        }),
        VariantValue.FromArray(VariantValue.FromString("a"), VariantValue.FromString("b")),
    ];

    public static Schema CreateSchema(string variantFieldName = "payload") =>
        new(
            [new Field(variantFieldName, VariantType.Default, nullable: true)],
            []);

    public static RecordBatch CreateSingleColumn(VariantValue[] values, string fieldName = "payload")
    {
        ThrowHelper.ThrowIfNull(values);

        VariantArray variantArray = new VariantArray.Builder()
            .AppendRange(values)
            .Build();

        Schema schema = CreateSchema(fieldName);
        return new RecordBatch(schema, [variantArray], values.Length);
    }

    /// <summary><see cref="RecordBatch"/> içindeki Variant kolonu döndürür (kolon adıyla).</summary>
    public static VariantArray GetVariantColumn(RecordBatch batch, string fieldName)
    {
        ThrowHelper.ThrowIfNull(batch);
        ThrowHelper.ThrowIfNullOrEmpty(fieldName);

        int columnIndex = FindFieldIndex(batch.Schema, fieldName);
        Field field = batch.Schema.GetFieldByIndex(columnIndex);
        if (!VariantColumn.IsVariantField(field))
        {
            throw new InvalidOperationException(
                $"'{fieldName}' kolonu Variant değil (tip: {field.DataType.Name}).");
        }

        return VariantColumn.AsVariantArray(field, batch.Column(columnIndex));
    }

    private static int FindFieldIndex(Schema schema, string fieldName)
    {
        for (int i = 0; i < schema.FieldsList.Count; i++)
        {
            if (string.Equals(schema.FieldsList[i].Name, fieldName, StringComparison.OrdinalIgnoreCase))
                return i;
        }

        throw new KeyNotFoundException($"Şemada '{fieldName}' adlı alan bulunamadı.");
    }

    /// <summary>Örnek/JSON çıktısı için <see cref="VariantValue"/> özetine dönüştürür.</summary>
    public static object? ToJsonObject(VariantValue value)
    {
        if (value.IsNull)
            return null;

        if (value.IsObject)
        {
            return value.AsObject().ToDictionary(
                static kv => kv.Key,
                static kv => ToJsonObject(kv.Value));
        }

        if (value.IsArray)
            return value.AsArray().Select(ToJsonObject).ToArray();

        return value.PrimitiveType switch
        {
            VariantPrimitiveType.BooleanTrue or VariantPrimitiveType.BooleanFalse => value.AsBoolean(),
            VariantPrimitiveType.Int8 => value.AsInt8(),
            VariantPrimitiveType.Int16 => value.AsInt16(),
            VariantPrimitiveType.Int32 => value.AsInt32(),
            VariantPrimitiveType.Int64 => value.AsInt64(),
            VariantPrimitiveType.Float => value.AsFloat(),
            VariantPrimitiveType.Double => value.AsDouble(),
            VariantPrimitiveType.String => value.AsString(),
            _ => value.ToString(),
        };
    }
}
