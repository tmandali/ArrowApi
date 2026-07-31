using Arrow.Http.AspNetCore.Dispatcher;

namespace Arrow;

/// <summary>
/// İşlem sonucunu (Başarılı veri veya Hata detayı) temsil eden tip-güvenli record yapısı.
/// </summary>
/// <typeparam name="T">Başarılı dönen veri tipi.</typeparam>
public record Result<T>
{
    /// <summary>Başarılı sonuç verisi.</summary>
    public T? Value { get; init; }

    /// <summary>Hata açıklaması veya mesajı (başarılı ise <see langword="null"/>).</summary>
    public string? Error { get; init; }

    /// <summary>HTTP durum kodu eşlemesi (varsayılan: 200).</summary>
    public int StatusCode { get; init; } = 200;

    /// <summary>İşlemin başarılı olup olmadığını belirtir.</summary>
    public bool IsSuccess => Error is null;

    /// <summary>Başarılı sonuç üretir.</summary>
    public static Result<T> Success(T value) => new() { Value = value, StatusCode = 200 };

    /// <summary>404 Not Found durum hatası üretir.</summary>
    public static Result<T> NotFound(string error) => new() { Error = error, StatusCode = 404 };

    /// <summary>400 Bad Request durum hatası üretir.</summary>
    public static Result<T> BadRequest(string error) => new() { Error = error, StatusCode = 400 };

    /// <summary>409 Conflict durum hatası üretir.</summary>
    public static Result<T> Conflict(string error) => new() { Error = error, StatusCode = 409 };

    /// <summary>Genel veya özel durum kodu hatası üretir.</summary>
    public static Result<T> Failure(string error, int statusCode = 500) => new() { Error = error, StatusCode = statusCode };
}

/// <summary>
/// Dönecek veri yükü olmayan (void) işlemler için <see cref="Result{T}"/> kısayolları.
/// </summary>
public static class Result
{
    /// <summary>Başarılı void sonuç üretir.</summary>
    public static Result<Unit> Success() => Result<Unit>.Success(Unit.Value);

    /// <summary>404 Not Found durum hatası üretir.</summary>
    public static Result<Unit> NotFound(string error) => Result<Unit>.NotFound(error);

    /// <summary>400 Bad Request durum hatası üretir.</summary>
    public static Result<Unit> BadRequest(string error) => Result<Unit>.BadRequest(error);

    /// <summary>409 Conflict durum hatası üretir.</summary>
    public static Result<Unit> Conflict(string error) => Result<Unit>.Conflict(error);

    /// <summary>Genel veya özel durum kodu hatası üretir.</summary>
    public static Result<Unit> Failure(string error, int statusCode = 500) => Result<Unit>.Failure(error, statusCode);
}

/// <summary>
/// <see cref="Result{T}"/> için geliştirici deneyimini (DX) artıran yardımcı extension metodlar.
/// </summary>
public static class ResultExtensions
{
    /// <summary>
    /// Sonuç başarısızsa (<see cref="Result{T}.IsSuccess"/> false) durum kodu ve hata mesajı ile <see cref="InvalidOperationException"/> fırlatır.
    /// Başarılıysa <see cref="Result{T}"/> nesnesini aynen döndürür.
    /// </summary>
    /// <typeparam name="T">Sonuç veri tipi.</typeparam>
    /// <param name="result">İşlem sonucu.</param>
    /// <returns>Başarılı <see cref="Result{T}"/> nesnesi.</returns>
    /// <exception cref="InvalidOperationException">Sonuç başarısız ise fırlatılır.</exception>
    public static Result<T> ThrowIfError<T>(this Result<T> result)
    {
        if (result is null) throw new ArgumentNullException(nameof(result));

        if (!result.IsSuccess)
        {
            throw new InvalidOperationException($"İşlem başarısız (HTTP {result.StatusCode}): {result.Error}");
        }

        return result;
    }

    /// <summary>
    /// Sonuç başarısızsa istisna fırlatır, başarılıysa <see cref="Result{T}.Value"/> değerini döndürür.
    /// </summary>
    /// <typeparam name="T">Sonuç veri tipi.</typeparam>
    /// <param name="result">İşlem sonucu.</param>
    /// <returns><see cref="Result{T}.Value"/> değeri.</returns>
    /// <exception cref="InvalidOperationException">Sonuç başarısız ise fırlatılır.</exception>
    public static T GetValueOrThrow<T>(this Result<T> result)
    {
        return result.ThrowIfError().Value!;
    }
}
