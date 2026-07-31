using Arrow.Data;
using Arrow.Jobs;
using System.Diagnostics;
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

    internal ArrowJobStatus Status { get; private set; }

    /// <summary>Job benzersiz kimliği (GUID).</summary>
    public Guid Id => Status.Id;

    /// <summary>Job durumu (Queued, Running, Completed, Failed, Cancelled).</summary>
    public string State => Status.Status;

    /// <summary>Job HTTP endpoint adresi.</summary>
    public string JobUrl => Status.JobUrl;

    /// <summary>Job oluşturulma zamanı.</summary>
    public DateTimeOffset? CreatedAt => Status.CreatedAt;

    /// <summary>Job tamamlanma zamanı.</summary>
    public DateTimeOffset? CompletedAt => Status.CompletedAt;

    /// <summary>Hata durumunda hata mesajı.</summary>
    public string? Error => Status.Error;

    /// <summary>Yeniden deneme (retry) yapılmışsa orijinal job kimliği.</summary>
    public Guid? RetriedFrom => Status.RetriedFrom;

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

    /// <summary>Tamamlanmış job'ın Arrow sonuçlarını okumak için okuyucu <see cref="Result{T}"/> olarak döndürür.</summary>
    public Task<Result<ArrowBatchReader>> GetArrowReaderAsync(
        CancellationToken cancellationToken = default) =>
        _httpClient.GetArrowReaderAsync(JobUrl, cancellationToken: cancellationToken);

    /// <summary>Job istek gövdesini (request DTO) sunucudan çeker.</summary>
    public async Task<TRequest> GetRequestAsync<TRequest>(CancellationToken cancellationToken = default)
    {
        using HttpResponseMessage response = await _httpClient
            .GetAsync(JobUrl.TrimEnd('/') + "/request", cancellationToken)
            .ConfigureAwait(false);

        response.EnsureSuccessStatusCode();

        return await response.Content
            .ReadFromJsonAsync<TRequest>(JsonCompat.Web, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new InvalidOperationException("Boş request yanıtı.");
    }

    /// <summary>Kuyruktaki veya çalışan job'ı iptal eder.</summary>
    public async Task CancelAsync(CancellationToken cancellationToken = default)
    {
        using HttpResponseMessage response = await _httpClient
            .PostAsync(JobUrl.TrimEnd('/') + "/cancel", content: null, cancellationToken)
            .ConfigureAwait(false);

        response.EnsureSuccessStatusCode();

        ArrowJobStatus status = await response.Content
            .ReadFromJsonAsync<ArrowJobStatus>(JsonCompat.Web, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new InvalidOperationException("Boş job yanıtı.");

        Status = status;
    }

    /// <summary>Başarısız veya iptal edilmiş job'ı yeniden başlatır ve yeni tutamaç döndürür.</summary>
    public async Task<ArrowJob> RetryAsync(CancellationToken cancellationToken = default)
    {
        using HttpResponseMessage response = await _httpClient
            .PostAsync(JobUrl.TrimEnd('/') + "/retry", content: null, cancellationToken)
            .ConfigureAwait(false);

        response.EnsureSuccessStatusCode();

        ArrowJobStatus status = await response.Content
            .ReadFromJsonAsync<ArrowJobStatus>(JsonCompat.Web, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new InvalidOperationException("Boş job yanıtı.");

        return new ArrowJob(_httpClient, status);
    }

    /// <summary>Job kaydını ve sonuçlarını sunucudan siler.</summary>
    public async Task DeleteAsync(CancellationToken cancellationToken = default)
    {
        using HttpResponseMessage response = await _httpClient
            .DeleteAsync(JobUrl, cancellationToken)
            .ConfigureAwait(false);

        response.EnsureSuccessStatusCode();
    }

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

        using Activity? activity = ArrowClientActivity.Source.StartActivity(
            "ArrowJob.Create",
            ActivityKind.Client);
        activity?.SetTag("arrow.job.request_type", typeof(TRequest).FullName);
        activity?.SetTag("http.url", jobsUri);

        try
        {
            using HttpResponseMessage response = await httpClient
                .PostAsJsonAsync(jobsUri, request, cancellationToken)
                .ConfigureAwait(false);

            response.EnsureSuccessStatusCode();

            ArrowJobStatus status = await response.Content
                .ReadFromJsonAsync<ArrowJobStatus>(JsonCompat.Web, cancellationToken)
                .ConfigureAwait(false)
                ?? throw new InvalidOperationException("Boş job yanıtı.");

            activity?.SetTag("arrow.job.id", status.Id.ToString("D"));
            activity?.SetStatus(ActivityStatusCode.Ok);
            return new ArrowJob(httpClient, status);
        }
        catch (Exception ex)
        {
            activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
            activity?.AddException(ex);
            throw;
        }
    }

    internal static async Task<ArrowJobStatusList> ListAsync(
        HttpClient httpClient,
        string jobsUri,
        ArrowJobState? state,
        DateTimeOffset? from,
        DateTimeOffset? to,
        int? skip,
        int? take,
        CancellationToken cancellationToken)
    {
        ThrowHelper.ThrowIfNull(httpClient);
        ThrowHelper.ThrowIfNullOrEmpty(jobsUri);

        string uri = BuildListUri(jobsUri, state, from, to, skip, take);
        using HttpResponseMessage response = await httpClient
            .GetAsync(uri, cancellationToken)
            .ConfigureAwait(false);

        response.EnsureSuccessStatusCode();

        return await response.Content
            .ReadFromJsonAsync<ArrowJobStatusList>(JsonCompat.Web, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new InvalidOperationException("Boş job listesi yanıtı.");
    }

    private static string BuildListUri(
        string jobsUri,
        ArrowJobState? state,
        DateTimeOffset? from,
        DateTimeOffset? to,
        int? skip,
        int? take)
    {
        var parts = new List<string>();
        if (state is { } s)
            parts.Add("state=" + Uri.EscapeDataString(s.ToString()));
        if (from is { } f)
            parts.Add("from=" + Uri.EscapeDataString(f.UtcDateTime.ToString("O")));
        if (to is { } t)
            parts.Add("to=" + Uri.EscapeDataString(t.UtcDateTime.ToString("O")));
        if (skip is { } sk)
            parts.Add("skip=" + sk.ToString(System.Globalization.CultureInfo.InvariantCulture));
        if (take is { } tk)
            parts.Add("take=" + tk.ToString(System.Globalization.CultureInfo.InvariantCulture));

        if (parts.Count == 0)
            return jobsUri;

        char separator = jobsUri.IndexOf('?') >= 0 ? '&' : '?';
        return jobsUri + separator + string.Join("&", parts);
    }
}

/// <summary><see cref="HttpClient"/> için Arrow job extension'ları.</summary>
public static class HttpClientArrowJobExtensions
{
    /// <summary>
    /// JSON job isteği gönderir; <see cref="ArrowJob"/> döner.
    /// <see cref="ArrowClientActivity"/> ile <c>ArrowJob.Create</c> span açar (OTel: <c>AddSource(ArrowClientActivity.SourceName)</c>).
    /// </summary>
    public static Task<ArrowJob> PostArrowJobAsync<TRequest>(
        this HttpClient httpClient,
        string jobsUri,
        TRequest request,
        CancellationToken cancellationToken = default)
        where TRequest : notnull =>
        ArrowJob.CreateAsync(httpClient, jobsUri, request, cancellationToken);

    public static Task<ArrowJobStatusList> GetArrowJobsAsync(
        this HttpClient httpClient,
        string jobsUri,
        ArrowJobState? state = null,
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
        int? skip = null,
        int? take = null,
        CancellationToken cancellationToken = default) =>
        ArrowJob.ListAsync(httpClient, jobsUri, state, from, to, skip, take, cancellationToken);
}
