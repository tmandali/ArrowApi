using System.Text.Json;
using Npgsql;

namespace Arrow.Jobs.Postgres;

/// <summary>
/// Postgres (Npgsql) tabanlı job deposu. Tüm request tipleri tek
/// <c>arrow_jobs</c> tablosunda saklanır; <c>job_type</c> sütunu
/// <typeparamref name="TRequest"/> ayrımını yapar (Redis'teki <c>TypeKey</c> benzeri).
/// </summary>
public sealed class PostgresArrowJobStore<TRequest> : IArrowJobStore<TRequest>
    where TRequest : notnull
{
    private const string TableName = "arrow_jobs";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly string TypeKey = typeof(TRequest).FullName ?? typeof(TRequest).Name;

    private const int StateQueued = (int)ArrowJobState.Queued;
    private const int StateRunning = (int)ArrowJobState.Running;
    private const int StateCompleted = (int)ArrowJobState.Completed;
    private const int StateFailed = (int)ArrowJobState.Failed;
    private const int StateCancelled = (int)ArrowJobState.Cancelled;

    private const string SelectColumns =
        "id, name, request, state, result_path, error_message, batch_count, total_rows, " +
        "trace_id, parent_span_id, trace_flags, request_hash, root_job_id, parent_job_id, created_at, completed_at";

    private readonly NpgsqlDataSource _source;

    public PostgresArrowJobStore(NpgsqlDataSource source)
    {
        _source = source ?? throw new ArgumentNullException(nameof(source));
    }

    /// <summary>Seçilen sütun sırasıyla eşleşen satır haritası (SelectColumns ile senkron).</summary>
    private static ArrowJob<TRequest> MapRow(NpgsqlDataReader reader) =>
        new()
        {
            Id = reader.GetGuid(0),
            Name = reader.IsDBNull(1) ? null : reader.GetString(1),
            Request = JsonSerializer.Deserialize<TRequest>(reader.GetString(2), JsonOptions)!,
            State = (ArrowJobState)reader.GetInt32(3),
            ResultPath = reader.IsDBNull(4) ? null : reader.GetString(4),
            Error = reader.IsDBNull(5) ? null : reader.GetString(5),
            BatchCount = reader.GetInt32(6),
            TotalRows = reader.GetInt64(7),
            TraceId = reader.IsDBNull(8) ? null : reader.GetString(8),
            ParentSpanId = reader.IsDBNull(9) ? null : reader.GetString(9),
            TraceFlags = reader.IsDBNull(10) ? null : (byte)reader.GetInt32(10),
            RequestHash = reader.IsDBNull(11) ? null : reader.GetString(11),
            RootJobId = reader.GetGuid(12),
            ParentJobId = reader.IsDBNull(13) ? null : reader.GetGuid(13),
            CreatedAt = reader.GetFieldValue<DateTimeOffset>(14),
            CompletedAt = reader.IsDBNull(15) ? null : reader.GetFieldValue<DateTimeOffset>(15),
        };

    // ─────────────────────────── Jenerik üyeler ───────────────────────────

    public async Task<ArrowJob<TRequest>> CreateAsync(
        TRequest request,
        string? name = null,
        Guid? rootJobId = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        Guid jobId = Guid.NewGuid();
        var job = new ArrowJob<TRequest>
        {
            Id = jobId,
            Name = name,
            RootJobId = rootJobId ?? jobId,
            Request = request,
            RequestHash = ArrowJobRequestHasher.ComputeHash(request),
        };
        ArrowJobTracePropagation.CaptureCurrent(job);

        await using NpgsqlConnection connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"""
             INSERT INTO {TableName}
               (id, job_type, name, request, state, batch_count, total_rows,
                trace_id, parent_span_id, trace_flags, request_hash,
                root_job_id, parent_job_id, created_at)
             VALUES
               (@id, @jobType, @name, @request::jsonb, @state, @batchCount, @totalRows,
                @traceId, @parentSpanId, @traceFlags, @requestHash,
                @rootJobId, @parentJobId, @createdAt)
            """,
            connection);
        cmd.Parameters.AddWithValue("@id", jobId);
        cmd.Parameters.AddWithValue("@jobType", TypeKey);
        cmd.Parameters.AddWithValue("@name", (object?)name ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@request", JsonSerializer.Serialize(job, JsonOptions));
        cmd.Parameters.AddWithValue("@state", (int)job.State);
        cmd.Parameters.AddWithValue("@batchCount", job.BatchCount);
        cmd.Parameters.AddWithValue("@totalRows", job.TotalRows);
        cmd.Parameters.AddWithValue("@traceId", (object?)job.TraceId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@parentSpanId", (object?)job.ParentSpanId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@traceFlags", (object?)job.TraceFlags ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@requestHash", job.RequestHash);
        cmd.Parameters.AddWithValue("@rootJobId", job.RootJobId);
        cmd.Parameters.AddWithValue("@parentJobId", (object?)job.ParentJobId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@createdAt", job.CreatedAt);

        int affected = await cmd.ExecuteNonQueryAsync(cancellationToken);
        if (affected != 1)
            throw new InvalidOperationException("Job kaydı oluşturulamadı.");

        return job;
    }

    public async Task<ArrowJob<TRequest>?> FindDuplicateAsync(
        TRequest request,
        string? name = null,
        TimeSpan? window = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        string hash = ArrowJobRequestHasher.ComputeHash(request);

        string where =
            "job_type = @type AND request_hash = @hash";
        if (!string.IsNullOrWhiteSpace(name))
            where += " AND (name IS NULL OR name = '' OR lower(name) = lower(@name))";

        where += " AND (state IN (@queued, @running)";
        DateTimeOffset? cutoff = window.HasValue ? DateTimeOffset.UtcNow - window.Value : null;
        if (cutoff is not null)
            where += " OR created_at >= @cutoff";
        where += ")";

        await using NpgsqlConnection connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"SELECT {SelectColumns} FROM {TableName} WHERE {where} " +
            "ORDER BY created_at DESC, id DESC LIMIT 1",
            connection);
        cmd.Parameters.AddWithValue("@type", TypeKey);
        cmd.Parameters.AddWithValue("@hash", hash);
        if (!string.IsNullOrWhiteSpace(name))
            cmd.Parameters.AddWithValue("@name", name);
        cmd.Parameters.AddWithValue("@queued", StateQueued);
        cmd.Parameters.AddWithValue("@running", StateRunning);
        if (cutoff is { } c)
            cmd.Parameters.AddWithValue("@cutoff", c);

        await using NpgsqlDataReader reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            return null;

        return MapRow(reader);
    }

    public async Task<ArrowJob<TRequest>?> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using NpgsqlConnection connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"SELECT {SelectColumns} FROM {TableName} WHERE id = @id AND job_type = @type",
            connection);
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@type", TypeKey);

        await using NpgsqlDataReader reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            return null;

        return MapRow(reader);
    }

    public async Task<ArrowJobListPage<TRequest>> ListAsync(
        ArrowJobListQuery query,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);

        int take = Math.Clamp(query.Take, 1, 500);
        int skip = Math.Max(0, query.Skip);

        List<string> clauses = ["job_type = @type"];
        var parameters = new List<(string Name, object Value)>
        {
            ("type", TypeKey),
        };

        if (query.State is { } state)
        {
            clauses.Add("state = @state");
            parameters.Add(("state", (int)state));
        }
        if (query.From is { } from)
        {
            clauses.Add("created_at >= @from");
            parameters.Add(("from", from));
        }
        if (query.To is { } to)
        {
            clauses.Add("created_at <= @to");
            parameters.Add(("to", to));
        }
        if (query.RootJobId is { } root)
        {
            clauses.Add("root_job_id = @root");
            parameters.Add(("root", root));
        }
        if (!string.IsNullOrWhiteSpace(query.Name))
        {
            // InMemory semantiği: name filtresi, henüz name'siz kayıtlanmış eski job'ları da kapsar.
            clauses.Add("(name IS NULL OR name = '' OR lower(name) = lower(@name))");
            parameters.Add(("name", query.Name));
        }

        string where = string.Join(" AND ", clauses);

        await using NpgsqlConnection connection = await _source.OpenConnectionAsync(cancellationToken);

        await using var countCmd = new NpgsqlCommand(
            $"SELECT count(*) FROM {TableName} WHERE {where}", connection);
        BindParameters(countCmd, parameters);
        int total = Convert.ToInt32(await countCmd.ExecuteScalarAsync(cancellationToken)
            ?? throw new InvalidOperationException("Toplam sayı hesaplanamadı."));

        await using var cmd = new NpgsqlCommand(
            $"SELECT {SelectColumns} FROM {TableName} WHERE {where} " +
            "ORDER BY created_at DESC, id DESC OFFSET @offset LIMIT @limit",
            connection);
        BindParameters(cmd, parameters);
        cmd.Parameters.AddWithValue("@offset", skip);
        cmd.Parameters.AddWithValue("@limit", take);

        var items = new List<ArrowJob<TRequest>>();
        await using NpgsqlDataReader reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            items.Add(MapRow(reader));

        return new ArrowJobListPage<TRequest>
        {
            Items = items,
            Total = total,
        };
    }

    public async Task MarkRunningAsync(Guid id, CancellationToken cancellationToken = default) =>
        await ExecuteGuardedUpdateAsync(
            "SET state = @to WHERE id = @id AND job_type = @type AND state <> @cancelled",
            id,
            new List<(string, object)>
            {
                ("to", StateRunning),
            },
            cancellationToken);

    public async Task ReportProgressAsync(Guid id, int batchCount, long totalRows, CancellationToken cancellationToken = default)
    {
        // İptal/silme yarışında kaybolursa no-op — InMemory davranışıyla aynı.
        await ExecuteGuardedUpdateAsync(
            "SET batch_count = @batchCount, total_rows = @totalRows " +
            "WHERE id = @id AND job_type = @type AND state <> @cancelled",
            id,
            new List<(string, object)>
            {
                ("batchCount", batchCount),
                ("totalRows", totalRows),
            },
            cancellationToken);
    }

    public async Task MarkCompletedAsync(Guid id, string resultPath, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(resultPath);

        await ExecuteGuardedUpdateAsync(
            "SET state = @to, result_path = @resultPath, completed_at = @now " +
            "WHERE id = @id AND job_type = @type AND state <> @cancelled",
            id,
            new List<(string, object)>
            {
                ("to", StateCompleted),
                ("resultPath", resultPath),
                ("now", DateTimeOffset.UtcNow),
            },
            cancellationToken);
    }

    public async Task MarkFailedAsync(Guid id, string error, CancellationToken cancellationToken = default)
    {
        await ExecuteGuardedUpdateAsync(
            "SET state = @to, error_message = @error, completed_at = @now " +
            "WHERE id = @id AND job_type = @type AND state <> @cancelled",
            id,
            new List<(string, object)>
            {
                ("to", StateFailed),
                ("error", error),
                ("now", DateTimeOffset.UtcNow),
            },
            cancellationToken);
    }

    public async Task<bool> TryCancelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using NpgsqlConnection connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"UPDATE {TableName} SET state = @to, completed_at = @now " +
            "WHERE id = @id AND job_type = @type AND state IN (@queued, @running)",
            connection);
        cmd.Parameters.AddWithValue("@to", StateCancelled);
        cmd.Parameters.AddWithValue("@now", DateTimeOffset.UtcNow);
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@type", TypeKey);
        cmd.Parameters.AddWithValue("@queued", StateQueued);
        cmd.Parameters.AddWithValue("@running", StateRunning);

        return (await cmd.ExecuteNonQueryAsync(cancellationToken)) == 1;
    }

    public async Task<bool> TryDeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using NpgsqlConnection connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"DELETE FROM {TableName} WHERE id = @id AND job_type = @type AND state <> @running",
            connection);
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@type", TypeKey);
        cmd.Parameters.AddWithValue("@running", StateRunning);

        return (await cmd.ExecuteNonQueryAsync(cancellationToken)) == 1;
    }

    // ─────────────────────── Non-jenerik üyeler ───────────────────────────

    public async Task<ArrowJobStatus?> GetStatusAsync(
        Guid id,
        string jobsBasePath = "/api/arrow/jobs",
        CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest>? job = await GetAsync(id, cancellationToken);
        if (job is null)
            return null;

        string cleanBase = jobsBasePath.TrimEnd('/');
        string jobUrl = $"{cleanBase}/{id}";
        string eventsUrl = $"{cleanBase}/{id}/events";

        return new ArrowJobStatus(
            job.Id,
            job.State.ToString(),
            jobUrl,
            eventsUrl,
            job.CreatedAt,
            job.CompletedAt,
            job.Error,
            job.BatchCount,
            job.TotalRows,
            null,
            job.Name,
            job.RootJobId,
            job.ParentJobId);
    }

    public Task<bool> TryCancelJobAsync(Guid id, CancellationToken cancellationToken = default) =>
        TryCancelAsync(id, cancellationToken);

    public Task<bool> TryDeleteJobAsync(Guid id, CancellationToken cancellationToken = default) =>
        TryDeleteAsync(id, cancellationToken);

    public async Task<string?> GetResultPathAsync(Guid id, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest>? job = await GetAsync(id, cancellationToken);
        return job?.ResultPath;
    }

    public async Task<object?> GetRequestAsync(Guid id, CancellationToken cancellationToken = default)
    {
        ArrowJob<TRequest>? job = await GetAsync(id, cancellationToken);
        return job is null ? null : job.Request;
    }

    // ─────────────────────────── Yardımcılar ──────────────────────────────

    private static void BindParameters(NpgsqlCommand cmd, List<(string Name, object Value)> parameters)
    {
        foreach ((string n, object v) in parameters)
            cmd.Parameters.AddWithValue(n, v);
    }

    private async Task ExecuteGuardedUpdateAsync(
        string setClause,
        Guid id,
        List<(string, object)> extraParameters,
        CancellationToken cancellationToken)
    {
        await using NpgsqlConnection connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(
            $"UPDATE {TableName} {setClause}", connection);
        foreach ((string n, object v) in extraParameters)
            cmd.Parameters.AddWithValue(n, v);
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@type", TypeKey);
        cmd.Parameters.AddWithValue("@cancelled", StateCancelled);

        _ = await cmd.ExecuteNonQueryAsync(cancellationToken);
    }
}
