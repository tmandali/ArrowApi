using System.Net.Http.Json;
using System.Net.ServerSentEvents;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Arrow.Data;
using Arrow.Jobs;

namespace Arrow.Http.Client;

/// <summary>Client tarafında oluşturulmuş job tutamacı.</summary>
public sealed class ArrowJob
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

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

    public async IAsyncEnumerable<SseItem<ArrowJobEvent>> ReadEventsAsync(
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

        await using Stream stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        SseParser<ArrowJobEvent?> parser = SseParser.Create(stream, ParseEvent);

        await foreach (SseItem<ArrowJobEvent?> item in parser.EnumerateAsync(cancellationToken).ConfigureAwait(false))
        {
            if (item.Data is null)
                continue;

            yield return new SseItem<ArrowJobEvent>(item.Data, item.EventType);
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
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentException.ThrowIfNullOrEmpty(jobsUri);
        ArgumentNullException.ThrowIfNull(request);

        using HttpResponseMessage response = await httpClient
            .PostAsJsonAsync(jobsUri, request, cancellationToken)
            .ConfigureAwait(false);

        response.EnsureSuccessStatusCode();

        ArrowJobStatus status = await response.Content
            .ReadFromJsonAsync<ArrowJobStatus>(cancellationToken: cancellationToken)
            .ConfigureAwait(false)
            ?? throw new InvalidOperationException("Boş job yanıtı.");

        return new ArrowJob(httpClient, status);
    }

    private static ArrowJobEvent? ParseEvent(string eventType, ReadOnlySpan<byte> data) =>
        data.IsEmpty ? null : JsonSerializer.Deserialize<ArrowJobEvent>(data, JsonOptions);
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
