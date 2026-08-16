using Arrow.Data;
using Arrow.Http.AspNetCore;
using Microsoft.Extensions.DependencyInjection;
using System.Reflection;

namespace Arrow.Jobs.AspNetCore;

public static class ArrowJobEndpoints
{
    private static readonly string[] JobActionSuffixes =
    [
        "/events",
        "/event-log",
        "/request",
        "/cancel",
        "/retry"
    ];

    /// <summary>
    /// Kayıtlı tüm job'ları verilen <paramref name="prefix"/> yolu altında haritalar.
    /// Dönen <see cref="RouteGroupBuilder"/> üzerinden <c>.RequireAuthorization()</c> uygulanabilir.
    /// </summary>
    public static RouteGroupBuilder UseArrowApi(
        this IEndpointRouteBuilder endpoints,
        string prefix)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        ArgumentException.ThrowIfNullOrWhiteSpace(prefix);

        string normalizedPrefix = NormalizePath(prefix);
        RouteGroupBuilder group = endpoints.MapGroup(normalizedPrefix);

        var registrations = endpoints.ServiceProvider.GetServices<ArrowJobEndpointRegistration>().ToList();
        foreach (var reg in registrations)
        {
            if (reg.NameOrPath.StartsWith('/'))
            {
                MapRegisteredType(endpoints, reg.ServiceType, reg.NameOrPath, null);
            }
            else
            {
                string subPath = $"/{reg.NameOrPath.Trim('/')}";
                MapRegisteredType(group, reg.ServiceType, subPath, reg.NameOrPath);
            }
        }

        return group;
    }

    /// <summary>
    /// Job endpoint'lerini akıcı (fluent) yöntemle tek tek haritalar.
    /// </summary>
    public static IEndpointRouteBuilder UseArrowApi(
        this IEndpointRouteBuilder endpoints,
        Action<IArrowJobEndpointBuilder> configure)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        ArgumentNullException.ThrowIfNull(configure);

        var registrations = endpoints.ServiceProvider.GetServices<ArrowJobEndpointRegistration>().ToList();
        var builder = new ArrowJobEndpointBuilder(endpoints, registrations);
        configure(builder);

        return endpoints;
    }

    /// <summary>
    /// Job endpoint'lerini verilen <paramref name="prefix"/> ortak ön eki altında akıcı yöntemle haritalar.
    /// Dönen <see cref="RouteGroupBuilder"/> üzerinden <c>.RequireAuthorization()</c> uygulanabilir.
    /// </summary>
    public static RouteGroupBuilder UseArrowApi(
        this IEndpointRouteBuilder endpoints,
        string prefix,
        Action<IArrowJobEndpointBuilder> configure)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        ArgumentException.ThrowIfNullOrWhiteSpace(prefix);
        ArgumentNullException.ThrowIfNull(configure);

        string normalizedPrefix = NormalizePath(prefix);
        RouteGroupBuilder group = endpoints.MapGroup(normalizedPrefix);

        var registrations = endpoints.ServiceProvider.GetServices<ArrowJobEndpointRegistration>().ToList();
        var builder = new ArrowJobEndpointBuilder(group, registrations);
        configure(builder);

        return group;
    }

    /// <summary>
    /// Varsayılan prefix (<c>"/api/arrow/jobs"</c>) ile tüm kayıtlı job'ları haritalar.
    /// Dönen <see cref="RouteGroupBuilder"/> üzerinden <c>.RequireAuthorization()</c> uygulanabilir.
    /// </summary>
    public static RouteGroupBuilder UseArrowApi(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.UseArrowApi("/api/arrow/jobs");
    }

    internal static WebApplication MapArrowJob(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);
        app.UseArrowApi("/api/arrow/jobs");
        return app;
    }

    public static RouteGroupBuilder MapArrowJobEndpoints<T>(
        this IEndpointRouteBuilder endpoints,
        string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        return MapRegisteredType(endpoints, typeof(T), path, null);
    }

    internal static RouteGroupBuilder MapRegisteredType(
        IEndpointRouteBuilder endpoints,
        Type serviceType,
        string path,
        string? jobName = null)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        ArgumentNullException.ThrowIfNull(serviceType);

        Type requestType = ArrowJobTypeResolver.TryGetRequestType(serviceType)
            ?? serviceType;

        MethodInfo method = typeof(ArrowJobEndpoints)
            .GetMethod(nameof(MapArrowJobEndpointsCore), BindingFlags.NonPublic | BindingFlags.Static)!
            .MakeGenericMethod(requestType);

        return (RouteGroupBuilder)method.Invoke(null, [endpoints, path, jobName])!;
    }

    private static RouteGroupBuilder MapArrowJobEndpointsCore<TRequest>(
        IEndpointRouteBuilder endpoints,
        string path,
        string? jobName = null)
        where TRequest : notnull
    {
        string jobsPath = NormalizePath(path);
        RouteGroupBuilder group = endpoints.MapGroup(jobsPath);

        group.MapPost(
                string.Empty,
                (TRequest request, HttpRequest httpRequest, HttpContext httpContext, IArrowJobStore<TRequest> store, IArrowJobQueue<TRequest> queue, CancellationToken cancellationToken) =>
                    CreateJobAsync(request, jobName, httpRequest, httpContext, store, queue, cancellationToken))
            .Accepts<TRequest>("application/json");

        // Job tipine özel history: GET /api/arrow/jobs/{jobName}
        group.MapGet(
                string.Empty,
                (HttpRequest httpRequest, IArrowJobStore<TRequest> store, [FromQuery] string? state, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] int? skip, [FromQuery] int? take, [FromQuery] Guid? rootJobId, CancellationToken cancellationToken) =>
                    ListJobsAsync(httpRequest, store, state, from, to, skip, take, rootJobId, jobName, cancellationToken))
            .Produces<ArrowJobStatusList>();

        bool shouldMapGuidRoutes = !endpoints.DataSources
            .SelectMany(ds => ds.Endpoints)
            .OfType<Microsoft.AspNetCore.Routing.RouteEndpoint>()
            .Any(e => e.RoutePattern.RawText?.EndsWith("{id:guid}", StringComparison.OrdinalIgnoreCase) == true);

        if (shouldMapGuidRoutes)
        {
            IEndpointRouteBuilder targetBuilder = string.IsNullOrEmpty(jobsPath) ? group : endpoints;

            if (!string.IsNullOrEmpty(jobsPath))
            {
                targetBuilder.MapGet(
                        string.Empty,
                        (HttpRequest httpRequest, IArrowJobStore<TRequest> store, [FromQuery] string? state, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] int? skip, [FromQuery] int? take, [FromQuery] Guid? rootJobId, CancellationToken cancellationToken) =>
                            ListJobsAsync(httpRequest, store, state, from, to, skip, take, rootJobId, null, cancellationToken))
                    .Produces<ArrowJobStatusList>();
            }

            targetBuilder.MapGet(
                    "{id:guid}",
                    (Guid id, HttpRequest request, HttpContext httpContext, CancellationToken cancellationToken) =>
                        GetJob(id, request, httpContext, cancellationToken))
                .ProducesArrow()
                .Produces<ArrowJobStatus>();

            targetBuilder.MapGet(
                    "{id:guid}/request",
                    (Guid id, HttpContext httpContext, CancellationToken cancellationToken) =>
                        GetJobRequestAsync(id, httpContext, cancellationToken))
                .Produces<TRequest>();

            targetBuilder.MapGet(
                "{id:guid}/events",
                (Guid id, HttpContext httpContext, IArrowJobEventHub eventHub, HttpResponse response, CancellationToken cancellationToken) =>
                    StreamJobEvents(id, httpContext, eventHub, response, cancellationToken));

            targetBuilder.MapGet(
                    "{id:guid}/event-log",
                    (Guid id, IArrowJobEventHub eventHub, CancellationToken cancellationToken) =>
                        GetJobEventLogAsync(id, eventHub, cancellationToken))
                .Produces<IReadOnlyList<ArrowJobHubMessage>>();

            targetBuilder.MapPost(
                    "{id:guid}/cancel",
                    (Guid id, HttpRequest httpRequest, HttpContext httpContext, IArrowJobEventHub eventHub, CancellationToken cancellationToken) =>
                        CancelJobAsync(id, httpRequest, httpContext, eventHub, cancellationToken))
                .Produces<ArrowJobStatus>();

            targetBuilder.MapPost(
                    "{id:guid}/retry",
                    (Guid id, HttpRequest httpRequest, IArrowJobStore<TRequest> store, IArrowJobQueue<TRequest> queue, CancellationToken cancellationToken) =>
                        RetryJobAsync(id, httpRequest, store, queue, cancellationToken))
                .Produces<ArrowJobStatus>();

            targetBuilder.MapDelete(
                    "{id:guid}",
                    (Guid id, HttpContext httpContext, IArrowJobResultStorage resultStorage, CancellationToken cancellationToken) =>
                        DeleteJobAsync(id, httpContext, resultStorage, cancellationToken));
        }

        return group;
    }

    private static async Task<IResult> CreateJobAsync<TRequest>(
        TRequest request,
        string? jobName,
        HttpRequest httpRequest,
        HttpContext httpContext,
        IArrowJobStore<TRequest> store,
        IArrowJobQueue<TRequest> queue,
        CancellationToken cancellationToken)
        where TRequest : notnull
    {
        var dedupPolicy = httpContext.GetEndpoint()?.Metadata.GetMetadata<ArrowJobDeduplicationPolicy>();
        if (dedupPolicy is { Enabled: true })
        {
            ArrowJob<TRequest>? duplicate = await store.FindDuplicateAsync(
                request,
                jobName,
                dedupPolicy.Window,
                cancellationToken);

            if (duplicate is not null)
            {
                string jobsPath = ResolveJobsBasePath(httpRequest);
                return Results.Conflict(ToStatusResponse(duplicate, jobsPath));
            }
        }

        ArrowJob<TRequest> job = await store.CreateAsync(request, jobName, cancellationToken: cancellationToken);
        await queue.EnqueueAsync(job.Id, cancellationToken);

        string jobsPathResolved = ResolveJobsBasePath(httpRequest);
        string jobUrl = JobUrl(jobsPathResolved, job.Id);
        return Results.Accepted(
            jobUrl,
            ToStatusResponse(job, jobsPathResolved));
    }

    private static async Task<IResult> ListJobsAsync<TRequest>(
        HttpRequest httpRequest,
        IArrowJobStore<TRequest> store,
        string? state,
        DateTimeOffset? from,
        DateTimeOffset? to,
        int? skip,
        int? take,
        Guid? rootJobId,
        string? jobName,
        CancellationToken cancellationToken)
        where TRequest : notnull
    {
        ArrowJobState? parsedState = null;
        if (!string.IsNullOrWhiteSpace(state))
        {
            if (!Enum.TryParse(state, ignoreCase: true, out ArrowJobState value))
                return Results.BadRequest($"Geçersiz state: {state}");

            parsedState = value;
        }

        var query = new ArrowJobListQuery(
            parsedState,
            from,
            to,
            skip ?? 0,
            take ?? 50,
            rootJobId,
            jobName);

        ArrowJobListPage<TRequest> page = await store.ListAsync(query, cancellationToken);
        string jobsPath = ResolveJobsBasePath(httpRequest);
        ArrowJobStatusList response = new(
            page.Items.Select(j => ToStatusResponse(j, jobsPath)).ToList(),
            page.Total);

        return Results.Ok(response);
    }

    private static async Task<IResult> GetJobRequestAsync(
        Guid id,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        IArrowJobStore? owner = await FindJobStoreAsync(httpContext, id, cancellationToken);
        if (owner is null)
            return Results.NotFound();

        object? request = await owner.GetRequestAsync(id, cancellationToken);
        return request is null ? Results.NotFound() : Results.Ok(request);
    }

    private static async Task<IResult> CancelJobAsync(
        Guid id,
        HttpRequest httpRequest,
        HttpContext httpContext,
        IArrowJobEventHub eventHub,
        CancellationToken cancellationToken)
    {
        string jobsPath = ResolveJobsBasePath(httpRequest);

        IArrowJobStore? store = await FindJobStoreAsync(httpContext, id, cancellationToken);
        if (store is null)
            return Results.NotFound();

        ArrowJobStatus? status = await store.GetStatusAsync(id, jobsPath, cancellationToken);
        if (status is null)
            return Results.NotFound();

        if (status.Status is not ("Queued" or "Running"))
            return Results.Conflict(ToStatusResponse(status, jobsPath));

        if (!await store.TryCancelJobAsync(id, cancellationToken))
        {
            status = await store.GetStatusAsync(id, jobsPath, cancellationToken);
            return status is null
                ? Results.NotFound()
                : Results.Conflict(ToStatusResponse(status, jobsPath));
        }

        status = await store.GetStatusAsync(id, jobsPath, cancellationToken);
        if (status is null)
            return Results.NotFound();

        ArrowJobStatus response = ToStatusResponse(status, jobsPath);
        await eventHub.PublishAsync(
            id,
            ArrowJobEventNames.Cancelled,
            new ArrowJobEvent(
                status.Id,
                status.Status,
                status.CreatedAt,
                status.CompletedAt,
                status.Error,
                response.JobUrl,
                response.EventsUrl,
                status.BatchCount,
                status.TotalRows,
                Name: status.Name,
                RootJobId: status.RootJobId),
            cancellationToken);

        return Results.Ok(response);
    }

    private static async Task<IResult> RetryJobAsync<TRequest>(
        Guid id,
        HttpRequest httpRequest,
        IArrowJobStore<TRequest> store,
        IArrowJobQueue<TRequest> queue,
        CancellationToken cancellationToken)
        where TRequest : notnull
    {
        ArrowJob<TRequest>? job = await store.GetAsync(id, cancellationToken);
        if (job is null)
            return Results.NotFound();

        if (job.State is not (ArrowJobState.Failed or ArrowJobState.Cancelled))
            return Results.Conflict(ToStatusResponse(job, ResolveJobsBasePath(httpRequest)));

        ArrowJob<TRequest> retry = await store.CreateAsync(job.Request, job.Name, rootJobId: job.RootJobId, cancellationToken: cancellationToken);
        await queue.EnqueueAsync(retry.Id, cancellationToken);

        string jobsPath = ResolveJobsBasePath(httpRequest);
        string jobUrl = JobUrl(jobsPath, retry.Id);
        return Results.Accepted(
            jobUrl,
            ToStatusResponse(retry, jobsPath, retriedFrom: id));
    }

    private static async Task<IResult> DeleteJobAsync(
        Guid id,
        HttpContext httpContext,
        IArrowJobResultStorage resultStorage,
        CancellationToken cancellationToken)
    {
        IArrowJobStore? store = await FindJobStoreAsync(httpContext, id, cancellationToken);
        if (store is null)
            return Results.NotFound();

        ArrowJobStatus? status = await store.GetStatusAsync(id, cancellationToken: cancellationToken);
        if (status is null)
            return Results.NotFound();

        if (string.Equals(status.Status, nameof(ArrowJobState.Running), StringComparison.OrdinalIgnoreCase))
            return Results.Conflict();

        if (!await store.TryDeleteJobAsync(id, cancellationToken))
            return Results.Conflict();

        string? resultPath = await store.GetResultPathAsync(id, cancellationToken);
        await resultStorage.DeleteResultAsync(resultPath, cancellationToken);
        return Results.NoContent();
    }

    /// <summary>Job kimliğini sahiplenen store'u tüm kayıtlı store'larda arar.</summary>
    private static async Task<IArrowJobStore?> FindJobStoreAsync(
        HttpContext httpContext,
        Guid id,
        CancellationToken cancellationToken)
    {
        foreach (IArrowJobStore store in httpContext.RequestServices.GetServices<IArrowJobStore>())
        {
            ArrowJobStatus? status = await store.GetStatusAsync(id, cancellationToken: cancellationToken);
            if (status is not null)
                return store;
        }

        return null;
    }

    /// <summary>
    /// <c>Accept: application/json</c> → durum JSON.
    /// <c>Accept: application/vnd.apache.arrow.stream</c> → tamamlanınca Arrow IPC.
    /// </summary>
    private static async Task<IResult> GetJob(
        Guid id,
        HttpRequest request,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        string jobsPath = ResolveJobsBasePath(request);

        IArrowJobStore? owner = await FindJobStoreAsync(httpContext, id, cancellationToken);
        if (owner is null)
            return Results.NotFound();

        ArrowJobStatus? status = await owner.GetStatusAsync(id, jobsPath, cancellationToken);
        string? resultPath = status is not null
            ? await owner.GetResultPathAsync(id, cancellationToken)
            : null;

        if (status is null)
            return Results.NotFound();

        string acceptHeader = request.Headers.Accept.ToString();
        bool wantsArrowStream = request.AcceptsArrowStream();
        bool wantsNdJsonStream = acceptHeader.Contains("application/x-ndjson");

        if (wantsArrowStream || wantsNdJsonStream)
        {
            IArrowJobResultStorage? resultStorage = request.HttpContext.RequestServices
                .GetService<IArrowJobResultStorage>();
            return await GetJobArrowResultByStatus(status, resultPath, resultStorage, jobsPath, wantsNdJsonStream, cancellationToken);
        }

        return Results.Ok(status);
    }

    private static async Task StreamJobEvents(
        Guid id,
        HttpContext httpContext,
        IArrowJobEventHub eventHub,
        HttpResponse response,
        CancellationToken cancellationToken)
    {
        string jobsPath = ResolveJobsBasePath(response.HttpContext.Request);

        IArrowJobStore? targetStore = await FindJobStoreAsync(httpContext, id, cancellationToken);

        await ArrowJobSse.StreamEventsAsync(
            id,
            targetStore,
            eventHub,
            response,
            jobsPath,
            cancellationToken);
    }

    private static async Task<IResult> GetJobEventLogAsync(
        Guid id,
        IArrowJobEventHub eventHub,
        CancellationToken cancellationToken)
    {
        IReadOnlyList<ArrowJobHubMessage> history =
            await eventHub.GetHistoryAsync(id, cancellationToken);
        return Results.Ok(history);
    }

    private static async Task<IResult> GetJobArrowResultByStatus(
        ArrowJobStatus status,
        string? resultPath,
        IArrowJobResultStorage? resultStorage,
        string jobsPath,
        bool wantsNdJson,
        CancellationToken cancellationToken)
    {
        if (string.Equals(status.Status, nameof(ArrowJobState.Queued), StringComparison.OrdinalIgnoreCase) ||
            string.Equals(status.Status, nameof(ArrowJobState.Running), StringComparison.OrdinalIgnoreCase))
        {
            return Results.Accepted(status.JobUrl, status);
        }

        if (string.Equals(status.Status, nameof(ArrowJobState.Cancelled), StringComparison.OrdinalIgnoreCase))
        {
            return Results.Problem(detail: "Job iptal edildi.", statusCode: StatusCodes.Status409Conflict, title: "Job iptal");
        }

        if (string.Equals(status.Status, nameof(ArrowJobState.Failed), StringComparison.OrdinalIgnoreCase))
        {
            return Results.Problem(detail: status.Error, statusCode: StatusCodes.Status500InternalServerError, title: "Job başarısız");
        }

        if (string.Equals(status.Status, nameof(ArrowJobState.Completed), StringComparison.OrdinalIgnoreCase))
        {
            if (resultStorage is null)
                return Results.Problem(detail: "Sonuç deposu yapılandırılmamış.", statusCode: StatusCodes.Status500InternalServerError);

            bool isInMemory = resultPath?.StartsWith("inmemory://", StringComparison.OrdinalIgnoreCase) ?? false;
            if (string.IsNullOrEmpty(resultPath) || (!isInMemory && !File.Exists(resultPath)))
                return Results.Problem(detail: "Sonuç dosyası bulunamadı.", statusCode: StatusCodes.Status500InternalServerError);

            Result<ArrowBatchReader> openResult = await resultStorage.OpenBatchReaderAsync(resultPath, cancellationToken);
            if (!openResult.IsSuccess || openResult.Value is null)
            {
                return openResult.ToHttpResult();
            }

            return wantsNdJson
                ? ArrowResults.FromReaderNdJson(openResult.Value)
                : ArrowResults.FromReader(openResult.Value);
        }

        return Results.StatusCode(StatusCodes.Status500InternalServerError);
    }

    private static ArrowJobStatus ToStatusResponse<TRequest>(
        ArrowJob<TRequest> job,
        string jobsPath,
        Guid? retriedFrom = null)
        where TRequest : notnull =>
        new(
            job.Id,
            job.State.ToString(),
            JobUrl(jobsPath, job.Id),
            EventsUrl(jobsPath, job.Id),
            job.CreatedAt,
            job.CompletedAt,
            job.Error,
            job.BatchCount,
            job.TotalRows,
            retriedFrom,
            job.Name,
            job.RootJobId,
            job.ParentJobId);

    private static ArrowJobStatus ToStatusResponse(
        ArrowJobStatus status,
        string jobsPath,
        Guid? retriedFrom = null) =>
        new(
            status.Id,
            status.Status,
            JobUrl(jobsPath, status.Id),
            EventsUrl(jobsPath, status.Id),
            status.CreatedAt,
            status.CompletedAt,
            status.Error,
            status.BatchCount,
            status.TotalRows,
            retriedFrom,
            status.Name,
            status.RootJobId,
            status.ParentJobId);

    private static string JobUrl(string jobsPath, Guid id) => $"{jobsPath}/{id:D}";

    private static string EventsUrl(string jobsPath, Guid id) => $"{jobsPath}/{id:D}/events";

    private static string NormalizePath(string path)
    {
        path = path.Trim();
        if (!path.StartsWith('/'))
            path = "/" + path;

        return path.TrimEnd('/');
    }

    private static string ResolveJobsBasePath(HttpRequest request)
    {
        string? path = request.Path.Value;
        if (string.IsNullOrEmpty(path))
            return "/";

        path = path.TrimEnd('/');

        foreach (string suffix in JobActionSuffixes)
        {
            if (path.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
            {
                path = path[..^suffix.Length];
                break;
            }
        }

        int lastSlash = path.LastIndexOf('/');
        if (lastSlash >= 0 && Guid.TryParse(path.AsSpan(lastSlash + 1), out _))
            path = path[..lastSlash];

        var registrations = request.HttpContext.RequestServices.GetService<IEnumerable<ArrowJobEndpointRegistration>>();
        if (registrations is not null)
        {
            lastSlash = path.LastIndexOf('/');
            if (lastSlash >= 0)
            {
                string segment = path[(lastSlash + 1)..];
                if (registrations.Any(r => string.Equals(r.NameOrPath.Trim('/'), segment, StringComparison.OrdinalIgnoreCase)))
                {
                    path = path[..lastSlash];
                }
            }
        }

        return path;
    }
}
