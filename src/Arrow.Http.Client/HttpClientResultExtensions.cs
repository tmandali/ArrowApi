using System.Net.Http.Json;
using System.Text.Json;

namespace Arrow.Http.Client;

/// <summary>
/// <see cref="HttpClient"/> ve <see cref="HttpResponseMessage"/> üzerinden <see cref="Result{T}"/> tipinde güvenli çağrılar yapmak için extension metodlar.
/// </summary>
public static class HttpClientResultExtensions
{
    private static readonly JsonSerializerOptions DefaultJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    /// <summary>
    /// <see cref="HttpResponseMessage"/> yanıtını durum koduna göre <see cref="Result{T}"/> nesnesine dönüştürür.
    /// HTTP istisnası fırlatmaz.
    /// </summary>
    /// <typeparam name="T">Yanıt veri tipi.</typeparam>
    /// <param name="response">HTTP yanıt nesnesi.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns><see cref="Result{T}"/> nesnesi.</returns>
    public static async Task<Result<T>> ReadAsResultAsync<T>(
        this HttpResponseMessage response,
        CancellationToken cancellationToken = default)
    {
        if (response is null) throw new ArgumentNullException(nameof(response));

        int statusCode = (int)response.StatusCode;

        if (response.IsSuccessStatusCode)
        {
            if (statusCode == 204)
                return Result<T>.Success(default!);

            try
            {
#if NET
                T? value = await response.Content.ReadFromJsonAsync<T>(DefaultJsonOptions, cancellationToken).ConfigureAwait(false);
#else
                string content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                T? value = string.IsNullOrWhiteSpace(content)
                    ? default
                    : JsonSerializer.Deserialize<T>(content, DefaultJsonOptions);
#endif
                return Result<T>.Success(value!);
            }
            catch (Exception ex)
            {
                return Result<T>.Failure($"Yanıt JSON nesnesine ayrıştırılamadı: {ex.Message}", statusCode);
            }
        }

        string errorMessage;
        try
        {
            string content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (!string.IsNullOrWhiteSpace(content))
            {
                using JsonDocument doc = JsonDocument.Parse(content);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    if (doc.RootElement.TryGetProperty("error", out JsonElement errProp) ||
                        doc.RootElement.TryGetProperty("Error", out errProp) ||
                        doc.RootElement.TryGetProperty("detail", out errProp) ||
                        doc.RootElement.TryGetProperty("Detail", out errProp))
                    {
                        errorMessage = errProp.GetString() ?? content;
                    }
                    else
                    {
                        errorMessage = content;
                    }
                }
                else
                {
                    errorMessage = content;
                }
            }
            else
            {
                errorMessage = response.ReasonPhrase ?? $"HTTP {statusCode}";
            }
        }
        catch
        {
            errorMessage = response.ReasonPhrase ?? $"HTTP {statusCode}";
        }

        return statusCode switch
        {
            404 => Result<T>.NotFound(errorMessage),
            400 => Result<T>.BadRequest(errorMessage),
            409 => Result<T>.Conflict(errorMessage),
            _   => Result<T>.Failure(errorMessage, statusCode)
        };
    }

    /// <summary>
    /// GET isteği yaparak yanıtı <see cref="Result{T}"/> nesnesine dönüştürür.
    /// HTTP istisnası fırlatmaz.
    /// </summary>
    /// <typeparam name="T">Yanıt veri tipi.</typeparam>
    /// <param name="httpClient">HTTP istemcisi.</param>
    /// <param name="requestUri">İstek adresi.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns><see cref="Result{T}"/> nesnesi.</returns>
    public static async Task<Result<T>> GetResultAsync<T>(
        this HttpClient httpClient,
        string requestUri,
        CancellationToken cancellationToken = default)
    {
        if (httpClient is null) throw new ArgumentNullException(nameof(httpClient));

        try
        {
            using HttpResponseMessage response = await httpClient.GetAsync(requestUri, cancellationToken).ConfigureAwait(false);
            return await response.ReadAsResultAsync<T>(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return Result<T>.Failure($"İstek sırasında hata oluştu: {ex.Message}", 500);
        }
    }

    /// <summary>
    /// POST isteği yapıp yanıtı <see cref="Result{TResponse}"/> nesnesine dönüştürür.
    /// HTTP istisnası fırlatmaz.
    /// </summary>
    /// <typeparam name="TRequest">Gönderilecek veri tipi.</typeparam>
    /// <typeparam name="TResponse">Dönecek veri tipi.</typeparam>
    /// <param name="httpClient">HTTP istemcisi.</param>
    /// <param name="requestUri">İstek adresi.</param>
    /// <param name="value">Gönderilecek veri nesnesi.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns><see cref="Result{TResponse}"/> nesnesi.</returns>
    public static async Task<Result<TResponse>> PostResultAsync<TRequest, TResponse>(
        this HttpClient httpClient,
        string requestUri,
        TRequest value,
        CancellationToken cancellationToken = default)
    {
        if (httpClient is null) throw new ArgumentNullException(nameof(httpClient));

        try
        {
            using HttpResponseMessage response = await httpClient.PostAsJsonAsync(requestUri, value, cancellationToken).ConfigureAwait(false);
            return await response.ReadAsResultAsync<TResponse>(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return Result<TResponse>.Failure($"İstek sırasında hata oluştu: {ex.Message}", 500);
        }
    }
}
