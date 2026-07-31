using Arrow.Http.AspNetCore.Dispatcher;
using Microsoft.AspNetCore.Http;

namespace Arrow.Http.AspNetCore;

/// <summary>
/// <see cref="Result{T}"/> nesnelerini ASP.NET Core <see cref="IResult"/> yanıtlarına dönüştüren extension metodlar.
/// </summary>
public static class ResultHttpExtensions
{
    /// <summary>
    /// <see cref="Result{T}"/> sonucunu durum koduna uygun bir ASP.NET Core <see cref="IResult"/> yanıtına dönüştürür.
    /// </summary>
    /// <typeparam name="T">Sonuç veri tipi.</typeparam>
    /// <param name="result">İşlem sonucu.</param>
    /// <returns>Dönüştürülmüş HTTP <see cref="IResult"/> yanıtı.</returns>
    public static IResult ToHttpResult<T>(this Result<T> result)
    {
        if (result is null) throw new ArgumentNullException(nameof(result));

        if (result.IsSuccess)
        {
            if (typeof(T) == typeof(Unit) || result.Value is null)
                return Results.NoContent();

            return Results.Ok(result.Value);
        }

        return result.StatusCode switch
        {
            404 => Results.NotFound(new { error = result.Error }),
            400 => Results.BadRequest(new { error = result.Error }),
            409 => Results.Conflict(new { error = result.Error }),
            _   => Results.Problem(detail: result.Error, statusCode: result.StatusCode)
        };
    }
}
