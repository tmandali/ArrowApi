using System.Collections.ObjectModel;
using System.Data;
using System.Data.Common;

namespace Arrow.Data;

/// <summary>
/// net48 / <see cref="DataTableReader"/> gibi <see cref="IDbColumnSchemaGenerator"/>
/// uygulamayan reader'lar için <see cref="DbDataReader.GetSchemaTable"/> fallback.
/// </summary>
internal static class DbDataReaderSchema
{
    public static ReadOnlyCollection<DbColumn> GetColumnSchema(DbDataReader reader)
    {
        ThrowHelper.ThrowIfNull(reader);

        if (reader is IDbColumnSchemaGenerator generator)
            return generator.GetColumnSchema();

        DataTable? schemaTable = reader.GetSchemaTable();
        if (schemaTable is null)
        {
            throw new NotSupportedException(
                "DbDataReader ne IDbColumnSchemaGenerator ne de GetSchemaTable sunuyor; Arrow şeması çıkarılamadı.");
        }

        return FromSchemaTable(schemaTable);
    }

    private static ReadOnlyCollection<DbColumn> FromSchemaTable(DataTable schemaTable)
    {
        List<DbColumn> columns = new(schemaTable.Rows.Count);
        foreach (DataRow row in schemaTable.Rows)
            columns.Add(new SchemaTableDbColumn(row));

        return new ReadOnlyCollection<DbColumn>(columns);
    }

    private sealed class SchemaTableDbColumn : DbColumn
    {
        public SchemaTableDbColumn(DataRow row)
        {
            ColumnName = GetString(row, SchemaTableColumn.ColumnName) ?? string.Empty;
            ColumnOrdinal = GetInt32(row, SchemaTableColumn.ColumnOrdinal);
            ColumnSize = GetInt32(row, SchemaTableColumn.ColumnSize);
            NumericPrecision = GetInt32(row, SchemaTableColumn.NumericPrecision) is int p ? (short?)p : null;
            NumericScale = GetInt32(row, SchemaTableColumn.NumericScale) is int s ? (short?)s : null;
            DataType = row.Table.Columns.Contains(SchemaTableColumn.DataType)
                ? row[SchemaTableColumn.DataType] as Type
                : null;
            AllowDBNull = GetBool(row, SchemaTableColumn.AllowDBNull);
            IsLong = GetBool(row, SchemaTableColumn.IsLong);
            IsReadOnly = GetBool(row, "IsReadOnly");
            IsUnique = GetBool(row, SchemaTableColumn.IsUnique);
            IsKey = GetBool(row, "IsKey");
            IsAutoIncrement = GetBool(row, SchemaTableOptionalColumn.IsAutoIncrement);
            BaseCatalogName = GetString(row, SchemaTableOptionalColumn.BaseCatalogName);
            BaseSchemaName = GetString(row, SchemaTableColumn.BaseSchemaName);
            BaseTableName = GetString(row, SchemaTableColumn.BaseTableName);
            BaseColumnName = GetString(row, SchemaTableColumn.BaseColumnName);

            if (row.Table.Columns.Contains("DataTypeName"))
                DataTypeName = GetString(row, "DataTypeName");
        }

        private static string? GetString(DataRow row, string column)
        {
            if (!row.Table.Columns.Contains(column) || row[column] is DBNull)
                return null;
            return Convert.ToString(row[column]);
        }

        private static int? GetInt32(DataRow row, string column)
        {
            if (!row.Table.Columns.Contains(column) || row[column] is DBNull)
                return null;
            return Convert.ToInt32(row[column]);
        }

        private static bool? GetBool(DataRow row, string column)
        {
            if (!row.Table.Columns.Contains(column) || row[column] is DBNull)
                return null;
            return Convert.ToBoolean(row[column]);
        }
    }
}
