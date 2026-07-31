using Apache.Arrow;
using Apache.Arrow.Ipc;
using Arrow;
using System.Collections.Concurrent;
using System.Data.Common;
using System.Linq.Expressions;
using System.Reflection;
using System.Runtime.CompilerServices;

namespace Arrow.Data;

/// <summary>
/// <see cref="ArrowBatchReader"/> nesnelerinden jenerik DTO, POCO ve record paketleri okumak için
/// derlenmiş Expression Tree (Fast Reflection) extension metodları.
/// </summary>
public static class ArrowBatchObjectExtensions
{
    private static readonly ConcurrentDictionary<(Type DtoType, Schema Schema), object> _mapperCache = new();

    /// <summary>
    /// Sonraki Arrow paketini (<see cref="RecordBatch"/>) derlenmiş Expression Tree kullanarak <see cref="IReadOnlyList{T}"/> DTO paketi olarak okur.
    /// İşlenen yerel Arrow paketi bellekten anında temizlenir (dispose edilir).
    /// Akış sonlandıysa <see langword="null"/> döner.
    /// </summary>
    /// <typeparam name="T">DTO, POCO veya record sınıf tipi.</typeparam>
    /// <param name="batchReader">Arrow batch okuyucusu.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns>Dönüştürülmüş <see cref="IReadOnlyList{T}"/> paketi veya akış bittiyse <see langword="null"/>.</returns>
    public static async ValueTask<IReadOnlyList<T>?> ReadNextBatchAsync<T>(
        this ArrowBatchReader batchReader,
        CancellationToken cancellationToken = default)
        where T : class
    {
        if (batchReader is null) throw new ArgumentNullException(nameof(batchReader));

        RecordBatch? batch = await batchReader.ReadNextBatchAsync(cancellationToken).ConfigureAwait(false);
        if (batch is null)
            return null;

        using (batch)
        {
            if (batch.Length == 0)
                return System.Array.Empty<T>();

            using var stream = new MemoryStream();
            using (var writer = new ArrowStreamWriter(stream, batch.Schema, leaveOpen: true))
            {
                await writer.WriteRecordBatchAsync(batch, cancellationToken).ConfigureAwait(false);
                await writer.WriteEndAsync(cancellationToken).ConfigureAwait(false);
            }
            stream.Position = 0;

            using ArrowDataReader dbReader = ArrowData.OpenArrowReader(stream).RequireArrowReader();

            var mapper = (Func<DbDataReader, T>)_mapperCache.GetOrAdd(
                (typeof(T), batch.Schema),
                key => BuildExpressionMapper<T>(dbReader));

            var list = new List<T>(batch.Length);

            while (await dbReader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                list.Add(mapper(dbReader));
            }

            return list;
        }
    }

    /// <summary>
    /// <see cref="ReadNextBatchAsync{T}"/> metodunu <see cref="IAsyncEnumerable{T}"/> akışına dönüştüren sarmallayıcı (wrapper) metot.
    /// </summary>
    /// <typeparam name="T">DTO, POCO veya record sınıf tipi.</typeparam>
    /// <param name="batchReader">Arrow batch okuyucusu.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns><see cref="IReadOnlyList{T}"/> paket akışı.</returns>
    public static async IAsyncEnumerable<IReadOnlyList<T>> ReadBatchesAsync<T>(
        this ArrowBatchReader batchReader,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
        where T : class
    {
        if (batchReader is null) throw new ArgumentNullException(nameof(batchReader));

        while (await batchReader.ReadNextBatchAsync<T>(cancellationToken).ConfigureAwait(false) is { } batch)
        {
            yield return batch;
        }
    }

    private static Func<DbDataReader, T> BuildExpressionMapper<T>(DbDataReader reader) where T : class
    {
        ParameterExpression readerParam = Expression.Parameter(typeof(DbDataReader), "reader");
        Type type = typeof(T);

        ConstructorInfo? defaultCtor = type.GetConstructor(Type.EmptyTypes);

        MethodInfo getFieldValueMethod = typeof(DbDataReader).GetMethod(nameof(DbDataReader.GetFieldValue))!;
        MethodInfo isDbNullMethod = typeof(DbDataReader).GetMethod(nameof(DbDataReader.IsDBNull))!;

        if (defaultCtor != null)
        {
            List<MemberBinding> bindings = new();
            PropertyInfo[] properties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Where(p => p.CanWrite)
                .ToArray();

            foreach (PropertyInfo prop in properties)
            {
                int ordinal;
                try
                {
                    ordinal = reader.GetOrdinal(prop.Name);
                }
                catch
                {
                    continue;
                }

                ConstantExpression ordinalExpr = Expression.Constant(ordinal);

                MethodCallExpression callGetFieldValue = Expression.Call(
                    readerParam,
                    getFieldValueMethod.MakeGenericMethod(prop.PropertyType),
                    ordinalExpr);

                MethodCallExpression callIsDbNull = Expression.Call(readerParam, isDbNullMethod, ordinalExpr);

                ConditionalExpression conditionalExpr = Expression.Condition(
                    callIsDbNull,
                    Expression.Default(prop.PropertyType),
                    callGetFieldValue);

                bindings.Add(Expression.Bind(prop, conditionalExpr));
            }

            MemberInitExpression memberInit = Expression.MemberInit(Expression.New(defaultCtor), bindings);
            LambdaExpression lambda = Expression.Lambda<Func<DbDataReader, T>>(memberInit, readerParam);
            return (Func<DbDataReader, T>)lambda.Compile();
        }
        else
        {
            ConstructorInfo ctor = type.GetConstructors()
                .OrderByDescending(c => c.GetParameters().Length)
                .FirstOrDefault() ?? throw new InvalidOperationException($"'{type.FullName}' tipi için uygun yapıcı metot bulunamadı.");

            ParameterInfo[] ctorParams = ctor.GetParameters();
            Expression[] argExprs = new Expression[ctorParams.Length];

            for (int i = 0; i < ctorParams.Length; i++)
            {
                ParameterInfo param = ctorParams[i];
                int ordinal;
                try
                {
                    ordinal = reader.GetOrdinal(param.Name!);
                }
                catch
                {
                    ordinal = -1;
                }

                if (ordinal >= 0)
                {
                    ConstantExpression ordinalExpr = Expression.Constant(ordinal);

                    MethodCallExpression callGetFieldValue = Expression.Call(
                        readerParam,
                        getFieldValueMethod.MakeGenericMethod(param.ParameterType),
                        ordinalExpr);

                    MethodCallExpression callIsDbNull = Expression.Call(readerParam, isDbNullMethod, ordinalExpr);

                    argExprs[i] = Expression.Condition(
                        callIsDbNull,
                        Expression.Default(param.ParameterType),
                        callGetFieldValue);
                }
                else
                {
                    argExprs[i] = Expression.Default(param.ParameterType);
                }
            }

            NewExpression newExpr = Expression.New(ctor, argExprs);
            LambdaExpression lambda = Expression.Lambda<Func<DbDataReader, T>>(newExpr, readerParam);
            return (Func<DbDataReader, T>)lambda.Compile();
        }
    }
}
