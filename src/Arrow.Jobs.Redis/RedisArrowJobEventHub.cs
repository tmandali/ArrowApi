using StackExchange.Redis;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading.Channels;

namespace Arrow.Jobs.Redis;

// ═══════════════════════════════════════════════════════════════════════
// REMARK (2026-09-16) — "detail panel 2 event gösteriyor" bulgusu
// ═══════════════════════════════════════════════════════════════════════
// SORUN: 3.3M satırlık raporda ~330 progress event'i → hepsi RPUSH edilince
//   200-entry cap baştaki status/info adımlarını evict ediyordu; persisted
//   event-log yalnız [progress, completed] kalıyordu (detail panel 2 satır).
//
// İLK DÜZELME ÇAĞRISI (ÇALIŞMADI, GERİ ALINDI): LPOS glob + LSET ile
//   progress'i yerinde güncelleme. Bu Redis instance'ında (7.4.11) LPOS
//   glob deseni eşleşmesi KIRIKTI: `LPOS key '*'` bile boş dönüyordu
//   (yalnız exact-match çalışıyordu). LPOS -1 dönünce her progress RPUSH
//   koluna düşüyordu → sorun devam ediyordu. LPOS glob'a DİLANILMASIN.
//
// FİNAL TASARIM (güncel): progress event'leri ana listeye KESİNLE yazılmaz;
//   tek kayıt olarak ProgressKey (SET, overwrite) içinde tutulur.
//   GetHistoryAsync okuma anında progress'i terminal event'ten hemen önce
//   birleştirir → /event-log + SSE replay her zaman [status, info…, progress,
//   terminal] döndürür. Canlı pub/sub akışı değişmedi.
//
// DOĞRULAMA ADIMLARI (sorun tekrar ederse):
//   1) Redis:  LLEN arrow:job:event-log:<id:N>  → küçük olmalı (≤ ~10)
//              EXISTS arrow:job:progress:<id:N> → 1 olmalı
//   2) HTTP:    GET /api/arrow/jobs/<id>/event-log
//               → eventName dizisi: [status, info, info, progress, completed]
//   3) DevTools: event-log response 5 entry + occurredAt dolu olmalı.
//   NOT: progress entry'sinin `at` = SON batch'in zamanı (completed ile aynı
//   saniye gibi görünür) — overwrite tasarımının doğal sonucu, bug DEĞİL.
// ═══════════════════════════════════════════════════════════════════════

public sealed class RedisArrowJobEventHub : IArrowJobEventHub
{
    private const int MaxHistoryPerJob = 200;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IConnectionMultiplexer _redis;

    public RedisArrowJobEventHub(IConnectionMultiplexer redis)
    {
        _redis = redis ?? throw new ArgumentNullException(nameof(redis));
    }

    private static RedisChannel ChannelName(Guid jobId) =>
        RedisChannel.Literal($"arrow:job:events:{jobId:N}");

    private static RedisKey HistoryKey(Guid jobId) =>
        $"arrow:job:event-log:{jobId:N}";

    /// <summary>
    /// Progress event'inin tek kayıt'ı — her progress'te overwrite edilir (SET).
    /// Ana listeye RPUSH edilmez: 330 batch'lik bir raporda 330 progress entry'si
    /// 200-entry cap'ini doldurup baştaki status/info adımlarını evict ederdi.
    /// <see cref="GetHistoryAsync"/> okumada birleştirir.
    /// </summary>
    private static RedisKey ProgressKey(Guid jobId) =>
        $"arrow:job:progress:{jobId:N}";

    public async ValueTask PublishAsync(
        Guid jobId,
        string eventName,
        ArrowJobEvent payload,
        CancellationToken cancellationToken = default)
    {
        ArrowJobEvent stamped = payload.OccurredAt is null
            ? payload with { OccurredAt = DateTimeOffset.UtcNow }
            : payload;
        ArrowJobHubMessage message = new(eventName, stamped);
        string json = JsonSerializer.Serialize(message, JsonOptions);

        IDatabase db = _redis.GetDatabase();
        if (eventName is ArrowJobEventNames.Progress)
        {
            // Progress yüksek frekansla akar; tek kayıt olarak ayrı anahtarda tutulur.
            // Canlı aboneler yine de her progress event'i pub/sub kanalından alır;
            // bu yalnızca persisted event-log'u (GetHistoryAsync / /event-log) etkiler.
            await db.StringSetAsync(ProgressKey(jobId), json, TimeSpan.FromDays(14));
        }
        else
        {
            await db.ListRightPushAsync(HistoryKey(jobId), json);
            await db.ListTrimAsync(HistoryKey(jobId), -MaxHistoryPerJob, -1);
        }
        // Terminal state'e geçilince event log'una da TTL ver
        // (Redis'te EXPIRE şart — InMemory hub'dan farklı olarak Redis sonsuz şişer).
        if (eventName is ArrowJobEventNames.Completed or ArrowJobEventNames.Failed or ArrowJobEventNames.Cancelled)
        {
            await db.KeyExpireAsync(HistoryKey(jobId), TimeSpan.FromDays(14));
            await db.KeyExpireAsync(ProgressKey(jobId), TimeSpan.FromDays(14));
        }
        await _redis.GetSubscriber().PublishAsync(ChannelName(jobId), json);
    }

    public async ValueTask<IReadOnlyList<ArrowJobHubMessage>> GetHistoryAsync(
        Guid jobId,
        CancellationToken cancellationToken = default)
    {
        IDatabase db = _redis.GetDatabase();
        RedisValue[] values = await db.ListRangeAsync(HistoryKey(jobId));

        var list = new List<ArrowJobHubMessage>(values.Length);
        foreach (RedisValue value in values)
        {
            if (value.IsNullOrEmpty)
                continue;

            ArrowJobHubMessage? message = TryDeserialize(value);
            if (message is not null)
                list.Add(message);
        }

        // Progress entry'si ayrı anahtarda (tek kayıt). Terminal event'ten hemen önce
        // listeye yerleştirilir — client'taki upsert mantığı progress'i zaten tek satırda tutar.
        RedisValue progressValue = await db.StringGetAsync(ProgressKey(jobId));
        ArrowJobHubMessage? progress = progressValue.IsNullOrEmpty ? null : TryDeserialize(progressValue);
        if (progress is not null)
        {
            int insertAt = list.FindIndex(m => IsTerminalEvent(m.EventName));
            if (insertAt < 0)
                insertAt = list.Count;

            var merged = new List<ArrowJobHubMessage>(list.Count + 1);
            for (int i = 0; i < list.Count; i++)
            {
                if (i == insertAt)
                    merged.Add(progress);

                merged.Add(list[i]);
            }

            return merged;
        }

        return list;

        static ArrowJobHubMessage? TryDeserialize(RedisValue value)
        {
            try
            {
                return JsonSerializer.Deserialize<ArrowJobHubMessage>(value.ToString(), JsonOptions);
            }
            catch (JsonException)
            {
                return null; // bozuk kaydı atla
            }
        }

        static bool IsTerminalEvent(string eventName) =>
            eventName is ArrowJobEventNames.Completed or ArrowJobEventNames.Failed or ArrowJobEventNames.Cancelled;
    }

    public IArrowJobEventSubscription Subscribe(Guid jobId)
    {
        Channel<ArrowJobHubMessage> channel = Channel.CreateUnbounded<ArrowJobHubMessage>(
            new UnboundedChannelOptions
            {
                SingleReader = true,
                SingleWriter = false,
                AllowSynchronousContinuations = false
            });

        ISubscriber subscriber = _redis.GetSubscriber();
        RedisChannel redisChannel = ChannelName(jobId);

        Action<RedisChannel, RedisValue> handler = (_, value) =>
        {
            if (value.IsNullOrEmpty)
                return;

            try
            {
                ArrowJobHubMessage? message = JsonSerializer.Deserialize<ArrowJobHubMessage>(value.ToString(), JsonOptions);
                if (message is not null)
                    channel.Writer.TryWrite(message);
            }
            catch (JsonException)
            {
                // bozuk mesajı yut
            }
        };

        subscriber.Subscribe(redisChannel, handler);

        return new Subscription(channel.Reader, () =>
        {
            try
            {
                subscriber.Unsubscribe(redisChannel, handler);
            }
            finally
            {
                channel.Writer.TryComplete();
            }
        });
    }

    private sealed class Subscription : IArrowJobEventSubscription
    {
        private readonly ChannelReader<ArrowJobHubMessage> _reader;
        private readonly Action _dispose;
        private int _disposed;

        public Subscription(ChannelReader<ArrowJobHubMessage> reader, Action dispose)
        {
            _reader = reader;
            _dispose = dispose;
        }

        public IAsyncEnumerable<ArrowJobHubMessage> Messages => _reader.ReadAllAsync();

        public ValueTask DisposeAsync()
        {
            if (Interlocked.Exchange(ref _disposed, 1) == 0)
                _dispose();

            return default;
        }
    }
}
