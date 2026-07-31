using Apache.Arrow;
using Arrow.Data;
using System.Runtime.CompilerServices;

namespace Arrow.Data;

/// <summary>
/// <see cref="Result{T}"/> tipindeki <see cref="ArrowBatchReader"/> sonuçları üzerinde
/// otomatik bellek yönetimi (auto-dispose) ile DTO paketleri okuma extension metodları.
/// </summary>
public static class ResultArrowBatchExtensions
{
    /// <summary>
    /// <see cref="Result{T}"/> içindeki Arrow paketini (<see cref="RecordBatch"/>) derlenmiş Expression Tree kullanarak <see cref="IReadOnlyList{T}"/> DTO paketi olarak okur.
    /// Son paket okunduğunda veya sonuç hatalıysa okuyucu (<see cref="ArrowBatchReader"/>) otomatik olarak dispose edilir.
    /// </summary>
    /// <typeparam name="T">DTO, POCO veya record sınıf tipi.</typeparam>
    /// <param name="result">Arrow batch okuyucusu sonucu.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns>Dönüştürülmüş <see cref="IReadOnlyList{T}"/> paketi veya akış bittiyse <see langword="null"/>.</returns>
    public static async ValueTask<IReadOnlyList<T>?> ReadNextBatchAsync<T>(
        this Result<ArrowBatchReader> result,
        CancellationToken cancellationToken = default)
        where T : class
    {
        if (result is null || !result.IsSuccess || result.Value is null)
            return null;

        IReadOnlyList<T>? batch = await result.Value.ReadNextBatchAsync<T>(cancellationToken).ConfigureAwait(false);

        if (batch is null)
        {
            await result.Value.DisposeAsync().ConfigureAwait(false);
        }

        return batch;
    }

    /// <summary>
    /// <see cref="Result{T}"/> içindeki Arrow akışını DTO paket akışı olarak okur.
    /// Akış tamamlandığında veya hata alındığında okuyucu (<see cref="ArrowBatchReader"/>) otomatik olarak dispose edilir.
    /// </summary>
    /// <typeparam name="T">DTO, POCO veya record sınıf tipi.</typeparam>
    /// <param name="result">Arrow batch okuyucusu sonucu.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns><see cref="IReadOnlyList{T}"/> paket akışı.</returns>
    public static async IAsyncEnumerable<IReadOnlyList<T>> ReadBatchesAsync<T>(
        this Result<ArrowBatchReader> result,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
        where T : class
    {
        if (result is null || !result.IsSuccess || result.Value is null)
            yield break;

        try
        {
            while (await result.Value.ReadNextBatchAsync<T>(cancellationToken).ConfigureAwait(false) is { } batch)
            {
                yield return batch;
            }
        }
        finally
        {
            await result.Value.DisposeAsync().ConfigureAwait(false);
        }
    }
}
