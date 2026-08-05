namespace Arrow.Jobs;

/// <summary>Arrow Job yaşam döngüsü durumları.</summary>
public enum ArrowJobState
{
    /// <summary>İş kuyruğa alındı, işlenmeyi bekliyor.</summary>
    Queued,
    /// <summary>İş şu anda bir worker tarafından yürütülüyor.</summary>
    Running,
    /// <summary>İş başarıyla tamamlandı.</summary>
    Completed,
    /// <summary>İş yürütülürken hata oluştu ve başarısız oldu.</summary>
    Failed,
    /// <summary>İş kullanıcı veya sistem tarafından iptal edildi.</summary>
    Cancelled
}

/// <summary>Arka plan job model tanımı.</summary>
/// <typeparam name="TRequest">İstek DTO tipi.</typeparam>
public sealed class ArrowJob<TRequest>
    where TRequest : notnull
{
    /// <summary>Job benzersiz kimliği.</summary>
    public required Guid Id { get; init; }
    /// <summary>Job kayıt adı.</summary>
    public string? Name { get; set; }
    /// <summary>Job istek verisi.</summary>
    public required TRequest Request { get; init; }
    /// <summary>Mevcut job durumu.</summary>
    public ArrowJobState State { get; set; } = ArrowJobState.Queued;
    /// <summary>Sonuç verilerinin saklandığı dosya/depo yolu.</summary>
    public string? ResultPath { get; set; }
    /// <summary>Başarısızlık durumunda hata detayı.</summary>
    public string? Error { get; set; }
    /// <summary>Üretilen toplam batch sayısı.</summary>
    public int BatchCount { get; set; }
    /// <summary>Üretilen toplam satır sayısı.</summary>
    public long TotalRows { get; set; }
    /// <summary>HTTP create isteğinin W3C <c>trace-id</c> (hex).</summary>
    public string? TraceId { get; set; }
    /// <summary>HTTP create span'inin W3C <c>span-id</c> (hex) — job span buna child olur.</summary>
    public string? ParentSpanId { get; set; }
    /// <summary>W3C izleme bayrakları.</summary>
    public byte? TraceFlags { get; set; }
    /// <summary>Tekilleştirme için istek özeti hash'i.</summary>
    public string? RequestHash { get; set; }
    /// <summary>Kök (zincirin ilk) job kimliği.</summary>
    public Guid RootJobId { get; set; }
    /// <summary>Üst (doğrudan tetikleyen) job kimliği.</summary>
    public Guid? ParentJobId { get; set; }
    /// <summary>Oluşturulma zamanı.</summary>
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    /// <summary>Tamamlanma zamanı.</summary>
    public DateTimeOffset? CompletedAt { get; set; }
}

/// <summary>Veritabanı sorgusu çalıştırma job isteği.</summary>
/// <param name="CnnName">Bağlantı adı.</param>
/// <param name="Query">Sorgu metni.</param>
/// <param name="Parameters">Sorgu parametreleri.</param>
/// <param name="BatchSize">İsteğe bağlı batch boyutu.</param>
public sealed record ArrowQueryRequest(
    string CnnName,
    string Query,
    IDictionary<string, object?> Parameters,
    int? BatchSize = null) : Arrow.Http.AspNetCore.Dispatcher.IRequest<System.Collections.Generic.IAsyncEnumerable<Apache.Arrow.RecordBatch>>;

/// <summary>Job durum yanıt modeli (DTO).</summary>
public sealed record ArrowJobStatus(
    Guid Id,
    string Status,
    string JobUrl,
    string? EventsUrl = null,
    DateTimeOffset? CreatedAt = null,
    DateTimeOffset? CompletedAt = null,
    string? Error = null,
    int? BatchCount = null,
    long? TotalRows = null,
    Guid? RetriedFrom = null,
    string? Name = null,
    Guid? RootJobId = null,
    Guid? ParentJobId = null);

/// <summary>Job listeleme sorgu parametreleri.</summary>
public sealed record ArrowJobListQuery(
    ArrowJobState? State = null,
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    int Skip = 0,
    int Take = 50,
    Guid? RootJobId = null,
    string? Name = null);

/// <summary>Job listesi sayfalama sonucu.</summary>
/// <typeparam name="TRequest">İstek DTO tipi.</typeparam>
public sealed class ArrowJobListPage<TRequest>
    where TRequest : notnull
{
    /// <summary>Sayfadaki job öğeleri.</summary>
    public required IReadOnlyList<ArrowJob<TRequest>> Items { get; init; }
    /// <summary>Toplam job sayısı.</summary>
    public required int Total { get; init; }
}

/// <summary>Job durum listesi DTO.</summary>
public sealed record ArrowJobStatusList(
    IReadOnlyList<ArrowJobStatus> Items,
    int Total);

/// <summary>SSE <c>/events</c> endpoint'inin <c>data</c> payload'ı.</summary>
public sealed record ArrowJobEvent(
    Guid? Id = null,
    string? Status = null,
    DateTimeOffset? CreatedAt = null,
    DateTimeOffset? CompletedAt = null,
    string? Error = null,
    string? JobUrl = null,
    string? EventsUrl = null,
    int? BatchCount = null,
    long? TotalRows = null,
    string? Message = null,
    string? TraceId = null,
    string? Name = null,
    Guid? RootJobId = null);

/// <summary>Job SSE olay isimleri sabitleri.</summary>
public static class ArrowJobEventNames
{
    /// <summary>Durum değişikliği olayı (<c>status</c>).</summary>
    public const string Status = "status";
    /// <summary>İlerleme olayı (<c>progress</c>).</summary>
    public const string Progress = "progress";
    /// <summary>Tamamlandı olayı (<c>completed</c>).</summary>
    public const string Completed = "completed";
    /// <summary>Başarısız oldu olayı (<c>failed</c>).</summary>
    public const string Failed = "failed";
    /// <summary>Hata olayı (<c>error</c>).</summary>
    public const string Error = "error";

    /// <summary>Worker bilgilendirme metni (<see cref="ArrowJobEvent.Message"/>). Job state değildir.</summary>
    public const string Info = "info";

    /// <summary>İptal edildi olayı (<c>cancelled</c>).</summary>
    public const string Cancelled = "cancelled";
}
