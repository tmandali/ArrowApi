using Arrow.Data;
using Arrow.Jobs;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace Arrow.Http.Client;

/// <summary>Client tarafında oluşturulmuş job tutamacı.</summary>
public sealed class ArrowJob
{
    private ArrowJob(HttpClient httpClient, ArrowJobStatus status)
    {
        _httpClient = httpClient;
        Status = status;
    }

    private readonly HttpClient _httpClient;

    internal ArrowJobStatus Status { get; }

    public Guid Id => Status.Id;

    public string State => Status.Status;

    public string JobUrl => Status.JobUrl;

    public DateTimeOffset? CreatedAt => Status.CreatedAt;

    public DateTimeOffset? CompletedAt => Status.CompletedAt;

    public string? Error => Status.Error;

    /// <summary>SSE <c>/events</c> akışını okur (net48 dahil taşınabilir parser). Tamamlanana kadar bekler.</summary>
    public async IAsyncEnumerable<ArrowSseItem<ArrowJobEvent>> ReadEventsAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        string? eventsUri = Status.EventsUrl;
        if (string.IsNullOrEmpty(eventsUri))
            throw new InvalidOperationException("EventsUrl bulunamadı.");

        using HttpRequestMessage request = new(HttpMethod.Get, eventsUri);
        using HttpResponseMessage response = await _httpClient
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);

        response.EnsureSuccessStatusCode();

#if NET
        await using Stream stream = await HttpContentCompat.ReadAsStreamAsync(response.Content, cancellationToken).ConfigureAwait(false);
#else
        using Stream stream = await HttpContentCompat.ReadAsStreamAsync(response.Content, cancellationToken).ConfigureAwait(false);
#endif
        await foreach (ArrowSseItem<string> item in ArrowSseReader.ReadAsync(stream, cancellationToken).ConfigureAwait(false))
        {
            if (string.IsNullOrEmpty(item.Data))
                continue;

            ArrowJobEvent? payload = JsonSerializer.Deserialize<ArrowJobEvent>(item.Data, JsonCompat.Web);
            if (payload is null)
                continue;

            yield return new ArrowSseItem<ArrowJobEvent>(payload, item.EventType);
        }
    }

    public Task<ArrowBatchReader> GetArrowReaderAsync(
        CancellationToken cancellationToken = default) =>
        _httpClient.GetArrowReaderAsync(JobUrl, cancellationToken: cancellationToken);

    internal static async Task<ArrowJob> CreateAsync<TRequest>(
        HttpClient httpClient,
        string jobsUri,
        TRequest request,
        CancellationToken cancellationToken)
        where TRequest : notnull
    {
        ThrowHelper.ThrowIfNull(httpClient);
        ThrowHelper.ThrowIfNullOrEmpty(jobsUri);
        ThrowHelper.ThrowIfNull(request);

        using HttpResponseMessage response = await httpClient
            .PostAsJsonAsync(jobsUri, request, cancellationToken)
            .ConfigureAwait(false);

        response.EnsureSuccessStatusCode();

        ArrowJobStatus status = await response.Content
            .ReadFromJsonAsync<ArrowJobStatus>(JsonCompat.Web, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new InvalidOperationException("Boş job yanıtı.");

        return new ArrowJob(httpClient, status);
    }
}

/// <summary><see cref="HttpClient"/> için Arrow job extension'ları.</summary>
public static class HttpClientArrowJobExtensions
{
    /// <summary>JSON job isteği gönderir; <see cref="ArrowJob"/> döner.</summary>
    public static Task<ArrowJob> PostArrowJobAsync<TRequest>(
        this HttpClient httpClient,
        string jobsUri,
        TRequest request,
        CancellationToken cancellationToken = default)
        where TRequest : notnull =>
        ArrowJob.CreateAsync(httpClient, jobsUri, request, cancellationToken);
}
